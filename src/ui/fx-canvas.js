// ============================================================
//  fx-canvas.js — Le moteur de particules : un calque transparent posé par-dessus l'écran
// ============================================================
// Tout ce qui brille et qui vole se dessine ici : étincelles, entailles, projectiles, éclats de lumière, bulles de bouclier, étoiles...
// Le calque est un <canvas> plein écran qui laisse passer la souris. Il n'existe que quand il y a quelque chose à montrer :
// la boucle d'animation s'arrête dès que le dernier effet est fini (aucun coût au repos).
// Chaque effet est un petit objet { age, dur, update(dt) -> encore vivant ?, draw(ctx) }. Les temps sont en SECONDES.

export const ELEMENTS = {
  physical: { core: '#fff6e4', glow: '#ffb35c', dark: '#a85a22' },
  holy: { core: '#fffce6', glow: '#ffd75e', dark: '#c58a12' },
  fire: { core: '#fff2c0', glow: '#ff7a2e', dark: '#b2300b' },
  poison: { core: '#f0ffc4', glow: '#93e04a', dark: '#3f8a1a' },
  nature: { core: '#eaffd8', glow: '#6fdc78', dark: '#2f8a3a' },
  shadow: { core: '#f3e4ff', glow: '#a864ff', dark: '#4a1f8a' },
  frost: { core: '#f2fdff', glow: '#7fd6ff', dark: '#2a78b8' },
  arcane: { core: '#eff3ff', glow: '#86a0ff', dark: '#3347b8' },
  blood: { core: '#ffe4dc', glow: '#ff5a4a', dark: '#8f1b14' },
  heal: { core: '#f4fff6', glow: '#6df0a0', dark: '#1f9a55' },
  shield: { core: '#f4fbff', glow: '#6cb8ff', dark: '#2a64b8' },
  dust: { core: '#e9dfcf', glow: '#b9aa94', dark: '#6f6454' }
};
export const palette = (element) => ELEMENTS[element] || ELEMENTS.physical;

// ---------------- Petits outils ----------------

export const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeIn = (t) => clamp01(t) ** 2;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------- Le calque ----------------

let canvas = null;
let ctx = null;
let dpr = 1;
let width = 0;
let height = 0;
const effects = [];
let raf = 0;
let last = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(2, window.devicePixelRatio || 1); // (au-delà de 2, les téléphones ramassent pour rien)
  width = window.innerWidth;
  height = window.innerHeight;
  while (width * height * dpr * dpr > 4.2e6 && dpr > 1) dpr = Math.max(1, dpr - 0.25); // (et sur un très grand écran, on baisse la finesse plutôt que la fluidité)
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.age += dt;
    if (e.delay > 0) {
      e.delay -= dt;
      e.age = 0;
      continue;
    }
    if (e.update(dt) === false) {
      effects.splice(i, 1);
      e.onEnd?.();
    }
  }
  for (const e of effects) {
    if (e.delay > 0) continue;
    ctx.save();
    e.draw(ctx);
    ctx.restore();
  }
  raf = effects.length ? requestAnimationFrame(frame) : 0;
  if (!effects.length) ctx.clearRect(0, 0, width, height);
}

/** Ajoute un effet (il démarre tout de suite, ou après `delay` secondes). */
export function add(effect, delay = 0) {
  ensureCanvas();
  effect.age = 0;
  effect.delay = delay;
  effects.push(effect);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  return effect;
}

/** Lance `fn` dans `delay` secondes (sur l'horloge des effets : « passer » l'annule aussi). */
export function later(delay, fn) {
  return add({ dur: 0, update: () => false, draw() {}, onEnd: fn }, delay);
}

