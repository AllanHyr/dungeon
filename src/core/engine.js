// ============================================================
//  engine.js — Le moteur de jeu : créer une run et lui envoyer des actions
// ============================================================
// Principe très simple (et utilisable plus tard côté serveur) :
//
//     const state = createRun(content, réglages, personnages);
//     const resultat = dispatch(state, { type: 'ADVANCE' });
//
// - `state` est un objet 100% JSON : toute la partie y est (plateau, joueurs, journal...).
// - `state.pending` dit ce que le jeu ATTEND maintenant (avancer, lancer un dé, choisir,
//   jouer son tour de combat...).
// - `dispatch` applique une action du joueur et met `state` à jour.
//   L'interface n'a donc qu'à : afficher `state`, et envoyer des actions.
//
// Ce fichier ne touche JAMAIS à l'écran ni au navigateur.

import { getModeParams, EQUIP_SLOTS, dungeonIdOf } from './content.js';
import { effectiveLevel, computeStats } from './stats.js';
import { generateBoard } from './board.js';
import { newPlayerStats } from './journal.js';
import { startTurn, resolveLootChoice, finishTile } from './flow.js';
import { tileHandlers, campDeck, campAct } from './tiles.js';
import { playerAction, timeoutTurn, useConsumable, startCombat, spawnTrainingDummies } from './combat.js';
import { startFarmWave, farmNext } from './farm.js';
import { castSkill } from './effects.js';
import { skillOf, activeSkillIds, checkUsable, needsPick, validTargets } from './skills.js';
import { equipItem, unequipItem, giveItem, shopBuy, shopSell, ghostAct } from './inventory.js';
import { playerRoll } from './dice.js';
import { endRun } from './results.js';
import { createCharacter, knownSkills } from './progression.js';
import { log, emit, getPlayer, currentTile, assert, GameError } from './util.js';

/** Version du format de partie (si elle change, les anciennes parties sauvegardées sont abandonnées). */
export const STATE_VERSION = 3; // 3 : 14 emplacements d'équipement (les parties sauvegardées plus anciennes sont abandonnées)

/** Rattache le contenu (JSON) à l'état SANS qu'il soit sauvegardé avec la partie. */
export function attachContent(state, content) {
  Object.defineProperty(state, 'content', { value: content, enumerable: false, writable: true, configurable: true });
  return state;
}

/** Recrée un état à partir d'un texte JSON sauvegardé (reprise de partie). */
export function restoreState(content, json) {
  const state = typeof json === 'string' ? JSON.parse(json) : json;
  if (state.version !== STATE_VERSION) throw new GameError('Cette partie sauvegardée vient d\'une ancienne version du jeu.');
  return attachContent(state, content);
}

/** Copie profonde d'un état (utile pour les tests). */
export function cloneState(state) {
  return attachContent(JSON.parse(JSON.stringify(state)), state.content);
}

/** Fabrique un joueur de la run à partir d'un personnage sauvegardé. */
function makePlayer(state, ch, index) {
  const cls = state.content.classes[ch.classId];
  const equipment = {};
  for (const slot of EQUIP_SLOTS) equipment[slot] = ch.equipment[slot] ? { ...ch.equipment[slot] } : null;
  const bag = ch.inventory.map((it) => ({ ...it }));
  const p = {
    id: `p${index + 1}`,
    kind: 'player',
    charId: ch.id,
    name: ch.name,
    classId: ch.classId,
    realLevel: ch.level, // niveau RÉEL (sauvegardé)
    effLevel: effectiveLevel(ch.level, state.setup, state.setup.restrict), // niveau EFFECTIF dans ce donjon
    xpStart: ch.xp,
    hp: 1,
    hpMaxPenalty: 0,
    alive: true,
    ghost: false,
    resurrected: false,
    skills: knownSkills(state.content, ch), // appris + automatiques de la spécialisation
    spec: ch.spec ?? null, // spécialisation choisie (hors partie)
    deck: Array.isArray(ch.deck) ? ch.deck.slice() : null, // sorts équipés (null : tous, pour l'Atelier et les anciennes parties)
    equipment,
    bag,
    initialUids: [...bag.map((i) => i.uid), ...Object.values(equipment).filter(Boolean).map((i) => i.uid)],
    statuses: [],
    shields: [],
    row: cls.startRow,
    pa: 0,
    resources: {},
    resourceMax: {},
    cooldowns: {},
    combatUses: {},
    usedOnce: {},
    flags: {},
    cursedUid: null,
    ghostActed: false,
    fountainXp: 0,
    stats: newPlayerStats()
  };
  state.players.push(p);
  p.hp = computeStats(state, p).hpMax;
  return p;
}

