// ============================================================
//  progression.js — Personnages persistants : niveaux, XP, compétences
// ============================================================
// Un "personnage" est un objet simple (facile à sauvegarder en JSON) :
//   { id, name, classId, level, xp, skills:[ids], spec, deck:[ids], inventory:[objets],
//     equipment:{ head, neck, ... mainHand, offHand, relic }, stats:{runs,wins,deaths} }
// Ici : création, gain d'XP, apprentissage de compétences, XP "anti-carry".

import { EQUIP_SLOTS } from './content.js';

/** Crée un nouveau personnage de niveau 1 (avec la compétence de départ de sa classe). */
export function createCharacter(content, { id, name, classId }) {
  const cls = content.classes[classId];
  if (!cls) throw new Error(`Classe inconnue : ${classId}`);
  const equipment = {};
  for (const slot of EQUIP_SLOTS) equipment[slot] = null;
  const ch = {
    id,
    name: (name || '').trim() || cls.name,
    classId,
    level: 1,
    xp: 0,
    skills: cls.skills.filter((s) => s.innate).map((s) => s.id),
    spec: null, // spécialisation choisie (à partir de rules.specLevel)
    deck: [], // les sorts actifs équipés (au plus rules.deckSize)
    inventory: [],
    equipment,
    shards: 0, // les éclats de la forge (en démantelant des objets)
    locked: [], // les objets protégés (cadenas) : on ne peut pas les démanteler
    expedition: null, // { id, start, end } : le héros est en expédition (voir expeditions.js)
    lootChoice: [], // la récompense du farm en attente : 3 objets, on en garde un (voir farm.js)
    achievements: {}, // succès débloqués par CE personnage : { id: true }
    stats: newCharacterStats()
  };
  fillDeck(content, ch); // les sorts de départ (hors sort de classe) sont équipés dès la création
  return ch;
}

/** Les compteurs d'un personnage (ils servent aux conditions des succès). */
export function newCharacterStats() {
  return {
    runs: 0, wins: 0, deaths: 0,
    farmRuns: 0, // sessions de farm terminées
    farmWaves: 0, // vagues de farm vaincues, au total
    farmBest: 0, // record : vagues vaincues dans une même session
    expeditions: 0, // expéditions terminées
    dungeons: {}, // donjons terminés, un par un : { "gouffre_aux_ogres": 2 }
    bestiary: {}, // monstres vaincus : { "rat_geant": 14 }
    found: {}, // objets exclusifs déjà rapportés : { "massue_de_gromm": true }
    clears: {} // donjons terminés : { "1": { total: 3, group: 1 } } (group = avec au moins 2 personnages)
  };
}

/** Plafond de niveau actuel (`levelCap` dans rules.json, jamais au-delà de `maxLevel`). */
export function levelCap(content) {
  const { maxLevel, levelCap: cap } = content.rules;
  return Math.min(maxLevel, Number.isFinite(cap) ? cap : maxLevel);
}

/** XP nécessaire pour passer du niveau `level` au suivant (null si plafond de niveau atteint). */
export function xpForNext(content, level) {
  if (level >= levelCap(content)) return null;
  return content.rules.xpToNext[level - 1] ?? null;
}

/**
 * Ajoute de l'XP à un personnage (modifie l'objet) et gère les montées de niveau.
 * Renvoie le nombre de niveaux gagnés.
 */
export function addXp(content, character, amount) {
  let gained = 0;
  character.xp += Math.max(0, Math.round(amount));
  while (true) {
    const need = xpForNext(content, character.level);
    if (need === null) {
      character.xp = 0; // niveau max : l'XP ne sert plus à rien
      break;
    }
    if (character.xp < need) break;
    character.xp -= need;
    character.level++;
    gained++;
  }
  return gained;
}

/** Simule un gain d'XP sans modifier le personnage (pour l'écran de fin). */
export function previewXp(content, character, amount) {
  const copy = { level: character.level, xp: character.xp };
  const gained = addXp(content, copy, amount);
  return { level: copy.level, xp: copy.xp, gained };
}

/**
 * Comme addXp, mais l'XP ne peut pas faire dépasser `maxLevel` (ex. le farm : « jusqu'au niveau 4 »).
 * Un personnage qui a déjà ce niveau ne gagne plus rien. Renvoie { applied, levels, capped }.
 */
export function addXpCapped(content, character, amount, maxLevel) {
  const want = Math.max(0, Math.round(amount));
  if (character.level >= maxLevel) return { applied: 0, levels: 0, capped: want > 0 };
  let room = -character.xp; // XP qu'il manque pour atteindre exactement maxLevel
  for (let l = character.level; l < maxLevel; l++) room += xpForNext(content, l) ?? 0;
  const applied = Math.min(want, Math.max(0, room));
  const levels = addXp(content, character, applied);
  return { applied, levels, capped: applied < want };
}

