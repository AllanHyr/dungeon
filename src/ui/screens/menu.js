// ============================================================
//  menu.js — L'écran d'accueil : qui part, où, et à quelle difficulté
// ============================================================
// Deux colonnes sur grand écran (une seule en dessous) :
//     à gauche   ① les héros : on clique pour les choisir
//     à droite   ② le donjon et sa difficulté (ou la zone, en farm solo)
// La barre du bas résume le choix (qui, où) et lance la partie.
// Tant qu'on n'a aucun héros, la page ne propose qu'une seule chose : en créer un.
// Les deux façons de jouer (donjon en équipe / farm solo) sont deux onglets ; les héros sont les mêmes dans les deux.
// En LIGNE, le donjon se joue à plusieurs dans un salon, avec UN seul héros par joueur : l'onglet « Donjon en équipe » devient
// « choisis ton héros, crée un salon (ou rejoins celui d'un ami) ». Une équipe de 1 à 4 héros du même joueur n'existe qu'en jeu local.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, persistProfile, toast, confirmBox } from '../state.js';
import { redraw, startRun, startFarm, savedRunInfo, resumeRun, discardSavedRun, lockedCharIds, characterAction, createRoom, joinRoom, backToRoom, leaveRoom } from '../controller.js';
import { portrait, xpBar, equipStrip, previewStats, statsLine, btn, progressBar } from '../components.js';
import { assess, VERDICT, VERDICT_SENTENCE, modeEffects, listFr, plural } from '../assess.js';
import { openSheet } from './sheet.js';
import { openSaveModal, openHelpModal, openCreateModal, openTrainingModal, openChestModal, openAccountModal } from './dialogs.js';
import { play, isSoundEnabled } from '../sound.js';
import { openSoundLab } from './sound-lab.js';
import { dungeonPicker, dungeonBrief, comingSoonNote, selectedDungeon } from './dungeons.js';
import {
  availableTranches, chestInfo, canStartFarm, gearLevel, hasFeature, achievementForFeature,
  achievementProgress, skillPointsToSpend
} from '../../core/index.js';

const SAMPLE_NAMES = ['Aldric', 'Maeve', 'Borin', 'Lysa', 'Thorne', 'Elwen', 'Kael', 'Nyra', 'Gundar', 'Selene'];
const ROLE_NAMES = { tank: 'Tank', healer: 'Soigneur', damage: 'Dégâts' };

// ============================================================
//  La page
// ============================================================

export function renderMenu(root) {
  const { content, profile } = app;
  const ui = app.ui;
  const chars = profile.characters;
  const tranches = availableTranches(content);

  // Première ouverture de l'écran : on reprend la dernière équipe et les derniers réglages
  if (!ui.init) {
    ui.init = true;
    ui.team = profile.lastTeam.filter((id) => chars.some((c) => c.id === id));
    ui.setup = { ...profile.lastSetup };
    if (!tranches.some((t) => t.id === ui.setup.tranche)) ui.setup.tranche = tranches[0].id;
    ui.view = profile.settings.view; // 'dungeon' (donjon en équipe) ou 'farm' (zone de farm solo)
    ui.farmChar = profile.settings.farmChar;
  }
  if (!chars.some((c) => c.id === ui.farmChar)) ui.farmChar = chars[0]?.id || null;
  ui.team = ui.team.filter((id) => chars.some((c) => c.id === id));

  const saved = savedRunInfo();
  const online = app.gateway.mode === 'online';
  const top = [headerBar(), resumeBanner(saved), roomBanner()];

  // On passe de « Bienvenue » à l'accueil (ou l'inverse) : la page change complètement, on la reprend par le haut.
  const shown = chars.length ? 'home' : 'welcome';
  const switched = ui.shown && ui.shown !== shown;
  ui.shown = shown;

  // Aucun héros : une seule chose à faire.
  if (!chars.length) {
    root.append(h('div', { class: 'menu' }, ...top, welcomePanel(), footNote()));
    if (switched) window.scrollTo(0, 0);
    return;
  }

  // 'dungeon' : une équipe de 1 à 4 héros (jeu local) · 'room' : un seul héros, dans un salon (en ligne) · 'farm' : un seul héros, seul
  const view = ui.view === 'farm' ? 'farm' : online ? 'room' : 'dungeon';
  const plan = view === 'farm' ? farmPlan(chars, saved) : view === 'room' ? roomPlan(chars) : dungeonPlan(chars, saved);
  root.append(h('div', { class: 'menu' },
    ...top,
    viewTabs(view === 'farm' ? 'farm' : 'dungeon'),
    h('div', { class: 'home-grid' }, heroesPanel(chars, view), h('div', { class: 'home-right' }, plan.panel)),
    footNote(),
    plan.bar));
  if (switched) window.scrollTo(0, 0);
}

