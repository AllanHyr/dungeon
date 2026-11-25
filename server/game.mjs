// ============================================================
//  game.mjs — Le jeu côté serveur : contenu, personnages, parties (solo et à plusieurs)
// ============================================================
// Le serveur est le SEUL à appliquer les règles : le navigateur envoie des demandes (« équiper cet objet », « lancer cette compétence »),
// le serveur les vérifie avec le même moteur que le jeu local (src/core), enregistre le résultat, et le renvoie à TOUS les joueurs de la partie.
// Un joueur ne peut donc rien se donner : il ne peut demander que ce que les règles autorisent, et seulement pour SON héros.
//
// Deux sortes de parties :
//   - le farm solo : un joueur, un héros (démarré par /api/run/start) ;
//   - le donjon : un SALON (voir rooms.mjs), un héros par joueur, jusqu'à 4 joueurs.

import { readFileSync, statSync } from 'node:fs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { join } from 'node:path';
import {
  buildContent, DATA_FILES, createFarm, catchUpLevel, dispatch, restoreState, applyCharacterAction, settleRun, afkAction, turnKey
} from '../src/core/index.js';
import { GameError, log } from '../src/core/util.js';
import { sanitizeCharacter } from '../src/storage/profile.js';
import { HttpError } from './http-utils.mjs';

// ============================================================
//  Le contenu du jeu (les fichiers data/*.json)
// ============================================================

/**
 * Lit les fichiers de données et en fait le contenu du jeu. Si on modifie un fichier pendant que le serveur tourne,
 * il est relu tout seul (au plus une vérification toutes les 1,5 s). Si le nouveau fichier contient une erreur,
 * le serveur garde l'ancien contenu et l'écrit dans la console.
 */
export class ContentManager {
  constructor(dir, log = console.warn) {
    this.dir = dir;
    this.log = log;
    this.content = null;
    this.signature = '';
    this.checkedAt = 0;
    this.version = '';
    this.bundleText = '';
  }

  get() {
    const now = Date.now();
    if (this.content && now - this.checkedAt < 1500) return this.content;
    this.checkedAt = now;
    const signature = DATA_FILES.map((n) => {
      const s = statSync(join(this.dir, `${n}.json`));
      return `${n}:${s.size}:${s.mtimeMs}`;
    }).join('|');
    if (this.content && signature === this.signature) return this.content;
    try {
      const texts = DATA_FILES.map((n) => readFileSync(join(this.dir, `${n}.json`), 'utf8'));
      const raw = {};
      DATA_FILES.forEach((n, i) => {
        try {
          raw[n] = JSON.parse(texts[i]);
        } catch (e) {
          throw new Error(`data/${n}.json contient une erreur de syntaxe : ${e.message}`);
        }
      });
      const content = buildContent(raw); // (si une donnée est fausse, l'erreur dit où chercher)
      this.content = content;
      this.signature = signature;
      this.version = createHash('sha1').update(texts.join('\0')).digest('hex').slice(0, 12);
      // Le paquet envoyé aux navigateurs : les fichiers tels quels, dans un seul texte JSON.
      this.bundleText = `{"version":"${this.version}","files":{${DATA_FILES.map((n, i) => `${JSON.stringify(n)}:${texts[i]}`).join(',')}}}`;
      return content;
    } catch (e) {
      if (!this.content) throw e; // au démarrage : on s'arrête
      this.signature = signature; // (on ne réessaie pas à chaque requête avant la prochaine modification)
      this.log(`[contenu] data/ modifié mais invalide : ${e.message}\n          Le serveur garde l'ancienne version.`);
      return this.content;
    }
  }
}

// ============================================================
//  Utilitaires
// ============================================================

export const randomSeed = () => randomInt(0, 2 ** 32);

/**
 * Copie de l'état à envoyer aux navigateurs :
 *  - sans les événements (envoyés à part) et avec un journal limité aux 400 dernières lignes ;
 *  - SANS la graine ni l'état du hasard (qui permettraient de prévoir les dés) ;
 *  - avec les cases pas encore découvertes vidées de leur contenu (type, monstres, butin) : le boss, lui, est annoncé,
 *    et la bifurcation juste devant le groupe montre le type de ses deux routes.
 */
