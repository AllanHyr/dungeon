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
  log, headline, social, getPlayer, livingPlayers, ghosts, assert, clamp
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
    askRoll(state, 'treasure', 'Ouvrir le coffre', 'Plus le jet est haut, plus le butin sera de qualité. Un 20 donne deux objets... un 1 déclenche un piège !');
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
      if (roll.total >= 15) actor.stats.rollsOk++;
      headline(state, 'Le coffre s\'ouvre...', 'good');
    }
    log(state, `Le coffre contient ${gold} pièces d'or${items.length > 1 ? ' et deux objets' : ' et un objet'}.`, 'loot');
    queueLoot(state, items);
    finishTile(state);
  }
};

// ============================================================
//  Piège
// ============================================================
const trap = {
  onReveal(state) {
    const tr = dungeonRules(state.content, state.setup);
    const dc = tr.trapDc + state.params.trapDcBonus;
    askRoll(state, 'trap', 'Jet de sauvegarde', `Il faut ${dc} ou plus (votre bonus de sauvegarde s'ajoute) pour éviter le piège.`, { dc });
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
      if (roll.natural === 20) {
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

const lowBlow = {
  onReveal(state) {
    const actor = decider(state);
    const reboundMax = state.content.rules.lowBlow.reboundMax;
    const options = [];
    for (const p of livingPlayers(state)) {
      if (p.id === actor.id) continue;
      for (const b of state.content.lowBlows) {
        if (b.kind === 'curse' && !cursableSlots(state, p).length) continue;
        options.push({ id: `blow:${p.id}:${b.id}`, target: p.id, blow: b.id, label: `${b.name} → ${p.name}`, desc: b.desc });
      }
    }
    options.push({ id: 'pass', label: 'Ne rien faire (rester honnête)' });
    askChoice(state, 'low_blow', `${actor.name} peut jouer un mauvais tour... Mais le coup peut se retourner contre lui (jet de ${reboundMax} ou moins).`, options);
  },
  onChoice(state, tile, id) {
    if (id === 'pass') {
      log(state, `${decider(state).name} reste honnête.`, 'info');
      headline(state, 'Vous résistez à la tentation.', 'neutral');
      finishTile(state);
      return;
    }
    const opt = state.pending.options.find((o) => o.id === id);
    tile.choice = { target: opt.target, blow: opt.blow };
    askRoll(state, 'rebound', 'Le coup réussira-t-il ?', `Un jet de ${state.content.rules.lowBlow.reboundMax} ou moins et le coup se retourne contre vous !`);
  },
  onRoll(state, tile, roll) {
    const c = state.content;
    const actor = getPlayer(state, state.pending.actor);
    const target = getPlayer(state, tile.choice.target);
    const blow = c.lowBlows.find((b) => b.id === tile.choice.blow);
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
    } else {
      actor.stats.sabotagesOk++;
      actor.stats.rollsOk++;
      target.stats.sabotagesSuffered++;
      social(state, 'sabotage', actor.id, target.id, blow.id);
      log(state, `${actor.name} joue un sale tour à ${target.name} : ${blow.name} !`, 'social');
      headline(state, `${blow.name} réussi sur ${target.name} !`, 'bad');
      applyBlow(state, blow, target);
    }
    finishTile(state);
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
  merchant
};
