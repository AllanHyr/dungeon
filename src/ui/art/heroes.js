// ============================================================
//  art/heroes.js — Les portraits des classes (SVG dessiné en code)
// ============================================================
// Un buste dans la lumière d'une lanterne : la lumière vient d'en haut à gauche, le reflet chaud court le long des bords.
// Chaque fonction reçoit un préfixe unique `u` et renvoie un <svg> complet de 100 × 100.

import { lin, rad, glow, wrap } from './kit.js';

/** Le Berserker : crinière rousse, barbe, peinture de guerre, manteau de fourrure, grande hache sur l'épaule. */
function berserker(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#f0c39a'], [0.55, '#c68a5e'], [1, '#7a4a32']]),
    lin(`${u}skinD`, [[0, '#b27a52'], [1, '#5c3825']], [0, 0, 0, 1]),
    lin(`${u}hair`, [[0, '#c4562b'], [0.5, '#7a2c18'], [1, '#2e0f0a']]),
    lin(`${u}beard`, [[0, '#8a4524'], [0.6, '#4a2112'], [1, '#22100a']]),
    lin(`${u}fur`, [[0, '#a89580'], [0.5, '#6b5948'], [1, '#2c231d']], [0, 0, 0.4, 1]),
    lin(`${u}hide`, [[0, '#4a382c'], [1, '#17110d']], [0, 0, 0, 1]),
    lin(`${u}steel`, [[0, '#f2f8ff'], [0.35, '#a9b9c8'], [1, '#3c4955']]),
    lin(`${u}wood`, [[0, '#8a5d36'], [1, '#3a2312']], [0, 0, 1, 0]),
    glow(u, 'eye', '#ffb36a', 0.9)
  ].join('');
  const inner = `
<!-- hache derrière l'épaule droite -->
<path d="M87 100 L71 20" stroke="url(#${u}wood)" stroke-width="4.6" stroke-linecap="round" fill="none"/>
<path d="M83.6 100 L67.8 20.6" stroke="#c99560" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".55"/>
<path d="M63 13 C72 3 90 5 96 21 C88 17 80 20 75 30 C72 24 67 19 63 13 Z" fill="url(#${u}steel)"/>
<path d="M63 13 C72 3 90 5 96 21" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".85"/>
<path d="M69.5 21.5 L77 26" stroke="#1f2a33" stroke-width="2" stroke-linecap="round" opacity=".5"/>
<!-- crinière derrière la tête -->
<path d="M27 46 C22 24 35 9 50 9 C65 9 78 24 73 46 C75 58 72 68 67 76 L33 76 C28 68 25 58 27 46 Z" fill="url(#${u}hair)"/>
<path d="M30 30 C33 20 40 14 48 12" fill="none" stroke="#ffb27a" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
<!-- poitrail -->
<path d="M4 100 L9 83 C18 71 32 67 40 67 L60 67 C68 67 82 71 91 83 L96 100 Z" fill="url(#${u}hide)"/>
<path d="M34 67 L66 67 L61 86 C56 95 44 95 39 86 Z" fill="url(#${u}skinD)"/>
<path d="M44 74 L48 86 M50 73 L53 88 M56 75 L57 85" stroke="#b3261a" stroke-width="1.7" stroke-linecap="round" fill="none" opacity=".8"/>
<!-- col de fourrure -->
<path d="M5 94 C6 86 8 82 11 79 C20 70 32 66 40 66 L48 79 L50 72 L52 79 L60 66 C68 66 80 70 89 79 C92 82 94 86 95 94 C88 86 80 82 72 83 C64 90 36 90 28 83 C20 82 12 86 5 94 Z" fill="url(#${u}fur)"/>
<path d="M9 82 l-3 -4 l5 1 l-1 -5 l5 3 l1 -5 l5 4 M91 82 l3 -4 l-5 1 l1 -5 l-5 3 l-1 -5 l-5 4" fill="none" stroke="#c9b8a2" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
<path d="M22 76 C28 71 34 69 40 68" fill="none" stroke="#f4e6d0" stroke-width="1" stroke-linecap="round" opacity=".6"/>
<!-- collier de crocs -->
<g fill="#f2ead2" stroke="#8a7a58" stroke-width=".4">
${[[38, 73], [41.5, 77], [46, 80], [50, 81], [54, 80], [58.5, 77], [62, 73]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.3" ry="2.1" transform="rotate(${(x - 50) * 3.2} ${x} ${y})"/>`).join('')}
</g>
<!-- cou et tête -->
<path d="M42 55 L42 69 C46 73 54 73 58 69 L58 55 Z" fill="url(#${u}skinD)"/>
<ellipse cx="50" cy="43" rx="15.2" ry="17.4" fill="url(#${u}skin)"/>
<!-- barbe -->
<path d="M33.5 44 C33 60 40 72 50 73 C60 72 67 60 66.5 44 C63.5 54.5 58 58 50 58 C42 58 36.5 54.5 33.5 44 Z" fill="url(#${u}beard)"/>
<path d="M37 56 C39 64 43 68 47 70 M63 56 C61 64 57 68 53 70" stroke="#c7803f" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".5"/>
<path d="M40.5 53.5 C45 49.5 49 51.5 50 53.5 C51 51.5 55 49.5 59.5 53.5 C56.5 58 52.5 57 50 56 C47.5 57 43.5 58 40.5 53.5 Z" fill="#3a1b0e"/>
<!-- nez -->
<path d="M48 42 L46.8 50.5 C49 52.5 51 52.5 53.2 50.5 L52 42 Z" fill="#b57a54"/>
<path d="M52 42 L53.2 50.5 C52.4 51.4 51.2 51.8 50 51.8 Z" fill="#000" opacity=".18"/>
<!-- peinture de guerre et yeux -->
<path d="M34.8 39.2 L65.2 38.4 L65 45.6 L35 46.4 Z" fill="#b3261a" opacity=".88"/>
<path d="M60 47 L63 57 M63.5 46 L66 54" stroke="#b3261a" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
<path d="M39.5 44 C41 41.8 44.6 41.6 46.6 43.5 C44.6 45.4 41.4 45.6 39.5 44 Z" fill="#fff1d6"/>
<path d="M60.5 44 C59 41.8 55.4 41.6 53.4 43.5 C55.4 45.4 58.6 45.6 60.5 44 Z" fill="#fff1d6"/>
<circle cx="43.4" cy="43.6" r="1.15" fill="#2a1209"/><circle cx="56.6" cy="43.6" r="1.15" fill="#2a1209"/>
<path d="M38.2 40.2 L47.2 41.8 L47 43 L38.4 41.6 Z M61.8 40.2 L52.8 41.8 L53 43 L61.6 41.6 Z" fill="#2f150b"/>
<path d="M39 35.5 L42.5 49" stroke="#f1c9b0" stroke-width=".9" stroke-linecap="round" opacity=".75"/>
<!-- frange -->
<path d="M34.5 38 C34 24 42 17.5 50 17.5 C58 17.5 66 24 65.5 38 C63 32.5 59 30.5 55.5 31.5 C55 28.5 52.5 28 50 30.5 C47.5 28 45 28.5 44.5 31.5 C41 30.5 37 32.5 34.5 38 Z" fill="url(#${u}hair)"/>
<path d="M38 30 C41 24 45 21.5 49 21" fill="none" stroke="#ffb27a" stroke-width="1" stroke-linecap="round" opacity=".6"/>
<!-- reflet chaud sur le côté éclairé -->
<path d="M35.5 36 C34.5 44 36 51 39 57" fill="none" stroke="#ffd9a8" stroke-width=".9" stroke-linecap="round" opacity=".55"/>`;
  return wrap(u, { defs, inner, bg: ['#5a2f26', '#0a0b11', '#ff9a4a'], at: [30, 30], halo: 0.42 });
}

/** Le Veilleur : heaume à fente, plumet pâle, tabard à croix, et la lanterne qui lui donne son nom. */
function veilleur(u) {
  const defs = [
    lin(`${u}steel`, [[0, '#dce8f5'], [0.4, '#8fa6bd'], [1, '#2c3b4b']]),
    lin(`${u}steelD`, [[0, '#6f869c'], [1, '#1b2735']], [0, 0, 0, 1]),
    lin(`${u}cloth`, [[0, '#f4ecd6'], [0.6, '#cbbf9e'], [1, '#7d7459']]),
    lin(`${u}gold`, [[0, '#fff0b8'], [0.5, '#e0b34f'], [1, '#8a6420']]),
    lin(`${u}hood`, [[0, '#2a4058'], [1, '#0f1824']], [0, 0, 0, 1]),
    rad(`${u}lamp`, [[0, '#fff4c4', 1], [0.35, '#ffcf6a', 0.65], [1, '#ff9a2a', 0]]),
    glow(u, 'warm', '#ffcf6a', 0.55)
  ].join('');
  const inner = `
