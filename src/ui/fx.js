// ============================================================
//  fx.js — Les animations de combat : on REJOUE chaque coup avant d'afficher le résultat
// ============================================================
// Quand le moteur répond à une action, l'écran affiche d'habitude tout de suite l'état final. Ici, on joue d'abord l'action sur l'ANCIEN
// écran, coup par coup : le lanceur s'élance ou charge son sort, le projectile part, l'impact éclate, la cible recule, le chiffre s'envole,
// la barre de vie descend, le monstre s'effondre. Puis l'écran est redessiné avec le résultat (qui est déjà celui qu'on vient de voir).
//
//   fx-plan.js    découpe les événements en « temps forts » et dit comment chacun se montre (pur, testé sans navigateur)
//   fx-canvas.js  les particules (étincelles, entailles, projectiles, lumière...) sur un calque transparent
//   fx.js         (ici) le chef d'orchestre : où sont les unités à l'écran, comment les faire bouger, quand jouer quel son
//
// Trois réglages (profil > Animations) : « complètes », « rapides » (même chose, deux fois plus vite) et « réduites » (les chiffres,
// les barres et les sons, sans mouvement : c'est aussi le réglage choisi d'office par un système qui demande « moins d'animations »).
// Un clic ou une touche pendant l'animation la saute.

import { h } from './dom.js';
import { icon } from './icons.js';
import { play as sfx } from './sound.js';
import { skillIconName } from './format.js';
import * as cv from './fx-canvas.js';
const rand = cv.rand;
import { planBeats, startState, targetsOf } from './fx-plan.js';

// ---------------- Réglages et état ----------------

let mode = 'full'; // full | fast | min
let skipping = false;
let running = false;
const sleepers = new Set();
const live = new Set(); // animations Web en cours (pour « passer »)
const poses = new Set(); // animations qui gardent une pose (annulées à la fin de chaque coup)
const kept = new Set(); // poses à garder jusqu'à la fin de l'action (un monstre mort reste mort pendant les coups suivants)

export function setMode(m) {
  mode = ['full', 'fast', 'min'].includes(m) ? m : 'full';
}
export const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** Le réglage qui s'applique vraiment : celui du joueur, ou « réduit » si son système le demande et qu'il n'a rien choisi. */
export function resolveMode(setting) {
  return ['full', 'fast', 'min'].includes(setting) ? setting : reduceMotion() ? 'min' : 'full';
}
export const isReplaying = () => running;
const dbg = (...a) => { if (globalThis.__fxDebug) console.log('[fx]', ...a); }; // (pour comprendre une animation qui ne se termine pas : window.__fxDebug = true)

const speed = () => (mode === 'fast' ? 0.55 : mode === 'min' ? 0.3 : 1);

function sleep(ms) {
  if (skipping || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      sleepers.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms * speed());
    sleepers.add(done);
  });
}

/** Saute ce qui reste de l'animation : tout se termine tout de suite. */
export function skip() {
  if (!running) return;
  skipping = true;
  for (const done of [...sleepers]) done();
  for (const a of [...live]) {
    try { a.finish(); } catch { /* animation déjà finie */ }
  }
  cv.clearEffects();
}

/** Lance une animation Web et attend sa fin. `hold` : garde la pose finale (à défaire avec cleanPoses). */
function move(el, keyframes, ms, { easing = 'ease-out', hold = false, keep = false, delay = 0 } = {}) {
  if (!el || !el.animate || skipping || mode === 'min') return Promise.resolve();
  const a = el.animate(keyframes, { duration: Math.max(1, ms * speed()), easing, fill: hold || keep ? 'forwards' : 'none', delay: delay * speed() });
  live.add(a);
  if (keep) kept.add(a);
  else if (hold) poses.add(a);
  return a.finished.catch(() => {}).finally(() => live.delete(a));
}
function cleanPoses(all = false) {
  for (const set of all ? [poses, kept] : [poses]) {
    for (const a of set) {
      try { a.cancel(); } catch { /* rien */ }
    }
    set.clear();
  }
  for (const el of document.querySelectorAll('.f-medal[style*="z-index"], .fighter[style*="z-index"]')) el.style.zIndex = '';
}

// ---------------- Où sont les unités ? ----------------

/** Le médaillon d'une unité à l'écran (champ de bataille, sinon colonne d'équipe) : sa position, sa taille. */
function anchorOf(id) {
  if (!id) return null;
  const els = [...document.querySelectorAll(`[data-unit="${CSS.escape(id)}"]`)];
  const el = els.find((e) => e.classList.contains('fighter')) || els.find((e) => e.classList.contains('unit')) || els[0];
  if (!el) return null;
  const medal = el.querySelector('.f-medal') || el.querySelector('.portrait') || el;
  const r = medal.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { id, el, medal, x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(16, Math.min(r.width, r.height) / 2), top: r.top };
}

/** Où l'oreille place un son venu de cette unité : à gauche ou à droite selon sa place à l'écran. */
const panOf = (a) => (a ? Math.max(-0.85, Math.min(0.85, (a.x / (window.innerWidth || 1) - 0.5) * 1.5)) : 0);

const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
const norm = (x, y) => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d, d };
};

// ---------------- Le calque des textes ----------------

let domLayer = null;
function layer() {
  if (!domLayer || !domLayer.isConnected) {
    domLayer = h('div', { id: 'fx-dom', 'aria-hidden': 'true' });
    document.body.append(domLayer);
  }
  return domLayer;
}

const stacks = new Map(); // combien de chiffres viennent d'apparaître sur cette unité (on les empile)
function stackIndex(id) {
  const now = performance.now();
  const s = stacks.get(id);
  const n = s && now - s.t < 650 ? s.n + 1 : 0;
  stacks.set(id, { n, t: now });
  return n;
}

