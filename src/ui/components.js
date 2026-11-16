// ============================================================
//  components.js — Morceaux d'interface réutilisables
// ============================================================

import { h } from './dom.js';
import { icon } from './icons.js';
import { app } from './state.js';
import { xpForNext, computeStats, rarityOf } from '../core/index.js';
import { EQUIP_SLOTS } from '../core/content.js';
import { heroSvg, monsterSvg } from './art.js';

/** Les icônes des monstres selon leur apparence (champ "kind" de monsters.json). */
export const LOOK_ICON = { undead: 'skull', beast: 'beast', humanoid: 'humanoid', slime: 'slime', demon: 'demon', boss: 'boss' };

/**
 * Médaillon rond avec l'icône de la classe. `size` : un nombre de pixels, ou 'fluid' pour que le CSS
 * décide de la taille (variable --medal, qui s'adapte à la hauteur de l'écran).
 */
export function portrait(classId, size = 40, extra = '') {
  const cls = app.content.classes[classId];
  const fluid = size === 'fluid';
  const art = artFor(cls.art, () => heroSvg(classId));
  return h('div', { class: `portrait role-${cls.role} ${art ? 'has-art' : ''} ${fluid ? 'fluid' : ''} ${extra}`.trim(), style: fluid ? null : { width: size + 'px', height: size + 'px' } },
    art || icon(cls.icon, fluid ? 'fluid' : Math.round(size * 0.58)));
}

/**
 * L'illustration d'un médaillon : une vraie image si le JSON en donne une (champ `art` : "img/mon-dessin.png"), sinon le dessin SVG du jeu
 * (aucun fichier à charger), sinon rien — et le médaillon garde son icône.
 */
function artFor(override, draw) {
  if (typeof override === 'string' && override) return h('img', { class: 'art-img', src: override, alt: '', draggable: 'false', loading: 'lazy' });
  const svg = draw();
  return svg ? h('span', { class: 'art', html: svg }) : null;
}

/** Médaillon d'un monstre (bord rouge braise). */
export function monsterPortrait(look, size = 40, boss = false, defId = null) {
  const fluid = size === 'fluid';
  const art = defId ? artFor(app.content?.monsters?.[defId]?.art, () => monsterSvg(defId)) : null;
  return h('div', { class: `portrait is-monster ${boss ? 'is-boss' : ''} ${art ? 'has-art' : ''} ${fluid ? 'fluid' : ''}`.trim(), style: fluid ? null : { width: size + 'px', height: size + 'px' } },
    art || icon(LOOK_ICON[look] || 'skull', fluid ? 'fluid' : Math.round(size * 0.58)));
}

/** Les points d'action en flammes : allumées = il en reste, éteintes = déjà dépensées. */
export function paFlames(cur, max, size = 28) {
  const total = Math.max(cur, max);
  return h('div', { class: 'flames', role: 'img', 'aria-label': `${cur} points d'action sur ${max}` },
    Array.from({ length: total }, (_, i) => h('span', { class: `flame ${i < cur ? 'on' : 'off'} ${i >= max ? 'bonus' : ''}` }, icon('flame', size))));
}

/** Barre d'expérience d'un personnage sauvegardé. */
export function xpBar(ch) {
  const need = xpForNext(app.content, ch.level);
  const pct = need ? Math.min(100, (ch.xp / need) * 100) : 100;
  return h('div', { class: 'xpbar', title: need ? `${ch.xp} / ${need} XP` : 'Niveau maximum' },
    h('div', { class: 'xpfill', style: { width: pct + '%' } }),
    h('span', { class: 'xptext' }, need ? `${ch.xp} / ${need} XP` : 'Niveau max'));
}

/**
 * Une petite rangée de cases : une par emplacement d'équipement (14). Vide = pointillé, porté = couleur de la rareté.
 * On voit d'un coup d'œil s'il manque quelque chose (le détail est dans la bulle au survol).
 */
export function equipStrip(ch) {
  const c = app.content;
  const worn = EQUIP_SLOTS.filter((slot) => ch.equipment?.[slot]).length;
  return h('div', { class: 'equip-strip', role: 'img', 'aria-label': `${worn} emplacements équipés sur ${EQUIP_SLOTS.length}`, title: `${worn} emplacement${worn > 1 ? 's' : ''} équipé${worn > 1 ? 's' : ''} sur ${EQUIP_SLOTS.length}` },
    EQUIP_SLOTS.map((slot) => {
      const inst = ch.equipment?.[slot];
      const def = inst ? c.items[inst.id] : null;
      const rarity = def ? rarityOf(c, def) : null;
      return h('span', {
        class: `equip-slot ${def ? `filled r-${rarity.id}` : ''}`,
        style: def ? { '--rar': rarity.color } : null,
        title: def ? `${c.slotNames[slot]} : ${def.name} — ${rarity.name} (niv. ${def.level})` : `${c.slotNames[slot]} : vide`
      });
    }));
}

/** Stats d'un personnage SAUVEGARDÉ, vues à un niveau effectif donné (null = niveau réel, mode Basic). */
export function previewStats(ch, tranche = null) {
  const content = app.content;
  const eff = tranche ? Math.min(ch.level, tranche) : ch.level;
  const cls = content.classes[ch.classId];
  // Faux état + faux joueur : juste de quoi calculer les stats (PV pleins, pas de bonus de PV manquants).
  const fakeState = { content, setup: { tranche: tranche || 99, restrict: !!tranche }, players: [], combat: null };
  const fakePlayer = {
    kind: 'player', classId: ch.classId, effLevel: eff, equipment: ch.equipment, skills: ch.skills,
    statuses: [], hpMaxPenalty: 0, cursedUid: null, hp: 1e9, row: cls.startRow, resources: {}
  };
  return computeStats(fakeState, fakePlayer);
}

/** Petite ligne de stats "PV 40 · Att 6 · Déf 6". */
export function statsLine(s) {
  return `PV ${Math.round(s.hpMax)} · Att ${s.atk.toFixed(1)} · Déf ${s.def.toFixed(1)}${s.heal ? ` · Soin ${s.heal.toFixed(1)}` : ''} · ${s.pa} PA`;
}

/** Bouton "icône + texte". */
export function btn(label, onClick, { cls = '', ic = null, disabled = false, title = null } = {}) {
  return h('button', { class: `btn ${cls}`, onClick, disabled, title }, ic ? icon(ic, 18) : null, label);
}

/** Barre de progression générique (succès, niveau d'équipement...). */
export function progressBar(current, target, label = null) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 100;
  return h('div', { class: `progress ${pct >= 100 ? 'done' : ''}`, title: `${current} / ${target}` },
    h('div', { class: 'progress-fill', style: { width: pct + '%' } }),
    h('span', { class: 'progress-text' }, label ?? `${Math.min(current, target)} / ${target}`));
}
