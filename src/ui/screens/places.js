// ============================================================
//  places.js — Les lieux de l'accueil : la barre de navigation, le Camp, les pages Héros, Forge et Grimoire
// ============================================================
// L'accueil est organisé en CINQ LIEUX, toujours accessibles par la barre de navigation (à gauche sur ordinateur, en bas sur téléphone) :
//   Camp       « que faire maintenant ? » : les choses à faire, le donjon conseillé, les héros, la progression
//   Aventure   partir : donjon (seul ou en salon), farm solo, expéditions (c'est l'ancien accueil, voir menu.js)
//   Héros      la fiche d'un héros, en page (équipement, compétences, succès, infos)
//   Forge      démanteler, améliorer, forger, pour le héros choisi
//   Grimoire   l'encyclopédie (donjons, bestiaire) et les règles du jeu
// Les réglages (sons, sauvegarde ou compte, Atelier de classes) sont rangés en bas de la barre.
// Ce fichier ne contient aucune règle : il lit les personnages et appelle le moteur et les écrans existants.

import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { app, persistProfile, toast } from '../state.js';
import { redraw, characterAction } from '../controller.js';
import { portrait, xpBar, monsterPortrait } from '../components.js';
import { assess, VERDICT, plural } from '../assess.js';
import { play, isSoundEnabled } from '../sound.js';
import { openSoundLab } from './sound-lab.js';
import { sheetBody, newSheetState, forgeTab } from './sheet.js';
import { openLootModal, openSaveModal, openTrainingModal, openAccountModal, openCreateModal, helpContent, heroSlots } from './dialogs.js';
import { collection, openDungeonGuide } from './dungeons.js';
import {
  availableTranches, dungeonsOf, skillPointsToSpend, pendingChoices, expeditionLeft, expeditionOf, expeditionSlots,
  canUpgrade, ownedItems, itemView
} from '../../core/index.js';

/** Les cinq lieux : identifiant, nom, ce qu'on y fait, icône. */
export const PLACES = [
  ['camp', 'Le camp', 'que faire maintenant', 'start'],
  ['aventure', 'Aventure', 'donjons, farm, expéditions', 'sword'],
  ['heros', 'Héros', 'équipement, sorts, succès', 'user'],
  ['forge', 'Forge', 'démanteler, améliorer, forger', 'flame'],
  ['grimoire', 'Grimoire', 'donjons, monstres, règles', 'book']
];
export const placeIds = PLACES.map((p) => p[0]);

/** Aller à un lieu (gardé dans les préférences : on y revient au prochain lancement). */
export function goPlace(place, extra = {}) {
  Object.assign(app.ui, extra);
  app.ui.place = place;
  app.profile.settings.place = place;
  persistProfile();
  play('click');
  redraw();
  window.scrollTo(0, 0);
}

const ROLE_NAMES = { tank: 'Tank', healer: 'Soigneur', damage: 'Dégâts' };

/** Ce qu'un héros a à faire (points de compétence, spécialisation, talents) : un texte court, ou null. */
function heroTodo(ch) {
  const free = skillPointsToSpend(app.content, ch);
  const todo = pendingChoices(app.content, ch);
  if (free > 0) return `${free} point${plural(free, '', 's')} de compétence`;
  if (todo.spec) return 'Spécialisation à choisir';
  if (todo.talents) return `${todo.talents} talent${plural(todo.talents, '', 's')} à choisir`;
  return null;
}

/** Récupère les récompenses d'un héros revenu d'expédition, et les annonce. */
export async function claimExpedition(ch) {
  const res = await characterAction({ type: 'CHAR_EXPEDITION_CLAIM', charId: ch.id });
  if (!res.ok) return;
  const c = res.claim;
  const bits = [`+${c.shards} éclats`];
  if (c.xp) bits.push(`+${c.xp} XP${c.levels ? ` (niveau ${res.character.level} !)` : ''}`);
  if (c.item) bits.push(app.content.items[c.item.id].name);
  play(c.item ? 'crit' : 'coins');
  toast(`${ch.name} est de retour : ${bits.join(' · ')}.`, 'good');
  redraw();
}

