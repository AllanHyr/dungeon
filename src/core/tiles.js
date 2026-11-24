// ============================================================
//  tiles.js — Ce qui se passe sur chaque type de case
// ============================================================
// Chaque type de case a 3 moments possibles :
//   onReveal : la case est découverte (on prépare le contenu, on pose la question)
//   onRoll   : le joueur actif a lancé le D20 demandé
//   onChoice : le joueur actif a pris une décision (garder / donner / saboter...)
// Le moteur (engine.js) appelle la bonne fonction selon l'état de la partie.

import { randInt } from './rng.js';
import {
  log, headline, social, getPlayer, livingPlayers, ghosts, assert, clamp, emit, currentTile
} from './util.js';
import { decider, queueLoot, finishTile } from './flow.js';
import { applyDamage, addStatus, healUnit, reviveUnit, canBeRevived } from './units.js';
import { unitStats } from './stats.js';
import { spawnMonsters, startCombat } from './combat.js';
import { rollItem, rollShopItem, bestPotion } from './loot.js';
import { EQUIP_SLOTS, dungeonRules } from './content.js';
import { itemDef } from './items.js';

/** Pose la question "lance le D20" au joueur qui décide. */
function askRoll(state, purpose, title, text, extra = {}) {
  state.pending = { kind: 'roll', purpose, actor: decider(state).id, title, text, ...extra };
}

/** Pose une question à choix multiples. */
function askChoice(state, subtype, prompt, options, extra = {}) {
  state.pending = { kind: 'choice', subtype, actor: decider(state).id, prompt, options, ...extra };
}

// ============================================================
//  Combat et Boss
// ============================================================
const combatTile = {
  onReveal(state, tile) {
    tile.monsters = spawnMonsters(state, tile.type === 'boss');
    const names = tile.monsters.map((m) => m.name).join(', ');
    headline(state, tile.type === 'boss' ? `Le boss vous attend : ${names} !` : `Des ennemis surgissent : ${names} !`, 'bad');
    askRoll(state, 'initiative', "Jet d'initiative", "17 ou plus : embuscade réussie (les monstres perdent leur tour). 4 ou moins : vous êtes surpris !");
  },
  onRoll(state, tile, roll) {
    const actor = getPlayer(state, state.pending.actor);
    const ini = state.content.rules.initiative;
    if (roll.total >= ini.ambushMin || roll.natural === 20) actor.stats.rollsOk++;
    if (roll.total <= ini.surpriseMax || roll.natural === 1) actor.stats.rollsKo++;
    startCombat(state, tile, roll);
  }
};