export function transport(state) {
  // (une bifurcation : juste devant le groupe, on montre les DEUX routes, leur type seulement ; plus loin, seulement qu'il y en aura une)
  const next = state.dungeon.position + 1;
  const board = state.dungeon.board.map((t) => {
    if (t.revealed || t.type === 'boss') return t;
    const hidden = { index: t.index, type: 'hidden', flavor: 0, revealed: false, resolved: false };
    if (!t.alt) return hidden;
    return t.index === next ? { ...hidden, type: t.type, alt: { type: t.alt.type, flavor: 0 } } : { ...hidden, alt: { type: 'hidden', flavor: 0 } };
  });
  return {
    ...state, seed: 0, rng: 0, events: [],
    log: state.log.length > 400 ? state.log.slice(-400) : state.log,
    dungeon: { ...state.dungeon, board }
  };
}

/** Résumé d'une partie (pour le bandeau « Reprendre la partie »). */
export function runInfo(state, room = null) {
  return {
    name: state.dungeon.name, farm: !!state.farm, turn: state.farm ? state.farm.wave : state.turn + 1, mode: state.setup.mode,
    players: state.players.map((p) => p.name), charIds: state.players.map((p) => p.charId), room: room ? room.code : null
  };
}

/**
 * Nettoie une action reçue du navigateur : un objet à plat dont les valeurs sont des textes courts, des nombres,
 * des booléens ou null. (Rien d'imbriqué : le moteur n'en a jamais besoin, et ça écarte les envois bizarres.)
 */
export function cleanAction(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Action invalide.');
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z]{1,24}$/.test(key)) throw new HttpError(400, 'Action invalide.');
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
    else if (typeof value === 'string' && value.length <= 120) out[key] = value;
    else throw new HttpError(400, 'Action invalide.');
  }
  if (typeof out.type !== 'string') throw new HttpError(400, 'Action invalide.');
  return out;
}

// Quelles actions de partie existent, et à qui elles « appartiennent » (voir authorize)
const BY_ACTOR = new Set(['ADVANCE', 'ROLL', 'CHOOSE', 'SHOP_LEAVE', 'CAMP_DECK', 'CAMP_ACT', 'FARM_NEXT', 'FARM_STOP', 'TIMEOUT']); // le joueur dont c'est le tour
const BY_PLAYER_FIELD = { COMBAT_ACT: 'playerId', EQUIP: 'playerId', UNEQUIP: 'playerId', USE_ITEM: 'playerId', USE_SKILL: 'playerId', GHOST: 'playerId', SHOP_SELL: 'playerId', SHOP_BUY: 'buyerId', GIVE: 'fromId' };
const LOCAL_ONLY = new Set(['TRAINING_RESET', 'END_TRAINING']); // la salle d'entraînement se joue dans le navigateur, jamais ici

// ============================================================
//  Le service
// ============================================================

export class GameService {
  /**
   * @param hub     le temps réel (facultatif : les tests de base n'en ont pas besoin)
   * @param timers  le minuteur de tour (facultatif)
   */
  constructor({ store, contentManager, config, hub = null, timers = null }) {
    this.store = store;
    this.contentManager = contentManager;
    this.config = config;
    this.hub = hub;
    this.timers = timers;
  }

  content() {
    return this.contentManager.get();
  }

  // ---------------- Personnages ----------------

  /** Les personnages d'un joueur, réparés si le contenu du jeu a changé (objet supprimé...). */
  loadCharacters(userId) {
    const content = this.content();
    return this.store.charactersOfUser(userId).map((r) => sanitizeCharacter(content, r.data)).filter(Boolean);
  }

  /** Un seul personnage d'un joueur, réparé comme les autres (ou null s'il n'existe pas ou n'est pas à lui). */
  loadCharacter(userId, charId) {
    const row = this.store.characterOf(userId, charId);
    return row ? sanitizeCharacter(this.content(), row.data) : null;
  }

  newCharId() {
    for (;;) {
      const id = `c-${randomBytes(6).toString('hex')}`;
      if (!this.store.characterIdTaken(id)) return id;
    }
  }

  /** Les personnages engagés dans la partie en cours de ce joueur. */
  lockedCharIds(userId) {
    const row = this.store.activeRunOfUser(userId);
    return new Set(row ? this.store.runPlayers(row.id).filter((p) => p.user_id === userId).map((p) => p.char_id) : []);
  }

