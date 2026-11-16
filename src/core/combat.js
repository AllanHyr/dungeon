// ============================================================
//  combat.js — Les combats : frise d'initiative, tours à points d'action
// ============================================================
// Le combat fonctionne comme dans Dofus :
//   - une FRISE d'initiative fixe l'ordre de jeu (les camps alternent) ;
//   - à son tour, chaque unité dépense ses POINTS D'ACTION (PA) : compétences, changement
//     de rang, potion... jusqu'à ce qu'il n'y en ait plus (ou "Fin du tour") ;
//   - les monstres ANNONCENT ce qu'ils vont faire (compétences et cibles) au début de
//     chaque round : on peut les tuer, les étourdir ou les provoquer avant leur tour ;
//   - chaque compétence a son propre profil de D20 (échec critique / coup / critique).
// Le minuteur de tour n'est pas géré ici (le moteur n'a pas d'horloge) : l'interface ou le
// serveur envoie l'action { type: 'TIMEOUT' } quand le temps est écoulé.

import { randInt, weightedPick, nextFloat } from './rng.js';
import { log, emit, headline, getPlayer, livingPlayers, livingMonsters, currentTile, assert } from './util.js';
import { unitStats } from './stats.js';
import { consumeStun, clearCombatStatuses, tickStatusEffects, decayStatuses, applyDamage, healUnit, hasStatus } from './units.js';
import { castSkill, fireTriggers } from './effects.js';
import { skillOf, activeSkillIds, skillGroup, skillPaCost, checkUsable, validTargets, needsPick, needsModePick, modeOptions, resolveDice } from './skills.js';
import { unitById } from './geometry.js';
import { dungeonRules } from './content.js';
import { queueLoot, finishTile } from './flow.js';
import { rollItem } from './loot.js';
import { takeFromList } from './items.js';
import { endFarmWave } from './farm.js';

// ============================================================
//  Création des monstres
// ============================================================

/** Fabrique un monstre prêt à se battre (stats adaptées à la tranche, au mode et au nombre de joueurs). */
export function makeMonster(state, defId, number, suffix) {
  const c = state.content;
  const def = c.monsters[defId];
  const scale = c.rules.partyScaling[String(state.players.length)] || c.rules.partyScaling['4'];
  const tranche = dungeonRules(c, state.setup);
  const hp = Math.max(1, Math.round(def.hp * state.params.monsterHp * scale.hp));
  const atk = Math.max(0, Math.round(def.atk * state.params.monsterAtk * scale.atk * 10) / 10);
  return {
    id: `m${number}`,
    kind: 'monster',
    defId,
    look: def.kind,
    name: def.name + suffix,
    hp,
    hpMax: hp,
    base: { hp, atk, def: def.def, heal: 0, save: 0, luck: 0, ini: def.ini },
    row: def.row,
    pa: 0,
    paBase: Math.max(3, Math.round(def.pa * (scale.pa ?? 1))), // face à un petit groupe, les monstres jouent moins d'actions
    skillIds: def.skills.map((s) => s.skill),
    skillWeights: def.skills.map((s) => s.weight ?? 1),
    passives: def.passives || [],
    xp: def.xp,
    gold: def.goldBonus || tranche.goldPerMonster || [0, 0],
    boss: !!def.boss,
    training: !!def.training,
    immortal: !!def.training,
    alive: true,
    statuses: [],
    shields: [],
    resources: {},
    cooldowns: {},
    combatUses: {},
    flags: {},
    plan: []
  };
}

