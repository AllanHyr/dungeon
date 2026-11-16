// ============================================================
//  loot.js — Tirage du butin
// ============================================================
// Le butin est très aléatoire :
//  1) on tire d'abord une RARETÉ (commun ... légendaire), avec des poids,
//  2) puis on tire un objet de cette rareté parmi ceux dont le niveau est
//     <= à la tranche du donjon.
//
// La "boost" (>1) favorise les raretés élevées (Stasis, bon jet de dé),
// une boost < 1 les défavorise (mode Basic).
// ATTENTION : la qualité monte mais JAMAIS le niveau : un donjon de tranche 4
// ne donne que des objets de niveau <= 4.

import { weightedPick, nextFloat } from './rng.js';
import { newItem } from './items.js';
import { dungeonIdOf } from './content.js';

/**
 * Objets ORDINAIRES pouvant tomber dans cette tranche. Les objets EXCLUSIFS (table `loot` d'un donjon) n'en font jamais partie :
 * ils ne tombent que dans leur donjon (voir `dungeonTable`), jamais ailleurs, ni au farm, ni chez le marchand.
 */
export function eligibleItems(content, tranche, filter = () => true) {
  const own = content.itemDungeon || {};
  return content.itemList.filter((i) => i.level <= tranche && !own[i.id] && filter(i));
}

/** La table de butin du donjon de cette partie (aucune au farm ni à l'Atelier) : ses objets exclusifs. */
export function dungeonTable(state, filter = () => true) {
  if (state.farm || state.training) return [];
  const c = state.content;
  const d = c.dungeons?.[dungeonIdOf(c, state.setup)];
  return (d?.loot || []).map((id) => c.items[id]).filter((i) => i && filter(i));
}

/** Tire une rareté parmi celles qui ont au moins un objet disponible. */
export function rollRarity(state, items, boost) {
  const c = state.content;
  const available = c.rarities.filter((r) => items.some((i) => i.rarity === r.id));
  return weightedPick(state, available, (r) => r.weight * Math.pow(Math.max(0.05, boost), c.rarityIndex[r.id]));
}

/**
 * Tire UN objet. Dans un donjon qui a sa table de butin, chaque objet a `dungeonTableChance` (rules.json) de venir de cette table ;
 * sinon c'est du butin ordinaire.
 * @param {object} opts  { boost, filter, minRarity, exclusiveOnly : forcément un objet de la table du donjon (s'il y en a une), noExclusive : jamais }
 * @returns {{uid,id}} le nouvel exemplaire
 */
export function rollItem(state, opts = {}) {
  const c = state.content;
  const tranche = state.setup.tranche;
  const table = opts.noExclusive ? [] : dungeonTable(state, opts.filter);
  const fromTable = table.length > 0 && (opts.exclusiveOnly || nextFloat(state) < (c.rules.loot.dungeonTableChance ?? 0.3));
  const items = fromTable ? table : eligibleItems(c, tranche, opts.filter);
  if (!items.length) return null;

  let rarity = rollRarity(state, items, opts.boost ?? 1);
  // Rareté minimale (ex. le boss donne au moins du "rare")
  if (opts.minRarity && c.rarityIndex[rarity.id] < c.rarityIndex[opts.minRarity]) {
    const better = c.rarities.filter((r) => c.rarityIndex[r.id] >= c.rarityIndex[opts.minRarity] && items.some((i) => i.rarity === r.id));
    if (better.length) rarity = better[0];
  }

  const pool = items.filter((i) => i.rarity === rarity.id);
  const lowerW = c.rules.loot.lowerLevelWeight;
  // Les objets des tranches inférieures tombent moins souvent.
  const def = weightedPick(state, pool, (i) => (i.weight ?? 1) * (i.level < tranche ? lowerW : 1));
  return newItem(state, def.id);
}

/** Objet au hasard pour l'étal d'un marchand (jamais de légendaire). */
export function rollShopItem(state) {
  const c = state.content;
  const maxIdx = c.rarityIndex['epic'] ?? c.rarities.length - 1;
  return rollItem(state, { boost: 0.8, noExclusive: true, filter: (i) => c.rarityIndex[i.rarity] <= maxIdx && i.slot !== 'consumable' });
}

/** Un consommable de la bonne tranche (le plus puissant disponible). */
export function bestPotion(state) {
  const c = state.content;
  const pots = eligibleItems(c, state.setup.tranche, (i) => i.slot === 'consumable');
  if (!pots.length) return null;
  pots.sort((a, b) => b.level - a.level || b.consumable.healPct - a.consumable.healPct);
  return newItem(state, pots[0].id);
}