/** Arrête tout de suite tous les effets (changement d'écran, « passer »). */
export function clearEffects() {
  for (const e of effects.splice(0)) e.onEnd?.(); // (ceux qui attendent la fin d'un effet — un projectile — doivent être prévenus)
}
export const activeCount = () => effects.length;
export const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Un effet qui dure `dur` secondes : on donne seulement son dessin, `t` va de 0 à 1. */
function timed(dur, draw, extra = {}) {
  const e = {
    dur,
    update() { return this.age < this.dur; },
    draw(c) { draw.call(this, c, clamp01(this.age / this.dur)); },
    ...extra
  };
  return e;
}

// ---------------- Éclats, lumière, ondes ----------------

/** Une gerbe d'étincelles (des traits lumineux qui retombent). */
export function sparks(x, y, { n = 14, speed = 380, spread = Math.PI * 2, angle = 0, life = 0.45, size = 2.2, gravity = 520, drag = 1.6, element = 'physical', streak = 0.04 } = {}) {
  const pal = palette(element);
  const ps = Array.from({ length: n }, () => {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = speed * rand(0.35, 1.1);
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * rand(0.6, 1.3), age: 0, size: size * rand(0.6, 1.5), c: Math.random() < 0.4 ? pal.core : pal.glow };
  });
  return add({
    update(dt) {
      let alive = false;
      for (const p of ps) {
        p.age += dt;
        if (p.age >= p.life) continue;
        alive = true;
        const k = Math.exp(-drag * dt);
        p.vx *= k;
        p.vy = p.vy * k + gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      return alive;
    },
    draw(c) {
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (const p of ps) {
        if (p.age >= p.life) continue;
        const a = 1 - p.age / p.life;
        c.globalAlpha = a;
        c.strokeStyle = p.c;
        c.lineWidth = p.size * (0.5 + a * 0.6);
        c.beginPath();
        c.moveTo(p.x - p.vx * streak, p.y - p.vy * streak);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
    }
  });
}

/** Un éclat de lumière rond qui s'étale et s'éteint (le point d'impact). */
export function flash(x, y, { r = 70, element = 'physical', dur = 0.24, alpha = 0.95 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    const rr = r * lerp(0.5, 1.15, easeOut(t));
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, pal.core);
    g.addColorStop(0.28, pal.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * (1 - t) ** 1.4;
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.fill();
  }));
}

/** Une onde de choc : un cercle qui grandit en s'amincissant. */
export function ring(x, y, { r0 = 10, r1 = 90, w = 6, element = 'physical', dur = 0.38, alpha = 0.9, squash = 1 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    const r = lerp(r0, r1, easeOut(t));
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * (1 - t);
    c.strokeStyle = pal.glow;
    c.shadowColor = pal.glow;
    c.shadowBlur = 14;
    c.lineWidth = Math.max(0.6, w * (1 - t * 0.85));
    c.beginPath();
    c.ellipse(x, y, r, r * squash, 0, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha *= 0.7;
    c.strokeStyle = pal.core;
    c.lineWidth = Math.max(0.4, w * 0.35 * (1 - t));
    c.stroke();
  }));
}

/** Des rayons qui partent d'un point (coup critique, apparition). */
export function starburst(x, y, { rays = 10, len = 90, w = 5, element = 'holy', dur = 0.4, rot = Math.random() * 6 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = (1 - t) ** 1.2;
    c.fillStyle = pal.glow;
    const L = len * easeOut(t * 1.2);
    for (let i = 0; i < rays; i++) {
      const a = rot + (i / rays) * Math.PI * 2;
      const long = i % 2 ? 0.6 : 1;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      c.moveTo(L * 0.12, -w * 0.5 * (1 - t));
      c.lineTo(L * long, 0);
      c.lineTo(L * 0.12, w * 0.5 * (1 - t));
      c.closePath();
      c.fill();
      c.restore();
    }
  }));
}

/** Un voile de couleur sur tout l'écran (coup critique, éclair). */
export function screenFlash({ element = 'holy', alpha = 0.28, dur = 0.22 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha * (1 - t) ** 1.5;
    c.fillStyle = pal.glow;
    c.fillRect(0, 0, width, height);
  }));
}

// ---------------- Les coups ----------------

