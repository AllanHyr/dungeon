// ============================================================
//  assess.js — Le verdict : cette équipe est-elle de taille pour ce donjon ?
// ============================================================
// Utilisé par l'accueil (une puce « Adapté / Risqué / Très dangereux » par donjon) et par la salle d'attente (le verdict du groupe).

import { app } from './state.js';
import { getModeParams, trancheTopLevel } from '../core/index.js';

/** « 12, 16 et 20 » */
export const listFr = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}` : items.join(''));
export const plural = (n, one, many) => (n > 1 ? many : one);
/** « de Bob », mais « d'Alice » (élision devant une voyelle ou un h). */
export const deNom = (name) => (/^[aeiouyhàâäéèêëîïôöùûüœ]/i.test(name) ? `d'${name}` : `de ${name}`);

// ============================================================
//  Le danger : l'équipe est-elle de taille ?
// ============================================================

/**
 * Estime le danger d'un donjon pour l'équipe choisie : { level: 'ok' | 'risky' | 'deadly', notes: [...] }.
 * Les remarques sont regroupées (une phrase pour tous les héros concernés), pour ne pas répéter trois fois la même chose.
 */
export function assess(team, tranche, mode) {
  const order = { ok: 0, risky: 1, deadly: 2 };
  let level = 'ok';
  const raise = (l) => {
    if (order[l] > order[level]) level = l;
  };
  const top = trancheTopLevel(app.content, tranche.id);
  const groups = { deadly: [], risky: [], lowXp: [], effective: [] };
  for (const ch of team) {
    const gap = tranche.minLevel - ch.level;
    const label = `${ch.name} (niv. ${ch.level})`;
    if (gap >= 3) {
      raise('deadly');
      groups.deadly.push(label);
    } else if (gap >= 1) {
      raise('risky');
      groups.risky.push(label);
    }
    if (ch.level > top) groups.lowXp.push(label);
    if (mode !== 'basic' && ch.level > tranche.id) groups.effective.push(ch.name);
  }
  const notes = [];
  const many = (list) => list.length > 1;
  if (groups.deadly.length) notes.push(`Bien trop faible${many(groups.deadly) ? 's' : ''} : ${listFr(groups.deadly)} — ${many(groups.deadly) ? 'ils mourront' : 'il mourra'} très vite.`);
  if (groups.risky.length) notes.push(`Un peu faible${many(groups.risky) ? 's' : ''} pour cette tranche : ${listFr(groups.risky)}.`);
  if (groups.lowXp.length) notes.push(`${listFr(groups.lowXp)} ${many(groups.lowXp) ? 'gagneront' : 'gagnera'} très peu d'XP ici (écart de niveau).`);
  if (groups.effective.length) notes.push(`${listFr(groups.effective)} ${many(groups.effective) ? 'joueront' : 'jouera'} au niveau effectif ${tranche.id} : équipement et compétences de niveau supérieur inactifs.`);
  return { level, notes };
}

export const VERDICT = {
  ok: { label: 'Adapté', ic: 'check', title: "Ton équipe a le niveau pour ce donjon." },
  risky: { label: 'Risqué', ic: 'alert', title: "Au moins un héros est un peu faible pour ce donjon." },
  deadly: { label: 'Très dangereux', ic: 'skull', title: "Au moins un héros est bien trop faible : c'est presque du suicide." }
};
export const VERDICT_SENTENCE = { ok: 'Équipe adaptée à ce donjon.', risky: "Attention : c'est risqué !", deadly: "DANGER : c'est presque du suicide !" };

export function modeEffects(setup) {
  const p = getModeParams(app.content, setup);
  const bits = [];
  bits.push(`XP ×${p.xp}`);
  bits.push(p.rarityBoost > 1 ? 'butin de meilleure qualité' : p.rarityBoost < 1 ? 'butin réduit' : 'butin normal');
  if (p.monsterHp !== 1 || p.monsterAtk !== 1) bits.push(`monstres : PV ×${p.monsterHp}, attaque ×${p.monsterAtk}`);
  else bits.push('difficulté normale');
  return bits.join(' · ');
}
