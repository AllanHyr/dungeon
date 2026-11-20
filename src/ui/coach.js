// ============================================================
//  coach.js — Le premier combat guidé
// ============================================================
// La toute première fois qu'un de ses héros joue en combat, le joueur voit cinq bulles, l'une après l'autre : l'ordre de jeu,
// le champ de bataille, les points d'action, les sorts (et la bande de dé), la fin du tour. Chaque bulle montre l'endroit
// dont elle parle (cadre rouge) ; « Suivant » passe à la bulle d'après, « Passer le guide » le ferme pour de bon.
// Une fois vu (ou passé), le guide ne revient plus : profile.settings.coachCombat = true (gardé en ligne aussi).
// La bulle ne bloque jamais le jeu : seuls ses deux boutons captent la souris, on peut jouer en la lisant.

import { h } from './dom.js';
import { app, persistProfile } from './state.js';

export const COACH_STEPS = [
  { sel: '.frise', title: "L'ordre de jeu", text: 'Chacun joue à son tour, de gauche à droite. Le portrait encadré de rouge, c\'est celui qui joue maintenant.' },
  { sel: '.stage', title: 'Le champ de bataille', text: 'En haut les monstres, en bas tes héros. Au-dessus d\'un monstre, une étiquette dit ce qu\'il fera à son prochain tour : prépare-toi !' },
  { sel: '.dock .flames', title: "Tes points d'action", text: 'Chaque sort coûte des points d\'action (les flammes). Tu peux en lancer plusieurs dans le même tour, tant qu\'il t\'en reste.' },
  { sel: '.hotbar', title: 'Tes sorts', text: 'Clique un sort (ou appuie sur son chiffre), puis clique une cible en vert. La petite bande sous chaque sort montre ses risques au dé : rouge = échec critique, doré = critique.' },
  { sel: '.end-turn', title: 'Finir son tour', text: 'Plus de points d\'action, ou plus rien d\'utile à faire ? Termine ton tour : le suivant dans l\'ordre de jeu prend la main.' }
];

const finish = () => {
  app.profile.settings.coachCombat = true;
  app.ui.coachStep = 0;
  persistProfile();
  document.querySelectorAll('.coach-target').forEach((e) => e.classList.remove('coach-target'));
  document.querySelector('.coach')?.remove();
};

/** À appeler après chaque dessin de l'écran de partie : pose la bulle du guide si c'est le moment. */
export function combatCoach(root) {
  const run = app.run;
  if (!run || run.training || app.profile.settings.coachCombat) return;
  if (!root.querySelector('.dock.action-card:not(.spectator)')) return; // (seulement quand un de MES héros joue)
  const index = Math.min(app.ui.coachStep || 0, COACH_STEPS.length - 1);
  const step = COACH_STEPS[index];
  const target = root.querySelector(step.sel);
  if (!target) return;
  target.classList.add('coach-target');
  const last = index === COACH_STEPS.length - 1;
  const bubble = h('div', { class: 'coach', role: 'dialog', 'aria-label': `Guide du combat : ${step.title}` },
    h('div', { class: 'coach-count' }, `Premier combat · ${index + 1} / ${COACH_STEPS.length}`),
    h('b', { class: 'coach-title' }, step.title),
    h('p', { class: 'coach-text' }, step.text),
    h('div', { class: 'coach-actions' },
      h('button', { type: 'button', class: 'btn btn-small btn-ghost coach-skip', onClick: finish }, 'Passer le guide'),
      h('button', {
        type: 'button', class: 'btn btn-small btn-primary coach-next',
        onClick: () => {
          if (last) return finish();
          app.ui.coachStep = index + 1;
          app.render();
        }
      }, last ? 'Compris !' : 'Suivant')));
  root.appendChild(bubble);
  // La bulle se place près de ce qu'elle montre, mais JAMAIS sur un combattant, un sort ou « Fin du tour » (on doit pouvoir jouer en la lisant) :
  // on essaie au-dessus, en dessous, puis dans les coins du champ de bataille, et on garde la première place libre.
  const place = () => {
    if (!bubble.isConnected) return;
    const r = target.getBoundingClientRect(), b = bubble.getBoundingClientRect();
    const m = 10, W = window.innerWidth, H = window.innerHeight;
    const stage = root.querySelector('.stage')?.getBoundingClientRect();
    const center = r.left + r.width / 2 - b.width / 2;
    const spots = [[center, r.top - b.height - m], [center, r.bottom + m]];
    if (stage) spots.push([stage.right - b.width - m, stage.top + m], [stage.left + m, stage.top + m], [stage.right - b.width - m, stage.bottom - b.height - m], [stage.left + m, stage.bottom - b.height - m]);
    const blockers = [...root.querySelectorAll('.fighter, .hotbar, .end-turn, .frise')].filter((e) => e !== target).map((e) => e.getBoundingClientRect());
    const clamp = ([x, y]) => [Math.max(m, Math.min(W - b.width - m, x)), Math.max(m, Math.min(H - b.height - m, y))];
    const overlaps = ([x, y]) => blockers.some((o) => x < o.right && x + b.width > o.left && y < o.bottom && y + b.height > o.top);
    const free = spots.map(clamp).find((p) => !overlaps(p)) || clamp(spots[0]);
    bubble.style.left = `${free[0]}px`;
    bubble.style.top = `${free[1]}px`;
  };
  requestAnimationFrame(place);
}
