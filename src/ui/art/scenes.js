// ============================================================
//  art/scenes.js — Les décors du champ de bataille et les vignettes des cases (SVG dessiné en code)
// ============================================================
// Les décors (5) se posent derrière les combattants : ils restent sombres et peu contrastés pour ne jamais gêner la lecture.
// Les vignettes (8, une par type de case) illustrent la carte de la case en cours : coffre, piège, fontaine...

import { lin, rad } from './kit.js';

const svgOf = (w, h, defs, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"${extra}><defs>${defs}</defs>${inner}</svg>`;

/** Un halo de lumière posé en (x, y). */
const lamp = (u, id, color, alpha = 0.5) => rad(`${u}${id}`, [[0, color, alpha], [0.55, color, alpha * 0.35], [1, color, 0]]);

/** Une flamme (bougie, torche) : lueur + goutte de feu. */
const flame = (u, x, y, s = 1, glowId = 'fl') =>
  `<circle cx="${x}" cy="${y}" r="${14 * s}" fill="url(#${u}${glowId})"/><path d="M${x} ${y - 6 * s} C${x - 3.4 * s} ${y - 1 * s} ${x - 2.6 * s} ${y + 3.6 * s} ${x} ${y + 4 * s} C${x + 2.6 * s} ${y + 3.6 * s} ${x + 3.4 * s} ${y - 1 * s} ${x} ${y - 6 * s} Z" fill="#ffd36a"/><path d="M${x} ${y - 2.4 * s} C${x - 1.4 * s} ${y} ${x - 1 * s} ${y + 2.4 * s} ${x} ${y + 2.6 * s} C${x + 1 * s} ${y + 2.4 * s} ${x + 1.4 * s} ${y} ${x} ${y - 2.4 * s} Z" fill="#fff6d0"/>`;

// ============================================================
//  Les décors (320 × 130)
// ============================================================

function caves(u) {
  const defs = [
    lin(`${u}bg`, [[0, '#0a1316'], [0.55, '#15282b'], [1, '#0a1214']], [0, 0, 0, 1]),
    lamp(u, 'far', '#ffd88a', 0.3),
    lin(`${u}rock`, [[0, '#050a0b'], [1, '#0e1a1c']], [0, 0, 0, 1]),
    lin(`${u}floor`, [[0, '#244a4a', 0.55], [1, '#0a1618', 0]], [0, 0, 0, 1]),
    lamp(u, 'shroom', '#6af0ff', 0.7)
  ].join('');
  const drips = [6, 24, 44, 66, 92, 118, 140, 170, 196, 222, 250, 276, 298, 312].map((x, i) => {
    const hgt = 14 + ((i * 37) % 30);
    return `<path d="M${x - 5 - (i % 3)} 0 L${x} ${hgt} L${x + 5 + (i % 2)} 0 Z" fill="url(#${u}rock)"/><path d="M${x - 5} 0 L${x} ${hgt}" stroke="#3a6a6a" stroke-width=".6" opacity=".5"/>`;
  }).join('');
  const mites = [[14, 130, 22], [40, 130, 12], [286, 130, 24], [304, 130, 14], [262, 130, 10]].map(([x, y, hgt]) => `<path d="M${x - 6} ${y} L${x} ${y - hgt} L${x + 6} ${y} Z" fill="#06100f"/><path d="M${x - 6} ${y} L${x} ${y - hgt}" stroke="#3a6a6a" stroke-width=".6" opacity=".45"/>`).join('');
  const inner = `
<rect width="320" height="130" fill="url(#${u}bg)"/>
<ellipse cx="160" cy="52" rx="120" ry="64" fill="url(#${u}far)"/>
<path d="M122 130 V80 C122 58 138 46 160 46 C182 46 198 58 198 80 V130 Z" fill="#030708"/>
<path d="M130 130 V82 C130 64 142 54 160 54 C178 54 190 64 190 82 V130 Z" fill="url(#${u}far)" opacity=".95"/>
<ellipse cx="160" cy="92" rx="22" ry="34" fill="#ffe9b0" opacity=".16"/>
<path d="M126 100 H194" stroke="#ffe9b0" stroke-width=".8" opacity=".25"/>
<path d="M0 0 H78 C70 30 50 52 30 80 C18 98 6 112 0 130 Z M320 0 H242 C250 30 270 52 290 80 C302 98 314 112 320 130 Z" fill="url(#${u}rock)"/>
${drips}${mites}
<rect y="92" width="320" height="38" fill="url(#${u}floor)"/>
<g opacity=".5"><ellipse cx="90" cy="106" rx="34" ry="4.6" fill="#3a8a8a"/><ellipse cx="228" cy="112" rx="42" ry="5" fill="#3a8a8a"/><ellipse cx="90" cy="105" rx="20" ry="1.6" fill="#fff" opacity=".25"/><ellipse cx="228" cy="111" rx="26" ry="1.8" fill="#fff" opacity=".22"/></g>
<g fill="#ffffff" opacity=".05"><ellipse cx="80" cy="84" rx="80" ry="9"/><ellipse cx="250" cy="90" rx="90" ry="10"/><ellipse cx="160" cy="98" rx="120" ry="8"/></g>
<g><circle cx="52" cy="120" r="9" fill="url(#${u}shroom)"/><circle cx="52" cy="120" r="1.6" fill="#d0ffff"/><circle cx="62" cy="123" r="1.2" fill="#d0ffff"/><circle cx="268" cy="118" r="10" fill="url(#${u}shroom)"/><circle cx="268" cy="118" r="1.6" fill="#d0ffff"/><circle cx="276" cy="122" r="1.1" fill="#d0ffff"/></g>`;
  return svgOf(320, 130, defs, inner);
}

function crypt(u) {
  const defs = [
    lin(`${u}bg`, [[0, '#080b18'], [0.5, '#141a34'], [1, '#080a14']], [0, 0, 0, 1]),
    lamp(u, 'moon', '#7a9aff', 0.3),
    lin(`${u}stone`, [[0, '#2a3256'], [1, '#0c1020']], [0, 0, 0, 1]),
    lin(`${u}beyond`, [[0, '#4a62c0', 0.55], [1, '#1a2250', 0.2]], [0, 0, 0, 1]),
    lin(`${u}floor`, [[0, '#26305a', 0.5], [1, '#07090f', 0]], [0, 0, 0, 1]),
    lamp(u, 'fl', '#ffc86a', 0.7)
  ].join('');
  const arch = (cx, w, top, bot) => `<path d="M${cx - w} ${bot} V${top + 24} C${cx - w} ${top + 8} ${cx - 4} ${top + 2} ${cx} ${top - 6} C${cx + 4} ${top + 2} ${cx + w} ${top + 8} ${cx + w} ${top + 24} V${bot} Z" fill="url(#${u}beyond)"/><path d="M${cx - w} ${bot} V${top + 24} C${cx - w} ${top + 8} ${cx - 4} ${top + 2} ${cx} ${top - 6} C${cx + 4} ${top + 2} ${cx + w} ${top + 8} ${cx + w} ${top + 24} V${bot}" fill="none" stroke="#6a7ac0" stroke-width="1.2" opacity=".55"/>`;
  const pillars = [58, 110, 210, 262].map((x) => `<rect x="${x - 6}" y="20" width="12" height="80" fill="url(#${u}stone)"/><rect x="${x - 8}" y="16" width="16" height="6" fill="#323c68"/><rect x="${x - 8}" y="96" width="16" height="6" fill="#323c68"/><path d="M${x - 6} 24 V98" stroke="#7a8ad0" stroke-width=".6" opacity=".35"/>`).join('');
  const lines = Array.from({ length: 9 }, (_, i) => `<path d="M160 82 L${-40 + i * 50} 130" stroke="#5a6ac0" stroke-width=".5" opacity=".18"/>`).join('') + [92, 100, 112, 126].map((y) => `<path d="M0 ${y} H320" stroke="#5a6ac0" stroke-width=".5" opacity=".14"/>`).join('');
  const inner = `
<rect width="320" height="130" fill="url(#${u}bg)"/>
<ellipse cx="160" cy="44" rx="130" ry="60" fill="url(#${u}moon)"/>
${arch(84, 24, 30, 100)}${arch(160, 26, 24, 100)}${arch(236, 24, 30, 100)}
${pillars}
<path d="M0 100 H320 V130 H0 Z" fill="url(#${u}floor)"/>${lines}
<g fill="#0a0d1c"><path d="M0 104 H44 L50 112 H0 Z"/><path d="M276 104 H320 V112 H270 Z"/><path d="M0 112 H52 V130 H0 Z"/><path d="M268 112 H320 V130 H268 Z"/></g>
<path d="M0 104 H44 L50 112 H0" fill="none" stroke="#6a7ac0" stroke-width=".7" opacity=".5"/><path d="M276 104 H320 M270 112 H320" fill="none" stroke="#6a7ac0" stroke-width=".7" opacity=".5"/>
${flame(u, 18, 98, 0.7)}${flame(u, 302, 98, 0.7)}
<g fill="#cfd8ff" opacity=".35"><circle cx="70" cy="60" r=".8"/><circle cx="150" cy="40" r=".7"/><circle cx="196" cy="70" r=".9"/><circle cx="250" cy="52" r=".7"/><circle cx="120" cy="88" r=".6"/><circle cx="280" cy="80" r=".7"/></g>`;
  return svgOf(320, 130, defs, inner);
}

function depths(u) {
  const defs = [
    lin(`${u}bg`, [[0, '#0a0405'], [0.55, '#240c0e'], [1, '#12060a']], [0, 0, 0, 1]),
    rad(`${u}heat`, [[0, '#ff5a1a', 0.5], [0.5, '#ff3a10', 0.18], [1, '#ff3a10', 0]]),
    lin(`${u}rock`, [[0, '#2a1416'], [1, '#080304']], [0, 0, 0, 1]),
    lin(`${u}floor`, [[0, '#3a1410', 0.7], [1, '#080304', 0]], [0, 0, 0, 1])
  ].join('');
  const col = (x, w, hgt, lean) => `<path d="M${x} 130 L${x + lean} ${130 - hgt} L${x + w + lean * 0.6} ${130 - hgt + 8} L${x + w} 130 Z" fill="url(#${u}rock)"/><path d="M${x} 130 L${x + lean} ${130 - hgt}" stroke="#ff7a3a" stroke-width=".7" opacity=".45"/>`;
  const cracks = [[40, 118, 84, 108, 120, 116, 160, 106], [168, 106, 204, 118, 238, 108, 280, 116], [90, 126, 130, 120, 160, 126]];
  const veins = cracks.map((p) => `<polyline points="${p.join(' ')}" fill="none" stroke="#ff4a14" stroke-width="3.4" stroke-linejoin="round" opacity=".28"/><polyline points="${p.join(' ')}" fill="none" stroke="#ffb040" stroke-width="1.1" stroke-linejoin="round" opacity=".85"/>`).join('');
  const chains = [60, 258].map((x) => Array.from({ length: 9 }, (_, i) => `<ellipse cx="${x + (i % 2 ? 1.4 : -1.4)}" cy="${3 + i * 7}" rx="2.2" ry="3.2" fill="none" stroke="#6a5048" stroke-width="1.1"/>`).join('')).join('');
  const embers = [[30, 90], [64, 70], [104, 100], [150, 84], [196, 96], [238, 74], [286, 92], [300, 60], [120, 50], [220, 40]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.8 + (i % 3) * 0.4}" fill="#ff9a3a" opacity="${0.4 + (i % 4) * 0.12}"/>`).join('');
  const inner = `
<rect width="320" height="130" fill="url(#${u}bg)"/>
<ellipse cx="160" cy="124" rx="170" ry="70" fill="url(#${u}heat)"/>
<path d="M96 130 V50 C96 30 124 16 160 16 C196 16 224 30 224 50 V130" fill="none" stroke="#3a1a1c" stroke-width="10" opacity=".7"/>
<path d="M0 0 H56 L48 40 L34 70 L40 130 H0 Z M320 0 H264 L272 40 L286 70 L280 130 H320 Z" fill="url(#${u}rock)"/>
${col(70, 14, 52, 4)}${col(236, 14, 62, -5)}${col(10, 16, 36, 2)}${col(294, 16, 40, -3)}
${chains}
<path d="M0 104 H320 V130 H0 Z" fill="url(#${u}floor)"/>${veins}${embers}`;
  return svgOf(320, 130, defs, inner);
}

function terriers(u) {
  const defs = [
    lin(`${u}bg`, [[0, '#120c07'], [0.55, '#24170d'], [1, '#0c0804']], [0, 0, 0, 1]),
    rad(`${u}mouth`, [[0, '#ffe2a0', 0.75], [0.5, '#c8883a', 0.35], [1, '#4a2c12', 0]]),
    lin(`${u}earth`, [[0, '#08050a', 0], [1, '#050302']], [0, 0, 0, 1]),
    lin(`${u}floor`, [[0, '#4a3018', 0.6], [1, '#0a0603', 0]], [0, 0, 0, 1])
  ].join('');
  const roots = [[24, 0, 40, 50, 30, 70], [70, 0, 62, 36, 76, 58], [128, 0, 120, 30, 130, 46], [196, 0, 204, 34, 192, 56], [256, 0, 246, 44, 262, 66], [300, 0, 292, 30, 304, 48]]
    .map(([x, y, cx, cy, ex, ey]) => `<path d="M${x} ${y} Q${cx} ${cy} ${ex} ${ey}" fill="none" stroke="#3a2512" stroke-width="3.4" stroke-linecap="round"/><path d="M${x} ${y} Q${cx} ${cy} ${ex} ${ey}" fill="none" stroke="#7a5a30" stroke-width=".8" stroke-linecap="round" opacity=".6"/>`).join('');
  const stones = [[40, 116, 6], [96, 122, 4], [214, 118, 5], [270, 124, 7], [160, 120, 3.4], [300, 112, 4]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.62}" fill="#3a2e22"/><ellipse cx="${x - r * 0.2}" cy="${y - r * 0.2}" rx="${r * 0.5}" ry="${r * 0.22}" fill="#8a7a62" opacity=".5"/>`).join('');
  const inner = `
<rect width="320" height="130" fill="url(#${u}bg)"/>
<ellipse cx="160" cy="46" rx="70" ry="48" fill="#06040a"/>
<ellipse cx="160" cy="46" rx="70" ry="48" fill="url(#${u}mouth)"/>
<path d="M90 46 C90 14 126 -2 160 -2 C194 -2 230 14 230 46" fill="none" stroke="#2a1a0c" stroke-width="12"/>
<path d="M0 0 H84 C70 26 60 44 40 74 L36 130 H0 Z M320 0 H236 C250 26 260 44 280 74 L284 130 H320 Z" fill="#0a0603" opacity=".85"/>
${roots}
<path d="M0 100 H320 V130 H0 Z" fill="url(#${u}floor)"/>
${stones}
<g><ellipse cx="34" cy="108" rx="16" ry="7" fill="#050302"/><ellipse cx="288" cy="110" rx="18" ry="7" fill="#050302"/><circle cx="29" cy="107" r="1.1" fill="#ff4a3a"/><circle cx="35" cy="107" r="1.1" fill="#ff4a3a"/></g>
<path d="M150 120 l-4 -7 M156 122 l1 -8 M164 121 l4 -7" stroke="#5a8a3a" stroke-width="1.4" stroke-linecap="round"/>
<g fill="#cdbf9a" opacity=".5"><path d="M214 124 h10 M219 120 v8" stroke="#cdbf9a" stroke-width="1.6" stroke-linecap="round"/></g>`;
  return svgOf(320, 130, defs, inner);
}

function training(u) {
  const defs = [
    lin(`${u}bg`, [[0, '#16130d'], [0.55, '#2a2418'], [1, '#100d08']], [0, 0, 0, 1]),
    lin(`${u}floor`, [[0, '#5a4630', 0.55], [1, '#0a0703', 0]], [0, 0, 0, 1]),
    lamp(u, 'fl', '#ffb85a', 0.75),
    lin(`${u}banner`, [[0, '#a02a2e'], [1, '#4a0e14']], [0, 0, 0, 1])
  ].join('');
  const planks = Array.from({ length: 9 }, (_, i) => `<path d="M160 86 L${-60 + i * 55} 130" stroke="#0a0703" stroke-width=".8" opacity=".5"/>`).join('') + [96, 106, 118].map((y) => `<path d="M0 ${y} H320" stroke="#0a0703" stroke-width=".7" opacity=".4"/>`).join('');
  const banner = (x) => `<path d="M${x - 12} 0 V58 L${x} 50 L${x + 12} 58 V0 Z" fill="url(#${u}banner)"/><path d="M${x - 12} 4 H${x + 12}" stroke="#e0b34f" stroke-width="1.6"/><circle cx="${x}" cy="26" r="5" fill="none" stroke="#e0b34f" stroke-width="1.2"/><circle cx="${x}" cy="26" r="1.8" fill="#e0b34f"/>`;
  const rack = `<rect x="224" y="56" width="60" height="4" fill="#3a2a16"/><rect x="224" y="76" width="60" height="4" fill="#3a2a16"/><path d="M232 40 L236 76 M244 44 L246 76 M256 38 L258 76 M268 46 L270 76" stroke="#8a96a0" stroke-width="2" stroke-linecap="round"/><path d="M232 38 L236 44 M256 36 L258 42" stroke="#cfd8e0" stroke-width="1.4"/>`;
  const inner = `
<rect width="320" height="130" fill="url(#${u}bg)"/>
<g stroke="#0a0805" stroke-width="1" opacity=".5" fill="none"><path d="M0 28 H320 M0 56 H320 M40 0 V90 M120 0 V90 M200 0 V90 M280 0 V90"/></g>
${banner(60)}${banner(130)}${banner(190)}
${rack}
<path d="M0 90 H320 V130 H0 Z" fill="url(#${u}floor)"/>${planks}
${flame(u, 26, 52, 1)}${flame(u, 294, 40, 1)}
<rect x="23" y="58" width="6" height="22" fill="#2a1c0e"/><rect x="291" y="46" width="6" height="22" fill="#2a1c0e"/>
<g fill="#cfa86a" opacity=".3"><circle cx="100" cy="70" r=".8"/><circle cx="170" cy="60" r=".7"/><circle cx="220" cy="100" r=".8"/></g>`;
  return svgOf(320, 130, defs, inner);
}

export const SCENES = { caves, crypt, depths, terriers, training };

// ============================================================
//  Les vignettes des cases (360 × 120)
// ============================================================

function vignetteBase(u, top, bottom, glowColor, glowAt = [180, 64], glowAlpha = 0.5) {
  return [
    lin(`${u}bg`, [[0, top], [1, bottom]], [0, 0, 0, 1]),
    rad(`${u}gl`, [[0, glowColor, glowAlpha], [0.6, glowColor, glowAlpha * 0.25], [1, glowColor, 0]]),
    lin(`${u}floor`, [[0, '#000', 0], [1, '#000', 0.55]], [0, 0, 0, 1]),
    lin(`${u}stone`, [[0, '#3a4258'], [1, '#12161f']], [0, 0, 0, 1])
  ].join('') + `<!--${glowAt}-->`;
}
const wall = (u, tint = '#fff', alpha = 0.04) => `<g stroke="${tint}" stroke-width=".7" opacity="${alpha * 4}" fill="none"><path d="M0 24 H360 M0 52 H360 M0 80 H360"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${(i * 32 + (i % 2) * 14) % 360} ${i % 2 ? 24 : 0} V${i % 2 ? 52 : 24} M${(i * 41 + 20) % 360} 52 V80 M${(i * 29 + 8) % 360} 80 V110"/>`).join('')}</g>`;

function treasure(u) {
  const defs = vignetteBase(u, '#1a1a28', '#0a0a12', '#ffcf5a') + [
    lin(`${u}wood`, [[0, '#9a6a38'], [0.5, '#6a4222'], [1, '#2e1a0c']], [0, 0, 0, 1]),
    lin(`${u}iron`, [[0, '#8a96a4'], [1, '#2a323c']]),
    lin(`${u}gold`, [[0, '#fff2b0'], [0.5, '#e0aa3a'], [1, '#7a5014']]),
    lin(`${u}rays`, [[0, '#ffe08a', 0.7], [1, '#ffe08a', 0]], [0, 1, 0, 0])
  ].join('');
  const rays = [-62, -40, -20, 0, 20, 40, 62].map((a) => `<path d="M180 66 L${180 + Math.tan((a * Math.PI) / 180) * 70 - 7} -10 L${180 + Math.tan((a * Math.PI) / 180) * 70 + 7} -10 Z" fill="url(#${u}rays)" opacity=".5"/>`).join('');
  const coins = [[112, 106], [124, 110], [238, 108], [252, 104], [264, 110], [100, 112], [150, 112]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="5.4" ry="2.2" fill="url(#${u}gold)" transform="rotate(${(i * 23) % 40 - 20} ${x} ${y})"/>`).join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>${wall(u)}
