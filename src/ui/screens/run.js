// ============================================================
//  run.js — L'écran de jeu : plateau, équipe, scène du tour, combat, journal
// ============================================================
// Cet écran ne contient AUCUNE règle de jeu. Il lit `app.run` (l'état du moteur)
// et dessine ce que le moteur attend (`run.pending`) :
//   advance -> bouton Avancer     roll   -> bouton Lancer le D20
//   choice  -> boutons de choix   shop   -> le marchand
//   combat  -> frise, rangs, PA et compétences     end -> la run est finie

import { h, mount } from '../dom.js';
import { icon, tileIcon } from '../icons.js';
import { app, openModal, confirmBox, persistProfile, toast } from '../state.js';
import { act, abandon, go, redraw, reloadContent, leaveRoom } from '../controller.js';
import { inRoom, isMine, isMyTurn, isWatching, ownerOf, turnSecondsOf } from '../turn.js';
import { deNom } from '../assess.js';
import { portrait, monsterPortrait, paFlames, progressBar } from '../components.js';
import { equipmentView, afterEquipRender } from '../gear.js';
import { hotkeyIndex, keyLabel, learnKey, detectKeyboardLayout, HOTKEY_COUNT } from '../keys.js';
import { unitEffects, byDanger, turnsText } from '../status.js';
import { itemCard, hpBar, levelText, statusChip, effectChip, tone as toneClass, skillBlurb, resourceName, diceStrip, skillIconName, skillKind, riskBar } from '../format.js';
import { play, setSoundEnabled, isSoundEnabled } from '../sound.js';
import { resolveMode } from '../fx.js';
import { vignetteSvg, sceneCss, sceneIdFor } from '../art.js';
import {
  computeStats, getCombatView, skillOf, activeSkillIds, checkUsable, needsPick, validTargets, skillWorksOutside,
  itemPrice, shopPrice, sellPrice, canBeRevived, wornFor, unitById, totalShield, otherRow, rarityOf, waveInfo, farmZone, choiceTier, previewXpCapped, campDeckOptions
} from '../../core/index.js';

const ROW_NAME = { front: 'avant', back: 'arrière' };

const playerById = (run, id) => run.players.find((p) => p.id === id);
const currentTileOf = (run) => run.dungeon.board[run.dungeon.position] || null;
const maxHp = (run, u) => computeStats(run, u).hpMax;

// ---------------- À plusieurs (en ligne) ----------------
// Dans un salon, chacun ne contrôle que SON héros : l'écran grise ce qui n'est pas à lui (le serveur refuse de toute façon).
// Hors salon (solo, jeu local), tout est à toi : ces aides répondent « oui » à tout.

/** À moi de décider maintenant ? */
const yourTurn = (run) => !inRoom(run) || isMyTurn(run);

/** Qui contrôle ce héros ? { me, auto, name, online }, ou null hors salon. `auto` : son joueur est parti, le pilote automatique le joue. */
function controllerOf(run, playerId) {
  const o = ownerOf(run, playerId);
  if (!o) return null;
  if (o.userId === null) return { me: false, auto: true, name: 'Pilote automatique', online: true };
  const live = app.gateway.room?.members?.find((m) => m.userId === o.userId);
  return { me: o.userId === run.net.me, auto: false, name: o.userName || '?', online: live ? live.online !== false : true };
}

/** La petite ligne « Ton héros » / « Joué par Alice » / « Pilote automatique » (rien hors salon). */
function ownerTag(run, playerId, cls = 'owner-tag') {
  const who = controllerOf(run, playerId);
  if (!who) return null;
  const label = who.me ? 'Ton héros' : who.auto ? 'Pilote automatique' : who.name;
  return h('div', { class: `${cls} ${who.me ? 'is-me' : ''} ${who.auto ? 'is-auto' : ''}`, title: who.me ? 'Ce héros est à toi' : who.auto ? 'Son joueur est parti : le pilote automatique le joue' : `Ce héros est joué par ${who.name}${who.online ? '' : ' (hors ligne)'}` },
    who.auto ? icon('skip', 13) : h('span', { class: `presence ${who.me || who.online ? 'on' : ''}` }),
    h('span', null, who.me || who.auto ? label : `Joué par ${label}`));
}

/** Hors combat, à plusieurs : le bandeau « c'est à toi ! » / « on attend Alice », avec le décompte du tour. */
function turnBanner(run) {
  if (!inRoom(run) || run.phase === 'ended' || !run.pending?.actor) return null;
  const actor = playerById(run, run.pending.actor);
  const who = actor && controllerOf(run, actor.id);
  if (!who) return null;
  const secs = turnSecondsOf(run, app.profile);
  const lead = who.me ? "C'est à toi de jouer !" : who.auto ? `${actor.name} joue en pilote automatique` : `En attente ${deNom(who.name)}`;
  const sub = who.me ? `${actor.name} est sous les projecteurs.`
    : who.auto ? 'Son joueur est parti.'
      : `${actor.name} est sous les projecteurs${who.online ? '' : ' (hors ligne : le pilote automatique prendra le relais)'}.`;
  return h('div', { class: `turn-banner ${who.me ? 'mine' : 'theirs'}`, id: 'turn-banner', role: 'status', dataset: { actor: actor.id } },
    icon(who.me ? 'flame' : who.auto ? 'skip' : 'eye', 24),
    h('div', { class: 'turn-banner-text' }, h('b', null, lead), h('span', { class: 'muted small' }, sub)),
    secs ? h('div', { class: 'turn-timer', title: 'Temps restant pour ce tour' }, h('div', { class: 'timer-bar' }, h('div', { class: 'timer-fill' })), h('span', { class: 'timer-text' }, `${secs} s`)) : null);
}

// ============================================================
//  Dessin principal
// ============================================================

export function renderRun(root) {
  const run = app.run;
  if (!run) return go('menu');

  // Les petits réglages d'écran (cible choisie...) sont remis à zéro quand le moteur attend autre chose.
  const sig = [run.pending?.kind, run.pending?.actor, run.pending?.subtype, run.turn, run.combat?.round, run.combat?.turn, run.dungeon.position].join('|');
  if (app.ui.sig !== sig) app.ui = { sig };

  const inCombat = !!run.combat && run.phase === 'combat';
  // Le plateau du donjon passe DANS l'en-tête pendant un combat (une seule ligne de « décor » en haut :
  // toute la hauteur de l'écran sert au champ de bataille). L'atelier et le farm gardent leur barre juste dessous.
  const bar = run.training ? trainingBar(run) : run.farm ? farmBar(run) : boardStrip(run, inCombat);
  const merged = inCombat && !run.training && !run.farm;
  root.append(
    h('div', { class: `run ${inCombat ? 'in-combat' : ''} ${run.training ? 'is-training' : ''} ${run.farm ? 'is-farm' : ''} ${inRoom(run) ? 'in-room' : ''} ${isWatching(run) ? 'is-watching' : ''}` },
      runHeader(run, merged ? bar : null),
      merged ? null : bar,
      inCombat
        ? h('main', { class: 'combat-main' }, scene(run))
        : h('div', { class: 'run-layout' },
            h('aside', { class: 'col-party' }, partyPanel(run)),
            h('main', { class: 'col-scene' }, scene(run)),
            h('aside', { class: 'col-log' }, logPanel(run)))));
  bindKeys();

  // Journal : toujours défiler jusqu'à la dernière ligne ; plateau réduit : centré sur la case où se trouve le groupe
  requestAnimationFrame(() => {
    const el = document.querySelector('.log-list');
    if (el) el.scrollTop = el.scrollHeight;
    const board = document.querySelector('.board.compact');
    const cur = board && board.querySelector('.tile.current');
    if (cur) board.scrollLeft = cur.offsetLeft - (board.clientWidth - cur.offsetWidth) / 2;
    const track = document.querySelector('.tl-track');
    const now = track && track.querySelector('.tl-chip.current');
    if (now) track.scrollLeft = now.offsetLeft - (track.clientWidth - now.offsetWidth) / 2;
    fitStage();
  });
}

// ---------------- En-tête ----------------

function runHeader(run, middle = null) {
  const c = app.content;
  const room = inRoom(run) ? run.net.room : null;
  const secs = room ? turnSecondsOf(run, app.profile) : app.profile.settings.turnSeconds || 0;
  const mode = c.modes[run.setup.mode].name + (run.setup.stasisLevel ? ` ${run.setup.stasisLevel}` : '');
  const isHost = !!room && room.hostId === run.net.me;
  const running = run.phase !== 'ended' && !run.training;
  return h('header', { class: `run-header ${middle ? 'has-middle' : ''}` },
    h('div', { class: 'run-title' },
      h('h1', null, run.training ? 'Atelier de classes' : run.dungeon.name),
      h('div', { class: 'muted' }, run.training ? 'Teste tes compétences sur des mannequins immortels' : run.farm ? `Zone de farm solo · Vague ${run.farm.wave}` : `${room ? `Salon ${room.code} · ` : ''}Tranche ${run.setup.tranche} · Mode ${mode} · Tour ${run.turn + 1}`)),
    middle,
    h('div', { class: 'run-stats' },
      run.training ? null : run.farm
        ? h('div', { class: 'gold farm-gains', title: 'Gagné pendant cette session (gardé si tu pars ou si tu tombes après la vague)' }, icon('flame', 20), h('b', null, `${run.farm.shards || 0} éclat${(run.farm.shards || 0) > 1 ? 's' : ''}${run.farm.xp ? ` · ${run.farm.xp} XP` : ''}`))
        : h('div', { class: 'gold', title: "Or de la run (perdu à la fin, sauf s'il est dépensé)" }, icon('coin', 20), h('b', null, run.gold)),
      run.bonus.rollMod
        ? h('div', { class: `mod-badge ${run.bonus.rollMod > 0 ? 'up' : 'down'}`, title: 'Bonus/malus du fantôme sur le prochain jet' }, icon('ghost', 16), `${run.bonus.rollMod > 0 ? '+' : ''}${run.bonus.rollMod} au prochain jet`)
        : null,
      room
        ? h('span', { class: 'turn-pill', id: 'turn-pill', title: secs ? `Chaque tour dure ${secs} s : passé ce délai, le pilote automatique joue à la place du joueur qui ne répond pas.` : 'Pas de minuteur : on attend chaque joueur.' }, icon('timer', 16), secs ? `${secs} s` : 'Sans minuteur')
        : h('button', {
            class: `btn btn-ghost ${secs ? 'btn-on' : ''}`, title: 'Minuteur de tour : le tour se termine tout seul quand le temps est écoulé',
            onClick: () => { app.profile.settings.turnSeconds = secs ? 0 : c.rules.combat.turnSeconds; persistProfile(); redraw(); }
          }, icon('timer', 18), secs ? `${secs} s` : 'Minuteur'),
      fxButton(),
      h('button', {
        class: 'btn btn-ghost btn-icon', title: isSoundEnabled() ? 'Couper le son' : 'Activer le son', 'aria-label': 'Son',
        onClick: () => { app.profile.settings.sound = !isSoundEnabled(); setSoundEnabled(app.profile.settings.sound); persistProfile(); redraw(); }
      }, icon(isSoundEnabled() ? 'sound_on' : 'sound_off', 20)),
      room && running
        ? h('button', {
            class: 'btn btn-ghost', id: 'room-leave', title: 'Quitter la partie : ton héros reste dans le donjon, joué par le pilote automatique',
            onClick: async () => {
              if (await confirmBox({ title: 'Quitter la partie ?', text: 'Ton héros reste dans le donjon : le pilote automatique le joue pour ne pas laisser le groupe en plan. Tu ne pourras pas revenir, et tu ne gagneras ni XP ni butin.', okLabel: 'Quitter', danger: true })) leaveRoom();
            }
          }, 'Quitter')
        : null,
      running && (!room || isHost)
        ? h('button', {
            class: 'btn btn-ghost', id: 'run-abandon',
            onClick: async () => {
              if (run.farm) {
                if (await confirmBox({ title: 'Quitter la zone ?', text: 'Tu repars avec ce que tu as déjà gagné dans les vagues précédentes. La vague en cours ne rapporte rien.', okLabel: 'Quitter la zone', danger: true })) abandon();
              } else if (room) {
                if (await confirmBox({ title: 'Abandonner la partie ?', text: "La partie s'arrête pour TOUT le groupe : la progression et le butin non récupéré sont perdus. Vos personnages ne sont pas touchés.", okLabel: 'Abandonner pour tous', danger: true })) abandon();
              } else if (await confirmBox({ title: 'Abandonner la run ?', text: 'Tu perds la progression de cette run et le butin non récupéré. Tes personnages ne sont pas touchés.', okLabel: 'Abandonner', danger: true })) abandon();
            }
          }, run.farm ? 'Quitter la zone' : 'Abandonner')
        : null));
}

