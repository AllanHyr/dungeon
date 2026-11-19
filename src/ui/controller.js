// ============================================================
//  controller.js — Fait le lien entre l'écran et le moteur de jeu
// ============================================================
// Quand le joueur clique, on appelle `act({ type: 'ADVANCE' })` par exemple :
//   1) le moteur applique l'action (règles du jeu),
//   2) on joue l'animation des dés,
//   3) on sauvegarde la partie, puis on redessine l'écran.
// C'est aussi ici que vit le MINUTEUR de tour : en solo, quand le temps est écoulé, on envoie l'action { type: 'TIMEOUT' } au moteur ;
// à plusieurs en ligne, c'est le SERVEUR qui compte (et qui joue à la place d'un joueur absent) : l'écran n'affiche que le décompte.
//
// À plusieurs, les autres joueurs aussi font évoluer la partie : le serveur nous POUSSE leurs coups (voir connectLive plus bas), et
// toutes les mises à jour — la réponse à notre action comme les messages des autres — s'appliquent une par une, dans l'ordre.
//
// Les personnages et les parties passent par la PASSERELLE (app.gateway, voir src/net/common.js) : en jeu local elle
// s'exécute dans le navigateur, en ligne elle parle au serveur. Ce fichier ne le sait pas : il attend simplement ses réponses.
// (La salle d'entraînement fait exception : elle ne concerne aucun personnage, elle se joue toujours dans le navigateur.)

import { createTraining, attachContent, rewardTexts } from '../core/index.js';
import { localDispatch } from '../net/local-gateway.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { app, persistProfile, toast, closeModal, refreshModal } from './state.js';
import { showDice } from './dice-ui.js';
import { play } from './sound.js';
import * as fx from './fx.js';
import { snapshotRun } from './fx-plan.js';
import { isMyTurn, inRoom, canSend } from './turn.js';

/** Change d'écran. */
export function go(screen) {
  app.screen = screen;
  app.ui = {};
  closeModal();
  app.render();
  syncTimer();
  window.scrollTo(0, 0);
}

/** Redessine l'écran et les fenêtres ouvertes. */
export function redraw() {
  app.render();
  refreshModal();
  syncTimer();
}

// ---------------- Cycle de vie d'une run ----------------

/** Lance un donjon avec ces personnages. `replace` : une partie en cours existe et on l'écrase (le joueur l'a confirmé). */
export async function startRun(setup, teamIds) {
  if (app.busy) return;
  app.busy = true;
  try {
    const res = await app.gateway.startDungeon(setup, teamIds, { replace: !!savedRunInfo() });
    if (!res.ok) return toast(res.error, 'bad');
    app.run = res.run;
    app.profile.lastTeam = teamIds.slice();
    app.profile.lastSetup = { ...setup };
    persistProfile();
    go('run');
  } finally {
    app.busy = false;
  }
}

/** Lance une session de farm solo avec ce personnage. */
export async function startFarm(charId) {
  if (app.busy) return;
  app.busy = true;
  try {
    const res = await app.gateway.startFarm(charId, { replace: !!savedRunInfo() });
    if (!res.ok) return toast(res.error, 'bad'); // ex. récompense pas encore choisie
    app.run = res.run;
    app.profile.settings.farmChar = charId;
    app.profile.settings.view = 'farm';
    persistProfile();
    go('run');
  } finally {
    app.busy = false;
  }
}

/** Y a-t-il une partie sauvegardée à reprendre ? Renvoie un résumé ou null. */
export function savedRunInfo() {
  return app.gateway ? app.gateway.savedRunInfo() : null;
}

/** Les personnages engagés dans une partie sauvegardée : on ne peut pas les modifier tant qu'elle n'est pas finie. */
export function lockedCharIds() {
  return new Set(savedRunInfo()?.charIds || []);
}

export async function resumeRun() {
  const res = await app.gateway.resumeRun();
  if (!res.ok) {
    toast(res.error, 'bad');
    return redraw();
  }
  app.run = res.run;
  go('run');
}