// ---------------- En-tête ----------------

function headerBar() {
  const { profile } = app;
  // Chaque bouton garde une icône ET un texte ; sur téléphone seul l'icône reste (le texte est dans l'infobulle).
  const tool = (label, ic, onClick, { cls = '', title = label } = {}) =>
    h('button', { class: `btn btn-ghost ${cls}`.trim(), title, 'aria-label': title, onClick }, icon(ic, 18), h('span', { class: 'btn-label' }, label));
  return h('header', { class: 'menu-header' },
    h('div', { class: 'brand' },
      h('div', { class: 'brand-mark' }, icon('boss', 34)),
      h('div', null,
        h('h1', null, 'Donjon'),
        h('p', { class: 'tagline' }, 'Explorez ensemble. Trahissez peut-être. Survivez sûrement.'))),
    h('div', { class: 'header-actions' },
      tool('Atelier de classes', 'flask', () => openTrainingModal(), { cls: 'btn-atelier', title: 'Atelier de classes : teste tes compétences sur des mannequins, sans risque (idéal pour écrire une classe).' }),
      tool('Règles', 'book', () => openHelpModal(), { title: 'Les règles du jeu' }),
      app.gateway.canExport
        ? tool('Sauvegarde', 'save', () => openSaveModal(), { title: 'Sauvegarder ou copier tes personnages' })
        : h('button', { class: 'btn btn-ghost account-btn', title: 'Mon compte : changer de mot de passe, se déconnecter', 'aria-label': 'Mon compte', onClick: () => openAccountModal() },
            icon('user', 18), h('span', { class: 'account-name' }, app.gateway.user?.name || ''), h('small', null, 'Compte')),
      tool('Sons', isSoundEnabled() ? 'sound_on' : 'sound_off', () => openSoundLab(), { cls: 'btn-sons', title: 'Sons et animations : volume, style des animations, banc d\'essai pour écouter chaque son' })));
}

function footNote() {
  return h('p', { class: 'muted small foot' },
    app.gateway.canExport ? 'Valeurs de jeu provisoires — tout le contenu se modifie dans le dossier data/.' : 'Valeurs de jeu provisoires — le jeu évolue encore beaucoup.');
}

// ---------------- Partie en cours ----------------

function resumeBanner(saved) {
  if (!saved || saved.room) return null; // (une partie à plusieurs est annoncée par le bandeau du salon)
  return h('div', { class: 'banner banner-gold' },
    h('div', null,
      h('strong', null, 'Une partie est en cours'),
      h('div', { class: 'muted' }, saved.farm ? `Zone de farm : ${saved.name} — vague ${saved.turn} — ${saved.players.join(', ')}` : `${saved.name} — tour ${saved.turn} — ${saved.players.join(', ')}`)),
    h('div', { class: 'row gap' },
      btn('Reprendre', () => resumeRun(), { cls: 'btn-primary' }),
      btn('Abandonner', async () => {
        if (await confirmBox({ title: 'Abandonner la partie ?', text: 'La progression de cette run sera perdue (tes personnages ne changent pas).', okLabel: 'Abandonner', danger: true })) discardSavedRun();
      })));
}