/**
 * Crée une nouvelle run.
 * @param content     le contenu du jeu (voir content.js)
 * @param setup       { tranche: 1|4|8..., dungeon?: 'id du donjon' (sinon le premier de la tranche), mode: 'basic'|'tranche'|'stasis', stasisLevel: 1..3 }
 * @param characters  1 à 4 personnages sauvegardés (distincts)
 * @param seed        graine du hasard (pour rejouer / tester)
 */
export function createRun(content, setup, characters, seed = Math.floor(Math.random() * 4294967296)) {
  if (characters.length < 1 || characters.length > 4) throw new GameError('Il faut entre 1 et 4 personnages.');
  const tranche = content.tranches[setup.tranche];
  if (!tranche || !tranche.available) throw new GameError("Cette tranche n'est pas disponible.");
  // Le donjon : celui demandé (il doit appartenir à la tranche et être ouvert), sinon le premier de la tranche.
  const asked = setup.dungeon ? content.dungeons[setup.dungeon] : null;
  if (setup.dungeon && (!asked || asked.tranche !== tranche.id || asked.available === false)) throw new GameError("Ce donjon n'est pas disponible.");
  const dungeon = asked || content.dungeons[dungeonIdOf(content, { tranche: tranche.id })];
  if (new Set(characters.map((c) => c.id)).size !== characters.length) throw new GameError("Chaque personnage ne peut jouer qu'une fois.");
  const away = characters.find((c) => c.expedition);
  if (away) throw new GameError(`${away.name} est en expédition : attends son retour (ou rappelle-le).`);

  const state = {
    version: STATE_VERSION,
    seed: seed >>> 0,
    rng: seed >>> 0,
    nextUid: 1,
    setup: { tranche: setup.tranche, dungeon: dungeon.id, mode: setup.mode, stasisLevel: setup.mode === 'stasis' ? setup.stasisLevel || 1 : 0, restrict: true },
    params: null,
    dungeon: { trancheId: tranche.id, id: dungeon.id, name: dungeon.name, board: [], position: -1 },
    players: [],
    turn: 0,
    spotlight: 0,
    gold: 0,
    xpPool: 0,
    phase: 'advance',
    pending: null,
    combat: null,
    training: null,
    lootQueue: [],
    bossDefeated: false,
    bonus: { rollMod: 0 },
    headline: null,
    log: [],
    events: [],
    social: [],
    result: null
  };
  attachContent(state, content);
  state.params = getModeParams(content, state.setup);
  state.setup.restrict = !!state.params.restrict;

  characters.forEach((ch, i) => makePlayer(state, ch, i));
  state.dungeon.board = generateBoard(state, characters.length);

  log(state, `La run commence : ${dungeon.name} (tranche ${tranche.id}, mode ${content.modes[setup.mode].name}${state.setup.stasisLevel ? ' ' + state.setup.stasisLevel : ''}).`, 'system');
  startTurn(state);
  return state;
}

// ============================================================
//  Salle d'entraînement (atelier de classes)
// ============================================================

/** Lance (ou relance) le combat d'entraînement : mêmes joueurs, mannequins tout neufs. */
function startTrainingFight(state) {
  const t = state.training;
  const tile = state.dungeon.board[0];
  tile.type = 'combat';
  tile.revealed = true;
  tile.resolved = false;
  state.dungeon.position = 0;
  tile.monsters = spawnTrainingDummies(state, t.dummy, t.count, t.atkScale);
  state.phase = 'tile';
  startCombat(state, tile, { natural: 10, total: 10 });
}

/**
 * Crée une salle d'entraînement : des personnages de test (toutes leurs compétences de
 * niveau <= leur niveau sont apprises) face à des mannequins qui ne meurent jamais.
 * @param specs  [{ classId, level, name?, spec? }]  (1 à 4)
 * @param opts   { dummy: 'mannequin'|'mannequin_agressif', count: 1..3, atkScale, seed }
 */
