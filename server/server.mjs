// ============================================================
//  server.mjs — Lance le serveur du jeu :   node server/server.mjs
// ============================================================
// Il sert la page du jeu ET l'API (comptes, personnages, parties). Voir docs/SERVEUR.md pour le mettre en ligne.
// Aucune dépendance à installer : seulement Node 22.5 ou plus récent.

import { loadConfig } from './config.mjs';
import { createGameServer } from './app.mjs';

const config = loadConfig();

let app;
try {
  app = await createGameServer(config);
} catch (e) {
  console.error(`\nImpossible de démarrer le serveur :\n${e.message}\n`);
  process.exit(1);
}

let port;
try {
  port = await app.listen();
} catch (e) {
  console.error(`\nImpossible d'écouter sur ${config.host}:${config.port} : ${e.message}\n${e.code === 'EADDRINUSE' ? 'Ce port est déjà utilisé : change-le avec PORT=8001 node server/server.mjs\n' : ''}`);
  process.exit(1);
}

const stats = app.store.stats();
console.log(`
Donjon — serveur en ligne
  Adresse        http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${port}   (écoute sur ${config.host}:${port})
  Base           ${config.dbPath}
  Comptes        ${stats.users}  ·  personnages ${stats.characters}  ·  parties en cours ${stats.runs}
  Inscription    ${config.inviteCode ? "protégée par un code d'invitation" : "OUVERTE à tous (conseillé : DONJON_INVITE_CODE=un-secret)"}
  Proxy HTTPS    ${config.trustProxy ? 'oui (X-Forwarded-* lus)' : 'non'}
  Ctrl+C pour arrêter.
`);
if (config.host === '127.0.0.1') console.log("  (Le serveur n'est joignable que depuis cette machine. Derrière Caddy ou nginx, c'est voulu ; sinon : HOST=0.0.0.0)\n");

// Arrêt propre : on termine les requêtes en cours et on ferme la base (ce qui évite de laisser un fichier -wal derrière soi).
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${signal} reçu : arrêt du serveur...`);
    await app.close();
    process.exit(0);
  });
}
