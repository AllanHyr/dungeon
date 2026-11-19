// ============================================================
//  profile.js — Sauvegarde des personnages (localStorage) + code d'export/import
// ============================================================
// Le "profil" contient tous les personnages du joueur. Il est enregistré dans
// le navigateur (localStorage) : fermer puis rouvrir la page retrouve tout.
// Comme localStorage ne passe pas d'un ordinateur à l'autre, on peut aussi
// EXPORTER un "code de sauvegarde" (un long texte) et l'IMPORTER ailleurs.
//
// Ce fichier marche aussi dans Node (pour les tests) grâce à `createStore`.

import { EQUIP_SLOTS } from '../core/content.js';
import { equipFromBag, slotsFor } from '../core/items.js';
import { createCharacter, specLevel, pruneDeck, fillDeck } from '../core/progression.js';
import { forgeRules, ownedItems } from '../core/forge.js';

const PROFILE_KEY = 'donjon.profile.v1';
const RUN_KEY = 'donjon.run.v1';
const CODE_PREFIX = 'DJN1';

// ---------------- Stockage (avec secours si localStorage est bloqué) ----------------

/** Petit coffre clé/valeur. Si localStorage est indisponible, on garde en mémoire. */
export function createStore(storage) {
  let backend = storage;
  if (backend === undefined) {
    try {
      backend = globalThis.localStorage;
      backend.setItem('__test', '1');
      backend.removeItem('__test');
    } catch {
      backend = null;
    }
  }
  const memory = new Map();
  return {
    persistent: !!backend,
    get(key) {
      try {
        return backend ? backend.getItem(key) : memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      try {
        if (backend) backend.setItem(key, value);
        else memory.set(key, value);
      } catch {
        memory.set(key, value);
      }
    },
    remove(key) {
      try {
        if (backend) backend.removeItem(key);
      } catch {
        /* rien */
      }
      memory.delete(key);
    }
  };
}

// ---------------- Profil ----------------

export function createEmptyProfile() {
  return {
    version: 1,
    nextCharNumber: 1,
    characters: [],
    settings: { sound: false, volume: 0.7, fx: null, turnSeconds: 0, training: null, view: 'dungeon', farmChar: null, farmZone: null },
    lastTeam: [],
    lastSetup: { tranche: 1, dungeon: null, mode: 'tranche', stasisLevel: 1 }
  };
}

/** Identifiant unique pour un nouveau personnage. */
export function newCharacterId(profile) {
  const n = profile.nextCharNumber++;
  return `c${n}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Ajoute un nouveau personnage de niveau 1 au profil. */
export function addCharacter(content, profile, { name, classId }) {
  const ch = createCharacter(content, { id: newCharacterId(profile), name, classId });
  profile.characters.push(ch);
  return ch;
}

/** Répare un personnage (venu d'un import ou d'une vieille sauvegarde) pour qu'il soit toujours valide. */
export function sanitizeCharacter(content, raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Les anciennes classes (ex. "tank") sont converties grâce aux 'aliases' de classes.json.
  const classId = content.classes[raw.classId] ? raw.classId : content.classAliases[raw.classId];
  const cls = classId && content.classes[classId];
  if (!cls) return null;

  const ch = createCharacter(content, { id: String(raw.id || ''), name: String(raw.name || '').slice(0, 24), classId });
  ch.level = Math.max(1, Math.min(content.rules.maxLevel, Math.floor(Number(raw.level)) || 1));
  ch.xp = Math.max(0, Math.floor(Number(raw.xp)) || 0);
  const n = (v) => Math.max(0, Math.floor(Number(v)) || 0);
  const st = raw.stats || {};
  ch.stats = {
    runs: n(st.runs), wins: n(st.wins), deaths: n(st.deaths),
    farmRuns: n(st.farmRuns), farmWaves: n(st.farmWaves), farmBest: n(st.farmBest), expeditions: n(st.expeditions),
    clears: {}
  };
  for (const [tranche, rec] of Object.entries(st.clears && typeof st.clears === 'object' ? st.clears : {})) {
    if (content.tranches[tranche]) ch.stats.clears[tranche] = { total: n(rec?.total), group: Math.min(n(rec?.group), n(rec?.total)) };
  }
  // La collection de l'encyclopédie : donjons terminés, monstres vaincus, objets exclusifs trouvés (on ne garde que ce qui existe encore)
  ch.stats.dungeons = {}; ch.stats.bestiary = {}; ch.stats.found = {};
  const obj = (v) => (v && typeof v === 'object' ? v : {});
  for (const [id, k] of Object.entries(obj(st.dungeons))) if (content.dungeons[id] && n(k)) ch.stats.dungeons[id] = n(k);
  for (const [id, k] of Object.entries(obj(st.bestiary))) if (content.monsters[id] && n(k)) ch.stats.bestiary[id] = n(k);
  for (const id of Object.keys(obj(st.found))) if (content.itemDungeon?.[id]) ch.stats.found[id] = true;
  // Succès : on ne garde que ceux qui existent (et qui concernent cette classe)
  ch.achievements = {};
  for (const id of Object.keys(raw.achievements && typeof raw.achievements === 'object' ? raw.achievements : {})) {
    const a = content.achievements[id];
    if (a && raw.achievements[id] && (!a.classes || a.classes.includes(ch.classId))) ch.achievements[id] = true;
  }

  // Compétences : on ne garde que celles qui existent pour cette classe
  const known = new Set(ch.skills);
  for (const id of Array.isArray(raw.skills) ? raw.skills : []) {
    const sk = content.skills[id];
    if (sk && sk.classId === ch.classId && sk.level <= ch.level) known.add(id);
  }
  // Une compétence dont les prérequis manquent est retirée (ex. après une modification des JSON).
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of [...known]) {
      if ((content.skills[id].requires || []).some((r) => !known.has(r))) {
        known.delete(id);
        changed = true;
      }
    }
  }
  ch.skills = [...known];
  // Un seul choix par groupe de choix (`choiceGroup`) : on garde celui qui a été appris en premier.
  const groups = new Set();
  ch.skills = ch.skills.filter((id) => {
    const g = content.skills[id].choiceGroup;
    if (!g) return true;
    const key = `${ch.classId}:${g}`;
    if (groups.has(key)) return false;
    groups.add(key);
    return true;
  });
  // Spécialisation (si elle existe pour la classe et que le niveau le permet), puis deck.
  ch.spec = typeof raw.spec === 'string' && cls.specs?.[raw.spec] && ch.level >= specLevel(content) ? raw.spec : null;
  if (Array.isArray(raw.deck)) {
    ch.deck = raw.deck.filter((id) => typeof id === 'string');
    pruneDeck(content, ch);
  } else {
    ch.deck = []; // ancienne sauvegarde, avant les decks : on équipe les premiers sorts appris
    fillDeck(content, ch);
  }

  // Objets : on supprime ceux qui n'existent plus dans les données
  const seen = new Set();
  const cleanItem = (it) => {
    if (!it || typeof it.id !== 'string' || !content.items[it.id]) return null;
    let uid = String(it.uid || '');
    if (!uid || seen.has(uid)) uid = `${it.id}-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(uid);
    const plus = Math.max(0, Math.min(forgeRules(content).upgradeMax, Math.floor(Number(it.plus)) || 0));
    return plus && !content.items[it.id].consumable ? { uid, id: it.id, plus } : { uid, id: it.id };
  };
  for (const it of Array.isArray(raw.inventory) ? raw.inventory : []) {
    const clean = cleanItem(it);
    if (clean) ch.inventory.push(clean);
  }
  // L'ancien coffre du farm (supprimé) : ce qu'il contenait passe dans le sac, rien ne se perd.
  for (const it of Array.isArray(raw.chest) ? raw.chest : []) {
    const clean = cleanItem(it);
    if (clean) ch.inventory.push(clean);
  }
  // La récompense du farm en attente (3 objets au plus)
  for (const it of Array.isArray(raw.lootChoice) ? raw.lootChoice.slice(0, 3) : []) {
    const clean = cleanItem(it);
    if (clean && !content.items[clean.id].consumable) ch.lootChoice.push(clean);
  }
  // Équipement : les emplacements actuels, PUIS les clés d'un ancien format (weapon / armor / trinket...).
  // Chaque objet passe par le sac puis est équipé (au bon emplacement s'il est connu, sinon au premier emplacement possible) :
  // un objet qui ne peut pas être porté reste dans le sac, rien ne se perd.
  const rawEq = raw.equipment && typeof raw.equipment === 'object' ? raw.equipment : {};
  const holder = { equipment: ch.equipment, bag: ch.inventory, realLevel: ch.level };
  const entries = [...EQUIP_SLOTS.map((slot) => [slot, rawEq[slot]]), ...Object.entries(rawEq).filter(([key]) => !EQUIP_SLOTS.includes(key))];
  for (const [slot, it] of entries) {
    const clean = cleanItem(it);
    if (!clean) continue;
    ch.inventory.push(clean);
    const def = content.items[clean.id];
    equipFromBag(content, holder, clean.uid, EQUIP_SLOTS.includes(slot) && slotsFor(def).includes(slot) ? slot : null);
  }
  // L'expédition en cours (si elle existe encore dans les données)
  const ex = raw.expedition;
  if (ex && typeof ex === 'object' && content.farm.expeditions.list.some((e) => e.id === ex.id) && Number.isFinite(ex.start) && Number.isFinite(ex.end) && ex.end >= ex.start) {
    ch.expedition = { id: ex.id, start: ex.start, end: ex.end };
  }
  // La forge : les éclats, et les cadenas (seulement sur des objets qu'on possède encore)
  ch.shards = n(raw.shards);
  const owned = new Set(ownedItems(ch).map((o) => o.inst.uid));
  ch.locked = [...new Set(Array.isArray(raw.locked) ? raw.locked.filter((u) => typeof u === 'string' && owned.has(u)) : [])];
  return ch;
}

