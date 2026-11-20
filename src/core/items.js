// ============================================================
//  items.js — Outils pour les objets (équiper, prix, descriptions)
// ============================================================
// Un objet "en vrai" dans un inventaire est une petite fiche : { uid, id }
//   - id  = référence vers sa définition dans items.json
//   - uid = numéro unique de CET exemplaire (on peut avoir deux épées identiques)

import { EQUIP_SLOTS, ITEM_TYPES } from './content.js';
import { describeStats } from './stats.js';
import { itemView } from './forge.js';

/** Fabrique un nouvel exemplaire d'objet avec un numéro unique. */
export function newItem(state, itemId) {
  const n = state.nextUid++;
  return { uid: `${state.seed.toString(36)}-${n}`, id: itemId };
}

export function itemDef(content, inst) {
  return content.items[inst.id];
}

export function rarityOf(content, def) {
  return content.rarities[content.rarityIndex[def.rarity]];
}

/**
 * Les emplacements où cet objet peut se porter, dans l'ordre de préférence.
 * Ex. un anneau : ['ring1', 'ring2'] ; une arme à une main : ['mainHand', 'offHand'] ; une arme à deux mains : ['mainHand'].
 * Liste vide : ce n'est pas un équipement (une potion...).
 */
export function slotsFor(def) {
  if (def.slot === 'weapon') return def.twoHanded ? ['mainHand'] : ['mainHand', 'offHand'];
  return [...(ITEM_TYPES[def.slot] || [])];
}

/** Peut-on équiper cet objet avec ce niveau RÉEL ? Renvoie { ok, reason }. */
export function canEquip(content, realLevel, def) {
  if (!slotsFor(def).length) return { ok: false, reason: "Ce n'est pas un équipement." };
  if (realLevel < def.level) return { ok: false, reason: `Niveau ${def.level} requis.` };
  return { ok: true };
}

/** Une arme à deux mains est-elle portée ? (elle occupe la main droite ET bloque la main gauche) */
export function twoHandedWorn(content, equipment) {
  const main = equipment.mainHand;
  return !!(main && content.items[main.id]?.twoHanded);
}

/**
 * Où ira cet objet, et que faut-il retirer pour lui faire de la place ?
 *  - `slot` (facultatif) : l'emplacement voulu ; sinon le premier emplacement libre, sinon le premier possible ;
 *  - arme à deux mains : la main gauche doit être libre (son objet retourne au sac) ;
 *  - objet pour la main gauche alors qu'une arme à deux mains est portée : l'arme retourne au sac.
 * Renvoie { ok, slot, remove: [emplacements à vider], reason }.
 */
export function planEquip(content, equipment, def, slot = null) {
  const options = slotsFor(def);
  if (!options.length) return { ok: false, reason: "Ce n'est pas un équipement." };
  const blocked = twoHandedWorn(content, equipment);
  const free = (s) => !equipment[s] && !(s === 'offHand' && blocked);
  const target = slot ?? options.find(free) ?? options[0];
  if (!options.includes(target)) return { ok: false, reason: 'Cet objet ne va pas à cet emplacement.' };
  const remove = [];
  if (equipment[target]) remove.push(target);
  if (def.twoHanded && equipment.offHand) remove.push('offHand');
  if (target === 'offHand' && blocked) remove.push('mainHand');
  return { ok: true, slot: target, remove: [...new Set(remove)] };
}

/**
 * Équipe l'objet `uid` pris dans le sac. `holder` = { equipment, bag, realLevel } : un joueur de la partie, ou un personnage
 * sauvegardé ({ equipment: ch.equipment, bag: ch.inventory, realLevel: ch.level }). Les objets déplacés retournent dans le sac
 * (rien ne se perd). Renvoie { ok, slot, displaced: [objets retirés], reason }.
 */
export function equipFromBag(content, holder, uid, slot = null) {
  const inst = holder.bag.find((it) => it.uid === uid);
  if (!inst) return { ok: false, reason: "Cet objet n'est pas dans le sac." };
  const def = content.items[inst.id];
  const check = canEquip(content, holder.realLevel, def);
  if (!check.ok) return check;
  const plan = planEquip(content, holder.equipment, def, slot);
  if (!plan.ok) return plan;
  takeFromList(holder.bag, uid);
  const displaced = [];
  for (const s of plan.remove) {
    if (holder.equipment[s]) displaced.push(holder.equipment[s]);
    holder.equipment[s] = null;
  }
  holder.equipment[plan.slot] = inst;
  holder.bag.push(...displaced);
  return { ok: true, slot: plan.slot, displaced };
}