// ============================================================
//  Trésor
// ============================================================
const treasure = {
  onReveal(state) {
    const careful = state.content.rules.tileChoices?.treasure?.carefulTotal;
    if (!careful) return askForce(state);
    askChoice(state, 'treasure', 'Un coffre. Le forcer, ou l\'ouvrir prudemment ?', [
      { id: 'force', label: 'Le forcer (jet de D20)', hint: 'Plus le jet est haut, meilleur est le butin. Un 20 donne deux objets… un 1 déclenche un piège.' },
      { id: 'careful', label: 'L\'ouvrir prudemment', hint: `Pas de dé : un butin moyen (comme un jet de ${careful}), mais aucun piège.` }
    ]);
  },
  onChoice(state, tile, id) {
    if (id === 'force') return askForce(state);
    // Prudemment : comme un jet fixe, sans 20 ni 1
    const actor = getPlayer(state, state.pending.actor);
    log(state, `${actor.name} ouvre le coffre avec précaution.`, 'info');
    treasure.onRoll(state, tile, { natural: null, total: state.content.rules.tileChoices.treasure.carefulTotal });
  },
  onRoll(state, tile, roll) {
    const c = state.content;
    const tr = dungeonRules(c, state.setup);
    const actor = getPlayer(state, state.pending.actor);

    const step = c.rules.loot.rarityRollStep;
    const boost = Math.max(0.2, state.params.rarityBoost * (1 + step * (roll.total - 10)));
    const count = roll.natural === 20 ? 2 : 1;
    const items = [];
    for (let i = 0; i < count; i++) items.push(rollItem(state, { boost }));
    const gold = Math.round(randInt(state, tr.treasureGold[0], tr.treasureGold[1]) * state.params.gold);
    state.gold += gold;

    if (roll.natural === 1) {
      const dmg = Math.round(unitStats(state, actor).hpMax * tr.trapDamagePct);
      const real = applyDamage(state, actor, dmg, null, { ignoreGuard: true });
      actor.stats.rollsKo++;
      log(state, `Le coffre était piégé ! ${actor.name} perd ${real} PV.`, 'bad');
      headline(state, 'Le coffre était piégé !', 'bad');
    } else if (roll.natural === 20) {
      actor.stats.rollsOk++;
      headline(state, 'Coffre exceptionnel : DEUX objets !', 'good');
    } else {
      if (roll.natural && roll.total >= 15) actor.stats.rollsOk++;
      headline(state, roll.natural ? 'Le coffre s\'ouvre...' : 'Le coffre s\'ouvre sans un bruit.', 'good');
    }
    log(state, `Le coffre contient ${gold} pièces d'or${items.length > 1 ? ' et deux objets' : ' et un objet'}.`, 'loot');
    queueLoot(state, items);
    finishTile(state);
  }
};

function askForce(state) {
  askRoll(state, 'treasure', 'Ouvrir le coffre', 'Plus le jet est haut, plus le butin sera de qualité. Un 20 donne deux objets... un 1 déclenche un piège !');
}

// ============================================================
//  Piège
// ============================================================
function askSave(state, dc) {
  askRoll(state, 'trap', 'Jet de sauvegarde', `Il faut ${dc} ou plus (votre bonus de sauvegarde s'ajoute) pour éviter le piège.`, { dc });
}

/** Les chances (0..1) de réussir la sauvegarde contre un piège : 20 réussit toujours, 1 échoue toujours. */
export function trapOdds(state, actor, dc) {
  const bonus = Math.round(unitStats(state, actor).luck) + state.bonus.rollMod + Math.round(unitStats(state, actor).save);
  let ok = 0;
  for (let n = 1; n <= 20; n++) if (n === 20 || (n !== 1 && n + bonus >= dc)) ok++;
  return ok / 20;
}