/** Tire les monstres d'une case combat (ou le boss). */
export function spawnMonsters(state, isBoss) {
  const c = state.content;
  const tranche = dungeonRules(c, state.setup); // (monstres et boss du DONJON choisi)
  const scale = c.rules.partyScaling[String(state.players.length)] || c.rules.partyScaling['4'];
  if (isBoss) {
    // Le boss, et son ESCORTE s'il en a une (`bossEscort` du donjon) : autant de gardes que le groupe le permet (aucun en solo).
    const escort = (tranche.bossEscort || []).slice(0, Math.max(0, scale.count[1] - 1, (tranche.minMonsters || 1) - 1));
    return [makeMonster(state, tranche.bossId, 1, ''), ...escort.map((id, i) => makeMonster(state, id, i + 2, ''))];
  }
  // `minMonsters` (donjon) : au moins tant de monstres par combat, même en solo — sans quoi une mécanique de groupe (relever un mort, soigner un allié) n'existerait pas.
  const count = Math.max(tranche.minMonsters || 1, randInt(state, scale.count[0], scale.count[1]));
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(tranche.monsterPool[Math.floor(nextFloat(state) * tranche.monsterPool.length)]);
  // Si plusieurs monstres identiques : on ajoute A, B, C pour les distinguer
  const seen = {};
  return ids.map((id, i) => {
    const total = ids.filter((x) => x === id).length;
    seen[id] = (seen[id] || 0) + 1;
    const suffix = total > 1 ? ' ' + 'ABCD'[seen[id] - 1] : '';
    return makeMonster(state, id, i + 1, suffix);
  });
}

/** Les mannequins de la salle d'entraînement. */
export function spawnTrainingDummies(state, defId, count, atkScale = 1) {
  return Array.from({ length: count }, (_, i) => {
    const m = makeMonster(state, defId, i + 1, count > 1 ? ' ' + 'ABCD'[i] : '');
    m.base.atk = Math.round(m.base.atk * atkScale * 10) / 10;
    m.hp = m.hpMax;
    return m;
  });
}

// ============================================================
//  Début de combat
// ============================================================

/** Prépare une unité (joueur ou monstre) à entrer en combat. */
function initCombatUnit(state, u) {
  u.pa = 0;
  u.shields = [];
  u.cooldowns = {};
  u.combatUses = {};
  u.flags = {};
  u.plan = [];
  u.statuses = u.statuses.filter((s) => s.id === 'poison' || s.id === 'dot'); // le reste disparaît
  if (u.kind === 'player') {
    const cls = state.content.classes[u.classId];
    u.row = cls.startRow;
    u.resources = cls.resource ? { [cls.resource.id]: cls.resource.start || 0 } : {};
    u.resourceMax = cls.resource ? { [cls.resource.id]: cls.resource.max } : {};
    u.mode = cls.modes ? cls.modes.default : null; // le mode de classe repart de son état de base à chaque combat
  } else {
    u.resources = {};
  }
}

/** La frise d'initiative : les camps alternent, chacun trié par initiative (+ un peu de hasard). */
function buildTimeline(state, { monstersFirst, ambush }) {
  const rand = state.content.rules.combat.iniRandom;
  const sorted = (units) => units.map((u) => ({ id: u.id, k: unitStats(state, u).ini + randInt(state, 0, rand) })).sort((a, b) => b.k - a.k);
  const P = sorted(livingPlayers(state));
  const M = sorted(livingMonsters(state));
  let playersTurn = ambush ? true : monstersFirst ? false : (P[0]?.k ?? -1) >= (M[0]?.k ?? -1);
  const order = [];
  let i = 0;
  let j = 0;
  while (i < P.length || j < M.length) {
    if (playersTurn && i < P.length) order.push(P[i++].id);
    else if (!playersTurn && j < M.length) order.push(M[j++].id);
    else if (i < P.length) order.push(P[i++].id);
    else order.push(M[j++].id);
    playersTurn = !playersTurn;
  }
  return order;
}

/**
 * Lance le combat de la case actuelle.
 * `roll` = le jet d'exploration du joueur actif (il décide de la surprise).
 */