export function createTraining(content, specs, opts = {}) {
  const chars = specs.map((s, i) => {
    const cls = content.classes[s.classId];
    const ch = createCharacter(content, { id: `test${i + 1}`, name: s.name || cls.name, classId: s.classId });
    ch.level = Math.max(1, Math.min(content.rules.maxLevel, s.level || 1));
    ch.skills = cls.skills.filter((sk) => sk.level <= ch.level).map((sk) => sk.id);
    ch.spec = s.spec && cls.specs?.[s.spec] ? s.spec : null; // spécialisation à tester (facultatif)
    ch.deck = null; // Atelier : pas de limite de sorts, on teste tout
    return ch;
  });
  const tranche = content.trancheList.find((t) => t.available).id;
  const state = createRun(content, { tranche, mode: 'basic' }, chars, opts.seed ?? 4242);
  state.training = { dummy: opts.dummy || 'mannequin', count: opts.count || 1, atkScale: opts.atkScale || 1, specs };
  log(state, "Salle d'entraînement : les mannequins ne meurent jamais. Teste tes compétences !", 'system');
  startTrainingFight(state);
  return state;
}

// ============================================================
//  Zone de farm solo
// ============================================================

/**
 * Crée une session de farm : UN personnage sauvegardé affronte des vagues (voir farm.js et data/farm.json).
 * @param opts  { zoneId?, seed?, xpCap? }  (zone par défaut : la première ; xpCap : niveau jusqu'auquel ce héros gagne de l'XP,
 *              celui du meilleur autre héros du joueur — voir catchUpLevel dans farm.js ; 0 = pas d'XP)
 */
export function createFarm(content, character, opts = {}) {
  const zone = opts.zoneId ? content.farm.zones[opts.zoneId] : content.farm.zoneList[0];
  if (!zone) throw new GameError(`Zone de farm inconnue : ${opts.zoneId}`);
  if (character.lootChoice?.length) throw new GameError('Choisis d\'abord la récompense de ta dernière session.');
  // Le farm se joue en mode "Basic" : aucune restriction de niveau (le personnage joue avec tout son équipement).
  const state = createRun(content, { tranche: zone.trancheId, mode: 'basic' }, [character], opts.seed);
  state.log.length = 0;
  state.dungeon.name = zone.name;
  state.farm = { zoneId: zone.id, wave: 0, cleared: 0, kills: 0, xp: 0, shards: 0, xpCap: Math.max(0, Math.floor(Number(opts.xpCap)) || 0), last: null };
  log(state, `Session de farm : ${zone.name}. Ce que tu gagnes est gardé si tu t'arrêtes ; si tu tombes, tu ne perds que la vague en cours.`, 'system');
  startFarmWave(state);
  return state;
}

/** Remet tout à zéro dans la salle d'entraînement (PV, PA, délais, statuts, mannequins). */
function resetTraining(state) {
  assert(state.training, "Ce n'est pas une salle d'entraînement.");
  for (const p of state.players) {
    p.alive = true;
    p.ghost = false;
    p.hpMaxPenalty = 0;
    p.statuses = [];
    p.usedOnce = {};
    p.stats = newPlayerStats();
    p.hp = computeStats(state, p).hpMax;
  }
  state.combat = null;
  state.xpPool = 0;
  state.log.push({ turn: 0, kind: 'system', text: '— Réinitialisation de la salle —' });
  startTrainingFight(state);
}

// ============================================================
//  dispatch : le seul moyen de faire évoluer la partie
// ============================================================

/**
 * Applique une action.
 * Renvoie { ok:true, events:[...] } ou { ok:false, error:"..." } (l'état n'est alors pas modifié).
 */
export function dispatch(state, action) {
  state.events = [];
  try {
    assert(state.phase !== 'ended' || action.type === 'NOOP', 'La run est terminée.');
    handle(state, action);
    return { ok: true, events: state.events };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message, events: [] };
    throw e;
  }
}

