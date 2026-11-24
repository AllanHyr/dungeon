// Tests des règles du jeu. Usage : node tests/run-tests.mjs
import { loadContent, loadRaw } from './load-data.mjs';
import { makeParty, chooseAction, playRun, playFarm, checkInvariants, makeRand } from './bot.mjs';
import {
  buildContent, createRun, createTraining, dispatch, cloneState, restoreState, computeStats, effectiveLevel,
  levelFactor, createCharacter, addXp, applyRunResult, availableTranches, canBeRevived, learnSkill, skillPointsFree,
  canLearnSkill, skillRequirements, resetSkills, getCombatView, validTargets, resolveDice, skillOf, totalShield, checkUsable,
  createFarm, applyFarmResult, catchUpLevel, choiceTier, canStartFarm, addXpCapped, checkAchievements, hasFeature, gearLevel, achievementProgress, titlesOf, waveInfo,
  EQUIP_SLOTS, slotsFor, planEquip, equipFromBag, unequipToBag, twoHandedWorn, applyCharacterAction, CHARACTER_ACTIONS, cleanName,
  afkAction, whoMustAct, turnKey, xpForNext, campDeckOptions,
  salvageValue, upgradeCost, craftableItems, itemView, forgeRules
} from '../src/core/index.js';
import { dungeonsOf, dungeonIdOf, dungeonRules, canBeRaised, activeSets } from '../src/core/index.js';
import { hotkeyIndex, keyLabel, learnKey } from '../src/ui/keys.js';
import { snapshotRun, planBeats, fxStyleOf, startState, targetsOf } from '../src/ui/fx-plan.js';
import { statusInfo, unitEffects, turnsText, byDanger, describeMods } from '../src/ui/status.js';
import { skillBlurb, resourceName } from '../src/ui/format.js';
import { FX_VOCAB, dotKind } from '../src/core/index.js';
import { soundList, soundGroups, hasSound } from '../src/ui/sound.js';
import { heroSvg, monsterSvg, vignetteSvg, sceneCss, sceneIdFor, heroIds, monsterIds, sceneIds, vignetteIds } from '../src/ui/art.js';
import { PIXEL_SCENES } from '../src/ui/art/pixel-scenes.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollFarmItem, rollChoices } from '../src/core/farm.js';
import { applyPrefs, emptyProfile } from '../src/net/common.js';
import { rollItem, rollShopItem } from '../src/core/loot.js';
import { queueLoot, endTurn as endBoardTurn } from '../src/core/flow.js';
import { endRun } from '../src/core/results.js';
import { getPlayer as playerOf } from '../src/core/util.js';
import { shopPrice as shopPriceOf } from '../src/core/tiles.js';
import { itemPrice as itemPriceOf } from '../src/core/items.js';
import { makeMonster, spawnMonsters, planMonsters, endCombat } from '../src/core/combat.js';
import { nextFloat } from '../src/core/rng.js';
import { reviveUnit, applyDamage } from '../src/core/units.js';
import { castSkill, dealDamage, applyEffect, fireTriggers, targetDamagePct } from '../src/core/effects.js';
import { markedEnemies } from '../src/core/geometry.js';
import { auraSources } from '../src/core/stats.js';
import { tickStatusEffects } from '../src/core/units.js';
import { addShield } from '../src/core/units.js';
import {
  createStore, createEmptyProfile, addCharacter, exportCode, importCode, addImported, saveProfile, loadProfile,
  sanitizeProfile, saveRun, loadRunText, clearRun, sanitizeCharacter
} from '../src/storage/profile.js';
import {
  activeSkillIds, skillAvailable, setSpec, setDeck, specsOf, deckEligible, fillDeck, deckSize, specLevel, levelCap, knownSkills, autoSkillIds, skillPaCost
} from '../src/core/index.js';

const content = loadContent();
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}\n     ${e.message.split('\n')[0]}`);
  }
}
const assert = (c, m = 'assertion fausse') => { if (!c) throw new Error(m); };
const eq = (a, b, m = '') => assert(JSON.stringify(a) === JSON.stringify(b), `${m} attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
const A = ['berserker', 'veilleur', 'duelliste'];

// ---- Aides pour les tests de combat (salle d'entraînement : mannequins immortels) ----
const training = (specs, opts = {}) => createTraining(content, specs, { seed: 7, ...opts });
const act = (state, playerId, a) => dispatch(state, { type: 'COMBAT_ACT', playerId, ...a });
const cast = (state, id, skillId, targetId) => act(state, id, { act: 'skill', skillId, targetId });
const endTurn = (state) => dispatch(state, { type: 'COMBAT_ACT', playerId: state.pending.actor, act: 'endTurn' });
/** Passe les tours (sans rien faire) jusqu'à ce que ce soit à `id` de jouer. */
function takeTurnOf(state, id) {
  for (let i = 0; i < 60 && state.pending.actor !== id; i++) assert(endTurn(state).ok);
  assert(state.pending.actor === id, `le tour de ${id} n'arrive jamais`);
}

console.log('\n● Contenu (données JSON)');
test('le contenu se charge : 8 classes jouables (+ 4 classes de test), 3 tranches jouables', () => {
  eq(Object.keys(loadContent({ legacy: false }).classes).sort(), ['assassin', 'barde', 'druide', 'guerrier', 'mage', 'pretre', 'sacrieur', 'templier']);
  eq(Object.keys(content.classes).sort(), ['assassin', 'barde', 'berserker', 'druide', 'druide_ancien', 'duelliste', 'guerrier', 'mage', 'pretre', 'sacrieur', 'templier', 'veilleur']);
  eq(availableTranches(content).map((t) => t.id), [1, 4, 8]);
});
test('hors combat, un héros achevé par un saignement ne récupère pas de PV après sa mort (plus de « fantôme à 2 PV »)', () => {
  const party = makeParty(content, ['guerrier'], 4, 'decent', 3);
  const state = createRun(content, { tranche: 4, mode: 'tranche' }, party, 5);
  const p = state.players[0];
  p.hp = 1;
  p.statuses.push({ id: 'dot', amount: 5, label: 'saigne', turns: 1 }); // (un saignement qui s'éteint à ce tour-ci : plus rien n'empêche la récupération)
  endBoardTurn(state);
  assert(!p.alive && p.hp === 0, `le héros est mort avec 0 PV (alive=${p.alive}, hp=${p.hp})`);
  checkInvariants(state);
});

test('une faute dans un JSON donne une erreur claire (monstre inconnu)', () => {
  const raw = loadRaw();
  raw.dungeons.dungeons[0].monsterPool.push('monstre_qui_nexiste_pas');
  let msg = '';
  try { buildContent(raw); } catch (e) { msg = e.message; }
  assert(msg.includes('monstre_qui_nexiste_pas'), 'message: ' + msg);
});
test("une faute de frappe dans un effet de compétence est expliquée (types connus listés)", () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.skills[0].effects[0].type = 'degats';
  let msg = '';
  try { buildContent(raw); } catch (e) { msg = e.message; }
  assert(msg.includes('degats') && msg.includes('damage') && msg.includes('berserker_entaille'), 'message: ' + msg);
});
test('un déclencheur avec un événement inconnu est refusé', () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.skills[1].triggers[0].on = 'quandjemeurs';
  let msg = '';
  try { buildContent(raw); } catch (e) { msg = e.message; }
  assert(msg.includes('quandjemeurs') && msg.includes('wouldDie'), 'message: ' + msg);
});
test('ajouter une tranche 12 uniquement par JSON fonctionne', () => {
  const raw = loadRaw();
  const t12 = raw.tranches.tranches.find((t) => t.id === 12);
  Object.assign(t12, { ...raw.tranches.tranches.find((t) => t.id === 8), id: 12, name: 'Test 12', minLevel: 12, maxLevel: 15 });
  raw.items.items.push({ id: 'epee_test12', name: 'Épée de test', slot: 'weapon', rarity: 'common', level: 12, stats: { atk: 30 } });
  // ... et un donjon pour cette tranche (dungeons.json) : l'aperçu « à venir » devient jouable
  Object.assign(raw.dungeons.dungeons.find((d) => d.tranche === 12), { available: true, monsterPool: ['ogre_des_cryptes', 'spectre_affame'], bossId: 'gardien_dechu' });
  const c12 = buildContent(raw);
  eq(availableTranches(c12).map((t) => t.id), [1, 4, 8, 12]);
  eq(dungeonsOf(c12, 12).map((d) => d.id), ['citadelle_engloutie']);
  const { state } = playRun(c12, { tranche: 12, mode: 'tranche' }, makeParty(c12, A, 12, 'none', 2), 99);
  assert(state.phase === 'ended');
  eq(state.setup.dungeon, 'citadelle_engloutie');
});
test('compatibilité : une tranche écrite à l\'ancienne (monsterPool / bossId, aucun donjon) reçoit un donjon du même nom', () => {
  const raw = loadRaw();
  raw.dungeons.dungeons = raw.dungeons.dungeons.filter((d) => d.tranche !== 1);
  Object.assign(raw.tranches.tranches.find((t) => t.id === 1), { monsterPool: ['rat_geant'], bossId: 'roi_des_rats' });
  const c = buildContent(raw);
  eq(dungeonsOf(c, 1).map((d) => [d.id, d.name, d.implicit]), [['tranche_1', 'Les Caves Humides', true]]);
  const { state } = playRun(c, { tranche: 1, mode: 'tranche' }, makeParty(c, A, 2, 'none', 2), 7);
  assert(state.phase === 'ended' && state.dungeon.name === 'Les Caves Humides');
  // sans donjon ni monsterPool : la tranche n'est pas jouable, et on le dit
  const raw2 = loadRaw();
  raw2.dungeons.dungeons = raw2.dungeons.dungeons.filter((d) => d.tranche !== 4);
  let msg = '';
  try { buildContent(raw2); } catch (e) { msg = e.message; }
  assert(msg.includes('tranche 4') && msg.includes('donjon'), msg);
});
test('ajouter une CLASSE ET une compétence uniquement par JSON fonctionne', () => {
  const raw = loadRaw();
  raw.classes.classes.mage = {
    name: 'Mage', role: 'damage', icon: 'sword', description: 'test', startRow: 'back', basicAttack: 'mage_trait',
    baseStats: { hp: 30, atk: 8, def: 2, heal: 0, save: 0, luck: 0, ini: 10 }, growth: { hp: 5, atk: 2 },
    skills: [
      { id: 'mage_trait', name: 'Trait', type: 'active', innate: true, level: 1, cost: 0, pa: 3, target: 'enemy', range: 'ranged', effects: [{ type: 'damage', power: 1.2 }] },
      { id: 'mage_boule', name: 'Boule de feu', type: 'active', level: 1, cost: 1, pa: 5, target: 'enemies', range: 'ranged', dice: { fumble: 8, crit: 18 }, effects: [{ type: 'damage', power: 2 }] }
    ]
  };
  const c2 = buildContent(raw);
  const { state } = playRun(c2, { tranche: 1, mode: 'tranche' }, makeParty(c2, ['berserker', 'mage'], 1, 'none', 2), 5);
  assert(state.phase === 'ended');
});

console.log('\n● Niveau réel / niveau effectif');
test('Basic : niveau effectif = niveau réel', () => {
  const s = createRun(content, { tranche: 4, mode: 'basic' }, makeParty(content, ['berserker'], 12, 'none'), 1);
  eq([s.players[0].realLevel, s.players[0].effLevel], [12, 12]);
});
test('Tranche et Stasis : niveau effectif plafonné à la tranche', () => {
  for (const mode of ['tranche', 'stasis']) {
    const s = createRun(content, { tranche: 4, mode, stasisLevel: 2 }, makeParty(content, ['berserker'], 12, 'none'), 1);
    eq([s.players[0].realLevel, s.players[0].effLevel], [12, 4], mode);
  }
  const low = createRun(content, { tranche: 8, mode: 'tranche' }, makeParty(content, ['berserker'], 2, 'none'), 1);
  eq([low.players[0].realLevel, low.players[0].effLevel], [2, 2]);
  eq(effectiveLevel(20, { tranche: 4 }, true), 4);
});
test("les stats d'un niveau 12 en tranche 4 sont celles d'un niveau 4", () => {
  const big = createRun(content, { tranche: 4, mode: 'tranche' }, [{ ...makeParty(content, ['berserker'], 12, 'none')[0], skills: ['berserker_entaille', 'berserker_sang_chaud'] }], 1);
  const small = createRun(content, { tranche: 4, mode: 'tranche' }, [{ ...makeParty(content, ['berserker'], 4, 'none')[0], skills: ['berserker_entaille', 'berserker_sang_chaud'] }], 1);
  eq(computeStats(big, big.players[0]), computeStats(small, small.players[0]));
});
test('un objet de niveau 8 est inactif en tranche 4 mais actif en Basic', () => {
  const [hero] = makeParty(content, ['duelliste'], 8, 'none');
  hero.equipment.mainHand = { uid: 'w1', id: 'hallebarde_fer_noir' }; // niveau 8
  const tranche4 = createRun(content, { tranche: 4, mode: 'tranche' }, [hero], 1);
  const basic4 = createRun(content, { tranche: 4, mode: 'basic' }, [hero], 1);
  const bare = createRun(content, { tranche: 4, mode: 'tranche' }, [{ ...hero, equipment: Object.fromEntries(EQUIP_SLOTS.map((k) => [k, null])) }], 1);
  eq(computeStats(tranche4, tranche4.players[0]).atk, computeStats(bare, bare.players[0]).atk, 'inactif');
  assert(computeStats(basic4, basic4.players[0]).atk > computeStats(tranche4, tranche4.players[0]).atk, 'actif en Basic');
});
test('une compétence passive de niveau 8 (+1 PA) est inactive en tranche 4', () => {
  const [hero] = makeParty(content, ['duelliste'], 8, 'none');
  hero.skills = ['duelliste_estoc', 'duelliste_second_souffle'];
  const a = createRun(content, { tranche: 4, mode: 'tranche' }, [hero], 1);
  const b = createRun(content, { tranche: 4, mode: 'basic' }, [hero], 1);
  eq(computeStats(a, a.players[0]).pa, 6);
  eq(computeStats(b, b.players[0]).pa, 7);
});

console.log('\n● Butin');
test('la Stasis améliore la qualité mais JAMAIS le niveau du butin', () => {
  const s = createRun(content, { tranche: 4, mode: 'stasis', stasisLevel: 3 }, makeParty(content, ['berserker'], 4, 'none'), 5);
  let maxLevel = 0, rareStasis = 0;
  const rareIdx = content.rarityIndex['rare'];
  for (let i = 0; i < 4000; i++) {
    const def = content.items[rollItem(s, { boost: s.params.rarityBoost }).id];
    maxLevel = Math.max(maxLevel, def.level);
    if (content.rarityIndex[def.rarity] >= rareIdx) rareStasis++;
  }
  assert(maxLevel <= 4, 'niveau max ' + maxLevel);
  const b = createRun(content, { tranche: 4, mode: 'basic' }, makeParty(content, ['berserker'], 4, 'none'), 5);
  let rareBasic = 0;
  for (let i = 0; i < 4000; i++) if (content.rarityIndex[content.items[rollItem(b, { boost: b.params.rarityBoost }).id].rarity] >= rareIdx) rareBasic++;
  assert(rareStasis > rareBasic * 2, `rares stasis ${rareStasis} vs basic ${rareBasic}`);
});
test('les raretés hautes sont rares en mode Tranche (grind)', () => {
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, ['berserker'], 1, 'none'), 5);
  const counts = {};
  for (let i = 0; i < 5000; i++) { const r = content.items[rollItem(s, { boost: 1 }).id].rarity; counts[r] = (counts[r] || 0) + 1; }
  assert(counts.common > counts.uncommon && counts.uncommon > counts.rare && counts.rare > (counts.epic || 0) && (counts.legendary || 0) < 150, JSON.stringify(counts));
});
test("un objet ne peut s'équiper que si le niveau RÉEL suffit", () => {
  const [hero] = makeParty(content, ['berserker'], 4, 'none');
  hero.inventory.push({ uid: 'h8', id: 'hallebarde_fer_noir' });
  const s = createRun(content, { tranche: 4, mode: 'basic' }, [hero], 1);
  const r = dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'h8' });
  assert(!r.ok && r.error.includes('Niveau 8'), r.error);
  s.players[0].realLevel = 8;
  assert(dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'h8' }).ok);
});
test('un objet peut donner des EFFETS (+1 PA, critique plus tôt, bouclier de début de combat)', () => {
  const [hero] = makeParty(content, ['duelliste'], 4, 'none');
  hero.equipment.relic = { uid: 't1', id: 'coeur_crypte' };
  const s = createRun(content, { tranche: 4, mode: 'tranche' }, [hero], 1);
  eq(computeStats(s, s.players[0]).pa, 7);
  const [h2] = makeParty(content, ['veilleur'], 4, 'none');
  h2.equipment.relic = { uid: 't2', id: 'larme_cristal' };
  const t = createRun(content, { tranche: 4, mode: 'tranche' }, [h2], 1);
  t.dungeon.board[0].type = 'combat';
  dispatch(t, { type: 'ADVANCE' });
  dispatch(t, { type: 'ROLL' });
  assert(totalShield(t.players[0]) > 0, 'bouclier au début du combat');
});

console.log('\n● Emplacements d\'équipement (14), deux mains, deux anneaux');
const bagOf = (ids, level = 8) => {
  const holder = { equipment: Object.fromEntries(EQUIP_SLOTS.map((k) => [k, null])), bag: ids.map((id, i) => ({ uid: `b${i}`, id })), realLevel: level };
  return holder;
};
test('il y a 14 emplacements, chacun a un nom, et chaque type d\'objet sait où se porter', () => {
  eq(EQUIP_SLOTS.length, 14);
  for (const slot of EQUIP_SLOTS) assert(content.slotNames[slot], `nom manquant : ${slot}`);
  for (const it of content.itemList) if (it.slot !== 'consumable') assert(slotsFor(it).length > 0, `${it.id} : aucun emplacement`);
  eq(slotsFor(content.items.anneau_sang), ['ring1', 'ring2']);
  eq(slotsFor(content.items.dague_os), ['mainHand', 'offHand']);
  eq(slotsFor(content.items.hallebarde_fer_noir), ['mainHand']);
  eq(slotsFor(content.items.potion_mineure), []);
});
test("le catalogue couvre tous les emplacements à chaque tranche (sinon un emplacement ne se remplirait jamais)", () => {
  for (const slot of EQUIP_SLOTS) {
    if (slot === 'relic') continue; // les reliques sont rares et spéciales
    for (const t of [1, 4, 8]) {
      assert(content.itemList.some((i) => i.level === t && slotsFor(i).includes(slot) && i.rarity === 'common' || i.level === t && slotsFor(i).includes(slot) && i.rarity === 'uncommon'),
        `aucun objet commun/inhabituel de tranche ${t} pour ${slot}`);
    }
  }
});
test('une arme à deux mains prend la main droite et renvoie la main gauche au sac', () => {
  const h = bagOf(['dague_os', 'hallebarde_fer_noir', 'rondache_de_bois']);
  assert(equipFromBag(content, h, 'b0').ok);                 // dague -> main droite
  eq(equipFromBag(content, h, 'b2').slot, 'offHand');        // rondache -> main gauche
  const r = equipFromBag(content, h, 'b1');                  // hallebarde (2 mains)
  assert(r.ok && r.slot === 'mainHand', JSON.stringify(r));
  eq(r.displaced.map((d) => d.id).sort(), ['dague_os', 'rondache_de_bois']);
  assert(h.equipment.offHand === null && twoHandedWorn(content, h.equipment));
  eq(h.bag.map((i) => i.id).sort(), ['dague_os', 'rondache_de_bois']);
});
test('équiper un objet en main gauche renvoie l\'arme à deux mains au sac', () => {
  const h = bagOf(['hallebarde_fer_noir', 'rondache_de_bois', 'dague_os']);
  equipFromBag(content, h, 'b0');
  let r = equipFromBag(content, h, 'b1');
  assert(r.ok && r.slot === 'offHand' && r.displaced[0].id === 'hallebarde_fer_noir', JSON.stringify(r));
  assert(h.equipment.mainHand === null && h.equipment.offHand.id === 'rondache_de_bois');
  // deux armes à une main : la seconde va en main gauche (qui est libre), pas en remplacement
  r = equipFromBag(content, h, 'b2');
  eq([r.slot, r.displaced.length], ['mainHand', 0]);
  assert(h.equipment.offHand.id === 'rondache_de_bois');
});
test('deux anneaux : le premier libre est choisi, sinon on remplace celui qu\'on demande', () => {
  const h = bagOf(['anneau_sang', 'sceau_veilleur', 'anneau_rubis'], 8);
  eq(equipFromBag(content, h, 'b0').slot, 'ring1');
  eq(equipFromBag(content, h, 'b1').slot, 'ring2');
  const r = equipFromBag(content, h, 'b2', 'ring2'); // les deux sont pris : on précise lequel remplacer
  eq([r.slot, r.displaced.map((d) => d.id)], ['ring2', ['sceau_veilleur']]);
  assert(h.equipment.ring1.id === 'anneau_sang' && h.equipment.ring2.id === 'anneau_rubis');
});
test("un objet ne va que dans ses emplacements, et il faut le niveau réel", () => {
  const h = bagOf(['anneau_sang', 'couronne_dechue'], 1);
  assert(!equipFromBag(content, h, 'b0', 'head').ok, 'un anneau ne va pas sur la tête');
  const low = equipFromBag(content, h, 'b1');
  assert(!low.ok && low.reason.includes('Niveau 8'), low.reason);
  h.realLevel = 8;
  assert(equipFromBag(content, h, 'b1').ok);
  eq(h.equipment.head.id, 'couronne_dechue');
  assert(!planEquip(content, h.equipment, content.items.potion_mineure).ok, 'une potion ne se porte pas');
  eq(unequipToBag(h, 'head').id, 'couronne_dechue');
  eq(unequipToBag(h, 'head'), null);
});
test("en partie : EQUIP accepte un emplacement précis, UNEQUIP libère l'emplacement, le tout sans perdre d'objet", () => {
  const [hero] = makeParty(content, ['duelliste'], 8, 'none');
  hero.inventory.push({ uid: 'r1', id: 'anneau_sang' }, { uid: 'r2', id: 'anneau_rubis' }, { uid: 'r3', id: 'sceau_abysse' });
  const s = createRun(content, { tranche: 8, mode: 'tranche' }, [hero], 1);
  s.dungeon.position = 0; // hors combat
  assert(dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'r1' }).ok);
  assert(dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'r2' }).ok);
  assert(dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'r3', slot: 'ring1' }).ok);
  const p = s.players[0];
  eq([p.equipment.ring1.id, p.equipment.ring2.id], ['sceau_abysse', 'anneau_rubis']);
  assert(p.bag.some((i) => i.id === 'anneau_sang'), "l'anneau remplacé est dans le sac");
  assert(!dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'r3', slot: 'head' }).ok, 'mauvais emplacement refusé');
  assert(dispatch(s, { type: 'UNEQUIP', playerId: 'p1', slot: 'ring2' }).ok);
  assert(p.equipment.ring2 === null && p.bag.some((i) => i.id === 'anneau_rubis'));
  assert(!dispatch(s, { type: 'UNEQUIP', playerId: 'p1', slot: 'ring2' }).ok, 'rien à retirer');
});
test("les ANCIENNES sauvegardes (arme / armure / relique) retrouvent leur place, sans perdre un seul objet", () => {
  const old = { characters: [{
    id: 'v', name: 'Vieux', classId: 'berserker', level: 8, xp: 0,
    inventory: [{ uid: 'i1', id: 'potion_mineure' }],
    equipment: { weapon: { uid: 'a', id: 'hallebarde_fer_noir' }, armor: { uid: 'b', id: 'harnois_sombre' }, trinket: { uid: 'c', id: 'couronne_dechue' } }
  }, {
    id: 'w', name: 'Autre', classId: 'veilleur', level: 8, xp: 0, inventory: [],
    equipment: { weapon: { uid: 'd', id: 'dague_os' }, armor: null, trinket: { uid: 'e', id: 'anneau_sang' } }
  }] };
  const p = sanitizeProfile(content, old);
  const [a, b] = p.characters;
  eq([a.equipment.mainHand.id, a.equipment.chest.id, a.equipment.head.id], ['hallebarde_fer_noir', 'harnois_sombre', 'couronne_dechue']);
  eq([b.equipment.mainHand.id, b.equipment.ring1.id], ['dague_os', 'anneau_sang']);
  const count = (c) => c.inventory.length + Object.values(c.equipment).filter(Boolean).length;
  eq([count(a), count(b)], [4, 2], 'aucun objet perdu');
  assert(!('weapon' in a.equipment) && !('trinket' in a.equipment), "les anciennes clés disparaissent");
  // jamais deux fois le même objet, même si le fichier le répète
  const dup = sanitizeProfile(content, { characters: [{ classId: 'berserker', level: 8, inventory: [], equipment: { mainHand: { uid: 'x', id: 'dague_os' }, offHand: { uid: 'x', id: 'dague_os' } } }] });
  eq(count(dup.characters[0]), 2);
  assert(dup.characters[0].equipment.mainHand.uid !== dup.characters[0].equipment.offHand?.uid, 'uids distincts');
});
test("une partie sauvegardée avec l'ancien système (3 emplacements) est abandonnée proprement", () => {
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, ['berserker'], 1, 'none'), 5);
  const text = JSON.stringify({ ...JSON.parse(JSON.stringify(s)), version: 2 });
  let msg = '';
  try { restoreState(content, JSON.parse(text)); } catch (e) { msg = e.message; }
  assert(msg.includes('ancienne version'), msg);
});

console.log('\n● Raccourcis clavier des compétences (AZERTY et QWERTY)');
test("la position de la touche décide, pas son caractère : & é \" ' sont les touches 1 2 3 4 d'un clavier AZERTY", () => {
  const key = (k, code, more = {}) => hotkeyIndex({ key: k, code, ...more });
  eq([key('&', 'Digit1'), key('é', 'Digit2'), key('"', 'Digit3'), key("'", 'Digit4')], [0, 1, 2, 3], 'AZERTY, sans Maj');
  eq([key('(', 'Digit5'), key('-', 'Digit6'), key('è', 'Digit7'), key('_', 'Digit8'), key('ç', 'Digit9'), key('à', 'Digit0')], [4, 5, 6, 7, 8, 9], 'la suite de la rangée');
  eq([key('1', 'Digit1'), key('2', 'Digit2'), key('9', 'Digit9'), key('0', 'Digit0')], [0, 1, 8, 9], 'QWERTY');
  eq(key('1', 'Digit1', { shiftKey: true }), 0, 'AZERTY avec Maj (le chiffre)');
});
test("le pavé numérique marche, sauf quand c'est une flèche (verrouillage numérique éteint)", () => {
  eq(hotkeyIndex({ key: '3', code: 'Numpad3' }), 2);
  eq(hotkeyIndex({ key: 'PageDown', code: 'Numpad3' }), -1);
  eq(hotkeyIndex({ key: 'End', code: 'Numpad1' }), -1);
});
test("sans « code » (clavier virtuel), on se rabat sur le caractère ; les autres touches sont ignorées", () => {
  eq([hotkeyIndex({ key: 'é', code: '' }), hotkeyIndex({ key: '5' }), hotkeyIndex({ key: 'ç', code: '' })], [1, 4, 8]);
  eq([hotkeyIndex({ key: 'a', code: 'KeyA' }), hotkeyIndex({ key: 'Escape', code: 'Escape' }), hotkeyIndex({ key: ' ', code: 'Space' }), hotkeyIndex({})], [-1, -1, -1, -1]);
});
test("les étiquettes des cases s'apprennent à la frappe (le clavier du joueur n'est pas forcément celui qu'on devine)", () => {
  assert(['&', '1'].includes(keyLabel(0)), 'au départ : « & » (navigateur français) ou « 1 »');
  assert(learnKey({ key: 'é', code: 'Digit2' }), 'première frappe : on apprend');
  eq(keyLabel(1), 'é');
  assert(!learnKey({ key: 'é', code: 'Digit2' }), 'déjà appris : rien de nouveau');
  assert(!learnKey({ key: '3', code: 'Digit3', shiftKey: true }), 'avec Maj : on ignore (c\'est un chiffre, pas la touche)');
  assert(!learnKey({ key: 'Dead', code: 'Digit6' }), 'touche morte : on ignore');
  assert(!learnKey({ key: '~', code: 'Digit2', altKey: true }), 'AltGr : on ignore');
  assert(!learnKey({ key: '4', code: 'Digit4', getModifierState: (m) => m === 'CapsLock' }), 'Verr. Maj : on ignore (elle donne des chiffres sur AZERTY)');
  eq(keyLabel(1), 'é', 'les ignorés n\'ont rien changé');
  eq([keyLabel(-1), keyLabel(10)], ['', ''], 'au-delà de 10 cases : pas de touche');
});

console.log('\n● Actions sur les personnages (les mêmes règles en local et sur le serveur)');
{
  let n = 0;
  const ids = () => `t${++n}`;
  const act = (chars, a, ctx = {}) => applyCharacterAction(content, chars, a, { newId: ids, ...ctx });

  test("créer un personnage : nom nettoyé, classe vérifiée, limite respectée", () => {
    const chars = [];
    const r = act(chars, { type: 'CHAR_CREATE', name: '  Thorne\u0000   le   Roux  ', classId: 'berserker' });
    assert(r.ok, r.error);
    eq([r.character.name, r.character.classId, r.character.level], ['Thorne le Roux', 'berserker', 1]);
    eq(chars.length, 1);
    assert(!act(chars, { type: 'CHAR_CREATE', name: 'X', classId: 'magicien' }).ok, 'classe inconnue');
    assert(!act(chars, { type: 'CHAR_CREATE', name: 'X', classId: 'berserker' }, { maxCharacters: 1 }).ok, 'limite');
    // Les PLACES : 8 par défaut (rules.json), un serveur peut en imposer un autre nombre ; pleines, le message dit quoi faire
    eq(content.rules.maxCharacters, 8);
    const many = [];
    for (let i = 0; i < 8; i++) assert(act(many, { type: 'CHAR_CREATE', name: `H${i}`, classId: 'sacrieur' }).ok, `place ${i + 1}`);
    const full = act(many, { type: 'CHAR_CREATE', name: 'Neuf', classId: 'sacrieur' });
    assert(!full.ok && /8 sur 8/.test(full.error) && /supprime/.test(full.error), full.error);
    assert(act(many, { type: 'CHAR_CREATE', name: 'Neuf', classId: 'sacrieur' }, { maxCharacters: 10 }).ok, 'un serveur peut donner plus de places');
    assert(act(many, { type: 'CHAR_DELETE', charId: many[0].id }).ok);
    eq(many.length, 8, 'supprimer libère une place');
    eq(act([], { type: 'CHAR_CREATE', name: '', classId: 'veilleur' }).character.name, 'Veilleur', 'nom vide : le nom de la classe');
    eq(cleanName('a'.repeat(100)).length, 24);
    assert(!applyCharacterAction(content, [], { type: 'CHAR_CREATE', name: 'x', classId: 'berserker' }).ok, "sans fabrique d'identifiants, on ne crée rien");
  });
  test("équiper, retirer, apprendre, réinitialiser : mêmes règles que dans la fiche", () => {
    const chars = [];
    const ch = act(chars, { type: 'CHAR_CREATE', name: 'Zoé', classId: 'berserker' }).character;
    ch.level = 8;
    ch.inventory.push({ uid: 'a', id: 'hallebarde_fer_noir' }, { uid: 'b', id: 'dague_os' }, { uid: 'c', id: 'potion_mineure' });
    let r = act(chars, { type: 'CHAR_EQUIP', charId: ch.id, uid: 'a' });
    assert(r.ok, r.error);
    eq(ch.equipment.mainHand.id, 'hallebarde_fer_noir');
    assert(!act(chars, { type: 'CHAR_EQUIP', charId: ch.id, uid: 'c' }).ok, 'une potion ne se porte pas');
    assert(!act(chars, { type: 'CHAR_EQUIP', charId: ch.id, uid: 'zzz' }).ok, 'objet inconnu');
    assert(!act(chars, { type: 'CHAR_EQUIP', charId: ch.id, uid: 'b', slot: 'head' }).ok, 'mauvais emplacement');
    assert(!act(chars, { type: 'CHAR_EQUIP', charId: ch.id, uid: 'b', slot: 'nimporte' }).ok, 'emplacement inventé');
    r = act(chars, { type: 'CHAR_EQUIP', charId: ch.id, uid: 'b' });
    assert(r.ok && ch.equipment.mainHand.id === 'dague_os' && ch.inventory.some((i) => i.id === 'hallebarde_fer_noir'), "l'arme à deux mains retourne au sac");
    assert(!act(chars, { type: 'CHAR_UNEQUIP', charId: ch.id, slot: 'head' }).ok, 'rien à retirer');
    assert(act(chars, { type: 'CHAR_UNEQUIP', charId: ch.id, slot: 'mainHand' }).ok);
    eq(ch.equipment.mainHand, null);

    // compétences : 8 points (niveau 8), Colère (1 pt) puis Tourbillon (2 pts, niveau 4)
    assert(!act(chars, { type: 'CHAR_LEARN', charId: ch.id, skillId: 'berserker_tourbillon' }).ok, 'prérequis manquant');
    assert(!act(chars, { type: 'CHAR_LEARN', charId: ch.id, skillId: 'veilleur_soin' }).ok, "compétence d'une autre classe");
    assert(act(chars, { type: 'CHAR_LEARN', charId: ch.id, skillId: 'berserker_colere' }).ok);
    assert(act(chars, { type: 'CHAR_LEARN', charId: ch.id, skillId: 'berserker_tourbillon' }).ok);
    assert(!act(chars, { type: 'CHAR_LEARN', charId: ch.id, skillId: 'berserker_tourbillon' }).ok, 'déjà apprise');
    assert(act(chars, { type: 'CHAR_RESET_SKILLS', charId: ch.id }).ok);
    eq(skillPointsFree(content, ch), 8);
  });
  test("la récompense du farm : on garde UN objet (dans le sac), les autres deviennent des éclats ; rien à choisir = refusé", () => {
    const chars = [];
    const ch = act(chars, { type: 'CHAR_CREATE', name: 'Kael', classId: 'duelliste' }).character;
    assert(!act(chars, { type: 'CHAR_PICK_LOOT', charId: ch.id, uid: 'k1' }).ok, 'rien à choisir');
    ch.lootChoice = [{ uid: 'k1', id: 'dague_os' }, { uid: 'k2', id: 'piece_percee' }, { uid: 'k3', id: 'amulette_corbeau' }];
    assert(!act(chars, { type: 'CHAR_PICK_LOOT', charId: ch.id, uid: 'zz' }).ok, 'un objet hors de la récompense');
    const r = act(chars, { type: 'CHAR_PICK_LOOT', charId: ch.id, uid: 'k1' });
    assert(r.ok, r.error);
    eq([r.picked.id, ch.inventory.map((i) => i.uid), ch.lootChoice.length], ['dague_os', ['k1'], 0]);
    eq([r.shards, ch.shards], [1 + 3, 4], 'commun 1 + inhabituel 3');
  });
  test("un personnage engagé dans une partie n'est pas modifiable ; un personnage inconnu non plus ; les succès sont renvoyés", () => {
    const chars = [];
    const ch = act(chars, { type: 'CHAR_CREATE', name: 'Pip', classId: 'druide_ancien' }).character;
    const locked = new Set([ch.id]);
    for (const type of CHARACTER_ACTIONS.filter((t) => t !== 'CHAR_CREATE')) {
      const r = act(chars, { type, charId: ch.id, uid: 'x', slot: 'head', skillId: 'druide_floraison' }, { locked });
      assert(!r.ok && /partie en cours/.test(r.error), `${type} : ${r.error}`);
    }
    assert(!act(chars, { type: 'CHAR_DELETE', charId: 'inconnu' }).ok);
    assert(!act(chars, { type: 'CHAR_NIMPORTEQUOI', charId: ch.id }).ok);
    assert(!act(chars, null).ok && !act(chars, 'CHAR_DELETE').ok, 'action mal formée');
    // les succès : un Veilleur de niveau 4 + un donjon de groupe fini débloquent « Main tendue »... ici : équiper 9 objets de niveau 4 débloque « Équipé pour la gloire »
    const hero = act(chars, { type: 'CHAR_CREATE', name: 'Gloire', classId: 'berserker' }).character;
    hero.level = 4;
    const slots = ['head', 'neck', 'shoulders', 'back', 'chest', 'hands', 'belt', 'legs', 'feet'];
    slots.forEach((slot, i) => { hero.inventory.push({ uid: `g${i}`, id: content.itemList.find((it) => it.level === 4 && slotsFor(it).includes(slot) && !it.twoHanded).id }); });
    let unlocked = [];
    slots.forEach((slot, i) => { const r = act(chars, { type: 'CHAR_EQUIP', charId: hero.id, uid: `g${i}` }); assert(r.ok, r.error); unlocked = unlocked.concat(r.unlocked); });
    assert(unlocked.some((a) => a.id === 'equipe_pour_la_gloire'), `succès renvoyé à l'équipement (${unlocked.map((a) => a.id)})`);
    eq(act(chars, { type: 'CHAR_DELETE', charId: hero.id }).deletedId, hero.id);
    assert(!chars.some((c) => c.id === hero.id));
  });
}

console.log('\n● XP anti-carry');
test("un niveau 20 en tranche 4 gagne très peu d'XP", () => {
  assert(levelFactor(content, 20, 4) <= 0.06);
  eq(levelFactor(content, 4, 4), 1);
  eq(levelFactor(content, 7, 4), 1);
  assert(levelFactor(content, 8, 4) < 1);
  eq(levelFactor(content, 1, 8), 1);
});
test("le mode Basic donne très peu d'XP, Stasis bien plus que Tranche", () => {
  const xp = (setup) => {
    let total = 0;
    for (let i = 0; i < 12; i++) total += playRun(content, setup, makeParty(content, A, 1, 'good', i + 1), 40 + i).state.result.players[0].xp.potential;
    return total;
  };
  const b = xp({ tranche: 1, mode: 'basic' }), t = xp({ tranche: 1, mode: 'tranche' }), st = xp({ tranche: 1, mode: 'stasis', stasisLevel: 1 });
  assert(b < t * 0.4, `basic ${b} tranche ${t}`);
  assert(st > t, `stasis ${st} tranche ${t}`);
});
test("l'XP dépend de la contribution (un joueur passif gagne moins)", () => {
  const { state } = playRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, A, 1, 'good'), 7);
  for (const k of ['damageDealt', 'healingDone', 'damageTaken', 'rollsOk']) state.players[0].stats[k] = 0;
  state.players[2].stats.damageDealt = 500;
  state.phase = 'advance'; state.result = null;
  dispatch(state, { type: 'ABANDON' });
  const [lazy, , star] = state.result.players;
  assert(lazy.xp.contribMult < star.xp.contribMult, `${lazy.xp.contribMult} vs ${star.xp.contribMult}`);
});

