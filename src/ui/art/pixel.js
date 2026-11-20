// ============================================================
//  art/pixel.js — Le moteur des portraits en pixel art (direction « Table pixel »)
// ============================================================
// Un portrait est une grille de 32 × 32 pixels. On le décrit avec quelques FORMES (ellipses, rectangles, polygones, traits),
// chacune peinte dans une RAMPE de 4 tons (ombre profonde, ombre, ton de base, lumière). Le moteur s'occupe du reste :
//   - l'ombrage : la lumière vient toujours d'en haut à gauche (une boule s'éclaire comme une sphère, une forme plate a un
//     liseré clair en haut à gauche et un bord sombre en bas à droite) ;
//   - les contours intérieurs : une forme posée DEVANT une autre lui fait une petite ombre (en bas et à droite) ;
//   - le contour extérieur sombre autour de la silhouette ;
//   - le fond (deux ou trois tons, tramés en damier) ;
//   - enfin les DÉTAILS posés à la main, pixel par pixel (yeux, bouche, reflets, runes...).
// Le résultat est un <svg> (des carrés de couleur) : rien à charger, net à toutes les tailles.
//
// Une forme : { e: [cx, cy, rx, ry] } ellipse · { r: [x, y, w, h] } rectangle · { p: [[x, y], ...] } polygone · { l: [[x0, y0], [x1, y1], ...] } trait
//   c      la rampe (nom dans RAMPS, ou un tableau de 4 couleurs)
//   shade  'ball' (défaut des ellipses) · 'bevel' (défaut des autres) · 'flat' · 'grad' (dégradé vertical, sans liseré)
//   tone   pour 'flat' et les traits : l'indice du ton (0 = le plus sombre, 3 = le plus clair) ; défaut 2
//   clip   [x0, y0, x1, y1] : la forme n'est peinte que dans ce cadre (bords inclus)
//   g      un groupe : deux formes du même groupe ne se font pas d'ombre (ex. : le visage et le cou)
//   line   true : la forme se détache par un trait sombre tout autour (pas seulement en bas à droite)
//   cast   false : la forme ne fait pas d'ombre sur ce qui est derrière
//   cut    true : la forme EFFACE ce qui est dessous (pour creuser un trou, une bouche...)
// Les détails : px = [[couleur, [[x, y], ...]], ...] ; pat = [[x, y, ['ab.c', ...], { a: couleur, ... }], ...] ('.' = rien)
// Dans les couleurs, on peut écrire « rampe:ton » (ex. 'skin:0') pour reprendre un ton d'une rampe.

export const N = 32;

/** Les rampes : du plus sombre au plus clair. */
export const RAMPS = {
  skin: ['#6b3a2a', '#a8644a', '#e0a07a', '#f6cfa8'],
  tan: ['#4a2618', '#7e4a30', '#b8784e', '#e0a878'],
  dark: ['#2a1610', '#4e2c1c', '#7a4a30', '#a8704a'],
  pale: ['#3e4250', '#6e7686', '#aab4c0', '#e0e8ee'],
  goblin: ['#1a3014', '#3a6024', '#6c9a34', '#a8d05a'],
  ogre: ['#1e2c16', '#3e5a2c', '#6a8a48', '#9cbc6a'],
  steel: ['#20263a', '#4a5468', '#8a96aa', '#d4dce8'],
  iron: ['#121420', '#262a3a', '#464c62', '#727a92'],
  gold: ['#4a2808', '#8a5a12', '#d8a030', '#ffe488'],
  red: ['#34080e', '#7a1a22', '#c0303a', '#ec6a6e'],
  wine: ['#22060c', '#4a1018', '#7a1e2a', '#a83a44'],
  brown: ['#22120a', '#3e2414', '#6e4022', '#9a6236'],
  leather: ['#2a160c', '#55311c', '#8a5a34', '#b88a58'],
  wood: ['#1e1008', '#4a2c14', '#7a4e26', '#a8763e'],
  purple: ['#140a2a', '#2a1650', '#4e2e8a', '#7a56c0'],
  violet: ['#24083a', '#4a1e6a', '#7a3aa0', '#b070d8'],
  white: ['#4a4a66', '#8a8aa6', '#d4d4e6', '#ffffff'],
  cream: ['#5a4632', '#9a8266', '#d8c4a0', '#f6ecd2'],
  blue: ['#0a1030', '#182a5a', '#2e4c96', '#5076c8'],
  navy: ['#060a1c', '#101a38', '#1e2e5a', '#34487e'],
  teal: ['#08262a', '#125452', '#2a8a7a', '#62c8aa'],
  green: ['#0c2812', '#1e5a2a', '#3ea84a', '#8ae070'],
  leaf: ['#0c200e', '#1c441c', '#36742a', '#72aa3e'],
  moss: ['#141c0c', '#2a3a18', '#4a5e2a', '#76884a'],
  grey: ['#1c1612', '#3e342c', '#6e5e50', '#9a8a7a'],
  ash: ['#302a30', '#5a5058', '#8e8288', '#c4b8bc'],
  stone: ['#181a22', '#363a48', '#5e6476', '#9098aa'],
  bone: ['#3e3424', '#7e6e50', '#c8bc98', '#f2eacc'],
  pink: ['#4a1a28', '#a04a5a', '#e07a8a', '#ffb4bc'],
  pig: ['#4a2224', '#94505a', '#d08a8a', '#f4c0b4'],
  boar: ['#160e08', '#34200e', '#5a3c22', '#86603c'],
  orange: ['#4a1406', '#a83a10', '#f07a20', '#ffd040'],
  ice: ['#123068', '#2a6ab0', '#6ac0f0', '#dcf8ff'],
  ghost: ['#16244a', '#33558a', '#76a6d8', '#d4eeff'],
  black: ['#06060a', '#121218', '#22222c', '#3a3a48'],
  hairB: ['#080606', '#18120e', '#2c221c', '#463830'],
  blond: ['#4a3008', '#8a6018', '#d0a040', '#f4dc8a'],
  ginger: ['#3a0e06', '#7a2810', '#b84e1e', '#e8863e'],
  mud: ['#1c140a', '#3a2c16', '#5e4a28', '#8a7442'],
  slime: ['#0c3016', '#1e6a2a', '#44b04a', '#a0ec80'],
  flesh: ['#3a0e14', '#6e2028', '#a4404a', '#d8786e'],
  straw: ['#3a2a0a', '#7a5a1a', '#c09838', '#ecd070']
};

