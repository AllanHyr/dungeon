// ============================================================
//  rooms.mjs — Les salons : jouer un donjon à plusieurs, UN héros par joueur
// ============================================================
// Un salon est une salle d'attente : un joueur le crée (c'est l'hôte), les autres le rejoignent avec son code ou depuis la liste des
// salons ouverts, chacun choisit son héros et dit « prêt ». L'hôte règle le donjon, la difficulté et le minuteur de tour, puis lance
// la partie : une run est créée avec les héros de tous (un par compte, jamais plus), chacun ne contrôle que le sien.
//
// Règles :
//   - un compte ne peut être que dans UN salon à la fois, et pas en même temps dans une partie de farm ;
//   - 1 à 4 joueurs ; tout le monde est prêt (l'hôte l'est toujours) avant le lancement ;
//   - on ne rejoint pas une partie commencée ; on peut la quitter : le héros reste dans le donjon, joué par le pilote automatique,
//     mais ne touche rien à la fin (ni XP, ni butin) ;
//   - si l'hôte part, le joueur arrivé en premier devient hôte.

import { randomInt } from 'node:crypto';
import { createRun, dungeonsOf } from '../src/core/index.js';
import { GameError } from '../src/core/util.js';
import { HttpError } from './http-utils.mjs';
import { randomSeed } from './game.mjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // (sans 0/O ni 1/I : on dicte un code au téléphone)
export const TURN_SECONDS = [0, 30, 60, 90, 120]; // durées de tour proposées (0 : pas de minuteur)
export const MAX_PLAYERS = 4;
const LOBBY_TTL_MS = 3 * 3600 * 1000; // un salon d'attente oublié depuis 3 heures est supprimé

export class RoomService {
  constructor({ store, game, hub = null }) {
    this.store = store;
    this.game = game;
    this.hub = hub;
    this.presenceTimers = new Map();
  }

  // ---------------- Réglages ----------------

  defaultSetup() {
    const first = this.game.content().trancheList.find((t) => t.available);
    return { tranche: first.id, dungeon: dungeonsOf(this.game.content(), first.id)[0]?.id ?? null, mode: 'tranche', stasisLevel: 1, turnSeconds: 60 };
  }

  /** Vérifie les réglages demandés par l'hôte (on ne garde que ce qui est valide) et les fusionne avec les réglages actuels. */
  cleanSetup(patch, base) {
    const content = this.game.content();
    const out = { ...base };
    if (patch.tranche !== undefined) {
      const t = content.tranches[Number(patch.tranche)];
      if (!t || !t.available) throw new HttpError(400, "Ce donjon n'est pas disponible.");
      out.tranche = t.id;
      // (changer de tranche sans dire quel donjon : le premier de la tranche)
      if (content.dungeons[out.dungeon]?.tranche !== t.id) out.dungeon = dungeonsOf(content, t.id)[0]?.id ?? null;
    }
    if (patch.dungeon !== undefined) {
      const d = typeof patch.dungeon === 'string' ? content.dungeons[patch.dungeon] : null;
      if (!d || d.available === false || !content.tranches[d.tranche]?.available) throw new HttpError(400, "Ce donjon n'est pas disponible.");
      out.dungeon = d.id;
      out.tranche = d.tranche; // (le donjon fixe sa tranche de niveaux)
    }
    if (patch.mode !== undefined) {
      if (typeof patch.mode !== 'string' || !content.modes[patch.mode]) throw new HttpError(400, 'Difficulté inconnue.');
      out.mode = patch.mode;
    }
    if (patch.stasisLevel !== undefined) {
      const level = Math.floor(Number(patch.stasisLevel));
      if (!(content.modes.stasis.levels || []).some((l) => l.level === level)) throw new HttpError(400, 'Niveau de stasis inconnu.');
      out.stasisLevel = level;
    }
    if (patch.turnSeconds !== undefined) {
      const n = Number(patch.turnSeconds);
      if (!TURN_SECONDS.includes(n)) throw new HttpError(400, `Durée de tour inconnue (${TURN_SECONDS.join(', ')} secondes).`);
      out.turnSeconds = n;
    }
    return out;
  }

