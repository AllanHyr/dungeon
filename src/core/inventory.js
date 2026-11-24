// ============================================================
//  inventory.js — Équiper, donner, acheter, vendre, et l'aide des fantômes
// ============================================================
// Rappel des règles sur les objets :
//  - AUCUN vol : un objet ne change de main que par DON volontaire (ou échange accepté).
//  - Un objet ne s'équipe que si le niveau RÉEL du joueur est suffisant.
//  - Tout ce qui se passe ici reste dans la run : le personnage sauvegardé
//    n'est modifié qu'à la fin d'une victoire (voir results.js).

import { rollD20 } from './rng.js';
import { log, emit, social, getPlayer, currentTile, assert, clamp, livingPlayers } from './util.js';
import { equipFromBag, unequipToBag, itemDef, itemPrice, takeFromList } from './items.js';
import { clampHp } from './units.js';
import { shopPrice } from './tiles.js';

function playerOrFail(state, id) {
  const p = getPlayer(state, id);
  assert(p, 'Joueur inconnu.');
  return p;
}

export function equipItem(state, playerId, uid, slot = null) {
  assert(!state.farm, "Pas de changement d'équipement pendant une session de farm.");
  assert(!state.combat, "Impossible de s'équiper en plein combat.");
  const p = playerOrFail(state, playerId);
  const inst = p.bag.find((it) => it.uid === uid);
  assert(inst, "Cet objet n'est pas dans le sac.");
  const res = equipFromBag(state.content, p, uid, slot);
  assert(res.ok, res.reason);
  clampHp(state, p);
  const names = res.displaced.map((d) => itemDef(state.content, d).name);
  log(state, `${p.name} équipe ${itemDef(state.content, inst).name}${names.length ? ` (${names.join(', ')} retourne au sac)` : ''}.`, 'info');
}

export function unequipItem(state, playerId, slot) {
  assert(!state.farm, "Pas de changement d'équipement pendant une session de farm.");
  assert(!state.combat, "Impossible de se déséquiper en plein combat.");
  const p = playerOrFail(state, playerId);
  const inst = unequipToBag(p, slot);
  assert(inst, 'Rien à retirer.');
  clampHp(state, p);
  log(state, `${p.name} retire ${itemDef(state.content, inst).name}.`, 'info');
}

/** Don volontaire d'un objet du sac à un autre joueur. */
export function giveItem(state, fromId, toId, uid) {
  assert(!state.combat, 'Pas de don en plein combat.');
  assert(fromId !== toId, 'Choisis un autre joueur.');
  const from = playerOrFail(state, fromId);
  const to = playerOrFail(state, toId);
  const inst = takeFromList(from.bag, uid);
  assert(inst, "Cet objet n'est pas dans le sac.");
  to.bag.push(inst);
  from.stats.itemsGiven++;
  to.stats.itemsReceived++;
  social(state, 'gift', from.id, to.id, inst.id);
  log(state, `${from.name} offre ${itemDef(state.content, inst).name} à ${to.name}.`, 'social');
}

// ---------------- Marchand ----------------

export function shopBuy(state, { index, buyerId }) {
  const atCamp = state.pending?.kind === 'camp';
  assert(state.pending?.kind === 'shop' || atCamp, "Pas de marchand ici.");
  const tile = currentTile(state);
  const entry = tile.stock?.[index];
  assert(entry && !entry.sold, 'Objet indisponible.');
  const buyer = playerOrFail(state, buyerId);
  // (au feu de camp, le colporteur ne sert que le héros dont c'est le tour, et pour lui-même)
  if (atCamp) assert(buyer.id === state.pending.actor, "Au coin du feu, chacun achète pour lui, à son tour.");
  assert(buyer.alive, 'Un fantôme ne peut rien acheter.');
  const def = itemDef(state.content, entry.inst);
  const price = shopPrice(state, tile, itemPrice(state.content, def));
  assert(state.gold >= price, "Pas assez d'or.");
  state.gold -= price;
  entry.sold = true;
  buyer.bag.push(entry.inst);
  log(state, `${buyer.name} achète ${def.name} pour ${price} or.`, 'loot');
}

export function shopSell(state, { playerId, uid }) {
  assert(state.pending?.kind === 'shop', "Pas de marchand ici.");
  const p = playerOrFail(state, playerId);
  const inst = p.bag.find((it) => it.uid === uid);
  assert(inst, "Cet objet n'est pas dans le sac.");
  const def = itemDef(state.content, inst);
  const price = sellPrice(state, def);
  takeFromList(p.bag, uid);
  state.gold += price;
  log(state, `${p.name} vend ${def.name} pour ${price} or.`, 'loot');
}

export function sellPrice(state, def) {
  return Math.max(1, Math.round(itemPrice(state.content, def) * state.content.rules.shop.sellRate));
}

// ---------------- Fantômes ----------------

/**
 * Un fantôme peut aider une fois par tour :
 *  - bless  : +2 au prochain jet de dé d'un joueur vivant
 *  - hinder : -2 (pour embêter un peu...)
 *  - light  : révèle la prochaine case
 * Il lance son propre D20 : 8+ pour réussir, un 1 se retourne contre lui.
 */
export function ghostAct(state, { playerId, mode }) {
  const g = playerOrFail(state, playerId);
  assert(!g.alive, 'Seuls les fantômes peuvent faire ça.');
  assert(!g.ghostActed, 'Ce fantôme a déjà agi ce tour-ci.');
  assert(['advance', 'roll', 'combat'].includes(state.pending?.kind), "Ce n'est pas le moment.");
  assert(['bless', 'hinder', 'light'].includes(mode), 'Action de fantôme inconnue.');
  const board = state.dungeon.board;
  const next = board[state.dungeon.position + 1];
  if (mode === 'light') {
    assert(state.pending.kind === 'advance', 'On ne peut éclairer que juste avant d\'avancer.');
    assert(next && !next.revealed, 'La prochaine case est déjà visible.');
  }

  const rules = state.content.rules;
  const natural = rollD20(state);
  emit(state, { type: 'roll', playerId: g.id, natural, luck: 0, ghostMod: 0, total: natural, purpose: 'ghost', minor: false });
  g.ghostActed = true;
  g.stats.ghostActions++;

  const bonus = rules.ghost.bonus;
  const limit = rules.d20.rollModLimit;
  const addMod = (v) => (state.bonus.rollMod = clamp(state.bonus.rollMod + v, -limit, limit));

  if (natural >= rules.ghost.successMin) {
    if (mode === 'light') {
      next.revealed = true;
      log(state, `${g.name} (fantôme) éclaire la suite : la prochaine case est révélée.`, 'social');
    } else {
      addMod(mode === 'bless' ? bonus : -bonus);
      log(state, `${g.name} (fantôme, D20 : ${natural}) ${mode === 'bless' ? 'bénit' : 'gêne'} le prochain jet : ${mode === 'bless' ? '+' : '-'}${bonus}.`, 'social');
    }
    social(state, 'ghost', g.id, null, mode);
  } else if (natural === 1) {
    if (mode !== 'light') addMod(mode === 'bless' ? -bonus : bonus);
    log(state, `${g.name} (fantôme, D20 : 1) se trompe : le souffle se retourne !`, 'bad');
  } else {
    log(state, `${g.name} (fantôme, D20 : ${natural}) : son souffle se dissipe sans effet.`, 'info');
  }
}