const trap = {
  onReveal(state, tile) {
    const tr = dungeonRules(state.content, state.setup);
    const dc = tr.trapDc + state.params.trapDcBonus;
    const opt = state.content.rules.tileChoices?.trap;
    if (!opt) return askSave(state, dc);
    const actor = decider(state);
    const hpMax = unitStats(state, actor).hpMax;
    const full = Math.round(hpMax * tr.trapDamagePct);
    const avoid = Math.max(1, Math.round(full * opt.avoidDamage));
    const odds = Math.round(trapOdds(state, actor, dc) * 100);
    tile.dc = dc;
    askChoice(state, 'trap', `Un piège ! ${actor.name} peut tenter de le désarmer, ou le contourner.`, [
      { id: 'disarm', label: `Le désarmer (${odds} % de chances)`, hint: `Jet de sauvegarde contre ${dc}. Réussi : quelques pièces récupérées. Raté : −${full} PV (et parfois du poison).` },
      { id: 'avoid', label: `Le contourner (−${avoid} PV)`, hint: 'Pas de dé : on passe en se faisant un peu mal, à coup sûr.' }
    ], { dc });
  },
  onChoice(state, tile, id) {
    if (id === 'disarm') return askSave(state, tile.dc);
    const c = state.content;
    const tr = dungeonRules(c, state.setup);
    const actor = getPlayer(state, state.pending.actor);
    const dmg = Math.max(1, Math.round(unitStats(state, actor).hpMax * tr.trapDamagePct * c.rules.tileChoices.trap.avoidDamage));
    const real = applyDamage(state, actor, dmg, null, { ignoreGuard: true });
    log(state, `${actor.name} contourne le piège en s'écorchant (−${real} PV).`, 'info');
    headline(state, `Piège contourné : −${real} PV pour ${actor.name}`, 'info');
    finishTile(state);
  },
  onRoll(state, tile, roll) {
    const c = state.content;
    const tr = dungeonRules(c, state.setup);
    const actor = getPlayer(state, state.pending.actor);
    const dc = state.pending.dc;
    const save = Math.round(unitStats(state, actor).save);
    const total = roll.total + save;
    log(state, `Sauvegarde : ${roll.total} + ${save} (bonus) = ${total} contre ${dc}.`, 'roll');
    const success = roll.natural === 20 || (roll.natural !== 1 && total >= dc);

    if (success) {
      actor.stats.rollsOk++;
      const scrap = c.rules.tileChoices?.trap?.disarmGold;
      if (scrap && roll.natural !== 20) {
        const gold = Math.max(1, Math.round(randInt(state, tr.treasureGold[0], tr.treasureGold[1]) * state.params.gold * scrap));
        state.gold += gold;
        log(state, `${actor.name} désamorce le piège et récupère ${gold} or en pièces détachées.`, 'good');
        headline(state, `Piège désamorcé : +${gold} or`, 'good');
      } else if (roll.natural === 20) {
        const gold = Math.round(randInt(state, tr.treasureGold[0], tr.treasureGold[1]) * state.params.gold);
        state.gold += gold;
        log(state, `${actor.name} désamorce le piège et récupère ${gold} or !`, 'good');
        headline(state, 'Piège désamorcé avec brio !', 'good');
      } else {
        log(state, `${actor.name} évite le piège de justesse.`, 'good');
        headline(state, 'Piège évité !', 'good');
      }
    } else {
      actor.stats.rollsKo++;
      const hpMax = unitStats(state, actor).hpMax;
      const dmg = Math.round(hpMax * tr.trapDamagePct * (roll.natural === 1 ? 1.6 : 1));
      const real = applyDamage(state, actor, dmg, null, { ignoreGuard: true });
      log(state, `Le piège se déclenche ! ${actor.name} perd ${real} PV.`, 'bad');
      headline(state, `Piège déclenché ! -${real} PV pour ${actor.name}`, 'bad');
      if (actor.alive && roll.natural <= 5) {
        addStatus(actor, { id: 'poison', pct: c.rules.poison.pct, turns: c.rules.poison.turns });
        log(state, `Des pointes empoisonnées ! ${actor.name} est empoisonné.`, 'bad');
      }
    }
    finishTile(state);
  }
};

