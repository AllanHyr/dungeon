// ============================================================
//  icons.js — Les petites icônes du jeu (dessinées en SVG, aucune image à charger)
// ============================================================
// Chaque icône tient dans un carré de 32x32. Elles prennent la couleur du texte
// qui les entoure (currentColor), donc on peut les colorier en CSS.

import { h } from './dom.js';
import { pixelIconBody } from './pixel-icons.js';

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  // --- Types de cases
  combat: `<path d="M6 6L22 22M26 6L10 22"/><path d="M18 26L26 18M6 18L14 26"/><path d="M22 22l5 5M10 22l-5 5"/>`,
  treasure: `<path d="M5 14h22v12H5z"/><path d="M5 14c0-5 4-8 11-8s11 3 11 8"/><path d="M5 19h22"/><rect x="14" y="17" width="4" height="5" rx="1" fill="currentColor"/>`,
  trap: `<path d="M3 27h26"/><path d="M5 27l3-15 3 15M12 27l4-19 4 19M21 27l3-15 3 15"/>`,
  fountain_xp: `<path d="M6 27h20M9 27v-4h14v4"/><path d="M16 23V14"/><path d="M16 14c-3-1-5 1-5 4M16 14c3-1 5 1 5 4"/><path d="M16 3l1.5 3.4 3.7.4-2.8 2.5.8 3.7-3.2-1.9-3.2 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="currentColor"/>`,
  fountain_life: `<path d="M6 27h20M9 27v-4h14v4"/><path d="M16 23V19"/><path d="M16 19L10.5 13.5C8 11 9 7.5 12 7.5c2 0 3.3 1.2 4 2.5.7-1.3 2-2.5 4-2.5 3 0 4 3.5 1.5 6z" fill="currentColor"/>`,
  low_blow: `<path d="M16 29L12 13h8z"/><path d="M9 13h14"/><path d="M16 13V6"/><circle cx="16" cy="4.5" r="1.8" fill="currentColor"/>`,
  merchant: `<circle cx="16" cy="16" r="11"/><path d="M16 8v16"/><path d="M12 12.5c0-1.8 1.8-3 4-3s4 1.2 4 3-1.8 2.6-4 3.2-4 1.4-4 3.3 1.8 3 4 3 4-1.2 4-3"/>`,
  boss: `<path d="M4 24V10l6 6 6-10 6 10 6-6v14z"/><path d="M4 28h24"/>`,
  unknown: `<path d="M11.5 12c0-3 2-5.5 4.8-5.5s4.7 2 4.7 4.8c0 3.4-4.7 3.8-4.7 7.7"/><circle cx="16.3" cy="25" r="1.5" fill="currentColor"/>`,
  start: `<path d="M8 28V4"/><path d="M8 5h17l-4 5 4 5H8"/>`,

  // --- Classes
  shield: `<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/>`,
  cross: `<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z"/>`,
  sword: `<path d="M16 3l3.5 3.5v13h-7v-13z"/><path d="M9.5 19.5h13M16 19.5V28"/>`,

  axe: `<path d="M8 29L21 11"/><path d="M12 5c5-2 11 0 15 5-5 4-10 5-14 3 2-2 2-5-1-8z"/>`,
  leaf: `<path d="M5 27C5 12 14 5 27 5c0 13-7 22-20 22z"/><path d="M5 27L19 13"/>`,
  swap: `<path d="M5 11h20M20 6l5 5-5 5"/><path d="M27 21H7M12 16l-5 5 5 5"/>`,
  flask: `<path d="M12 4h8M13 4v8L6 25a3 3 0 0 0 2.700 4.500h14.600A3 3 0 0 0 26 25l-7-13V4"/><path d="M9 21h14"/>`,
  refresh: `<path d="M26 14a10 10 0 1 0 1 6"/><path d="M26 6v8h-8"/>`,
  timer: `<circle cx="16" cy="18" r="10"/><path d="M16 12v6l4 3M12 4h8"/>`,
  user: `<circle cx="16" cy="11" r="6"/><path d="M5 28c1-6 5-9 11-9s10 3 11 9"/>`,

  // --- Monstres
  skull: `<path d="M16 4c-6 0-10 4-10 10 0 3 1.5 5 3 6.5V26h4v-3h6v3h4v-5.5c1.5-1.5 3-3.5 3-6.5 0-6-4-10-10-10z"/><circle cx="12" cy="14.5" r="2.3" fill="currentColor"/><circle cx="20" cy="14.5" r="2.3" fill="currentColor"/><path d="M16 18l-1.3 2.6h2.6z" fill="currentColor"/>`,
  beast: `<path d="M5 5l7 5h8l7-5v12c0 5-5 10-11 10S5 22 5 17z"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/><circle cx="20" cy="15" r="1.8" fill="currentColor"/><path d="M12 22l2 3 2-3 2 3 2-3"/>`,
  humanoid: `<path d="M16 3c-5 0-9 4-9 10v4l-3 11h24l-3-11v-4c0-6-4-10-9-10z"/><path d="M11 13h10v6H11z"/><circle cx="13.7" cy="16" r="1.2" fill="currentColor"/><circle cx="18.3" cy="16" r="1.2" fill="currentColor"/>`,
  slime: `<path d="M4 27c0-9 4-19 12-19s12 10 12 19z"/><circle cx="12" cy="19" r="2" fill="currentColor"/><circle cx="20" cy="19" r="2" fill="currentColor"/><path d="M13 24c2 1.5 4 1.5 6 0"/><path d="M16 8V4"/>`,
  demon: `<path d="M6 3c0 6 2 9 6 10M26 3c0 6-2 9-6 10"/><path d="M8 13h16v7c0 4-3.500 8-8 8s-8-4-8-8z"/><path d="M11 17l4 2M21 17l-4 2" /><path d="M12 24h8"/>`,
  ghost: `<path d="M7 28V14c0-6 4-10 9-10s9 4 9 10v14l-3.200-3-2.800 3-3-3-3 3-2.800-3z"/><circle cx="12.500" cy="14" r="1.800" fill="currentColor"/><circle cx="19.500" cy="14" r="1.800" fill="currentColor"/>`,

  // --- Interface
  d20: `<path d="M16 2.500l12.500 7.200v12.600L16 29.500 3.500 22.300V9.700z"/><path d="M16 8.500l7 12.200H9z"/>`,
  coin: `<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6.500"/>`,
  heart: `<path d="M16 28L5.500 17.500C2 14 3.500 7 9.500 7c3 0 5 1.800 6.500 4 1.500-2.200 3.500-4 6.500-4 6 0 7.500 7 4 10.500z"/>`,
  potion: `<path d="M12 4h8M13 4v7l-6 11a4.500 4.500 0 0 0 4 6.500h10a4.500 4.500 0 0 0 4-6.500l-6-11V4"/><path d="M9.500 19h13"/>`,
  star: `<path d="M16 3l3.700 7.800 8.300 1-6.100 5.800 1.600 8.400L16 21.800 8.500 26l1.600-8.400L4 11.800l8.300-1z"/>`,
  poison: `<path d="M16 3C12 10.500 8 15 8 20.500a8 8 0 0 0 16 0C24 15 20 10.500 16 3z"/><path d="M12.500 21a3.500 3.500 0 0 0 3.500 3.500"/>`,
  bolt: `<path d="M18.500 3L7 18.500h8L13 29l12-16.500h-8z"/>`,
  target: `<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5.500"/><circle cx="16" cy="16" r="1.500" fill="currentColor"/>`,
  up: `<path d="M16 27V7M7 15l9-9 9 9"/>`,
  down: `<path d="M16 5v20M7 17l9 9 9-9"/>`,
  curse: `<path d="M16 4c-6 0-10 4-10 10 0 3 1.500 5 3 6.500V26h4v-3h6v3h4v-5.500c1.500-1.500 3-3.500 3-6.500 0-6-4-10-10-10z"/><path d="M11 12l4 4M15 12l-4 4M17 12l4 4M21 12l-4 4"/>`,
  sound_on: `<path d="M4 12h5l8-7v22l-8-7H4z"/><path d="M21 11c2.500 2.500 2.500 7.500 0 10M25 7.500c4.500 4.500 4.500 12.500 0 17"/>`,
  sound_off: `<path d="M4 12h5l8-7v22l-8-7H4z"/><path d="M22 12l7 8M29 12l-7 8"/>`,
  save: `<path d="M5 5h18l4 4v18H5z"/><path d="M10 5v8h12V5M10 27v-9h12v9"/>`,
  book: `<path d="M4 6h9a3 3 0 0 1 3 3v18a3 3 0 0 0-3-3H4zM28 6h-9a3 3 0 0 0-3 3v18a3 3 0 0 1 3-3h9z"/>`,
  close: `<path d="M7 7l18 18M25 7L7 25"/>`,
  plus: `<path d="M16 6v20M6 16h20"/>`,
  check: `<path d="M5 17l7 7L27 8"/>`,
  alert: `<path d="M16 4L29 27H3z"/><path d="M16 13v7"/><circle cx="16" cy="23.5" r="1.3" fill="currentColor"/>`,
  weapon: `<path d="M16 3l3.500 3.500v13h-7v-13z"/><path d="M9.500 19.500h13M16 19.500V28"/>`,
  armor: `<path d="M10 4l-6 5 3 5 3-1v15h12V13l3 1 3-5-6-5-4 3h-4z"/>`,
  trinket: `<circle cx="16" cy="19" r="8"/><path d="M12 6h8l-2 5h-4z"/><circle cx="16" cy="19" r="3" fill="currentColor"/>`,
  consumable: `<path d="M12 4h8M13 4v7l-6 11a4.500 4.500 0 0 0 4 6.500h10a4.500 4.500 0 0 0 4-6.500l-6-11V4"/><path d="M9.500 19h13"/>`,
  lock: `<rect x="7" y="14" width="18" height="13" rx="2"/><path d="M11 14V10a5 5 0 0 1 10 0v4"/>`,
  eye: `<path d="M3 16s5-9 13-9 13 9 13 9-5 9-13 9S3 16 3 16z"/><circle cx="16" cy="16" r="4"/>`,
  gift: `<rect x="5" y="13" width="22" height="14" rx="1"/><path d="M3 9h26v4H3zM16 9v18"/><path d="M16 9c-2-5-8-4-6 0M16 9c2-5 8-4 6 0"/>`,
  trash: `<path d="M6 9h20M12 9V5h8v4M8 9l1 18h14l1-18"/>`,
  skip: `<path d="M5 6v20l12-10zM17 6v20l12-10z"/>`,
  flame: `<path d="M16 3c1 5.500 7.500 8.500 7.500 15.500a7.500 7.500 0 0 1-15 0c0-3.200 1.500-5.300 3.200-7 .3 2.200 1.300 3.500 2.600 3.800C14.200 11 15 7 16 3z"/>`,
  // --- Types d'objets et emplacements d'équipement
  head: `<path d="M7 27V15c0-6 4-10 9-10s9 4 9 10v12z"/><path d="M7 16h18M16 16v7M11 20v3M21 20v3"/>`,
  neck: `<path d="M6 4c1 11 5 15 10 15s9-4 10-15"/><path d="M16 19l-3.500 4.500L16 28l3.500-4.500z"/>`,
  shoulders: `<path d="M4 25c0-10 5-16 12-16s12 6 12 16z"/><path d="M9 25c0-5 3-9 7-9s7 4 7 9"/><path d="M16 9V5"/>`,
  back: `<path d="M10 5h12l5 22H5z"/><path d="M10 5c2 4 10 4 12 0"/><path d="M16 11v16"/><circle cx="16" cy="9" r="1.200" fill="currentColor"/>`,
  chest: `<path d="M10 4l-6 5 3 5 3-1v15h12V13l3 1 3-5-6-5-4 3h-4z"/>`,
  hands: `<path d="M10 27V17l-3-5 3-1.500 2.500 3.500V6.500a1.500 1.500 0 0 1 3 0V13V5.500a1.500 1.500 0 0 1 3 0V13V7a1.500 1.500 0 0 1 3 0v8l1.500-3a1.500 1.500 0 0 1 2.500 1.500L23 21v6z"/><path d="M10 24h13"/>`,
  belt: `<rect x="3" y="12" width="26" height="8" rx="2"/><rect x="12" y="10" width="8" height="12" rx="2"/><path d="M16 14v4"/>`,
  legs: `<path d="M8 4h16l-2 24h-5l-1-15-1 15H9z"/><path d="M8 10h16"/>`,
  feet: `<path d="M9 4h9v14l8 3.500c1.300.600 2 1.800 2 3.200V28H9z"/><path d="M9 23h10"/>`,
  ring: `<circle cx="16" cy="20" r="8"/><path d="M12 7l2-3h4l2 3-4 4z"/>`,
  offhand: `<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M16 8v16M10 14h12"/>`,
  relic: `<circle cx="16" cy="19" r="8"/><path d="M12 6h8l-2 5h-4z"/><circle cx="16" cy="19" r="3" fill="currentColor"/>`,
  sun: `<circle cx="16" cy="16" r="5.500"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.800 6.800l2.800 2.800M22.400 22.400l2.800 2.800M25.200 6.800l-2.800 2.800M9.600 22.400l-2.800 2.800"/>`,
  moon: `<path d="M25 19.500A11 11 0 0 1 12.500 7a11 11 0 1 0 12.500 12.500z"/>`,
  drop: `<path d="M16 4c-4.500 6-9 10.500-9 16a9 9 0 0 0 18 0c0-5.500-4.500-10-9-16z"/>`,
  wind: `<path d="M4 12h15a4 4 0 1 0-4-4"/><path d="M4 18h21a4 4 0 1 1-4 4"/><path d="M4 24h9"/>`,
  journal: `<path d="M7 4h15a3 3 0 0 1 3 3v21H10a3 3 0 0 1-3-3z"/><path d="M11 10h10M11 15h10M11 20h6"/>`
};

