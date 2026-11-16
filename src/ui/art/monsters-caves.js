// ============================================================
//  art/monsters-caves.js — Les monstres des Caves Humides (tranche 1) et du farm « Les Terriers »
// ============================================================
// Le style : des bustes sombres, vus de face, le regard (ou ce qui en tient lieu) qui brille. La lumière de la lanterne vient d'en haut à gauche.

import { lin, rad, glow, wrap } from './kit.js';

/** La tête de rat, de face (partagée par le rat géant et le Roi des Rats). */
function ratHead(u, { cx = 50, cy = 52, s = 1, eye = '#ff3b2e', crown = false, scarred = false } = {}) {
  const t = `translate(${cx} ${cy}) scale(${s}) translate(-50 -52)`;
  const defs = [
    lin(`${u}fur`, [[0, '#b3a08a'], [0.5, '#6f6050'], [1, '#2a211b']]),
    lin(`${u}furD`, [[0, '#5a4c40'], [1, '#17110d']], [0, 0, 0, 1]),
    lin(`${u}ear`, [[0, '#e9aaa6'], [1, '#8a4a4a']]),
    lin(`${u}tooth`, [[0, '#f6edc8'], [1, '#b8a46a']], [0, 0, 1, 0]),
    glow(u, 'eye', eye, 1)
  ].join('');
  const whiskers = [[-1, 60, -4, -6], [-1, 63, -6, 1], [-1, 66, -4, 8], [1, 60, -4, -6], [1, 63, -6, 1], [1, 66, -4, 8]]
    .map(([side, y, dx, dy]) => `<path d="M${50 + side * 12} ${y} Q${50 + side * 30} ${y + dy * 0.4} ${50 + side * 46} ${y + dy}" fill="none" stroke="#e8dcc8" stroke-width=".7" stroke-linecap="round" opacity=".7"/>`).join('');
  const inner = `<g transform="${t}">
<!-- oreilles -->
<circle cx="25" cy="27" r="15" fill="url(#${u}fur)"/><circle cx="25" cy="28" r="9.5" fill="url(#${u}ear)"/><path d="M19 22 C22 19 28 19 31 23" fill="none" stroke="#fff" stroke-width=".8" opacity=".35"/>
<circle cx="75" cy="27" r="15" fill="url(#${u}furD)"/><circle cx="75" cy="28" r="9.5" fill="url(#${u}ear)" opacity=".85"/>
<path d="M82 14 L73 21 L81 27 Z" fill="#150f0c"/>
<path d="M18 52 l-5 -1.4 l4 -2.4 l-5 -1.6 l4.6 -2.2 M82 52 l5 -1.4 l-4 -2.4 l5 -1.6 l-4.6 -2.2" fill="none" stroke="#9a8a76" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
<!-- tête -->
<path d="M50 19 C69 19 82 33 82 51 C82 65 73 77 61 83 L50 90 L39 83 C27 77 18 65 18 51 C18 33 31 19 50 19 Z" fill="url(#${u}fur)"/>
<path d="M20 44 C22 34 30 26 40 22 M80 46 C79 36 72 28 64 24" fill="none" stroke="#e9d9bf" stroke-width="1" stroke-linecap="round" opacity=".4"/>
<g stroke="#2a211b" stroke-width="1" stroke-linecap="round" opacity=".5" fill="none"><path d="M44 24 L46 32 M50 22 L50 31 M56 24 L54 32 M34 30 L38 36 M66 30 L62 36"/></g>
<!-- museau -->
<ellipse cx="50" cy="68" rx="17" ry="15" fill="#a69078"/>
<ellipse cx="50" cy="68" rx="17" ry="15" fill="url(#${u}furD)" opacity=".25"/>
<path d="M44.5 58 C47 55 53 55 55.5 58 C55 63 52 65 50 65 C48 65 45 63 44.5 58 Z" fill="#e0848a"/>
<path d="M46 58 C47.5 56.6 49 56.4 50 56.8" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".6"/>
<path d="M50 65 V70 M50 70 C46 75 41 74 39 71 M50 70 C54 75 59 74 61 71" fill="none" stroke="#2a1410" stroke-width="1.3" stroke-linecap="round"/>
<path d="M46 71 H50 V84 C48 85.4 46.6 85.4 46 84 Z" fill="url(#${u}tooth)"/><path d="M50 71 H54 V82 L52.6 84 L51.4 82.6 L50 84.4 Z" fill="url(#${u}tooth)"/>
<path d="M50 71 V84" stroke="#9a8a5a" stroke-width=".6"/>
${whiskers}
<!-- yeux -->
<circle cx="37" cy="46" r="7.4" fill="url(#${u}eye)"/><circle cx="63" cy="46" r="7.4" fill="url(#${u}eye)"/>
<path d="M31 46 C33.4 42.4 40.6 42.4 43 46 C40.6 49.2 33.4 49.2 31 46 Z M57 46 C59.4 42.4 66.6 42.4 69 46 C66.6 49.2 59.4 49.2 57 46 Z" fill="${eye}"/>
<ellipse cx="37.4" cy="46" rx="1.5" ry="2.8" fill="#14070a"/><ellipse cx="63.4" cy="46" rx="1.5" ry="2.8" fill="#14070a"/>
<circle cx="35.4" cy="44.8" r=".9" fill="#fff"/><circle cx="61.4" cy="44.8" r=".9" fill="#fff"/>
<path d="M25 37 L47 46.4 L45.6 38.6 Z M75 37 L53 46.4 L54.4 38.6 Z" fill="#1a130e"/>
<path d="M31 50.6 C35 53.6 40 53.6 43.4 50.6 M56.6 50.6 C60 53.6 65 53.6 69 50.6" fill="none" stroke="#1a130e" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>
${scarred ? '<path d="M28 34 L44 56" stroke="#e8c7b0" stroke-width="1.2" stroke-linecap="round" opacity=".85"/><path d="M30 33 L32 36 M34 40 L36 43 M38 46 L40 49" stroke="#7a2a22" stroke-width=".8" opacity=".8"/>' : ''}
${crown ? `<!-- couronne -->
<path d="M28 24 L31 6 L40 16 L50 1 L60 16 L69 6 L72 24 Z" fill="url(#${u}gold)"/>
<path d="M28 24 H72 V30 H28 Z" fill="url(#${u}goldD)"/>
<path d="M31 6 L40 16 L50 1" fill="none" stroke="#fff6c8" stroke-width=".8" opacity=".7"/>
<circle cx="50" cy="27" r="2.4" fill="#d0202a"/><circle cx="38" cy="27" r="1.7" fill="#2a78e0"/><circle cx="62" cy="27" r="1.7" fill="#2a78e0"/>
<path d="M33 24 L33 30 M67 24 L67 30" stroke="#8a6420" stroke-width=".6"/>` : ''}
</g>`;
  const crownDefs = crown ? [lin(`${u}gold`, [[0, '#fff2b0'], [0.5, '#d9a93c'], [1, '#7a5418']]), lin(`${u}goldD`, [[0, '#b88a2c'], [1, '#5a3c10']], [0, 0, 0, 1])].join('') : '';
  return { defs: defs + crownDefs, inner };
}

