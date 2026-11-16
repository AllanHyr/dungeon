// ============================================================
//  db.mjs — La base de données (SQLite, intégrée à Node : aucune installation)
// ============================================================
// Tables : users, sessions, characters, runs, run_players, rooms, room_members.
// Les personnages sont stockés en JSON (c'est exactement le format du jeu) ; le reste est classique.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Charge node:sqlite (sans l'avertissement « expérimental » qui salirait les journaux), avec un message clair si Node est trop vieux. */
async function importSqlite() {
  const original = process.emitWarning;
  process.emitWarning = function (warning, ...rest) {
    if (String(warning?.message ?? warning).includes('SQLite')) return undefined;
    return original.call(this, warning, ...rest);
  };
  try {
    return await import('node:sqlite');
  } catch {
    throw new Error(
      `Ce serveur a besoin de Node 22.5 ou plus récent (module « node:sqlite »). Version actuelle : ${process.version}.\n` +
      'Node 22.13 et plus : rien à ajouter. Entre 22.5 et 22.12 : lance  node --experimental-sqlite server/server.mjs'
    );
  } finally {
    process.emitWarning = original;
  }
}

/** Les évolutions de la base, dans l'ordre. `PRAGMA user_version` retient la dernière appliquée. */
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    pass_salt BLOB NOT NULL,
    pass_hash BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    last_login INTEGER
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX characters_user ON characters(user_id);
  CREATE TABLE runs (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE run_players (
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    char_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    PRIMARY KEY (run_id, player_id)
  );
  CREATE INDEX run_players_user ON run_players(user_id);
  `,
  // 2 : les salons (jouer à plusieurs, un héros par joueur) et un numéro de version pour chaque partie
  `
  ALTER TABLE runs ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE rooms (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    setup TEXT NOT NULL,
    status TEXT NOT NULL,
    run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE room_members (
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    char_id TEXT NOT NULL,
    ready INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );
  CREATE INDEX room_members_room ON room_members(room_id);
  `
];

/** Ouvre (et crée si besoin) la base. `path` peut être ':memory:' (tests). */
export async function openDatabase(path) {
  const { DatabaseSync } = await importSqlite();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;');
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

/** Exécute `fn` dans une transaction (tout ou rien). */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