export function startCombat(state, tile, roll) {
  const rules = state.content.rules;
  state.phase = 'combat';
  state.combat = { round: 0, monsters: tile.monsters, timeline: [], turn: -1, activeId: null, boss: tile.type === 'boss' };
  const c = state.combat;
  delete tile.monsters; // les monstres vivent désormais UNIQUEMENT dans le combat (pas de copie périmée)
  for (const u of [...state.players, ...c.monsters]) initCombatUnit(state, u);

  log(state, `Combat contre : ${c.monsters.map((m) => m.name).join(', ')}.`, 'combat');

  let ambush = false;
  let monstersFirst = false;
  if (roll.natural === 20 || roll.total >= rules.initiative.ambushMin) {
    ambush = true;
    log(state, 'EMBUSCADE RÉUSSIE ! Les monstres sont pris au dépourvu.', 'good');
    headline(state, 'Embuscade réussie ! Les monstres perdent leur premier tour.', 'good');
    for (const m of c.monsters) {
      if (m.boss) applyDamage(state, m, Math.round(m.hpMax * 0.1), null);
      else m.statuses.push({ id: 'stun', turns: 1 });
    }
  } else if (roll.natural === 1 || roll.total <= rules.initiative.surpriseMax) {
    monstersFirst = true;
    log(state, 'Pris par surprise ! Les monstres frappent en premier.', 'bad');
    headline(state, 'Pris par surprise ! Les monstres jouent en premier.', 'bad');
  } else {
    headline(state, 'Le combat commence !', 'neutral');
  }

  for (const u of [...livingPlayers(state), ...livingMonsters(state)]) fireTriggers(state, 'combatStart', { unit: u });
  c.timeline = buildTimeline(state, { monstersFirst, ambush });
  beginRound(state);
  advanceCombat(state);
}

// ============================================================
//  Rounds, tours et IA des monstres
// ============================================================

/** Choisit la cible d'une compétence de monstre (un provocateur d'abord, sinon au hasard). */
function chooseMonsterTarget(state, m, sk) {
  const valid = validTargets(state, m, sk);
  if (!valid.length) return null;
  if (!needsPick(sk)) return valid[0];
  if (sk.target === 'enemy') {
    const taunter = valid.map((id) => unitById(state, id)).find((u) => hasStatus(u, 'taunt'));
    if (taunter) return taunter.id;
  }
  return valid[Math.floor(nextFloat(state) * valid.length)];
}

/** Un monstre ne gaspille pas un soin : une compétence qui ne fait que soigner n'est choisie que si un de ses alliés est blessé. */
function worthUsing(state, m, sk) {
  // ... ni un appel de renforts quand ils sont déjà tous là.
  const call = sk.effects.find((e) => e.type === 'summon');
  if (call && livingMonsters(state).filter((a) => a.summonedBy === m.id).length >= (call.max ?? 2)) return false;
  if (!sk.effects.every((e) => e.type === 'heal' || e.type === 'hot')) return true;
  return livingMonsters(state).some((a) => a.hp < a.hpMax * 0.85);
}

/** Chaque monstre prépare (et ANNONCE) ses actions du round : compétences + cibles. */
export function planMonsters(state) {
  const maxActions = state.content.rules.combat.maxPlanActions;
  for (const m of livingMonsters(state)) {
    m.plan = [];
    let pa = unitStats(state, m).pa;
    const used = new Set();
    for (let n = 0; n < maxActions; n++) {
      const options = m.skillIds
        .map((id, i) => ({ sk: skillOf(state, id), w: m.skillWeights[i] }))
        .filter(({ sk }) => sk.pa <= pa && !(m.cooldowns[sk.id] > 0) && !(sk.cooldown && used.has(sk.id)) && validTargets(state, m, sk).length > 0 && worthUsing(state, m, sk));
      if (!options.length) break;
      const { sk } = weightedPick(state, options, (o) => o.w);
      m.plan.push({ skillId: sk.id, targetId: chooseMonsterTarget(state, m, sk) });
      used.add(sk.id);
      pa -= sk.pa;
    }
  }
}

function beginRound(state) {
  const c = state.combat;
  c.round++;
  planMonsters(state);
  for (const p of state.players) p.ghostActed = false;
  if (c.round > 1) log(state, `— Round ${c.round} —`, 'info');
  const cfg = state.content.rules.combat;
  const dj = state.farm || state.training ? null : dungeonRules(state.content, state.setup);
  if (c.round === (dj?.enrageAfterRound ?? cfg.enrageAfterRound) + 1) log(state, "Le combat s'éternise... les monstres s'énervent et frappent de plus en plus fort !", 'bad');
}

