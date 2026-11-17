// ============================================================
//  effects.js — Lancer une compétence : dé, effets et déclencheurs
// ============================================================
// C'est le "cerveau" des compétences. Une compétence est décrite en JSON par une liste
// d'EFFETS ({ "type": "damage", "power": 1.5 }, { "type": "shield", ... }, ...) et ce
// fichier sait les appliquer. Les passifs peuvent aussi avoir des DÉCLENCHEURS
// ({ "on": "dealDamage", "effect": {...} }) : ils réagissent aux événements du combat.
//
// Pour ajouter un NOUVEAU type d'effet, il suffit d'ajouter un `case` dans applyEffect
// (et son nom dans EFFECT_TYPES de content.js).

import { rollD20, nextFloat } from './rng.js';
import { log, emit, social } from './util.js';
import { unitStats, calcDamage, evalCondition, skillAvailable, itemIsActive } from './stats.js';
import { applyDamage, healUnit, addShield, addStatus, reviveUnit, canBeRevived, canBeRaised, clampHp } from './units.js';
import { alliesOf, enemiesOf, reachableEnemies, otherRow, markedEnemies } from './geometry.js';
import { lowestAlly, resolveDice, skillPaCost } from './skills.js';
import { playerRoll } from './dice.js';
import { makeMonster } from './combat.js'; // (import croisé : sans danger, la fonction n'est appelée qu'en plein combat)
import { EQUIP_SLOTS, dungeonRules } from './content.js';

/** Profondeur des déclencheurs en cours (évite les réactions en chaîne infinies). */
let depth = 0;

// ============================================================
//  Aides
// ============================================================

/** Si un combat s'éternise, les monstres s'énervent : plus de force à chaque round. */
export function enrageFactor(state) {
  const cfg = state.content.rules.combat;
  if (!state.combat) return 1;
  // (un donjon peut avoir sa propre impatience : `enrageAfterRound` / `enragePerRound` dans dungeons.json, sauf au farm et à l'Atelier)
  const d = state.farm || state.training ? null : dungeonRules(state.content, state.setup);
  return 1 + (d?.enragePerRound ?? cfg.enragePerRound) * Math.max(0, state.combat.round - (d?.enrageAfterRound ?? cfg.enrageAfterRound));
}

/** Pose un statut sur une unité (noté comme "frais" s'il est posé pendant son propre tour). */
function giveStatus(state, caster, unit, status) {
  const st = addStatus(unit, { ...status, casterId: caster?.id || null, fresh: state.combat?.activeId === unit.id });
  // L'écran s'en sert pour annoncer l'effet au-dessus du combattant (« Poison », « Dégâts +15 % »...).
  emit(state, { type: 'status', target: unit.id, id: status.id, stat: status.stat, pct: status.pct, flat: status.flat, amount: status.amount, reduction: status.reduction, label: status.label, name: status.name, stacks: st.stacks, turns: status.turns });
  return st;
}

function gainResource(state, unit, id, amount) {
  const max = unit.resourceMax?.[id] ?? 999;
  const before = unit.resources[id] || 0;
  const after = Math.max(0, Math.min(max, before + amount));
  unit.resources[id] = after;
  if (after !== before) emit(state, { type: 'resource', target: unit.id, id, amount: after - before });
}

/** Les PV manquants d'une unité, en points de pourcentage (0 à 100). Les boucliers ne comptent pas comme des PV. */
function missingHpPct(state, unit) {
  const max = unitStats(state, unit).hpMax;
  return max > 0 ? Math.max(0, (1 - unit.hp / max) * 100) : 0;
}

/**
 * Le supplément de dégâts (en proportion : 0,2 = +20 %) que `caster` inflige à CETTE cible : sa marque, et ses passifs `targetDamage`
 * (ex. « +25 % de dégâts contre les cibles empoisonnées »). Ne compte que les coups directs.
 */
