// Fuzzing : des milliers de parties avec des réglages et des actions aléatoires.
// Objectif : aucune exception, aucune incohérence (PV négatifs, partie bloquée...),
// et une action REFUSÉE ne doit JAMAIS modifier la partie.
// Usage : node tests/fuzz.mjs [nombre_de_parties]
import { loadContent } from './load-data.mjs';
import { makeParty, chooseAction, checkInvariants, makeRand } from './bot.mjs';
import { createRun, createTraining, createFarm, applyFarmResult, dispatch, getCombatView, EQUIP_SLOTS } from '../src/core/index.js';
import { nextFloat } from '../src/core/rng.js';

const content = loadContent();
const N = Number(process.argv[2]) || 400;
const rs = { rng: 987654 };
const R = (a) => a[Math.floor(nextFloat(rs) * a.length)];
const chance = (p) => nextFloat(rs) < p;
const CLASSES = Object.keys(content.classes);

/** Action "chaotique" : tout ce qui est légal, et beaucoup de choses qui ne le sont pas. */
function chaos(state, rand) {
  const living = state.players.filter((p) => p.alive);
  const dead = state.players.filter((p) => !p.alive);
  const pend = state.pending;
  if (state.phase !== 'combat' && chance(0.25)) {
    const kind = R(['equip', 'unequip', 'give', 'ghost', 'item', 'skill', 'bad']);
    const p = R(state.players);
    // (emplacement au hasard : bon, mauvais, ou inconnu — une demande invalide doit être refusée sans rien modifier)
    if (kind === 'equip' && p.bag.length) return { type: 'EQUIP', playerId: p.id, uid: R(p.bag).uid, slot: chance(0.5) ? R([...EQUIP_SLOTS, 'zzz']) : undefined };
    if (kind === 'unequip') return { type: 'UNEQUIP', playerId: p.id, slot: R([...EQUIP_SLOTS, 'weapon', 'nope']) };
    if (kind === 'give' && p.bag.length && state.players.length > 1) return { type: 'GIVE', fromId: p.id, toId: R(state.players.filter((x) => x.id !== p.id)).id, uid: R(p.bag).uid };
    if (kind === 'ghost' && dead.length) return { type: 'GHOST', playerId: R(dead).id, mode: R(['bless', 'hinder', 'light']) };
    if (kind === 'item' && living.length) return { type: 'USE_ITEM', playerId: R(living).id, uid: p.bag[0]?.uid || 'x', targetId: R(living).id };
    if (kind === 'skill' && living.length) return { type: 'USE_SKILL', playerId: R(living).id, skillId: R(living[0].skills), targetId: R(state.players).id };
    if (kind === 'bad') return { type: R(['ROLL', 'ADVANCE', 'CHOOSE', 'COMBAT_ACT', 'SHOP_LEAVE', 'SHOP_BUY', 'TIMEOUT', 'TRAINING_RESET', 'FARM_NEXT', 'FARM_STOP', 'NOPE']), option: 'zzz', playerId: 'p9' };
  }
  if (pend.kind === 'shop' && chance(0.5)) {
    const p = R(state.players);
    if (chance(0.5) && p.bag.length) return { type: 'SHOP_SELL', playerId: p.id, uid: R(p.bag).uid };
    return { type: 'SHOP_BUY', index: Math.floor(nextFloat(rs) * 5), buyerId: R(state.players).id };
  }
  if (pend.kind === 'combat' && chance(0.6)) {
    const v = getCombatView(state, pend.actor);
    const what = R(['skill', 'skill', 'skill', 'skill', 'move', 'item', 'end', 'timeout', 'bad']);
    if (what === 'skill') {
      const s = R(v.skills);
      return { type: 'COMBAT_ACT', playerId: pend.actor, act: 'skill', skillId: s.skillId, targetId: s.targets.length ? R(s.targets) : chance(0.2) ? 'zzz' : undefined, ...(s.modePick ? { modeId: chance(0.2) ? 'zzz' : R(s.modePick).id } : {}) };
    }
    if (what === 'move') return { type: 'COMBAT_ACT', playerId: pend.actor, act: 'move', row: R(['front', 'back', 'milieu']) };
    if (what === 'item') return { type: 'COMBAT_ACT', playerId: pend.actor, act: 'item', itemUid: v.items[0]?.uid || 'x', targetId: R(state.players).id };
    if (what === 'end') return { type: 'COMBAT_ACT', playerId: pend.actor, act: 'endTurn' };
    if (what === 'timeout') return { type: 'TIMEOUT' };
    return { type: 'COMBAT_ACT', playerId: R(['p1', 'p9', pend.actor]), act: R(['skill', 'nope', undefined]), skillId: 'inconnue' };
  }
  return chooseAction(state, rand);
}