// ============================================================
//  Fontaine d'XP
// ============================================================
const xpFountain = {
  onReveal(state) {
    const tr = dungeonRules(state.content, state.setup);
    const actor = decider(state);
    const amount = tr.fountainXp;
    const shared = Math.round(amount * state.content.rules.fountain.xpShareRatio);
    const options = [{ id: 'keep', label: `Tout garder (+${amount} XP pour ${actor.name})` }];
    if (state.players.length > 1) options.push({ id: 'share', label: `Partager avec tout le monde (+${shared} XP chacun)` });
    options.push({ id: 'skip', label: 'Passer son chemin' });
    askChoice(state, 'xp_fountain', "Une fontaine d'expérience ! Mais l'eau est-elle pure ?", options, { amount, shared });
  },
  onChoice(state, tile, id) {
    if (id === 'skip') {
      log(state, 'Le groupe ne boit pas à la fontaine.', 'info');
      headline(state, 'Vous passez votre chemin.', 'neutral');
      finishTile(state);
      return;
    }
    tile.choice = id;
    askRoll(state, 'purity', "Boire l'eau", "Un jet de 5 ou moins : l'eau est empoisonnée pour tous ceux qui boivent !");
  },
  onRoll(state, tile, roll) {
    const c = state.content;
    const pend = state.pending;
    const actor = getPlayer(state, pend.actor);
    const tr = dungeonRules(c, state.setup);
    const amount = tr.fountainXp;
    const shared = Math.round(amount * c.rules.fountain.xpShareRatio);
    const poisoned = roll.natural === 1 || roll.total <= c.rules.fountain.poisonMax;

    let drinkers;
    if (tile.choice === 'keep') {
      actor.fountainXp += amount;
      if (state.players.length > 1) actor.stats.xpKept += amount;
      drinkers = [actor];
      log(state, `${actor.name} boit seul et gagne ${amount} XP !`, 'good');
    } else {
      for (const p of state.players) p.fountainXp += shared;
      actor.stats.xpShared += shared * (state.players.length - 1);
      social(state, 'share', actor.id, null, String(shared));
      drinkers = livingPlayers(state);
      log(state, `${actor.name} partage la fontaine : +${shared} XP pour chacun !`, 'social');
    }
    if (poisoned) {
      actor.stats.rollsKo++;
      for (const p of drinkers) addStatus(p, { id: 'poison', pct: c.rules.poison.pct, turns: c.rules.poison.turns });
      log(state, "L'eau était empoisonnée ! " + drinkers.map((p) => p.name).join(', ') + ' est/sont empoisonné(s).', 'bad');
      headline(state, "L'eau était empoisonnée !", 'bad');
    } else {
      actor.stats.rollsOk++;
      headline(state, "L'eau était pure. Quel soulagement !", 'good');
    }
    finishTile(state);
  }
};

// ============================================================
//  Fontaine de vie
// ============================================================
const lifeFountain = {
  onReveal(state) {
    const options = [];
    for (const g of ghosts(state).filter(canBeRevived)) options.push({ id: `revive:${g.id}`, target: g.id, label: `Ressusciter ${g.name}` });
    const pct = Math.round(state.content.rules.fountain.lifeHealPct * 100);
    options.push({ id: 'heal', label: `Soigner le groupe (+${pct}% PV)` });
    options.push({ id: 'skip', label: 'Passer son chemin' });
    askChoice(state, 'life_fountain', 'Une fontaine de vie, rare et précieuse. Que faire ?', options);
  },
  onChoice(state, tile, id) {
    if (id === 'skip') {
      log(state, 'Le groupe laisse la fontaine de vie intacte.', 'info');
      headline(state, 'Vous passez votre chemin.', 'neutral');
      finishTile(state);
      return;
    }
    tile.choice = id;
    askRoll(state, 'purity', "Boire à la source", "Un jet de 5 ou moins : l'eau est souillée... et les effets sont terribles.");
  },
  onRoll(state, tile, roll) {
    const c = state.content;
    const actor = getPlayer(state, state.pending.actor);
    const poisoned = roll.natural === 1 || roll.total <= c.rules.fountain.poisonMax;
    const r = c.rules.resurrection.fountain;

    if (tile.choice.startsWith('revive:')) {
      const target = getPlayer(state, tile.choice.slice(7));
      assert(target && canBeRevived(target), 'Cible invalide.');
      reviveUnit(state, target, poisoned ? r.poisonedHpPct : r.hpPct, r.hpMaxPenalty);
      actor.stats.revivesDone++;
      social(state, 'revive', actor.id, target.id, 'fountain');
      if (poisoned) {
        actor.stats.rollsKo++;
        log(state, `L'eau est souillée... ${target.name} revient à peine vivant (${target.hp} PV) !`, 'bad');
        headline(state, `${target.name} revient, mais à peine vivant...`, 'bad');
      } else {
        actor.stats.rollsOk++;
        log(state, `${target.name} revient à la vie grâce à la fontaine !`, 'good');
        headline(state, `${target.name} est ressuscité !`, 'good');
      }
    } else {
      if (poisoned) {
        actor.stats.rollsKo++;
        for (const p of livingPlayers(state)) addStatus(p, { id: 'poison', pct: c.rules.poison.pct, turns: c.rules.poison.turns });
        log(state, "L'eau est souillée ! Tout le groupe est empoisonné.", 'bad');
        headline(state, "L'eau était souillée !", 'bad');
      } else {
        actor.stats.rollsOk++;
        for (const p of livingPlayers(state)) healUnit(state, actor, p, Math.round(unitStats(state, p).hpMax * c.rules.fountain.lifeHealPct));
        log(state, 'La fontaine soigne le groupe.', 'good');
        headline(state, 'Le groupe est soigné !', 'good');
      }
    }
    finishTile(state);
  }
};