function rat_geant(u) {
  const { defs, inner } = ratHead(u, { cy: 54, s: 0.98 });
  const body = `<path d="M2 100 C6 86 20 80 34 80 L66 80 C80 80 94 86 98 100 Z" fill="#241c17"/>
<path d="M10 92 C20 86 30 84 40 83" fill="none" stroke="#b09a82" stroke-width="1" opacity=".4"/>`;
  return wrap(u, { defs, inner: body + inner, bg: ['#4a3228', '#09070a', '#ff9a4a'], at: [30, 30], halo: 0.34 });
}

function roi_des_rats(u) {
  const { defs, inner } = ratHead(u, { cy: 58, s: 0.88, eye: '#ffb02e', crown: true, scarred: true });
  const extra = [
    lin(`${u}cape`, [[0, '#c4343a'], [0.55, '#7a1622'], [1, '#2a060c']]),
    lin(`${u}ruff`, [[0, '#d8d0c0'], [1, '#5a5048']])
  ].join('');
  const body = `<path d="M0 100 L4 72 C18 58 34 54 50 56 C66 54 82 58 96 72 L100 100 Z" fill="url(#${u}cape)"/>
<path d="M0 100 L4 72 L10 84 L14 70 L20 82 L26 66" fill="none" stroke="#e46a6e" stroke-width=".8" opacity=".5"/>
<path d="M4 90 C14 76 30 70 50 72 C70 70 86 76 96 90 C84 84 72 82 62 84 C54 90 46 90 38 84 C28 82 16 84 4 90 Z" fill="url(#${u}ruff)"/>
<path d="M8 92 l3 -5 l2 4 l3 -5 l2 4 M84 90 l3 -5 l2 4 l3 -5 l2 4" fill="none" stroke="#9a8e7c" stroke-width="1" stroke-linecap="round" opacity=".7"/>
<g fill="#120d0b"><circle cx="9" cy="95" r="5"/><circle cx="6" cy="91" r="2.4"/><circle cx="12" cy="91" r="2.4"/><circle cx="91" cy="95" r="5"/><circle cx="88" cy="91" r="2.4"/><circle cx="94" cy="91" r="2.4"/></g>
<g fill="#ff4a3a"><circle cx="8" cy="95" r=".9"/><circle cx="10.4" cy="95" r=".9"/><circle cx="89.6" cy="95" r=".9"/><circle cx="92" cy="95" r=".9"/></g>`;
  return wrap(u, { defs: defs + extra, inner: body + inner, bg: ['#58261e', '#0a0506', '#ffb04a'], at: [30, 26], halo: 0.4 });
}

