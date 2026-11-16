// Les outils communs des tests du serveur (comptes, « navigateurs » sans écran, serveur de test, mini-framework de test).
// Utilisé par tests/server-api.mjs et tests/server-rooms.mjs.
import { loadConfig } from '../server/config.mjs';
import { createGameServer } from '../server/app.mjs';

export function runner() {
  let passed = 0;
  let failed = 0;
  return {
    async test(name, fn) {
      try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
      } catch (e) {
        failed++;
        console.log(`  ❌ ${name}\n     ${String(e.message).split('\n')[0]}`);
      }
    },
    get passed() { return passed; },
    get failed() { return failed; }
  };
}
export const assert = (c, m = 'assertion fausse') => { if (!c) throw new Error(m); };
export const eq = (a, b, m = '') => assert(JSON.stringify(a) === JSON.stringify(b), `${m} attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

// ---------------- Outils ----------------

/** Un « navigateur » : garde le cookie de session entre les requêtes. */
export class Browser {
  constructor(base) { this.base = base; this.cookie = ''; this.lastSetCookie = ''; }
  async req(method, path, body, headers = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.lastSetCookie = setCookie;
      const m = /^donjon_session=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `donjon_session=${m[1]}` : '';
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* pas du JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get(path) { return this.req('GET', path); }
  post(path, body = {}) { return this.req('POST', path, body); }
}

export const RELAXED = { login: 1e6, loginIp: 1e6, register: 1e6, api: 1e6 }; // (tous les « visiteurs » des tests ont la même adresse : on relâche les limites, sauf dans les tests qui les vérifient)
export const baseConfig = (extra = {}) => loadConfig({}, { dbPath: ':memory:', port: 0, host: '127.0.0.1', scryptCost: 1024, log: 'quiet', limits: RELAXED, ...extra });
export async function startServer(extra = {}) {
  const app = await createGameServer(baseConfig(extra));
  const port = await app.listen(0, '127.0.0.1');
  return { app, base: `http://127.0.0.1:${port}`, port };
}
export async function newUser(base, name, password = 'secret123', invite) {
  const b = new Browser(base);
  const r = await b.post('/api/register', { name, password, invite });
  assert(r.status === 200, `inscription de ${name} : ${r.status} ${r.text}`);
  return b;
}
/** Modifie un personnage directement dans la base (les tests « offrent » un équipement que l'API, elle, ne donnerait jamais). */
export function seed(app, userId, charId, mutate) {
  const chars = app.game.loadCharacters(userId);
  const ch = chars.find((c) => c.id === charId);
  mutate(ch);
  app.store.saveCharacter(userId, ch, Date.now());
  return ch;
}
export const userIdOf = async (b) => (await b.get('/api/hello')).json.user.id;
export const create = async (b, name, classId) => (await b.post('/api/character', { type: 'CHAR_CREATE', name, classId })).json.character;


export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Un « navigateur » qui écoute le temps réel : ouvre /api/events pour ce compte et garde les messages reçus.
 *   const s = await Stream.open(base, browser);  const msg = await s.take('run', (m) => m.ended);  s.close();
 */
export class Stream {
  static async open(base, browser) {
    const s = new Stream();
    s.ctl = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { Cookie: browser.cookie }, signal: s.ctl.signal });
    s.status = res.status;
    s.type = res.headers.get('content-type') || '';
    s.headers = res.headers;
    if (res.status !== 200) {
      s.body = await res.text();
      return s;
    }
    s.events = [];
    s.seen = 0;
    s.reader = res.body.getReader();
    s.pump();
    return s;
  }

  /** Lit le flux en continu et découpe les messages (« event: x / data: {...} » séparés par une ligne vide). */
  async pump() {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event) this.events.push({ event, data: data ? JSON.parse(data) : null });
        }
      }
    } catch { /* flux fermé */ }
  }

  /** Le prochain message de ce type (et qui satisfait `pred`) reçu depuis le dernier `take`. */
  async take(event, pred = () => true, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let i = this.seen; i < this.events.length; i++) {
        const m = this.events[i];
        if (m.event === event && pred(m.data)) {
          this.seen = i + 1;
          return m.data;
        }
      }
      if (Date.now() > deadline) throw new Error(`aucun message « ${event} » reçu en ${timeoutMs} ms (reçus : ${this.events.slice(this.seen).map((m) => m.event).join(', ') || 'rien'})`);
      await sleep(15);
    }
  }

  /** Oublie ce qui a été reçu jusqu'ici. */
  skipAll() { this.seen = this.events.length; }

  close() { this.ctl.abort(); }
}