<!-- auréole très pâle -->
<circle cx="50" cy="36" r="27" fill="none" stroke="#ffe7a8" stroke-opacity=".28" stroke-width="1.4"/>
<circle cx="50" cy="36" r="31" fill="none" stroke="#ffe7a8" stroke-opacity=".12" stroke-width="3"/>
<!-- capuche -->
<path d="M28 46 C26 24 37 13 50 13 C63 13 74 24 72 46 L76 76 L24 76 Z" fill="url(#${u}hood)"/>
<!-- corps -->
<path d="M3 100 L7 84 C16 72 30 68 38 68 L62 68 C70 68 84 72 93 84 L97 100 Z" fill="url(#${u}steelD)"/>
<path d="M38 68 L62 68 L67 100 L33 100 Z" fill="url(#${u}cloth)"/>
<path d="M50 70 L50 100" stroke="#7d7459" stroke-width=".5" opacity=".5"/>
<!-- croix du tabard -->
<path d="M46.4 76 H53.6 V83.4 H61 V90.6 H53.6 V99 H46.4 V90.6 H39 V83.4 H46.4 Z" fill="#2c5da4" stroke="url(#${u}gold)" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M47.4 77 H52.6 V84.4 M47.4 77 V84.4" fill="none" stroke="#7fb0f0" stroke-width=".6" opacity=".6"/>
<!-- épaulières -->
<path d="M5 90 C4 78 14 70 26 71 C34 72 38 76 37 82 C30 80 18 82 5 90 Z" fill="url(#${u}steel)"/>
<path d="M95 90 C96 78 86 70 74 71 C66 72 62 76 63 82 C70 80 82 82 95 90 Z" fill="url(#${u}steel)" opacity=".92"/>
<path d="M7 86 C10 77 17 73 26 72.5" fill="none" stroke="url(#${u}gold)" stroke-width="1.4" stroke-linecap="round"/>
<path d="M93 86 C90 77 83 73 74 72.5" fill="none" stroke="url(#${u}gold)" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
<circle cx="19" cy="80" r="1.6" fill="url(#${u}gold)"/><circle cx="81" cy="80" r="1.6" fill="url(#${u}gold)" opacity=".85"/>
<!-- gorgerin -->
<path d="M41 57 L59 57 L62 70 C55 74 45 74 38 70 Z" fill="url(#${u}steelD)"/>
<path d="M40 62 C47 65 53 65 60 62" fill="none" stroke="#9db4cc" stroke-width=".8" opacity=".6"/>
<!-- plumet -->
<path d="M50 17 C42 8 50 0 62 2 C56 6 58 13 52 18 Z" fill="#e6eefb"/>
<path d="M50 17 C46 10 52 4 59 3" fill="none" stroke="#9fb7d6" stroke-width=".8"/>
<!-- heaume -->
<path d="M32.5 47 C31.5 27 39.5 16.5 50 16.5 C60.5 16.5 68.5 27 67.5 47 L67.5 54 C61 61 39 61 32.5 54 Z" fill="url(#${u}steel)"/>
<path d="M32.8 40 H67.2" stroke="url(#${u}gold)" stroke-width="1.5"/>
<path d="M36 33 C38 25 43 20 49 18.6" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
<!-- fentes des yeux et nasal -->
<path d="M37.6 42.4 L47 43.4 L46.8 46.4 L38 45.4 Z" fill="#1a2433"/>
<path d="M62.4 42.4 L53 43.4 L53.2 46.4 L62 45.4 Z" fill="#1a2433"/>
<path d="M40 43.6 L46 44.2 L46 45.6 L40.4 45 Z M60 43.6 L54 44.2 L54 45.6 L59.6 45 Z" fill="#fff0b0"/>
<rect x="48.4" y="22" width="3.2" height="30" rx="1.2" fill="url(#${u}steelD)"/>
<rect x="48.8" y="22" width="1" height="30" fill="#d8e6f5" opacity=".55"/>
<path d="M44 52 L56 52 M45 55 L55 55 M46.5 58 L53.5 58" stroke="#16202c" stroke-width=".9" stroke-linecap="round" opacity=".75"/>
<!-- la lanterne -->
<circle cx="25" cy="76" r="22" fill="url(#${u}warm)"/>
<path d="M25 56 C25 52 29 52 29 56" fill="none" stroke="#d5a64a" stroke-width="1.3"/>
<path d="M18 62 L25 56 L32 62 Z" fill="url(#${u}gold)"/>
<path d="M19 62 H31 L29.4 82 H20.6 Z" fill="#1c1408" opacity=".7"/>
<path d="M20 63.5 H30 L28.6 80.6 H21.4 Z" fill="url(#${u}lamp)"/>
<path d="M25 66 C21.8 71 22.6 76 25 78.4 C27.4 76 28.2 71 25 66 Z" fill="#fffbe6"/>
<path d="M19.4 62 V82.4 M30.6 62 V82.4 M25 62 V82.4" stroke="#8a6420" stroke-width="1" opacity=".9"/>
<path d="M19 82.4 H31 L30 85 H20 Z" fill="url(#${u}gold)"/>
<ellipse cx="25" cy="90" rx="7.5" ry="5.5" fill="#26364a"/>
<path d="M19 86 C22 82 28 82 31 86" fill="none" stroke="#7d93ab" stroke-width="1"/>
<!-- reflet de lanterne sur le heaume -->
<path d="M33.4 36 C32.8 43 33.4 49 35.4 54" fill="none" stroke="#ffe0a0" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`;
  return wrap(u, { defs, inner, bg: ['#2b4560', '#070b12', '#ffcf6a'], at: [26, 70], halo: 0.34 });
}

/** Le Druide : capuche de feuilles, bois de cerf, regard de lumière verte, bâton à cristal. */
function druide(u) {
  const defs = [
    lin(`${u}cloak`, [[0, '#56854a'], [0.5, '#2e5a34'], [1, '#0f241a']]),
    lin(`${u}hood`, [[0, '#6aa05a'], [0.5, '#37663a'], [1, '#143020']], [0.1, 0, 0.9, 1]),
    lin(`${u}leaf`, [[0, '#a8e07a'], [1, '#2f7a3a']]),
    lin(`${u}leafD`, [[0, '#6fb05a'], [1, '#1d4a2a']]),
    lin(`${u}skin`, [[0, '#d9a77c'], [0.5, '#8a5c3e'], [1, '#2e1d14']]),
    lin(`${u}antler`, [[0, '#f6ecd0'], [1, '#9a8a62']], [0, 0, 1, 0]),
    lin(`${u}wood`, [[0, '#8d6a40'], [1, '#3b2814']], [0, 0, 1, 0]),
    rad(`${u}orb`, [[0, '#f6ffd0', 1], [0.4, '#b6ff6a', 0.85], [1, '#4fd05a', 0]]),
    glow(u, 'eye', '#c9ff7a', 0.95)
  ].join('');
  const leaf = (x, y, rot, s = 1, fill = 'leaf') => `<path d="M0 0 C-5 -6 -3 -14 0 -18 C3 -14 5 -6 0 0 Z" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="url(#${u}${fill})"/>`;
  const inner = `