/** Vérifie tout un profil (utilisé au chargement et à l'import). */
export function sanitizeProfile(content, raw) {
  const profile = createEmptyProfile();
  if (!raw || typeof raw !== 'object') return profile;
  profile.nextCharNumber = Math.max(1, raw.nextCharNumber | 0 || 1);
  const ids = new Set();
  for (const c of Array.isArray(raw.characters) ? raw.characters : []) {
    const ch = sanitizeCharacter(content, c);
    if (!ch) continue;
    if (!ch.id || ids.has(ch.id)) ch.id = newCharacterId(profile);
    ids.add(ch.id);
    profile.characters.push(ch);
  }
  profile.settings = {
    sound: !!raw.settings?.sound,
    volume: Number.isFinite(raw.settings?.volume) ? Math.max(0, Math.min(1, raw.settings.volume)) : 0.7, // volume des sons (0 à 1)
    fx: ['full', 'fast', 'min'].includes(raw.settings?.fx) ? raw.settings.fx : null, // animations : complètes, rapides, réduites (null : selon le système)
    turnSeconds: Math.max(0, Math.min(300, Number(raw.settings?.turnSeconds) || 0)), // minuteur de tour (0 = désactivé)
    training: raw.settings?.training && Array.isArray(raw.settings.training.specs) ? raw.settings.training : null, // dernière salle d'entraînement
    view: ['farm', 'expeditions'].includes(raw.settings?.view) ? raw.settings.view : 'dungeon', // onglet de l'accueil : donjon en équipe, farm solo ou expéditions
    farmChar: ids.has(raw.settings?.farmChar) ? raw.settings.farmChar : null, // dernier personnage envoyé au farm
    farmZone: typeof raw.settings?.farmZone === 'string' && content.farm.zones[raw.settings.farmZone] ? raw.settings.farmZone : null // dernière zone de farm
  };
  profile.lastTeam = (Array.isArray(raw.lastTeam) ? raw.lastTeam : []).filter((id) => ids.has(id)).slice(0, 4);
  const ls = raw.lastSetup || {};
  profile.lastSetup = {
    tranche: Number(ls.tranche) || 1,
    dungeon: typeof ls.dungeon === 'string' && /^[a-z0-9_]{1,40}$/.test(ls.dungeon) ? ls.dungeon : null, // (vérifié à l'accueil : s'il n'existe plus, le premier de la tranche)
    mode: ['basic', 'tranche', 'stasis'].includes(ls.mode) ? ls.mode : 'tranche',
    stasisLevel: Math.max(1, Math.min(3, Number(ls.stasisLevel) || 1))
  };
  return profile;
}

