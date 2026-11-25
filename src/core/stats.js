// ============================================================
//  stats.js — Niveau réel / niveau effectif et calcul des statistiques
// ============================================================
// IMPORTANT : le jeu distingue toujours
//   - le NIVEAU RÉEL    : le vrai niveau du personnage (sauvegardé),
//   - le NIVEAU EFFECTIF: le niveau "utilisé" dans le donjon actuel.
// En mode Basic, effectif = réel. En mode Tranche / Stasis, effectif = le plus
// petit entre le niveau réel et la tranche du donjon (un niveau 20 dans une
// tranche 4 joue comme un niveau 4, avec le matériel de niveau <= 4).
//
// Les statistiques d'une unité sont calculées À CHAQUE FOIS à partir de :
//   base de la classe + croissance par niveau + objets
//   puis les "modificateurs" (compétences passives, objets, bonus/malus temporaires).
// Un modificateur peut dépendre de l'état de l'unité (ex. : +0,8 % de dégâts par % de PV manquants).

import { EQUIP_SLOTS } from './content.js';
import { upgradedStat } from './forge.js';
import { alliesOf, enemiesOf } from './geometry.js';

/** Les statistiques de base d'une unité. */
export const STAT_KEYS = ['hp', 'atk', 'def', 'heal', 'save', 'luck', 'ini'];

/** Niveau effectif d'un personnage dans un donjon. */
export function effectiveLevel(realLevel, setup, restrict) {
  if (!restrict) return realLevel;
  return Math.min(realLevel, setup.tranche);
}

/** Un objet est-il actif dans ce donjon ? (en mode restreint : niveau <= tranche) */
export function itemIsActive(state, itemDef) {
  if (!state.setup.restrict) return true;
  return itemDef.level <= state.setup.tranche;
}

/** Une compétence est-elle active ? (niveau requis <= niveau effectif) */
export function skillIsActive(skillDef, effLevel) {
  return (skillDef.level ?? 1) <= effLevel;
}

/**
 * Une compétence est-elle disponible pour CE joueur ? Niveau effectif suffisant ET, si elle appartient à une spécialisation,
 * cette spécialisation est la sienne (apprendre une compétence d'une autre spé ne sert à rien tant qu'on ne la rechoisit pas).
 */
export function skillAvailable(skillDef, unit) {
  return skillIsActive(skillDef, unit.effLevel) && (!skillDef.spec || skillDef.spec === unit.spec);
}

// ============================================================
//  Modificateurs
// ============================================================

/** Un modificateur multiplié (les rangs d'un talent) : pct, flat, pctPer et flatPer. */
function scaleModifier(m, k) {
  const scale = (o) => (o ? Object.fromEntries(Object.entries(o).map(([key, v]) => [key, v * k])) : o);
  return { ...m, ...(m.pct !== undefined ? { pct: m.pct * k } : {}), ...(m.flat !== undefined ? { flat: m.flat * k } : {}), ...(m.pctPer ? { pctPer: scale(m.pctPer) } : {}), ...(m.flatPer ? { flatPer: scale(m.flatPer) } : {}) };
}

/** Tous les modificateurs qui s'appliquent à une unité (passifs, objets, statuts). */
export function collectModifiers(state, unit) {
  const c = state.content;
  const out = [];
  if (unit.kind === 'player') {
    for (const id of unit.skills) {
      const sk = c.skills[id];
      if (sk?.type !== 'passive' || !skillAvailable(sk, unit)) continue;
      const rank = unit.ranks?.[id] || 1; // un talent à plusieurs rangs : ses modificateurs comptent autant de fois
      out.push(...(rank > 1 ? (sk.modifiers || []).map((m) => scaleModifier(m, rank)) : (sk.modifiers || [])));
    }
    for (const slot of EQUIP_SLOTS) {
      const inst = unit.equipment[slot];
      if (!inst || unit.cursedUid === inst.uid) continue; // un objet maudit ne donne plus rien
      const def = c.items[inst.id];
      if (def?.modifiers && itemIsActive(state, def)) out.push(...def.modifiers);
    }
    for (const s of activeSets(state, unit)) for (const b of s.bonuses) out.push(...b.modifiers);
  } else {
    for (const id of unit.passives || []) out.push(...(c.skills[id]?.modifiers || []));
  }
  for (const st of unit.statuses) if (st.id === 'mod') out.push({ stat: st.stat, pct: st.pct, flat: st.flat });
  for (const b of unit.campBuffs || []) out.push({ stat: b.stat, pct: b.pct }); // (bonus du feu de camp : quelques combats)
  for (const a of auraSources(state, unit)) out.push(...a.mods);
  return out;
}