console.log('\n● Persistance des personnages et coups bas');
function outcomeRuns(wantWin) {
  for (let seed = 1; seed < 300; seed++) {
    const chars = makeParty(content, A, 1, wantWin ? 'good' : 'none', seed);
    const before = JSON.stringify(chars);
    const setup = wantWin ? { tranche: 1, mode: 'tranche' } : { tranche: 8, mode: 'tranche' };
    const { state } = playRun(content, setup, chars, seed * 31);
    if (state.result.won === wantWin) return { chars, before, state };
  }
  throw new Error('aucune run trouvée');
}
test('une DÉFAITE ne change ni le personnage ni son équipement', () => {
  const { chars, before, state } = outcomeRuns(false);
  applyRunResult(content, chars, state);
  const after = JSON.parse(JSON.stringify(chars));
  for (const c of after) c.stats = null;
  const b = JSON.parse(before);
  for (const c of b) c.stats = null;
  eq(after, b);
  assert(chars[0].stats.runs === 1, 'stats de parties comptées');
});
test('une VICTOIRE donne XP et butin récupéré', () => {
  const { chars, state } = outcomeRuns(true);
  const lootCount = state.result.players.reduce((s, p) => s + p.loot.length, 0);
  applyRunResult(content, chars, state);
  const gained = chars.reduce((s, c) => s + c.xp + c.level * 1000, 0);
  assert(gained > 3000, 'xp ou niveau gagnés');
  const owned = chars.reduce((s, c) => s + c.inventory.length + Object.values(c.equipment).filter(Boolean).length, 0);
  assert(owned >= lootCount, `butin ${lootCount} vs possédé ${owned}`);
  applyRunResult(content, chars, state); // 2e appel : sans effet
  assert(state.result.applied);
});
test('les coups bas ne touchent JAMAIS le personnage sauvegardé', () => {
  const chars = makeParty(content, ['berserker', 'duelliste'], 1, 'good', 3);
  const before = JSON.stringify(chars);
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, chars, 11);
  s.dungeon.board[0].type = 'low_blow';
  dispatch(s, { type: 'ADVANCE' });
  assert(s.pending.subtype === 'low_blow');
  dispatch(s, { type: 'CHOOSE', option: s.pending.options.find((o) => o.blow === 'curse').id });
  for (let tries = 0; tries < 200 && s.pending.kind === 'roll'; tries++) {
    const snap = cloneState(s);
    dispatch(snap, { type: 'ROLL' });
    if (snap.log.some((l) => l.text.includes('maudit'))) { dispatch(s, { type: 'ROLL' }); break; }
    s.rng++; // change le tirage
  }
  assert(s.players.some((p) => p.cursedUid), 'un objet est maudit dans la run');
  eq(JSON.stringify(chars), before, 'personnage intact');
  const victim = s.players.find((p) => p.cursedUid);
  const total = () => { const st = computeStats(s, victim); return st.hpMax + st.atk + st.def + st.heal + st.ini + st.luck + st.save + st.pa; };
  const withCurse = total();
  victim.cursedUid = null;
  assert(total() > withCurse, 'la malédiction retire les bonus');
});
test('les coups bas peuvent rebondir (jet de 5 ou moins)', () => {
  let rebounds = 0, successes = 0;
  for (let i = 0; i < 60; i++) {
    const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, ['berserker', 'duelliste'], 1, 'none', i), 500 + i);
    s.dungeon.board[0].type = 'low_blow';
    dispatch(s, { type: 'ADVANCE' });
    dispatch(s, { type: 'CHOOSE', option: s.pending.options.find((o) => o.blow === 'damage').id });
    dispatch(s, { type: 'ROLL' });
    if (s.log.some((l) => l.text.includes('se retourne contre lui'))) rebounds++;
    else successes++;
  }
  assert(rebounds > 3 && successes > 20, `rebonds ${rebounds}, succès ${successes}`);
});
test("aucun vol : un objet ne change de main que par don volontaire", () => {
  const chars = makeParty(content, ['berserker', 'duelliste'], 1, 'good', 3);
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, chars, 11);
  const uid = s.players[0].equipment.mainHand.uid;
  assert(!dispatch(s, { type: 'GIVE', fromId: 'p2', toId: 'p1', uid }).ok);
  assert(s.players[0].equipment.mainHand.uid === uid);
});

console.log('\n● Combat : points d\'action, frise, rangs');
test('les PA se dépensent, le tour se termine à 0 PA et les PA reviennent au tour suivant', () => {
  const s = training([{ classId: 'duelliste', level: 1 }]);
  const p = s.players[0];
  eq(p.pa, 6);
  assert(cast(s, 'p1', 'duelliste_estoc', 'm1').ok);
  eq(p.pa, 3);
  assert(cast(s, 'p1', 'duelliste_estoc', 'm1').ok); // 0 PA : le tour se termine tout seul
  eq(s.combat.round, 2, 'nouveau round');
  eq(p.pa, 6, 'PA rendus');
});
test('une compétence trop chère est refusée sans rien changer', () => {
  const s = training([{ classId: 'duelliste', level: 1 }]);
  s.players[0].pa = 3;
  const before = JSON.stringify(s.combat);
  const r = cast(s, 'p1', 'duelliste_fente', 'm1'); // 4 PA
  assert(!r.ok && r.error.includes('4 PA'), r.error);
  eq(JSON.stringify(s.combat), before);
});
test('changer de rang coûte 1 PA', () => {
  const s = training([{ classId: 'berserker', level: 1 }]);
  eq(s.players[0].row, 'front');
  assert(act(s, 'p1', { act: 'move', row: 'back' }).ok);
  eq([s.players[0].row, s.players[0].pa], ['back', 5]);
  assert(!act(s, 'p1', { act: 'move', row: 'back' }).ok, 'déjà au rang arrière');
});
test('la frise alterne les camps (joueur, monstre, joueur...)', () => {
  const s = training([{ classId: 'berserker', level: 1 }, { classId: 'veilleur', level: 1 }, { classId: 'duelliste', level: 1 }], { count: 3 });
  const tl = s.combat.timeline;
  eq(tl.length, 6);
  const sides = tl.map((id) => (id.startsWith('p') ? 'P' : 'M'));
  for (let i = 1; i < sides.length; i++) assert(sides[i] !== sides[i - 1], 'les camps doivent alterner : ' + sides.join(''));
});
test("avec plus de joueurs que de monstres, les derniers jouent à la suite", () => {
  const s = training(['berserker', 'veilleur', 'druide_ancien', 'duelliste'].map((classId) => ({ classId, level: 1 })), { count: 1 });
  eq(s.combat.timeline.length, 5);
  eq(new Set(s.combat.timeline).size, 5);
});
test('le corps à corps ne touche que le rang avant, la distance touche tout le monde', () => {
  const s = training([{ classId: 'duelliste', level: 1 }, { classId: 'veilleur', level: 1 }], { count: 2 });
  const [m1, m2] = s.combat.monsters;
  m1.row = 'front'; m2.row = 'back';
  const duel = s.players[0], veil = s.players[1];
  eq(validTargets(s, duel, skillOf(s, 'duelliste_estoc')), ['m1']);
  eq(validTargets(s, veil, skillOf(s, 'veilleur_rayon')).sort(), ['m1', 'm2']);
  m1.alive = false; // plus personne devant : le corps à corps atteint le rang arrière
  eq(validTargets(s, duel, skillOf(s, 'duelliste_estoc')), ['m2']);
});
test('le minuteur écoulé (TIMEOUT) termine le tour du joueur actif', () => {
  const s = training([{ classId: 'berserker', level: 1 }, { classId: 'duelliste', level: 1 }]);
  const first = s.pending.actor;
  assert(dispatch(s, { type: 'TIMEOUT' }).ok);
  assert(s.pending.actor !== first || s.combat.round > 1, 'le tour a changé');
  assert(s.log.some((l) => l.text.includes('Temps écoulé')));
  assert(!dispatch(cloneState(s), { type: 'TIMEOUT' }).ok === false, 'TIMEOUT valable à tout tour de joueur');
});
test('les monstres ANNONCENT leurs actions (compétences + cibles) et les exécutent', () => {
  const s = training([{ classId: 'berserker', level: 1 }, { classId: 'duelliste', level: 1 }], { dummy: 'mannequin_agressif', count: 2 });
  for (const m of s.combat.monsters) {
    assert(m.plan.length >= 1, 'un plan annoncé');
    for (const step of m.plan) assert(skillOf(s, step.skillId) && s.players.some((p) => p.id === step.targetId), 'cible valide');
  }
  let hit = false;
  for (let i = 0; i < 12 && !hit; i++) { const r = endTurn(s); hit = r.events.some((e) => e.type === 'damage' && e.target.startsWith('p')); }
  assert(hit, 'les mannequins agressifs finissent par frapper');
});
test("la Provocation attire les coups des monstres sur le Berserker", () => {
  const s = training([{ classId: 'berserker', level: 1 }, { classId: 'duelliste', level: 1 }], { dummy: 'mannequin_agressif', count: 2 });
  takeTurnOf(s, 'p1');
  assert(cast(s, 'p1', 'berserker_provocation').ok);
  let others = 0, tank = 0;
  for (let i = 0; i < 6; i++) {
    const r = endTurn(s);
    for (const e of r.events) if (e.type === 'damage' && e.target.startsWith('p') && e.amount + e.absorbed > 0) (e.target === 'p1' ? tank++ : others++);
    if (s.pending.actor === 'p1') break;
  }
  assert(tank > 0 && others === 0, `tank ${tank}, autres ${others}`);
});
test('un ennemi étourdi (Racines) saute son tour', () => {
  const s = training([{ classId: 'druide_ancien', level: 1 }, { classId: 'duelliste', level: 1 }], { dummy: 'mannequin_agressif', count: 1 });
  takeTurnOf(s, 'p1');
  s.players[0].skills.push('druide_racines');
  assert(cast(s, 'p1', 'druide_racines', 'm1').ok, 'racines');
  let damaged = false, skipped = false;
  for (let i = 0; i < 4; i++) {
    const r = endTurn(s);
    damaged ||= r.events.some((e) => e.type === 'damage' && e.target.startsWith('p') && e.amount + e.absorbed > 0);
    skipped ||= s.log.some((l) => l.text.includes('est étourdi'));
    if (skipped) break;
  }
  assert(skipped && !damaged, `étourdi:${skipped} dégâts:${damaged}`);
});

console.log('\n● Augmenter les PA (objets, passifs, buffs, gains instantanés, plafond)');
test("objet : \"stats.pa\" donne +1 PA par tour (Cœur de la crypte, Sablier fêlé, Rapière d'orage)", () => {
  for (const [slot, id] of [['relic', 'coeur_crypte'], ['relic', 'sablier_fele'], ['mainHand', 'rapiere_orage']]) {
    const level = content.items[id].level;
    const [hero] = makeParty(content, ['duelliste'], level, 'none');
    hero.equipment[slot] = { uid: 'x1', id };
    const s = createRun(content, { tranche: level, mode: 'tranche' }, [hero], 1);
    eq(computeStats(s, s.players[0]).pa, 7, id);
  }
});
test('le Sablier fêlé et la Rapière d\'orage ont un PRIX (moins de PV ou de défense)', () => {
  const stats = (id, slot) => {
    const [hero] = makeParty(content, ['berserker'], 8, 'none');
    if (id) hero.equipment[slot] = { uid: 'x1', id };
    const s = createRun(content, { tranche: 8, mode: 'tranche' }, [hero], 1);
    return computeStats(s, s.players[0]);
  };
  const bare = stats(null);
  const sablier = stats('sablier_fele', 'relic');
  const rapiere = stats('rapiere_orage', 'mainHand');
  assert(sablier.hpMax < bare.hpMax && sablier.def < bare.def && sablier.pa === bare.pa + 1, 'sablier');
  assert(rapiere.def < bare.def && rapiere.atk > bare.atk && rapiere.pa === bare.pa + 1, 'rapière');
});
test('buff : le Cantique de hâte donne +2 PA au PROCHAIN tour de l\'allié, puis ça retombe', () => {
  const s = training([{ classId: 'veilleur', level: 4 }, { classId: 'duelliste', level: 4 }]);
  takeTurnOf(s, 'p1');
  assert(cast(s, 'p1', 'veilleur_hate', 'p2').ok);
  assert(s.players[1].statuses.some((st) => st.id === 'mod' && st.stat === 'pa'), 'le statut est posé');
  takeTurnOf(s, 'p2');
  eq(s.players[1].pa, 8, 'PA du tour hâté');
  assert(endTurn(s).ok);
  assert(!s.players[1].statuses.some((st) => st.stat === 'pa'), 'le buff a expiré après ce tour');
  takeTurnOf(s, 'p2');
  eq(s.players[1].pa, 6, 'retour à la normale');
});
test("le Cantique de hâte a un délai de récupération (pas de spam)", () => {
  const s = training([{ classId: 'veilleur', level: 4 }, { classId: 'duelliste', level: 4 }]);
  takeTurnOf(s, 'p1');
  s.players[0].pa = 12;
  assert(cast(s, 'p1', 'veilleur_hate', 'p2').ok);
  const again = cast(s, 'p1', 'veilleur_hate', 'p2');
  assert(!again.ok && again.error.includes('Prête dans'), again.error);
});
test('passif conditionnel écrit en JSON : "+1 PA tant que les PV sont sous 35 %"', () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.skills.push({ id: 'berserker_rage_froide', name: 'Rage froide', type: 'passive', innate: true, level: 1, cost: 0,
    modifiers: [{ stat: 'pa', flat: 1, if: { hpPctBelow: 35 } }] });
  const c = buildContent(raw);
  const s = createTraining(c, [{ classId: 'berserker', level: 4 }], { seed: 7 });
  const p = s.players[0];
  eq(computeStats(s, p).pa, 6, 'en pleine forme');
  p.hp = 5;
  eq(computeStats(s, p).pa, 7, 'blessé');
});
test('gain instantané (effet "pa") : vaut pour le tour en cours, jamais au-delà du plafond', () => {
  const raw = loadRaw();
  raw.classes.classes.duelliste.skills.push({ id: 'duelliste_adrenaline', name: 'Adrénaline', type: 'active', innate: true, level: 1, cost: 0,
    pa: 1, target: 'self', effects: [{ type: 'pa', amount: 3 }] });
  const c = buildContent(raw);
  const max = c.rules.combat.maxPa;
  const s = createTraining(c, [{ classId: 'duelliste', level: 1 }], { seed: 7 });
  const use = () => dispatch(s, { type: 'COMBAT_ACT', playerId: 'p1', act: 'skill', skillId: 'duelliste_adrenaline' });
  eq(s.players[0].pa, 6);
  assert(use().ok);
  eq(s.players[0].pa, 8, '6 - 1 + 3');
  s.players[0].pa = max - 1;
  assert(use().ok);
  eq(s.players[0].pa, max, 'plafonné');
  assert(endTurn(s).ok);
  eq(s.players[0].pa, 6, 'le gain ne dure pas au-delà du tour');
});
test('plafond : jamais plus de maxPa PA par tour, même en empilant tous les bonus', () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.skills.push({ id: 'berserker_absurde', name: 'Absurde', type: 'passive', innate: true, level: 1, cost: 0, modifiers: [{ stat: 'pa', flat: 20 }] });
  const c = buildContent(raw);
  const s = createTraining(c, [{ classId: 'berserker', level: 1 }], { seed: 7 });
  eq(computeStats(s, s.players[0]).pa, c.rules.combat.maxPa);
  eq(s.players[0].pa, c.rules.combat.maxPa, 'PA du premier tour');
});

console.log('\n● Combat : D20 par compétence');
test('chaque compétence a son profil de dé (échec critique / critique)', () => {
  const s = training([{ classId: 'berserker', level: 1 }, { classId: 'duelliste', level: 1 }]);
  const [b, d] = s.players;
  const colere = resolveDice(s, b, skillOf(s, 'berserker_colere'));
  eq([colere.fumble, colere.crit], [15, 20]);
  const fente = resolveDice(s, d, skillOf(s, 'duelliste_fente'));
  eq(fente.fumble, 0, 'jamais d\'échec critique');
  const estoc = resolveDice(s, d, skillOf(s, 'duelliste_estoc'));
  eq([estoc.fumble, estoc.crit], [1, 18]);
  assert(!resolveDice(s, b, skillOf(s, 'berserker_provocation')).has, 'pas de dé pour une compétence sans dégâts');
});
test('la Colère rate ~75 % du temps (15 ou moins), touche ~20 %, critique ~5 %', () => {
  const s = training([{ classId: 'berserker', level: 1 }]);
  const p = s.players[0];
  const sk = skillOf(s, 'berserker_colere');
  const n = { fumble: 0, hit: 0, crit: 0 };
  for (let i = 0; i < 4000; i++) { p.pa = 99; p.cooldowns = {}; n[castSkill(s, p, sk, 'm1').outcome]++; }
  assert(Math.abs(n.fumble / 4000 - 0.75) < 0.04 && Math.abs(n.hit / 4000 - 0.2) < 0.04 && Math.abs(n.crit / 4000 - 0.05) < 0.03, JSON.stringify(n));
});
test('un échec critique ne fait rien par défaut ; "endTurn" fait perdre le tour', () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.skills.push({ id: 'test_raté', name: 'Toujours raté', type: 'active', level: 1, cost: 0, innate: true, pa: 1, target: 'enemy', range: 'melee', dice: { fumble: 20, crit: 21, onFumble: 'miss' }, effects: [{ type: 'damage', power: 5 }] });
  raw.classes.classes.berserker.skills.push({ id: 'test_raté_fin', name: 'Raté et fin', type: 'active', level: 1, cost: 0, innate: true, pa: 1, target: 'enemy', range: 'melee', dice: { fumble: 20, crit: 21, onFumble: 'endTurn' }, effects: [{ type: 'damage', power: 5 }] });
  const c = buildContent(raw);
  const s = createTraining(c, [{ classId: 'berserker', level: 1 }, { classId: 'duelliste', level: 1 }], { seed: 3 });
  takeTurnOf(s, 'p1');
  const hpBefore = s.combat.monsters[0].hp;
  assert(cast(s, 'p1', 'test_raté', 'm1').ok);
  eq(s.combat.monsters[0].hp, hpBefore, 'aucun dégât');
  eq(s.pending.actor, 'p1', "le tour continue");
  assert(cast(s, 'p1', 'test_raté_fin', 'm1').ok);
  assert(s.pending.actor !== 'p1' || s.combat.round > 1, 'le tour est perdu');
});
test('les passifs décalent les seuils du dé (Maître d\'armes : crit -2, échec -1)', () => {
  const s = training([{ classId: 'duelliste', level: 8 }]);
  const d = s.players[0];
  const estoc = resolveDice(s, d, skillOf(s, 'duelliste_estoc'));
  eq([estoc.fumble, estoc.crit], [0, 16]);
});

console.log('\n● Combat : boucliers, PV manquants, soins sur la durée, réactions');
test("les boucliers absorbent AVANT les PV et ne comptent PAS comme des PV (exemple : 10 PV + 5 de bouclier, coup de 11)", () => {
  const s = training([{ classId: 'berserker', level: 1 }]);
  const p = s.players[0];
  p.hp = 10;
  const bonusNu = computeStats(s, p).damage;
  addShield(s, p, 5, 2, null);
  eq(totalShield(p), 5);
  eq(computeStats(s, p).damage, bonusNu, 'le bouclier ne change pas le bonus de PV manquants');
  const real = applyDamage(s, p, 11, null, { ignoreGuard: true });
  eq([p.hp, totalShield(p), real], [4, 0, 6], 'bouclier consommé en premier, il reste 4 PV');
  assert(p.alive);
});
test('un bouclier est plafonné aux PV max et expire avec le temps', () => {
  const s = training([{ classId: 'berserker', level: 1 }]);
  const p = s.players[0];
  addShield(s, p, 9999, 1, null);
  eq(totalShield(p), computeStats(s, p).hpMax);
  takeTurnOf(s, 'p1');
  for (let i = 0; i < 3; i++) endTurn(s);
  eq(totalShield(p), 0, 'expiré');
});
test('le Berserker frappe plus fort quand il est blessé et régénère à chaque tour', () => {
  const s = training([{ classId: 'berserker', level: 1 }]);
  const p = s.players[0];
  const full = computeStats(s, p).damage;
  p.hp = Math.round(computeStats(s, p).hpMax / 2);
  const half = computeStats(s, p).damage;
  p.hp = 5;
  const low = computeStats(s, p).damage;
  assert(full < half && half < low, `${full} < ${half} < ${low}`);
  p.hp = 20;
  const hp0 = p.hp;
  takeTurnOf(s, 'p1');
  endTurn(s);
  takeTurnOf(s, 'p1');
  assert(p.hp > hp0, 'régénération au début du tour');
});
test('un soin sur la durée (Rosée) soigne à chaque tour de sa cible, pendant 4 tours', () => {
  const s = training([{ classId: 'druide_ancien', level: 1 }, { classId: 'duelliste', level: 1 }]);
  const duel = s.players[1];
  duel.hp = 5;
  takeTurnOf(s, 'p1');
  assert(cast(s, 'p1', 'druide_rosee', 'p2').ok);
  assert(duel.statuses.some((st) => st.id === 'hot'), 'statut posé');
  let ticks = 0, last = duel.hp;
  for (let i = 0; i < 40 && ticks < 4; i++) {
    endTurn(s);
    if (duel.hp > last) { ticks++; last = duel.hp; }
    duel.hp = Math.min(duel.hp, 5 + ticks); // on évite que la barre ne soit pleine
    last = duel.hp;
  }
  assert(ticks >= 3, `soins reçus : ${ticks}`);
});
test('"Lumière vivante" : chaque coup du Veilleur soigne l\'allié le plus blessé', () => {
  const s = training([{ classId: 'veilleur', level: 1 }, { classId: 'duelliste', level: 1 }]);
  s.players[1].hp = 10;
  takeTurnOf(s, 'p1');
  assert(cast(s, 'p1', 'veilleur_rayon', 'm1').ok);
  assert(s.players[1].hp > 10, `PV du duelliste : ${s.players[1].hp}`);
});
test('"Dernier souffle" : une fois par combat, un coup mortel laisse 1 PV', () => {
  const s = training([{ classId: 'berserker', level: 4 }]);
  const p = s.players[0];
  dealDamage(s, null, p, 9999, { ignoreGuard: true });
  assert(p.alive && p.hp === 1, `PV ${p.hp}`);
  assert(p.statuses.some((st) => st.id === 'mod' && st.stat === 'damage'), 'bonus de dégâts');
  dealDamage(s, null, p, 9999, { ignoreGuard: true });
  assert(!p.alive, 'la deuxième fois, il meurt');
});
test('le soigneur peut ressusciter (une fois par donjon, avec un coût partagé)', () => {
  const party = makeParty(content, ['berserker', 'veilleur'], 4, 'none');
  party[1].skills = ['veilleur_rayon', 'veilleur_soin', 'veilleur_benediction', 'veilleur_resurrection'];
  party[1].deck = ['veilleur_soin', 'veilleur_benediction', 'veilleur_resurrection']; // le deck : seuls les sorts équipés se lancent
  const s = createRun(content, { tranche: 4, mode: 'tranche' }, party, 3);
  const [tank, healer] = s.players;
  tank.alive = false; tank.ghost = true; tank.hp = 0;
  const maxBefore = computeStats(s, healer).hpMax;
  const r = dispatch(s, { type: 'USE_SKILL', playerId: 'p2', skillId: 'veilleur_resurrection', targetId: 'p1' });
  assert(r.ok, r.error);
  assert(tank.alive && tank.hp > 0 && tank.hp < computeStats(s, tank).hpMax * 0.4, 'peu de PV');
  assert(computeStats(s, healer).hpMax < maxBefore, 'le soigneur paie aussi');
  s.players[0].alive = false; s.players[0].ghost = true; s.players[0].hp = 0;
  const r2 = dispatch(s, { type: 'USE_SKILL', playerId: 'p2', skillId: 'veilleur_resurrection', targetId: 'p1' });
  assert(!r2.ok, 'une seule fois par donjon / par joueur');
});

console.log('\n● Mort, fantôme et résurrection');
test('un niveau 1 en tranche 8 meurt vite, devient fantôme, sans casser la partie', () => {
  let sawGhost = false;
  for (let seed = 1; seed < 15; seed++) {
    const s = createRun(content, { tranche: 8, mode: 'tranche' }, makeParty(content, A, 1, 'none', seed), seed);
    const rand = makeRand(seed);
    let n = 0;
    while (s.phase !== 'ended') {
      const r = dispatch(s, chooseAction(s, rand));
      assert(r.ok, r.error);
      checkInvariants(s);
      if (s.players.some((p) => p.ghost)) sawGhost = true;
      if (++n > 1500) throw new Error('bloqué');
    }
    assert(s.result.outcome === 'defeat', 'défaite attendue');
    assert(s.turn <= 6, 'mort rapide : ' + s.turn + ' tours');
  }
  assert(sawGhost, 'au moins un fantôme');
});
test('un fantôme peut aider (jet de dé, bonus au prochain jet, révéler la case)', () => {
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, A, 1, 'none'), 3);
  const g = s.players[2];
  g.alive = false; g.ghost = true; g.hp = 0;
  let boosted = 0, lit = 0;
  for (let i = 0; i < 40; i++) {
    const c = cloneState(s);
    c.rng += i * 97;
    assert(dispatch(c, { type: 'GHOST', playerId: 'p3', mode: 'bless' }).ok);
    if (c.bonus.rollMod > 0) boosted++;
    assert(!dispatch(c, { type: 'GHOST', playerId: 'p3', mode: 'bless' }).ok, 'une seule fois par tour');
    const d = cloneState(s);
    d.rng += i * 31;
    dispatch(d, { type: 'GHOST', playerId: 'p3', mode: 'light' });
    if (d.dungeon.board[0].revealed) lit++;
  }
  assert(boosted > 10 && boosted < 40, 'bonus ' + boosted);
  assert(lit > 10, 'case révélée ' + lit);
  assert(!dispatch(s, { type: 'GHOST', playerId: 'p1', mode: 'bless' }).ok, 'les vivants ne sont pas des fantômes');
});
test('une seule résurrection par joueur et par run', () => {
  const s = createRun(content, { tranche: 1, mode: 'basic' }, makeParty(content, A, 5, 'none'), 3);
  const t = s.players[0];
  t.alive = false; t.ghost = true; t.hp = 0;
  assert(canBeRevived(t));
  reviveUnit(s, t, 0.3, 0.1);
  assert(t.alive && t.hp >= 1 && t.hpMaxPenalty === 0.1);
  t.alive = false; t.ghost = true; t.hp = 0;
  assert(!canBeRevived(t), 'ne peut plus être ressuscité');
});
test('les malus de résurrection disparaissent à la fin de la run (personnage inchangé)', () => {
  const chars = makeParty(content, ['berserker', 'veilleur'], 4, 'none');
  chars[1].skills = ['veilleur_rayon', 'veilleur_soin', 'veilleur_benediction', 'veilleur_resurrection'];
  const before = JSON.stringify(chars);
  const s = createRun(content, { tranche: 4, mode: 'tranche' }, chars, 3);
  s.players[0].alive = false; s.players[0].ghost = true; s.players[0].hp = 0;
  dispatch(s, { type: 'USE_SKILL', playerId: 'p2', skillId: 'veilleur_resurrection', targetId: 'p1' });
  dispatch(s, { type: 'ABANDON' });
  eq(JSON.stringify(chars), before);
});

console.log('\n● Déroulement');
test('le joueur sous les projecteurs change à chaque tour', () => {
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, A, 1, 'good'), 21);
  const seen = new Set();
  const rand = makeRand(21);
  while (s.phase !== 'ended' && seen.size < 3) {
    if (s.pending.kind === 'advance') seen.add(s.pending.actor);
    dispatch(s, chooseAction(s, rand));
  }
  assert(seen.size === 3, 'les 3 joueurs ont eu leur tour');
});
test('le plateau finit toujours par un boss et respecte les contraintes', () => {
  for (let seed = 0; seed < 100; seed++) {
    for (const tr of [1, 4, 8]) {
      const size = 1 + (seed % 4);
      const s = createRun(content, { tranche: tr, mode: 'tranche' }, makeParty(content, ['berserker', 'veilleur', 'druide_ancien', 'duelliste'].slice(0, size), 1, 'none'), seed);
      const b = s.dungeon.board;
      assert(b.length === content.tranches[tr].boardLength && b[b.length - 1].type === 'boss');
      assert(b.filter((t) => t.type === 'boss').length === 1);
      assert(b.filter((t) => t.type === 'life_fountain').length <= 1);
      assert(b.filter((t) => t.type === 'combat').length >= 4);
      assert(b.some((t) => t.type === 'treasure'));
      assert(b[0].type !== 'combat');
      for (let i = 2; i < b.length; i++) assert(!(b[i].type === 'combat' && b[i - 1].type === 'combat' && b[i - 2].type === 'combat'), '3 combats de suite');
    }
  }
});
test('une partie sauvegardée en JSON (même en plein combat) se reprend exactement pareil', () => {
  const a = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, A, 1, 'decent'), 77);
  const ra = makeRand(5);
  let n = 0;
  while (!a.combat && n++ < 80) dispatch(a, chooseAction(a, ra));
  assert(a.combat, 'on est en plein combat');
  const b = restoreState(content, JSON.stringify(a));
  const rb = makeRand(5);
  for (let i = 0; i < n; i++) nextFloat({ rng: 1 }); // (le robot b repart du même état que ra)
  const ra2 = makeRand(99), rb2 = makeRand(99);
  for (let i = 0; i < 300 && a.phase !== 'ended'; i++) {
    dispatch(a, chooseAction(a, ra2));
    dispatch(b, chooseAction(b, rb2));
  }
  eq(JSON.stringify(a), JSON.stringify(b));
});
test('même graine = même partie', () => {
  const run = () => playRun(content, { tranche: 4, mode: 'tranche' }, makeParty(content, A, 4, 'decent', 9), 1234).state;
  eq(JSON.stringify(run().log), JSON.stringify(run().log));
});
test("une partie sauvegardée avec l'ancien format est refusée proprement", () => {
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, A, 1, 'none'), 5);
  const old = JSON.parse(JSON.stringify(s));
  old.version = 1;
  let msg = '';
  try { restoreState(content, old); } catch (e) { msg = e.message; }
  assert(msg.includes('ancienne version'), msg);
});
test('compétences : 1 point par niveau, prérequis, coût selon la tranche, réinitialisation gratuite', () => {
  const ch = createCharacter(content, { id: 'x', name: 'T', classId: 'berserker' });
  eq(skillPointsFree(content, ch), 1);
  assert(!canLearnSkill(content, ch, 'berserker_tourbillon').ok, 'niveau 4 + prérequis');
  assert(learnSkill(content, ch, 'berserker_colere').ok);
  eq(skillPointsFree(content, ch), 0);
  assert(!learnSkill(content, ch, 'berserker_saignee').ok, 'plus de points');
  addXp(content, ch, 80 + 120 + 180); // niveau 4
  eq(ch.level, 4);
  const noReq = canLearnSkill(content, ch, 'berserker_dernier_souffle');
  assert(!noReq.ok && noReq.reason.includes('Requiert'), noReq.reason);
  assert(learnSkill(content, ch, 'berserker_tourbillon').ok);
  resetSkills(content, ch);
  eq(ch.skills.sort(), ['berserker_entaille', 'berserker_provocation', 'berserker_sang_chaud']);
  eq(skillPointsFree(content, ch), 4);
});
test('skillRequirements : la liste des conditions (niveau, prérequis, points, succès) est complète et cohérente avec canLearnSkill', () => {
  const ch = createCharacter(content, { id: 'x', name: 'T', classId: 'berserker' });
  const tour = skillRequirements(content, ch, 'berserker_tourbillon');
  eq(tour.map((r) => r.kind), ['level', 'skill', 'points']);
  eq(tour.map((r) => r.ok), [false, false, false]);
  assert(tour[1].text === 'Colère' && tour[2].need === 2 && tour[2].have === 1, JSON.stringify(tour));
  // tout est rempli <=> canLearnSkill dit oui
  learnSkill(content, ch, 'berserker_colere');
  addXp(content, ch, 80 + 120 + 180); // niveau 4 : 4 points, 1 dépensé
  const ok = skillRequirements(content, ch, 'berserker_tourbillon');
  assert(ok.every((r) => r.ok), JSON.stringify(ok));
  assert(canLearnSkill(content, ch, 'berserker_tourbillon').ok);
  // un succès fait partie des conditions (Cantique de hâte du Prêtre)
  const heal = createCharacter(content, { id: 'y', name: 'V', classId: 'pretre' });
  const hate = skillRequirements(content, heal, 'pretre_cantique');
  assert(hate.some((r) => r.kind === 'achievement' && !r.ok), JSON.stringify(hate));
  // compétence d'une autre classe ou inconnue : liste vide
  eq(skillRequirements(content, ch, 'veilleur_soin'), []);
  eq(skillRequirements(content, ch, 'nexistepas'), []);
});
test("'branches' (phrase par branche) : une branche inconnue est refusée avec un message clair", () => {
  assert(content.classes.berserker.branches.Fureur.desc.length > 10, 'phrase de branche manquante');
  const raw = loadRaw();
  raw.classes.classes.berserker.branches.Magie = { desc: 'Une branche qui n\'existe pas.' };
  let msg = '';
  try { buildContent(raw); } catch (e) { msg = e.message; }
  assert(msg.includes('Magie') && msg.includes('berserker'), 'message: ' + msg);
});
test('chaque passif de classe a une icône écrite dans le JSON (les actives la déduisent de leur effet)', () => {
  for (const cls of Object.values(content.classes)) {
    for (const sk of cls.skills) if (sk.type === 'passive') assert(!!sk.icon, `${sk.id} : "icon" manquant`);
  }
});
test('montée de niveau : plusieurs niveaux d\'un coup, plafond de niveau (levelCap), XP perdue au plafond', () => {
  const ch = createCharacter(content, { id: 'x', name: 'T', classId: 'berserker' });
  const gained = addXp(content, ch, 100000);
  eq(content.rules.levelCap, 8);
  eq(ch.level, 8);
  eq(gained, 7);
  eq(ch.xp, 0, "au plafond, l'XP en trop est perdue (pas de réserve)");
  eq(xpForNext(content, 8), null);
  eq(addXp(content, ch, 500), 0);
  eq(ch.xp, 0);
});
test('relever levelCap rouvre la montée, jusqu\'à maxLevel seulement', () => {
  const open = { ...content, rules: { ...content.rules, levelCap: 12 } };
  const ch = createCharacter(open, { id: 'x', name: 'T', classId: 'berserker' });
  eq(addXp(open, ch, 100000), 11);
  eq(ch.level, 12);
  const huge = { ...content, rules: { ...content.rules, levelCap: 99 } };
  const c2 = createCharacter(huge, { id: 'y', name: 'U', classId: 'berserker' });
  addXp(huge, c2, 1e9);
  eq(c2.level, huge.rules.maxLevel, 'jamais au-delà de maxLevel');
});

console.log('\n● Salle d\'entraînement');
test("les mannequins ne meurent jamais, et la salle se réinitialise", () => {
  const s = training([{ classId: 'duelliste', level: 4 }]);
  const m = s.combat.monsters[0];
  dealDamage(s, s.players[0], m, 1e9, {});
  assert(m.alive && m.hp >= 1, 'mannequin immortel');
  s.players[0].hp = 3;
  assert(dispatch(s, { type: 'TRAINING_RESET' }).ok);
  eq(s.players[0].hp, computeStats(s, s.players[0]).hpMax);
  assert(s.combat && s.combat.monsters[0].hp === s.combat.monsters[0].hpMax);
  assert(dispatch(s, { type: 'END_TRAINING' }).ok && s.phase === 'ended');
});

