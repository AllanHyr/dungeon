// ============================================================
//  content.js — Assemble et vérifie tout le contenu (fichiers JSON)
// ============================================================
// Le contenu du jeu (classes, compétences, objets, monstres, tranches...) vit dans /data.
// Ce fichier prend les JSON bruts, construit des "annuaires" pratiques
// (retrouver une compétence par son id, etc.) et VÉRIFIE que tout est cohérent.
// Si tu fais une faute dans un JSON (un type d'effet mal écrit, une compétence qui
// n'existe pas...), l'erreur est expliquée en français ici.
//
// Ce module ne lit aucun fichier lui-même : c'est le "chargeur" (navigateur
// ou Node) qui lui donne les JSON déjà lus. Comme ça il marche partout.

/** Les noms des fichiers de données à charger. */
export const DATA_FILES = ['rules', 'modes', 'classes', 'skills', 'items', 'monsters', 'tiles', 'events', 'tranches', 'dungeons', 'farm', 'achievements'];

/**
 * Les emplacements d'équipement d'un personnage, dans l'ordre d'affichage.
 * (Les noms français sont dans data/items.json, section "slots".)
 */
export const EQUIP_SLOTS = ['head', 'neck', 'shoulders', 'back', 'chest', 'hands', 'belt', 'legs', 'feet', 'ring1', 'ring2', 'mainHand', 'offHand', 'relic'];

/**
 * Les TYPES d'objets (champ "slot" d'un objet dans data/items.json) et les emplacements où chacun peut se porter :
 *   ring    -> l'un ou l'autre des deux anneaux
 *   weapon  -> la main droite ou la main gauche (deux armes à une main), sauf si "twoHanded": true (main droite seulement, et la main gauche reste libre)
 *   offhand -> la main gauche seulement (bouclier, grimoire...)
 */
export const ITEM_TYPES = {
  head: ['head'], neck: ['neck'], shoulders: ['shoulders'], back: ['back'], chest: ['chest'], hands: ['hands'], belt: ['belt'], legs: ['legs'], feet: ['feet'],
  ring: ['ring1', 'ring2'],
  weapon: ['mainHand', 'offHand'],
  offhand: ['offHand'],
  relic: ['relic']
};

/** Les types de cases qui peuvent sortir au hasard dans un donjon. */
export const RANDOM_TILE_TYPES = ['combat', 'treasure', 'trap', 'xp_fountain', 'life_fountain', 'low_blow', 'merchant'];

// ---- Vocabulaire du format des compétences (tout ce que le moteur comprend) ----
export const EFFECT_TYPES = ['damage', 'heal', 'shield', 'hot', 'dot', 'poison', 'mod', 'taunt', 'stun', 'guard', 'move', 'resource', 'pa', 'resurrect', 'cleanse', 'survive', 'mode', 'redirect', 'mark', 'reanimate', 'breakShield', 'summon', 'expiation', 'tempo'];
export const EFFECT_TARGETS = ['target', 'self', 'allies', 'allAllies', 'enemies', 'allEnemies', 'lowestAlly', 'source', 'attacker', 'randomEnemy', 'lowestEnemy', 'expiation'];
export const TRIGGER_EVENTS = ['combatStart', 'turnStart', 'turnEnd', 'dealDamage', 'takeDamage', 'kill', 'crit', 'fumble', 'wouldDie', 'modeChange', 'spend'];
export const SKILL_TARGETS = ['enemy', 'enemies', 'ally', 'allies', 'self', 'deadAlly', 'lowestAlly'];
export const MODIFIER_STATS = ['hp', 'atk', 'def', 'heal', 'save', 'luck', 'ini', 'pa', 'damage', 'dot', 'taken', 'healPower', 'critShift', 'fumbleShift', 'overhealShield', 'healTaken'];
export const SCALINGS = ['missingHpPct', 'hpPct', 'alliesAlive', 'enemiesAlive'];
export const CONDITIONS = ['hpPctBelow', 'hpPctAbove', 'row', 'resourceAtLeast', 'targetHpPctBelow', 'targetMarked', 'targetStatus', 'targetKey', 'alliesAliveAtLeast', 'mode', 'spec', 'roundAtMost', 'notAfflicted'];
const CLASS_STATS = ['hp', 'atk', 'def', 'heal', 'save', 'luck', 'ini'];
// Le champ facultatif `fx` d'une compétence : comment la MONTRER (voir docs/ECRIRE-UNE-CLASSE.md et src/ui/fx-plan.js). Rien n'est obligatoire :
// sans `fx`, le jeu déduit le geste de la portée, de la cible et des effets de la compétence.
export const FX_VOCAB = {
  delivery: ['melee', 'spin', 'projectile', 'smite', 'wave', 'self', 'ally', 'allies'], // comment ça part
  hit: ['slash', 'pierce', 'smash', 'claw', 'bite', 'blast', 'splat', 'sonic', 'drain', 'auto'], // l'impact (auto : selon l'espèce du monstre)
  element: ['physical', 'holy', 'fire', 'poison', 'nature', 'shadow', 'frost', 'arcane', 'blood'], // la couleur
  shot: ['orb', 'arrow', 'beam', 'thorn', 'spit', 'bolt', 'wisp'], // la forme du projectile
  support: ['heal', 'shield', 'guard', 'buff', 'haste', 'taunt', 'rage', 'stun', 'poison', 'resurrect', 'cleanse', 'roots', 'debuff'], // effet non offensif
  dash: ['long'] // élan plus long
};
const FX_FLAGS = ['flurry', 'cross', 'drain']; // oui / non : rafale de coups, coup en croix, siphon

// ---- Vocabulaire des succès (data/achievements.json) : champs obligatoires de chaque condition ----
export const ACHIEVEMENT_CONDITIONS = {
  farmBestWave: ['atLeast'], // la meilleure session de farm : nombre de vagues vaincues d'affilée
  farmWaves: ['atLeast'], // total de vagues de farm vaincues
  reachLevel: ['atLeast'], // niveau du personnage
  gearLevel: ['atLeast'], // niveau d'équipement : somme des niveaux des objets portés
  dungeonCleared: ['tranche'] // donjon terminé ('minPartySize': 2 = en groupe ; 'count' : combien de fois)
};
export const ACHIEVEMENT_REWARDS = ['skill', 'feature', 'title'];
/** Les fonctions du jeu qu'un succès peut débloquer (et leur nom affiché). */
export const FEATURES = { grandesExpeditions: 'Grandes expéditions (une nuit)' };

function fail(message) {
  throw new Error('Données du jeu invalides : ' + message);
}

const list = (a) => a.join(', ');

// ============================================================
//  Vérification des compétences, effets, modificateurs et déclencheurs
// ============================================================