<!-- bâton -->
<path d="M83 100 C80 72 84 44 78 18" stroke="url(#${u}wood)" stroke-width="3.6" stroke-linecap="round" fill="none"/>
<path d="M71 16 C69 6 82 3 84 13 C85 20 77 22 75 17" stroke="url(#${u}wood)" stroke-width="2.6" stroke-linecap="round" fill="none"/>
<circle cx="77" cy="12" r="9" fill="url(#${u}orb)"/>
<circle cx="77" cy="12" r="3.2" fill="#f4ffd8"/>
<!-- bois de cerf -->
<g stroke="url(#${u}antler)" stroke-linecap="round" fill="none">
<path d="M39 22 C34 16 33 9 31 2 M35.4 15.4 C30 14 26 10 24 5 M33 9 C36 6 37 3 36 0" stroke-width="2.4"/>
<path d="M61 22 C66 16 67 9 69 2 M64.6 15.4 C70 14 74 10 76 5 M67 9 C64 6 63 3 64 0" stroke-width="2.4"/>
</g>
<!-- manteau -->
<path d="M2 100 L7 82 C16 70 31 65 40 63 L60 63 C69 65 84 70 93 82 L98 100 Z" fill="url(#${u}cloak)"/>
<path d="M40 64 L50 92 L60 64" fill="#0d1a13" opacity=".55"/>
<!-- capuche -->
<path d="M25 58 C18 30 31 9 50 7 C69 9 82 30 75 58 C71 68 62 72 50 72 C38 72 29 68 25 58 Z" fill="url(#${u}hood)"/>
<path d="M30 40 C32 24 40 14 50 11" fill="none" stroke="#bfe99a" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
<!-- creux de la capuche -->
<path d="M33.5 53 C31.5 36 40 24.5 50 24.5 C60 24.5 68.5 36 66.5 53 C63 63 37 63 33.5 53 Z" fill="#0a130d"/>
<!-- visage dans l'ombre -->
<path d="M38 52 C37 42 43 36 50 36 C57 36 63 42 62 52 C60 60.5 40 60.5 38 52 Z" fill="url(#${u}skin)"/>
<path d="M44 38 C47 36.4 53 36.4 56 38 C54 41.5 46 41.5 44 38 Z" fill="#000" opacity=".5"/>
<path d="M39.5 43.5 L47.5 45.6 L47.2 47.4 L40 45.6 Z" fill="#000" opacity=".4"/>
<!-- yeux de lumière -->
<circle cx="44" cy="46" r="6" fill="url(#${u}eye)"/><circle cx="56" cy="46" r="6" fill="url(#${u}eye)"/>
<path d="M40 46.2 C42 44 45.6 44 47.6 46.2 C45.6 47.8 42 47.8 40 46.2 Z" fill="#e6ffb0"/>
<path d="M60 46.2 C58 44 54.4 44 52.4 46.2 C54.4 47.8 58 47.8 60 46.2 Z" fill="#e6ffb0"/>
<circle cx="44" cy="46.1" r="1" fill="#183a14"/><circle cx="56" cy="46.1" r="1" fill="#183a14"/>
<!-- nez, bouche, peinture -->
<path d="M49 48 L48 54 C49.4 55.2 50.6 55.2 52 54 L51 48 Z" fill="#7a4c33" opacity=".7"/>
<path d="M45.5 58 C48 59.4 52 59.4 54.5 58" stroke="#2a1710" stroke-width="1" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M39.5 52 C41.5 53 43.5 53.4 45 53.2 M60.5 52 C58.5 53 56.5 53.4 55 53.2" stroke="#9be86a" stroke-width="1" fill="none" stroke-linecap="round" opacity=".75"/>
<!-- col de feuilles -->
${[[16, 79, -62], [24, 74, -48], [33, 70, -30], [67, 70, 30], [76, 74, 48], [84, 79, 62], [41, 68, -12], [59, 68, 12]].map(([x, y, r], i) => leaf(x, y, r, 0.9 + (i % 3) * 0.12, i % 2 ? 'leaf' : 'leafD')).join('')}
${[[10, 88, -70], [90, 88, 70], [22, 84, -52], [78, 84, 52], [50, 76, 0, 0.8]].map(([x, y, r, s = 1], i) => leaf(x, y, r, s, i % 2 ? 'leafD' : 'leaf')).join('')}
<!-- lucioles -->
<g fill="#d8ff8a">
<circle cx="14" cy="34" r="1.1" opacity=".9"/><circle cx="22" cy="52" r=".8" opacity=".7"/><circle cx="90" cy="46" r="1" opacity=".8"/><circle cx="8" cy="62" r=".7" opacity=".6"/><circle cx="68" cy="30" r=".8" opacity=".6"/>
</g>`;
  return wrap(u, { defs, inner, bg: ['#2c5238', '#07100b', '#b6ff6a'], at: [50, 44], halo: 0.28 });
}

/** Le Duelliste : feutre à plume, longues boucles, moustache, col de cape cramoisie, rapière dressée. */
function duelliste(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#f2c9a6'], [0.55, '#cf9870'], [1, '#7e5238']]),
    lin(`${u}hair`, [[0, '#8a5a38'], [0.5, '#4d2c1c'], [1, '#1c0f0a']]),
    lin(`${u}felt`, [[0, '#3a3446'], [0.5, '#1d1a26'], [1, '#0a0910']]),
    lin(`${u}cape`, [[0, '#d23a3e'], [0.5, '#8c1d2a'], [1, '#3a0a14']]),
    lin(`${u}coat`, [[0, '#2f2a3c'], [1, '#0e0c14']], [0, 0, 0, 1]),
    lin(`${u}gold`, [[0, '#fff0b8'], [0.5, '#e0b34f'], [1, '#8a6420']]),
    lin(`${u}blade`, [[0, '#ffffff'], [0.4, '#cfdbe8'], [1, '#6c7d90']], [0, 0, 1, 0]),
    lin(`${u}feather`, [[0, '#f4fffb'], [0.5, '#9fe0d2'], [1, '#2f8a86']])
  ].join('');
  const inner = `