// ============================================================
//  « Que faire maintenant ? » : les choses à faire, par ordre d'importance
// ============================================================

/** La liste des choses à faire : [{ id, tone, ic, title, text, label, run }]. Elle sert au Camp, et au compteur de la barre. */
export function todoList() {
  const c = app.content;
  const chars = app.profile.characters;
  const out = [];
  const now = Date.now();
  // (une partie en cours a son propre bandeau, en haut de chaque lieu)
  for (const ch of chars) {
    if (ch.expedition && !expeditionLeft(ch, now)) {
      out.push({ id: `exp-${ch.id}`, tone: 'good', ic: 'gift', title: `${ch.name} est de retour d'expédition`, text: `${expeditionOf(c, ch.expedition.id)?.name || 'Expédition'} : ses récompenses l'attendent.`, label: 'Récupérer', run: () => claimExpedition(ch) });
    }
  }
  for (const ch of chars) {
    if (ch.lootChoice?.length) {
      out.push({ id: `loot-${ch.id}`, tone: 'violet', ic: 'treasure', title: 'Une récompense de farm à choisir', text: `${ch.name} : 1 objet à garder parmi ${ch.lootChoice.length}.`, label: 'Choisir', run: () => openLootModal(ch.id) });
    }
  }
  // Les compétences : une carte par héros, ou une seule pour tous s'ils sont nombreux (le Camp reste lisible)
  const learners = chars.filter((ch) => heroTodo(ch));
  if (learners.length > 2) {
    out.push({ id: 'skills', tone: 'gold', ic: 'star', title: `${learners.length} héros ont des choix de compétences`, text: `${learners.map((ch) => ch.name).join(', ')} : points à dépenser, spécialisation ou talents.`, label: 'Voir les héros', run: () => goPlace('heros', { heroId: learners[0].id, heroTab: 'skills' }) });
  } else {
    for (const ch of learners) out.push({ id: `skills-${ch.id}`, tone: 'gold', ic: 'star', title: `${ch.name} : ${heroTodo(ch).toLowerCase()}`, text: 'De nouveaux sorts ou une spécialisation l\'attendent.', label: 'Voir ses compétences', run: () => goPlace('heros', { heroId: ch.id, heroTab: 'skills' }) });
  }
  // La forge : un objet porté qu'on peut améliorer maintenant
  for (const ch of chars) {
    if (!(ch.shards > 0)) continue;
    const up = ownedItems(ch).filter((o) => o.where !== 'bag').find((o) => canUpgrade(c, ch, o.inst).ok);
    if (up) {
      out.push({ id: `forge-${ch.id}`, tone: 'gold', ic: 'flame', title: `${ch.shards} éclats pour ${ch.name}`, text: `De quoi améliorer ${itemView(c, up.inst).name}.`, label: 'Aller à la forge', run: () => goPlace('forge', { forgeChar: ch.id }) });
      break;
    }
  }
  // Des places d'expédition libres, et des héros qui ne font rien
  const slots = expeditionSlots(c, chars);
  const idle = chars.filter((ch) => !ch.expedition && !ch.lootChoice?.length);
  if (slots.free && idle.length && out.length < 4) {
    out.push({ id: 'expedition', tone: 'info', ic: 'timer', title: 'Des héros se reposent', text: `${slots.free} place${plural(slots.free, '', 's')} d'expédition libre${plural(slots.free, '', 's')} : envoie-les chercher des éclats, même jeu fermé.`, label: 'Expéditions', run: () => goPlace('aventure', { view: 'expeditions' }) });
  }
  return out;
}

/** Le nombre de choses « urgentes » (sans la suggestion d'expédition) : le compteur du Camp dans la barre. */
const urgentCount = (list) => list.filter((t) => t.id !== 'expedition').length;

// ============================================================
//  La barre de navigation
// ============================================================