/**
 * Renvoie un élément <span class="icon"> contenant l'icône demandée.
 * `size` : un nombre (pixels) ou le mot 'fluid' : l'icône prend alors la taille que lui donne le CSS
 * de son parent (utile pour les médaillons dont la taille s'adapte à l'écran).
 */
export function icon(name, size = 20, cls = '') {
  const fluid = typeof size === 'string';
  const px = fluid ? '100%' : size;
  // En pixel art dès 14 px (en dessous, les pixels seraient plus petits qu'un point d'écran : on garde le dessin au trait)
  const pixel = (fluid || size >= 14) && pixelIconBody(PATHS[name] || pixelIconBody(name) ? name : 'unknown');
  return h('span', {
    class: `icon ${fluid ? 'fluid ' : ''}${pixel ? 'is-pixel ' : ''}${cls}`.trim(),
    style: fluid ? null : { width: size + 'px', height: size + 'px' },
    'aria-hidden': 'true',
    html: pixel
      ? `<svg viewBox="0 0 16 16" width="${px}" height="${px}" shape-rendering="crispEdges">${pixel}</svg>`
      : `<svg viewBox="0 0 32 32" width="${px}" height="${px}" ${S}>${PATHS[name] || PATHS.unknown}</svg>`
  });
}

/** Icône d'une case selon son type. */
export function tileIcon(content, type, size = 24) {
  return icon(content.tiles[type]?.icon || 'unknown', size);
}

export const hasIcon = (name) => !!PATHS[name] || !!pixelIconBody(name);