export async function discardSavedRun() {
  await app.gateway.discardRun();
  redraw();
}

// ---------------- Compte (en ligne) ----------------

/** Se déconnecte du compte et revient à l'écran de connexion. */
export async function logout() {
  if (app.gateway.mode !== 'online') return;
  await app.gateway.logout();
  app.run = null;
  go('login');
}

// ---------------- Personnages ----------------

/**
 * Une action sur un personnage (créer, équiper, apprendre...). La passerelle l'applique (ici ou sur le serveur),
 * puis on annonce les succès débloqués. Renvoie la réponse : { ok, error?, character?, ... }.
 */
export async function characterAction(action) {
  if (app.busy) return { ok: false, error: 'Un instant...' };
  app.busy = true;
  try {
    const res = await app.gateway.character(action);
    if (!res.ok) {
      toast(res.error, 'bad');
      return res;
    }
    if (res.unlocked?.length) announceAchievements(res.unlocked.map((a) => ({ charName: res.character?.name || '', charId: res.character?.id, achievement: a })));
    return res;
  } finally {
    app.busy = false;
  }
}

// ---------------- Succès ----------------

/** Annonce les succès débloqués, un par un (message en bas de l'écran). */
export function announceAchievements(list) {
  list.forEach((u, i) => {
    setTimeout(() => {
      toast(`Succès débloqué : « ${u.achievement.name} » — ${rewardTexts(app.content, u.achievement).join(' · ')}`, 'good');
      play('crit');
    }, 700 + i * 3600);
  });
}

// ---------------- Atelier de classes (salle d'entraînement) ----------------

/** Entre dans la salle d'entraînement avec ces personnages de test. */
export function startTraining(specs, opts) {
  app.run = createTraining(app.content, specs, opts);
  app.trainingSetup = { specs, opts };
  app.profile.settings.training = { specs, opts };
  persistProfile();
  go('run');
}

/**
 * Relit les fichiers JSON (sans recharger la page) puis recrée la salle d'entraînement :
 * on modifie une classe dans l'éditeur, on clique, et on teste tout de suite.
 */
export async function reloadContent() {
  try {
    const content = await app.gateway.reloadContent();
    app.content = content;
    if (app.run?.training && app.trainingSetup) {
      app.run = createTraining(content, app.trainingSetup.specs, app.trainingSetup.opts);
    } else if (app.run) attachContent(app.run, content);
    toast('Données rechargées !', 'good');
    redraw();
  } catch (e) {
    toast(e.message, 'bad');
  }
}

// ---------------- Minuteur de tour ----------------

let timerHandle = null;

function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
  app.timer = null;
}

function tickTimer() {
  if (!app.timer) return stopTimer();
  const left = Math.max(0, app.timer.deadline - Date.now());
  // (le décompte s'affiche à plusieurs endroits : dans le bandeau du combat, et dans celui « c'est à toi / c'est à X » hors combat)
  for (const fill of document.querySelectorAll('.timer-fill')) {
    fill.style.width = `${(left / app.timer.total) * 100}%`;
    fill.classList.toggle('urgent', left < Math.min(10000, app.timer.total * 0.25));
  }
  for (const text of document.querySelectorAll('.timer-text')) text.textContent = `${Math.ceil(left / 1000)} s`;
  if (left <= 0) {
    // À plusieurs, c'est le serveur qui joue à la place du joueur absent : ici on ne fait que laisser le décompte arriver à zéro.
    const passive = app.timer.passive;
    stopTimer();
    if (!passive && !app.busy) act({ type: 'TIMEOUT' });
  }
}

/**
 * Lance (ou garde) le minuteur du tour en cours. Appelée après chaque affichage.
 * Un nouveau tour de joueur = un nouveau décompte ; plusieurs actions dans le même
 * tour gardent le même décompte.
 */