/** Le bouton « Animations » : complètes → rapides → réduites. (« Réduites » : les chiffres, les barres de vie et les sons, sans mouvement.) */
const FX_MODES = {
  full: ['bolt', 'Animations complètes'],
  fast: ['wind', 'Animations rapides'],
  min: ['moon', 'Animations réduites']
};
const FX_NEXT = { full: 'fast', fast: 'min', min: 'full' };
function fxButton() {
  const mode = resolveMode(app.profile.settings.fx);
  const [ic, label] = FX_MODES[mode];
  return h('button', {
    class: 'btn btn-ghost btn-icon', id: 'fx-toggle', title: `${label} — cliquer pour changer (un clic pendant une animation la saute)`, 'aria-label': label,
    onClick: () => {
      const next = FX_NEXT[mode];
      app.profile.settings.fx = next;
      persistProfile();
      toast(FX_MODES[next][1], 'info');
      redraw();
    }
  }, icon(ic, 20));
}

/** La barre de l'atelier : statistiques de test et boutons. */
function trainingBar(run) {
  const dealt = run.players.reduce((s, p) => s + p.stats.damageDealt, 0);
  const healed = run.players.reduce((s, p) => s + p.stats.healingDone, 0);
  const rounds = Math.max(1, run.combat ? run.combat.round : 1);
  return h('div', { class: 'card training-bar' },
    h('div', { class: 'training-stats' },
      h('div', null, h('span', { class: 'muted' }, 'Dégâts infligés'), h('b', null, dealt)),
      h('div', null, h('span', { class: 'muted' }, 'Soins et boucliers'), h('b', null, healed)),
      h('div', null, h('span', { class: 'muted' }, 'Round'), h('b', null, rounds)),
      h('div', null, h('span', { class: 'muted' }, 'Dégâts par round'), h('b', null, (dealt / rounds).toFixed(1)))),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn', title: 'PV, PA, délais et mannequins remis à neuf', onClick: () => act({ type: 'TRAINING_RESET' }) }, icon('refresh', 16), 'Réinitialiser'),
      h('button', { class: 'btn', title: 'Relit les fichiers JSON (sans recharger la page) et refait la salle', onClick: () => reloadContent() }, icon('flask', 16), 'Recharger les JSON'),
      h('button', { class: 'btn btn-primary', onClick: () => act({ type: 'END_TRAINING' }) }, 'Quitter l\'atelier')));
}

// ---------------- Zone de farm ----------------

/** La barre du haut en farm : où on en est, ce que la session a rapporté, le prochain boss. */
function farmBar(run) {
  const f = run.farm;
  const zone = farmZone(run);
  const info = waveInfo(zone, f.wave);
  const nextBossIn = zone.waves.bossEvery - (f.wave % zone.waves.bossEvery);
  const tier = choiceTier(zone, f.cleared);
  return h('div', { class: 'card farm-bar' },
    h('div', { class: 'farm-wave' },
      h('span', { class: 'muted' }, 'Vague'),
      h('b', null, f.wave),
      info.boss ? h('span', { class: 'chip chip-bad' }, 'BOSS') : null),
    h('div', { class: 'farm-stat' }, h('span', { class: 'muted' }, 'Vaincues'), h('b', null, f.cleared)),
    f.xpCap > run.players[0].realLevel ? h('div', { class: 'farm-stat' }, h('span', { class: 'muted' }, 'XP gagnée'), h('b', null, f.xp)) : null,
    h('div', { class: 'farm-stat' }, h('span', { class: 'muted' }, 'Éclats'), h('b', null, f.shards || 0)),
    h('div', { class: 'farm-stat', title: 'La qualité des objets au choix en fin de session' }, h('span', { class: 'muted' }, 'Récompense'), h('b', null, tier ? `palier ${zone.rewards.choiceTiers.indexOf(tier) + 1}` : '—')),
    h('div', { class: 'farm-stat grow' },
      info.boss ? h('span', { class: 'tone-bad' }, 'Le gardien de la zone est là !') : h('span', { class: 'muted' }, `Prochain boss : dans ${nextBossIn} vague${nextBossIn > 1 ? 's' : ''}`),
      null));
}

/** Entre deux vagues : le bilan de la vague, puis « vague suivante » ou « s'arrêter » (et choisir sa récompense). */
function sceneFarmBreak(run) {
  const c = app.content;
  const f = run.farm;
  const zone = farmZone(run);
  const p = run.players[0];
  const last = f.last;
  const next = waveInfo(zone, f.wave + 1);
  const cap = f.xpCap || 0;
  const catchUp = cap > p.realLevel;
  const preview = catchUp ? previewXpCapped(c, { level: p.realLevel, xp: p.xpStart }, f.xp, cap) : null;
  const tiers = zone.rewards.choiceTiers;
  const tier = choiceTier(zone, f.cleared);
  const nextTier = tiers.find((t) => t.waves > f.cleared);
  const rarName = (id) => c.rarities.find((x) => x.id === id)?.name.toLowerCase() || id;
  const best = tier ? Object.keys(tier.rarityWeights).sort((a, b) => c.rarityIndex[b] - c.rarityIndex[a])[0] : null;
  const stats = computeStats(run, p);
  const nextText = next.boss
    ? 'La prochaine vague est le BOSS de la zone : le gardien, bien plus costaud.'
    : `Prochaine vague : ${next.count} monstre${next.count > 1 ? 's' : ''}, un peu plus fort${next.count > 1 ? 's' : ''} que la précédente.`;
  const tools = outOfCombatTools(run);
  return [
    h('div', { class: 'card farm-break' },
      h('h2', null, icon('check', 24), `Vague ${last.wave} vaincue !`),
      h('div', { class: 'wave-gains' },
        h('div', null, h('span', { class: 'muted' }, 'Éclats de la vague'), h('b', null, `+${last.shards || 0}`)),
        h('div', null, h('span', { class: 'muted' }, 'Éclats de la session'), h('b', null, f.shards || 0)),
        catchUp ? h('div', null, h('span', { class: 'muted' }, 'XP de la session'), h('b', null, f.xp)) : null),
      catchUp
        ? (preview.level > p.realLevel ? h('p', { class: 'tone-good small' }, `Rattrapage : ${p.name} passera niveau ${preview.level} à la fin de la session !`)
            : preview.capped ? h('p', { class: 'tone-info small' }, `Rattrapage terminé : ${p.name} a rejoint le niveau ${cap} de ton meilleur héros.`) : null)
        : null,
      h('div', { class: `farm-tier ${last.tierUp ? 'is-up' : ''}` }, icon('treasure', 18),
        h('span', null, last.tierUp ? h('b', null, 'Ta récompense s\'améliore ! ') : null,
          `En t'arrêtant maintenant : 1 objet au choix parmi ${zone.rewards.choiceCount}, jusqu'à ${rarName(best)}.`,
          nextTier ? h('span', { class: 'muted' }, ` Encore ${nextTier.waves - f.cleared} vague${nextTier.waves - f.cleared > 1 ? 's' : ''} pour un meilleur palier.`) : null)),
      h('div', { class: 'farm-hp' },
        h('span', { class: 'muted' }, `${p.name} :`), hpBar(p.hp, stats.hpMax)),
      h('p', { class: next.boss ? 'tone-bad' : 'muted' }, nextText),
      h('div', { class: 'row gap wrap farm-actions' },
        h('button', { class: `btn btn-xl ${next.boss ? '' : 'btn-primary'}`, id: 'farm-next', onClick: () => { play('click'); act({ type: 'FARM_NEXT' }); } }, icon('combat', 22), next.boss ? 'Affronter le boss' : 'Vague suivante'),
        h('button', { class: `btn btn-xl ${next.boss ? 'btn-primary' : ''}`, id: 'farm-stop', onClick: () => { play('click'); act({ type: 'FARM_STOP' }); } }, icon('treasure', 22), 'M\'arrêter et choisir'))),
    tools // peut être null (ni soin ni potion) : on ne l'ajoute alors pas
  ].filter(Boolean);
}

// ---------------- Plateau ----------------

function boardStrip(run, compact = false) {
  const c = app.content;
  const pos = run.dungeon.position;
  const tiles = run.dungeon.board.map((tile) => {
    const def = c.tiles[tile.type];
    const isCurrent = tile.index === pos;
    const passed = tile.index < pos || (isCurrent && tile.resolved);
    const showType = tile.revealed || tile.type === 'boss';
    const cls = ['tile', passed ? 'passed' : '', isCurrent ? 'current' : '', showType ? `type-${tile.type}` : 'hidden', tile.type === 'boss' ? 'is-boss' : '', tile.index === pos + 1 ? 'next' : ''].filter(Boolean).join(' ');
    return h('div', { class: cls, title: showType ? def.name : 'Case inconnue' },
      isCurrent ? h('div', { class: 'party-token', title: 'Votre groupe' }, icon('start', 14)) : null,
      icon(showType ? def.icon : 'unknown', 26),
      passed ? h('span', { class: 'tile-check' }, icon('check', 12)) : null,
      h('span', { class: 'tile-num' }, tile.type === 'boss' ? 'Boss' : tile.index + 1));
  });
  return h('div', { class: `board ${compact ? 'compact' : ''}`, role: 'list', 'aria-label': 'Plateau du donjon' }, tiles);
}