export function navBar(place) {
  const chars = app.profile.characters;
  const todos = urgentCount(todoList());
  const heroAlerts = chars.filter((ch) => heroTodo(ch)).length;
  const badge = { camp: todos, heros: heroAlerts };
  const foot = (label, ic, onClick, title = label, cls = '') => h('button', { class: `nav-foot-btn ${cls}`.trim(), type: 'button', title, 'aria-label': title, onClick }, icon(ic, 17), h('span', null, label));
  return h('nav', { class: 'place-nav', 'aria-label': 'Les lieux du jeu' },
    h('div', { class: 'nav-brand' }, h('span', { class: 'nav-brand-mark' }, icon('boss', 26)), h('b', null, 'Donjon')),
    PLACES.map(([id, name, hint, ic]) => h('button', {
      class: `nav-place ${place === id ? 'on' : ''}`, type: 'button', 'data-place': id, 'aria-current': place === id ? 'page' : 'false',
      onClick: () => { if (place !== id) goPlace(id); }
    }, icon(ic, 22), h('span', { class: 'nav-place-text' }, h('b', null, name), h('small', null, hint)),
      badge[id] ? h('span', { class: 'nav-badge', title: `${badge[id]} chose${plural(badge[id], '', 's')} à faire` }, badge[id]) : null)),
    h('div', { class: 'nav-foot' },
      foot('Atelier de classes', 'flask', () => openTrainingModal(), 'Atelier de classes : teste tes compétences sur des mannequins, sans risque'),
      app.gateway.canExport
        ? foot('Sauvegarde', 'save', () => openSaveModal(), 'Sauvegarder ou copier tes personnages')
        : foot(app.gateway.user?.name ? `Compte (${app.gateway.user.name})` : 'Compte', 'user', () => openAccountModal(), 'Mon compte : changer de mot de passe, se déconnecter', 'account-btn'),
      foot('Sons', isSoundEnabled() ? 'sound_on' : 'sound_off', () => openSoundLab(), 'Sons et animations : volume, style des animations, banc d\'essai')));
}

// ============================================================
//  Le Camp
// ============================================================

/** Le donjon conseillé : le plus haut donjon « adapté » à l'équipe, pas encore terminé (sinon le plus haut adapté). */
function recommendation() {
  const c = app.content;
  const chars = app.profile.characters.filter((ch) => !ch.expedition);
  if (!chars.length) return null;
  const last = app.profile.lastTeam.map((id) => chars.find((ch) => ch.id === id)).filter(Boolean);
  const team = (last.length ? last : [...chars].sort((a, b) => b.level - a.level)).slice(0, app.gateway.mode === 'online' ? 1 : 3);
  const done = collection().dungeons;
  const options = [];
  for (const t of availableTranches(c)) {
    const level = assess(team, t, 'tranche').level;
    for (const d of dungeonsOf(c, t.id)) options.push({ d, t, level, done: done[d.id] || 0 });
  }
  const ok = options.filter((o) => o.level === 'ok');
  const pick = [...ok].reverse().find((o) => !o.done) || ok[ok.length - 1] || options[0];
  return pick ? { ...pick, team } : null;
}

