// ============================================================
//  farm.js — La zone de farm solo : vagues, récompenses limitées, coffre
// ============================================================
// Un SEUL personnage affronte des vagues de monstres dans une petite zone (data/farm.json).
//   - Après chaque vague vaincue, il choisit : vague suivante, ou partir avec son coffre.
//   - Plus il tient, plus les vagues sont dures (PV et attaque des monstres), avec un boss régulier.
//   - Ce qu'il a gagné dans les vagues PRÉCÉDENTES est gardé. S'il meurt, il ne perd que la vague en cours.
//   - Les récompenses sont volontairement restreintes : de l'XP jusqu'à un niveau plafond, et des objets
//     communs ou inhabituels (rarement rares). Le meilleur équipement vient des donjons à plusieurs.
//
// Le farm réutilise tout le combat (PA, rangs, frise...). Il ajoute seulement l'enchaînement des vagues,
// le calcul du butin, et le coffre du personnage. Comme le reste du moteur, il est 100 % JSON et ne
// touche à aucun affichage : plus tard, un robot pourra le jouer tout seul (farm automatique).

import { nextFloat, weightedPick } from './rng.js';
import { log, headline, assert, emit } from './util.js';
import { unitStats } from './stats.js';
import { makeMonster, startCombat } from './combat.js';
import { newItem } from './items.js';
import { addXpCapped, previewXpCapped } from './progression.js';
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
    hpMult: (1 + w.hpPerWave * (wave - 1)) * (boss ? w.bossScale.hp : 1),
    atkMult: (1 + w.atkPerWave * (wave - 1)) * (boss ? w.bossScale.atk : 1)
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
//  Le butin (restreint)
// ============================================================

/**
 * Tire UN objet du farm : seules les raretés de `rarityWeights` peuvent tomber (pas d'épique ni de
 * légendaire), à un niveau <= itemMaxLevel. `minRarity` : le boss donne au moins cette rareté.
 */
export function rollFarmItem(state, zone, { minRarity = null } = {}) {
  const c = state.content;
  const r = zone.rewards;
  if (!minRarity && nextFloat(state) < r.potionChance) {
    const potions = c.itemList.filter((i) => i.slot === 'consumable' && i.level <= r.itemMaxLevel);
    if (potions.length) return newItem(state, weightedPick(state, potions, (i) => i.weight ?? 1).id);
  }
  let entries = Object.entries(r.rarityWeights);
  if (minRarity) {
    const better = entries.filter(([id]) => c.rarityIndex[id] >= c.rarityIndex[minRarity]);
    if (better.length) entries = better;
  }
  const [rarity] = weightedPick(state, entries, ([, weight]) => weight);
  const pool = c.itemList.filter((i) => i.rarity === rarity && i.level <= r.itemMaxLevel && i.slot !== 'consumable' && !c.itemDungeon?.[i.id]); // (jamais d'objet exclusif à un donjon)
  return newItem(state, weightedPick(state, pool, (i) => i.weight ?? 1).id);
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

  const xpBase = c.monsters.reduce((sum, m) => sum + m.xp, 0);
  const xp = Math.round(xpBase * r.xpMult * (1 + r.xpPerWave * (f.wave - 1)));
  const drops = [];
  if (c.boss) for (let i = 0; i < r.bossItems; i++) drops.push(rollFarmItem(state, zone, { minRarity: r.bossMinRarity }));
  else if (nextFloat(state) < r.lootChance) drops.push(rollFarmItem(state, zone));

  // Le coffre a une capacité : ce qui dépasse est perdu.
  const kept = [];
  let lost = 0;
  for (const it of drops) {
    if (f.items.length < f.chestFree) {
      f.items.push(it);
      kept.push(it);
    } else lost++;
  }
  f.lostItems += lost;
  f.xp += xp;
  f.last = { wave: f.wave, xp, items: kept.map((it) => ({ ...it })), lost, boss: !!c.boss };

  const max = unitStats(state, p).hpMax;
  const before = p.hp;
  p.hp = Math.min(max, p.hp + Math.max(1, Math.round(max * zone.healBetweenWavesPct)));

  state.phase = 'farm';
  state.pending = { kind: 'farm', actor: p.id };
  log(state, `Vague ${f.wave} vaincue ! +${xp} XP${kept.length ? `, ${kept.length} objet${kept.length > 1 ? 's' : ''} dans le coffre` : ''}${lost ? ` (${lost} perdu${lost > 1 ? 's' : ''} : coffre plein)` : ''}.`, 'good');
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
  const cap = zone.rewards.xpMaxLevel;
  const after = previewXpCapped(state.content, { level: p.realLevel, xp: p.xpStart }, f.xp, cap);
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
    xp: { earned: f.xp, applied: after.applied, capped: after.capped, maxLevel: cap, levelBefore: p.realLevel, levelAfter: after.level },
    items: f.items.map((it) => ({ ...it })),
    lostItems: f.lostItems,
    applied: false
  };
}

/**
 * Applique le bilan d'une session au personnage SAUVEGARDÉ : XP (plafonnée), objets dans le coffre,
 * compteurs, potions bues. À appeler une seule fois (protégé par `result.applied`).
 * Renvoie { levels } ou null si déjà appliqué.
 */
export function applyFarmResult(content, ch, state) {
  const res = state.result;
  if (!res || !res.farm || res.applied) return null;
  const zone = content.farm.zones[res.zoneId];
  const p = state.players[0];
  const s = ch.stats;
  s.farmRuns++;
  s.farmWaves += res.waves;
  s.farmBest = Math.max(s.farmBest, res.waves);

  const gain = addXpCapped(content, ch, res.xp.earned, zone.rewards.xpMaxLevel);
  for (const it of res.items) if (ch.chest.length < content.farm.chestCapacity) ch.chest.push({ uid: it.uid, id: it.id });

  // Les potions bues pendant la session disparaissent de l'inventaire (rien d'autre n'a pu changer : pas d'équipement en farm).
  const still = new Set([...p.bag.map((i) => i.uid), ...EQUIP_SLOTS.map((slot) => p.equipment[slot]?.uid).filter(Boolean)]);
  const used = new Set(p.initialUids.filter((uid) => !still.has(uid)));
  ch.inventory = ch.inventory.filter((it) => !used.has(it.uid));

  res.applied = true;
  return { levels: gain.levels };
}

// ============================================================
//  Le coffre du personnage
// ============================================================

/** { count, capacity, free, full } */
export function chestInfo(content, ch) {
  const count = ch.chest?.length || 0;
  const capacity = content.farm.chestCapacity;
  return { count, capacity, free: Math.max(0, capacity - count), full: count >= capacity };
}

/** Peut-on lancer une session de farm ? { ok, reason } */
export function canStartFarm(content, ch) {
  if (chestInfo(content, ch).full) return { ok: false, reason: 'Ton coffre est plein : ouvre-le avant de repartir.' };
  return { ok: true };
}

/** Ouvre le coffre : tout passe dans l'inventaire. Renvoie la liste des objets reçus. */
export function openChest(content, ch) {
  const items = ch.chest.splice(0, ch.chest.length);
  ch.inventory.push(...items);
  return items;
}