const OUTLINE = '#120a0c';
const LIGHT = norm([-0.55, -0.7, 0.75]);

function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
function rampOf(c) { return Array.isArray(c) ? c : RAMPS[c] || RAMPS.grey; }
function colorOf(c) {
  if (typeof c !== 'string' || c[0] === '#') return c;
  const [r, t] = c.split(':');
  return rampOf(r)[Number(t)] ?? c;
}

function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Les pixels d'un trait (algorithme de Bresenham), en suivant tous les points donnés. */
function linePixels(pts, w = 1) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    let [x0, y0] = pts[k].map(Math.round); const [x1, y1] = pts[k + 1].map(Math.round);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let a = 0; a < w; a++) out.push(dx >= -dy ? [x0, y0 + a] : [x0 + a, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  return out;
}

/** Le test « ce pixel est-il dans la forme ? » et son cadre. */
function geometry(sh) {
  if (sh.e) {
    const [cx, cy, rx, ry] = sh.e;
    return { inside: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, box: [cx - rx, cy - ry, cx + rx, cy + ry] };
  }
  if (sh.r) {
    const [x0, y0, w, h] = sh.r;
    return { inside: (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h, box: [x0, y0, x0 + w, y0 + h] };
  }
  const pts = sh.p;
  return { inside: (x, y) => inPoly(x, y, pts), box: [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))] };
}

/**
 * Calcule la grille de couleurs d'un portrait (32 × 32, null = fond).
 * Renvoie { fig, bg } : la silhouette et le fond, séparément (le fond est peint sous la silhouette).
 */
