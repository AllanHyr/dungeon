// ============================================================
//  progression.js — Personnages persistants : niveaux, XP, compétences
// ============================================================
// Un "personnage" est un objet simple (facile à sauvegarder en JSON) :
//   { id, name, classId, level, xp, skills:[ids], spec, talents:[ids], deck:[ids], inventory:[objets],
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
    talents: [], // les classes à arbres de talents : les points, dans l'ordre (voir « Arbres de talents » plus bas)
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
    stasisClears: {}, // ... dont en Stasis (à plusieurs) : la forge des légendaires en dépend
    stasisSoloClears: {}, // ... et en Stasis joué seul (sans légendaire)
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
  if (sk.talent) return { ok: false, reason: 'C\'est un talent : il se prend dans les arbres de talents, avec les points de talent.' };
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
 * (le nombre de « un parmi N » de sa spécialisation, au niveau atteint, où il n'a encore rien pris), et `points` (arbres de talents :
 * les points de talent pas encore répartis). L'accueil le signale.
 */
export function pendingChoices(content, character) {
  const cls = content.classes[character.classId];
  const spec = !!cls?.specs && Object.keys(cls.specs).length > 0 && !character.spec && character.level >= specLevel(content);
  const groups = new Map();
  if (character.spec) {
    for (const s of cls.skills) if (s.choiceGroup && s.spec === character.spec && s.level <= character.level) (groups.get(s.choiceGroup) || groups.set(s.choiceGroup, []).get(s.choiceGroup)).push(s.id);
  }
  const talents = [...groups.values()].filter((ids) => !ids.some((id) => character.skills.includes(id))).length;
  const points = hasTalents(content, character.classId) ? Math.max(0, talentPointsFree(content, character)) : 0; // (arbres de talents : les points à répartir)
  return { spec, talents, points };
}

/**
 * Les compétences AUTOMATIQUES (champ `auto`) que la spécialisation du personnage lui donne, une fois le niveau atteint : on ne les apprend pas,
 * elles sont là dès qu'on choisit la spécialisation. Renvoie leurs identifiants.
 */
export function autoSkillIds(content, character) {
  if (!character.spec) return [];
  return content.classes[character.classId].skills.filter((s) => s.auto && s.spec === character.spec && s.level <= character.level).map((s) => s.id);
}