<circle cx="180" cy="64" r="90" fill="url(#${u}gl)"/>${rays}
<path d="M0 98 H360 V120 H0 Z" fill="#0a0a12"/><path d="M0 98 H360" stroke="#3a4258" stroke-width=".8" opacity=".6"/>
<!-- le squelette et sa sacoche -->
<g opacity=".92"><path d="M34 98 C36 84 44 78 52 80 L58 98 Z" fill="#cfc4a4"/><circle cx="44" cy="74" r="7" fill="#d8ccac"/><circle cx="41.4" cy="73.4" r="1.6" fill="#10101a"/><circle cx="46.6" cy="73.4" r="1.6" fill="#10101a"/><path d="M42 79 H46.4" stroke="#10101a" stroke-width="1.2"/><path d="M58 90 C70 90 80 94 92 100" stroke="#cfc4a4" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M84 94 L96 98 L88 106 Z" fill="#6a4a2a"/></g>
<!-- coffre -->
<rect x="134" y="72" width="92" height="30" rx="3" fill="url(#${u}wood)"/>
<path d="M134 72 H226" stroke="#c89a62" stroke-width="1" opacity=".6"/>
<rect x="148" y="72" width="7" height="30" fill="url(#${u}iron)"/><rect x="205" y="72" width="7" height="30" fill="url(#${u}iron)"/>
<path d="M132 72 L138 48 C158 40 202 40 222 48 L228 72 Z" fill="url(#${u}wood)" transform="rotate(-5 132 72)"/>
<path d="M138 48 C158 40 202 40 222 48" fill="none" stroke="#e8b878" stroke-width="1" opacity=".6" transform="rotate(-5 132 72)"/>
<ellipse cx="180" cy="72" rx="44" ry="6" fill="#fff2b0" opacity=".9"/><ellipse cx="180" cy="71" rx="30" ry="3.4" fill="#fffbe6"/>
<rect x="174" y="80" width="12" height="12" rx="2" fill="url(#${u}gold)"/><circle cx="180" cy="86" r="1.8" fill="#4a3010"/>
<g fill="url(#${u}gold)"><circle cx="150" cy="70" r="2.6"/><circle cx="160" cy="68" r="2.2"/><circle cx="198" cy="69" r="2.4"/><circle cx="208" cy="70" r="2"/></g>
${coins}
<g fill="#fff8d0"><path d="M120 40 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6 Z"/><path d="M246 34 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2 Z"/></g>`;
  return svgOf(360, 120, defs, inner);
}

function trap(u) {
  const defs = vignetteBase(u, '#17161f', '#09080d', '#ff4a2a', [180, 70], 0.4) + [
    lin(`${u}spike`, [[0, '#f4f8fc'], [0.5, '#9aa6b2'], [1, '#3a4450']], [0, 0, 1, 0]),
    lin(`${u}plate`, [[0, '#6a6e80'], [1, '#222634']], [0, 0, 0, 1])
  ].join('');
  const spikes = Array.from({ length: 11 }, (_, i) => {
    const x = 96 + i * 17;
    const hgt = 24 + ((i * 7) % 11) + (i > 3 && i < 7 ? 8 : 0);
    return `<path d="M${x - 5} 100 L${x} ${100 - hgt} L${x + 5} 100 Z" fill="url(#${u}spike)"/><path d="M${x - 5} 100 L${x} ${100 - hgt}" stroke="#fff" stroke-width=".6" opacity=".7"/>`;
  }).join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>${wall(u)}
<circle cx="180" cy="74" r="96" fill="url(#${u}gl)"/>
<!-- trous de fléchettes dans le mur -->
<g><rect x="14" y="40" width="26" height="9" rx="2" fill="#07060a"/><circle cx="22" cy="44.5" r="2.4" fill="#000"/><circle cx="32" cy="44.5" r="2.4" fill="#000"/><path d="M40 45 L82 44" stroke="#aab4bf" stroke-width="1.6" stroke-linecap="round"/><path d="M82 44 L92 43.6 L84 41.6 Z" fill="#e8eef4"/><path d="M40 45 L50 42 M40 45 L50 48" stroke="#c0392b" stroke-width="1.4" stroke-linecap="round"/>
<rect x="320" y="58" width="26" height="9" rx="2" fill="#07060a"/><circle cx="328" cy="62.5" r="2.4" fill="#000"/></g>
<path d="M0 100 H360 V120 H0 Z" fill="#0b0a10"/>
<!-- dalle enfoncée -->
<path d="M120 100 L132 94 H228 L240 100 Z" fill="url(#${u}plate)"/><path d="M120 100 H240 V106 H120 Z" fill="#14161f"/>
<path d="M132 94 H228" stroke="#aab" stroke-width=".8" opacity=".5"/>
<!-- pieux -->
${spikes}
<path d="M90 100 H280" stroke="#14161f" stroke-width="3"/>
<g fill="#c0392b" opacity=".85"><path d="M150 82 l2 -5 l2 5 Z"/><path d="M222 78 l2 -5 l2 5 Z"/></g>
<g fill="#d8d0b8"><circle cx="304" cy="106" r="3.4"/><path d="M296 110 h16" stroke="#d8d0b8" stroke-width="1.6" stroke-linecap="round"/><path d="M60 108 h14 M64 111 h8" stroke="#d8d0b8" stroke-width="1.6" stroke-linecap="round"/></g>
<g fill="#ff7a3a" opacity=".7"><path d="M166 40 l2 7 l2 -7 Z"/></g>
<path d="M180 20 L172 34 H188 Z M180 40 v4" stroke="#ff4a2a" fill="#ff4a2a" stroke-width="2" stroke-linecap="round" opacity=".85"/>`;
  return svgOf(360, 120, defs, inner);
}

