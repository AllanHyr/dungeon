// ============================================================
//  units.js — Ce qui est commun aux joueurs ET aux monstres
// ============================================================
// Une "unité" est un joueur (kind:'player') ou un monstre (kind:'monster').
// Les deux ont des PV (`hp`), un état vivant/mort (`alive`), des BOUCLIERS (`shields`)
// et des statuts temporaires (`statuses`) : poison, étourdissement, provocation,
// soin sur la durée, bonus/malus... Tout ça ne dure QUE le temps de la run
// (jamais sauvegardé dans le personnage).
//
// Les boucliers sont une réserve à part : ils absorbent les dégâts AVANT les PV,
// mais ne comptent JAMAIS comme des PV (ex. : pour le "plus il est blessé, plus il
// frappe fort" du Berserker). 10 PV + 5 de bouclier = on encaisse 15 sans mourir,
// tout en restant "blessé".

import { log, emit, livingPlayers, getPlayer } from './util.js';
import { unitStats } from './stats.js';
import { unitById } from './geometry.js';
import { endRun } from './results.js';

// ============================================================
//  Statuts
// ============================================================

export function hasStatus(unit, id) {
  return unit.statuses.some((s) => s.id === id);
}

export function removeStatus(unit, id) {
  unit.statuses = unit.statuses.filter((s) => s.id !== id);
}

/**
 * Ajoute un statut. Si le même existe déjà (même id, même compétence, même stat),
 * on garde la durée la plus longue et on met à jour les valeurs (ça ne s'additionne pas) — sauf un statut `stack`, qui gagne un cumul.
 * `fresh: true` = posé pendant le tour de son porteur : il ne perd pas de durée à la fin de CE tour.
 */
export function addStatus(unit, status) {
  const same = unit.statuses.find(
    (s) =>
      s.id === status.id &&
      s.key === status.key &&
      s.stat === status.stat &&
      Math.sign(s.pct || 0) === Math.sign(status.pct || 0) &&
      Math.sign(s.flat || 0) === Math.sign(status.flat || 0)
  );
  if (same) {
    same.turns = Math.max(same.turns, status.turns);
    for (const k of ['pct', 'flat', 'amount', 'reduction']) if (status[k] !== undefined) same[k] = status[k];
    // Un statut CUMULABLE (`stack`, ex. le venin de l'Assassin) : chaque nouvelle pose ajoute un cumul (jusqu'à `maxStacks`) au lieu de remplacer.
    if (status.stack) same.stacks = Math.min(status.maxStacks ?? 5, (same.stacks || 1) + (status.stacks || 1));
    if (status.fresh) same.fresh = true;
    return same;
  }
  const copy = { ...status };
  if (status.stack) copy.stacks = Math.min(status.maxStacks ?? 5, status.stacks || 1);
  unit.statuses.push(copy);
  return copy;
}

/** Si l'unité est étourdie, "consomme" l'étourdissement et renvoie true (elle passe son tour). */
export function consumeStun(unit) {
  const st = unit.statuses.find((s) => s.id === 'stun');
  if (!st) return false;
  st.turns--;
  if (st.turns <= 0) removeStatus(unit, 'stun');
  return true;
}

/** À la fin d'un combat : tout disparaît sauf les poisons / saignements qui continuent. */
export function clearCombatStatuses(unit) {
  unit.statuses = unit.statuses.filter((s) => s.id === 'poison' || s.id === 'dot');
  unit.shields = [];
  unit.pa = 0;
}

// ============================================================
//  Boucliers
// ============================================================

export function totalShield(unit) {
  return (unit.shields || []).reduce((sum, s) => sum + s.amount, 0);
}

/** Ajoute un bouclier (limité à `shieldCapPct` des PV max). Renvoie le montant réellement ajouté. */
export function addShield(state, unit, amount, turns, source = null) {
  const cap = Math.round(unitStats(state, unit).hpMax * state.content.rules.combat.shieldCapPct);
  const add = Math.min(Math.round(amount), Math.max(0, cap - totalShield(unit)));
  if (add <= 0 || !unit.alive) return 0;
  unit.shields.push({ amount: add, turns, fresh: state.combat?.activeId === unit.id, sourceId: source?.id || null });
  emit(state, { type: 'shield', target: unit.id, amount: add });
  return add;
}