/**
 * Une entaille : un croissant lumineux qui balaie la cible.
 * `dir` : l'angle de la poussée (du lanceur vers la cible). L'arc est tracé « autour » du lanceur, et traverse la cible.
 */
export function slash(x, y, { dir = 0, size = 52, sweep = 1.25, width = 17, element = 'physical', dur = 0.28, flip = Math.random() < 0.5, tilt = rand(-0.5, 0.5) } = {}) {
  const pal = palette(element);
  const big = size * 1.9; // rayon du grand cercle dont on trace un arc
  const d = dir + tilt;
  const cx = x - Math.cos(d) * big;
  const cy = y - Math.sin(d) * big;
  const mid = d;
  return add(timed(dur, (c, t) => {
    const head = easeOut(clamp01(t / 0.5));
    const tail = easeInOut(clamp01((t - 0.12) / 0.88));
    const s0 = flip ? 1 - head : tail;
    const s1 = flip ? 1 - tail : head;
    const a0 = mid - sweep / 2 + sweep * Math.min(s0, s1);
    const a1 = mid - sweep / 2 + sweep * Math.max(s0, s1);
    if (a1 - a0 < 0.02) return;
    const N = 20;
    const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    c.globalCompositeOperation = 'lighter';
    c.shadowColor = pal.glow;
    c.shadowBlur = 16;
    for (const [scale, color, alpha] of [[1, pal.glow, 0.85], [0.5, pal.core, 1]]) {
      c.globalAlpha = alpha * fade;
      c.fillStyle = color;
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const a = lerp(a0, a1, k);
        const w = width * scale * Math.sin(Math.PI * k) ** 0.75;
        c.lineTo(cx + Math.cos(a) * (big + w / 2), cy + Math.sin(a) * (big + w / 2));
      }
      for (let i = N; i >= 0; i--) {
        const k = i / N;
        const a = lerp(a0, a1, k);
        const w = width * scale * Math.sin(Math.PI * k) ** 0.75;
        c.lineTo(cx + Math.cos(a) * (big - w / 2), cy + Math.sin(a) * (big - w / 2));
      }
      c.closePath();
      c.fill();
    }
  }));
}

/** Un trait droit qui perce (estoc, flèche, coup de pointe). */
export function stab(x, y, { dir = 0, len = 120, width = 9, element = 'physical', dur = 0.24 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    const grow = easeOut(clamp01(t / 0.35));
    const fade = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
    c.translate(x, y);
    c.rotate(dir);
    c.globalCompositeOperation = 'lighter';
    c.shadowColor = pal.glow;
    c.shadowBlur = 16;
    for (const [k, color, a] of [[1, pal.glow, 0.85], [0.45, pal.core, 1]]) {
      c.globalAlpha = a * fade;
      c.fillStyle = color;
      const L = len * grow;
      c.beginPath();
      c.moveTo(-L * 0.9, 0);
      c.lineTo(-L * 0.1, -width * k * 0.5);
      c.lineTo(L * 0.15, 0);
      c.lineTo(-L * 0.1, width * k * 0.5);
      c.closePath();
      c.fill();
    }
  }));
}

/** Trois griffures parallèles. */
export function claws(x, y, { dir = Math.PI / 2, size = 46, element = 'physical', width = 7 } = {}) {
  const base = dir + rand(-0.3, 0.3) - Math.PI / 2;
  const nx = Math.cos(dir + Math.PI / 2);
  const ny = Math.sin(dir + Math.PI / 2);
  for (let i = -1; i <= 1; i++) {
    const ox = nx * i * size * 0.32;
    const oy = ny * i * size * 0.32;
    slash(x + ox, y + oy, { dir: base + Math.PI / 2, size: size * 0.7, sweep: 0.9, width, element, dur: 0.22, flip: false, tilt: 0 });
  }
}

// ---------------- Les projectiles ----------------