export function syncTimer() {
  const run = app.run;
  // À plusieurs : le décompte vient du serveur (run.net.timer) et on ne fait que l'afficher.
  if (run && inRoom(run)) {
    const timer = run.net.timer;
    if (app.screen !== 'run' || run.phase === 'ended' || !timer) return app.timer && stopTimer();
    const key = `room|${run.net.runId}|${run.net.rev}`;
    if (app.timer && app.timer.key === key) return tickTimer();
    stopTimer();
    app.timer = { key, deadline: timer.deadline, total: timer.total || timer.seconds * 1000, passive: true };
    timerHandle = setInterval(tickTimer, 250);
    return tickTimer();
  }
  const secs = app.profile?.settings.turnSeconds || 0;
  const active = app.screen === 'run' && run && run.phase === 'combat' && run.pending?.kind === 'combat' && secs > 0;
  if (!active) return app.timer && stopTimer();
  const key = `${run.combat.round}|${run.combat.turn}|${run.pending.actor}`;
  if (app.timer && app.timer.key === key) return tickTimer();
  stopTimer();
  app.timer = { key, deadline: Date.now() + secs * 1000, total: secs * 1000 };
  timerHandle = setInterval(tickTimer, 250);
  tickTimer();
}

// ---------------- Envoyer une action au moteur ----------------

const nameOf = (id) => app.run?.players.find((p) => p.id === id)?.name || '?';

// Les mises à jour de la partie s'appliquent UNE PAR UNE, dans l'ordre : on attend la fin des animations (les dés...) avant la suivante.
let queue = Promise.resolve();
function enqueue(job) {
  const next = queue.then(job, job);
  queue = next.catch((e) => console.error(e));
  return next;
}

/**
 * Envoie une action au moteur de jeu, joue les animations, sauvegarde et redessine.
 * Renvoie true si l'action a été acceptée.
 */
export async function act(action) {
  if (app.busy || !app.run || fx.isReplaying()) return false;
  if (!canSend(app.run, action)) {
    toast(action.type === 'ABANDON' ? "Seul l'hôte du salon peut abandonner la partie." : "Ce n'est pas ton tour.", 'bad');
    return false;
  }
  app.busy = true;
  try {
    // (la photo des PV AVANT l'action : en jeu local le moteur modifie la partie sur place, il faut la prendre avant)
    const before = snapshotRun(app.run);
    // La salle d'entraînement se joue dans le navigateur ; une vraie partie passe par la passerelle (navigateur ou serveur).
    const res = app.run.training ? localDispatch(app.run, action) : await app.gateway.act(app.run, action);
    return await enqueue(() => applyUpdate(res, { own: true, before }));
  } finally {
    app.busy = false;
  }
}

/**
 * Applique une mise à jour de la partie : ma réponse (own) ou un message poussé par le serveur quand un autre joueur a joué.
 * Les deux disent la même chose pour ma propre action : le numéro de version (rev) permet de ne l'appliquer qu'une fois.
 */
