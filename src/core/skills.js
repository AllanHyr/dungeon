// ============================================================
//  skills.js — Quelles compétences une unité peut utiliser, et sur qui ?
// ============================================================
// Ce fichier répond aux questions : "cette compétence est-elle utilisable maintenant ?"
// (PA, délai, rang, ressource...), "sur quelles cibles ?", et "quel est son profil de dé ?".
// Le lancement lui-même (les effets) est dans effects.js.

import { unitStats, skillAvailable } from './stats.js';
import { reachableEnemies, alliesOf, markedEnemies } from './geometry.js';
import { canBeRevived, canBeRaised } from './units.js';

export const skillOf = (state, id) => state.content.skills[id] || null;

/** Faut-il que le joueur choisisse une cible précise ? */
export const needsPick = (sk) => ['enemy', 'ally', 'deadAlly'].includes(sk.target);

/** Faut-il que le joueur choisisse un MODE (une aura...) ? Vrai pour un sort dont l'effet est { "type": "mode", "set": "pick" } : l'action porte alors `modeId`. */
export const needsModePick = (sk) => (sk.effects || []).some((e) => e.type === 'mode' && e.set === 'pick');

/** Les modes qu'un joueur peut choisir : [{ id, name, icon, desc, current }] (le mode actuel est signalé, il n'est pas rechoisissable). */
export function modeOptions(state, unit) {
  const modes = state.content.classes[unit.classId]?.modes;
  if (!modes) return [];
  const cur = unit.mode ?? modes.default;
  return Object.entries(modes.list).map(([id, m]) => ({ id, name: m.name, icon: m.icon || 'star', desc: m.desc || '', current: id === cur }));
}

/**
 * Les compétences actives d'un joueur, dans l'ordre de la barre de combat :
 *   1. le CORPS À CORPS BASIQUE (le même pour toutes les classes : `slot: "basic"` dans skills.json), seul de son côté ;
 *   2. le SORT DE CLASSE (`classSkill` de la classe : posture, forme...), seul lui aussi ;
 *   3. le DECK : les sorts équipés, `deckSize` au plus.
 * Rien d'autre n'est proposé. Une compétence de base qu'une spécialisation fait évoluer (champ `replaces`) est remplacée par sa version évoluée.
 * `unit.deck` absent (anciennes parties, Atelier de classes) : tous les sorts connus sont proposés à la place du deck.
 */
export function activeSkillIds(state, unit) {
  const c = state.content;
  if (unit.kind === 'monster') return unit.skillIds;
  const cls = c.classes[unit.classId];
  const evolved = (id) => (c.replacedBy[id] || []).find((v) => skillAvailable(c.skills[v], unit) && (!c.skills[v].talent || unit.skills.includes(v))) || id; // (une évolution par talent : seulement si le talent est pris)
  const known = unit.skills.filter((id) => c.skills[id]?.type === 'active' && !c.skills[id].replaces);
  const classSkill = cls.classSkill && known.includes(cls.classSkill) ? [cls.classSkill] : [];
  const learned = known.filter((id) => id !== cls.classSkill);
  const chosen = (unit.deck ? unit.deck.filter((id) => learned.includes(id)) : learned).filter((id) => !c.skills[id].spec || c.skills[id].spec === unit.spec);
  return [c.basicSkillId, ...classSkill.map(evolved), ...chosen.map(evolved)];
}

/** Dans quel bloc de la barre de combat cette compétence s'affiche : 'basic' (corps à corps), 'class' (sort de classe) ou 'deck'. */
export function skillGroup(content, unit, skillId) {
  if (skillId === content.basicSkillId) return 'basic';
  const cs = content.classes[unit.classId]?.classSkill;
  if (cs && (skillId === cs || content.skills[skillId]?.replaces === cs)) return 'class';
  return 'deck';
}

/**
 * Le coût EN PA d'une compétence pour cette unité, maintenant :
 *   - 0 pour la première utilisation du combat d'une compétence `freeFirst` (ex. le Pacte de sang) ;
 *   - 0 tant que l'unité n'a AUCUNE cible marquée, pour une compétence `freeIfNoMark` (la Marque de l'Assassin : gratuite pour désigner une proie,
 *     1 PA pour en changer). Il faut alors passer `state` (sans lui, on ne sait pas qui est marqué : le coût plein est renvoyé).
 */
export function skillPaCost(unit, sk, state = null) {
  if (sk.freeFirst && !(unit.combatUses?.[sk.id] > 0)) return 0;
  if (sk.freeIfNoMark && state?.combat && !markedEnemies(state, unit).length) return 0;
  return sk.pa;
}

/** Une compétence peut-elle se lancer HORS combat ? (soins et résurrection seulement) */
export function skillWorksOutside(sk) {
  if (!['ally', 'allies', 'self', 'deadAlly'].includes(sk.target)) return false;
  return sk.effects.every((e) => ['heal', 'resurrect'].includes(e.type));
}