/**
 * Un projectile qui vole de (x0, y0) à (x1, y1). Renvoie une promesse terminée à l'ARRIVÉE (l'effet, lui, finit de s'éteindre).
 * kind : orb (boule lumineuse) · bolt (trait sombre) · arrow (flèche) · thorn (épine) · spit (crachat, en cloche) · wisp (volute) · beam (rayon instantané)
 */
export function projectile(x0, y0, x1, y1, { kind = 'orb', element = 'arcane', speed = 1500, size = 1 } = {}) {
  const pal = palette(element);
  const dist = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  if (kind === 'beam') {
    return new Promise((resolve) => {
      setTimeout(resolve, 700);
      let arrived = false;
      add(timed(0.34, function beamDraw(c, t) {
        if (!arrived && this.age > 0.05) { arrived = true; resolve(); }
        const grow = easeOut(clamp01(t / 0.18));
        const fade = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
        const ex = lerp(x0, x1, grow);
        const ey = lerp(y0, y1, grow);
        c.globalCompositeOperation = 'lighter';
        c.lineCap = 'round';
        c.shadowColor = pal.glow;
        c.shadowBlur = 22;
        for (const [w, color, a] of [[22 * size, pal.glow, 0.35], [11 * size, pal.glow, 0.7], [4.5 * size, pal.core, 1]]) {
          c.globalAlpha = a * fade * (1 - t * 0.4);
          c.strokeStyle = color;
          c.lineWidth = w * (1 - t * 0.6);
          c.beginPath();
          c.moveTo(x0, y0);
          const segs = 7;
          for (let i = 1; i <= segs; i++) {
            const k = i / segs;
            const j = i === segs ? 0 : (Math.random() - 0.5) * 5 * (1 - t);
            c.lineTo(lerp(x0, ex, k) - Math.sin(ang) * j, lerp(y0, ey, k) + Math.cos(ang) * j);
          }
          c.stroke();
        }
      }, { onEnd: () => resolve() }));
    });
  }
  const dur = Math.max(0.16, dist / speed);
  const trail = [];
  return new Promise((resolve) => {
    setTimeout(resolve, (dur + 0.4) * 1000);
    let arrived = false;
    add({
      dur: dur + 0.35,
      pos: { x: x0, y: y0 },
      update(dt) {
        const t = clamp01(this.age / dur);
        if (this.age < dur) {
          let k = t;
          if (kind === 'wisp') k = easeInOut(t);
          const wobble = kind === 'wisp' ? Math.sin(t * 9) * 16 * (1 - t) : kind === 'orb' ? Math.sin(t * 14) * 3 : 0;
          const arc = kind === 'spit' ? -Math.sin(Math.PI * k) * Math.min(90, dist * 0.35) : 0;
          this.pos = { x: lerp(x0, x1, k) - Math.sin(ang) * wobble, y: lerp(y0, y1, k) + Math.cos(ang) * wobble + arc };
          trail.push({ ...this.pos, age: 0 });
        } else if (!arrived) {
          arrived = true;
          resolve();
        }
        for (const p of trail) p.age += dt;
        while (trail.length && trail[0].age > 0.22) trail.shift();
        return this.age < this.dur && (this.age < dur || trail.length > 0);
      },
      draw(c) {
        c.globalCompositeOperation = 'lighter';
        c.lineCap = 'round';
        c.lineJoin = 'round';
        // la traînée : un ruban qui s'amincit
        for (let i = 1; i < trail.length; i++) {
          const p = trail[i];
          const q = trail[i - 1];
          const a = 1 - p.age / 0.22;
          c.globalAlpha = a * 0.8;
          c.strokeStyle = pal.glow;
          c.lineWidth = (kind === 'arrow' || kind === 'thorn' ? 3 : 11) * size * a;
          c.shadowColor = pal.glow;
          c.shadowBlur = 10;
          c.beginPath();
          c.moveTo(q.x, q.y);
          c.lineTo(p.x, p.y);
          c.stroke();
        }
        if (this.age >= dur) return;
        const { x, y } = this.pos;
        if (kind === 'arrow' || kind === 'thorn') {
          const back = trail.length > 2 ? trail[Math.max(0, trail.length - 4)] : { x: x - Math.cos(ang) * 20, y: y - Math.sin(ang) * 20 };
          const a2 = Math.atan2(y - back.y, x - back.x);
          c.globalAlpha = 1;
          c.strokeStyle = pal.core;
          c.lineWidth = 3.2 * size;
          c.beginPath();
          c.moveTo(x - Math.cos(a2) * 24 * size, y - Math.sin(a2) * 24 * size);
          c.lineTo(x, y);
          c.stroke();
          return;
        }
        const r = (kind === 'spit' ? 11 : 15) * size;
        const g = c.createRadialGradient(x, y, 0, x, y, r * 2.1);
        g.addColorStop(0, pal.core);
        g.addColorStop(0.3, pal.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 1;
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r * 2.1, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = pal.core;
        c.beginPath();
        c.arc(x, y, r * 0.38, 0, Math.PI * 2);
        c.fill();
      },
      onEnd: () => resolve()
    });
  });
}

/** Un éclair qui tombe du ciel sur la cible (jugement, foudre). */
export function lightning(x, y, { element = 'holy', dur = 0.32, fromTop = true, x0 = x + rand(-30, 30), y0 = fromTop ? -20 : y - 300 } = {}) {
  const pal = palette(element);
  const path = [{ x: x0, y: y0 }];
  const segs = 9;
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    path.push({ x: lerp(x0, x, k) + (Math.random() - 0.5) * 46 * (1 - k * 0.4), y: lerp(y0, y, k) });
  }
  path.push({ x, y });
  const branches = Array.from({ length: 3 }, () => {
    const i = 2 + Math.floor(Math.random() * (segs - 4));
    const base = path[i];
    const dx = rand(-70, 70);
    return [base, { x: base.x + dx * 0.5, y: base.y + rand(20, 40) }, { x: base.x + dx, y: base.y + rand(50, 90) }];
  });
  return add(timed(dur, (c, t) => {
    const on = t < 0.55 ? (Math.floor(t * 28) % 2 === 0 ? 1 : 0.55) : 1 - (t - 0.55) / 0.45;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.shadowColor = pal.glow;
    c.shadowBlur = 24;
    const poly = (pts) => {
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();
    };
    for (const [w, color, a] of [[14, pal.glow, 0.4], [6, pal.glow, 0.8], [2.4, pal.core, 1]]) {
      c.globalAlpha = a * on;
      c.strokeStyle = color;
      c.lineWidth = w;
      poly(path);
      if (w < 8) for (const b of branches) poly(b);
    }
    // la colonne de lumière
    const g = c.createLinearGradient(x, y0, x, y);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.glow);
    c.globalAlpha = 0.18 * on;
    c.fillStyle = g;
    c.fillRect(x - 22, y0, 44, y - y0);
  }));
}