console.log('\n● Zone de farm solo (vagues, récompenses restreintes, coffre)');
/** Un personnage de test : Berserker niveau 4 sans équipement. */
const farmHero = (classId = 'berserker', level = 4, seed = 3) => makeParty(content, [classId], level, 'none', seed)[0];
/** Gagne la vague en cours : les monstres n'ont plus qu'1 PV, le héros est remis en forme à chaque coup. */
function winWave(s) {
  for (let guard = 0; s.pending?.kind === 'combat' && guard < 300; guard++) {
    const p = s.players[0];
    for (const m of s.combat.monsters) m.hp = Math.min(m.hp, 1);
    p.hp = computeStats(s, p).hpMax;
    const basic = content.classes[p.classId].basicAttack;
    const view = getCombatView(s, p.id);
    const sk = view.skills.find((x) => x.skillId === basic);
    if (sk.usable) cast(s, p.id, basic, sk.targets[0]);
    else endTurn(s);
  }
  assert(s.pending?.kind === 'farm' || s.phase === 'ended', 'la vague devrait être gagnée');
}
test('une session de farm démarre directement sur la vague 1, en solo, sans aucune restriction de niveau', () => {
  const s = createFarm(content, farmHero(), { seed: 5 });
  eq([s.players.length, s.farm.wave, s.farm.zoneId, s.phase], [1, 1, 'terriers', 'combat']);
  eq(s.pending.kind, 'combat');
  eq(s.setup.restrict, false);
  eq(s.players[0].effLevel, s.players[0].realLevel);
  eq(s.combat.monsters.length, 1);
});
test('après une vague : éclats (et XP de rattrapage), petit soin, choix suivante / s\'arrêter', () => {
  const s = createFarm(content, farmHero(), { seed: 5, xpCap: 6 });
  s.players[0].hp = 10;
  winWave(s);
  eq([s.pending.kind, s.phase, s.farm.cleared, s.combat, s.farm.shards], ['farm', 'farm', 1, null, 1]);
  assert(s.farm.xp > 0, 'XP de rattrapage gagnée');
  assert(s.players[0].hp > 10, 'petit soin entre deux vagues');
  assert(!dispatch(s, { type: 'ADVANCE' }).ok, "les actions de donjon n'existent pas en farm");
  assert(dispatch(s, { type: 'FARM_NEXT' }).ok);
  eq([s.farm.wave, s.pending.kind], [2, 'combat']);
});
test('les vagues montent en difficulté (plus de monstres, plus forts) et la 5e est le boss de la zone', () => {
  const zone = content.farm.zones.terriers;
  eq(waveInfo(zone, 1).count, 1);
  eq(waveInfo(zone, 4).count, 2);
  eq(waveInfo(zone, 7).count, 3);
  eq(waveInfo(zone, 19).count, 3, 'plafonné');
  assert(waveInfo(zone, 3).hpMult < waveInfo(zone, 9).hpMult && waveInfo(zone, 3).atkMult < waveInfo(zone, 9).atkMult);
  assert(waveInfo(zone, 5).boss && !waveInfo(zone, 4).boss);
  const s = createFarm(content, farmHero(), { seed: 5 });
  for (let i = 1; i < 4; i++) { winWave(s); dispatch(s, { type: 'FARM_NEXT' }); }
  eq([s.farm.wave, s.combat.monsters.length], [4, 2], 'vague 4 : deux monstres');
  winWave(s);
  dispatch(s, { type: 'FARM_NEXT' });
  eq([s.farm.wave, s.combat.monsters[0].defId, s.combat.boss], [5, 'roi_des_rats', true], 'vague 5 : le boss');
  const m1 = createFarm(content, farmHero(), { seed: 5 }).combat.monsters[0];
  assert(s.combat.monsters[0].hpMax > m1.hpMax, 'le boss est bien plus costaud');
});
test("la récompense du farm : 3 objets DIFFÉRENTS, niveau 1, jamais d'épique ni d'exclusif ; meilleure quand on tient plus de vagues", () => {
  const s = createFarm(content, farmHero(), { seed: 9 });
  const zone = content.farm.zones.terriers;
  eq(rollChoices(s, zone, 0), [], 'aucune vague vaincue : rien');
  eq(choiceTier(zone, 4), zone.rewards.choiceTiers[0]);
  eq(choiceTier(zone, 5), zone.rewards.choiceTiers[1]);
  const avg = (waves) => {
    let t = 0;
    for (let i = 0; i < 300; i++) {
      const list = rollChoices(s, zone, waves);
      eq(list.length, 3);
      eq(new Set(list.map((it) => it.id)).size, 3, 'trois objets différents');
      for (const it of list) {
        const d = content.items[it.id];
        assert(d.level <= 1 && !d.consumable && !content.itemDungeon[it.id] && ['common', 'uncommon', 'rare'].includes(d.rarity), `${it.id}`);
        t += content.rarityIndex[d.rarity];
      }
    }
    return t;
  };
  const a1 = avg(1), a5 = avg(5), a15 = avg(15);
  assert(a1 < a5 && a5 < a15, `rareté moyenne : ${a1} < ${a5} < ${a15}`);
});
test("l'XP du farm ne fait JAMAIS dépasser le niveau plafond (4), et ne rapporte plus rien au-delà", () => {
  const c = createCharacter(content, { id: 'x', name: 'X', classId: 'berserker' });
  const r = addXpCapped(content, c, 100000, 4);
  eq([c.level, c.xp, r.capped], [4, 0, true]);
  eq(addXpCapped(content, c, 500, 4).applied, 0, 'déjà au niveau plafond');
  const d = createCharacter(content, { id: 'y', name: 'Y', classId: 'berserker' });
  const q = addXpCapped(content, d, 30, 4);
  eq([d.level, d.xp, q.capped], [1, 30, false], 'sous le plafond : tout est compté');
  const e = createCharacter(content, { id: 'z', name: 'Z', classId: 'berserker' });
  e.level = 6;
  eq(addXpCapped(content, e, 999, 4).applied, 0, 'un niveau 6 ne gagne rien');
});
test("la MORT ne fait perdre que la vague en cours : éclats et récompense des vagues précédentes sont gardés", () => {
  const ch = farmHero('berserker', 4);
  const s = createFarm(content, ch, { seed: 21 });
  for (let i = 0; i < 3; i++) { winWave(s); dispatch(s, { type: 'FARM_NEXT' }); }
  eq(s.farm.shards, 3, '1 éclat par vague');
  // le héros tombe dans la vague 4
  s.players[0].hp = 1;
  for (let i = 0; i < 40 && s.phase !== 'ended'; i++) endTurn(s);
  eq([s.phase, s.result.outcome, s.result.waves, s.result.diedAtWave, s.result.shards], ['ended', 'defeat', 3, 4, 3]);
  eq(s.result.choices.length, 3, 'la récompense des 3 vagues vaincues');
  applyFarmResult(content, ch, s);
  eq(ch.lootChoice.map((it) => it.uid), s.result.choices.map((it) => it.uid));
  eq(ch.shards, 3);
  eq([ch.stats.farmRuns, ch.stats.farmWaves, ch.stats.farmBest], [1, 3, 3]);
});
test('« M\'arrêter » (FARM_STOP) donne le même bilan, appliqué UNE seule fois ; un boss donne des éclats en plus', () => {
  const ch = farmHero('berserker', 2);
  const s = createFarm(content, ch, { seed: 4, xpCap: 5 });
  winWave(s);
  assert(dispatch(s, { type: 'FARM_STOP' }).ok);
  eq([s.phase, s.result.outcome, s.result.waves], ['ended', 'stop', 1]);
  const xp0 = ch.xp + ch.level * 1000;
  assert(applyFarmResult(content, ch, s) !== null);
  const after = ch.xp + ch.level * 1000;
  assert(after > xp0, 'XP de rattrapage gagnée');
  eq(applyFarmResult(content, ch, s), null, 'jamais deux fois');
  eq(ch.stats.farmRuns, 1);
  assert(!dispatch(s, { type: 'FARM_NEXT' }).ok, 'la session est terminée');
  const b = createFarm(content, farmHero('berserker', 6), { seed: 5 });
  for (let i = 1; i < 5; i++) { winWave(b); dispatch(b, { type: 'FARM_NEXT' }); }
  assert(b.combat.boss);
  winWave(b);
  eq(b.farm.shards, 5 + content.farm.zones.terriers.rewards.bossShards, 'le boss : +4 éclats');
});
test("XP de RATTRAPAGE : seul un héros plus bas que ton meilleur héros en gagne, jusqu'au niveau de celui-ci", () => {
  const top = farmHero('berserker', 6, 1);
  const low = farmHero('berserker', 2, 2);
  top.id = 'top'; low.id = 'low';
  eq(catchUpLevel(content, [top, low], low), 6);
  eq(catchUpLevel(content, [top, low], top), 0, 'le meilleur héros ne rattrape personne');
  eq(catchUpLevel(content, [top], top), 0, 'un héros seul non plus');
  // sans rattrapage : des éclats, pas d'XP
  const s = createFarm(content, top, { seed: 4, xpCap: 0 });
  winWave(s);
  eq(s.farm.xp, 0);
  dispatch(s, { type: 'FARM_STOP' });
  const lv = [top.level, top.xp];
  applyFarmResult(content, top, s);
  eq([top.level, top.xp], lv, 'pas d\'XP pour le meilleur héros');
  // avec rattrapage : jamais au-delà du niveau du meilleur héros
  low.level = 5; low.xp = 0;
  const t = createFarm(content, low, { seed: 4, xpCap: 6 });
  t.farm.xp = 1e6;
  dispatch(t, { type: 'ABANDON' });
  applyFarmResult(content, low, t);
  eq([low.level, low.xp], [6, 0], 'rattrape exactement le niveau 6');
});
test("pas de changement d'équipement pendant une session de farm", () => {
  const ch = farmHero();
  ch.inventory.push({ uid: 'w1', id: 'gourdin_cabosse' });
  const s = createFarm(content, ch, { seed: 5 });
  winWave(s);
  const r = dispatch(s, { type: 'EQUIP', playerId: 'p1', uid: 'w1' });
  assert(!r.ok && r.error.includes('farm'), r.error);
});
test("une récompense pas encore choisie bloque la session suivante ; l'ancien coffre passe dans le sac", () => {
  const ch = farmHero();
  ch.lootChoice = [{ uid: 'c1', id: 'piece_percee' }];
  let msg = '';
  try { createFarm(content, ch, { seed: 5 }); } catch (e) { msg = e.message; }
  assert(msg.includes('récompense'), msg);
  const old = JSON.parse(JSON.stringify(farmHero()));
  old.chest = [{ uid: 'a', id: 'piece_percee' }, { uid: 'b', id: 'dague_os' }];
  const back = sanitizeCharacter(content, old);
  assert(['a', 'b'].every((u) => back.inventory.some((i) => i.uid === u)) && !('chest' in back), 'le coffre est vidé dans le sac');
});
test('les potions bues en farm disparaissent de l\'inventaire du personnage (et rien d\'autre ne change)', () => {
  const ch = farmHero('berserker', 4);
  ch.inventory.push({ uid: 'pot1', id: 'potion_mineure' }, { uid: 'sword1', id: 'dague_os' });
  const s = createFarm(content, ch, { seed: 5 });
  winWave(s);
  s.players[0].hp = 5;
  assert(dispatch(s, { type: 'USE_ITEM', playerId: 'p1', uid: 'pot1', targetId: 'p1' }).ok);
  assert(dispatch(s, { type: 'FARM_STOP' }).ok);
  applyFarmResult(content, ch, s);
  eq(ch.inventory.map((i) => i.uid), ['sword1']);
});
test("un soigneur peut se soigner entre deux vagues avec ses compétences de soin", () => {
  const s = createFarm(content, farmHero('veilleur', 4), { seed: 5 });
  winWave(s);
  s.players[0].hp = 5;
  const r = dispatch(s, { type: 'USE_SKILL', playerId: 'p1', skillId: 'veilleur_soin', targetId: 'p1' });
  assert(r.ok, r.error);
  assert(s.players[0].hp > 5, 'soin appliqué');
});
test('une session de farm sauvegardée en JSON en plein milieu se reprend exactement pareil', () => {
  const s = createFarm(content, farmHero(), { seed: 33 });
  winWave(s);
  dispatch(s, { type: 'FARM_NEXT' });
  const copy = restoreState(content, JSON.stringify(s));
  eq(copy.farm, s.farm);
  const playTo = (st) => { for (let i = 0; i < 12 && st.phase !== 'ended'; i++) { if (st.pending.kind === 'combat') { winWave(st); } else dispatch(st, { type: 'FARM_NEXT' }); } return JSON.stringify([st.farm, st.log.length]); };
  eq(playTo(copy), playTo(s));
});
test('des centaines de sessions de farm robotisées ne cassent rien (cohérence, fin garantie)', () => {
  for (let i = 0; i < 60; i++) {
    const cls = ['berserker', 'veilleur', 'druide_ancien', 'duelliste'][i % 4];
    const { state } = playFarm(content, farmHero(cls, 1 + (i % 5), i + 1), 100 + i * 31, undefined, { stopBelow: 0.3 + (i % 3) * 0.2 });
    assert(state.phase === 'ended' && state.result.farm);
    assert(state.result.choices.every((it) => ['common', 'uncommon', 'rare'].includes(content.items[it.id].rarity)), 'raretés restreintes');
  }
});
test('une faute dans farm.json est expliquée (rareté sans objet, zone sans monstre)', () => {
  const raw = loadRaw();
  raw.farm.zones.terriers.rewards.itemMaxLevel = 0;
  let msg = '';
  try { buildContent(raw); } catch (e) { msg = e.message; }
  assert(msg.includes('terriers') && msg.includes('aucun objet'), msg);
  const raw2 = loadRaw();
  raw2.farm.zones.terriers.monsterPool.push('dragon_inconnu');
  try { buildContent(raw2); msg = ''; } catch (e) { msg = e.message; }
  assert(msg.includes('dragon_inconnu'), msg);
});

console.log('\n● Succès (par personnage) et compétences verrouillées');
test("un succès de farm se débloque quand sa condition est remplie, une seule fois, avec son titre", () => {
  const ch = farmHero('duelliste', 1);
  eq(checkAchievements(content, ch).map((a) => a.id), []);
  ch.stats.farmBest = 3;
  const fresh = checkAchievements(content, ch);
  eq(fresh.map((a) => a.id), ['premier_sang']);
  eq(titlesOf(content, ch), ['Chasseur de rats']);
  eq(checkAchievements(content, ch), [], 'jamais deux fois');
});
test("le niveau d'équipement est la somme des niveaux des objets portés, et 36 débloque les grandes expéditions", () => {
  const ch = farmHero('duelliste', 4);
  eq(gearLevel(content, ch), 0);
  // un objet de tranche 4 dans chacun de 8 emplacements : 32, pas assez
  const piece = (slot) => content.itemList.find((i) => i.level === 4 && slotsFor(i).includes(slot) && !i.twoHanded && i.slot !== 'relic').id;
  const slots8 = ['head', 'neck', 'shoulders', 'back', 'chest', 'hands', 'belt', 'legs'];
  slots8.forEach((slot, i) => { ch.equipment[slot] = { uid: `u${i}`, id: piece(slot) }; });
  eq(gearLevel(content, ch), 32);
  assert(!hasFeature(content, ch, 'grandesExpeditions'));
  assert(!checkAchievements(content, ch).some((a) => a.id === 'equipe_pour_la_gloire'), 'pas encore');
  ch.equipment.feet = { uid: 'u9', id: piece('feet') }; // le neuvième : 36
  eq(gearLevel(content, ch), 36);
  const fresh = checkAchievements(content, ch);
  assert(fresh.some((a) => a.id === 'equipe_pour_la_gloire'));
  assert(hasFeature(content, ch, 'grandesExpeditions'), 'fonction débloquée');
  const p = achievementProgress(content, farmHero('duelliste', 4), content.achievements.equipe_pour_la_gloire);
  eq([p.current, p.target, p.done], [0, 36, false]);
});
test("finir le donjon de la tranche 1 EN GROUPE débloque une compétence pour le Prêtre seulement", () => {
  const mk = (id, classId) => { const c = createCharacter(content, { id, name: id, classId }); c.level = 4; return c; };
  const heal = mk('h1', 'pretre');
  const tank = mk('t1', 'sacrieur');
  const pre = canLearnSkill(content, heal, 'pretre_cantique');
  assert(!pre.ok, 'au départ la compétence est verrouillée');
  eq(pre.reason.includes('Succès requis'), true, pre.reason);
  assert(!content.achievementList.find((a) => a.id === 'main_tendue').classes.includes('sacrieur'));
  // Un donjon gagné en SOLO ne suffit pas...
  const solo = createRun(content, { tranche: 1, mode: 'tranche' }, [heal], 1);
  solo.phase = 'ended';
  solo.result = { won: true, outcome: 'victory', applied: false, players: [{ charId: heal.id, playerId: 'p1', xp: { total: 0 } }] };
  applyRunResult(content, [heal], solo);
  eq(heal.stats.clears['1'], { total: 1, group: 0 });
  eq(checkAchievements(content, heal).map((a) => a.id).includes('main_tendue'), false);
  // ... en groupe, si.
  const team = createRun(content, { tranche: 1, mode: 'tranche' }, [heal, tank], 1);
  team.phase = 'ended';
  team.result = { won: true, outcome: 'victory', applied: false, players: [{ charId: heal.id, playerId: 'p1', xp: { total: 0 } }] };
  applyRunResult(content, [heal], team);
  eq(heal.stats.clears['1'], { total: 2, group: 1 });
  assert(checkAchievements(content, heal).some((a) => a.id === 'main_tendue'));
  assert(canLearnSkill(content, heal, 'pretre_cantique').ok, 'compétence débloquée');
  assert(learnSkill(content, heal, 'pretre_cantique').ok);
  // le succès ne concerne pas les autres classes
  assert(!checkAchievements(content, tank).some((a) => a.id === 'main_tendue'));
  tank.stats.clears['1'] = { total: 5, group: 5 };
  assert(!checkAchievements(content, tank).some((a) => a.id === 'main_tendue'), 'le Sacrieur ne reçoit pas ce succès');
});
test("la réinitialisation des compétences ne reverrouille pas un succès déjà gagné", () => {
  const ch = createCharacter(content, { id: 'v', name: 'V', classId: 'pretre' });
  ch.level = 4;
  assert(!canLearnSkill(content, ch, 'pretre_cantique').ok, 'verrouillée au départ');
  ch.achievements.main_tendue = true;
  assert(learnSkill(content, ch, 'pretre_cantique').ok);
  resetSkills(content, ch);
  assert(!ch.skills.includes('pretre_cantique'), 'oubliée');
  assert(canLearnSkill(content, ch, 'pretre_cantique').ok, 'on peut la réapprendre : le succès reste acquis');
});
test("l'Atelier de classes connaît TOUTES les compétences, même verrouillées par un succès", () => {
  const s = training([{ classId: 'pretre', level: 4 }]);
  assert(s.players[0].skills.includes('pretre_cantique'));
});
test('une faute dans achievements.json est expliquée (condition inconnue, double déblocage, mauvaise classe)', () => {
  const run = (mutate) => { const raw = loadRaw(); mutate(raw); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
  let msg = run((raw) => { raw.achievements.achievements[0].condition.type = 'tuerUnDragon'; });
  assert(msg.includes('tuerUnDragon') && msg.includes('farmBestWave'), msg);
  msg = run((raw) => { raw.achievements.achievements.push({ id: 'doublon', name: 'Doublon', condition: { type: 'reachLevel', atLeast: 2 }, rewards: [{ type: 'skill', skillId: 'pretre_cantique' }] }); });
  assert(msg.includes('pretre_cantique') && msg.includes('deux succès'), msg);
  msg = run((raw) => { raw.achievements.achievements[3].rewards[0].skillId = 'duelliste_estoc'; });
  assert(msg.includes('duelliste_estoc') && msg.includes('classes'), msg);
  msg = run((raw) => { raw.achievements.achievements[4].rewards[0].feature = 'volerEnPlusDuVent'; });
  assert(msg.includes('volerEnPlusDuVent') && msg.includes('grandesExpeditions'), msg);
});

console.log('\n● Sauvegarde (localStorage + code d\'export)');
test('fermer/rouvrir retrouve personnages et équipement', () => {
  const backend = new Map();
  const fake = { getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => backend.set(k, v), removeItem: (k) => backend.delete(k) };
  const p = createEmptyProfile();
  const ch = addCharacter(content, p, { name: 'Zoé', classId: 'veilleur' });
  ch.level = 5; ch.equipment.mainHand = { uid: 'u1', id: 'baton_if' }; ch.inventory.push({ uid: 'u2', id: 'potion_mineure' });
  saveProfile(p, createStore(fake));
  const loaded = loadProfile(content, createStore(fake));
  eq(loaded.characters[0].name, 'Zoé');
  eq(loaded.characters[0].level, 5);
  eq(loaded.characters[0].equipment.mainHand.id, 'baton_if');
  eq(loaded.characters[0].inventory[0].id, 'potion_mineure');
});
test("le code d'export/import redonne les mêmes personnages (accents compris)", () => {
  const p = createEmptyProfile();
  const a = addCharacter(content, p, { name: 'Éloïse ✨', classId: 'berserker' });
  a.inventory.push({ uid: 'q', id: 'epee_veilleur' });
  addCharacter(content, p, { name: 'Bob', classId: 'duelliste' });
  const code = exportCode(p);
  const imported = importCode(content, code);
  eq(imported.length, 2);
  eq(imported[0].name, 'Éloïse ✨');
  eq(imported[0].inventory[0].id, 'epee_veilleur');
  const p2 = createEmptyProfile();
  addImported(p2, imported);
  addImported(p2, importCode(content, code));
  eq(p2.characters.length, 4);
  eq(new Set(p2.characters.map((c) => c.id)).size, 4, 'identifiants uniques');
  eq(importCode(content, exportCode(p, [p.characters[1].id])).length, 1);
});
test('un code abîmé ou faux est refusé avec un message clair', () => {
  const p = createEmptyProfile();
  addCharacter(content, p, { name: 'A', classId: 'berserker' });
  const code = exportCode(p);
  for (const bad of ['', 'bonjour', code.slice(0, -3) + 'zzz', code.replace('.', '.AAAA')]) {
    let msg = '';
    try { importCode(content, bad); } catch (e) { msg = e.message; }
    assert(msg.length > 5, 'devrait échouer: ' + bad.slice(0, 20));
  }
});
test("les données invalides sont réparées et les ANCIENNES classes converties", () => {
  const dirty = { characters: [
    { id: 'z', name: 'Hacker', classId: 'tank', level: 999, xp: -5, skills: ['inconnue', 'tank_peau_pierre', 'veilleur_soin'],
      inventory: [{ uid: '1', id: 'objet_supprime' }, { uid: '2', id: 'hallebarde_fer_noir' }],
      equipment: { weapon: { uid: '3', id: 'hallebarde_fer_noir' }, armor: { uid: '4', id: 'gilet_cuir' } } },
    { classId: 'inconnue' }
  ] };
  const p = sanitizeProfile(content, dirty);
  eq(p.characters.length, 1);
  const c = p.characters[0];
  eq(c.classId, 'sacrieur', "l'ancien « tank » devient Sacrieur");
  eq(c.level, 20);
  eq(c.xp, 0);
  eq(c.skills.sort(), createCharacter(content, { id: 'n', name: 'N', classId: 'sacrieur' }).skills.sort(), 'compétences réinitialisées (seulement celles de départ)');
  // Les classes RETIRÉES du jeu deviennent leur remplaçante (avec le contenu du jeu seul, sans les classes de test)
  const real = loadContent({ legacy: false });
  const conv = (classId) => sanitizeProfile(real, { characters: [{ id: 'a', name: 'A', classId, level: 6, skills: ['berserker_colere', 'veilleur_soin'] }] }).characters[0];
  eq(['berserker', 'veilleur', 'duelliste'].map((k) => conv(k).classId), ['sacrieur', 'pretre', 'assassin']);
  eq(conv('veilleur').level, 6, 'le niveau est gardé');
  assert(conv('veilleur').skills.every((id) => real.skills[id]?.classId === 'pretre'), 'les compétences de l\'ancienne classe disparaissent');
  eq(c.inventory.length, 1);
  eq(c.equipment.chest.id, 'gilet_cuir', "l'ancienne armure va au torse");
  eq(c.equipment.mainHand.id, 'hallebarde_fer_noir', "l'ancienne arme va en main droite");
});
test('la run en cours se sauvegarde et se reprend', () => {
  const store = createStore(null);
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, ['berserker', 'veilleur'], 1, 'none'), 5);
  saveRun(s, store);
  const back = restoreState(content, loadRunText(store));
  eq(JSON.stringify(back), JSON.stringify(s));
  clearRun(store);
  assert(loadRunText(store) === null);
});
test('sans localStorage disponible, le jeu continue en mémoire', () => {
  const store = createStore(null);
  store.set('a', '1');
  eq(store.get('a'), '1');
  assert(!store.persistent);
});

console.log('\n● Joueur absent : l\'autopilote');
/** Une run entière jouée UNIQUEMENT par l'autopilote (c'est ce que le serveur fait quand plus personne ne répond). */
function playAfk(seed, classIds) {
  const chars = classIds.map((classId, i) => createCharacter(content, { id: `c${i}`, name: `H${i}`, classId }));
  const state = createRun(content, { tranche: 1, mode: 'tranche' }, chars, seed);
  let steps = 0;
  const kinds = new Set();
  while (state.phase !== 'ended' && steps++ < 4000) {
    const a = afkAction(state);
    assert(a, `aucune action pour ${JSON.stringify(state.pending)}`);
    kinds.add(state.pending.kind);
    const res = dispatch(state, a);
    assert(res.ok, `refusée : ${res.error} (${JSON.stringify(a)} pour ${state.pending.kind})`);
  }
  return { state, steps, kinds };
}
test('l\'autopilote mène une run complète à sa fin, sans jamais proposer une action refusée', () => {
  const outcomes = {};
  for (let seed = 1; seed <= 40; seed++) {
    const { state, steps } = playAfk(seed, seed % 2 ? ['berserker', 'veilleur', 'duelliste'] : ['druide_ancien', 'duelliste']);
    assert(state.phase === 'ended' && state.result, `la run ${seed} ne finit pas (${steps} étapes)`);
    outcomes[state.result.outcome] = (outcomes[state.result.outcome] || 0) + 1;
  }
  assert(Object.values(outcomes).reduce((a, b) => a + b, 0) === 40, JSON.stringify(outcomes));
});
test('il couvre les attentes d\'une run : avancer, dé, combat, choix', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60 && seen.size < 5; seed++) playAfk(seed, A).kinds.forEach((k) => seen.add(k));
  for (const k of ['advance', 'roll', 'combat', 'choice']) assert(seen.has(k), `jamais rencontré : ${k}`);
});
test('toujours le choix prudent : garder le butin, ne pas boire, rester honnête', () => {
  const pend = (ids) => ({ phase: 'tile', pending: { kind: 'choice', actor: 'p1', options: ids.map((id) => ({ id })) } });
  eq(afkAction(pend(['keep', 'give:p2', 'give:p3'])), { type: 'CHOOSE', option: 'keep' });
  eq(afkAction(pend(['drink', 'skip'])), { type: 'CHOOSE', option: 'skip' });
  eq(afkAction(pend(['blow:steal', 'pass'])), { type: 'CHOOSE', option: 'pass' });
  eq(afkAction(pend(['a', 'b'])), { type: 'CHOOSE', option: 'a' });
});
test('rien à jouer quand la partie est finie ; en combat, le tour se termine', () => {
  assert(afkAction({ phase: 'ended', pending: { kind: 'end' } }) === null && afkAction({ phase: 'advance', pending: null }) === null);
  eq(afkAction({ phase: 'combat', pending: { kind: 'combat', actor: 'p1' } }), { type: 'TIMEOUT' });
  eq(whoMustAct({ phase: 'advance', pending: { kind: 'advance', actor: 'p2' } }), 'p2');
});
test('la « clé de tour » change quand le tour change, pas quand le même joueur enchaîne ses actions', () => {
  const s = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, A), 11);
  const k0 = turnKey(s);
  assert(k0 && k0 === turnKey(s), 'stable tant que rien ne bouge');
  assert(dispatch(s, { type: 'ADVANCE' }).ok);
  assert(turnKey(s) !== k0, 'après avoir avancé, on attend autre chose : nouvelle clé');
  // en combat : plusieurs actions du même joueur = même clé ; le tour suivant = autre clé
  const t = training([{ classId: 'berserker', level: 4 }, { classId: 'veilleur', level: 4 }]);
  const first = turnKey(t);
  const actor = t.pending.actor;
  const basic = content.classes[t.players.find((p) => p.id === actor).classId].basicAttack;
  assert(act(t, actor, { act: 'skill', skillId: basic, targetId: t.combat.monsters[0].id }).ok, 'attaque de base refusée');
  eq(t.pending.actor, actor, 'il lui reste des PA');
  eq(turnKey(t), first, 'même joueur, même tour : même clé');
  assert(endTurn(t).ok, 'fin de tour refusée');
  assert(turnKey(t) !== first, 'autre joueur ou autre round : nouvelle clé');
});

console.log('\n● Animations de combat (le scénario, sans navigateur)');
const FX_DELIVERIES = FX_VOCAB.delivery;
test('chaque compétence du jeu (héros et monstres) a un style complet : geste, couleur, poids', () => {
  const ids = Object.keys(content.skills).filter((id) => content.skills[id].type === 'active');
  assert(ids.length > 30, `peu de compétences (${ids.length})`);
  for (const id of ids) {
    const st = fxStyleOf(content, id, 'beast');
    assert(FX_DELIVERIES.includes(st.delivery), `${id} : geste "${st.delivery}"`);
    assert(FX_VOCAB.element.includes(st.element), `${id} : couleur "${st.element}"`);
    assert([1, 2, 3].includes(st.weight), `${id} : poids ${st.weight}`);
    const dmg = (content.skills[id].effects || []).some((e) => e.type === 'damage');
    if (dmg) assert(st.hit && st.hit !== 'auto', `${id} fait des dégâts mais n'a pas d'impact (hit)`);
    if (st.delivery === 'projectile') assert(!st.shot || FX_VOCAB.shot.includes(st.shot), `${id} : projectile "${st.shot}"`);
  }
});
test("les compétences des quatre classes ont toutes un style écrit à la main (pas seulement déduit)", () => {
  for (const cls of Object.values(content.classes)) {
    for (const sk of cls.skills) if (sk.type === 'active') assert(fxStyleOf(content, sk.id).preset, `${sk.id} n'a pas de style écrit`);
  }
});
test("le geste d'un monstre dépend de son espèce (griffes d'une bête, entaille d'un mort-vivant, coup lourd d'un boss)", () => {
  eq(fxStyleOf(content, 'coup', 'beast').hit, 'claw');
  eq(fxStyleOf(content, 'coup', 'undead').hit, 'slash');
  eq(fxStyleOf(content, 'coup', 'boss').hit, 'smash');
  eq(fxStyleOf(content, 'coup', 'slime').hit, 'splat');
});
test("le champ `fx` d'une compétence (JSON) remplace ce qui est déduit", () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.skills[0].fx = { delivery: 'projectile', element: 'frost', shot: 'arrow', weight: 3 };
  const c2 = buildContent(raw);
  const st = fxStyleOf(c2, c2.classes.berserker.skills[0].id);
  eq([st.delivery, st.element, st.shot, st.weight], ['projectile', 'frost', 'arrow', 3]);
});
test('une faute dans `fx` est expliquée (mot inconnu, valeurs connues listées)', () => {
  const tryFx = (fx) => {
    const raw = loadRaw();
    raw.classes.classes.berserker.skills[0].fx = fx;
    try { buildContent(raw); } catch (e) { return e.message; }
    return '';
  };
  const typo = tryFx({ delivery: 'meele' });
  assert(typo.includes('meele') && typo.includes('melee') && typo.includes('berserker_entaille'), 'message: ' + typo);
  assert(tryFx({ couleur: 'rouge' }).includes('couleur'), 'un champ inconnu est refusé');
  assert(tryFx({ weight: 7 }).includes('weight'), 'un poids hors 1-3 est refusé');
  assert(tryFx('rouge').includes('objet'), "fx doit être un objet");
});

/** Joue des actions de bot et vérifie le scénario de chacune. */
function eachAction(state, steps, fn) {
  const rand = makeRand(5);
  for (let n = 0; n < steps && state.phase !== 'ended'; n++) {
    const action = chooseAction(state, rand, 'smart', {});
    const before = snapshotRun(state);
    const res = dispatch(state, action);
    assert(res.ok, `refusée : ${res.error}`);
    fn({ before, res, state });
  }
}
test("la photo d'avant l'action liste les héros et les monstres avec leurs PV", () => {
  const t = training([{ classId: 'berserker', level: 4 }, { classId: 'veilleur', level: 4 }]);
  const snap = snapshotRun(t);
  eq(snap.combat, true);
  eq(Object.keys(snap.units).length, t.players.length + t.combat.monsters.length);
  for (const p of t.players) assert(snap.units[p.id].hp === p.hp && snap.units[p.id].max >= p.hp && snap.units[p.id].kind === 'player', `héros ${p.id}`);
  for (const m of t.combat.monsters) assert(snap.units[m.id].kind === 'monster' && snap.units[m.id].look, `monstre ${m.id}`);
});
test("une attaque donne UN temps fort : le lanceur, la cible, et des PV avant/après qui se suivent", () => {
  const t = training([{ classId: 'berserker', level: 4 }], { dummy: 'mannequin', count: 1 });
  const me = t.players[0];
  const target = t.combat.monsters[0];
  const basic = content.classes.berserker.basicAttack;
  const before = snapshotRun(t);
  const res = cast(t, me.id, basic, target.id);
  assert(res.ok, 'attaque refusée');
  const beats = planBeats(res.events, before, t, content).filter((b) => b.type === 'cast');
  eq(beats.length, 1);
  eq(beats[0].caster, me.id);
  eq(beats[0].skillId, basic);
  assert(targetsOf(beats[0]).includes(target.id), 'la cible est dans le temps fort');
  const dmg = beats[0].steps.filter((s) => s.type === 'damage' && s.target === target.id);
  if (beats[0].outcome !== 'fumble' && beats[0].outcome !== 'miss') {
    assert(dmg.length >= 1, 'aucun dégât planifié');
    for (const s of dmg) eq(s.before.hp - s.after.hp, s.amount, 'les PV descendent du montant exact');
  }
});
console.log('\n● Bonus et malus : descriptions, durées, annonce à l\'écran');
test('chaque effet que le moteur sait poser est décrit pour le joueur : nom, résumé, phrase, durée, bonus ou malus', () => {
  const samples = [
    { id: 'poison', pct: 0.06, turns: 3 }, { id: 'dot', amount: 5, label: 'saigne', turns: 3 }, { id: 'hot', amount: 6, turns: 2 },
    { id: 'stun', turns: 1 }, { id: 'taunt', turns: 2 }, { id: 'guard', reduction: 0.5, turns: 1 }, { id: 'redirect', turns: 1 },
    { id: 'mod', stat: 'damage', pct: 0.15, turns: 2 }
  ];
  for (const st of samples) {
    const i = statusInfo(st);
    assert(i.name && i.name !== st.id, `${st.id} : un vrai nom (${i.name})`);
    assert(i.short && i.desc && i.icon, `${st.id} : résumé, phrase et icône`);
    assert(['buff', 'debuff'].includes(i.tone), `${st.id} : bonus ou malus`);
    eq(i.turns, st.turns, `${st.id} : la durée`);
  }
  eq(statusInfo({ id: 'poison', pct: 0.06, turns: 3 }).tone, 'debuff');
  eq(statusInfo({ id: 'stun', turns: 1 }).tone, 'debuff');
  eq(statusInfo({ id: 'hot', amount: 6, turns: 2 }).tone, 'buff');
  assert(statusInfo({ id: 'poison', pct: 0.06, turns: 3 }).desc.includes('6 %'), 'la phrase donne les chiffres');
  assert(statusInfo({ id: 'dot', amount: 5, turns: 3 }).desc.includes('5 PV'), 'saignement : les PV perdus');
  // bonus ou malus d'une stat : le sens dépend de la stat (moins de dégâts reçus est un BONUS)
  eq(statusInfo({ id: 'mod', stat: 'damage', pct: 0.15, turns: 2 }).tone, 'buff');
  eq(statusInfo({ id: 'mod', stat: 'damage', pct: -0.15, turns: 2 }).tone, 'debuff');
  eq(statusInfo({ id: 'mod', stat: 'taken', pct: -0.15, turns: 2 }).tone, 'buff', 'moins de dégâts reçus : un bonus');
  eq(statusInfo({ id: 'mod', stat: 'taken', pct: 0.2, turns: 2 }).tone, 'debuff');
  eq(statusInfo({ id: 'mod', stat: 'atk', pct: -0.2, turns: 2 }).tone, 'debuff');
  eq(statusInfo({ id: 'mod', stat: 'critShift', flat: -1, turns: 2 }).tone, 'buff', 'critique plus tôt : un bonus');
  assert(statusInfo({ id: 'mod', stat: 'taken', pct: -0.15, turns: 2 }).short.includes('−15 %'), 'le signe et le pourcentage');
  assert(statusInfo({ id: 'mod', stat: 'damage', pct: 0.15, turns: 2 }).name === 'Dégâts infligés +15 %', 'nom complet dans le panneau');
  eq(turnsText(1), '1 tour');
  eq(turnsText(3), '3 tours');
});

test('tout ce qui agit sur un combattant se liste : mode, bouclier, statuts, objet maudit ; les malus passent en premier sur la carte', () => {
  const t = training([{ classId: 'sacrieur', level: 4 }]);
  const p = t.players[0];
  p.shields = [{ amount: 12, turns: 2 }, { amount: 5, turns: 1 }];
  p.statuses.push({ id: 'mod', stat: 'damage', pct: 0.15, turns: 2 }, { id: 'poison', pct: 0.06, turns: 3 });
  p.equipment.weapon = { uid: 'w1', id: 'dague_os' };
  p.cursedUid = 'w1';
  const list = unitEffects(content, p);
  eq(list.map((e) => e.kind), ['mode', 'shield', 'status', 'status', 'curse']);
  eq(list[0].name, 'Mode Endurance');
  const shield = list[1];
  assert(shield.short === 'Bouclier 17' && shield.turns === 2 && shield.tone === 'buff', 'le bouclier cumule ses morceaux et montre la durée la plus longue');
  assert(list[4].desc.includes(content.items.dague_os.name), "l'objet maudit est nommé");
  eq(list.filter((e) => e.kind !== 'mode').sort(byDanger).map((e) => e.tone), ['debuff', 'debuff', 'buff', 'buff']);
  eq(unitEffects(content, t.combat.monsters[0]).length, 0, 'un mannequin sans effet : rien');
});

test('poser un effet envoie un événement « status », que l\'écran annonce au-dessus du combattant (« Poison », « Dégâts +15 % »)', () => {
  const t = training([{ classId: 'duelliste', level: 4, spec: 'poison' }], { dummy: 'mannequin', count: 1 });
  const me = t.players[0];
  const target = t.combat.monsters[0];
  const before = snapshotRun(t);
  me.pa = 6;
  const res = cast(t, me.id, 'duelliste_poison', target.id);
  assert(res.ok, res.error);
  const evs = res.events.filter((e) => e.type === 'status');
  if (!res.events.some((e) => e.type === 'skill' && e.outcome === 'fumble')) {
    assert(evs.some((e) => e.id === 'poison' && e.target === target.id), 'événement de poison sur la cible');
    const beats = planBeats(res.events, before, t, content).filter((b) => b.type === 'cast');
    const step = beats[0].steps.find((s) => s.type === 'status');
    assert(step && step.label === 'Poison' && step.tone === 'debuff' && step.target === target.id, 'une étape « Poison » (malus) sur la cible');
    assert(step.before && step.after && step.before.hp === step.after.hp, 'sans toucher aux PV');
  }
  // un bonus sur soi : Adaptation (Équilibre) pose deux bonus quand on change de mode
  const t2 = training([{ classId: 'sacrieur', level: 8, spec: 'equilibre' }]);
  t2.players[0].skills = ['sacrieur_sang_chaud', 'sacrieur_pacte', 'sacrieur_adaptation'];
  const b2 = snapshotRun(t2);
  const r2 = cast(t2, t2.players[0].id, 'sacrieur_pacte');
  assert(r2.ok, r2.error);
  const steps = planBeats(r2.events, b2, t2, content).flatMap((b) => b.steps || []).filter((s) => s.type === 'status');
  assert(steps.some((s) => s.tone === 'buff' && /Dégâts/.test(s.label)) && steps.some((s) => s.tone === 'buff' && /Reçus/.test(s.label)), 'les deux bonus sont annoncés : ' + steps.map((s) => s.label).join(', '));
});