// ============================================================
//  Coup bas
// ============================================================

/** Un objet équipé actif sur la cible (qu'on peut maudire) ? */
function cursableSlots(state, player) {
  return EQUIP_SLOTS.filter((s) => player.equipment[s] && player.cursedUid !== player.equipment[s].uid);
}

/** Applique l'effet d'un coup bas à `victim`. Tous les effets sont temporaires (limités à la run). */
function applyBlow(state, blow, victim) {
  switch (blow.kind) {
    case 'poison':
      addStatus(victim, { id: 'poison', pct: blow.pct, turns: blow.turns });
      log(state, `${victim.name} est empoisonné !`, 'bad');
      break;
    case 'damage': {
      const dmg = Math.round(unitStats(state, victim).hpMax * blow.hpPct);
      const real = applyDamage(state, victim, dmg, null, { nonLethal: true, ignoreGuard: true });
      log(state, `${victim.name} perd ${real} PV.`, 'bad');
      break;
    }
    case 'skip':
      addStatus(victim, { id: 'stun', turns: 1 });
      log(state, `${victim.name} est assommé et passera sa prochaine action.`, 'bad');
      break;
    case 'curse': {
      const slots = cursableSlots(state, victim);
      if (!slots.length) {
        log(state, `${victim.name} n'a aucun objet à maudire.`, 'info');
        break;
      }
      const slot = slots[randInt(state, 0, slots.length - 1)];
      victim.cursedUid = victim.equipment[slot].uid;
      const name = itemDef(state.content, victim.equipment[slot]).name;
      log(state, `${name} de ${victim.name} est maudit jusqu'à la fin de la run !`, 'bad');
      break;
    }
    default:
      throw new Error(`Coup bas inconnu : ${blow.kind}`);
  }
}

/** Le gain d'un coup bas réussi (pour le saboteur) ou d'un pacte : un bonus de quelques combats (comme le feu de camp), ou des PV. */
function applyGain(state, gain, who) {
  if (!gain) return;
  if (gain.kind === 'heal') {
    const amount = Math.round(unitStats(state, who).hpMax * gain.hpPct);
    healUnit(state, who, who, amount);
    log(state, `${who.name} regagne des PV (${gain.desc || `+${amount}`}).`, 'good');
  } else if (gain.kind === 'buff') {
    who.campBuffs = who.campBuffs || [];
    who.campBuffs.push({ id: `gain:${gain.stat}:${state.turn}`, name: gain.name || 'Coup bas', stat: gain.stat, pct: gain.pct, combats: gain.combats });
    log(state, `${who.name} en profite : ${gain.desc || gain.stat}.`, 'good');
  }
}