// ---------------- Soins, bonus, états ----------------

/** Un dessin simple, centré sur (0, 0), pour les particules à forme. */
function glyph(c, kind, r) {
  switch (kind) {
    case 'plus':
      c.fillRect(-r * 0.2, -r, r * 0.4, r * 2);
      c.fillRect(-r, -r * 0.2, r * 2, r * 0.4);
      break;
    case 'up':
    case 'down': {
      const s = kind === 'up' ? -1 : 1;
      c.beginPath();
      c.moveTo(-r, s * r * 0.15);
      c.lineTo(0, s * -r * 0.7);
      c.lineTo(r, s * r * 0.15);
      c.lineTo(r, s * r * 0.6);
      c.lineTo(0, s * -r * 0.25);
      c.lineTo(-r, s * r * 0.6);
      c.closePath();
      c.fill();
      break;
    }
    case 'star': {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      break;
    }
    case 'drop':
      c.beginPath();
      c.moveTo(0, -r);
      c.quadraticCurveTo(r * 0.95, r * 0.2, 0, r);
      c.quadraticCurveTo(-r * 0.95, r * 0.2, 0, -r);
      c.fill();
      break;
    case 'leaf':
      c.beginPath();
      c.moveTo(0, -r);
      c.quadraticCurveTo(r * 0.9, -r * 0.1, 0, r);
      c.quadraticCurveTo(-r * 0.9, -r * 0.1, 0, -r);
      c.fill();
      break;
    case 'bang':
      c.fillRect(-r * 0.22, -r, r * 0.44, r * 1.15);
      c.beginPath();
      c.arc(0, r * 0.7, r * 0.26, 0, Math.PI * 2);
      c.fill();
      break;
    default:
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
  }
}