  /** Applique une action de personnage (créer, équiper, apprendre...) puis enregistre. */
  characterAction(userId, action) {
    return this.store.transaction(() => {
      const content = this.content();
      const chars = this.loadCharacters(userId);
      const res = applyCharacterAction(content, chars, action, {
        newId: () => this.newCharId(), locked: this.lockedCharIds(userId), maxCharacters: this.config.maxCharacters, now: Date.now()
      });
      if (!res.ok) return { ok: false, error: res.error };
      const now = Date.now();
      if (action.type === 'CHAR_CREATE') this.store.insertCharacter(userId, res.character, now);
      else if (action.type === 'CHAR_DELETE') this.store.deleteCharacter(userId, res.deletedId);
      else this.store.saveCharacter(userId, res.character, now);
      return {
        ok: true, character: res.character ?? null, deletedId: res.deletedId ?? null, picked: res.picked ?? null, claim: res.claim ?? null,
        shards: res.shards ?? null, salvaged: res.salvaged ?? null, crafted: res.crafted ?? null,
        unlocked: res.unlocked.map((a) => a.id)
      };
    });
  }

  // ---------------- Parties : retrouver, résumer ----------------

  /** La partie en cours de ce joueur : { row, state, players, rev } ou null. Une partie d'une ancienne version du jeu est abandonnée. */
  activeRun(userId) {
    const row = this.store.activeRunOfUser(userId);
    return row ? this.loadRun(row) : null;
  }

  loadRun(row) {
    try {
      const state = restoreState(this.content(), row.state);
      return { row, state, players: this.store.runPlayers(row.id), rev: row.rev };
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      const room = this.store.roomOfRun(row.id);
      this.store.deleteRun(row.id); // (ancienne version du jeu : elle n'est plus jouable)
      if (room) this.store.deleteRoom(room.id);
      return null;
    }
  }

  runSummary(userId) {
    const run = this.activeRun(userId);
    return run ? runInfo(run.state, this.store.roomOfRun(run.row.id)) : null;
  }

  // ---------------- Ce qu'on envoie aux joueurs ----------------

  /** Qui joue quel héros, pour l'affichage : [{ playerId, userId, userName }] (userId null : le joueur est parti, l'autopilote joue son héros). */
  owners(state, players) {
    return state.players.map((p) => {
      const o = players.find((x) => x.player_id === p.id);
      return { playerId: p.id, userId: o ? o.user_id : null, userName: o ? this.store.userById(o.user_id)?.name ?? null : null };
    });
  }

  /** Les réglages du salon d'une partie, pour l'écran de jeu. */
  roomMeta(room, state, players) {
    if (!room) return null;
    const setup = JSON.parse(room.setup);
    return { code: room.code, hostId: room.host_id, turnSeconds: setup.turnSeconds || 0, owners: this.owners(state, players) };
  }

  /** Le message envoyé à UN joueur après un changement de la partie (la réponse à sa demande, ou le message poussé par SSE). */
  payload(userId, ctx, extra = {}) {
    const { row, state, players, rev } = ctx;
    const room = this.store.roomOfRun(row.id);
    return {
      ok: true, runId: row.id, rev, run: transport(state), you: players.filter((p) => p.user_id === userId).map((p) => p.player_id),
      info: state.phase === 'ended' ? null : runInfo(state, room), room: this.roomMeta(room, state, players),
      timer: this.timers ? this.timers.view(row.id) : null, ...extra
    };
  }

  /** Après validation de la transaction : envoie le nouvel état à tous les joueurs de la partie, et met le minuteur à jour. */
  publishRun(ctx, extraFor = () => ({})) {
    this.armTimer(ctx); // (d'abord : le message doit dire combien de temps il reste pour CE tour-ci, pas pour le précédent)
    if (this.hub) {
      const userIds = [...new Set(ctx.players.map((p) => p.user_id))];
      for (const uid of userIds) this.hub.send([uid], 'run', this.payload(uid, ctx, extraFor(uid)));
    }
  }

  /**
   * Un joueur est parti en pleine partie : l'état du jeu ne change pas, mais la partie « change de version » (rev) pour que les autres
   * joueurs reçoivent qui joue quoi (le héros de celui qui est parti passe au pilote automatique). Le décompte du tour est relancé.
   */
  touchRun(active) {
    const rev = this.store.transaction(() => this.store.saveRun(active.row.id, JSON.stringify(active.state), Date.now()));
    this.publishRun({ ...active, rev });
  }

  /** (Re)lance le décompte du tour en cours. Le farm solo n'a pas de minuteur côté serveur : il garde celui du navigateur. */
  armTimer({ row, state, players }) {
    if (!this.timers) return;
    const room = this.store.roomOfRun(row.id);
    if (!room || state.phase === 'ended') return this.timers.clear(row.id);
    const owned = new Set(players.map((p) => p.player_id));
    const orphan = !!state.pending?.actor && !owned.has(state.pending.actor);
    this.timers.sync(row.id, turnKey(state), { seconds: JSON.parse(room.setup).turnSeconds || 0, orphan });
  }