function handle(state, a) {
  const pend = state.pending;
  switch (a.type) {
    case 'ADVANCE': {
      assert(pend?.kind === 'advance', "Ce n'est pas le moment d'avancer.");
      const actor = getPlayer(state, pend.actor);
      const d = state.dungeon;
      d.position++;
      const tile = d.board[d.position];
      tile.revealed = true;
      state.phase = 'tile';
      state.headline = null;
      const def = state.content.tiles[tile.type];
      log(state, `${actor.name} avance : ${def.name}. ${def.flavor[tile.flavor] || ''}`, 'system');
      emit(state, { type: 'advance', index: d.position, tileType: tile.type });
      tileHandlers[tile.type].onReveal(state, tile);
      break;
    }

    case 'ROLL': {
      assert(pend?.kind === 'roll', 'Aucun jet de dé attendu.');
      const actor = getPlayer(state, pend.actor);
      const roll = playerRoll(state, actor, pend.purpose);
      const tile = currentTile(state);
      tileHandlers[tile.type].onRoll(state, tile, roll);
      break;
    }

    case 'CHOOSE': {
      assert(pend?.kind === 'choice', 'Aucun choix attendu.');
      assert(pend.options.some((o) => o.id === a.option), 'Choix invalide.');
      if (pend.subtype === 'loot') resolveLootChoice(state, a.option);
      else {
        const tile = currentTile(state);
        tileHandlers[tile.type].onChoice(state, tile, a.option);
      }
      break;
    }

    case 'COMBAT_ACT':
      playerAction(state, a);
      break;

    case 'TIMEOUT':
      timeoutTurn(state);
      break;

    case 'FARM_NEXT': // farm : lancer la vague suivante
      farmNext(state);
      break;

    case 'FARM_STOP': // farm : s'arrêter (et choisir sa récompense)
      assert(state.farm && pend?.kind === 'farm', "Ce n'est pas le moment de partir.");
      endRun(state, 'stop');
      break;

    case 'TRAINING_RESET':
      resetTraining(state);
      break;

    case 'END_TRAINING':
      assert(state.training, "Ce n'est pas une salle d'entraînement.");
      endRun(state, 'abandon');
      break;

    case 'EQUIP':
      equipItem(state, a.playerId, a.uid, a.slot);
      break;
    case 'UNEQUIP':
      unequipItem(state, a.playerId, a.slot);
      break;
    case 'GIVE':
      giveItem(state, a.fromId, a.toId, a.uid);
      break;

    case 'USE_ITEM': {
      assert(!state.combat, 'Utilise les objets via les actions de combat.');
      const user = getPlayer(state, a.playerId);
      assert(user && user.alive, 'Joueur invalide.');
      useConsumable(state, user, a.uid, a.targetId);
      break;
    }

    case 'USE_SKILL': {
      assert(!state.combat, 'Utilise les compétences via les actions de combat.');
      assert(pend?.kind === 'advance' || pend?.kind === 'farm', "Les soins hors combat se font avant d'avancer (ou entre deux vagues).");
      const user = getPlayer(state, a.playerId);
      assert(user && user.alive, 'Joueur invalide.');
      const sk = skillOf(state, a.skillId);
      assert(sk && activeSkillIds(state, user).includes(sk.id), 'Compétence inconnue.');
      const check = checkUsable(state, user, sk, { inCombat: false });
      assert(check.ok, check.reason);
      if (needsPick(sk)) assert(validTargets(state, user, sk).includes(a.targetId), 'Cible invalide.');
      castSkill(state, user, sk, a.targetId);
      break;
    }

    case 'SHOP_BUY':
      shopBuy(state, a);
      break;
    case 'SHOP_SELL':
      shopSell(state, a);
      break;
    case 'CAMP_DECK': // feu de camp : changer un sort équipé (le héros dont c'est le tour au camp)
      campDeck(state, a);
      break;
    case 'CAMP_ACT': // feu de camp : son activité (se reposer, affûter, monter la garde)
      campAct(state, a);
      break;

    case 'SHOP_LEAVE':
      assert(pend?.kind === 'shop', 'Pas de marchand ici.');
      log(state, 'Le groupe quitte le marchand.', 'info');
      finishTile(state);
      break;

    case 'GHOST':
      ghostAct(state, a);
      break;

    case 'ABANDON':
      endRun(state, 'abandon');
      break;

    default:
      throw new GameError(`Action inconnue : ${a.type}`);
  }
}