function startUnitTurn(state, unit) {
  emit(state, { type: 'turn', unitId: unit.id }); // (l'interface s'en sert pour rejouer poison et soins sur la durée au bon moment)
  state.combat.activeId = unit.id;
  unit.pa = unitStats(state, unit).pa;
  for (const k of Object.keys(unit.flags)) if (k.startsWith('turn:')) delete unit.flags[k];
  unit.statuses = unit.statuses.filter((s) => s.expires !== 'turnStart'); // ex. la garde
  tickStatusEffects(state, unit); // poison, saignement, soin sur la durée
  if (unit.training) unit.hp = unit.hpMax;
  if (unit.alive && state.phase !== 'ended') fireTriggers(state, 'turnStart', { unit });
}

function endUnitTurn(state, unit) {
  if (unit.alive) fireTriggers(state, 'turnEnd', { unit });
  for (const id of Object.keys(unit.cooldowns)) unit.cooldowns[id] = Math.max(0, unit.cooldowns[id] - 1);
  decayStatuses(state, unit);
  unit.pa = 0;
  if (state.combat) state.combat.activeId = null;
}

/** Le tour d'un monstre : il exécute ce qu'il avait annoncé (en s'adaptant si sa cible a changé). */
function runMonsterTurn(state, m) {
  if (consumeStun(m)) {
    log(state, `${m.name} est étourdi et passe son tour.`, 'good');
    m.plan = [];
    return;
  }
  emit(state, { type: 'monsterAct', id: m.id });
  for (const step of m.plan) {
    if (!m.alive || state.phase === 'ended' || !state.combat) return;
    const sk = skillOf(state, step.skillId);
    if (m.pa < sk.pa) continue;
    let target = step.targetId;
    if (needsPick(sk)) {
      const valid = validTargets(state, m, sk);
      if (!valid.length) continue;
      const taunter = sk.target === 'enemy' ? valid.map((id) => unitById(state, id)).find((u) => hasStatus(u, 'taunt')) : null;
      if (taunter) target = taunter.id;
      else if (!valid.includes(target)) target = valid[Math.floor(nextFloat(state) * valid.length)];
    } else if (!validTargets(state, m, sk).length) continue;
    castSkill(state, m, sk, target);
  }
  m.plan = [];
}

/** Fait avancer le combat jusqu'au prochain tour d'un joueur (les monstres jouent tout seuls). */
function advanceCombat(state) {
  for (let guard = 0; guard < 3000; guard++) {
    const c = state.combat;
    if (state.phase === 'ended' || !c) return;
    if (!state.training && livingMonsters(state).length === 0) return endCombat(state);
    c.turn++;
    if (c.turn >= c.timeline.length) {
      c.turn = 0;
      beginRound(state);
    }
    const unit = unitById(state, c.timeline[c.turn]);
    if (!unit || !unit.alive) continue;
    startUnitTurn(state, unit);
    if (state.phase === 'ended') return;
    if (!unit.alive) {
      endUnitTurn(state, unit);
      continue;
    }
    if (unit.kind === 'monster') {
      runMonsterTurn(state, unit);
      if (state.phase === 'ended') return;
      endUnitTurn(state, unit);
      continue;
    }
    if (consumeStun(unit)) {
      log(state, `${unit.name} est étourdi et passe son tour.`, 'bad');
      endUnitTurn(state, unit);
      continue;
    }
    state.pending = { kind: 'combat', actor: unit.id };
    return;
  }
  throw new Error('Combat bloqué (boucle infinie évitée).');
}

// ============================================================
//  Fin de combat : récompenses
// ============================================================