  /** Au démarrage du serveur : les parties à plusieurs en cours reprennent leur décompte (tout neuf). */
  resumeTimers() {
    if (!this.timers) return;
    for (const room of this.store.runningRooms()) {
      const row = this.store.runById(room.run_id);
      const run = row ? this.loadRun(row) : null;
      if (run) this.armTimer(run);
    }
  }

  // ---------------- Démarrer, reprendre, jeter ----------------

  /**
   * Démarre une session de farm solo : { kind: 'farm', charId, zoneId? }.
   * (Les donjons ne se lancent plus ici : ils se jouent dans un salon, un seul héros par joueur. Voir rooms.mjs.)
   */
  startRun(userId, req) {
    this.store.transaction(() => {
      if (this.store.activeRunOfUser(userId)) throw new HttpError(409, 'Une partie est déjà en cours : reprends-la ou abandonne-la.');
      if (this.store.roomOfUser(userId)) throw new HttpError(409, 'Tu es dans un salon : quitte-le avant de lancer un farm.');
      if (req.kind !== 'farm') {
        throw new HttpError(400, req.kind === 'dungeon' ? 'Les donjons se jouent dans un salon : un héros par joueur. Crée un salon ou rejoins celui d\'un ami.' : 'Type de partie inconnu.');
      }
      const content = this.content();
      const chars = this.loadCharacters(userId);
      const ch = typeof req.charId === 'string' ? chars.find((c) => c.id === req.charId) : null;
      if (!ch) throw new HttpError(404, 'Personnage introuvable.');
      let state;
      try {
        const zoneId = typeof req.zoneId === 'string' ? req.zoneId : undefined;
        state = createFarm(content, ch, { zoneId, seed: randomSeed(), xpCap: catchUpLevel(content, chars, ch) });
      } catch (e) {
        if (e instanceof GameError) throw new HttpError(400, e.message);
        throw e;
      }
      const now = Date.now();
      const runId = this.store.insertRun('farm', JSON.stringify(state), now);
      for (const p of state.players) this.store.insertRunPlayer(runId, userId, p.charId, p.id);
    });
    const ctx = this.activeRun(userId);
    this.publishRun(ctx);
    return this.payload(userId, ctx);
  }

  /** Reprise d'une partie : le même message que celui qui est poussé aux joueurs (ou run: null). */
  resumeRun(userId) {
    const run = this.activeRun(userId);
    return run ? this.payload(userId, run) : { ok: true, runId: null, run: null, info: null, you: [], room: null, timer: null, rev: -1 };
  }

  /** Jette une partie SOLO sans bilan (une sauvegarde illisible, par exemple). Aucun effet sur les personnages. */
  discardRun(userId) {
    const row = this.store.activeRunOfUser(userId);
    if (row) {
      if (this.store.roomOfRun(row.id)) throw new HttpError(409, 'Pour quitter une partie à plusieurs, utilise « Quitter le salon ».');
      this.store.deleteRun(row.id);
    }
    return { ok: true };
  }

  // ---------------- Jouer ----------------

  /** Qui a le droit de faire cette action ? Les joueurs d'une partie ne peuvent agir que pour LEURS héros. */
  authorize(userId, state, players, action, room = null) {
    if (LOCAL_ONLY.has(action.type)) throw new HttpError(400, "Cette action n'existe pas en ligne.");
    const mine = new Set(players.filter((p) => p.user_id === userId).map((p) => p.player_id));
    if (BY_ACTOR.has(action.type)) {
      if (!state.pending?.actor || !mine.has(state.pending.actor)) throw new HttpError(403, "Ce n'est pas ton tour.");
    } else if (BY_PLAYER_FIELD[action.type]) {
      if (!mine.has(action[BY_PLAYER_FIELD[action.type]])) throw new HttpError(403, "Ce n'est pas ton personnage.");
    } else if (action.type === 'ABANDON') {
      if (room && room.host_id !== userId) throw new HttpError(403, "Seul l'hôte du salon peut abandonner la partie (les autres peuvent la quitter).");
    } else {
      throw new HttpError(400, `Action inconnue : ${action.type}`);
    }
  }

  /** Envoie une action à la partie en cours. À la fin de la partie, le bilan est appliqué aux héros de TOUS les joueurs présents. */
  runAction(userId, rawAction) {
    const action = cleanAction(rawAction);
    const done = this.store.transaction(() => {
      const active = this.activeRun(userId);
      if (!active) throw new HttpError(404, 'Aucune partie en cours.');
      const room = this.store.roomOfRun(active.row.id);
      this.authorize(userId, active.state, active.players, action, room);
      return this.applyAction(active, room, action);
    });
    return this.finishAction(userId, done);
  }