/** Le salon où l'on est (salle d'attente ou partie à plusieurs en cours) : pour y retourner, ou le quitter. */
function roomBanner() {
  const room = app.gateway.room;
  if (!room) return null;
  const running = room.status === 'running';
  const names = room.members.map((m) => m.hero?.name || m.name).join(', ');
  return h('div', { class: 'banner banner-gold room-banner' },
    h('div', null,
      h('strong', null, running ? 'Une partie à plusieurs est en cours' : `Tu es dans le salon ${room.code}`),
      h('div', { class: 'muted' }, running ? `Salon ${room.code} — ${names}` : `En attente de joueurs — ${names}`)),
    h('div', { class: 'row gap' },
      btn(running ? 'Reprendre' : 'Retourner au salon', () => backToRoom(), { cls: 'btn-primary' }),
      btn(running ? 'Quitter la partie' : 'Quitter le salon', async () => {
        const ok = await confirmBox(running
          ? { title: 'Quitter la partie ?', text: 'Ton héros reste dans le donjon, joué par le pilote automatique, mais tu ne gagneras ni XP ni butin. Tu ne pourras pas revenir.', okLabel: 'Quitter', danger: true }
          : { title: 'Quitter le salon ?', text: 'Tu retournes à l\'accueil.', okLabel: 'Quitter' });
        if (ok) leaveRoom();
      })));
}

// ---------------- Premier pas : créer un héros ----------------

function welcomePanel() {
  const { content } = app;
  const ui = app.ui;
  const classCards = Object.values(content.classes).map((cls) =>
    h('button', { class: 'class-card', type: 'button', onClick: () => openCreateModal(cls.id) },
      portrait(cls.id, 56),
      h('div', { class: 'class-info' },
        h('div', { class: 'class-name' }, cls.name, h('span', { class: `role-tag role-${cls.role}` }, ROLE_NAMES[cls.role])),
        h('div', { class: 'small' }, cls.description))));
  const samples = async () => {
    const chars = app.profile.characters;
    for (const [i, classId] of ['berserker', 'veilleur', 'duelliste'].entries()) {
      const res = await characterAction({ type: 'CHAR_CREATE', name: SAMPLE_NAMES[(chars.length + i + 4) % SAMPLE_NAMES.length], classId });
      if (!res.ok) break;
      ui.team.push(res.character.id);
    }
    persistProfile();
    redraw();
  };
  return h('section', { class: 'panel welcome' },
    h('h2', null, 'Bienvenue, aventurier !'),
    h('p', { class: 'welcome-lead' }, "On explore des donjons case par case, avec des combats au tour par tour. Chaque classe joue à sa façon : choisis la tienne pour créer ton premier héros."),
    h('div', { class: 'class-pick' }, classCards),
    h('div', { class: 'welcome-alt' },
      h('span', null, h('b', null, 'Envie d\'essayer vite ?'), ' Une équipe de trois héros (Berserker, Veilleur, Duelliste), prête à jouer seul.'),
      btn('Créer 3 héros d\'exemple', samples)),
    h('p', { class: 'muted small welcome-help' }, 'Besoin d\'un coup de main ? Le bouton « Règles », en haut de la page, explique comment se déroule une partie.'));
}

// ---------------- Les deux onglets ----------------

function viewTabs(view) {
  const { profile } = app;
  const ui = app.ui;
  const online = app.gateway.mode === 'online'; // (en ligne : un salon, UN héros par joueur)
  return h('div', { class: 'view-switch', role: 'tablist', 'aria-label': 'Façon de jouer' },
    [
      online
        ? ['dungeon', 'Donjon à plusieurs', 'boss', "Jusqu'à 4 joueurs, un héros chacun, explorent un donjon jusqu'au boss."]
        : ['dungeon', 'Donjon en équipe', 'boss', "Jusqu'à 4 héros explorent un donjon jusqu'au boss."],
      ['farm', 'Zone de farm solo', 'treasure', 'Un seul héros enchaîne des vagues de monstres. Butin modeste.']
    ].map(([id, label, ic, hint]) =>
      h('button', {
        class: `view-tab ${view === id ? 'on' : ''}`, role: 'tab', 'aria-selected': view === id, 'data-view': id,
        onClick: () => { ui.view = id; profile.settings.view = id; persistProfile(); play('click'); redraw(); }
      }, icon(ic, 24), h('span', { class: 'view-tab-text' }, h('b', null, label), h('small', null, hint)))));
}