function checkCondition(cond, where) {
  for (const k of Object.keys(cond)) if (!CONDITIONS.includes(k)) fail(`${where} : condition "${k}" inconnue. Conditions connues : ${list(CONDITIONS)}.`);
  if (cond.mode !== undefined && typeof cond.mode !== 'string') fail(`${where} : la condition 'mode' doit être l'identifiant d'un mode de la classe (texte).`);
  if (cond.roundAtMost !== undefined && !(cond.roundAtMost >= 1)) fail(`${where} : la condition 'roundAtMost' doit être un nombre de rounds (1 = pendant le premier round du combat).`);
  if (cond.notAfflicted !== undefined && cond.notAfflicted !== true) fail(`${where} : la condition 'notAfflicted' doit valoir true (l'unité ne saigne pas et n'est pas empoisonnée).`);
  if (cond.spec !== undefined && typeof cond.spec !== 'string') fail(`${where} : la condition 'spec' doit être l'identifiant d'une spécialisation de la classe (texte).`);
  if (cond.targetMarked !== undefined && typeof cond.targetMarked !== 'boolean') fail(`${where} : la condition 'targetMarked' doit valoir true ou false (la cible est marquée par le lanceur).`);
  if (cond.targetStatus !== undefined && typeof cond.targetStatus !== 'string') fail(`${where} : la condition 'targetStatus' doit être l'identifiant d'un statut (« dot », « poison », « mark »...).`);
  if (cond.targetKey !== undefined && typeof cond.targetKey !== 'string') fail(`${where} : la condition 'targetKey' doit être la clé d'un statut précis (la « key » d'un dot, ex. « brulure »).`);
}

function checkScaling(obj, where) {
  for (const k of Object.keys(obj)) {
    if (!SCALINGS.includes(k) && !k.startsWith('resource:')) fail(`${where} : valeur "${k}" inconnue dans pctPer/flatPer. Connues : ${list(SCALINGS)}, resource:<id>.`);
  }
}

function checkModifier(m, where) {
  if (!m || !MODIFIER_STATS.includes(m.stat)) fail(`${where} : stat "${m?.stat}" inconnue. Stats connues : ${list(MODIFIER_STATS)}.`);
  if (m.pct === undefined && m.flat === undefined && !m.pctPer && !m.flatPer) fail(`${where} : un modificateur a besoin de 'pct', 'flat', 'pctPer' ou 'flatPer'.`);
  if (m.pctPer) checkScaling(m.pctPer, where);
  if (m.flatPer) checkScaling(m.flatPer, where);
  if (m.if) checkCondition(m.if, where);
}

function checkEffect(e, where) {
  if (!e || typeof e !== 'object') fail(`${where} : effet invalide.`);
  if (!EFFECT_TYPES.includes(e.type)) fail(`${where} : type d'effet "${e.type}" inconnu. Types connus : ${list(EFFECT_TYPES)}.`);
  if (e.to !== undefined && !EFFECT_TARGETS.includes(e.to)) fail(`${where} : cible d'effet "to": "${e.to}" inconnue. Cibles connues : ${list(EFFECT_TARGETS)}.`);
  if (e.if !== undefined) checkCondition(e.if, `${where} (condition 'if' de l'effet)`);
  if (e.ifTarget !== undefined) checkCondition(e.ifTarget, `${where} (condition 'ifTarget' de l'effet)`);
  const need = (cond, text) => cond || fail(`${where} : l'effet "${e.type}" demande ${text}.`);
  switch (e.type) {
    case 'damage': need(e.power !== undefined || e.pctMaxHp !== undefined, "'power' (ou 'pctMaxHp')"); need(e.powerPerMissingHp === undefined || typeof e.powerPerMissingHp === 'number', "'powerPerMissingHp' sous forme de nombre (puissance en plus par % de PV manquants du lanceur)");
      need(e.powerPerTargetMissingHp === undefined || typeof e.powerPerTargetMissingHp === 'number', "'powerPerTargetMissingHp' sous forme de nombre (puissance en plus par % de PV manquants de la cible)");
      if (e.bonus !== undefined) {
        need(Array.isArray(e.bonus), "'bonus' sous forme de liste : [{ \"ifTarget\": {...}, \"power\": 0.4 }]");
        e.bonus.forEach((b, i) => { need(typeof b.power === 'number', `'power' (nombre) dans le bonus n°${i + 1}`); if (b.ifTarget) checkCondition(b.ifTarget, `${where} (bonus n°${i + 1})`); });
      }
      break;
    case 'heal': need(e.power !== undefined || e.pctMaxHp !== undefined || e.pctOfDamage !== undefined, "'power', 'pctMaxHp' ou 'pctOfDamage'"); break;
    case 'shield': need(e.power !== undefined || e.pctMaxHp !== undefined || e.pctMissingHp !== undefined, "'power', 'pctMaxHp' ou 'pctMissingHp'"); break;
    case 'hot': need(e.power !== undefined, "'power'"); need(e.turns > 0, "'turns'"); break;
    case 'dot':
      need(e.power !== undefined, "'power'"); need(e.turns > 0, "'turns'");
      need(e.stack === undefined || typeof e.stack === 'boolean', "'stack' : true ou false (chaque pose ajoute un cumul)");
      need(e.maxStacks === undefined || e.maxStacks >= 1, "'maxStacks' : au moins 1");
      need(e.drain === undefined || (typeof e.drain === 'number' && e.drain > 0 && e.drain <= 1), "'drain' entre 0 et 1 (part des dégâts de chaque tour rendue en soin à l'allié le plus blessé du lanceur)");
      break;
    case 'expiation': need(e.turns > 0, "'turns' (durée de l'Expiation)"); break;
    case 'mark': need(e.pct === undefined || e.pct >= 0, "'pct' positif (0,2 = +20 % de dégâts du lanceur sur la cible)"); need(e.max === undefined || e.max >= 1, "'max' : au moins 1 (nombre de marques en même temps)"); break;
    case 'poison': need(e.pct !== undefined, "'pct'"); need(e.turns > 0, "'turns'"); break;
    case 'mod': need(MODIFIER_STATS.includes(e.stat), "un 'stat' valide"); need(e.pct !== undefined || e.flat !== undefined, "'pct' ou 'flat'"); need(e.turns > 0, "'turns'"); break;
    case 'resource': need(typeof e.id === 'string' && e.amount !== undefined, "'id' et 'amount'"); break;
    case 'pa': need(e.amount !== undefined, "'amount'"); break;
    case 'move': need(['front', 'back', 'toggle'].includes(e.row), "'row' : front, back ou toggle"); break;
    case 'mode': need(typeof e.set === 'string' && e.set, "'set' : \"toggle\" (passe au mode suivant), \"pick\" (le joueur choisit) ou l'identifiant d'un mode de la classe"); break;
    case 'redirect': need(e.turns === undefined || e.turns > 0, "'turns' positif (1 = jusqu'à son prochain tour)"); break;
    case 'summon': need(typeof e.monster === 'string' && e.monster, "'monster' : l'identifiant du monstre appelé"); need(e.max === undefined || e.max >= 1, "'max' : au moins 1 (renforts vivants en même temps)"); break;
    case 'reanimate': need(e.hpPct === undefined || (e.hpPct > 0 && e.hpPct <= 1), "'hpPct' entre 0 et 1 (part de ses PV avec laquelle le monstre se relève)"); break;
    case 'survive': need(e.hpPct === undefined || (e.hpPct > 0 && e.hpPct <= 1), "'hpPct' entre 0 et 1 (ou 'hp' : un nombre de PV)"); break;
    default:
  }
}