function campPage() {
  const c = app.content;
  const chars = app.profile.characters;
  const todos = todoList();
  const rec = recommendation();
  const done = collection().dungeons;
  const online = app.gateway.mode === 'online';

  const todoCards = h('section', { class: 'panel camp-todo' },
    h('h2', null, 'Que faire maintenant', h('small', { class: 'muted' }, todos.length ? `${todos.length} chose${plural(todos.length, '', 's')}` : 'rien d\'urgent')),
    todos.length
      ? h('div', { class: 'todo-grid' }, todos.map((t, i) => h('div', { class: `todo-card tone-${t.tone}`, dataset: { todo: t.id } },
          h('span', { class: 'todo-ic' }, icon(t.ic, 22)),
          h('div', { class: 'todo-body' }, h('b', null, t.title), h('p', null, t.text),
            h('button', { class: `btn btn-small ${i === 0 ? 'btn-primary' : ''}`, type: 'button', onClick: () => t.run() }, t.label)))))
      : h('p', { class: 'muted' }, 'Tout est en ordre : il ne reste plus qu\'à partir à l\'aventure.'));

  const next = rec ? h('section', { class: 'panel camp-next', dataset: { dungeon: rec.d.id } },
    h('div', { class: 'camp-next-art' }, rec.d.bossId && c.monsters[rec.d.bossId] ? monsterPortrait(c.monsters[rec.d.bossId].kind, 'fluid', true, rec.d.bossId) : icon('boss', 64)),
    h('div', { class: 'camp-next-body' },
      h('div', { class: 'eyebrow' }, 'Prochaine étape conseillée'),
      h('h3', null, rec.d.name),
      h('p', { class: 'muted' }, `Niveaux ${rec.t.minLevel} à ${rec.t.maxLevel} · ${online ? 'ton héros' : 'ton équipe'} : ${rec.team.map((ch) => ch.name).join(', ')} `,
        h('span', { class: `fit fit-${rec.level}` }, icon(VERDICT[rec.level].ic, 14), VERDICT[rec.level].label)),
      rec.d.description ? h('p', { class: 'small camp-next-desc' }, rec.d.description) : null,
      h('div', { class: 'row gap wrap' },
        h('button', {
          class: 'btn btn-primary', type: 'button', id: 'camp-go',
          onClick: () => {
            app.ui.setup = { ...app.ui.setup, tranche: rec.t.id, dungeon: rec.d.id };
            if (!online) app.ui.team = rec.team.map((ch) => ch.id);
            goPlace('aventure', { view: 'dungeon' });
          }
        }, icon('sword', 18), 'Préparer l\'expédition'),
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => openDungeonGuide(rec.d.id) }, icon('book', 15), 'Voir le donjon'))))
    : null;

  const heroes = h('section', { class: 'panel camp-heroes' },
    h('h2', null, 'Tes héros', h('small', { class: 'muted' }, `${chars.length} sur ${heroSlots()} places`)),
    h('div', { class: 'camp-hero-grid' }, chars.map((ch) => {
      const cls = c.classes[ch.classId];
      const back = ch.expedition && !expeditionLeft(ch, Date.now());
      const status = ch.expedition ? (back ? ['good', 'De retour !'] : ['info', 'En expédition']) : ch.lootChoice?.length ? ['violet', 'Récompense à choisir'] : heroTodo(ch) ? ['gold', heroTodo(ch)] : ['', 'Prêt'];
      return h('button', { class: 'camp-hero', type: 'button', dataset: { char: ch.id }, onClick: () => goPlace('heros', { heroId: ch.id }) },
        h('div', { class: 'camp-hero-top' }, portrait(ch.classId, 44),
          h('div', null, h('b', null, ch.name), h('div', { class: 'muted small' }, `${cls.name} · niv. ${ch.level}`))),
        xpBar(ch),
        h('span', { class: `status-chip tone-${status[0]}` }, status[1]));
    })));

  // La progression : les tranches (terminées si un héros en a fini un donjon), puis le Stasis (à plusieurs)
  const tranches = availableTranches(c);
  const steps = tranches.map((t) => {
    const ds = dungeonsOf(c, t.id);
    const n = ds.filter((d) => done[d.id]).length;
    return { label: `Tranche ${t.id}`, sub: n ? `${n} donjon${plural(n, '', 's')} sur ${ds.length}` : `niveaux ${t.minLevel} à ${t.maxLevel}`, done: n === ds.length && n > 0, started: n > 0, mark: String(t.id) };
  });
  const now = steps.findIndex((s) => !s.done);
  const progress = h('section', { class: 'panel camp-progress' },
    h('h2', null, 'Ta progression'),
    h('ol', { class: 'journey' },
      steps.map((s, i) => h('li', { class: `journey-step ${s.done ? 'done' : i === now ? 'now' : ''}` },
        h('span', { class: 'journey-dot' }, s.done ? icon('check', 14) : s.mark), h('b', null, s.label), h('small', null, s.sub))),
      h('li', { class: 'journey-step' }, h('span', { class: 'journey-dot' }, icon('lock', 14)), h('b', null, 'Stasis'), h('small', null, 'trois niveaux de difficulté'))),
    h('p', { class: 'muted small' }, 'Le Stasis (monstres bien plus coriaces) : seul, jusqu\'à l\'épique ; à plusieurs, en ligne, c\'est là que tombent les objets légendaires.'));

  return [
    h('header', { class: 'place-head' }, h('div', { class: 'eyebrow' }, 'Le camp'), h('h1', null, 'Bon retour, aventurier'), h('p', { class: 'muted' }, 'Ce qui t\'attend, en un coup d\'œil. Chaque carte mène directement au bon endroit.')),
    todoCards,
    next,
    h('div', { class: 'camp-bottom' }, heroes, progress)
  ];
}