test("sur 40 parties-éclair du robot, les PV de la dernière étape de chaque cible sont les vrais PV (sauf souffle de fin de combat)", () => {
  let steps = 0;
  let mismatches = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const party = makeParty(content, seed % 2 ? ['berserker', 'veilleur', 'duelliste'] : ['druide_ancien', 'duelliste'], 2 + (seed % 4), 'good', seed);
    const state = createRun(content, { tranche: seed % 3 ? 1 : 4, mode: 'tranche' }, party, seed);
    eachAction(state, 400, ({ before, res }) => {
      const beats = planBeats(res.events, before, state, content);
      const last = new Map();
      for (const b of beats) for (const s of b.steps || []) { steps++; if (s.after) last.set(s.target, s.after); }
      for (const [id, a] of last) {
        const u = [...state.players, ...(state.combat?.monsters || [])].find((x) => x.id === id);
        if (u && state.combat && a.hp !== u.hp) mismatches++; // (en plein combat, aucun écart permis)
      }
    });
  }
  assert(steps > 500, `peu d'étapes vérifiées (${steps})`);
  eq(mismatches, 0, `${mismatches} écart(s) de PV en plein combat :`);
});
test("les monstres apparus pendant l'action partent de leurs PV max (le rejeu d'un combat qui commence)", () => {
  const party = makeParty(content, ['berserker', 'veilleur'], 3, 'good', 3);
  const state = createRun(content, { tranche: 1, mode: 'tranche' }, party, 3);
  const rand = makeRand(9);
  let checked = 0;
  for (let n = 0; n < 600 && state.phase !== 'ended' && checked < 3; n++) {
    const before = snapshotRun(state);
    const res = dispatch(state, chooseAction(state, rand, 'smart', {}));
    assert(res.ok);
    if (!before.combat && state.combat) {
      const start = startState(before, state);
      for (const m of state.combat.monsters) {
        assert(start[m.id] && start[m.id].hp === start[m.id].max && start[m.id].kind === 'monster', `monstre ${m.id} absent de l'état de départ`);
      }
      checked++;
    }
  }
  assert(checked >= 1, 'aucun début de combat rencontré');
});
test("rejouer ne change jamais la partie : la photo est une copie", () => {
  const t = training([{ classId: 'veilleur', level: 4 }]);
  const snap = snapshotRun(t);
  const hp0 = snap.units[t.players[0].id].hp;
  t.players[0].hp -= 3;
  eq(snap.units[t.players[0].id].hp, hp0);
});

console.log('\n● Sons (la bibliothèque, sans navigateur)');
const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui');
function uiFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? uiFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}
test("chaque son demandé par l'interface existe (une faute de frappe = silence : on la refuse ici)", () => {
  const wanted = new Map();
  for (const file of uiFiles(UI_DIR)) {
    if (file.endsWith('sound.js')) continue;
    const text = readFileSync(file, 'utf8');
    // play('nom'…) ou sfx('nom'…)
    for (const m of text.matchAll(/\b(?:play|sfx)\(\s*'([a-z_]+)'/g)) wanted.set(m[1], file);
    // les tables de correspondance de fx.js : 'hit_slash', 'cast_beam'...
    if (file.endsWith('fx.js')) for (const m of text.matchAll(/'((?:hit|cast|voice|death)_[a-z]+|crit_hit|encounter|boss|chest|trap|fountain|sneak|coins|step|block|miss)'/g)) wanted.set(m[1], file);
  }
  assert(wanted.size > 30, `peu de noms trouvés (${wanted.size})`);
  const missing = [...wanted.keys()].filter((n) => !hasSound(n));
  assert(!missing.length, `sons introuvables : ${missing.join(', ')}`);
});
test("chaque espèce de monstre a sa voix (voice_<espèce>)", () => {
  const kinds = new Set(Object.values(content.monsters).map((m) => m.kind));
  assert(kinds.size >= 4, `espèces : ${[...kinds]}`);
  for (const k of kinds) assert(hasSound(`voice_${k}`), `pas de voix pour l'espèce « ${k} »`);
});
test('chaque son a un nom, une famille connue et une durée raisonnable', () => {
  const groups = soundGroups();
  const list = soundList();
  assert(list.length >= 50, `${list.length} sons`);
  for (const s of list) {
    assert(s.label && groups[s.group], `${s.id} : nom ou famille manquant`);
    assert(s.seconds > 0.05 && s.seconds <= 3.5, `${s.id} : durée ${s.seconds}`);
  }
  eq(new Set(list.map((s) => s.id)).size, list.length, 'noms en double');
});
test("les gestes des compétences (délivrance, impact) ont tous leur son", () => {
  for (const kind of ['melee', 'spin', 'projectile', 'smite', 'wave', 'self', 'ally', 'allies']) assert(FX_VOCAB.delivery.includes(kind));
  for (const hit of FX_VOCAB.hit.filter((x) => x !== 'auto')) assert(hasSound(`hit_${hit}`), `impact « ${hit} » sans son hit_${hit}`);
});

console.log('\n● Illustrations (les dessins SVG, sans navigateur)');
/** Vérifie qu'un texte SVG est bien formé : balises appariées, identifiants uniques, chaque url(#...) pointe vers un dégradé qui existe. */
function checkSvg(name, svg, maxBytes = 24000) {
  assert(typeof svg === 'string' && svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'), `${name} : pas un <svg> complet`);
  assert(!/NaN|undefined|\[object/.test(svg), `${name} : valeur invalide dans le dessin (NaN, undefined...)`);
  assert(svg.length < maxBytes, `${name} : dessin trop lourd (${svg.length} octets)`);
  const stack = [];
  for (const m of svg.matchAll(/<(!--[\s\S]*?--|\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?))>/g)) {
    if (m[1].startsWith('!--')) continue;
    const [, whole, tag] = m;
    if (!tag) continue;
    if (whole.startsWith('/')) assert(stack.pop() === tag, `${name} : balise </${tag}> mal placée`);
    else if (!whole.endsWith('/')) stack.push(tag);
  }
  assert(!stack.length, `${name} : balise(s) jamais fermée(s) : ${stack.join(', ')}`);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert(new Set(ids).size === ids.length, `${name} : identifiant en double`);
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) assert(ids.includes(m[1]), `${name} : url(#${m[1]}) ne pointe sur rien`);
}
test('chaque classe a son portrait et chaque monstre le sien (SVG bien formés)', () => {
  // (les classes de test — les anciennes, retirées du jeu — n'ont pas de portrait : elles gardent leur icône)
  for (const id of Object.keys(content.classes).filter((k) => !['berserker', 'veilleur', 'duelliste', 'druide_ancien'].includes(k))) {
    assert(heroIds().includes(id), `pas de portrait pour la classe « ${id} »`);
    checkSvg(`héros ${id}`, heroSvg(id));
  }
  for (const id of Object.keys(content.monsters)) {
    assert(monsterIds().includes(id), `pas de portrait pour le monstre « ${id} »`);
    checkSvg(`monstre ${id}`, monsterSvg(id));
  }
});
test('chaque type de case a sa vignette, et chaque décor existe', () => {
  for (const id of Object.keys(content.tiles)) {
    assert(vignetteIds().includes(id), `pas de vignette pour la case « ${id} »`);
    checkSvg(`vignette ${id}`, vignetteSvg(id), 40000); // (une vignette pixel : 120 × 40 pixels)
  }
  for (const id of sceneIds()) {
    assert(sceneIds().includes(id), `pas de décor « ${id} »`);
    checkSvg(`décor pixel ${id}`, PIXEL_SCENES[id](), 90000); // (un décor pixel : 160 × 65 pixels)
    assert(sceneCss(id).startsWith('url("data:image/svg+xml,'), `décor ${id} : valeur CSS`);
  }
});
test('chaque donjon jouable a son propre décor, et chaque zone de farm un décor qui existe', () => {
  const seen = new Map();
  for (const d of Object.values(content.dungeons)) {
    if (d.available === false) continue;
    assert(d.scene && sceneIds().includes(d.scene), `donjon ${d.id} : décor « ${d.scene} » inconnu`);
    assert(!seen.has(d.scene), `les donjons ${seen.get(d.scene)} et ${d.id} partagent le décor « ${d.scene} »`);
    seen.set(d.scene, d.id);
    eq(sceneIdFor({ setup: { tranche: d.tranche, dungeon: d.id } }, content), d.scene);
  }
  for (const [id, z] of Object.entries(content.farm.zones)) eq(sceneIdFor({ farm: { zoneId: id }, setup: { tranche: 1 } }, content), z.scene || 'terriers');
});
test('une classe sans portrait (classe de test) : pas de dessin, le médaillon garde son icône', () => {
  eq(heroSvg('berserker'), null);
  eq(sceneCss('inconnu'), 'none');
});
test('le décor suit la profondeur, la zone de farm ou la salle d\'entraînement — et le JSON peut en imposer un', () => {
  eq(sceneIdFor({ setup: { tranche: 1 } }, content), 'caves');
  eq(sceneIdFor({ setup: { tranche: 4 } }, content), 'crypt');
  eq(sceneIdFor({ setup: { tranche: 8 } }, content), 'depths');
  eq(sceneIdFor({ setup: { tranche: 12 } }, content), 'depths');
  eq(sceneIdFor({ training: true, setup: { tranche: 1 } }, content), 'training');
  eq(sceneIdFor({ farm: { zoneId: 'terriers' }, setup: { tranche: 1 } }, content), 'terriers');
  eq(sceneIdFor({ setup: { tranche: 4 } }, { tranches: { 4: { scene: 'img/ma-crypte.jpg' } } }), 'img/ma-crypte.jpg');
  assert(sceneCss('img/ma-crypte.jpg') === 'url("img/ma-crypte.jpg")', 'une image fournie par le JSON est utilisée telle quelle');
});
test("les champs `art` (classe, monstre, case) et `scene` (tranche, zone) sont acceptés dans les JSON", () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.art = 'img/berserker.png';
  raw.monsters.monsters[0].art = 'img/rat.png';
  raw.tiles.tiles.treasure.art = 'img/coffre.jpg';
  raw.tranches.tranches[0].scene = 'img/caves.jpg';
  const c2 = buildContent(raw);
  eq(c2.classes.berserker.art, 'img/berserker.png');
  eq(c2.tiles.treasure.art, 'img/coffre.jpg');
});
test("`art` ou `scene` qui n'est pas un texte est expliqué", () => {
  const raw = loadRaw();
  raw.classes.classes.berserker.art = 42;
  let msg = '';
  try { buildContent(raw); } catch (e) { msg = e.message; }
  assert(msg.includes('berserker') && msg.includes('art'), 'message: ' + msg);
  const raw2 = loadRaw();
  raw2.tranches.tranches[0].scene = { a: 1 };
  msg = '';
  try { buildContent(raw2); } catch (e) { msg = e.message; }
  assert(msg.includes('scene') && msg.includes('tranche'), 'message: ' + msg);
});

console.log('\n● Spécialisations, deck de sorts, sorts évolués, attaque à l\'arme');
{
  const duel = (level = 4) => {
    const ch = createCharacter(content, { id: 'd1', name: 'Dora', classId: 'duelliste' });
    ch.level = level;
    return ch;
  };
  const learnAll = (ch, ids) => ids.forEach((id) => assert(learnSkill(content, ch, id).ok, `apprendre ${id}`));

  test("l'attaque à l'arme : commune, 3 PA, moins puissante que toutes les attaques de base", () => {
    const w = content.skills.attaque_arme;
    assert(w && w.common && w.pa === 3, 'compétence commune à 3 PA');
    const power = (sk) => sk.effects.find((e) => e.type === 'damage').power;
    for (const cls of Object.values(content.classes)) {
      const basic = cls.skills.find((x) => x.id === cls.basicAttack);
      if (basic) assert(power(w) < power(basic), `${cls.id} : plus faible que son attaque de base`);
    }
    assert(power(w) < power(content.skills.sacrieur_entaille), "plus faible que le coup simple du Sacrieur (même coût en PA)");
    const t = training([{ classId: 'veilleur', level: 1 }]);
    assert(getCombatView(t, 'p1').skills.some((x) => x.skillId === 'attaque_arme' && x.pa === 3), 'dans la barre de combat');
  });

  test('la spécialisation s\'ouvre au niveau specLevel, et seulement pour une spé de la classe', () => {
    eq(specLevel(content), 4);
    eq(specsOf(content, 'duelliste').map((x) => x.id), ['poison', 'precision']);
    eq(specsOf(content, 'berserker'), []);
    assert(!setSpec(content, duel(3), 'poison').ok, 'niveau 3 : trop tôt');
    assert(!setSpec(content, duel(4), 'inconnue').ok);
    assert(!setSpec(content, duel(4), 42).ok);
    const bers = createCharacter(content, { id: 'b', name: 'B', classId: 'berserker' });
    bers.level = 8;
    assert(!setSpec(content, bers, 'poison').ok, 'une classe sans spé');
    const ch = duel(4);
    assert(setSpec(content, ch, 'poison').ok);
    eq(ch.spec, 'poison');
    assert(setSpec(content, ch, null).ok);
    eq(ch.spec, null);
  });

  test('une compétence de spécialisation demande la spé, ne coûte aucun point, et le choix est unique', () => {
    const ch = duel(4);
    let r = learnSkill(content, ch, 'duelliste_venin_vif');
    assert(!r.ok && r.reason.includes('Lame empoisonnée'), 'sans spé : ' + r.reason);
    setSpec(content, ch, 'poison');
    const before = skillPointsFree(content, ch);
    assert(learnSkill(content, ch, 'duelliste_venin_vif').ok);
    eq(skillPointsFree(content, ch), before, 'coût 0');
    // « un seul parmi N » : choisir un autre sort du groupe REMPLACE le précédent (il sort du deck), gratuitement et sans tout réinitialiser
    const req = skillRequirements(content, ch, 'duelliste_virulence');
    assert(req.some((x) => x.kind === 'choice' && x.ok && x.text.includes('remplace « Venin vif »')) && req.some((x) => x.kind === 'spec' && x.ok), 'conditions affichées : le choix annonce ce qu\'il remplace');
    assert(ch.deck.includes('duelliste_venin_vif'));
    r = learnSkill(content, ch, 'duelliste_virulence');
    assert(r.ok, 'choisir un autre : ' + r.reason);
    assert(ch.skills.includes('duelliste_virulence') && !ch.skills.includes('duelliste_venin_vif') && !ch.deck.includes('duelliste_venin_vif'), 'l\'ancien choix est remplacé et sort du deck');
    eq(skillPointsFree(content, ch), before, 'toujours aucun point dépensé');
    assert(learnSkill(content, ch, 'duelliste_double_estoc').ok && !ch.skills.includes('duelliste_virulence'), 'et ainsi de suite');
    assert(ch.skills.filter((id) => content.skills[id].choiceGroup === 'poison_4').length === 1, 'jamais plus d\'un choix par groupe');
    assert(!learnSkill(content, ch, 'duelliste_estoc_venimeux').ok, 'une version évoluée ne s\'apprend pas');
  });

  test('changer de spécialisation garde la mémoire des choix, mais ils ne comptent que dans leur spé', () => {
    const ch = duel(4);
    setSpec(content, ch, 'poison');
    learnAll(ch, ['duelliste_venin_vif']);
    assert(ch.deck.includes('duelliste_venin_vif'), 'équipé tout seul');
    setSpec(content, ch, 'precision');
    assert(ch.skills.includes('duelliste_venin_vif'), 'toujours appris');
    assert(!ch.deck.includes('duelliste_venin_vif'), 'sorti du deck');
    learnAll(ch, ['duelliste_oeil_maitre']);
    setSpec(content, ch, 'poison');
    assert(ch.deck.includes('duelliste_venin_vif'), 'retrouvé en revenant');
    assert(skillAvailable(content.skills.duelliste_garde_haute, { effLevel: 4, spec: 'precision' }));
    assert(!skillAvailable(content.skills.duelliste_garde_haute, { effLevel: 4, spec: 'poison' }), 'passive d\'une autre spé : sans effet');
    assert(!skillAvailable(content.skills.duelliste_garde_haute, { effLevel: 3, spec: 'precision' }), 'niveau effectif trop bas');
  });

  test('le deck : 4 sorts actifs au plus ; le corps à corps basique et le sort de classe sont à part', () => {
    eq(deckSize(content), 4);
    const ch = duel(8);
    // le Veilleur a de quoi dépasser la limite : on apprend tous ses sorts actifs de niveau <= 8
    const b = createCharacter(content, { id: 'b', name: 'B', classId: 'veilleur' });
    b.level = 20; // assez de points de compétence pour tout apprendre
    const actives = content.classes.veilleur.skills.filter((x) => x.type === 'active' && !x.innate && !x.unlockedBy);
    let learned = 0;
    for (const sk of actives) if (learnSkill(content, b, sk.id).ok) learned++;
    assert(learned >= 5, 'assez de sorts pour le test (' + learned + ')');
    eq(b.deck.length, 4, 'deck plein');
    const extra = b.skills.find((id) => deckEligible(content, b, id) && !b.deck.includes(id));
    assert(extra, 'le 5e est appris mais pas équipé');
    assert(!setDeck(content, b, [...b.deck, extra]).ok, '5 sorts : refusé');
    assert(!setDeck(content, b, [b.deck[0], b.deck[0]]).ok, 'doublon');
    assert(!setDeck(content, b, [content.classes.veilleur.classSkill]).ok, 'le sort de classe a son propre emplacement : il ne va pas dans le deck');
    assert(b.deck.includes(content.classes.veilleur.basicAttack), 'les anciens sorts de départ sont de simples sorts du deck, équipés dès la création');
    assert(!setDeck(content, b, ['berserker_colere']).ok, 'sort d\'une autre classe');
    assert(!setDeck(content, b, 'nimporte').ok && !setDeck(content, b, [3]).ok, 'forme invalide');
    const keep = b.deck.slice();
    assert(setDeck(content, b, [extra, keep[1]]).ok);
    eq(b.deck, [extra, keep[1]]);
    // en combat : le corps à corps basique, le sort de classe, puis le deck, et rien d'autre
    const p = { kind: 'player', classId: 'veilleur', skills: b.skills, deck: b.deck, spec: null, effLevel: 8 };
    const ids = activeSkillIds({ content }, p);
    const cs = content.classes.veilleur.classSkill;
    eq(ids[0], 'attaque_arme', 'le corps à corps basique en premier');
    eq(ids[1], cs, 'puis le sort de classe');
    eq(ids.slice(2), b.deck, 'puis le deck, tel quel');
    assert(!ids.includes('garde'), 'la Garde n\'est pas proposée (pas de slot)');
    eq(ids.length, 2 + b.deck.length);
    fillDeck(content, b);
    eq(b.deck.length, 4, 'fillDeck complète');
    const legacy = activeSkillIds({ content }, { ...p, deck: null });
    assert(b.skills.every((id) => content.skills[id].type !== 'active' || legacy.includes(id)), 'sans deck (Atelier) : tout est proposé');
    assert(ch.deck.includes('duelliste_estoc') && !ch.deck.includes('duelliste_fente'), 'Duelliste : Estoc équipé au départ, la Fente est son sort de classe (hors deck)');
  });

  test('un sort évolué remplace sa compétence de base (de départ ou non) tant que la spé est choisie', () => {
    const base = { kind: 'player', classId: 'duelliste', spec: null, effLevel: 4, deck: ['duelliste_estoc'], skills: ['duelliste_estoc', 'duelliste_fente', 'duelliste_elan'] };
    let ids = activeSkillIds({ content }, base);
    assert(ids.includes('duelliste_estoc') && ids.includes('duelliste_fente') && !ids.includes('duelliste_estoc_venimeux'), 'sans spé');
    ids = activeSkillIds({ content }, { ...base, spec: 'poison' });
    assert(ids.includes('duelliste_estoc_venimeux') && !ids.includes('duelliste_estoc') && ids.includes('duelliste_fente'), 'spé poison : estoc évolué');
    ids = activeSkillIds({ content }, { ...base, spec: 'precision' });
    assert(ids.includes('duelliste_fente_eclair') && !ids.includes('duelliste_fente') && ids.includes('duelliste_estoc'), 'spé précision : fente évoluée');
    ids = activeSkillIds({ content }, { ...base, spec: 'poison', effLevel: 3 });
    assert(ids.includes('duelliste_estoc') && !ids.includes('duelliste_estoc_venimeux'), 'niveau effectif trop bas (donjon de tranche plus basse) : la version de base');
    // en vrai combat : le sort évolué prend la place de son sort de base, dans le même bloc, et fait bien du poison
    const t = training([{ classId: 'duelliste', level: 4, spec: 'poison' }]);
    const view = getCombatView(t, 'p1');
    eq(view.skills.find((x) => x.skillId === 'duelliste_estoc_venimeux').group, 'deck');
    eq(view.skills.find((x) => x.basic).skillId, 'attaque_arme', 'le corps à corps basique reste l\'Attaque à l\'arme');
    const tp = training([{ classId: 'duelliste', level: 4, spec: 'precision' }]);
    eq(getCombatView(tp, 'p1').skills.find((x) => x.skillId === 'duelliste_fente_eclair').group, 'class', 'la Fente éclair prend la place du sort de classe');
    const r = dispatch(t, { type: 'COMBAT_ACT', playerId: 'p1', act: 'skill', skillId: 'duelliste_estoc_venimeux', targetId: t.combat.monsters[0].id });
    assert(r.ok, r.error);
    assert(!dispatch(t, { type: 'COMBAT_ACT', playerId: 'p1', act: 'skill', skillId: 'duelliste_estoc', targetId: t.combat.monsters[0].id }).ok, 'la version de base n\'est plus lançable');
  });

  test('en combat, un sort appris mais hors deck ne se lance pas', () => {
    const t = training([{ classId: 'duelliste', level: 8, spec: 'poison' }]);
    const p = t.players[0];
    p.deck = ['duelliste_venin_vif'];
    const ids = getCombatView(t, 'p1').skills.map((x) => x.skillId);
    assert(ids.includes('duelliste_venin_vif'), 'équipé');
    assert(!ids.includes('duelliste_poison') && !ids.includes('duelliste_coup_de_grace'), 'hors deck');
    const r = dispatch(t, { type: 'COMBAT_ACT', playerId: 'p1', act: 'skill', skillId: 'duelliste_coup_de_grace', targetId: t.combat.monsters[0].id });
    assert(!r.ok, 'refusé');
  });

  test('les actions CHAR_SET_SPEC et CHAR_SET_DECK : mêmes règles que le moteur, refusées en pleine partie', () => {
    const chars = [];
    const ids = (() => { let i = 0; return () => 'z' + ++i; })();
    const go = (a, ctx = {}) => applyCharacterAction(content, chars, a, { newId: ids, ...ctx });
    const ch = go({ type: 'CHAR_CREATE', name: 'Zoé', classId: 'duelliste' }).character;
    ch.level = 4;
    assert(!go({ type: 'CHAR_SET_SPEC', charId: ch.id, spec: 'poison' }, { locked: new Set([ch.id]) }).ok, 'pas en pleine partie');
    eq(ch.spec, null);
    assert(!go({ type: 'CHAR_SET_SPEC', charId: ch.id, spec: { $gt: '' } }).ok, 'type invalide');
    assert(!go({ type: 'CHAR_SET_SPEC', charId: ch.id, spec: 'zzz' }).ok);
    assert(go({ type: 'CHAR_SET_SPEC', charId: ch.id, spec: 'poison' }).ok);
    eq(ch.spec, 'poison');
    assert(go({ type: 'CHAR_LEARN', charId: ch.id, skillId: 'duelliste_double_estoc' }).ok);
    assert(!go({ type: 'CHAR_SET_DECK', charId: ch.id, deck: ['duelliste_double_estoc', 'veilleur_soin'] }, {}).ok);
    assert(!go({ type: 'CHAR_SET_DECK', charId: ch.id, deck: 'x' }).ok);
    assert(!go({ type: 'CHAR_SET_DECK', charId: ch.id, deck: ['duelliste_double_estoc'] }, { locked: new Set([ch.id]) }).ok, 'deck verrouillé en partie');
    assert(go({ type: 'CHAR_SET_DECK', charId: ch.id, deck: [] }).ok);
    eq(ch.deck, []);
    assert(go({ type: 'CHAR_SET_DECK', charId: ch.id, deck: ['duelliste_double_estoc'] }).ok);
    eq(ch.deck, ['duelliste_double_estoc']);
    assert(go({ type: 'CHAR_RESET_SKILLS', charId: ch.id }).ok);
    eq([ch.deck, ch.spec], [['duelliste_estoc'], 'poison'], 'la réinitialisation refait le deck avec les sorts de départ et garde la spé');
  });

  test('anciennes sauvegardes : deck rempli, spé retirée si le niveau ne suffit pas, un seul choix par groupe', () => {
    const base = { id: 'old', name: 'Vieux', classId: 'berserker', level: 8, xp: 0, skills: ['berserker_colere', 'berserker_tourbillon'] };
    const old = sanitizeCharacter(content, base);
    eq(old.spec, null);
    assert(old.deck.length >= 1 && old.deck.length <= 4 && old.deck.every((id) => old.skills.includes(id)), 'deck rempli : ' + old.deck);
    const keep = sanitizeCharacter(content, { ...base, deck: [] });
    eq(keep.deck, [], 'un deck vide volontaire est respecté');
    const bad = sanitizeCharacter(content, { ...base, deck: ['veilleur_soin', 'berserker_colere', 'berserker_colere', 7] });
    eq(bad.deck, ['berserker_colere'], 'invalides et doublons retirés');
    const duoBase = { id: 'd', name: 'D', classId: 'duelliste', level: 4, xp: 0 };
    const low = sanitizeCharacter(content, { ...duoBase, level: 3, spec: 'poison', skills: ['duelliste_vivacite'] });
    eq(low.spec, null, 'niveau 3 : pas de spé');
    const twice = sanitizeCharacter(content, { ...duoBase, spec: 'poison', skills: ['duelliste_venin_vif', 'duelliste_virulence'] });
    eq([twice.spec, twice.skills.includes('duelliste_venin_vif'), twice.skills.includes('duelliste_virulence')], ['poison', true, false], 'un seul choix par groupe');
    eq(sanitizeCharacter(content, { ...duoBase, spec: 'inventée' }).spec, null);
  });

  test('la barre de combat : corps à corps basique, sort de classe, puis le deck (4 emplacements), et rien d\'autre', () => {
    const ch = duel(4);
    setSpec(content, ch, 'poison');
    learnAll(ch, ['duelliste_venin_vif']);
    const s = createRun(content, { tranche: 4, mode: 'tranche' }, [ch], 5);
    const p = s.players[0];
    eq([p.spec, p.deck], ['poison', ['duelliste_estoc', 'duelliste_venin_vif']], 'le joueur de la partie reçoit sa spé et son deck');
    const ids = activeSkillIds(s, p);
    eq(ids, ['attaque_arme', 'duelliste_fente', 'duelliste_estoc_venimeux', 'duelliste_venin_vif']);
    const t = training([{ classId: 'berserker', level: 4 }]);
    t.players[0].deck = ['berserker_entaille'];
    const view = getCombatView(t, 'p1');
    eq(view.skills.map((x) => x.group), ['basic', 'class', 'deck']);
    eq(view.deckSlots, 3, 'trois emplacements libres à montrer vides');
    eq(getCombatView(training([{ classId: 'berserker', level: 4 }]), 'p1').deckSlots, 0, 'Atelier (sans deck) : pas d\'emplacements vides');
    // la Garde et l'Attaque à l'arme ne sont plus dans la barre à part le corps à corps basique
    assert(!view.skills.some((x) => x.skillId === 'garde'));
  });

  test('les JSON de spécialisation : les fautes sont expliquées en français', () => {
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw.classes.classes.duelliste); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    let msg = tryBuild((c) => { c.skills.find((x) => x.id === 'duelliste_venin_vif').spec = 'poisson'; });
    assert(msg.includes('poisson') && msg.includes('poison'), msg);
    msg = tryBuild((c) => { c.skills.find((x) => x.id === 'duelliste_estoc_venimeux').replaces = 'nimporte'; });
    assert(msg.includes('replaces') && msg.includes('nimporte'), msg);
    msg = tryBuild((c) => { delete c.skills.find((x) => x.id === 'duelliste_estoc_venimeux').spec; });
    assert(msg.includes('spécialisation'), msg);
    msg = tryBuild((c) => { c.skills.find((x) => x.id === 'duelliste_estoc_venimeux').replaces = 'duelliste_venin_vif'; c.skills.find((x) => x.id === 'duelliste_venin_vif').replaces = 'duelliste_estoc'; });
    assert(msg.includes('remplace'), msg);
    msg = tryBuild((c) => { c.specs.poison = { desc: 'x' }; });
    assert(msg.includes('specs'), msg);
    msg = tryBuild((c) => { c.skills.find((x) => x.id === 'duelliste_venin_vif').choiceGroup = ''; });
    assert(msg.includes('choiceGroup'), msg);
    assert(levelCap(content) === 8);
    msg = tryBuild((c) => { c.classSkill = 'duelliste_elan'; });
    assert(msg.includes('classSkill') && msg.includes('ACTIVE'), msg);
    msg = tryBuild((c) => { c.classSkill = 'duelliste_poison'; });
    assert(msg.includes('classSkill') && msg.includes('innate'), msg);
    const rawS = loadRaw(); rawS.skills.common[0].slot = 'milieu'; msg = '';
    try { buildContent(rawS); } catch (e) { msg = e.message; }
    assert(msg.includes('slot') && msg.includes('basic'), msg);
    const rawN = loadRaw(); delete rawN.skills.common[0].slot; msg = '';
    try { buildContent(rawN); } catch (e) { msg = e.message; }
    assert(msg.includes('slot') && msg.includes('basic'), 'sans corps à corps basique : ' + msg);
  });
}