// ============================================================
//  ① Les héros
// ============================================================

function heroesPanel(chars, view) {
  const farm = view === 'farm';
  const room = view === 'room';
  const locks = lockedCharIds();
  const cards = chars.map((ch) => heroCard(ch, view, locks));
  const newTile = h('button', { class: 'char-card new-card', type: 'button', onClick: () => openCreateModal() }, icon('plus', 22), h('span', null, 'Nouveau héros'));
  const count = app.ui.team.length;
  return h('section', { class: 'panel home-heroes' },
    h('h2', null, h('span', { class: 'step' }, '1'), farm || room ? 'Ton héros' : 'Tes héros',
      h('small', { class: 'muted' }, farm ? 'Un seul part au farm : clique pour le choisir.' : room ? 'Un seul héros par joueur : tes amis amènent le leur.' : count ? `${count} sur 4 dans l'équipe` : "Clique pour les ajouter à l'équipe (4 au maximum).")),
    h('div', { class: 'hero-list' }, cards, newTile));
}

function heroCard(ch, view, locks) {
  const { content, profile } = app;
  const ui = app.ui;
  const farm = view === 'farm'; // (le coffre et le niveau d'équipement ne se montrent toujours qu'au farm)
  const single = view !== 'dungeon'; // un seul héros : au farm, ou dans un salon en ligne (une équipe de 4 héros n'existe qu'en jeu local)
  const cls = content.classes[ch.classId];
  const idx = ui.team.indexOf(ch.id);
  const selected = single ? ui.farmChar === ch.id : idx >= 0;
  const toggle = () => {
    if (single) {
      ui.farmChar = ch.id;
      profile.settings.farmChar = ch.id;
      persistProfile();
    } else if (selected) ui.team.splice(idx, 1);
    else if (ui.team.length >= 4) return toast('Une équipe compte 4 héros au maximum.', 'bad');
    else ui.team.push(ch.id);
    play('click');
    redraw();
  };

  // Les petites étiquettes d'un héros : des points de compétence à dépenser, un coffre à ouvrir, une partie en cours...
  const free = skillPointsToSpend(content, ch);
  const chest = chestInfo(content, ch);
  const worn = Object.values(ch.equipment || {}).filter(Boolean).length;
  const tags = [
    free > 0
      ? h('button', {
          class: 'hero-tag hero-tag-skill', type: 'button', title: `${free} point${plural(free, '', 's')} de compétence à dépenser : ouvre l'arbre de compétences`,
          onClick: (e) => { e.stopPropagation(); openSheet(ch.id, 'skills'); }
        }, icon('star', 14), `${free} point${plural(free, '', 's')}`)
      : null,
    farm || chest.count > 0
      ? h('button', {
          class: `hero-tag chest-btn ${chest.count ? 'has-items' : ''}`, type: 'button', title: 'Ouvrir le coffre',
          onClick: (e) => { e.stopPropagation(); openChestModal(ch.id); }
        }, icon('treasure', 14), `Coffre ${chest.count}/${chest.capacity}`)
      : null,
    locks.has(ch.id)
      ? h('span', { class: 'hero-tag hero-tag-bad', title: 'Ce héros est dans la partie en cours : reprends-la ou abandonne-la pour le modifier.' }, icon('lock', 13), 'Partie en cours')
      : null
  ];

  return h('div', {
    class: `char-card hero-card ${selected ? 'selected' : ''}`, tabindex: 0, role: 'button', 'aria-pressed': selected, dataset: { char: ch.id },
    onClick: toggle, onKeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())
  },
    // La case en haut à droite : vide = pas choisi ; rempli = choisi (avec son rang dans l'équipe).
    h('span', { class: `pick-mark ${selected ? 'on' : ''}`, 'aria-hidden': 'true' }, selected ? (single ? icon('check', 16) : idx + 1) : ''),
    h('div', { class: 'char-top' },
      portrait(ch.classId, 52),
      h('div', { class: 'char-id' },
        h('div', { class: 'char-name' }, ch.name),
        h('div', { class: 'char-class muted' }, `${cls.name} · niv. ${ch.level}`, h('span', { class: `role-tag role-${cls.role}` }, ROLE_NAMES[cls.role])))),
    xpBar(ch),
    h('div', { class: 'char-stats muted' }, statsLine(previewStats(ch))),
    farm || worn
      ? h('div', { class: 'char-gear' },
          worn ? equipStrip(ch) : null,
          farm ? h('div', { class: 'muted small', title: 'La somme des niveaux des objets portés' }, `Équipement niv. ${gearLevel(content, ch)}`) : null)
      : null,
    h('div', { class: 'char-actions' },
      tags,
      h('button', { class: 'btn btn-small', type: 'button', title: 'Équipement, compétences, succès', onClick: (e) => { e.stopPropagation(); openSheet(ch.id); } }, h('span', null, 'Fiche', h('span', { class: 'btn-extra' }, ' & équipement')))));
}