function squelette_rouille(u) {
  const defs = [
    lin(`${u}bone`, [[0, '#f6efd8'], [0.5, '#c4b592'], [1, '#6a5c46']]),
    lin(`${u}boneD`, [[0, '#a89a7a'], [1, '#3e342a']], [0, 0, 0, 1]),
    lin(`${u}rust`, [[0, '#d98a4a'], [0.45, '#8f4a22'], [1, '#2e1608']]),
    glow(u, 'eye', '#ff8a1e', 1)
  ].join('');
  const vertebrae = [60, 66, 72].map((y) => `<rect x="44" y="${y}" width="12" height="6" rx="2.5" fill="url(#${u}boneD)"/>`).join('');
  const teeth = Array.from({ length: 8 }, (_, i) => `<rect x="${37 + i * 3.2}" y="66.4" width="2.6" height="6" rx="1" fill="#e8dcc0"/>`).join('');
  const inner = `
<path d="M3 100 C7 84 22 78 38 77 L62 77 C78 78 93 84 97 100 Z" fill="url(#${u}rust)"/>
<path d="M6 92 C14 84 26 80 38 79" fill="none" stroke="#ffc88a" stroke-width="1" stroke-linecap="round" opacity=".55"/>
<g fill="#ffd9a0" opacity=".8"><circle cx="16" cy="88" r="1.3"/><circle cx="84" cy="88" r="1.3"/><circle cx="30" cy="82" r="1.1"/><circle cx="70" cy="82" r="1.1"/></g>
<path d="M26 98 L36 82 M64 98 L74 84 M50 100 L50 84" stroke="#2e1608" stroke-width="1.2" opacity=".5"/>
${vertebrae}
<!-- crâne -->
<path d="M50 14 C68 14 79 26 78 42 C78 51 74 55 71 59 L70 67 C70 71 67 73 63 73 L37 73 C33 73 30 71 30 67 L29 59 C26 55 22 51 22 42 C21 26 32 14 50 14 Z" fill="url(#${u}bone)"/>
<path d="M26 40 C26 28 33 19 42 16" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
<path d="M69 26 L64 38 L69 45 L65 52" fill="none" stroke="#3e342a" stroke-width="1.1" stroke-linecap="round"/>
<!-- orbites -->
<ellipse cx="38.5" cy="46" rx="8" ry="9" fill="#120c08"/><ellipse cx="61.5" cy="46" rx="8" ry="9" fill="#120c08"/>
<circle cx="38.5" cy="47" r="9" fill="url(#${u}eye)"/><circle cx="61.5" cy="47" r="9" fill="url(#${u}eye)"/>
<circle cx="38.5" cy="47" r="3.1" fill="#ffd58a"/><circle cx="61.5" cy="47" r="3.1" fill="#ffd58a"/>
<path d="M50 55 L45.5 63.5 L54.5 63.5 Z" fill="#150f0b"/>
<!-- dents -->
<path d="M36 66 H64 V73 H36 Z" fill="#241a12"/>${teeth}
<path d="M34 66 H66" stroke="#3e342a" stroke-width=".8"/>
<!-- casque rouillé -->
<path d="M21.5 42 C20.5 22 33 11 50 11 C67 11 79.5 22 78.5 42 L71 35.5 C62 31 38 31 29 35.5 Z" fill="url(#${u}rust)"/>
<path d="M26 34 C28 24 36 16 46 13.4" fill="none" stroke="#ffd9a8" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>
<path d="M47.4 28 H52.6 V47 L50 52 L47.4 47 Z" fill="url(#${u}rust)"/>
<path d="M33 27 L36 31 M64 24 L61 30" stroke="#2e1608" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
<g fill="#ffe0b0"><circle cx="30" cy="30" r="1"/><circle cx="70" cy="30" r="1"/><circle cx="50" cy="17" r="1"/></g>
<path d="M58 16 L64 24 L60 26 Z" fill="#2e1608" opacity=".5"/>`;
  return wrap(u, { defs, inner, bg: ['#4a3426', '#0a0807', '#ff9a3a'], at: [32, 28], halo: 0.34 });
}

