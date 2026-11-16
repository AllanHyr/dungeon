// ============================================================
//  http-utils.mjs — Petits outils HTTP : corps JSON, réponses, fichiers du jeu, en-têtes de sécurité
// ============================================================

import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize, sep, posix } from 'node:path';

/** Une erreur « attendue » : elle devient une réponse JSON { ok:false, error } avec ce statut HTTP. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------- Adresse du visiteur, origine ----------------

/** L'adresse IP du visiteur. Derrière un serveur web de confiance (DONJON_TRUST_PROXY=1) on lit X-Forwarded-For. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || '?';
}

/** Le site est-il servi en HTTPS ? (directement, ou derrière un serveur web de confiance qui le dit) */
export function isHttps(req, trustProxy) {
  return !!req.socket.encrypted || (trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}

/** Protection contre les requêtes envoyées par un AUTRE site : si le navigateur indique d'où vient la requête, ça doit être ici. */
export function sameOrigin(req, trustProxy) {
  const origin = req.headers.origin;
  if (!origin) return true; // (requête du même site, ou outil en ligne de commande)
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const mine = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
  return host === String(mine).split(',')[0].trim();
}

// ---------------- Corps JSON et réponses ----------------

/** Lit le corps JSON de la requête (64 Ko au plus). */
export function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!/^application\/json\b/i.test(type)) return reject(new HttpError(415, 'Le corps doit être du JSON (Content-Type: application/json).'));
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return; // (on jette la suite sans la garder en mémoire)
      size += chunk.length;
      if (size > limit) {
        tooBig = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('pas un objet');
        resolve(body);
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(text);
}

// ---------------- En-têtes de sécurité ----------------

/**
 * Ce que le navigateur a le droit de charger : uniquement ce site, plus les polices Google (Cinzel, Alegreya Sans).
 * Même si une faille laissait passer du code dans une page, il ne pourrait pas appeler d'autres sites.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

export function securityHeaders(https) {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...(https ? { 'Strict-Transport-Security': 'max-age=15552000' } : {})
  };
}

// ---------------- Fichiers du jeu ----------------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif'
};

/** Les seuls fichiers publics : la page, le code du navigateur, les styles, les données et les images du jeu. JAMAIS server/, tests/, var/ (la base)... */
const PUBLIC_PREFIXES = ['css/', 'src/', 'data/', 'img/']; // (img/ : les images qu'on met à la place des dessins du jeu, voir le champ `art` dans docs/ECRIRE-UNE-CLASSE.md)
const PUBLIC_FILES = new Set(['index.html', 'main.js']);

/**
 * Sert un fichier du jeu. Renvoie true s'il a répondu (fichier ou 304), false si ce chemin n'existe pas / n'est pas public.
 * @param root  le dossier du jeu
 */
export async function serveStatic(req, res, pathname, root, extraHeaders = {}, { injectHead = '' } = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel.includes('\0') || rel.includes('\\')) return false;
  // On « aplatit » le chemin AVANT de le comparer à la liste des fichiers publics : « /src/../server/db.mjs » devient « server/db.mjs » et est refusé.
  rel = posix.normalize(rel).replace(/^\/+/, '');
  if (rel === '..' || rel.startsWith('../')) return false;
  if (!PUBLIC_FILES.has(rel) && !PUBLIC_PREFIXES.some((p) => rel.startsWith(p))) return false;
  const file = normalize(join(root, rel));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) return false; // (aucune sortie du dossier du jeu : « .. »)
  let info;
  try {
    info = await stat(file);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  // La page d'accueil reçoit une petite étiquette qui dit au jeu « tu es servi par le serveur du jeu » (voir main.js).
  if (injectHead && rel === 'index.html') {
    const html = Buffer.from((await readFile(file, 'utf8')).replace('</head>', `${injectHead}\n</head>`));
    const tag = `W/"${createHash('sha1').update(html).digest('hex').slice(0, 16)}"`;
    const h = { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache', ETag: tag, ...extraHeaders };
    if (req.headers['if-none-match'] === tag) {
      res.writeHead(304, h);
      res.end();
      return true;
    }
    res.writeHead(200, { ...h, 'Content-Length': html.length });
    res.end(req.method === 'HEAD' ? undefined : html);
    return true;
  }
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag, ...extraHeaders };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Length': info.size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}