// ============================================================
//  Héros : la fiche, en page
// ============================================================

function heroesPage() {
  const c = app.content;
  const ui = app.ui;
  const chars = app.profile.characters;
  if (!chars.some((ch) => ch.id === ui.heroId)) ui.heroId = chars[0]?.id;
  if (!ui.heroSheet || ui.heroSheet.id !== ui.heroId) ui.heroSheet = { id: ui.heroId, state: newSheetState(ui.heroTab || 'equip') };
  if (ui.heroTab) { ui.heroSheet.state.tab = ui.heroTab; ui.heroTab = null; }
  const full = chars.length >= heroSlots();
  const list = h('div', { class: 'hero-list-side', role: 'list' },
    chars.map((ch) => h('button', {
      class: `hero-side ${ch.id === ui.heroId ? 'on' : ''}`, type: 'button', role: 'listitem', dataset: { char: ch.id },
      onClick: () => { ui.heroId = ch.id; play('click'); redraw(); }
    }, portrait(ch.classId, 38), h('span', { class: 'hero-side-text' }, h('b', null, ch.name), h('small', { class: 'muted' }, `${c.classes[ch.classId].name} · niv. ${ch.level}`)),
      heroTodo(ch) || ch.lootChoice?.length ? h('span', { class: 'hero-side-dot', title: 'Quelque chose à faire' }) : null)),
    h('button', { class: 'hero-side hero-side-new', type: 'button', disabled: full, title: full ? 'Toutes les places sont prises : supprime un héros pour en créer un autre.' : '', onClick: () => openCreateModal() },
      icon(full ? 'lock' : 'plus', 18), h('span', null, full ? `Places pleines (${chars.length}/${heroSlots()})` : 'Nouveau héros')));
  const holder = h('div', { class: 'panel hero-sheet' });
  const api = { get body() { return document.querySelector('.hero-sheet') || holder; }, refresh: () => redraw(), close() {} };
  if (ui.heroId) mount(holder, sheetBody(ui.heroId, ui.heroSheet.state, api, { page: true }));
  return [
    h('header', { class: 'place-head' }, h('div', { class: 'eyebrow' }, 'Héros'), h('h1', null, 'Tes héros'), h('p', { class: 'muted' }, 'Tout sur un héros au même endroit : ce qu\'il porte, ses sorts, ses succès.')),
    h('div', { class: 'heroes-layout' }, list, holder)
  ];
}

// ============================================================
//  Forge
// ============================================================

function forgePage() {
  const ui = app.ui;
  const chars = app.profile.characters;
  if (!chars.some((ch) => ch.id === ui.forgeChar)) ui.forgeChar = chars[0]?.id;
  const ch = chars.find((x) => x.id === ui.forgeChar);
  ui.forgeState = ui.forgeState || newSheetState('forge');
  const locked = app.gateway.lockedIds().has(ch.id);
  const picker = h('div', { class: 'forge-who', role: 'group', 'aria-label': 'Le héros qui forge' }, chars.map((x) => h('button', {
    class: `forge-who-btn ${x.id === ch.id ? 'on' : ''}`, type: 'button', dataset: { char: x.id }, onClick: () => { ui.forgeChar = x.id; play('click'); redraw(); }
  }, portrait(x.classId, 30), h('span', null, x.name), h('small', { class: 'muted' }, `${x.shards || 0} éclats`))));
  return [
    h('header', { class: 'place-head' }, h('div', { class: 'eyebrow' }, 'Forge'), h('h1', null, 'La forge'),
      h('p', { class: 'muted' }, 'Chaque héros a sa propre réserve d\'éclats : choisis d\'abord pour qui tu forges.')),
    picker,
    locked ? h('div', { class: 'farm-alert tone-bad' }, `${ch.name} est dans une partie en cours : reprends-la ou abandonne-la pour utiliser la forge.`) : null,
    h('section', { class: 'panel forge-page' }, forgeTab(ch, { refresh: () => redraw(), body: document.body }, ui.forgeState, locked))
  ];
}

