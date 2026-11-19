// ============================================================
//  farm.js — La zone de farm solo : vagues, éclats, un objet au choix, XP de rattrapage
// ============================================================
// Un SEUL personnage affronte des vagues de monstres dans une petite zone (data/farm.json).
//   - Après chaque vague vaincue, il choisit : vague suivante, ou s'arrêter.
//   - Plus il tient, plus les vagues sont dures (PV et attaque des monstres), avec un boss régulier.
//   - Ce qu'il a gagné dans les vagues PRÉCÉDENTES est gardé. S'il meurt, il ne perd que la vague en cours.
//   - Chaque vague donne des ÉCLATS (la forge). En fin de session : 1 objet AU CHOIX parmi 3, d'autant meilleurs
//     qu'on a tenu longtemps ; les deux autres sont démantelés en éclats. Le choix attend sur le personnage (`lootChoice`).
//   - L'XP sert à RATTRAPER : seul un héros plus bas que le meilleur héros du joueur en gagne, jusqu'à son niveau.
//
// Le farm réutilise tout le combat (PA, rangs, frise...). Il ajoute seulement l'enchaînement des vagues
// et le calcul des récompenses. Comme le reste du moteur, il est 100 % JSON et ne
// touche à aucun affichage : plus tard, un robot pourra le jouer tout seul (farm automatique).

import { nextFloat, weightedPick } from './rng.js';
import { log, headline, assert, emit } from './util.js';
import { unitStats } from './stats.js';
import { makeMonster, startCombat } from './combat.js';
import { newItem } from './items.js';
import { addXpCapped, previewXpCapped, levelCap } from './progression.js';
import { salvageValue } from './forge.js';
import { EQUIP_SLOTS } from './content.js';

export const farmZone = (state) => state.content.farm.zones[state.farm.zoneId];

// ============================================================
//  Les vagues
// ============================================================

/** Ce que contient la vague n de cette zone : { boss, count, hpMult, atkMult }. */
export function waveInfo(zone, wave) {
  const w = zone.waves;
  const boss = w.bossEvery > 0 && wave % w.bossEvery === 0;
  return {
    wave,
    boss,
    count: boss ? 1 : Math.min(w.countMax, w.countStart + Math.floor((wave - 1) / w.extraMonsterEvery)),
    hpMult: (w.scale?.hp ?? 1) * (1 + w.hpPerWave * (wave - 1)) * (boss ? w.bossScale.hp : 1),
    atkMult: (w.scale?.atk ?? 1) * (1 + w.atkPerWave * (wave - 1)) * (boss ? w.bossScale.atk : 1)
  };
}

function scaleMonster(m, hpMult, atkMult) {
  m.hpMax = m.hp = Math.max(1, Math.round(m.hp * hpMult));
  m.base.hp = m.hpMax;
  m.base.atk = Math.round(m.base.atk * atkMult * 10) / 10;
  return m;
}

/** Fabrique les monstres d'une vague (déjà adaptés à un joueur seul, puis renforcés selon la vague). */
function spawnWave(state, zone, info) {
  if (info.boss) return [scaleMonster(makeMonster(state, zone.bossId, 1, ''), info.hpMult, info.atkMult)];
  const ids = [];
  for (let i = 0; i < info.count; i++) ids.push(zone.monsterPool[Math.floor(nextFloat(state) * zone.monsterPool.length)]);
  const seen = {};
  return ids.map((id, i) => {
    const total = ids.filter((x) => x === id).length;
    seen[id] = (seen[id] || 0) + 1;
    return scaleMonster(makeMonster(state, id, i + 1, total > 1 ? ' ' + 'ABCD'[seen[id] - 1] : ''), info.hpMult, info.atkMult);
  });
}

/** Lance la vague suivante (le combat commence tout de suite). */
export function startFarmWave(state) {
  const f = state.farm;
  const zone = farmZone(state);
  f.wave++;
  const info = waveInfo(zone, f.wave);
  const tile = state.dungeon.board[0]; // la zone n'a qu'une "case" : le lieu du combat
  tile.type = info.boss ? 'boss' : 'combat';
  tile.revealed = true;
  tile.resolved = false;
  tile.monsters = spawnWave(state, zone, info);
  state.dungeon.position = 0;
  state.phase = 'tile';
  log(state, info.boss ? `— Vague ${f.wave} : le gardien de la zone surgit ! —` : `— Vague ${f.wave} —`, 'system');
  startCombat(state, tile, { natural: 10, total: 10 }); // pas d'embuscade ni de surprise en farm
  headline(state, info.boss ? `Vague ${f.wave} : le gardien !` : `Vague ${f.wave}`, info.boss ? 'bad' : 'neutral');
}