<!-- col haut de la cape -->
<path d="M8 100 L11 77 C20 66 31 62 38 60 L62 60 C69 62 80 66 89 77 L92 100 Z" fill="url(#${u}cape)"/>
<path d="M34 61 L26 40 L43 63 Z" fill="url(#${u}cape)"/><path d="M66 61 L74 40 L57 63 Z" fill="url(#${u}cape)"/>
<path d="M34 61 L27 43" stroke="#ff8a7a" stroke-width="1" stroke-linecap="round" opacity=".6"/>
<!-- pourpoint -->
<path d="M31 100 L35 70 C42 66 58 66 65 70 L69 100 Z" fill="url(#${u}coat)"/>
<path d="M40 70 L60 100" stroke="url(#${u}gold)" stroke-width="1.6" opacity=".9"/>
<g fill="url(#${u}gold)"><circle cx="50" cy="76" r="1.5"/><circle cx="50" cy="83" r="1.5"/><circle cx="50" cy="90" r="1.5"/><circle cx="50" cy="97" r="1.5"/></g>
<path d="M44 66 L50 71 L56 66 L56 69 L50 74 L44 69 Z" fill="#e9e2cf"/>
<!-- boucles -->
<path d="M37 34 C27 38 24 56 28 72 C34 66 37 56 39 46 Z" fill="url(#${u}hair)"/>
<path d="M63 34 C73 38 76 56 72 72 C66 66 63 56 61 46 Z" fill="url(#${u}hair)"/>
<!-- cou et visage -->
<path d="M43 56 L43 66 C47 69 53 69 57 66 L57 56 Z" fill="#b57a54"/>
<path d="M36 38 C36 26 42 22 50 22 C58 22 64 26 64 38 C64 50 58 61 50 63 C42 61 36 50 36 38 Z" fill="url(#${u}skin)"/>
<!-- yeux, sourcils, nez -->
<path d="M39.6 41 C41.4 39.4 44.8 39.6 46.4 41.2 C44.6 42.8 41.6 42.8 39.6 41 Z" fill="#fff7ec"/>
<path d="M60.4 41 C58.6 39.4 55.2 39.6 53.6 41.2 C55.4 42.8 58.4 42.8 60.4 41 Z" fill="#fff7ec"/>
<circle cx="43.2" cy="41.1" r="1.2" fill="#2c3e5a"/><circle cx="56.8" cy="41.1" r="1.2" fill="#2c3e5a"/>
<path d="M38.4 37.6 C41.4 35.6 45 36 47.2 37.6 M61.6 37.6 C58.6 35.6 55 36 52.8 37.6" stroke="#2a150c" stroke-width="1.5" fill="none" stroke-linecap="round"/>
<path d="M49 42 L47.8 49.6 C49.4 51 50.6 51 52.2 49.6 L51 42 Z" fill="#c68a62"/>
<!-- moustache, bouc, sourire en coin -->
<path d="M41 53.6 C44.6 50.4 48.6 51.4 50 53.4 C51.4 51.4 55.4 50.4 59 53.6 C55.4 53.4 52.6 54.4 50 54 C47.4 54.4 44.6 53.4 41 53.6 Z" fill="#2c170d"/>
<path d="M47 58 L53 58 L50 65 Z" fill="#2c170d"/>
<path d="M46.6 56.4 C48.6 57.4 52.2 57 54.2 55.6" stroke="#7a3a2c" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>
<!-- chapeau -->
<path d="M36.5 30 C35 14 43 7 52 7 C61 7 67 14 64.5 30 Z" fill="url(#${u}felt)"/>
<path d="M36.2 27.8 C45 30.4 56 30.4 64.8 27.8 L64.5 31 C56 33.4 45 33.4 36.4 31 Z" fill="#7a1c26"/>
<path d="M36.2 28 C45 30.6 56 30.6 64.8 28" fill="none" stroke="url(#${u}gold)" stroke-width="1.1"/>
<path d="M12 33 C14 22 32 22 50 25 C70 22 88 22 90 31 C88 36 70 33 50 33 C30 34 14 38 12 33 Z" fill="url(#${u}felt)" transform="rotate(-9 50 28)"/>
<path d="M14 31 C30 25 48 26.5 62 25" fill="none" stroke="#5a5470" stroke-width="1" stroke-linecap="round" opacity=".7" transform="rotate(-9 50 28)"/>
<path d="M60 22 C71 6 90 5 97 18 C86 13 78 15 70 25 C78 18 74 20 63 25 Z" fill="url(#${u}feather)"/>
<path d="M62 23 C72 12 84 9 95 17" fill="none" stroke="#dffaf2" stroke-width=".9" stroke-linecap="round" opacity=".9"/>
<!-- rapière -->
<rect x="80.6" y="26" width="2.8" height="50" fill="url(#${u}blade)" rx="1"/>
<rect x="81.6" y="26" width=".8" height="50" fill="#fff" opacity=".7"/>
<path d="M72 76 H92" stroke="url(#${u}gold)" stroke-width="2.6" stroke-linecap="round"/>
<path d="M72 76 C70 84 78 88 82 84" fill="none" stroke="url(#${u}gold)" stroke-width="1.5" stroke-linecap="round"/>
<rect x="80.6" y="77" width="2.8" height="10" fill="#4a1a22"/>
<ellipse cx="82" cy="92" rx="7" ry="6.5" fill="#241a20"/>
<path d="M76 89 C79 85 85 85 88 89" fill="none" stroke="#6a5a62" stroke-width="1" opacity=".8"/>
<!-- reflet chaud sur la joue éclairée -->
<path d="M36.8 36 C36.2 44 38 52 42 58" fill="none" stroke="#ffe0b8" stroke-width=".9" stroke-linecap="round" opacity=".6"/>`;
  return wrap(u, { defs, inner, bg: ['#40304a', '#0a090f', '#ffb45a'], at: [30, 36], halo: 0.36 });
}

/** Le Sacrieur : capuche rouge sang, visage pâle strié de runes, yeux de braise, torse scarifié, lame rituelle sur l'épaule. */
function sacrieur(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#f1d6c6'], [0.55, '#c99b8a'], [1, '#7d5148']]),
    lin(`${u}skinD`, [[0, '#b98676'], [1, '#583a34']], [0, 0, 0, 1]),
    lin(`${u}hood`, [[0, '#b0232f'], [0.5, '#62101b'], [1, '#1c0509']]),
    lin(`${u}cloth`, [[0, '#401820'], [1, '#12060a']], [0, 0, 0, 1]),
    lin(`${u}steel`, [[0, '#f3f6fa'], [0.4, '#a9b4c2'], [1, '#3a4452']]),
    glow(u, 'eye', '#ff5a4a', 0.95)
  ].join('');
  const inner = `
