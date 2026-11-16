// ============================================================
//  art/kit.js — La boîte à outils des illustrations dessinées en code (SVG)
// ============================================================
// Chaque illustration est un petit dessin SVG de 100 × 100, écrit comme un texte. Ces outils évitent de répéter les dégradés et les
// identifiants : chaque dessin reçoit un préfixe unique (`u`) pour que ses dégradés ne se mélangent jamais avec ceux d'un autre portrait
// affiché en même temps. La lumière vient toujours d'en haut à gauche (la lanterne), comme dans tout le jeu.

let counter = 0;
/** Un préfixe unique pour les identifiants d'un dessin. */
export const uid = () => `a${(++counter).toString(36)}`;

const stopsOf = (stops) =>
  stops.map(([offset, color, opacity]) => `<stop offset="${offset}" stop-color="${color}"${opacity !== undefined ? ` stop-opacity="${opacity}"` : ''}/>`).join('');

/** Un dégradé linéaire (par défaut de haut-gauche vers bas-droite). */
export const lin = (id, stops, [x1, y1, x2, y2] = [0, 0, 1, 1]) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsOf(stops)}</linearGradient>`;

/** Un dégradé circulaire (cx, cy, r en pourcentages de la forme ; fx/fy = le foyer, pour un éclat décentré). */
export const rad = (id, stops, [cx = 50, cy = 50, r = 50, fx = cx, fy = cy] = []) =>
  `<radialGradient id="${id}" cx="${cx}%" cy="${cy}%" r="${r}%" fx="${fx}%" fy="${fy}%">${stopsOf(stops)}</radialGradient>`;

/** Une lueur : un disque qui s'éteint sur les bords. */
export const glow = (u, name, color, opacity = 0.5) => rad(`${u}${name}`, [[0, color, opacity], [1, color, 0]]);

/**
 * L'enveloppe d'un dessin : le fond (halo chaud sur nuit), le contenu, puis un voile sombre sur les bords qui unifie tous les portraits.
 * @param inner  le contenu (formes SVG)
 * @param defs   les dégradés et filtres propres au dessin
 * @param bg     [couleur du centre, couleur du bord, couleur du halo] ; `at` = où est le halo
 */
export function wrap(u, { defs = '', inner = '', bg = ['#2b3b50', '#0a0f16', '#f5a83b'], at = [38, 34], halo = 0.38, vignette = 0.6 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>
${rad(`${u}bg`, [[0, bg[0]], [1, bg[1]]], [50, 38, 78])}
${glow(u, 'halo', bg[2], halo)}
${rad(`${u}vg`, [[0.55, '#000', 0], [1, '#000', vignette]], [50, 46, 62])}
${defs}</defs>
<rect width="100" height="100" fill="url(#${u}bg)"/>
<circle cx="${at[0]}" cy="${at[1]}" r="46" fill="url(#${u}halo)"/>
${inner}
<rect width="100" height="100" fill="url(#${u}vg)"/>
</svg>`;
}