const lowBlow = {
  onReveal(state) {
    const actor = decider(state);
    const c = state.content;
    const reboundMax = c.rules.lowBlow.reboundMax;
    const options = [];
    // Les coups bas : contre un allié (en solo, il n'y en a pas : restent les pactes)
    for (const p of livingPlayers(state)) {
      if (p.id === actor.id) continue;
      for (const b of c.lowBlows) {
        if (b.kind === 'curse' && !cursableSlots(state, p).length) continue;
        options.push({ id: `blow:${p.id}:${b.id}`, target: p.id, blow: b.id, label: `${b.name} → ${p.name}`, desc: `${b.desc}${b.gain ? ` Si ça marche, tu gagnes : ${b.gain.desc}.` : ''}`, group: 'blow' });
      }
    }
    // Les pactes : pour soi, sans victime
    for (const pact of c.pacts) {
      if (pact.cost.kind === 'curse' && !cursableSlots(state, actor).length) continue;
      options.push({ id: `pact:${pact.id}`, pact: pact.id, label: pact.name, desc: pact.desc, group: 'pact' });
    }
    options.push({ id: 'pass', label: 'Ne rien faire (rester honnête)' });
    const others = livingPlayers(state).length > 1;
    askChoice(state, 'low_blow', others
      ? `${actor.name} peut jouer un mauvais tour à un allié (s'il rate — ${reboundMax} ou moins au dé — le coup se retourne contre lui ; la victime peut aussi l'esquiver), ou passer un pacte avec les ombres.`
      : `${actor.name} trouve un autel des ombres : un pacte coûte quelque chose tout de suite, pour un bonus pendant les prochains combats.`, options);
  },
  onChoice(state, tile, id) {
    const actor = decider(state);
    if (id === 'pass') {
      log(state, `${actor.name} reste honnête.`, 'info');
      headline(state, 'Vous résistez à la tentation.', 'neutral');
      finishTile(state);
      return;
    }
    const opt = state.pending.options.find((o) => o.id === id);
    if (opt.pact) {
      // Un pacte : le coût tout de suite, puis le gain (pas de dé)
      const pact = state.content.pacts.find((x) => x.id === opt.pact);
      log(state, `${actor.name} passe un pacte : ${pact.name}.`, 'social');
      applyBlow(state, pact.cost, actor);
      applyGain(state, { ...pact.gain, name: pact.name }, actor);
      actor.stats.pacts = (actor.stats.pacts || 0) + 1;
      headline(state, `${pact.name} : ${pact.gain.desc}`, 'neutral');
      finishTile(state);
      return;
    }
    tile.choice = { target: opt.target, blow: opt.blow, saboteur: actor.id };
    askRoll(state, 'rebound', 'Le coup réussira-t-il ?', `Un jet de ${state.content.rules.lowBlow.reboundMax} ou moins et le coup se retourne contre vous !`);
  },
  onRoll(state, tile, roll) {
    const c = state.content;
    const actor = getPlayer(state, tile.choice.saboteur || state.pending.actor);
    const target = getPlayer(state, tile.choice.target);
    const blow = c.lowBlows.find((b) => b.id === tile.choice.blow);

    // 2) Le droit de réponse de la victime : un jet d'esquive
    if (state.pending.purpose === 'dodge') {
      const dodged = roll.natural === 20 || roll.total >= c.rules.lowBlow.dodgeMin;
      if (dodged) {
        target.stats.rollsOk++;
        social(state, 'dodge', target.id, actor.id, blow.id);
        log(state, `${target.name} voit venir le coup et l'esquive ! ${actor.name} repart bredouille.`, 'good');
        headline(state, `${target.name} esquive le coup bas !`, 'good');
      } else {
        target.stats.rollsKo++;
        actor.stats.sabotagesOk++;
        target.stats.sabotagesSuffered++;
        social(state, 'sabotage', actor.id, target.id, blow.id);
        log(state, `${actor.name} joue un sale tour à ${target.name} : ${blow.name} !`, 'social');
        headline(state, `${blow.name} réussi sur ${target.name} !`, 'bad');
        applyBlow(state, blow, target);
        applyGain(state, { ...blow.gain, name: blow.name }, actor);
      }
      finishTile(state);
      return;
    }

    // 1) Le jet du saboteur : le coup peut se retourner contre lui
    const rebound = roll.natural === 1 || roll.total <= c.rules.lowBlow.reboundMax;
    actor.stats.sabotages++;
    if (rebound) {
      actor.stats.sabotagesRebounded++;
      actor.stats.sabotagesSuffered++;
      actor.stats.rollsKo++;
      social(state, 'rebound', actor.id, actor.id, blow.id);
      log(state, `Catastrophe ! Le coup bas de ${actor.name} se retourne contre lui !`, 'bad');
      headline(state, 'Le coup bas se retourne contre son auteur !', 'bad');
      applyBlow(state, blow, actor);
      finishTile(state);
      return;
    }
    actor.stats.rollsOk++;
    log(state, `${actor.name} tente ${blow.name.toLowerCase()} sur ${target.name}...`, 'social');
    askRoll(state, 'dodge', `${target.name} peut esquiver le coup !`, `${target.name} lance le dé : ${c.rules.lowBlow.dodgeMin} ou plus, et « ${blow.name} » est esquivé (${actor.name} ne gagne alors rien).`, { actor: target.id });
  }
};