<!-- lame rituelle derrière l'épaule droite -->
<path d="M85 100 L73 30" stroke="#2a1a1e" stroke-width="4" stroke-linecap="round" fill="none"/>
<path d="M69.6 32 L73 8 L77.6 34 Z" fill="url(#${u}steel)"/>
<path d="M73 9 L73.6 32" stroke="#ffffff" stroke-width=".8" stroke-linecap="round" opacity=".85"/>
<path d="M70.5 24 L75.5 25" stroke="#8a1a24" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
<!-- capuche derrière la tête -->
<path d="M26 50 C20 24 34 8 50 8 C66 8 80 24 74 50 C76 62 72 72 66 78 L34 78 C28 72 24 62 26 50 Z" fill="url(#${u}hood)"/>
<path d="M30 30 C33 20 40 14 48 11" fill="none" stroke="#ff8a78" stroke-width="1.1" stroke-linecap="round" opacity=".5"/>
<!-- épaules et torse -->
<path d="M4 100 L9 84 C18 72 32 68 40 68 L60 68 C68 68 82 72 91 84 L96 100 Z" fill="url(#${u}cloth)"/>
<path d="M33 68 L67 68 L62 90 C56 98 44 98 38 90 Z" fill="url(#${u}skinD)"/>
<path d="M22 78 C28 73 34 71 40 70" fill="none" stroke="#e8707a" stroke-width="1" stroke-linecap="round" opacity=".45"/>
<!-- runes de sang sur le torse -->
<path d="M44 74 L50 82 L56 74 M50 82 L50 93 M42.5 85 L57.5 85" stroke="#c4202c" stroke-width="1.7" stroke-linecap="round" fill="none"/>
<path d="M39.5 76 L38 82 M60.5 76 L62 82" stroke="#c4202c" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".8"/>
<!-- cou -->
<path d="M42 56 L42 70 C46 74 54 74 58 70 L58 56 Z" fill="url(#${u}skinD)"/>
<!-- tête -->
<ellipse cx="50" cy="44" rx="14.6" ry="17" fill="url(#${u}skin)"/>
<!-- bord de la capuche sur le front -->
<path d="M34 37 C40 25 60 25 66 37 C60 31 40 31 34 37 Z" fill="url(#${u}hood)"/>
<!-- yeux de braise -->
<circle cx="43.4" cy="43.4" r="6" fill="url(#${u}eye)"/><circle cx="56.6" cy="43.4" r="6" fill="url(#${u}eye)"/>
<path d="M39.6 44 C41 41.8 44.4 41.6 46.6 43.4 C44.4 45.4 41.2 45.6 39.6 44 Z" fill="#fff0e8"/>
<path d="M60.4 44 C59 41.8 55.6 41.6 53.4 43.4 C55.6 45.4 58.8 45.6 60.4 44 Z" fill="#fff0e8"/>
<circle cx="43.2" cy="43.6" r="1.3" fill="#a30f1a"/><circle cx="56.8" cy="43.6" r="1.3" fill="#a30f1a"/>
<path d="M38 40 L47 41.4 M62 40 L53 41.4" stroke="#2a0a0e" stroke-width="1.6" stroke-linecap="round" fill="none"/>
<!-- nez, bouche, scarifications -->
<path d="M49 44 L48 51 C49.6 52.2 50.4 52.2 52 51 L51 44 Z" fill="#b98676"/>
<path d="M44 57 C47 59 53 59 56 57" stroke="#7a2a30" stroke-width="1.2" fill="none" stroke-linecap="round"/>
<path d="M40 48 L37 56 M43 49 L41 58 M60 48 L63 56 M57 49 L59 58" stroke="#b3202a" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".85"/>
<!-- reflet chaud sur la joue éclairée -->
<path d="M37 38 C36.4 46 38.4 53 42 58" fill="none" stroke="#ffe3d0" stroke-width=".9" stroke-linecap="round" opacity=".55"/>`;
  return wrap(u, { defs, inner, bg: ['#40202c', '#0a0709', '#ff6a50'], at: [30, 36], halo: 0.34 });
}

/** L'Assassin : capuche sombre, visage masqué, yeux verts dans l'ombre, deux dagues croisées dans le dos, bandoulière de fioles de venin. */
function assassin(u) {
  const defs = [
    lin(`${u}hood`, [[0, '#2f3b46'], [0.5, '#161d26'], [1, '#07090d']]),
    lin(`${u}hoodL`, [[0, '#5d7486'], [1, '#222d38']], [0, 0, 1, 1]),
    lin(`${u}mask`, [[0, '#3b4b57'], [1, '#10161c']], [0, 0, 0, 1]),
    lin(`${u}leather`, [[0, '#5a4636'], [1, '#1d140e']], [0, 0, 0, 1]),
    lin(`${u}steel`, [[0, '#ffffff'], [0.4, '#b9c8d4'], [1, '#46576a']]),
    lin(`${u}venom`, [[0, '#d8ffb0'], [0.5, '#6fd13e'], [1, '#1f6a1a']]),
    glow(u, 'eye', '#7dff6a', 0.95)
  ].join('');
  const inner = `
