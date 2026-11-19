// ============================================================
//  local-gateway.js — La passerelle LOCALE : tout reste dans le navigateur
// ============================================================
// C'est le jeu solo (et la démo publiée sur la plateforme). Les personnages et la partie en cours sont dans le localStorage,
// et les règles s'exécutent dans la page. C'est exactement le comportement d'avant l'arrivée du serveur.

import {
  createRun, createFarm, catchUpLevel, dispatch, restoreState, attachContent, STATE_VERSION, applyCharacterAction, settleRun, checkAchievements
} from '../core/index.js';
import { createStore, loadProfile, saveProfile, newCharacterId, saveRun, loadRunText, clearRun } from '../storage/profile.js';
import { loadContent } from '../data-loader.js';
import { afterCharacterResult } from './common.js';

/**
 * Une action de partie, jouée DANS le navigateur (utilisée par la passerelle locale, et par la passerelle en ligne
 * pour l'Atelier de classes, qui ne concerne aucun personnage).
 * @returns { ok, error? } ou { ok, events, ended: false } ; la partie `run` est modifiée sur place.
 */
export function localDispatch(run, action) {
  const res = dispatch(run, action);
  return res.ok ? { ok: true, events: res.events, run } : { ok: false, error: res.error, run };
}

export function createLocalGateway({ content, dataUrl, storage }) {
  const store = createStore(storage);
  const profile = loadProfile(content, store);
  // Des personnages déjà créés remplissent peut-être des conditions de succès : on les débloque en silence.
  let changed = false;
  for (const ch of profile.characters) if (checkAchievements(content, ch).length) changed = true;
  if (changed) saveProfile(profile, store);

  // Résumé de la partie sauvegardée (relu seulement si le texte a changé : l'écran le demande très souvent)
  let cache = { text: null, info: null };

  const gw = {
    mode: 'local',
    user: null,
    profile,
    store,
    canExport: true,
    persistent: store.persistent,
    content,
    room: null, // (pas de salons en jeu local : une équipe de 1 à 4 héros du même joueur, pour essayer seul)
    rooms: [],
    connect() {},
    disconnect() {},

    savePrefs() {
      saveProfile(profile, store);
    },

    async character(action) {
      const res = applyCharacterAction(gw.content, profile.characters, action, { newId: () => newCharacterId(profile), locked: gw.lockedIds(), now: Date.now() });
      if (!res.ok) return res;
      afterCharacterResult(profile, res);
      saveProfile(profile, store);
      return res;
    },

    // ---- parties
    savedRunInfo() {
      const text = loadRunText(store);
      if (text === cache.text) return cache.info;
      cache = { text, info: null };
      if (!text) return null;
      try {
        const s = JSON.parse(text);
        if (s.phase === 'ended') return null;
        if (s.version !== STATE_VERSION) {
          clearRun(store); // partie d'une ancienne version du jeu : on l'abandonne
          cache = { text: null, info: null };
          return null;
        }
        cache.info = {
          name: s.dungeon.name, farm: !!s.farm, turn: s.farm ? s.farm.wave : s.turn + 1, mode: s.setup.mode,
          players: s.players.map((p) => p.name), charIds: s.players.map((p) => p.charId)
        };
      } catch {
        cache.info = null;
      }
      return cache.info;
    },
    lockedIds() {
      return new Set(gw.savedRunInfo()?.charIds || []);
    },

    async startDungeon(setup, charIds) {
      const chars = charIds.map((id) => profile.characters.find((c) => c.id === id)).filter(Boolean);
      let run;
      try {
        run = createRun(gw.content, setup, chars);
      } catch (e) {
        return { ok: false, error: e.message };
      }
      saveRun(run, store);
      return { ok: true, run };
    },
    async startFarm(charId, { zoneId } = {}) {
      const ch = profile.characters.find((c) => c.id === charId);
      if (!ch) return { ok: false, error: 'Personnage introuvable.' };
      let run;
      try {
        run = createFarm(gw.content, ch, { zoneId, xpCap: catchUpLevel(gw.content, profile.characters, ch) });
      } catch (e) {
        return { ok: false, error: e.message }; // ex. récompense pas encore choisie
      }
      saveRun(run, store);
      return { ok: true, run };
    },
    async resumeRun() {
      try {
        return { ok: true, run: restoreState(gw.content, loadRunText(store)) };
      } catch {
        clearRun(store);
        return { ok: false, error: 'La sauvegarde de la partie est illisible.' };
      }
    },
    async discardRun() {
      clearRun(store);
      return { ok: true };
    },

    async act(run, action) {
      const res = dispatch(run, action);
      if (!res.ok) return { ok: false, error: res.error, run };
      let ended = false;
      let unlockedList = [];
      if (!run.training) {
        const settled = settleRun(gw.content, profile.characters, run);
        if (settled.settled) {
          ended = true;
          unlockedList = settled.unlocked;
          saveProfile(profile, store);
          clearRun(store);
        } else if (run.phase !== 'ended') saveRun(run, store);
      }
      return { ok: true, events: res.events, run, ended, unlockedList };
    },

    async reloadContent() {
      const fresh = await loadContent(dataUrl);
      gw.content = fresh;
      return fresh;
    },
    async logout() { /* rien : pas de compte en local */ }
  };
  return gw;
}

export { attachContent };