// ============================================================
//  Marchand
// ============================================================

/** Prix d'achat d'un objet chez ce marchand (selon le marchandage). */
export function shopPrice(state, tile, price) {
  return Math.max(1, Math.round(price * tile.priceMult));
}

const merchant = {
  onReveal(state, tile) {
    const size = state.content.rules.shop.stockSize;
    const stock = [];
    for (let i = 0; i < size; i++) {
      const it = rollShopItem(state);
      if (it) stock.push({ inst: it, sold: false });
    }
    const potion = bestPotion(state);
    if (potion) stock.push({ inst: potion, sold: false });
    tile.stock = stock;
    tile.priceMult = 1;
    askRoll(state, 'haggle', 'Marchander', 'Plus le jet est haut, meilleurs sont les prix. Un jet faible les fait grimper !');
  },
  onRoll(state, tile, roll) {
    const s = state.content.rules.shop;
    tile.priceMult = clamp(s.haggleBase - s.haggleStep * roll.total, 0.6, 1.5);
    const pct = Math.round((tile.priceMult - 1) * 100);
    log(state, `Marchandage : les prix sont ${pct === 0 ? 'normaux' : pct > 0 ? `+${pct}%` : `${pct}%`}.`, 'info');
    headline(state, pct <= 0 ? 'Bonne affaire : le marchand baisse ses prix.' : 'Le marchand est de mauvaise humeur : prix majorés.', pct <= 0 ? 'good' : 'bad');
    state.pending = { kind: 'shop', actor: state.pending.actor };
  }
};

// ============================================================
//  Feu de camp
// ============================================================
// Chaque héros VIVANT, à son tour (en partant de celui sous les projecteurs), peut changer ses sorts équipés (CAMP_DECK)
// puis choisit UNE activité (CAMP_ACT) : se reposer, affûter ses armes, monter la garde (rules.json > camp).
// Un bonus de camp dure quelques COMBATS (`campBuffs` du héros) : il compte comme un modificateur (stats.js).

/** Les héros qui vont camper, dans l'ordre : celui sous les projecteurs d'abord, puis les suivants. */
function campOrder(state) {
  const first = decider(state);
  const n = state.players.length;
  const start = Math.max(0, state.players.indexOf(first));
  const out = [];
  for (let k = 0; k < n; k++) {
    const p = state.players[(start + k) % n];
    if (p.alive) out.push(p.id);
  }
  return out;
}

const camp = {
  onReveal(state, tile) {
    tile.queue = campOrder(state);
    tile.done = {};
    // Le colporteur : quelques potions à vendre (rules.json > camp.peddler), pour dépenser l'or de la run.
    const ped = state.content.rules.camp?.peddler;
    tile.stock = [];
    tile.priceMult = ped?.priceMult ?? 1;
    for (let i = 0; i < (ped?.potions ?? 0) * tile.queue.length; i++) {
      const potion = bestPotion(state);
      if (potion) tile.stock.push({ inst: potion, sold: false });
    }
    headline(state, 'Un feu de camp : chacun peut changer ses sorts et choisir une activité.', 'good');
    nextCamper(state, tile);
  }
};

