// ============================================================
//  remote-gateway.js — La passerelle EN LIGNE : le serveur garde tout et applique les règles
// ============================================================
// Les personnages et la partie en cours vivent sur le serveur. Le navigateur envoie des DEMANDES (équiper, lancer une compétence...)
// et reçoit le résultat. Rien de ce qu'on voit ici ne fait foi : une copie des personnages sert à l'affichage, et elle est
// remplacée par celle du serveur à chaque réponse.
// Les préférences (son, minuteur, dernière équipe...) restent dans le navigateur, une série par compte.

import { buildContent, attachContent } from '../core/index.js';
import { createStore } from '../storage/profile.js';
import { emptyProfile, afterCharacterResult, applyPrefs, prefsOf, attachNet } from './common.js';

// ---------------- Détection du serveur ----------------

/**
 * Cette page est-elle servie par le serveur du jeu ? On lui pose la question « qui es-tu ? ».
 * Renvoie sa réponse (avec l'utilisateur connecté, s'il y en a un), ou null (jeu local : serveur de fichiers simple, démo publiée...).
 */
export async function probeServer(apiBase, timeoutMs = 2500) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(new URL('hello', apiBase), { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json && json.online === true ? json : null;
  } catch {
    return null;
  }
}

/** Le contenu du jeu, tel que le serveur le connaît (les navigateurs et le serveur jouent donc avec les mêmes règles). */
export async function loadRemoteContent(apiBase) {
  const res = await fetch(new URL('content', apiBase), { credentials: 'same-origin', cache: 'no-cache' });
  if (!res.ok) throw new Error(`Impossible de charger les données du jeu depuis le serveur (${res.status}).`);
  const { version, files } = await res.json();
  const content = buildContent(files);
  content.bundleVersion = version;
  return content;
}

// ---------------- La passerelle ----------------

/** Une erreur de réseau : le serveur ne répond pas. */
class NetError extends Error {}

/** Un flux temps réel muet depuis si longtemps (le serveur « ping » toutes les 20 s) est considéré comme mort. */
const SILENCE_MS = 65_000;