/** L'allié (vivant) qui a le moins de PV en proportion. */
export function lowestAlly(state, unit) {
  let best = null;
  let bestRatio = Infinity;
  for (const a of alliesOf(state, unit)) {
    const ratio = a.hp / unitStats(state, a).hpMax;
    if (ratio < bestRatio) {
      best = a;
      bestRatio = ratio;
    }
  }
  return best;
}

/** Les identifiants des cibles possibles d'une compétence. */
export function validTargets(state, unit, sk) {
  switch (sk.target) {
    case 'enemy':
    case 'enemies':
      return reachableEnemies(state, unit, sk).map((u) => u.id);
    case 'ally':
    case 'allies':
      return alliesOf(state, unit).map((u) => u.id);
    case 'self':
      return [unit.id];
    case 'deadAlly':
      // un héros ressuscite un fantôme ; un monstre réanimateur relève un monstre tombé (une seule fois chacun)
      return unit.kind === 'player' ? state.players.filter(canBeRevived).map((p) => p.id) : (state.combat?.monsters || []).filter(canBeRaised).map((m) => m.id);
    case 'lowestAlly': {
      const l = lowestAlly(state, unit);
      return l ? [l.id] : [];
    }
    default:
      return [];
  }
}

/** Le nom de la ressource d'une classe (pour les messages). */
function resourceName(state, unit, id) {
  return state.content.classes[unit.classId]?.resource?.name || id;
}

/** Une compétence est-elle utilisable maintenant par cette unité ? Renvoie { ok, reason }. */
export function checkUsable(state, unit, sk, { inCombat = !!state.combat } = {}) {
  const no = (reason) => ({ ok: false, reason });
  if (sk.type !== 'active') return no('Compétence passive.');
  if (unit.kind === 'player' && sk.classId && !skillAvailable(sk, unit)) return no(sk.spec && sk.spec !== unit.spec ? 'Réservée à une autre spécialisation.' : `Niveau ${sk.level} requis (niveau effectif ${unit.effLevel}).`);
  const cd = unit.cooldowns?.[sk.id] || 0;
  if (cd > 0) return no(`Prête dans ${cd} tour${cd > 1 ? 's' : ''}.`);
  if (sk.oncePerDungeon && unit.usedOnce?.[sk.id]) return no('Déjà utilisée dans ce donjon.');
  if (sk.perCombat && (unit.combatUses?.[sk.id] || 0) >= sk.perCombat) return no('Déjà utilisée ce combat.');
  if (inCombat) {
    const cost = skillPaCost(unit, sk, state);
    if (unit.pa < cost) return no(`${cost} PA requis.`);
    if (sk.from && !sk.from.includes(unit.row)) return no(`À lancer depuis le rang ${sk.from.map((r) => (r === 'front' ? 'avant' : 'arrière')).join(' ou ')}.`);
  } else if (!skillWorksOutside(sk)) {
    return no('Utilisable seulement en combat.');
  }
  if (sk.needsMark && inCombat && !markedEnemies(state, unit).length) return no('Aucune cible marquée.');
  // `modes` : la compétence ne se lance que dans ces modes de classe (les formes du Druide). Hors combat, pas de forme : elle est libre.
  if (sk.modes && inCombat && unit.kind === 'player' && !sk.modes.includes(unit.mode)) {
    const list = state.content.classes[unit.classId]?.modes?.list || {};
    return no(`${sk.modes.map((m) => list[m]?.name || m).join(' ou ')} requise.`);
  }
  if (sk.spend && (unit.resources?.[sk.spend.id] ?? 0) < sk.spend.amount) return no(`${sk.spend.amount} ${resourceName(state, unit, sk.spend.id)} requis.`);
  if (!validTargets(state, unit, sk).length) return no(sk.target === 'deadAlly' ? 'Personne à ressusciter.' : 'Aucune cible à portée.');
  return { ok: true };
}

/**
 * Le profil de dé d'une compétence pour CETTE unité (les objets et passifs peuvent décaler
 * les seuils). Renvoie { has, fumble, crit, onFumble }.
 *   - jet <= fumble  -> échec critique (fumble = 0 : jamais d'échec)
 *   - jet >= crit    -> coup critique
 */
export function resolveDice(state, unit, sk) {
  const rules = state.content.rules.dice;
  if (sk.dice === false) return { has: false };
  const hasDamage = sk.effects.some((e) => e.type === 'damage' && e.to !== 'self');
  if (!sk.dice && !hasDamage) return { has: false };
  const stats = unitStats(state, unit);
  let fumble = sk.dice?.fumble ?? rules.defaultFumble;
  if (fumble > 0) fumble = Math.max(0, fumble + stats.fumbleShift);
  const crit = (sk.dice?.crit ?? rules.defaultCrit) + stats.critShift;
  return { has: true, fumble, crit, onFumble: sk.dice?.onFumble ?? 'miss' };
}