// ============================================================
//  ② Le donjon en équipe
// ============================================================

/**
 * Le panneau « donjon + difficulté » : une carte par donjon avec sa puce de verdict pour CETTE équipe, l'explication détaillée,
 * puis la difficulté. Sert à l'équipe locale (1 à 4 héros) et à la création d'un salon en ligne (un seul héros).
 */
function dungeonPanel(team, { title, hint }) {
  const { content } = app;
  const ui = app.ui;
  const tranche = content.tranches[ui.setup.tranche];

  // Les donjons, rangés par tranche de niveaux, chacun avec son verdict pour l'équipe choisie.
  const dungeon = selectedDungeon(ui.setup);
  ui.setup.dungeon = dungeon?.id ?? null;
  const picker = dungeonPicker({
    team, mode: ui.setup.mode, selectedId: ui.setup.dungeon,
    onPick: (d) => { ui.setup.tranche = d.tranche; ui.setup.dungeon = d.id; play('click'); redraw(); }
  });

  const assessment = assess(team, tranche, ui.setup.mode);
  const danger = team.length
    ? h('div', { class: `danger danger-${assessment.level}` },
        h('strong', null, VERDICT_SENTENCE[assessment.level]),
        assessment.notes.length ? h('ul', null, assessment.notes.map((n) => h('li', null, n))) : null)
    : h('p', { class: 'muted small' }, 'Choisis au moins un héros : le verdict de chaque donjon apparaîtra ici.');

  // La difficulté : un sélecteur à trois positions, et l'explication de celle qui est choisie.
  const modeOpt = (key) => {
    const m = content.modes[key];
    const sel = ui.setup.mode === key;
    return h('button', { class: `mode-opt ${sel ? 'on' : ''}`, type: 'button', 'aria-pressed': sel, title: m.short, onClick: () => { ui.setup.mode = key; play('click'); redraw(); } }, m.name);
  };
  const stasisLevels = content.modes.stasis.levels || [];
  const modeBlock = h('div', { class: 'mode-block' },
    h('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Difficulté' }, ['basic', 'tranche', 'stasis'].map(modeOpt)),
    ui.setup.mode === 'stasis'
      ? h('div', { class: 'row gap center wrap stasis-levels' },
          h('span', null, 'Niveau de stasis :'),
          stasisLevels.map((l) => h('button', {
            class: `chip-btn ${ui.setup.stasisLevel === l.level ? 'on' : ''}`, type: 'button',
            onClick: () => { ui.setup.stasisLevel = l.level; play('click'); redraw(); }
          }, l.level)))
      : null,
    h('p', { class: 'mode-desc' }, content.modes[ui.setup.mode].short),
    h('p', { class: 'muted small' }, 'Effets : ' + modeEffects(ui.setup)));

  const panel = h('section', { class: 'panel home-plan' },
    h('h2', null, h('span', { class: 'step' }, '2'), title, h('small', { class: 'muted' }, hint)),
    picker,
    comingSoonNote(),
    dungeonBrief(dungeon),
    danger,
    h('h3', { class: 'sub' }, 'Difficulté'),
    modeBlock);
  const modeName = content.modes[ui.setup.mode].name + (ui.setup.mode === 'stasis' ? ` ${ui.setup.stasisLevel}` : '');
  const fit = team.length ? h('span', { class: `fit fit-${assessment.level}`, title: VERDICT[assessment.level].title }, icon(VERDICT[assessment.level].ic, 14), VERDICT[assessment.level].label) : null;
  return { panel, where: `${dungeon ? dungeon.name : tranche.name} · mode ${modeName}`, fit };
}