  /** Le minuteur d'un tour est écoulé : le pilote automatique joue l'action prudente à la place du joueur. */
  afkTurn(runId, key) {
    const done = this.store.transaction(() => {
      const row = this.store.runById(runId);
      const active = row ? this.loadRun(row) : null;
      if (!active || turnKey(active.state) !== key) return null; // (le tour a changé entre-temps : on ne fait rien)
      const action = afkAction(active.state);
      if (!action) return null;
      const room = this.store.roomOfRun(runId);
      const actorId = active.state.pending.actor;
      const owned = active.players.some((p) => p.player_id === actorId);
      if (owned) {
        const actor = active.state.players.find((p) => p.id === actorId);
        log(active.state, `${actor.name} ne répond plus : le pilote automatique joue à sa place.`, 'bad');
      }
      return this.applyAction(active, room, action);
    });
    if (!done) return null;
    if (!done.ok) {
      console.error(`[minuteur] l'action automatique de la partie ${runId} a été refusée : ${done.error}`);
      return null;
    }
    this.afterAction(done);
    return done;
  }

  /** Applique l'action dans la transaction : l'état est enregistré, ou — si la partie est finie — le bilan est réglé. */
  applyAction(active, room, action) {
    const { row, state, players } = active;
    const res = dispatch(state, action);
    if (!res.ok) return { ok: false, error: res.error, ctx: active };
    const now = Date.now();
    if (state.phase !== 'ended') {
      const rev = this.store.saveRun(row.id, JSON.stringify(state), now);
      return { ok: true, events: res.events, ended: false, ctx: { row, state, players, rev } };
    }
    // La partie est finie : le bilan s'applique aux héros de tous les joueurs PRÉSENTS (celui qui est parti ne gagne rien),
    // puis la partie (et son salon) est effacée, comme en local.
    const content = this.content();
    const userIds = [...new Set(players.map((p) => p.user_id))];
    const charsOf = new Map(userIds.map((uid) => [uid, this.loadCharacters(uid)]));
    const all = userIds.flatMap((uid) => charsOf.get(uid));
    const settled = settleRun(content, all, state);
    for (const p of players) {
      const ch = settled.chars.find((c) => c.id === p.char_id);
      if (ch) this.store.saveCharacter(p.user_id, ch, now);
    }
    const roomMeta = this.roomMeta(room, state, players); // (pour le bilan : qui jouait quel héros — pris avant d'effacer le salon)
    this.store.deleteRun(row.id);
    if (room) this.store.deleteRoom(room.id);
    const unlocked = settled.unlocked.map((u) => ({ charId: u.charId, charName: u.charName, achievementId: u.achievement.id }));
    return {
      ok: true, events: res.events, ended: true, ctx: { row, state, players, rev: row.rev + 1 }, userIds, roomMeta,
      charactersOf: (uid) => this.loadCharacters(uid),
      unlockedFor: (uid) => unlocked.filter((u) => charsOf.get(uid).some((c) => c.id === u.charId))
    };
  }

  /** Après la transaction : on prévient tout le monde et on relance le minuteur. */
  afterAction(done) {
    if (!done.ok) return;
    const { ctx, events, ended } = done;
    if (ended) {
      this.timers?.clear(ctx.row.id);
      if (this.hub) {
        for (const uid of done.userIds) {
          this.hub.send([uid], 'run', this.endPayload(uid, done));
        }
      }
      return;
    }
    this.publishRun(ctx, () => ({ events, ended: false }));
  }

  endPayload(userId, done) {
    const { ctx, events } = done;
    return {
      ok: true, runId: ctx.row.id, rev: ctx.rev, run: transport(ctx.state), you: ctx.players.filter((p) => p.user_id === userId).map((p) => p.player_id),
      info: null, room: done.roomMeta || null, timer: null, events, ended: true, characters: done.charactersOf(userId), unlocked: done.unlockedFor(userId)
    };
  }

  /** La réponse à celui qui a joué. (Même contenu que ce qui est poussé aux autres : le navigateur ignore les doublons grâce à `rev`.) */
  finishAction(userId, done) {
    if (!done.ok) {
      // Une action refusée ne change rien, mais on renvoie la partie à jour : l'écran se resynchronise.
      return { ...this.payload(userId, done.ctx), ok: false, error: done.error, events: [] };
    }
    this.afterAction(done);
    if (done.ended) return this.endPayload(userId, done);
    return this.payload(userId, done.ctx, { events: done.events, ended: false });
  }
}