/** Toutes les compétences qu'un personnage possède : celles qu'il a apprises, plus les automatiques de sa spécialisation, plus ses talents (au moins 1 rang ; au niveau `level`). */
export function knownSkills(content, character, level = character.level) {
  const extra = [...autoSkillIds(content, character), ...talentIds(content, character, level)];
  return [...character.skills, ...extra.filter((id) => !character.skills.includes(id))];
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

// ---------------- Arbres de talents ----------------
// Une classe peut avoir des ARBRES DE TALENTS (`talentTrees` dans classes.json) à la place des spécialisations. Un talent est une compétence
// de la classe avec "talent": { "tree": "bastion", "row": 0, "ranks": 3 }.
// Le personnage garde ses points DANS L'ORDRE où il les a mis : `talents` = [id, id, ...] (un identifiant par point ; répété = un rang de plus).
//  - On gagne `perLevel` point(s) par niveau à partir du niveau `firstLevel` (rules.json > talents).
//  - La rangée `row` d'un arbre s'ouvre quand on a mis `rows[row]` points DANS CET ARBRE, en comptant seulement les rangées du dessus.
//  - Un talent à plusieurs rangs est un passif : chaque rang ajoute ses modificateurs une fois de plus (stats.js).
//  - Deux talents qui font évoluer le même sort (`replaces`) s'excluent : un seul à la fois.
//  - Dans un donjon de plus bas niveau (niveau effectif), seuls les PREMIERS points comptent, comme les compétences au-dessus de ce niveau qui s'éteignent.
//  - L'arbre « principal » (celui où il y a le plus de points) sert de spécialisation en partie (`unit.spec`) : conditions { "spec": ... }, affichage.
// Changer ses talents est gratuit, mais jamais en pleine partie (contrôle dans profile-actions).

const DEFAULT_TALENTS = { firstLevel: 2, perLevel: 1, rows: [0, 2, 4, 6, 9, 12, 15] };

/** Les réglages des talents (rules.json > talents). */
export const talentRules = (content) => ({ ...DEFAULT_TALENTS, ...(content.rules.talents || {}) });

/** Cette classe a-t-elle des arbres de talents ? */
export const hasTalents = (content, classId) => !!content.classes[classId]?.talentTrees;

/** Les arbres d'une classe : [{ id, name, tag, icon, desc, preset, upcoming }] (vide sans arbres). */
export function talentTreesOf(content, classId) {
  return Object.entries(content.classes[classId]?.talentTrees || {}).map(([id, t]) => ({ id, ...t }));
}

/** Les talents d'une classe (les compétences avec un champ `talent`), éventuellement d'un seul arbre, dans l'ordre des données. */
export function talentsOf(content, classId, tree = null) {
  return (content.classes[classId]?.skills || []).filter((s) => s.talent && (!tree || s.talent.tree === tree));
}

/** Nombre de rangs maximal d'un talent. */
export const talentMaxRank = (sk) => sk?.talent?.ranks ?? 1;

/** Points de talent gagnés à ce niveau (0 pour une classe sans arbres). */
export function talentPointsAt(content, classId, level) {
  if (!hasTalents(content, classId)) return 0;
  const r = talentRules(content);
  return Math.max(0, level - r.firstLevel + 1) * r.perLevel;
}
export const talentPointsTotal = (content, character) => talentPointsAt(content, character.classId, character.level);

/** Points à mettre dans un arbre pour ouvrir cette rangée. */
export const rowCost = (content, row) => talentRules(content).rows[row] ?? Infinity;

/** Points mis dans un arbre, d'après des rangs { id: rang } (si `beforeRow` est donné : seulement dans les rangées au-dessus de celle-ci). */
export function pointsInTree(content, ranks, tree, beforeRow = Infinity) {
  let n = 0;
  for (const [id, rank] of Object.entries(ranks || {})) {
    const t = content.skills[id]?.talent;
    if (t && t.tree === tree && t.row < beforeRow) n += rank;
  }
  return n;
}

/**
 * Pourquoi ce point ne peut-il pas s'ajouter à ces rangs ? (null : il peut). Vérifie le talent, son rang maximal, l'ouverture de sa rangée
 * et les évolutions en double. Le nombre de points disponibles est vérifié à part.
 */
function addProblem(content, classId, ranks, id) {
  const sk = content.skills[id];
  if (!sk?.talent || sk.classId !== classId) return 'Talent inconnu.';
  if ((ranks[id] || 0) >= talentMaxRank(sk)) return 'Déjà au rang maximal.';
  const need = rowCost(content, sk.talent.row), have = pointsInTree(content, ranks, sk.talent.tree, sk.talent.row);
  if (have < need) return `Il faut ${need} points dans l'arbre ${content.classes[classId].talentTrees[sk.talent.tree].name} (au-dessus de cette rangée) : il y en a ${have}.`;
  if (sk.replaces) {
    const other = Object.keys(ranks).find((o) => o !== id && ranks[o] > 0 && content.skills[o]?.replaces === sk.replaces);
    if (other) return `« ${content.skills[other].name} » fait déjà évoluer ce sort : un seul des deux.`;
  }
  return null;
}

/**
 * Les rangs EFFECTIFS { id: rang } d'une liste de points, au niveau donné : on reprend les points dans l'ordre, tant qu'il en reste à ce niveau,
 * en sautant ceux qui ne sont plus permis (rangée fermée, talent disparu...). Toujours une répartition valide.
 */
export function ranksFromPoints(content, classId, points, level) {
  const budget = talentPointsAt(content, classId, level);
  const ranks = {};
  let used = 0;
  for (const id of Array.isArray(points) ? points : []) {
    if (used >= budget) break;
    if (addProblem(content, classId, ranks, id)) continue;
    ranks[id] = (ranks[id] || 0) + 1;
    used++;
  }
  return ranks;
}

/** Les rangs du personnage { id: rang } (à son niveau réel, ou à `level` : le niveau effectif d'un donjon). */
export const talentRanks = (content, character, level = character.level) => ranksFromPoints(content, character.classId, character.talents, level);

/** Le rang d'un talent chez un personnage (0 = pas pris). */
export const talentRank = (content, character, id) => talentRanks(content, character)[id] || 0;

/** Les talents pris (au moins 1 rang) au niveau donné : leurs identifiants. */
export const talentIds = (content, character, level = character.level) => (hasTalents(content, character.classId) ? Object.keys(talentRanks(content, character, level)) : []);

/** Points de talent dépensés / encore libres. */
export const talentPointsSpent = (content, character) => Object.values(talentRanks(content, character)).reduce((s, r) => s + r, 0);
export const talentPointsFree = (content, character) => talentPointsTotal(content, character) - talentPointsSpent(content, character);

/** Peut-on ajouter un rang à ce talent ? { ok, reason }. */
export function canAddTalent(content, character, id) {
  const sk = content.skills[id];
  if (!sk?.talent || sk.classId !== character.classId) return { ok: false, reason: 'Talent inconnu.' };
  if (talentPointsFree(content, character) < 1) return { ok: false, reason: talentPointsTotal(content, character) ? 'Plus de point de talent : il en vient un à chaque niveau.' : `Les talents s'ouvrent au niveau ${talentRules(content).firstLevel}.` };
  const problem = addProblem(content, character.classId, talentRanks(content, character), id);
  return problem ? { ok: false, reason: problem } : { ok: true };
}

/** La liste de points sans le DERNIER rang de ce talent. */
const withoutLast = (points, id) => { const i = points.lastIndexOf(id); return i < 0 ? points.slice() : [...points.slice(0, i), ...points.slice(i + 1)]; };

/** Peut-on retirer un rang à ce talent (sans fermer une rangée où il reste des points) ? { ok, reason }. */
export function canRemoveTalent(content, character, id) {
  const sk = content.skills[id];
  if (!sk?.talent || sk.classId !== character.classId) return { ok: false, reason: 'Talent inconnu.' };
  const ranks = talentRanks(content, character);
  if (!ranks[id]) return { ok: false, reason: 'Ce talent n\'est pas pris.' };
  const after = ranksFromPoints(content, character.classId, withoutLast(character.talents, id), character.level);
  const lost = Object.values(ranks).reduce((s, r) => s + r, 0) - Object.values(after).reduce((s, r) => s + r, 0);
  return lost > 1 ? { ok: false, reason: 'Des talents plus bas dans l\'arbre en ont besoin : retire-les d\'abord.' } : { ok: true };
}

/** Ajoute (delta +1) ou retire (delta −1) un rang. Le deck suit : un sort pris s'équipe s'il y a de la place, un sort retiré sort du deck. */
export function changeTalent(content, character, id, delta) {
  const check = delta > 0 ? canAddTalent(content, character, id) : canRemoveTalent(content, character, id);
  if (!check.ok) return check;
  // (on ne garde que les points qui comptent vraiment : la liste reste propre)
  const kept = Object.entries(talentRanks(content, character)).flatMap(([tid, r]) => Array(r).fill(tid));
  const ordered = (character.talents || []).filter((tid) => kept.includes(tid) && kept.splice(kept.indexOf(tid), 1));
  character.talents = delta > 0 ? [...ordered, id] : withoutLast(ordered, id);
  if (!Array.isArray(character.deck)) character.deck = [];
  pruneDeck(content, character);
  if (delta > 0 && deckEligible(content, character, id) && !character.deck.includes(id) && character.deck.length < deckSize(content)) character.deck.push(id);
  return { ok: true };
}

/** Retire tous les talents (gratuit). Le deck est refait. */
export function resetTalents(content, character) {
  character.talents = [];
  fillDeck(content, character);
}

/**
 * La répartition « toute faite » d'un arbre, pour le bouton « Répartir pour moi », les robots et la migration des anciennes spécialisations :
 * l'ordre `preset` de l'arbre (un identifiant par point), puis les autres talents de l'arbre, aussi loin que les points du niveau le permettent.
 * Elle remplace les talents actuels. Renvoie { ok, reason }.
 */
export function applyTalentPreset(content, character, tree) {
  const def = content.classes[character.classId]?.talentTrees?.[tree];
  if (!def) return { ok: false, reason: 'Arbre de talents inconnu.' };
  const order = [...(def.preset || []), ...talentsOf(content, character.classId, tree).flatMap((s) => Array(talentMaxRank(s)).fill(s.id))];
  const ranks = {};
  const points = [];
  for (const id of order) {
    if (addProblem(content, character.classId, ranks, id)) continue;
    ranks[id] = (ranks[id] || 0) + 1;
    points.push(id);
  }
  character.talents = points.slice(0, talentPointsTotal(content, character));
  fillDeck(content, character);
  return { ok: true };
}

/** L'arbre où le personnage a mis le plus de points (le premier en cas d'égalité), ou null s'il n'en a mis aucun. */
export function mainTree(content, character, level = character.level) {
  const ranks = talentRanks(content, character, level);
  let best = null, bestPts = 0;
  for (const t of talentTreesOf(content, character.classId)) {
    const pts = pointsInTree(content, ranks, t.id);
    if (pts > bestPts) { best = t.id; bestPts = pts; }
  }
  return best;
}
