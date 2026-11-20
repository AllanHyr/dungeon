// ============================================================
//  art/pixel-scenes.js — Les décors et les vignettes de cases, en pixel art (direction « Table pixel »)
// ============================================================
// Un décor est une petite toile de pixels (160 × 65 pour le champ de bataille, 120 × 40 pour une vignette), peinte avec
// quelques outils : dégradé tramé, rectangle, ellipse, polygone, trait, halo de lumière (tramé lui aussi), texture de briques.
// Le résultat est un <svg> fait de carrés de couleur (net à toutes les tailles). Les décors restent SOMBRES et peu contrastés :
// ils passent derrière les combattants et ne doivent jamais gêner la lecture.

import { inPoly, linePixels } from './pixel.js';

// ------------------------------------------------------------ La toile
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, t) { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); }

/** Un petit générateur pseudo-aléatoire, toujours le même pour un même décor (les dessins ne changent pas d'une fois à l'autre). */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function canvas(W, H, fill = '#000000') {
  const g = Array.from({ length: H }, () => Array(W).fill(fill));
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const c = {
    W, H, g,
    px(x, y, col) { x = Math.round(x); y = Math.round(y); if (ok(x, y)) g[y][x] = col; },
    get(x, y) { return ok(x, y) ? g[y][x] : null; },
    /** Un dégradé vertical tramé entre plusieurs couleurs (de y0 à y1). */
    vgrad(y0, y1, cols) {
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = 0; x < W; x++) {
        const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (cols.length - 1);
        const i = Math.min(cols.length - 2, Math.floor(t));
        g[y][x] = (t - i) > BAYER[y % 4][x % 4] ? cols[i + 1] : cols[i];
      }
    },
    rect(x0, y0, w, h, col) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) c.px(x, y, typeof col === 'function' ? col(x, y) : col); },
    ell(cx, cy, rx, ry, col) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) c.px(x, y, typeof col === 'function' ? col(x, y) : col);
    },
    poly(pts, col) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++)
        if (inPoly(x + 0.5, y + 0.5, pts)) c.px(x, y, typeof col === 'function' ? col(x, y) : col);
    },
    line(pts, col, w = 1) { for (const [x, y] of linePixels(pts, w)) c.px(x, y, col); },
    /** Un halo : la couleur de la lumière se mêle au décor, de plus en plus faiblement vers le bord (par paliers tramés). */
    glow(cx, cy, r, col, strength = 0.5, ry = r) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!ok(x, y)) continue;
        const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
        if (d >= 1) continue;
        const k = strength * (1 - d) ** 1.4;
        // des paliers nets ; le tramage ne joue qu'à la frontière entre deux paliers (sinon le halo devient du sable)
        const steps = 5;
        const q = Math.round(k * steps + (BAYER[y % 4][x % 4] - 0.5) * 0.45) / steps;
        if (q > 0) g[y][x] = mix(g[y][x], col, Math.min(0.9, q));
      }
    },
    /** Assombrit (k > 0) ou éclaircit (k < 0) une zone, avec une fonction d'appartenance. */
    shade(test, k, toward = '#000000') { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x, y)) g[y][x] = mix(g[y][x], toward, k); },
    /** Un mur de briques (ou de pierres) dans un rectangle : joints sombres, haut des pierres plus clair. */
    bricks(x0, y0, w, h, { base, joint, light, bw = 8, bh = 4, rnd }) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const row = Math.floor((y - y0) / bh), off = row % 2 ? bw / 2 : 0;
        const bx = (x - x0 + off) % bw, by = (y - y0) % bh;
        let col = base;
        if (by === bh - 1 || bx === bw - 1) col = joint;
        else if (by === 0) col = light;
        else if (rnd && rnd() < 0.06) col = mix(base, joint, 0.5);
        c.px(x, y, col);
      }
    }
  };
  return c;
}