export function targetDamagePct(state, caster, target) {
  let pct = 0;
  const mark = target.statuses.find((st) => st.id === 'mark' && st.casterId === caster.id);
  if (mark) pct += mark.pct || 0;
  if (caster.kind === 'player') {
    for (const id of caster.skills) {
      const sk = state.content.skills[id];
      if (sk?.type !== 'passive' || !sk.targetDamage || !skillAvailable(sk, caster)) continue;
      for (const t of sk.targetDamage) if (!t.ifTarget || evalCondition(state, caster, t.ifTarget, { target })) pct += t.pct || 0;
    }
  }
  return pct;
}

/**
 * « Sacrifice » : si un allié du joueur visé porte le statut `redirect`, c'est LUI qui encaisse le coup d'un monstre à la place.
 * (Seuls les coups directs des monstres sont détournés : pas le poison, ni les dégâts qu'on s'inflige soi-même.)
 */
function redirectedTarget(state, source, target) {
  if (!source || source.kind !== 'monster' || target.kind !== 'player') return target;
  const guardian = state.players.find((p) => p.alive && p.id !== target.id && p.statuses.some((s) => s.id === 'redirect'));
  if (!guardian) return target;
  log(state, `   ${guardian.name} s'interpose et encaisse à la place de ${target.name} !`, 'good');
  return guardian;
}

/** Les cibles réelles d'une compétence (selon son champ "target"). */
export function skillTargets(state, caster, sk, pickedId) {
  switch (sk.target) {
    case 'enemy': {
      const t = reachableEnemies(state, caster, sk).find((u) => u.id === pickedId);
      return t ? [t] : [];
    }
    case 'enemies':
      return reachableEnemies(state, caster, sk);
    case 'ally': {
      const t = alliesOf(state, caster).find((u) => u.id === pickedId);
      return t ? [t] : [];
    }
    case 'allies':
      return alliesOf(state, caster);
    case 'self':
      return [caster];
    case 'deadAlly': {
      const t = caster.kind === 'player'
        ? state.players.find((p) => p.id === pickedId && canBeRevived(p))
        : (state.combat?.monsters || []).find((m) => m.id === pickedId && canBeRaised(m)); // (un réanimateur relève un monstre tombé)
      return t ? [t] : [];
    }
    case 'lowestAlly': {
      const l = lowestAlly(state, caster);
      return l ? [l] : [];
    }
    default:
      return [];
  }
}

/** Qui reçoit CET effet ? ("to" dans le JSON ; par défaut la cible de la compétence). */
function effectUnits(state, caster, e, targets, ctx) {
  switch (e.to || ctx.defaultTo || 'target') {
    case 'target': return targets;
    case 'self': return [caster];
    case 'allies':
    case 'allAllies': return alliesOf(state, caster);
    case 'enemies':
    case 'allEnemies': return enemiesOf(state, caster);
    case 'lowestAlly': {
      const l = lowestAlly(state, caster);
      return l ? [l] : [];
    }
    case 'source':
    case 'attacker': return ctx.source && ctx.source.alive ? [ctx.source] : [];
    case 'lowestEnemy': { // l'ennemi le plus blessé (en proportion de ses PV)
      const en = enemiesOf(state, caster);
      let best = null;
      for (const u of en) if (!best || u.hp / unitStats(state, u).hpMax < best.hp / unitStats(state, best).hpMax) best = u;
      return best ? [best] : [];
    }
    case 'randomEnemy': {
      const en = enemiesOf(state, caster);
      return en.length ? [en[Math.floor(nextFloat(state) * en.length)]] : [];
    }
    case 'expiation': // les alliés qui portent l'EXPIATION de ce lanceur (Prêtre, spé Discipline : ses dégâts les soignent)
      return alliesOf(state, caster).filter((u) => u.statuses.some((st) => st.id === 'expiation' && st.casterId === caster.id));
    default: return [];
  }
}

// ============================================================
//  Dégâts (avec réactions)
// ============================================================

/**
 * Inflige des dégâts ET déclenche les réactions : "quand tu infliges des dégâts",
 * "quand tu en reçois", "quand tu tues", et "quand tu devrais mourir" (peut sauver la vie).
 */