/**
 * Les AURAS qui s'appliquent à une unité : un héros dont le MODE de classe a une liste `aura` (ex. l'Aura de protection du Templier) donne ces modificateurs
 * à tous ses alliés vivants, lui compris, tant qu'il est vivant et dans ce mode. Renvoie [{ from, modeId, mode, mods }] (en combat seulement).
 * Une entrée d'aura peut avoir une condition `if` sur LE HÉROS QUI LA PORTE (sa spécialisation : { "spec": "gardien" }, ou son mode).
 */
export function auraSources(state, unit) {
  if (!state.combat || unit.kind !== 'player') return [];
  const out = [];
  for (const p of state.players) {
    if (!p.alive || p.kind !== 'player') continue;
    const modes = state.content.classes[p.classId]?.modes;
    const modeId = p.mode ?? modes?.default;
    const mode = modes?.list[modeId];
    if (!mode?.aura) continue;
    // (hpMax: 1 : une condition d'aura ne regarde pas les PV, et il ne faut pas recalculer les stats du porteur ici)
    // (la condition se juge UNE fois, sur celui qui porte l'aura : on la retire du modificateur, sinon `computeStats` la rejugerait sur chaque allié)
    const mods = mode.aura.filter((a) => !a.if || evalCondition(state, p, a.if, { hpMax: 1 })).map(({ if: _cond, ...m }) => m);
    if (mods.length) out.push({ from: p, modeId, mode, mods });
  }
  return out;
}

/**
 * Les PANOPLIES d'un héros : pour chaque donjon dont il porte des objets (actifs, non maudits), combien de pièces, et les bonus atteints.
 * Renvoie [{ dungeonId, name, pieces, total, bonuses: [paliers atteints], all: [tous les paliers] }]. Marche aussi sur un personnage sauvegardé
 * (hors partie : `state` peut n'avoir que `content`, tous les objets comptent alors).
 */
export function activeSets(state, unit) {
  const c = state.content;
  const own = c.itemDungeon || {};
  const count = {};
  for (const slot of EQUIP_SLOTS) {
    const inst = unit.equipment?.[slot];
    if (!inst || unit.cursedUid === inst.uid) continue;
    const def = c.items[inst.id];
    const did = def && own[def.id];
    if (!did || !c.dungeons[did]?.setBonus) continue;
    if (state.setup && !itemIsActive(state, def)) continue;
    (count[did] ||= new Set()).add(def.id); // (deux fois le même objet ne compte qu'une pièce)
  }
  return Object.entries(count).map(([did, ids]) => {
    const d = c.dungeons[did];
    return { dungeonId: did, name: d.setName, pieces: ids.size, total: d.loot.length, bonuses: d.setBonus.filter((b) => ids.size >= b.pieces), all: d.setBonus };
  });
}

/** Une valeur "qui varie" (PV manquants, ressource...) utilisée par pctPer / flatPer. */
function scalar(state, unit, key, hpMax) {
  switch (key) {
    case 'missingHpPct': // en points de pourcentage (0 à 100). Les boucliers ne comptent PAS comme des PV.
      return hpMax > 0 ? Math.max(0, (1 - unit.hp / hpMax) * 100) : 0;
    case 'hpPct':
      return hpMax > 0 ? (unit.hp / hpMax) * 100 : 0;
    case 'alliesAlive':
      return alliesOf(state, unit).length;
    case 'enemiesAlive':
      return enemiesOf(state, unit).length;
    default:
      return key.startsWith('resource:') ? unit.resources?.[key.slice(9)] ?? 0 : 0;
  }
}