/** Joue une partie jusqu'au bout avec des actions chaotiques. */
function playChaos(state, label) {
  const rand = makeRand(Math.floor(nextFloat(rs) * 1e9));
  let actions = 0;
  let rejected = 0;
  // Une salle d'entraînement ne finit jamais toute seule : on la quitte forcément.
  const abandonAt = state.training ? 40 + Math.floor(nextFloat(rs) * 200) : chance(0.05) ? 20 + Math.floor(nextFloat(rs) * 80) : Infinity;
  try {
    while (state.phase !== 'ended') {
      if (actions >= abandonAt) {
        dispatch(state, { type: state.training ? 'END_TRAINING' : 'ABANDON' });
        break;
      }
      const before = JSON.stringify({ ...state, events: [] });
      const action = chaos(state, rand);
      const res = dispatch(state, action);
      if (!res.ok) {
        rejected++;
        const after = JSON.stringify({ ...state, events: [] });
        if (after !== before) throw new Error("Une action refusée a modifié l'état : " + JSON.stringify(action) + ' -> ' + res.error);
      }
      checkInvariants(state);
      if (++actions > 6000) throw new Error("Partie bloquée (trop d'actions)");
    }
    return { actions, rejected };
  } catch (e) {
    console.error(`\n❌ ÉCHEC (${label}) après ${actions} actions`);
    console.error(e.stack);
    console.error('pending:', JSON.stringify(state.pending).slice(0, 400));
    console.error('derniers logs:', state.log.slice(-8).map((l) => l.text).join(' | '));
    process.exit(1);
  }
}

let ok = 0, rejected = 0;
const outcomes = { victory: 0, defeat: 0, abandon: 0 };
for (let g = 0; g < N; g++) {
  const size = 1 + Math.floor(nextFloat(rs) * 4);
  const classes = Array.from({ length: size }, () => R(CLASSES));
  const level = R([1, 1, 2, 3, 4, 5, 8, 10, 15, 20]);
  const tranche = R([1, 4, 8]);
  const mode = R(['basic', 'tranche', 'stasis']);
  const dungeon = R(content.dungeonsByTranche[tranche].filter((d) => d.available !== false)).id; // (un donjon au hasard : ses monstres et leurs mécaniques sont malmenés aussi)
  const setup = { tranche, dungeon, mode, stasisLevel: 1 + Math.floor(nextFloat(rs) * 3) };
  // Une fois sur deux, chaque héros prend une spécialisation au hasard (et, au niveau 8, un talent au hasard de son palier) : les sorts de spé sont malmenés aussi.
  const specOf = (cid) => { const ids = Object.keys(content.classes[cid].specs || {}); return ids.length && level >= 4 && chance(0.6) ? R(ids) : null; };
  const specs = classes.map(specOf);
  const learns = classes.map((cid, i) => {
    if (!specs[i] || level < 8) return [];
    const picks = content.classes[cid].skills.filter((sk) => sk.spec === specs[i] && sk.choiceGroup && sk.level <= level);
    return picks.length ? [R(picks).id] : [];
  });
  const party = makeParty(content, classes, level, R(['none', 'decent', 'good']), g + 1, { specs, learns });
  const state = createRun(content, setup, party, g * 7777 + 5);
  const r = playChaos(state, `partie ${g}: donjon ${dungeon} (tranche ${tranche}) mode ${mode} niveau ${level} classes ${classes}`);
  rejected += r.rejected;
  outcomes[state.result.outcome]++;
  ok++;
}

// Salles d'entraînement : toutes les classes, tous les niveaux, avec ou sans mannequins agressifs
let trainingOk = 0;
for (let g = 0; g < Math.ceil(N / 4); g++) {
  const size = 1 + Math.floor(nextFloat(rs) * 4);
  const specs = Array.from({ length: size }, () => { const classId = R(CLASSES); const ids = Object.keys(content.classes[classId].specs || {}); return { classId, level: R([1, 4, 8, 12, 20]), ...(ids.length && chance(0.7) ? { spec: R(ids) } : {}) }; });
  const state = createTraining(content, specs, { dummy: R(['mannequin', 'mannequin_agressif']), count: 1 + Math.floor(nextFloat(rs) * 3), atkScale: R([1, 2, 5]), seed: g + 1 });
  playChaos(state, `atelier ${g}: ${JSON.stringify(specs)}`);
  trainingOk++;
}

// Sessions de farm : toutes les classes, tous les niveaux, actions chaotiques (y compris FARM_NEXT / FARM_STOP au mauvais moment)
let farmOk = 0;
const farmOutcomes = { stop: 0, defeat: 0, abandon: 0 };
for (let g = 0; g < Math.ceil(N / 4); g++) {
  const [ch] = makeParty(content, [R(CLASSES)], R([1, 2, 3, 4, 6, 10]), R(['none', 'decent', 'good']), g + 1);
  const state = createFarm(content, ch, { seed: g * 4243 + 1, xpCap: R([0, 0, 8]) });
  playChaos(state, `farm ${g}: ${ch.classId} niveau ${ch.level}`);
  const shards0 = ch.shards || 0;
  applyFarmResult(content, ch, state);
  if ((ch.lootChoice?.length || 0) !== (state.result.waves > 0 ? 3 : 0)) throw new Error('farm : la récompense au choix est incohérente');
  if (ch.shards < shards0 + state.result.waves) throw new Error('farm : des éclats ont été perdus');
  farmOutcomes[state.result.outcome]++;
  farmOk++;
}

console.log(`✅ ${ok}/${N} parties, ${trainingOk} salles d'entraînement et ${farmOk} sessions de farm sans erreur. Actions refusées (normales) : ${rejected}. Issues :`, outcomes, 'farm :', farmOutcomes);
