// ============================================================
//  settle.js — Régler la fin d'une partie : les récompenses vont aux personnages sauvegardés
// ============================================================
// Quand une partie se termine (victoire, défaite, abandon, fin d'une session de farm), le bilan est calculé par le moteur
// (state.result) puis APPLIQUÉ aux personnages : XP, butin, éclats, compteurs, succès débloqués.
// Cette étape est faite exactement une fois (le bilan porte un drapeau `applied`) :
//   - en local, par le navigateur ;
//   - en ligne, par le serveur (le navigateur reçoit les personnages à jour).

import { applyRunResult } from './results.js';
import { applyFarmResult } from './farm.js';
import { checkAchievements } from './achievements.js';

/**
 * Si la partie est terminée et que son bilan n'a pas encore été appliqué, l'applique aux personnages.
 * @param characters  les personnages du joueur (modifiés sur place)
 * @returns { settled: boolean, chars: [personnages concernés], unlocked: [{ charId, charName, achievement }] }
 */
export function settleRun(content, characters, state) {
  if (!state || state.phase !== 'ended' || !state.result || state.result.applied || state.training) return { settled: false, chars: [], unlocked: [] };
  const chars = state.players.map((p) => characters.find((c) => c.id === p.charId)).filter(Boolean);
  if (state.farm) {
    if (chars[0]) applyFarmResult(content, chars[0], state); // (le personnage a pu être supprimé : rien à appliquer)
  } else applyRunResult(content, characters, state);
  // Les succès : on vérifie chaque personnage de la partie (niveau, donjon terminé, vagues...)
  const unlocked = [];
  for (const ch of chars) for (const achievement of checkAchievements(content, ch)) unlocked.push({ charId: ch.id, charName: ch.name, achievement });
  return { settled: true, chars, unlocked };
}
