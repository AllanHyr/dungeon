// ============================================================
//  auth.mjs — Comptes, mots de passe, sessions
// ============================================================
// - Les mots de passe ne sont JAMAIS stockés : on garde un « hachage » scrypt (fonction de Node, volontairement lente)
//   avec un sel aléatoire propre à chaque compte.
// - Une connexion crée une « session » : un jeton aléatoire envoyé au navigateur dans un cookie (HttpOnly : le code de la
//   page ne peut pas le lire). La base ne garde que l'empreinte (sha256) du jeton : une fuite de la base ne donne aucune session.

import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

const DAY = 24 * 3600 * 1000;
export const COOKIE_NAME = 'donjon_session';

// ---------------- Pseudo et mot de passe ----------------

/** Vérifie et nettoie un pseudo. Renvoie { name, key } ou { error }. La clé sert à l'unicité (sans majuscules ni accents). */
export function checkName(raw) {
  const name = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 20) return { error: 'Le pseudo doit faire entre 2 et 20 caractères.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u.test(name)) return { error: "Le pseudo ne peut contenir que des lettres, des chiffres, des espaces et - _ . '" };
  const key = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return { name, key };
}

export function checkPassword(raw) {
  const pw = String(raw ?? '');
  if (pw.length < 6) return { error: 'Le mot de passe doit faire au moins 6 caractères.' };
  if (pw.length > 200) return { error: 'Le mot de passe est trop long (200 caractères au plus).' };
  return { password: pw };
}

const scryptAsync = (password, salt, cost) => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, { N: cost, r: 8, p: 1, maxmem: 128 * cost * 8 + 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
});

/** Crée le hachage d'un mot de passe : { salt, hash } (deux Buffers). */
export async function hashPassword(password, cost) {
  const salt = randomBytes(16);
  return { salt, hash: await scryptAsync(password, salt, cost) };
}

/** Le mot de passe correspond-il ? (comparaison en temps constant) */
export async function verifyPassword(password, salt, hash, cost) {
  const candidate = await scryptAsync(password, salt, cost);
  return candidate.length === hash.length && timingSafeEqual(candidate, hash);
}

/** Un faux hachage pour faire la même quantité de calcul quand le pseudo n'existe pas (on ne révèle pas quels pseudos existent). */
let dummy = null;
export async function burnPasswordTime(password, cost) {
  dummy ??= await hashPassword('x', cost);
  await verifyPassword(password, dummy.salt, dummy.hash, cost);
}

// ---------------- Sessions ----------------

const digest = (token) => createHash('sha256').update(token).digest('hex');

/** Ouvre une session pour cet utilisateur : renvoie le jeton (à mettre dans le cookie). */
export function createSession(store, userId, days, now = Date.now()) {
  const token = randomBytes(32).toString('base64url');
  store.insertSession(digest(token), userId, now, now + days * DAY);
  return token;
}

/** Retrouve l'utilisateur d'un jeton (ou null). Prolonge la session si elle n'a pas servi depuis plus d'un jour. */
export function sessionUser(store, token, days, now = Date.now()) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const row = store.sessionByHash(digest(token));
  if (!row) return null;
  if (row.expires_at < now) {
    store.deleteSession(digest(token));
    return null;
  }
  if (now - row.last_seen > DAY) store.touchSession(digest(token), now, now + days * DAY);
  return { id: row.user_id, name: row.name };
}

export function endSession(store, token) {
  if (token) store.deleteSession(digest(token));
}

/** Coupe toutes les sessions d'un compte (tous ses appareils), sauf celle qui porte `exceptToken` s'il est donné. */
export function endSessionsOf(store, userId, exceptToken = null) {
  store.deleteSessionsOfUser(userId, exceptToken ? digest(exceptToken) : null);
}

// ---------------- Cookies ----------------

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** L'en-tête Set-Cookie. HttpOnly (illisible par la page), SameSite=Lax (pas envoyé par d'autres sites), Secure si HTTPS. */
export function sessionCookie(token, { days, secure }) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(days * 86400)}${secure ? '; Secure' : ''}`;
}
export function clearCookie({ secure }) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// ---------------- Limiteur de débit ----------------

/** « Au plus `max` essais par fenêtre de `windowMs` » pour une clé (adresse IP, pseudo...). */
export class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }
  /** Enregistre un essai. Renvoie false s'il y en a trop. */
  hit(key, now = Date.now()) {
    const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
  /** Oublie une clé (après une connexion réussie). */
  reset(key) {
    this.hits.delete(key);
  }
  /** Ménage : retire les clés dont tous les essais sont périmés. */
  sweep(now = Date.now()) {
    for (const [key, list] of this.hits) if (!list.some((t) => now - t < this.windowMs)) this.hits.delete(key);
  }
}