/** Simule addXpCapped sans modifier le personnage. */
export function previewXpCapped(content, character, amount, maxLevel) {
  const copy = { level: character.level, xp: character.xp };
  const res = addXpCapped(content, copy, amount, maxLevel);
  return { ...res, level: copy.level, xp: copy.xp };
}

// ---------------- Compétences ----------------

/** Points de compétence dépensés (les compétences innées sont gratuites). */
export function skillPointsSpent(content, character) {
  let total = 0;
  for (const id of character.skills) total += content.skills[id]?.cost || 0;
  return total;
}

/** Points de compétence encore disponibles : 1 point par niveau. */
export function skillPointsFree(content, character) {
  return character.level - skillPointsSpent(content, character);
}

/** Le nom d'une spécialisation de classe. */
function specName(content, classId, specId) {
  return content.classes[classId]?.specs?.[specId]?.name || specId;
}

/** Une compétence déjà apprise qui s'exclut avec celle-ci (`exclusiveWith`) ? Renvoie son id ou undefined. */
function exclusiveClash(content, character, sk) {
  return (sk.exclusiveWith || []).find((id) => character.skills.includes(id));
}

/**
 * Dans un « un seul parmi N » (`choiceGroup`), le choix déjà fait par le personnage : choisir une autre compétence du groupe REMPLACE celle-ci
 * (gratuitement, sans tout réinitialiser). Renvoie son id ou undefined.
 */
export function choiceMate(content, character, sk) {
  if (!sk.choiceGroup) return undefined;
  return character.skills.find((id) => id !== sk.id && content.skills[id]?.classId === sk.classId && content.skills[id]?.choiceGroup === sk.choiceGroup);
}

/**
 * Les points de compétence À AFFICHER comme « à dépenser » : ceux de `skillPointsFree`, sauf si la classe n'a rien à acheter
 * (aucune compétence payante : tout est de départ, automatique ou évolué), auquel cas il n'y a rien à dépenser.
 */
export function skillPointsToSpend(content, character) {
  const buyable = content.classes[character.classId].skills.some((s) => s.cost > 0 && !s.innate && !s.auto && !s.replaces);
  return buyable ? skillPointsFree(content, character) : 0;
}

/** Peut-on apprendre cette compétence ? Renvoie { ok, reason }. */
export function canLearnSkill(content, character, skillId) {
  const sk = content.skills[skillId];
  if (!sk || sk.classId !== character.classId) return { ok: false, reason: 'Compétence inconnue.' };
  if (character.skills.includes(skillId)) return { ok: false, reason: 'Déjà apprise.' };
  if (sk.replaces) return { ok: false, reason: 'Version évoluée : elle remplace automatiquement sa compétence de base avec la spécialisation.' };
  if (sk.auto) return { ok: false, reason: `Automatique : elle se débloque en choisissant la spécialisation « ${specName(content, character.classId, sk.spec)} ».` };
  if (sk.spec && character.spec !== sk.spec) return { ok: false, reason: `Spécialisation « ${specName(content, character.classId, sk.spec)} » requise.` };
  if (character.level < sk.level) return { ok: false, reason: `Niveau ${sk.level} requis.` };
  if (sk.unlockedBy && !character.achievements?.[sk.unlockedBy]) {
    return { ok: false, reason: `Succès requis : « ${content.achievements[sk.unlockedBy].name} ».` };
  }
  const missing = (sk.requires || []).filter((id) => !character.skills.includes(id));
  if (missing.length) return { ok: false, reason: `Requiert : ${missing.map((id) => content.skills[id].name).join(', ')}.` };
  const clash = exclusiveClash(content, character, sk);
  if (clash) return { ok: false, reason: `Incompatible avec ${content.skills[clash].name}.` };
  const refund = content.skills[choiceMate(content, character, sk)]?.cost || 0; // remplacer un choix rend ses points
  if (skillPointsFree(content, character) + refund < sk.cost) return { ok: false, reason: `${sk.cost} point(s) requis.` };
  return { ok: true };
}

/**
 * Toutes les conditions pour apprendre une compétence, chacune « remplie ou non » :
 * le niveau, les compétences à connaître avant, un éventuel succès, les incompatibilités et les points à dépenser.
 * Sert à afficher une vraie liste de conditions (✓ / ✗) dans la fiche, au lieu de la seule première qui manque.
 * Renvoie un tableau de { kind, ok, text, skillId? } (vide pour une compétence inconnue).
 */