<!-- deux dagues croisées dans le dos -->
<path d="M24 14 L40 66" stroke="#1b1510" stroke-width="3.6" stroke-linecap="round" fill="none"/>
<path d="M21 8 L27 12 L26 32 L20 12 Z" fill="url(#${u}steel)" transform="rotate(8 24 20)"/>
<path d="M76 14 L60 66" stroke="#1b1510" stroke-width="3.6" stroke-linecap="round" fill="none"/>
<path d="M79 8 L73 12 L74 32 L80 12 Z" fill="url(#${u}steel)" transform="rotate(-8 76 20)"/>
<path d="M22 11 L25 30" stroke="#ffffff" stroke-width=".7" stroke-linecap="round" opacity=".8"/>
<path d="M78 11 L75 30" stroke="#ffffff" stroke-width=".7" stroke-linecap="round" opacity=".8"/>
<!-- capuche : pointe haute et pans qui retombent -->
<path d="M24 54 C18 30 30 10 50 4 C70 10 82 30 76 54 C78 66 74 76 68 80 L32 80 C26 76 22 66 24 54 Z" fill="url(#${u}hood)"/>
<path d="M29 32 C33 20 41 12 50 8" fill="none" stroke="url(#${u}hoodL)" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
<!-- épaules, cape et bandoulière -->
<path d="M3 100 L9 84 C18 73 32 69 40 69 L60 69 C68 69 82 73 91 84 L97 100 Z" fill="url(#${u}hood)"/>
<path d="M34 69 L66 69 L64 100 L36 100 Z" fill="url(#${u}leather)"/>
<path d="M30 70 L70 98" stroke="#0e0a07" stroke-width="5" stroke-linecap="round"/>
<path d="M30 70 L70 98" stroke="#8a6a46" stroke-width="1" stroke-linecap="round" opacity=".7"/>
<g>
  <rect x="38" y="79" width="5" height="9" rx="2" fill="url(#${u}venom)"/><rect x="39.2" y="76.6" width="2.6" height="3" fill="#caa67a"/>
  <rect x="46.5" y="84.5" width="5" height="9" rx="2" fill="url(#${u}venom)"/><rect x="47.7" y="82" width="2.6" height="3" fill="#caa67a"/>
  <rect x="55" y="90" width="5" height="9" rx="2" fill="#c9482e"/><rect x="56.2" y="87.6" width="2.6" height="3" fill="#caa67a"/>
</g>
<!-- cou et masque -->
<path d="M42 58 L42 70 C46 73 54 73 58 70 L58 58 Z" fill="url(#${u}mask)"/>
<ellipse cx="50" cy="45" rx="14" ry="16.5" fill="#0b0f14"/>
<path d="M35.6 47 C40 53 60 53 64.4 47 L63 62 C57 67 43 67 37 62 Z" fill="url(#${u}mask)"/>
<path d="M37 50 C43 56 57 56 63 50" fill="none" stroke="#6b8294" stroke-width=".9" stroke-linecap="round" opacity=".6"/>
<!-- bord de capuche au-dessus des yeux -->
<path d="M34 37 C39 26 61 26 66 37 C60 33 40 33 34 37 Z" fill="url(#${u}hood)"/>
<!-- yeux dans l'ombre -->
<circle cx="43.6" cy="42.6" r="5.6" fill="url(#${u}eye)"/><circle cx="56.4" cy="42.6" r="5.6" fill="url(#${u}eye)"/>
<path d="M39.8 43.4 C41.4 40.8 45 40.8 47.2 42.8 C45 44.8 41.4 45 39.8 43.4 Z" fill="#eaffe0"/>
<path d="M60.2 43.4 C58.6 40.8 55 40.8 52.8 42.8 C55 44.8 58.6 45 60.2 43.4 Z" fill="#eaffe0"/>
<circle cx="43.6" cy="42.9" r="1.2" fill="#0d3a10"/><circle cx="56.4" cy="42.9" r="1.2" fill="#0d3a10"/>
<path d="M38.4 39.4 L47.6 41.6 M61.6 39.4 L52.4 41.6" stroke="#05080b" stroke-width="1.7" stroke-linecap="round" fill="none"/>`;
  return wrap(u, { defs, inner, bg: ['#1d3a38', '#06090b', '#7dff9a'], at: [30, 36], halo: 0.34 });
}

/** Le Templier : grand heaume d'acier à cimier doré, fente de visière où brille un regard d'or, tabard blanc au soleil rouge et or, auréole. */
function templier(u) {
  const defs = [
    lin(`${u}steel`, [[0, '#f2f6fb'], [0.4, '#aab9ca'], [1, '#36465a']]),
    lin(`${u}steelD`, [[0, '#7389a0'], [1, '#1a2634']], [0, 0, 0, 1]),
    lin(`${u}gold`, [[0, '#fff3c4'], [0.5, '#e6b84e'], [1, '#8a6420']]),
    lin(`${u}cloth`, [[0, '#fbf6e8'], [0.6, '#d9cfb0'], [1, '#867c60']]),
    lin(`${u}plume`, [[0, '#ffe9a0'], [1, '#c98a22']], [0, 0, 1, 1]),
    glow(u, 'eye', '#ffd25a', 0.95)
  ].join('');
  const inner = `