  // ---------------- Ce qu'on montre ----------------

  heroSummary(userId, charId) {
    const hero = this.game.loadCharacter(userId, charId);
    return hero ? { id: hero.id, name: hero.name, classId: hero.classId, level: hero.level } : null;
  }

  /** Le salon tel que les joueurs le voient. */
  view(room) {
    return {
      id: room.id, code: room.code, status: room.status, hostId: room.host_id, setup: JSON.parse(room.setup), maxPlayers: MAX_PLAYERS,
      members: this.store.members(room.id).map((m) => ({
        userId: m.user_id, name: m.name, ready: !!m.ready || m.user_id === room.host_id,
        online: this.hub ? this.hub.isOnline(m.user_id) : false, hero: this.heroSummary(m.user_id, m.char_id)
      }))
    };
  }

  viewOf(userId) {
    const room = this.store.roomOfUser(userId);
    return room ? this.view(room) : null;
  }

  /** Les salons ouverts (en attente de joueurs), du plus récent au plus ancien. */
  list() {
    return this.store.openRooms().map((r) => ({
      id: r.id, code: r.code, hostName: r.host_name, setup: JSON.parse(r.setup), players: r.players, maxPlayers: MAX_PLAYERS, full: r.players >= MAX_PLAYERS,
      heroes: this.store.members(r.id).map((m) => this.heroSummary(m.user_id, m.char_id)).filter(Boolean)
    }));
  }

  /** Après un changement : on prévient les membres (et ceux qui viennent de partir), et tout le monde que la liste a bougé. */
  publish(roomId, { left = [] } = {}) {
    if (!this.hub) return;
    const room = this.store.roomById(roomId);
    if (room) {
      const view = this.view(room);
      this.hub.send(view.members.map((m) => m.userId), 'room', view);
    }
    if (left.length) this.hub.send(left, 'room', null);
    this.hub.broadcast('rooms', {});
  }

  /** Un joueur se connecte ou se déconnecte : ses coéquipiers voient son point passer au vert ou au gris (au bout d'une seconde, pour ne pas clignoter à chaque rechargement). */
  presenceChanged(userId) {
    if (this.closed) return;
    clearTimeout(this.presenceTimers.get(userId));
    const handle = setTimeout(() => {
      this.presenceTimers.delete(userId);
      if (this.closed) return;
      const room = this.store.roomOfUser(userId);
      if (room) this.publish(room.id);
    }, 1000);
    handle.unref?.();
    this.presenceTimers.set(userId, handle);
  }

  /** À l'arrêt du serveur : plus aucun message de présence à envoyer (la base de données va être fermée). */
  close() {
    this.closed = true;
    for (const handle of this.presenceTimers.values()) clearTimeout(handle);
    this.presenceTimers.clear();
  }

  // ---------------- Les gestes ----------------

  mine(userId) {
    const room = this.store.roomOfUser(userId);
    if (!room) throw new HttpError(404, "Tu n'es dans aucun salon.");
    return room;
  }

  /** Un joueur ne peut pas être à deux endroits à la fois. */
  mustBeFree(userId) {
    if (this.store.roomOfUser(userId)) throw new HttpError(409, "Tu es déjà dans un salon : quitte-le d'abord.");
    if (this.store.activeRunOfUser(userId)) throw new HttpError(409, 'Une partie est déjà en cours : reprends-la ou abandonne-la.');
  }

  hero(userId, charId) {
    const hero = typeof charId === 'string' ? this.game.loadCharacter(userId, charId) : null;
    if (!hero) throw new HttpError(404, 'Héros introuvable.');
    if (hero.expedition) throw new HttpError(409, `${hero.name} est en expédition : attends son retour (ou rappelle-le).`);
    return hero;
  }

  newCode() {
    for (let i = 0; i < 30; i++) {
      const code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      if (!this.store.roomByCode(code)) return code;
    }
    throw new HttpError(503, 'Impossible de créer un salon pour le moment.');
  }