async function applyUpdate(res, { own, before = null }) {
  const incoming = res.run;
  const cur = app.run?.net;
  const nxt = incoming?.net;
  const sameRun = !!cur && !!nxt && cur.runId === nxt.runId;
  if (res.ok && sameRun && nxt.rev <= cur.rev) return true; // déjà vue
  if (!res.ok) {
    if (own) toast(res.error, 'bad');
    // (le serveur renvoie la partie à jour même quand l'action est refusée : l'écran se resynchronise)
    if (incoming && (!sameRun || nxt.rev > cur.rev)) {
      app.run = incoming;
      redraw();
    }
    return false;
  }
  const wasMyTurn = isMyTurn(app.run);
  const snap = before || snapshotRun(app.run); // (les PV d'avant : ce que l'écran montre encore)
  if (incoming) app.run = incoming; // (en ligne, le serveur renvoie la partie à jour)
  const run = app.run;
  // Les jets importants s'affichent en grand AVANT de montrer la suite
  for (const ev of res.events) {
    if (ev.type === 'roll' && !ev.minor) await showDice(ev, nameOf(ev.playerId));
  }
  if (run.training && run.phase === 'ended') {
    go('menu');
    return true;
  }
  if (res.ended) {
    app.unlocked = res.unlockedList;
    announceAchievements(app.unlocked);
  }
  // L'action se joue d'abord sur l'ANCIEN écran (élan, impact, PV qui descendent...), puis l'écran montre le résultat.
  // Quand l'ancien écran ne montre pas les combattants (un combat commence, la vague suivante arrive), on dessine d'abord le nouvel
  // écran — les monstres entrent en scène — puis on y rejoue ce qu'ils ont fait.
  const playable = app.screen === 'run' && res.events?.length;
  const combatStarts = app.screen === 'run' && !!run.combat && run.phase === 'combat' && !snap.combat;
  if (playable) fx.setMode(fx.resolveMode(app.profile?.settings?.fx));
  if (playable && !combatStarts && fx.canPlayHere(res.events, snap, run, app.content)) {
    await fx.replay({ events: res.events, before: snap, after: run, content: app.content });
    redraw();
  } else {
    redraw();
    if (combatStarts) await fx.entrance(); // un combat commence : les monstres entrent en scène
    if (playable) {
      await fx.replay({ events: res.events, before: snap, after: run, content: app.content, rewind: true });
      redraw();
    }
  }
  if (!own && !res.ended && isMyTurn(run) && !wasMyTurn) play('turn'); // « c'est à toi ! »
  if (res.ended) {
    play(run.result.won || run.result.outcome === 'stop' ? 'win' : 'lose');
    setTimeout(() => app.screen === 'run' && go('end'), run.result.won ? 1300 : run.farm ? 900 : 1500);
  }
  return true;
}

/** Abandonner la run en cours (via le moteur, pour que le bilan soit calculé). */
export function abandon() {
  return act({ type: 'ABANDON' });
}

// ============================================================
//  À plusieurs : les salons et le temps réel
// ============================================================

/** Quitte la partie à plusieurs en cours : le héros reste dans le donjon (le pilote automatique le joue), mais ne gagne rien. */
export async function leaveRoom() {
  const res = await app.gateway.leaveRoom();
  if (!res.ok) return toast(res.error, 'bad');
  app.run = null;
  if (app.screen === 'menu') redraw();
  else go('menu');
}

/** Un geste dans la salle d'attente (héros, prêt, réglages, retirer un joueur) : le serveur répond avec le salon à jour. */
export async function roomGesture(name, ...args) {
  const gw = app.gateway;
  const call = { hero: gw.roomHero, ready: gw.roomReady, setup: gw.roomSetup, kick: gw.roomKick }[name];
  const res = await call(...args);
  if (!res.ok) toast(res.error, 'bad');
  if (app.screen === 'lobby') app.render();
  return res;
}

/** Crée un salon avec ce héros (le donjon et la difficulté choisis sur l'accueil sont repris) et entre dans la salle d'attente. */
export async function createRoom(charId, setup) {
  if (app.busy) return;
  app.busy = true;
  try {
    const res = await app.gateway.createRoom(charId, setup);
    if (!res.ok) return toast(res.error, 'bad');
    app.profile.settings.farmChar = charId;
    persistProfile();
    go('lobby');
  } finally {
    app.busy = false;
  }
}

/** Rejoint un salon (avec son code, ou depuis la liste) avec ce héros. */
export async function joinRoom(target, charId) {
  if (app.busy) return;
  app.busy = true;
  try {
    const res = await app.gateway.joinRoom(target, charId);
    if (!res.ok) return toast(res.error, 'bad');
    app.profile.settings.farmChar = charId;
    persistProfile();
    go('lobby');
  } finally {
    app.busy = false;
  }
}

/** L'hôte lance la partie. */
export async function startRoom() {
  if (app.busy) return;
  app.busy = true;
  try {
    const res = await app.gateway.roomStart();
    if (!res.ok) return toast(res.error, 'bad');
    app.run = res.run;
    go('run');
  } finally {
    app.busy = false;
  }
}