export function loadProfile(content, store) {
  const text = store.get(PROFILE_KEY);
  if (!text) return createEmptyProfile();
  try {
    return sanitizeProfile(content, JSON.parse(text));
  } catch {
    return createEmptyProfile();
  }
}

export function saveProfile(profile, store) {
  store.set(PROFILE_KEY, JSON.stringify(profile));
}

// ---------------- Code de sauvegarde (export / import) ----------------

/** Petite empreinte (FNV-1a) pour détecter un code copié de travers. */
function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(b64) {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Fabrique le code de sauvegarde (tous les personnages, ou seulement `charIds`). */
export function exportCode(profile, charIds = null) {
  const characters = profile.characters.filter((c) => !charIds || charIds.includes(c.id));
  const payload = toBase64(JSON.stringify({ v: 1, characters }));
  return `${CODE_PREFIX}.${payload}.${checksum(payload)}`;
}

/**
 * Lit un code de sauvegarde. Renvoie la liste des personnages valides.
 * Lance une Error (message en français) si le code est faux.
 */
export function importCode(content, code) {
  const clean = String(code || '').replace(/\s+/g, '');
  const parts = clean.split('.');
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) throw new Error("Ce n'est pas un code de sauvegarde valide.");
  if (checksum(parts[1]) !== parts[2]) throw new Error('Le code est abîmé (copié de travers ?).');
  let data;
  try {
    data = JSON.parse(fromBase64(parts[1]));
  } catch {
    throw new Error('Le code est illisible.');
  }
  const characters = (Array.isArray(data.characters) ? data.characters : []).map((c) => sanitizeCharacter(content, c)).filter(Boolean);
  if (!characters.length) throw new Error('Aucun personnage dans ce code.');
  return characters;
}

/**
 * Ajoute des personnages importés au profil (ils reçoivent de nouveaux identifiants
 * si l'ancien est déjà pris, pour ne rien écraser).
 */
export function addImported(profile, characters) {
  const taken = new Set(profile.characters.map((c) => c.id));
  for (const ch of characters) {
    if (!ch.id || taken.has(ch.id)) ch.id = newCharacterId(profile);
    taken.add(ch.id);
    profile.characters.push(ch);
  }
  return characters.length;
}

// ---------------- Run en cours (pour reprendre après fermeture) ----------------

export function saveRun(state, store) {
  store.set(RUN_KEY, JSON.stringify(state));
}

export function loadRunText(store) {
  return store.get(RUN_KEY);
}

export function clearRun(store) {
  store.remove(RUN_KEY);
}
