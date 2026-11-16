// ============================================================
//  app.mjs — Le serveur HTTP : routes de l'API et fichiers du jeu
// ============================================================
// createGameServer(config) prépare tout (base de données, contenu, routes) sans rien écouter ; `listen()` démarre.
// Les tests l'utilisent directement (voir tests/server-api.mjs).
//
// L'API (tout en JSON, le navigateur se reconnaît à son cookie de session) :
//   GET  /api/hello          qui es-tu ? (utilisé par la page pour savoir si elle est en ligne)
//   GET  /api/content        les fichiers de données du jeu (le navigateur construit le jeu avec)
//   POST /api/register       { name, password, invite? }  crée un compte et connecte
//   POST /api/login          { name, password }
//   POST /api/logout
//   POST /api/password       { current, next }  change mon mot de passe (les autres appareils sont déconnectés)
//   GET  /api/profile        mes personnages + ma partie en cours + mon salon
//   POST /api/character      { type: 'CHAR_CREATE' | 'CHAR_EQUIP' | ..., ... }
//   POST /api/run/start      { kind: 'farm', charId }   (les donjons se lancent depuis un salon)
//   GET  /api/run            reprendre ma partie
//   POST /api/run/action     { action }
//   POST /api/run/discard    jeter ma partie de farm sans bilan
//   GET  /api/events         le temps réel (Server-Sent Events) : salon, partie, liste des salons
//   GET  /api/rooms          les salons ouverts
//   GET  /api/room           mon salon
//   POST /api/room/create    { charId, setup? }   crée un salon (on en devient l'hôte)
//   POST /api/room/join      { code | id, charId }
//   POST /api/room/leave
//   POST /api/room/hero      { charId }           change de héros (avant le lancement)
//   POST /api/room/ready     { ready }
//   POST /api/room/setup     { tranche?, mode?, stasisLevel?, turnSeconds? }   (hôte)
//   POST /api/room/kick      { userId }                                         (hôte)
//   POST /api/room/start                                                        (hôte)

import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from './db.mjs';
import { createStore } from './store.mjs';
import {
  checkName, checkPassword, hashPassword, verifyPassword, burnPasswordTime, createSession, sessionUser, endSession, endSessionsOf,
  parseCookies, sessionCookie, clearCookie, COOKIE_NAME, RateLimiter
} from './auth.mjs';
import { HttpError, clientIp, isHttps, sameOrigin, readJson, sendJson, securityHeaders, serveStatic } from './http-utils.mjs';
import { ContentManager, GameService, cleanAction } from './game.mjs';
import { RoomService } from './rooms.mjs';
import { createHub } from './hub.mjs';
import { TurnTimers } from './timers.mjs';

const API_VERSION = 1;

const sha = (s) => createHash('sha256').update(String(s)).digest();
const sameSecret = (a, b) => timingSafeEqual(sha(a), sha(b));