export function dealDamage(state, source, target, amount, opts = {}) {
  const out = opts.out || {};
  const real = applyDamage(state, target, amount, source, {
    ...opts,
    out,
    onLethal: (t, dmg) => {
      const c = { unit: t, source, amount: dmg, surviveHp: null };
      fireTriggers(state, 'wouldDie', c);
      return c.surviveHp;
    }
  });
  if (opts.fromTrigger) return real; // pas de réaction en chaîne
  const gross = real + (out.absorbed || 0);
  if (source && source !== target && gross > 0) fireTriggers(state, 'dealDamage', { unit: source, target, amount: real, absorbed: out.absorbed || 0 });
  if (gross > 0) fireTriggers(state, 'takeDamage', { unit: target, source, amount: real });
  if (!target.alive && source && source !== target) fireTriggers(state, 'kill', { unit: source, target });
  return real;
}

// ============================================================
//  Déclencheurs
// ============================================================

/** Les déclencheurs d'une unité pour un événement (passifs appris, objets équipés, passifs de monstre). */
function triggersOf(state, unit, event) {
  const c = state.content;
  const out = [];
  const add = (list, id) => (list || []).forEach((t, i) => t.on === event && out.push({ t, key: `${id}:${i}` }));
  if (unit.kind === 'player') {
    for (const id of unit.skills) {
      const sk = c.skills[id];
      if (sk?.type === 'passive' && skillAvailable(sk, unit)) add(sk.triggers, id);
    }
    for (const slot of EQUIP_SLOTS) {
      const inst = unit.equipment[slot];
      if (!inst || unit.cursedUid === inst.uid) continue;
      const def = c.items[inst.id];
      if (def?.triggers && itemIsActive(state, def)) add(def.triggers, inst.id);
    }
  } else {
    for (const id of unit.passives || []) add(c.skills[id]?.triggers, id);
  }
  return out;
}

/**
 * Déclenche les réactions d'une unité à un événement.
 * `ctx` : { unit, target?, source?, amount? } (et pour 'wouldDie', `surviveHp` est rempli).
 */
export function fireTriggers(state, event, ctx) {
  const unit = ctx.unit;
  if (!unit || !state.combat || !unit.alive) return ctx; // les réactions n'existent qu'en combat
  if (depth >= state.content.rules.combat.triggerDepth) return ctx;
  for (const { t, key } of triggersOf(state, unit, event)) {
    if (t.if && !evalCondition(state, unit, t.if, { target: ctx.target })) continue;
    if (t.chance !== undefined && nextFloat(state) >= t.chance) continue;
    if (t.oncePerTurn && unit.flags[`turn:${key}`]) continue;
    if (t.oncePerCombat && unit.flags[`combat:${key}`]) continue;
    if (t.oncePerTurn) unit.flags[`turn:${key}`] = true;
    if (t.oncePerCombat) unit.flags[`combat:${key}`] = true;
    Object.assign(ctx, { fromTrigger: true, defaultTo: 'self', trigger: t });
    depth++;
    try {
      for (const e of t.effects || [t.effect]) applyEffect(state, unit, e, ctx.target ? [ctx.target] : [], ctx);
    } finally {
      depth--;
    }
  }
  return ctx;
}

// ============================================================
//  Les effets
// ============================================================