function fountain(u, { life = false } = {}) {
  const water = life ? ['#ff7a8a', '#d02a4a', '#7a1028'] : ['#c8f0ff', '#4aa8ff', '#1a4a9a'];
  const defs = vignetteBase(u, life ? '#1d1018' : '#101a2a', life ? '#0a0508' : '#05080f', water[1], [180, 56], 0.55) + [
    lin(`${u}water`, [[0, water[0], 0.95], [0.5, water[1], 0.85], [1, water[2], 0.9]], [0, 0, 0, 1]),
    lin(`${u}basin`, [[0, '#6a7288'], [0.5, '#363c4e'], [1, '#12151e']], [0, 0, 1, 1]),
    rad(`${u}pool`, [[0, water[0], 0.9], [1, water[1], 0.2]])
  ].join('');
  const sprays = [[-30, 26], [-18, 36], [-8, 44], [8, 44], [18, 36], [30, 26]].map(([dx, hgt]) => `<path d="M180 56 Q${180 + dx * 0.7} ${56 - hgt} ${180 + dx * 1.7} 74" fill="none" stroke="url(#${u}water)" stroke-width="2.4" stroke-linecap="round" opacity=".9"/><path d="M180 56 Q${180 + dx * 0.7} ${56 - hgt} ${180 + dx * 1.7} 74" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".6"/>`).join('');
  const motes = Array.from({ length: 14 }, (_, i) => `<circle cx="${96 + ((i * 53) % 170)}" cy="${18 + ((i * 29) % 70)}" r="${0.8 + (i % 3) * 0.5}" fill="${water[0]}" opacity="${0.4 + (i % 4) * 0.15}"/>`).join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>${wall(u, life ? '#ffd0d0' : '#d0e8ff')}
<circle cx="180" cy="56" r="100" fill="url(#${u}gl)"/>
<path d="M0 100 H360 V120 H0 Z" fill="#06070c"/>
<!-- vasque basse -->
<path d="M96 96 C96 86 140 82 180 82 C220 82 264 86 264 96 C264 106 220 110 180 110 C140 110 96 106 96 96 Z" fill="url(#${u}basin)"/>
<ellipse cx="180" cy="94" rx="80" ry="9" fill="url(#${u}pool)"/><ellipse cx="180" cy="93" rx="60" ry="4" fill="#fff" opacity=".25"/>
<path d="M98 96 C100 88 140 84 180 84" fill="none" stroke="#a8b0c8" stroke-width="1" opacity=".6"/>
<!-- colonne et coupe -->
<path d="M172 94 L174 66 H186 L188 94 Z" fill="url(#${u}basin)"/>
<path d="M148 66 C148 58 164 56 180 56 C196 56 212 58 212 66 C212 74 196 76 180 76 C164 76 148 74 148 66 Z" fill="url(#${u}basin)"/>
<ellipse cx="180" cy="62" rx="30" ry="5" fill="url(#${u}pool)"/>
${sprays}
<circle cx="180" cy="46" r="3.6" fill="${water[0]}"/>
${motes}
<path d="M120 96 C130 98 140 99 150 99 M210 99 C222 99 232 98 244 96" stroke="${water[0]}" stroke-width=".8" fill="none" opacity=".5"/>
${life
    ? `<g transform="translate(180 90)" opacity=".85"><path d="M0 4 C-10 -4 -6 -10 0 -5 C6 -10 10 -4 0 4 Z" fill="#ff4a6a"/></g>`
    : `<g transform="translate(180 90)" opacity=".8" fill="none" stroke="#e8faff" stroke-width=".9"><circle r="5"/><path d="M0 -3 V3 M-3 0 H3"/></g>`}`;
  return svgOf(360, 120, defs, inner);
}

function low_blow(u) {
  const defs = vignetteBase(u, '#1a1226', '#07050c', '#b07aff', [220, 58], 0.4) + [
    lin(`${u}blade`, [[0, '#ffffff'], [0.5, '#c8d4e4'], [1, '#6a7a92']], [0, 0, 1, 0]),
    lin(`${u}cloak`, [[0, '#2a2038'], [1, '#07050c']], [0, 0, 0, 1]),
    lamp(u, 'warm', '#ffb050', 0.6)
  ].join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>${wall(u, '#c8b0ff')}
<circle cx="276" cy="54" r="70" fill="url(#${u}warm)"/>
<path d="M0 104 H360 V120 H0 Z" fill="#06040a"/>
<!-- le compagnon, de dos, éclairé par la lanterne -->
<g><path d="M236 104 C236 74 246 56 268 54 C290 56 300 74 300 104 Z" fill="#3a3046"/><path d="M240 100 C240 76 250 60 268 58" fill="none" stroke="#ffc880" stroke-width="1.4" opacity=".7" stroke-linecap="round"/><circle cx="268" cy="44" r="12" fill="#4a3c58"/><path d="M257 40 C260 32 276 32 279 40" fill="none" stroke="#ffc880" stroke-width="1.2" opacity=".7"/></g>
<!-- la silhouette qui sort sa lame -->
<g><path d="M40 104 C40 70 54 50 84 46 C112 50 124 70 124 104 Z" fill="url(#${u}cloak)"/><path d="M60 50 C66 34 100 34 108 50 C100 58 68 58 60 50 Z" fill="#0a0710"/><circle cx="77" cy="48" r="1.8" fill="#c8a0ff"/><circle cx="92" cy="48" r="1.8" fill="#c8a0ff"/><path d="M44 96 C60 80 74 74 84 72" fill="none" stroke="#6a4a9a" stroke-width="1.2" opacity=".6" stroke-linecap="round"/></g>
<!-- poignard -->
<path d="M118 78 L206 52 L212 56 L122 86 Z" fill="url(#${u}blade)"/><path d="M118 78 L206 52" stroke="#fff" stroke-width="1" opacity=".9"/><path d="M118 82 L204 55" stroke="#4a5a72" stroke-width=".6" opacity=".7"/>
<path d="M104 74 L122 80 L120 90 L104 84 Z" fill="#3a2418"/><path d="M118 70 L126 92" stroke="#c8962e" stroke-width="3" stroke-linecap="round"/>
<path d="M206 52 L226 46 L212 56 Z" fill="#fff"/>
<g fill="#fff"><path d="M214 44 l1.8 5 l5 1.8 l-5 1.8 l-1.8 5 l-1.8 -5 l-5 -1.8 l5 -1.8 Z" opacity=".95"/><path d="M200 40 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1 Z" opacity=".7"/></g>`;
  return svgOf(360, 120, defs, inner);
}