/** Un chiffre qui jaillit, monte en arc et s'éteint. kind : dmg · crit · heal · shield · miss · info · poison */
function number(a, text, kind, { big = 1, delay = 0, dx = 0 } = {}) {
  if (!a) return;
  const stack = stackIndex(a.id);
  const el = h('div', { class: `fx-num ${kind}` }, text);
  el.style.left = `${a.x + dx + (stack % 2 ? 14 : -14) * Math.min(stack, 1)}px`;
  el.style.top = `${a.y - a.r * 0.35 - stack * 26}px`;
  el.style.fontSize = `${Math.round(26 * big)}px`;
  layer().append(el);
  if (mode === 'min') {
    el.animate([{ opacity: 0, transform: 'translate(-50%, -50%)' }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7, transform: 'translate(-50%, -80%)' }, { opacity: 0, transform: 'translate(-50%, -110%)' }], { duration: 900, delay }).finished.finally(() => el.remove());
    return;
  }
  const drift = (Math.random() - 0.5) * 60;
  const rise = kind === 'crit' ? 96 : 76;
  const anim = el.animate([
    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.3)' },
    { opacity: 1, transform: `translate(-50%, -50%) translate(${drift * 0.2}px, -14px) scale(${kind === 'crit' ? 1.6 : 1.3})`, offset: 0.13 },
    { opacity: 1, transform: `translate(-50%, -50%) translate(${drift * 0.5}px, ${-rise * 0.55}px) scale(1)`, offset: 0.32 },
    { opacity: 1, transform: `translate(-50%, -50%) translate(${drift * 0.8}px, ${-rise * 0.8}px) scale(0.96)`, offset: 0.72 },
    { opacity: 0, transform: `translate(-50%, -50%) translate(${drift}px, ${-rise}px) scale(0.9)` }
  ], { duration: (kind === 'crit' ? 1500 : 1200) * (mode === 'fast' ? 0.8 : 1), delay, easing: 'ease-out', fill: 'backwards' });
  anim.finished.catch(() => {}).finally(() => el.remove());
}

/**
 * Le fil du butin : en bas à gauche de l'écran, une petite carte par objet ramassé (« Thorne · Lame cryptique · Rare »), dans la couleur de
 * sa rareté. Elles s'empilent et s'effacent seules au bout de quelques secondes : rien à cliquer, rien qui bloque la partie.
 */
function lootFeed(def, rarity, content, heroId) {
  let box = document.getElementById('loot-feed');
  if (!box) {
    box = h('div', { id: 'loot-feed', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const hero = document.querySelector(`[data-unit="${CSS.escape(heroId || '')}"] .unit-name, [data-unit="${CSS.escape(heroId || '')}"] .f-name`)?.textContent || '';
  const rar = content?.rarities?.find((r) => r.id === rarity);
  const card = h('div', { class: `loot-toast r-${rarity}` }, icon('gift', 16), h('span', null, hero ? `${hero} · ` : '', h('b', null, def.name)), rar ? h('small', null, rar.name) : null);
  box.prepend(card);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 400); }, 4200);
}

/** Le nom de la compétence, au-dessus de celui qui la lance. */
function skillLabel(a, beat, content) {
  if (!a) return;
  const def = content?.skills?.[beat.skillId];
  const crit = beat.outcome === 'crit';
  const fumble = beat.outcome === 'fumble';
  const ic = def ? skillIconName(content, def) : null;
  const el = h('div', { class: `fx-label ${crit ? 'crit' : ''} ${fumble ? 'fumble' : ''} ${beat.casterKind === 'monster' ? 'foe' : ''}` },
    ic ? icon(ic, 16) : null,
    h('span', null, beat.style.name),
    beat.total !== null && beat.total !== undefined ? h('b', { class: 'fx-label-roll', title: 'Jet de dé' }, icon('d20', 13), beat.total) : null,
    crit ? h('em', null, 'Critique !') : fumble ? h('em', null, 'Raté !') : null);
  layer().append(el);
  const y = Math.max(16, a.top - 20);
  el.style.left = `${Math.max(70, Math.min(window.innerWidth - 70, a.x))}px`;
  el.style.top = `${y}px`;
  const anim = el.animate([
    { opacity: 0, transform: 'translate(-50%, -30%) scale(0.8)' },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1.06)', offset: 0.14 },
    { opacity: 1, transform: 'translate(-50%, -56%) scale(1)', offset: 0.78 },
    { opacity: 0, transform: 'translate(-50%, -90%) scale(1)' }
  ], { duration: mode === 'min' ? 900 : 1250 * (mode === 'fast' ? 0.75 : 1), easing: 'ease-out' });
  anim.finished.catch(() => {}).finally(() => el.remove());
}

// ---------------- Barres de vie ----------------

const pct = (v, total) => Math.max(0, Math.min(100, (v / total) * 100));

/** Met à jour la barre de vie d'une unité à l'écran : elle glisse, avec une traînée claire derrière quand on perd des PV. */
function setBar(id, st) {
  if (!st) return;
  for (const bar of document.querySelectorAll(`[data-unit="${CSS.escape(id)}"] .hpbar`)) {
    const total = Math.max(st.max, st.hp + st.shield) || 1;
    const hp = pct(st.hp, total);
    const sh = Math.max(0, Math.min(100 - hp, (st.shield / total) * 100));
    const fill = bar.querySelector('.hpfill');
    if (fill) {
      const was = parseFloat(fill.style.width) || 0;
      if (mode !== 'min' && !skipping && hp < was - 0.5) {
        let ghost = bar.querySelector('.hpghost');
        if (!ghost) {
          ghost = h('div', { class: 'hpghost' });
          bar.insertBefore(ghost, bar.firstChild);
        }
        ghost.style.transition = 'none';
        ghost.style.width = `${was}%`;
        void ghost.offsetWidth;
        ghost.style.transition = 'width 0.55s ease-out 0.32s';
        ghost.style.width = `${hp}%`;
      }
      fill.style.width = `${hp}%`;
      const ratio = st.max > 0 ? st.hp / st.max : 0;
      fill.classList.toggle('low', ratio < 0.3);
      fill.classList.toggle('mid', ratio >= 0.3 && ratio < 0.6);
    }
    let shield = bar.querySelector('.shfill');
    if (st.shield > 0) {
      if (!shield) {
        shield = h('div', { class: 'shfill' });
        bar.append(shield);
      }
      shield.style.left = `${hp}%`;
      shield.style.width = `${sh}%`;
    } else shield?.remove();
    const text = bar.querySelector('.hptext');
    if (text) text.textContent = st.shield ? `${st.hp} +${st.shield} / ${st.max}` : `${st.hp} / ${st.max}`;
    bar.title = `${st.hp} / ${st.max} PV${st.shield ? ` + ${st.shield} de bouclier` : ''}`;
  }
}

// ---------------- Mouvements de médaillons ----------------

