// ============================================================
//  dungeons.js — Choisir un donjon, et le consulter (encyclopédie : monstres, mécaniques et butin)
// ============================================================
// Les donjons sont rangés par TRANCHE de niveaux (1 à 3, 4 à 7, 8 à 11...). Chaque carte dit le thème du donjon, s'il est simple ou
// s'il a ses propres mécaniques, et le verdict pour l'équipe choisie. Sert à l'accueil (jeu local) et à la salle d'attente d'un salon.
// L'encyclopédie d'un donjon (bouton « Monstres et butin ») montre son bestiaire — avec les particularités de chaque monstre — et sa
// table de butin : les objets qui ne tombent que là.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, openModal } from '../state.js';
import { availableTranches, dungeonsOf } from '../../core/index.js';
import { assess, VERDICT, listFr, plural } from '../assess.js';
import { monsterPortrait } from '../components.js';
import { itemCard, skillBlurb } from '../format.js';

const ROW_NAME = { front: 'Rang avant', back: 'Rang arrière' };
const COMPLEXITY = { simple: ['Simple', 'Pas de mécanique particulière : idéal pour découvrir.'], mecaniques: ['Mécaniques', 'Ce donjon a ses propres règles : lis « À savoir » avant d\'entrer.'] };

/** Le donjon choisi dans des réglages { tranche, dungeon } (le premier de la tranche si rien n'est choisi ou si le choix n'existe plus). */
export function selectedDungeon(setup) {
  const c = app.content;
  const list = dungeonsOf(c, setup.tranche);
  return list.find((d) => d.id === setup.dungeon) || list[0] || null;
}

/**
 * La liste des donjons, groupés par tranche de niveaux. `onPick(dungeon)` : appelé au clic (absent ou `canPick: false` : lecture seule).
 * `only` : n'afficher que ce donjon (l'invité d'un salon voit celui que l'hôte a choisi).
 */
export function dungeonPicker({ team = [], mode = 'tranche', selectedId = null, canPick = true, onPick = null, only = null }) {
  const c = app.content;
  const card = (d, t) => {
    const sel = d.id === selectedId;
    const verdict = team.length ? assess(team, t, mode).level : null;
    const v = verdict && VERDICT[verdict];
    const cx = COMPLEXITY[d.complexity];
    return h('button', {
      class: `tranche-card ${sel ? 'selected' : ''}`, type: 'button', 'aria-pressed': sel, disabled: !canPick, dataset: { dungeon: d.id, tranche: t.id },
      onClick: () => { if (canPick && onPick && !sel) onPick(d); }
    },
      h('div', { class: 'tranche-num', title: `Niveaux ${t.minLevel} à ${t.maxLevel}` }, t.id),
      h('div', { class: 'tranche-body' },
        h('div', { class: 'tranche-name' }, d.name),
        h('div', { class: 'dungeon-tags' },
          d.theme ? h('span', { class: 'dungeon-theme' }, d.theme) : null,
          cx ? h('span', { class: `dungeon-cx cx-${d.complexity}`, title: cx[1] }, cx[0]) : null),
        h('div', { class: 'small tranche-desc' }, d.description || '')),
      v ? h('span', { class: `fit fit-${verdict}`, title: v.title }, icon(v.ic, 15), v.label) : null);
  };
  if (only) {
    const t = c.tranches[only.tranche];
    return h('div', { class: 'dungeon-list' }, card(only, t));
  }
  const head = (t, tag = 'div') => h(tag, { class: 'tranche-head', dataset: { tranche: t.id } }, h('b', null, `Niveaux ${t.minLevel} à ${t.maxLevel}`),
    h('span', { class: 'muted small' }, `${dungeonsOf(c, t.id).length} donjon${plural(dungeonsOf(c, t.id).length, '', 's')}`));
  // Petit écran : une tranche = un volet qu'on déplie ; seule celle du donjon choisi est ouverte (la page reste courte).
  if (window.matchMedia?.('(max-width: 760px)').matches) {
    const openId = c.dungeons[selectedId]?.tranche;
    return h('div', { class: 'dungeon-list is-folded' }, availableTranches(c).map((t) => h('details', {
      class: 'tranche-group', open: t.id === openId || app.ui.openTranche === t.id, dataset: { tranche: t.id },
      onToggle: (ev) => { if (ev.target.open) app.ui.openTranche = t.id; else if (app.ui.openTranche === t.id) app.ui.openTranche = null; }
    }, head(t, 'summary'), h('div', { class: 'tranche-cards' }, dungeonsOf(c, t.id).map((d) => card(d, t))))));
  }
  const groups = availableTranches(c).map((t) => [head(t), dungeonsOf(c, t.id).map((d) => card(d, t))]);
  return h('div', { class: 'dungeon-list' }, groups);
}