export function skillRequirements(content, character, skillId) {
  const sk = content.skills[skillId];
  if (!sk || sk.classId !== character.classId) return [];
  const out = [{ kind: 'level', ok: character.level >= sk.level, text: `Niveau ${sk.level}` }];
  if (sk.spec) out.push({ kind: 'spec', ok: character.spec === sk.spec, text: `Spécialisation « ${specName(content, sk.classId, sk.spec)} »` });
  for (const id of sk.requires || []) out.push({ kind: 'skill', ok: character.skills.includes(id), text: content.skills[id].name, skillId: id });
  if (sk.unlockedBy) out.push({ kind: 'achievement', ok: !!character.achievements?.[sk.unlockedBy], text: `Succès « ${content.achievements[sk.unlockedBy].name} »` });
  for (const id of sk.exclusiveWith || []) out.push({ kind: 'exclusive', ok: !character.skills.includes(id), text: `Sans « ${content.skills[id].name} »`, skillId: id });
  if (sk.choiceGroup) {
    const rivals = content.classes[sk.classId].skills.filter((s) => s.choiceGroup === sk.choiceGroup && s.id !== sk.id);
    const taken = rivals.find((s) => character.skills.includes(s.id));
    out.push({ kind: 'choice', ok: true, text: `Un seul choix parmi : ${[sk.name, ...rivals.map((s) => s.name)].join(', ')}${taken ? ` (remplace « ${taken.name} »)` : ''}`, skillId: taken?.id });
  }
  if (sk.cost > 0) {
    const free = skillPointsFree(content, character);
    out.push({ kind: 'points', ok: free >= sk.cost, text: `${sk.cost} point${sk.cost > 1 ? 's' : ''} de compétence`, have: free, need: sk.cost });
  }
  return out;
}

export function learnSkill(content, character, skillId) {
  const check = canLearnSkill(content, character, skillId);
  if (!check.ok) return check;
  // Choisir dans un groupe « un seul parmi N » remplace le choix précédent (il sort aussi du deck).
  const mate = choiceMate(content, character, content.skills[skillId]);
  if (mate) {
    character.skills = character.skills.filter((id) => id !== mate);
    if (Array.isArray(character.deck)) character.deck = character.deck.filter((id) => id !== mate);
  }
  character.skills.push(skillId);
  // Un nouveau sort actif s'équipe tout seul s'il reste de la place dans le deck.
  if (!Array.isArray(character.deck)) character.deck = [];
  if (deckEligible(content, character, skillId) && character.deck.length < deckSize(content)) character.deck.push(skillId);
  return { ok: true };
}

/** Oublie toutes les compétences apprises (sauf les innées) pour les redistribuer. Le deck est refait avec les sorts de départ ; la spécialisation reste choisie. */
export function resetSkills(content, character) {
  character.skills = character.skills.filter((id) => content.skills[id]?.innate);
  character.deck = [];
  fillDeck(content, character); // les sorts de départ reviennent dans le deck
}

// ---------------- Spécialisation et deck ----------------

/** Combien de sorts actifs on peut équiper (`deckSize` dans rules.json, 4 par défaut). */
export const deckSize = (content) => content.rules.deckSize ?? 4;

/** Niveau à partir duquel on choisit une spécialisation (`specLevel` dans rules.json, 4 par défaut). */
export const specLevel = (content) => content.rules.specLevel ?? 4;

/**
 * Ce qu'il reste à CHOISIR à un personnage : `spec` (true si sa spécialisation est ouverte mais pas choisie) et `talents`
 * (le nombre de « un parmi N » de sa spécialisation, au niveau atteint, où il n'a encore rien pris). L'accueil le signale.
 */
export function pendingChoices(content, character) {
  const cls = content.classes[character.classId];
  const spec = !!cls?.specs && Object.keys(cls.specs).length > 0 && !character.spec && character.level >= specLevel(content);
  const groups = new Map();
  if (character.spec) {
    for (const s of cls.skills) if (s.choiceGroup && s.spec === character.spec && s.level <= character.level) (groups.get(s.choiceGroup) || groups.set(s.choiceGroup, []).get(s.choiceGroup)).push(s.id);
  }
  const talents = [...groups.values()].filter((ids) => !ids.some((id) => character.skills.includes(id))).length;
  return { spec, talents };
}

/**
 * Les compétences AUTOMATIQUES (champ `auto`) que la spécialisation du personnage lui donne, une fois le niveau atteint : on ne les apprend pas,
 * elles sont là dès qu'on choisit la spécialisation. Renvoie leurs identifiants.
 */