// ============================================================
//  Équipe (hors combat)
// ============================================================

function partyPanel(run) {
  return [h('h2', { class: 'col-title' }, 'Équipe'), ...run.players.map((p) => unitCard(run, p))];
}

function unitCard(run, p) {
  const c = app.content;
  const pend = run.pending;
  const stats = computeStats(run, p);
  const decider = pend && pend.actor === p.id;
  const mine = isMine(run, p.id); // (à plusieurs : seul le joueur de ce héros ouvre son sac ou fait agir son fantôme)
  const canManage = mine && !run.combat && run.phase !== 'ended' && !run.farm;
  const ghostBtns = ghostButtons(run, p);

  return h('div', {
    class: `unit player ${p.alive ? '' : 'is-ghost'} ${decider ? 'spotlight' : ''} ${inRoom(run) && mine ? 'mine' : ''}`,
    dataset: { unit: p.id },
    title: `PV ${p.hp}/${stats.hpMax} · Att ${stats.atk.toFixed(1)} · Déf ${stats.def.toFixed(1)}${stats.heal ? ` · Soin ${stats.heal.toFixed(1)}` : ''} · ${stats.pa} PA`
  },
    decider && run.phase !== 'ended' ? h('div', { class: 'spot-tag' }, 'Sous les projecteurs') : null,
    h('div', { class: 'unit-top' },
      portrait(p.classId, 40, p.alive ? '' : 'ghostly'),
      h('div', { class: 'unit-id' },
        h('div', { class: 'unit-name' }, p.name, p.resurrected && p.alive ? h('span', { class: 'chip chip-info', title: 'Déjà ressuscité cette run' }, 'revenu') : null),
        h('div', { class: 'muted small' }, `${c.classes[p.classId].name} · ${levelText(p)}`),
        ownerTag(run, p.id))),
    p.alive
      ? hpBar(p.hp, stats.hpMax)
      : h('div', { class: 'ghost-note' }, icon('ghost', 16), p.resurrected ? 'Fantôme (déjà ressuscité une fois)' : 'Fantôme — peut encore aider'),
    p.alive && (p.statuses.length || p.campBuffs?.length)
      ? h('div', { class: 'chips' }, p.statuses.map(statusChip), unitEffects(c, p).filter((e) => e.kind === 'camp').map((e) => effectChip(e))) // (+ les bonus du feu de camp)
      : null,
    p.hpMaxPenalty ? h('div', { class: 'small tone-bad' }, `PV max -${Math.round(p.hpMaxPenalty * 100)} % (jusqu'à la fin de la run)`) : null,
    p.cursedUid ? h('div', { class: 'small tone-bad' }, icon('curse', 12), ' Un objet est maudit') : null,
    ghostBtns.length ? h('div', { class: 'row gap wrap' }, ghostBtns) : null,
    canManage ? h('button', { class: 'btn btn-small', onClick: (e) => { e.stopPropagation(); openInventory(p.id); } }, `Sac (${p.bag.length})`) : null);
}

/** Les boutons d'aide d'un fantôme (bénir, gêner, éclairer). */
function ghostButtons(run, p) {
  const pend = run.pending;
  const out = [];
  if (p.alive || p.ghostActed || !pend || !['advance', 'roll', 'combat'].includes(pend.kind) || !isMine(run, p.id)) return out;
  const next = run.dungeon.board[run.dungeon.position + 1];
  const g = (mode, label, title) => h('button', { class: 'btn btn-small btn-ghostly', title, onClick: (e) => { e.stopPropagation(); act({ type: 'GHOST', playerId: p.id, mode }); } }, label);
  out.push(g('bless', 'Bénir +2', 'Lance ton D20 : 8+ donne +2 au prochain jet (un 1 se retourne contre toi)'));
  out.push(g('hinder', 'Gêner −2', 'Lance ton D20 : 8+ donne −2 au prochain jet'));
  if (pend.kind === 'advance' && next && !next.revealed) out.push(g('light', 'Éclairer', 'Lance ton D20 : 8+ révèle la prochaine case'));
  return out;
}

// ============================================================
//  Journal
// ============================================================

function logPanel(run) {
  const lines = run.log.slice(-150);
  return [
    h('h2', { class: 'col-title' }, 'Journal'),
    h('div', { class: 'log-list' }, lines.map((l) => h('div', { class: `log-line k-${l.kind}` }, l.text)))
  ];
}

// ============================================================
//  Scène centrale
// ============================================================

function tileCard(run, tile) {
  const def = app.content.tiles[tile.type];
  // L'illustration de la case : une vraie image si data/tiles.json en donne une (champ `art`), sinon la vignette dessinée du jeu.
  const art = def.art ? h('img', { class: 'tile-art-img', src: def.art, alt: '', loading: 'lazy' }) : vignetteSvg(tile.type);
  return h('div', { class: `tile-card type-${tile.type} ${art ? 'has-art' : ''}`.trim() },
    art ? h('div', { class: 'tile-art', 'aria-hidden': 'true', html: typeof art === 'string' ? art : null }, typeof art === 'string' ? null : art) : null,
    h('div', { class: 'tile-card-body' },
      h('div', { class: 'tile-card-icon' }, icon(def.icon, art ? 36 : 56)),
      h('div', null,
        h('h2', null, def.name),
        h('p', { class: 'flavor' }, def.flavor[tile.flavor] || ''))));
}

function headlineBanner(run) {
  if (!run.headline) return null;
  return h('div', { class: `headline ${toneClass(run.headline.tone)}` }, run.headline.text);
}

function scene(run) {
  const pend = run.pending;
  const wrap = h('div', { class: `scene ${pend.kind === 'combat' ? 'combat' : ''}` });
  if (run.phase === 'ended') {
    wrap.append(h('div', { class: 'card center-card' },
      h('h2', null, run.farm ? (run.result.outcome === 'defeat' ? 'Tu es tombé...' : 'Session terminée') : run.result.won ? 'Victoire !' : run.result.outcome === 'abandon' ? 'Run abandonnée' : 'Défaite...'),
      h('button', { class: 'btn btn-primary btn-xl', onClick: () => go(run.training ? 'menu' : 'end') }, run.training ? "Retour au menu" : 'Voir le bilan')));
    return wrap;
  }
  const tile = currentTileOf(run);
  // (en combat, le message du moteur s'affiche dans la frise, pour ne pas voler de place au champ de bataille)
  const banner = pend.kind === 'farm' || pend.kind === 'combat' ? null : headlineBanner(run);
  const turn = pend.kind === 'combat' ? null : turnBanner(run); // (à plusieurs : à qui est le tour ; en combat, c'est le bandeau du bas qui le dit)
  if (turn) wrap.append(turn);
  if (banner) wrap.append(banner);
  switch (pend.kind) {
    case 'advance': wrap.append(sceneAdvance(run)); break;
    case 'roll': wrap.append(tileCard(run, tile), sceneRoll(run, tile)); break;
    case 'choice': wrap.append(...sceneChoice(run, tile)); break;
    case 'shop': wrap.append(tileCard(run, tile), sceneShop(run, tile)); break;
    case 'camp': wrap.append(tileCard(run, tile), sceneCamp(run, tile)); break;
    case 'combat': wrap.append(...sceneCombat(run)); break;
    case 'farm': wrap.append(...sceneFarmBreak(run)); break;
    default: wrap.append(h('p', null, 'État inconnu : ' + pend.kind));
  }
  return wrap;
}

// ---------------- Avancer ----------------

function sceneAdvance(run) {
  const actor = playerById(run, run.pending.actor);
  const next = run.dungeon.board[run.dungeon.position + 1];
  const def = next && next.revealed ? app.content.tiles[next.type] : null;
  const total = run.dungeon.board.length - 1;
  return h('div', null,
    h('div', { class: 'card advance-card' },
      h('div', { class: 'advance-art', 'aria-hidden': 'true', style: { '--scene': sceneCss(sceneIdFor(run, app.content)) } }),
      h('div', { class: 'spot-name' }, icon('target', 22), h('span', null, "C'est au tour de ", h('b', null, actor.name))),
      h('p', { class: 'muted' }, run.dungeon.position < 0
        ? `L'entrée du donjon. ${total} salles vous séparent du boss.`
        : `Salle ${run.dungeon.position + 1} sur ${total} franchie. Le groupe reprend son souffle.`),
      def ? h('p', { class: 'tile-hint' }, tileIcon(app.content, next.type, 22), ` Un fantôme a éclairé la suite : ${def.name}.`) : null,
      h('button', { class: 'btn btn-primary btn-xl', id: 'advance-btn', disabled: !yourTurn(run), onClick: () => { play('click'); act({ type: 'ADVANCE' }); } }, icon('d20', 24), 'Avancer')),
    outOfCombatTools(run));
}

/** Soins et potions utilisables entre deux cases. */
function outOfCombatTools(run) {
  const living = run.players.filter((p) => p.alive);
  const entries = [];
  for (const p of living.filter((x) => isMine(run, x.id))) { // (à plusieurs : on ne soigne qu'avec ses propres compétences et potions)
    for (const id of activeSkillIds(run, p)) {
      const sk = skillOf(run, id);
      if (!skillWorksOutside(sk)) continue;
      entries.push({ kind: 'skill', p, sk, check: checkUsable(run, p, sk, { inCombat: false }) });
    }
    for (const it of p.bag) {
      const def = app.content.items[it.id];
      if (def.consumable) entries.push({ kind: 'item', p, it, def });
    }
  }
  if (!entries.length) return null;

  const sel = app.ui.ooc;
  const chooseTargets = () => {
    if (!sel) return null;
    let targets;
    if (sel.kind === 'item' || sel.target === 'ally') targets = living;
    else if (sel.target === 'deadAlly') targets = run.players.filter((p) => !p.alive && canBeRevived(p));
    else targets = [];
    return h('div', { class: 'ooc-targets' },
      h('span', { class: 'muted small' }, 'Sur qui ?'),
      targets.map((t) => h('button', {
        class: 'btn btn-small',
        onClick: async () => {
          const action = sel.kind === 'skill'
            ? { type: 'USE_SKILL', playerId: sel.playerId, skillId: sel.skillId, targetId: t.id }
            : { type: 'USE_ITEM', playerId: sel.playerId, uid: sel.uid, targetId: t.id };
          app.ui.ooc = null;
          await act(action);
        }
      }, `${t.name}${t.alive ? ` (${t.hp}/${maxHp(run, t)})` : ''}`)),
      h('button', { class: 'btn btn-small btn-ghost', onClick: () => { app.ui.ooc = null; redraw(); } }, 'Annuler'));
  };

  return h('div', { class: 'card tools-card' },
    h('h3', null, 'Soins & potions'),
    h('div', { class: 'row gap wrap' }, entries.map((e) => {
      if (e.kind === 'skill') {
        return h('button', {
          class: 'btn btn-small', disabled: !e.check.ok, title: e.check.ok ? e.sk.desc : e.check.reason,
          onClick: () => {
            if (!needsPick(e.sk)) act({ type: 'USE_SKILL', playerId: e.p.id, skillId: e.sk.id });
            else { app.ui.ooc = { kind: 'skill', playerId: e.p.id, skillId: e.sk.id, target: e.sk.target }; redraw(); }
          }
        }, icon('cross', 14), `${e.p.name} : ${e.sk.name}`);
      }
      return h('button', {
        class: 'btn btn-small', title: e.def.desc,
        onClick: () => { app.ui.ooc = { kind: 'item', playerId: e.p.id, uid: e.it.uid }; redraw(); }
      }, icon('potion', 14), `${e.p.name} : ${e.def.name}`);
    })),
    chooseTargets());
}