// ============================================================
//  Le butin : un objet au choix parmi 3
// ============================================================

/** Le palier de récompense atteint après `waves` vagues vaincues (le dernier de choiceTiers dont `waves` est atteint), ou null. */
export function choiceTier(zone, waves) {
  let tier = null;
  for (const t of zone.rewards.choiceTiers) if (waves >= t.waves) tier = t;
  return tier;
}

/** Tire UN objet de farm selon des poids de rareté (niveau <= itemMaxLevel, jamais une potion ni un objet exclusif de donjon). */
export function rollFarmItem(state, zone, rarityWeights, exclude = new Set()) {
  const c = state.content;
  const r = zone.rewards;
  const [rarity] = weightedPick(state, Object.entries(rarityWeights), ([, weight]) => weight);
  const all = c.itemList.filter((i) => i.rarity === rarity && i.level <= r.itemMaxLevel && i.slot !== 'consumable' && !c.itemDungeon?.[i.id]);
  const pool = all.filter((i) => !exclude.has(i.id));
  return newItem(state, weightedPick(state, pool.length ? pool : all, (i) => i.weight ?? 1).id);
}

/** Les objets proposés en fin de session (trois objets différents), ou [] si aucune vague n'a été vaincue. */
export function rollChoices(state, zone, waves) {
  const tier = choiceTier(zone, waves);
  if (!tier) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < zone.rewards.choiceCount; i++) {
    const it = rollFarmItem(state, zone, tier.rarityWeights, seen);
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/** Le niveau jusqu'auquel le farm donne de l'XP à ce personnage : celui de ton meilleur AUTRE héros (0 si aucun n'est plus haut). */
export function catchUpLevel(content, characters, ch) {
  const best = Math.max(0, ...characters.filter((x) => x.id !== ch.id).map((x) => x.level || 1));
  return best > ch.level ? Math.min(best, levelCap(content)) : 0;
}

/** Appelée par le combat quand tous les monstres de la vague sont morts. */
export function endFarmWave(state) {
  const f = state.farm;
  const zone = farmZone(state);
  const r = zone.rewards;
  const c = state.combat;
  const p = state.players[0];
  state.combat = null;
  p.statuses = []; // entre deux vagues, poisons et saignements s'estompent
  p.resources = {};
  f.kills += c.monsters.length;
  f.cleared++;

  // L'XP : seulement pour rattraper ton meilleur héros (voir catchUpLevel)
  const catchUp = (f.xpCap || 0) > p.realLevel;
  const xpBase = c.monsters.reduce((sum, m) => sum + m.xp, 0);
  const xp = catchUp ? Math.round(xpBase * r.xpMult * r.catchUpXpMult * (1 + r.xpPerWave * (f.wave - 1))) : 0;
  const shards = r.shardsPerWave + (c.boss ? r.bossShards : 0);
  f.xp += xp;
  f.shards = (f.shards || 0) + shards;
  const tierBefore = choiceTier(zone, f.cleared - 1);
  const tier = choiceTier(zone, f.cleared);
  f.last = { wave: f.wave, xp, shards, boss: !!c.boss, tierUp: tier !== tierBefore && !!tierBefore };

  const max = unitStats(state, p).hpMax;
  const before = p.hp;
  p.hp = Math.min(max, p.hp + Math.max(1, Math.round(max * zone.healBetweenWavesPct)));

  state.phase = 'farm';
  state.pending = { kind: 'farm', actor: p.id };
  log(state, `Vague ${f.wave} vaincue ! +${shards} éclat${shards > 1 ? 's' : ''}${xp ? `, +${xp} XP` : ''}.`, 'good');
  if (f.last.tierUp) log(state, 'Ta récompense de fin de session s\'améliore !', 'good');
  if (p.hp > before) {
    log(state, `${p.name} reprend son souffle (+${p.hp - before} PV).`, 'info');
    emit(state, { type: 'heal', target: p.id, amount: p.hp - before, source: null, breath: true });
  }
  headline(state, `Vague ${f.wave} vaincue !`, 'good');
}

/** Passer à la vague suivante (action FARM_NEXT). */
export function farmNext(state) {
  assert(state.farm && state.pending?.kind === 'farm', "Ce n'est pas le moment de repartir.");
  startFarmWave(state);
}

// ============================================================
//  Fin de session et application au personnage sauvegardé
// ============================================================

/** Le bilan d'une session (calculé par endRun). `outcome` : 'stop' | 'defeat' | 'abandon'. */
export function computeFarmResult(state, outcome) {
  const f = state.farm;
  const zone = farmZone(state);
  const p = state.players[0];
  const cap = f.xpCap || 0;
  const after = cap > p.realLevel ? previewXpCapped(state.content, { level: p.realLevel, xp: p.xpStart }, f.xp, cap) : { applied: 0, capped: false, level: p.realLevel };
  return {
    farm: true,
    outcome,
    won: false,
    zoneId: zone.id,
    zoneName: zone.name,
    charId: p.charId,
    name: p.name,
    classId: p.classId,
    waves: f.cleared, // vagues VAINCUES (la vague où l'on meurt ne compte pas)
    kills: f.kills,
    diedAtWave: outcome === 'defeat' ? f.wave : null,
    xp: { earned: f.xp, applied: after.applied, capped: after.capped, maxLevel: cap, catchUp: cap > p.realLevel, levelBefore: p.realLevel, levelAfter: after.level },
    shards: f.shards || 0,
    choices: rollChoices(state, zone, f.cleared).map((it) => ({ uid: it.uid, id: it.id })),
    applied: false
  };
}

/**
 * Applique le bilan d'une session au personnage SAUVEGARDÉ : XP de rattrapage, éclats, objets au choix (en attente sur le
 * personnage : `lootChoice`), compteurs, potions bues. À appeler une seule fois (protégé par `result.applied`).
 * Renvoie { levels } ou null si déjà appliqué.
 */
export function applyFarmResult(content, ch, state) {
  const res = state.result;
  if (!res || !res.farm || res.applied) return null;
  const p = state.players[0];
  const s = ch.stats;
  s.farmRuns++;
  s.farmWaves += res.waves;
  s.farmBest = Math.max(s.farmBest, res.waves);

  const gain = res.xp.catchUp ? addXpCapped(content, ch, res.xp.earned, res.xp.maxLevel) : { levels: 0 };
  ch.shards = (ch.shards || 0) + (res.shards || 0);
  if (res.choices?.length) ch.lootChoice = res.choices.map((it) => ({ uid: it.uid, id: it.id }));

  // Les potions bues pendant la session disparaissent de l'inventaire (rien d'autre n'a pu changer : pas d'équipement en farm).
  const still = new Set([...p.bag.map((i) => i.uid), ...EQUIP_SLOTS.map((slot) => p.equipment[slot]?.uid).filter(Boolean)]);
  const used = new Set(p.initialUids.filter((uid) => !still.has(uid)));
  ch.inventory = ch.inventory.filter((it) => !used.has(it.uid));

  res.applied = true;
  return { levels: gain.levels };
}

// ============================================================
//  La récompense au choix (en attente sur le personnage)
// ============================================================

/** Peut-on lancer une session de farm (dans cette zone, la première par défaut) ? { ok, reason } */
export function canStartFarm(content, ch, zone = content.farm.zoneList[0]) {
  if (ch.level < (zone?.minLevel || 1)) return { ok: false, reason: `${zone.name} : niveau ${zone.minLevel} requis.` };
  if (ch.expedition) return { ok: false, reason: `${ch.name} est en expédition : attends son retour.` };
  if (ch.lootChoice?.length) return { ok: false, reason: 'Choisis d\'abord la récompense de ta dernière session.' };
  return { ok: true };
}

/**
 * Prend l'objet `uid` parmi les objets au choix : il va dans le sac, les autres sont démantelés en éclats.
 * Renvoie { picked, shards } (le personnage est modifié).
 */
export function pickLoot(content, ch, uid) {
  const list = ch.lootChoice || [];
  const picked = list.find((it) => it.uid === uid);
  assert(picked, 'Cet objet ne fait pas partie de ta récompense.');
  let shards = 0;
  for (const it of list) if (it !== picked) shards += salvageValue(content, it);
  ch.inventory.push({ uid: picked.uid, id: picked.id });
  ch.shards = (ch.shards || 0) + shards;
  ch.lootChoice = [];
  return { picked, shards };
}