export function endCombat(state) {
  if (state.farm) return endFarmWave(state); // en farm : la vague est vaincue (récompenses restreintes, voir farm.js)
  const c = state.combat;
  const tile = currentTile(state);
  const tr = dungeonRules(state.content, state.setup);
  state.combat = null;
  state.phase = 'tile';
  for (const p of state.players) {
    clearCombatStatuses(p);
    p.resources = {};
  }

  let xp = 0;
  let gold = 0;
  // (pour l'encyclopédie : quels monstres ce groupe a vaincus)
  state.kills = state.kills || {};
  for (const m of c.monsters) if (!m.alive && !m.training) state.kills[m.defId] = (state.kills[m.defId] || 0) + 1;
  for (const m of c.monsters) {
    xp += m.xp;
    gold += randInt(state, m.gold[0], m.gold[1]);
  }
  gold = Math.round(gold * state.params.gold);
  state.xpPool += xp;
  state.gold += gold;
  log(state, `Victoire ! +${gold} or. Le groupe gagne ${xp} points d'expérience (répartis à la fin de la run).`, 'good');
  headline(state, `Victoire ! +${gold} or`, 'good');

  // Second souffle : après un combat gagné, les survivants récupèrent un peu de PV.
  const breath = state.content.rules.postCombatHealPct || 0;
  if (breath > 0 && !c.boss) {
    for (const p of livingPlayers(state)) {
      const max = unitStats(state, p).hpMax;
      const before = p.hp;
      p.hp = Math.min(max, p.hp + Math.max(1, Math.round(max * breath)));
      if (p.hp > before) emit(state, { type: 'heal', target: p.id, amount: p.hp - before, source: null, breath: true }); // (l'interface montre le « +PV » de chaque héros)
    }
    log(state, `Le groupe reprend son souffle (+${Math.round(breath * 100)}% PV).`, 'info');
  }

  const boost = state.params.rarityBoost;
  if (c.boss) {
    state.bossDefeated = true;
    const items = [];
    // Le boss lâche d'abord un objet de la TABLE DU DONJON (s'il en a une), puis du butin ordinaire.
    for (let i = 0; i < (tr.bossDrops || 1); i++) items.push(rollItem(state, { boost: boost * 1.5, minRarity: 'uncommon', exclusiveOnly: i === 0 }));
    queueLoot(state, items);
  } else if (nextFloat(state) < (tr.lootChance ?? 0.3) * state.params.dropChance) {
    queueLoot(state, [rollItem(state, { boost })]);
  }
  if (tile) finishTile(state);
}

// ============================================================
//  Actions des joueurs
// ============================================================

/** Utilise un consommable (potion) de son sac sur un allié vivant. */
export function useConsumable(state, user, uid, targetId) {
  const inst = user.bag.find((it) => it.uid === uid);
  assert(inst, "Cet objet n'est pas dans le sac.");
  const def = state.content.items[inst.id];
  assert(def.consumable, "Cet objet ne s'utilise pas.");
  const target = livingPlayers(state).find((p) => p.id === targetId);
  assert(target, 'Cible invalide.');
  takeFromList(user.bag, uid);
  const amount = Math.round(unitStats(state, target).hpMax * def.consumable.healPct);
  const real = healUnit(state, user, target, amount);
  log(state, `${user.name} utilise ${def.name} sur ${target.name} : +${real} PV.`, 'good');
}

/**
 * Tout ce que l'interface (ou un robot) doit savoir pour le tour d'un joueur :
 * ses PA, ses compétences (utilisables ou non, pourquoi, sur qui), son profil de dé...
 */
export function getCombatView(state, playerId) {
  const p = getPlayer(state, playerId);
  const c = state.content;
  const rules = c.rules.combat;
  const stats = unitStats(state, p);
  const cls = c.classes[p.classId];
  const skills = activeSkillIds(state, p)
    .map((id) => skillOf(state, id))
    .filter(Boolean)
    .map((sk) => {
      const usable = checkUsable(state, p, sk);
      const dice = resolveDice(state, p, sk);
      return {
        skillId: sk.id, name: sk.name, desc: sk.desc || '', pa: skillPaCost(p, sk, state), paFull: sk.pa, target: sk.target, needsPick: needsPick(sk),
        usable: usable.ok, reason: usable.reason || '', targets: validTargets(state, p, sk),
        cooldown: sk.cooldown || 0, cooldownLeft: p.cooldowns[sk.id] || 0,
        dice: dice.has ? { fumble: dice.fumble, crit: dice.crit, onFumble: dice.onFumble } : null,
        group: skillGroup(c, p, sk.id), basic: sk.id === c.basicSkillId, common: !!sk.common, spend: sk.spend || null,
        modePick: needsModePick(sk) ? modeOptions(state, p) : null // (un sort qui fait choisir un mode : les options, dont l'actuel)
      };
    });
  const items = p.bag
    .filter((it) => c.items[it.id].consumable)
    .map((it) => ({ uid: it.uid, name: c.items[it.id].name, healPct: c.items[it.id].consumable.healPct, usable: p.pa >= rules.itemCostPa }));
  return {
    unitId: p.id, pa: p.pa, paMax: stats.pa, row: p.row, skills, items,
    deckSlots: Array.isArray(p.deck) ? Math.max(0, (c.rules.deckSize ?? 4) - skills.filter((s) => s.group === 'deck').length) : 0, // emplacements libres du deck (à montrer vides)
    moveCost: rules.moveCostPa, canMove: p.pa >= rules.moveCostPa, itemCost: rules.itemCostPa,
    resources: p.resources, resourceMax: p.resourceMax || {}, allyTargets: livingPlayers(state).map((x) => x.id)
  };
}