/** La toile en SVG : une suite de rectangles, regroupés en un chemin par couleur. */
function toSvg(c) {
  const paths = new Map();
  for (let y = 0; y < c.H; y++) {
    let x = 0;
    while (x < c.W) {
      const col = c.g[y][x];
      let w = 1;
      while (x + w < c.W && c.g[y][x + w] === col) w++;
      paths.set(col, (paths.get(col) || '') + `M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.W} ${c.H}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${[...paths].map(([col, d]) => `<path fill="${col}" d="${d}"/>`).join('')}</svg>`;
}

// ------------------------------------------------------------ Petits éléments réutilisés
/** Une flamme de bougie ou de torche (avec son halo, posé avant). */
function torch(c, x, y, s = 1, col = '#ffb040') {
  c.glow(x, y - 1, 16 * s, col, 0.55);
  c.rect(x - 1, y + 1, 2, 3 * s + 1, '#3a2414');
  c.px(x, y - 2, '#ffe080'); c.px(x - 1, y - 1, col); c.px(x, y - 1, '#fff4c0'); c.px(x + 1, y - 1, col); c.px(x, y, col); c.px(x - 1, y, '#e06020'); c.px(x + 1, y, '#e06020');
  if (s > 1.2) { c.px(x, y - 3, col); c.px(x - 1, y - 2, '#e06020'); c.px(x + 1, y - 2, col); }
}
/** Un pic de pierre (stalactite vers le bas si dir = 1, stalagmite vers le haut si dir = -1). */
function spike(c, x, y, h, w, dir, col, edge) {
  for (let i = 0; i < h; i++) {
    const half = Math.max(0, Math.round((w / 2) * (1 - i / h)));
    for (let dx = -half; dx <= half; dx++) c.px(x + dx, y + dir * i, dx === -half ? edge : col);
  }
}

// ============================================================
//  Les décors du champ de bataille (160 × 65)
// ============================================================
function caves() {
  const c = canvas(160, 65), r = rng(7);
  c.vgrad(0, 65, ['#081012', '#0e1c1e', '#13262a', '#0c1a1c', '#081012']);
  c.glow(80, 30, 70, '#ffd88a', 0.22, 34);
  // l'ouverture au fond, éclairée
  c.poly([[61, 65], [61, 40], [66, 29], [80, 23], [94, 29], [99, 40], [99, 65]], '#04090a');
  c.poly([[65, 65], [65, 41], [69, 32], [80, 27], [91, 32], [95, 41], [95, 65]], '#1a3434');
  c.glow(80, 46, 18, '#ffe9b0', 0.45, 20);
  // les parois
  c.poly([[0, 0], [40, 0], [34, 14], [22, 30], [12, 44], [4, 56], [0, 65]], '#050b0c');
  c.poly([[160, 0], [120, 0], [126, 14], [138, 30], [148, 44], [156, 56], [160, 65]], '#050b0c');
  c.line([[40, 0], [34, 14], [22, 30], [12, 44], [4, 56], [0, 64]], '#1c3a3a');
  c.line([[120, 0], [126, 14], [138, 30], [148, 44], [156, 56], [159, 64]], '#16302f');
  // stalactites et stalagmites
  for (let x = 4; x < 160; x += 7 + Math.floor(r() * 7)) spike(c, x, 0, 5 + Math.floor(r() * 12), 4 + Math.floor(r() * 3), 1, '#071012', '#1c3838');
  for (const [x, h] of [[8, 12], [20, 7], [142, 11], [152, 8], [131, 6]]) spike(c, x, 64, h, 6, -1, '#061010', '#1a3434');
  // le sol mouillé
  c.rect(0, 50, 160, 15, (x, y) => mix(c.get(x, y), '#244a4a', 0.18));
  for (const [x, y, rx] of [[45, 54, 16], [114, 57, 20], [80, 61, 26]]) { c.ell(x, y, rx, 2, '#1e4646'); c.line([[x - rx / 2, y], [x - rx / 4, y]], '#3a7272'); }
  // champignons lumineux
  for (const [x, y] of [[26, 60], [31, 61], [134, 59], [138, 60], [70, 63]]) { c.glow(x, y, 7, '#6af0ff', 0.5); c.px(x, y, '#d0ffff'); c.px(x, y + 1, '#2a6060'); }
  return toSvg(c);
}

function crypt() {
  const c = canvas(160, 65), r = rng(11);
  c.vgrad(0, 65, ['#070914', '#0e1328', '#141a34', '#0c1022', '#070910']);
  // le mur de pierres
  c.bricks(0, 0, 160, 46, { base: '#151b34', joint: '#0a0e1e', light: '#1e2646', bw: 10, bh: 5, rnd: r });
  // trois arches, la centrale ouverte sur une lueur bleue
  for (const [cx, open] of [[40, false], [80, true], [120, false]]) {
    c.poly([[cx - 13, 46], [cx - 13, 20], [cx - 9, 12], [cx, 8], [cx + 9, 12], [cx + 13, 20], [cx + 13, 46]], '#2a3256');
    c.poly([[cx - 10, 46], [cx - 10, 21], [cx - 7, 15], [cx, 12], [cx + 7, 15], [cx + 10, 21], [cx + 10, 46]], open ? '#1c2856' : '#070a16');
    if (open) c.glow(cx, 30, 22, '#7a9aff', 0.35, 26);
    c.line([[cx - 13, 20], [cx - 9, 12], [cx, 8], [cx + 9, 12], [cx + 13, 20]], '#3e4a7a');
  }
  // les piliers
  for (const x of [17, 60, 100, 143]) { c.rect(x - 3, 0, 6, 46, '#20284a'); c.rect(x - 3, 0, 1, 46, '#323e6a'); c.rect(x + 2, 0, 1, 46, '#0e1224'); }
  // les dalles du sol
  c.rect(0, 46, 160, 19, (x, y) => ((x + (y % 2) * 3) % 12 === 0 || y === 46 || y === 53 ? '#0a0e1c' : mix('#1a2242', '#070910', (y - 46) / 22)));
  // des bougies
  for (const [x, y] of [[27, 44], [32, 45], [128, 44], [133, 45], [80, 47]]) torch(c, x, y, 0.8, '#ffc86a');
  // des os au sol
  c.line([[48, 58], [53, 57]], '#4a4a5a'); c.px(47, 58, '#5a5a6a'); c.px(54, 57, '#5a5a6a');
  c.ell(112, 59, 2, 1.5, '#4a4a5a'); c.px(111, 59, '#0a0a12');
  return toSvg(c);
}

function depths() {
  const c = canvas(160, 65), r = rng(23);
  c.vgrad(0, 65, ['#0a0406', '#180809', '#240c0e', '#1a0809', '#0a0405']);
  c.glow(80, 70, 90, '#ff5020', 0.3, 40);
  // des piliers brisés
  for (const [x, h, w] of [[14, 50, 9], [44, 34, 7], [116, 40, 7], [146, 54, 9]]) {
    c.rect(x - w / 2, 65 - h, w, h, '#1e0c0e');
    c.rect(x - w / 2, 65 - h, 1, h, '#3a1a1a');
    c.poly([[x - w / 2, 65 - h], [x - w / 2 + 2, 65 - h - 3], [x + w / 2 - 1, 65 - h - 1], [x + w / 2, 65 - h]], '#1e0c0e');
  }
  // des chaînes qui pendent
  for (const [x, len] of [[30, 22], [64, 14], [98, 18], [130, 26]]) for (let y = 0; y < len; y++) c.px(x + (y % 4 === 1 ? 1 : 0), y, y % 2 ? '#2e2426' : '#4a3a3c');
  // le sol et ses fissures de lave
  c.rect(0, 50, 160, 15, (x, y) => mix('#1a0a0a', '#060203', (y - 50) / 16));
  for (const crack of [[[6, 58], [18, 55], [30, 60], [44, 57]], [[60, 62], [72, 58], [86, 61], [96, 57], [110, 60]], [[118, 55], [132, 58], [150, 54]]]) {
    c.line(crack, '#ff6a1a'); c.line(crack.map(([x, y]) => [x, y + 1]), '#a02a0a');
  }
  for (const crack of [[[6, 58], [44, 57]], [[60, 62], [110, 60]], [[118, 55], [150, 54]]]) c.glow((crack[0][0] + crack[1][0]) / 2, crack[0][1], 26, '#ff6a1a', 0.25, 6);
  // des braises qui montent
  for (let i = 0; i < 26; i++) { const x = Math.floor(r() * 160), y = Math.floor(r() * 48); c.px(x, y, r() < 0.5 ? '#ff9a4a' : '#c04018'); }
  return toSvg(c);
}

function terriers() {
  const c = canvas(160, 65), r = rng(31);
  c.vgrad(0, 65, ['#0e0904', '#1c1208', '#26180c', '#1a1008', '#0c0804']);
  // la terre, en couches
  for (let y = 0; y < 50; y++) for (let x = 0; x < 160; x++) if ((y + Math.floor(Math.sin(x / 9) * 2)) % 9 === 0) c.px(x, y, '#120c06');
  // des terriers (trous ronds)
  for (const [x, y, s] of [[28, 26, 9], [80, 20, 12], [132, 28, 9]]) {
    c.ell(x, y, s + 2, s * 0.8 + 2, '#3a2814');
    c.ell(x, y, s, s * 0.8, '#050302');
    c.ell(x + s / 3, y - 1, 1, 1, '#ff3030'); c.ell(x - s / 3 + 1, y - 1, 1, 1, '#ff3030');
  }
  // des racines
  for (const root of [[[0, 6], [12, 10], [20, 8], [30, 14]], [[160, 4], [146, 9], [138, 7], [128, 12]], [[60, 0], [64, 6], [62, 12]], [[104, 0], [100, 8], [106, 13]]]) c.line(root, '#3e2a16', 2);
  // le sol et deux lanternes
  c.rect(0, 50, 160, 15, (x, y) => (r() < 0.04 ? '#3a2a14' : mix('#24180c', '#0a0604', (y - 50) / 16)));
  for (const [x, y] of [[14, 44], [146, 44]]) { c.line([[x, 30], [x, y - 3]], '#2a1a0c'); torch(c, x, y - 2, 1, '#ffb850'); }
  return toSvg(c);
}

function training() {
  const c = canvas(160, 65);
  c.vgrad(0, 65, ['#1a120a', '#241a10', '#2e2214', '#22180e', '#140e08']);
  // un mur de planches
  for (let x = 0; x < 160; x++) for (let y = 0; y < 46; y++) {
    const plank = Math.floor(x / 11);
    let col = plank % 2 ? '#2e2012' : '#33241a';
    if (x % 11 === 0) col = '#160e06';
    else if ((y + plank * 5) % 23 === 0) col = '#1c140a';
    c.px(x, y, col);
  }
  c.rect(0, 12, 160, 3, '#1c1208'); c.rect(0, 12, 160, 1, '#4a3420');
  // des bannières
  for (const [x, col] of [[34, '#7a1a22'], [126, '#1a3a7a']]) {
    c.poly([[x - 7, 15], [x + 7, 15], [x + 7, 36], [x, 32], [x - 7, 36]], col);
    c.rect(x - 7, 15, 14, 1, '#d8a030'); c.ell(x, 23, 3, 3, '#d8a030'); c.ell(x, 23, 1.5, 1.5, col);
  }
  // une cible ronde
  c.ell(80, 26, 10, 10, '#d8c4a0'); c.ell(80, 26, 7, 7, '#a82630'); c.ell(80, 26, 4, 4, '#d8c4a0'); c.ell(80, 26, 1.6, 1.6, '#a82630');
  c.rect(79, 36, 2, 10, '#3a2414');
  // le sol de terre battue, de la paille
  c.rect(0, 46, 160, 19, (x, y) => mix('#2a1e10', '#100a04', (y - 46) / 20));
  for (let i = 0; i < 40; i++) { const x = (i * 37) % 160, y = 48 + ((i * 13) % 16); c.px(x, y, '#7a6024'); c.px(x + 1, y, '#5a4418'); }
  c.glow(80, 10, 70, '#ffd88a', 0.18, 30);
  return toSvg(c);
}

// ============================================================
//  Les vignettes des cases (120 × 40)
// ============================================================
function room(top, bottom, glowCol, glowAt = [60, 22]) {
  const c = canvas(120, 40), r = rng(5);
  c.vgrad(0, 40, [top, mix(top, bottom, 0.5), bottom]);
  c.bricks(0, 0, 120, 28, { base: mix(top, '#3a4258', 0.35), joint: mix(top, '#000000', 0.4), light: mix(top, '#5a6488', 0.4), bw: 10, bh: 5, rnd: r });
  c.rect(0, 28, 120, 12, (x, y) => mix(bottom, '#000000', (y - 28) / 18));
  c.rect(0, 28, 120, 1, mix(top, '#000000', 0.5));
  if (glowCol) c.glow(glowAt[0], glowAt[1], 40, glowCol, 0.4, 22);
  return c;
}

function treasure() {
  const c = room('#16141e', '#0a0a10', '#ffcf5a', [60, 24]);
  // le coffre
  c.rect(46, 20, 28, 14, '#6a4222'); c.rect(46, 20, 28, 1, '#9a6a38');
  c.poly([[46, 20], [48, 13], [60, 11], [72, 13], [74, 20]], '#7a4e26'); c.line([[48, 13], [60, 11], [72, 13]], '#a8763e');
  for (const x of [50, 69]) c.rect(x, 12, 2, 22, '#8a96aa');
  c.rect(46, 20, 28, 2, '#5a6478');
  c.rect(58, 21, 4, 5, '#d8a030'); c.px(60, 23, '#1a0a04');
  c.glow(60, 17, 14, '#ffe488', 0.6, 6);
  // des pièces au sol
  for (const [x, y] of [[38, 33], [41, 34], [79, 32], [83, 34], [86, 33], [35, 35], [44, 36]]) { c.px(x, y, '#ffd040'); c.px(x + 1, y, '#a87018'); }
  c.px(60, 9, '#fff4c0'); c.px(66, 8, '#fff4c0'); c.px(54, 8, '#ffe488');
  return toSvg(c);
}

function trap() {
  const c = room('#14161c', '#08090c', null);
  // une rangée de piques qui sortent du sol
  for (let x = 24; x < 98; x += 6) { spike(c, x, 33, 9 + (x % 4), 4, -1, '#5e6476', '#9098aa'); c.px(x, 33 - (9 + (x % 4)) + 1, '#d4dce8'); }
  c.rect(20, 33, 82, 3, '#2a2e3a');
  // une dalle piégée et des os
  c.rect(52, 36, 16, 2, '#3a3e4c');
  c.line([[10, 36], [16, 34]], '#c8bc98'); c.ell(104, 35, 2.5, 2, '#c8bc98'); c.px(103, 35, '#14161c'); c.px(105, 35, '#14161c');
  c.glow(60, 20, 46, '#c0303a', 0.18, 18);
  return toSvg(c);
}

function fountain(life) {
  const water = life ? '#e0607a' : '#5aa8ff', light = life ? '#ffb0c0' : '#c8ecff';
  const c = room(life ? '#1c1018' : '#0e1424', life ? '#0c0608' : '#060a12', water, [60, 18]);
  // le bassin
  c.ell(60, 33, 26, 5, '#4a4e60'); c.ell(60, 32, 23, 3.4, water); c.line([[42, 31], [52, 31]], light);
  // la colonne et la vasque
  c.rect(57, 16, 6, 16, '#5e6476'); c.rect(57, 16, 1, 16, '#9098aa');
  c.ell(60, 16, 9, 2.4, '#5e6476'); c.ell(60, 15.5, 7, 1.4, water);
  // l'eau qui retombe
  for (const x of [52, 54, 66, 68]) for (let y = 17; y < 31; y += 2) c.px(x + (y > 24 ? (x < 60 ? -1 : 1) : 0), y, light);
  // le symbole qui flotte
  if (life) { c.ell(57.5, 7, 2.4, 2.4, '#ff5a7a'); c.ell(62.5, 7, 2.4, 2.4, '#ff5a7a'); c.poly([[55, 8], [65, 8], [60, 13]], '#ff5a7a'); c.px(57, 6, '#ffd0d8'); }
  else { for (const [x, y] of [[60, 3], [60, 4], [60, 10], [60, 11], [56, 7], [57, 7], [63, 7], [64, 7], [59, 6], [61, 6], [59, 8], [61, 8], [60, 7]]) c.px(x, y, '#ffe488'); }
  c.glow(60, 8, 12, light, 0.5, 8);
  return toSvg(c);
}

function lowBlow() {
  const c = room('#120c18', '#06040a', '#7a3aa0', [60, 20]);
  // deux silhouettes dans l'ombre, une dague levée
  c.poly([[30, 40], [32, 22], [36, 16], [42, 16], [45, 22], [47, 40]], '#06040a'); c.ell(39, 13, 4, 4, '#06040a');
  c.poly([[74, 40], [76, 22], [80, 16], [86, 16], [89, 22], [91, 40]], '#06040a'); c.ell(83, 13, 4, 4, '#06040a');
  c.px(37, 13, '#ff5aa0'); c.px(40, 13, '#ff5aa0');
  c.line([[47, 22], [52, 14]], '#06040a', 2);
  c.line([[52, 14], [57, 6]], '#d4dce8'); c.px(52, 15, '#d8a030'); c.px(51, 14, '#d8a030');
  c.glow(55, 9, 8, '#e0d0ff', 0.5);
  return toSvg(c);
}

function merchant() {
  const c = room('#1a140c', '#0a0804', '#ffb850', [60, 16]);
  // l'étal : un auvent rayé
  for (let x = 30; x < 90; x++) for (let y = 6; y < 12; y++) c.px(x, y, Math.floor((x - 30) / 5) % 2 ? '#d8c4a0' : '#a82630');
  for (let x = 30; x < 90; x += 5) c.px(x + 2, 12, Math.floor((x - 30) / 5) % 2 ? '#d8c4a0' : '#a82630');
  c.rect(31, 12, 2, 22, '#4a2c14'); c.rect(87, 12, 2, 22, '#4a2c14');
  c.rect(28, 26, 64, 4, '#7a4e26'); c.rect(28, 26, 64, 1, '#a8763e'); c.rect(30, 30, 60, 6, '#4a2c14');
  // les marchandises : potions, une bourse
  for (const [x, col] of [[40, '#c0303a'], [46, '#3e8adf'], [52, '#3ea84a']]) { c.rect(x, 22, 3, 4, col); c.px(x + 1, 21, '#d8c4a0'); c.px(x, 22, '#ffffff'); }
  c.ell(70, 23, 4, 3, '#8a5a34'); c.px(70, 19, '#5a3a1a'); c.px(69, 22, '#ffd040'); c.px(72, 24, '#ffd040');
  c.rect(78, 20, 6, 6, '#6a4222'); c.rect(78, 20, 6, 1, '#9a6a38');
  torch(c, 60, 15, 1, '#ffb850');
  return toSvg(c);
}

function combat() {
  const c = room('#100c10', '#060406', '#c0303a', [60, 20]);
  c.rect(0, 0, 120, 40, (x, y) => mix(c.get(x, y), '#000000', 0.45));
  // des yeux dans le noir, et la brume
  for (const [x, y, col] of [[22, 14, '#ff3030'], [44, 9, '#ffd040'], [60, 17, '#ff3030'], [80, 11, '#8dff7a'], [98, 16, '#ff5aa0']]) {
    c.glow(x + 1, y, 6, col, 0.35, 4); c.px(x, y, col); c.px(x + 3, y, col);
  }
  for (let x = 0; x < 120; x++) for (let y = 28; y < 40; y++) if ((x + y * 3) % 7 === 0 || (y > 32 && (x * 5 + y) % 4 === 0)) c.px(x, y, '#3a3640');
  return toSvg(c);
}

function boss() {
  const c = room('#1a0a0a', '#0a0404', '#ff4020', [60, 18]);
  // la grande porte
  c.poly([[40, 34], [40, 12], [46, 5], [60, 2], [74, 5], [80, 12], [80, 34]], '#3a2a24');
  c.poly([[43, 34], [43, 13], [48, 7], [60, 5], [72, 7], [77, 13], [77, 34]], '#1a0c08');
  c.rect(59, 5, 2, 29, '#0a0404');
  for (const y of [12, 20, 28]) c.rect(44, y, 33, 1, '#4a4e60');
  // le crâne au fronton
  c.ell(60, 4, 4, 3.4, '#d0c4a0'); c.px(58, 4, '#1a0a04'); c.px(61, 4, '#1a0a04'); c.rect(58, 7, 4, 1, '#d0c4a0');
  // deux braseros
  for (const x of [30, 90]) { c.rect(x - 3, 28, 6, 2, '#4a4e60'); c.rect(x - 1, 30, 2, 5, '#363a48'); torch(c, x, 26, 1.4, '#ff6a20'); }
  c.glow(60, 22, 14, '#ff2a1a', 0.35, 10);
  return toSvg(c);
}

function camp() {
  const c = canvas(120, 40);
  c.vgrad(0, 40, ['#060a16', '#0c1428', '#14182a', '#100c0c']);
  for (const [x, y] of [[8, 4], [22, 9], [37, 3], [70, 6], [88, 2], [104, 8], [114, 4], [52, 10]]) c.px(x, y, '#d0d8ff');
  c.ell(100, 8, 3, 3, '#e8e4c8'); c.ell(101.5, 7, 2.5, 2.5, '#0c1428');
  // des arbres en silhouette
  for (const [x, h] of [[6, 22], [16, 28], [104, 26], [114, 20]]) c.poly([[x - 6, 32], [x, 32 - h], [x + 6, 32]], '#06080c');
  // une tente
  c.poly([[24, 34], [36, 16], [48, 34]], '#5a3a1e'); c.poly([[34, 34], [36, 22], [40, 34]], '#1a0e06'); c.line([[36, 16], [48, 34]], '#3a2410');
  // le sol et le feu
  c.rect(0, 32, 120, 8, (x, y) => mix('#1a140c', '#080604', (y - 32) / 8));
  c.glow(66, 30, 40, '#ff9a30', 0.45, 18);
  c.line([[58, 35], [74, 31]], '#4a2c14', 2); c.line([[58, 31], [74, 35]], '#3a2410', 2);
  c.poly([[61, 32], [63, 26], [65, 28], [66, 21], [68, 27], [70, 25], [71, 32]], '#f07a20');
  c.poly([[64, 32], [66, 26], [68, 32]], '#ffd040'); c.px(66, 30, '#fff4c0');
  for (const [x, y] of [[62, 18], [70, 16], [67, 13]]) c.px(x, y, '#ff9a40');
  // un tronc pour s'asseoir
  c.rect(82, 32, 14, 3, '#4a2c14'); c.rect(82, 32, 14, 1, '#7a4e26'); c.ell(82, 33.5, 1.5, 1.5, '#a8763e');
  return toSvg(c);
}

export const PIXEL_SCENES = { caves, crypt, depths, terriers, training };
export const PIXEL_VIGNETTES = {
  treasure, trap, merchant, combat, boss, camp,
  low_blow: lowBlow,
  xp_fountain: () => fountain(false),
  life_fountain: () => fountain(true)
};