/** Des formes qui montent en tournoyant (croix de soin, chevrons de bonus, gouttes, feuilles, bulles). */
export function rise(x, y, { kind = 'plus', n = 8, element = 'heal', spread = 46, height = 78, size = 7, dur = 0.9, stagger = 0.45, down = false, soft = 0.6 } = {}) {
  const pal = palette(element);
  const ps = Array.from({ length: n }, () => ({
    x: x + rand(-spread, spread), y: y + rand(-6, spread * 0.5), delay: Math.random() * stagger, life: dur * rand(0.7, 1.1),
    sway: rand(0, 6), swayAmp: rand(2, 8), size: size * rand(0.7, 1.25), rot: rand(-0.4, 0.4), c: Math.random() < 0.3 ? pal.core : pal.glow, glyph: Math.random() < soft ? 'dot' : kind
  }));
  const total = dur + stagger;
  return add({
    dur: total,
    update() { return this.age < total; },
    draw(c) {
      c.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        const t = clamp01((this.age - p.delay) / p.life);
        if (t <= 0 || t >= 1) continue;
        const k = easeOut(t);
        const px = p.x + Math.sin(p.sway + t * 5) * p.swayAmp;
        const py = p.y + (down ? 1 : -1) * k * height;
        c.save();
        c.translate(px, py);
        c.rotate(p.rot * t);
        c.globalAlpha = Math.sin(Math.PI * t) ** 0.7;
        c.fillStyle = p.c;
        c.shadowColor = pal.glow;
        c.shadowBlur = 10;
        glyph(c, p.glyph, p.glyph === 'dot' ? p.size * 0.42 : p.size);
        c.restore();
      }
    }
  });
}

/** Une bulle de bouclier qui se forme autour d'une cible. */
export function dome(x, y, { r = 56, element = 'shield', dur = 0.7 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    const grow = easeOut(clamp01(t / 0.35));
    const rr = r * lerp(0.55, 1, grow);
    const a = t < 0.35 ? grow : 1 - (t - 0.35) / 0.65;
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y, rr * 0.35, x, y, rr);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, pal.glow);
    g.addColorStop(1, pal.core);
    c.globalAlpha = 0.5 * a;
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.95 * a;
    c.strokeStyle = pal.core;
    c.shadowColor = pal.glow;
    c.shadowBlur = 14;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.stroke();
    // le reflet
    c.globalAlpha = 0.8 * a;
    c.lineWidth = 3.5;
    c.beginPath();
    c.arc(x, y, rr * 0.8, Math.PI * 1.1, Math.PI * 1.45);
    c.stroke();
    // les facettes
    c.globalAlpha = 0.28 * a;
    c.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const aa = (i / 6) * Math.PI * 2 + 0.3;
      c.beginPath();
      c.moveTo(x + Math.cos(aa) * rr * 0.4, y + Math.sin(aa) * rr * 0.4);
      c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
      c.stroke();
    }
  }));
}