function merchant(u) {
  const defs = vignetteBase(u, '#1d1710', '#0a0806', '#ffb050', [180, 56], 0.5) + [
    lin(`${u}awn`, [[0, '#d8c8a0'], [1, '#a89868']], [0, 0, 0, 1]),
    lin(`${u}wood`, [[0, '#7a5230'], [1, '#2a1a0c']], [0, 0, 0, 1]),
    lin(`${u}cloak`, [[0, '#4a3a2a'], [1, '#14100a']], [0, 0, 0, 1]),
    lamp(u, 'fl', '#ffc86a', 0.8)
  ].join('');
  const stripes = Array.from({ length: 8 }, (_, i) => `<path d="M${104 + i * 19} 18 H${123 + i * 19} L${120 + i * 19} 40 H${107 + i * 19} Z" fill="${i % 2 ? '#8a2a2e' : '#d8c8a0'}"/>`).join('');
  const bottles = [[128, '#5ad88a'], [144, '#ff6a8a'], [160, '#5aa8ff'], [200, '#ffd25a'], [216, '#c07aff'], [232, '#ff8a4a']].map(([x, c], i) => `<g><rect x="${x - 4}" y="${68 - (i % 2) * 3}" width="8" height="${14 + (i % 2) * 3}" rx="3" fill="${c}" opacity=".9"/><rect x="${x - 2}" y="${62 - (i % 2) * 3}" width="4" height="7" fill="#d8c8a8"/><path d="M${x - 2} ${72 - (i % 2) * 3} v6" stroke="#fff" stroke-width="1" opacity=".5"/></g>`).join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>${wall(u, '#ffd8a0')}
<circle cx="180" cy="56" r="100" fill="url(#${u}gl)"/>
<path d="M0 100 H360 V120 H0 Z" fill="#080604"/>
<!-- auvent -->
<path d="M96 14 H264 L276 40 H84 Z" fill="url(#${u}awn)"/>${stripes}
<path d="M84 40 C100 48 112 40 128 46 C144 52 160 42 180 48 C200 42 216 52 232 46 C248 40 260 48 276 40" fill="none" stroke="#6a1a20" stroke-width="2.2" opacity=".8"/>
<!-- lanternes -->
<path d="M110 40 V50 M250 40 V50" stroke="#6a5030" stroke-width="1.2"/>${flame(u, 110, 56, 0.9)}${flame(u, 250, 56, 0.9)}
<rect x="105" y="50" width="10" height="12" rx="2" fill="none" stroke="#c8962e" stroke-width="1"/><rect x="245" y="50" width="10" height="12" rx="2" fill="none" stroke="#c8962e" stroke-width="1"/>
<!-- comptoir et fioles -->
<rect x="104" y="82" width="152" height="20" fill="url(#${u}wood)"/><path d="M104 82 H256" stroke="#c89a62" stroke-width="1.4" opacity=".7"/>
${bottles}
<!-- le marchand -->
<g><path d="M154 82 C154 64 162 52 180 50 C198 52 206 64 206 82 Z" fill="url(#${u}cloak)"/><path d="M164 56 C166 44 194 44 196 56 C190 62 170 62 164 56 Z" fill="#0a0806"/><circle cx="175" cy="54" r="1.8" fill="#ffe08a"/><circle cx="185" cy="54" r="1.8" fill="#ffe08a"/><path d="M162 62 C166 56 172 52 180 51" fill="none" stroke="#e8b878" stroke-width="1" opacity=".6"/></g>
<g fill="#e0aa3a"><ellipse cx="270" cy="98" rx="7" ry="2.4"/><ellipse cx="270" cy="95" rx="7" ry="2.4" fill="#f4c850"/><ellipse cx="270" cy="92" rx="7" ry="2.4" fill="#ffd96a"/><ellipse cx="286" cy="99" rx="6" ry="2.2"/></g>`;
  return svgOf(360, 120, defs, inner);
}

function combat(u) {
  const defs = vignetteBase(u, '#170c10', '#050204', '#ff3a2a', [180, 60], 0.28) + [
    lamp(u, 'lan', '#ffc86a', 0.55)
  ].join('');
  const eyes = [[58, 40, '#ff3a2a', 1], [76, 40, '#ff3a2a', 1], [112, 62, '#ffd25a', 1.2], [126, 62, '#ffd25a', 1.2], [176, 28, '#ff3a2a', 0.9], [190, 28, '#ff3a2a', 0.9], [228, 66, '#ff5ac8', 1.1], [243, 66, '#ff5ac8', 1.1], [290, 36, '#ffd25a', 1], [304, 36, '#ffd25a', 1], [20, 70, '#7aff9a', 0.9], [32, 70, '#7aff9a', 0.9]]
    .map(([x, y, c, s]) => `<ellipse cx="${x}" cy="${y}" rx="${6 * s}" ry="${3.4 * s}" fill="${c}" opacity=".18"/><path d="M${x - 3.6 * s} ${y} C${x - 1 * s} ${y - 2.4 * s} ${x + 1 * s} ${y - 2.4 * s} ${x + 3.6 * s} ${y} C${x + 1 * s} ${y + 1.8 * s} ${x - 1 * s} ${y + 1.8 * s} ${x - 3.6 * s} ${y} Z" fill="${c}"/>`).join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>
<path d="M0 0 H360 V30 C320 18 280 26 240 18 C200 28 160 14 120 24 C80 16 40 28 0 20 Z" fill="#050204"/>
<path d="M0 90 C30 76 50 84 80 74 C110 66 130 80 160 72 C200 64 230 78 270 70 C300 64 330 74 360 70 V120 H0 Z" fill="#06030a"/>
${eyes}
<!-- la lueur de la lanterne du groupe -->
<circle cx="40" cy="110" r="64" fill="url(#${u}lan)"/>
<path d="M0 104 H360 V120 H0 Z" fill="#050204" opacity=".7"/>
<g stroke="#ff6a4a" stroke-width=".8" opacity=".35"><path d="M120 100 l-8 -8 M250 98 l8 -9"/></g>`;
  return svgOf(360, 120, defs, inner);
}