/** Applique UN effet. `targets` = cibles de la compétence ; `ctx` = contexte (issue du dé, déclencheur...). */
export function applyEffect(state, caster, e, targets, ctx) {
  const rules = state.content.rules;
  let units = effectUnits(state, caster, e, targets, ctx);
  const cs = unitStats(state, caster);
  const crit = ctx.outcome === 'crit';
  const critMult = e.critMult ?? rules.dice.critMult;
  const isPlayer = caster.kind === 'player';
  const say = (text, kind = 'combat') => log(state, text, kind);
  // Un effet peut dépendre d'une condition ("if", ex. { "mode": "reduction" }) : il ne s'applique que si elle est vraie pour le lanceur.
  if (e.if && !evalCondition(state, caster, e.if, { target: targets[0] })) return;
  // `ifTarget` : une condition sur la CIBLE de la compétence (ex. { "targetMarked": true }). L'effet qui vise la cible ne s'applique qu'à celles
  // qui la remplissent ; un effet qui vise autre chose (« to »: « self »...) s'applique si au moins une des cibles la remplit.
  if (e.ifTarget) {
    const ok = (t) => evalCondition(state, caster, e.ifTarget, { target: t });
    if ((e.to || ctx.defaultTo || 'target') === 'target') units = units.filter(ok);
    else if (!targets.some(ok)) return;
  }

  switch (e.type) {
    case 'damage': {
      const enrage = caster.kind === 'monster' ? enrageFactor(state) : 1;
      // Puissance : fixe, plus (facultatif) un bonus par % de PV MANQUANTS du lanceur (ex. la Punition du Sacrieur), calculé au moment du coup.
      const basePower = (e.power ?? 1) + (e.powerPerMissingHp ? e.powerPerMissingHp * missingHpPct(state, caster) : 0);
      for (const hit of units) {
        const u = redirectedTarget(state, caster, hit);
        if (!u.alive) continue;
        // Puissance qui dépend de la CIBLE : un bonus par % de PV manquants de la cible (assassinat), et des bonus conditionnels (`bonus`, ex. sur une cible marquée).
        let power = basePower + (e.powerPerTargetMissingHp ? e.powerPerTargetMissingHp * missingHpPct(state, u) : 0);
        for (const b of e.bonus || []) if (!b.ifTarget || evalCondition(state, caster, b.ifTarget, { target: u })) power += b.power || 0;
        const fixed = e.pctMaxHp !== undefined;
        const targetMult = fixed ? 1 : 1 + targetDamagePct(state, caster, u); // marque, passifs « contre les cibles... »
        const amount = fixed
          ? unitStats(state, u).hpMax * e.pctMaxHp
          : calcDamage(cs.atk * power * cs.damage * targetMult * enrage * (crit ? critMult : 1), e.ignoreDef ? 0 : unitStats(state, u).def);
        const real = dealDamage(state, caster, u, amount, {
          nonLethal: e.nonLethal,
          ignoreGuard: fixed,
          ignoreShield: e.to === 'self' && u === caster, // « il s'inflige X % de ses PV » : un vrai coût, qu'aucun bouclier n'absorbe
          fromTrigger: ctx.fromTrigger,
          describe: (r, abs) => `   ${u.name} : -${r} PV${abs ? ` (${abs} absorbés)` : ''}${crit && !fixed ? ' (CRITIQUE !)' : ''}`
        });
        if (e.lifesteal && real > 0) {
          const back = healUnit(state, caster, caster, real * e.lifesteal);
          if (back > 0) say(`   ${caster.name} récupère ${back} PV.`, 'good');
        }
      }
      break;
    }

    case 'heal': {
      for (const u of units) {
        if (!u.alive) continue;
        let amount;
        if (e.pctMaxHp !== undefined) amount = unitStats(state, u).hpMax * e.pctMaxHp;
        else if (e.pctOfDamage !== undefined) amount = (ctx.amount || 0) * e.pctOfDamage;
        else amount = Math.max(cs.heal > 0 ? 1 : 0, cs.heal * e.power * cs.healPower * (crit ? critMult : 1));
        const real = healUnit(state, caster, u, amount);
        if (real > 0 || !ctx.fromTrigger) say(`   ${u.name} récupère ${real} PV.`, 'good');
        // Stat `overhealShield` (Prêtre, spé Sacré) : une part du soin EN TROP (au-delà des PV max) devient un bouclier de 2 tours.
        const over = Math.round(amount * unitStats(state, u).healTaken) - real;
        if (cs.overhealShield > 0 && over >= 1) {
          const added = addShield(state, u, over * cs.overhealShield, 2, caster);
          if (added > 0) say(`   Le soin en trop devient un bouclier de ${added} pour ${u.name}.`, 'good');
        }
      }
      break;
    }

    case 'shield': {
      for (const u of units) {
        if (!u.alive) continue;
        // Bouclier : une part des PV max, et/ou une part des PV MANQUANTS de celui qui le reçoit, et/ou la stat de soin.
        const uMax = unitStats(state, u).hpMax;
        const amount = e.power !== undefined && e.pctMaxHp === undefined && e.pctMissingHp === undefined
          ? cs.heal * e.power * cs.healPower * (crit ? critMult : 1)
          : uMax * (e.pctMaxHp ?? 0) + Math.max(0, uMax - u.hp) * (e.pctMissingHp ?? 0);
        const added = addShield(state, u, amount, e.turns ?? 2, caster);
        if (added > 0) say(`   ${u.name} gagne un bouclier de ${added}.`, 'good');
      }
      break;
    }

    case 'hot': {
      for (const u of units) {
        if (!u.alive) continue;
        const amount = Math.max(1, Math.round(cs.heal * e.power * cs.healPower * (crit ? critMult : 1)));
        giveStatus(state, caster, u, { id: 'hot', key: ctx.skill?.id || 'hot', amount, turns: e.turns });
        say(`   ${u.name} sera soigné de ${amount} PV par tour pendant ${e.turns} tours.`, 'good');
      }
      break;
    }

    case 'dot': {
      // Saignement / venin : des dégâts à chaque tour. `stack: true` : chaque nouvelle pose AJOUTE un cumul (jusqu'à `maxStacks`) ; avec la même `key`,
      // plusieurs compétences cumulent sur le même statut (ex. tous les venins de l'Assassin). `name` : le nom affiché (« Venin »).
      for (const u of units) {
        if (!u.alive) continue;
        const amount = calcDamage(cs.atk * e.power * cs.damage * cs.dot, unitStats(state, u).def);
        const st = giveStatus(state, caster, u, {
          id: 'dot', key: e.key || ctx.skill?.id || 'dot', label: e.label || 'saigne', name: e.name, amount, turns: e.turns, nonLethal: !!e.nonLethal,
          stack: !!e.stack, maxStacks: e.maxStacks, stacks: e.stacks, drain: e.drain
        });
        say(`   ${u.name} ${e.label || 'saigne'} (${amount * (st.stacks || 1)} PV par tour pendant ${e.turns} tours${st.stacks > 1 ? `, ${st.stacks} cumuls` : ''}).`, 'combat');
      }
      break;
    }

    case 'poison': {
      for (const u of units) {
        if (!u.alive) continue;
        giveStatus(state, caster, u, { id: 'poison', pct: e.pct, turns: e.turns });
        say(`   ${u.name} est empoisonné.`, 'bad');
      }
      break;
    }

    case 'mod': {
      for (const u of units) {
        if (!u.alive) continue;
        giveStatus(state, caster, u, { id: 'mod', key: ctx.skill?.id || 'mod', stat: e.stat, pct: e.pct, flat: e.flat, turns: e.turns });
      }
      break;
    }

    case 'expiation': {
      // « Expiation » (Prêtre, spé Discipline) : un statut posé sur un allié. Les passifs du Prêtre le soignent quand il frappe (cible d'effet `"to": "expiation"`).
      for (const u of units) {
        if (!u.alive) continue;
        giveStatus(state, caster, u, { id: 'expiation', key: `expiation:${caster.id}`, turns: e.turns });
        say(`   ${u.name} est sous l'Expiation de ${caster.name}.`, 'good');
      }
      break;
    }

    case 'mark': {
      // « Marque » (Assassin) : la cible subit +`pct` de dégâts du lanceur, et ses compétences gagnent des effets bonus contre elle (conditions `targetMarked`).
      // Le lanceur n'a qu'une marque à la fois (`max` : 1 par défaut) : en poser une nouvelle retire la plus ancienne. Elle dure jusqu'à la mort de la cible.
      const max = e.max ?? 1;
      for (const u of units) {
        if (!u.alive) continue;
        const had = u.statuses.some((st) => st.id === 'mark' && st.casterId === caster.id);
        if (!had) {
          const others = markedEnemies(state, caster).filter((m) => m !== u);
          for (const old of others.slice(0, Math.max(0, others.length - (max - 1)))) {
            old.statuses = old.statuses.filter((st) => !(st.id === 'mark' && st.casterId === caster.id));
            say(`   ${old.name} n'est plus marqué.`, 'info');
          }
        }
        caster.markSeq = (caster.markSeq || 0) + 1;
        const st = giveStatus(state, caster, u, { id: 'mark', key: caster.id, pct: e.pct ?? 0.2, turns: 99 });
        st.seq = caster.markSeq;
        say(`   ${u.name} est marqué : ${caster.name} lui inflige ${Math.round((e.pct ?? 0.2) * 100)} % de dégâts en plus.`, 'info');
      }
      break;
    }

    case 'taunt':
      for (const u of units) if (u.alive) giveStatus(state, caster, u, { id: 'taunt', turns: e.turns ?? 2 });
      break;

    case 'stun':
      for (const u of units) {
        if (!u.alive) continue;
        if (u.boss) say(`   ${u.name} résiste à l'étourdissement !`, 'info');
        else giveStatus(state, caster, u, { id: 'stun', turns: e.turns ?? 1 });
      }
      break;

    case 'guard':
      for (const u of units) if (u.alive) giveStatus(state, caster, u, { id: 'guard', reduction: e.reduction ?? 0.5, turns: 1, expires: 'turnStart' });
      break;

    case 'move':
      for (const u of units) {
        if (!u.alive) continue;
        u.row = e.row === 'toggle' ? otherRow(u.row) : e.row;
        emit(state, { type: 'move', target: u.id, row: u.row });
      }
      break;

    case 'resource':
      for (const u of units) if (u.alive) gainResource(state, u, e.id, e.amount);
      break;

    case 'mode': {
      // Change le MODE de classe (ex. réduction / dégâts du Sacrieur) : "toggle" passe au suivant dans l'ordre de la liste.
      for (const u of units) {
        const m = state.content.classes[u.classId]?.modes;
        if (!u.alive || !m) continue;
        const ids = Object.keys(m.list);
        const cur = u.mode ?? m.default;
        // « toggle » : le mode suivant de la liste ; « pick » : celui que le joueur a choisi (`modeId` de son action) ; sinon un mode précis.
        const want = e.set === 'pick' ? ctx.modeId : e.set;
        u.mode = e.set === 'toggle' ? ids[(ids.indexOf(cur) + 1) % ids.length] : ids.includes(want) ? want : cur;
        say(m.noun ? `   ${u.name} prend la ${m.list[u.mode].name}.` : `   ${u.name} passe en mode ${m.list[u.mode].name}.`, 'info'); // (« prend la Forme d'ours », « prend la Posture défensive »)
        if (u.mode !== cur) fireTriggers(state, 'modeChange', { unit: u }); // (ex. « quand il change de mode : un bonus de 2 tours »)
      }
      break;
    }

    case 'redirect': {
      // « Sacrifice » : jusqu'au début de son prochain tour (turns 1) ou plus longtemps (turns 2...), il encaisse les coups visant ses alliés.
      const turns = e.turns ?? 1;
      for (const u of units) if (u.alive) giveStatus(state, caster, u, { id: 'redirect', turns, expires: turns <= 1 ? 'turnStart' : undefined });
      break;
    }

    case 'pa': {
      // Gain INSTANTANÉ de PA : il ne vaut que pour le tour en cours (les PA sont recalculés au début du prochain).
      // Pour donner des PA aux tours suivants, utilise plutôt un effet "mod" sur la stat "pa".
      const cap = rules.combat.maxPa ?? 99;
      if (state.combat) for (const u of units) if (u.alive) u.pa = Math.min(cap, Math.max(0, (u.pa || 0) + e.amount));
      break;
    }

    case 'cleanse':
      for (const u of units) {
        if (!u.alive) continue;
        u.statuses = u.statuses.filter((s) => !(s.id === 'poison' || s.id === 'dot' || (s.id === 'mod' && ((s.pct || 0) < 0 || (s.flat || 0) < 0))));
        say(`   ${u.name} est purifié.`, 'good');
      }
      break;

    case 'resurrect': {
      const r = rules.resurrection.skill;
      for (const u of units) {
        if (!canBeRevived(u)) continue;
        reviveUnit(state, u, e.hpPct ?? r.hpPct, e.hpMaxPenalty ?? r.hpMaxPenalty);
        say(`${u.name} revient à la vie !`, 'good');
        if (isPlayer) {
          social(state, 'revive', caster.id, u.id, ctx.skill?.id || '');
          // Le soigneur paie aussi un petit coût (PV max perdus jusqu'à la fin de la run)
          const pen = e.casterHpMaxPenalty ?? r.casterHpMaxPenalty;
          caster.hpMaxPenalty = (caster.hpMaxPenalty || 0) + pen;
          clampHp(state, caster);
          caster.stats.revivesDone++;
          say(`${caster.name} s'épuise : -${Math.round(pen * 100)} % de PV max jusqu'à la fin de la run.`, 'bad');
        }
      }
      break;
    }

    case 'survive': // uniquement dans un déclencheur "wouldDie" : il reste `hp` PV (1 par défaut), ou `hpPct` de ses PV max
      ctx.surviveHp = e.hpPct !== undefined ? Math.max(1, Math.round(cs.hpMax * e.hpPct)) : e.hp ?? 1;
      say(`   ${caster.name} refuse de tomber !`, isPlayer ? 'good' : 'bad');
      break;

    case 'reanimate': {
      // Un monstre RELÈVE un monstre tombé (cible « deadAlly ») : il revient avec `hpPct` de ses PV, sans statut, et rejoue dès son prochain tour.
      // Chaque monstre ne se relève qu'une fois ; ses récompenses (or, XP) ne sont pas comptées deux fois.
      for (const u of units) {
        if (!canBeRaised(u)) continue;
        u.alive = true;
        u.raised = true;
        u.hp = Math.max(1, Math.round(u.hpMax * (e.hpPct ?? 0.5)));
        u.statuses = [];
        u.shields = [];
        u.plan = [];
        emit(state, { type: 'revive', target: u.id });
        say(`   ${u.name} se relève (${u.hp} PV) !`, 'bad');
      }
      break;
    }

    case 'summon': {
      // Un monstre APPELLE DES RENFORTS : `count` monstres `monster` rejoignent le combat (jamais plus de `max` renforts vivants à la fois).
      // Ils jouent à partir du prochain round, et ne rapportent ni or ni XP (on ne « farme » pas un boss qui invoque).
      if (!state.combat || caster.kind !== 'monster') break;
      const c2 = state.combat;
      const alive = c2.monsters.filter((m) => m.alive && m.summonedBy === caster.id).length;
      const n = Math.max(0, Math.min(e.count ?? 1, (e.max ?? 2) - alive));
      for (let i = 0; i < n; i++) {
        c2.summons = (c2.summons || 0) + 1;
        const m = makeMonster(state, e.monster, c2.monsters.length + 1, '');
        m.id = `s${c2.summons}`;
        m.summonedBy = caster.id;
        m.xp = 0;
        m.gold = [0, 0];
        c2.monsters.push(m);
        c2.timeline.push(m.id);
        emit(state, { type: 'summon', target: m.id, by: caster.id });
        say(`   ${m.name} accourt à l'appel de ${caster.name} !`, 'bad');
      }
      break;
    }

    case 'breakShield':
      // Brise TOUS les boucliers de la cible (les massues d'ogre) : à placer avant l'effet de dégâts.
      for (const u of units) {
        if (!u.alive || !u.shields.length) continue;
        const lost = u.shields.reduce((t, sh) => t + (sh.amount || 0), 0);
        u.shields = [];
        emit(state, { type: 'shieldBreak', target: u.id, amount: Math.round(lost) });
        say(`   Le bouclier de ${u.name} vole en éclats (${Math.round(lost)}) !`, 'bad');
      }
      break;

    default:
      throw new Error(`Effet de compétence inconnu : ${e.type}`);
  }
}

