// ============================================================
//  format.js — Textes et petites conversions pour l'affichage
// ============================================================

import { h } from './dom.js';
import { icon } from './icons.js';
import { itemIconName } from './pixel-icons.js';
import { rarityOf, describeStats, itemSummary } from '../core/index.js';
import { statLabel, statusInfo, turnsText } from './status.js';

export { statLabel };

/**
 * Une pastille d'effet : icône, résumé court et, si l'effet est limité dans le temps, le nombre de tours restants dans une petite pastille ronde.
 * Verte = un bonus, rouge = un malus, bleue = autre chose (un mode, par exemple). Le survol (ou le focus) explique l'effet en une phrase.
 */
export function effectChip(info, { compact = false } = {}) {
  const when = info.turns ? ` (${turnsText(info.turns)} restant${info.turns > 1 ? 's' : ''})` : '';
  return h('span', {
    class: `fx-chip is-${info.tone} ${compact ? 'compact' : ''}`, tabindex: '0', dataset: { effect: info.id, tone: info.tone },
    title: `${info.name}${when}${info.desc ? ` : ${info.desc}` : ''}`, 'aria-label': `${info.tone === 'debuff' ? 'Malus' : info.tone === 'buff' ? 'Bonus' : 'Effet'} : ${info.name}${when}`
  },
    icon(info.icon, 13),
    h('span', { class: 'fx-txt' }, info.short),
    info.turns ? h('span', { class: 'fx-turns', title: turnsText(info.turns) }, info.turns) : null);
}

/** Pastille d'un statut du moteur (poison, étourdi, soin sur la durée...). */
export function statusChip(st) {
  return effectChip(statusInfo(st));
}

/**
 * Quelle icône pour cette compétence ? Le champ "icon" de la compétence (dans le JSON) l'emporte ;
 * sinon on la déduit de ce qu'elle fait : l'attaque de base prend l'icône de la classe, un soin une croix...
 */
export function skillIconName(content, sk) {
  if (sk.icon) return sk.icon;
  const cls = sk.classId ? content.classes[sk.classId] : null;
  if (cls && cls.basicAttack === sk.id) return cls.icon;
  if (sk.type === 'passive') {
    // Un passif sans icône écrite : on la déduit de la première stat qu'il change.
    const stat = (sk.modifiers || [])[0]?.stat;
    return { def: 'armor', taken: 'shield', atk: 'sword', damage: 'sword', heal: 'cross', healPower: 'cross', hp: 'heart', ini: 'bolt', pa: 'flame', luck: 'star', critShift: 'target', fumbleShift: 'target' }[stat] || 'star';
  }
  const fx = (sk.effects || []).map((e) => e.type);
  const has = (t) => fx.includes(t);
  if (has('resurrect')) return 'ghost';
  if (has('stun')) return 'bolt';
  if (has('taunt')) return 'target';
  if (has('damage')) {
    if (has('heal')) return 'cross';
    if (sk.target === 'enemies') return 'refresh'; // attaque de zone
    if (has('poison') || has('dot')) return 'poison';
    if (sk.dice && sk.dice.fumble >= 8) return 'bolt'; // un gros pari
    return 'sword';
  }
  if (has('hot')) return 'leaf';
  if (has('heal') || has('cleanse')) return 'cross';
  if (has('shield') || has('guard')) return 'shield';
  if (has('move')) return 'swap';
  if (has('pa') || has('resource')) return 'up';
  if (has('mod')) {
    const e = sk.effects.find((x) => x.type === 'mod');
    const delta = e.pct ?? e.flat ?? 0;
    const lowerIsBetter = ['taken', 'critShift', 'fumbleShift'].includes(e.stat);
    return (lowerIsBetter ? delta > 0 : delta < 0) ? 'down' : 'up';
  }
  return 'star';
}

/**
 * La « famille » d'une compétence, qui donne sa teinte à sa case dans la barre :
 * attack (rouge braise) · heal (turquoise) · defense (bleu acier) · buff (violet).
 */
