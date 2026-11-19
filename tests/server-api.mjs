// Tests du serveur : comptes, sécurité, personnages, parties, fichiers. Aucun navigateur : on parle à l'API avec fetch.
// (Les salons — jouer à plusieurs — sont dans tests/server-rooms.mjs.)
// Usage : node tests/server-api.mjs
import { createConnection } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAdmin, AdminError } from '../server/admin.mjs';
import { openDatabase } from '../server/db.mjs';
import { chooseAction, makeRand } from './bot.mjs';
import { attachContent, DATA_FILES } from '../src/core/index.js';
import { runner, assert, eq, Browser, RELAXED, baseConfig, startServer, newUser, seed, userIdOf, create } from './server-kit.mjs';

const R = runner();
const test = R.test;

// ============================================================
const main = async () => {
  const { app, base, port } = await startServer();
  const content = app.game.content();
  const anon = new Browser(base);

  console.log('\n● Comptes et sessions');
  await test('hello : le serveur se présente, personne n\'est connecté', async () => {
    const r = await anon.get('/api/hello');
    assert(r.status === 200 && r.json.online === true && r.json.user === null, r.text);
    eq(r.json.inviteRequired, false);
    assert(r.json.contentVersion.length > 5);
  });
  await test('inscription : pseudo et mot de passe vérifiés', async () => {
    for (const [name, password, part] of [['a', 'secret123', 'pseudo'], ['x'.repeat(21), 'secret123', 'pseudo'], ['<script>', 'secret123', 'pseudo'], ['Valide', '123', 'mot de passe'], ['Valide', 'x'.repeat(201), 'mot de passe']]) {
      const r = await anon.post('/api/register', { name, password });
      assert(r.status === 400 && r.json.error.includes(part), `${name}/${password.length} : ${r.status} ${r.text}`);
    }
  });
  let alice;
  await test('inscription : compte créé, connecté tout de suite, cookie sûr', async () => {
    alice = new Browser(base);
    const r = await alice.post('/api/register', { name: 'Alice', password: 'secret123' });
    assert(r.status === 200 && r.json.user.name === 'Alice', r.text);
    assert(/HttpOnly/.test(alice.lastSetCookie) && /SameSite=Lax/.test(alice.lastSetCookie), alice.lastSetCookie);
    assert(!/Secure/.test(alice.lastSetCookie), 'pas de Secure en HTTP simple');
    eq((await alice.get('/api/hello')).json.user.name, 'Alice');
  });
  await test('un pseudo est unique, sans tenir compte des majuscules ni des accents', async () => {
    for (const name of ['alice', 'ALICE', 'Alicé']) {
      const r = await new Browser(base).post('/api/register', { name, password: 'secret123' });
      assert(r.status === 409, `${name} : ${r.status}`);
    }
  });
  await test('le mot de passe n\'est jamais stocké en clair ; le jeton de session non plus', async () => {
    const row = app.db.prepare('SELECT * FROM users WHERE name = ?').get('Alice');
    assert(!Buffer.from(row.pass_hash).includes('secret123') && Buffer.from(row.pass_hash).length === 64, 'hachage');
    const token = /donjon_session=([^;]+)/.exec(alice.cookie)[1];
    const sessions = app.db.prepare('SELECT token_hash FROM sessions').all();
    assert(sessions.length >= 1 && sessions.every((s) => s.token_hash !== token && s.token_hash.length === 64), 'on ne garde que l\'empreinte du jeton');
  });
  await test('déconnexion, mauvaise connexion, bonne connexion', async () => {
    await alice.post('/api/logout');
    assert(alice.cookie === '', 'cookie effacé');
    eq((await alice.get('/api/profile')).status, 401);
    const bad = await alice.post('/api/login', { name: 'Alice', password: 'faux-mot-de-passe' });
    assert(bad.status === 401 && /incorrect/.test(bad.json.error), bad.text);
    const unknown = await alice.post('/api/login', { name: 'Personne', password: 'secret123' });
    eq(unknown.json.error, bad.json.error, 'même message : on ne révèle pas quels pseudos existent');
    const good = await alice.post('/api/login', { name: 'alice', password: 'secret123' });
    assert(good.status === 200 && good.json.user.name === 'Alice', good.text);
    eq((await alice.get('/api/profile')).status, 200);
  });
  await test('changer de mot de passe : il faut l\'ancien, et les autres appareils sont déconnectés', async () => {
    const pierre = await newUser(base, 'Pierre', 'ancien-mdp');
    const tablet = new Browser(base);
    eq((await tablet.post('/api/login', { name: 'pierre', password: 'ancien-mdp' })).status, 200);
    const hashOf = () => Buffer.from(app.db.prepare('SELECT pass_hash FROM users WHERE name = ?').get('Pierre').pass_hash).toString('hex');
    const before = hashOf();
    // Refus : mauvais ancien mot de passe (403 : un 401 ferait croire à la page que sa session a expiré), nouveau trop court, pas connecté
    const bad = await pierre.post('/api/password', { current: 'pas-le-bon', next: 'nouveau-mdp' });
    assert(bad.status === 403 && /actuel/.test(bad.json.error), bad.text);
    const short = await pierre.post('/api/password', { current: 'ancien-mdp', next: '123' });
    assert(short.status === 400 && /nouveau mot de passe/.test(short.json.error), short.text);
    eq((await anon.post('/api/password', { current: 'ancien-mdp', next: 'nouveau-mdp' })).status, 401);
    eq(hashOf(), before, 'rien n\'a changé après ces refus');
    // Réussite
    const ok = await pierre.post('/api/password', { current: 'ancien-mdp', next: 'nouveau-mdp' });
    assert(ok.status === 200 && ok.json.ok, ok.text);
    assert(hashOf() !== before, 'le hachage a changé');
    eq((await pierre.get('/api/profile')).status, 200, 'cet appareil reste connecté');
    eq((await tablet.get('/api/profile')).status, 401, 'les autres appareils sont déconnectés');
    eq((await new Browser(base).post('/api/login', { name: 'Pierre', password: 'ancien-mdp' })).status, 401);
    eq((await new Browser(base).post('/api/login', { name: 'Pierre', password: 'nouveau-mdp' })).status, 200);
  });
  await test('changer de mot de passe : les essais ratés sont limités', async () => {
    const lea = await newUser(base, 'Léa', 'mdp-de-lea');
    app.limiters.login.max = 8; // les vraies limites
    let last;
    for (let i = 0; i < 10; i++) last = await lea.post('/api/password', { current: `faux${i}`, next: 'nouveau-mdp' });
    eq(last.status, 429);
    app.limiters.login.max = 1e6;
    app.limiters.login.hits.clear();
  });
  await test('trop d\'essais de connexion ratés : 429 (même avec le bon mot de passe ensuite)', async () => {
    app.limiters.login.max = 8; // les vraies limites
    const b = new Browser(base);
    let last;
    for (let i = 0; i < 10; i++) last = await b.post('/api/login', { name: 'Alice', password: `faux${i}` });
    eq(last.status, 429);
    eq((await b.post('/api/login', { name: 'Alice', password: 'secret123' })).status, 429);
    app.limiters.login.max = 1e6;
    app.limiters.login.hits.clear();
  });
  await test('trop de créations de compte depuis une même adresse : 429', async () => {
    const s5 = await startServer({ limits: { ...RELAXED, register: 2 } });
    try {
      const codes = [];
      for (const n of ['Un', 'Deux', 'Trois']) codes.push((await new Browser(s5.base).post('/api/register', { name: n, password: 'secret123' })).status);
      eq(codes, [200, 200, 429]);
    } finally { await s5.app.close(); }
  });
  await test('requêtes malformées : JSON invalide, mauvais type, trop gros, autre site', async () => {
    eq((await anon.req('POST', '/api/login', '{pas du json')).status, 400);
    eq((await anon.req('POST', '/api/login', 'a=1', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
    eq((await anon.req('POST', '/api/login', { name: 'x'.repeat(100000) })).status, 413);
    eq((await anon.req('POST', '/api/login', [1, 2])).status, 400);
    const evil = await alice.req('POST', '/api/character', { type: 'CHAR_CREATE', name: 'Pirate', classId: 'sacrieur' }, { Origin: 'https://evil.example' });
    eq(evil.status, 403);
    const own = await alice.req('POST', '/api/character', { type: 'CHAR_CREATE', name: 'Légitime', classId: 'sacrieur' }, { Origin: base });
    assert(own.status === 200 && own.json.ok, own.text);
    app.db.prepare('DELETE FROM characters').run();
    eq((await anon.get('/api/inconnue')).status, 404);
    eq((await anon.get('/api/login')).status, 405);
  });
  await test('sans connexion, l\'API privée est fermée', async () => {
    for (const [m, p] of [['GET', '/api/profile'], ['POST', '/api/character'], ['POST', '/api/password'], ['POST', '/api/run/start'], ['GET', '/api/run'], ['POST', '/api/run/action'], ['POST', '/api/run/discard']]) {
      const r = await anon.req(m, p, m === 'POST' ? {} : undefined);
      assert(r.status === 401, `${m} ${p} : ${r.status}`);
    }
  });

  console.log('\n● Personnages (le serveur applique les règles)');
  let bob, aliceId, bobId;
  await test('créer des personnages ; chacun ne voit que les siens', async () => {
    bob = await newUser(base, 'Bob');
    aliceId = await userIdOf(alice);
    bobId = await userIdOf(bob);
    const a1 = await create(alice, '  Thorne  ', 'sacrieur');
    assert(a1.id.startsWith('c-') && a1.name === 'Thorne' && a1.level === 1, JSON.stringify(a1));
    await create(alice, 'Maeve', 'pretre');
    await create(bob, 'Kael', 'assassin');
    eq((await alice.get('/api/profile')).json.characters.map((c) => c.name), ['Thorne', 'Maeve']);
    eq((await bob.get('/api/profile')).json.characters.map((c) => c.name), ['Kael']);
    const bad = await alice.post('/api/character', { type: 'CHAR_CREATE', name: 'X', classId: 'magicien' });
    assert(bad.status === 200 && bad.json.ok === false, bad.text);
  });
  await test('triche : agir sur le personnage d\'un autre, ou envoyer des choses interdites', async () => {
    const kael = (await bob.get('/api/profile')).json.characters[0];
    for (const type of ['CHAR_DELETE', 'CHAR_RESET_SKILLS', 'CHAR_PICK_LOOT']) {
      const r = await alice.post('/api/character', { type, charId: kael.id });
      assert(r.json.ok === false && /introuvable/.test(r.json.error), `${type} : ${r.text}`);
    }
    for (const body of [{ type: 'CHAR_SET_LEVEL', charId: kael.id, level: 20 }, { type: { $gt: '' } }, { type: 'CHAR_EQUIP', charId: ['a'], uid: {} }, { type: 'CHAR_LEARN', charId: 1, skillId: null }]) {
      const r = await alice.post('/api/character', body);
      assert(r.status === 400 || r.json.ok === false, `${JSON.stringify(body)} → ${r.status} ${r.text}`);
    }
    // un champ « level » ajouté à une création est simplement ignoré : le personnage est de niveau 1
    eq((await alice.post('/api/character', { type: 'CHAR_CREATE', name: 'Dieu', classId: 'sacrieur', inventory: [{ uid: 'z', id: 'couronne_dechue' }] })).status, 400, 'rien d\'imbriqué n\'est accepté');
    const dieu = await alice.post('/api/character', { type: 'CHAR_CREATE', name: 'Dieu', classId: 'sacrieur', level: 20, xp: 99999 });
    assert(dieu.json.ok && dieu.json.character.level === 1 && dieu.json.character.xp === 0 && dieu.json.character.inventory.length === 0, dieu.text.slice(0, 200));
    assert((await alice.post('/api/character', { type: 'CHAR_DELETE', charId: dieu.json.character.id })).json.ok);
    const chars = (await alice.get('/api/profile')).json.characters;
    assert(chars.every((c) => c.level === 1), 'aucun niveau trafiqué');
    eq((await bob.get('/api/profile')).json.characters[0].level, 1);
  });
  await test('équiper : seulement ce qui est dans SON sac, au bon niveau, au bon endroit', async () => {
    const thorne = (await alice.get('/api/profile')).json.characters.find((c) => c.name === 'Thorne');
    seed(app, aliceId, thorne.id, (ch) => { ch.level = 4; ch.inventory.push({ uid: 'w1', id: 'dague_os' }, { uid: 'w2', id: 'hallebarde_fer_noir' }, { uid: 'r1', id: 'anneau_sang' }); });
    const eqp = (body) => alice.post('/api/character', { type: 'CHAR_EQUIP', charId: thorne.id, ...body });
    let r = await eqp({ uid: 'w1' });
    assert(r.json.ok && r.json.character.equipment.mainHand.id === 'dague_os', r.text);
    r = await eqp({ uid: 'w2' });
    assert(!r.json.ok && /Niveau 8/.test(r.json.error), r.text);
    r = await eqp({ uid: 'fantome' });
    assert(!r.json.ok, 'un objet qui n\'est pas dans le sac');
    r = await eqp({ uid: 'r1', slot: 'head' });
    assert(!r.json.ok, 'un anneau sur la tête');
    r = await eqp({ uid: 'r1' });
    assert(r.json.ok && r.json.character.equipment.ring1.id === 'anneau_sang', r.text);
    r = await alice.post('/api/character', { type: 'CHAR_UNEQUIP', charId: thorne.id, slot: 'mainHand' });
    assert(r.json.ok && r.json.character.equipment.mainHand === null, r.text);
    // et ça a bien été enregistré
    const saved = (await alice.get('/api/profile')).json.characters.find((c) => c.id === thorne.id);
    eq([saved.equipment.mainHand, saved.equipment.ring1.id], [null, 'anneau_sang']);
  });
  await test('compétences : le serveur applique les règles du jeu (niveau, spécialisation, autre classe, succès)', async () => {
    const maeve = (await alice.get('/api/profile')).json.characters.find((c) => c.name === 'Maeve');
    const learn = (skillId) => alice.post('/api/character', { type: 'CHAR_LEARN', charId: maeve.id, skillId });
    assert(!(await learn('pretre_hymne')).json.ok, 'un talent du palier 8 : refusé au niveau 1, sans spécialisation');
    assert(!(await learn('sacrieur_peau_de_pierre')).json.ok, 'compétence d\'une autre classe');
    assert(!(await learn('pretre_cantique')).json.ok, 'verrouillée tant que le succès manque');
    seed(app, aliceId, maeve.id, (ch) => { ch.level = 8; });
    assert((await alice.post('/api/character', { type: 'CHAR_SET_SPEC', charId: maeve.id, spec: 'sacre' })).json.ok, 'choisir une spécialisation');
    const r = await learn('pretre_hymne');
    assert(r.json.ok && r.json.character.skills.includes('pretre_hymne'), r.text);
    const swap = await learn('pretre_gardien_ames');
    assert(swap.json.ok && !swap.json.character.skills.includes('pretre_hymne'), 'un autre choix du même palier remplace le précédent');
    assert(!(await learn('guerrier_massacre')).json.ok, 'talent d\'une autre classe');
  });
  await test('la récompense au choix ; la forge ; supprimer un personnage ; la limite de personnages', async () => {
    const kael = (await bob.get('/api/profile')).json.characters[0];
    seed(app, bobId, kael.id, (ch) => { ch.lootChoice = [{ uid: 'k1', id: 'dague_os' }, { uid: 'k0', id: 'piece_percee' }]; });
    const r = await bob.post('/api/character', { type: 'CHAR_PICK_LOOT', charId: kael.id, uid: 'k1' });
    assert(r.json.ok && r.json.picked.id === 'dague_os' && r.json.character.inventory.some((i) => i.uid === 'k1') && r.json.character.shards === 1, r.text);
    seed(app, bobId, kael.id, (ch) => { ch.shards = 0; });
    // La forge : le serveur applique les mêmes règles (cadenas, démantèlement, amélioration, forge)
    const fa = (body) => bob.post('/api/character', { charId: kael.id, ...body });
    assert((await fa({ type: 'CHAR_LOCK', uid: 'k1' })).json.ok, 'cadenas');
    assert(!(await fa({ type: 'CHAR_SALVAGE', uid: 'k1' })).json.ok, 'un objet protégé ne se démantèle pas');
    await fa({ type: 'CHAR_LOCK', uid: 'k1' });
    const sv = await fa({ type: 'CHAR_SALVAGE', uid: 'k1' });
    assert(sv.json.ok && sv.json.shards === 3 && sv.json.character.shards === 3, sv.text);
    assert(!(await fa({ type: 'CHAR_CRAFT', itemId: 'dague_os' })).json.ok, 'forger : il faut avoir terminé le donjon');
    seed(app, bobId, kael.id, (ch) => { ch.shards = 40; ch.stats.dungeons = { caves_humides: 1 }; });
    const cr = await fa({ type: 'CHAR_CRAFT', itemId: 'dague_os' });
    assert(cr.json.ok && cr.json.crafted.id === 'dague_os' && cr.json.character.shards === 25, cr.text);
    const up = await fa({ type: 'CHAR_UPGRADE', uid: cr.json.crafted.uid });
    assert(up.json.ok && up.json.character.inventory.find((i) => i.uid === cr.json.crafted.uid).plus === 1, up.text);
    eq((await bob.get('/api/profile')).json.characters[0].shards, 21, 'les éclats sont enregistrés');
    const del = await bob.post('/api/character', { type: 'CHAR_DELETE', charId: kael.id });
    assert(del.json.ok && del.json.deletedId === kael.id, del.text);
    eq((await bob.get('/api/profile')).json.characters.length, 0);
    app.game.config.maxCharacters = 2;
    await create(bob, 'Un', 'sacrieur'); await create(bob, 'Deux', 'sacrieur');
    const third = await bob.post('/api/character', { type: 'CHAR_CREATE', name: 'Trois', classId: 'sacrieur' });
    assert(!third.json.ok && /places/.test(third.json.error), third.text);
    eq((await bob.get('/api/profile')).json.maxCharacters, 2, 'le profil dit combien de places ce serveur donne');
    app.game.config.maxCharacters = null; // (retour au nombre de places de rules.json)
  });

  console.log('\n● Parties (le farm solo ; les donjons sont dans tests/server-rooms.mjs)');
  let thorneId, maeveId;
  await test('farm : démarrer, un seul à la fois, personnage verrouillé pendant la partie', async () => {
    const chars = (await alice.get('/api/profile')).json.characters;
    thorneId = chars.find((c) => c.name === 'Thorne').id;
    maeveId = chars.find((c) => c.name === 'Maeve').id;
    seed(app, aliceId, thorneId, (ch) => { ch.level = 4; ch.skills.push('sacrieur_carapace'); });
    const r = await alice.post('/api/run/start', { kind: 'farm', charId: thorneId });
    assert(r.status === 200 && r.json.run.farm && r.json.run.players.length === 1 && r.json.info.farm === true, r.text.slice(0, 200));
    assert(r.json.run.pending.kind === 'combat' || r.json.run.pending.kind === 'farm', JSON.stringify(r.json.run.pending));
    assert(!('content' in r.json.run), 'le contenu du jeu n\'est pas envoyé avec la partie');
    eq((await alice.post('/api/run/start', { kind: 'farm', charId: thorneId })).status, 409);
    const equipLocked = await alice.post('/api/character', { type: 'CHAR_UNEQUIP', charId: thorneId, slot: 'ring1' });
    assert(!equipLocked.json.ok && /partie en cours/.test(equipLocked.json.error), equipLocked.text);
    const profile = (await alice.get('/api/profile')).json;
    eq([profile.run.farm, profile.run.charIds], [true, [thorneId]]);
  });
  await test('reprise : une autre connexion retrouve exactement la même partie', async () => {
    const other = new Browser(base);
    await other.post('/api/login', { name: 'Alice', password: 'secret123' });
    const a = (await alice.get('/api/run')).json;
    const b = (await other.get('/api/run')).json;
    assert(a.run && JSON.stringify(a.run) === JSON.stringify(b.run), 'même partie sur les deux appareils');
  });
  await test('triche en partie : agir pour un autre joueur, actions inconnues, imbriquées ou réservées au jeu local', async () => {
    const act = (action) => alice.post('/api/run/action', { action });
    for (const action of [{ type: 'COMBAT_ACT', playerId: 'p9', act: 'endTurn' }, { type: 'EQUIP', playerId: 'p2', uid: 'x' }, { type: 'GIVE', fromId: 'p3', toId: 'p1', uid: 'x' }]) {
      const r = await act(action);
      assert(r.status === 403, `${JSON.stringify(action)} → ${r.status} ${r.text}`);
    }
    for (const action of [{ type: 'TRAINING_RESET' }, { type: 'END_TRAINING' }, { type: 'DEVENIR_DIEU' }, { type: 'COMBAT_ACT', playerId: 'p1', act: { a: 1 } }, { type: ['ADVANCE'] }, 'ADVANCE', null]) {
      const r = await act(action);
      assert(r.status === 400, `${JSON.stringify(action)} → ${r.status} ${r.text}`);
    }
    const nobody = await bob.post('/api/run/action', { action: { type: 'ABANDON' } });
    eq(nobody.status, 404);
    const refused = await act({ type: 'ADVANCE' }); // une action légale en soi, mais pas maintenant : refusée avec la partie intacte
    assert(refused.status === 200 && refused.json.ok === false && refused.json.run, refused.text.slice(0, 200));
  });
  await test('farm : une session complète jouée via l\'API ; le bilan arrive dans les personnages', async () => {
    const before = (await alice.get('/api/profile')).json.characters.find((c) => c.id === thorneId);
    let state = attachContent((await alice.get('/api/run')).json.run, content);
    const rand = makeRand(5);
    let ended = null;
    for (let i = 0; i < 2500 && !ended; i++) {
      const action = chooseAction(state, rand, 'smart', { maxWaves: 2, stopBelow: 0.5 });
      const r = await alice.post('/api/run/action', { action });
      assert(r.status === 200 && r.json.ok, `étape ${i} ${JSON.stringify(action)} : ${r.text.slice(0, 200)}`);
      state = attachContent(r.json.run, content);
      if (r.json.ended) ended = r.json;
    }
    assert(ended, 'la partie doit finir');
    assert(ended.run.phase === 'ended' && ended.run.result.applied === true && ended.info === null, 'bilan appliqué');
    const after = ended.characters.find((c) => c.id === thorneId);
    assert(after.stats.farmRuns === before.stats.farmRuns + 1, `session comptée (${after.stats.farmRuns})`);
    assert(after.xp !== before.xp || after.level !== before.level || (after.shards || 0) > (before.shards || 0) || after.stats.farmWaves > 0, 'des éclats ou des vagues');
    if (after.stats.farmWaves > 0) eq(after.lootChoice.length, 3, 'une récompense au choix attend');
    const stored = (await alice.get('/api/profile')).json;
    assert(stored.run === null && JSON.stringify(stored.characters.find((c) => c.id === thorneId)) === JSON.stringify(after), 'enregistré, partie effacée');
    eq((await alice.get('/api/run')).json.run, null);
    eq((await alice.post('/api/run/action', { action: { type: 'ABANDON' } })).status, 404, 'plus de partie : on ne rejoue pas un bilan déjà appliqué');
    // le personnage est de nouveau libre
    assert((await alice.post('/api/character', { type: 'CHAR_UNEQUIP', charId: thorneId, slot: 'ring1' })).json.ok);
  });
  await test('un donjon ne se lance plus qu\'à travers un salon : un seul héros par compte, jamais une équipe de 4', async () => {
    for (const charIds of [[thorneId], [thorneId, maeveId], [thorneId, maeveId, thorneId, maeveId]]) {
      const r = await alice.post('/api/run/start', { kind: 'dungeon', charIds, setup: { tranche: 1, mode: 'tranche' } });
      assert(r.status === 400 && /salon/.test(r.json.error), `${charIds.length} héros : ${r.status} ${r.text.slice(0, 160)}`);
    }
    eq((await alice.get('/api/run')).json.run, null, 'aucune partie n\'a été créée');
  });
  await test('démarrage de partie : personnages inconnus, réglages faux, personnages des autres', async () => {
    const start = (body) => alice.post('/api/run/start', body);
    const kael = (await bob.get('/api/profile')).json.characters[0];
    for (const [body, status] of [
      [{ kind: 'farm', charId: 'inconnu' }, 404],
      [{ kind: 'farm', charId: kael.id }, 404],
      [{ kind: 'farm', charId: thorneId, zoneId: 'zone_secrete' }, 400],
      [{ kind: 'jeu' }, 400]
    ]) {
      const r = await start(body);
      assert(r.status === status, `${JSON.stringify(body)} → ${r.status} (attendu ${status}) ${r.text.slice(0, 150)}`);
    }
    eq((await alice.get('/api/run')).json.run, null, 'aucune partie n\'a été créée par ces essais');
  });
  await test('jeter une partie sans bilan ; une partie d\'une ancienne version est abandonnée', async () => {
    await alice.post('/api/run/start', { kind: 'farm', charId: thorneId });
    assert((await alice.post('/api/run/discard')).json.ok);
    eq((await alice.get('/api/run')).json.run, null);
    await alice.post('/api/run/start', { kind: 'farm', charId: thorneId });
    app.db.prepare("UPDATE runs SET state = json_set(state, '$.version', 1)").run();
    eq((await alice.get('/api/run')).json.run, null, 'version périmée : abandonnée');
    eq((await alice.get('/api/profile')).json.run, null);
    eq(app.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 0);
  });

  console.log('\n● Contenu du jeu et fichiers');
  await test('/api/content : tous les fichiers de données, avec une version et un ETag', async () => {
    const r = await anon.get('/api/content');
    assert(r.status === 200 && DATA_FILES.every((n) => r.json.files[n]), r.text.slice(0, 100));
    eq(r.json.version, (await anon.get('/api/hello')).json.contentVersion);
    const again = await fetch(`${base}/api/content`, { headers: { 'If-None-Match': r.headers.get('etag') } });
    eq(again.status, 304);
  });
  await test('la page, le code et les données du jeu sont servis, avec des en-têtes de sécurité', async () => {
    for (const p of ['/', '/index.html', '/main.js', '/css/style.css', '/src/core/index.js', '/src/ui/shell.js', '/data/items.json']) {
      const r = await fetch(base + p);
      assert(r.status === 200, `${p} : ${r.status}`);
    }
    const page = await fetch(base + '/');
    assert((await page.text()).includes('id="app"'), 'la page du jeu');
    const csp = page.headers.get('content-security-policy');
    assert(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && page.headers.get('x-content-type-options') === 'nosniff', csp);
    const js = await fetch(base + '/main.js');
    assert(/javascript/.test(js.headers.get('content-type')), 'les modules ont le bon type');
    const cached = await fetch(base + '/main.js', { headers: { 'If-None-Match': js.headers.get('etag') } });
    eq(cached.status, 304);
  });
  await test('rien d\'autre n\'est public : serveur, tests, base de données, sorties du dossier', async () => {
    for (const p of ['/server/server.mjs', '/server/db.mjs', '/package.json', '/tests/run-tests.mjs', '/docs/SERVEUR.md', '/var/donjon.sqlite', '/LISEZMOI.md', '/serve.mjs', '/src', '/data/', '/nimporte']) {
      const r = await fetch(base + p);
      assert(r.status === 404, `${p} : ${r.status}`);
    }
    // des chemins piégés, envoyés tels quels (fetch les « nettoie » avant de les envoyer, donc on parle en HTTP brut)
    const raw = (path) => new Promise((resolve, reject) => {
      const s = createConnection(port, '127.0.0.1', () => s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
      let data = '';
      s.on('data', (d) => (data += d));
      s.on('end', () => resolve(data));
      s.on('error', reject);
    });
    for (const p of ['/../package.json', '/src/../server/db.mjs', '/src/%2e%2e/server/db.mjs', '/%2e%2e/%2e%2e/etc/passwd', '/src/..%2fserver/db.mjs', '/data/..\\..\\package.json', '/src/core/index.js%00.png', '//etc/passwd']) {
      const out = await raw(p);
      assert(/^HTTP\/1\.1 404/.test(out) || /^HTTP\/1\.1 400/.test(out), `${p} : ${out.split('\r\n')[0]}`);
      assert(!/createServer|DatabaseSync|root:/.test(out), `${p} : contenu interdit renvoyé`);
    }
  });

  console.log('\n● Inscription protégée par un code d\'invitation');
  await test('sans le bon code, pas de compte', async () => {
    const s2 = await startServer({ inviteCode: 'ouvre-toi' });
    try {
      const b = new Browser(s2.base);
      eq((await b.get('/api/hello')).json.inviteRequired, true);
      eq((await b.post('/api/register', { name: 'Intrus', password: 'secret123' })).status, 403);
      eq((await b.post('/api/register', { name: 'Intrus', password: 'secret123', invite: 'mauvais' })).status, 403);
      eq((await b.post('/api/register', { name: 'Ami', password: 'secret123', invite: ' ouvre-toi ' })).status, 200);
      eq(s2.app.store.countUsers(), 1);
    } finally { await s2.app.close(); }
  });
  await test('nombre maximal de comptes', async () => {
    const s3 = await startServer({ maxUsers: 1 });
    try {
      eq((await new Browser(s3.base).post('/api/register', { name: 'Premier', password: 'secret123' })).status, 200);
      eq((await new Browser(s3.base).post('/api/register', { name: 'Second', password: 'secret123' })).status, 403);
    } finally { await s3.app.close(); }
  });
  await test('derrière un serveur web de confiance : cookie Secure en HTTPS, adresse lue dans X-Forwarded-For', async () => {
    const s4 = await startServer({ trustProxy: true });
    try {
      const b = new Browser(s4.base);
      const r = await b.req('POST', '/api/register', { name: 'Hugo', password: 'secret123' }, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.7', Origin: 'https://jeu.example', 'X-Forwarded-Host': 'jeu.example' });
      assert(r.status === 200 && /Secure/.test(b.lastSetCookie), `${r.status} ${b.lastSetCookie}`);
      assert(r.headers.get('strict-transport-security'), 'HSTS en HTTPS');
      assert(s4.app.limiters.register.hits.has('203.0.113.7'), 'adresse du visiteur');
    } finally { await s4.app.close(); }
  });

  console.log('\n● L\'outil d\'administration (server/admin.mjs), lancé pendant que le serveur tourne');
  const dir = mkdtempSync(join(tmpdir(), 'donjon-admin-'));
  const dbFile = join(dir, 'donjon.sqlite');
  const s6 = await startServer({ dbPath: dbFile });
  const cfg6 = baseConfig({ dbPath: dbFile });
  // Comme en ligne de commande : l'outil ouvre SA PROPRE connexion à la base, que le serveur utilise en même temps.
  const admin = async (...args) => {
    const lines = [];
    const code = await runAdmin(args, { config: cfg6, out: (l = '') => lines.push(l) });
    return { code, text: lines.join('\n') };
  };
  const refuses = async (args, re) => {
    try {
      await admin(...args);
    } catch (e) {
      assert(e instanceof AdminError && re.test(e.message), `message inattendu pour ${args.join(' ')} : ${e.message}`);
      return;
    }
    throw new Error(`« ${args.join(' ')} » aurait dû être refusé`);
  };
  try {
    await test('stats et users : l\'état du serveur', async () => {
      const zoe = await newUser(s6.base, 'Zoé', 'ancien123');
      await create(zoe, 'Thorne', 'sacrieur');
      const st = await admin('stats');
      assert(st.code === 0 && /Comptes\s+1\b/.test(st.text) && /Personnages\s+1\b/.test(st.text) && /Sessions ouvertes 1\b/.test(st.text), st.text);
      const us = await admin('users');
      assert(us.code === 0 && /Zoé\s/.test(us.text) && /\s1\s*$/m.test(us.text), us.text);
    });
    await test('passwd : mot de passe oublié (au hasard, ou choisi), et le compte est déconnecté partout', async () => {
      const zoe = new Browser(s6.base);
      eq((await zoe.post('/api/login', { name: 'zoe', password: 'ancien123' })).status, 200);
      const r = await admin('passwd', 'zoe'); // (sans accent ni majuscule : comme à la connexion)
      const m = /Nouveau mot de passe :\s+(\S+)/.exec(r.text);
      assert(r.code === 0 && m && m[1].length >= 10, r.text);
      eq((await zoe.get('/api/profile')).status, 401, 'les sessions en cours sont coupées');
      eq((await new Browser(s6.base).post('/api/login', { name: 'Zoé', password: 'ancien123' })).status, 401);
      eq((await new Browser(s6.base).post('/api/login', { name: 'Zoé', password: m[1] })).status, 200);
      const r2 = await admin('passwd', 'ZOE', 'choisi-par-moi');
      assert(r2.code === 0 && !r2.text.includes('choisi-par-moi'), 'un mot de passe donné n\'est pas réaffiché');
      eq((await new Browser(s6.base).post('/api/login', { name: 'Zoé', password: 'choisi-par-moi' })).status, 200);
    });
    await test('mauvaises commandes : message clair, rien n\'est modifié', async () => {
      await refuses(['passwd', 'Fantôme'], /Aucun compte/);
      await refuses(['passwd', 'Zoé', '123'], /au moins 6/);
      await refuses(['passwd'], /pseudo/);
      await refuses(['delete'], /pseudo/);
      await refuses(['inconnue'], /Commande inconnue/);
      await refuses(['users', '--bizarre'], /Option inconnue/);
      await refuses(['backup', '--keep=0'], /--keep/);
      eq((await new Browser(s6.base).post('/api/login', { name: 'Zoé', password: 'choisi-par-moi' })).status, 200);
      eq((await admin('help')).code, 0);
    });
    await test('delete : demande confirmation, puis supprime le compte, ses personnages et sa partie', async () => {
      const vic = await newUser(s6.base, 'Vic');
      const ch = await create(vic, 'Maeve', 'pretre');
      eq((await vic.post('/api/run/start', { kind: 'farm', charId: ch.id })).status, 200);
      eq(s6.app.store.stats(), { users: 2, characters: 2, runs: 1 });
      const no = await admin('delete', 'vic');
      assert(no.code === 1 && /--yes/.test(no.text), no.text);
      eq((await vic.get('/api/profile')).status, 200, 'sans --yes, rien n\'est supprimé');
      const yes = await admin('delete', 'Vic', '--yes');
      assert(yes.code === 0 && /supprimé/.test(yes.text), yes.text);
      eq((await vic.get('/api/profile')).status, 401, 'sa session est partie avec lui');
      eq(s6.app.store.stats(), { users: 1, characters: 1, runs: 0 });
      eq(s6.app.db.prepare('SELECT COUNT(*) AS n FROM run_players').get().n, 0);
    });
    await test('backup : copie lisible, ménage des anciennes, aucun autre fichier touché', async () => {
      const bk = join(dir, 'sauvegardes');
      mkdirSync(bk);
      writeFileSync(join(bk, 'notes.txt'), 'à garder');
      for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
        eq(await runAdmin(['backup', bk, '--keep=2'], { config: cfg6, out: () => {}, now: new Date(`${day}T04:00:00Z`) }), 0);
      }
      eq(readdirSync(bk).sort(), ['donjon-20261102-040000.sqlite', 'donjon-20261103-040000.sqlite', 'notes.txt']);
      const copy = await openDatabase(join(bk, 'donjon-20261103-040000.sqlite'));
      try {
        eq(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n, s6.app.store.countUsers(), 'même nombre de comptes que la base en service');
        eq(copy.prepare('SELECT COUNT(*) AS n FROM characters').get().n, 1);
        eq(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      } finally { copy.close(); }
      try {
        await runAdmin(['backup', bk], { config: cfg6, out: () => {}, now: new Date('2026-11-03T04:00:00Z') });
        throw new Error('aurait dû refuser d\'écraser');
      } catch (e) { assert(e instanceof AdminError && /existe déjà/.test(e.message), e.message); }
    });
    await test('sans base de données, l\'outil explique quoi faire', async () => {
      try {
        await runAdmin(['stats'], { config: baseConfig({ dbPath: join(dir, 'absente', 'donjon.sqlite') }), out: () => {} });
        throw new Error('aurait dû refuser');
      } catch (e) { assert(e instanceof AdminError && /Aucune base/.test(e.message), e.message); }
    });
  } finally {
    await s6.app.close();
    rmSync(dir, { recursive: true, force: true });
  }

  await app.close();
  console.log(R.failed ? `\n❌ ${R.passed} réussis, ${R.failed} échoués` : `\n✅ ${R.passed} tests du serveur réussis, 0 échoués`);
  process.exit(R.failed ? 1 : 0);
};
main().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