// ---------------- Jet de dé ----------------

function sceneRoll(run, tile) {
  const pend = run.pending;
  const actor = playerById(run, pend.actor);
  const luck = Math.round(computeStats(run, actor).luck);
  const mods = [];
  if (luck) mods.push(`Chance ${luck > 0 ? '+' : ''}${luck}`);
  if (run.bonus.rollMod) mods.push(`Fantôme ${run.bonus.rollMod > 0 ? '+' : ''}${run.bonus.rollMod}`);
  return h('div', null,
    tile.monsters ? h('div', { class: 'monster-row preview' }, tile.monsters.map((m) => fighter(run, m))) : null,
    h('div', { class: 'card roll-card' },
      h('h3', null, pend.title),
      h('p', null, pend.text),
      mods.length ? h('p', { class: 'muted small' }, 'Modificateurs : ' + mods.join(', ')) : null,
      h('button', { class: 'btn btn-primary btn-xl', id: 'roll-btn', disabled: !yourTurn(run), onClick: () => act({ type: 'ROLL' }) }, icon('d20', 24), `${actor.name} lance le D20`)));
}

// ---------------- Choix ----------------

function sceneChoice(run, tile) {
  const pend = run.pending;
  if (pend.subtype === 'loot') return [lootView(run)];
  const actor = playerById(run, pend.actor);
  let options;
  if (pend.subtype === 'low_blow') {
    const groups = new Map();
    for (const o of pend.options.filter((x) => x.target)) {
      if (!groups.has(o.target)) groups.set(o.target, []);
      groups.get(o.target).push(o);
    }
    // La légende des coups bas n'est écrite qu'une seule fois (elle est la même pour toutes les cibles), avec ce que le saboteur y gagne.
    const legend = groups.size ? app.content.lowBlows.map((b) => h('li', null, h('b', null, b.name), ' : ', b.desc, b.gain ? h('span', { class: 'blow-gain' }, ` Si ça marche, tu gagnes : ${b.gain.desc}.`) : null)) : [];
    const pacts = pend.options.filter((x) => x.pact);
    options = [
      groups.size ? h('ul', { class: 'blow-legend small muted' }, legend) : null,
      ...[...groups.entries()].map(([targetId, list]) =>
        h('div', { class: 'blow-group' },
          h('div', { class: 'blow-target' }, icon('low_blow', 16), `Viser ${playerById(run, targetId).name}`),
          h('div', { class: 'row gap wrap' }, list.map((o) => h('button', { class: 'btn btn-danger btn-small', title: o.desc, disabled: !yourTurn(run), onClick: () => act({ type: 'CHOOSE', option: o.id }) }, o.label.split(' → ')[0]))))),
      pacts.length ? h('div', { class: 'blow-group pact-group' },
        h('div', { class: 'blow-target' }, icon('flame', 16), 'Un pacte avec les ombres', h('small', { class: 'muted' }, ' — pour toi, sans victime')),
        h('div', { class: 'pact-list' }, pacts.map((o) => h('button', { class: 'btn btn-small pact-btn', dataset: { pact: o.pact }, disabled: !yourTurn(run), onClick: () => act({ type: 'CHOOSE', option: o.id }) },
          h('b', null, o.label), h('small', null, o.desc))))) : null,
      h('button', { class: 'btn btn-primary', disabled: !yourTurn(run), onClick: () => act({ type: 'CHOOSE', option: 'pass' }) }, 'Ne rien faire (rester honnête)')
    ].filter(Boolean);
  } else {
    options = [h('div', { class: 'choice-list' }, pend.options.map((o, i) =>
      h('button', { class: `btn ${i === 0 ? 'btn-primary' : ''} btn-wide`, disabled: !yourTurn(run), onClick: () => act({ type: 'CHOOSE', option: o.id }) }, o.label)))];
  }
  return [tileCard(run, tile), h('div', { class: 'card choice-card' }, h('div', { class: 'spot-name' }, icon('target', 20), h('b', null, actor.name)), h('p', null, pend.prompt), ...options)];
}