function checkEffects(effects, where, required = false) {
  if (effects === undefined && !required) return;
  if (!Array.isArray(effects) || (required && !effects.length)) fail(`${where} : 'effects' doit être une liste non vide.`);
  effects.forEach((e, i) => checkEffect(e, `${where}, effet n°${i + 1}`));
}

function checkTrigger(t, where) {
  if (!TRIGGER_EVENTS.includes(t?.on)) fail(`${where} : événement "${t?.on}" inconnu pour 'on'. Événements connus : ${list(TRIGGER_EVENTS)}.`);
  if (!t.effect && !t.effects) fail(`${where} : un déclencheur a besoin de 'effect' ou 'effects'.`);
  if (t.if) checkCondition(t.if, where);
  checkEffects(t.effects || [t.effect], where, true);
}

/** Vérifie le champ `fx` d'une compétence : que des mots que le moteur d'animation connaît. */
function checkFx(fx, label) {
  if (!fx || typeof fx !== 'object' || Array.isArray(fx)) fail(`${label} : 'fx' doit être un objet, par exemple { "delivery": "projectile", "element": "fire" }.`);
  for (const [k, v] of Object.entries(fx)) {
    if (FX_VOCAB[k]) {
      if (!FX_VOCAB[k].includes(v)) fail(`${label} : fx.${k} "${v}" inconnu. Valeurs connues : ${list(FX_VOCAB[k])}.`);
    } else if (k === 'weight') {
      if (![1, 2, 3].includes(v)) fail(`${label} : fx.weight doit valoir 1 (léger), 2 (normal) ou 3 (lourd).`);
    } else if (FX_FLAGS.includes(k)) {
      if (typeof v !== 'boolean') fail(`${label} : fx.${k} doit être true ou false.`);
    } else {
      fail(`${label} : fx.${k} inconnu. Champs connus : ${list([...Object.keys(FX_VOCAB), 'weight', ...FX_FLAGS])}.`);
    }
  }
}

/** Vérifie une compétence (de classe, commune ou de monstre). */
function checkSkill(sk, where, rows) {
  if (!sk.id || typeof sk.id !== 'string') fail(`${where} : une compétence n'a pas d'identifiant ('id').`);
  const label = `compétence "${sk.id}"`;
  if (!sk.name) fail(`${label} : 'name' manquant.`);
  if (sk.type === 'passive') {
    (sk.modifiers || []).forEach((m, i) => checkModifier(m, `${label}, modificateur n°${i + 1}`));
    (sk.triggers || []).forEach((t, i) => checkTrigger(t, `${label}, déclencheur n°${i + 1}`));
    if (sk.targetDamage !== undefined) {
      if (!Array.isArray(sk.targetDamage)) fail(`${label} : 'targetDamage' doit être une liste : [{ "ifTarget": {...}, "pct": 0.25 }].`);
      sk.targetDamage.forEach((t, i) => { if (typeof t.pct !== 'number') fail(`${label}, targetDamage n°${i + 1} : 'pct' (nombre) manquant.`); if (t.ifTarget) checkCondition(t.ifTarget, `${label}, targetDamage n°${i + 1}`); });
    }
    if (!sk.modifiers?.length && !sk.triggers?.length && !sk.targetDamage?.length) fail(`${label} : une passive a besoin de 'modifiers', 'triggers' et/ou 'targetDamage'.`);
    return;
  }
  if (sk.type !== 'active') fail(`${label} : 'type' doit être "active" ou "passive" (reçu "${sk.type}").`);
  if (typeof sk.pa !== 'number' || sk.pa < 0) fail(`${label} : 'pa' (coût en points d'action) doit être un nombre.`);
  if (!SKILL_TARGETS.includes(sk.target)) fail(`${label} : 'target' "${sk.target}" inconnue. Cibles connues : ${list(SKILL_TARGETS)}.`);
  if (sk.range !== undefined && !['melee', 'ranged', 'any'].includes(sk.range)) fail(`${label} : 'range' doit être melee, ranged ou any.`);
  if (sk.from && !sk.from.every((r) => rows.includes(r))) fail(`${label} : 'from' doit contenir des rangs parmi ${list(rows)}.`);
  checkEffects(sk.effects, label, true);
  checkEffects(sk.critEffects, label + ' (critEffects)');
  checkEffects(sk.fumbleEffects, label + ' (fumbleEffects)');
  if (sk.dice) {
    for (const k of Object.keys(sk.dice)) if (!['fumble', 'crit', 'onFumble'].includes(k)) fail(`${label} : 'dice.${k}' inconnu (fumble, crit, onFumble).`);
    if (sk.dice.onFumble && !['miss', 'endTurn'].includes(sk.dice.onFumble)) fail(`${label} : 'dice.onFumble' doit être "miss" ou "endTurn".`);
  }
  if (sk.needsMark !== undefined && typeof sk.needsMark !== 'boolean') fail(`${label} : 'needsMark' doit valoir true ou false (inutilisable tant que le lanceur n'a marqué personne).`);
  if (sk.freeIfNoMark !== undefined && typeof sk.freeIfNoMark !== 'boolean') fail(`${label} : 'freeIfNoMark' doit valoir true ou false (gratuite tant que le lanceur n'a aucune cible marquée).`);
  if (sk.freeFirst !== undefined && typeof sk.freeFirst !== 'boolean') fail(`${label} : 'freeFirst' doit valoir true ou false (première utilisation du combat gratuite en PA).`);
  if (sk.spend && (typeof sk.spend.id !== 'string' || !(sk.spend.amount > 0))) fail(`${label} : 'spend' doit être { "id": ..., "amount": ... } (avec "all": true pour tout dépenser, au moins "amount").`);
  if (sk.spend?.all !== undefined && typeof sk.spend.all !== 'boolean') fail(`${label} : 'spend.all' doit valoir true ou false.`);
  if (sk.fx !== undefined) checkFx(sk.fx, label);
}

// ============================================================
//  Construction du contenu
// ============================================================

/**
 * Construit le "contenu" à partir des JSON bruts.
 * @param {object} raw  { rules, modes, classes, skills, items, monsters, tiles, events, tranches }
 */