console.log('\n● Sacrieur : modes, 1re utilisation gratuite, PV manquants, sacrifice, spécialisations automatiques');
{
  const sac = (spec = null, level = 4, extra = []) => training([{ classId: 'sacrieur', level, spec }, ...extra]);
  const hurt = (p, ratio) => { p.hp = Math.max(1, Math.round(computeStats({ content, players: [p], combat: null }, p).hpMax * ratio)); };
  const near = (a, b, eps = 0.03) => Math.abs(a - b) < eps; // (les PV sont arrondis : 50 % de PV n'est jamais exactement 50 %)
  const cast = (t, id, skillId, targetId) => dispatch(t, { type: 'COMBAT_ACT', playerId: id, act: 'skill', skillId, targetId });

  test('le Sacrieur : 8 sorts de départ, le Pacte de sang est son sort de classe, 4 sorts équipés au départ', () => {
    const ch = createCharacter(content, { id: 's', name: 'S', classId: 'sacrieur' });
    eq(content.classes.sacrieur.classSkill, 'sacrieur_pacte');
    eq(ch.deck, ['sacrieur_entaille', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'], 'deck de départ');
    assert(!deckEligible(content, ch, 'sacrieur_pacte'), 'le sort de classe n\'entre pas dans le deck');
    assert(deckEligible(content, ch, 'sacrieur_crochet') && deckEligible(content, ch, 'sacrieur_temerite'), 'les deux autres sorts de base sont à équiper au choix');
    const s = createRun(content, { tranche: 1, mode: 'tranche' }, [ch], 3);
    eq(activeSkillIds(s, s.players[0]), ['attaque_arme', 'sacrieur_pacte', 'sacrieur_entaille', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace']);
  });

  test('mode : Endurance au départ, Pacte de sang bascule ; la 1re utilisation du combat est gratuite, ensuite 1 PA', () => {
    const t = sac();
    const p = t.players[0];
    eq(p.mode, 'reduction', 'mode de départ : réduction des dégâts');
    let view = getCombatView(t, 'p1');
    eq(view.skills.find((x) => x.skillId === 'sacrieur_pacte').pa, 0, 'affiché 0 PA la première fois');
    const pa0 = p.pa;
    assert(cast(t, 'p1', 'sacrieur_pacte').ok);
    eq([p.mode, p.pa], ['degats', pa0], 'en Fureur, sans avoir payé de PA');
    view = getCombatView(t, 'p1');
    eq(view.skills.find((x) => x.skillId === 'sacrieur_pacte').pa, 1, 'ensuite 1 PA');
    assert(cast(t, 'p1', 'sacrieur_pacte').ok);
    eq([p.mode, p.pa], ['reduction', pa0 - 1], 'retour en Endurance : 1 PA');
    assert(skillPaCost(p, content.skills.sacrieur_pacte) === 1);
  });

  test('mode : la gratuité repart à zéro à chaque combat, et le mode revient à Endurance', () => {
    const t = sac();
    const p = t.players[0];
    assert(cast(t, 'p1', 'sacrieur_pacte').ok);
    eq(p.mode, 'degats');
    // un nouveau combat dans la même partie : on recrée la salle (même mécanisme d'initialisation)
    const t2 = sac();
    eq([t2.players[0].mode, skillPaCost(t2.players[0], content.skills.sacrieur_pacte)], ['reduction', 0]);
  });

  // Les coefficients sont lus dans les données : on peut régler l'équilibrage sans toucher à ces tests.
  const coef = (id, i = 0) => content.skills[id].modifiers[i].pctPer.missingHpPct;
  const R = () => -coef('sacrieur_sang_chaud', 0); // réduction de base par 1 % de PV manquants
  const D = () => coef('sacrieur_sang_chaud', 1); // dégâts de base par 1 % de PV manquants

  test('passif de base : Endurance réduit les dégâts reçus, Fureur augmente les dégâts, selon les PV manquants (jamais l\'inverse)', () => {
    const t = sac();
    const p = t.players[0];
    hurt(p, 0.5);
    let st = computeStats(t, p);
    assert(near(st.taken, 1 - R() * 0.5) && near(st.damage, 1), `Endurance à 50 % de PV : reçus x${st.taken}, dégâts x${st.damage}`);
    assert(st.taken < 1, 'elle réduit vraiment');
    p.mode = 'degats';
    st = computeStats(t, p);
    assert(near(st.taken, 1) && near(st.damage, 1 + D() * 0.5), `Fureur à 50 % de PV : reçus x${st.taken}, dégâts x${st.damage}`);
    assert(st.damage > 1, 'elle augmente vraiment');
    hurt(p, 1);
    st = computeStats(t, p);
    assert(near(st.taken, 1) && near(st.damage, 1), 'à pleine vie : aucun effet');
  });

  test('spécialisations : Bastion renforce la réduction (et encaisse 12 % de moins), Écorché les dégâts, Équilibre combine les deux (l\'autre côté à ~65 %)', () => {
    const at = (spec, mode) => { const t = sac(spec); const p = t.players[0]; hurt(p, 0.5); p.mode = mode; return computeStats(t, p); };
    const extraR = -coef('sacrieur_rempart');
    const extraD = coef('sacrieur_fureur');
    assert(extraR > 0 && extraD > 0, 'les passifs de spé renforcent');
    const flatR = -content.skills.sacrieur_rempart.modifiers[1].pct; // (Rempart de chair : −12 % de dégâts reçus, quel que soit le mode)
    assert(flatR > 0, 'le Bastion encaisse moins dans les deux modes');
    let st = at('bastion', 'reduction');
    assert(near(st.taken, 1 - (R() + extraR) * 0.5 - flatR), `bastion / endurance : x${st.taken}`);
    st = at('bastion', 'degats');
    assert(near(st.taken, 1 - flatR) && near(st.damage, 1 + D() * 0.5), `bastion / fureur : le passif de base, et toujours −12 % reçus (x${st.taken})`);
    st = at('ecorche', 'degats');
    assert(near(st.damage, 1 + (D() + extraD) * 0.5), `écorché / fureur : x${st.damage}`);
    st = at('ecorche', 'reduction');
    assert(near(st.taken, 1 - R() * 0.5), 'écorché / endurance : comme le passif de base');
    // Équilibre : le côté de son mode à 100 %, l'autre à environ 65 % (valeurs écrites dans le passif « Sang mêlé »)
    const kR = -coef('sacrieur_sang_mele', 0) / R(), kD = coef('sacrieur_sang_mele', 1) / D();
    assert(kR > 0.6 && kR < 0.7 && kD > 0.6 && kD < 0.7, `Sang mêlé ≈ 65 % des deux effets de base (${kR.toFixed(2)}, ${kD.toFixed(2)})`);
    st = at('equilibre', 'reduction');
    assert(near(st.taken, 1 - R() * 0.5) && near(st.damage, 1 + kD * D() * 0.5), `équilibre / endurance : reçus x${st.taken}, dégâts x${st.damage}`);
    st = at('equilibre', 'degats');
    assert(near(st.damage, 1 + D() * 0.5) && near(st.taken, 1 - kR * R() * 0.5), `équilibre / fureur : reçus x${st.taken}, dégâts x${st.damage}`);
    st = at(null, 'reduction');
    assert(near(st.taken, 1 - R() * 0.5) && near(st.damage, 1), 'sans spécialisation : le passif de base');
  });

  test('les compétences automatiques : débloquées en choisissant la spé (niveau 4), sans les apprendre ni dépenser de point', () => {
    const ch = createCharacter(content, { id: 's', name: 'S', classId: 'sacrieur' });
    ch.level = 3;
    assert(!setSpec(content, ch, 'bastion').ok, 'niveau 3 : spé fermée');
    ch.level = 4;
    eq(autoSkillIds(content, ch), [], 'sans spé : rien');
    assert(setSpec(content, ch, 'bastion').ok);
    eq(autoSkillIds(content, ch).sort(), ['sacrieur_dernier_souffle', 'sacrieur_rempart', 'sacrieur_sacrifice']);
    assert(knownSkills(content, ch).includes('sacrieur_sacrifice') && !ch.skills.includes('sacrieur_sacrifice'), 'connue, mais pas « apprise »');
    const r = canLearnSkill(content, ch, 'sacrieur_sacrifice');
    assert(!r.ok && r.reason.includes('Automatique'), r.reason);
    eq(skillPointsFree(content, ch), 4, 'aucun point dépensé');
    assert(deckEligible(content, ch, 'sacrieur_sacrifice') && !deckEligible(content, ch, 'sacrieur_dechirure'), 'Sacrifice se met dans le deck ; Déchirure est d\'une autre spé');
    assert(setDeck(content, ch, ['sacrieur_sacrifice', 'sacrieur_entaille']).ok);
    const s = createRun(content, { tranche: 4, mode: 'tranche' }, [ch], 4);
    assert(s.players[0].skills.includes('sacrieur_rempart') && s.players[0].skills.includes('sacrieur_dernier_souffle'), 'les passifs automatiques sont dans la partie');
    assert(activeSkillIds(s, s.players[0]).includes('sacrieur_sacrifice'));
    setSpec(content, ch, 'ecorche');
    assert(!knownSkills(content, ch).includes('sacrieur_sacrifice') && knownSkills(content, ch).includes('sacrieur_festin'), 'changer de spé change les automatiques');
    assert(!ch.deck.includes('sacrieur_sacrifice'), 'et sort l\'ancien sort du deck');
  });

  test('la Punition évolue selon la spécialisation et ne se lance qu\'une fois par combat', () => {
    const idsOf = (spec) => { const t = sac(spec); t.players[0].deck = ['sacrieur_punition']; return getCombatView(t, 'p1').skills.map((x) => x.skillId); };
    assert(idsOf(null).includes('sacrieur_punition'));
    assert(idsOf('bastion').includes('sacrieur_punition_bastion') && !idsOf('bastion').includes('sacrieur_punition'));
    assert(idsOf('equilibre').includes('sacrieur_punition_equilibre'));
    assert(idsOf('ecorche').includes('sacrieur_punition_ecorche'));
    const t = sac();
    t.players[0].deck = ['sacrieur_punition'];
    const dummy = t.combat.monsters[0].id;
    assert(cast(t, 'p1', 'sacrieur_punition', dummy).ok);
    const again = cast(t, 'p1', 'sacrieur_punition', dummy);
    assert(!again.ok && /combat/.test(again.error), 'une seule fois par combat : ' + again.error);
  });

  test('Punition : plus il manque de PV, plus elle frappe fort ; la version Écorché se saigne d\'abord', () => {
    const dmgAt = (spec, ratio, skillId) => {
      const t = sac(spec);
      const p = t.players[0];
      const m = t.combat.monsters[0];
      hurt(p, ratio);
      const before = m.hp;
      const sk = content.skills[skillId];
      for (const e of sk.effects) applyEffect(t, p, e, [m], { outcome: 'hit', skill: sk });
      return { dealt: before - m.hp, hp: p.hp };
    };
    const full = dmgAt(null, 1, 'sacrieur_punition').dealt;
    const half = dmgAt(null, 0.5, 'sacrieur_punition').dealt;
    const low = dmgAt(null, 0.1, 'sacrieur_punition').dealt;
    assert(full < half && half < low, `plus il manque de PV, plus ça cogne : ${full} < ${half} < ${low}`);
    const ec = dmgAt('ecorche', 1, 'sacrieur_punition_ecorche');
    const t = sac('ecorche');
    assert(ec.hp < computeStats(t, t.players[0]).hpMax, 'la Punition sanglante lui coûte des PV');
    assert(ec.dealt > full, `et après s\'être saigné, elle frappe plus fort qu'une Punition à pleine vie (${ec.dealt} > ${full})`);
    assert(ec.hp >= 1, 'sans jamais le tuer');
  });

  test('Carapace de sang : le bouclier grandit avec les PV manquants ; Coup téméraire coûte des PV sans tuer', () => {
    const shieldAt = (ratio) => {
      const t = sac();
      const p = t.players[0];
      hurt(p, ratio);
      const sk = content.skills.sacrieur_carapace;
      for (const e of sk.effects) applyEffect(t, p, e, [p], { outcome: 'hit', skill: sk });
      return totalShield(p);
    };
    const a = shieldAt(1);
    const b = shieldAt(0.5);
    const c = shieldAt(0.2);
    assert(a > 0 && a < b && b < c, `bouclier : ${a} < ${b} < ${c}`);
    const t = sac();
    const p = t.players[0];
    p.hp = 2;
    const sk = content.skills.sacrieur_temerite;
    for (const e of sk.effects) applyEffect(t, p, e, [t.combat.monsters[0]], { outcome: 'hit', skill: sk });
    eq(p.hp, 1, 'il se blesse mais reste à 1 PV');
  });

  test('Morsure de sang : récupère 50 % des dégâts infligés ; Crochet ramène un ennemi du rang arrière devant', () => {
    const t = sac(null, 4, []);
    const p = t.players[0];
    const m = t.combat.monsters[0];
    p.hp = 10;
    const before = m.hp;
    const sk = content.skills.sacrieur_morsure;
    const steal = sk.effects.find((e) => e.if.mode === 'reduction').lifesteal; // (en Endurance, le mode de départ)
    for (const e of sk.effects) applyEffect(t, p, e, [m], { outcome: 'hit', skill: sk });
    const dealt = before - m.hp;
    assert(dealt > 0 && Math.abs((p.hp - 10) - Math.round(dealt * steal)) <= 1, `soigné de ${p.hp - 10} pour ${dealt} de dégâts (vol de vie ${steal})`);
    const t2 = training([{ classId: 'sacrieur', level: 6 }], { count: 2 }); // (Crochet : niveau 6)
    const [m1, m2] = t2.combat.monsters;
    m1.row = 'front';
    m2.row = 'back';
    const r = cast(t2, 'p1', 'sacrieur_crochet', m2.id);
    assert(r.ok, r.error);
    eq(m2.row, 'front', 'l\'ennemi du fond est maintenant devant');
    assert(!cast(t2, 'p1', 'sacrieur_crochet', m1.id).ok, 'relance de 2 tours');
  });

  test('Sacrifice : le Sacrieur encaisse les coups des monstres visant ses alliés, jusqu\'au début de son prochain tour', () => {
    const t = sac('bastion', 4, [{ classId: 'veilleur', level: 4 }]);
    const [tank, ally] = t.players;
    const m = t.combat.monsters[0];
    const hit = () => applyEffect(t, m, { type: 'damage', pctMaxHp: 0.2 }, [ally], { outcome: 'hit' });
    const allyHp = ally.hp;
    hit();
    assert(ally.hp < allyHp, 'sans Sacrifice, l\'allié encaisse');
    ally.hp = allyHp;
    tank.pa = 6;
    castSkill(t, tank, content.skills.sacrieur_sacrifice, null); // (lancé directement : l'ordre de jeu de la salle n'a pas d'importance ici)
    assert(tank.statuses.some((x) => x.id === 'redirect' && x.expires === 'turnStart'), 'statut posé, jusqu\'au début de son prochain tour');
    const tankHp = tank.hp;
    hit();
    eq(ally.hp, allyHp, 'l\'allié ne perd rien');
    assert(tank.hp < tankHp, 'le Sacrieur a encaissé à sa place');
    // lui-même est touché normalement (pas de boucle) et un coup « de soi à soi » n'est pas détourné
    const tankHp2 = tank.hp;
    applyEffect(t, m, { type: 'damage', pctMaxHp: 0.1 }, [tank], { outcome: 'hit' });
    assert(tank.hp < tankHp2, 'il encaisse aussi ses propres coups');
    tank.alive = false; tank.hp = 0;
    const allyHp2 = ally.hp;
    hit();
    assert(ally.hp < allyHp2, 'mort, il ne protège plus personne');
  });

  test('Dernier souffle : un coup mortel le laisse à 1 PV avec un bouclier, une seule fois par combat', () => {
    const t = sac('bastion');
    const p = t.players[0];
    const m = t.combat.monsters[0];
    dealDamage(t, m, p, 99999);
    assert(p.alive && p.hp === 1, `survit à 1 PV (PV : ${p.hp})`);
    assert(totalShield(p) > 0, 'avec un bouclier d\'absorption');
    dealDamage(t, m, p, 99999);
    assert(!p.alive, 'la deuxième fois dans le même combat, il tombe');
    const t2 = sac(null);
    dealDamage(t2, t2.combat.monsters[0], t2.players[0], 99999);
    assert(!t2.players[0].alive, 'sans la spécialisation Bastion, pas de Dernier souffle');
  });

  // ---------- palier 8, sorts qui lisent le mode, Provocation ----------
  const withSkills = (spec, ids, level = 8, extra = []) => {
    const t = sac(spec, level, extra);
    t.players[0].skills = ['sacrieur_sang_chaud', 'sacrieur_pacte', ...ids];
    return t;
  };
  const applyAll = (t, caster, sk, target) => { for (const e of sk.effects) applyEffect(t, caster, e, [target], { outcome: 'hit', skill: sk }); };

  test('des sorts qui lisent le mode : Morsure, Carapace et Coup téméraire ne font pas la même chose en Endurance et en Fureur', () => {
    const measure = (mode, skillId) => {
      const t = sac();
      const p = t.players[0];
      const m = t.combat.monsters[0];
      p.mode = mode;
      p.hp = 8;
      const before = m.hp;
      applyAll(t, p, content.skills[skillId], skillId === 'sacrieur_carapace' ? p : m);
      return { dealt: before - m.hp, healed: p.hp - 8, shield: totalShield(p), hp: p.hp };
    };
    const bite = (mode) => measure(mode, 'sacrieur_morsure');
    const endu = bite('reduction');
    const fure = bite('degats');
    assert(fure.dealt > endu.dealt, `Fureur : plus de dégâts (${fure.dealt} > ${endu.dealt})`);
    assert(endu.healed / endu.dealt > fure.healed / fure.dealt, `Endurance : plus de vol de vie (${(endu.healed / endu.dealt).toFixed(2)} > ${(fure.healed / fure.dealt).toFixed(2)})`);
    const sh = (mode) => measure(mode, 'sacrieur_carapace').shield;
    assert(sh('reduction') > sh('degats') && sh('degats') > 0, `Carapace : plus grosse en Endurance (${sh('reduction')} > ${sh('degats')})`);
    const rash = (mode) => { const t = sac(); const p = t.players[0]; p.mode = mode; const hp = p.hp; applyAll(t, p, content.skills.sacrieur_temerite, t.combat.monsters[0]); return { lost: hp - p.hp, dealt: 50000 - t.combat.monsters[0].hp }; };
    assert(rash('degats').lost > rash('reduction').lost && rash('degats').dealt > rash('reduction').dealt, 'Coup téméraire : en Fureur il frappe plus fort et se saigne plus');
    // un seul des deux effets s'applique à la fois (jamais les deux)
    const t = sac();
    const only = content.skills.sacrieur_carapace.effects.filter((e) => !e.if || t.players[0].mode === e.if.mode);
    eq(only.length, 1, 'un seul effet de Carapace s\'applique selon le mode');
  });

  test('« quand il change de mode » : le déclencheur modeChange (Adaptation) pose ses bonus, et pas sans le changement', () => {
    const t = withSkills('equilibre', ['sacrieur_adaptation']);
    const p = t.players[0];
    assert(!p.statuses.some((x) => x.id === 'mod'), 'au départ : aucun bonus');
    castSkill(t, p, content.skills.sacrieur_pacte, null);
    eq(p.mode, 'degats');
    const mods = p.statuses.filter((x) => x.id === 'mod').map((x) => x.stat).sort();
    eq(mods, ['damage', 'taken'], 'dégâts infligés et dégâts reçus modifiés');
    const dmg = p.statuses.find((x) => x.stat === 'damage');
    const tkn = p.statuses.find((x) => x.stat === 'taken');
    assert(dmg.pct > 0 && tkn.pct < 0 && dmg.turns === 2, 'plus de dégâts, moins de dégâts reçus, pendant 2 tours');
    const t2 = withSkills('equilibre', []);
    castSkill(t2, t2.players[0], content.skills.sacrieur_pacte, null);
    assert(!t2.players[0].statuses.some((x) => x.id === 'mod'), 'sans Adaptation : rien');
  });

  test('Provocation : les ennemis doivent le viser (statut de provocation) et il gagne un petit bouclier', () => {
    const t = sac(null, 4, [{ classId: 'veilleur', level: 4 }]);
    const p = t.players[0];
    castSkill(t, p, content.skills.sacrieur_provocation, null);
    const st = p.statuses.find((x) => x.id === 'taunt');
    assert(st && st.turns === 2, 'provocation de 2 tours');
    assert(totalShield(p) > 0, 'avec un petit bouclier');
    eq(content.skills.sacrieur_provocation.level, 3, 'débloquée au niveau 3');
  });

  test('chaque spécialisation donne de quoi jouer dès le niveau 4 (au moins 3 compétences automatiques ou évoluées) et affiche son rôle', () => {
    for (const [id, sp] of Object.entries(content.classes.sacrieur.specs)) {
      const gives = content.classes.sacrieur.skills.filter((x) => x.spec === id && x.level === 4 && (x.auto || x.replaces));
      assert(gives.length >= 4, `${id} : ${gives.length} compétences au niveau 4 (${gives.map((x) => x.id).join(', ')})`);
      assert(gives.some((x) => x.type === 'passive') && gives.some((x) => x.type === 'active'), `${id} : au moins une passive et un sort`);
      assert(typeof sp.tag === 'string' && sp.tag, `${id} : une étiquette de rôle`);
    }
    const ch = createCharacter(content, { id: 's', name: 'S', classId: 'sacrieur' });
    ch.level = 4;
    setSpec(content, ch, 'equilibre');
    eq(autoSkillIds(content, ch).sort(), ['sacrieur_lame_protectrice', 'sacrieur_sang_mele', 'sacrieur_souplesse']);
  });

  test('Équilibre : Souplesse rend le PA du changement de mode (une fois par tour), Lame protectrice frappe et protège', () => {
    const t = withSkills('equilibre', ['sacrieur_souplesse'], 4);
    const p = t.players[0];
    p.pa = 6;
    castSkill(t, p, content.skills.sacrieur_pacte, null); // 1re utilisation du combat : 0 PA, puis +1 PA rendu
    eq(p.pa, 7, 'le changement de mode rend 1 PA');
    castSkill(t, p, content.skills.sacrieur_pacte, null); // 2e : coûte 1 PA, mais déjà rendu une fois ce tour : rien de plus
    eq(p.pa, 6, 'une seule fois par tour');
    const t2 = withSkills('equilibre', [], 4);
    const q = t2.players[0];
    q.pa = 6;
    castSkill(t2, q, content.skills.sacrieur_pacte, null);
    eq(q.pa, 6, 'sans Souplesse : rien n\'est rendu');
    const t3 = withSkills('equilibre', ['sacrieur_lame_protectrice'], 4);
    const [tank, m] = [t3.players[0], t3.combat.monsters[0]];
    tank.shields = [];
    const before = m.hp;
    applyAll(t3, tank, content.skills.sacrieur_lame_protectrice, m);
    assert(before - m.hp > 0 && totalShield(tank) > 0, 'des dégâts et un bouclier');
  });

  test('palier 8 : un seul choix parmi trois par spécialisation, qu\'on peut changer gratuitement', () => {
    for (const [spec, group, ids] of [
      ['bastion', 'bastion_8', ['sacrieur_represailles', 'sacrieur_sang_partage', 'sacrieur_peau_de_pierre']],
      ['equilibre', 'equilibre_8', ['sacrieur_transfusion', 'sacrieur_hemorragie', 'sacrieur_adaptation']],
      ['ecorche', 'ecorche_8', ['sacrieur_saignee', 'sacrieur_execution', 'sacrieur_frenesie']]
    ]) {
      const ch = createCharacter(content, { id: 's', name: 'S', classId: 'sacrieur' });
      ch.level = 7;
      setSpec(content, ch, spec);
      const r7 = learnSkill(content, ch, ids[0]);
      assert(!r7.ok && r7.reason.includes('Niveau 8'), `${spec} : niveau 7, trop tôt (${r7.reason})`);
      ch.level = 8;
      for (const id of ids) {
        assert(content.skills[id].choiceGroup === group && content.skills[id].level === 8 && content.skills[id].cost === 0 && content.skills[id].spec === spec, `${id} : groupe, niveau, coût, spé`);
      }
      assert(learnSkill(content, ch, ids[0]).ok);
      eq(ch.skills.filter((id) => content.skills[id].choiceGroup === group), [ids[0]]);
      assert(learnSkill(content, ch, ids[1]).ok);
      eq(ch.skills.filter((id) => content.skills[id].choiceGroup === group), [ids[1]], `${spec} : le nouveau choix remplace l'ancien`);
      eq(skillPointsFree(content, ch), 8, 'sans dépenser un point');
      // le choix d'une autre spé n'est pas possible
      const other = spec === 'bastion' ? 'sacrieur_transfusion' : 'sacrieur_represailles';
      assert(!learnSkill(content, ch, other).ok, 'pas le choix d\'une autre spécialisation');
    }
  });

  test('palier 8 Bastion : Représailles renvoie des dégâts, Sang partagé protège toute l\'équipe, Peau de pierre protège au départ', () => {
    let t = withSkills('bastion', ['sacrieur_represailles']);
    let m = t.combat.monsters[0];
    const before = m.hp;
    dealDamage(t, m, t.players[0], 5);
    assert(before - m.hp > 0, `le monstre reçoit des dégâts en retour (${before - m.hp})`);
    t = withSkills('bastion', ['sacrieur_sang_partage'], 8, [{ classId: 'veilleur', level: 8 }]);
    const [tank, ally] = t.players;
    const hp0 = tank.hp;
    castSkill(t, tank, content.skills.sacrieur_sang_partage, null);
    assert(totalShield(ally) > 0 && totalShield(tank) > 0, 'toute l\'équipe a un bouclier');
    assert(tank.hp < hp0 && tank.hp >= 1, 'et il s\'est blessé, sans mourir');
    t = withSkills('bastion', ['sacrieur_peau_de_pierre']);
    t.players[0].shields = []; // (l'Atelier avait déjà lancé le début de combat avec tous les choix)
    eq(totalShield(t.players[0]), 0);
    fireTriggers(t, 'combatStart', { unit: t.players[0] });
    assert(totalShield(t.players[0]) > 0, 'bouclier au début du combat');
  });

  test('palier 8 Équilibre : Transfusion soigne un allié aux frais du Sacrieur, Hémorragie saigne et vole un peu de vie', () => {
    let t = withSkills('equilibre', ['sacrieur_transfusion'], 8, [{ classId: 'veilleur', level: 8 }]);
    let [tank, ally] = t.players;
    ally.hp = Math.round(ally.hp / 2);
    const [tankHp, allyHp] = [tank.hp, ally.hp];
    castSkill(t, tank, content.skills.sacrieur_transfusion, ally.id);
    assert(ally.hp > allyHp, `l'allié est soigné (${allyHp} → ${ally.hp})`);
    assert(tank.hp < tankHp && tank.hp >= 1, `le Sacrieur paie en PV (${tankHp} → ${tank.hp})`);
    t = withSkills('equilibre', ['sacrieur_hemorragie']);
    tank = t.players[0];
    const m = t.combat.monsters[0];
    tank.hp = 10;
    applyAll(t, tank, content.skills.sacrieur_hemorragie, m);
    assert(m.statuses.some((x) => x.id === 'dot'), 'un saignement est posé');
    assert(tank.hp > 10, 'il récupère une part des dégâts');
  });

  test('palier 8 Écorché : Saignée volontaire donne des PA, Exécution frappe en plus les cibles faibles, Frénésie rend des PA sur un kill', () => {
    let t = withSkills('ecorche', ['sacrieur_saignee']);
    let p = t.players[0];
    p.pa = 6;
    const hp0 = p.hp;
    castSkill(t, p, content.skills.sacrieur_saignee, null);
    eq(p.pa, 6 - 1 + 3, '1 PA payé, 3 gagnés : +2 net');
    assert(p.hp < hp0 && p.hp >= 1, 'il perd des PV sans mourir');
    const loss = (ids, hpRatio) => {
      const tt = withSkills('ecorche', ids);
      const m = tt.combat.monsters[0];
      m.hp = Math.round(50000 * hpRatio);
      const b = m.hp;
      dealDamage(tt, tt.players[0], m, 100);
      return b - m.hp;
    };
    eq(loss([], 0.2), 100, 'sans Exécution : seulement le coup');
    assert(loss(['sacrieur_execution'], 0.2) > 100, 'avec Exécution : un coup en plus sur une cible sous 30 %');
    eq(loss(['sacrieur_execution'], 0.9), 100, 'pas sur une cible en forme');
    t = withSkills('ecorche', ['sacrieur_frenesie']);
    p = t.players[0];
    const m = t.combat.monsters[0];
    m.immortal = false;
    m.hp = 1;
    p.pa = 3;
    dealDamage(t, p, m, 50);
    assert(!m.alive, 'le monstre est achevé');
    eq(p.pa, 5, '+2 PA');
  });

  test('paliers « à venir » : niveau 12 et ultime niveau 20 sont des aperçus (aucune compétence), et les fautes sont expliquées', () => {
    for (const [id, spec] of Object.entries(content.classes.sacrieur.specs)) {
      const up = spec.upcoming;
      assert(Array.isArray(up) && up.some((x) => x.level === 12) && up.some((x) => x.level === 20 && x.desc), `${id} : un palier 12 et un ultime 20`);
    }
    assert(!content.classes.sacrieur.skills.some((x) => x.level >= 12), 'aucune vraie compétence au-delà du niveau 8 pour l\'instant');
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw.classes.classes.sacrieur); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    let msg = tryBuild((c) => { c.specs.bastion.upcoming = 'bientôt'; });
    assert(msg.includes('upcoming') && msg.includes('liste'), msg);
    msg = tryBuild((c) => { c.specs.bastion.upcoming = [{ name: 'Sans niveau' }]; });
    assert(msg.includes('upcoming') && msg.includes('level'), msg);
    msg = tryBuild((c) => { c.skills.find((x) => x.id === 'sacrieur_morsure').effects[0].if = { mode: 'colere' }; });
    assert(msg.includes('colere') && msg.includes('reduction'), msg);
    msg = tryBuild((c) => { c.skills.find((x) => x.id === 'sacrieur_morsure').effects[0].if = { nimporte: 1 }; });
    assert(msg.includes('nimporte'), msg);
  });

  test('les JSON : modes, effets et compétences automatiques mal écrits sont expliqués en français', () => {
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw.classes.classes.sacrieur, raw); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    const sk = (c, id) => c.skills.find((x) => x.id === id);
    let msg = tryBuild((c) => { c.modes.default = 'rage'; });
    assert(msg.includes('modes.default') && msg.includes('rage'), msg);
    msg = tryBuild((c) => { c.modes.list = { seul: { name: 'Seul' } }; });
    assert(msg.includes('modes') && msg.includes('deux'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_pacte').effects[0].set = 'rage'; });
    assert(msg.includes('mode') && msg.includes('rage'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_sang_chaud').modifiers[0].if.mode = 'colere'; });
    assert(msg.includes('colere') && msg.includes('reduction'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_pacte').freeFirst = 'oui'; });
    assert(msg.includes('freeFirst'), msg);
    msg = tryBuild((c) => { delete sk(c, 'sacrieur_rempart').spec; });
    assert(msg.includes('auto') && msg.includes('spécialisation'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_rempart').innate = true; });
    assert(msg.includes('auto') && msg.includes('innate'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_sacrifice').effects[0].turns = 0; });
    assert(msg.includes('redirect') && msg.includes('turns'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_carapace').effects[0] = { type: 'shield' }; });
    assert(msg.includes('pctMissingHp'), msg);
    msg = tryBuild((c) => { sk(c, 'sacrieur_punition').effects[0].powerPerMissingHp = 'beaucoup'; });
    assert(msg.includes('powerPerMissingHp'), msg);
  });
}

console.log('\n● Assassin : marque, venin cumulable, bonus sur cible, spécialisations');
{
  /** Une salle d'entraînement avec UN assassin (niveau 8 par défaut) face à deux mannequins ; `extra` : d'autres héros. */
  const asn = (spec = null, level = 8, extra = []) => training([{ classId: 'assassin', level, spec }, ...extra], { count: 2 });
  const hit = (t, p, id, target) => { const sk = content.skills[id]; for (const e of sk.effects) applyEffect(t, p, e, [target], { outcome: 'hit', skill: sk }); };
  const mark = (t, p, target, e = {}) => applyEffect(t, p, { type: 'mark', pct: 0.2, ...e }, [target], { outcome: 'hit' });
  const killable = (m, hp = 1) => { m.immortal = false; m.hp = hp; };
  const dealt = (t, p, id, target) => { const before = target.hp; hit(t, p, id, target); const d = before - target.hp; target.hp = before; return d; };
  const statusOf = (u, id) => u.statuses.find((st) => st.id === id);
  const checkUsableSk = (t, p, sk) => checkUsable(t, p, sk);

  test("l'Assassin : sa Marque est son sort de classe ; ses sorts de base se lancent de n'importe quel rang", () => {
    const ch = createCharacter(content, { id: 'a', name: 'A', classId: 'assassin' });
    eq(content.classes.assassin.classSkill, 'assassin_marque');
    eq(content.classes.assassin.startRow, 'front');
    const t = createRun(content, { tranche: 1, mode: 'tranche' }, [ch], 3);
    const ids = activeSkillIds(t, t.players[0]);
    assert(ids[0] === 'attaque_arme' && ids[1] === 'assassin_marque', `corps à corps puis sort de classe (${ids.slice(0, 2)})`);
    for (const sk of content.classes.assassin.skills) if (sk.type === 'active' && sk.target !== 'self') assert(sk.range === 'any', `${sk.id} atteint tous les rangs`);
    eq(Object.keys(content.classes.assassin.specs), ['venin', 'executeur', 'traqueur']);
  });

  test('Marque : une seule proie à la fois (la nouvelle remplace l\'ancienne) ; Double marque en garde deux (la plus ancienne disparaît)', () => {
    const t = asn();
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    mark(t, p, m1);
    eq(markedEnemies(t, p).map((u) => u.id), [m1.id]);
    mark(t, p, m2);
    eq(markedEnemies(t, p).map((u) => u.id), [m2.id], 'marquer m2 retire la marque de m1');
    assert(!statusOf(m1, 'mark'));
    mark(t, p, m1, { max: 2 });
    eq(markedEnemies(t, p).map((u) => u.id), [m2.id, m1.id], 'deux marques, de la plus ancienne à la plus récente');
    // une 3e marque (sur un autre ennemi) : ici il n'y a que deux monstres, on re-marque donc le plus ancien pour vérifier le roulement
    mark(t, p, m2, { max: 2 });
    eq(markedEnemies(t, p).map((u) => u.id), [m1.id, m2.id], 're-marquer rafraîchit sans rien retirer');
    assert(statusOf(m1, 'mark').turns >= 99 && statusOf(m1, 'mark').casterId === p.id);
  });

  test('Marque : gratuite tant que rien n\'est marqué, 1 PA ensuite ; gratuite de nouveau quand la proie meurt', () => {
    const t = asn();
    const p = t.players[0];
    const [m1] = t.combat.monsters;
    const sk = content.skills.assassin_marque;
    eq(skillPaCost(p, sk, t), 0, 'rien de marqué : gratuite');
    eq(getCombatView(t, p.id).skills.find((x) => x.skillId === 'assassin_marque').pa, 0, 'affichée 0 PA');
    const pa0 = p.pa;
    assert(cast(t, p.id, 'assassin_marque', m1.id).ok);
    eq(p.pa, pa0, 'la 1re marque ne coûte rien');
    eq(skillPaCost(p, sk, t), 1, 'une proie est marquée : 1 PA pour en changer');
    assert(cast(t, p.id, 'assassin_marque', t.combat.monsters[1].id).ok);
    eq(p.pa, pa0 - 1, 'changer de cible : 1 PA');
    killable(t.combat.monsters[1]);
    hit(t, p, 'assassin_estoc', t.combat.monsters[1]);
    assert(!t.combat.monsters[1].alive, 'la proie est morte');
    eq(skillPaCost(p, sk, t), 0, 'plus rien de marqué : la Marque est de nouveau gratuite');
    eq(skillPaCost(p, sk), 1, 'sans l\'état du combat on ne sait pas : coût plein');
  });

  test('Marque : +x % de dégâts de CELUI qui l\'a marquée seulement ; les sorts ont des bonus sur la cible marquée', () => {
    const t = asn(null, 8, [{ classId: 'berserker', level: 8 }]);
    const [a, b] = t.players;
    const [m] = t.combat.monsters;
    const base = dealt(t, a, 'assassin_estoc', m);
    mark(t, a, m, { pct: 0.5 });
    const marked = dealt(t, a, 'assassin_estoc', m);
    assert(marked > base, `marquée, la cible subit plus (${base} → ${marked})`);
    assert(near(targetDamagePct(t, a, m), 0.5, 1e-9) && targetDamagePct(t, b, m) === 0, 'seul le marqueur profite de la marque');
    const bonusOnly = (() => { const sk = content.skills.assassin_estoc; return sk.effects[0].bonus[0].power; })();
    assert(bonusOnly > 0, 'l\'Estoc a un bonus de puissance sur cible marquée');
    // sans la hausse de la marque (0 %), le bonus du sort suffit à frapper plus fort
    mark(t, a, m, { pct: 0 });
    const bonusEffect = dealt(t, a, 'assassin_estoc', m);
    assert(bonusEffect > base, `le bonus de puissance du sort suffit (${base} → ${bonusEffect})`);
  });

  function near(a, b, eps = 0.03) { return Math.abs(a - b) < eps; }

  test('Venin : chaque dose ajoute un cumul (4 au plus), tous les venins se cumulent, et il blesse à chaque tour de la victime', () => {
    const t = asn();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    hit(t, p, 'assassin_lame_venimeuse', m);
    eq(statusOf(m, 'dot').stacks, 1, 'un cumul');
    hit(t, p, 'assassin_lame_venimeuse', m);
    eq(statusOf(m, 'dot').stacks, 2, 'deux cumuls');
    mark(t, p, m);
    hit(t, p, 'assassin_lame_venimeuse', m); // 1 cumul + 1 de plus sur la cible marquée
    eq(statusOf(m, 'dot').stacks, 4, 'le bonus de la cible marquée ajoute un cumul, plafond de 4');
    hit(t, p, 'assassin_lame_venimeuse', m);
    eq(statusOf(m, 'dot').stacks, 4, 'jamais plus que le plafond');
    eq(m.statuses.filter((st) => st.id === 'dot').length, 1, 'un seul statut (même clé pour tous les venins)');
    const st = statusOf(m, 'dot');
    const hp = m.hp;
    tickStatusEffects(t, m);
    assert(Math.abs((hp - m.hp) - Math.max(1, st.amount * 4)) <= 1, `4 cumuls : ${st.amount} × 4 à chaque tour (perdu ${hp - m.hp})`);
    // l'affichage
    const info = statusInfo(st);
    assert(info.name === 'Venin ×4' && info.tone === 'debuff' && /4 cumuls/.test(info.desc), `${info.name} — ${info.desc}`);
    assert(statusInfo({ id: 'dot', amount: 5, label: 'saigne', turns: 2 }).name === 'Saigne', 'un saignement ordinaire est inchangé');
  });

  test('Venin : « Toxines » augmente ses dégâts (stat dot) ; le saignement ordinaire d\'un autre héros n\'est pas cumulable', () => {
    const t = asn('venin');
    const p = t.players[0];
    const st0 = computeStats(t, p);
    assert(st0.dot > 1, `Toxines : ×${st0.dot} sur les venins`);
    const t2 = asn(null);
    eq(computeStats(t2, t2.players[0]).dot, 1);
    const [m] = t2.combat.monsters;
    const bleed = { type: 'dot', power: 0.5, turns: 3, label: 'saigne' };
    applyEffect(t2, t2.players[0], bleed, [m], { outcome: 'hit', skill: { id: 'x' } });
    applyEffect(t2, t2.players[0], bleed, [m], { outcome: 'hit', skill: { id: 'x' } });
    assert(!statusOf(m, 'dot').stacks, 'sans « stack », une nouvelle pose remplace (comme avant)');
  });

  test('Le venin peut achever sa victime (un saignement tue, contrairement au poison des monstres)', () => {
    const t = asn();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    hit(t, p, 'assassin_lame_venimeuse', m);
    killable(m, 1);
    tickStatusEffects(t, m);
    assert(!m.alive, 'le venin l\'a achevé');
  });

  test('Passifs « contre les cibles... » : Prédateur toxique (cibles empoisonnées), Instinct de tueur (cibles sous 40 % de PV)', () => {
    const t = asn('venin');
    const p = t.players[0];
    const [m] = t.combat.monsters;
    eq(targetDamagePct(t, p, m), 0, 'une cible saine : rien');
    hit(t, p, 'assassin_lame_venimeuse', m);
    assert(near(targetDamagePct(t, p, m), content.skills.assassin_predateur_toxique.targetDamage[0].pct, 1e-9), 'empoisonnée : +20 %');
    const x = asn('executeur');
    const mx = x.combat.monsters[0];
    eq(targetDamagePct(x, x.players[0], mx), 0);
    mx.hp = Math.round(mx.hpMax * 0.3);
    assert(near(targetDamagePct(x, x.players[0], mx), content.skills.assassin_instinct.targetDamage[0].pct, 1e-9), 'sous 40 % de PV : +20 %');
    const none = asn(null);
    none.combat.monsters[0].hp = 10;
    eq(targetDamagePct(none, none.players[0], none.combat.monsters[0]), 0, 'sans la spécialisation : aucun bonus');
  });

  test('Chasseur de têtes : achever sa proie MARQUÉE rend 1 PA (une fois par tour) ; achever une autre cible n\'en rend pas', () => {
    const t = asn();
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    p.pa = 0;
    killable(m1);
    hit(t, p, 'assassin_estoc', m1);
    assert(!m1.alive);
    eq(p.pa, 0, 'cible non marquée : pas de PA');
    const t2 = asn();
    const q = t2.players[0];
    const [n1] = t2.combat.monsters;
    q.pa = 0;
    mark(t2, q, n1);
    killable(n1);
    hit(t2, q, 'assassin_estoc', n1);
    eq(q.pa, 1, 'proie marquée : +1 PA');
    // Exécuteur : « Mise à mort » en rend un de plus
    const x = asn('executeur');
    const r = x.players[0];
    r.pa = 0;
    const [k1] = x.combat.monsters;
    mark(x, r, k1);
    killable(k1);
    hit(x, r, 'assassin_estoc', k1);
    eq(r.pa, 2, 'Exécuteur : 2 PA au total');
  });

  test('Chasse sans fin : quand la proie meurt, la marque passe sur l\'ennemi le plus blessé', () => {
    const t = asn('executeur');
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    m2.hp = Math.round(m2.hpMax * 0.5);
    mark(t, p, m1, { pct: 0.25 });
    killable(m1);
    hit(t, p, 'assassin_estoc', m1);
    assert(!m1.alive);
    eq(markedEnemies(t, p).map((u) => u.id), [m2.id], 'la marque est passée sur m2');
    assert(near(statusOf(m2, 'mark').pct, 0.25, 1e-9));
  });

  test('Lame d\'ombre : inutilisable sans marque, et ne frappe que les ennemis marqués', () => {
    const t = asn('traqueur');
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    const sk = content.skills.assassin_lame_ombre;
    assert(!checkUsableSk(t, p, sk).ok && /marquée/.test(checkUsableSk(t, p, sk).reason), 'sans proie marquée : refusée');
    mark(t, p, m1, { max: 2, pct: 0.15 });
    assert(checkUsableSk(t, p, sk).ok);
    const h1 = m1.hp, h2 = m2.hp;
    hit(t, p, 'assassin_lame_ombre', m1);
    for (const e of sk.effects) applyEffect(t, p, e, [m1, m2], { outcome: 'hit', skill: sk });
    assert(m1.hp < h1 - 1, 'la proie marquée est frappée');
    eq(m2.hp, h2, 'l\'autre ennemi n\'est pas touché');
  });
  test('Tourbillon : frappe tous les ennemis, plus fort sur celui qui est marqué', () => {
    const t = asn();
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    mark(t, p, m1);
    const sk = content.skills.assassin_tourbillon;
    const [h1, h2] = [m1.hp, m2.hp];
    for (const e of sk.effects) applyEffect(t, p, e, [m1, m2], { outcome: 'hit', skill: sk });
    assert(h1 - m1.hp > h2 - m2.hp && h2 - m2.hp > 0, `marqué : ${h1 - m1.hp} PV perdus, l'autre : ${h2 - m2.hp}`);
  });

  test('Garrot : étourdit la cible marquée seulement', () => {
    const t = asn('executeur');
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    mark(t, p, m1);
    hit(t, p, 'assassin_garrot', m2);
    assert(!statusOf(m2, 'stun'), 'une cible non marquée n\'est pas étourdie');
    hit(t, p, 'assassin_garrot', m1);
    assert(statusOf(m1, 'stun'), 'la cible marquée est étourdie');
  });

  test('Exécution : de plus en plus forte sur une cible blessée, énorme sous 25 % de PV', () => {
    const t = asn('executeur');
    const p = t.players[0];
    const [m] = t.combat.monsters;
    const full = dealt(t, p, 'assassin_execution', m);
    m.hp = Math.round(m.hpMax * 0.5);
    const half = dealt(t, p, 'assassin_execution', m);
    m.hp = Math.round(m.hpMax * 0.2);
    const low = dealt(t, p, 'assassin_execution', m);
    assert(full < half && half < low, `${full} < ${half} < ${low}`);
    assert(low > 2 * half, `sous 25 % de PV : bien plus qu'avant (${low} > 2 × ${half})`);
  });

  test('Traqueur : l\'Estoc rend 1 PA et le Coup de grâce 2 PA, sur une cible marquée seulement ; Instinct de survie sauve une fois', () => {
    const t = asn('traqueur');
    const p = t.players[0];
    const [m1, m2] = t.combat.monsters;
    p.pa = 0;
    hit(t, p, 'assassin_estoc_traqueur', m1);
    eq(p.pa, 0, 'cible non marquée : rien');
    mark(t, p, m1, { max: 2, pct: 0.15 });
    hit(t, p, 'assassin_estoc_traqueur', m1);
    eq(p.pa, 1, 'cible marquée : +1 PA');
    hit(t, p, 'assassin_grace_vif', m1);
    eq(p.pa, 3, 'Coup de grâce vif : +2 PA');
    hit(t, p, 'assassin_grace_vif', m2);
    eq(p.pa, 3, 'sur la cible non marquée : rien');
    // Instinct de survie (palier 8) : un coup mortel laisse 1 PV, passe au rang arrière avec une garde, une seule fois par combat
    p.row = 'front';
    dealDamage(t, t.combat.monsters[0], p, 99999);
    assert(p.alive && p.hp === 1, `survit à 1 PV (${p.hp})`);
    eq(p.row, 'back');
    assert(statusOf(p, 'guard'), 'avec une garde');
    dealDamage(t, t.combat.monsters[0], p, 99999);
    assert(!p.alive, 'la 2e fois, il tombe');
  });

  test('Spécialisations : chacune transforme les sorts de base (Estoc, Lame, Coup de grâce) et la Marque', () => {
    const idsOf = (spec) => { const t = asn(spec); return activeSkillIds(t, t.players[0]); };
    const base = idsOf(null);
    assert(base.includes('assassin_marque') && base.includes('assassin_estoc'), 'sans spécialisation : les sorts de base');
    assert(idsOf('venin').includes('assassin_marque_venin') && !idsOf('venin').includes('assassin_marque'), 'Venin : Marque venimeuse à la place de la Marque');
    assert(idsOf('executeur').includes('assassin_marque_mort'), 'Exécuteur : Marque de mort');
    assert(idsOf('traqueur').includes('assassin_double_marque'), 'Traqueur : Double marque');
    for (const [spec, repl] of [['venin', 'assassin_estoc_venin'], ['executeur', 'assassin_estoc_fatal'], ['traqueur', 'assassin_estoc_traqueur']]) {
      assert(idsOf(spec).includes(repl) && !idsOf(spec).includes('assassin_estoc'), `${spec} : l'Estoc devient ${repl}`);
    }
    // les variantes de la Marque restent dans le bloc « classe » et gardent la gratuité sans marque
    for (const id of ['assassin_marque_venin', 'assassin_marque_mort', 'assassin_double_marque']) assert(content.skills[id].freeIfNoMark, `${id} : gratuite sans marque`);
    // le deck est limité à 4 : le palier 8 se choisit parmi trois, un seul à la fois
    const ch = createCharacter(content, { id: 'a', name: 'A', classId: 'assassin' });
    ch.level = 8; setSpec(content, ch, 'venin');
    assert(learnSkill(content, ch, 'assassin_predateur_toxique').ok && ch.skills.includes('assassin_predateur_toxique'));
    assert(learnSkill(content, ch, 'assassin_double_morsure').ok && !ch.skills.includes('assassin_predateur_toxique'), 'un autre choix du palier 8 remplace le précédent');
  });

  test('Les JSON : marque, cumuls, conditions sur la cible et bonus mal écrits sont expliqués en français', () => {
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw.classes.classes.assassin); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    const sk = (c, id) => c.skills.find((x) => x.id === id);
    let msg = tryBuild((c) => { sk(c, 'assassin_estoc').effects[0].bonus[0].ifTarget = { targetMarquee: true }; });
    assert(msg.includes('targetMarquee') && msg.includes('inconnue'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_estoc').effects[0].bonus[0].power = 'beaucoup'; });
    assert(msg.includes('power') && msg.includes('bonus'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_estoc').effects[0].bonus = 3; });
    assert(msg.includes('bonus'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_marque').effects[0].max = 0; });
    assert(msg.includes('max'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_marque').freeIfNoMark = 'oui'; });
    assert(msg.includes('freeIfNoMark'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_lame_ombre').needsMark = 1; });
    assert(msg.includes('needsMark'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_lame_venimeuse').effects[1].maxStacks = 0; });
    assert(msg.includes('maxStacks'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_predateur_toxique').targetDamage[0].pct = 'x'; });
    assert(msg.includes('targetDamage') && msg.includes('pct'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_chasse_sans_fin').triggers[0].effect.to = 'plusFaible'; });
    assert(msg.includes('plusFaible'), msg);
    msg = tryBuild((c) => { sk(c, 'assassin_chasseur').triggers[0].if = { targetMarked: 'oui' }; });
    assert(msg.includes('targetMarked'), msg);
  });

  test('Interface : la marque s\'affiche (+x % de dégâts, jusqu\'à sa mort) et le venin compte ses cumuls', () => {
    const info = statusInfo({ id: 'mark', pct: 0.2, turns: 99 });
    assert(info.name === 'Marqué' && info.tone === 'debuff' && info.turns === null && /20 %/.test(info.short) && /mort/.test(info.desc), JSON.stringify(info));
    const t = asn();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    const eff = unitEffects(content, (mark(t, p, m), m));
    assert(eff.some((e) => e.id === 'mark' && e.kind === 'status'), 'la marque est dans les effets du monstre');
    hit(t, p, 'assassin_lame_venimeuse', m);
    eq(statusInfo(statusOf(m, 'dot')).short, 'Venin ×2', 'la pastille compte les cumuls (1 + 1 sur la cible marquée)');
  });
}

console.log('\n● Templier : puissance sacrée, auras de groupe, spécialisations');
{
  /** Une salle d'entraînement avec un Templier (niveau 8 par défaut) et un Veilleur allié, face à deux mannequins. */
  const tpl = (spec = null, level = 8, allyLevel = 8) => { const t = training([{ classId: 'templier', level, spec }, { classId: 'veilleur', level: allyLevel }], { count: 2 }); takeTurnOf(t, 'p1'); return t; };
  const gen = (t, p, id, target) => { const sk = content.skills[id]; const tg = Array.isArray(target) ? target : [target]; for (const e of sk.effects) applyEffect(t, p, e, tg, { outcome: 'hit', skill: sk }); };
  /** Ce que l'aura du Templier change à une stat de `unit` : la stat avec le Templier vivant moins la stat sans lui (jamais de dépendance aux passifs de l'allié). */
  const auraDelta = (t, unit, stat) => { const [p] = t.players; const withAura = computeStats(t, unit)[stat]; p.alive = false; const without = computeStats(t, unit)[stat]; p.alive = true; return withAura - without; };
  const sacre = (p) => p.resources.sacre ?? 0;
  const statusOf = (u, id) => u.statuses.find((st) => st.id === id);
  const noDice = (id, fn) => { const sk = content.skills[id]; const old = sk.dice; sk.dice = { fumble: 0, crit: 21 }; try { return fn(); } finally { if (old === undefined) delete sk.dice; else sk.dice = old; } };
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  test('le Templier : puissance sacrée (max 5, à 0 au départ), Aura sacrée comme sort de classe, 2 générateurs + 2 consommateurs en deck', () => {
    const ch = createCharacter(content, { id: 't', name: 'T', classId: 'templier' });
    const cls = content.classes.templier;
    eq([cls.resource.id, cls.resource.max, cls.resource.start, cls.classSkill], ['sacre', 5, 0, 'templier_aura']);
    ch.level = 3; fillDeck(content, ch);
    eq(ch.deck, ['templier_frappe', 'templier_benediction', 'templier_verdict', 'templier_eclat'], 'deck : 2 générateurs, puis 2 consommateurs');
    for (const id of ['templier_frappe', 'templier_benediction', 'templier_defi']) assert(content.skills[id].effects.some((e) => e.type === 'resource' && e.amount > 0), `${id} génère de la puissance sacrée`);
    for (const id of ['templier_verdict', 'templier_eclat', 'templier_rempart']) assert(content.skills[id].spend?.id === 'sacre', `${id} en dépense`);
    const t = tpl();
    eq(sacre(t.players[0]), 0, 'à 0 au début du combat');
    eq(t.players[0].resourceMax.sacre, 5);
    eq(t.players[0].mode, 'protection', 'aura de départ : protection');
  });

  test('générateurs : la Frappe donne +1, le Marteau +2, jamais plus de 5 ; un consommateur est refusé tant qu\'il en manque', () => {
    const t = tpl();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    gen(t, p, 'templier_frappe', m);
    eq(sacre(p), 1);
    gen(t, p, 'templier_marteau', m);
    eq(sacre(p), 3);
    gen(t, p, 'templier_marteau', m); gen(t, p, 'templier_marteau', m);
    eq(sacre(p), 5, 'plafonné à 5');
    p.resources.sacre = 2;
    const refuse = checkUsable(t, p, content.skills.templier_verdict);
    assert(!refuse.ok && /puissance sacrée/i.test(refuse.reason), `Verdict refusé avec 2 : ${refuse.reason}`);
    p.resources.sacre = 3;
    assert(checkUsable(t, p, content.skills.templier_verdict).ok, 'avec 3 : possible');
    p.resources.sacre = 4;
    assert(!checkUsable(t, p, content.skills.templier_eclat).ok, 'le grand soin de zone demande 5');
  });

  test('consommateurs : le Verdict dépense 3 et frappe très fort ; l\'Éclat de lumière dépense 5 et soigne toute l\'équipe', () => {
    const t = tpl();
    const [p, ally] = t.players;
    const [m] = t.combat.monsters;
    const frappe = (() => { const b = m.hp; gen(t, p, 'templier_frappe', m); const d = b - m.hp; m.hp = b; return d; })();
    const verdict = (() => { const b = m.hp; for (const e of content.skills.templier_verdict.effects) applyEffect(t, p, e, [m], { outcome: 'hit', skill: content.skills.templier_verdict }); const d = b - m.hp; m.hp = b; return d; })();
    assert(verdict > 2.5 * frappe, `le Verdict (${verdict}) frappe bien plus fort que la Frappe sacrée (${frappe})`);
    p.resources.sacre = 3;
    noDice('templier_verdict', () => assert(cast(t, p.id, 'templier_verdict', m.id).ok));
    eq(sacre(p), 0, 'les 3 points sont dépensés');
    // Éclat : 5 points
    t.players.forEach((u) => { u.hp = Math.round(u.hp * 0.3); u.statuses.push({ id: 'poison', pct: 0.05, turns: 3 }); });
    p.resources.sacre = 5;
    const before = t.players.map((u) => u.hp);
    p.pa = 6;
    assert(cast(t, p.id, 'templier_eclat').ok);
    eq(sacre(p), 0);
    t.players.forEach((u, i) => { assert(u.hp > before[i], `${u.name} est soigné`); assert(!statusOf(u, 'poison'), `${u.name} est purifié`); });
  });

  test('Ferveur : quand un monstre le frappe, +1 puissance sacrée (une fois par tour seulement)', () => {
    const t = tpl();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    dealDamage(t, m, p, 3);
    eq(sacre(p), 1, 'frappé : +1');
    dealDamage(t, m, p, 3);
    eq(sacre(p), 1, 'une 2e fois dans le même tour : rien');
    p.flags = {}; // (les drapeaux « une fois par tour » se vident au début de son tour)
    dealDamage(t, m, p, 3);
    eq(sacre(p), 2);
  });

  test('Aura sacrée : le joueur CHOISIT son aura (refus si elle est déjà active, inconnue ou absente) ; gratuite la 1re fois puis 1 PA', () => {
    const t = tpl();
    const p = t.players[0];
    const pick = (modeId) => act(t, p.id, { act: 'skill', skillId: 'templier_aura', modeId });
    eq(skillPaCost(p, content.skills.templier_aura), 0);
    // la vue de combat donne les trois options, dont l'aura actuelle
    const opts = getCombatView(t, p.id).skills.find((x) => x.skillId === 'templier_aura').modePick;
    eq(opts.map((o) => [o.id, o.current]), [['protection', true], ['vengeance', false], ['devotion', false]], 'trois auras, la Protection est active');
    assert(opts.every((o) => o.name && o.icon && o.desc), 'chacune a un nom, une icône et une description');
    assert(getCombatView(t, p.id).skills.filter((x) => x.modePick).length === 1, 'seul ce sort fait choisir un mode');
    // des choix refusés ne coûtent rien et ne changent rien
    const pa0 = p.pa;
    for (const bad of [undefined, 'zzz', 'protection']) {
      const r = pick(bad);
      assert(!r.ok, `choix refusé : ${bad}`);
    }
    assert(/déjà en/.test(pick('protection').error), 'on le dit : « Tu es déjà en … »');
    eq([p.mode, p.pa], ['protection', pa0], 'rien n\'a changé');
    // un choix direct : on saute la Vengeance et on va tout de suite à la Dévotion
    assert(pick('devotion').ok);
    eq([p.mode, p.pa], ['devotion', pa0], '1re utilisation : gratuite, et directement l\'aura voulue');
    eq(skillPaCost(p, content.skills.templier_aura), 1);
    assert(pick('vengeance').ok);
    eq([p.mode, p.pa], ['vengeance', pa0 - 1], 'ensuite 1 PA, quelle que soit l\'aura choisie');
    assert(pick('protection').ok && p.mode === 'protection', 'et on revient à la Protection en un seul geste');
    // le sort du Sacrieur (toggle) ne fait pas choisir
    assert(content.skills.sacrieur_pacte.effects[0].set === 'toggle');
  });

  test('Auras : chacune donne un bonus à TOUTE l\'équipe (lui compris), jamais aux monstres, et seulement tant que le Templier est vivant', () => {
    const t = tpl();
    const [p, ally] = t.players;
    const [m] = t.combat.monsters;
    const d = (u, stat) => auraDelta(t, u, stat);
    assert(near(d(ally, 'taken'), -0.08) && near(d(p, 'taken'), -0.08), 'Protection : −8 % de dégâts reçus pour tous');
    assert(near(d(ally, 'damage'), 0) && near(d(ally, 'healPower'), 0), 'et rien d\'autre');
    assert(near(computeStats(t, m).taken, 1), 'les monstres n\'en profitent pas');
    p.mode = 'vengeance';
    assert(near(d(ally, 'damage'), 0.08) && near(d(p, 'damage'), 0.08) && near(d(ally, 'taken'), 0), 'Vengeance : +8 % de dégâts pour tous');
    p.mode = 'devotion';
    assert(near(d(ally, 'healPower'), 0.15) && near(d(p, 'healPower'), 0.15), 'Dévotion : +15 % de soins et boucliers');
    p.mode = 'protection';
    const takenWith = computeStats(t, ally).taken;
    p.alive = false;
    assert(computeStats(t, ally).taken > takenWith, 'un Templier tombé ne protège plus');
    p.alive = true;
    const hors = { content, players: t.players, combat: null };
    assert(auraSources(hors, ally).length === 0, 'hors combat : aucune aura');
    eq(auraSources(t, ally).map((a) => a.modeId), ['protection']);
  });

  test('Auras renforcées par la spécialisation : Gardien (protection), Lumière (dévotion), Vindicte (vengeance) — selon le Templier, pas selon l\'allié', () => {
    const g = tpl('gardien');
    assert(near(auraDelta(g, g.players[1], 'taken'), -0.10), 'Gardien : l\'allié reçoit 10 % de moins');
    const base = tpl();
    assert(near(auraDelta(base, base.players[1], 'taken'), -0.08), 'sans spécialisation : 8 %');
    assert(computeStats(g, g.players[0]).taken < computeStats(base, base.players[0]).taken - 0.05, 'et le Gardien lui-même encaisse encore moins (Armure de foi)');
    const l = tpl('lumiere'); l.players[0].mode = 'devotion';
    assert(near(auraDelta(l, l.players[1], 'healPower'), 0.25), 'Lumière : +25 % de soins pour l\'allié');
    const v = tpl('vindicte'); v.players[0].mode = 'vengeance';
    assert(near(auraDelta(v, v.players[1], 'damage'), 0.11), 'Vindicte : +11 % de dégâts pour l\'allié');
    // la spécialisation est celle du TEMPLIER : un Gardien ne renforce pas la Vengeance
    const g2 = tpl('gardien'); g2.players[0].mode = 'vengeance';
    assert(near(auraDelta(g2, g2.players[1], 'damage'), 0.08), 'une aura hors de sa spécialisation reste à sa valeur de base');
  });

  test('Interface : l\'aura d\'un allié s\'affiche comme un bonus permanent (pas sur le Templier, dont le mode est déjà affiché)', () => {
    const t = tpl();
    const [p, ally] = t.players;
    const eff = unitEffects(content, ally, t);
    const aura = eff.find((e) => e.kind === 'aura');
    assert(aura && aura.tone === 'buff' && aura.turns === null && /Aura de protection/.test(aura.name) && /8 %/.test(aura.desc) && /Templier/.test(aura.desc), JSON.stringify(aura));
    assert(!unitEffects(content, p, t).some((e) => e.kind === 'aura'), 'pas de doublon sur le Templier');
    assert(!unitEffects(content, ally).some((e) => e.kind === 'aura'), 'sans l\'état de la partie : pas d\'aura (comme avant)');
    eq(describeMods([{ stat: 'taken', pct: -0.08 }, { stat: 'damage', pct: 0.1 }]), 'Dégâts reçus −8 %, Dégâts infligés +10 %');
  });

  test('Spécialisations : chacune fait évoluer les sorts de base ; le Gardien se protège en frappant, la Lumière soigne en frappant', () => {
    const idsOf = (spec) => { const t = tpl(spec); return activeSkillIds(t, t.players[0]); };
    assert(idsOf('gardien').includes('templier_frappe_gardien') && !idsOf('gardien').includes('templier_frappe'), 'Gardien : Frappe du gardien');
    assert(idsOf('lumiere').includes('templier_benediction_lumiere') && idsOf('lumiere').includes('templier_eclat_purificateur'), 'Lumière : Bénédiction de lumière, Éclat purificateur');
    assert(idsOf('vindicte').includes('templier_verdict_vengeur') && idsOf('vindicte').includes('templier_marteau_colere'), 'Vindicte : Verdict vengeur, Marteau de colère');
    assert(idsOf(null).includes('templier_verdict') && idsOf(null).includes('templier_aura'), 'sans spécialisation : les sorts de base');
    const g = tpl('gardien');
    const [gp] = g.players; const [gm] = g.combat.monsters;
    const s0 = sacre(gp);
    gen(g, gp, 'templier_frappe_gardien', gm);
    assert(totalShield(gp) > 0 && sacre(gp) === s0 + 1, 'Frappe du gardien : un bouclier et +1 puissance sacrée');
    const l = tpl('lumiere');
    const [lp, lally] = l.players; const [lm] = l.combat.monsters;
    lally.hp = Math.round(lally.hp * 0.4);
    const before = lally.hp;
    gen(l, lp, 'templier_frappe_lumiere', lm);
    assert(lally.hp > before, 'Frappe de lumière : l\'allié le plus blessé est soigné');
    const spent = lp.resources.sacre; lp.resources.sacre = 3; lally.hp = Math.round(lally.hp * 0.5);
    const hp1 = lally.hp;
    gen(l, lp, 'templier_imposition', lally);
    assert(lally.hp - hp1 >= computeStats(l, lally).hpMax * 0.34, 'Imposition des mains : +35 % des PV max');
    void spent;
  });

  test('Sainte colère (Vindicte) : dépenser de la puissance sacrée donne +20 % de dégâts pendant 2 tours, dès ce coup-là', () => {
    const t = tpl('vindicte');
    const p = t.players[0];
    const [m] = t.combat.monsters;
    p.resources.sacre = 3;
    const base = computeStats(t, p).damage;
    noDice('templier_verdict_vengeur', () => assert(cast(t, p.id, 'templier_verdict_vengeur', m.id).ok));
    const buff = p.statuses.find((st) => st.id === 'mod' && st.stat === 'damage');
    assert(buff && near(buff.pct, 0.2) && buff.turns >= 2, 'le bonus est posé');
    assert(near(computeStats(t, p).damage, base + 0.2), 'et il compte');
    // un sort qui ne dépense rien ne le déclenche pas
    const t2 = tpl('vindicte');
    gen(t2, t2.players[0], 'templier_frappe_vengeresse', t2.combat.monsters[0]);
    assert(!t2.players[0].statuses.some((st) => st.id === 'mod'), 'la Frappe ne dépense rien : pas de colère');
  });

  test('palier 8 Gardien : Serment de fer, Sanctuaire (garde toute l\'équipe), Dernier rempart (survit une fois)', () => {
    const t = tpl('gardien');
    const [p, ally] = t.players;
    const before0 = sacre(p); // (son tour vient de commencer : le Serment a déjà donné son point)
    fireTriggers(t, 'turnStart', { unit: p });
    eq(sacre(p), before0 + 1, 'Serment de fer : +1 au début du tour');
    p.resources.sacre = 5;
    gen(t, p, 'templier_sanctuaire', t.players);
    t.players.forEach((u) => assert(statusOf(u, 'guard'), `${u.name} est gardé`));
    const [m] = t.combat.monsters;
    p.resources.sacre = 0;
    dealDamage(t, m, p, 99999);
    assert(p.alive && p.hp === 1, 'Dernier rempart : il survit à 1 PV');
    assert(totalShield(p) > 0 && sacre(p) >= 3, 'avec un bouclier et 3 puissance sacrée');
    dealDamage(t, m, p, 99999);
    assert(!p.alive, 'une seule fois par combat');
    void ally;
  });

  test('palier 8 Lumière : Source de vie, Miracle (ressuscite, 5 puissance sacrée), Prière (soin sur la durée + 2 puissance)', () => {
    const t = tpl('lumiere');
    const [p, ally] = t.players;
    ally.hp = Math.round(ally.hp * 0.3);
    const hp = ally.hp;
    fireTriggers(t, 'turnStart', { unit: p });
    assert(ally.hp > hp, 'Source de vie soigne l\'allié le plus blessé');
    ally.alive = false; ally.ghost = true; ally.hp = 0;
    p.resources.sacre = 4;
    assert(!checkUsable(t, p, content.skills.templier_miracle).ok, 'Miracle : 5 puissance sacrée requises');
    p.resources.sacre = 5;
    assert(checkUsable(t, p, content.skills.templier_miracle).ok);
    p.pa = 6;
    assert(cast(t, p.id, 'templier_miracle', ally.id).ok);
    assert(ally.alive && sacre(p) === 0, 'l\'allié revit, 5 points dépensés');
    gen(t, p, 'templier_priere', t.players);
    assert(t.players.every((u) => statusOf(u, 'hot')) && sacre(p) === 2, 'Prière : un soin sur 3 tours pour tous, +2 puissance sacrée');
  });

  test('palier 8 Vindicte : Jugement final (5 points, énorme), Flamme sacrée (une brûlure par tour), Croisé infatigable (achever : +2 puissance, +1 PA)', () => {
    const t = tpl('vindicte');
    const [p] = t.players;
    const [m, m2] = t.combat.monsters;
    const dmg = (id) => { const b = m2.hp; gen(t, p, id, m2); const d = b - m2.hp; m2.hp = b; return d; };
    assert(dmg('templier_jugement_final') > 1.4 * dmg('templier_verdict_vengeur'), 'le Jugement final dépasse nettement le Verdict');
    assert(content.skills.templier_jugement_final.spend.amount === 5);
    p.flags = {}; // (les essais de dégâts ci-dessus ont déjà brûlé ce tour)
    dealDamage(t, p, m, 5);
    assert(statusOf(m, 'dot'), 'Flamme sacrée : la cible brûle');
    const burns = m.statuses.filter((st) => st.id === 'dot').length;
    dealDamage(t, p, m, 5);
    eq(m.statuses.filter((st) => st.id === 'dot').length, burns, 'une seule brûlure par tour');
    p.pa = 0; p.resources.sacre = 0;
    m2.immortal = false; m2.hp = 1;
    dealDamage(t, p, m2, 50);
    assert(!m2.alive && sacre(p) === 2 && p.pa === 1, `achever : +2 puissance sacrée (${sacre(p)}) et +1 PA (${p.pa})`);
  });

  test('Textes : une ressource s\'affiche par son NOM (« Puissance sacrée », « Élan »), jamais par son identifiant ; les résumés ignorent les effets conditionnels', () => {
    eq(resourceName(content, content.skills.templier_verdict, 'sacre'), 'Puissance sacrée');
    eq(resourceName(content, content.skills.duelliste_estoc, 'elan'), 'Élan');
    eq(resourceName(null, content.skills.templier_verdict, 'sacre'), 'sacre', 'sans le contenu : l\'identifiant, faute de mieux');
    assert(/\+1 puissance sacrée/.test(skillBlurb(content.skills.templier_frappe, content)), skillBlurb(content.skills.templier_frappe, content));
    assert(!/sacre\b/.test(skillBlurb(content.skills.templier_frappe, content)), 'plus d\'identifiant brut');
    assert(/choix du mode/.test(skillBlurb(content.skills.templier_aura, content)) && /change de mode/.test(skillBlurb(content.skills.sacrieur_pacte, content)));
    assert(/marque la cible/.test(skillBlurb(content.skills.assassin_marque, content)));
    const garrot = skillBlurb(content.skills.assassin_garrot, content);
    assert(!/étourdit/.test(garrot), `le Garrot n'étourdit que la cible marquée : le résumé ne le promet pas sans condition (${garrot})`);
    assert(/venin 3 t\./.test(skillBlurb(content.skills.assassin_lame_venimeuse, content)), 'le venin est nommé (pas « saignement »)');
    const poudre = skillBlurb(content.skills.assassin_poudre, content);
    assert((poudre.match(/Dégâts/g) || []).length === 1, `un seul malus annoncé, pas la version « si marquée » en double (${poudre})`);
  });

  test('Les JSON : auras, conditions de spécialisation et événement « spend » mal écrits sont expliqués en français', () => {
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw.classes.classes.templier); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    const sk = (c, id) => c.skills.find((x) => x.id === id);
    let msg = tryBuild((c) => { c.modes.list.protection.aura = []; });
    assert(msg.includes('aura') && msg.includes('liste'), msg);
    msg = tryBuild((c) => { c.modes.list.protection.aura[0].stat = 'armure'; });
    assert(msg.includes('armure') && msg.includes('inconnue'), msg);
    msg = tryBuild((c) => { c.modes.list.protection.aura[1].if = { spec: 'paladin' }; });
    assert(msg.includes('paladin') && msg.includes('gardien'), msg);
    msg = tryBuild((c) => { c.modes.list.protection.aura[0].if = { hpPctBelow: 50 }; });
    assert(msg.includes('hpPctBelow') && msg.includes('aura'), msg);
    msg = tryBuild((c) => { sk(c, 'templier_armure_foi').modifiers[0].if = { spec: 'chevalier' }; });
    assert(msg.includes('chevalier') && msg.includes('inconnue'), msg);
    msg = tryBuild((c) => { sk(c, 'templier_sainte_colere').triggers[0].on = 'depense'; });
    assert(msg.includes('depense') && msg.includes('spend'), msg);
    msg = tryBuild((c) => { sk(c, 'templier_verdict').spend = { id: 'sacre' }; });
    assert(msg.includes('spend'), msg);
  });
}

console.log('\n● Donjons à thème : plusieurs donjons par tranche, mécaniques de monstres, butin exclusif');
{
  const A3 = ['berserker', 'veilleur', 'duelliste'];
  /** Un combat contre des monstres choisis (dans un donjon donné) : on remplace les mannequins d'une salle d'entraînement. */
  const fight = (monsterIds, { heroes = [{ classId: 'berserker', level: 8 }], dungeon = null } = {}) => {
    const t = training(heroes, { count: 1 });
    if (dungeon) { t.setup.dungeon = dungeon; t.setup.tranche = content.dungeons[dungeon].tranche; }
    t.training = null; // (de vrais monstres : ils meurent, ils ne se soignent pas tout seuls)
    t.combat.monsters = monsterIds.map((id, i) => makeMonster(t, id, i + 1, ''));
    t.combat.timeline = [...t.players.map((p) => p.id), ...t.combat.monsters.map((m) => m.id)];
    return t;
  };
  const statusOf = (u, id) => u.statuses.find((st) => st.id === id);
  const eff = (t, caster, e, targets) => applyEffect(t, caster, e, targets, { outcome: 'hit', skill: { id: 'x' } });

  test('7 donjons jouables : 1 au niveau 1, 3 au niveau 4, 3 au niveau 8 ; les suivants sont annoncés (jusqu\'aux dragons)', () => {
    eq(dungeonsOf(content, 1).map((d) => d.id), ['caves_humides']);
    eq(dungeonsOf(content, 4).map((d) => d.id), ['crypte_oubliee', 'repaire_coupe_jarrets', 'soues_de_grouinval']);
    eq(dungeonsOf(content, 8).map((d) => d.id), ['profondeurs_dechues', 'sanctuaire_sans_repos', 'gouffre_aux_ogres']);
    eq(dungeonsOf(content, 4).map((d) => d.complexity), ['simple', 'simple', 'simple'], 'niveau 4 : des donjons simples');
    eq(dungeonsOf(content, 8).map((d) => d.complexity), ['mecaniques', 'mecaniques', 'mecaniques'], 'niveau 8 : des mécaniques dédiées');
    const soon = content.dungeonList.filter((d) => d.available === false);
    eq(soon.map((d) => d.tranche), [12, 16, 20]);
    assert(/Dragons/.test(soon[2].name), 'le dernier : les dragons');
    for (const d of content.dungeonList.filter((x) => x.available !== false)) {
      assert(d.mechanics?.length >= 1 && d.loot?.length >= 4 && d.theme && d.description, `${d.id} : thème, « à savoir » et table de butin`);
      for (const id of [...d.monsterPool, d.bossId]) assert(content.monsters[id].family, `${id} a une famille`);
      assert(content.monsters[d.bossId].boss, `${d.id} : son boss en est un`);
    }
    // chaque monstre appartient à UN donjon (sauf ceux de la zone de farm, partagés avec les Caves)
    const seen = {};
    for (const d of content.dungeonList) for (const id of d.monsterPool || []) { assert(!seen[id], `${id} est dans deux donjons`); seen[id] = d.id; }
  });

  test('une partie se joue dans le donjon choisi : son nom, ses monstres, son boss ; sans choix, le premier de la tranche', () => {
    const s = createRun(content, { tranche: 4, dungeon: 'soues_de_grouinval', mode: 'tranche' }, makeParty(content, A3, 4, 'none', 1), 5);
    eq([s.setup.dungeon, s.dungeon.id, s.dungeon.name], ['soues_de_grouinval', 'soues_de_grouinval', 'Les Soues de Grouinval']);
    const pool = content.dungeons.soues_de_grouinval.monsterPool;
    for (let i = 0; i < 12; i++) for (const m of spawnMonsters(s, false)) assert(pool.includes(m.defId), `${m.defId} n'est pas un monstre de ce donjon`);
    eq(spawnMonsters(s, true).map((m) => m.defId), ['grand_verrat'], 'son boss');
    const def = createRun(content, { tranche: 4, mode: 'tranche' }, makeParty(content, A3, 4, 'none', 1), 5);
    eq(def.setup.dungeon, 'crypte_oubliee', 'sans choix : le premier donjon de la tranche');
    eq(dungeonRules(content, { tranche: 4 }).bossId, 'seigneur_des_ossements');
    eq(dungeonRules(content, { tranche: 4, dungeon: 'repaire_coupe_jarrets' }).boardLength, content.tranches[4].boardLength, 'les réglages de la tranche s\'appliquent au donjon');
    // des choix refusés
    for (const bad of ['inconnu', 'gouffre_aux_ogres', 'aire_des_dragons']) {
      let msg = '';
      try { createRun(content, { tranche: 4, dungeon: bad, mode: 'tranche' }, makeParty(content, A3, 4, 'none', 1), 5); } catch (e) { msg = e.message; }
      assert(/donjon/.test(msg), `donjon « ${bad} » refusé pour la tranche 4 : ${msg}`);
    }
    // une ancienne partie sauvegardée (sans donjon) continue dans le premier donjon de sa tranche
    const old = cloneState(def); delete old.setup.dungeon;
    eq(dungeonIdOf(content, old.setup), 'crypte_oubliee');
  });

  test('chaque donjon se joue jusqu\'au bout (robots), et le journal porte son nom', () => {
    for (const d of content.dungeonList.filter((x) => x.available !== false)) {
      const { state } = playRun(content, { tranche: d.tranche, dungeon: d.id, mode: 'tranche' }, makeParty(content, ['sacrieur', 'veilleur', 'assassin'], d.tranche, 'decent', 3), 4242);
      assert(state.phase === 'ended', `${d.id} se termine`);
      assert(state.log.some((l) => l.text.includes(d.name)), `${d.id} : son nom est dans le journal`);
    }
  });

  test('escorte de boss : autant de gardes que le groupe le permet (aucun en solo) ; `minMonsters` garantit un combat à plusieurs même en solo', () => {
    const boss = (dungeon, tranche, size) => {
      const s = createRun(content, { tranche, dungeon, mode: 'tranche' }, makeParty(content, ['berserker', 'veilleur', 'duelliste', 'druide_ancien'].slice(0, size), tranche, 'none', 1), 5);
      return spawnMonsters(s, true).map((m) => m.defId);
    };
    eq(boss('repaire_coupe_jarrets', 4, 1), ['capitaine_balafre'], 'en solo : le boss seul');
    eq(boss('repaire_coupe_jarrets', 4, 3), ['capitaine_balafre', 'arbaletrier_borgne']);
    eq(boss('soues_de_grouinval', 4, 4), ['grand_verrat'], 'un boss sans escorte reste seul');
    // le Sanctuaire : au moins 2 monstres par combat (sans cadavre à relever, sa mécanique n'existerait pas)
    eq(boss('sanctuaire_sans_repos', 8, 1), ['hierophante', 'squelette_releve']);
    eq(boss('sanctuaire_sans_repos', 8, 3), ['hierophante', 'squelette_releve', 'acolyte_reanimateur']);
    eq(boss('sanctuaire_sans_repos', 8, 4), ['hierophante', 'squelette_releve', 'acolyte_reanimateur', 'squelette_releve']);
    const solo = createRun(content, { tranche: 8, dungeon: 'gouffre_aux_ogres', mode: 'tranche' }, makeParty(content, ['berserker'], 8, 'none', 1), 5);
    for (let i = 0; i < 10; i++) assert(spawnMonsters(solo, false).length >= 2, 'en solo aussi : au moins 2 ogres');
    const caves = createRun(content, { tranche: 1, mode: 'tranche' }, makeParty(content, ['berserker'], 1, 'none', 1), 5);
    for (let i = 0; i < 10; i++) eq(spawnMonsters(caves, false).length, 1, 'un donjon simple en solo : un seul monstre');
  });

  test('Régénération (ogres) : +4 % de PV au début du tour, sauf s\'il saigne ou est empoisonné', () => {
    const t = fight(['ogre_brise_os']);
    const [m] = t.combat.monsters;
    m.hp = Math.round(m.hpMax * 0.5);
    const hp = m.hp;
    fireTriggers(t, 'turnStart', { unit: m });
    assert(Math.abs((m.hp - hp) - Math.round(m.hpMax * 0.04)) <= 1, `régénère 4 % (${m.hp - hp} PV)`);
    const hp2 = m.hp;
    m.statuses.push({ id: 'dot', amount: 1, turns: 3, label: 'saigne' });
    fireTriggers(t, 'turnStart', { unit: m });
    eq(m.hp, hp2, 'il saigne : pas de régénération');
    m.statuses = [{ id: 'poison', pct: 0.01, turns: 2 }];
    fireTriggers(t, 'turnStart', { unit: m });
    eq(m.hp, hp2, 'empoisonné : pas de régénération non plus');
    m.statuses = [{ id: 'stun', turns: 1 }];
    fireTriggers(t, 'turnStart', { unit: m });
    assert(m.hp > hp2, 'un autre malus ne l\'empêche pas');
    assert(content.monsters.roi_ogre.passives.includes('regeneration_royale') && content.monsters.ogresse_chamane.passives.includes('regeneration'), 'toute la famille se régénère');
  });

  test('Coup de massue et Fracas : les boucliers volent en éclats avant le coup', () => {
    const t = fight(['ogre_brise_os']);
    const [p] = t.players; const [m] = t.combat.monsters;
    addShield(t, p, 30, 2, p);
    assert(totalShield(p) > 0);
    const hp = p.hp;
    for (const e of content.skills.coup_de_massue.effects) eff(t, m, e, [p]);
    eq(totalShield(p), 0, 'plus de bouclier');
    assert(p.hp < hp, 'et les PV sont touchés (le bouclier n\'a rien absorbé)');
    assert(content.skills.fracas.effects[0].type === 'breakShield' && content.skills.fracas.target === 'enemies');
  });

  test('Réanimation : un acolyte relève un monstre tombé (60 % de ses PV), une seule fois chacun, jamais un boss', () => {
    const t = fight(['acolyte_reanimateur', 'zelote_fanatique', 'hierophante']);
    const [aco, zel, boss] = t.combat.monsters;
    const sk = content.skills.relever_les_morts;
    eq(validTargets(t, aco, sk), [], 'personne à relever : la compétence n\'est pas proposée');
    zel.alive = false; zel.hp = 0; zel.statuses = [{ id: 'dot', amount: 3, turns: 2 }];
    eq(validTargets(t, aco, sk), [zel.id]);
    assert(canBeRaised(zel) && !canBeRaised(aco));
    castSkill(t, aco, sk, zel.id);
    assert(zel.alive && zel.raised && Math.abs(zel.hp - Math.round(zel.hpMax * 0.6)) <= 1, `relevé à 60 % de ses PV (${zel.hp})`);
    eq(zel.statuses, [], 'sans ses anciens statuts');
    assert(t.events.some((e) => e.type === 'revive' && e.target === zel.id), 'l\'écran est prévenu');
    zel.alive = false; zel.hp = 0;
    eq(validTargets(t, aco, sk), [], 'un monstre ne se relève qu\'une fois');
    boss.alive = false; boss.hp = 0;
    eq(validTargets(t, aco, sk), [], 'un boss ne se relève pas');
    // les récompenses ne sont pas comptées deux fois : un monstre = une entrée dans le combat
    eq(t.combat.monsters.length, 3);
  });

  test('IA : un réanimateur annonce « Relever les morts » dès qu\'un cadavre existe ; un soigneur ne gaspille pas son soin', () => {
    const t = fight(['acolyte_reanimateur', 'squelette_releve']);
    const [aco, sq] = t.combat.monsters;
    sq.alive = false; sq.hp = 0;
    let planned = false;
    for (let i = 0; i < 12 && !planned; i++) { planMonsters(t); planned = aco.plan.some((st) => st.skillId === 'relever_les_morts' && st.targetId === sq.id); }
    assert(planned, 'il prévoit de relever le squelette');
    const h = fight(['pretresse_des_cendres', 'zelote_fanatique']);
    const [pr] = h.combat.monsters;
    for (let i = 0; i < 12; i++) { planMonsters(h); assert(!pr.plan.some((st) => st.skillId === 'soin_obscur'), 'personne n\'est blessé : pas de soin'); }
    h.combat.monsters[1].hp = 10;
    let heals = false;
    for (let i = 0; i < 20 && !heals; i++) { planMonsters(h); heals = pr.plan.some((st) => st.skillId === 'soin_obscur'); }
    assert(heals, 'un allié blessé : elle soigne');
  });

  test('Gouffre aux Ogres : la chamane soigne le roi de 15 % de ses PV, au plus un round sur deux (et plus de 30 % comme le Soin obscur)', () => {
    const sk = content.monsterSkills?.remede_de_chamane || content.skills.remede_de_chamane;
    eq(sk.effects[0].pctMaxHp, 0.15); eq(sk.cooldown, 2);
    assert(!content.monsters.ogresse_chamane.skills.some((s) => (s.skill ?? s) === 'soin_obscur'), 'elle n\'a plus le Soin obscur');
    const t = fight(['roi_ogre', 'ogresse_chamane']);
    const [roi, ch] = t.combat.monsters;
    roi.hp = Math.round(roi.hpMax * 0.5);
    let heals = false;
    for (let i = 0; i < 20 && !heals; i++) { planMonsters(t); heals = ch.plan.some((st) => st.skillId === 'remede_de_chamane' && st.targetId === roi.id); }
    assert(heals, 'le roi blessé : elle prévoit de le soigner');
    ch.cooldowns.remede_de_chamane = 1;
    for (let i = 0; i < 12; i++) { planMonsters(t); assert(!ch.plan.some((st) => st.skillId === 'remede_de_chamane'), 'pas pendant sa recharge'); }
  });

  test('Sans repos (squelette relevé) : il se redresse une fois à 35 % de ses PV ; un saignement l\'achève pour de bon', () => {
    const t = fight(['squelette_releve']);
    const [p] = t.players; const [m] = t.combat.monsters;
    dealDamage(t, p, m, 99999);
    assert(m.alive && Math.abs(m.hp - Math.round(m.hpMax * 0.35)) <= 1, `se relève à 35 % (${m.hp}/${m.hpMax})`);
    dealDamage(t, p, m, 99999);
    assert(!m.alive, 'la 2e fois, il tombe');
    const t2 = fight(['squelette_releve']);
    const [m2] = t2.combat.monsters;
    m2.hp = 2; m2.statuses.push({ id: 'dot', amount: 50, turns: 2, label: 'saigne' });
    tickStatusEffects(t2, m2);
    assert(!m2.alive, 'un saignement l\'achève sans qu\'il se relève');
  });

  test('Voile d\'ossements (Hiérophante) : −40 % de dégâts reçus tant qu\'un serviteur est debout', () => {
    const t = fight(['hierophante', 'squelette_releve']);
    const [boss, sq] = t.combat.monsters;
    assert(Math.abs(computeStats(t, boss).taken - 0.6) < 1e-9, 'serviteur debout : −40 %');
    sq.alive = false;
    eq(computeStats(t, boss).taken, 1, 'plus de serviteur : dégâts normaux');
  });

  test('Embuscade (bandits) : +25 % de dégâts au premier round seulement ; Fureur porcine sous la moitié des PV', () => {
    const t = fight(['coupe_jarret', 'grand_verrat']);
    const [b, v] = t.combat.monsters;
    t.combat.round = 1;
    assert(Math.abs(computeStats(t, b).damage - 1.25) < 1e-9, 'round 1 : +25 %');
    t.combat.round = 2;
    eq(computeStats(t, b).damage, 1, 'ensuite : normal');
    eq(computeStats(t, v).damage, 1);
    v.hp = Math.round(v.hpMax * 0.4);
    assert(Math.abs(computeStats(t, v).damage - 1.4) < 1e-9, 'le Grand Verrat blessé : +40 %');
    assert(content.skills.charge.cooldown >= 2 && content.skills.charge.effects[0].power >= 2, 'la Charge : un gros coup, avec une relance (annoncée un round avant)');
  });

  test('Riposte et Incorporel (Profondeurs) : frapper un chevalier coûte un coup ; un spectre encaisse mieux les coups que les saignements', () => {
    const t = fight(['chevalier_dechu', 'spectre_affame']);
    const [p] = t.players; const [chev, sp] = t.combat.monsters;
    const hp = p.hp;
    dealDamage(t, p, chev, 10);
    assert(p.hp < hp, 'le chevalier riposte');
    const hp2 = p.hp;
    chev.statuses.push({ id: 'dot', amount: 5, turns: 2, label: 'saigne' });
    tickStatusEffects(t, chev);
    eq(p.hp, hp2, 'un saignement ne déclenche pas de riposte');
    assert(Math.abs(computeStats(t, sp).taken - 0.7) < 1e-9, 'spectre : −30 % sur les coups');
    const before = sp.hp;
    applyDamage(t, sp, 20, p);
    assert(Math.abs((before - sp.hp) - 14) <= 1, `un coup de 20 lui fait 14 (${before - sp.hp})`);
    sp.statuses.push({ id: 'dot', amount: 20, turns: 2, label: 'saigne' });
    const b2 = sp.hp;
    tickStatusEffects(t, sp);
    eq(b2 - sp.hp, 20, 'un saignement de 20 lui fait bien 20');
  });

  test('butin : un objet exclusif ne tombe que dans SON donjon ; le boss en donne toujours un ; jamais au farm ni chez le marchand', () => {
    const own = content.itemDungeon;
    eq(own.massue_de_gromm, 'gouffre_aux_ogres');
    assert(Object.keys(own).length >= 28, `${Object.keys(own).length} objets exclusifs`);
    const run = (dungeon, tranche) => createRun(content, { tranche, dungeon, mode: 'tranche' }, makeParty(content, A3, tranche, 'none', 1), 11);
    const ogres = run('gouffre_aux_ogres', 8);
    const prof = run('profondeurs_dechues', 8);
    let mine = 0;
    for (let i = 0; i < 400; i++) {
      const a = rollItem(ogres, { boost: 2 });
      assert(!own[a.id] || own[a.id] === 'gouffre_aux_ogres', `${a.id} (exclusif à ${own[a.id]}) est tombé au Gouffre aux Ogres`);
      if (own[a.id]) mine++;
      const b = rollItem(prof, { boost: 2 });
      assert(!own[b.id] || own[b.id] === 'profondeurs_dechues', `${b.id} est tombé aux Profondeurs`);
    }
    assert(mine > 80 && mine < 170, `environ un objet sur trois vient de la table du donjon (${mine} sur 400)`);
    for (let i = 0; i < 40; i++) eq(own[rollItem(ogres, { boost: 1, exclusiveOnly: true }).id], 'gouffre_aux_ogres', 'le 1er objet du boss vient de la table du donjon');
    for (let i = 0; i < 200; i++) assert(!own[rollShopItem(ogres).id], 'jamais chez le marchand');
    const farm = createFarm(content, makeParty(content, ['berserker'], 3, 'none', 1)[0], { seed: 3 });
    const zone = content.farm.zones.terriers;
    for (let i = 0; i < 300; i++) assert(!own[rollFarmItem(farm, zone, zone.rewards.choiceTiers.at(-1).rarityWeights).id], 'jamais au farm');
    // chaque table offre plusieurs raretés
    for (const d of content.dungeonList.filter((x) => x.loot)) assert(new Set(d.loot.map((id) => content.items[id].rarity)).size >= 3, `${d.id} : au moins trois raretés`);
  });

  test('fin de partie : on retient quel donjon a été terminé (pour l\'encyclopédie), en plus de la tranche', () => {
    const party = makeParty(content, ['sacrieur', 'templier', 'assassin'], 8, 'good', 2);
    let state;
    for (let seed = 1; seed < 40; seed++) { ({ state } = playRun(content, { tranche: 4, dungeon: 'soues_de_grouinval', mode: 'basic' }, party, seed)); if (state.result.won) break; }
    assert(state.result.won, 'une victoire');
    applyRunResult(content, party, state);
    eq(party[0].stats.dungeons.soues_de_grouinval, 1);
    eq(party[0].stats.clears['4'].total, 1);
  });

  test('en combat : les particularités d\'un monstre s\'affichent dans ses effets (« Régénération », « Riposte »...)', () => {
    const t = fight(['ogre_brise_os']);
    const traits = unitEffects(content, t.combat.monsters[0], t).filter((e) => e.kind === 'trait');
    eq(traits.map((e) => [e.name, e.tone, e.turns]), [['Régénération', 'neutral', null]]);
    assert(/saigne/.test(traits[0].desc));
    eq(unitEffects(content, t.players[0], t).filter((e) => e.kind === 'trait').length, 0, 'un héros n\'en a pas');
  });


  test('Renforts : le Roi des Rats appelle sa meute (2 rats au plus à la fois), sans or ni XP ; il ne l\'annonce plus quand ils sont tous là', () => {
    const t = fight(['roi_des_rats'], { heroes: [{ classId: 'berserker', level: 3 }] });
    const [boss] = t.combat.monsters;
    const sk = content.skills.appel_de_la_meute;
    castSkill(t, boss, sk);
    eq(t.combat.monsters.map((m) => m.defId), ['roi_des_rats', 'rat_geant']);
    const rat = t.combat.monsters[1];
    assert(rat.alive && rat.summonedBy === boss.id && rat.xp === 0 && rat.gold[1] === 0, 'un renfort ne rapporte rien');
    assert(t.combat.timeline.includes(rat.id) && t.events.some((e) => e.type === 'summon' && e.target === rat.id), 'il entre dans la frise, et l\'écran est prévenu');
    castSkill(t, boss, sk); castSkill(t, boss, sk);
    eq(t.combat.monsters.filter((m) => m.alive && m.summonedBy).length, 2, 'jamais plus de 2 renforts vivants');
    eq(new Set(t.combat.monsters.map((m) => m.id)).size, t.combat.monsters.length, 'des identifiants tous différents');
    boss.cooldowns = {};
    for (let i = 0; i < 15; i++) { planMonsters(t); assert(!boss.plan.some((st) => st.skillId === 'appel_de_la_meute'), 'meute au complet : il ne l\'appelle plus'); }
    t.combat.monsters[1].alive = false;
    let again = false;
    for (let i = 0; i < 30 && !again; i++) { planMonsters(t); again = boss.plan.some((st) => st.skillId === 'appel_de_la_meute'); }
    assert(again, 'un rat tombé : il en rappelle un');
    assert(content.monsters.capitaine_balafre.skills.some((x) => x.skill === 'a_moi_la_bande'), 'La Balafre a aussi ses renforts');
  });

  test('Panoplies : 2 puis 3 pièces de la table d\'un donjon donnent des bonus ; un objet maudit ou trop haut pour la tranche ne compte pas', () => {
    const ch = makeParty(content, ['berserker'], 8, 'none', 1)[0];
    const wear = (...ids) => { for (const s of EQUIP_SLOTS) ch.equipment[s] = null; ids.forEach((id, i) => { const slot = slotsFor(content.items[id])[0]; ch.equipment[slot] = { uid: `u${i}`, id }; }); };
    const run = (tranche = 8) => createRun(content, { tranche, mode: 'tranche' }, [ch], 3);
    wear();
    const base = computeStats(run(), run().players[0]);
    wear('dent_d_ogre');
    eq(activeSets({ content }, ch).map((x) => [x.name, x.pieces, x.bonuses.length]), [['Panoplie de Gromm', 1, 0]], 'une pièce : pas encore de bonus');
    wear('dent_d_ogre', 'marmite_cabossee');
    let st = run(); let p = st.players[0];
    eq(activeSets(st, p)[0].bonuses.map((b) => b.pieces), [2]);
    const two = computeStats(st, p);
    const gear2 = content.items.dent_d_ogre.stats.hp + content.items.marmite_cabossee.stats.hp;
    eq(two.hpMax - base.hpMax, gear2 + 14, '2 pièces : +14 PV en plus des stats des objets');
    eq(two.taken, base.taken);
    wear('dent_d_ogre', 'marmite_cabossee', 'ceinture_en_peau_d_ogre');
    st = run(); p = st.players[0];
    eq(activeSets(st, p)[0].bonuses.map((b) => b.pieces), [2, 3]);
    assert(Math.abs(computeStats(st, p).taken - (base.taken - 0.08)) < 1e-9, '3 pièces : −8 % de dégâts reçus');
    p.cursedUid = p.equipment.belt.uid;
    eq(activeSets(st, p)[0].pieces, 2, 'un objet maudit ne compte plus');
    const low = run(4);
    eq(activeSets(low, low.players[0]), [], 'en tranche 4, des objets de niveau 8 sont inactifs : pas de panoplie');
    for (const d of content.dungeonList.filter((x) => x.available !== false)) assert(d.setName && d.setBonus?.length >= 1, `${d.id} a sa panoplie`);
  });

  test('Collection : la fin de partie retient les monstres vaincus (même en cas de défaite) et les objets exclusifs rapportés (victoire seulement)', () => {
    const party = makeParty(content, ['sacrieur', 'templier', 'assassin'], 8, 'good', 2);
    let state;
    for (let seed = 1; seed < 60; seed++) { ({ state } = playRun(content, { tranche: 1, dungeon: 'caves_humides', mode: 'basic' }, party, seed)); if (state.result.won) break; }
    assert(state.result.won && Object.keys(state.kills).length >= 2 && state.kills.roi_des_rats === 1, `les monstres vaincus sont comptés (${JSON.stringify(state.kills)})`);
    const p0 = state.players[0];
    p0.bag.push({ uid: 'zz1', id: 'croc_roi_rat' }, { uid: 'zz2', id: 'capuchon_de_toile_rapee' });
    applyRunResult(content, party, state);
    eq(party[0].stats.bestiary.roi_des_rats, 1);
    assert(party[0].stats.found.croc_roi_rat && !party[0].stats.found.capuchon_de_toile_rapee, 'le Croc du Roi-Rat est noté, pas le capuchon ordinaire');
    assert(Object.keys(party[0].stats.found).every((id) => content.itemDungeon[id] === 'caves_humides'), 'seuls les objets exclusifs entrent dans la collection');
    // une défaite : le bestiaire avance, pas les objets
    const weak = makeParty(content, ['duelliste'], 1, 'none', 1);
    let lost;
    for (let seed = 1; seed < 60; seed++) { ({ state: lost } = playRun(content, { tranche: 8, dungeon: 'gouffre_aux_ogres', mode: 'basic' }, weak, seed)); if (!lost.result.won) break; }
    lost.kills = { ogre_brise_os: 2 };
    applyRunResult(content, weak, lost);
    eq([weak[0].stats.bestiary.ogre_brise_os, Object.keys(weak[0].stats.found).length, weak[0].stats.dungeons.gouffre_aux_ogres], [2, 0, undefined]);
    // la sauvegarde garde la collection, et oublie ce qui n'existe plus
    const kept = sanitizeCharacter(content, { ...party[0], stats: { ...party[0].stats, bestiary: { roi_des_rats: 3, dragon_inconnu: 9 }, found: { croc_roi_rat: true, capuchon_de_toile_rapee: true }, dungeons: { caves_humides: 2, nulle_part: 1 } } });
    eq([kept.stats.bestiary, kept.stats.found, kept.stats.dungeons], [{ roi_des_rats: 3 }, { croc_roi_rat: true }, { caves_humides: 2 }]);
  });

  test('Les JSON : renforts et panoplies mal écrits sont expliqués en français', () => {
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    const dj = (raw, id) => raw.dungeons.dungeons.find((d) => d.id === id);
    let msg = tryBuild((r) => { r.monsters.skills.appel_de_la_meute.effects[0].monster = 'licorne'; });
    assert(msg.includes('licorne') && msg.includes('summon'), msg);
    msg = tryBuild((r) => { delete r.monsters.skills.appel_de_la_meute.effects[0].monster; });
    assert(msg.includes('monster'), msg);
    msg = tryBuild((r) => { dj(r, 'gouffre_aux_ogres').setBonus[0].pieces = 1; });
    assert(msg.includes('setBonus') && msg.includes('pieces'), msg);
    msg = tryBuild((r) => { dj(r, 'gouffre_aux_ogres').setBonus[1].pieces = 9; });
    assert(msg.includes('9 pièces'), msg);
    msg = tryBuild((r) => { delete dj(r, 'gouffre_aux_ogres').setName; });
    assert(msg.includes('setName'), msg);
    msg = tryBuild((r) => { dj(r, 'gouffre_aux_ogres').setBonus[0].modifiers[0].stat = 'force'; });
    assert(msg.includes('force'), msg);
  });

  test('Les JSON : donjons, particularités et butin mal écrits sont expliqués en français', () => {
    const tryBuild = (fn) => { const raw = loadRaw(); fn(raw); try { buildContent(raw); return ''; } catch (e) { return e.message; } };
    const dj = (raw, id) => raw.dungeons.dungeons.find((d) => d.id === id);
    let msg = tryBuild((r) => { dj(r, 'gouffre_aux_ogres').bossId = 'dragon'; });
    assert(msg.includes('gouffre_aux_ogres') && msg.includes('dragon'), msg);
    msg = tryBuild((r) => { dj(r, 'gouffre_aux_ogres').tranche = 9; });
    assert(msg.includes('tranche') && msg.includes('9'), msg);
    msg = tryBuild((r) => { dj(r, 'gouffre_aux_ogres').loot.push('epee_inconnue'); });
    assert(msg.includes('epee_inconnue'), msg);
    msg = tryBuild((r) => { dj(r, 'crypte_oubliee').loot.push('massue_de_gromm'); });
    assert(msg.includes('massue_de_gromm') && (msg.includes('trop haut') || msg.includes('déjà')), msg);
    msg = tryBuild((r) => { dj(r, 'soues_de_grouinval').loot.push('talisman_os'); });
    assert(msg.includes('talisman_os') && msg.includes('déjà'), msg);
    msg = tryBuild((r) => { dj(r, 'sanctuaire_sans_repos').bossEscort.push('fantome_inconnu'); });
    assert(msg.includes('fantome_inconnu') && msg.includes('bossEscort'), msg);
    msg = tryBuild((r) => { dj(r, 'caves_humides').mechanics = [{ name: 'Sans texte' }]; });
    assert(msg.includes('mechanics'), msg);
    msg = tryBuild((r) => { r.dungeons.dungeons.push({ ...dj(r, 'caves_humides') }); });
    assert(msg.includes('deux fois'), msg);
    msg = tryBuild((r) => { r.monsters.monsters.find((m) => m.id === 'ogre_brise_os').passives = ['inconnue']; });
    assert(msg.includes('inconnue') && msg.includes('passives'), msg);
    msg = tryBuild((r) => { r.monsters.passives.regeneration.triggers[0].if = { notAfflicted: 'oui' }; });
    assert(msg.includes('notAfflicted'), msg);
    msg = tryBuild((r) => { r.monsters.passives.embuscade.modifiers[0].if = { roundAtMost: 0 }; });
    assert(msg.includes('roundAtMost'), msg);
    msg = tryBuild((r) => { r.monsters.skills.relever_les_morts.effects[0].hpPct = 3; });
    assert(msg.includes('hpPct'), msg);
  });
}

console.log('\n● Prêtre : forme d\'ombre, Expiation, soin en trop en bouclier, drain');
{
  /** Une salle d'entraînement avec un Prêtre (niveau 8) et un Templier allié, face à deux mannequins. */
  const pr = (spec = null, level = 8) => { const t = training([{ classId: 'pretre', level, spec }, { classId: 'templier', level: 8 }], { count: 2 }); takeTurnOf(t, 'p1'); return t; };
  const run = (t, p, id, target) => { const sk = content.skills[id]; const tg = Array.isArray(target) ? target : [target]; for (const e of sk.effects) applyEffect(t, p, e, tg, { outcome: 'hit', skill: sk }); };
  const noDice = (id, fn) => { const sk = content.skills[id]; const old = sk.dice; sk.dice = { fumble: 0, crit: 21 }; try { return fn(); } finally { if (old === undefined) delete sk.dice; else sk.dice = old; } };

  test('le Prêtre : soigneur au rang arrière, Forme d\'ombre en sort de classe, deck de départ Châtiment / Soin / Douleur / Bouclier', () => {
    const ch = createCharacter(content, { id: 'p', name: 'P', classId: 'pretre' });
    const cls = content.classes.pretre;
    eq([cls.role, cls.startRow, cls.classSkill, cls.modes.default], ['healer', 'back', 'pretre_forme', 'lumiere']);
    fillDeck(content, ch);
    eq(ch.deck, ['pretre_chatiment', 'pretre_soin', 'pretre_douleur', 'pretre_bouclier']);
    eq(Object.keys(cls.specs), ['sacre', 'discipline', 'ombre']);
    for (const spec of Object.keys(cls.specs)) eq(cls.skills.filter((x) => x.spec === spec && x.level === 8).length, 3, `${spec} : 3 choix au palier 8`);
    const t = pr();
    eq(t.players[0].mode, 'lumiere', 'chaque combat commence en forme de lumière');
  });

  test('Forme d\'ombre : +35 % de dégâts, soins −50 % ; 1re fois gratuite, puis 1 PA ; relance de 2 tours', () => {
    const t = pr();
    const p = t.players[0];
    const lum = computeStats(t, p);
    eq(skillPaCost(p, content.skills.pretre_forme), 0, '1re fois gratuite');
    assert(cast(t, p.id, 'pretre_forme').ok);
    eq(p.mode, 'ombre');
    const omb = computeStats(t, p);
    assert(Math.abs(omb.damage - lum.damage - 0.35) < 1e-9, `dégâts : ${lum.damage} → ${omb.damage}`);
    assert(Math.abs(omb.healPower - (lum.healPower - 0.6)) < 1e-9, `soins : ${lum.healPower} → ${omb.healPower} (lumière +10 %, ombre −50 %)`);
    eq(skillPaCost(p, content.skills.pretre_forme), 1, 'ensuite 1 PA');
    const again = cast(t, p.id, 'pretre_forme');
    assert(!again.ok, 'pas deux fois dans le même tour (relance)');
    eq(p.mode, 'ombre');
  });

  test('Discipline : le Bouclier pose l\'Expiation ; les dégâts du Prêtre soignent les alliés qui la portent (100 %, 55 % en ombre), pas les autres', () => {
    const t = pr('discipline');
    const [p, ally] = t.players;
    const [m] = t.combat.monsters;
    run(t, p, 'pretre_bouclier_discipline', ally);
    const st = ally.statuses.find((x) => x.id === 'expiation');
    assert(st && st.casterId === p.id && st.turns === 3, 'Expiation de 3 tours posée par le Prêtre');
    eq(statusInfo(st).name, 'Expiation'); eq(statusInfo(st).tone, 'buff');
    const max = computeStats(t, ally).hpMax;
    ally.hp = Math.round(max * 0.3); p.hp = Math.round(computeStats(t, p).hpMax * 0.5);
    const a0 = ally.hp, p0 = p.hp;
    const dmg = dealDamage(t, p, m, 20);
    eq(ally.hp - a0, Math.round(dmg * 1.0), 'l\'allié sous Expiation regagne 100 % des dégâts');
    eq(p.hp, p0, 'le Prêtre, sans Expiation, rien');
    p.mode = 'ombre';
    const a1 = ally.hp;
    const dmg2 = dealDamage(t, p, m, 20);
    eq(ally.hp - a1, Math.round(dmg2 * 0.55), 'en forme d\'ombre : 55 %');
    // Un autre Prêtre ne profite pas de cette Expiation (elle est liée à son lanceur)
    eq(skillBlurb(content.skills.pretre_bouclier_discipline), 'bouclier ×1.9, expiation 3 t. · un allié');
  });

  test('Sacré (Égide divine) : 60 % du soin EN TROP devient un bouclier ; sans la spé, le surplus est perdu', () => {
    for (const [spec, expect] of [['sacre', true], [null, false]]) {
      const t = pr(spec);
      const [p, ally] = t.players;
      const max = computeStats(t, ally).hpMax;
      ally.hp = max - 2; ally.shields = [];
      run(t, p, 'pretre_soin', ally);
      eq(ally.hp, max);
      const sh = (ally.shields || []).reduce((a, x) => a + x.amount, 0);
      if (expect) {
        const heal = computeStats(t, p);
        const amount = Math.round(heal.heal * 1.4 * heal.healPower);
        eq(sh, Math.round((amount - 2) * 0.6), 'bouclier = 60 % du surplus');
      } else eq(sh, 0, 'sans Égide : rien');
    }
  });

  test('Ombre : le Toucher vampirique ronge la cible et soigne l\'allié le plus blessé de 40 % des dégâts ; Éruption ne frappe que les ennemis rongés', () => {
    const t = pr('ombre');
    const [p, ally] = t.players;
    const [m1, m2] = t.combat.monsters;
    run(t, p, 'pretre_toucher_vampirique', m1);
    const st = m1.statuses.find((x) => x.id === 'dot');
    eq([st.name, st.drain], ['Toucher vampirique', 0.4]);
    assert(/soignent/.test(statusInfo(st).desc), statusInfo(st).desc);
    ally.hp = Math.round(computeStats(t, ally).hpMax * 0.3);
    const a0 = ally.hp, h0 = m1.hp;
    tickStatusEffects(t, m1);
    const lost = h0 - m1.hp;
    assert(lost > 0, 'la cible perd des PV');
    eq(ally.hp - a0, Math.round(lost * 0.4), 'l\'allié le plus blessé regagne 40 %');
    // Éruption du Vide : seul l'ennemi rongé est touché
    p.skills.push('pretre_eruption');
    const b1 = m1.hp, b2 = m2.hp;
    run(t, p, 'pretre_eruption', [m1, m2]);
    assert(m1.hp < b1, 'l\'ennemi rongé subit l\'explosion');
    eq(m2.hp, b2, 'l\'autre, non');
  });

  test('Mot de l\'ombre : Mort frappe bien plus fort une cible sous 30 % de PV', () => {
    const t = pr();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    const hit = () => { const b = m.hp; run(t, p, 'pretre_mort', m); const d = b - m.hp; m.hp = b; return d; };
    m.hp = m.hpMax; const full = hit();
    m.hp = Math.round(m.hpMax * 0.25); const low = hit();
    assert(low > 2 * full, `blessée : ${low} contre ${full}`);
  });
}

console.log('\n● Guerrier : rage, postures, blessure profonde, riposte');
{
  const war = (spec = null, level = 8) => { const t = training([{ classId: 'guerrier', level, spec }, { classId: 'veilleur', level: 8 }], { count: 2 }); takeTurnOf(t, 'p1'); return t; };
  const run = (t, p, id, target) => { const sk = content.skills[id]; const tg = Array.isArray(target) ? target : [target]; for (const e of sk.effects) applyEffect(t, p, e, tg, { outcome: 'hit', skill: sk }); };
  const rage = (p) => p.resources.rage ?? 0;

  test('le Guerrier : tank au rang avant, rage (max 10, à 0), Posture en sort de classe, deck Frappe / Brise-genou / Exécution / Cri', () => {
    const cls = content.classes.guerrier;
    eq([cls.role, cls.startRow, cls.classSkill, cls.resource.id, cls.resource.max, cls.resource.start, cls.modes.default], ['tank', 'front', 'guerrier_posture', 'rage', 10, 0, 'combat']);
    const ch = createCharacter(content, { id: 'g', name: 'G', classId: 'guerrier' });
    fillDeck(content, ch);
    eq(ch.deck, ['guerrier_frappe', 'guerrier_brise_genou', 'guerrier_execution', 'guerrier_cri']);
    for (const spec of ['armes', 'fureur', 'protection']) eq(cls.skills.filter((x) => x.spec === spec && x.level === 8).length, 3, `${spec} : 3 choix au palier 8`);
    const t = war();
    eq([rage(t.players[0]), t.players[0].resourceMax.rage, t.players[0].mode], [0, 10, 'combat']);
  });

  test('Colère : chaque coup encaissé donne +1 rage (+2 en posture défensive) ; la Frappe héroïque +2 ; l\'Exécution en dépense 4', () => {
    const t = war();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    dealDamage(t, m, p, 3); dealDamage(t, m, p, 3);
    eq(rage(p), 2, 'deux coups encaissés : +2');
    p.mode = 'defensive';
    dealDamage(t, m, p, 3);
    eq(rage(p), 4, 'en défensive : +2 par coup');
    run(t, p, 'guerrier_frappe', m);
    eq(rage(p), 6);
    p.resources.rage = 3;
    assert(!checkUsable(t, p, content.skills.guerrier_execution).ok, 'Exécution refusée avec 3 rage');
    p.resources.rage = 4;
    assert(checkUsable(t, p, content.skills.guerrier_execution).ok);
  });

  test('Postures : Combat / Offensive / Défensive changent dégâts et dégâts reçus ; le joueur choisit (1 PA)', () => {
    const t = war();
    const p = t.players[0];
    const st = (mode) => { p.mode = mode; const s = computeStats(t, p); return [Math.round(s.damage * 100), Math.round(s.taken * 100)]; };
    eq(st('combat'), [105, 95]); eq(st('offensive'), [120, 110]); eq(st('defensive'), [85, 80]);
    p.mode = 'combat';
    eq(skillPaCost(p, content.skills.guerrier_posture), 1);
    const opts = getCombatView(t, p.id).skills.find((x) => x.skillId === 'guerrier_posture').modePick;
    eq(opts.map((o) => o.id), ['combat', 'offensive', 'defensive']);
    assert(act(t, p.id, { act: 'skill', skillId: 'guerrier_posture', modeId: 'defensive' }).ok);
    eq(p.mode, 'defensive');
  });

  test('Armes : la Frappe mortelle laisse une BLESSURE PROFONDE (soins reçus −50 %), même sur la régénération d\'un monstre', () => {
    const t = war('armes');
    const p = t.players[0];
    const [m] = t.combat.monsters;
    m.hp = Math.round(m.hpMax / 2);
    const healOf = () => { const b = m.hp; applyEffect(t, m, { type: 'heal', pctMaxHp: 0.04, to: 'self' }, [], { outcome: 'hit' }); const d = m.hp - b; m.hp = b; return d; };
    const before = healOf();
    run(t, p, 'guerrier_frappe_mortelle', m);
    const st = m.statuses.find((x) => x.id === 'mod' && x.stat === 'healTaken');
    assert(st && st.pct === -0.5 && st.turns === 3, 'blessure profonde posée pour 3 tours');
    eq(statusInfo(st).tone, 'debuff'); assert(/Soins reçus/.test(statusInfo(st).name), statusInfo(st).name);
    eq(healOf(), Math.round(before / 2), `la régénération est réduite de moitié (${before} → ${healOf()})`);
  });

  test('Protection : il riposte quand un monstre le frappe (une fois par tour) ; Fureur : le Déchaînement frappe deux fois', () => {
    const t = war('protection');
    const p = t.players[0];
    const [m] = t.combat.monsters;
    const h0 = m.hp;
    dealDamage(t, m, p, 3);
    assert(m.hp < h0, 'riposte');
    const h1 = m.hp;
    dealDamage(t, m, p, 3);
    eq(m.hp, h1, 'une seule riposte par tour');
    const f = war('fureur');
    const fp = f.players[0];
    const [fm] = f.combat.monsters;
    const b0 = fm.hp;
    applyEffect(f, fp, { type: 'damage', power: 0.9 }, [fm], { outcome: 'hit' });
    const one = b0 - fm.hp;
    fm.hp = b0;
    run(f, fp, 'guerrier_dechainement', fm);
    eq(b0 - fm.hp, 2 * one, `deux coups de ${one}`);
  });
}

console.log('\n● Druide : formes, sorts réservés à une forme, rangs');
{
  const dru = (spec = null, level = 8) => { const t = training([{ classId: 'druide', level, spec }, { classId: 'pretre', level: 8 }], { count: 2 }); takeTurnOf(t, 'p1'); return t; };
  const pick = (t, p, modeId) => act(t, p.id, { act: 'skill', skillId: 'druide_metamorphose', modeId });

  test('le Druide : rang arrière, Métamorphose en sort de classe (4 formes), deck Épine / Bourgeon / Coup de patte / Toucher', () => {
    const cls = content.classes.druide;
    eq([cls.role, cls.startRow, cls.classSkill, cls.modes.default, cls.modes.noun], ['healer', 'back', 'druide_metamorphose', 'naturelle', 'forme']);
    eq(Object.keys(cls.modes.list), ['naturelle', 'ours', 'arbre', 'felin']);
    const ch = createCharacter(content, { id: 'd', name: 'D', classId: 'druide' });
    fillDeck(content, ch);
    eq(ch.deck, ['druide_epine_sauvage', 'druide_bourgeon', 'druide_coup_patte', 'druide_toucher']);
    for (const spec of ['gardien', 'restauration', 'farouche']) eq(cls.skills.filter((x) => x.spec === spec && x.level === 8).length, 3, `${spec} : 3 choix au palier 8`);
  });

  test('Métamorphose : 1re gratuite puis 1 PA ; l\'Ours passe au rang avant, l\'Arbre au rang arrière ; chaque forme change les stats', () => {
    const t = dru();
    const p = t.players[0];
    const base = computeStats(t, p);
    eq(p.row, 'back');
    eq(skillPaCost(p, content.skills.druide_metamorphose), 0);
    assert(pick(t, p, 'ours').ok);
    eq([p.mode, p.row], ['ours', 'front']);
    const ours = computeStats(t, p);
    assert(ours.def > base.def * 1.35 && ours.taken < base.taken, `Ours : défense ${base.def} → ${ours.def}`);
    eq(skillPaCost(p, content.skills.druide_metamorphose), 1);
    p.pa = 6;
    assert(pick(t, p, 'arbre').ok);
    eq([p.mode, p.row], ['arbre', 'back']);
    assert(computeStats(t, p).healPower > base.healPower, 'Arbre : soins plus forts');
    p.pa = 6;
    assert(pick(t, p, 'felin').ok);
    eq(p.row, 'front');
    assert(computeStats(t, p).damage > base.damage && computeStats(t, p).critShift === base.critShift - 1, 'Félin : dégâts et critiques');
  });

  test('un sort réservé à une forme : refusé dans les autres (la raison le dit), libre hors combat', () => {
    const t = dru();
    const p = t.players[0];
    const patte = content.skills.druide_coup_patte;
    const no = checkUsable(t, p, patte);
    assert(!no.ok && /Forme d'ours ou Forme de félin requise/.test(no.reason), no.reason);
    assert(pick(t, p, 'ours').ok);
    assert(checkUsable(t, p, patte).ok, 'en Ours : possible');
    assert(!checkUsable(t, p, content.skills.druide_toucher).ok, 'le Toucher guérisseur ne se lance pas en Ours');
    const view = getCombatView(t, p.id).skills.find((x) => x.skillId === 'druide_toucher');
    assert(view && !view.usable && /requise/.test(view.reason || ''), JSON.stringify(view));
    // validation des JSON : une forme inconnue est expliquée
    const raw = loadRaw();
    raw.classes.classes.druide.skills.find((x) => x.id === 'druide_coup_patte').modes = ['dragon'];
    let msg = '';
    try { buildContent(raw); } catch (e) { msg = e.message; }
    assert(msg.includes('dragon') && msg.includes('druide_coup_patte'), msg);
  });

  test('le Coup de patte change selon la forme : bouclier en Ours, saignement en Félin', () => {
    const t = dru();
    const p = t.players[0];
    const [m] = t.combat.monsters;
    const sk = content.skills.druide_coup_patte;
    p.mode = 'ours';
    for (const e of sk.effects) applyEffect(t, p, e, [m], { outcome: 'hit', skill: sk });
    assert(totalShield(p) > 0 && !m.statuses.some((x) => x.id === 'dot'), 'Ours : bouclier, pas de saignement');
    p.shields = []; p.mode = 'felin';
    for (const e of sk.effects) applyEffect(t, p, e, [m], { outcome: 'hit', skill: sk });
    assert(totalShield(p) === 0 && m.statuses.some((x) => x.id === 'dot' && x.name === 'Griffures'), 'Félin : saignement, pas de bouclier');
  });

  test('une vieille sauvegarde de l\'ANCIEN Druide reste un Druide (nouveau kit, niveau gardé)', () => {
    const real = loadContent({ legacy: false });
    const ch = sanitizeProfile(real, { characters: [{ id: 'a', name: 'Pip', classId: 'druide', level: 5, skills: ['druide_rosee', 'druide_racines'] }] }).characters[0];
    eq([ch.classId, ch.level], ['druide', 5]);
    assert(ch.skills.every((id) => real.skills[id]?.classId === 'druide') && !ch.skills.includes('druide_rosee'), 'les anciens sorts disparaissent');
  });
}

console.log('\n● Feu de camp');
{
  /** Une run de 2 héros (niveau 6, tranche 4), arrêtée juste devant le feu de camp. */
  const atCamp = (seed = 7) => {
    const chars = makeParty(content, ['guerrier', 'pretre'], 6, 'decent', seed);
    const s = createRun(content, { tranche: 4, mode: 'tranche' }, chars, seed);
    const i = s.dungeon.board.findIndex((t) => t.type === 'camp');
    s.dungeon.position = i - 1;
    assert(dispatch(s, { type: 'ADVANCE' }).ok);
    return { s, chars };
  };

  test('un feu de camp est GARANTI au milieu de chaque donjon (et un seul) ; « camp »: false l\'enlève', () => {
    for (const d of content.dungeonList.filter((x) => x.available !== false)) {
      for (let seed = 1; seed <= 5; seed++) {
        const s = createRun(content, { tranche: d.tranche, dungeon: d.id, mode: 'tranche' }, makeParty(content, ['sacrieur', 'pretre'], d.tranche, 'none', seed), seed);
        const b = s.dungeon.board;
        eq(b.filter((t) => t.type === 'camp').length, 1, `${d.id} : un seul camp`);
        eq(b[Math.floor((b.length - 1) / 2)].type, 'camp', `${d.id} : au milieu`);
        assert(b.filter((t) => t.type === 'combat').length >= 4, 'les combats garantis sont toujours là');
      }
    }
    const raw = loadRaw();
    raw.tranches.tranches.find((t) => t.id === 1).camp = false;
    const c2 = buildContent(raw);
    const s = createRun(c2, { tranche: 1, mode: 'tranche' }, makeParty(c2, ['sacrieur'], 1, 'none', 1), 1);
    eq(s.dungeon.board.filter((t) => t.type === 'camp').length, 0, 'sans camp');
  });

  test('le colporteur du camp : 2 potions par héros, chacun achète pour lui à son tour, avec l\'or de la run', () => {
    const { s } = atCamp();
    const tile = s.dungeon.board[s.dungeon.position];
    const per = content.rules.camp.peddler.potions;
    eq(tile.stock.length, per * 2, 'deux héros : 2 × 2 potions');
    assert(tile.stock.every((e) => content.items[e.inst.id].consumable), 'que des potions');
    const actor = s.pending.actor, other = s.players.find((p) => p.id !== actor).id;
    const price = shopPriceOf(s, tile, itemPriceOf(content, content.items[tile.stock[0].inst.id]));
    s.gold = price - 1;
    assert(!dispatch(s, { type: 'SHOP_BUY', index: 0, buyerId: actor }).ok, 'pas assez d\'or');
    s.gold = price * 3;
    assert(!dispatch(s, { type: 'SHOP_BUY', index: 0, buyerId: other }).ok, 'pas pour un autre que celui dont c\'est le tour');
    const bagBefore = playerOf(s, actor).bag.length;
    assert(dispatch(s, { type: 'SHOP_BUY', index: 0, buyerId: actor }).ok);
    eq(s.gold, price * 2); eq(playerOf(s, actor).bag.length, bagBefore + 1);
    assert(!dispatch(s, { type: 'SHOP_BUY', index: 0, buyerId: actor }).ok, 'déjà vendue');
    eq(s.pending.kind, 'camp', 'acheter ne termine pas son tour au camp');
  });

  test('à la VICTOIRE, l\'or restant devient des éclats de forge (partagés) ; perdu en cas de défaite', () => {
    const chars = makeParty(content, ['guerrier', 'pretre'], 6, 'decent', 3);
    const s = createRun(content, { tranche: 4, mode: 'tranche' }, chars, 3);
    s.gold = 205;
    endRun(s, 'victory');
    const per = content.rules.goldToShards.goldPerShard;
    eq(s.result.players[0].goldShards, Math.round(205 / per / 2));
    const before = chars.map((c) => c.shards || 0);
    applyRunResult(content, chars, s);
    chars.forEach((c, i) => eq(c.shards, before[i] + Math.round(205 / per / 2)));
    const s2 = createRun(content, { tranche: 4, mode: 'tranche' }, makeParty(content, ['guerrier'], 6, 'decent', 4), 4);
    s2.gold = 500;
    endRun(s2, 'defeat');
    eq(s2.result.players[0].goldShards, 0);
  });

  test('au camp, chaque héros VIVANT choisit à son tour (celui sous les projecteurs d\'abord) ; ensuite on lève le camp', () => {
    const { s } = atCamp();
    eq(s.pending.kind, 'camp');
    const first = s.pending.actor;
    assert(!dispatch(s, { type: 'CAMP_ACT', activity: 'danser' }).ok, 'activité inconnue refusée');
    assert(dispatch(s, { type: 'CAMP_ACT', activity: 'sharpen' }).ok);
    const second = s.pending.actor;
    assert(s.pending.kind === 'camp' && second !== first, 'au suivant');
    const p2 = s.players.find((p) => p.id === second);
    p2.hp = 5;
    p2.statuses.push({ id: 'poison', pct: 0.05, turns: 3 });
    assert(dispatch(s, { type: 'CAMP_ACT', activity: 'rest' }).ok);
    assert(p2.hp > 5 && !p2.statuses.some((x) => x.id === 'poison'), 'se reposer soigne et retire le poison');
    eq(s.pending.kind, 'advance', 'tout le monde a choisi : on lève le camp');
    // un héros mort ne campe pas
    const { s: s2 } = atCamp(9);
    const other = s2.players.find((p) => p.id !== s2.pending.actor);
    other.alive = false;
    assert(dispatch(s2, { type: 'CAMP_ACT', activity: 'rest' }).ok);
    eq(s2.pending.kind, 'advance', 'le fantôme ne campe pas');
  });

  test('« Affûter ses armes » : +12 % de dégâts pendant 2 combats, puis plus rien', () => {
    const { s } = atCamp();
    const p = s.players.find((x) => x.id === s.pending.actor);
    const before = computeStats(s, p).damage;
    dispatch(s, { type: 'CAMP_ACT', activity: 'sharpen' });
    assert(Math.abs(computeStats(s, p).damage - before - 0.12) < 1e-9, 'dégâts +12 %');
    const chip = unitEffects(content, p).find((e) => e.kind === 'camp');
    assert(chip && /2 combats/.test(chip.desc), JSON.stringify(chip));
    // deux fins de combat
    for (let k = 0; k < 2; k++) { s.combat = { monsters: [], round: 1 }; endCombat(s); }
    assert(!(p.campBuffs || []).length && Math.abs(computeStats(s, p).damage - before) < 1e-9, 'le bonus est parti après 2 combats');
  });

  test('changer ses sorts au camp : un emplacement à la fois, seulement ses sorts ; le nouveau deck est gardé après la partie', () => {
    const { s, chars } = atCamp();
    const p = s.players.find((x) => x.id === s.pending.actor);
    const ch = chars.find((c) => c.id === p.charId);
    const opts = campDeckOptions(s, p);
    const fresh = opts.find((id) => !p.deck.includes(id));
    assert(fresh, 'un sort à équiper');
    assert(!dispatch(s, { type: 'CAMP_DECK', slot: 0, skillId: 'sacrieur_carapace' }).ok, 'pas le sort d\'une autre classe');
    assert(!dispatch(s, { type: 'CAMP_DECK', slot: 9, skillId: fresh }).ok, 'emplacement invalide');
    assert(!dispatch(s, { type: 'CAMP_DECK', slot: 0, skillId: content.classes[p.classId].classSkill }).ok, 'pas le sort de classe');
    assert(dispatch(s, { type: 'CAMP_DECK', slot: 3, skillId: fresh }).ok);
    eq(p.deck[3], fresh);
    // la partie se termine (victoire) : le personnage garde ce deck
    s.phase = 'ended';
    s.result = { won: true, outcome: 'victory', applied: false, players: s.players.map((x) => ({ charId: x.charId, playerId: x.id, xp: { total: 0 } })) };
    applyRunResult(content, chars, s);
    assert(ch.deck.includes(fresh), `le deck du personnage garde ${fresh}`);
  });

  test('le pilote automatique se repose au camp (un joueur absent n\'y bloque pas le groupe)', () => {
    const { s } = atCamp();
    eq(afkAction(s), { type: 'CAMP_ACT', activity: 'rest' });
  });
}

console.log('\n● Barde : chants, inspiration, Tempo');
{
  /** Un vrai petit combat (pas l'Atelier) : Barde + Guerrier + Assassin contre des monstres, au tour du Barde. */
  const fight = (spec = null) => {
    const t = training([{ classId: 'barde', level: 8, spec }, { classId: 'guerrier', level: 8 }, { classId: 'assassin', level: 8 }], { count: 2 });
    takeTurnOf(t, 'p1');
    return t;
  };
  const run = (t, p, id, target) => { const sk = content.skills[id]; const tg = Array.isArray(target) ? target : [target]; for (const e of sk.effects) applyEffect(t, p, e, tg, { outcome: 'hit', skill: sk }); };

  test('le Barde : soutien au rang arrière, inspiration (max 5, à 0), Ballade en sort de classe, chants « un chant » ; deck Note / Refrain / Tempo / Crescendo', () => {
    const cls = content.classes.barde;
    eq([cls.startRow, cls.classSkill, cls.resource.id, cls.resource.max, cls.modes.default, cls.modes.noun, cls.modes.article], ['back', 'barde_ballade', 'inspiration', 5, 'bravoure', 'chant', 'un']);
    const ch = createCharacter(content, { id: 'b', name: 'B', classId: 'barde' });
    fillDeck(content, ch);
    eq(ch.deck, ['barde_note', 'barde_refrain', 'barde_tempo', 'barde_crescendo']);
    for (const spec of ['menestrel', 'troubadour', 'skald']) eq(cls.skills.filter((x) => x.spec === spec && x.level === 8).length, 3, `${spec} : 3 choix au palier 8`);
  });

  test('les chants profitent à TOUTE l\'équipe ; changer de chant donne +1 inspiration', () => {
    const t = fight();
    const [p, war] = t.players;
    const base = computeStats(t, war);
    eq(p.mode, 'bravoure');
    const without = (() => { p.alive = false; const d = computeStats(t, war).damage; p.alive = true; return d; })();
    assert(Math.abs(base.damage - without - 0.06) < 1e-9, `Bravoure : dégâts +6 % pour le Guerrier (${without} → ${base.damage})`);
    eq(p.resources.inspiration ?? 0, 0);
    assert(act(t, p.id, { act: 'skill', skillId: 'barde_ballade', modeId: 'clairvoyance' }).ok);
    eq(p.resources.inspiration, 1, '+1 inspiration en changeant de chant');
    eq(computeStats(t, war).critShift, base.critShift - 1, 'Clairvoyance : le Guerrier critique un point plus tôt');
    p.mode = 'resilience';
    assert(computeStats(t, war).healTaken > 1 && computeStats(t, war).taken < 1, 'Résilience : mieux soigné, moins de dégâts');
  });

  test('Tempo : l\'allié joue JUSTE APRÈS le Barde ; s\'il avait déjà joué ce round, il rejoue tout de suite', () => {
    const t = fight();
    const [p, war, sin] = t.players;
    const tl = t.combat.timeline;
    // On place l'Assassin AVANT le Barde dans la frise, comme s'il avait déjà joué ce round
    tl.splice(tl.indexOf(sin.id), 1);
    tl.splice(tl.indexOf(p.id), 0, sin.id);
    t.combat.turn = tl.indexOf(p.id);
    assert(tl.indexOf(sin.id) < t.combat.turn, 'l\'Assassin a déjà joué');
    run(t, p, 'barde_tempo', sin);
    eq(tl[t.combat.turn], p.id, 'le curseur reste sur le Barde');
    eq(tl[t.combat.turn + 1], sin.id, 'l\'Assassin joue juste après lui');
    eq(tl.filter((id) => id === sin.id).length, 1, 'il n\'apparaît qu\'une fois dans la frise');
    // Fin du tour du Barde : c'est bien à l'Assassin
    p.pa = 0;
    act(t, p.id, { act: 'endTurn' });
    eq(t.pending.actor, sin.id, 'c\'est au tour de l\'Assassin');
    eq(p.resources.inspiration, 1);
  });

  test('Crescendo dépense 3 inspiration : toute l\'équipe +20 % de dégâts ; Ménestrel : chaque dépense donne +1 PA à toute l\'équipe au tour suivant', () => {
    const t = fight();
    const [p, war] = t.players;
    p.resources.inspiration = 2;
    assert(!checkUsable(t, p, content.skills.barde_crescendo).ok, '2 ne suffisent pas');
    p.resources.inspiration = 3;
    assert(cast(t, p.id, 'barde_crescendo').ok);
    eq(p.resources.inspiration, 0);
    assert(war.statuses.some((x) => x.id === 'mod' && x.stat === 'damage' && x.pct === 0.2), 'le Guerrier a +20 %');
    const m = fight('menestrel');
    const [mp, mw] = m.players;
    mp.resources.inspiration = 3;
    assert(cast(m, mp.id, 'barde_grand_crescendo').ok);
    assert(mw.statuses.some((x) => x.id === 'mod' && x.stat === 'pa' && x.flat === 1), 'Rythme endiablé : +1 PA au prochain tour du Guerrier');
  });
}

console.log('\n● Forge : démanteler, protéger, améliorer, forger');
{
  const make = () => {
    const chars = [];
    const ch = applyCharacterAction(content, chars, { type: 'CHAR_CREATE', classId: 'guerrier', name: 'F' }, { newId: () => 'f1' }).character;
    ch.inventory = [{ uid: 'c1', id: 'capuchon_de_toile_rapee' }, { uid: 'c2', id: 'piece_percee' }, { uid: 'u1', id: 'amulette_corbeau' }, { uid: 'r1', id: 'collier_de_saphir' }];
    return { chars, ch, go: (a) => applyCharacterAction(content, chars, { charId: 'f1', ...a }) };
  };

  test('démanteler : des éclats selon la rareté ; jamais un objet protégé, porté, ou une potion', () => {
    const { ch, go } = make();
    eq(ch.shards, 0);
    assert(go({ type: 'CHAR_LOCK', uid: 'r1' }).ok);
    eq(ch.locked, ['r1']);
    assert(!go({ type: 'CHAR_SALVAGE', uid: 'r1' }).ok, 'protégé');
    const r = go({ type: 'CHAR_SALVAGE', uid: 'u1' });
    assert(r.ok && r.shards === 3 && ch.shards === 3, 'peu commun : 3 éclats');
    ch.equipment.head = { uid: 'w1', id: 'heaume_de_fer_noirci' };
    assert(!go({ type: 'CHAR_SALVAGE', uid: 'w1' }).ok, 'un objet porté ne se démantèle pas');
    const potion = content.itemList.find((i) => i.consumable);
    ch.inventory.push({ uid: 'p1', id: potion.id });
    assert(!go({ type: 'CHAR_SALVAGE', uid: 'p1' }).ok, 'une potion ne se démantèle pas');
    // en masse : les communs, sans le collier protégé ni la potion
    const bulk = go({ type: 'CHAR_SALVAGE_BULK', rarity: 'rare' });
    assert(bulk.ok && bulk.salvaged === 2 && ch.shards === 5, `en masse : 2 communs (${ch.shards})`);
    eq(ch.inventory.map((i) => i.uid).sort(), ['p1', 'r1']);
    assert(!go({ type: 'CHAR_SALVAGE_BULK', rarity: 'common' }).ok, 'plus rien à démanteler');
  });

  test('améliorer : +10 % par cran sur PV/attaque/défense/soin (pas les PA ni la chance), prix croissant, +5 au maximum', () => {
    const { ch, go } = make();
    ch.equipment.head = { uid: 'w1', id: 'heaume_de_fer_noirci' }; // rare : def 1, hp 1
    ch.shards = 1000;
    const base = { ...content.items.heaume_de_fer_noirci.stats };
    const spent = [];
    for (let i = 0; i < 5; i++) { const before = ch.shards; assert(go({ type: 'CHAR_UPGRADE', uid: 'w1' }).ok); spent.push(before - ch.shards); }
    eq(spent, [8, 16, 24, 32, 40], 'rare : 8 × le cran');
    eq(ch.equipment.head.plus, 5);
    assert(!go({ type: 'CHAR_UPGRADE', uid: 'w1' }).ok, 'pas plus de +5');
    eq(itemView(content, ch.equipment.head).stats.def, Math.round(base.def * 1.5 * 100) / 100);
    eq(itemView(content, { uid: 'x', id: 'piece_percee', plus: 3 }).stats.luck, content.items.piece_percee.stats.luck, 'la chance ne grandit pas');
    // dans le combat : la défense du joueur porte l'amélioration
    const t = createTraining(content, [{ classId: 'guerrier', level: 3 }], { dummy: 'mannequin', count: 1 });
    const p = t.players[0];
    p.equipment.head = { uid: 'w1', id: 'heaume_de_fer_noirci' };
    const d0 = computeStats(t, p).def;
    p.equipment.head.plus = 5;
    assert(Math.abs(computeStats(t, p).def - d0 - base.def * 0.5) < 1e-6, 'la défense en combat gagne +50 % de celle du heaume');
    // démanteler un objet amélioré rend la moitié des éclats investis
    eq(salvageValue(content, { id: 'heaume_de_fer_noirci', plus: 2 }), 8 + Math.floor((8 + 16) / 2));
    const poor = make();
    assert(!poor.go({ type: 'CHAR_UPGRADE', uid: 'r1' }).ok, 'sans éclats, pas d\'amélioration');
  });

  test('forger : seulement les objets d\'un donjon TERMINÉ, au prix de leur rareté ; l\'objet arrive dans le sac', () => {
    const { ch, go } = make();
    ch.shards = 100;
    assert(!go({ type: 'CHAR_CRAFT', itemId: 'dague_os' }).ok, 'donjon jamais terminé');
    eq(craftableItems(content, ch).length, 0);
    ch.stats.dungeons = { caves_humides: 1 };
    const list = craftableItems(content, ch);
    assert(list.length > 0 && list.every((x) => content.itemDungeon[x.id] === 'caves_humides'), 'les objets des Caves humides');
    const r = go({ type: 'CHAR_CRAFT', itemId: 'dague_os' });
    assert(r.ok && ch.inventory.some((i) => i.uid === r.crafted.uid && i.id === 'dague_os'), 'dans le sac');
    eq(ch.shards, 100 - forgeRules(content).craftCost.uncommon);
    assert(!go({ type: 'CHAR_CRAFT', itemId: 'capuchon_de_toile_rapee' }).ok, 'un objet ordinaire ne se forge pas');
  });

  test('sauvegarde : les éclats, les cadenas et les améliorations survivent ; une partie les garde aussi', () => {
    const { ch } = make();
    ch.shards = 12; ch.locked = ['r1', 'disparu'];
    ch.inventory[3].plus = 2;
    ch.inventory[0].plus = 99;
    const back = sanitizeCharacter(content, JSON.parse(JSON.stringify(ch)));
    eq(back.shards, 12);
    eq(back.locked, ['r1'], 'un cadenas sur un objet qu\'on n\'a plus disparaît');
    eq(back.inventory.find((i) => i.uid === 'r1').plus, 2);
    eq(back.inventory.find((i) => i.uid === 'c1').plus, 5, 'une amélioration est bornée à +5');
    // une partie de donjon gagnée : l'objet porté amélioré revient amélioré, toujours protégé
    let checked = false;
    for (let seed = 1; seed < 300; seed++) {
      const chars = makeParty(content, A, 1, 'good', seed);
      const slot = EQUIP_SLOTS.find((x) => chars[0].equipment[x]);
      const inst = chars[0].equipment[slot];
      inst.plus = 3;
      chars[0].locked = [inst.uid];
      const { state } = playRun(content, { tranche: 1, mode: 'tranche' }, chars, seed * 31);
      if (!state.result.won) continue;
      applyRunResult(content, chars, state);
      const back = [...chars[0].inventory, ...EQUIP_SLOTS.map((x) => chars[0].equipment[x])].find((i) => i?.uid === inst.uid);
      eq(back?.plus, 3, 'l\'amélioration a survécu à la partie');
      eq(chars[0].locked, [inst.uid]);
      checked = true;
      break;
    }
    assert(checked, 'aucune partie gagnée pour vérifier');
  });
}

console.log('\n● Expéditions (le côté « idle »)');
{
  const H = 3600000;
  const roster = () => {
    const chars = [];
    const mk = (id, level, classId = 'guerrier') => { const c = applyCharacterAction(content, chars, { type: 'CHAR_CREATE', name: id, classId }, { newId: () => id }).character; c.level = level; return c; };
    return { chars, top: mk('top', 6), low: mk('low', 3), mid: mk('mid', 4), last: mk('last', 2) };
  };
  const go = (chars, a, now, rand) => applyCharacterAction(content, chars, a, { now, rand });
  const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

  test('partir puis revenir : pas de récompense avant l\'heure ; au retour, éclats + XP de rattrapage + parfois un objet', () => {
    const { chars, low } = roster();
    const t0 = 1e12;
    assert(go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'low', expeditionId: 'chasse' }, t0).ok);
    eq([low.expedition.id, low.expedition.end - t0], ['chasse', 2 * H]);
    assert(!go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'low', expeditionId: 'patrouille' }, t0).ok, 'déjà parti');
    const early = go(chars, { type: 'CHAR_EXPEDITION_CLAIM', charId: 'low' }, t0 + H);
    assert(!early.ok && /pas encore revenu/.test(early.error), early.error);
    const r = go(chars, { type: 'CHAR_EXPEDITION_CLAIM', charId: 'low' }, t0 + 2 * H, seq(0.99, 0.1, 0.5, 0.5, 0.5));
    assert(r.ok, r.error);
    eq(r.claim.shards, 10, 'le haut de la fourchette [6, 10]');
    eq(r.claim.xp, Math.round(180 * 0.45), 'XP de rattrapage : 45 % du niveau suivant (180)');
    assert(r.claim.item && low.inventory.some((i) => i.uid === r.claim.item.uid), 'un objet dans le sac');
    assert(content.items[r.claim.item.id].level <= low.level && !content.itemDungeon[r.claim.item.id], 'objet de niveau <= au héros, jamais exclusif');
    eq([low.expedition, low.shards, low.stats.expeditions], [null, 10, 1]);
  });

  test('le meilleur héros ne gagne pas d\'XP ; 3 héros en route au plus ; niveau requis ; la grande expédition se débloque avec un succès', () => {
    const { chars, top, low, mid, last } = roster();
    const t0 = 1e12;
    assert(go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'top', expeditionId: 'patrouille' }, t0).ok);
    const r = go(chars, { type: 'CHAR_EXPEDITION_CLAIM', charId: 'top' }, t0 + H, seq(0.5));
    eq([r.claim.xp, top.xp, top.level], [0, 0, 6], 'pas d\'XP pour le meilleur héros');
    assert(!go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'last', expeditionId: 'chasse' }, t0).ok, 'chasse : niveau 3 requis');
    const big = go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'top', expeditionId: 'grande_expedition' }, t0);
    assert(!big.ok && /succès/.test(big.error), big.error);
    top.achievements.equipe_pour_la_gloire = true;
    for (const id of ['top', 'low', 'mid']) assert(go(chars, { type: 'CHAR_EXPEDITION_START', charId: id, expeditionId: id === 'top' ? 'grande_expedition' : 'patrouille' }, t0).ok, id);
    const fourth = go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'last', expeditionId: 'patrouille' }, t0);
    assert(!fourth.ok && /3 au plus/.test(fourth.error), fourth.error);
    // rappeler : tout de suite, sans rien
    assert(go(chars, { type: 'CHAR_EXPEDITION_CANCEL', charId: 'mid' }, t0 + 1000).ok);
    eq([mid.expedition, mid.shards || 0], [null, 0]);
    assert(go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'last', expeditionId: 'patrouille' }, t0).ok, 'une place s\'est libérée');
  });

  test('un héros en expédition ne part ni en donjon ni au farm ; l\'expédition est sauvegardée', () => {
    const { chars, low } = roster();
    go(chars, { type: 'CHAR_EXPEDITION_START', charId: 'low', expeditionId: 'patrouille' }, 1e12);
    let msg = '';
    try { createRun(content, { tranche: 1, mode: 'tranche' }, [low]); } catch (e) { msg = e.message; }
    assert(/expédition/.test(msg), msg);
    msg = '';
    try { createFarm(content, low, { seed: 1 }); } catch (e) { msg = e.message; }
    assert(/expédition/.test(msg), msg);
    const back = sanitizeCharacter(content, JSON.parse(JSON.stringify(low)));
    eq(back.expedition, low.expedition);
    const gone = sanitizeCharacter(content, { ...JSON.parse(JSON.stringify(low)), expedition: { id: 'inconnue', start: 1, end: 2 } });
    eq(gone.expedition, null, 'une expédition qui n\'existe plus est oubliée');
  });
}

console.log('\n● Zones de farm des tranches 4 et 8');
test('trois zones ; chacune exige un niveau ; plus haut = plus d\'éclats et des objets de plus haut niveau', () => {
  const ids = content.farm.zoneList.map((z) => z.id);
  eq(ids, ['terriers', 'fourres', 'fosses']);
  const z4 = content.farm.zones.fourres, z8 = content.farm.zones.fosses;
  eq([z4.minLevel, z8.minLevel, z4.rewards.itemMaxLevel, z8.rewards.itemMaxLevel], [4, 8, 4, 8]);
  const low = farmHero('berserker', 3, 1);
  assert(!canStartFarm(content, low, z4).ok, 'niveau 3 : pas les Fourrés');
  let msg = '';
  try { createFarm(content, low, { zoneId: 'fourres', seed: 1 }); } catch (e) { msg = e.message; }
  assert(/niveau 4 requis/.test(msg), msg);
  const hero = farmHero('berserker', 8, 1);
  const s = createFarm(content, hero, { zoneId: 'fosses', seed: 3 });
  assert(content.farm.zones.fosses.monsterPool.includes(s.combat.monsters[0].defId), 'des ogres');
  winWave(s);
  eq(s.farm.shards, z8.rewards.shardsPerWave, 'les éclats par vague des Fosses viennent de farm.json');
  dispatch(s, { type: 'FARM_STOP' });
  assert(s.result.choices.every((it) => content.items[it.id].level <= 8));
  // la force des monstres est réglable par zone (waves.scale)
  const w1 = waveInfo(content.farm.zones.terriers, 1), w4 = waveInfo(z4, 1);
  assert(w4.hpMult < w1.hpMult && Math.abs(w4.hpMult - z4.waves.scale.hp) < 1e-9, 'Fourrés : monstres ×0,65 PV');
});

test('en ligne, les préférences gardent l\'onglet Expéditions et la zone de farm choisie', () => {
  const prof = applyPrefs(emptyProfile(), { settings: { view: 'expeditions', farmZone: 'fosses', farmChar: 'c1' } });
  eq([prof.settings.view, prof.settings.farmZone, prof.settings.farmChar], ['expeditions', 'fosses', 'c1']);
  eq(applyPrefs(emptyProfile(), { settings: { view: 'nimporte' } }).settings.view, 'dungeon');
});

console.log('\n● Raretés par mode ; le Stasis à plusieurs');
test('hors Stasis : jamais de légendaire, l\'épique très rare ; en Stasis, le légendaire tombe (y compris les exclusifs)', () => {
  const party = makeParty(content, ['guerrier', 'pretre', 'assassin'], 8, 'none', 1);
  const count = (mode) => {
    const st = createRun(content, { tranche: 8, dungeon: 'gouffre_aux_ogres', mode, stasisLevel: 3, players: mode === 'stasis-solo' ? 1 : 2, ...(mode === 'stasis-solo' ? { mode: 'stasis' } : {}) }, party, 11);
    const seen = {};
    for (let i = 0; i < 3000; i++) { const it = rollItem(st, { boost: 1 }); seen[content.items[it.id].rarity] = (seen[content.items[it.id].rarity] || 0) + 1; }
    for (let i = 0; i < 300; i++) { const it = rollItem(st, { boost: 1.5, exclusiveOnly: true, minRarity: 'uncommon' }); seen[content.items[it.id].rarity] = (seen[content.items[it.id].rarity] || 0) + 1; }
    return seen;
  };
  const normal = count('tranche'), basic = count('basic'), stasis = count('stasis'), solo = count('stasis-solo');
  assert(!normal.legendary && !basic.legendary, `jamais de légendaire hors Stasis : ${JSON.stringify(normal)}`);
  assert(normal.epic > 0 && normal.epic < 3300 * 0.03, `épique possible mais très rare : ${normal.epic}`);
  assert(stasis.legendary > 0, `légendaire en Stasis : ${JSON.stringify(stasis)}`);
  assert(!solo.legendary && solo.epic > normal.epic, `Stasis joué seul : jusqu'à l'épique, plus souvent qu'en Tranche : ${JSON.stringify(solo)}`);
  eq([content.modes.stasis.minPlayers, content.modes.tranche.maxRarity, content.modes.stasis.maxRarity, content.modes.stasis.soloMaxRarity], [undefined, 'epic', 'legendary', 'epic']);
});
test('les effets sur la durée ont une NATURE (pour leur animation) et chacun annonce son tour par un événement « tick »', () => {
  eq([{ id: 'poison' }, { id: 'hot' }, { id: 'dot', name: 'Brûlure', label: 'brûle' }, { id: 'dot', name: 'Venin', label: 'souffre du venin' }, { id: 'dot', label: 'saigne' },
    { id: 'dot', name: 'Douleur', label: 'souffre' }, { id: 'dot', name: 'Toucher vampirique', label: 'est vidé' }, { id: 'dot', label: 'brûle', fx: 'shadow' }, { id: 'stun' }].map(dotKind),
  ['poison', 'hot', 'burn', 'venom', 'bleed', 'shadow', 'drain', 'shadow', null]);
  const beats = planBeats([{ type: 'turn', unitId: 'm1' }, { type: 'tick', target: 'm1', dot: 'burn' }, { type: 'damage', target: 'm1', amount: 5 }, { type: 'tick', target: 'm1', dot: 'poison' }, { type: 'damage', target: 'm1', amount: 3 }],
    { units: { m1: { id: 'm1', kind: 'monster', hp: 50, max: 50, shield: 0, alive: true, statuses: [] } }, combat: true }, null, content);
  eq(beats.map((b) => `${b.type}:${b.cause}:${b.steps.length}`), ['tick:burn:1', 'tick:poison:1'], 'un temps fort par effet, chacun avec sa nature');
});
test('le butin va directement dans le sac du héros qui le trouve (pas de question) ; loot.ask = true rétablit la question', () => {
  const party = makeParty(content, ['guerrier', 'pretre'], 1, 'none', 3);
  const st = createRun(content, { tranche: 1, mode: 'tranche' }, party, 5);
  const finder = st.players[st.spotlight];
  queueLoot(st, [{ uid: 'L1', id: 'dague_os' }]);
  assert(finder.bag.some((i) => i.uid === 'L1') && !st.lootQueue.length, 'dans le sac, sans file d\'attente');
  assert(st.events.some((e) => e.type === 'loot' && e.target === finder.id && e.itemId === 'dague_os'), 'un événement « loot » pour l\'écran');
  content.rules.loot.ask = true;
  try {
    queueLoot(st, [{ uid: 'L2', id: 'dague_os' }]);
    eq(st.lootQueue.map((i) => i.uid), ['L2'], 'avec ask : la question revient');
  } finally { content.rules.loot.ask = false; }
});
test('« Équiper le meilleur » : seulement ce qui est clairement meilleur (rien en baisse), les emplacements vides, jamais un objet trop haut', () => {
  const ch = createCharacter(content, { id: 'q', name: 'Q', classId: 'guerrier' });
  const highHead = Object.values(content.items).find((x) => x.slot === 'head' && x.level >= 8).id;
  ch.equipment.head = { uid: 'h0', id: 'capuchon_de_cuir_cloue' };
  ch.inventory = [{ uid: 'h1', id: 'heaume_de_fer_noirci' }, { uid: 'h2', id: 'heaume_du_fossoyeur' }, { uid: 'h3', id: 'heaume_de_l_aube' },
    { uid: 'r1', id: 'anneau_sang' }, { uid: 'r2', id: 'anneau_de_jade' }, { uid: 'hx', id: highHead }, { uid: 'p1', id: 'potion_mineure' }];
  const r = applyCharacterAction(content, [ch], { type: 'CHAR_AUTO_EQUIP', charId: 'q' });
  assert(r.ok, r.error);
  eq(ch.equipment.head.id, 'heaume_du_fossoyeur', 'le casque au plus gros gain sans perte');
  eq([ch.equipment.ring1?.id, ch.equipment.ring2?.id].sort(), ['anneau_de_jade', 'anneau_sang'], 'les deux anneaux dans les emplacements vides');
  assert(ch.inventory.some((i) => i.id === 'heaume_de_l_aube') && ch.inventory.some((i) => i.id === highHead) && ch.inventory.some((i) => i.uid === 'h0'), 'le reste revient au sac (l\'Aube est « différent », le casque haut niveau trop haut)');
  const again = applyCharacterAction(content, [ch], { type: 'CHAR_AUTO_EQUIP', charId: 'q' });
  assert(!again.ok && /Rien de mieux/.test(again.error), 'deuxième fois : rien de mieux');
});
test('forge : un objet légendaire ne se forge qu\'après avoir terminé son donjon en Stasis', () => {
  const ch = createCharacter(content, { id: 'f', name: 'F', classId: 'guerrier' });
  ch.shards = 1000;
  ch.stats.dungeons = { caves_humides: 1 };
  const chars = [ch];
  const leg = craftableItems(content, ch).find((x) => x.def.rarity === 'legendary');
  assert(leg && leg.locked, 'listé, mais verrouillé');
  const r = applyCharacterAction(content, chars, { type: 'CHAR_CRAFT', charId: 'f', itemId: leg.id });
  assert(!r.ok && /Stasis/.test(r.error), r.error);
  ch.stats.stasisClears = { caves_humides: 1 };
  assert(applyCharacterAction(content, chars, { type: 'CHAR_CRAFT', charId: 'f', itemId: leg.id }).ok, 'après le Stasis : oui');
  eq(sanitizeCharacter(content, JSON.parse(JSON.stringify(ch))).stats.stasisClears, { caves_humides: 1 }, 'sauvegardé');
});

console.log('\n● Mage : charges arcaniques, Déflagration, brûlure, givre');
{
  const fight = (spec = null, level = 8) => {
    const t = training([{ classId: 'mage', level, spec }, { classId: 'guerrier', level }], { count: 2 });
    takeTurnOf(t, 'p1');
    return t;
  };
  const dmgOf = (t, id) => { const m = t.combat.monsters[0]; const before = m.hp; m.hp = m.hpMax = 100000; m.base.hp = 100000; const h0 = m.hp; cast(t, 'p1', id, m.id); return h0 - m.hp; };

  test('le Mage : dps au rang arrière, charges arcaniques (max 5), 1 charge au début du combat ; Déflagration en sort de classe', () => {
    const cls = content.classes.mage;
    eq([cls.startRow, cls.role, cls.classSkill, cls.resource.id, cls.resource.max], ['back', 'damage', 'mage_deflagration', 'arcane', 5]);
    const ch = createCharacter(content, { id: 'm', name: 'M', classId: 'mage' });
    fillDeck(content, ch);
    eq(ch.deck, ['mage_trait_feu', 'mage_eclair_givre', 'mage_projectiles', 'mage_barriere']);
    const t = fight();
    eq(t.players[0].resources.arcane, 1, 'Flux arcanique : 1 charge au début du combat');
    for (const spec of ['pyromancien', 'cryomancien', 'arcaniste']) eq(cls.skills.filter((x) => x.spec === spec && x.level === 8).length, 3, `${spec} : 3 choix au palier 8`);
  });

  test('Déflagration : dépense TOUTES les charges, et frappe plus fort avec chacune (spend.all + powerPerSpent)', () => {
    const t = fight();
    const p = t.players[0];
    p.resources.arcane = 0;
    assert(!checkUsable(t, p, content.skills.mage_deflagration).ok, 'il faut au moins 1 charge');
    p.resources.arcane = 1; p.pa = 12;
    const one = dmgOf(t, 'mage_deflagration');
    eq(p.resources.arcane, 0);
    const t5 = fight();
    t5.players[0].resources.arcane = 5; t5.players[0].pa = 12;
    const five = dmgOf(t5, 'mage_deflagration');
    eq(t5.players[0].resources.arcane, 0, 'tout est dépensé');
    assert(five > one * 2, `5 charges frappent bien plus fort qu'une (${one} → ${five})`);
  });

  test('le feu fait BRÛLER (clé « brulure ») ; le Pyromancien frappe plus fort ce qui brûle (condition targetKey) ; le givre engourdit', () => {
    const t = fight();
    const [p] = t.players;
    const m = t.combat.monsters[0];
    p.pa = 12;
    assert(cast(t, p.id, 'mage_trait_feu', m.id).ok);
    assert(m.statuses.some((st) => st.id === 'dot' && st.key === 'brulure'), 'la cible brûle');
    eq(p.resources.arcane, 2, '+1 charge');
    assert(cast(t, p.id, 'mage_eclair_givre', t.combat.monsters[1].id).ok);
    assert(t.combat.monsters[1].statuses.some((st) => st.id === 'mod' && st.stat === 'damage' && st.pct === -0.15), 'engourdi : −15 % de dégâts');
    // Embrasement : +0,8 de puissance sur une cible qui brûle
    const py = fight('pyromancien');
    const [q] = py.players;
    q.pa = 12;
    const [a, b] = py.combat.monsters;
    for (const x of [a, b]) { x.hp = x.hpMax = 100000; x.base.hp = 100000; x.base.def = 0; }
    a.statuses.push({ id: 'dot', key: 'brulure', amount: 1, turns: 3, label: 'brûle' });
    const ha = a.hp; cast(py, q.id, 'mage_embrasement', a.id); const onBurning = ha - a.hp;
    q.cooldowns = {}; q.pa = 12;
    const hb = b.hp; cast(py, q.id, 'mage_embrasement', b.id); const onCold = hb - b.hp;
    assert(onBurning > onCold * 1.5, `plus fort sur ce qui brûle (${onCold} → ${onBurning})`);
  });

  test('Cryomancien : la Prison de glace fait sauter un tour (2 charges) ; Arcaniste : 3 charges au début du combat', () => {
    const t = fight('cryomancien');
    const [p] = t.players;
    p.resources.arcane = 2; p.pa = 12;
    const m = t.combat.monsters[0];
    assert(cast(t, p.id, 'mage_prison', m.id).ok);
    assert(m.statuses.some((st) => st.id === 'stun'), 'gelé');
    eq(p.resources.arcane, 0);
    eq(fight('arcaniste').players[0].resources.arcane, 3, 'Flux (1) + Maîtrise arcanique (2)');
  });
}

console.log('\n● Coups bas : gain du saboteur, esquive de la victime, pactes (aussi en solo)');
{
  const tile = (party, seed = 11) => {
    const s = createRun(content, { tranche: 1, mode: 'tranche' }, party, seed);
    s.dungeon.board[0].type = 'low_blow';
    dispatch(s, { type: 'ADVANCE' });
    return s;
  };
  /** Rejoue le jet en changeant le hasard jusqu'à obtenir `want(snapshot)`. */
  const rollUntil = (s, want) => {
    for (let k = 0; k < 400; k++) { const snap = cloneState(s); dispatch(snap, { type: 'ROLL' }); if (want(snap)) { dispatch(s, { type: 'ROLL' }); return true; } s.rng++; }
    return false;
  };

  test('seul, la case propose des PACTES : un coût tout de suite, un bonus pour les prochains combats', () => {
    const s = tile(makeParty(content, ['berserker'], 2, 'good', 3));
    eq(s.pending.subtype, 'low_blow');
    assert(!s.pending.options.some((o) => o.blow), 'seul : pas de victime');
    const p = s.players[0];
    const hp0 = p.hp;
    assert(dispatch(s, { type: 'CHOOSE', option: 'pact:autel_sang' }).ok);
    assert(p.hp < hp0, 'l\'autel coûte des PV');
    assert(p.campBuffs.some((b) => b.stat === 'damage' && b.pct === 0.15 && b.combats === 2), '+15 % de dégâts pendant 2 combats');
    assert(computeStats(s, p).damage > 1.1, 'le bonus compte dans les stats');
  });

  test('un coup bas réussi : la victime lance un dé d\'esquive ; ratée, elle subit et le saboteur gagne ; réussie, rien ne se passe', () => {
    const party = makeParty(content, ['berserker', 'duelliste'], 2, 'none', 4);
    // Cas 1 : le saboteur réussit, la victime n'esquive pas
    const s = tile(party);
    const [a, v] = s.players;
    dispatch(s, { type: 'CHOOSE', option: s.pending.options.find((o) => o.blow === 'poison' && o.target === v.id).id });
    assert(rollUntil(s, (x) => x.pending?.purpose === 'dodge'), 'pas de rebond');
    eq([s.pending.purpose, s.pending.actor], ['dodge', v.id], 'c\'est la VICTIME qui lance le dé d\'esquive');
    assert(rollUntil(s, (x) => x.phase !== 'tile' || !x.pending || x.pending.kind !== 'roll'));
    const hit = v.statuses.some((st) => st.id === 'poison');
    if (hit) assert(a.campBuffs?.some((b) => b.stat === 'damage'), 'le saboteur gagne +12 % de dégâts');
    // Cas 2 : on force une esquive
    const s2 = tile(party, 12);
    const [a2, v2] = s2.players;
    dispatch(s2, { type: 'CHOOSE', option: s2.pending.options.find((o) => o.blow === 'poison' && o.target === v2.id).id });
    assert(rollUntil(s2, (x) => x.pending?.purpose === 'dodge'));
    assert(rollUntil(s2, (x) => x.log.some((l) => l.text.includes('esquive'))), 'une esquive possible');
    assert(!v2.statuses.some((st) => st.id === 'poison') && !(a2.campBuffs || []).length, 'esquivé : ni poison, ni gain');
  });

  test('la case « coup bas » peut maintenant apparaître en solo (elle y propose les pactes)', () => {
    let seen = false;
    for (let seed = 1; seed < 80 && !seen; seed++) {
      const s = createRun(content, { tranche: 4, mode: 'tranche' }, makeParty(content, ['berserker'], 4, 'none', seed), seed);
      seen = s.dungeon.board.some((t) => t.type === 'low_blow');
    }
    assert(seen, 'jamais vue en solo');
  });
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} tests réussis, ${failed} échoués\n`);
process.exit(failed ? 1 : 0);