function dungeonPlan(chars, saved) {
  const ui = app.ui;
  const team = ui.team.map((id) => chars.find((c) => c.id === id));
  const { panel, where, fit } = dungeonPanel(team, { title: 'Le donjon', hint: 'Niveaux conseillés, et verdict pour ton équipe' });

  // ---- Lancement
  const launch = async () => {
    if (!team.length) return toast('Choisis au moins un héros.', 'bad');
    if (saved && !(await confirmBox({ title: 'Remplacer la partie en cours ?', text: 'Une partie est déjà en cours. La lancer écrasera sa progression.', okLabel: 'Nouvelle partie', danger: true }))) return;
    play('click');
    startRun({ tranche: ui.setup.tranche, dungeon: ui.setup.dungeon, mode: ui.setup.mode, stasisLevel: ui.setup.stasisLevel }, ui.team);
  };
  const bar = launchBar({
    heroes: team,
    who: team.length ? team.map((c) => c.name).join(', ') : null,
    empty: 'Choisis au moins un héros',
    where, fit,
    label: 'Lancer la run', ic: 'd20', disabled: !team.length, onClick: launch
  });
  return { panel, bar };
}

// ============================================================
//  ② Le donjon à plusieurs (en ligne) : un héros, un salon
// ============================================================

function roomPlan(chars) {
  const { content } = app;
  const gw = app.gateway;
  const ui = app.ui;
  const hero = chars.find((c) => c.id === ui.farmChar) || null;
  const { panel: dungeon, where, fit } = dungeonPanel(hero ? [hero] : [], { title: 'Créer un salon', hint: 'Tu choisis le donjon, tes amis te rejoignent (tu pourras tout changer dans la salle d\'attente)' });

  // Les salons ouverts : la liste est relue à chaque arrivée sur l'accueil, puis chaque fois que le serveur dit qu'elle a bougé.
  if (!ui.roomsLoaded) {
    ui.roomsLoaded = true;
    gw.refreshRooms().then(() => app.screen === 'menu' && redraw());
  }
  const rows = (gw.rooms || []).map((r) => {
    const tr = content.tranches[r.setup.tranche];
    const mode = content.modes[r.setup.mode].name + (r.setup.mode === 'stasis' ? ` ${r.setup.stasisLevel}` : '');
    return h('div', { class: 'room-row', dataset: { room: r.code } },
      h('div', { class: 'room-main' },
        h('div', { class: 'room-title' }, `Salon de ${r.hostName}`),
        h('div', { class: 'muted small' }, `${content.dungeons[r.setup.dungeon]?.name || (tr ? tr.name : `Tranche ${r.setup.tranche}`)} · mode ${mode} · ${r.players}/${r.maxPlayers} joueur${plural(r.players, '', 's')}`)),
      h('div', { class: 'launch-heroes room-heroes', title: r.heroes.map((x) => `${x.name} (niv. ${x.level})`).join(', ') }, r.heroes.map((x) => portrait(x.classId, 34))),
      h('button', { class: 'btn btn-small btn-primary room-join', type: 'button', disabled: r.full || !hero, title: r.full ? 'Ce salon est complet' : hero ? '' : 'Choisis d\'abord ton héros', onClick: () => joinRoom({ id: r.id }, hero.id) }, r.full ? 'Complet' : 'Rejoindre'));
  });
  const joinWithCode = async () => {
    const code = document.getElementById('room-code')?.value.trim();
    if (!hero) return toast('Choisis d\'abord ton héros.', 'bad');
    if (!code) return toast('Écris le code du salon (5 caractères).', 'bad');
    joinRoom({ code }, hero.id);
  };
  const join = h('section', { class: 'panel join-panel' },
    h('h2', null, h('span', { class: 'step' }, '3'), 'Ou rejoindre un salon', h('small', { class: 'muted' }, 'celui d\'un ami, avec son code, ou un salon ouvert')),
    h('div', { class: 'join-code row gap' },
      h('input', { class: 'input', id: 'room-code', type: 'text', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Code du salon (5 caractères)', value: ui.joinCode || '', onInput: (e) => { ui.joinCode = e.target.value; }, onKeydown: (e) => e.key === 'Enter' && joinWithCode() }),
      h('button', { class: 'btn', id: 'room-join-code', type: 'button', onClick: joinWithCode }, 'Rejoindre')),
    h('h3', { class: 'sub' }, 'Salons ouverts'),
    rows.length ? h('div', { class: 'room-list' }, rows) : h('p', { class: 'muted' }, 'Aucun salon ouvert pour le moment. Crée le tien !'));

  const create = async () => {
    if (!hero) return toast('Choisis ton héros.', 'bad');
    play('click');
    createRoom(hero.id, { tranche: ui.setup.tranche, dungeon: ui.setup.dungeon, mode: ui.setup.mode, stasisLevel: ui.setup.stasisLevel });
  };
  const bar = launchBar({
    heroes: hero ? [hero] : [],
    who: hero ? hero.name : null,
    empty: 'Choisis ton héros',
    where, fit,
    label: 'Créer un salon', ic: 'boss', id: 'room-create', disabled: !hero, onClick: create
  });
  return { panel: [dungeon, join], bar };
}

/** La barre du bas : qui part, où, et le gros bouton. */
function launchBar({ heroes, who, empty, where, fit = null, label, ic, id = null, disabled, title = null, onClick }) {
  return h('div', { class: 'launch-bar' },
    h('div', { class: 'launch-recap' },
      heroes.length ? h('div', { class: 'launch-heroes' }, heroes.map((c) => portrait(c.classId, 38))) : null,
      h('div', { class: 'launch-info' },
        who ? h('div', { class: 'launch-who' }, who) : h('div', { class: 'launch-who muted' }, empty),
        h('div', { class: 'launch-where muted small' }, where, fit))),
    h('button', { class: 'btn btn-primary btn-xl', id, disabled, title, onClick }, icon(ic, 22), label));
}

// ============================================================
//  ② La zone de farm solo
// ============================================================

function farmPlan(chars, saved) {
  const { content } = app;
  const ui = app.ui;
  const zone = content.farm.zoneList[0];
  const r = zone.rewards;
  const selected = chars.find((c) => c.id === ui.farmChar) || null;
  const rarityName = (id) => content.rarities.find((x) => x.id === id)?.name || id;

  // ---- La zone
  const totalWeight = Object.values(r.rarityWeights).reduce((a, b) => a + b, 0);
  const chances = Object.entries(r.rarityWeights).map(([id, w]) => `${rarityName(id)} ${Math.round((100 * w) / totalWeight)} %`);
  const never = content.rarities.filter((x) => !(x.id in r.rarityWeights)).map((x) => x.name.toLowerCase());
  const heal = Math.round(zone.healBetweenWavesPct * 100);
  const facts = [
    `Des vagues de monstres de plus en plus fortes, et un boss toutes les ${zone.waves.bossEvery} vagues.`,
    `Après chaque vague tu choisis : continuer, ou partir avec ton coffre (tu récupères ${heal} % de tes PV entre deux vagues).`,
    'Si tu tombes, tu ne perds que la vague en cours : le reste est gardé.',
    `Récompenses : de l'XP jusqu'au niveau ${r.xpMaxLevel}, et des objets de niveau ${r.itemMaxLevel} au plus (${chances.join(' · ')}).${never.length ? ` Jamais d'objet ${never.join(' ni ')} ici : le meilleur équipement vient des donjons en équipe.` : ''}`
  ];
  const alerts = [];
  if (selected) {
    if (selected.level >= r.xpMaxLevel) alerts.push(['info', `${selected.name} a atteint le niveau ${r.xpMaxLevel} : cette zone ne donne plus d'XP, seulement du butin.`]);
    if (chestInfo(content, selected).full) alerts.push(['bad', 'Ton coffre est plein : ouvre-le avant de repartir.']);
  }
  const stats = selected?.stats;
  const chip = (ic, text) => h('span', { class: 'zone-chip' }, icon(ic, 15), text);

  // ---- Le farm automatique (il arrive plus tard : ici on montre seulement où en est le héros)
  const autoAch = selected ? achievementForFeature(content, selected, 'autoFarm') : null;
  let autoBody;
  if (!selected) autoBody = h('p', { class: 'muted' }, 'Choisis un héros.');
  else if (hasFeature(content, selected, 'autoFarm')) {
    autoBody = h('div', { class: 'auto-card unlocked' }, icon('check', 22),
      h('div', null, h('b', null, 'Débloqué !'), h('div', { class: 'muted small' }, `${selected.name} pourra bientôt farmer tout seul, même quand tu n'es pas là (cette fonction arrive à l'étape suivante).`)));
  } else if (autoAch) {
    const prog = achievementProgress(content, selected, autoAch);
    autoBody = h('div', { class: 'auto-card' }, icon('lock', 22),
      h('div', { class: 'auto-body' },
        h('b', null, `Verrouillé — succès « ${autoAch.name} »`),
        h('div', { class: 'muted small' }, autoAch.desc),
        progressBar(prog.raw, prog.target)));
  } else autoBody = h('p', { class: 'muted' }, 'Aucun succès ne débloque cette fonction.');

  const panel = h('section', { class: 'panel home-plan' },
    h('h2', null, h('span', { class: 'step' }, '2'), 'La zone'),
    h('div', { class: 'zone-card' },
      h('div', { class: 'zone-icon' }, icon('beast', 46)),
      h('div', { class: 'zone-body' },
        h('h3', null, zone.name),
        h('p', null, zone.description),
        h('div', { class: 'zone-chips' },
          chip('boss', `Boss toutes les ${zone.waves.bossEvery} vagues`),
          chip('heart', `${heal} % de PV rendus entre deux vagues`),
          chip('star', `XP jusqu'au niveau ${r.xpMaxLevel}`),
          chip('treasure', `Objets de niveau ${r.itemMaxLevel} au plus`)),
        h('details', { class: 'zone-more' }, h('summary', null, 'Comment ça marche ?'), h('ul', { class: 'zone-facts' }, facts.map((f) => h('li', null, f)))),
        stats ? h('div', { class: 'zone-record' }, icon('star', 16), `Record de ${selected.name} : ${stats.farmBest} vague${plural(stats.farmBest, '', 's')} · ${stats.farmWaves} vague${plural(stats.farmWaves, '', 's')} vaincue${plural(stats.farmWaves, '', 's')} au total`) : null)),
    alerts.map(([tone, text]) => h('div', { class: `farm-alert tone-${tone}` }, text)),
    h('h3', { class: 'sub' }, 'Farm automatique ', h('small', { class: 'muted' }, '(à débloquer : on ne démarre pas en roulant sur tout)')),
    autoBody);

  // ---- Lancement
  const check = selected ? canStartFarm(content, selected) : { ok: false, reason: '' };
  const launch = async () => {
    if (!selected) return toast('Choisis un héros.', 'bad');
    if (!check.ok) return toast(check.reason, 'bad');
    if (saved && !(await confirmBox({ title: 'Remplacer la partie en cours ?', text: 'Une partie est déjà en cours. La lancer écrasera sa progression.', okLabel: 'Nouvelle session', danger: true }))) return;
    play('click');
    startFarm(selected.id);
  };
  const bar = launchBar({
    heroes: selected ? [selected] : [],
    who: selected ? selected.name : null,
    empty: 'Choisis un héros',
    where: `${zone.name} · session solo`,
    label: 'Entrer dans la zone', ic: 'beast', id: 'farm-launch', disabled: !selected || !check.ok, title: check.ok ? '' : check.reason, onClick: launch
  });
  return { panel, bar };
}