<!-- auréole -->
<circle cx="50" cy="36" r="30" fill="none" stroke="url(#${u}gold)" stroke-width="1.5" opacity=".75"/>
<circle cx="50" cy="36" r="34" fill="none" stroke="#ffe7a8" stroke-opacity=".16" stroke-width="3"/>
<!-- épaules, cuirasse et tabard -->
<path d="M3 100 L8 84 C17 72 31 68 39 68 L61 68 C69 68 83 72 92 84 L97 100 Z" fill="url(#${u}steelD)"/>
<path d="M36 68 L64 68 L68 100 L32 100 Z" fill="url(#${u}cloth)"/>
<path d="M50 70 L50 76" stroke="#867c60" stroke-width=".6" opacity=".6"/>
<!-- soleil rouge et or sur le tabard -->
<g stroke="url(#${u}gold)" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M50 74.500V78M50 94V97.500M39.500 86H43M57 86H60.500M42.600 78.600L45 81M55 91L57.400 93.400M57.400 78.600L55 81M45 91L42.600 93.400"/></g>
<circle cx="50" cy="86" r="6.200" fill="#c9302c" stroke="url(#${u}gold)" stroke-width="1.200"/>
<circle cx="48.200" cy="84.200" r="1.800" fill="#ff9a8a" opacity=".55"/>
<!-- épaulières -->
<path d="M5 90 C4 78 14 70 26 71 C34 72 38 76 37 82 C30 80 18 82 5 90 Z" fill="url(#${u}steel)"/>
<path d="M95 90 C96 78 86 70 74 71 C66 72 62 76 63 82 C70 80 82 82 95 90 Z" fill="url(#${u}steel)" opacity=".92"/>
<path d="M7 86 C10 77 17 73 26 72.500" fill="none" stroke="url(#${u}gold)" stroke-width="1.400" stroke-linecap="round"/>
<path d="M93 86 C90 77 83 73 74 72.500" fill="none" stroke="url(#${u}gold)" stroke-width="1.200" stroke-linecap="round" opacity=".8"/>
<!-- gorgerin -->
<path d="M41 57 L59 57 L62 70 C55 74 45 74 38 70 Z" fill="url(#${u}steelD)"/>
<path d="M42 62 L58 62 M41.500 66 L58.500 66" stroke="#0e1722" stroke-width=".8" opacity=".6"/>
<!-- cimier doré -->
<path d="M50 14 C43 3 53 -3 65 4 C60 6 57 10 57 15 Z" fill="url(#${u}plume)"/>
<path d="M52 10 C55 6 59 5 62 5.500" fill="none" stroke="#fff3c4" stroke-width=".8" stroke-linecap="round" opacity=".8"/>
<!-- grand heaume -->
<path d="M32.500 44 C32.500 23 40.500 13 50 13 C59.500 13 67.500 23 67.500 44 L66.500 58 C60 63.500 40 63.500 33.500 58 Z" fill="url(#${u}steel)"/>
<path d="M50 14 L50 63" stroke="#2c3b4b" stroke-width="1.300" opacity=".65"/>
<path d="M36.500 24 C35.500 34 36.500 48 40 57" fill="none" stroke="#ffffff" stroke-width=".9" stroke-linecap="round" opacity=".6"/>
<!-- fente de visière et regard d'or -->
<path d="M35.500 40.500 L64.500 40.500 L63.500 46.500 L36.500 46.500 Z" fill="#07090c"/>
<circle cx="43" cy="43.500" r="5.200" fill="url(#${u}eye)"/><circle cx="57" cy="43.500" r="5.200" fill="url(#${u}eye)"/>
<path d="M40 43.800 L46 43.800 M54 43.800 L60 43.800" stroke="#fff6d0" stroke-width="1.700" stroke-linecap="round"/>
<!-- bandeau d'or et trous de ventilation -->
<path d="M33 37.500 C42 35.500 58 35.500 67 37.500" fill="none" stroke="url(#${u}gold)" stroke-width="1.300" stroke-linecap="round"/>
<path d="M33.800 50 C42 52 58 52 66.200 50" fill="none" stroke="url(#${u}gold)" stroke-width="1" stroke-linecap="round" opacity=".7"/>
<g fill="#1a2634"><circle cx="42" cy="55" r=".9"/><circle cx="46" cy="56" r=".9"/><circle cx="54" cy="56" r=".9"/><circle cx="58" cy="55" r=".9"/></g>`;
  return wrap(u, { defs, inner, bg: ['#4a3818', '#0a0907', '#ffd36a'], at: [30, 36], halo: 0.34 });
}

/** Le Prêtre : visage partagé entre la lumière (à gauche, robe blanche et or, œil doré) et l'ombre (à droite, robe violette, œil qui luit), capuche, médaillon soleil-lune. */
function pretre(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#f3d2b4'], [0.55, '#c99a78'], [1, '#6e4a38']]),
    lin(`${u}skinD`, [[0, '#a87e62'], [1, '#4a3026']], [0, 0, 0, 1]),
    lin(`${u}light`, [[0, '#ffffff'], [0.55, '#e4dccb'], [1, '#8f8670']]),
    lin(`${u}shadow`, [[0, '#6a4a92'], [0.5, '#2e1f48'], [1, '#0c0814']]),
    lin(`${u}gold`, [[0, '#fff3c4'], [0.5, '#e6b84e'], [1, '#8a6420']]),
    lin(`${u}hair`, [[0, '#cfc7bb'], [1, '#6f675c']]),
    glow(u, 'eye', '#ffd25a', 0.95),
    glow(u, 'eyeV', '#c07dff', 0.95)
  ].join('');
  const inner = `
<!-- capuche : moitié claire, moitié sombre -->
<path d="M50 6 C30 10 20 30 24 54 C22 66 26 76 32 80 L50 80 Z" fill="url(#${u}light)"/>
<path d="M50 6 C70 10 80 30 76 54 C78 66 74 76 68 80 L50 80 Z" fill="url(#${u}shadow)"/>
<path d="M29 34 C32 21 40 12 50 9" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
<path d="M71 34 C68 21 60 12 50 9" fill="none" stroke="#a77bd8" stroke-width="1" stroke-linecap="round" opacity=".5"/>
<!-- épaules et robe -->
<path d="M3 100 L9 84 C18 73 32 69 40 69 L50 69 L50 100 Z" fill="url(#${u}light)"/>
<path d="M97 100 L91 84 C82 73 68 69 60 69 L50 69 L50 100 Z" fill="url(#${u}shadow)"/>
<path d="M40 69 L37 100 M60 69 L63 100" stroke="url(#${u}gold)" stroke-width="1.6" fill="none"/>
<!-- étole brodée -->
<path d="M41 70 L45 100 L39 100 L36 72 Z" fill="url(#${u}gold)" opacity=".85"/>
<path d="M59 70 L55 100 L61 100 L64 72 Z" fill="#7a4fb0" opacity=".85"/>
<!-- médaillon soleil-lune -->
<circle cx="50" cy="84" r="7" fill="#1a1426" stroke="url(#${u}gold)" stroke-width="1.4"/>
<path d="M50 77.600 A6.400 6.400 0 0 0 50 90.400 Z" fill="url(#${u}gold)"/>
<path d="M51.500 79.500 A4.600 4.600 0 1 1 51.500 88.500 A3.400 3.400 0 1 0 51.500 79.500 Z" fill="#c9a8ff"/>
<!-- cou et visage -->
<path d="M43 57 L43 70 C47 73 53 73 57 70 L57 57 Z" fill="url(#${u}skinD)"/>
<ellipse cx="50" cy="44" rx="14.200" ry="16.800" fill="url(#${u}skin)"/>
<!-- l'ombre gagne la moitié droite du visage -->
<path d="M50 27 C58 27 64.200 35 64.200 44 C64.200 54 58 60.800 50 60.800 Z" fill="#1a1030" opacity=".55"/>
<!-- mèches sous la capuche -->
<path d="M36 36 C38 29 44 26 50 26 C56 26 62 29 64 36 C59 32 54 31 50 31.500 C46 31 41 32 36 36 Z" fill="url(#${u}hair)"/>
<!-- bord de capuche -->
<path d="M33 40 C34 26 42 20 50 20 C58 20 66 26 67 40 C62 30 56 27 50 27 C44 27 38 30 33 40 Z" fill="url(#${u}light)" opacity=".95"/>
<path d="M50 20 C58 20 66 26 67 40 C62 30 56 27 50 27 Z" fill="url(#${u}shadow)"/>
<!-- yeux : or à gauche, violet à droite -->
<circle cx="43.400" cy="44" r="5" fill="url(#${u}eye)"/><circle cx="56.600" cy="44" r="5" fill="url(#${u}eyeV)"/>
<path d="M39.800 44.400 C41.400 42 45 42 47 43.800 C45 45.800 41.400 46 39.800 44.400 Z" fill="#fff6dc"/>
<path d="M60.200 44.400 C58.600 42 55 42 53 43.800 C55 45.800 58.600 46 60.200 44.400 Z" fill="#efe0ff"/>
<circle cx="43.400" cy="44.100" r="1.150" fill="#6a4a10"/><circle cx="56.600" cy="44.100" r="1.150" fill="#3b145e"/>
<path d="M39 40.600 L47 41.600 M61 40.600 L53 41.600" stroke="#4a3328" stroke-width="1.300" stroke-linecap="round" fill="none"/>
<!-- nez et bouche -->
<path d="M49 44 L47.800 51.500 C49.400 52.600 50.600 52.600 52.200 51.500 L51 44 Z" fill="#a7745a" opacity=".8"/>
<path d="M45.500 55.500 C48 56.800 52 56.800 54.500 55.500" fill="none" stroke="#6d3f33" stroke-width="1" stroke-linecap="round"/>
<!-- marque sacrée au front -->
<path d="M50 32.500 L50 37.500 M47.500 35 L52.500 35" stroke="url(#${u}gold)" stroke-width="1.100" stroke-linecap="round"/>`;
  return wrap(u, { defs, inner, bg: ['#3a2e4e', '#08060c', '#e8d6ff'], at: [32, 36], halo: 0.34 });
}

/** Le Guerrier : casque à nasal sur un visage balafré, barbe brune, cotte de mailles, bouclier rond cerclé de fer à gauche, garde d'épée à droite, regard rouge de colère. */
function guerrier(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#efc8a6'], [0.55, '#bf8a64'], [1, '#6e452f']]),
    lin(`${u}skinD`, [[0, '#a8775a'], [1, '#4f3022']], [0, 0, 0, 1]),
    lin(`${u}steel`, [[0, '#f2f6fb'], [0.4, '#a5b2c0'], [1, '#34404e']]),
    lin(`${u}steelD`, [[0, '#6f7f90'], [1, '#1b232d']], [0, 0, 0, 1]),
    lin(`${u}mail`, [[0, '#9aa6b2'], [0.5, '#5b6672'], [1, '#22282f']], [0, 0, 0, 1]),
    lin(`${u}wood`, [[0, '#9a3a2a'], [0.6, '#5e1d14'], [1, '#2a0b07']]),
    lin(`${u}beard`, [[0, '#6b4429'], [1, '#2a170c']]),
    lin(`${u}gold`, [[0, '#fff0b8'], [0.5, '#d9a441'], [1, '#7c5518']]),
    glow(u, 'eye', '#ff6a3a', 0.9)
  ].join('');
  const inner = `