// ============================================================
//  Lancer une compétence
// ============================================================

/**
 * Lance une compétence : paie le coût, lance le dé, applique les effets.
 * Les vérifications (PA suffisants, cible valide...) ont déjà été faites par l'appelant. `opts.modeId` : le mode choisi par le joueur (sort « pick »).
 * Renvoie { outcome: 'hit' | 'crit' | 'fumble', endTurn }.
 */
export function castSkill(state, caster, sk, pickedId, opts = {}) {
  const inCombat = !!state.combat;
  const isPlayer = caster.kind === 'player';

  // 1) Paiement
  if (inCombat) caster.pa -= skillPaCost(caster, sk, state); // (0 pour la 1re utilisation d'une compétence `freeFirst`, ou sans marque pour `freeIfNoMark`)
  const spent = sk.spend ? sk.spend.amount : 0;
  if (sk.spend) caster.resources[sk.spend.id] = (caster.resources[sk.spend.id] || 0) - sk.spend.amount;
  if (sk.cooldown) caster.cooldowns[sk.id] = sk.cooldown;
  if (sk.oncePerDungeon) caster.usedOnce[sk.id] = true;
  if (sk.perCombat || sk.freeFirst) caster.combatUses[sk.id] = (caster.combatUses[sk.id] || 0) + 1;

  // 2) Cibles
  const targets = skillTargets(state, caster, sk, pickedId);

  // 3) Dé : échec critique <= fumble, critique >= crit, sinon coup normal
  const dice = resolveDice(state, caster, sk);
  let outcome = 'hit';
  let total = null;
  if (dice.has) {
    total = isPlayer ? playerRoll(state, caster, 'attack', { minor: true }).total : rollD20(state);
    if (dice.fumble > 0 && total <= dice.fumble) outcome = 'fumble';
    else if (total >= dice.crit) outcome = 'crit';
  }
  const on = targets.length === 1 && targets[0] !== caster ? ` sur ${targets[0].name}` : '';
  log(state, `${caster.name} utilise ${sk.name}${on}${total !== null ? ` (D20 : ${total})` : ''}.`, 'combat');
  emit(state, { type: 'skill', unitId: caster.id, skillId: sk.id, outcome, total, targets: targets.map((t) => t.id) });

  const ctx = { skill: sk, outcome, modeId: opts.modeId };

  // 4) Échec critique : la compétence ne fait rien (et peut avoir un prix)
  if (outcome === 'fumble') {
    log(state, `   Échec critique ! ${sk.name} échoue.`, 'bad');
    if (isPlayer) caster.stats.rollsKo++;
    for (const e of sk.fumbleEffects || []) applyEffect(state, caster, e, targets, ctx);
    fireTriggers(state, 'fumble', { unit: caster });
    return { outcome, endTurn: dice.onFumble === 'endTurn' };
  }

  // 5) Effets
  if (spent && inCombat) fireTriggers(state, 'spend', { unit: caster, amount: spent, skill: sk }); // (ex. Sainte colère : « après avoir dépensé de la puissance sacrée, +20 % de dégâts »)
  for (const e of sk.effects) applyEffect(state, caster, e, targets, ctx);
  if (outcome === 'crit') {
    log(state, '   Coup critique !', 'good');
    if (isPlayer) caster.stats.rollsOk++;
    for (const e of sk.critEffects || []) applyEffect(state, caster, e, targets, ctx);
    fireTriggers(state, 'crit', { unit: caster, target: targets[0] });
  }
  return { outcome, endTurn: false };
}