// ============================================================
//  Grimoire
// ============================================================

function grimoirePage() {
  const c = app.content;
  const ui = app.ui;
  const tab = ui.grimoireTab || 'donjons';
  const col = collection();
  const tabs = h('div', { class: 'tabs grimoire-tabs', role: 'tablist' }, [['donjons', 'Donjons', 'boss'], ['bestiaire', 'Bestiaire', 'skull'], ['regles', 'Règles', 'book']].map(([id, label, ic]) =>
    h('button', { class: `tab ${tab === id ? 'on' : ''}`, role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', 'data-tab': id, onClick: () => { ui.grimoireTab = id; play('click'); redraw(); } }, icon(ic, 16), label)));
  let body;
  if (tab === 'donjons') {
    body = availableTranches(c).map((t) => h('section', { class: 'panel' },
      h('h2', null, `Niveaux ${t.minLevel} à ${t.maxLevel}`, h('small', { class: 'muted' }, `tranche ${t.id}`)),
      h('div', { class: 'grimoire-dungeons' }, dungeonsOf(c, t.id).map((d) => {
        const mons = [...new Set([...(d.monsterPool || []), d.bossId])].filter((id) => c.monsters[id]);
        const beaten = mons.filter((id) => col.bestiary[id]).length;
        const loot = d.loot || [];
        const got = loot.filter((id) => col.found[id]).length;
        return h('button', { class: `grimoire-dungeon ${col.dungeons[d.id] ? 'is-done' : ''}`, type: 'button', dataset: { dungeon: d.id }, onClick: () => openDungeonGuide(d.id) },
          h('span', { class: 'gd-art' }, c.monsters[d.bossId] ? monsterPortrait(c.monsters[d.bossId].kind, 'fluid', true, d.bossId) : icon('boss', 32)),
          h('span', { class: 'gd-body' }, h('b', null, d.name), h('span', { class: 'muted small' }, d.theme || ''),
            h('span', { class: 'gd-chips' },
              h('span', { class: `chip ${col.dungeons[d.id] ? 'chip-good' : ''}` }, col.dungeons[d.id] ? `Terminé ${col.dungeons[d.id]} fois` : 'Jamais terminé'),
              h('span', { class: 'chip' }, `Monstres ${beaten}/${mons.length}`),
              loot.length ? h('span', { class: 'chip' }, `Butin ${got}/${loot.length}`) : null)));
      }))));
  } else if (tab === 'bestiaire') {
    const all = Object.values(c.monsters).filter((m) => !m.training);
    const seen = all.filter((m) => col.bestiary[m.id]).length;
    body = h('section', { class: 'panel' },
      h('h2', null, 'Bestiaire', h('small', { class: 'muted' }, `${seen} monstre${plural(seen, '', 's')} vaincu${plural(seen, '', 's')} sur ${all.length}`)),
      h('div', { class: 'bestiary-grid' }, all.map((m) => {
        const n = col.bestiary[m.id] || 0;
        return h('div', { class: `bestiary-entry ${n ? '' : 'is-unknown'} ${m.boss ? 'is-boss' : ''}`, dataset: { monster: m.id } },
          h('span', { class: 'be-art' }, monsterPortrait(m.kind, 'fluid', !!m.boss, m.id)),
          h('b', null, n ? m.name : '???'),
          h('small', { class: 'muted' }, n ? `vaincu ${n} fois` : 'jamais vaincu'));
      })));
  } else {
    body = h('section', { class: 'panel grimoire-rules' }, helpContent());
  }
  return [
    h('header', { class: 'place-head' }, h('div', { class: 'eyebrow' }, 'Grimoire'), h('h1', null, 'Le grimoire'),
      h('p', { class: 'muted' }, 'Tout ce que tes héros ont découvert : donjons, monstres, butin. Et les règles du jeu.')),
    tabs,
    body
  ];
}

/** Le contenu d'un lieu (sauf l'Aventure, dessinée par menu.js). */
export function placeContent(place) {
  if (place === 'heros') return heroesPage();
  if (place === 'forge') return forgePage();
  if (place === 'grimoire') return grimoirePage();
  return campPage();
}