  /** Crée un salon : { charId, setup? }. */
  create(userId, body) {
    const roomId = this.store.transaction(() => {
      this.mustBeFree(userId);
      this.hero(userId, body.charId);
      const setup = this.cleanSetup(body.setup && typeof body.setup === 'object' ? body.setup : {}, this.defaultSetup());
      const now = Date.now();
      const id = this.store.insertRoom(this.newCode(), userId, JSON.stringify(setup), now);
      this.store.insertMember(id, userId, body.charId, true, now);
      return id;
    });
    this.publish(roomId);
    return { ok: true, room: this.viewOf(userId) };
  }

  /** Rejoint un salon avec son code (ou son numéro, depuis la liste) : { code | id, charId }. */
  join(userId, body) {
    const roomId = this.store.transaction(() => {
      this.mustBeFree(userId);
      const code = String(body.code ?? '').replace(/[\s-]/g, '').toUpperCase();
      const room = code ? this.store.roomByCode(code) : this.store.roomById(Number(body.id));
      if (!room) throw new HttpError(404, code ? 'Aucun salon avec ce code.' : 'Ce salon n\'existe plus.');
      if (room.status !== 'lobby') throw new HttpError(409, 'Cette partie a déjà commencé.');
      if (this.store.members(room.id).length >= MAX_PLAYERS) throw new HttpError(409, 'Ce salon est complet (4 joueurs au maximum).');
      this.hero(userId, body.charId);
      this.store.insertMember(room.id, userId, body.charId, false, Date.now());
      return room.id;
    });
    this.publish(roomId);
    return { ok: true, room: this.viewOf(userId) };
  }

  /** Quitte le salon. Avant le lancement : on sort de la salle d'attente. Pendant la partie : le héros reste, joué par le pilote automatique. */
  leave(userId) {
    const out = this.store.transaction(() => {
      const room = this.mine(userId);
      const now = Date.now();
      const others = this.store.members(room.id).filter((m) => m.user_id !== userId);
      const runRow = room.run_id ? this.store.runById(room.run_id) : null;
      if (runRow) this.store.removeRunPlayer(runRow.id, userId); // (son héros n'a plus de joueur derrière lui)
      this.store.deleteMember(room.id, userId);
      if (!others.length) {
        // Plus personne : la salle d'attente (ou la partie sans joueur) disparaît.
        if (runRow) this.store.deleteRun(runRow.id);
        this.store.deleteRoom(room.id);
        return { roomId: null, runRow };
      }
      if (room.host_id === userId) {
        this.store.setRoomHost(room.id, others[0].user_id, now); // le premier arrivé reprend le salon
        this.store.setMemberReady(room.id, others[0].user_id, true);
      }
      return { roomId: room.id, runRow };
    });
    if (out.runRow) {
      if (out.roomId) {
        const row = this.store.runById(out.runRow.id);
        const run = row ? this.game.loadRun(row) : null;
        if (run) this.game.touchRun(run); // (les autres voient ce héros passer au pilote automatique ; s'il devait jouer, le pilote prend la main presque tout de suite)
      } else this.game.timers?.clear(out.runRow.id);
    }
    if (out.roomId) this.publish(out.roomId, { left: [userId] });
    else if (this.hub) {
      this.hub.send([userId], 'room', null);
      this.hub.broadcast('rooms', {});
    }
    return { ok: true };
  }

  /** Change son héros (avant le lancement). Le joueur doit alors se déclarer prêt à nouveau. */
  setHero(userId, charId) {
    const roomId = this.store.transaction(() => {
      const room = this.mine(userId);
      if (room.status !== 'lobby') throw new HttpError(409, 'La partie a commencé : on ne change plus de héros.');
      this.hero(userId, charId);
      this.store.setMemberHero(room.id, userId, charId);
      return room.id;
    });
    this.publish(roomId);
    return { ok: true, room: this.viewOf(userId) };
  }

  /** « Prêt » / « Pas prêt ». (L'hôte est toujours prêt.) */
  setReady(userId, ready) {
    const roomId = this.store.transaction(() => {
      const room = this.mine(userId);
      if (room.status !== 'lobby') throw new HttpError(409, 'La partie a déjà commencé.');
      if (room.host_id !== userId) this.store.setMemberReady(room.id, userId, !!ready);
      return room.id;
    });
    this.publish(roomId);
    return { ok: true, room: this.viewOf(userId) };
  }

