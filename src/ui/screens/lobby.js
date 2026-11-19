// ============================================================
//  lobby.js — La salle d'attente d'un salon : qui est là, quel donjon, et « prêt ! »
// ============================================================
// Jouer un donjon à plusieurs en ligne : chaque joueur amène UN héros. Ici, on attend ses amis : chacun choisit son héros et se
// déclare prêt, l'hôte règle le donjon, la difficulté et la durée d'un tour, puis lance la partie.
// L'écran se met à jour tout seul : le serveur pousse chaque changement (voir connectLive dans controller.js).

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, toast, confirmBox } from '../state.js';
import { go, leaveRoom, roomGesture, startRoom, resumeRun } from '../controller.js';
import { portrait, btn } from '../components.js';
import { assess, VERDICT, VERDICT_SENTENCE, modeEffects, plural, listFr, deNom } from '../assess.js';
import { play } from '../sound.js';
import { dungeonPicker, dungeonBrief, selectedDungeon } from './dungeons.js';

const TURN_CHOICES = [[0, 'Sans minuteur'], [30, '30 s'], [60, '60 s'], [90, '90 s'], [120, '2 min']];
const ROLE_NAMES = { tank: 'Tank', healer: 'Soigneur', damage: 'Dégâts' };

export function renderLobby(root) {
  const gw = app.gateway;
  const room = gw.room;
  if (!room) {
    go('menu');
    return;
  }
  const content = app.content;
  const me = gw.user.id;
  const host = room.hostId === me;
  const mine = room.members.find((m) => m.userId === me);
  const hostMember = room.members.find((m) => m.userId === room.hostId);
  const heroes = room.members.map((m) => m.hero).filter(Boolean);
  const setup = room.setup;
  const tranche = content.tranches[setup.tranche];
  const dungeon = selectedDungeon(setup); // (le donjon choisi par l'hôte : le premier de la tranche pour un ancien salon)
  const verdict = assess(heroes, tranche, setup.mode);
  const waiting = room.members.filter((m) => !m.ready);
  const everyoneReady = waiting.length === 0;
  // Le Stasis ne se joue qu'à plusieurs (minPlayers) : il faut assez de joueurs DIFFÉRENTS dans le salon
  const needPlayers = content.modes[room.setup.mode]?.minPlayers || 1;
  const players = new Set(room.members.map((m) => m.userId)).size;
  const tooFew = players < needPlayers;

  // ---------------- En-tête ----------------
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      toast('Code copié !', 'good');
    } catch {
      toast(`Le code du salon : ${room.code}`, 'info');
    }
  };
  const header = h('header', { class: 'menu-header lobby-header' },
    h('div', { class: 'brand' },
      h('div', { class: 'brand-mark' }, icon('boss', 34)),
      h('div', null,
        h('h1', null, 'Salle d\'attente'),
        h('p', { class: 'tagline' }, hostMember ? `Salon de ${hostMember.name}` : 'Salon'))),
    h('div', { class: 'header-actions' },
      h('button', { class: 'lobby-code', type: 'button', title: 'Copier le code du salon', onClick: copyCode }, h('span', { class: 'muted small' }, 'Code du salon'), h('b', null, room.code), icon('save', 16)),
      h('button', {
        class: 'btn btn-ghost lobby-leave', type: 'button', title: 'Quitter le salon',
        onClick: async () => {
          if (await confirmBox({ title: 'Quitter le salon ?', text: host && room.members.length > 1 ? 'Le salon reste ouvert : le joueur arrivé le premier en devient l\'hôte.' : 'Tu retournes à l\'accueil.', okLabel: 'Quitter' })) leaveRoom();
        }
      }, icon('close', 18), h('span', { class: 'btn-label' }, 'Quitter'))));

  // ---------------- ① Les joueurs ----------------
  const memberCard = (m) => {
    const isHost = m.userId === room.hostId;
    const cls = m.hero ? content.classes[m.hero.classId] : null;
    return h('div', { class: `lobby-member ${m.userId === me ? 'is-me' : ''} ${m.ready ? 'is-ready' : ''}`, dataset: { user: m.userId } },
      m.hero ? portrait(m.hero.classId, 56) : h('div', { class: 'portrait' }, icon('unknown', 24)),
      h('div', { class: 'lobby-member-body' },
        h('div', { class: 'char-name' }, m.hero ? m.hero.name : 'Aucun héros'),
        cls ? h('div', { class: 'char-class muted' }, `${cls.name} · niv. ${m.hero.level}`, h('span', { class: `role-tag role-${cls.role}` }, ROLE_NAMES[cls.role])) : null,
        h('div', { class: 'lobby-who small' },
          h('span', { class: `presence ${m.online ? 'on' : ''}`, title: m.online ? 'En ligne' : 'Hors ligne' }),
          isHost ? icon('boss', 14) : null,
          h('span', null, m.name, m.userId === me ? ' (toi)' : ''),
          isHost ? h('span', { class: 'muted' }, ' · hôte') : null)),
      h('div', { class: 'lobby-member-side' },
        m.ready ? h('span', { class: 'ready-chip on' }, icon('check', 14), isHost ? 'Hôte' : 'Prêt') : h('span', { class: 'ready-chip' }, 'Pas prêt'),
        host && !isHost ? h('button', {
          class: 'btn btn-small btn-ghost kick-btn', type: 'button', title: `Retirer ${m.name} du salon`,
          onClick: async () => { if (await confirmBox({ title: `Retirer ${m.name} ?`, text: 'Il retourne à l\'accueil et pourra rejoindre le salon avec le code.', okLabel: 'Retirer', danger: true })) roomGesture('kick', m.userId); }
        }, 'Retirer') : null));
  };
  const slots = [...room.members.map(memberCard)];
  for (let i = room.members.length; i < room.maxPlayers; i++) slots.push(h('div', { class: 'lobby-member is-empty' }, icon('plus', 22), h('span', { class: 'muted' }, 'En attente d\'un joueur...')));

  // Mon héros : celui qui part avec le groupe (un seul par joueur)
  const myHeroes = app.profile.characters;
  const heroPicker = room.status === 'lobby' && myHeroes.length > 1
    ? h('div', { class: 'lobby-pick' },
        h('h3', { class: 'sub' }, 'Mon héros', h('small', { class: 'muted' }, 'un seul par joueur')),
        h('div', { class: 'lobby-heroes' }, myHeroes.map((c) => h('button', {
          class: `lobby-hero ${mine?.hero?.id === c.id ? 'selected' : ''}`, type: 'button', 'aria-pressed': mine?.hero?.id === c.id, dataset: { char: c.id },
          onClick: () => { if (mine?.hero?.id !== c.id) { play('click'); roomGesture('hero', c.id); } }
        }, portrait(c.classId, 40), h('span', { class: 'lobby-hero-name' }, c.name), h('span', { class: 'muted small' }, `niv. ${c.level}`)))))
    : null;

  const shareHint = room.members.length < room.maxPlayers
    ? h('p', { class: 'muted small share-hint' }, icon('user', 14), ` Invite tes amis : ils entrent le code ${room.code} dans « Rejoindre un salon » sur l'accueil, ou te trouvent dans la liste des salons ouverts.`)
    : null;

  const panelPlayers = h('section', { class: 'panel home-heroes lobby-players' },
    h('h2', null, h('span', { class: 'step' }, '1'), 'Les joueurs', h('small', { class: 'muted' }, `${room.members.length} sur ${room.maxPlayers}`)),
    h('div', { class: 'lobby-list' }, slots),
    heroPicker,
    shareHint);

  // ---------------- ② La partie ----------------
  const modeOpt = (key) => {
    const m = content.modes[key];
    const sel = setup.mode === key;
    return h('button', { class: `mode-opt ${sel ? 'on' : ''}`, type: 'button', 'aria-pressed': sel, title: m.short, disabled: !host, onClick: () => { if (host && !sel) { play('click'); roomGesture('setup', { mode: key }); } } }, m.name);
  };
  const stasisLevels = content.modes.stasis.levels || [];
  const turnLabel = (TURN_CHOICES.find(([s]) => s === setup.turnSeconds) || [0, `${setup.turnSeconds} s`])[1];
  const modeName = content.modes[setup.mode].name + (setup.mode === 'stasis' ? ` ${setup.stasisLevel}` : '');

  const setupBlock = host
    ? [
        dungeonPicker({ team: heroes, mode: setup.mode, selectedId: dungeon?.id, onPick: (d) => { play('click'); roomGesture('setup', { dungeon: d.id }); } }),
        dungeonBrief(dungeon),
        h('h3', { class: 'sub' }, 'Difficulté'),
        h('div', { class: 'mode-block' },
          h('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Difficulté' }, ['basic', 'tranche', 'stasis'].map(modeOpt)),
          setup.mode === 'stasis'
            ? h('div', { class: 'row gap center wrap stasis-levels' }, h('span', null, 'Niveau de stasis :'), stasisLevels.map((l) => h('button', {
                class: `chip-btn ${setup.stasisLevel === l.level ? 'on' : ''}`, type: 'button', onClick: () => roomGesture('setup', { stasisLevel: l.level })
              }, l.level)))
            : null,
          h('p', { class: 'mode-desc' }, content.modes[setup.mode].short),
          h('p', { class: 'muted small' }, 'Effets : ' + modeEffects(setup)),
          tooFew ? h('div', { class: 'farm-alert tone-bad lobby-stasis-note' }, `Le Stasis se joue à plusieurs : il faut au moins ${needPlayers} joueurs dans le salon (vous êtes ${players}).`) : null),
        h('h3', { class: 'sub' }, 'Durée d\'un tour', h('small', { class: 'muted' }, 'au bout de ce temps, le pilote automatique joue à la place d\'un joueur qui ne répond pas')),
        h('div', { class: 'mode-switch turn-switch', role: 'group', 'aria-label': 'Durée d\'un tour' }, TURN_CHOICES.map(([secs, label]) => h('button', {
          class: `mode-opt ${setup.turnSeconds === secs ? 'on' : ''}`, type: 'button', 'aria-pressed': setup.turnSeconds === secs, dataset: { turn: secs },
          onClick: () => { if (setup.turnSeconds !== secs) { play('click'); roomGesture('setup', { turnSeconds: secs }); } }
        }, label)))
      ]
    : [
        dungeonPicker({ team: heroes, mode: setup.mode, selectedId: dungeon?.id, canPick: false, only: dungeon }),
        dungeonBrief(dungeon),
        h('p', { class: 'mode-desc' }, h('b', null, `Difficulté : ${modeName}`), ' — ', content.modes[setup.mode].short),
        h('p', { class: 'muted small' }, 'Effets : ' + modeEffects(setup)),
        h('p', null, icon('timer', 16), ' ', setup.turnSeconds ? `Tours de ${turnLabel} : passé ce délai, le pilote automatique joue à la place d'un joueur qui ne répond pas.` : 'Pas de minuteur : on attend chaque joueur.'),
        h('p', { class: 'muted small' }, 'L\'hôte règle la partie ; tu peux seulement choisir ton héros et te déclarer prêt.')
      ];

  const danger = heroes.length
    ? h('div', { class: `danger danger-${verdict.level}` }, h('strong', null, VERDICT_SENTENCE[verdict.level]), verdict.notes.length ? h('ul', null, verdict.notes.map((n) => h('li', null, n))) : null)
    : null;

  const panelSetup = h('section', { class: 'panel home-plan lobby-setup' },
    h('h2', null, h('span', { class: 'step' }, '2'), host ? 'Le donjon' : 'Le donjon choisi par l\'hôte', h('small', { class: 'muted' }, host ? 'tu règles la partie pour tout le groupe' : '')),
    ...setupBlock,
    danger);

  // ---------------- La barre du bas ----------------
  let bar;
  if (room.status === 'running') {
    bar = h('div', { class: 'launch-bar' },
      h('div', { class: 'launch-recap' }, h('div', { class: 'launch-info' }, h('div', { class: 'launch-who' }, 'La partie a commencé !'))),
      h('button', { class: 'btn btn-primary btn-xl', id: 'lobby-join-run', onClick: () => resumeRun() }, icon('d20', 22), 'Rejoindre la partie'));
  } else if (host) {
    const names = waiting.map((m) => m.name);
    bar = h('div', { class: 'launch-bar' },
      h('div', { class: 'launch-recap' },
        h('div', { class: 'launch-heroes' }, heroes.map((hero) => portrait(hero.classId, 38))),
        h('div', { class: 'launch-info' },
          h('div', { class: 'launch-who' }, everyoneReady ? `${room.members.length} joueur${plural(room.members.length, '', 's')} prêt${plural(room.members.length, '', 's')}` : `En attente ${deNom(listFr(names))}`),
          h('div', { class: 'launch-where muted small' }, `${dungeon ? dungeon.name : tranche.name} · mode ${modeName}`, heroes.length ? h('span', { class: `fit fit-${verdict.level}` }, icon(VERDICT[verdict.level].ic, 14), VERDICT[verdict.level].label) : null))),
      h('button', {
        class: 'btn btn-primary btn-xl', id: 'lobby-start', disabled: !everyoneReady || tooFew,
        title: tooFew ? `Le Stasis se joue à ${needPlayers} joueurs au moins.` : everyoneReady ? '' : `Il faut attendre ${listFr(names)}`,
        onClick: () => { play('click'); startRoom(); }
      }, icon('d20', 22), 'Lancer la partie'));
  } else {
    const ready = !!mine?.ready;
    bar = h('div', { class: 'launch-bar' },
      h('div', { class: 'launch-recap' },
        h('div', { class: 'launch-heroes' }, heroes.map((hero) => portrait(hero.classId, 38))),
        h('div', { class: 'launch-info' },
          h('div', { class: 'launch-who' }, ready ? 'Tu es prêt' : 'Quand ton héros est choisi, dis que tu es prêt'),
          h('div', { class: 'launch-where muted small' }, `${dungeon ? dungeon.name : tranche.name} · mode ${modeName} · l'hôte lance la partie`))),
      h('button', { class: `btn btn-xl ${ready ? '' : 'btn-primary'}`, id: 'lobby-ready', onClick: () => { play('click'); roomGesture('ready', !ready); } },
        icon(ready ? 'close' : 'check', 22), ready ? 'Pas encore prêt' : 'Je suis prêt'));
  }

  root.append(h('div', { class: 'menu lobby' },
    header,
    room.status === 'running' ? h('div', { class: 'banner banner-gold' }, h('strong', null, 'La partie a commencé.'), btn('Rejoindre la partie', () => resumeRun(), { cls: 'btn-primary' })) : null,
    h('div', { class: 'home-grid' }, panelPlayers, h('div', { class: 'home-right' }, panelSetup)),
    bar));
}
