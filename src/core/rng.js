// ============================================================
//  rng.js — Le hasard du jeu (dés, tirages de butin...)
// ============================================================
// Pourquoi ne pas utiliser Math.random() ?
// Parce qu'ici on utilise une "graine" (un nombre de départ) : avec la même
// graine, on obtient TOUJOURS la même suite de tirages. Ça permet :
//   - de tester le jeu (même partie = mêmes résultats),
//   - de reprendre une partie sauvegardée exactement où elle en était,
//   - plus tard (V2), de faire tourner le même code sur un serveur.
//
// L'état du générateur est un simple nombre rangé dans `state.rng`.
// Toutes les fonctions reçoivent donc `state` en premier paramètre.

/** Renvoie un nombre décimal entre 0 (inclus) et 1 (exclu). Algo "mulberry32". */
export function nextFloat(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entier au hasard entre min et max (les deux inclus). */
export function randInt(state, min, max) {
  return min + Math.floor(nextFloat(state) * (max - min + 1));
}

/** Lance un dé à 20 faces : renvoie un entier de 1 à 20. */
export function rollD20(state) {
  return randInt(state, 1, 20);
}

/** Renvoie true avec la probabilité p (0 à 1). */
export function chance(state, p) {
  return nextFloat(state) < p;
}

/** Choisit un élément au hasard dans un tableau. */
export function pick(state, array) {
  return array[Math.floor(nextFloat(state) * array.length)];
}

/**
 * Tirage pondéré : chaque élément a un "poids", plus il est gros, plus il sort souvent.
 * `weightOf(element)` doit renvoyer le poids de l'élément.
 */
export function weightedPick(state, array, weightOf) {
  let total = 0;
  for (const el of array) total += Math.max(0, weightOf(el));
  if (total <= 0) return array[0];
  let r = nextFloat(state) * total;
  for (const el of array) {
    r -= Math.max(0, weightOf(el));
    if (r < 0) return el;
  }
  return array[array.length - 1];
}

/** Mélange un tableau (renvoie une copie). */
export function shuffle(state, array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
