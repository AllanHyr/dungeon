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

/**
 * Place une bulle près de ce qu'elle montre, mais JAMAIS sur un combattant, un sort, un bouton ou une case du plateau (on doit pouvoir
 * jouer en la lisant) : on essaie au-dessus, en dessous, puis dans les coins du champ de bataille et de l'écran, et on garde la première place libre.
 */
function placeBubble(root, bubble, target) {
  requestAnimationFrame(() => {
    if (!bubble.isConnected) return;
    const r = target.getBoundingClientRect(), b = bubble.getBoundingClientRect();
    const m = 10, W = window.innerWidth, H = window.innerHeight;
    const stage = root.querySelector('.stage')?.getBoundingClientRect();
    const center = r.left + r.width / 2 - b.width / 2;
    const spots = [[center, r.top - b.height - m], [center, r.bottom + m], [r.right + m, r.top], [r.left - b.width - m, r.top]];
    if (stage) spots.push([stage.right - b.width - m, stage.top + m], [stage.left + m, stage.top + m], [stage.right - b.width - m, stage.bottom - b.height - m], [stage.left + m, stage.bottom - b.height - m]);
    spots.push([W - b.width - m, H - b.height - m], [m, H - b.height - m], [W - b.width - m, m]);
    const blockers = [...root.querySelectorAll('.fighter, .hotbar, .end-turn, .frise, .run .btn, .tile, .unit')]
      .filter((e) => e !== target && !bubble.contains(e)).map((e) => e.getBoundingClientRect()).filter((o) => o.width && o.height);
    const clamp = ([x, y]) => [Math.max(m, Math.min(W - b.width - m, x)), Math.max(m, Math.min(H - b.height - m, y))];
    const overlaps = ([x, y]) => blockers.some((o) => x < o.right && x + b.width > o.left && y < o.bottom && y + b.height > o.top);
    const free = spots.map(clamp).find((p) => !overlaps(p)) || clamp(spots[0]);
    bubble.style.left = `${free[0]}px`;
    bubble.style.top = `${free[1]}px`;
  });
}

// ------------------------------------------------------------ Les cases du plateau
// La PREMIÈRE fois qu'on tombe sur un type de case, une bulle dit à quoi elle sert (une seule fois ; « Plus de conseils » les coupe toutes).
// Ce qui a déjà été vu : profile.settings.coachTiles (une liste de types de cases ; '*' = plus aucun conseil).
export const TILE_TIPS = {
  board: ['Le plateau', 'Chaque tour, le héros « sous les projecteurs » avance d\'une case. Les cases restent cachées (?) jusqu\'à ce qu\'on y arrive ; le boss attend au bout. À gauche ton équipe et ses sacs, à droite le journal.'],
  combat: ['Une rencontre', 'Avant le combat, un D20 décide qui frappe en premier. Vaincre les monstres rapporte de l\'XP (gagnée à la fin du donjon) et parfois un objet.'],
  treasure: ['Un coffre', 'Le D20 décide de la qualité du butin : plus il est haut, mieux c\'est. Un 20 donne deux objets... un 1 déclenche un piège.'],
  trap: ['Un piège', 'Un jet de sauvegarde pour l\'éviter. Raté, le héros perd des PV.'],
  xp_fountain: ['Une fontaine d\'expérience', 'Boire rapporte de l\'XP à tout le groupe... sauf si l\'eau est empoisonnée (5 ou moins au dé).'],
  life_fountain: ['Une fontaine de vie', 'Rare et précieuse : elle soigne, et peut même ramener un héros tombé... si l\'eau n\'est pas souillée.'],
  low_blow: ['Le coup bas', 'Jouer un sale tour à un allié pour un petit gain, ou passer un pacte avec les ombres. Rien n\'oblige : on peut rester honnête.'],
  merchant: ['Le marchand', 'Un jet de marchandage fixe les prix, puis chacun achète avec l\'or de la partie. L\'or qui reste est perdu à la fin du donjon : dépense-le !'],
  camp: ['Le feu de camp', 'Chaque héros peut changer ses sorts équipés, acheter des potions au colporteur avec l\'or de la run, puis choisir une activité : se reposer, affûter ses armes ou monter la garde.'],
  boss: ['Le boss', 'Le dernier combat. Le vaincre termine le donjon : tes héros gardent alors leur XP et leur butin.']
};

const seenTiles = () => app.profile.settings.coachTiles || [];
const markTile = (key) => {
  app.profile.settings.coachTiles = [...new Set([...seenTiles(), key])];
  persistProfile();
  document.querySelector('.coach')?.remove();
  document.querySelectorAll('.coach-target').forEach((e) => e.classList.remove('coach-target'));
};

/** À appeler après chaque dessin de l'écran de partie (hors combat) : la bulle de la case, la première fois. */
export function tileCoach(root) {
  const run = app.run;
  if (!run || run.training || run.farm || run.combat || seenTiles().includes('*')) return;
  if (root.querySelector('.coach')) return;
  const tile = run.dungeon?.board?.[run.dungeon.position];
  // le plateau d'abord (la toute première « Avancer »), puis la case sur laquelle on vient d'arriver
  const key = run.pending?.kind === 'advance' && !seenTiles().includes('board') ? 'board' : run.pending?.kind !== 'advance' && tile && !tile.resolved ? tile.type : null;
  if (!key || !TILE_TIPS[key] || seenTiles().includes(key)) return;
  const target = key === 'board' ? root.querySelector('.board') : root.querySelector('.tile-card');
  if (!target) return;
  const [title, text] = TILE_TIPS[key];
  target.classList.add('coach-target');
  const bubble = h('div', { class: 'coach coach-tile', role: 'dialog', 'aria-label': `Conseil : ${title}` },
    h('div', { class: 'coach-count' }, 'Première fois'),
    h('b', { class: 'coach-title' }, title),
    h('p', { class: 'coach-text' }, text),
    h('div', { class: 'coach-actions' },
      h('button', { type: 'button', class: 'btn btn-small btn-ghost coach-skip', onClick: () => markTile('*') }, 'Plus de conseils'),
      h('button', { type: 'button', class: 'btn btn-small btn-primary coach-next', onClick: () => markTile(key) }, 'Compris !')));
  root.appendChild(bubble);
  placeBubble(root, bubble, target);
}

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
  placeBubble(root, bubble, target);
}
