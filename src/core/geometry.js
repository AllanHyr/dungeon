// ============================================================
//  geometry.js — Les rangs (devant / derrière) et ce qu'on peut viser
// ============================================================
// Pour l'instant le champ de bataille est très simple : chaque camp est rangé sur
// 2 rangs, "front" (devant) et "back" (derrière).
//   - une attaque de CORPS À CORPS ("melee") ne peut viser que le rang de devant tant
//     qu'il reste quelqu'un dedans (un tank devant protège donc ceux de derrière) ;
//   - une attaque À DISTANCE ("ranged") ou "any" peut viser n'importe qui.
//
// IMPORTANT : tout ce qui concerne la position passe par CE fichier. Le jour où on
// voudra une vraie grille (comme Wakfu), il suffira de réécrire ces fonctions.

/** Le camp d'une unité : 'party' (joueurs) ou 'monsters'. */
export const sideOf = (unit) => (unit.kind === 'player' ? 'party' : 'monsters');

/** Les unités d'un camp (vivantes par défaut). */
export function team(state, side, alive = true) {
  const units = side === 'party' ? state.players : state.combat ? state.combat.monsters : [];
  return alive ? units.filter((u) => u.alive) : units;
}

/** Alliés d'une unité (elle-même incluse). */
export const alliesOf = (state, unit, alive = true) => team(state, sideOf(unit), alive);

/** Ennemis d'une unité. */
export const enemiesOf = (state, unit, alive = true) => team(state, sideOf(unit) === 'party' ? 'monsters' : 'party', alive);

/**
 * Les ennemis qu'une compétence peut atteindre depuis la position de `source`.
 * `range` vaut "melee" (par défaut), "ranged" ou "any".
 */
export function reachableEnemies(state, source, skill) {
  const enemies = enemiesOf(state, source);
  if ((skill.range || 'melee') !== 'melee') return enemies;
  const front = enemies.filter((e) => e.row === 'front');
  return front.length ? front : enemies;
}

/** Cherche une unité (joueur ou monstre) par son identifiant. */
export function unitById(state, id) {
  return state.players.find((p) => p.id === id) || (state.combat ? state.combat.monsters.find((m) => m.id === id) : null) || null;
}

/** L'autre rang. */
export const otherRow = (row) => (row === 'front' ? 'back' : 'front');

/** Les ennemis (vivants) que cette unité a MARQUÉS (statut `mark` posé par elle), du plus ancien au plus récent. */
export function markedEnemies(state, unit) {
  return enemiesOf(state, unit)
    .filter((e) => e.statuses.some((s) => s.id === 'mark' && s.casterId === unit.id))
    .sort((a, b) => (a.statuses.find((s) => s.id === 'mark' && s.casterId === unit.id).seq || 0) - (b.statuses.find((s) => s.id === 'mark' && s.casterId === unit.id).seq || 0));
}
