// Tests des SALONS : jouer un donjon à plusieurs, un héros par joueur, en temps réel. Aucun navigateur : on parle à l'API avec fetch,
// et on écoute le temps réel (SSE) comme le ferait la page.
// Usage : node tests/server-rooms.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/app.mjs';
import { chooseAction, makeRand } from './bot.mjs';
import { attachContent, afkAction } from '../src/core/index.js';
import { runner, assert, eq, Browser, baseConfig, startServer, newUser, userIdOf, create, sleep, Stream } from './server-kit.mjs';

const R = runner();
const test = R.test;

// ---------------- Outils ----------------

let counter = 0;
/** Des joueurs tout neufs, chacun avec UN héros (la classe change d'un joueur à l'autre). */
async function players(base, count, classes = ['berserker', 'veilleur', 'duelliste', 'druide']) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = ++counter;
    const b = await newUser(base, `Joueur${n}`);
    const hero = await create(b, `Héros${n}`, classes[i % classes.length]);
    out.push({ b, name: `Joueur${n}`, id: await userIdOf(b), hero });
  }
  return out;
}
const enter = (p, code) => p.b.post('/api/room/join', { code, charId: p.hero.id });
const ready = (p, value = true) => p.b.post('/api/room/ready', { ready: value });

/** Un salon prêt à lancer : tout le monde dedans, tout le monde prêt. (Sans minuteur par défaut : les tests ne dépendent pas de l'horloge.) */
async function lobby(base, count, setup = { turnSeconds: 0 }) {
  const ps = await players(base, count);
  const created = await ps[0].b.post('/api/room/create', { charId: ps[0].hero.id, setup });
  assert(created.status === 200, created.text);
  const code = created.json.room.code;
  for (const p of ps.slice(1)) {
    const r = await enter(p, code);
    assert(r.status === 200, r.text);
    assert((await ready(p)).status === 200);
  }
  return { ps, code };
}

const OWNER_FIELD = { COMBAT_ACT: 'playerId', EQUIP: 'playerId', UNEQUIP: 'playerId', USE_ITEM: 'playerId', USE_SKILL: 'playerId', GHOST: 'playerId', SHOP_SELL: 'playerId', SHOP_BUY: 'buyerId', GIVE: 'fromId' };

/**
 * Joue la partie à la place des joueurs, avec le robot des tests : à chaque étape, l'action est envoyée PAR LE COMPTE à qui
 * appartient le héros concerné (exactement ce que fait un vrai navigateur). `stopWhen(payload)` interrompt avant la fin.
 */
async function playAll(app, ps, { stopWhen = () => false, maxSteps = 6000, seed = 7 } = {}) {
  const content = app.game.content();
  const rand = makeRand(seed);
  let cur = (await ps[0].b.get('/api/run')).json;
  assert(cur.run, 'aucune partie à jouer');
  const owner = new Map(cur.room.owners.filter((o) => o.userId).map((o) => [o.playerId, ps.find((p) => p.id === o.userId)]));
  for (let step = 0; step < maxSteps; step++) {
    if (cur.ended || stopWhen(cur)) return cur;
    const state = attachContent(cur.run, content);
    const action = chooseAction(state, rand, 'smart');
    const field = OWNER_FIELD[action.type];
    const who = owner.get(field ? action[field] : state.pending.actor);
    assert(who, `personne ne contrôle ${JSON.stringify(action)}`);
    const r = await who.b.post('/api/run/action', { action });
    assert(r.status === 200 && r.json.ok, `étape ${step} ${JSON.stringify(action)} par ${who.name} : ${r.status} ${r.text.slice(0, 220)}`);
    cur = r.json;
  }
  throw new Error('la partie ne se termine pas');
}