/** Retire l'objet porté dans `slot` et le range dans le sac. Renvoie l'objet, ou null s'il n'y avait rien. */
export function unequipToBag(holder, slot) {
  if (!EQUIP_SLOTS.includes(slot)) return null; // (un nom d'emplacement inventé ne doit rien toucher)
  const inst = holder.equipment[slot];
  if (!inst) return null;
  holder.equipment[slot] = null;
  holder.bag.push(inst);
  return inst;
}

/** Les objets actuellement portés qui seraient concernés par cet objet (ceux de ses emplacements possibles). */
export function wornFor(content, equipment, def) {
  return slotsFor(def).map((s) => equipment[s]).filter(Boolean);
}

/** Prix de base d'un objet (dépend de sa rareté et de son niveau). */
export function itemPrice(content, def) {
  const rarity = rarityOf(content, def);
  const step = content.rules.shop.levelPriceStep;
  return Math.max(1, Math.round(rarity.price * (1 + step * (def.level - 1))));
}

/** Description complète en une ligne : stats ou effet de consommable. */
export function itemSummary(content, def) {
  if (def.consumable) return `Soigne ${Math.round(def.consumable.healPct * 100)}% des PV max`;
  return describeStats(content, def.stats);
}

/** Déplace un objet d'une liste vers une autre. Renvoie l'objet ou null. */
export function takeFromList(list, uid) {
  const i = list.findIndex((it) => it.uid === uid);
  if (i < 0) return null;
  return list.splice(i, 1)[0];
}

/** Cherche un objet par son uid dans le sac ET l'équipement. */
export function findOwned(player, uid) {
  const inBag = player.bag.find((it) => it.uid === uid);
  if (inBag) return { inst: inBag, where: 'bag' };
  for (const slot of EQUIP_SLOTS) {
    if (player.equipment[slot]?.uid === uid) return { inst: player.equipment[slot], where: slot };
  }
  return null;
}

/**
 * « Équiper le meilleur » : équipe, un par un, les objets du sac qui sont STRICTEMENT meilleurs que ce qu'ils remplaceraient
 * (au moins une caractéristique en hausse, aucune en baisse, améliorations de la forge comprises), ou qui vont dans un
 * emplacement vide. Un objet « différent » (un gain, une perte) reste un choix du joueur : on n'y touche pas.
 * Un objet maudit, un objet trop haut pour le niveau du héros ou une potion sont ignorés. Renvoie la liste des objets équipés.
 */
export function autoEquip(content, holder) {
  const statsOf = (inst) => itemView(content, inst)?.stats || {};
  const sum = (insts, k) => insts.reduce((t, i) => t + (statsOf(i)[k] || 0), 0);
  const gainOf = (inst, plan) => {
    const olds = plan.remove.map((s) => holder.equipment[s]).filter(Boolean);
    const keys = new Set([...Object.keys(statsOf(inst)), ...olds.flatMap((o) => Object.keys(statsOf(o)))]);
    let up = 0, down = false;
    for (const k of keys) {
      const d = (statsOf(inst)[k] || 0) - sum(olds, k);
      if (d > 1e-9) up += d; else if (d < -1e-9) down = true;
    }
    if (!olds.length) return up > 0 || Object.keys(statsOf(inst)).length ? up + 1000 : -1; // (un emplacement vide : toujours bon à prendre)
    return down || up <= 0 ? -1 : up;
  };
  const equipped = [];
  for (let guard = 0; guard < 40; guard++) {
    let best = null;
    for (const inst of holder.bag) {
      const def = content.items[inst.id];
      if (!def || def.consumable || !slotsFor(def).length) continue;
      if (!canEquip(content, holder.realLevel, def).ok) continue;
      if (holder.cursedUid && holder.cursedUid === inst.uid) continue;
      for (const slot of slotsFor(def)) {
        const plan = planEquip(content, holder.equipment, def, slot);
        if (!plan.ok) continue;
        const g = gainOf(inst, plan);
        if (g > 0 && (!best || g > best.gain)) best = { inst, slot, gain: g };
      }
    }
    if (!best) break;
    const res = equipFromBag(content, holder, best.inst.uid, best.slot);
    if (!res.ok) break;
    equipped.push(best.inst);
  }
  return equipped;
}