export function autoSkillIds(content, character) {
  if (!character.spec) return [];
  return content.classes[character.classId].skills.filter((s) => s.auto && s.spec === character.spec && s.level <= character.level).map((s) => s.id);
}

/** Toutes les compétences qu'un personnage possède : celles qu'il a apprises, plus les automatiques de sa spécialisation. */
export function knownSkills(content, character) {
  return [...character.skills, ...autoSkillIds(content, character).filter((id) => !character.skills.includes(id))];
}

/** Les spécialisations d'une classe : [{ id, name, desc }] (liste vide si la classe n'en a pas). */
export function specsOf(content, classId) {
  return Object.entries(content.classes[classId]?.specs || {}).map(([id, s]) => ({ id, ...s }));
}

/**
 * Cette compétence peut-elle être équipée dans le deck ? Un sort ACTIF appris, qui n'est ni le sort de classe (il a son propre emplacement)
 * ni une version évoluée (automatique), et dont la spécialisation est celle du personnage.
 */
export function deckEligible(content, character, skillId) {
  const sk = content.skills[skillId];
  return !!sk && sk.classId === character.classId && sk.type === 'active' && !sk.replaces
    && skillId !== content.classes[character.classId].classSkill
    && knownSkills(content, character).includes(skillId) && (!sk.spec || sk.spec === character.spec);
}

/** Retire du deck ce qui n'a plus le droit d'y être (sort oublié, autre spécialisation, doublon, trop de sorts). */
export function pruneDeck(content, character) {
  const seen = new Set();
  character.deck = (Array.isArray(character.deck) ? character.deck : [])
    .filter((id) => deckEligible(content, character, id) && !seen.has(id) && seen.add(id))
    .slice(0, deckSize(content));
}

/** Complète le deck avec les sorts appris disponibles (dans l'ordre d'apprentissage) tant qu'il reste de la place. */
export function fillDeck(content, character) {
  pruneDeck(content, character);
  for (const id of knownSkills(content, character)) {
    if (character.deck.length >= deckSize(content)) break;
    if (!character.deck.includes(id) && deckEligible(content, character, id)) character.deck.push(id);
  }
}

/** Choisit (ou retire, avec `null`) la spécialisation. Renvoie { ok, reason }. À faire HORS partie (le contrôle est dans profile-actions). */
export function setSpec(content, character, specId) {
  if (specId === null || specId === undefined || specId === '') {
    character.spec = null;
    fillDeck(content, character);
    return { ok: true };
  }
  if (typeof specId !== 'string' || !content.classes[character.classId]?.specs?.[specId]) return { ok: false, reason: 'Spécialisation inconnue pour cette classe.' };
  if (character.level < specLevel(content)) return { ok: false, reason: `La spécialisation s'ouvre au niveau ${specLevel(content)}.` };
  character.spec = specId;
  fillDeck(content, character);
  return { ok: true };
}

/** Remplace le deck par cette liste de sorts. Renvoie { ok, reason } (rien ne change en cas de refus). */
export function setDeck(content, character, ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return { ok: false, reason: 'Deck invalide.' };
  if (ids.length > deckSize(content)) return { ok: false, reason: `Un deck contient ${deckSize(content)} sorts au plus.` };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'Le même sort ne peut être équipé qu\'une fois.' };
  for (const id of ids) {
    if (!deckEligible(content, character, id)) return { ok: false, reason: `« ${content.skills[id]?.name || id} » ne peut pas être équipé (non apprise, de départ, ou d'une autre spécialisation).` };
  }
  character.deck = ids.slice();
  return { ok: true };
}

// ---------------- XP "anti-carry" ----------------

/** Plus haut niveau "normal" d'une tranche (ex. tranche 4 -> niveaux 4 à 7). */
export function trancheTopLevel(content, trancheId) {
  const i = content.trancheList.findIndex((t) => t.id === trancheId);
  const next = content.trancheList[i + 1];
  return next ? next.id - 1 : content.rules.maxLevel;
}

/**
 * Facteur d'XP selon l'écart de niveau : un joueur bien plus haut niveau que le donjon
 * gagne très peu d'XP (il ne peut pas se faire "porter" ou farmer les débutants).
 */
export function levelFactor(content, realLevel, trancheId) {
  const top = trancheTopLevel(content, trancheId);
  const gap = Math.max(0, realLevel - top);
  const { lossPerLevel, minFactor } = content.rules.antiCarry;
  return Math.max(minFactor, 1 - lossPerLevel * gap);
}
