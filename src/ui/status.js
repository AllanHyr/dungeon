// ============================================================
//  status.js — Décrire les effets (bonus et malus) d'un combattant, sans rien dessiner
// ============================================================
import { auraSources } from '../core/stats.js';

// Un « statut » est un petit objet du moteur : { id: 'poison', pct: 0.06, turns: 3 }, { id: 'mod', stat: 'damage', pct: 0.15, turns: 2 }...
// Ici on le traduit en texte pour le joueur : un nom, un résumé court (pour les pastilles), une phrase qui EXPLIQUE ce qu'il fait,
// sa durée et s'il aide (bonus) ou gêne (malus). Aucun lien avec le navigateur : les animations et les tests s'en servent aussi.

const STAT_FR = {
  hp: 'PV', atk: 'Attaque', def: 'Défense', heal: 'Soin', save: 'Sauvegarde', luck: 'Chance', ini: 'Initiative', pa: 'PA',
  damage: 'Dégâts', dot: 'Poisons et saignements', taken: 'Dégâts reçus', healPower: 'Soins', critShift: 'Seuil de critique', fumbleShift: "Seuil d'échec", overhealShield: 'Soin en trop en bouclier'
};
/** Le nom d'une statistique (« Attaque », « Dégâts reçus »...). */
export const statLabel = (k) => STAT_FR[k] || k;

/** Pour ces stats, une valeur NÉGATIVE est une bonne nouvelle (moins de dégâts reçus, critique plus tôt...). */
const LOWER_IS_BETTER = ['taken', 'critShift', 'fumbleShift'];

/** L'icône d'un bonus ou malus selon la statistique touchée (la couleur dit si c'est bon ou mauvais). */
const STAT_ICON = { dot: 'poison', damage: 'sword', atk: 'sword', taken: 'shield', def: 'armor', heal: 'cross', healPower: 'cross', ini: 'bolt', pa: 'flame', luck: 'star', hp: 'heart', critShift: 'target', fumbleShift: 'target', save: 'eye' };
/** Le nom d'une stat dans une pastille (court) : « Reçus −15 % » pour les dégâts reçus. */
const SHORT_STAT = { taken: 'Reçus' };

/** Le nom complet d'une stat dans un effet : « Dégâts infligés » plutôt que « Dégâts », « Soins et boucliers »... */
const LONG_STAT = { damage: 'Dégâts infligés', healPower: 'Soins et boucliers donnés' };

/** « 1 tour », « 3 tours ». */
export const turnsText = (n) => `${n} tour${n > 1 ? 's' : ''}`;

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
const pctText = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(Math.round(p * 100))} %`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Décrit UN statut : { key, id, name, short, desc, icon, tone: 'buff' | 'debuff' | 'neutral', turns }.
 *   name  le nom complet (panneau) · short  le résumé pour une pastille · desc  la phrase qui explique · turns  tours restants (ou null)
 */
export function statusInfo(st) {
  const turns = Number.isFinite(st.turns) ? st.turns : null;
  const base = { id: st.id, key: `${st.id}:${st.stat || st.key || ''}:${Math.sign(st.pct || st.flat || 0)}`, turns };
  switch (st.id) {
    case 'poison': {
      const pct = Math.round((st.pct || 0) * 100);
      return { ...base, name: 'Poison', short: 'Poison', icon: 'poison', tone: 'debuff', desc: `Perd ${pct} % de ses PV max au début de chaque tour. Le poison ne tue jamais : il laisse 1 PV.` };
    }
    case 'dot': {
      // Un saignement ou un venin ; `name` (« Venin ») s'il en a un, et le nombre de CUMULS s'il y en a plusieurs (« Venin ×3 »).
      const n = st.stacks > 1 ? st.stacks : 1;
      const base0 = st.name || (st.label ? cap(st.label) : 'Saignement');
      const name = n > 1 ? `${base0} ×${n}` : base0;
      const per = Math.round(st.amount || 0);
      const desc = n > 1
        ? `Perd ${per * n} PV au début de chaque tour (${per} PV × ${n} cumuls). Chaque nouvelle dose ajoute un cumul, jusqu'à ${st.maxStacks ?? 5}.`
        : `Perd ${per} PV au début de chaque tour.${st.stack ? ` Chaque nouvelle dose ajoute un cumul (jusqu'à ${st.maxStacks ?? 5}).` : ''}`;
      const drain = st.drain ? ` ${Math.round(st.drain * 100)} % de ces dégâts soignent l'allié le plus blessé de celui qui l'a posé.` : '';
      return { ...base, name, short: name, icon: 'poison', tone: 'debuff', desc: desc + drain };
    }
    case 'expiation':
      return { ...base, name: 'Expiation', short: 'Expiation', icon: 'sun', tone: 'buff',
        desc: 'Quand le Prêtre qui l’a posée inflige des dégâts, une part de ces dégâts soigne cet allié.' };
    case 'mark': {
      const pct = Math.round((st.pct || 0) * 100);
      return { ...base, name: 'Marqué', short: `Marqué +${pct} %`, icon: 'target', tone: 'debuff', turns: null,
        desc: `Désigné comme proie : il subit ${pct} % de dégâts en plus de celui qui l'a marqué, dont les sorts gagnent des effets bonus contre lui. Dure jusqu'à sa mort, la fin du combat ou une nouvelle marque.` };
    }
    case 'hot':
      return { ...base, name: 'Soin sur la durée', short: `+${st.amount} PV/tour`, icon: 'heart', tone: 'buff', desc: `Récupère ${st.amount} PV au début de chaque tour.` };
    case 'stun':
      return { ...base, name: 'Étourdi', short: 'Étourdi', icon: 'bolt', tone: 'debuff', desc: 'Passe son prochain tour sans rien pouvoir faire.' };
    case 'taunt':
      return { ...base, name: 'Provocation', short: 'Provocation', icon: 'target', tone: 'buff', desc: 'Les ennemis doivent le viser.' };
    case 'guard': {
      const r = Math.round((st.reduction ?? 0.5) * 100);
      return { ...base, name: 'Garde', short: `Garde −${r} %`, icon: 'shield', tone: 'buff', desc: `Reçoit ${r} % de dégâts en moins, jusqu'au début de son prochain tour.` };
    }
    case 'redirect':
      return { ...base, name: 'Sacrifice', short: 'Sacrifice', icon: 'shield', tone: 'buff', desc: 'Encaisse à la place de ses alliés les coups directs des monstres.' };
    case 'mod': {
      const delta = st.pct !== undefined ? st.pct : st.flat;
      const good = LOWER_IS_BETTER.includes(st.stat) ? delta < 0 : delta > 0;
      const value = st.pct !== undefined ? pctText(st.pct) : signed(st.flat);
      const stat = LONG_STAT[st.stat] || statLabel(st.stat);
      const name = `${stat} ${value}`;
      return { ...base, name, short: `${SHORT_STAT[st.stat] || statLabel(st.stat)} ${value}`, icon: STAT_ICON[st.stat] || (good ? 'up' : 'down'), tone: good ? 'buff' : 'debuff',
        desc: good ? `Bonus temporaire : ${stat.toLowerCase()} ${value}.` : `Malus temporaire : ${stat.toLowerCase()} ${value}.` };
    }
    default:
      return { ...base, name: st.id, short: st.id, icon: 'star', tone: 'neutral', desc: '' };
  }
}