/** « Bientôt : les tranches 12, 16 et 20 » — avec le nom des donjons annoncés. */
export function comingSoonNote() {
  const c = app.content;
  const soon = c.trancheList.filter((t) => !t.available);
  if (!soon.length) return null;
  const names = soon.flatMap((t) => (c.dungeonsByTranche[t.id] || []).map((d) => d.name));
  return h('p', { class: 'muted small locked-note' }, icon('lock', 14),
    `Bientôt : ${plural(soon.length, 'la tranche', 'les tranches')} ${listFr(soon.map((t) => t.id))}${names.length ? ` (${names.join(', ')})` : ''}.`);
}

/** Sous la liste : ce qu'il faut savoir du donjon choisi, et le bouton qui ouvre son encyclopédie. */
export function dungeonBrief(d) {
  if (!d) return null;
  const c = app.content;
  const nMonsters = new Set([...(d.monsterPool || []), d.bossId]).size;
  const nLoot = (d.loot || []).length;
  return h('div', { class: 'dungeon-brief', dataset: { dungeon: d.id } },
    h('div', { class: 'brief-head' },
      h('b', null, d.name),
      h('button', { type: 'button', class: 'btn btn-small guide-btn', onClick: () => openDungeonGuide(d.id) }, icon('book', 15), 'Monstres et butin')),
    (d.mechanics || []).length
      ? h('ul', { class: 'brief-list' }, d.mechanics.map((m) => h('li', null, h('b', null, `${m.name}. `), m.desc)))
      : null,
    h('p', { class: 'muted small' }, `${nMonsters} monstres${c.monsters[d.bossId] ? `, dont le boss : ${c.monsters[d.bossId].name}` : ''}.${nLoot ? ` ${nLoot} objets ne tombent qu'ici.` : ''}`));
}

/** La collection du joueur, tous ses héros confondus : donjons terminés, monstres vaincus, objets exclusifs rapportés. */
export function collection() {
  const out = { dungeons: {}, bestiary: {}, found: {} };
  for (const ch of app.profile?.characters || []) {
    for (const [id, n] of Object.entries(ch.stats?.dungeons || {})) out.dungeons[id] = (out.dungeons[id] || 0) + n;
    for (const [id, n] of Object.entries(ch.stats?.bestiary || {})) out.bestiary[id] = (out.bestiary[id] || 0) + n;
    for (const id of Object.keys(ch.stats?.found || {})) out.found[id] = true;
  }
  return out;
}

/** La fiche d'un monstre dans l'encyclopédie : portrait, famille, rang, stats de base, compétences et particularités. */
function monsterEntry(m, role, kills = 0) {
  const c = app.content;
  const skills = (m.skills || []).map((s) => c.skills[s.skill]).filter(Boolean);
  const traits = (m.passives || []).map((id) => c.skills[id]).filter(Boolean);
  return h('div', { class: `guide-monster ${m.boss ? 'is-boss' : ''}`, dataset: { monster: m.id } },
    h('div', { class: 'gm-portrait' }, monsterPortrait(m.kind, 64, !!m.boss, m.id)),
    h('div', { class: 'gm-body' },
      h('div', { class: 'gm-head' },
        h('b', { class: 'gm-name' }, m.name),
        role ? h('span', { class: `gm-role role-${role[0]}` }, role[1]) : null,
        h('span', { class: `gm-kills ${kills ? 'on' : ''}`, title: kills ? `Tes héros en ont vaincu ${kills}` : 'Tes héros ne l\'ont pas encore vaincu' }, kills ? `Vaincu ×${kills}` : 'Jamais vaincu')),
      h('div', { class: 'muted small' }, [m.family, ROW_NAME[m.row], `PV ${m.hp} · Att ${m.atk} · Déf ${m.def}`].filter(Boolean).join(' · ')),
      skills.length ? h('div', { class: 'gm-skills' }, skills.map((sk) => h('span', { class: 'gm-skill', title: skillBlurb(sk, c) }, sk.name))) : null,
      traits.map((t) => h('div', { class: 'gm-trait' }, icon(t.icon || 'star', 14), h('span', null, h('b', null, `${t.name}. `), t.desc)))));
}

/** L'encyclopédie d'un donjon : ce qu'il faut savoir, le bestiaire et la table de butin. */
export function openDungeonGuide(dungeonId) {
  const c = app.content;
  const d = c.dungeons[dungeonId];
  if (!d) return;
  const t = c.tranches[d.tranche];
  const pool = [...new Set(d.monsterPool || [])].map((id) => c.monsters[id]).filter(Boolean);
  const escort = [...new Set(d.bossEscort || [])].map((id) => c.monsters[id]).filter(Boolean);
  const boss = c.monsters[d.bossId];
  const order = c.rarityIndex;
  const loot = (d.loot || []).map((id) => c.items[id]).filter(Boolean).sort((a, b) => order[a.rarity] - order[b.rarity]);
  const col = collection();
  const everyone = [...pool, boss].filter(Boolean);
  const beaten = everyone.filter((m) => col.bestiary[m.id]).length;
  const got = loot.filter((it) => col.found[it.id]).length;
  openModal({
    title: d.name, wide: true, className: 'guide-modal',
    render: () => [
      h('div', { class: 'guide-top' },
        h('span', { class: 'chip' }, `Niveaux ${t.minLevel} à ${t.maxLevel}`),
        d.theme ? h('span', { class: 'chip' }, d.theme) : null,
        COMPLEXITY[d.complexity] ? h('span', { class: `dungeon-cx cx-${d.complexity}` }, COMPLEXITY[d.complexity][0]) : null,
        h('span', { class: `chip guide-progress ${col.dungeons[d.id] ? 'on' : ''}` }, col.dungeons[d.id] ? `Terminé ${col.dungeons[d.id]} fois` : 'Jamais terminé'),
        h('span', { class: 'chip guide-progress' }, `Monstres vaincus : ${beaten}/${everyone.length}`),
        loot.length ? h('span', { class: 'chip guide-progress' }, `Butin trouvé : ${got}/${loot.length}`) : null),
      h('p', { class: 'guide-desc' }, d.description || ''),
      (d.mechanics || []).length ? h('section', { class: 'guide-sec' },
        h('h3', null, icon('alert', 16), 'À savoir avant d\'entrer'),
        h('ul', { class: 'brief-list' }, d.mechanics.map((m) => h('li', null, h('b', null, `${m.name}. `), m.desc)))) : null,
      h('section', { class: 'guide-sec' },
        h('h3', null, icon('skull', 16), 'Bestiaire', h('small', { class: 'muted' }, 'stats de base, pour un groupe de 3 (moins de monstres et de PV à 1 ou 2 joueurs)')),
        h('div', { class: 'guide-monsters' },
          pool.map((m) => monsterEntry(m, null, col.bestiary[m.id] || 0)),
          boss ? monsterEntry(boss, ['boss', 'Boss'], col.bestiary[boss.id] || 0) : null),
        escort.length ? h('p', { class: 'muted small' }, `Le boss n'est pas seul : ${listFr(escort.map((m) => m.name))} ${plural(escort.length, 'le garde', 'le gardent')} (aucune escorte en solo).`) : null),
      h('section', { class: 'guide-sec' },
        h('h3', null, icon('treasure', 16), 'Butin du donjon', h('small', { class: 'muted' }, 'ces objets ne tombent qu\'ici')),
        loot.length
          ? h('div', { class: 'guide-loot' }, loot.map((it) => h('div', { class: `loot-entry ${col.found[it.id] ? 'is-found' : ''}`, dataset: { item: it.id } },
              itemCard(c, { id: it.id }, { compact: true }),
              h('span', { class: 'loot-mark' }, col.found[it.id] ? [icon('check', 12), 'Trouvé'] : 'Pas encore trouvé'))))
          : h('p', { class: 'muted small' }, 'Pas de butin propre à ce donjon.'),
        d.setBonus ? h('div', { class: 'guide-set' }, h('b', null, icon('ring', 14), d.setName),
          d.setBonus.map((b) => h('span', { class: 'set-bonus on' }, `${b.pieces} pièces : ${b.desc}`))) : null,
        h('p', { class: 'muted small' }, `${loot.length ? 'Le boss en donne toujours un, et les combats et les coffres en lâchent plus souvent que le reste. ' : ''}On y trouve aussi le butin ordinaire de niveau ${t.id} ou moins.`))
    ]
  });
}