export function buildContent(raw) {
  for (const f of DATA_FILES) if (!raw[f]) fail(`le fichier data/${f}.json est manquant.`);

  const c = {
    rules: raw.rules,
    modes: raw.modes.modes,
    tiles: raw.tiles.tiles,
    lowBlows: raw.events.lowBlows,
    pacts: raw.events.pacts || [],
    rarities: raw.items.rarities,
    slotNames: raw.items.slots, // noms des emplacements (« Main droite »...)
    typeNames: raw.items.types, // noms des types d'objets : { name: « Anneau », section: « Anneaux » }
    statNames: raw.items.stats,
    classes: {},
    classAliases: {},
    skills: {},
    commonSkillIds: [],
    basicSkillId: null, // le corps à corps basique de toutes les classes (compétence commune "slot": "basic")
    replacedBy: {}, // compétence de base -> variantes évoluées par une spécialisation (champ 'replaces')
    items: {},
    itemList: [],
    monsters: {},
    tranches: {},
    trancheList: [],
    dungeons: {}, // les donjons à thème (data/dungeons.json), par identifiant
    dungeonList: [],
    dungeonsByTranche: {}, // tranche -> ses donjons, dans l'ordre du fichier
    dungeonRules: {} // donjon -> ses réglages complets (ceux de sa tranche + les siens)
  };
  const rows = c.rules.combat.rows;

  // --- Raretés : on garde l'ordre (de la plus commune à la plus rare)
  c.rarityIndex = {};
  c.rarities.forEach((r, i) => (c.rarityIndex[r.id] = i));

  // --- Annuaire de TOUTES les compétences (classes + communes + monstres)
  const addSkill = (sk, extra, where) => {
    checkSkill(sk, where, rows);
    if (c.skills[sk.id]) fail(`la compétence "${sk.id}" existe deux fois.`);
    c.skills[sk.id] = { ...sk, ...extra };
  };

  for (const sk of raw.skills.common || []) {
    addSkill(sk, { common: true, level: 1 }, 'compétences communes');
    c.commonSkillIds.push(sk.id);
    if (sk.slot !== undefined && sk.slot !== 'basic') fail(`compétence commune "${sk.id}" : 'slot' ne peut valoir que "basic" (le corps à corps basique). Valeur lue : ${JSON.stringify(sk.slot)}.`);
    if (sk.slot === 'basic') {
      if (c.basicSkillId) fail(`compétences communes : "${c.basicSkillId}" et "${sk.id}" ont toutes deux "slot": "basic" (il n'y en a qu'une).`);
      if (sk.type !== 'active') fail(`compétence commune "${sk.id}" : le corps à corps basique doit être une compétence ACTIVE.`);
      c.basicSkillId = sk.id;
    }
  }
  if (!c.basicSkillId) fail('compétences communes : aucune n\'a "slot": "basic" (le corps à corps basique de toutes les classes, par exemple "attaque_arme").');
  for (const [id, sk] of Object.entries(raw.monsters.skills || {})) addSkill({ ...sk, id, type: 'active' }, { monsterSkill: true }, 'compétences de monstres');
  // Les PARTICULARITÉS de monstres (régénération, riposte...) : des passives, données à un monstre par son champ "passives".
  for (const [id, sk] of Object.entries(raw.monsters.passives || {})) addSkill({ ...sk, id, type: 'passive' }, { monsterSkill: true, monsterPassive: true }, 'particularités de monstres');

  // --- Classes
  for (const [id, cls] of Object.entries(raw.classes.classes)) {
    const where = `classe "${id}"`;
    // On travaille sur des COPIES des compétences : les succès y ajoutent "unlockedBy" sans abîmer les JSON d'origine.
    c.classes[id] = { ...cls, id, skills: Array.isArray(cls.skills) ? cls.skills.map((s) => ({ ...s })) : cls.skills };
    for (const alias of cls.aliases || []) c.classAliases[alias] = id;
    for (const k of CLASS_STATS) if (typeof cls.baseStats?.[k] !== 'number') fail(`${where} : baseStats.${k} manquant.`);
    if (!rows.includes(cls.startRow)) fail(`${where} : 'startRow' doit être ${list(rows)}.`);
    if (!Array.isArray(cls.skills) || !cls.skills.length) fail(`${where} : aucune compétence.`);
    for (const sk of c.classes[id].skills) {
      addSkill(sk, { classId: id }, `${where}`);
      if (typeof sk.level !== 'number') fail(`compétence "${sk.id}" : 'level' manquant.`);
      if (typeof sk.cost !== 'number') fail(`compétence "${sk.id}" : 'cost' (points de compétence) manquant.`);
    }
    const mine = c.classes[id].skills;
    // 'basicAttack' (facultatif, ancien format) : une compétence de départ de la classe, équipée dans le deck dès la création.
    if (cls.basicAttack !== undefined) {
      const basic = mine.find((s) => s.id === cls.basicAttack);
      if (!basic || basic.type !== 'active' || !basic.innate) fail(`${where} : 'basicAttack' doit désigner une compétence ACTIVE et 'innate' de la classe.`);
    }
    // 'classSkill' (facultatif) : le sort de classe (posture, forme, aura...), dans son propre emplacement de la barre de combat, hors deck.
    if (cls.classSkill !== undefined) {
      const cs = mine.find((s) => s.id === cls.classSkill);
      if (!cs || cs.type !== 'active' || !cs.innate) fail(`${where} : 'classSkill' doit désigner une compétence ACTIVE et 'innate' de la classe (le sort de classe est connu dès le départ).`);
    }
    for (const sk of mine) {
      for (const req of sk.requires || []) if (!mine.some((s) => s.id === req)) fail(`compétence "${sk.id}" : 'requires' contient "${req}", qui n'existe pas dans la classe "${id}".`);
      for (const ex of sk.exclusiveWith || []) if (!mine.some((s) => s.id === ex)) fail(`compétence "${sk.id}" : 'exclusiveWith' contient "${ex}", qui n'existe pas dans la classe "${id}".`);
    }
    // Spécialisations (facultatif) : { "id": { "name": "...", "desc": "..." } }. Les compétences y sont rattachées par "spec".
    const specs = cls.specs || {};
    for (const [sid, info] of Object.entries(specs)) {
      if (!info || typeof info.name !== 'string' || !info.name) fail(`${where} : specs["${sid}"] doit être { "name": "...", "desc": "..." }.`);
      if (info.desc !== undefined && typeof info.desc !== 'string') fail(`${where} : specs["${sid}"].desc doit être une phrase (texte).`);
      if (info.tag !== undefined && (typeof info.tag !== 'string' || !info.tag)) fail(`${where} : specs["${sid}"].tag doit être un mot (texte) : le rôle affiché sur la carte, par exemple "Tank".`);
      // 'upcoming' (facultatif) : les paliers « à venir » qu'on laisse entrevoir aux joueurs : [{ "level": 12, "name": "...", "desc": "..." }]
      if (info.upcoming !== undefined) {
        if (!Array.isArray(info.upcoming)) fail(`${where} : specs["${sid}"].upcoming doit être une liste de paliers : [{ "level": 12, "name": "...", "desc": "..." }].`);
        for (const u of info.upcoming) if (!u || !(u.level > 0) || typeof u.name !== 'string' || !u.name || (u.desc !== undefined && typeof u.desc !== 'string')) fail(`${where} : specs["${sid}"].upcoming : chaque palier a besoin d'un 'level' (nombre) et d'un 'name' (texte), 'desc' est facultatif.`);
      }
    }
    // 'modes' (facultatif) : un état propre à la classe, qu'un sort bascule (effet "mode") et dont dépendent des conditions { "mode": "..." }.
    if (cls.modes !== undefined) {
      const ml = cls.modes?.list;
      if (!ml || typeof ml !== 'object' || Object.keys(ml).length < 2) fail(`${where} : 'modes' doit être { "default": "...", "list": { "id": { "name": "...", "desc": "..." }, ... } } avec au moins deux modes.`);
      for (const [mid, m] of Object.entries(ml)) if (!m || typeof m.name !== 'string' || !m.name) fail(`${where} : modes.list["${mid}"] doit avoir un 'name'.`);
      if (!ml[cls.modes.default]) fail(`${where} : modes.default "${cls.modes.default}" n'est pas un mode de la liste (${list(Object.keys(ml))}).`);
      // 'aura' (facultatif) : des modificateurs donnés à TOUS les alliés (lui compris) tant que le héros est dans ce mode : [{ "stat": "taken", "pct": -0.08, "if": { "spec": "gardien" } }]
      for (const [mid, m] of Object.entries(ml)) {
        if (m.aura === undefined) continue;
        if (!Array.isArray(m.aura) || !m.aura.length) fail(`${where} : modes.list["${mid}"].aura doit être une liste de modificateurs : [{ "stat": "taken", "pct": -0.08 }].`);
        m.aura.forEach((a, i) => checkModifier(a, `${where} : modes.list["${mid}"].aura, modificateur n°${i + 1}`));
        for (const a of m.aura) for (const k of Object.keys(a.if || {})) if (!['spec', 'mode'].includes(k)) fail(`${where} : modes.list["${mid}"].aura : la condition "${k}" n'est pas possible ici. Une aura ne dépend que de la spécialisation ('spec') ou du mode ('mode') de celui qui la porte.`);
        for (const a of m.aura) if (a.if?.spec !== undefined && !specs[a.if.spec]) fail(`${where} : modes.list["${mid}"].aura : condition 'spec' "${a.if.spec}" inconnue (spécialisations : ${Object.keys(specs).length ? list(Object.keys(specs)) : 'aucune'}).`);
      }
    }
    const modeIds = Object.keys(cls.modes?.list || {});
    const checkModeRefs = (conds, label) => conds.forEach((cd) => {
      if (cd?.spec !== undefined && !specs[cd.spec]) fail(`${label} : condition 'spec' "${cd.spec}" inconnue dans la classe "${id}" (spécialisations : ${Object.keys(specs).length ? list(Object.keys(specs)) : 'aucune'}).`);
      if (cd?.mode !== undefined && !modeIds.includes(cd.mode)) fail(`${label} : condition 'mode' "${cd.mode}" inconnue dans la classe "${id}" (modes : ${modeIds.length ? list(modeIds) : 'aucun, ajoute "modes" à la classe'}).`);
    });
    for (const sk of mine) {
      checkModeRefs([...(sk.modifiers || []).map((m) => m.if), ...(sk.triggers || []).map((t) => t.if)].filter(Boolean), `compétence "${sk.id}"`);
      for (const e of [...(sk.effects || []), ...(sk.critEffects || []), ...(sk.fumbleEffects || []), ...(sk.triggers || []).flatMap((t) => t.effects || [t.effect])]) {
        if (e?.if) checkModeRefs([e.if], `compétence "${sk.id}" (effet "${e.type}")`);
        if (e?.type === 'mode' && e.set !== 'toggle' && e.set !== 'pick' && !modeIds.includes(e.set)) fail(`compétence "${sk.id}" : effet "mode" : 'set' "${e.set}" inconnu dans la classe "${id}" (toggle, pick ou ${modeIds.length ? list(modeIds) : 'aucun mode : ajoute "modes" à la classe'}).`);
      }
      if (sk.modes !== undefined) {
        if (!Array.isArray(sk.modes) || !sk.modes.length) fail(`compétence "${sk.id}" : 'modes' doit être une liste de modes de la classe (ex. ["ours"]) : la compétence ne se lance que dans ces modes.`);
        for (const m of sk.modes) if (!modeIds.includes(m)) fail(`compétence "${sk.id}" : 'modes' : "${m}" n'est pas un mode de la classe "${id}" (${modeIds.length ? list(modeIds) : 'aucun mode : ajoute "modes" à la classe'}).`);
      }
      if (sk.auto !== undefined) {
        if (sk.auto !== true) fail(`compétence "${sk.id}" : 'auto' doit valoir true (débloquée automatiquement avec la spécialisation).`);
        if (sk.spec === undefined) fail(`compétence "${sk.id}" : une compétence 'auto' doit être rattachée à une spécialisation ('spec').`);
        if (sk.innate || sk.replaces || sk.choiceGroup || (sk.requires || []).length) fail(`compétence "${sk.id}" : 'auto' ne se combine pas avec 'innate', 'replaces', 'choiceGroup' ni 'requires'.`);
      }
    }
    for (const sk of mine) {
      if (sk.spec !== undefined) {
        if (!specs[sk.spec]) fail(`compétence "${sk.id}" : 'spec' "${sk.spec}" inconnue. Spécialisations de la classe "${id}" : ${Object.keys(specs).length ? list(Object.keys(specs)) : 'aucune (ajoute "specs" à la classe)'}.`);
        if (sk.innate) fail(`compétence "${sk.id}" : une compétence de départ ('innate') ne peut pas appartenir à une spécialisation ('spec').`);
      }
      if (sk.choiceGroup !== undefined && (typeof sk.choiceGroup !== 'string' || !sk.choiceGroup)) fail(`compétence "${sk.id}" : 'choiceGroup' doit être un nom (texte) : les compétences qui le partagent s'excluent entre elles.`);
      if (sk.replaces !== undefined) {
        const base = mine.find((s) => s.id === sk.replaces);
        if (!base) fail(`compétence "${sk.id}" : 'replaces' désigne "${sk.replaces}", qui n'existe pas dans la classe "${id}".`);
        if (sk.type !== 'active' || base.type !== 'active') fail(`compétence "${sk.id}" : 'replaces' ne remplace qu'une compétence ACTIVE par une autre active.`);
        if (sk.spec === undefined) fail(`compétence "${sk.id}" : une version évoluée ('replaces') doit être rattachée à une spécialisation ('spec').`);
        if (sk.innate) fail(`compétence "${sk.id}" : une version évoluée ('replaces') ne peut pas être 'innate' (elle s'active avec la spécialisation).`);
        if (base.replaces !== undefined) fail(`compétence "${sk.id}" : on ne peut pas remplacer une compétence qui en remplace déjà une ("${base.id}").`);
        (c.replacedBy[base.id] ||= []).push(sk.id);
      }
    }
    if (cls.resource && (!cls.resource.id || !(cls.resource.max > 0))) fail(`${where} : 'resource' doit avoir un 'id' et un 'max'.`);
    // 'branches' (facultatif) : une phrase par branche de l'arbre, affichée dans la fiche. Le nom doit être celui d'un "branch" de compétence.
    for (const [bname, info] of Object.entries(cls.branches || {})) {
      if (!mine.some((s) => s.branch === bname)) fail(`${where} : 'branches' décrit « ${bname} », mais aucune compétence n'a "branch": "${bname}".`);
      if (!info || (info.desc !== undefined && typeof info.desc !== 'string')) fail(`${where} : branches["${bname}"] doit être { "desc": "une phrase" }.`);
    }
  }

  // --- Objets
  for (const slot of EQUIP_SLOTS) if (!c.slotNames?.[slot]) fail(`items.json : "slots" doit donner un nom à l'emplacement "${slot}".`);
  for (const type of [...Object.keys(ITEM_TYPES), 'consumable']) if (!c.typeNames?.[type]?.name) fail(`items.json : "types" doit donner un nom au type "${type}" ({ "name": "...", "section": "..." }).`);
  for (const it of raw.items.items) {
    if (c.items[it.id]) fail(`l'objet "${it.id}" existe deux fois.`);
    if (c.rarityIndex[it.rarity] === undefined) fail(`objet "${it.id}" : rareté "${it.rarity}" inconnue.`);
    if (it.slot !== 'consumable' && !ITEM_TYPES[it.slot]) fail(`objet "${it.id}" : 'slot' "${it.slot}" inconnu. Types connus : ${Object.keys(ITEM_TYPES).join(', ')}, consumable.`);
    if (it.twoHanded && it.slot !== 'weapon') fail(`objet "${it.id}" : "twoHanded" ne s'utilise que pour une arme ('slot': "weapon").`);
    if (typeof it.level !== 'number') fail(`objet "${it.id}" : 'level' manquant.`);
    (it.modifiers || []).forEach((m, i) => checkModifier(m, `objet "${it.id}", modificateur n°${i + 1}`));
    (it.triggers || []).forEach((t, i) => checkTrigger(t, `objet "${it.id}", déclencheur n°${i + 1}`));
    c.items[it.id] = it;
    c.itemList.push(it);
  }

  // --- Monstres
  for (const m of raw.monsters.monsters) {
    if (c.monsters[m.id]) fail(`le monstre "${m.id}" existe deux fois.`);
    if (!rows.includes(m.row)) fail(`monstre "${m.id}" : 'row' doit être ${list(rows)}.`);
    if (typeof m.pa !== 'number' || typeof m.ini !== 'number') fail(`monstre "${m.id}" : 'pa' et 'ini' sont obligatoires.`);
    if (!Array.isArray(m.skills)) fail(`monstre "${m.id}" : 'skills' manquant.`);
    for (const s of m.skills) if (!c.skills[s.skill]?.monsterSkill || c.skills[s.skill].monsterPassive) fail(`monstre "${m.id}" : la compétence "${s.skill}" n'existe pas dans la section 'skills' de monsters.json.`);
    if (m.passives !== undefined && !Array.isArray(m.passives)) fail(`monstre "${m.id}" : 'passives' doit être une liste d'identifiants de la section 'passives' de monsters.json.`);
    for (const pid of m.passives || []) if (!c.skills[pid]?.monsterPassive) fail(`monstre "${m.id}" : la particularité "${pid}" n'existe pas dans la section 'passives' de monsters.json.`);
    if (m.family !== undefined && (typeof m.family !== 'string' || !m.family)) fail(`monstre "${m.id}" : 'family' doit être un nom (texte), par exemple "Ogre".`);
    c.monsters[m.id] = m;
  }

  for (const sk of Object.values(c.skills)) for (const e of sk.effects || []) if (e.type === 'summon' && !c.monsters[e.monster]) fail(`compétence "${sk.id}" : effet "summon" : le monstre "${e.monster}" n'existe pas dans monsters.json.`);

  // --- Tranches
  for (const t of raw.tranches.tranches) {
    c.tranches[t.id] = t;
    c.trancheList.push(t);
  }
  c.trancheList.sort((a, b) => a.id - b.id);

  // --- Donjons : chaque tranche (une plage de niveaux) contient UN OU PLUSIEURS donjons à thème (data/dungeons.json), chacun avec ses monstres,
  //     son boss, ses mécaniques et sa table de butin. Une tranche écrite « à l'ancienne » (monsterPool / bossId dans tranches.json, aucun donjon)
  //     reçoit un donjon implicite du même nom : rien n'est cassé.
  for (const d of raw.dungeons?.dungeons || []) {
    const where = `donjon "${d?.id}"`;
    if (!d || typeof d.id !== 'string' || !/^[a-z0-9_]+$/.test(d.id)) fail(`dungeons.json : chaque donjon a besoin d'un 'id' (lettres minuscules, chiffres, _).`);
    if (c.dungeons[d.id]) fail(`le donjon "${d.id}" existe deux fois.`);
    if (!c.tranches[d.tranche]) fail(`${where} : 'tranche' ${d.tranche} inconnue (tranches : ${list(c.trancheList.map((t) => t.id))}).`);
    if (typeof d.name !== 'string' || !d.name) fail(`${where} : 'name' manquant.`);
    c.dungeons[d.id] = d;
    c.dungeonList.push(d);
  }
  for (const t of c.trancheList) {
    const mine = c.dungeonList.filter((d) => d.tranche === t.id);
    if (!mine.some((d) => d.available !== false) && t.monsterPool) {
      const d = { id: `tranche_${t.id}`, tranche: t.id, name: t.name, description: t.description, monsterPool: t.monsterPool, bossId: t.bossId, scene: t.scene, implicit: true };
      c.dungeons[d.id] = d;
      c.dungeonList.push(d);
      mine.push(d);
    }
    c.dungeonsByTranche[t.id] = mine;
  }
  c.itemDungeon = {}; // objet exclusif -> le donjon où il tombe (et nulle part ailleurs)
  for (const d of c.dungeonList) {
    const t = c.tranches[d.tranche];
    const where = `donjon "${d.id}"`;
    const playable = t.available && d.available !== false;
    if (playable) {
      if (!Array.isArray(d.monsterPool) || !d.monsterPool.length) fail(`${where} : monsterPool est vide.`);
      for (const id of d.monsterPool) if (!c.monsters[id]) fail(`${where} : monstre "${id}" introuvable dans monsters.json.`);
      if (!c.monsters[d.bossId]) fail(`${where} : boss "${d.bossId}" introuvable dans monsters.json.`);
      for (const id of d.bossEscort || []) if (!c.monsters[id]) fail(`${where} : 'bossEscort' contient "${id}", introuvable dans monsters.json.`);
      for (const type of Object.keys(d.tileWeights || {})) if (!c.tiles[type]) fail(`${where} : type de case "${type}" inconnu.`);
    }
    if (d.minMonsters !== undefined && !(d.minMonsters >= 1 && d.minMonsters <= 4)) fail(`${where} : 'minMonsters' doit être un nombre entre 1 et 4 (monstres par combat au minimum, même en solo).`);
    // 'setBonus' : la PANOPLIE du donjon — porter plusieurs objets de sa table donne un bonus : [{ "pieces": 2, "desc": "...", "modifiers": [...] }]
    if (d.setBonus !== undefined) {
      if (!Array.isArray(d.setBonus) || !d.setBonus.length) fail(`${where} : 'setBonus' doit être une liste : [{ "pieces": 2, "desc": "...", "modifiers": [...] }].`);
      d.setBonus.forEach((b, i) => {
        if (!b || !(b.pieces >= 2) || typeof b.desc !== 'string' || !b.desc || !Array.isArray(b.modifiers) || !b.modifiers.length) fail(`${where} : setBonus n°${i + 1} a besoin de 'pieces' (2 ou plus), 'desc' (texte) et 'modifiers' (liste).`);
        if (b.pieces > (d.loot || []).length) fail(`${where} : setBonus n°${i + 1} demande ${b.pieces} pièces, mais la table 'loot' n'en a que ${(d.loot || []).length}.`);
        b.modifiers.forEach((m, k) => checkModifier(m, `${where}, setBonus n°${i + 1}, modificateur n°${k + 1}`));
      });
      if (typeof d.setName !== 'string' || !d.setName) fail(`${where} : une panoplie ('setBonus') a besoin d'un nom ('setName').`);
    }
    if (d.mechanics !== undefined) {
      if (!Array.isArray(d.mechanics) || d.mechanics.some((m) => !m || typeof m.name !== 'string' || !m.name || typeof m.desc !== 'string')) fail(`${where} : 'mechanics' doit être une liste de { "name": "...", "desc": "..." } (ce qu'il faut savoir avant d'entrer).`);
    }
    for (const id of d.loot || []) {
      const it = c.items[id];
      if (!it) fail(`${where} : 'loot' contient "${id}", introuvable dans items.json.`);
      if (it.level > t.id) fail(`${where} : l'objet "${id}" (niveau ${it.level}) est trop haut pour la tranche ${t.id}.`);
      if (it.slot === 'consumable') fail(`${where} : 'loot' ne contient que de l'équipement ("${id}" est un consommable).`);
      if (c.itemDungeon[id]) fail(`${where} : l'objet "${id}" est déjà dans la table du donjon "${c.itemDungeon[id]}" (un objet exclusif n'appartient qu'à un donjon).`);
      c.itemDungeon[id] = d.id;
    }
    // Les réglages d'une partie dans ce donjon : ceux de sa tranche, que le donjon peut surcharger (longueur, cases, or...).
    c.dungeonRules[d.id] = { ...t, ...d, trancheId: t.id };
  }
  for (const t of c.trancheList) {
    if (!t.available) continue; // les tranches "à venir" n'ont pas besoin de contenu
    if (!c.dungeonsByTranche[t.id].some((d) => d.available !== false)) fail(`tranche ${t.id} : aucun donjon jouable (ajoute-en un dans dungeons.json, ou monsterPool / bossId dans la tranche).`);
    for (const type of Object.keys(t.tileWeights || {})) if (!c.tiles[type]) fail(`tranche ${t.id} : type de case "${type}" inconnu.`);
    if (!c.itemList.some((i) => i.level <= t.id)) fail(`tranche ${t.id} : aucun objet de niveau <= ${t.id}.`);
  }
  if (!c.trancheList.some((t) => t.available)) fail('aucune tranche disponible.');

  // --- Coups bas et pactes (events.json)
  const GAINS = ['buff', 'heal'];
  const checkGain = (g, where) => {
    if (!g) return;
    if (!GAINS.includes(g.kind)) fail(`${where} : gain.kind "${g.kind}" inconnu (buff, heal).`);
    if (g.kind === 'buff' && (typeof g.stat !== 'string' || typeof g.pct !== 'number' || !(g.combats >= 1))) fail(`${where} : un gain « buff » demande stat, pct et combats.`);
    if (g.kind === 'heal' && !(g.hpPct > 0)) fail(`${where} : un gain « heal » demande hpPct.`);
  };
  for (const b of c.lowBlows) { if (!['poison', 'damage', 'skip', 'curse'].includes(b.kind)) fail(`coup bas "${b.id}" : kind "${b.kind}" inconnu.`); checkGain(b.gain, `coup bas "${b.id}"`); }
  for (const p of c.pacts) {
    if (!p.id || !p.name || !p.cost || !p.gain) fail(`pacte "${p.id}" : id, name, cost et gain sont obligatoires.`);
    if (!['poison', 'damage', 'skip', 'curse'].includes(p.cost.kind)) fail(`pacte "${p.id}" : cost.kind "${p.cost.kind}" inconnu.`);
    checkGain(p.gain, `pacte "${p.id}"`);
  }

  // --- Zones de farm solo
  c.farm = { zones: {}, zoneList: [] };
  for (const [id, z] of Object.entries(raw.farm.zones || {})) {
    const where = `zone de farm "${id}"`;
    if (!c.tranches[z.trancheId]?.available) fail(`${where} : 'trancheId' ${z.trancheId} inconnu ou indisponible.`);
    if (!Array.isArray(z.monsterPool) || !z.monsterPool.length) fail(`${where} : 'monsterPool' est vide.`);
    for (const m of z.monsterPool) if (!c.monsters[m]) fail(`${where} : monstre "${m}" introuvable dans monsters.json.`);
    if (!c.monsters[z.bossId]) fail(`${where} : boss "${z.bossId}" introuvable dans monsters.json.`);
    const w = z.waves || {};
    for (const k of ['countStart', 'extraMonsterEvery', 'countMax', 'hpPerWave', 'atkPerWave', 'bossEvery']) if (typeof w[k] !== 'number') fail(`${where} : waves.${k} manquant (nombre).`);
    if (w.countStart < 1 || w.countMax < w.countStart || w.extraMonsterEvery < 1) fail(`${where} : waves.countStart >= 1, countMax >= countStart et extraMonsterEvery >= 1 sont obligatoires.`);
    if (!w.bossScale || typeof w.bossScale.hp !== 'number' || typeof w.bossScale.atk !== 'number') fail(`${where} : waves.bossScale doit être { "hp": ..., "atk": ... }.`);
    if (typeof z.healBetweenWavesPct !== 'number') fail(`${where} : 'healBetweenWavesPct' manquant.`);
    if (z.minLevel !== undefined && !(z.minLevel >= 1)) fail(`${where} : 'minLevel' doit valoir au moins 1.`);
    const r = z.rewards || {};
    for (const k of ['xpMult', 'xpPerWave', 'catchUpXpMult', 'shardsPerWave', 'bossShards', 'choiceCount', 'itemMaxLevel']) if (typeof r[k] !== 'number') fail(`${where} : rewards.${k} manquant (nombre).`);
    if (!(r.choiceCount >= 1)) fail(`${where} : rewards.choiceCount doit valoir au moins 1.`);
    if (!Array.isArray(r.choiceTiers) || !r.choiceTiers.length) fail(`${where} : rewards.choiceTiers est vide.`);
    let prev = 0;
    for (const tier of r.choiceTiers) {
      if (!(tier.waves > prev)) fail(`${where} : rewards.choiceTiers doit être rangé par 'waves' croissant (à partir de 1).`);
      prev = tier.waves;
      if (!tier.rarityWeights || !Object.keys(tier.rarityWeights).length) fail(`${where} : un palier de choiceTiers n'a pas de rarityWeights.`);
      for (const rar of Object.keys(tier.rarityWeights)) {
        if (c.rarityIndex[rar] === undefined) fail(`${where} : rareté "${rar}" inconnue dans choiceTiers.`);
        if (!c.itemList.some((i) => i.rarity === rar && i.level <= r.itemMaxLevel && i.slot !== 'consumable' && !c.itemDungeon?.[i.id])) fail(`${where} : aucun objet de rareté "${rar}" et de niveau <= ${r.itemMaxLevel} dans items.json (impossible de tirer ce butin).`);
      }
    }
    c.farm.zones[id] = { ...z, id };
    c.farm.zoneList.push(c.farm.zones[id]);
  }
  if (!c.farm.zoneList.length) fail('farm.json : aucune zone de farm.');

  // --- Expéditions (farm.json > expeditions)
  const ex = raw.farm.expeditions || {};
  if (!(ex.maxActive >= 1)) fail("farm.json : expeditions.maxActive doit valoir au moins 1.");
  if (!Array.isArray(ex.list) || !ex.list.length) fail('farm.json : expeditions.list est vide.');
  const exIds = new Set();
  for (const e of ex.list) {
    const where = `expédition "${e.id}"`;
    if (!e.id || exIds.has(e.id)) fail(`${where} : identifiant manquant ou en double.`);
    exIds.add(e.id);
    if (!(e.minutes > 0) || !(e.minLevel >= 1) || typeof e.name !== 'string') fail(`${where} : name, minutes (> 0) et minLevel (>= 1) sont obligatoires.`);
    if (e.feature && !FEATURES[e.feature]) fail(`${where} : fonction "${e.feature}" inconnue.`);
    const r = e.rewards || {};
    if (!Array.isArray(r.shards) || r.shards.length !== 2 || !(r.shards[0] <= r.shards[1])) fail(`${where} : rewards.shards doit être [min, max].`);
    for (const k of ['xpFraction', 'itemChance', 'itemMaxLevel']) if (typeof r[k] !== 'number') fail(`${where} : rewards.${k} manquant (nombre).`);
    if (!r.rarityWeights || !Object.keys(r.rarityWeights).length) fail(`${where} : rewards.rarityWeights est vide.`);
    for (const rar of Object.keys(r.rarityWeights)) if (c.rarityIndex[rar] === undefined) fail(`${where} : rareté "${rar}" inconnue.`);
  }
  c.farm.expeditions = { maxActive: ex.maxActive, list: ex.list.map((e) => ({ ...e })) };

  // --- Succès (et compétences qu'ils débloquent)
  c.achievements = {};
  c.achievementList = [];
  for (const a of raw.achievements.achievements || []) {
    const where = `succès "${a.id}"`;
    if (!a.id || typeof a.id !== 'string') fail("un succès n'a pas d'identifiant ('id').");
    if (c.achievements[a.id]) fail(`le succès "${a.id}" existe deux fois.`);
    if (!a.name) fail(`${where} : 'name' manquant.`);
    for (const cls of a.classes || []) if (!c.classes[cls]) fail(`${where} : classe "${cls}" inconnue dans 'classes'.`);
    const cond = a.condition;
    if (!cond || !ACHIEVEMENT_CONDITIONS[cond.type]) fail(`${where} : condition "${cond?.type}" inconnue. Conditions connues : ${list(Object.keys(ACHIEVEMENT_CONDITIONS))}.`);
    for (const k of ACHIEVEMENT_CONDITIONS[cond.type]) if (cond[k] === undefined) fail(`${where} : la condition "${cond.type}" demande '${k}'.`);
    if (cond.type === 'dungeonCleared' && !c.tranches[cond.tranche]) fail(`${where} : tranche ${cond.tranche} inconnue.`);
    if (!Array.isArray(a.rewards) || !a.rewards.length) fail(`${where} : 'rewards' doit être une liste non vide.`);
    for (const rw of a.rewards) {
      if (!ACHIEVEMENT_REWARDS.includes(rw.type)) fail(`${where} : récompense "${rw.type}" inconnue. Récompenses connues : ${list(ACHIEVEMENT_REWARDS)}.`);
      if (rw.type === 'feature' && !FEATURES[rw.feature]) fail(`${where} : fonction "${rw.feature}" inconnue. Fonctions connues : ${list(Object.keys(FEATURES))}.`);
      if (rw.type === 'title' && !rw.text) fail(`${where} : un titre a besoin de 'text'.`);
      if (rw.type === 'skill') {
        const sk = c.skills[rw.skillId];
        if (!sk?.classId) fail(`${where} : la compétence "${rw.skillId}" n'existe pas dans une classe.`);
        if (a.classes && !a.classes.includes(sk.classId)) fail(`${where} : la compétence "${rw.skillId}" est de la classe "${sk.classId}", absente de 'classes' du succès.`);
        if (sk.unlockedBy) fail(`la compétence "${rw.skillId}" est débloquée par deux succès ("${sk.unlockedBy}" et "${a.id}").`);
        // La compétence est verrouillée jusqu'au succès (dans l'annuaire ET dans la liste de sa classe).
        sk.unlockedBy = a.id;
        const inClass = c.classes[sk.classId].skills.find((s) => s.id === rw.skillId);
        if (inClass) inClass.unlockedBy = a.id;
      }
    }
    c.achievements[a.id] = a;
    c.achievementList.push(a);
  }

  // --- Modes
  for (const key of ['basic', 'tranche', 'stasis']) if (!c.modes[key]) fail(`le mode "${key}" est manquant.`);
  for (const [key, m] of Object.entries(c.modes)) {
    if (m.maxRarity && c.rarityIndex[m.maxRarity] === undefined) fail(`mode "${key}" : maxRarity "${m.maxRarity}" inconnue.`);
    for (const r of Object.keys(m.rarityWeights || {})) if (c.rarityIndex[r] === undefined) fail(`mode "${key}" : rareté "${r}" inconnue dans rarityWeights.`);
  }

  // --- Illustrations facultatives : `art` (classe, monstre, type de case) et `scene` (tranche, zone de farm) sont des chemins d'image ou des noms de décor
  const textFields = [
    ['classe', c.classes, 'art'], ['monstre', c.monsters, 'art'], ['type de case', c.tiles, 'art'],
    ['tranche', c.tranches, 'scene'], ['donjon', c.dungeons, 'scene'], ['zone de farm', c.farm?.zones || {}, 'scene']
  ];
  for (const [what, map, field] of textFields) {
    for (const [id, def] of Object.entries(map)) {
      if (def[field] !== undefined && (typeof def[field] !== 'string' || !def[field].trim())) {
        fail(`${what} "${id}" : '${field}' doit être un texte (le chemin d'une image, par exemple "img/mon-dessin.png").`);
      }
    }
  }

  return c;
}