/** Les boucliers absorbent en premier (le plus ancien d'abord). Renvoie ce qui a été absorbé. */
function absorbShield(state, unit, dmg) {
  let left = dmg;
  for (const sh of unit.shields) {
    if (left <= 0) break;
    const take = Math.min(sh.amount, left);
    sh.amount -= take;
    left -= take;
    // Le joueur qui a posé le bouclier est crédité (ça compte comme du soin pour l'XP).
    const giver = sh.sourceId ? getPlayer(state, sh.sourceId) : null;
    if (giver && giver.id !== unit.id) giver.stats.healingDone += take;
  }
  unit.shields = unit.shields.filter((s) => s.amount > 0);
  return dmg - left;
}

// ============================================================
//  Dégâts et soins
// ============================================================

/**
 * Inflige des dégâts DÉJÀ calculés (après défense) à une unité.
 *  - La garde et le multiplicateur "dégâts reçus" réduisent les dégâts (sauf ignoreGuard).
 *  - Les boucliers absorbent d'abord.
 *  - `nonLethal` : laisse au moins 1 PV (poison, croche-pied...).
 *  - `describe(pvPerdus, absorbés)` écrit la ligne de journal AVANT l'annonce d'une éventuelle mort.
 *  - `onLethal(cible, dégâts)` peut renvoyer un nombre de PV avec lequel la cible SURVIT (ex. "Dernier souffle").
 * Renvoie les PV réellement perdus.
 */
export function applyDamage(state, target, amount, source = null, opts = {}) {
  if (!target.alive) return 0;
  let dmg = Math.max(0, Math.round(amount));
  if (!opts.ignoreGuard) {
    const guard = target.statuses.find((s) => s.id === 'guard');
    if (guard) dmg = Math.max(1, Math.round(dmg * (1 - (guard.reduction ?? 0.5))));
    const taken = unitStats(state, target).taken;
    if (taken !== 1) dmg = Math.max(1, Math.round(dmg * taken));
  }
  const absorbed = opts.ignoreShield ? 0 : absorbShield(state, target, dmg); // (un coût en PV qu'on s'inflige ne se paie pas avec son propre bouclier)
  dmg -= absorbed;

  if (opts.nonLethal || target.immortal) dmg = Math.min(dmg, target.hp - 1);
  if (dmg >= target.hp && opts.onLethal) {
    const surviveHp = opts.onLethal(target, dmg);
    if (surviveHp !== null && surviveHp !== undefined) dmg = Math.max(0, target.hp - Math.max(1, surviveHp));
  }
  dmg = Math.max(0, Math.min(dmg, target.hp));

  target.hp -= dmg;
  if (opts.out) opts.out.absorbed = absorbed;
  if (source && source.kind === 'player') source.stats.damageDealt += dmg + absorbed;
  if (target.kind === 'player') target.stats.damageTaken += dmg + absorbed;
  emit(state, { type: 'damage', target: target.id, amount: dmg, absorbed, source: opts.sourceId || source?.id || null });
  if (opts.describe) log(state, opts.describe(dmg, absorbed), opts.kind || 'combat');

  if (target.hp <= 0) onDeath(state, target);
  return dmg;
}

/** Soigne une unité (jamais au-delà de ses PV max). Renvoie les PV réellement rendus. */
export function healUnit(state, source, target, amount) {
  if (!target.alive) return 0;
  const ts = unitStats(state, target);
  const max = ts.hpMax;
  // Les soins REÇUS peuvent être réduits (stat `healTaken`, ex. la Frappe mortelle du Guerrier : « blessure profonde »).
  const real = Math.max(0, Math.min(Math.round(amount * ts.healTaken), max - target.hp));
  target.hp += real;
  if (source && source.kind === 'player') source.stats.healingDone += real;
  emit(state, { type: 'heal', target: target.id, amount: real });
  return real;
}

