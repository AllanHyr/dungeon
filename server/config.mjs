// ============================================================
//  config.mjs — Les réglages du serveur (variables d'environnement)
// ============================================================
// Rien à écrire dans un fichier : on lance par exemple
//     PORT=8000 DONJON_INVITE_CODE=mon-secret node server/server.mjs
// Toutes les variables sont facultatives. Voir docs/SERVEUR.md.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Un nombre positif lu dans l'environnement (sinon la valeur par défaut). */
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * @param env        normalement process.env
 * @param overrides  réglages qui l'emportent (utilisé par les tests)
 */
export function loadConfig(env = process.env, overrides = {}) {
  const root = fileURLToPath(new URL('..', import.meta.url)); // le dossier du jeu
  return {
    root,
    port: env.PORT === undefined || env.PORT === '' || !Number.isFinite(Number(env.PORT)) ? 8000 : Number(env.PORT), // (0 = n'importe quel port libre : pratique pour les tests)
    // Par défaut le serveur n'écoute QUE sur la machine (127.0.0.1) : il est fait pour être placé derrière un serveur web
    // qui gère le HTTPS (Caddy, nginx). Pour l'ouvrir directement sur Internet : HOST=0.0.0.0 (mais les mots de passe circuleraient en clair).
    host: env.HOST || '127.0.0.1',
    dbPath: env.DONJON_DB ? resolve(env.DONJON_DB) : resolve(root, 'var', 'donjon.sqlite'),
    inviteCode: env.DONJON_INVITE_CODE || '', // si renseigné, il faut ce code pour créer un compte
    trustProxy: env.DONJON_TRUST_PROXY === '1', // derrière Caddy / nginx : lire l'adresse du visiteur dans X-Forwarded-For
    cookieSecure: env.DONJON_COOKIE_SECURE ?? 'auto', // 'auto' (HTTPS détecté), '1' (toujours) ou '0' (jamais)
    maxUsers: num(env.DONJON_MAX_USERS, 200),
    maxCharacters: env.DONJON_MAX_CHARACTERS ? num(env.DONJON_MAX_CHARACTERS, null) : null, // null : le nombre de places de rules.json (maxCharacters)
    sessionDays: num(env.DONJON_SESSION_DAYS, 30),
    scryptCost: 16384, // coût du hachage des mots de passe (les tests le baissent pour aller vite). NE PAS le changer sur un serveur en service : les mots de passe déjà enregistrés ne seraient plus reconnus.
    // Limites anti-abus (par adresse) : essais de connexion ratés / 10 min pour un même pseudo, essais de connexion / 10 min, créations de compte / heure, requêtes API / minute
    limits: { login: 8, loginIp: 40, register: 6, api: 900 },
    log: env.DONJON_LOG || 'api', // 'api' (les requêtes de l'API), 'all' ou 'quiet'
    timerScale: 1, // multiplicateur de la durée des tours à plusieurs (les tests l'abaissent pour ne pas attendre 60 secondes)
    ...overrides
  };
}
