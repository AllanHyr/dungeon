// ============================================================
//  main.js — Point d'entrée : charge les données puis lance le jeu
// ============================================================
// Deux façons de jouer, choisies automatiquement :
//   - EN LIGNE : la page est servie par le serveur du jeu (server/server.mjs) : on se connecte, et les personnages et les parties
//     vivent sur le serveur, qui applique les règles ;
//   - EN LOCAL : n'importe quel autre serveur de fichiers (serve.mjs, la démo publiée...) : tout reste dans le navigateur.

import { loadContent } from './src/data-loader.js';
import { probeServer, loadRemoteContent, createRemoteGateway } from './src/net/remote-gateway.js';
import { createLocalGateway } from './src/net/local-gateway.js';
import { startApp } from './src/ui/shell.js';
import { app, toast } from './src/ui/state.js';
import { go, connectLive } from './src/ui/controller.js';

const root = document.getElementById('app');

try {
  // Les données et l'API sont cherchées à côté de ce fichier main.js (marche quelle que soit l'adresse de la page).
  const dataUrl = new URL('./data/', import.meta.url).href;
  const apiBase = new URL('./api/', import.meta.url);
  // Le serveur du jeu ajoute une étiquette <meta name="donjon-online"> à la page : sans elle, on joue en local, sans rien demander au réseau.
  const served = !!document.querySelector('meta[name="donjon-online"]');
  const hello = served ? await probeServer(apiBase) : null;
  if (served && !hello) throw new Error('Le serveur du jeu ne répond pas. Réessaie dans un instant.');
  if (hello) {
    const content = await loadRemoteContent(apiBase);
    const gateway = createRemoteGateway({
      content, apiBase, hello,
      onUnauthorized: () => {
        if (app.screen === 'login') return;
        app.run = null;
        go('login');
        toast('Ta session a expiré : reconnecte-toi.', 'bad');
      }
    });
    if (hello.user) {
      const loaded = await gateway.loadProfile();
      if (!loaded.ok) throw new Error(loaded.error);
    }
    startApp(root, content, gateway, { screen: hello.user ? 'menu' : 'login' });
    if (hello.user) connectLive(); // (le temps réel : les autres joueurs de ton salon ou de ta partie)
  } else {
    const content = await loadContent(dataUrl);
    startApp(root, content, createLocalGateway({ content, dataUrl }));
  }
} catch (error) {
  console.error(error);
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  const title = document.createElement('h1');
  title.textContent = 'Impossible de lancer le jeu';
  const msg = document.createElement('p');
  msg.textContent = error.message;
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = "Astuce : le jeu doit être ouvert via un petit serveur local (voir le fichier LISEZMOI.md), pas en double-cliquant sur index.html.";
  box.append(title, msg, hint);
  root.append(box);
}