/** Une condition ("if") est-elle remplie ? `ctx` peut contenir hpMax (déjà connu) et target. */
export function evalCondition(state, unit, cond, ctx = {}) {
  const hpMax = ctx.hpMax ?? computeStats(state, unit).hpMax;
  const hpPct = hpMax > 0 ? (unit.hp / hpMax) * 100 : 0;
  if (cond.hpPctBelow !== undefined && !(hpPct < cond.hpPctBelow)) return false;
  if (cond.hpPctAbove !== undefined && !(hpPct > cond.hpPctAbove)) return false;
  if (cond.row !== undefined && unit.row !== cond.row) return false;
  if (cond.mode !== undefined && unit.mode !== cond.mode) return false; // le mode de classe (ex. réduction / dégâts du Sacrieur)
  if (cond.roundAtMost !== undefined && !(state.combat && state.combat.round <= cond.roundAtMost)) return false; // « pendant le premier round » (embuscade)
  if (cond.notAfflicted !== undefined && unit.statuses.some((st) => st.id === 'dot' || st.id === 'poison')) return false; // ni saignement ni poison
  if (cond.spec !== undefined && unit.spec !== cond.spec) return false; // la spécialisation du héros (ex. { "spec": "gardien" })
  if (cond.resourceAtLeast && (unit.resources?.[cond.resourceAtLeast.id] ?? 0) < cond.resourceAtLeast.amount) return false;
  if (cond.alliesAliveAtLeast !== undefined && alliesOf(state, unit).length < cond.alliesAliveAtLeast) return false;
  // Conditions sur la CIBLE (ctx.target) : marquée par cette unité, porteuse d'un statut (poison, saignement, marque...).
  if (cond.targetMarked !== undefined) {
    const t = ctx.target;
    const marked = !!t && t.statuses.some((st) => st.id === 'mark' && st.casterId === unit.id);
    if (marked !== cond.targetMarked) return false;
  }
  if (cond.targetStatus !== undefined) {
    const t = ctx.target;
    if (!t || !t.statuses.some((st) => st.id === cond.targetStatus)) return false;
  }
  if (cond.targetKey !== undefined) { // un statut PRÉCIS (sa « key », ex. la brûlure du Mage, pas n'importe quel saignement)
    const t = ctx.target;
    if (!t || !t.statuses.some((st) => st.key === cond.targetKey)) return false;
  }
  if (cond.targetHpPctBelow !== undefined) {
    const t = ctx.target;
    if (!t) return false;
    const tMax = t.hpMax ?? computeStats(state, t).hpMax;
    if (!((t.hp / tMax) * 100 < cond.targetHpPctBelow)) return false;
  }
  return true;
}

// ============================================================
//  Calcul des statistiques
// ============================================================

/**
 * Calcule les stats d'une unité (joueur OU monstre) À CET INSTANT.
 * Renvoie : hpMax, atk, def, heal, save, luck, ini, pa (points d'action par tour),
 * et des multiplicateurs : damage (dégâts infligés), dot (poisons et saignements posés), taken (dégâts reçus),
 * healPower (soins et boucliers), critShift / fumbleShift (décalage des seuils du D20).
 */