function boss(u) {
  const defs = vignetteBase(u, '#1c0a0a', '#050203', '#ff4a1a', [180, 70], 0.55) + [
    lin(`${u}door`, [[0, '#4a3a38'], [0.5, '#201816'], [1, '#0a0606']], [0, 0, 1, 1]),
    lin(`${u}iron`, [[0, '#8a7a72'], [1, '#2a2220']]),
    lamp(u, 'fl', '#ff9a3a', 0.9)
  ].join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>
<circle cx="180" cy="64" r="100" fill="url(#${u}gl)"/>
<!-- le portail -->
<path d="M110 120 V44 C110 14 144 0 180 0 C216 0 250 14 250 44 V120 Z" fill="#0a0506"/>
<path d="M122 120 V46 C122 22 148 10 180 10 C212 10 238 22 238 46 V120 Z" fill="url(#${u}door)"/>
<path d="M180 10 V120" stroke="#ff7a2a" stroke-width="2.4" opacity=".9"/><path d="M180 10 V120" stroke="#ffe0a0" stroke-width=".8" opacity=".9"/>
<path d="M122 120 V46 C122 22 148 10 180 10 C212 10 238 22 238 46 V120" fill="none" stroke="#7a5a50" stroke-width="2"/>
<!-- crâne du portail -->
<g transform="translate(180 50)"><path d="M0 -16 C12 -16 18 -8 17 2 C17 8 13 10 12 14 H-12 C-13 10 -17 8 -17 2 C-18 -8 -12 -16 0 -16 Z" fill="#8a7a6a"/><ellipse cx="-7" cy="0" rx="4.4" ry="5" fill="#120808"/><ellipse cx="7" cy="0" rx="4.4" ry="5" fill="#120808"/><circle cx="-7" cy="0.6" r="2.2" fill="#ff5a1a"/><circle cx="7" cy="0.6" r="2.2" fill="#ff5a1a"/><path d="M0 6 L-2.6 11 H2.6 Z" fill="#120808"/></g>
<g fill="url(#${u}iron)"><rect x="126" y="62" width="48" height="5"/><rect x="186" y="62" width="48" height="5"/><rect x="126" y="86" width="48" height="5"/><rect x="186" y="86" width="48" height="5"/></g>
<g fill="#cfc4b8"><circle cx="132" cy="64.5" r="1.6"/><circle cx="168" cy="64.5" r="1.6"/><circle cx="192" cy="64.5" r="1.6"/><circle cx="228" cy="64.5" r="1.6"/><circle cx="132" cy="88.5" r="1.6"/><circle cx="168" cy="88.5" r="1.6"/><circle cx="192" cy="88.5" r="1.6"/><circle cx="228" cy="88.5" r="1.6"/></g>
<!-- torches -->
<rect x="72" y="62" width="8" height="40" fill="#2a1a0c"/>${flame(u, 76, 54, 1.5)}<rect x="280" y="62" width="8" height="40" fill="#2a1a0c"/>${flame(u, 284, 54, 1.5)}
<!-- marches -->
<path d="M96 120 L104 104 H256 L264 120 Z" fill="#14100f"/><path d="M104 104 H256" stroke="#5a4a44" stroke-width="1" opacity=".6"/><path d="M84 120 L96 112 H264 L276 120 Z" fill="#0c0808"/>
<path d="M0 100 C20 96 40 100 60 98 M300 98 C320 100 340 96 360 100" stroke="#6a5048" stroke-width="1.4" fill="none" stroke-dasharray="3 3" opacity=".6"/>`;
  return svgOf(360, 120, defs, inner);
}


/** Le feu de camp : un foyer de pierres au milieu, des bûches, des sacs posés, la lueur chaude qui repousse le noir. */
function camp(u) {
  const defs = vignetteBase(u, '#1e130c', '#060403', '#ff9a3a', [180, 74], 0.6) + [
    lin(`${u}log`, [[0, '#6a4426'], [1, '#2a170a']], [0, 0, 0, 1]),
    lin(`${u}hearth`, [[0, '#6a625a'], [1, '#26221e']], [0, 0, 0, 1]),
    lamp(u, 'fl', '#ffc86a', 0.8),
    lin(`${u}bag`, [[0, '#7a5a3a'], [1, '#2e1e10']], [0, 0, 0, 1]),
    lamp(u, 'fire', '#ffb04a', 0.95)
  ].join('');
  const stones = [[150, 96], [162, 100], [176, 102], [190, 102], [204, 100], [214, 96]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="4.6" fill="url(#${u}hearth)"/>`).join('');
  const sparks = [[172, 34], [186, 26], [196, 40], [166, 46], [204, 22]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1 + (i % 2) * 0.6}" fill="#ffd27a" opacity="${0.5 + (i % 3) * 0.15}"/>`).join('');
  const inner = `
<rect width="360" height="120" fill="url(#${u}bg)"/>${wall(u, '#ffc890')}
<circle cx="182" cy="76" r="120" fill="url(#${u}fire)"/>
<path d="M0 98 C60 92 120 100 180 96 C240 92 300 100 360 96 V120 H0 Z" fill="#0a0604"/>
<!-- sacs et couverture posés près du feu -->
<path d="M70 104 C66 88 74 78 86 78 C98 78 104 88 102 104 Z" fill="url(#${u}bag)"/><path d="M78 80 C82 74 92 74 96 80" fill="none" stroke="#a07a4a" stroke-width="1.4"/>
<path d="M262 106 C270 96 300 94 316 100 C306 108 278 110 262 106 Z" fill="#5a2a22"/><path d="M266 104 C280 100 298 99 312 101" fill="none" stroke="#a8584a" stroke-width="1" opacity=".7"/>
<!-- bûches en croix -->
<path d="M150 98 L212 84" stroke="url(#${u}log)" stroke-width="8" stroke-linecap="round"/><path d="M152 84 L214 98" stroke="url(#${u}log)" stroke-width="8" stroke-linecap="round"/>
${stones}
<!-- les flammes -->
${flame(u, 182, 70, 2.4)}${flame(u, 170, 78, 1.4)}${flame(u, 195, 78, 1.5)}
${sparks}`;
  return svgOf(360, 120, defs, inner);
}

export const VIGNETTES = {
  treasure, trap, merchant, low_blow, combat, boss, camp,
  xp_fountain: (u) => fountain(u),
  life_fountain: (u) => fountain(u, { life: true })
};
