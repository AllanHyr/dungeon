// ============================================================
//  flow.js — Le déroulement des tours : qui joue, fin de tour, répartition du butin
// ============================================================
// Un TOUR = un joueur "sous les projecteurs" fait avancer le groupe d'une case
// et décide de ce qu'on fait du résultat. À la fin du tour, on passe au suivant.

import { log, social, getPlayer, livingPlayers, currentTile, spotlightPlayer, assert } from './util.js';
import { consumeStun, tickPoison, hasStatus } from './units.js';
import { unitStats } from './stats.js';
import { endRun } from './results.js';

/** Qui prend les décisions de ce tour ? Le joueur sous les projecteurs, ou à défaut un joueur vivant. */
export function decider(state) {
  const spot = spotlightPlayer(state);
  if (spot && spot.alive) return spot;
  return livingPlayers(state)[0] || spot;
}

/** Trouve le prochain joueur vivant (qui n'est pas assommé) à partir d'une position. */
function findNextSpotlight(state, startIndex) {
  const n = state.players.length;
  for (let k = 0; k < n * 2; k++) {
    const idx = (startIndex + k) % n;
    const p = state.players[idx];
    if (!p.alive) continue;
    if (consumeStun(p)) {
      log(state, `${p.name} est assommé et passe son tour.`, 'bad');
      continue;
    }
    return idx;
  }
  return state.players.findIndex((p) => p.alive);
}

/** Début d'un tour : le joueur sous les projecteurs va pouvoir avancer. */
export function startTurn(state) {
  if (state.phase === 'ended') return;
  state.phase = 'advance';
  state.headline = null;
  state.pending = { kind: 'advance', actor: spotlightPlayer(state).id };
  for (const p of state.players) p.ghostActed = false;
}

/** Fin d'un tour : poison, régénération, temps qui passe, puis joueur suivant. */
export function endTurn(state) {
  if (state.phase === 'ended') return;
  const rules = state.content.rules;

  for (const p of livingPlayers(state)) {
    tickPoison(state, p);
    // Petite récupération entre deux cases (sauf si empoisonné)
    if (!hasStatus(p, 'poison')) {
      const max = unitStats(state, p).hpMax;
      p.hp = Math.min(max, p.hp + Math.max(1, Math.round(max * rules.regenPerTurnPct)));
    }
    for (const id of Object.keys(p.cooldowns)) p.cooldowns[id] = Math.max(0, p.cooldowns[id] - 1);
  }

  state.turn++;
  const next = findNextSpotlight(state, state.spotlight + 1);
  state.spotlight = next >= 0 ? next : 0;
  startTurn(state);
}

// ---------------- Butin ----------------

/** Ajoute des objets à répartir : le joueur actif décidera de les garder ou de les donner. */
export function queueLoot(state, items) {
  for (const it of items) if (it) state.lootQueue.push(it);
}

/** Construit la question "garder ou donner ?" pour un objet. */
function lootPending(state, item) {
  const actor = decider(state);
  const options = [{ id: 'keep', label: `Garder pour ${actor.name}` }];
  for (const p of state.players) {
    if (p.id === actor.id) continue;
    options.push({ id: `give:${p.id}`, target: p.id, label: `Donner à ${p.name}${p.alive ? '' : ' (fantôme)'}` });
  }
  return { kind: 'choice', subtype: 'loot', actor: actor.id, item, prompt: `${actor.name} a trouvé un objet. Qu'en fait-il ?`, options };
}

/** Réponse à la question "garder ou donner ?". */
export function resolveLootChoice(state, optionId) {
  const pend = state.pending;
  const opt = pend.options.find((o) => o.id === optionId);
  assert(opt, 'Choix invalide.');
  const actor = getPlayer(state, pend.actor);
  if (optionId === 'keep') {
    actor.bag.push(pend.item);
    log(state, `${actor.name} garde l'objet.`, 'loot');
  } else {
    const target = getPlayer(state, opt.target);
    target.bag.push(pend.item);
    actor.stats.itemsGiven++;
    target.stats.itemsReceived++;
    social(state, 'gift', actor.id, target.id, pend.item.id);
    log(state, `${actor.name} offre l'objet à ${target.name} !`, 'social');
  }
  nextLootOrEnd(state);
}

/** Passe à l'objet suivant à répartir, ou termine la case s'il n'y en a plus. */
export function nextLootOrEnd(state) {
  if (state.phase === 'ended') return;
  if (state.lootQueue.length) {
    state.phase = 'tile';
    state.pending = lootPending(state, state.lootQueue.shift());
    return;
  }
  const tile = currentTile(state);
  if (tile && tile.type === 'boss' && state.bossDefeated) {
    endRun(state, 'victory');
    return;
  }
  endTurn(state);
}

/** Appelée quand la case est entièrement résolue. */
export function finishTile(state) {
  if (state.phase === 'ended') return;
  const tile = currentTile(state);
  if (tile) tile.resolved = true;
  nextLootOrEnd(state);
}