export function computeStats(state, unit) {
  const c = state.content;
  const rules = c.rules.combat;
  const isPlayer = unit.kind === 'player';

  // 1) Base : classe + croissance + objets (joueur) ou stats du monstre
  const base = {};
  let paFlat = 0;
  if (isPlayer) {
    const cls = c.classes[unit.classId];
    const L = unit.effLevel;
    for (const k of STAT_KEYS) base[k] = (cls.baseStats[k] || 0) + (cls.growth[k] || 0) * (L - 1);
    for (const slot of EQUIP_SLOTS) {
      const inst = unit.equipment[slot];
      if (!inst || unit.cursedUid === inst.uid) continue;
      const def = c.items[inst.id];
      if (!def?.stats || !itemIsActive(state, def)) continue;
      for (const [k, raw] of Object.entries(def.stats)) {
        const v = upgradedStat(c, inst, k, raw); // (un objet amélioré à la forge, +1 à +5 : ses statistiques grandissent)
        if (k === 'pa') paFlat += v;
        else base[k] = (base[k] || 0) + v;
      }
    }
  } else {
    for (const k of STAT_KEYS) base[k] = unit.base[k] || 0;
  }

  // 2) Modificateurs
  const mods = collectModifiers(state, unit);
  const sum = (stat, ctx) => {
    let pct = 0;
    let flat = 0;
    for (const m of mods) {
      if (m.stat !== stat) continue;
      if (m.if && !evalCondition(state, unit, m.if, ctx)) continue;
      pct += m.pct || 0;
      flat += m.flat || 0;
      if (m.pctPer) for (const [k, coef] of Object.entries(m.pctPer)) pct += (coef * scalar(state, unit, k, ctx.hpMax)) / 100;
      if (m.flatPer) for (const [k, coef] of Object.entries(m.flatPer)) flat += coef * scalar(state, unit, k, ctx.hpMax);
    }
    return { pct, flat };
  };

  // PV max d'abord (les autres modificateurs en ont besoin pour les "PV manquants")
  let hpMax;
  if (isPlayer) {
    const h = sum('hp', { hpMax: Math.max(1, base.hp) });
    const hpStat = Math.max(1, base.hp * Math.max(0.1, 1 + h.pct) + h.flat);
    hpMax = Math.max(1, Math.round(hpStat * (1 - (unit.hpMaxPenalty || 0))));
  } else {
    hpMax = unit.hpMax;
  }
  const ctx = { hpMax };

  const out = { hpMax, hp: hpMax };
  for (const k of ['atk', 'def', 'heal', 'save', 'luck', 'ini']) {
    const s = sum(k, ctx);
    out[k] = Math.max(0, base[k] * Math.max(0.1, 1 + s.pct) + s.flat);
  }
  const paBase = isPlayer ? rules.basePa : unit.paBase ?? rules.basePa;
  out.pa = Math.min(rules.maxPa ?? 99, Math.max(1, Math.round(paBase + paFlat + sum('pa', ctx).flat)));
  out.damage = Math.max(0.1, 1 + sum('damage', ctx).pct);
  // Au farm (seul face aux vagues), un soigneur tue lentement : farm.json > roleDamage lui donne un bonus de dégâts (là seulement).
  if (isPlayer && state.farm) out.damage *= 1 + (c.farm?.roleDamage?.[c.classes[unit.classId]?.role] || 0);
  out.dot = Math.max(0.1, 1 + sum('dot', ctx).pct); // dégâts des poisons et saignements qu'il pose
  out.taken = Math.max(0.1, 1 + sum('taken', ctx).pct);
  out.healPower = Math.max(0.1, 1 + sum('healPower', ctx).pct);
  out.healTaken = Math.max(0, 1 + sum('healTaken', ctx).pct); // soins REÇUS (une blessure profonde : −50 % = deux fois moins soigné)
  out.overhealShield = Math.max(0, sum('overhealShield', ctx).pct); // part du soin EN TROP changée en bouclier (Prêtre, spé Sacré)
  out.critShift = Math.round(sum('critShift', ctx).flat);
  out.fumbleShift = Math.round(sum('fumbleShift', ctx).flat);
  return out;
}

/** Stats de n'importe quelle unité (joueur ou monstre). */
export const unitStats = computeStats;

/** Formule de dégâts : attaque² / (attaque + défense). Toujours au moins 1. */
export function calcDamage(atk, def) {
  if (atk <= 0) return 1;
  return Math.max(1, Math.round((atk * atk) / (atk + def)));
}

/** Petit texte lisible pour des stats, ex. "+3 Attaque, +5 PV". */
export function describeStats(content, stats) {
  if (!stats) return '';
  return Object.entries(stats)
    .map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${content.statNames[k] || k}`)
    .join(', ');
}
