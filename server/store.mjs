// ============================================================
//  store.mjs — Les requêtes à la base (rien d'autre n'écrit du SQL)
// ============================================================

import { transaction } from './db.mjs';

export function createStore(db) {
  const q = (sql) => db.prepare(sql);
  const st = {
    userByKey: q('SELECT * FROM users WHERE name_key = ?'),
    userById: q('SELECT * FROM users WHERE id = ?'),
    countUsers: q('SELECT COUNT(*) AS n FROM users'),
    insertUser: q('INSERT INTO users (name, name_key, pass_salt, pass_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)'),
    touchLogin: q('UPDATE users SET last_login = ? WHERE id = ?'),
    setPassword: q('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?'),
    listUsers: q('SELECT u.id, u.name, u.created_at, u.last_login, (SELECT COUNT(*) FROM characters c WHERE c.user_id = u.id) AS characters FROM users u ORDER BY u.id'),
    deleteUserRuns: q('DELETE FROM runs WHERE id IN (SELECT run_id FROM run_players WHERE user_id = ?)'),
    deleteUser: q('DELETE FROM users WHERE id = ?'),
    deleteSessionsOfUser: q('DELETE FROM sessions WHERE user_id = ?'),
    deleteOtherSessions: q('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?'),
    countSessions: q('SELECT COUNT(*) AS n FROM sessions'),
    insertSession: q('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)'),
    sessionByHash: q('SELECT s.*, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    touchSession: q('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?'),
    deleteSession: q('DELETE FROM sessions WHERE token_hash = ?'),
    sweepSessions: q('DELETE FROM sessions WHERE expires_at < ?'),
    charsOfUser: q('SELECT id, data FROM characters WHERE user_id = ? ORDER BY created_at, id'),
    insertChar: q('INSERT INTO characters (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
    updateChar: q('UPDATE characters SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?'),
    deleteChar: q('DELETE FROM characters WHERE id = ? AND user_id = ?'),
    charExists: q('SELECT 1 AS x FROM characters WHERE id = ?'),
    charRow: q('SELECT id, data FROM characters WHERE id = ? AND user_id = ?'),
    activeRunOfUser: q('SELECT r.* FROM runs r JOIN run_players p ON p.run_id = r.id WHERE p.user_id = ? ORDER BY r.id DESC LIMIT 1'),
    insertRun: q('INSERT INTO runs (kind, state, created_at, updated_at) VALUES (?, ?, ?, ?)'),
    updateRun: q('UPDATE runs SET state = ?, updated_at = ?, rev = rev + 1 WHERE id = ?'),
    runRev: q('SELECT rev FROM runs WHERE id = ?'),
    runById: q('SELECT * FROM runs WHERE id = ?'),
    runOfRoom: q('SELECT r.* FROM runs r JOIN rooms o ON o.run_id = r.id WHERE o.id = ?'),
    runningRooms: q("SELECT * FROM rooms WHERE status = 'running' AND run_id IS NOT NULL"),
    // --- salons
    roomById: q('SELECT * FROM rooms WHERE id = ?'),
    roomByCode: q('SELECT * FROM rooms WHERE code = ?'),
    roomOfUser: q('SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id WHERE m.user_id = ?'),
    roomOfRun: q('SELECT * FROM rooms WHERE run_id = ?'),
    insertRoom: q('INSERT INTO rooms (code, host_id, setup, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    setRoomSetup: q('UPDATE rooms SET setup = ?, updated_at = ? WHERE id = ?'),
    setRoomHost: q('UPDATE rooms SET host_id = ?, updated_at = ? WHERE id = ?'),
    setRoomRunning: q("UPDATE rooms SET status = 'running', run_id = ?, updated_at = ? WHERE id = ?"),
    deleteRoom: q('DELETE FROM rooms WHERE id = ?'),
    deleteOrphanRooms: q("DELETE FROM rooms WHERE status = 'running' AND run_id IS NULL"),
    membersOfRoom: q('SELECT m.*, u.name FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ? ORDER BY m.joined_at, m.user_id'),
    insertMember: q('INSERT INTO room_members (room_id, user_id, char_id, ready, joined_at) VALUES (?, ?, ?, ?, ?)'),
    deleteMember: q('DELETE FROM room_members WHERE room_id = ? AND user_id = ?'),
    setMemberHero: q('UPDATE room_members SET char_id = ?, ready = 0 WHERE room_id = ? AND user_id = ?'),
    setMemberReady: q('UPDATE room_members SET ready = ? WHERE room_id = ? AND user_id = ?'),
    resetReady: q('UPDATE room_members SET ready = 0 WHERE room_id = ? AND user_id <> ?'),
    staleLobbies: q("SELECT id FROM rooms WHERE status = 'lobby' AND updated_at < ?"),
    openRooms: q(`SELECT r.*, u.name AS host_name, (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS players
                  FROM rooms r JOIN users u ON u.id = r.host_id WHERE r.status = 'lobby' ORDER BY r.created_at DESC, r.id DESC LIMIT 50`),
    removeRunPlayer: q('DELETE FROM run_players WHERE run_id = ? AND user_id = ?'),
    deleteRun: q('DELETE FROM runs WHERE id = ?'),
    insertRunPlayer: q('INSERT INTO run_players (run_id, user_id, char_id, player_id) VALUES (?, ?, ?, ?)'),
    runPlayers: q('SELECT user_id, char_id, player_id FROM run_players WHERE run_id = ?'),
    stats: q('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM characters) AS characters, (SELECT COUNT(*) FROM runs) AS runs')
  };

  return {
    transaction: (fn) => transaction(db, fn),
    // --- comptes
    userByKey: (key) => st.userByKey.get(key) ?? null,
    userById: (id) => st.userById.get(id) ?? null,
    countUsers: () => st.countUsers.get().n,
    insertUser: (name, key, salt, hash, now) => Number(st.insertUser.run(name, key, salt, hash, now, now).lastInsertRowid),
    touchLogin: (id, now) => st.touchLogin.run(now, id),
    setPassword: (id, salt, hash) => st.setPassword.run(salt, hash, id),
    listUsers: () => st.listUsers.all(),
    /** Supprime un compte avec tout ce qui lui appartient : personnages et sessions (en cascade), et les parties où il joue. */
    deleteUser: (id) => transaction(db, () => {
      st.deleteUserRuns.run(id);
      const n = Number(st.deleteUser.run(id).changes);
      st.deleteOrphanRooms.run(); // (un salon dont la partie vient de disparaître)
      return n;
    }),
    countSessions: () => st.countSessions.get().n,
    /** Après un changement de mot de passe : on coupe toutes les sessions du compte (sauf, si on la donne, l'empreinte de celle qui vient de changer le mot de passe). */
    deleteSessionsOfUser: (id, exceptHash = null) => (exceptHash ? st.deleteOtherSessions.run(id, exceptHash) : st.deleteSessionsOfUser.run(id)),
    // --- sessions
    insertSession: (hash, userId, now, expires) => st.insertSession.run(hash, userId, now, expires, now),
    sessionByHash: (hash) => st.sessionByHash.get(hash) ?? null,
    touchSession: (hash, now, expires) => st.touchSession.run(now, expires, hash),
    deleteSession: (hash) => st.deleteSession.run(hash),
    sweepSessions: (now) => st.sweepSessions.run(now),
    // --- personnages (stockés en JSON)
    charactersOfUser: (userId) => st.charsOfUser.all(userId).map((r) => ({ id: r.id, data: JSON.parse(r.data) })),
    insertCharacter: (userId, ch, now) => st.insertChar.run(ch.id, userId, JSON.stringify(ch), now, now),
    saveCharacter: (userId, ch, now) => st.updateChar.run(JSON.stringify(ch), now, ch.id, userId),
    deleteCharacter: (userId, id) => st.deleteChar.run(id, userId),
    characterIdTaken: (id) => !!st.charExists.get(id),
    /** Un seul personnage d'un joueur (ou null). */
    characterOf: (userId, charId) => { const r = st.charRow.get(charId, userId); return r ? { id: r.id, data: JSON.parse(r.data) } : null; },
    // --- parties
    activeRunOfUser: (userId) => st.activeRunOfUser.get(userId) ?? null,
    insertRun: (kind, stateJson, now) => Number(st.insertRun.run(kind, stateJson, now, now).lastInsertRowid),
    /** Enregistre l'état d'une partie et renvoie son nouveau numéro de version (il augmente à chaque enregistrement). */
    saveRun: (id, stateJson, now) => {
      st.updateRun.run(stateJson, now, id);
      return st.runRev.get(id).rev;
    },
    runById: (id) => st.runById.get(id) ?? null,
    runOfRoom: (roomId) => st.runOfRoom.get(roomId) ?? null,
    runningRooms: () => st.runningRooms.all(),
    removeRunPlayer: (runId, userId) => st.removeRunPlayer.run(runId, userId),
    // --- salons
    roomById: (id) => st.roomById.get(id) ?? null,
    roomByCode: (code) => st.roomByCode.get(code) ?? null,
    roomOfUser: (userId) => st.roomOfUser.get(userId) ?? null,
    roomOfRun: (runId) => st.roomOfRun.get(runId) ?? null,
    insertRoom: (code, hostId, setupJson, now) => Number(st.insertRoom.run(code, hostId, setupJson, 'lobby', now, now).lastInsertRowid),
    setRoomSetup: (id, setupJson, now) => st.setRoomSetup.run(setupJson, now, id),
    setRoomHost: (id, hostId, now) => st.setRoomHost.run(hostId, now, id),
    setRoomRunning: (id, runId, now) => st.setRoomRunning.run(runId, now, id),
    deleteRoom: (id) => st.deleteRoom.run(id),
    members: (roomId) => st.membersOfRoom.all(roomId),
    insertMember: (roomId, userId, charId, ready, now) => st.insertMember.run(roomId, userId, charId, ready ? 1 : 0, now),
    deleteMember: (roomId, userId) => st.deleteMember.run(roomId, userId),
    setMemberHero: (roomId, userId, charId) => st.setMemberHero.run(charId, roomId, userId),
    setMemberReady: (roomId, userId, ready) => st.setMemberReady.run(ready ? 1 : 0, roomId, userId),
    resetReady: (roomId, exceptUserId) => st.resetReady.run(roomId, exceptUserId),
    openRooms: () => st.openRooms.all(),
    staleLobbies: (before) => st.staleLobbies.all(before).map((r) => r.id),
    deleteRun: (id) => st.deleteRun.run(id),
    insertRunPlayer: (runId, userId, charId, playerId) => st.insertRunPlayer.run(runId, userId, charId, playerId),
    runPlayers: (runId) => st.runPlayers.all(runId),
    stats: () => st.stats.get()
  };
}
