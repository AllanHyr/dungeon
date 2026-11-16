// ============================================================
//  dice.js — Les lancers de D20 d'un joueur
// ============================================================
// Un jet = dé naturel (1 à 20) + chance de l'équipement + bonus/malus d'un fantôme.
// Le résultat "naturel" compte pour les cas spéciaux : 1 = échec critique, 20 = critique.

import { rollD20 } from './rng.js';
import { unitStats } from './stats.js';
import { emit, log } from './util.js';

/**
 * Lance un D20 pour un joueur.
 * @param purpose  à quoi sert le jet (pour l'affichage)
 * @param opts     { minor: true } pour un petit jet de combat (animation courte)
 * @returns {{natural:number, total:number, luck:number, ghostMod:number}}
 */
export function playerRoll(state, player, purpose, opts = {}) {
  const natural = rollD20(state);
  const luck = Math.round(unitStats(state, player).luck);
  const ghostMod = state.bonus.rollMod;
  state.bonus.rollMod = 0; // le bonus du fantôme n'est valable qu'une fois
  const total = natural + luck + ghostMod;
  emit(state, { type: 'roll', playerId: player.id, natural, luck, ghostMod, total, purpose, minor: !!opts.minor });
  if (!opts.minor) {
    const extra = [luck ? `chance ${luck > 0 ? '+' : ''}${luck}` : '', ghostMod ? `fantôme ${ghostMod > 0 ? '+' : ''}${ghostMod}` : ''].filter(Boolean).join(', ');
    log(state, `${player.name} lance le D20 : ${natural}${extra ? ` (${extra})` : ''} = ${total}`, 'roll');
  }
  return { natural, total, luck, ghostMod };
}