/** La cible encaisse : un recul dans le sens du coup, un éclat blanc, un petit ressort. */
function recoil(a, dir, mag, crit) {
  if (!a) return Promise.resolve();
  const k = Math.min(30, 8 + 5 * mag + (crit ? 8 : 0));
  const kx = Math.cos(dir) * k;
  const ky = Math.sin(dir) * k;
  return move(a.medal, [
    { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' },
    { transform: `translate(${kx}px, ${ky}px) scale(0.88, 1.1)`, filter: 'brightness(2.8) saturate(0.2)', offset: 0.14 },
    { transform: `translate(${kx * 0.4}px, ${ky * 0.4}px) scale(1.06, 0.95)`, filter: 'brightness(1.5)', offset: 0.4 },
    { transform: `translate(${-kx * 0.14}px, ${-ky * 0.14}px) scale(0.99)`, filter: 'brightness(1.1)', offset: 0.68 },
    { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' }
  ], 360, { easing: 'cubic-bezier(.2,.7,.3,1)' });
}

/** L'écran entier tressaute (coups lourds, critiques). */
function shake(amount) {
  if (mode === 'min' || mode === 'fast' && amount < 6) return;
  const el = document.querySelector('.stage') || document.querySelector('.run');
  if (!el) return;
  const frames = [{ transform: 'translate(0,0)' }];
  for (let i = 1; i <= 7; i++) {
    const k = (1 - i / 8) * amount;
    frames.push({ transform: `translate(${(i % 2 ? 1 : -1) * k}px, ${(i % 3 ? -1 : 1) * k * 0.6}px)` });
  }
  frames.push({ transform: 'translate(0,0)' });
  move(el, frames, 280, { easing: 'linear' });
}

/** L'unité « arme » son geste : elle se ramasse avant de frapper. */
async function windup(a, v, ms = 110) {
  if (!a) return;
  const pose = `translate(${-v.x * 10}px, ${-v.y * 10}px) scale(0.9)`;
  a.medal.style.zIndex = '45';
  await move(a.medal, [{ transform: 'translate(0,0) scale(1)' }, { transform: pose }], ms, { hold: true });
}

// ---------------- Les impacts ----------------

function hitFx(hit, a, dir, mag, crit, element) {
  const { x, y, r } = a;
  const n = Math.round(12 + 5 * mag);
  const speed = 560 + 110 * mag;
  const side = Math.random() < 0.5 ? 1 : -1;
  // Tout coup commence par un éclair net et quelques rayons : c'est ce qui fait « sentir » l'impact.
  const pop = (k = 1.5, alpha = 1) => {
    cv.flash(x, y, { r: r * k, element, alpha, dur: 0.2 });
    cv.starburst(x, y, { rays: 7, len: r * (1.2 + 0.25 * mag), w: 3.2, element, dur: 0.2 });
  };
  switch (hit) {
    case 'pierce':
      pop(1.3);
      cv.stab(x, y, { dir, len: r * (3 + 0.5 * mag), width: 8 + 2 * mag, element, dur: 0.26 });
      cv.sparks(x, y, { n, angle: dir, spread: 1.0, speed, life: 0.3, gravity: 260, drag: 2.6, element });
      if (crit) cv.stab(x, y, { dir: dir + 0.55 * side, len: r * 3.2, width: 9, element, dur: 0.3 });
      break;
    case 'smash':
      pop(2.1);
      cv.ring(x, y + r * 0.55, { r0: r * 0.3, r1: r * 2.3, w: 10, element: 'dust', squash: 0.4, dur: 0.46 });
      cv.ring(x, y, { r0: r * 0.2, r1: r * 1.7, w: 6, element, dur: 0.3 });
      cv.dust(x, y + r * 0.6, { n: 10, r: r * 0.6, alpha: 0.55 });
      cv.sparks(x, y, { n: n + 8, spread: 3.0, angle: dir, speed: speed + 120, gravity: 820, drag: 1.8, life: 0.5, size: 2.8, element });
      break;
    case 'claw':
      pop(1.6, 0.95);
      cv.claws(x, y, { dir, size: r * 1.3, element, width: 8 });
      cv.sparks(x, y, { n: Math.round(n * 0.8), angle: dir, spread: 1.7, speed, life: 0.28, gravity: 300, drag: 2.8, element });
      break;
    case 'bite':
      pop(1.6, 0.95);
      cv.slash(x, y - r * 0.4, { dir: Math.PI / 2, size: r * 1.3, sweep: 1.4, width: 12, element: 'physical', dur: 0.24, flip: false, tilt: 0.2 });
      cv.slash(x, y + r * 0.4, { dir: -Math.PI / 2, size: r * 1.3, sweep: 1.4, width: 12, element: 'physical', dur: 0.24, flip: false, tilt: -0.2 });
      cv.sparks(x, y, { n, spread: 2.6, speed: speed * 0.8, life: 0.34, gravity: 420, element: element === 'physical' ? 'blood' : element });
      break;
    case 'blast':
      pop(2.0);
      cv.ring(x, y, { r0: r * 0.35, r1: r * (2.0 + 0.3 * mag), w: 8, element, dur: 0.4 });
      cv.sparks(x, y, { n: n + 6, spread: Math.PI * 2, speed: speed * 0.85, gravity: 160, drag: 2.2, life: 0.4, element });
      if (element === 'holy' || crit) cv.starburst(x, y, { rays: 8, len: r * 2.6, w: 6, element, dur: 0.36 });
      break;
    case 'splat':
      pop(1.2, 0.8);
      cv.sparks(x, y, { n: 16, spread: Math.PI * 2, speed: 340, gravity: 980, size: 4, drag: 0.8, life: 0.55, element });
      cv.dust(x, y, { element, n: 5, r: r * 0.6, alpha: 0.5, rise: 8 });
      break;
    case 'sonic':
      for (let i = 0; i < 3; i++) cv.later(i * 0.09, () => cv.ring(x, y, { r0: r * 0.3, r1: r * (1.5 + i * 0.4), w: 6 - i, element, dur: 0.36 }));
      cv.flash(x, y, { r: r * 1.0, element, alpha: 0.6, dur: 0.25 });
      break;
    case 'drain':
      pop(1.2, 0.85);
      cv.slash(x, y, { dir, size: r * 1.3, width: 12, element: 'blood', sweep: 1.5 });
      cv.sparks(x, y, { n, angle: dir + Math.PI, spread: 1.4, speed: speed * 0.7, life: 0.35, element: 'blood' });
      break;
    case 'slash':
    default:
      pop(1.5);
      cv.slash(x, y, { dir, size: r * 1.5, width: 11 + 4 * mag, element, sweep: 1.7, dur: 0.32, tilt: side * rand(0.7, 1.1) });
      cv.sparks(x, y, { n, angle: dir, spread: 1.9, speed, life: 0.34, gravity: 320, drag: 2.8, element });
      if (crit) cv.slash(x, y, { dir, size: r * 1.6, width: 13, element, sweep: 1.7, dur: 0.34, tilt: -side * rand(0.7, 1.1) });
  }
  if (crit) {
    cv.starburst(x, y, { rays: 12, len: r * 3.4, w: 7, element: 'holy', dur: 0.44 });
    cv.screenFlash({ element: 'holy', alpha: 0.22, dur: 0.24 });
  }
}

const HIT_SOUND = { slash: 'hit_slash', pierce: 'hit_pierce', smash: 'hit_smash', claw: 'hit_claw', bite: 'hit_bite', blast: 'hit_blast', splat: 'hit_splat', sonic: 'hit_sonic', drain: 'hit_drain' };

// ---------------- Un effet (une étape du scénario) ----------------

async function damageStep(step, a, ctx) {
  const { style, casterA, beat } = ctx;
  const crit = beat?.outcome === 'crit';
  const total = (step.amount || 0) + (step.absorbed || 0);
  const ratio = step.before ? total / Math.max(1, step.before.max) : 0.2;
  const heavy = ratio > 0.22 || (style.weight || 2) >= 3;
  const mag = (style.weight || 2) * (crit ? 1.4 : 1) * (heavy ? 1.12 : 1);
  const element = ctx.element || style.element || 'physical';
  const hit = ctx.hit || style.hit || 'slash';
  const dir = casterA && a && casterA.id !== a.id ? angleOf(casterA, a) : Math.PI / 2;
  const blocked = (step.amount || 0) === 0 && (step.absorbed || 0) > 0;

  if (a && mode !== 'min' && !ctx.pixelOnly) hitFx(hit, a, dir, mag, crit, element); // (un effet sur la durée a déjà joué son animation en pixels)
  const pan = panOf(a);
  sfx(blocked ? 'block' : HIT_SOUND[hit] || 'hit_slash', { element, vol: 0.8 + 0.1 * mag, pan });
  if (crit) sfx('crit_hit', { pan });
  if (heavy || crit) shake(crit ? 11 : 7);
  await sleep(crit ? 110 : heavy ? 70 : 40); // l'arrêt sur image : le coup « pèse »
  if (!a) return;
  const rec = recoil(a, dir, mag, crit);
  if ((step.amount || 0) > 0) number(a, `${step.amount}${crit ? '!' : ''}`, crit ? 'crit' : 'dmg', { big: Math.min(1.7, 0.95 + ratio * 1.6) * (crit ? 1.15 : 1) });
  if ((step.absorbed || 0) > 0) number(a, blocked ? `Bloqué ${step.absorbed}` : `(${step.absorbed})`, 'shield', { big: 0.85, delay: 90 });
  setBar(step.target, step.after);
  await rec;
}

async function healStep(step, a, ctx) {
  if (!a) return;
  const element = ctx.element || ctx.style?.element || 'heal';
  const green = element === 'shadow' ? 'shadow' : 'heal';
  if (mode !== 'min' && !ctx.pixelOnly) {
    cv.flash(a.x, a.y, { r: a.r * 2.4, element: green, alpha: 0.7, dur: 0.6 });
    cv.rise(a.x, a.y + a.r * 0.4, { kind: element === 'nature' ? 'leaf' : 'plus', element: element === 'nature' ? 'nature' : green, n: 12, spread: a.r * 0.9, height: a.r * 2.2, size: 9 });
    cv.ring(a.x, a.y + a.r * 0.6, { r0: a.r * 0.3, r1: a.r * 1.7, w: 5, element: green, squash: 0.4, dur: 0.6 });
    cv.ring(a.x, a.y + a.r * 0.6, { r0: a.r * 0.2, r1: a.r * 1.2, w: 3, element: green, squash: 0.4, dur: 0.5 });
  }
  sfx('heal', { vol: 0.85, pan: panOf(a) });
  if ((step.amount || 0) > 0) number(a, `+${step.amount}`, 'heal', { big: 1.05 });
  setBar(step.target, step.after);
  await sleep(240);
}

async function shieldStep(step, a) {
  if (!a) return;
  if (mode !== 'min') {
    cv.dome(a.x, a.y, { r: a.r * 1.5, element: 'shield', dur: 0.8 });
    cv.sparks(a.x, a.y, { n: 8, speed: 180, gravity: 0, element: 'shield', life: 0.5, drag: 2.4 });
  }
  sfx('shield', { pan: panOf(a) });
  number(a, `+${step.amount}`, 'shield', { big: 1.0 });
  setBar(step.target, step.after);
  await sleep(220);
}

async function deathStep(step, a) {
  if (!a) return;
  const monster = step.unitKind === 'monster';
  sfx(monster ? 'death_monster' : 'death_hero', { pan: panOf(a) });
  if (mode !== 'min') {
    cv.flash(a.x, a.y, { r: a.r * 2, element: monster ? 'blood' : 'frost', alpha: 0.8, dur: 0.4 });
    cv.dust(a.x, a.y + a.r * 0.3, { n: monster ? 12 : 8, r: a.r * 0.65, alpha: 0.55, dur: 0.9, element: monster ? 'dust' : 'frost' });
    cv.rise(a.x, a.y, { kind: monster ? 'dot' : 'star', element: monster ? 'blood' : 'frost', n: 9, spread: a.r * 0.8, height: a.r * 2.2, size: 5, dur: 1.1 });
    if (step.boss) {
      shake(14);
      cv.ring(a.x, a.y, { r0: a.r * 0.4, r1: a.r * 4, w: 10, element: 'blood', dur: 0.6 });
    }
  }
  await move(a.el, monster
    ? [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
        { transform: 'translate(-6px,0) scale(1.04)', filter: 'brightness(2.5)', offset: 0.1 },
        { transform: 'translate(6px,0) scale(1.04)', filter: 'brightness(2)', offset: 0.2 },
        { transform: 'translate(-4px,2px) scale(1)', filter: 'brightness(1.5)', offset: 0.3 },
        { transform: 'translate(0, 14px) scale(0.7) rotate(10deg)', opacity: 0.3, filter: 'grayscale(1) brightness(0.6)' }
      ]
    : [
        { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'brightness(1)' },
        { transform: 'translate(0,-6px) scale(1.06)', filter: 'brightness(2.2)', offset: 0.18 },
        { transform: 'translate(0, 8px) scale(0.92)', opacity: 0.55, filter: 'grayscale(0.8) brightness(0.8)' }
      ], 560, { keep: true, easing: 'ease-in' });
  setBar(step.target, step.after);
}

async function reviveStep(step, a) {
  if (!a) return;
  sfx('revive', { pan: panOf(a) });
  if (mode !== 'min') {
    cv.column(a.x, a.y, { w: a.r * 1.3, element: 'holy', dur: 1 });
    cv.rise(a.x, a.y + a.r, { kind: 'star', element: 'holy', n: 12, spread: a.r, height: a.r * 2.4, size: 6, dur: 1.1 });
    cv.flash(a.x, a.y, { r: a.r * 2, element: 'holy', alpha: 0.8, dur: 0.6 });
  }
  a.el.querySelector('.portrait')?.classList.remove('ghostly');
  number(a, 'Debout !', 'heal', { big: 1.05 });
  setBar(step.target, step.after);
  await sleep(500);
}

async function runStep(step, ctx) {
  const a = anchorOf(step.target);
  switch (step.type) {
    case 'damage': return damageStep(step, a, ctx);
    case 'heal': return healStep(step, a, ctx);
    case 'shield': return shieldStep(step, a);
    case 'death': return deathStep(step, a);
    case 'revive': return reviveStep(step, a);
    case 'status': // un bonus ou un malus vient d'être posé : on l'annonce au-dessus du combattant (« Poison », « Dégâts +15 % »)
      if (a && step.label) number(a, step.label, step.tone === 'debuff' ? 'debuff' : step.tone === 'buff' ? 'buff' : 'info', { big: 0.72 });
      return undefined;
    case 'loot': { // un objet ramassé : son nom monte au-dessus du héros, dans la couleur de sa rareté
      const def = ctx.content?.items?.[step.itemId];
      if (a && def) number(a, `+ ${def.name}`, `loot r-${step.rarity || 'common'}`, { big: 0.6, dx: a.r + 60 });
      if (def) lootFeed(def, step.rarity || 'common', ctx.content, step.target);
      sfx('loot', { pan: panOf(a) });
      return sleep(120);
    }
    case 'resource':
      if (a && mode !== 'min') cv.rise(a.x, a.y, { kind: 'star', element: 'holy', n: 3, spread: a.r * 0.5, height: a.r * 1.2, size: 5, dur: 0.6, soft: 0 });
      sfx('resource', { pan: panOf(a) });
      return undefined;
    default:
      return undefined;
  }
}

/** Joue les étapes d'un temps fort : une file par cible (les coups sur une même cible se suivent), les cibles se décalent un peu. */
async function runSteps(steps, ctx, stagger = 70) {
  const groups = new Map();
  for (const s of steps) {
    const key = s.target || '_';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  let i = 0;
  await Promise.all([...groups.values()].map(async (list) => {
    await sleep(stagger * i++);
    for (const s of list) await runStep(s, ctx);
  }));
}

// ---------------- Effets d'état (sans événement : le moteur ne les annonce pas) ----------------

const SUPPORT_SOUND = { stun: 'stun', poison: 'poison', roots: 'roots', buff: 'buff', haste: 'buff', debuff: 'debuff', taunt: 'taunt', guard: 'shield', rage: 'buff', cleanse: 'buff' };

function supportFx(kind, a, ctx) {
  if (!a) return;
  if (SUPPORT_SOUND[kind]) sfx(SUPPORT_SOUND[kind], { pan: panOf(a) });
  if (mode === 'min') return; // (mode réduit : le son, pas les images)
  const { x, y, r } = a;
  switch (kind) {
    case 'stun':
      cv.orbit(x, y - r * 0.85, { rx: r * 0.7, ry: r * 0.2, n: 3, dur: 1 });
      break;
    case 'poison':
      cv.rise(x, y + r * 0.2, { kind: 'drop', element: 'poison', n: 8, spread: r * 0.7, height: r * 1.5, size: 5, dur: 0.9, soft: 0.5 });
      break;
    case 'roots':
      cv.roots(x, y, { n: 6, h: r * 1.9, element: 'nature' });
      cv.dust(x, y + r * 0.7, { n: 6, r: r * 0.4, alpha: 0.4, element: 'dust' });
      cv.later(0.35, () => cv.orbit(x, y - r * 0.85, { rx: r * 0.7, ry: r * 0.2, n: 3, dur: 0.8 }));
      break;
    case 'buff':
    case 'haste':
      cv.rise(x, y + r * 0.5, { kind: 'up', element: kind === 'haste' ? 'arcane' : ctx.style.element === 'holy' ? 'holy' : 'heal', n: 8, spread: r * 0.8, height: r * 2.0, size: 10, dur: 0.95, soft: 0.2 });
      cv.ring(x, y + r * 0.6, { r0: r * 0.3, r1: r * 1.4, w: 4, element: kind === 'haste' ? 'arcane' : 'holy', squash: 0.4, dur: 0.6 });
      break;
    case 'debuff':
      cv.rise(x, y - r * 0.4, { kind: 'down', element: 'shadow', n: 7, spread: r * 0.75, height: r * 1.5, size: 7, dur: 0.95, down: true, soft: 0.25 });
      break;
    case 'taunt':
      cv.rise(x, y - r * 1.0, { kind: 'bang', element: 'blood', n: 1, spread: 2, height: r * 0.5, size: 20, dur: 0.9, soft: 0, stagger: 0 });
      cv.ring(x, y, { r0: r * 0.5, r1: r * 3, w: 6, element: 'blood', dur: 0.55 });
      cv.later(0.08, () => cv.ring(x, y, { r0: r * 0.3, r1: r * 2.2, w: 4, element: 'blood', dur: 0.5 }));
      break;
    case 'guard':
      cv.dome(x, y, { r: r * 1.5, element: 'shield', dur: 0.8 });
      break;
    case 'rage':
      cv.rise(x, y + r * 0.2, { kind: 'drop', element: 'blood', n: 10, spread: r * 0.8, height: r * 1.7, size: 5.5, dur: 0.9, soft: 0.3 });
      cv.ring(x, y, { r0: r * 0.4, r1: r * 1.7, w: 6, element: 'blood', dur: 0.45 });
      break;
    case 'cleanse':
      cv.rise(x, y, { kind: 'star', element: 'holy', n: 8, spread: r * 0.8, height: r * 1.6, size: 6, dur: 0.9 });
      break;
    default:
  }
}

// ---------------- Un temps fort : une compétence lancée ----------------

const CAST_SOUND = {
  melee: 'cast_swing', spin: 'cast_spin', smite: 'cast_charge', wave: 'cast_wave', self: 'cast_buff', ally: 'cast_heal', allies: 'cast_heal'
};
function castSound(style) {
  if (style.delivery === 'projectile') return { beam: 'cast_beam', arrow: 'cast_arrow', thorn: 'cast_arrow' }[style.shot] || 'cast_bolt';
  if (style.delivery === 'melee' && style.hit === 'pierce') return 'cast_pierce';
  if (style.delivery === 'melee' && style.hit === 'smash') return 'cast_heavy';
  return CAST_SOUND[style.delivery] || 'cast_swing';
}

/** L'élan : le lanceur fonce vers sa cible. Renvoie de quoi le ramener à sa place. */
async function dashTo(c, t, style) {
  const v = norm(t.x - c.x, t.y - c.y);
  const stop = (c.r + t.r) * (style.dash === 'long' ? 0.5 : 0.78);
  const travel = Math.max(0, v.d - stop);
  const dx = v.x * travel;
  const dy = v.y * travel;
  await windup(c, v, 110);
  if (style.dash === 'long') {
    cv.sparks(c.x, c.y, { n: 6, angle: Math.atan2(-v.y, -v.x), spread: 0.5, speed: 500, gravity: 0, element: style.element, life: 0.25, streak: 0.06 });
  }
  const from = `translate(${-v.x * 10}px, ${-v.y * 10}px) scale(0.9)`;
  await move(c.medal, [{ transform: from }, { transform: `translate(${dx}px, ${dy}px) scale(1.14)` }], style.dash === 'long' ? 120 : 150, { easing: 'cubic-bezier(.5,0,.9,.55)', hold: true });
  return { dx, dy, v };
}
async function retreat(c, pose) {
  if (!c || !pose) return;
  if (!pose.dx && !pose.dy) {
    // pas d'élan : le lanceur se détend d'un petit coup (la fin du geste de lancer)
    await move(c.medal, [{ transform: 'translate(0,0) scale(0.92)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'translate(0,0) scale(1)' }], 230, { easing: 'ease-out', hold: true });
    return;
  }
  await move(c.medal, [{ transform: `translate(${pose.dx}px, ${pose.dy}px) scale(1.14)` }, { transform: 'translate(0,0) scale(1)' }], 200, { easing: 'cubic-bezier(.3,.8,.4,1)', hold: true });
}

async function runCast(beat, ctx) {
  const { style } = ctx;
  const casterA = ctx.casterA;
  const targetIds = targetsOf(beat);
  const targets = targetIds.map(anchorOf).filter(Boolean);
  const main = targets[0] || null;
  const damaging = beat.steps.some((s) => s.type === 'damage');
  const fumble = beat.outcome === 'fumble';

  // Le monstre qui commence son tour s'annonce
  if (beat.announce && casterA && mode !== 'min') {
    sfx(`voice_${beat.casterKind === 'monster' ? ctx.look || 'beast' : 'beast'}`, { pan: panOf(casterA) });
    cv.ring(casterA.x, casterA.y, { r0: casterA.r * 0.8, r1: casterA.r * 1.9, w: 4, element: 'blood', dur: 0.4 });
    await move(casterA.medal, [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.4 }, { transform: 'scale(1)' }], 260);
  }
  skillLabel(casterA, beat, ctx.content);
  const pre = { dx: 0, dy: 0 };

  if (fumble) {
    // Raté : le geste est fait pour rien
    sfx('miss', { pan: panOf(casterA) });
    if (casterA && mode !== 'min') {
      cv.dust(casterA.x, casterA.y + casterA.r * 0.6, { n: 5, r: casterA.r * 0.4, alpha: 0.4 });
      await move(casterA.medal, [{ transform: 'rotate(0deg)' }, { transform: 'translate(-6px, 2px) rotate(-9deg)', offset: 0.25 }, { transform: 'translate(5px, 0) rotate(7deg)', offset: 0.55 }, { transform: 'rotate(0deg)' }], 420);
    }
    number(casterA, 'Raté !', 'miss', { big: 1.05 });
    if (beat.steps.length) await runSteps(beat.steps, ctx);
    return;
  }

  const castSnd = castSound(style);
  const castOpts = { element: style.element, pan: panOf(casterA) };
  switch (style.delivery) {
    case 'melee': {
      if (!casterA || !main) break;
      sfx(castSnd, castOpts);
      const pose = await dashTo(casterA, main, style);
      await runSteps(beat.steps, ctx, 0);
      await supportAfter(beat, ctx, targets);
      await retreat(casterA, pose);
      return;
    }
    case 'spin': {
      if (!casterA) break;
      sfx(castSnd, castOpts);
      await windup(casterA, { x: 0, y: 1 }, 90);
      if (mode !== 'min') cv.sparks(casterA.x, casterA.y, { n: 14, speed: 460, gravity: 0, element: style.element, life: 0.3 });
      const far = Math.max(casterA.r * 3, ...targets.map((t) => Math.hypot(t.x - casterA.x, t.y - casterA.y)));
      const spinning = move(casterA.medal, [{ transform: 'scale(0.9) rotate(0deg)' }, { transform: 'scale(1.2) rotate(360deg)', offset: 0.7 }, { transform: 'scale(1) rotate(360deg)' }], 420, { easing: 'ease-in-out', hold: true });
      await sleep(200);
      if (mode !== 'min') {
        cv.ring(casterA.x, casterA.y, { r0: casterA.r, r1: far * 1.05, w: 9, element: style.element, dur: 0.4 });
        cv.ring(casterA.x, casterA.y, { r0: casterA.r * 0.6, r1: far * 0.8, w: 4, element: 'holy', dur: 0.34 });
      }
      await Promise.all(targets.map(async (t) => {
        await sleep((Math.hypot(t.x - casterA.x, t.y - casterA.y) / far) * 300);
        await runSteps(beat.steps.filter((s) => s.target === t.id), { ...ctx, hit: style.flurry ? 'slash' : undefined }, 0);
      }));
      await spinning;
      await supportAfter(beat, ctx, targets);
      await retreat(casterA, { dx: 0, dy: 0 });
      return;
    }
    case 'projectile': {
      if (!casterA || !main) break;
      sfx(castSnd, castOpts);
      await windup(casterA, norm(main.x - casterA.x, main.y - casterA.y), 120);
      if (mode !== 'min') {
        cv.flash(casterA.x, casterA.y, { r: casterA.r * 1.5, element: style.element, alpha: 0.7, dur: 0.3 });
        cv.ring(casterA.x, casterA.y, { r0: casterA.r * 0.5, r1: casterA.r * 1.5, w: 4, element: style.element, dur: 0.3 });
      }
      await Promise.all(targets.map(async (t, i) => {
        await sleep(i * 60);
        if (mode !== 'min') await cv.projectile(casterA.x, casterA.y, t.x, t.y, { kind: style.shot || 'orb', element: style.element, size: 0.9 + 0.12 * (style.weight || 2) });
        await runSteps(beat.steps.filter((s) => s.target === t.id), ctx, 0);
      }));
      await runSteps(beat.steps.filter((s) => !targets.some((t) => t.id === s.target)), ctx, 0);
      await supportAfter(beat, ctx, targets);
      await retreat(casterA, { dx: 0, dy: 0 });
      return;
    }
    case 'smite': {
      sfx(castSnd, castOpts);
      if (casterA) {
        await windup(casterA, { x: 0, y: -1 }, 120);
        if (mode !== 'min') cv.rise(casterA.x, casterA.y, { kind: 'star', element: style.element, n: 6, spread: casterA.r * 0.6, height: casterA.r * 1.6, size: 5, dur: 0.5, soft: 0.3 });
      }
      await sleep(180);
      await Promise.all(targets.map(async (t, i) => {
        await sleep(i * 90);
        if (mode !== 'min' && style.support !== 'roots') cv.lightning(t.x, t.y, { element: style.element });
        if (style.support === 'roots') supportFx('roots', t, ctx);
        await sleep(110);
        await runSteps(beat.steps.filter((s) => s.target === t.id), ctx, 0);
      }));
      await supportAfter(beat, ctx, targets, style.support === 'roots' ? ['roots'] : []);
      await retreat(casterA, { dx: 0, dy: 0 });
      return;
    }
    case 'wave': {
      if (!casterA) break;
      sfx(castSnd, castOpts);
      await windup(casterA, { x: 0, y: -1 }, 100);
      if (mode !== 'min') {
        cv.ring(casterA.x, casterA.y, { r0: casterA.r * 0.6, r1: Math.max(260, ...targets.map((t) => Math.hypot(t.x - casterA.x, t.y - casterA.y)) ) * 1.1, w: 10, element: style.element, dur: 0.5 });
        cv.ring(casterA.x, casterA.y, { r0: casterA.r * 0.4, r1: 240, w: 5, element: style.element, dur: 0.45 }, 0.07);
      }
      await Promise.all(targets.map(async (t) => {
        await sleep(Math.hypot(t.x - casterA.x, t.y - casterA.y) / 900 * 1000 * 0.6);
        await runSteps(beat.steps.filter((s) => s.target === t.id), ctx, 0);
      }));
      await supportAfter(beat, ctx, targets);
      await retreat(casterA, { dx: 0, dy: 0 });
      return;
    }
    case 'self':
    case 'ally':
    case 'allies':
    default: {
      sfx(castSnd, castOpts);
      if (casterA) {
        await windup(casterA, { x: 0, y: 1 }, 130);
        if (mode !== 'min') cv.flash(casterA.x, casterA.y, { r: casterA.r * 1.5, element: style.element, alpha: 0.6, dur: 0.35 });
      }
      // Un trait de lumière file du lanceur vers chaque allié visé
      if (casterA && mode !== 'min' && style.delivery !== 'self') {
        await Promise.all(targets.filter((t) => t.id !== casterA.id).map(async (t, i) => {
          await sleep(i * 50);
          await cv.projectile(casterA.x, casterA.y, t.x, t.y, { kind: 'orb', element: style.support === 'heal' ? 'heal' : style.element, speed: 1100, size: 0.6 });
        }));
      }
      await runSteps(beat.steps, ctx, 60);
      await supportAfter(beat, ctx, targets);
      await retreat(casterA, { dx: 0, dy: 0 });
      return;
    }
  }
  // Pas d'ancre à l'écran (unité absente de l'écran) : on montre au moins le résultat
  await runSteps(beat.steps, ctx, 0);
}

/** Après les impacts : l'état que la compétence pose (étourdissement, poison, bonus...), sur les unités visées. */
async function supportAfter(beat, ctx, targets, skip = []) {
  const kind = ctx.style.support;
  if (!kind || skip.includes(kind)) return;
  // Le soin, le bouclier et la résurrection ont déjà leurs événements (et leur effet) ; les autres états, non.
  if (['heal', 'shield', 'resurrect'].includes(kind)) return;
  const list = kind === 'guard' || kind === 'taunt' || kind === 'rage' ? [ctx.casterA].filter(Boolean) : targets;
  for (const t of list.length ? list : [ctx.casterA].filter(Boolean)) supportFx(kind, t, ctx);
  await sleep(180);
}

// Les effets sur la durée : chaque nature a son animation, sa teinte sur le portrait et son son (`cause` = dotKind du moteur).
const TICKS = {
  poison: { hit: 'splat', element: 'poison', tint: '#7ad83a', sound: 'poison' },
  venom: { hit: 'splat', element: 'poison', tint: '#a8e03c', sound: 'poison' },
  burn: { hit: 'blast', element: 'fire', tint: '#ff7a2e', sound: 'hit_blast' },
  bleed: { hit: 'splat', element: 'blood', tint: '#ff4a3a', sound: 'hit_splat' },
  shadow: { hit: 'blast', element: 'shadow', tint: '#a864ff', sound: 'hit_drain' },
  drain: { hit: 'splat', element: 'blood', tint: '#c0304a', sound: 'hit_drain' },
  hot: { element: 'heal', tint: '#6df0a0', sound: null },
  hurt: { hit: 'blast', element: 'physical', tint: null, sound: null }
};

/** L'animation propre à un effet sur la durée, EN PIXELS, posée sur la cible avant la perte (ou le gain) de PV. */
function tickFx(cause, a) {
  const { x, y, r } = a;
  switch (cause) {
    case 'burn': cv.pxFlames(x, y, { r, dur: 0.9 }); break;
    case 'poison': cv.pxBubbles(x, y, { r, n: 11, dur: 1 }); break;
    case 'venom':
      cv.pxDrips(x, y, { r, n: 5, dur: 0.95, colors: ['#5b2a8a', '#a8e03c', '#f2ffd8'] });
      cv.pxBubbles(x, y + r * 0.3, { r: r * 0.8, n: 4, dur: 0.9, colors: ['#5b2a8a', '#a8e03c', '#f2ffd8'] });
      break;
    case 'bleed': cv.pxDrips(x, y, { r, n: 7, dur: 0.85 }); break;
    case 'shadow': cv.pxWisps(x, y, { r, n: 7, dur: 0.85 }); break;
    case 'drain': cv.pxWisps(x, y, { r, n: 6, dur: 1, out: true, colors: ['#5a0e14', '#e0303a', '#ffb0a0'] }); break;
    case 'hot': cv.pxLeaves(x, y, { r, n: 7, dur: 1 }); break;
    default: break;
  }
}

/** Le portrait s'encadre un instant de la couleur de l'effet (un cadre net qui clignote deux fois, pas de halo flou). */
function tintPulse(a, color) {
  const el = a?.medal;
  if (!el?.animate || !color || reduceMotion()) return;
  el.animate([{ outline: `3px solid ${color}`, outlineOffset: '1px' }, { outline: '3px solid transparent', outlineOffset: '1px' }, { outline: `3px solid ${color}`, outlineOffset: '1px' }, { outline: '3px solid transparent', outlineOffset: '1px' }],
    { duration: 640 * speed(), easing: 'steps(1, end)' });
}

async function runTick(beat, ctx) {
  const mapped = TICKS[beat.cause] || TICKS.hurt;
  const a = anchorOf(beat.unitId);
  if (a) {
    if (mapped.sound) sfx(mapped.sound, { pan: panOf(a), vol: 0.7 });
    if (mode !== 'min') {
      tickFx(beat.cause, a);
      tintPulse(a, mapped.tint);
      await sleep(beat.cause === 'hot' ? 220 : 320); // (l'effet se montre, PUIS la barre de vie bouge)
    }
  }
  await runSteps(beat.steps, { ...ctx, style: { weight: 1, element: mapped.element }, casterA: null, beat: { outcome: 'hit' }, hit: mapped.hit, element: mapped.element, pixelOnly: TICKS[beat.cause] && beat.cause !== 'hurt' }, 80);
}

// ---------------- L'entrée en scène ----------------

const ADVANCE_SOUND = { combat: 'encounter', treasure: 'chest', trap: 'trap', xp_fountain: 'fountain', life_fountain: 'fountain', low_blow: 'sneak', merchant: 'coins', boss: 'boss' };

/** Les monstres d'un nouveau combat arrivent un par un (à appeler juste après le redessin d'un écran de combat qui vient de commencer). */
export async function entrance() {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  sfx('cast_wave', { vol: 0.9 }); // (les monstres prennent place : un grondement sourd — même en mode réduit)
  if (mode === 'min' || reduceMotion()) return;
  const all = [];
  [...stage.querySelectorAll('.fighter.monster')].forEach((f, i) => {
    all.push(f.animate([{ opacity: 0, transform: 'translateY(-34px) scale(0.8)' }, { opacity: 1, transform: 'translateY(6px) scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 520 * speed(), delay: i * 110, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }).finished);
  });
  [...stage.querySelectorAll('.fighter.player')].forEach((f, i) => {
    all.push(f.animate([{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }], { duration: 420 * speed(), delay: 150 + i * 80, easing: 'ease-out', fill: 'backwards' }).finished);
  });
  await Promise.all(all.map((p) => p.catch(() => {})));
}

/**
 * L'écran actuel montre-t-il les combattants de cette action ? (Sinon — début de combat, vague suivante — on redessine d'abord,
 * puis on rejoue les coups sur le NOUVEL écran : voir `rewind` dans replay.)
 */
export function canPlayHere(events, before, after, content) {
  const first = planBeats(events, before, after, content).find((b) => b.type === 'cast' || b.type === 'tick');
  if (!first) return true;
  const ids = first.type === 'cast' ? [first.caster, ...targetsOf(first)] : [first.unitId, ...(first.steps || []).map((s) => s.target)];
  return ids.some((id) => anchorOf(id));
}

// ---------------- Le point d'entrée ----------------

/**
 * Rejoue une action : `events` (ce que le moteur a répondu), `before` (la photo des unités AVANT, voir snapshotRun), `after` (l'état APRÈS).
 * À appeler tant que l'ANCIEN écran est encore affiché ; renvoie quand c'est fini (ou sauté). Le redessin se fait ensuite.
 */
export async function replay({ events, before, after, content, rewind = false }) {
  if (!events?.length || document.hidden) return; // (onglet caché : le navigateur fige les animations ; on montre directement le résultat)
  const beats = planBeats(events, before, after, content);
  if (!beats.length) return;
  if (rewind) {
    // L'écran montre déjà le RÉSULTAT : on remet d'abord les barres de vie (et les héros tombés) comme avant l'action.
    for (const [id, st] of Object.entries(startState(before, after))) {
      setBar(id, st);
      if (st.alive) document.querySelector(`.fighter[data-unit="${CSS.escape(id)}"]`)?.classList.remove('is-dead');
    }
  }
  running = true;
  skipping = false;
  document.documentElement.classList.add('fx-playing'); // (pendant l'animation, l'écran de jeu ne réagit plus : un clic ne fait que la sauter)
  // Le choix de la cible est fait : les ennemis ne brillent plus comme « à choisir » pendant que le coup se joue.
  for (const el of document.querySelectorAll('.fighter.targetable, .fighter.dim')) el.classList.remove('targetable', 'dim');
  document.querySelector('.hotbar.armed')?.classList.remove('armed');
  // (idem pour la compétence « choisie » au toucher : le coup est parti, la case et l'infobulle se rangent)
  for (const el of document.querySelectorAll('.hotbar .slot.is-selected, .hotbar .slot.is-armed')) el.classList.remove('is-selected', 'is-armed');
  const detail = document.querySelector('.skill-detail');
  if (detail && detail.dataset.state !== 'rest') detail.dataset.state = 'rest';
  const onSkip = () => skip();
  document.addEventListener('pointerdown', onSkip, true);
  document.addEventListener('keydown', onSkip, true);
  const guard = setTimeout(() => { dbg('garde : on saute'); skip(); }, 14000); // (au pire, on ne reste jamais bloqué)
  let played = false;
  dbg('début', beats.map((b) => `${b.type}:${b.skillId || b.cause || b.tileType || ''}`).join(' '));
  try {
    for (const beat of beats) {
      dbg('temps fort', beat.type, beat.skillId || beat.cause || '');
      if (beat.type === 'advance') {
        sfx(ADVANCE_SOUND[beat.tileType] || 'step');
        continue;
      }
      played = true;
      const casterA = beat.type === 'cast' ? anchorOf(beat.caster) : null;
      // Personne à l'écran pour ce temps fort (un monstre déjà parti, une vue sans combat) : rien à montrer, on passe.
      const visible = beat.type === 'cast' ? casterA || targetsOf(beat).some((id) => anchorOf(id)) : [beat.unitId, ...(beat.steps || []).map((s) => s.target)].some((id) => anchorOf(id));
      if (!visible) continue;
      const ctx = {
        beat, content, casterA, style: beat.style || { weight: 1, element: 'physical' },
        look: beat.type === 'cast' ? before?.units?.[beat.caster]?.look : null
      };
      try {
        if (beat.type === 'cast') await runCast(beat, ctx);
        else await runTick(beat, ctx);
      } catch (e) {
        console.error('Animation de combat :', e); // (une animation ratée ne doit jamais bloquer la partie)
      }
      cleanPoses();
      await sleep(mode === 'min' ? 120 : 60);
    }
    if (played) await sleep(160);
  } finally {
    dbg('fin');
    clearTimeout(guard);
    document.removeEventListener('pointerdown', onSkip, true);
    document.removeEventListener('keydown', onSkip, true);
    cleanPoses(true);
    for (const a of [...live]) {
      try { a.finish(); } catch { /* rien */ }
    }
    live.clear();
    running = false;
    skipping = false;
    document.documentElement.classList.remove('fx-playing');
  }
}