export function createRemoteGateway({ content, apiBase, hello, storage, onUnauthorized = () => {} }) {
  const store = createStore(storage);
  const profile = emptyProfile();
  let runInfo = null;
  let staleNotified = false;
  let live = null; // le flux temps réel (EventSource)
  let stopWatch = null; // arrête la surveillance du flux (voir connect)

  const gw = {
    mode: 'online',
    user: hello.user || null,
    profile,
    store,
    canExport: false,
    persistent: true,
    content,
    inviteRequired: !!hello.inviteRequired,
    room: null, // mon salon (ou null)
    rooms: [], // les salons ouverts

    // ---- réseau
    /** Envoie une requête. Renvoie { status, json }. Une session expirée renvoie au menu de connexion. */
    async api(method, path, body) {
      let res;
      try {
        res = await fetch(new URL(path, apiBase), {
          method, credentials: 'same-origin', cache: 'no-store',
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
      } catch {
        throw new NetError('Le serveur ne répond pas. Vérifie ta connexion.');
      }
      let json = null;
      try {
        json = await res.json();
      } catch { /* réponse vide ou pas du JSON */ }
      if (res.status === 401 && !/^(login|register)$/.test(path)) {
        gw.user = null;
        onUnauthorized();
        throw new NetError('Ta session a expiré : reconnecte-toi.');
      }
      return { status: res.status, json: json || { ok: false, error: `Réponse inattendue du serveur (${res.status}).` } };
    },
    /** Comme api(), mais une erreur réseau devient { ok:false, error } au lieu d'une exception. */
    async call(method, path, body) {
      try {
        const { json } = await gw.api(method, path, body);
        if (json.contentVersion && json.contentVersion !== gw.content.bundleVersion && !staleNotified) {
          staleNotified = true;
          gw.onStale?.();
        }
        return json;
      } catch (e) {
        if (e instanceof NetError) return { ok: false, error: e.message };
        throw e;
      }
    },

    // ---- compte
    async register(name, password, invite) {
      const r = await gw.call('POST', 'register', { name, password, invite });
      if (r.ok) gw.user = r.user;
      return r;
    },
    async login(name, password) {
      const r = await gw.call('POST', 'login', { name, password });
      if (r.ok) gw.user = r.user;
      return r;
    },
    /** Change le mot de passe du compte (il faut donner l'ancien). Les autres appareils sont déconnectés par le serveur. */
    async changePassword(current, next) {
      return gw.call('POST', 'password', { current, next });
    },
    async logout() {
      gw.disconnect();
      await gw.call('POST', 'logout', {});
      gw.user = null;
      gw.room = null;
      profile.characters.length = 0;
      runInfo = null;
    },

    /** Charge (ou recharge) les personnages, la partie en cours et les préférences de ce compte. */
    async loadProfile() {
      const r = await gw.call('GET', 'profile');
      if (!r.ok) return r;
      gw.user = r.user;
      gw.room = r.room || null;
      gw.maxCharacters = r.maxCharacters ?? null; // (le nombre de places de ce serveur)
      profile.characters.splice(0, profile.characters.length, ...r.characters);
      runInfo = r.run;
      Object.assign(profile, emptyProfile(), { characters: profile.characters });
      let raw = null;
      try { raw = JSON.parse(store.get(prefsKey()) || 'null'); } catch { /* préférences illisibles : on repart de zéro */ }
      applyPrefs(profile, raw);
      return { ok: true };
    },
    savePrefs() {
      if (gw.user) store.set(prefsKey(), JSON.stringify(prefsOf(profile)));
    },

    // ---- personnages
    async character(action) {
      const r = await gw.call('POST', 'character', action);
      if (!r.ok) return { ok: false, error: r.error };
      if (r.deletedId) profile.characters.splice(0, profile.characters.length, ...profile.characters.filter((c) => c.id !== r.deletedId));
      else if (r.character) {
        const i = profile.characters.findIndex((c) => c.id === r.character.id);
        if (i >= 0) profile.characters[i] = r.character;
        else profile.characters.push(r.character);
      }
      afterCharacterResult(profile, r);
      gw.savePrefs();
      return { ...r, unlocked: (r.unlocked || []).map((id) => gw.content.achievements[id]).filter(Boolean) };
    },

    // ---- parties
    savedRunInfo: () => runInfo,
    lockedIds: () => new Set(runInfo?.charIds || []),

    // Les donjons se lancent depuis un salon (un héros par joueur) : voir createRoom / roomStart plus bas.
    async startDungeon() {
      return { ok: false, error: 'Les donjons se jouent dans un salon : crée-en un ou rejoins celui d\'un ami.' };
    },
    async startFarm(charId, { replace = false, zoneId } = {}) {
      if (replace) await gw.discardRun();
      const r = await gw.call('POST', 'run/start', { kind: 'farm', charId, zoneId });
      if (!r.ok) return { ok: false, error: r.error };
      return gw.receiveRun(r);
    },
    async resumeRun() {
      const r = await gw.call('GET', 'run');
      if (!r.ok) return { ok: false, error: r.error };
      if (!r.run) {
        runInfo = null;
        return { ok: false, error: 'Cette partie n\'existe plus.' };
      }
      return gw.receiveRun(r);
    },
    async discardRun() {
      const r = await gw.call('POST', 'run/discard', {});
      if (r.ok) runInfo = null;
      return r;
    },

    async act(run, action) {
      const r = await gw.call('POST', 'run/action', { action });
      return gw.receiveRun(r, run);
    },

    /**
     * Transforme un message du serveur sur une partie (la réponse à MON action, ou un message poussé quand quelqu'un d'autre a joué)
     * en résultat prêt pour l'écran : { ok, error?, events, run, ended, unlockedList }.
     * Le serveur renvoie toujours la partie à jour, même quand l'action est refusée : l'écran se resynchronise.
     */
    receiveRun(r, fallbackRun = null) {
      const fresh = r.run ? attachNet(attachContent(r.run, gw.content), r, gw.user?.id) : fallbackRun;
      if (!r.ok) return { ok: false, error: r.error, run: fresh };
      let unlockedList = [];
      if (r.ended) {
        runInfo = null;
        gw.room = null;
        if (r.characters) profile.characters.splice(0, profile.characters.length, ...r.characters);
        unlockedList = (r.unlocked || []).map((u) => ({ charId: u.charId, charName: u.charName, achievement: gw.content.achievements[u.achievementId] })).filter((u) => u.achievement);
      } else runInfo = r.info;
      return { ok: true, events: r.events || [], run: fresh, ended: !!r.ended, unlockedList };
    },

    // ---- salons : jouer un donjon à plusieurs, UN héros par joueur
    async refreshRooms() {
      const r = await gw.call('GET', 'rooms');
      if (r.ok) gw.rooms = r.rooms;
      return r;
    },
    /** Un geste sur le salon : le serveur renvoie le salon à jour. */
    async roomCall(path, body) {
      const r = await gw.call('POST', `room/${path}`, body ?? {});
      if (r.ok && 'room' in r) gw.room = r.room;
      return r;
    },
    createRoom: (charId, setup) => gw.roomCall('create', { charId, setup }),
    joinRoom: (target, charId) => gw.roomCall('join', { ...target, charId }),
    async leaveRoom() {
      const r = await gw.call('POST', 'room/leave', {});
      if (r.ok) {
        gw.room = null;
        runInfo = null;
      }
      return r;
    },
    roomHero: (charId) => gw.roomCall('hero', { charId }),
    roomReady: (ready) => gw.roomCall('ready', { ready }),
    roomSetup: (patch) => gw.roomCall('setup', patch),
    roomKick: (userId) => gw.roomCall('kick', { userId }),
    /** L'hôte lance la partie : renvoie la partie (comme resumeRun), les autres joueurs la reçoivent par le temps réel. */
    async roomStart() {
      const r = await gw.roomCall('start');
      if (!r.ok) return { ok: false, error: r.error };
      return gw.receiveRun(r.run);
    },

    // ---- le temps réel : on ouvre UN flux sur lequel le serveur pousse les changements (salon, partie, liste des salons)
    /**
     * @param handlers  { onSync, onRoom, onRun, onRooms, onLink(connecté) }
     * Le navigateur rouvre le flux tout seul après une coupure, et le serveur renvoie alors l'état complet (« sync »).
     */
    connect(handlers = {}) {
      gw.disconnect();
      if (typeof EventSource === 'undefined' || !gw.user) return;
      const es = new EventSource(new URL('events', apiBase));
      live = es;
      // Le serveur envoie un « ping » toutes les 20 s : un flux muet depuis trop longtemps est mort (réseau qui a changé, veille...)
      // sans que le navigateur s'en soit aperçu. On le rouvre : le serveur renvoie alors l'état complet (« sync »).
      let lastHeard = Date.now();
      const reopen = () => gw.connect(handlers);
      const timer = setInterval(() => { if (Date.now() - lastHeard > SILENCE_MS && live === es) reopen(); }, 10_000);
      // (au retour sur l'onglet, après une veille : si le flux est resté muet un moment, on ne l'attend pas)
      const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastHeard > 30_000 && live === es) reopen(); };
      document.addEventListener('visibilitychange', onVisible);
      stopWatch = () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
      es.addEventListener('ping', () => { lastHeard = Date.now(); });
      const parse = (e) => {
        lastHeard = Date.now();
        try { return JSON.parse(e.data); } catch { return null; }
      };
      es.addEventListener('sync', (e) => {
        const d = parse(e);
        if (!d) return;
        gw.room = d.room || null;
        if (d.contentVersion && d.contentVersion !== gw.content.bundleVersion && !staleNotified) {
          staleNotified = true;
          gw.onStale?.();
        }
        handlers.onSync?.(d);
      });
      es.addEventListener('room', (e) => {
        gw.room = parse(e);
        handlers.onRoom?.(gw.room);
      });
      es.addEventListener('run', (e) => {
        const d = parse(e);
        if (d) handlers.onRun?.(d);
      });
      es.addEventListener('rooms', () => {
        lastHeard = Date.now();
        handlers.onRooms?.();
      });
      es.onopen = () => handlers.onLink?.(true);
      es.onerror = async () => {
        handlers.onLink?.(false);
        // Coupure : le navigateur réessaie seul. Mais si c'est la session qui a expiré, il réessaierait pour rien : on le vérifie.
        const hello = await probeServer(apiBase, 2000);
        if (hello && !hello.user && live === es) {
          gw.disconnect();
          gw.user = null;
          onUnauthorized();
        }
      };
    },
    disconnect() {
      stopWatch?.();
      stopWatch = null;
      if (live) live.close();
      live = null;
      gw.onLinkClosed?.();
    },

    async reloadContent() {
      gw.content = await loadRemoteContent(apiBase);
      return gw.content;
    }
  };

  const prefsKey = () => `donjon.prefs.v1.${gw.user?.id ?? 'anonyme'}`;
  return gw;
}