  /** L'hôte change le donjon, la difficulté ou le minuteur. Les autres joueurs doivent alors se déclarer prêts à nouveau. */
  setSetup(userId, patch) {
    const roomId = this.store.transaction(() => {
      const room = this.mine(userId);
      if (room.host_id !== userId) throw new HttpError(403, "Seul l'hôte règle la partie.");
      if (room.status !== 'lobby') throw new HttpError(409, 'La partie a déjà commencé.');
      const setup = this.cleanSetup(patch && typeof patch === 'object' ? patch : {}, JSON.parse(room.setup));
      this.store.setRoomSetup(room.id, JSON.stringify(setup), Date.now());
      this.store.resetReady(room.id, userId);
      return room.id;
    });
    this.publish(roomId);
    return { ok: true, room: this.viewOf(userId) };
  }

  /** L'hôte retire un joueur de la salle d'attente. */
  kick(userId, targetId) {
    const roomId = this.store.transaction(() => {
      const room = this.mine(userId);
      if (room.host_id !== userId) throw new HttpError(403, "Seul l'hôte peut retirer un joueur.");
      if (room.status !== 'lobby') throw new HttpError(409, 'La partie a déjà commencé.');
      const target = Number(targetId);
      if (target === userId || !this.store.members(room.id).some((m) => m.user_id === target)) throw new HttpError(404, "Ce joueur n'est pas dans ton salon.");
      this.store.deleteMember(room.id, target);
      return room.id;
    });
    this.publish(roomId, { left: [Number(targetId)] });
    return { ok: true, room: this.viewOf(userId) };
  }

  /** L'hôte lance la partie : une run avec le héros de chaque joueur. */
  start(userId) {
    const started = this.store.transaction(() => {
      const room = this.mine(userId);
      if (room.host_id !== userId) throw new HttpError(403, "Seul l'hôte peut lancer la partie.");
      if (room.status !== 'lobby') throw new HttpError(409, 'La partie a déjà commencé.');
      const members = this.store.members(room.id);
      const waiting = members.filter((m) => m.user_id !== room.host_id && !m.ready).map((m) => m.name);
      if (waiting.length) throw new HttpError(409, `${waiting.join(', ')} ${waiting.length > 1 ? "ne sont pas prêts" : "n'est pas prêt"}.`);
      const heroes = members.map((m) => {
        const hero = this.game.loadCharacter(m.user_id, m.char_id);
        if (!hero) throw new HttpError(409, `${m.name} n'a plus son héros : il doit en choisir un autre.`);
        return hero;
      });
      const setup = JSON.parse(room.setup);
      let state;
      try {
        state = createRun(this.game.content(), { tranche: setup.tranche, dungeon: this.game.content().dungeons[setup.dungeon]?.tranche === setup.tranche ? setup.dungeon : undefined, mode: setup.mode, stasisLevel: setup.stasisLevel }, heroes, randomSeed());
      } catch (e) {
        if (e instanceof GameError) throw new HttpError(400, e.message);
        throw e;
      }
      const now = Date.now();
      const runId = this.store.insertRun('dungeon', JSON.stringify(state), now);
      state.players.forEach((p, i) => this.store.insertRunPlayer(runId, members[i].user_id, p.charId, p.id));
      this.store.setRoomRunning(room.id, runId, now);
      return { roomId: room.id, runId };
    });
    const ctx = this.game.loadRun(this.store.runById(started.runId));
    this.publish(started.roomId);
    this.game.publishRun(ctx);
    return { ok: true, room: this.viewOf(userId), run: this.game.payload(userId, ctx) };
  }

  /** Ménage (appelé régulièrement) : un salon d'attente oublié depuis longtemps est supprimé. */
  sweep(now = Date.now()) {
    const stale = this.store.staleLobbies(now - LOBBY_TTL_MS);
    for (const id of stale) {
      const members = this.store.members(id).map((m) => m.user_id);
      this.store.deleteRoom(id);
      this.hub?.send(members, 'room', null);
    }
    if (stale.length) this.hub?.broadcast('rooms', {});
    return stale.length;
  }
}