export function skillKind(sk) {
  if (sk.type === 'passive') {
    const stat = (sk.modifiers || [])[0]?.stat;
    if (['def', 'taken', 'hp'].includes(stat)) return 'defense';
    if (['atk', 'damage', 'critShift', 'fumbleShift'].includes(stat)) return 'attack';
    if (['heal', 'healPower'].includes(stat)) return 'heal';
    // Sans modificateur : on regarde ce que son déclencheur fait.
    const fx = (sk.triggers || []).flatMap((t) => (t.effects || [t.effect]).filter(Boolean)).map((e) => e.type);
    if (fx.includes('heal') || fx.includes('shield')) return 'heal';
    if (fx.includes('damage')) return 'attack';
    return 'buff';
  }
  const fx = (sk.effects || []).map((e) => e.type);
  const has = (t) => fx.includes(t);
  if (has('damage') || has('stun') || has('poison') || has('dot')) return 'attack';
  if (has('heal') || has('hot') || has('cleanse') || has('resurrect') || has('expiation')) return 'heal';
  if (has('shield') || has('guard') || has('taunt') || has('move')) return 'defense';
  if (has('mod') || has('pa') || has('resource')) return 'buff';
  return 'attack';
}

/** Une toute petite barre de risque (rouge = échec critique, doré = critique) pour la barre de compétences. */
export function riskBar(dice) {
  if (!dice) return null;
  const fumble = dice.fumble > 0 ? (dice.fumble / 20) * 100 : 0;
  const crit = dice.crit <= 20 ? ((21 - dice.crit) / 20) * 100 : 0;
  return h('span', { class: 'slot-risk', 'aria-hidden': 'true', style: { '--f': `${fumble}%`, '--c': `${crit}%` } });
}

/** Le nom d'une ressource de classe (« Puissance sacrée », « Élan ») à partir de son identifiant ; sans le contenu du jeu, l'identifiant tel quel. */
export function resourceName(content, sk, id) {
  const res = content?.classes?.[sk?.classId]?.resource;
  return res && res.id === id ? res.name : id;
}

/** Résumé très court de ce que fait une compétence active (affiché sur son bouton). `content` (facultatif) : pour nommer la ressource de classe. */
export function skillBlurb(sk, content = null) {
  if (!sk.effects) return sk.desc || '';
  const parts = [];
  for (const e of sk.effects) {
    if (e.if || e.ifTarget) continue; // effet qui dépend d'une condition (un mode, une cible marquée...) : il est expliqué dans la description
    const self = e.to === 'self' ? ' (soi)' : '';
    switch (e.type) {
      case 'damage': parts.push(e.pctMaxHp !== undefined ? `-${Math.round(e.pctMaxHp * 100)} % PV max${self}` : `dégâts ×${e.power}${self}`); break;
      case 'heal': parts.push(e.pctMaxHp !== undefined ? `soin ${Math.round(e.pctMaxHp * 100)} % PV` : e.pctOfDamage !== undefined ? 'soin' : `soin ×${e.power}`); break;
      case 'shield': parts.push(e.pctMaxHp !== undefined ? `bouclier ${Math.round(e.pctMaxHp * 100)} %` : `bouclier ×${e.power}`); break;
      case 'hot': parts.push(`soin sur ${e.turns} tours`); break;
      case 'dot': parts.push(`${(e.name || 'saignement').toLowerCase()} ${e.turns} t.`); break;
      case 'poison': parts.push(`poison ${e.turns} t.`); break;
      case 'taunt': parts.push('provoque'); break;
      case 'stun': parts.push('étourdit'); break;
      case 'guard': parts.push('garde'); break;
      case 'cleanse': parts.push('purifie'); break;
      case 'resurrect': parts.push('ressuscite'); break;
      case 'move': parts.push('change de rang'); break;
      case 'resource': parts.push(`${e.amount > 0 ? '+' : ''}${e.amount} ${resourceName(content, sk, e.id).toLowerCase()}`); break;
      case 'mark': parts.push('marque la cible'); break;
      case 'expiation': parts.push(`expiation ${e.turns} t.`); break;
      case 'mode': parts.push(e.set === 'pick' ? 'choix du mode' : 'change de mode'); break;
      case 'redirect': parts.push('encaisse pour ses alliés'); break;
      case 'pa': parts.push(`+${e.amount} PA`); break;
      case 'mod': parts.push(`${statLabel(e.stat)} ${e.pct !== undefined ? `${e.pct > 0 ? '+' : ''}${Math.round(e.pct * 100)} %` : `${e.flat > 0 ? '+' : ''}${e.flat}`}${self}`); break;
      default:
    }
  }
  const target = { enemy: 'un ennemi', enemies: 'tous les ennemis', ally: 'un allié', allies: "toute l'équipe", self: 'soi', deadAlly: 'un fantôme', lowestAlly: "l'allié le plus blessé" }[sk.target] || '';
  return `${[...new Set(parts)].join(', ')} · ${target}`;
}