/** Des étoiles qui tournent au-dessus de la tête (étourdi). */
export function orbit(x, y, { rx = 34, ry = 11, n = 3, dur = 0.9, element = 'holy', size = 8, kind = 'star' } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = pal.glow;
    c.shadowColor = pal.glow;
    c.shadowBlur = 10;
    const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    for (let i = 0; i < n; i++) {
      const a = t * Math.PI * 5 + (i / n) * Math.PI * 2;
      const depth = (Math.sin(a) + 1) / 2;
      c.save();
      c.translate(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      c.rotate(a * 2);
      c.globalAlpha = fade * (0.55 + depth * 0.45);
      glyph(c, kind, size * (0.75 + depth * 0.5));
      c.restore();
    }
  }));
}

/** Des volutes de poussière ou de fumée qui s'étalent. */
export function dust(x, y, { n = 8, r = 20, element = 'dust', dur = 0.8, rise: lift = 26, spread = 30, alpha = 0.5, color = null } = {}) {
  const pal = palette(element);
  const ps = Array.from({ length: n }, () => ({ x: x + rand(-spread, spread), y: y + rand(-spread * 0.5, spread * 0.5), r: r * rand(0.5, 1.2), vx: rand(-14, 14), life: dur * rand(0.7, 1.1), delay: Math.random() * 0.12 }));
  return add({
    dur: dur + 0.2,
    update() { return this.age < this.dur; },
    draw(c) {
      for (const p of ps) {
        const t = clamp01((this.age - p.delay) / p.life);
        if (t <= 0 || t >= 1) continue;
        const rr = p.r * (0.5 + easeOut(t) * 1.1);
        const g = c.createRadialGradient(p.x + p.vx * t, p.y - lift * easeOut(t), 0, p.x + p.vx * t, p.y - lift * easeOut(t), rr);
        g.addColorStop(0, color || pal.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = alpha * (1 - t) ** 1.3;
        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x + p.vx * t, p.y - lift * easeOut(t), rr, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

/** Des racines qui jaillissent du sol sous la cible. */
export function roots(x, y, { n = 6, h = 70, element = 'nature', dur = 0.7 } = {}) {
  const pal = palette(element);
  const ts = Array.from({ length: n }, (_, i) => ({ dx: (i - (n - 1) / 2) * 13 + rand(-4, 4), h: h * rand(0.6, 1.1), bend: rand(-22, 22), delay: Math.random() * 0.15 }));
  return add(timed(dur, (c, t) => {
    c.lineCap = 'round';
    c.shadowColor = pal.glow;
    c.shadowBlur = 8;
    for (const r of ts) {
      const k = clamp01((t * dur - r.delay) / (dur * 0.5));
      const fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      if (k <= 0) continue;
      const top = easeOut(k);
      c.globalAlpha = fade;
      for (const [w, color] of [[7, pal.dark], [3.2, pal.glow]]) {
        c.strokeStyle = color;
        c.lineWidth = w * (1 - 0.4 * top);
        c.beginPath();
        c.moveTo(x + r.dx, y + 26);
        c.quadraticCurveTo(x + r.dx + r.bend * top, y + 26 - r.h * top * 0.55, x + r.dx + r.bend * 0.3, y + 26 - r.h * top);
        c.stroke();
      }
    }
  }));
}

/** Une colonne de lumière qui descend du ciel (résurrection). */
export function column(x, y, { w = 54, element = 'holy', dur = 0.9 } = {}) {
  const pal = palette(element);
  return add(timed(dur, (c, t) => {
    const grow = easeOut(clamp01(t / 0.3));
    const fade = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    const top = y - 260 * grow;
    const g = c.createLinearGradient(x, top, x, y + 30);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, pal.glow);
    g.addColorStop(1, pal.core);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.5 * fade;
    c.fillStyle = g;
    const ww = w * (0.55 + 0.45 * Math.sin(t * 14) * 0.2 + 0.45);
    c.beginPath();
    c.moveTo(x - ww * 0.45, top);
    c.lineTo(x + ww * 0.45, top);
    c.lineTo(x + ww, y + 30);
    c.lineTo(x - ww, y + 30);
    c.closePath();
    c.fill();
  }));
}

export { pick, lerp, clamp01 };