/** Après chaque action : combat fini ? tour fini ? sinon on attend la suite du même joueur. */
function afterPlayerAction(state, p, forceEnd) {
  if (state.phase === 'ended' || !state.combat) return;
  if (!state.training && livingMonsters(state).length === 0) return endCombat(state);
  if (forceEnd || p.pa <= 0 || !p.alive) {
    endUnitTurn(state, p);
    advanceCombat(state);
  }
}

/**
 * Une action de combat d'un joueur :
 *   { act:'skill', skillId, targetId?, modeId? } | { act:'move', row } | { act:'item', itemUid, targetId } | { act:'endTurn' }
 */
export function playerAction(state, a) {
  assert(state.phase === 'combat' && state.pending?.kind === 'combat', "Il n'y a pas de combat en cours.");
  assert(a.playerId === state.pending.actor, "Ce n'est pas le tour de ce joueur.");
  const p = getPlayer(state, a.playerId);
  const rules = state.content.rules.combat;
  let forceEnd = false;

  switch (a.act) {
    case 'skill': {
      const sk = skillOf(state, a.skillId);
      assert(sk && activeSkillIds(state, p).includes(sk.id), 'Compétence inconnue.');
      const usable = checkUsable(state, p, sk);
      assert(usable.ok, usable.reason);
      if (needsPick(sk)) assert(validTargets(state, p, sk).includes(a.targetId), 'Cible invalide pour cette compétence.');
      if (needsModePick(sk)) {
        const opt = modeOptions(state, p).find((o) => o.id === a.modeId);
        assert(opt, 'Choisis un mode dans la liste.');
        assert(!opt.current, `Tu es déjà en « ${opt.name} » : choisis-en un autre.`);
      }
      const res = castSkill(state, p, sk, a.targetId, { modeId: a.modeId });
      if (res.endTurn) {
        log(state, `${p.name} perd son tour !`, 'bad');
        forceEnd = true;
      }
      break;
    }
    case 'move': {
      assert(rules.rows.includes(a.row), 'Rang inconnu.');
      assert(p.row !== a.row, 'Déjà à ce rang.');
      assert(p.pa >= rules.moveCostPa, `${rules.moveCostPa} PA requis pour changer de rang.`);
      p.pa -= rules.moveCostPa;
      p.row = a.row;
      log(state, `${p.name} passe au rang ${a.row === 'front' ? 'avant' : 'arrière'}.`, 'combat');
      emit(state, { type: 'move', target: p.id, row: p.row });
      break;
    }
    case 'item': {
      assert(p.pa >= rules.itemCostPa, `${rules.itemCostPa} PA requis pour utiliser un objet.`);
      useConsumable(state, p, a.itemUid, a.targetId);
      p.pa -= rules.itemCostPa;
      break;
    }
    case 'endTurn':
      forceEnd = true;
      break;
    default:
      assert(false, 'Action de combat inconnue.');
  }
  afterPlayerAction(state, p, forceEnd);
}

/** Le minuteur est écoulé : le tour du joueur actif se termine (ses PA restants sont perdus). */
export function timeoutTurn(state) {
  assert(state.phase === 'combat' && state.pending?.kind === 'combat', "Il n'y a pas de tour à terminer.");
  const p = getPlayer(state, state.pending.actor);
  log(state, `Temps écoulé : le tour de ${p.name} se termine.`, 'bad');
  afterPlayerAction(state, p, true);
}