/** Le profil de dé d'une compétence tel qu'écrit dans les données (sans les bonus d'un personnage). */
export function rawDice(content, sk) {
  if (sk.type !== 'active' || sk.dice === false) return null;
  const hasDamage = (sk.effects || []).some((e) => e.type === 'damage' && e.to !== 'self');
  if (!sk.dice && !hasDamage) return null;
  const r = content.rules.dice;
  return { fumble: sk.dice?.fumble ?? r.defaultFumble, crit: sk.dice?.crit ?? r.defaultCrit, onFumble: sk.dice?.onFumble ?? 'miss' };
}

/**
 * La "bande de dé" : 20 petites cases (1 à 20). Rouge = échec critique, doré = critique.
 * Elle montre d'un coup d'œil le RISQUE et la RÉCOMPENSE d'une compétence.
 */
export function diceStrip(dice, className = '') {
  if (!dice) return null;
  const cells = [];
  for (let i = 1; i <= 20; i++) cells.push(h('i', { class: dice.fumble > 0 && i <= dice.fumble ? 'f' : i >= dice.crit ? 'c' : 'n' }));
  const fumbleTxt = dice.fumble > 0 ? `échec ≤ ${dice.fumble}${dice.onFumble === 'endTurn' ? ' (perd le tour)' : ''}` : "jamais d'échec";
  const critTxt = dice.crit <= 20 ? `critique ≥ ${dice.crit}` : 'pas de critique';
  return h('span', { class: `dice-strip ${className}`, title: `${fumbleTxt} · ${critTxt}` }, h('span', { class: 'cells' }, cells), h('small', null, `${fumbleTxt} · ${critTxt}`));
}

/** Couleur d'une rareté. */
export function rarityColor(content, def) {
  return rarityOf(content, def).color;
}

/** Nom d'une rareté. */
export function rarityName(content, def) {
  return rarityOf(content, def).name;
}

/** Le type d'un objet en toutes lettres : « Torse », « Anneau », « Arme à deux mains »... */
export function typeLabel(content, def) {
  if (def.slot === 'weapon') return def.twoHanded ? 'Arme à deux mains' : 'Arme à une main';
  return content.typeNames[def.slot]?.name || def.slot;
}

const STAT_ORDER = ['hp', 'atk', 'def', 'heal', 'ini', 'pa', 'save', 'luck'];

/** Les stats d'un objet, dans un ordre fixe : [{ stat, label, value }]. */
export function statEntries(content, def) {
  const stats = def.stats || {};
  return STAT_ORDER.filter((k) => stats[k]).map((k) => ({ stat: k, label: content.statNames[k] || k, value: stats[k] }));
}

/**
 * Ce que change un objet par rapport à ce qu'il remplace (`oldDefs` : un objet, plusieurs — une arme à deux mains peut en chasser deux —, ou rien).
 * Renvoie { deltas: [{ stat, label, delta }], verdict } ; verdict = 'better' (rien ne baisse), 'worse' (rien ne monte),
 * 'mixed' (on gagne et on perd) ou 'same'. Les effets spéciaux (ligne « effect ») ne sont pas comptés dans les chiffres.
 */
export function compareItems(content, newDef, oldDefs) {
  const olds = Array.isArray(oldDefs) ? oldDefs : oldDefs ? [oldDefs] : [];
  const a = newDef.stats || {};
  const sum = (k) => olds.reduce((t, d) => t + ((d.stats || {})[k] || 0), 0);
  const deltas = STAT_ORDER
    .map((k) => ({ stat: k, label: content.statNames[k] || k, delta: Math.round(((a[k] || 0) - sum(k)) * 10) / 10 }))
    .filter((d) => d.delta !== 0);
  const up = deltas.some((d) => d.delta > 0);
  const down = deltas.some((d) => d.delta < 0);
  return { deltas, verdict: up && down ? 'mixed' : up ? 'better' : down ? 'worse' : 'same' };
}