function gobelin_pillard(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#c0ec78'], [0.5, '#6ea83a'], [1, '#2a4a16']]),
    lin(`${u}skinD`, [[0, '#4f8a2e'], [1, '#1c3a10']], [0, 0, 0, 1]),
    lin(`${u}leather`, [[0, '#8a5e34'], [0.6, '#4a2e18'], [1, '#1e1209']]),
    lin(`${u}steel`, [[0, '#e8eef2'], [0.5, '#98a8b4'], [1, '#4a5660']], [0, 0, 1, 0]),
    glow(u, 'eye', '#ffe35a', 0.8)
  ].join('');
  const fangs = [34, 39, 44, 50, 56, 61, 66].map((x, i) => `<path d="M${x - 2} 56.4 L${x} ${i % 2 ? 62 : 61} L${x + 2} 56.4 Z" fill="#f4ecd0"/>`).join('');
  const inner = `
<!-- couteau -->
<path d="M80 100 L74 64 L80 62 L85 98 Z" fill="url(#${u}steel)"/>
<path d="M77 66 L81 98" stroke="#fff" stroke-width=".8" opacity=".6"/><path d="M73 64 L81 62" stroke="#3a2412" stroke-width="2.4" stroke-linecap="round"/>
<!-- gilet de cuir -->
<path d="M5 100 C9 85 26 79 40 78 L60 78 C74 79 91 85 95 100 Z" fill="url(#${u}leather)"/>
<path d="M30 80 L44 100 M70 80 L56 100" stroke="#2a1a0c" stroke-width="2" opacity=".6"/>
<path d="M30 80 L44 100" stroke="#d6a05e" stroke-width=".7" stroke-dasharray="2 2.4" opacity=".7"/>
<path d="M44 66 L44 79 C48 82 52 82 56 79 L56 66 Z" fill="url(#${u}skinD)"/>
<!-- oreilles -->
<path d="M30 44 C20 40 10 34 1 24 C3 38 6 50 26 58 Z" fill="url(#${u}skin)"/><path d="M27 48 C20 44 12 40 7 34 C9 42 13 48 26 54 Z" fill="#7a3a2e" opacity=".55"/>
<path d="M70 44 C80 40 90 34 99 24 C97 38 94 50 74 58 Z" fill="url(#${u}skinD)"/><path d="M73 48 C80 44 88 40 93 34 C91 42 87 48 74 54 Z" fill="#7a3a2e" opacity=".45"/>
<circle cx="4" cy="28" r="1.4" fill="#e0b84a"/>
<!-- tête -->
<path d="M26 40 C26 24 36 17 50 17 C64 17 74 24 74 40 C74 54 66 66 50 67 C34 66 26 54 26 40 Z" fill="url(#${u}skin)"/>
<path d="M30 28 C34 22 40 19 46 18" fill="none" stroke="#f4ffd0" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
<!-- bonnet de cuir -->
<path d="M26 34 C27 18 37 10 50 10 C63 10 73 18 74 34 C64 27 36 27 26 34 Z" fill="url(#${u}leather)"/>
<path d="M30 26 C33 18 40 13 48 12" fill="none" stroke="#f0c488" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
<path d="M66 12 L74 2 L72 14 Z" fill="#e8dcc0"/>
<!-- yeux et sourcils -->
<circle cx="39" cy="40" r="8.5" fill="url(#${u}eye)"/><circle cx="61" cy="40" r="8.5" fill="url(#${u}eye)"/>
<ellipse cx="39" cy="40" rx="6" ry="4.8" fill="#ffe66a"/><ellipse cx="61" cy="40" rx="6" ry="4.8" fill="#ffe66a"/>
<ellipse cx="39" cy="40" rx="1.3" ry="4.4" fill="#201400"/><ellipse cx="61" cy="40" rx="1.3" ry="4.4" fill="#201400"/>
<path d="M29 34 L47 40.4 L46.6 36 Z M71 34 L53 40.4 L53.4 36 Z" fill="#2c4a14"/>
<!-- nez crochu -->
<path d="M50 42 C60 46 62 54 54 57 C52 55.6 50 53 50 50 Z" fill="url(#${u}skinD)"/>
<path d="M52 52 C54 52 55.4 53 55.6 54.4" stroke="#14260a" stroke-width="1" fill="none" stroke-linecap="round"/>
<!-- sourire -->
<path d="M31 54.6 C41 66 59 66 69 54.6 C61 59.4 39 59.4 31 54.6 Z" fill="#4a0e14"/>
${fangs}
<path d="M44 63 L46 59.6 L48 63 M52 63 L54 59.6 L56 63" fill="#f4ecd0"/>`;
  return wrap(u, { defs, inner, bg: ['#3c4a26', '#080b06', '#ffd24a'], at: [30, 30], halo: 0.34 });
}