/** Au suivant de camper, ou on lève le camp. */
function nextCamper(state, tile) {
  const next = tile.queue.find((id) => !tile.done[id] && getPlayer(state, id)?.alive);
  if (!next) {
    log(state, 'Le groupe lève le camp.', 'info');
    finishTile(state);
    return;
  }
  state.phase = 'tile';
  state.pending = { kind: 'camp', actor: next };
}

/** Les sorts qu'un héros peut équiper au camp : ses sorts actifs (pas le sort de classe, pas une version évoluée, de sa spécialisation). */
export function campDeckOptions(state, p) {
  const c = state.content;
  const cls = c.classes[p.classId];
  return p.skills.filter((id) => {
    const sk = c.skills[id];
    return sk && sk.type === 'active' && !sk.replaces && id !== cls.classSkill && sk.classId === p.classId && (!sk.spec || sk.spec === p.spec) && (sk.level ?? 1) <= p.effLevel;
  });
}

/** Change UN emplacement du deck (slot 0 à 3) : `skillId` à mettre, ou null pour le vider. */
export function campDeck(state, a) {
  const pend = state.pending;
  assert(pend?.kind === 'camp', "Ce n'est pas le moment de changer ses sorts.");
  const p = getPlayer(state, pend.actor);
  const size = state.content.rules.deckSize ?? 4;
  const slot = Number(a.slot);
  assert(Number.isInteger(slot) && slot >= 0 && slot < size, 'Emplacement invalide.');
  const deck = Array.isArray(p.deck) ? p.deck.slice() : campDeckOptions(state, p).slice(0, size);
  const id = a.skillId ?? null;
  if (id !== null) {
    assert(typeof id === 'string' && campDeckOptions(state, p).includes(id), 'Ce sort ne peut pas être équipé.');
    const other = deck.indexOf(id);
    if (other >= 0) deck.splice(other, 1); // (déjà équipé ailleurs : il change de place)
  }
  while (deck.length < size) deck.push(null);
  deck[slot] = id;
  p.deck = deck.filter(Boolean);
  log(state, id ? `${p.name} équipe ${state.content.skills[id].name}.` : `${p.name} retire un sort de sa barre.`, 'info');
}

/** L'activité du héros au camp, puis au suivant. */
export function campAct(state, a) {
  const pend = state.pending;
  assert(pend?.kind === 'camp', 'Pas de feu de camp ici.');
  const act = state.content.rules.camp?.activities?.[a.activity];
  assert(act, 'Activité inconnue.');
  const p = getPlayer(state, pend.actor);
  const tile = currentTile(state);
  if (act.healPct) {
    const real = healUnit(state, p, p, unitStats(state, p).hpMax * act.healPct);
    p.statuses = p.statuses.filter((st) => st.id !== 'poison');
    log(state, `${p.name} se repose près du feu (+${real} PV).`, 'good');
  }
  if (act.stat) {
    p.campBuffs = (p.campBuffs || []).filter((b) => b.id !== a.activity);
    p.campBuffs.push({ id: a.activity, name: act.name, stat: act.stat, pct: act.pct, combats: act.combats ?? 1 });
    log(state, `${p.name} : ${act.name.toLowerCase()} (${act.desc}).`, 'good');
  }
  emit(state, { type: 'camp', target: p.id, activity: a.activity });
  tile.done[p.id] = a.activity;
  nextCamper(state, tile);
}

// ============================================================
//  Registre : type de case -> comportement
// ============================================================
export const tileHandlers = {
  combat: combatTile,
  boss: combatTile,
  treasure,
  trap,
  xp_fountain: xpFountain,
  life_fountain: lifeFountain,
  low_blow: lowBlow,
  merchant,
  camp
};