export function pixelGrid(def) {
  const own = Array.from({ length: N }, () => Array(N).fill(-1)); // quelle forme possède chaque pixel
  const tone = Array.from({ length: N }, () => Array(N).fill(0));
  const shapes = def.shapes || [];
  shapes.forEach((sh, i) => {
    const ramp = rampOf(sh.c);
    const clip = sh.clip || [-99, -99, 99, 99];
    const ok = (x, y) => x >= clip[0] && y >= clip[1] && x <= clip[2] && y <= clip[3] && x >= 0 && y >= 0 && x < N && y < N;
    if (sh.l) {
      for (const [x, y] of linePixels(sh.l, sh.w || 1)) if (ok(x, y)) { own[y][x] = i; tone[y][x] = sh.tone ?? 2; }
      return;
    }
    const { inside, box } = geometry(sh);
    const shade = sh.shade || (sh.e ? 'ball' : 'bevel');
    const isIn = (x, y) => ok(x, y) && inside(x + 0.5, y + 0.5);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!isIn(x, y)) continue;
      if (sh.cut) { own[y][x] = -1; continue; }
      let t = sh.tone ?? 2;
      if (shade === 'ball' && sh.e) {
        const [cx, cy, rx, ry] = sh.e;
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
        t = d > 0.86 ? 3 : d > 0.42 ? 2 : d > 0.08 ? 1 : 0;
      } else if (shade === 'bevel' || shade === 'grad' || shade === 'ball') {
        const u = (x + 0.5 - box[0]) / Math.max(1, box[2] - box[0]), v = (y + 0.5 - box[1]) / Math.max(1, box[3] - box[1]);
        const k = shade === 'grad' ? v : u * 0.45 + v * 0.75;
        t = k > 0.78 ? 1 : 2;
        if (shade !== 'grad') {
          const tl = !isIn(x - 1, y) || !isIn(x, y - 1);
          const br = !isIn(x + 1, y) || !isIn(x, y + 1);
          if (br) t = Math.max(0, t - 1);
          else if (tl) t = 3;
        } else if (v < 0.22) t = 3;
      }
      if (sh.tex === 'mail' && x % 2 === 0 && y % 2 === 0) t = Math.max(0, t - 1); // cotte de mailles
      else if (sh.tex === 'rows' && y % 2 === 1) t = Math.max(0, t - 1); // fourrure, paille, planches
      else if (sh.tex === 'cols' && x % 2 === 1) t = Math.max(0, t - 1); // plis d'une robe
      else if (sh.tex === 'check' && t === 2 && (x * 3 + y * 5) % 7 === 0) t = 1; // grain (boue, chair, toile)
      else if (sh.tex === 'scales' && (y % 3 === 2 || ((x + (Math.floor(y / 3) % 2) * 2) % 4 === 0 && y % 3 === 0))) t = Math.max(0, t - 1); // écailles
      own[y][x] = i; tone[y][x] = t;
    }
  });
  // Couleurs + petites ombres portées (une forme devant fait de l'ombre à celle de derrière, en bas et à droite)
  const fig = Array.from({ length: N }, () => Array(N).fill(null));
  const grp = (i) => shapes[i]?.g ?? `#${i}`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = own[y][x];
    if (i < 0) continue;
    const ramp = rampOf(shapes[i].c);
    let t = tone[y][x];
    const front = (xx, yy, all) => {
      const j = own[yy]?.[xx];
      if (j === undefined || j <= i || grp(j) === grp(i) || shapes[j].cast === false) return false;
      return all || shapes[j].line;
    };
    if (front(x - 1, y, true) || front(x, y - 1, true) || front(x - 1, y - 1, true)) t = 0;
    else if (front(x + 1, y) || front(x, y + 1)) t = 0;
    fig[y][x] = ramp[t];
  }
  // Le contour extérieur
  const out = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (fig[y][x]) { out[y][x] = fig[y][x]; continue; }
    if (def.outline === false) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => fig[y + dy]?.[x + dx]);
    if (near) out[y][x] = def.outline || OUTLINE;
  }
  // Les détails à la main
  for (const [col, list] of def.px || []) for (const [x, y] of list) if (x >= 0 && y >= 0 && x < N && y < N) out[y][x] = col === null ? null : colorOf(col);
  for (const [ox, oy, rows, pal] of def.pat || []) {
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch === '.' || ch === ' ') return;
      const x = ox + dx, y = oy + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      out[y][x] = ch === '_' ? null : colorOf(pal?.[ch] ?? ch);
    }));
  }
  return { fig: out, bg: background(def.bg) };
}

/** Le fond : trois bandes (bas sombre, milieu, haut plus clair), tramées en damier à chaque passage, et un halo derrière la tête. */
function background(bg = ['#0e0a14', '#1e1628', '#2e2238']) {
  const [dark, mid, light = mid] = bg;
  const g = Array.from({ length: N }, () => Array(N).fill(dark));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot((x + 0.5 - 13) / 1.15, y + 0.5 - 11); // le halo, en haut à gauche du centre
    const dith = (x + y) % 2 === 0;
    g[y][x] = d < 9 ? light : d < 10.5 ? (dith ? light : mid) : d < 16 ? mid : d < 17.5 ? (dith ? mid : dark) : dark;
  }
  return g;
}

/** Le portrait en SVG (texte). Les carrés de même couleur sont regroupés en un seul chemin, par lignes. */
export function pixelSvg(def) {
  const { fig, bg } = pixelGrid(def);
  const paths = new Map();
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = fig[y][x] || bg[y][x];
      let w = 1;
      while (x + w < N && (fig[y][x + w] || bg[y][x + w]) === c) w++;
      paths.set(c, (paths.get(c) || '') + `M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  }
  const body = [...paths].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${body}</svg>`;
}