// ============================================================
const main = async () => {
  // Les tours de 30 s durent 0,6 s : on ne passe pas la journée à attendre le minuteur.
  const { app, base } = await startServer({ timerScale: 0.02 });
  const content = app.game.content();

  console.log('\n● La salle d\'attente : un héros par compte');
  await test('créer un salon : on en devient l\'hôte, avec un code à partager', async () => {
    const [alice] = await players(base, 1);
    const r = await alice.b.post('/api/room/create', { charId: alice.hero.id });
    assert(r.status === 200 && r.json.ok, r.text);
    const room = r.json.room;
    assert(/^[A-HJ-NP-Z2-9]{5}$/.test(room.code), `code : ${room.code}`);
    eq([room.status, room.hostId, room.members.length], ['lobby', alice.id, 1]);
    assert(room.members[0].ready && room.members[0].hero.id === alice.hero.id && room.members[0].hero.classId === 'berserker', JSON.stringify(room.members[0]));
    eq(room.setup, { tranche: 1, dungeon: 'caves_humides', mode: 'tranche', stasisLevel: 1, turnSeconds: 60 });
    eq((await alice.b.get('/api/profile')).json.room.code, room.code, 'le salon apparaît dans le profil');
    const open = (await alice.b.get('/api/rooms')).json.rooms.find((x) => x.code === room.code);
    assert(open && open.hostName === alice.name && open.players === 1 && open.heroes[0].name === alice.hero.name, JSON.stringify(open));
    eq((await alice.b.post('/api/room/leave')).status, 200);
    eq((await alice.b.get('/api/room')).json.room, null, 'le dernier qui part éteint la lumière');
  });
  await test('un compte ne peut être qu\'à un endroit : un salon OU une partie, jamais deux', async () => {
    const [a, b] = await players(base, 2);
    const code = (await a.b.post('/api/room/create', { charId: a.hero.id })).json.room.code;
    eq((await a.b.post('/api/room/create', { charId: a.hero.id })).status, 409, 'deux salons');
    eq((await a.b.post('/api/run/start', { kind: 'farm', charId: a.hero.id })).status, 409, 'un farm pendant un salon');
    assert((await b.b.post('/api/run/start', { kind: 'farm', charId: b.hero.id })).json.ok, 'le farm de b');
    const busy = await enter(b, code);
    assert(busy.status === 409 && /partie est déjà en cours/.test(busy.json.error), busy.text);
    eq((await b.b.post('/api/room/create', { charId: b.hero.id })).status, 409);
    await a.b.post('/api/room/leave');
  });
  await test('rejoindre avec le code (en minuscules, avec des espaces) ou depuis la liste ; 4 joueurs au plus', async () => {
    const [host, b, c, d, e] = await players(base, 5);
    const watcher = await Stream.open(base, e.b);
    await watcher.take('sync');
    const code = (await host.b.post('/api/room/create', { charId: host.hero.id })).json.room.code;
    await watcher.take('rooms'); // la liste des salons a bougé : les écrans ouverts se rafraîchissent
    eq((await b.b.post('/api/room/join', { code: ` ${code.slice(0, 2).toLowerCase()}-${code.slice(2).toLowerCase()} `, charId: b.hero.id })).status, 200);
    const id = (await e.b.get('/api/rooms')).json.rooms.find((x) => x.code === code).id;
    eq((await c.b.post('/api/room/join', { id, charId: c.hero.id })).status, 200);
    eq((await d.b.post('/api/room/join', { code, charId: d.hero.id })).status, 200);
    const full = await e.b.post('/api/room/join', { code, charId: e.hero.id });
    assert(full.status === 409 && /complet/.test(full.json.error), full.text);
    assert((await e.b.get('/api/rooms')).json.rooms.find((x) => x.code === code).full === true, 'marqué complet dans la liste');
    eq((await e.b.post('/api/room/join', { code: 'ZZZZZ', charId: e.hero.id })).status, 404);
    eq((await e.b.post('/api/room/join', { code: '', id: 999999, charId: e.hero.id })).status, 404);
    eq((await b.b.post('/api/room/join', { code, charId: b.hero.id })).status, 409, 'déjà dans un salon');
    eq((await host.b.get('/api/room')).json.room.members.map((m) => m.userId), [host.id, b.id, c.id, d.id], 'dans l\'ordre d\'arrivée');
    watcher.close();
    for (const p of [d, c, b, host]) await p.b.post('/api/room/leave');
  });
  await test('UN héros par compte : celui d\'un autre est refusé, on ne peut pas en amener plusieurs', async () => {
    const [host, bob, other] = await players(base, 3);
    const spare = await create(bob.b, 'Réserve', 'duelliste');
    const code = (await host.b.post('/api/room/create', { charId: host.hero.id })).json.room.code;
    eq((await bob.b.post('/api/room/join', { code, charId: host.hero.id })).status, 404, 'le héros de l\'hôte');
    eq((await bob.b.post('/api/room/join', { code, charId: 'inconnu' })).status, 404);
    eq((await bob.b.post('/api/room/join', { code })).status, 404, 'sans héros');
    // même en essayant de glisser plusieurs héros dans la demande : un seul compte
    const sneaky = await bob.b.post('/api/room/join', { code, charId: bob.hero.id, charIds: [bob.hero.id, spare.id], heroes: [spare.id] });
    assert(sneaky.status === 200, sneaky.text);
    const members = (await host.b.get('/api/room')).json.room.members;
    eq(members.length, 2);
    eq(members.find((m) => m.userId === bob.id).hero.id, bob.hero.id, 'un seul héros pour Bob');
    // changer de héros : le sien seulement, et il faut se déclarer prêt à nouveau
    await ready(bob);
    eq((await bob.b.post('/api/room/hero', { charId: other.hero.id })).status, 404);
    const swapped = await bob.b.post('/api/room/hero', { charId: spare.id });
    assert(swapped.status === 200 && swapped.json.room.members.find((m) => m.userId === bob.id).hero.id === spare.id, swapped.text);
    assert(!swapped.json.room.members.find((m) => m.userId === bob.id).ready, 'changer de héros remet « pas prêt »');
    await bob.b.post('/api/room/leave');
    await host.b.post('/api/room/leave');
  });
  await test('prêt, réglages : seul l\'hôte règle la partie, et chaque changement remet les autres « pas prêts »', async () => {
    const [host, bob] = await players(base, 2);
    const code = (await host.b.post('/api/room/create', { charId: host.hero.id })).json.room.code;
    await enter(bob, code);
    const view = async () => (await host.b.get('/api/room')).json.room;
    assert((await view()).members[0].ready, 'l\'hôte est toujours prêt');
    eq((await ready(host, false)).json.room.members[0].ready, true, 'l\'hôte ne peut pas se mettre « pas prêt »');
    await ready(bob);
    assert((await view()).members[1].ready);
    eq((await bob.b.post('/api/room/setup', { mode: 'basic' })).status, 403, 'un joueur ne règle pas la partie');
    for (const bad of [{ tranche: 12 }, { tranche: 99 }, { tranche: 'x' }, { mode: 'dieu' }, { turnSeconds: 45 }, { turnSeconds: -1 }, { stasisLevel: 9 }, { dungeon: 'inconnu' }, { dungeon: 'aire_des_dragons' }, { dungeon: 7 }]) {
      const r = await host.b.post('/api/room/setup', bad);
      assert(r.status === 400, `${JSON.stringify(bad)} → ${r.status} ${r.text}`);
    }
    assert((await view()).members[1].ready, 'un réglage refusé ne change rien');
    const set = await host.b.post('/api/room/setup', { tranche: 4, mode: 'stasis', stasisLevel: 2, turnSeconds: 30 });
    assert(set.status === 200, set.text);
    eq((await view()).setup, { tranche: 4, dungeon: 'crypte_oubliee', mode: 'stasis', stasisLevel: 2, turnSeconds: 30 }, 'changer de tranche : son premier donjon');
    // choisir un DONJON fixe aussi sa tranche de niveaux
    assert((await host.b.post('/api/room/setup', { dungeon: 'gouffre_aux_ogres' })).status === 200);
    eq((await view()).setup, { tranche: 8, dungeon: 'gouffre_aux_ogres', mode: 'stasis', stasisLevel: 2, turnSeconds: 30 });
    assert((await host.b.post('/api/room/setup', { dungeon: 'soues_de_grouinval' })).status === 200);
    eq([(await view()).setup.tranche, (await view()).setup.dungeon], [4, 'soues_de_grouinval']);
    await ready(bob);
    assert((await host.b.post('/api/room/setup', { tranche: 4, dungeon: 'crypte_oubliee' })).status === 200);
    eq((await view()).setup, { tranche: 4, dungeon: 'crypte_oubliee', mode: 'stasis', stasisLevel: 2, turnSeconds: 30 });
    assert(!(await view()).members[1].ready && (await view()).members[0].ready, 'Bob doit se déclarer prêt à nouveau ; l\'hôte reste prêt');
    await bob.b.post('/api/room/leave');
    await host.b.post('/api/room/leave');
  });
  await test('retirer un joueur (hôte seulement) ; quitter : le premier arrivé reprend le salon', async () => {
    const [host, bob, carol, dave] = await players(base, 4);
    const code = (await host.b.post('/api/room/create', { charId: host.hero.id })).json.room.code;
    for (const p of [bob, carol, dave]) await enter(p, code);
    eq((await bob.b.post('/api/room/kick', { userId: carol.id })).status, 403);
    eq((await host.b.post('/api/room/kick', { userId: host.id })).status, 404, 'on ne se retire pas soi-même');
    eq((await host.b.post('/api/room/kick', { userId: 424242 })).status, 404);
    const kicked = await host.b.post('/api/room/kick', { userId: dave.id });
    assert(kicked.status === 200 && kicked.json.room.members.length === 3, kicked.text);
    eq((await dave.b.get('/api/room')).json.room, null, 'Dave est libre');
    eq((await dave.b.post('/api/room/create', { charId: dave.hero.id })).status, 200, 'et peut créer son propre salon');
    await dave.b.post('/api/room/leave');
    // l'hôte part : Bob (arrivé le premier) devient hôte, et il est prêt d'office
    eq((await host.b.post('/api/room/leave')).status, 200);
    const room = (await bob.b.get('/api/room')).json.room;
    assert(room.hostId === bob.id && room.members.length === 2 && room.members[0].ready, JSON.stringify(room));
    eq((await carol.b.post('/api/room/setup', { mode: 'basic' })).status, 403);
    assert((await bob.b.post('/api/room/setup', { mode: 'basic' })).status === 200, 'le nouvel hôte règle la partie');
    await carol.b.post('/api/room/leave');
    await bob.b.post('/api/room/leave');
    eq((await host.b.post('/api/room/leave')).status, 404, 'on ne quitte pas un salon où l\'on n\'est plus');
  });
  await test('un salon d\'attente oublié depuis des heures est supprimé', async () => {
    const [a] = await players(base, 1);
    const code = (await a.b.post('/api/room/create', { charId: a.hero.id })).json.room.code;
    eq(app.rooms.sweep(Date.now() + 60_000), 0, 'un salon récent reste');
    assert(app.rooms.sweep(Date.now() + 4 * 3600_000) >= 1);
    eq((await a.b.get('/api/room')).json.room, null);
    assert(!(await a.b.get('/api/rooms')).json.rooms.some((r) => r.code === code));
    eq((await a.b.post('/api/room/create', { charId: a.hero.id })).status, 200, 'Alice peut recommencer');
    await a.b.post('/api/room/leave');
  });

  console.log('\n● La partie à plusieurs');
  await test('lancer : l\'hôte seulement, quand tout le monde est prêt ; chacun reçoit SA vue, avec un seul héros', async () => {
    const [host, bob, carol] = await players(base, 3);
    const code = (await host.b.post('/api/room/create', { charId: host.hero.id, setup: { turnSeconds: 0 } })).json.room.code;
    await enter(bob, code);
    await enter(carol, code);
    eq((await bob.b.post('/api/room/start')).status, 403, 'un joueur ne lance pas la partie');
    const early = await host.b.post('/api/room/start');
    assert(early.status === 409 && /ne sont pas prêts/.test(early.json.error) && early.json.error.includes(bob.name) && early.json.error.includes(carol.name), early.text);
    await ready(bob);
    const still = await host.b.post('/api/room/start');
    assert(still.status === 409 && /n'est pas prêt/.test(still.json.error) && still.json.error.includes(carol.name) && !still.json.error.includes(bob.name), still.text);
    await ready(carol);
    const go = await host.b.post('/api/room/start');
    assert(go.status === 200 && go.json.ok && go.json.room.status === 'running', go.text.slice(0, 300));
    const run = go.json.run;
    eq(run.run.players.map((p) => p.charId), [host.hero.id, bob.hero.id, carol.hero.id], 'un héros par joueur, dans l\'ordre d\'arrivée');
    eq(run.room.owners.map((o) => o.userId), [host.id, bob.id, carol.id]);
    eq([run.room.code, run.room.hostId, run.rev, run.run.setup.mode, run.run.setup.dungeon], [code, host.id, 0, 'tranche', 'caves_humides']);
    for (const [i, p] of [host, bob, carol].entries()) {
      const mine = (await p.b.get('/api/run')).json;
      eq(mine.you, [`p${i + 1}`], 'chacun ne contrôle que le sien');
      eq(mine.run.players.length, 3);
      const profile = (await p.b.get('/api/profile')).json;
      assert(profile.room.status === 'running' && profile.run.room === code && profile.run.players.length === 3, JSON.stringify(profile.run));
    }
    eq((await players(base, 1).then(([l]) => enter(l, code))).status, 409, 'on ne rejoint pas une partie commencée');
    eq((await host.b.post('/api/room/setup', { mode: 'basic' })).status, 409);
    eq((await bob.b.post('/api/room/hero', { charId: bob.hero.id })).status, 409);
    eq((await host.b.post('/api/room/start')).status, 409, 'déjà lancée');
    eq((await host.b.post('/api/run/discard')).status, 409, 'une partie à plusieurs se quitte par le salon');
    await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });
  await test('rien de secret dans ce que reçoit le navigateur : ni graine, ni hasard, ni case cachée', async () => {
    const { ps } = await lobby(base, 2);
    await ps[0].b.post('/api/room/start');
    const r = (await ps[1].b.get('/api/run')).json.run;
    eq([r.seed, r.rng], [0, 0]);
    const board = r.dungeon.board;
    const hidden = board.filter((t) => !t.revealed && t.type !== 'boss');
    assert(hidden.length >= 5 && hidden.every((t) => t.type === 'hidden' && !t.monsters && !t.stock && !t.loot && !t.choice), 'les cases cachées sont vides');
    eq(board.at(-1).type, 'boss', 'le boss, lui, est annoncé');
    eq(board.map((t) => t.index), board.map((_, i) => i));
    // une fois la case découverte, elle se montre
    const adv = await ps[0].b.post('/api/run/action', { action: { type: 'ADVANCE' } });
    const tile = adv.json.run.dungeon.board[0];
    assert(tile.revealed && tile.type !== 'hidden', JSON.stringify(tile));
    await ps[0].b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });
  await test('chacun ne joue que pour SON héros, et seulement à son tour ; l\'abandon est réservé à l\'hôte', async () => {
    const { ps } = await lobby(base, 3);
    const [host, bob, carol] = ps;
    await host.b.post('/api/room/start');
    const act = (p, action) => p.b.post('/api/run/action', { action });
    // c'est au tour de l'hôte (p1)
    for (const [who, action] of [[bob, { type: 'ADVANCE' }], [carol, { type: 'ADVANCE' }], [bob, { type: 'ROLL' }], [bob, { type: 'TIMEOUT' }]]) {
      const r = await act(who, action);
      assert(r.status === 403 && /pas ton tour/.test(r.json.error), `${who.name} ${action.type} → ${r.status} ${r.text.slice(0, 120)}`);
    }
    for (const [who, action] of [
      [host, { type: 'EQUIP', playerId: 'p2', uid: 'x' }], [host, { type: 'USE_ITEM', playerId: 'p3', uid: 'x' }], [bob, { type: 'GIVE', fromId: 'p1', toId: 'p2', uid: 'x' }],
      [carol, { type: 'GHOST', playerId: 'p1', mode: 'bless' }], [bob, { type: 'COMBAT_ACT', playerId: 'p1', act: 'endTurn' }], [bob, { type: 'SHOP_BUY', buyerId: 'p3', index: 0 }],
      [host, { type: 'USE_SKILL', playerId: 'p9', skillId: 'x' }]
    ]) {
      const r = await act(who, action);
      assert(r.status === 403 && /pas ton personnage/.test(r.json.error), `${who.name} ${action.type} → ${r.status} ${r.text.slice(0, 120)}`);
    }
    for (const who of [bob, carol]) {
      const r = await act(who, { type: 'ABANDON' });
      assert(r.status === 403 && /hôte/.test(r.json.error), `${who.name} abandon → ${r.status} ${r.text.slice(0, 120)}`);
    }
    const outsider = (await players(base, 1))[0];
    eq((await act(outsider, { type: 'ADVANCE' })).status, 404, 'quelqu\'un qui n\'est pas dans la partie');
    const refused = await act(host, { type: 'ROLL' }); // légale en soi, mais pas maintenant : refusée, avec la partie à jour
    assert(refused.status === 200 && refused.json.ok === false && refused.json.run && refused.json.you[0] === 'p1', refused.text.slice(0, 200));
    assert((await act(host, { type: 'ADVANCE' })).json.ok, 'le bon joueur, la bonne action');
    // l'attente a changé : maintenant c'est au jet de dé de l'hôte, et toujours pas à Bob
    eq((await act(bob, { type: 'ROLL' })).status, 403);
    assert((await act(host, { type: 'ABANDON' })).json.ended, 'l\'hôte, lui, peut abandonner');
  });
  await test('les autres joueurs reçoivent chaque action EN DIRECT, avec le même numéro de version', async () => {
    const { ps } = await lobby(base, 3);
    const [host, bob, carol] = ps;
    await host.b.post('/api/room/start');
    const sb = await Stream.open(base, bob.b);
    const sc = await Stream.open(base, carol.b);
    assert(sb.status === 200 && /text\/event-stream/.test(sb.type) && sb.headers.get('x-accel-buffering') === 'no' && /no-cache/.test(sb.headers.get('cache-control')), `${sb.status} ${sb.type}`);
    const sync = await sb.take('sync');
    assert(sync.room.status === 'running' && sync.run.run.players.length === 3 && sync.run.you[0] === 'p2', 'à la connexion, l\'état complet (on se remet à jour après une coupure)');
    await sc.take('sync');
    const r = await host.b.post('/api/run/action', { action: { type: 'ADVANCE' } });
    assert(r.json.ok && r.json.rev > 0, r.text.slice(0, 200));
    const pushedB = await sb.take('run', (m) => m.rev === r.json.rev);
    const pushedC = await sc.take('run', (m) => m.rev === r.json.rev);
    eq([pushedB.you, pushedC.you], [['p2'], ['p3']], 'chacun reçoit sa propre vue');
    assert(pushedB.events.some((e) => e.type === 'advance') && pushedB.run.dungeon.position === r.json.run.dungeon.position, 'les événements (animations) sont envoyés aussi');
    assert(pushedB.room.owners.length === 3 && pushedB.timer === null, 'qui joue quoi, et pas de minuteur dans ce salon');
    // une action refusée ne diffuse rien
    sb.skipAll();
    await bob.b.post('/api/run/action', { action: { type: 'ADVANCE' } });
    await sleep(120);
    assert(!sb.events.slice(sb.seen).some((m) => m.event === 'run'), 'rien n\'est diffusé pour une action refusée');
    sb.close();
    sc.close();
    await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });
  await test('un donjon complet joué à trois, chacun avec son héros : le bilan est appliqué à chacun, le salon disparaît', async () => {
    const { ps, code } = await lobby(base, 3);
    const [host, bob, carol] = ps;
    const before = new Map();
    for (const p of ps) before.set(p.id, (await p.b.get('/api/profile')).json.characters.find((c) => c.id === p.hero.id));
    await host.b.post('/api/room/start');
    const streams = [];
    for (const p of ps) streams.push(await Stream.open(base, p.b));
    const end = await playAll(app, ps);
    assert(end.ended && end.run.phase === 'ended' && end.run.result.applied === true && end.info === null, 'bilan appliqué');
    assert(['victory', 'defeat'].includes(end.run.result.outcome), `issue : ${end.run.result.outcome}`);
    for (const [i, p] of ps.entries()) {
      const pushed = await streams[i].take('run', (m) => m.ended);
      assert(pushed.characters.length === 1 && pushed.characters[0].id === p.hero.id, 'chacun reçoit SON héros à jour');
      eq(pushed.you, [`p${i + 1}`]);
      const after = pushed.characters[0];
      assert(after.stats.runs === before.get(p.id).stats.runs + 1, `${p.name} : une partie de plus (${after.stats.runs})`);
      const profile = (await p.b.get('/api/profile')).json;
      assert(profile.room === null && profile.run === null, 'plus de salon, plus de partie');
      eq(JSON.stringify(profile.characters.find((c) => c.id === p.hero.id)), JSON.stringify(after), 'enregistré');
      if (end.run.result.won) assert(after.stats.wins === before.get(p.id).stats.wins + 1 && after.stats.clears['1'].group >= 1, 'victoire en groupe comptée');
      streams[i].close();
    }
    eq((await host.b.get('/api/run')).json.run, null);
    assert(app.store.roomByCode(code) === null, 'le salon est supprimé');
    eq((await bob.b.post('/api/run/action', { action: { type: 'ADVANCE' } })).status, 404, 'on ne rejoue pas un bilan déjà appliqué');
    eq((await carol.b.post('/api/room/create', { charId: carol.hero.id })).status, 200, 'libre de recommencer');
    await carol.b.post('/api/room/leave');
  });
  await test('un joueur qui se déconnecte retrouve sa partie, et les autres peuvent continuer sans lui', async () => {
    const { ps } = await lobby(base, 2);
    const [host, bob] = ps;
    await host.b.post('/api/room/start');
    const again = new Browser(base); // « un autre onglet » du même compte
    again.cookie = bob.b.cookie;
    const a = (await again.get('/api/run')).json;
    const b = (await bob.b.get('/api/run')).json;
    eq(JSON.stringify(a), JSON.stringify(b), 'même partie, même vue');
    eq((await again.get('/api/profile')).json.room.status, 'running');
    await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });

  console.log('\n● Quitter, minuteur, redémarrage');
  await test('quitter en pleine partie : le héros reste, joué par le pilote automatique, et ne gagne rien', async () => {
    const { ps } = await lobby(base, 3);
    const [host, bob, carol] = ps;
    const bobBefore = (await bob.b.get('/api/profile')).json.characters.find((c) => c.id === bob.hero.id);
    const hostBefore = (await host.b.get('/api/profile')).json.characters.find((c) => c.id === host.hero.id);
    await host.b.post('/api/room/start');
    const live = await Stream.open(base, host.b); // (l'hôte écoute : il doit apprendre tout de suite que le héros de Bob passe au pilote automatique)
    await live.take('sync');
    live.skipAll();
    eq((await bob.b.post('/api/room/leave')).status, 200);
    const told = await live.take('run', (d) => d.room && d.room.owners.some((o) => o.userId === null));
    eq(told.room.owners.map((o) => o.userId), [host.id, null, carol.id], 'les autres reçoivent la partie avec le héros de Bob « sans joueur »');
    live.close();
    const profile = (await bob.b.get('/api/profile')).json;
    assert(profile.room === null && profile.run === null, 'Bob est libre tout de suite');
    const roomNow = (await host.b.get('/api/room')).json.room;
    assert(roomNow.status === 'running' && roomNow.members.map((m) => m.userId).join() === [host.id, carol.id].join(), JSON.stringify(roomNow.members));
    const lonely = (await host.b.get('/api/run')).json;
    eq(lonely.room.owners.map((o) => o.userId), [host.id, null, carol.id], 'le héros de Bob n\'a plus de joueur derrière lui');
    eq(lonely.run.players.length, 3, 'mais il est toujours dans le donjon');
    eq((await bob.b.post('/api/run/action', { action: { type: 'ADVANCE' } })).status, 404, 'Bob ne peut plus rien faire dans la partie');
    const fresh = await bob.b.post('/api/room/create', { charId: bob.hero.id });
    assert(fresh.status === 200, 'Bob peut aussitôt créer un autre salon');
    await bob.b.post('/api/room/leave');
    // La partie continue : quand c'est au héros de Bob de jouer, le pilote automatique le joue presque tout de suite (0,7 s).
    let cur = lonely;
    let autoPlayed = 0;
    const owner = new Map([['p1', host], ['p3', carol]]);
    const content2 = app.game.content();
    for (let i = 0; i < 400 && autoPlayed < 2; i++) {
      const state = attachContent(cur.run, content2);
      if (state.pending.actor === 'p2') {
        const rev = cur.rev;
        for (let w = 0; w < 80 && cur.rev === rev; w++) {
          await sleep(50);
          cur = (await host.b.get('/api/run')).json;
        }
        assert(cur.rev > rev, 'le pilote automatique doit jouer le héros abandonné');
        autoPlayed++;
        continue;
      }
      const a = state.pending.kind === 'combat' ? chooseAction(state, makeRand(i + 1), 'smart') : afkAction(state);
      const r = await owner.get(state.pending.actor).b.post('/api/run/action', { action: a });
      assert(r.json.ok, r.text.slice(0, 200));
      cur = r.json;
      if (cur.ended) break;
    }
    assert(autoPlayed >= 1, 'le héros de Bob a bien été joué par le pilote automatique');
    const end = cur.ended ? cur : (await host.b.post('/api/run/action', { action: { type: 'ABANDON' } })).json;
    assert(end.ended, 'la partie est finie (l\'hôte abandonne)');
    const bobAfter = (await bob.b.get('/api/profile')).json.characters.find((c) => c.id === bob.hero.id);
    eq(JSON.stringify(bobAfter), JSON.stringify(bobBefore), 'le héros de Bob n\'a rien gagné ni rien perdu');
    const hostAfter = (await host.b.get('/api/profile')).json.characters.find((c) => c.id === host.hero.id);
    assert(hostAfter.stats.runs === hostBefore.stats.runs + 1, 'ceux qui sont restés ont leur bilan');
  });
  await test('le minuteur de tour est tenu par le serveur : un joueur qui ne répond pas est remplacé par le pilote automatique', async () => {
    const { ps } = await lobby(base, 2, { turnSeconds: 30 }); // 30 s × 0,02 = 0,6 s dans les tests
    const [host] = ps;
    const start = await host.b.post('/api/room/start');
    const t0 = start.json.run.timer;
    assert(t0 && t0.seconds === 30 && t0.remainingMs > 0 && t0.remainingMs <= t0.total && t0.total === 600, JSON.stringify(t0));
    const sync = (await host.b.get('/api/run')).json;
    assert(sync.timer.remainingMs <= t0.remainingMs, 'le décompte avance');
    await sleep(2400);
    const later = (await host.b.get('/api/run')).json;
    assert(later.rev >= 2, `le serveur a joué plusieurs fois à la place des joueurs (version ${later.rev})`);
    assert(later.run.log.some((l) => /ne répond plus : le pilote automatique joue à sa place/.test(l.text)), 'le journal le dit');
    eq(later.run.players.length, 2);
    await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });
  await test('le décompte poussé aux joueurs est celui du NOUVEAU tour, pas celui du tour précédent', async () => {
    const { ps } = await lobby(base, 2, { turnSeconds: 120 }); // 120 s × 0,02 = 2,4 s dans les tests
    const [host, guest] = ps;
    const streams = new Map([[host, await Stream.open(base, host.b)], [guest, await Stream.open(base, guest.b)]]);
    for (const st of streams.values()) { await st.take('sync'); st.skipAll(); }
    const start = (await host.b.post('/api/room/start')).json;
    const first = await streams.get(guest).take('run');
    assert(first.timer && first.timer.total === 2400 && first.timer.remainingMs > 1900, `la partie qui commence arrive avec un décompte tout neuf : ${JSON.stringify(first.timer)}`);
    await sleep(1200); // (la moitié du décompte est écoulée : un message qui annoncerait le décompte du tour précédent le montrerait)
    const actor = new Map([['p1', host], ['p2', guest]]).get(start.run.run.pending.actor);
    const other = actor === host ? guest : host;
    streams.get(other).skipAll();
    const r = await actor.b.post('/api/run/action', { action: { type: 'ADVANCE' } });
    assert(r.json.ok && r.json.timer && r.json.timer.remainingMs > 1900, `la réponse à celui qui joue : ${JSON.stringify(r.json.timer)}`);
    const pushed = await streams.get(other).take('run', (d) => d.rev > first.rev);
    assert(pushed.timer && pushed.timer.total === 2400 && pushed.timer.remainingMs > 1900, `le message poussé aux autres porte le décompte du nouveau tour : ${JSON.stringify(pushed.timer)}`);
    for (const st of streams.values()) st.close();
    await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });

  await test('un joueur qui répond à temps garde la main ; sans minuteur (0), le jeu attend', async () => {
    const { ps } = await lobby(base, 2, { turnSeconds: 0 });
    const [host] = ps;
    const start = await host.b.post('/api/room/start');
    eq(start.json.run.timer, null);
    await sleep(1500);
    eq((await host.b.get('/api/run')).json.rev, 0, 'personne n\'a bougé, le jeu attend');
    await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
    // avec un minuteur : agir remet le décompte à zéro pour le tour suivant, mais pas pendant le même tour
    const { ps: qs } = await lobby(base, 2, { turnSeconds: 120 }); // 2,4 s
    const started = await qs[0].b.post('/api/room/start');
    const first = started.json.run.timer.remainingMs;
    await sleep(500);
    const adv = await qs[0].b.post('/api/run/action', { action: { type: 'ADVANCE' } });
    assert(adv.json.ok && adv.json.timer && adv.json.timer.remainingMs <= 2400, JSON.stringify(adv.json.timer));
    assert(first > 2200 && adv.json.timer.remainingMs > 2100, `agir ouvre une nouvelle attente, donc un nouveau décompte complet (${first} puis ${adv.json.timer.remainingMs})`);
    await qs[0].b.post('/api/run/action', { action: { type: 'ABANDON' } });
  });
  await test('l\'hôte abandonne : tout le monde reçoit le bilan « abandon », sans rien gagner, et le salon disparaît', async () => {
    const { ps } = await lobby(base, 2);
    const [host, bob] = ps;
    const bobBefore = (await bob.b.get('/api/profile')).json.characters.find((c) => c.id === bob.hero.id);
    await host.b.post('/api/room/start');
    const sb = await Stream.open(base, bob.b);
    await sb.take('sync');
    const r = await host.b.post('/api/run/action', { action: { type: 'ABANDON' } });
    assert(r.json.ended && r.json.run.result.outcome === 'abandon', r.text.slice(0, 200));
    const pushed = await sb.take('run', (m) => m.ended);
    eq(pushed.run.result.outcome, 'abandon');
    const bobAfter = pushed.characters[0];
    assert(bobAfter.xp === bobBefore.xp && bobAfter.level === bobBefore.level && bobAfter.stats.runs === bobBefore.stats.runs + 1, 'une partie de plus, aucune récompense');
    eq((await bob.b.get('/api/room')).json.room, null);
    sb.close();
  });
  await test('la présence : les coéquipiers voient qui est en ligne', async () => {
    const [host, bob] = await players(base, 2);
    const code = (await host.b.post('/api/room/create', { charId: host.hero.id })).json.room.code;
    await enter(bob, code);
    const sh = await Stream.open(base, host.b);
    await sh.take('sync');
    const online = (m) => m && m.members.find((x) => x.userId === bob.id)?.online;
    const sb = await Stream.open(base, bob.b);
    const seen = await sh.take('room', online, 5000);
    assert(seen.members.find((x) => x.userId === host.id).online, 'l\'hôte est en ligne aussi');
    sb.close();
    await sh.take('room', (m) => m && !online(m), 5000);
    sh.close();
    await host.b.post('/api/room/leave');
    await bob.b.post('/api/room/leave');
  });
  await test('le flux temps réel envoie un « ping » régulier : le navigateur sait que le flux est vivant', async () => {
    const { createHub } = await import('../server/hub.mjs');
    const { EventEmitter } = await import('node:events');
    const hub = createHub({ heartbeatMs: 30 });
    const chunks = [];
    const res = Object.assign(new EventEmitter(), { writeHead() {}, write: (t) => chunks.push(t), end() {} });
    const req = new EventEmitter();
    hub.open(7, req, res, { first: [['sync', { room: null }]] });
    assert(hub.isOnline(7), 'le compte est en ligne tant que le flux est ouvert');
    await sleep(200);
    req.emit('close');
    assert(!hub.isOnline(7), 'et plus en ligne une fois le flux fermé');
    const text = chunks.join('');
    assert(/event: sync/.test(text), 'l\'état est envoyé tout de suite');
    assert((text.match(/event: ping/g) || []).length >= 3, `plusieurs « ping » reçus (${(text.match(/event: ping/g) || []).length})`);
    const before = chunks.length;
    await sleep(100);
    assert(chunks.length === before, 'plus rien n\'est envoyé après la fermeture');
  });

  await test('redémarrage du serveur : le salon et la partie en cours survivent, et le minuteur reprend', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'donjon-rooms-'));
    const cfg = baseConfig({ dbPath: join(dir, 'donjon.sqlite'), timerScale: 0.02 });
    let first = await createGameServer(cfg);
    const port1 = await first.listen(0, '127.0.0.1');
    let second = null;
    try {
      const base1 = `http://127.0.0.1:${port1}`;
      const ps = await players(base1, 2);
      const code = (await ps[0].b.post('/api/room/create', { charId: ps[0].hero.id, setup: { turnSeconds: 120 } })).json.room.code; // 2,4 s
      await enter(ps[1], code);
      await ready(ps[1]);
      await ps[0].b.post('/api/room/start');
      const before = (await ps[0].b.get('/api/run')).json;
      const live = await Stream.open(base1, ps[0].b); // (un flux ouvert à l'arrêt : sa fermeture ne doit rien déclencher sur la base fermée, une seconde plus tard)
      await live.take('sync');
      await first.close();
      live.close();
      second = await createGameServer(cfg);
      const port2 = await second.listen(0, '127.0.0.1');
      const base2 = `http://127.0.0.1:${port2}`;
      const host = new Browser(base2);
      host.cookie = ps[0].b.cookie; // (les connexions sont dans la base : elles survivent au redémarrage)
      const after = (await host.get('/api/run')).json;
      assert(after.run && after.rev === before.rev && after.room.code === code && after.you[0] === 'p1', 'même partie, même numéro de version');
      eq(JSON.stringify(after.run.dungeon.board.map((t) => t.index)), JSON.stringify(before.run.dungeon.board.map((t) => t.index)));
      assert(after.timer && after.timer.seconds === 120, 'le décompte est reparti');
      await sleep(3200);
      const later = (await host.get('/api/run')).json;
      assert(later.rev > before.rev, `le minuteur a repris après le redémarrage (version ${before.rev} → ${later.rev})`);
    } finally {
      await first.close().catch(() => {});
      if (second) await second.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await app.close();
  console.log(R.failed ? `\n❌ ${R.passed} réussis, ${R.failed} échoués` : `\n✅ ${R.passed} tests des salons réussis, 0 échoués`);
  process.exit(R.failed ? 1 : 0);
};
main().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