/** Limite les PV d'un joueur à son maximum actuel (après un malus de PV max, par exemple). */
export function clampHp(state, unit) {
  const max = unitStats(state, unit).hpMax;
  if (unit.hp > max) unit.hp = max;
}

function onDeath(state, unit) {
  unit.alive = false;
  unit.hp = 0;
  unit.shields = [];
  if (unit.kind === 'monster') {
    log(state, `${unit.name} est vaincu.`, 'good');
    emit(state, { type: 'death', target: unit.id });
    return;
  }
  // Un joueur qui meurt devient un FANTÔME : il reste dans la partie et peut encore aider.
  unit.ghost = true;
  unit.statuses = [];
  unit.cooldowns = {};
  unit.resources = {};
  unit.stats.deaths++;
  log(state, `${unit.name} tombe et devient un fantôme...`, 'bad');
  emit(state, { type: 'death', target: unit.id });
  checkDefeat(state);
}

/** Si tout le groupe est mort, la run est perdue. */
export function checkDefeat(state) {
  if (state.phase === 'ended') return true;
  if (livingPlayers(state).length === 0) {
    endRun(state, 'defeat');
    return true;
  }
  return false;
}

// ============================================================
//  Poison, saignements et soins sur la durée
// ============================================================

/**
 * Applique les effets "à chaque tour" d'une unité : poison, saignement, soin sur la durée.
 * Le poison ne tue jamais (il laisse 1 PV). Appelée au début du tour de l'unité en combat,
 * et à chaque tour d'exploration hors combat.
 */
export function tickStatusEffects(state, unit) {
  for (const st of [...unit.statuses]) {
    if (!unit.alive) return;
    const caster = st.casterId ? unitById(state, st.casterId) : null;
    const kind = dotKind(st);
    if (kind) emit(state, { type: 'tick', target: unit.id, dot: kind, name: st.name || null }); // (l'interface joue l'animation de CET effet)
    if (st.id === 'poison') {
      const dmg = Math.max(1, Math.round(st.pct * unitStats(state, unit).hpMax));
      applyDamage(state, unit, dmg, caster, { nonLethal: true, ignoreGuard: true, describe: (real) => `${unit.name} souffre du poison (-${real} PV).`, kind: 'bad' });
    } else if (st.id === 'dot') {
      const real = applyDamage(state, unit, Math.max(1, st.amount * (st.stacks || 1)), caster, {
        nonLethal: !!st.nonLethal, ignoreGuard: true,
        describe: (real) => `${unit.name} ${st.label || 'saigne'} (-${real} PV).`, kind: 'bad'
      });
      // `drain` (Toucher vampirique du Prêtre) : une part de ces dégâts soigne l'allié le plus blessé du lanceur.
      if (st.drain && caster?.alive && real > 0) drainHeal(state, caster, real * st.drain);
    } else if (st.id === 'hot') {
      const real = healUnit(state, caster, unit, st.amount);
      if (real > 0) log(state, `${unit.name} récupère ${real} PV (soin sur la durée).`, 'good');
    }
  }
}

/**
 * La NATURE d'un effet sur la durée, pour son animation : poison · venom (venin) · burn (brûlure) · bleed (saignement) · shadow (douleur)
 * · drain (toucher vampirique) · hot (soin sur la durée). Un effet peut l'imposer (champ `fx` d'un effet "dot" dans les JSON) ;
 * sinon on la déduit de son nom (« Brûlure », « Venin »...). null : pas un effet qui agit à chaque tour.
 */