/** Retourne dans la salle d'attente (ou dans la partie) du salon où l'on est. */
export function backToRoom() {
  const room = app.gateway.room;
  if (!room) return;
  if (room.status === 'running') return resumeRun();
  go('lobby');
}

let roomsTimer = null;
/** La liste des salons ouverts a changé : on la relit (au plus une fois par quart de seconde) si l'accueil l'affiche. */
function refreshRoomsSoon() {
  clearTimeout(roomsTimer);
  roomsTimer = setTimeout(async () => {
    if (app.screen !== 'menu' || app.gateway.mode !== 'online') return;
    await app.gateway.refreshRooms();
    if (app.screen === 'menu') redraw();
  }, 250);
}

/** Un message de partie poussé par le serveur (un autre joueur a joué, le minuteur a joué à la place de quelqu'un, la partie commence...). */
function onRunPush(payload) {
  const res = app.gateway.receiveRun(payload);
  enqueue(async () => {
    if (!res.run) return;
    if (app.screen === 'run') return applyUpdate(res, { own: false });
    if (app.screen === 'lobby' && !res.ended) {
      app.run = res.run; // la partie commence : tout le monde quitte la salle d'attente
      go('run');
      toast('La partie commence !', 'good');
      play('click');
      return;
    }
    if (res.ended && app.screen === 'menu') toast('La partie à plusieurs est terminée : tes personnages sont à jour.', 'info');
    if (app.screen === 'menu') redraw(); // (le bandeau « une partie est en cours » suit)
  });
}

function onRoomPush(view) {
  if (app.screen === 'lobby') {
    if (!view) {
      toast(app.run ? 'La partie est terminée.' : 'Tu n\'es plus dans ce salon.', 'bad');
      return go('menu');
    }
    return app.render();
  }
  if (app.screen === 'menu') redraw();
  else if (app.screen === 'run' && !app.busy) redraw(); // (les pastilles « en ligne » des joueurs)
}

/** (Re)connexion du flux temps réel : le serveur envoie l'état complet, on s'y remet à jour (après une coupure, par exemple). */
function onSync(data) {
  if (data.run && data.run.run) onRunPush(data.run);
  else if (app.run?.net?.room && app.screen === 'run') {
    // La partie n'existe plus (terminée ou abandonnée pendant que le flux était coupé) : les personnages ont peut-être changé.
    enqueue(async () => {
      await app.gateway.loadProfile();
      app.run = null;
      toast('La partie est terminée.', 'info');
      go('menu');
    });
  } else if (app.screen === 'lobby') {
    if (!data.room) go('menu'); // (le salon n'existe plus)
    else app.render(); // (des changements ont pu arriver pendant la coupure)
  } else if (app.screen === 'menu') redraw();
}

// Le flux temps réel est coupé (réseau, veille...) : au bout de 2 secondes sans le retrouver, un petit message le dit (le navigateur retente tout seul).
let linkTimer = null;
function showLink(ok) {
  clearTimeout(linkTimer);
  linkTimer = null;
  const el = document.getElementById('link-lost');
  if (ok) return el?.remove();
  if (el) return;
  linkTimer = setTimeout(() => {
    linkTimer = null;
    if (!document.getElementById('link-lost')) document.body.append(h('div', { id: 'link-lost', class: 'link-lost', role: 'status' }, icon('alert', 16), 'Connexion perdue : nouvel essai en cours…'));
  }, 2000);
}

/** Ouvre le flux temps réel (jeu en ligne, une fois connecté) : salon, partie, liste des salons. */
export function connectLive() {
  const gw = app.gateway;
  if (!gw || gw.mode !== 'online' || !gw.user) return;
  gw.onLinkClosed = () => showLink(true); // (flux fermé exprès, par exemple à la déconnexion : plus rien à signaler)
  gw.connect({ onSync, onRoom: onRoomPush, onRun: onRunPush, onRooms: refreshRoomsSoon, onLink: showLink });
}
