// ============================================================
//  expeditions.js — Les expéditions : un héros part, il revient plus tard avec des récompenses
// ============================================================
// Le côté « idle » du jeu : on envoie un héros en expédition (30 min, 2 h, une nuit...), on fait autre chose (ou on ferme
// le jeu), et à son retour il rapporte des ÉCLATS, de l'XP de RATTRAPAGE (même règle qu'au farm : seulement s'il est plus bas
// que ton meilleur héros) et parfois un OBJET. Pendant ce temps, il ne peut pas partir en donjon ni au farm.
//
// Tout est décrit dans data/farm.json > "expeditions". Le temps vient de l'appelant (`now`, en millisecondes) :
// en ligne c'est l'horloge du SERVEUR (impossible d'avancer sa montre pour tricher), hors ligne celle du navigateur.
// Le hasard vient aussi de l'appelant (`rand`, une fonction qui renvoie [0, 1)) : les tests peuvent le fixer.

import { addXpCapped, xpForNext } from './progression.js';
import { catchUpLevel } from './farm.js';
import { hasFeature } from './achievements.js';
import { assert } from './util.js';

/** Les réglages des expéditions (farm.json > expeditions). */
export const expeditionRules = (content) => content.farm.expeditions;

/** Une expédition par son identifiant. */
export const expeditionOf = (content, id) => expeditionRules(content).list.find((e) => e.id === id) || null;

/** Le héros est-il en expédition (même revenu, tant qu'on n'a pas récupéré ses récompenses) ? */
export const onExpedition = (ch) => !!ch?.expedition;

/** Combien de temps reste-t-il (ms, 0 = il est de retour) ? */
export const expeditionLeft = (ch, now) => (ch?.expedition ? Math.max(0, ch.expedition.end - now) : 0);

/** Combien de héros de ce joueur sont en expédition, et combien peuvent l'être à la fois. */
export function expeditionSlots(content, characters) {
  const used = characters.filter(onExpedition).length;
  const max = expeditionRules(content).maxActive;
  return { used, max, free: Math.max(0, max - used) };
}

/** Ce héros peut-il partir sur cette expédition ? { ok, reason } */
export function canStartExpedition(content, characters, ch, expId) {
  const exp = expeditionOf(content, expId);
  if (!exp) return { ok: false, reason: 'Expédition inconnue.' };
  if (onExpedition(ch)) return { ok: false, reason: `${ch.name} est déjà en expédition.` };
  if (ch.level < exp.minLevel) return { ok: false, reason: `Niveau ${exp.minLevel} requis.` };
  if (exp.feature && !hasFeature(content, ch, exp.feature)) return { ok: false, reason: 'Cette expédition se débloque avec un succès.' };
  if (ch.lootChoice?.length) return { ok: false, reason: 'Choisis d\'abord la récompense de ta dernière session de farm.' };
  const slots = expeditionSlots(content, characters);
  if (!slots.free) return { ok: false, reason: `Déjà ${slots.used} héros en expédition (${slots.max} au plus à la fois).` };
  return { ok: true };
}

/** Envoie le héros en expédition (le personnage est modifié). */
export function startExpedition(content, characters, ch, expId, now) {
  const check = canStartExpedition(content, characters, ch, expId);
  assert(check.ok, check.reason);
  const exp = expeditionOf(content, expId);
  ch.expedition = { id: exp.id, start: now, end: now + exp.minutes * 60000 };
}

/** Rappelle le héros avant la fin : il revient tout de suite, sans rien rapporter. */
export function cancelExpedition(ch) {
  assert(onExpedition(ch), 'Ce héros n\'est pas en expédition.');
  ch.expedition = null;
}

/** Tire un entier dans [min, max]. */
const between = (rand, [min, max]) => min + Math.floor(rand() * (max - min + 1));

/** Tire dans une liste pondérée. */
function pick(rand, list, weightOf) {
  const total = list.reduce((t, x) => t + weightOf(x), 0);
  let r = rand() * total;
  for (const x of list) if ((r -= weightOf(x)) < 0) return x;
  return list[list.length - 1];
}

/**
 * Récupère les récompenses d'un héros revenu de son expédition (le personnage est modifié).
 * @returns { expedition, shards, xp, levels, item }  (item : { uid, id } ou null)
 */
export function claimExpedition(content, characters, ch, now, rand = Math.random) {
  assert(onExpedition(ch), 'Ce héros n\'est pas en expédition.');
  assert(expeditionLeft(ch, now) === 0, `${ch.name} n'est pas encore revenu.`);
  const exp = expeditionOf(content, ch.expedition.id);
  ch.expedition = null;
  if (!exp) return { expedition: null, shards: 0, xp: 0, levels: 0, item: null }; // (expédition retirée des données : rien)
  const r = exp.rewards;

  const shards = between(rand, r.shards);
  ch.shards = (ch.shards || 0) + shards;

  // L'XP de rattrapage : une part du niveau suivant du héros, seulement s'il est derrière ton meilleur héros
  const cap = catchUpLevel(content, characters, ch);
  let xp = 0, levels = 0;
  if (cap > ch.level) {
    const gain = addXpCapped(content, ch, Math.round((xpForNext(content, ch.level) || 0) * r.xpFraction), cap);
    xp = gain.applied;
    levels = gain.levels;
  }

  // Parfois un objet (de niveau <= celui du héros), directement dans le sac
  let item = null;
  if (rand() < r.itemChance) {
    const [rarity] = pick(rand, Object.entries(r.rarityWeights), ([, w]) => w);
    const maxLevel = Math.min(ch.level, r.itemMaxLevel);
    let pool = content.itemList.filter((i) => i.rarity === rarity && i.level <= maxLevel && i.slot !== 'consumable' && !content.itemDungeon?.[i.id]);
    if (!pool.length) pool = content.itemList.filter((i) => i.level <= maxLevel && i.slot !== 'consumable' && !content.itemDungeon?.[i.id]);
    if (pool.length) {
      const def = pick(rand, pool, (i) => i.weight ?? 1);
      item = { uid: `${def.id}-x${Math.floor(rand() * 1e9).toString(36)}`, id: def.id };
      ch.inventory.push(item);
    }
  }
  ch.stats.expeditions = (ch.stats.expeditions || 0) + 1;
  return { expedition: exp, shards, xp, levels, item };
}

/** « 1 h 20 », « 12 min », « moins d'une minute » */
export function durationText(ms) {
  const min = Math.ceil(ms / 60000);
  if (min <= 0) return 'de retour';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