export function dotKind(st) {
  if (!st) return null;
  if (st.id === 'poison') return 'poison';
  if (st.id === 'hot') return 'hot';
  if (st.id !== 'dot') return null;
  if (st.fx) return st.fx;
  const text = `${st.name || ''} ${st.label || ''} ${st.key || ''}`.toLowerCase();
  if (/br[uû]l|flamm|feu/.test(text)) return 'burn';
  if (/venin/.test(text)) return 'venom';
  if (/vid[eé]|vampir|drain/.test(text)) return 'drain';
  if (/douleur|souffre/.test(text)) return 'shadow';
  return 'bleed';
}

/** Soigne l'allié le plus blessé (en proportion) de `caster`, lui compris. */
function drainHeal(state, caster, amount) {
  const side = caster.kind === 'player' ? state.players : state.combat?.monsters || [];
  let best = null;
  for (const u of side) if (u.alive && (!best || u.hp / unitStats(state, u).hpMax < best.hp / unitStats(state, best).hpMax)) best = u;
  if (!best) return;
  const got = healUnit(state, caster, best, amount);
  if (got > 0) log(state, `   ${best.name} récupère ${got} PV (drain de ${caster.name}).`, 'good');
}

/** Hors combat : un tour d'exploration = un tick de poison / saignement, puis la durée baisse. */
export function tickPoison(state, unit) {
  if (!unit.alive) return;
  tickStatusEffects(state, unit);
  for (const st of unit.statuses) if (st.id === 'poison' || st.id === 'dot') st.turns--;
  const before = unit.statuses.length;
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
  if (unit.statuses.length < before && !hasStatus(unit, 'poison')) log(state, `Le poison de ${unit.name} se dissipe.`, 'info');
}

/**
 * Fin du tour d'une unité en combat : les durées baissent d'un cran.
 * Un statut posé PENDANT son propre tour (`fresh`) ne perd rien à la fin de ce tour-là.
 * Le bouclier suit la même règle.
 */
export function decayStatuses(state, unit) {
  const keep = [];
  for (const st of unit.statuses) {
    if (st.id === 'stun') { keep.push(st); continue; } // consommé quand l'unité passe son tour
    if (st.id === 'mark') { keep.push(st); continue; } // la marque dure jusqu'à la mort de la cible, la fin du combat, ou une nouvelle marque
    if (st.fresh) { st.fresh = false; keep.push(st); continue; }
    st.turns--;
    if (st.turns > 0) keep.push(st);
    else if (st.id === 'poison' && unit.alive) log(state, `Le poison de ${unit.name} se dissipe.`, 'info');
  }
  unit.statuses = keep;
  unit.shields = unit.shields.filter((s) => {
    if (s.fresh) { s.fresh = false; return true; }
    s.turns--;
    return s.turns > 0;
  });
}

// ============================================================
//  Résurrection
// ============================================================

/**
 * Ramène un fantôme à la vie. Le ressuscité revient avec peu de PV et un petit
 * malus de PV max (hpMaxPenalty). Ces pertes disparaissent à la fin de la run.
 * Une seule résurrection par joueur et par run.
 */
export function reviveUnit(state, target, hpPct, hpMaxPenalty) {
  target.alive = true;
  target.ghost = false;
  target.resurrected = true;
  target.statuses = [];
  target.shields = [];
  target.hpMaxPenalty = (target.hpMaxPenalty || 0) + hpMaxPenalty;
  const max = unitStats(state, target).hpMax;
  target.hp = Math.max(1, Math.min(max, Math.round(max * hpPct)));
  target.stats.revived++;
  // En plein combat, il rejoint la frise (il jouera à la fin du round en cours).
  if (state.combat && !state.combat.timeline.includes(target.id)) state.combat.timeline.push(target.id);
  emit(state, { type: 'revive', target: target.id });
}

/** Un MONSTRE tombé peut-il être relevé par un réanimateur ? (une seule fois par monstre, jamais un boss ni un mannequin) */
export function canBeRaised(monster) {
  return monster.kind === 'monster' && !monster.alive && !monster.raised && !monster.boss && !monster.training;
}

/** Un fantôme peut-il être ressuscité ? */
export function canBeRevived(player) {
  return !player.alive && !player.resurrected;
}
