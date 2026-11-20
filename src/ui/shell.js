// ============================================================
//  shell.js — Démarre l'interface et choisit l'écran à afficher
// ============================================================

import { combatCoach, tileCoach } from './coach.js';
import { clear } from './dom.js';
import { app, toast } from './state.js';
import { renderMenu } from './screens/menu.js';
import { renderRun } from './screens/run.js';
import { renderEnd } from './screens/end.js';
import { renderLogin } from './screens/login.js';
import { renderLobby } from './screens/lobby.js';
import { setSoundEnabled, setVolume } from './sound.js';
import { inRoom, isMyTurn } from './turn.js';

const SCREENS = { menu: renderMenu, run: renderRun, end: renderEnd, login: renderLogin, lobby: renderLobby };

// Le titre de l'onglet : à plusieurs, il le dit quand c'est à toi de jouer (utile quand on a changé d'onglet en attendant son tour).
const BASE_TITLE = document.title;
const titleFor = () => (app.screen === 'run' && app.run && inRoom(app.run) && isMyTurn(app.run) ? `▶ À toi de jouer — ${BASE_TITLE}` : BASE_TITLE);

/**
 * Prépare l'application et affiche le premier écran.
 * @param gateway  la passerelle vers les personnages et les parties (locale ou en ligne : voir src/net/common.js)
 * @param screen   l'écran de départ : 'menu', ou 'login' si on est en ligne sans être connecté
 */
export function startApp(root, content, gateway, { screen = 'menu' } = {}) {
  app.root = root;
  app.content = content;
  app.gateway = gateway;
  app.store = gateway.store;
  app.profile = gateway.profile;
  app.screen = screen;
  setSoundEnabled(app.profile.settings.sound);
  setVolume(app.profile.settings.volume ?? 0.7);
  gateway.onStale = () => toast('Le jeu a été mis à jour sur le serveur : recharge la page (F5) pour jouer avec les nouvelles règles.', 'bad');
  app.render = () => {
    // À plusieurs, le serveur pousse des mises à jour à tout moment : un redessin ne doit pas faire perdre le champ où l'on écrit.
    const el = document.activeElement;
    const keep = el && el.id && /^(INPUT|TEXTAREA)$/.test(el.tagName) && root.contains(el) ? { id: el.id, start: el.selectionStart, end: el.selectionEnd } : null;
    clear(root);
    (SCREENS[app.screen] || renderMenu)(root);
    if (app.screen === 'run') { combatCoach(root); tileCoach(root); } // (le premier combat guidé, et la première fois de chaque case)
    document.title = titleFor();
    const again = keep && document.getElementById(keep.id);
    if (again) {
      again.focus({ preventScroll: true });
      try { again.setSelectionRange(keep.start, keep.end); } catch { /* ce type de champ n'a pas de sélection */ }
    }
  };
  app.render();
  if (gateway.mode === 'local' && !gateway.persistent) {
    toast("Ton navigateur bloque l'enregistrement local : exporte un code de sauvegarde pour ne rien perdre.", 'bad');
  }
}