export async function createGameServer(config) {
  const db = await openDatabase(config.dbPath);
  const store = createStore(db);
  const contentManager = new ContentManager(join(config.root, 'data'), (m) => console.warn(m));
  contentManager.get(); // (échoue tout de suite, avec un message clair, si un fichier de données est faux)
  // Le temps réel (un flux par joueur connecté), le minuteur de tour, le jeu, et les salons qui s'appuient dessus.
  const hub = createHub({ onPresence: (userId) => rooms.presenceChanged(userId) });
  const timers = new TurnTimers({ scale: config.timerScale ?? 1, onFire: (runId, key) => game.afkTurn(runId, key) });
  const game = new GameService({ store, contentManager, config, hub, timers });
  const rooms = new RoomService({ store, game, hub });
  game.resumeTimers(); // (les parties à plusieurs en cours reprennent leur décompte après un redémarrage)

  const limiters = {
    login: new RateLimiter(config.limits.login, 10 * 60 * 1000), // essais de connexion pour un même pseudo depuis une même adresse
    loginIp: new RateLimiter(config.limits.loginIp, 10 * 60 * 1000),
    register: new RateLimiter(config.limits.register, 60 * 60 * 1000),
    api: new RateLimiter(config.limits.api, 60 * 1000)
  };
  const maintenance = setInterval(() => {
    store.sweepSessions(Date.now());
    rooms.sweep();
    for (const l of Object.values(limiters)) l.sweep();
  }, 3600 * 1000);
  maintenance.unref();

  // ---------------- Les routes ----------------

  /** Chaque route reçoit { req, url, body, user, token, ip, https } et renvoie { status?, body, headers? }. */
  const requireUser = (ctx) => {
    if (!ctx.user) throw new HttpError(401, "Tu n'es pas connecté.");
    return ctx.user;
  };
  const cookieOpts = (ctx) => ({
    days: config.sessionDays,
    secure: config.cookieSecure === '1' || (config.cookieSecure === 'auto' && ctx.https)
  });
  const profileBody = (user) => ({
    ok: true, user, characters: game.loadCharacters(user.id), run: game.runSummary(user.id), room: rooms.viewOf(user.id), contentVersion: contentManager.version
  });

  const routes = {
    'GET /api/health': () => ({ body: { ok: true, ...store.stats() } }),

    'GET /api/hello': (ctx) => ({
      body: { ok: true, online: true, api: API_VERSION, contentVersion: (game.content(), contentManager.version), user: ctx.user, inviteRequired: !!config.inviteCode }
    }),

    'GET /api/content': (ctx) => {
      game.content();
      const etag = `"${contentManager.version}"`;
      if (ctx.req.headers['if-none-match'] === etag) return { status: 304, raw: '', headers: { ETag: etag, 'Cache-Control': 'no-cache' } };
      return { raw: contentManager.bundleText, headers: { ETag: etag, 'Cache-Control': 'no-cache' } };
    },

    'POST /api/register': async (ctx) => {
      if (!limiters.register.hit(ctx.ip)) throw new HttpError(429, 'Trop de créations de compte depuis cette adresse. Réessaie plus tard.');
      const { name: rawName, password: rawPassword, invite } = ctx.body;
      if (config.inviteCode && !(typeof invite === 'string' && sameSecret(invite.trim(), config.inviteCode))) throw new HttpError(403, "Code d'invitation incorrect.");
      const n = checkName(rawName);
      if (n.error) throw new HttpError(400, n.error);
      const p = checkPassword(rawPassword);
      if (p.error) throw new HttpError(400, p.error);
      if (store.countUsers() >= config.maxUsers) throw new HttpError(403, 'Ce serveur a atteint son nombre maximal de comptes.');
      if (store.userByKey(n.key)) throw new HttpError(409, 'Ce pseudo est déjà pris.');
      const { salt, hash } = await hashPassword(p.password, config.scryptCost);
      let userId;
      try {
        userId = store.insertUser(n.name, n.key, salt, hash, Date.now());
      } catch {
        throw new HttpError(409, 'Ce pseudo est déjà pris.'); // (deux créations au même instant)
      }
      const token = createSession(store, userId, config.sessionDays);
      return { body: { ok: true, user: { id: userId, name: n.name } }, headers: { 'Set-Cookie': sessionCookie(token, cookieOpts(ctx)) } };
    },

    'POST /api/login': async (ctx) => {
      const n = checkName(ctx.body.name);
      const password = String(ctx.body.password ?? '');
      const key = `${ctx.ip}|${n.key || '?'}`;
      if (!limiters.loginIp.hit(ctx.ip) || !limiters.login.hit(key)) throw new HttpError(429, 'Trop d\'essais. Patiente quelques minutes.');
      const row = n.key ? store.userByKey(n.key) : null;
      const ok = row ? await verifyPassword(password, Buffer.from(row.pass_salt), Buffer.from(row.pass_hash), config.scryptCost) : (await burnPasswordTime(password, config.scryptCost), false);
      if (!ok) throw new HttpError(401, 'Pseudo ou mot de passe incorrect.');
      limiters.login.reset(key);
      store.touchLogin(row.id, Date.now());
      const token = createSession(store, row.id, config.sessionDays);
      return { body: { ok: true, user: { id: row.id, name: row.name } }, headers: { 'Set-Cookie': sessionCookie(token, cookieOpts(ctx)) } };
    },

    'POST /api/logout': (ctx) => {
      endSession(store, ctx.token);
      return { body: { ok: true }, headers: { 'Set-Cookie': clearCookie(cookieOpts(ctx)) } };
    },

    // Changer son mot de passe : il faut connaître l'ancien (une session volée ne suffit pas). Les autres appareils sont déconnectés.
    // (Une erreur « mot de passe actuel incorrect » est un 403 et non un 401 : 401 veut dire « session expirée » pour la page.)
    'POST /api/password': async (ctx) => {
      const user = requireUser(ctx);
      const p = checkPassword(ctx.body.next);
      if (p.error) throw new HttpError(400, p.error.replace('Le mot de passe', 'Le nouveau mot de passe'));
      const key = `pw|${ctx.ip}|${user.id}`;
      if (!limiters.login.hit(key)) throw new HttpError(429, "Trop d'essais. Patiente quelques minutes.");
      const row = store.userById(user.id);
      const ok = row && await verifyPassword(String(ctx.body.current ?? ''), Buffer.from(row.pass_salt), Buffer.from(row.pass_hash), config.scryptCost);
      if (!ok) throw new HttpError(403, 'Le mot de passe actuel est incorrect.');
      limiters.login.reset(key);
      const { salt, hash } = await hashPassword(p.password, config.scryptCost);
      store.setPassword(user.id, salt, hash);
      endSessionsOf(store, user.id, ctx.token);
      return { body: { ok: true } };
    },

    'GET /api/profile': (ctx) => ({ body: profileBody(requireUser(ctx)) }),

    'POST /api/character': (ctx) => {
      const user = requireUser(ctx);
      const res = game.characterAction(user.id, cleanAction(ctx.body));
      return { body: res };
    },

    'POST /api/run/start': (ctx) => {
      const user = requireUser(ctx);
      return { body: { ...game.startRun(user.id, ctx.body), contentVersion: contentManager.version } };
    },

    // ---- Le temps réel : une réponse qui ne se termine jamais, sur laquelle on pousse les nouvelles (voir hub.mjs)
    'GET /api/events': (ctx) => {
      const user = requireUser(ctx);
      const first = [['sync', { room: rooms.viewOf(user.id), run: game.resumeRun(user.id), contentVersion: contentManager.version }]];
      hub.open(user.id, ctx.req, ctx.res, { headers: ctx.common, first });
      return { handled: true };
    },

    // ---- Les salons : jouer un donjon à plusieurs, un héros par joueur
    'GET /api/rooms': (ctx) => (requireUser(ctx), { body: { ok: true, rooms: rooms.list() } }),
    'GET /api/room': (ctx) => ({ body: { ok: true, room: rooms.viewOf(requireUser(ctx).id) } }),
    'POST /api/room/create': (ctx) => ({ body: rooms.create(requireUser(ctx).id, ctx.body) }),
    'POST /api/room/join': (ctx) => ({ body: rooms.join(requireUser(ctx).id, ctx.body) }),
    'POST /api/room/leave': (ctx) => ({ body: rooms.leave(requireUser(ctx).id) }),
    'POST /api/room/hero': (ctx) => ({ body: rooms.setHero(requireUser(ctx).id, ctx.body.charId) }),
    'POST /api/room/ready': (ctx) => ({ body: rooms.setReady(requireUser(ctx).id, ctx.body.ready) }),
    'POST /api/room/setup': (ctx) => ({ body: rooms.setSetup(requireUser(ctx).id, ctx.body) }),
    'POST /api/room/kick': (ctx) => ({ body: rooms.kick(requireUser(ctx).id, ctx.body.userId) }),
    'POST /api/room/start': (ctx) => ({ body: rooms.start(requireUser(ctx).id) }),

    'GET /api/run': (ctx) => ({ body: { ...game.resumeRun(requireUser(ctx).id), contentVersion: contentManager.version } }),

    'POST /api/run/action': (ctx) => ({ body: game.runAction(requireUser(ctx).id, ctx.body.action) }),

    'POST /api/run/discard': (ctx) => ({ body: game.discardRun(requireUser(ctx).id) })
  };

  // ---------------- Une requête ----------------

  async function handleApi(req, res, url, ip, https, common) {
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) {
      if (Object.keys(routes).some((k) => k.endsWith(` ${url.pathname}`))) throw new HttpError(405, 'Méthode non permise.');
      throw new HttpError(404, 'Route inconnue.');
    }
    if (!limiters.api.hit(ip)) throw new HttpError(429, 'Trop de requêtes. Ralentis un peu.');
    if (req.method === 'POST' && !sameOrigin(req, config.trustProxy)) throw new HttpError(403, 'Requête refusée (origine inconnue).');
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
    const user = sessionUser(store, token, config.sessionDays);
    const body = req.method === 'POST' ? await readJson(req) : {};
    const out = await handler({ req, res, common, url, body, user, token, ip, https });
    if (out.handled) return res.statusCode; // (le flux temps réel s'est ouvert tout seul)
    if (out.raw !== undefined) {
      res.writeHead(out.status || 200, { 'Content-Type': 'application/json; charset=utf-8', ...common, ...out.headers });
      res.end(out.raw);
      return out.status || 200;
    }
    sendJson(res, out.status || 200, out.body, { ...common, ...out.headers });
    return out.status || 200;
  }

  const log = (req, user, status, ms, ip) => {
    if (config.log === 'quiet') return;
    const isApi = req.url.startsWith('/api/');
    if (config.log === 'api' && !isApi && status < 400) return;
    console.log(`${new Date().toISOString().slice(11, 19)} ${ip} ${user || '-'} ${req.method} ${req.url.split('?')[0]} ${status} ${Math.round(ms)}ms`);
  };

  const server = createServer(async (req, res) => {
    const t0 = performance.now();
    const ip = clientIp(req, config.trustProxy);
    const https = isHttps(req, config.trustProxy);
    const common = securityHeaders(https);
    let status = 500;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        status = await handleApi(req, res, url, ip, https, common);
      } else if (await serveStatic(req, res, url.pathname, config.root, common, { injectHead: '<meta name="donjon-online" content="1">' })) {
        status = res.statusCode;
      } else {
        status = 404;
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...common });
        res.end('404 - introuvable');
      }
    } catch (e) {
      if (e instanceof HttpError) status = e.status;
      else {
        status = 500;
        console.error(`[erreur] ${req.method} ${req.url} :`, e);
      }
      if (!res.headersSent) {
        const closing = status === 413 ? { Connection: 'close' } : {}; // (corps trop gros : on répond, puis on coupe)
        sendJson(res, status, { ok: false, error: e instanceof HttpError ? e.message : 'Erreur interne du serveur.' }, { ...common, ...closing });
        if (status === 413) res.once('finish', () => req.destroy());
      } else res.end();
    }
    log(req, null, status, performance.now() - t0, ip);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;

  return {
    server, db, store, game, rooms, hub, timers, contentManager, limiters,
    /** Démarre l'écoute. Renvoie le port réellement utilisé (utile avec le port 0). */
    listen: (port = config.port, host = config.host) => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve(server.address().port));
    }),
    close: () => new Promise((resolve) => {
      clearInterval(maintenance);
      rooms.close(); // (avant de couper les flux : leur fermeture déclenche des messages de présence, qui n'ont plus de base où lire)
      timers.clearAll();
      hub.closeAll();
      server.close(() => {
        try { db.close(); } catch { /* déjà fermée */ }
        resolve();
      });
      server.closeAllConnections?.();
    })
  };
}
