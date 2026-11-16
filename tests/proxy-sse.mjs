// Vérifie que le TEMPS RÉEL traverse ton « portier » (Caddy, nginx...) sans retard : les messages d'un flux « Server-Sent Events »
// doivent arriver tout de suite, pas par paquets ni après un long délai (c'est ce qui fait que les amis voient arriver un joueur dans
// le salon, ou le coup qui vient d'être joué, au moment où ça se passe).
//
// Usage :  node tests/proxy-sse.mjs https://jeu.exemple.fr [CODE_INVITATION]
//          node tests/proxy-sse.mjs http://127.0.0.1:8000         (le jeu directement, sans portier : pour comparer)
//
// Le test crée deux comptes de test (pseudos « sse-a-… » et « sse-b-… », avec un héros chacun), fait créer un salon par l'un
// et mesure en combien de temps l'autre l'apprend. Il les supprime ensuite si tu lui donnes un accès à l'outil d'administration :
//    node server/admin.mjs delete PSEUDO --yes     (le test affiche les deux commandes à la fin)
import { Browser, Stream, sleep } from './server-kit.mjs';

const [base0, invite = ''] = process.argv.slice(2);
if (!base0) {
  console.error('Usage : node tests/proxy-sse.mjs https://adresse-du-jeu [code_invitation]');
  process.exit(2);
}
const base = base0.replace(/\/+$/, '');
const tag = Math.random().toString(36).slice(2, 8);
const nameA = `sse-a-${tag}`;
const nameB = `sse-b-${tag}`;
const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };
const HINT = 'Le portier garde les messages en tampon : voir docs/SERVEUR.md §3.4 (nginx : « proxy_buffering off » ; Caddy : « flush_interval -1 »).';

async function signUp(name) {
  const b = new Browser(base);
  const r = await b.post('/api/register', { name, password: 'secret123', invite });
  if (r.status !== 200) throw new Error(`inscription de ${name} impossible : ${r.status} ${r.text.slice(0, 160)}`);
  const hero = (await b.post('/api/character', { type: 'CHAR_CREATE', name: name.toUpperCase().slice(0, 8), classId: 'berserker' })).json.character;
  if (!hero) throw new Error('création du héros impossible');
  return { b, hero };
}

/** Attend un message du flux et dit en combien de millisecondes il est arrivé (depuis `since`). */
async function arrives(stream, event, pred, since) {
  try {
    const data = await stream.take(event, pred, 4000);
    return { ok: true, ms: Date.now() - since, data };
  } catch {
    return { ok: false, ms: Date.now() - since };
  }
}

(async () => {
  console.log(`\nTemps réel à travers ${base}\n`);
  const a = await signUp(nameA);
  const b = await signUp(nameB);
  const hello = (await a.b.get('/api/hello')).json;
  check(hello && hello.online === true, 'le serveur répond (« qui es-tu ? »)');

  const sa = await Stream.open(base, a.b);
  const sb = await Stream.open(base, b.b);
  check(sa.status === 200 && /text\/event-stream/.test(sa.type), `le flux s'ouvre (statut ${sa.status}, ${sa.type || 'pas de type'})`);

  let t = Date.now();
  const first = await arrives(sa, 'sync', () => true, t);
  check(first.ok && first.ms < 1500, first.ok ? `l'état arrive dès l'ouverture du flux (${first.ms} ms)` : `rien reçu à l'ouverture du flux. ${HINT}`);
  await arrives(sb, 'sync', () => true, t);
  sa.skipAll();
  sb.skipAll();

  // A crée un salon : B (qui est sur l'accueil) doit apprendre qu'un salon s'ouvre
  t = Date.now();
  const made = (await a.b.post('/api/room/create', { charId: a.hero.id })).json;
  check(made.ok && made.room?.code, `Alice crée un salon (${made.room?.code || made.error})`);
  const rooms = await arrives(sb, 'rooms', () => true, t);
  check(rooms.ok && rooms.ms < 1500, rooms.ok ? `Bob apprend qu'un salon s'ouvre en ${rooms.ms} ms` : `Bob n'a rien reçu en 4 s. ${HINT}`);

  // B rejoint : A doit voir arriver B tout de suite
  t = Date.now();
  const joined = (await b.b.post('/api/room/join', { code: made.room.code, charId: b.hero.id })).json;
  check(joined.ok, `Bob rejoint avec le code (${joined.ok ? 'ok' : joined.error})`);
  const seen = await arrives(sa, 'room', (r) => r && r.members.length === 2, t);
  check(seen.ok && seen.ms < 1500, seen.ok ? `Alice voit arriver Bob en ${seen.ms} ms` : `Alice n'a pas vu arriver Bob en 4 s. ${HINT}`);

  // plusieurs messages d'affilée : ils ne doivent pas s'accumuler pour arriver en bloc
  sb.skipAll();
  const stamps = [];
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    await a.b.post('/api/room/setup', { turnSeconds: [30, 60, 90, 120][i] });
    const got = await arrives(sb, 'room', (r) => r && r.setup.turnSeconds === [30, 60, 90, 120][i], t0);
    stamps.push(got.ok ? got.ms : Infinity);
    await sleep(60);
  }
  check(stamps.every((ms) => ms < 1500), `quatre réglages de suite arrivent un par un, sans retard (${stamps.map((m) => `${m} ms`).join(', ')})`);

  // le flux reste ouvert : un message « ping » du serveur arrive toutes les 20 s (on n'attend pas aussi longtemps ici ; voir le §3.4 du guide)
  await b.b.post('/api/room/leave');
  await a.b.post('/api/room/leave');
  sa.close();
  sb.close();

  console.log(`\nComptes de test créés (à supprimer si tu veux) :\n  node server/admin.mjs delete ${nameA} --yes\n  node server/admin.mjs delete ${nameB} --yes`);
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Le temps réel traverse bien le portier');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(2); });
