// ============================================================
//  state.js — L'état global de l'interface + fenêtres, messages, confirmations
// ============================================================
// `app` est l'objet central partagé par tous les écrans :
//   app.content  le contenu du jeu (classes, objets...)
//   app.gateway  la passerelle vers les personnages et les parties : locale (navigateur) ou en ligne (serveur) — voir src/net/common.js
//   app.profile  les personnages du joueur + ses préférences (celui de la passerelle)
//   app.run      la partie en cours (l'état du moteur de jeu), ou null
//   app.screen   'menu' | 'run' | 'end'
//   app.ui       petits réglages d'écran (cible choisie, onglet ouvert...)
// Ce fichier n'importe AUCUN écran, pour éviter les dépendances circulaires.

import { h, clear, mount } from './dom.js';
import { icon } from './icons.js';

export const app = {
  content: null,
  store: null,
  gateway: null,
  profile: null,
  run: null,
  screen: 'menu',
  ui: {},
  busy: false,
  modal: null,
  timer: null, // minuteur du tour en cours (voir controller.js)
  trainingSetup: null, // réglages de la salle d'entraînement en cours
  unlocked: [], // succès débloqués à la fin de la dernière run (pour l'écran de fin)
  root: null,
  render: () => {} // remplacé par shell.js
};

/** Enregistre les préférences (et, en jeu local, les personnages) : son, minuteur, dernière équipe... */
export function persistProfile() {
  app.gateway?.savePrefs();
}

// ---------------- Messages ----------------

let toastTimer = null;
export function toast(message, tone = 'info') {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.className = `toast show tone-${tone}`;
  box.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 3200);
}

// ---------------- Fenêtres (modales) ----------------

/**
 * Ouvre une fenêtre par-dessus l'écran.
 * `render(api)` doit renvoyer le contenu (élément ou tableau). Elle est rappelée
 * à chaque `api.refresh()` pour rester à jour quand la partie change.
 */
export function openModal({ title, wide = false, className = '', render, onClose }) {
  closeModal();
  const body = h('div', { class: 'modal-body' });
  const api = {
    body,
    close: () => closeModal(),
    refresh: () => mount(body, render(api))
  };
  const box = h('div', { class: `modal ${wide ? 'wide' : ''} ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' },
      h('h2', null, title),
      h('button', { class: 'btn btn-icon btn-ghost', 'aria-label': 'Fermer', onClick: () => closeModal() }, icon('close', 18))),
    body);
  const overlay = h('div', { class: 'modal-overlay', onClick: (e) => e.target === overlay && closeModal() }, box);
  document.body.append(overlay);
  app.modal = { overlay, api, onClose };
  api.refresh();
  return api;
}

export function closeModal() {
  if (!app.modal) return;
  const { overlay, onClose } = app.modal;
  app.modal = null;
  overlay.remove();
  if (onClose) onClose();
}

/** Remet à jour la fenêtre ouverte (appelé après chaque changement d'état). */
export function refreshModal() {
  if (app.modal) app.modal.api.refresh();
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // S'il y a une confirmation ouverte, Échap ne ferme qu'elle (pas la fenêtre dessous).
  if (document.querySelector('.confirm-layer')) return;
  closeModal();
});

/**
 * Boîte de confirmation, posée PAR-DESSUS la fenêtre ouverte (qui reste en place).
 * Renvoie une promesse : true si l'utilisateur confirme, false sinon.
 */
export function confirmBox({ title, text, okLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (value) => {
      if (answered) return;
      answered = true;
      document.removeEventListener('keydown', onKey);
      layer.remove();
      resolve(value);
    };
    const onKey = (e) => e.key === 'Escape' && done(false);
    const box = h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title)),
      h('div', { class: 'modal-body' },
        h('p', { class: 'confirm-text' }, text),
        h('div', { class: 'row end gap' },
          h('button', { class: 'btn', onClick: () => done(false) }, 'Annuler'),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => done(true) }, okLabel))));
    const layer = h('div', { class: 'modal-overlay confirm-layer', onClick: (e) => e.target === layer && done(false) }, box);
    document.body.append(layer);
    document.addEventListener('keydown', onKey);
  });
}
