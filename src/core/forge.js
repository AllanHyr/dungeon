// ============================================================
//  forge.js — Démanteler, protéger, améliorer, forger : que faire du butin
// ============================================================
// Un objet qu'on n'utilise pas n'est jamais perdu : on le DÉMANTÈLE en éclats (plus il est rare, plus il en donne).
// Les éclats servent à la FORGE : AMÉLIORER un objet (+1 à +5, ses statistiques grandissent) ou FORGER un objet exclusif
// d'un donjon qu'on a déjà terminé (sans dépendre de la chance). Un objet PROTÉGÉ (cadenas) ne se démantèle pas.
// Tous les nombres sont dans data/rules.json (`forge`). Les éclats appartiennent au personnage (`ch.shards`).
//
// Un objet amélioré garde son identifiant ; son instance porte `plus` (1 à 5) : { uid, id, plus }.

import { EQUIP_SLOTS } from './content.js';

/** Les réglages de la forge (rules.json > forge), avec des valeurs par défaut. */
export function forgeRules(content) {
  const f = content.rules.forge || {};
  return {
    salvage: f.salvage || { common: 1, uncommon: 3, rare: 8, epic: 20, legendary: 50 },
    upgradeMax: f.upgradeMax ?? 5,
    upgradeStep: f.upgradeStep ?? 0.1,
    upgradeCost: f.upgradeCost || { common: 2, uncommon: 4, rare: 8, epic: 16, legendary: 30 },
    craftCost: f.craftCost || { common: 8, uncommon: 15, rare: 30, epic: 60, legendary: 120 },
    bagMax: f.bagMax ?? 200
  };
}

/** Le multiplicateur de statistiques d'une instance d'objet (+10 % par niveau d'amélioration, par défaut). */
export function plusMult(content, inst) {
  const plus = inst?.plus || 0;
  return plus ? 1 + forgeRules(content).upgradeStep * plus : 1;
}

/** Les statistiques qu'une amélioration fait grandir (les points entiers — PA, initiative, chance, sauvegarde — ne bougent pas). */
export const UPGRADED_STATS = ['hp', 'atk', 'def', 'heal'];

/** La valeur d'une statistique d'objet une fois l'amélioration appliquée (un malus d'objet maudit ne grandit pas). */
export function upgradedStat(content, inst, key, value) {
  if (!inst?.plus || value <= 0 || !UPGRADED_STATS.includes(key)) return value;
  const v = value * plusMult(content, inst);
  return Math.round(v * 100) / 100;
}

/**
 * L'objet tel qu'on le voit : sa définition, avec les statistiques AMÉLIORÉES et `plus` (pour l'afficher « +2 »).
 * Sans amélioration, c'est la définition elle-même.
 */
export function itemView(content, inst) {
  const def = content.items[inst?.id];
  if (!def || !inst.plus) return def;
  const stats = {};
  for (const [k, v] of Object.entries(def.stats || {})) stats[k] = upgradedStat(content, inst, k, v);
  return { ...def, stats, plus: inst.plus };
}

/** Les éclats que rapporte le démantèlement d'un objet (une potion ne se démantèle pas : 0). */
export function salvageValue(content, inst) {
  const def = content.items[inst?.id];
  if (!def || def.consumable) return 0;
  const f = forgeRules(content);
  const base = f.salvage[def.rarity] ?? 1;
  // (un objet amélioré rend une partie de ce qu'il a coûté : la moitié des éclats investis)
  let invested = 0;
  for (let p = 0; p < (inst.plus || 0); p++) invested += upgradeCost(content, inst, p);
  return base + Math.floor(invested / 2);
}

/** Le prix (en éclats) pour passer un objet de +`from` à +`from + 1`. */
export function upgradeCost(content, inst, from = inst?.plus || 0) {
  const def = content.items[inst?.id];
  if (!def) return Infinity;
  return (forgeRules(content).upgradeCost[def.rarity] ?? 2) * (from + 1);
}

/** Peut-on améliorer cet objet ? { ok, cost, reason } */
export function canUpgrade(content, ch, inst) {
  const def = content.items[inst?.id];
  if (!def || def.consumable) return { ok: false, reason: 'Cet objet ne s\'améliore pas.' };
  const f = forgeRules(content);
  if ((inst.plus || 0) >= f.upgradeMax) return { ok: false, reason: `Déjà au maximum (+${f.upgradeMax}).` };
  const cost = upgradeCost(content, inst);
  if ((ch.shards || 0) < cost) return { ok: false, cost, reason: `${cost} éclats requis (tu en as ${ch.shards || 0}).` };
  return { ok: true, cost };
}

/**
 * Les objets qu'on peut FORGER : ceux de la table de butin d'un donjon que ce personnage a déjà terminé, avec leur prix.
 * Un légendaire est listé, mais verrouillé (`locked`) tant que ce donjon n'a pas été terminé en Stasis.
 * Renvoie [{ id, dungeonId, cost, def, needStasis, locked }].
 */
export function craftableItems(content, ch) {
  const f = forgeRules(content);
  const out = [];
  for (const [id, did] of Object.entries(content.itemDungeon || {})) {
    if (!(ch.stats?.dungeons?.[did] > 0)) continue;
    const def = content.items[id];
    if (!def) continue;
    // Le légendaire ne se trouve qu'en Stasis (à plusieurs) : il ne se forge qu'après avoir terminé CE donjon en Stasis.
    const needStasis = def.rarity === 'legendary';
    out.push({ id, dungeonId: did, cost: f.craftCost[def.rarity] ?? 30, def, needStasis, locked: needStasis && !(ch.stats?.stasisClears?.[did] > 0) });
  }
  return out.sort((a, b) => a.def.level - b.def.level || a.cost - b.cost);
}

/** Toutes les instances d'objets d'un personnage, avec leur place : sac ou emplacement porté. */
export function ownedItems(ch) {
  const out = (ch.inventory || []).map((inst) => ({ inst, where: 'bag' }));
  for (const slot of EQUIP_SLOTS) if (ch.equipment?.[slot]) out.push({ inst: ch.equipment[slot], where: slot });
  return out;
}

/** Les objets du sac qu'un « tout démanteler jusqu'à telle rareté » emporterait (ni protégés, ni potions). */
export function bulkSalvageList(content, ch, maxRarity) {
  const max = content.rarityIndex[maxRarity] ?? 0;
  const locked = new Set(ch.locked || []);
  return (ch.inventory || []).filter((inst) => {
    const def = content.items[inst.id];
    return def && !def.consumable && !locked.has(inst.uid) && (content.rarityIndex[def.rarity] ?? 0) <= max;
  });
}