/** Fusionne un mode (et son niveau de stasis) en un seul objet de réglages numériques. */
export function getModeParams(content, setup) {
  const mode = content.modes[setup.mode];
  if (!mode) fail(`mode "${setup.mode}" inconnu.`);
  if (setup.mode === 'stasis') {
    const lvl = mode.levels.find((l) => l.level === setup.stasisLevel) || mode.levels[0];
    return { restrict: mode.restrict, maxRarity: mode.maxRarity, rarityWeights: mode.rarityWeights, minPlayers: mode.minPlayers, ...lvl };
  }
  const { levels, ...rest } = mode;
  return { ...rest };
}

/** Les donjons JOUABLES d'une tranche (dans l'ordre du fichier). */
export function dungeonsOf(content, trancheId) {
  return (content.dungeonsByTranche[trancheId] || []).filter((d) => d.available !== false);
}

/** Le donjon d'une partie : celui de `setup.dungeon`, sinon le premier de la tranche (anciennes parties, farm, Atelier). */
export function dungeonIdOf(content, setup) {
  const d = setup?.dungeon && content.dungeons[setup.dungeon];
  if (d && d.tranche === setup.tranche) return d.id;
  return dungeonsOf(content, setup?.tranche)[0]?.id ?? null;
}

/** Les réglages complets du donjon d'une partie (tranche + donjon) : monsterPool, bossId, boardLength, tileWeights, or, pièges... */
export function dungeonRules(content, setup) {
  return content.dungeonRules[dungeonIdOf(content, setup)] || content.tranches[setup?.tranche];
}

/** Liste des tranches jouables (celles marquées available). */
export function availableTranches(content) {
  return content.trancheList.filter((t) => t.available);
}