<!-- garde d'épée derrière l'épaule droite -->
<path d="M80 100 L84 22" stroke="#2a1d14" stroke-width="3.6" stroke-linecap="round"/>
<path d="M76 26 L92 24" stroke="url(#${u}gold)" stroke-width="3" stroke-linecap="round"/>
<circle cx="84.300" cy="17.500" r="3" fill="url(#${u}gold)"/>
<!-- épaules en mailles et tabard -->
<path d="M4 100 L9 83 C18 71 32 67 40 67 L60 67 C68 67 82 71 91 83 L96 100 Z" fill="url(#${u}mail)"/>
<g stroke="#2a3038" stroke-width=".5" opacity=".55" fill="none">${[72, 77, 82, 87, 92, 97].map((y) => `<path d="M8 ${y} Q 50 ${y - 6} 92 ${y}"/>`).join('')}</g>
<path d="M40 70 L60 70 L62 100 L38 100 Z" fill="#6b1b14"/>
<path d="M50 74 L50 96 M43 84 L57 84" stroke="url(#${u}gold)" stroke-width="1.6" stroke-linecap="round"/>
<!-- bouclier rond à gauche -->
<circle cx="18" cy="84" r="17" fill="url(#${u}wood)" stroke="url(#${u}steelD)" stroke-width="3"/>
<circle cx="18" cy="84" r="5" fill="url(#${u}steel)"/>
<path d="M6 76 C9 71 14 68 20 67.500" fill="none" stroke="#ffffff" stroke-width=".9" stroke-linecap="round" opacity=".5"/>
<!-- cou -->
<path d="M42 55 L42 69 C46 73 54 73 58 69 L58 55 Z" fill="url(#${u}skinD)"/>
<!-- visage -->
<ellipse cx="50" cy="45" rx="14.600" ry="17" fill="url(#${u}skin)"/>
<!-- barbe courte -->
<path d="M35.500 47 C36 59 42 68 50 68.500 C58 68 64 59 64.500 47 C61 55 56 57.500 50 57.500 C44 57.500 39 55 35.500 47 Z" fill="url(#${u}beard)"/>
<path d="M42 54.500 C46 52 54 52 58 54.500 C55 57.500 45 57.500 42 54.500 Z" fill="#2a170c"/>
<!-- balafre -->
<path d="M58.500 36 L54 52" stroke="#9c4a3a" stroke-width="1.300" stroke-linecap="round" opacity=".85"/>
<!-- yeux -->
<path d="M39.800 44 C41.400 41.800 45 41.600 47 43.400 C45 45.400 41.600 45.600 39.800 44 Z" fill="#fff1d6"/>
<path d="M60.200 44 C58.600 41.800 55 41.600 53 43.400 C55 45.400 58.400 45.600 60.200 44 Z" fill="#fff1d6"/>
<circle cx="43.400" cy="43.600" r="1.200" fill="#7a1a0a"/><circle cx="56.600" cy="43.600" r="1.200" fill="#7a1a0a"/>
<circle cx="43.400" cy="43.600" r="3.600" fill="url(#${u}eye)" opacity=".55"/><circle cx="56.600" cy="43.600" r="3.600" fill="url(#${u}eye)" opacity=".55"/>
<path d="M38.400 40.400 L47.200 42 M61.600 40.400 L52.800 42" stroke="#2a170c" stroke-width="1.700" stroke-linecap="round"/>
<!-- casque à nasal -->
<path d="M33.500 41 C33 22 41 13 50 13 C59 13 67 22 66.500 41 C61 36.500 56 35.500 50 35.500 C44 35.500 39 36.500 33.500 41 Z" fill="url(#${u}steel)"/>
<path d="M33.500 41 C39 36.500 44 35.500 50 35.500 C56 35.500 61 36.500 66.500 41" fill="none" stroke="url(#${u}gold)" stroke-width="1.500"/>
<path d="M48 35.500 L52 35.500 L51.400 50 L48.600 50 Z" fill="url(#${u}steel)"/>
<path d="M50 14 L50 35" stroke="#2c3946" stroke-width="1.200" opacity=".6"/>
<path d="M38 24 C40 19 44 16 48 15" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".7"/>`;
  return wrap(u, { defs, inner, bg: ['#4a2418', '#0a0706', '#ff9a6a'], at: [30, 36], halo: 0.34 });
}

export const HEROES = { berserker, veilleur, druide, duelliste, sacrieur, assassin, templier, pretre, guerrier };