/** « Dégâts reçus −8 %, Dégâts +10 % » : un texte pour une liste de modificateurs (une aura). */
export function describeMods(mods) {
  return mods.map((m) => {
    const v = m.pct !== undefined ? pctText(m.pct) : signed(m.flat);
    return `${LONG_STAT[m.stat] || statLabel(m.stat)} ${v}`;
  }).join(', ');
}

/**
 * Tout ce qui agit sur une unité en ce moment, dans l'ordre : son mode de classe, son bouclier, ses statuts, un objet maudit,
 * et (si on donne l'état de la partie, `state`) les AURAS que ses alliés lui donnent (kind 'aura').
 * Renvoie une liste d'objets de `statusInfo` (avec `kind` : 'mode' | 'shield' | 'status' | 'trait' (particularité d'un monstre) | 'curse' | 'aura').
 */
export function unitEffects(content, unit, state = null) {
  const out = [];
  const modes = unit.kind === 'player' ? content.classes[unit.classId]?.modes : null;
  const m = modes && unit.mode ? modes.list[unit.mode] : null;
  if (m) out.push({ kind: 'mode', id: 'mode', key: `mode:${unit.mode}`, name: `Mode ${m.name}`, short: m.name, icon: m.icon || 'star', tone: 'neutral', turns: null, desc: m.desc || '' });
  const shield = (unit.shields || []).reduce((t, s) => t + (s.amount || 0), 0);
  if (shield > 0) {
    const turns = Math.max(...unit.shields.map((s) => s.turns || 0));
    out.push({ kind: 'shield', id: 'shield', key: 'shield', name: 'Bouclier', short: `Bouclier ${Math.round(shield)}`, icon: 'shield', tone: 'buff', turns: turns || null,
      desc: `Absorbe ${Math.round(shield)} dégâts avant que les PV soient touchés. Il ne compte pas comme des PV.` });
  }
  for (const st of unit.statuses || []) out.push({ kind: 'status', ...statusInfo(st) });
  // Les PARTICULARITÉS d'un monstre (régénération, riposte...) : permanentes, propres à son espèce.
  if (unit.kind === 'monster') {
    for (const id of unit.passives || []) {
      const sk = content.skills[id];
      if (sk) out.push({ kind: 'trait', id: 'trait', key: `trait:${id}`, name: sk.name, short: sk.name, icon: sk.icon || 'star', tone: 'neutral', turns: null, desc: sk.desc || '' });
    }
  }
  // Les auras d'un allié (pas la sienne : son mode s'affiche déjà) : un bonus permanent tant que le porteur est là et garde cette aura.
  if (state) {
    for (const a of auraSources(state, unit)) {
      if (a.from.id === unit.id) continue;
      out.push({ kind: 'aura', id: 'aura', key: `aura:${a.from.id}`, name: `${a.mode.name} de ${a.from.name}`, short: a.mode.name, icon: a.mode.icon || 'star', tone: 'buff', turns: null,
        desc: `${describeMods(a.mods)}, tant que ${a.from.name} garde cette aura.` });
    }
  }
  if (unit.cursedUid) {
    const inst = Object.values(unit.equipment || {}).find((it) => it && it.uid === unit.cursedUid);
    const item = inst ? content.items[inst.id]?.name : null;
    out.push({ kind: 'curse', id: 'curse', key: 'curse', name: 'Objet maudit', short: 'Objet maudit', icon: 'curse', tone: 'debuff', turns: null,
      desc: `${item ? `« ${item} »` : 'Un objet'} ne donne plus aucun bonus jusqu'à la fin de la run.` });
  }
  return out;
}

/** Trie des effets pour une pastille : les malus d'abord (ce qui gêne se voit en premier), puis les bonus, puis le reste. */
export const byDanger = (a, b) => ['debuff', 'buff', 'neutral'].indexOf(a.tone) - ['debuff', 'buff', 'neutral'].indexOf(b.tone);