function gelee_verte(u) {
  const defs = [
    rad(`${u}body`, [[0, '#d6ffd0', 0.95], [0.45, '#5fe083', 0.9], [1, '#16743a', 0.97]], [38, 34, 78]),
    lin(`${u}floor`, [[0, '#4be07a', 0.55], [1, '#0e4a24', 0]], [0, 0, 0, 1]),
    glow(u, 'in', '#a8ffb8', 0.8)
  ].join('');
  const bubbles = [[34, 74, 3], [62, 80, 2.2], [70, 56, 2.6], [28, 62, 1.8], [56, 66, 1.4], [44, 84, 1.6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#d8ffe0" opacity=".32"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.35}" fill="#fff" opacity=".7"/>`).join('');
  const inner = `
<ellipse cx="50" cy="94" rx="46" ry="8" fill="url(#${u}floor)"/>
<path d="M10 96 C6 66 20 34 50 28 C80 34 94 66 90 96 C84 100 74 94 68 98 C60 100 54 94 46 98 C38 100 30 94 24 98 C18 100 12 98 10 96 Z" fill="url(#${u}body)"/>
<path d="M14 90 C12 66 24 40 46 34" fill="none" stroke="#e8fff0" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
<ellipse cx="34" cy="48" rx="10" ry="5" fill="#fff" opacity=".5" transform="rotate(-28 34 48)"/>
<ellipse cx="26" cy="60" rx="3" ry="1.6" fill="#fff" opacity=".55" transform="rotate(-28 26 60)"/>
${bubbles}
<!-- un crâne à moitié digéré -->
<g opacity=".55"><path d="M60 78 C58 68 72 66 74 76 L73 82 H61 Z" fill="#103a1c"/><circle cx="64.4" cy="75.4" r="1.8" fill="#7dffa0" opacity=".7"/><circle cx="69.6" cy="75.4" r="1.8" fill="#7dffa0" opacity=".7"/><path d="M63 82 V85 M66.6 82 V85 M70 82 V85" stroke="#103a1c" stroke-width="1.1"/></g>
<path d="M20 80 L34 84" stroke="#103a1c" stroke-width="2.4" stroke-linecap="round" opacity=".4"/><circle cx="19.4" cy="79.6" r="2" fill="#103a1c" opacity=".4"/>
<!-- yeux et bouche -->
<ellipse cx="40" cy="58" rx="4.8" ry="6.4" fill="#0e3a1c"/><ellipse cx="60" cy="58" rx="4.8" ry="6.4" fill="#0e3a1c"/>
<ellipse cx="40.4" cy="59" rx="2.4" ry="3.6" fill="#baffc6" opacity=".85"/><ellipse cx="60.4" cy="59" rx="2.4" ry="3.6" fill="#baffc6" opacity=".85"/>
<circle cx="38.8" cy="56" r="1.3" fill="#fff"/><circle cx="58.8" cy="56" r="1.3" fill="#fff"/>
<path d="M44 70 C48 74 54 74 58 70" fill="none" stroke="#0e3a1c" stroke-width="1.8" stroke-linecap="round"/>
<path d="M30 30 C28 20 36 14 40 22 C38 26 34 30 30 30 Z M64 26 C66 18 74 18 72 26 C70 30 66 30 64 26 Z" fill="#62e088" opacity=".8"/>`;
  return wrap(u, { defs, inner, bg: ['#1f4a30', '#040a06', '#7dffa0'], at: [40, 50], halo: 0.34 });
}

function chauve_souris_vampire(u) {
  const defs = [
    lin(`${u}wing`, [[0, '#6a3a80'], [0.5, '#34184a'], [1, '#12081c']], [0, 0, 1, 1]),
    lin(`${u}fur`, [[0, '#5a4468'], [0.5, '#2c1f38'], [1, '#0f0914']]),
    rad(`${u}moon`, [[0, '#f4e8ff', 0.5], [1, '#c8a0ff', 0]]),
    glow(u, 'eye', '#ff3a5a', 1)
  ].join('');
  const wing = `<path d="M44 54 C34 34 16 24 1 24 C6 32 4 40 1 48 C8 46 12 48 15 54 C19 49 25 51 28 57 C32 53 38 55 40 61 L46 62 Z" fill="url(#${u}wing)"/>
<path d="M44 54 C30 40 18 32 4 26 M44 55 C32 46 22 44 14 52 M44 56 C36 52 30 54 28 57 M44 57 C40 56 38 58 38 60" fill="none" stroke="#c08ae0" stroke-width=".8" stroke-linecap="round" opacity=".45"/>
<path d="M1 24 L5 18 L8 26 Z" fill="#cbb8de"/>`;
  const inner = `
<circle cx="50" cy="42" r="34" fill="url(#${u}moon)"/>
${wing}
<g transform="translate(100 0) scale(-1 1)">${wing}</g>
<!-- oreilles -->
<path d="M38 46 L33 20 L47 38 Z" fill="url(#${u}fur)"/><path d="M62 46 L67 20 L53 38 Z" fill="url(#${u}fur)"/>
<path d="M38.4 42 L35.4 26 L44 38 Z M61.6 42 L64.6 26 L56 38 Z" fill="#b0507a" opacity=".85"/>
<!-- corps et tête -->
<path d="M34 100 C34 84 40 72 50 70 C60 72 66 84 66 100 Z" fill="url(#${u}fur)"/>
<path d="M42 82 C46 86 54 86 58 82 M44 90 C47 93 53 93 56 90" fill="none" stroke="#8a6aa0" stroke-width=".9" opacity=".5"/>
<ellipse cx="50" cy="54" rx="15" ry="16.4" fill="url(#${u}fur)"/>
<path d="M37 48 C38 42 42 38 47 37" fill="none" stroke="#c7a8e0" stroke-width="1" stroke-linecap="round" opacity=".5"/>
<!-- visage -->
<circle cx="43.4" cy="50" r="6" fill="url(#${u}eye)"/><circle cx="56.6" cy="50" r="6" fill="url(#${u}eye)"/>
<circle cx="43.4" cy="50" r="3" fill="#ff3a5a"/><circle cx="56.6" cy="50" r="3" fill="#ff3a5a"/>
<ellipse cx="43.4" cy="50" rx=".8" ry="2.6" fill="#1a0408"/><ellipse cx="56.6" cy="50" rx=".8" ry="2.6" fill="#1a0408"/>
<path d="M38 46.4 L47 50 L46.4 47 Z M62 46.4 L53 50 L53.6 47 Z" fill="#0f0914"/>
<path d="M47 56.4 C48.4 55 51.6 55 53 56.4 C52.6 58.6 51.4 59.4 50 59.4 C48.6 59.4 47.4 58.6 47 56.4 Z" fill="#c8607e"/>
<path d="M42 62 C46 68 54 68 58 62 C54 64.4 46 64.4 42 62 Z" fill="#3a0814"/>
<path d="M45.4 63.4 L47 69.6 L48.6 64.4 Z M54.6 63.4 L53 69.6 L51.4 64.4 Z" fill="#fff8e8"/>
<path d="M44 58 L39 56 M56 58 L61 56" stroke="#e0d0f0" stroke-width=".7" opacity=".6" stroke-linecap="round"/>`;
  return wrap(u, { defs, inner, bg: ['#3a2150', '#07040c', '#c07aff'], at: [50, 40], halo: 0.28 });
}

export const MONSTERS_CAVES = { rat_geant, roi_des_rats, squelette_rouille, gobelin_pillard, gelee_verte, chauve_souris_vampire };