function lootView(run) {
  const pend = run.pending;
  const c = app.content;
  const actor = playerById(run, pend.actor);
  const def = c.items[pend.item.id];
  const worn = def.slot !== 'consumable' ? wornFor(c, actor.equipment, def) : []; // ce que l'objet remplacerait (un anneau : les deux anneaux portés)
  const rarity = rarityOf(c, def);
  return h('div', { class: `card loot-card r-${rarity.id}`, style: { '--rar': rarity.color } },
    h('div', { class: 'loot-title' }, icon('gift', 24), h('h2', null, `Butin ${rarity.name.toLowerCase()} !`)),
    h('p', null, pend.prompt),
    itemCard(c, pend.item, { realLevel: actor.realLevel }),
    worn.length ? h('p', { class: 'muted small' }, `${actor.name} porte actuellement : ${worn.map((w) => `${c.items[w.id].name} (${Object.entries(c.items[w.id].stats || {}).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${c.statNames[k]}`).join(', ')})`).join(' et ')}`) : null,
    h('div', { class: 'choice-list' }, pend.options.map((o, i) =>
      h('button', { class: `btn ${i === 0 ? 'btn-primary' : ''} btn-wide`, disabled: !yourTurn(run), onClick: () => act({ type: 'CHOOSE', option: o.id }) }, o.id === 'keep' ? icon('check', 16) : icon('gift', 16), o.label))));
}

// ---------------- Marchand ----------------

// ---------------- Feu de camp ----------------
// Chacun à son tour (le héros dont c'est le tour au camp) : changer ses sorts équipés, puis choisir UNE activité.

function sceneCamp(run, tile) {
  const c = app.content;
  const actor = playerById(run, run.pending.actor);
  const mine = yourTurn(run);
  const acts = Object.entries(c.rules.camp?.activities || {});
  const size = c.rules.deckSize ?? 4;
  const options = campDeckOptions(run, actor);
  const deck = Array.isArray(actor.deck) ? actor.deck : options.slice(0, size);
  const slotSelect = (i) => {
    const cur = deck[i] || '';
    return h('label', { class: 'camp-slot' },
      h('span', { class: 'muted small' }, `Sort ${i + 1}`),
      h('select', {
        class: 'input', disabled: !mine, dataset: { slot: String(i) }, 'aria-label': `Sort équipé n° ${i + 1}`,
        onChange: (e) => act({ type: 'CAMP_DECK', slot: i, skillId: e.target.value || null })
      },
        h('option', { value: '', selected: !cur }, '— libre —'),
        options.map((id) => h('option', { value: id, selected: id === cur }, `${c.skills[id].name}${deck.includes(id) && id !== cur ? ' (déjà équipé)' : ''}`))));
  };
  const done = tile.done || {};
  return h('div', { class: 'card camp-card' },
    h('div', { class: 'row space center wrap' },
      h('h3', null, 'Au coin du feu'),
      h('div', { class: 'camp-roll' }, (tile.queue || []).map((id) => {
        const p = playerById(run, id);
        const what = done[id] ? c.rules.camp.activities[done[id]]?.name : null;
        return h('span', { class: `chip-btn ${id === actor.id ? 'on' : ''} ${what ? 'is-done' : ''}`, title: what || (id === actor.id ? 'À son tour' : 'En attente') }, what ? icon('check', 13) : null, p.name);
      }))),
    h('p', null, mine
      ? h('span', null, h('b', null, actor.name), ' : change tes sorts si tu veux, puis choisis une activité.')
      : h('span', { class: 'muted' }, `${actor.name} est au coin du feu : à son tour de choisir.`)),
    h('div', { class: 'camp-deck' },
      h('h4', null, 'Sorts équipés'),
      h('div', { class: 'camp-slots' }, Array.from({ length: size }, (_, i) => slotSelect(i)))),
    h('div', { class: 'camp-acts' }, acts.map(([id, a]) => h('button', {
      type: 'button', class: 'camp-act', dataset: { activity: id }, disabled: !mine,
      onClick: () => { play('click'); act({ type: 'CAMP_ACT', activity: id }); }
    }, icon(a.icon || 'star', 26), h('b', null, a.name), h('span', { class: 'muted small' }, a.desc)))));
}

function sceneShop(run, tile) {
  const c = app.content;
  const living = run.players.filter((p) => p.alive && isMine(run, p.id)); // (à plusieurs : on n'achète que pour son propre héros)
  if (!app.ui.buyer || !living.some((p) => p.id === app.ui.buyer)) app.ui.buyer = living[0]?.id;
  const buyer = playerById(run, app.ui.buyer);

  const stock = tile.stock.map((entry, i) => {
    const def = c.items[entry.inst.id];
    const price = shopPrice(run, tile, itemPrice(c, def));
    return h('div', { class: `shop-item ${entry.sold ? 'sold' : ''}` },
      itemCard(c, entry.inst, { realLevel: buyer?.realLevel }),
      entry.sold
        ? h('span', { class: 'muted' }, 'Vendu')
        : h('button', { class: 'btn btn-small btn-primary', disabled: run.gold < price || !buyer, onClick: () => act({ type: 'SHOP_BUY', index: i, buyerId: app.ui.buyer }) }, icon('coin', 14), `Acheter ${price} or`));
  });

  const sellables = [];
  for (const p of run.players.filter((x) => isMine(run, x.id))) {
    for (const it of p.bag) {
      const def = c.items[it.id];
      sellables.push(h('div', { class: 'shop-item' },
        itemCard(c, it, { compact: true }),
        h('span', { class: 'muted small' }, p.name),
        h('button', { class: 'btn btn-small', onClick: () => act({ type: 'SHOP_SELL', playerId: p.id, uid: it.uid }) }, `Vendre ${sellPrice(run, def)} or`)));
    }
  }

  return h('div', { class: 'card shop-card' },
    h('div', { class: 'row space center' },
      h('h3', null, 'Étal du marchand'),
      h('div', { class: 'gold' }, icon('coin', 20), h('b', null, run.gold))),
    h('div', { class: 'row gap center wrap' },
      h('span', { class: 'muted' }, 'Acheteur :'),
      living.length ? living.map((p) => h('button', { class: `chip-btn ${app.ui.buyer === p.id ? 'on' : ''}`, onClick: () => { app.ui.buyer = p.id; redraw(); } }, p.name)) : h('span', { class: 'muted' }, 'Ton héros est tombé : il ne peut rien acheter.')),
    h('div', { class: 'shop-grid' }, stock),
    h('h4', null, 'Vendre'),
    sellables.length ? h('div', { class: 'shop-grid' }, sellables) : h('p', { class: 'muted small' }, 'Aucun objet dans les sacs.'),
    h('div', { class: 'row end' }, h('button', {
      class: 'btn btn-primary', id: 'shop-leave', disabled: !yourTurn(run),
      title: yourTurn(run) ? '' : `C'est ${playerById(run, run.pending.actor)?.name || 'le héros sous les projecteurs'} qui décide quand quitter l'étal.`,
      onClick: () => act({ type: 'SHOP_LEAVE' })
    }, 'Quitter le marchand')));
}

// ============================================================
//  Combat : frise, champ de bataille, bandeau du héros actif
// ============================================================
// Disposition : la frise d'initiative en haut, le champ de bataille au milieu (monstres en haut, héros en bas,
// la ligne de front entre les deux), et en bas un bandeau avec le héros qui joue, ses points d'action en
// flammes, le détail de la compétence survolée et la barre de compétences. Le journal tient en 3 lignes.

/** Sur écran tactile (pas de survol) : un premier toucher sélectionne une compétence, le second la lance. */
const isTouch = () => !!window.matchMedia && window.matchMedia('(hover: none)').matches;

/** Ce que ce monstre a ANNONCÉ pour son prochain tour : une étiquette par action, juste au-dessus de lui. */
function intentTags(run, m) {
  if (!m.alive || !m.plan?.length) return null;
  // Deux actions identiques sur la même cible s'écrivent une seule fois : « Coup ×2 → Thorne » (une ligne de moins).
  const groups = [];
  for (const step of m.plan) {
    const key = `${step.skillId}|${step.targetId || ''}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.n += 1; else groups.push({ key, step, n: 1 });
  }
  return h('div', { class: 'f-intents', title: 'Ce que ce monstre va faire à son prochain tour' },
    groups.map(({ step, n }) => {
      const sk = skillOf(run, step.skillId);
      const target = step.targetId ? unitById(run, step.targetId) : null;
      const hostile = (sk.effects || []).some((e) => e.type === 'damage' || e.type === 'poison' || e.type === 'dot');
      return h('div', { class: `intent-tag ${hostile ? 'hostile' : 'calm'}`, title: skillBlurb(sk, app.content) },
        icon(skillIconName(app.content, sk), 13), h('b', null, n > 1 ? `${sk.name} ×${n}` : sk.name), target && target.id !== m.id ? h('span', { class: 'intent-target' }, `→ ${target.name}`) : null);
    }));
}

/** Les jauges de ressource d'un joueur (ex. l'Élan du Duelliste). */
function resourceView(u) {
  const cls = app.content.classes[u.classId];
  if (!cls?.resource) return null;
  const id = cls.resource.id;
  const max = u.resourceMax?.[id] ?? cls.resource.max;
  const cur = u.resources?.[id] ?? 0;
  return h('div', { class: 'resource', dataset: { res: id }, title: `${cls.resource.name} : ${cur} / ${max}` },
    h('span', { class: 'small muted' }, cls.resource.name),
    h('span', { class: 'pips res-pips' }, Array.from({ length: max }, (_, i) => h('span', { class: `pip ${i < cur ? 'on' : ''}` }))));
}

/** Le MODE de classe d'un joueur (ex. Endurance / Fureur du Sacrieur), s'il en a un : { name, desc, icon } ou null. */
function modeOf(u) {
  const m = app.content.classes[u.classId]?.modes;
  const cur = m && u.mode ? m.list[u.mode] : null;
  return cur ? { id: u.mode, name: cur.name, desc: cur.desc || '', icon: cur.icon || 'star' } : null;
}

/** La pastille du mode (sur la carte du héros) ; `big` : la version du bandeau d'action. */
function modeChip(u, { big = false } = {}) {
  const m = modeOf(u);
  if (!m) return null;
  return h('span', { class: `chip chip-info mode-chip ${big ? 'big' : ''}`, dataset: { mode: m.id }, title: `Mode ${m.name}${m.desc ? ` : ${m.desc}` : ''}` }, icon(m.icon, big ? 16 : 12), big ? h('span', { class: 'small muted' }, 'Mode') : null, h('b', null, m.name));
}

/** Cliquer sur un combattant (hors choix d'une cible) : le panneau d'effets du bandeau montre ses bonus et ses malus ; recliquer revient au héros qui joue. */
function inspectUnit(run, id) {
  if (app.ui.picked) return; // (un toucher qui sert juste à refermer la description d'une compétence ne doit pas ouvrir autre chose)
  app.ui.inspect = app.ui.inspect?.id === id ? null : { id, actor: run.pending?.actor };
  redraw();
}

/** Le combattant inspecté, tant que c'est encore le même tour (sinon on revient au héros qui joue). */
function inspectedUnit(run, actorId) {
  const ins = app.ui.inspect;
  if (!ins) return null;
  const u = ins.actor === actorId ? unitById(run, ins.id) : null;
  if (!u || !u.alive) {
    app.ui.inspect = null;
    return null;
  }
  return u;
}

/**
 * Le panneau « Effets » du bandeau d'action : tous les bonus et malus du héros qui joue (ou du combattant sur lequel on a cliqué), avec
 * pour chacun sa durée et une phrase qui l'explique. Absent quand il n'y a rien à montrer.
 */
function effectsPanel(run, actor, watching) {
  const target = inspectedUnit(run, actor.id) || actor;
  const own = target.id === actor.id;
  const list = unitEffects(app.content, target, run).filter((e) => e.kind !== 'mode');
  if (own && !list.length) return null;
  const stats = computeStats(run, target);
  const groups = [['buff', 'Bonus'], ['debuff', 'Malus'], ['neutral', list.some((e) => e.kind === 'trait') ? 'Particularités' : 'Autres']]
    .map(([tone, title]) => [title, list.filter((e) => e.tone === tone)]).filter(([, l]) => l.length);
  const row = (e) => h('div', { class: `fx-row is-${e.tone}`, dataset: { effect: e.id, tone: e.tone } },
    h('span', { class: 'fx-ico' }, icon(e.icon, 14)),
    h('div', { class: 'fx-body' },
      h('div', { class: 'fx-line' }, h('b', null, e.name), e.turns ? h('span', { class: 'fx-when' }, turnsText(e.turns)) : null),
      e.desc ? h('p', null, e.desc) : null));
  const title = own && !watching ? 'Tes effets' : `Effets · ${target.name}`;
  const body = [
    own ? null : h('div', { class: 'fx-stats small muted' }, `PV ${target.hp}/${stats.hpMax} · Att ${stats.atk.toFixed(1)} · Déf ${stats.def.toFixed(1)} · Init ${stats.ini.toFixed(0)}`),
    list.length
      ? groups.map(([gt, l]) => h('div', { class: 'fx-group-block' }, h('div', { class: 'fx-group' }, gt), l.map(row)))
      : h('p', { class: 'muted small' }, 'Aucun effet actif.')
  ];
  const back = own ? null : h('button', { type: 'button', class: 'link-btn', onClick: () => { app.ui.inspect = null; redraw(); } }, `Revenir à ${actor.name}`);
  // Petit écran (téléphone, tablette, portable peu haut) : le panneau est une pastille à côté de « Fin du tour » (« Tes effets  1 2 ») qui ne prend aucune
  // hauteur de plus ; un toucher l'ouvre en surimpression au-dessus du bandeau, pour ne pas écraser le champ de bataille.
  if (window.matchMedia?.('(max-width: 1000px), (max-height: 820px)').matches) {
    const nb = list.filter((e) => e.tone === 'buff').length;
    const nm = list.filter((e) => e.tone === 'debuff').length;
    const count = (n, tone) => (n ? h('i', { class: `fx-count is-${tone}` }, String(n)) : null);
    const sum = [nb ? `${nb} bonus` : null, nm ? `${nm} malus` : null].filter(Boolean).join(', ') || 'aucun effet';
    const busy = !!(app.ui.target || app.ui.picked || app.ui.modePick); // (une compétence est choisie : la fiche des effets reste fermée, pour ne pas cacher sa description ni « Annuler »)
    return h('details', {
      class: `fx-panel is-folded ${own ? '' : 'is-other'}`, open: !busy && (!own || !!app.ui.fxOpen), dataset: { unit: target.id },
      onToggle: (ev) => { if (own) app.ui.fxOpen = ev.target.open; }
    },
      h('summary', { 'aria-label': `${title} : ${sum}`, title: `${title} : ${sum}` }, icon('bolt', 15), count(nb, 'buff'), count(nm, 'debuff'), nb || nm ? null : h('i', { class: 'fx-count is-none' }, '0')),
      h('div', { class: 'fx-pop' }, h('div', { class: 'fx-panel-head' }, h('b', null, title), back), body));
  }
  return h('section', { class: `fx-panel ${own ? '' : 'is-other'}`, 'aria-label': `Effets de ${target.name}`, dataset: { unit: target.id } },
    h('div', { class: 'fx-panel-head' }, h('b', null, title), back),
    body);
}

/** Un combattant (joueur ou monstre) sur le champ de bataille : médaillon, nom, barre de vie. */
function fighter(run, u) {
  const isMonster = u.kind === 'monster';
  const stats = computeStats(run, u);
  const t = app.ui.target;
  const targetable = !!t && t.valid.includes(u.id) && u.alive;
  const dim = !!t && !targetable;
  const active = run.pending?.kind === 'combat' && run.pending.actor === u.id;
  const shield = totalShield(u);
  const cls = isMonster ? null : app.content.classes[u.classId];
  const who = isMonster ? null : controllerOf(run, u.id); // (à plusieurs : à qui est ce héros ?)
  const medal = isMonster ? monsterPortrait(u.look, 'fluid', u.boss, u.defId) : portrait(u.classId, 'fluid', u.alive ? '' : 'ghostly');
  // Les effets (bonus et malus) : les malus d'abord, trois pastilles au plus sur la carte ; le reste se lit en cliquant sur le combattant.
  const fxList = u.alive ? unitEffects(app.content, u, run).filter((e) => e.kind !== 'mode').sort(byDanger) : [];
  const fxShown = fxList.slice(0, 3);
  const fxMore = fxList.length - fxShown.length;
  const inspected = app.ui.inspect?.id === u.id && app.ui.inspect.actor === run.pending?.actor;
  return h('div', {
    class: ['fighter', isMonster ? 'monster' : 'player', active ? 'active' : '', !u.alive ? 'is-dead' : '', u.boss ? 'is-boss' : '', targetable ? 'targetable' : '', dim ? 'dim' : '', who?.me ? 'mine' : '', inspected ? 'is-inspected' : ''].filter(Boolean).join(' '),
    dataset: { unit: u.id },
    onClick: targetable ? () => chooseTarget(u.id) : u.alive ? () => inspectUnit(run, u.id) : null,
    title: `${u.name} — PV ${u.hp}/${stats.hpMax} · Att ${stats.atk.toFixed(1)} · Déf ${stats.def.toFixed(1)} · Init ${stats.ini.toFixed(0)}${shield ? ` · bouclier ${shield}` : ''}`
  },
    isMonster ? intentTags(run, u) : null,
    h('div', { class: 'f-medal' }, active ? h('span', { class: 'spot-tag' }, 'À jouer') : null, medal),
    h('div', { class: 'f-name' }, u.name),
    isMonster ? null : h('div', { class: 'f-sub' }, `${cls.name} · ${levelText(u)}`),
    who ? h('div', { class: `f-owner ${who.me ? 'is-me' : ''} ${who.auto ? 'is-auto' : ''}`, title: who.me ? 'Ce héros est à toi' : who.auto ? 'Son joueur est parti : le pilote automatique le joue' : `Joué par ${who.name}${who.online ? '' : ' (hors ligne)'}` },
      who.me ? 'toi' : who.auto ? 'auto' : who.name) : null,
    u.alive
      ? hpBar(u.hp, stats.hpMax, isMonster ? 'enemy' : '', shield) // les PV s'écrivent dans la barre : une ligne de moins
      : h('div', { class: 'f-hp muted' }, isMonster ? 'Vaincu' : 'Hors combat'),
    !isMonster && u.alive ? resourceView(u) : null,
    u.alive && (u.mode || fxList.length)
      ? h('div', { class: 'chips' }, [
          modeChip(u),
          ...fxShown.map((e) => effectChip(e, { compact: true })),
          fxMore > 0 ? h('span', { class: 'fx-chip fx-more', tabindex: '0', title: `${fxMore} autre${fxMore > 1 ? 's' : ''} effet${fxMore > 1 ? 's' : ''} : clique sur ${u.name} pour tout voir` }, `+${fxMore}`) : null
        ])
      : null);
}

/** Nom court pour la frise : « Le Seigneur des Ossements » devient « Seigneur ». */
function shortName(name) {
  const words = name.split(' ');
  while (words.length > 1 && /^(le|la|les|l'|un|une|des|du|de)$/i.test(words[0])) words.shift();
  return words[0];
}

/** La frise d'initiative : l'ordre de jeu de tout le monde. */
function timelineStrip(run) {
  const c = run.combat;
  const chips = c.timeline.map((id, i) => {
    const u = unitById(run, id);
    if (!u) return null;
    const cls = ['tl-chip', u.kind === 'player' ? 'side-p' : 'side-m', !u.alive ? 'dead' : '', i === c.turn ? 'current' : '', i < c.turn ? 'done' : ''].filter(Boolean).join(' ');
    return h('div', { class: cls, title: `${u.name}${u.alive ? '' : ' (hors combat)'}` },
      h('span', { class: 'tl-medal' }, u.kind === 'player' ? portrait(u.classId, 'fluid') : monsterPortrait(u.look, 'fluid', false, u.defId)),
      h('span', { class: 'tl-name' }, shortName(u.name)));
  });
  // Beaucoup de combattants : seul le nom de celui qui joue reste écrit (les autres se reconnaissent à leur médaillon)
  return h('div', { class: `frise ${c.timeline.length > 7 ? 'many' : ''}`, 'aria-label': "Frise d'initiative" },
    h('div', { class: 'tl-title' }, `Round ${c.round}`),
    h('div', { class: 'tl-track' }, chips),
    run.headline ? h('div', { class: `tl-note ${toneClass(run.headline.tone)}`, title: run.headline.text }, run.headline.text) : null);
}

/** Une rangée du champ de bataille (rien n'est dessiné si elle est vide : on gagne de la place). */
function rowBox(run, label, units, side, depth) {
  if (!units.length) return null;
  return h('div', { class: `row-box side-${side} row-${depth}` },
    h('span', { class: 'row-label' }, label),
    h('div', { class: 'row-units' }, units.map((u) => fighter(run, u))));
}

/** Le champ de bataille : monstres en haut (arrière puis avant), héros en bas (avant puis arrière). */
function battlefield(run) {
  const c = run.combat;
  const living = run.players.filter((p) => p.alive);
  const ghosts = run.players.filter((p) => !p.alive);
  const rows = [
    rowBox(run, 'Arrière', c.monsters.filter((m) => m.row === 'back'), 'm', 'back'),
    rowBox(run, 'Avant', c.monsters.filter((m) => m.row === 'front'), 'm', 'front'),
    rowBox(run, 'Avant', living.filter((p) => p.row === 'front'), 'p', 'front'),
    rowBox(run, 'Arrière', living.filter((p) => p.row === 'back'), 'p', 'back')
  ];
  const rowCount = rows.filter(Boolean).length; // le CSS réduit les médaillons quand il y a 3 ou 4 rangées à loger
  return h('div', { class: `stage rows-${Math.max(2, rowCount)}`, style: { '--scene': sceneCss(sceneIdFor(run, app.content)) } },
    h('div', { class: 'side side-monsters' }, rows[0], rows[1]),
    h('div', { class: 'front-line', 'aria-hidden': 'true' }, h('span', null, 'Ligne de front')),
    h('div', { class: 'side side-party' }, rows[2], rows[3]),
    ghosts.length
      ? h('div', { class: 'ghost-strip' }, ghosts.map((g) => h('div', { class: 'ghost-chip', dataset: { unit: g.id } }, icon('ghost', 16), h('b', null, g.name), ghostButtons(run, g))))
      : null);
}

/** Un clic sur un combattant pendant le choix de cible. */
function chooseTarget(id) {
  const t = app.ui.target;
  if (!t) return;
  app.ui.target = null;
  act({ type: 'COMBAT_ACT', playerId: app.run.pending.actor, ...t.action, targetId: id });
}

/** Lance une compétence : tout de suite, ou après le choix d'une cible. */
function castSkillNow(actor, s) {
  app.lastSkill = { ...(app.lastSkill || {}), [actor.id]: s.skillId };
  app.ui.picked = null; // (la sélection au toucher est terminée : l'infobulle se referme)
  const action = { act: 'skill', skillId: s.skillId };
  if (s.modePick) { // un sort qui fait CHOISIR un mode (l'Aura sacrée) : le panneau du sort propose les options, une icône chacune
    app.ui.modePick = { actor: actor.id, skillId: s.skillId, label: s.name, pa: s.pa, options: s.modePick };
    app.ui.target = null;
    app.ui.inspect = null;
    redraw();
    return;
  }
  if (!s.needsPick) return act({ type: 'COMBAT_ACT', playerId: actor.id, ...action });
  if (s.targets.length === 1) return act({ type: 'COMBAT_ACT', playerId: actor.id, ...action, targetId: s.targets[0] });
  app.ui.target = { action, valid: s.targets, label: s.name, skillId: s.skillId };
  app.ui.inspect = null; // (on choisit une cible : le panneau des effets revient sur le héros qui joue)
  redraw();
}

/** Le joueur a choisi un mode (une aura) dans le panneau d'un sort « pick » : on lance le sort avec ce choix. */
function chooseMode(actor, skillId, modeId) {
  app.ui.modePick = null;
  act({ type: 'COMBAT_ACT', playerId: actor.id, act: 'skill', skillId, modeId });
}

/** Le détail d'une compétence : nom, coût, portée, effet, et le risque de son dé. (`onCast` : bouton « Lancer », sur écran tactile.) */
function skillDetailNodes(s, def, onCast) {
  const range = { melee: 'corps à corps', ranged: 'à distance' }[def.range] || '';
  const meta = [range, s.cooldown > 1 ? `récup. ${s.cooldown} t.` : s.cooldown === 1 ? '1× par tour' : '', s.spend ? `coûte ${s.spend.amount} ${resourceName(app.content, def, s.spend.id)}` : '', def.oncePerDungeon ? '1× par donjon' : '']
    .filter(Boolean).join(' · ');
  return [
    h('div', { class: 'sd-main' },
      h('div', { class: 'sd-title' },
        h('b', { class: 'sd-name' }, s.name),
        h('span', { class: 'sd-pa' }, `${s.pa} PA`),
        h('span', { class: 'sd-meta' }, [skillBlurb(def, app.content).split(' · ').pop(), meta].filter(Boolean).join(' · '))),
      h('div', { class: 'sd-desc' }, def.desc || skillBlurb(def, app.content)),
      s.usable ? null : h('div', { class: 'sd-reason' }, s.reason)),
    s.dice ? h('div', { class: 'sd-risk' }, diceStrip(s.dice)) : null,
    onCast && s.usable ? h('button', { type: 'button', class: 'btn btn-primary sd-cast', onClick: onCast }, icon('flame', 16), 'Lancer') : null
  ];
}

/** Fait « trembler » une case (feedback quand on appuie sur le raccourci d'une compétence qu'on ne peut pas lancer). */
function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // (relance l'animation même si elle venait de jouer)
  el.classList.add('shake');
}

/** La petite étiquette de touche d'une case (« & », « é »...), mise à jour si on découvre la vraie disposition du clavier. */
const keyBadge = (index) => (index < HOTKEY_COUNT ? h('span', { class: 'slot-key', dataset: { i: index }, 'aria-hidden': 'true' }, keyLabel(index)) : null);

/**
 * Une case de la barre de compétences : icône, coût en PA, touche du clavier, risque du dé.
 * Deux « événements maison » viennent du clavier (voir bindKeys) :
 *   hotkey : la touche de la case a été pressée (on lance tout de suite, même sur un écran tactile) ;
 *   denied : elle a été pressée alors que la compétence n'est pas utilisable (on explique pourquoi).
 */
function skillSlot(run, actor, s, index, ctx) {
  const c = app.content;
  const def = c.skills[s.skillId];
  const touch = isTouch();
  const picked = app.ui.picked === s.skillId;
  const armed = app.ui.target?.skillId === s.skillId || app.ui.modePick?.skillId === s.skillId;
  const onClick = () => {
    if (touch && !picked) { // sur téléphone : le premier toucher montre le détail, le second lance
      app.ui.picked = s.skillId;
      app.ui.target = null;
      app.ui.modePick = null;
      redraw();
      return;
    }
    castSkillNow(actor, s);
  };
  const btn = h('button', {
    type: 'button', class: `slot-btn skill-btn ${s.basic ? 'basic' : ''}`, disabled: !s.usable || ctx.watching,
    'aria-label': `${s.name}, ${s.pa} PA${s.usable ? '' : `, indisponible : ${s.reason}`}`, onClick, onFocus: () => ctx.show(s), onBlur: () => ctx.reset(),
    onHotkey: () => castSkillNow(actor, s),
    onDenied: () => { shake(slot); ctx.flash(s); }
  },
    h('span', { class: 'slot-face' }, icon(skillIconName(c, def), 'fluid')),
    h('span', { class: 'slot-pa' }, s.pa),
    keyBadge(index),
    riskBar(s.dice));
  const slot = h('div', {
    class: `slot kind-${skillKind(def)} ${picked ? 'is-selected' : ''} ${armed ? 'is-armed' : ''} ${s.usable ? '' : 'unusable'} ${s.recommended ? 'recommended' : ''}`,
    onMouseenter: () => ctx.show(s), onMouseleave: () => ctx.reset()
  }, h('div', { class: 'slot-glow' }, btn), h('span', { class: 'slot-label' }, s.name));
  return slot;
}

/** Les deux actions « hors compétence » : changer de rang, boire une potion. */
function utilitySlot({ label, iconName, pa, enabled, title, onClick, badge = null, index, reason = '', watching = false }) {
  const btn = h('button', {
    type: 'button', class: 'slot-btn util-btn', disabled: !enabled || watching, title, 'aria-label': `${label}, ${pa} PA`,
    onClick: () => { app.ui.picked = null; onClick(); },
    onHotkey: () => { app.ui.picked = null; onClick(); },
    onDenied: () => { shake(slot); toast(reason || `${label} : ${pa} PA requis.`, 'bad'); }
  },
    h('span', { class: 'slot-face' }, icon(iconName, 'fluid')),
    h('span', { class: 'slot-pa' }, pa),
    badge ? h('span', { class: 'slot-count' }, badge) : null,
    keyBadge(index));
  const slot = h('div', { class: `slot util ${enabled ? '' : 'unusable'}`, title }, h('div', { class: 'slot-glow' }, btn), h('span', { class: 'slot-label' }, label));
  return slot;
}

/** Les trois dernières lignes du journal (le journal complet s'ouvre dans une fenêtre). */
function miniLog(run) {
  return h('div', { class: 'mini-log' },
    h('div', { class: 'mini-log-head' },
      h('span', null, 'Journal'),
      h('button', { type: 'button', class: 'link-btn', onClick: () => openLogModal() }, icon('journal', 14), 'Tout voir')),
    run.log.slice(-3).map((l) => h('div', { class: `log-line k-${l.kind}` }, l.text)));
}

/** La fenêtre du journal complet. */
function openLogModal() {
  openModal({
    title: 'Journal de la partie',
    wide: true,
    render: () => h('div', { class: 'log-list tall' }, app.run.log.slice(-300).map((l) => h('div', { class: `log-line k-${l.kind}` }, l.text)))
  });
  requestAnimationFrame(() => {
    const el = document.querySelector('.modal .log-list');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

/** Le bandeau du bas : héros actif, PA en flammes, détail de la compétence, barre de compétences, fin de tour. */
function actionDock(run, actor, view) {
  const c = run.combat;
  const t = app.ui.target;
  const secs = turnSecondsOf(run, app.profile);
  const watching = !yourTurn(run); // (à plusieurs : je regarde jouer un autre joueur)
  const cls = app.content.classes[actor.classId];
  const hurtAllies = run.players.filter((p) => p.alive && p.hp < maxHp(run, p) * 0.55);

  // Compétences de soin / bouclier mises en avant quand un allié est en danger
  const isSupport = (sk) => (sk.effects || []).some((e) => ['heal', 'hot', 'shield'].includes(e.type)) && ['ally', 'allies'].includes(sk.target);
  const skills = view.skills.map((s) => ({ ...s, recommended: s.usable && hurtAllies.length > 0 && isSupport(app.content.skills[s.skillId]) }));
  const support = skills.find((s) => s.recommended);
  let tip = null;
  if (watching) tip = null;
  else if (support && hurtAllies.length) tip = `${hurtAllies.map((p) => p.name).join(', ')} ${hurtAllies.length > 1 ? 'sont bien blessés' : 'est bien blessé'} : « ${support.name} » peut aider !`;
  else if (!run.training && (!run.farm || run.farm.wave === 1) && run.xpPool === 0 && c.round === 1) tip = 'Sous chaque compétence, la bande de dé montre ses risques : rouge = échec critique, doré = critique.';

  // Le DÉTAIL d'une compétence (nom, coût, portée, description, dé).
  //  - grand écran : un panneau toujours visible (la compétence survolée, sinon la dernière utilisée) ;
  //  - petit écran (téléphone, fenêtre peu haute) : RIEN au repos ; une infobulle apparaît au-dessus de la barre de compétences
  //    au survol, au premier toucher (sélection) ou pendant le choix d'une cible. C'est le CSS qui décide d'après `data-state` :
  //    rest (au repos) · hover (survol) · picked (sélectionnée au toucher) · target (on choisit une cible) · flash (touche pressée alors
  //    que la compétence n'est pas utilisable : on montre pourquoi quelques secondes).
  const touch = isTouch();
  const detailEl = h('div', { class: 'skill-detail', dataset: { state: 'rest' } });
  const remembered = app.ui.picked || app.lastSkill?.[actor.id];
  const fallback = skills.find((s) => s.skillId === remembered) || skills.find((s) => s.basic) || skills[0];
  // Le choix d'un mode (aura) en cours : valable seulement pour ce héros et tant que le sort est utilisable.
  const mp = app.ui.modePick;
  const modePick = mp && mp.actor === actor.id && skills.some((x) => x.skillId === mp.skillId && x.usable) ? mp : null;
  if (mp && !modePick) app.ui.modePick = null;
  const fill = (s, mode) => {
    if (modePick) {
      const cancel = () => { app.ui.modePick = null; redraw(); };
      // Le nom de ce qu'on choisit : `modes.noun` dans la classe (« posture »), sinon « aura » si les modes en donnent une, sinon « mode ».
      const modes = app.content.classes[actor.classId]?.modes;
      const noun = modes?.noun || (Object.values(modes?.list || {}).some((m) => m.aura) ? 'aura' : 'mode');
      const masc = (modes?.article || (noun === 'mode' ? 'un' : 'une')) === 'un'; // (« un chant », « une posture » : `modes.article` dans la classe)
      mount(detailEl, h('div', { class: 'sd-modes' },
        h('div', { class: 'sd-modes-head' },
          h('b', null, `${modePick.label} : choisis ${masc ? 'un' : 'une'} ${noun}`),
          h('span', { class: 'muted small' }, `${modePick.pa === 0 ? 'Gratuit cette fois' : `${modePick.pa} PA`} · Échap pour annuler`),
          h('button', { type: 'button', class: 'btn btn-small', onClick: cancel }, 'Annuler')),
        h('div', { class: 'sd-modes-list', role: 'group', 'aria-label': `${noun[0].toUpperCase()}${noun.slice(1)}s` }, modePick.options.map((o) => h('button', {
          type: 'button', class: `mode-opt ${o.current ? 'is-current' : ''}`, disabled: o.current, dataset: { mode: o.id },
          title: `${o.name} : ${o.desc}`, 'aria-label': `${o.name}${o.current ? ' (actuelle)' : ''} : ${o.desc}`,
          onClick: () => chooseMode(actor, modePick.skillId, o.id)
        }, icon(o.icon, 26), h('span', { class: 'mo-text' }, h('b', null, o.name), h('span', { class: 'mo-desc' }, o.current ? `${noun[0].toUpperCase()}${noun.slice(1)} ${masc ? 'actuel' : 'actuelle'}` : o.desc)))))));
      detailEl.dataset.state = 'target';
      return;
    }
    if (t) {
      mount(detailEl, h('div', { class: 'sd-target' }, icon('target', 22),
        h('div', null, h('b', null, `${t.label} : choisis une cible`), h('div', { class: 'muted small' }, 'Les cibles possibles brillent en vert (Échap pour annuler).')),
        h('button', { type: 'button', class: 'btn btn-small', onClick: () => { app.ui.target = null; redraw(); } }, 'Annuler')));
      detailEl.dataset.state = 'target';
      return;
    }
    const picked = app.ui.picked === s.skillId;
    mount(detailEl, ...skillDetailNodes(s, app.content.skills[s.skillId], touch && picked ? () => castSkillNow(actor, s) : null));
    detailEl.dataset.state = mode || (picked ? 'picked' : 'rest');
  };
  let flashTimer = null;
  const rest = () => fill(fallback);
  const ctx = {
    watching,
    show: (s) => { if (!touch) fill(s, 'hover'); }, // (au toucher, le « survol » n'existe pas : on attend le premier toucher)
    reset: () => { clearTimeout(flashTimer); rest(); },
    flash: (s) => { fill(s, 'flash'); clearTimeout(flashTimer); flashTimer = setTimeout(rest, 2200); }
  };
  rest();

  const potion = view.items[0];
  const otherRowName = ROW_NAME[otherRow(actor.row)];
  const usePotion = () => {
    const action = { act: 'item', itemUid: potion.uid };
    if (view.allyTargets.length === 1) return act({ type: 'COMBAT_ACT', playerId: actor.id, ...action, targetId: view.allyTargets[0] });
    app.ui.target = { action, valid: view.allyTargets, label: potion.name };
    redraw();
  };
  // Trois blocs : le corps à corps basique (seul), le sort de classe (seul), puis l'encadré du deck (4 emplacements, les libres restent vides).
  const blocks = { basic: [], class: [], deck: [] };
  skills.forEach((s, i) => blocks[s.group].push(skillSlot(run, actor, s, i, ctx)));
  for (let i = 0; i < (view.deckSlots || 0); i++) {
    blocks.deck.push(h('div', { class: 'slot empty-slot', title: 'Emplacement libre : équipe un sort dans la fiche du héros.' },
      h('div', { class: 'slot-glow' }, h('div', { class: 'slot-empty', 'aria-hidden': 'true' })), h('span', { class: 'slot-label' }, 'Libre')));
  }
  const utils = [];
  let n = skills.length;
  utils.push(utilitySlot({
    label: `Rang ${otherRowName}`, iconName: 'swap', pa: view.moveCost, enabled: view.canMove, watching, index: n++, reason: `Changer de rang : ${view.moveCost} PA requis (il t'en reste ${view.pa}).`,
    title: `Passer au rang ${otherRowName} (${view.moveCost} PA). Le corps à corps ne touche que le rang avant.`,
    onClick: () => act({ type: 'COMBAT_ACT', playerId: actor.id, act: 'move', row: otherRow(actor.row) })
  }));
  if (potion) {
    utils.push(utilitySlot({
      label: 'Potion', iconName: 'potion', pa: view.itemCost, enabled: potion.usable, watching, index: n++, badge: view.items.length > 1 ? view.items.length : null, reason: `Potion : ${view.itemCost} PA requis (il t'en reste ${view.pa}).`,
      title: `${potion.name} : soigne ${Math.round(potion.healPct * 100)} % des PV max (${view.itemCost} PA)`, onClick: usePotion
    }));
  }

  const count = skills.length + utils.length;
  const hotbar = h('div', { class: `hotbar ${count > 8 ? 'dense' : ''} ${t || modePick ? 'armed' : ''}`, role: 'toolbar', 'aria-label': 'Compétences', title: `Raccourcis clavier : ${Array.from({ length: Math.min(count, HOTKEY_COUNT) }, (_, i) => keyLabel(i)).join(' ')}` },
    blocks.basic.length ? h('div', { class: 'hb-group hb-basic', role: 'group', 'aria-label': 'Corps à corps' }, blocks.basic) : null,
    blocks.class.length ? h('div', { class: 'hb-group hb-class', role: 'group', 'aria-label': 'Sort de classe' }, blocks.class) : null,
    blocks.deck.length ? h('div', { class: 'hb-group hb-deck', role: 'group', 'aria-label': 'Deck de sorts' }, blocks.deck) : null,
    h('div', { class: 'hb-group hb-util', role: 'group', 'aria-label': 'Actions' }, utils));
  // Sur téléphone la barre défile : un redessin (après un toucher) ne doit pas la ramener au début ni cacher la case choisie.
  hotbar.addEventListener('scroll', () => { app.ui.hotbarScroll = hotbar.scrollLeft; }, { passive: true });
  requestAnimationFrame(() => {
    hotbar.scrollLeft = app.ui.hotbarScroll || 0;
    const sel = hotbar.querySelector('.is-selected, .is-armed');
    if (!sel) return;
    const hr = hotbar.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    if (sr.left < hr.left) hotbar.scrollLeft -= hr.left - sr.left + 8;
    else if (sr.right > hr.right) hotbar.scrollLeft += sr.right - hr.right + 8;
  });

  const fx = effectsPanel(run, actor, watching);
  const fxFolded = !!fx && fx.classList.contains('is-folded'); // la version repliée se range à côté de « Fin du tour »
  return h('div', { class: `dock action-card ${inRoom(run) ? (watching ? 'spectator' : 'my-turn') : ''}` },
    h('div', { class: 'dock-hero' },
      h('div', { class: 'dock-who' },
        portrait(actor.classId, 56),
        h('div', null,
          h('div', { class: 'muted small' }, 'Au tour de'),
          h('div', { class: 'dock-name' }, actor.name),
          h('div', { class: 'muted small' }, `Rang ${ROW_NAME[actor.row]} · ${cls.name}`),
          ownerTag(run, actor.id, 'owner-tag dock-owner'))),
      h('div', { class: 'pa-box', title: "Points d'action : chaque compétence en coûte" },
        h('div', { class: 'pa-head' }, h('span', { class: 'pa-label' }, "Points d'action"), h('b', null, `${view.pa} / ${view.paMax}`)),
        paFlames(view.pa, view.paMax, 28)),
      resourceView(actor),
      modeChip(actor, { big: true }),
      fxFolded ? null : fx,
      secs ? h('div', { class: 'turn-timer', title: 'Temps restant pour ce tour' }, h('div', { class: 'timer-bar' }, h('div', { class: 'timer-fill' })), h('span', { class: 'timer-text' }, `${secs} s`)) : null),
    h('div', { class: 'dock-center' },
      tip ? h('p', { class: 'tip' }, icon('star', 14), tip) : null,
      detailEl,
      hotbar),
    h('div', { class: 'dock-end' },
      h('div', { class: 'dock-end-row' },
        fxFolded ? fx : null,
        h('button', { type: 'button', class: 'btn btn-primary btn-xl end-turn', disabled: watching, onClick: () => act({ type: 'COMBAT_ACT', playerId: actor.id, act: 'endTurn' }) }, icon('skip', 18), 'Fin du tour')),
      miniLog(run)));
}

function sceneCombat(run) {
  const actor = playerById(run, run.pending.actor);
  const view = getCombatView(run, actor.id);
  return [timelineStrip(run), battlefield(run), actionDock(run, actor, view)];
}

// ---------------- Ajustement du champ de bataille ----------------

let fitBound = false;
/**
 * Le champ de bataille règle déjà la taille des médaillons sur sa hauteur (voir le CSS). Si malgré tout le contenu
 * déborde (beaucoup de rangées sur un écran peu haut), on réduit un peu les médaillons, puis en dernier recours les
 * combattants passent en « cartes compactes » : le médaillon à gauche, le nom et la barre de vie à droite.
 * Rien ne change sur les écrans où tout tient.
 */
function fitStage() {
  if (!fitBound) {
    fitBound = true;
    window.addEventListener('resize', () => { if (app.screen === 'run') fitStage(); });
  }
  const stage = document.querySelector('.stage');
  if (!stage) return;
  const overflows = () => stage.scrollHeight > stage.clientHeight + 1;
  const smallestMedal = () => Math.min(...[...stage.querySelectorAll('.f-medal')].map((m) => m.getBoundingClientRect().width));
  const COMFORT = 56; // un médaillon d'au moins 56 px se lit bien : on garde alors la mise en page normale
  // 1. la mise en page normale (médaillon, nom dessous), en réduisant un peu les médaillons tant que ça déborde (variable --fit du CSS)
  stage.classList.remove('mini');
  if (getComputedStyle(stage).containerType !== 'size') { // (téléphone : le champ de bataille grandit avec son contenu, la page défile : rien à ajuster)
    stage.style.setProperty('--fit', 1);
    return;
  }
  let normal = null;
  for (const k of [1, 0.88, 0.76, 0.66]) {
    stage.style.setProperty('--fit', k);
    if (!overflows()) { normal = { k, size: smallestMedal() }; break; }
  }
  if (normal && normal.size >= COMFORT) return;
  // 2. sinon les cartes compactes (médaillon à gauche, nom et barre de vie à droite) : le plus grand médaillon qui tient (de 88 px à 40 px)
  stage.style.setProperty('--fit', 1);
  stage.classList.add('mini');
  for (const px of [88, 80, 72, 66, 62, 56, 50, 45, 40]) {
    stage.style.setProperty('--mini-medal', `${px}px`);
    if (!overflows()) {
      if (!normal || px > normal.size) return;
      break;
    }
  }
  // 3. les cartes compactes ne font pas mieux : on revient à la mise en page normale (réduite au minimum)
  if (normal) {
    stage.classList.remove('mini');
    stage.style.setProperty('--fit', normal.k);
  }
}

// ---------------- Raccourcis clavier ----------------

let keysBound = false;
/** Remet à jour les étiquettes de touches des cases (quand on découvre la vraie disposition du clavier). */
const refreshKeyLabels = () => document.querySelectorAll('.slot-key[data-i]').forEach((el) => { el.textContent = keyLabel(Number(el.dataset.i)); });

/**
 * Les touches de la rangée du haut (& é " ' ( - è _ ç à sur AZERTY ; 1 2 3 4 5 6 7 8 9 0 sur QWERTY) lancent les cases de la barre,
 * dans l'ordre. Échap annule le choix d'une cible. Voir src/ui/keys.js pour le détail (position de la touche, pas son caractère).
 */
function bindKeys() {
  if (keysBound) return;
  keysBound = true;
  detectKeyboardLayout(refreshKeyLabels);
  document.addEventListener('keydown', (e) => {
    if (learnKey(e)) refreshKeyLabels(); // (partout : une frappe suffit pour savoir à quoi ressemble le clavier)
    if (app.screen !== 'run' || app.modal || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    if (app.run?.pending?.kind !== 'combat') return;
    if (isWatching(app.run)) return; // (à plusieurs : ce n'est pas mon tour)
    if (e.key === 'Escape') {
      if (app.ui.target || app.ui.picked || app.ui.modePick) {
        app.ui.target = null;
        app.ui.picked = null;
        app.ui.modePick = null;
        redraw();
      }
      return;
    }
    const i = hotkeyIndex(e);
    if (i < 0) return;
    e.preventDefault(); // (sinon Firefox ouvre sa « recherche rapide » sur la touche ' )
    if (e.repeat) return; // une touche maintenue enfoncée ne lance qu'une fois
    const btn = document.querySelectorAll('.hotbar .slot-btn')[i];
    if (!btn) return;
    btn.dispatchEvent(new CustomEvent(btn.disabled ? 'denied' : 'hotkey'));
  });
  // Sur téléphone : un toucher à côté de la barre (sur le champ de bataille) referme l'infobulle d'une compétence sélectionnée.
  document.addEventListener('click', (e) => {
    if (app.screen !== 'run' || !app.ui.picked || e.target.closest?.('.dock')) return;
    app.ui.picked = null;
    redraw();
  });
}

// ============================================================
//  Sac d'un joueur (fenêtre)
// ============================================================

export function openInventory(playerId) {
  const view = { sel: null, filter: 'all' }; // l'état de la page équipement (emplacement choisi, filtre du sac)
  openModal({
    title: 'Sac & équipement',
    wide: true,
    render: (api) => {
      const run = app.run;
      const c = app.content;
      const p = playerById(run, playerId);
      if (!p) return h('p', null, 'Joueur introuvable.');
      const locked = !!run.combat || run.phase === 'ended';
      const others = run.players.filter((x) => x.id !== p.id);
      const tranche = run.setup.restrict ? run.setup.tranche : null;

      // Sous chaque objet du sac : utiliser une potion, ou l'offrir à un équipier (jamais de vol : seulement des dons).
      const extra = (inst) => {
        const def = c.items[inst.id];
        const giveSel = h('select', { class: 'input small', 'aria-label': 'Donner à' }, others.map((o) => h('option', { value: o.id }, o.name)));
        const useSel = h('select', { class: 'input small', 'aria-label': 'Utiliser sur' }, run.players.filter((x) => x.alive).map((o) => h('option', { value: o.id }, `${o.name} (${o.hp}/${maxHp(run, o)})`)));
        const parts = [];
        if (def.consumable) parts.push(useSel, h('button', { type: 'button', class: 'btn btn-small btn-primary', disabled: locked, onClick: () => act({ type: 'USE_ITEM', playerId: p.id, uid: inst.uid, targetId: useSel.value }) }, 'Utiliser'));
        if (others.length) parts.push(h('span', { class: 'muted small' }, 'Donner à'), giveSel, h('button', { type: 'button', class: 'btn btn-small', disabled: locked, onClick: () => act({ type: 'GIVE', fromId: p.id, toId: giveSel.value, uid: inst.uid }) }, 'Donner'));
        return parts.length ? h('div', { class: 'bag-actions' }, parts) : null;
      };

      requestAnimationFrame(() => afterEquipRender(view, api.body));
      return [
        h('div', { class: 'sheet-head' }, portrait(p.classId, 52), h('div', null, h('h3', null, p.name), h('div', { class: 'muted' }, `${c.classes[p.classId].name} · ${levelText(p)}`))),
        locked ? h('p', { class: 'muted small' }, run.combat ? "Pas de changement d'équipement en plein combat." : '') : null,
        equipmentView({
          content: c, holder: p, view, tranche, rerender: () => api.refresh(),
          actions: {
            locked, lockedReason: "Pas de changement d'équipement en plein combat.", extra,
            equip: (inst, slot) => act({ type: 'EQUIP', playerId: p.id, uid: inst.uid, slot: slot || undefined }),
            unequip: (slot) => act({ type: 'UNEQUIP', playerId: p.id, slot })
          }
        }),
        h('p', { class: 'muted small' }, "Les objets ne changent de main que par don volontaire. Le butin trouvé pendant la run n'est ajouté à ton personnage qu'en cas de victoire.")
      ];
    }
  });
}