/**
 * Fiche compacte d'un objet. `realLevel` (facultatif) sert à signaler un niveau insuffisant.
 * La RARETÉ se voit d'un coup d'œil : bordure, nom et pastille à la couleur de la rareté
 * (définie dans data/items.json), un halo pour les épiques et un reflet pour les légendaires.
 */
/** La ligne « Panoplie » d'un objet exclusif à un donjon : son nom et, hors format compact, ce que donnent 2, 3... pièces. */
function setLine(content, def, compact) {
  const d = content.dungeons?.[content.itemDungeon?.[def.id]];
  if (!d?.setBonus) return null;
  const all = d.setBonus.map((b) => `${b.pieces} pièces : ${b.desc}`).join(' ');
  return h('div', { class: 'item-set', title: `${d.setName} (${d.name}) — ${all}` }, icon('ring', 12), h('span', null, h('b', null, d.setName), compact ? null : ` — ${all}`));
}

export function itemCard(content, inst, opts = {}) {
  const def = content.items[inst.id];
  const rarity = rarityOf(content, def);
  const lvlTooLow = opts.realLevel !== undefined && def.slot !== 'consumable' && opts.realLevel < def.level;
  const inactive = opts.inactive;
  return h(
    'div',
    { class: `item-card r-${rarity.id} ${opts.compact ? 'compact' : ''} ${inactive ? 'is-inactive' : ''}`, style: { '--rar': rarity.color }, title: def.desc || '' },
    h('div', { class: 'item-icon' }, icon(itemIconName(def), opts.compact ? 20 : 24)),
    h('div', { class: 'item-main' },
      h('div', { class: 'item-head' },
        h('span', { class: 'item-name' }, def.name),
        h('span', { class: 'rarity-pill' }, rarity.name)),
      h('div', { class: 'item-meta' },
        typeLabel(content, def),
        ' · ',
        h('span', { class: lvlTooLow ? 'lvl-bad' : '' }, `Niv. ${def.level}`)),
      h('div', { class: 'item-stats' }, itemSummary(content, def)),
      def.effect ? h('div', { class: 'item-effect' }, icon('star', 12), def.effect) : null,
      setLine(content, def, opts.compact),
      inactive ? h('div', { class: 'item-warn' }, inactive) : null,
      !opts.compact && def.desc ? h('div', { class: 'item-desc' }, def.desc) : null)
  );
}

/** Barre de PV. Le bouclier (en bleu) s'ajoute à droite des PV : il n'est PAS de la vie. */
export function hpBar(cur, max, cls = '', shield = 0, { text = true } = {}) {
  const total = Math.max(max, cur + shield) || 1;
  const hpPct = Math.max(0, Math.min(100, (cur / total) * 100));
  const shPct = Math.max(0, Math.min(100 - hpPct, (shield / total) * 100));
  const ratio = max > 0 ? cur / max : 0;
  return h('div', { class: `hpbar ${cls}`, title: `${cur} / ${max} PV${shield ? ` + ${shield} de bouclier` : ''}` },
    h('div', { class: `hpfill ${ratio < 0.3 ? 'low' : ratio < 0.6 ? 'mid' : ''}`, style: { width: hpPct + '%' } }),
    shield ? h('div', { class: 'shfill', style: { left: hpPct + '%', width: shPct + '%' } }) : null,
    text ? h('span', { class: 'hptext' }, shield ? `${cur} +${shield} / ${max}` : `${cur} / ${max}`) : null);
}

/** Texte "Niv X" ou "Niv X (effectif Y)". */
export function levelText(p) {
  return p.effLevel !== p.realLevel ? `Niv. ${p.realLevel} (effectif ${p.effLevel})` : `Niv. ${p.realLevel}`;
}

export const tone = (t) => ({ good: 'tone-good', bad: 'tone-bad', neutral: 'tone-neutral' }[t] || 'tone-neutral');

export { describeStats };
