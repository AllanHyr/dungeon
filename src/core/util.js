// ============================================================
//  util.js — Petits outils partagés par tout le moteur de jeu
// ============================================================

/** Ajoute une ligne au journal de la partie. `kind` sert à la mettre en couleur. */
export function log(state, text, kind = 'info') {
  state.log.push({ turn: state.turn, kind, text });
}

/**
 * Envoie un "événement visuel" à l'interface (un dé lancé, des dégâts...).
 * Ces événements ne servent qu'aux animations : la vraie vérité est dans `state`.
 */
export function emit(state, event) {
  state.events.push(event);
}

/** Le gros message affiché au centre de l'écran (résultat de la case). */
export function headline(state, text, tone = 'neutral') {
  state.headline = { text, tone };
}

/** Enregistre un acte "social" (don, partage, coup bas...) pour le journal de fin de partie. */
export function social(state, kind, fromId, toId, detail = '') {
  state.social.push({ turn: state.turn, kind, from: fromId, to: toId, detail });
}

export function getPlayer(state, id) {
  return state.players.find((p) => p.id === id);
}

export function livingPlayers(state) {
  return state.players.filter((p) => p.alive);
}

export function ghosts(state) {
  return state.players.filter((p) => !p.alive);
}

export function livingMonsters(state) {
  return state.combat ? state.combat.monsters.filter((m) => m.alive) : [];
}

/** Le joueur "sous les projecteurs" ce tour-ci. */
export function spotlightPlayer(state) {
  return state.players[state.spotlight];
}

export function currentTile(state) {
  return state.dungeon.board[state.dungeon.position] || null;
}

/** Erreur "normale" : une action interdite (la partie n'est pas modifiée). */
export class GameError extends Error {}

export function assert(condition, message) {
  if (!condition) throw new GameError(message);
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
