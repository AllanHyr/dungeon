// ============================================================
//  board.js — Génération aléatoire du plateau (le donjon)
// ============================================================
// Le donjon est un chemin de cases, terminé par un boss.
// Le nombre de cases et la fréquence de chaque type de case viennent du
// fichier data/tranches.json (chaque tranche a ses propres réglages).

import { weightedPick, randInt, pick } from './rng.js';
import { RANDOM_TILE_TYPES, dungeonRules } from './content.js';

/** Peut-on mettre ce type de case à la position i, vu ce qui est déjà posé ? */
function isAllowed(state, tranche, board, counts, partySize, type, i) {
  const c = state.content;
  const weight = tranche.tileWeights[type];
  if (!weight) return false;
  const def = c.tiles[type];
  if (def.minPlayers && partySize < def.minPlayers) return false;
  if (def.max && (counts[type] || 0) >= def.max) return false;
  // Pas de danger ni de chose rare dès la première case
  if (i === 0 && ['combat', 'merchant', 'life_fountain'].includes(type)) return false;
  // Jamais plus de 2 combats d'affilée
  if (type === 'combat' && i >= 2 && board[i - 1].type === 'combat' && board[i - 2].type === 'combat') return false;
  // Pas deux cases spéciales identiques d'affilée
  if (!['combat', 'treasure'].includes(type) && i > 0 && board[i - 1].type === type) return false;
  return true;
}

/**
 * Génère le plateau. La dernière case est toujours le boss.
 * @returns {Array} liste de cases { index, type, flavor, revealed, resolved }
 */
export function generateBoard(state, partySize) {
  const c = state.content;
  const tranche = dungeonRules(c, state.setup); // (les réglages de la tranche, que le donjon peut surcharger : longueur, cases...)
  const length = tranche.boardLength;
  const board = [];
  const counts = {};

  for (let i = 0; i < length - 1; i++) {
    let allowed = RANDOM_TILE_TYPES.filter((t) => isAllowed(state, tranche, board, counts, partySize, t, i));
    if (!allowed.length) allowed = ['treasure'];
    const type = weightedPick(state, allowed, (t) => tranche.tileWeights[t] || 1);
    counts[type] = (counts[type] || 0) + 1;
    board.push(makeTile(state, i, type));
  }

  // Le FEU DE CAMP : garanti au milieu du donjon (on peut l'enlever : "camp": false dans la tranche ou le donjon).
  if (c.tiles.camp && tranche.camp !== false && length >= 5) {
    const mid = Math.floor((length - 1) / 2);
    board[mid] = makeTile(state, mid, 'camp');
  }

  // Garanties : au moins quelques combats et au moins un trésor.
  ensureAtLeast(state, board, tranche, 'combat', tranche.minCombats ?? 4);
  ensureAtLeast(state, board, tranche, 'treasure', 1);

  // Dernière case : le boss
  board.push(makeTile(state, length - 1, 'boss'));
  return board;
}

function makeTile(state, index, type) {
  const flavors = state.content.tiles[type].flavor || [''];
  return { index, type, flavor: randInt(state, 0, flavors.length - 1), revealed: false, resolved: false };
}

/** Transforme des cases ordinaires en `type` tant qu'il n'y en a pas assez. */
function ensureAtLeast(state, board, tranche, type, wanted) {
  const count = () => board.filter((t) => t.type === type).length;
  let safety = 100;
  while (count() < wanted && safety-- > 0) {
    const candidates = board.filter((t) => {
      if (t.index === 0 && type === 'combat') return false;
      if (['combat', 'life_fountain', 'camp'].includes(t.type) || t.type === type) return false;
      if (type === 'combat') {
        // éviter 3 combats de suite
        const a = board[t.index - 1]?.type === 'combat' && board[t.index - 2]?.type === 'combat';
        const b = board[t.index - 1]?.type === 'combat' && board[t.index + 1]?.type === 'combat';
        const d = board[t.index + 1]?.type === 'combat' && board[t.index + 2]?.type === 'combat';
        if (a || b || d) return false;
      }
      return true;
    });
    if (!candidates.length) break;
    pick(state, candidates).type = type;
  }
}
