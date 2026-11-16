// ============================================================
//  art/monsters-depths.js — Les monstres des Profondeurs Déchues (tranche 8) et les mannequins de la salle d'entraînement
// ============================================================

import { lin, rad, glow, wrap } from './kit.js';

function ogre_des_cryptes(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#b8c49a'], [0.5, '#6e7e56'], [1, '#26301c']]),
    lin(`${u}skinD`, [[0, '#566644'], [1, '#161c10']], [0, 0, 0, 1]),
    lin(`${u}iron`, [[0, '#c8d0d8'], [0.5, '#6a7480'], [1, '#1c222a']]),
    lin(`${u}tusk`, [[0, '#fffbe6'], [1, '#b8a878']], [0, 0, 1, 0]),
    glow(u, 'eye', '#ffb83a', 0.8)
  ].join('');
  const links = Array.from({ length: 9 }, (_, i) => `<ellipse cx="${22 + i * 7}" cy="${74 + Math.sin(i * 0.7) * 3 + 9}" rx="3.6" ry="2.2" fill="none" stroke="url(#${u}iron)" stroke-width="1.5" transform="rotate(${i % 2 ? 20 : -20} ${22 + i * 7} ${80})"/>`).join('');
  const inner = `
<!-- épaules et épaulière à pointes -->
<path d="M0 100 C0 80 10 68 28 66 L72 66 C90 68 100 80 100 100 Z" fill="url(#${u}skinD)"/>
<path d="M0 82 C4 70 14 64 26 66 C30 76 24 86 10 92 Z" fill="url(#${u}iron)"/>
<path d="M6 76 L2 62 L12 70 M16 70 L16 56 L22 68" fill="none" stroke="url(#${u}iron)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M4 84 C8 74 14 70 22 68" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".6"/>
${links}
<!-- cou et tête -->
<path d="M36 60 L36 74 C44 78 56 78 64 74 L64 60 Z" fill="url(#${u}skinD)"/>
<path d="M50 12 C70 12 80 26 79 42 C79 50 77 56 74 62 C70 72 62 80 50 80 C38 80 30 72 26 62 C23 56 21 50 21 42 C20 26 30 12 50 12 Z" fill="url(#${u}skin)"/>
<path d="M26 34 C28 24 36 17 46 14" fill="none" stroke="#f0ffe0" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>
<path d="M44 14 L47 24 M52 12 L52 22 M58 14 L56 24" stroke="#3a4a2a" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
<!-- arcades et petits yeux -->
<path d="M22 38 C30 30 44 33 49 42 C41 40 30 40 22 38 Z M78 38 C70 30 56 33 51 42 C59 40 70 40 78 38 Z" fill="url(#${u}skinD)"/>
<circle cx="37" cy="44" r="6.4" fill="url(#${u}eye)"/><circle cx="63" cy="44" r="6.4" fill="url(#${u}eye)"/>
<ellipse cx="37" cy="44.4" rx="3.2" ry="2.4" fill="#ffd05a"/><ellipse cx="63" cy="44.4" rx="3.2" ry="2.4" fill="#ffd05a"/>
<circle cx="37.4" cy="44.5" r="1.1" fill="#1a0e00"/><circle cx="62.6" cy="44.5" r="1.1" fill="#1a0e00"/>
<!-- nez écrasé, cicatrices -->
<path d="M46 46 C44 54 44 58 48 60 C50 60.6 52 60.6 54 60 C58 58 58 54 54 46 Z" fill="#566644"/>
<ellipse cx="47.6" cy="58.6" rx="1.6" ry="1.1" fill="#161c10"/><ellipse cx="52.4" cy="58.6" rx="1.6" ry="1.1" fill="#161c10"/>
<path d="M28 30 L40 52" stroke="#e8d0b8" stroke-width="1.2" stroke-linecap="round" opacity=".7"/><path d="M30 31 L32 34 M33 36 L35 39 M36 42 L38 45" stroke="#6a2a22" stroke-width=".8" opacity=".8"/>
<!-- mâchoire écrasante et défenses -->
<path d="M28 62 C32 74 42 80 50 80 C58 80 68 74 72 62 C66 68 58 70 50 70 C42 70 34 68 28 62 Z" fill="#1c0c10"/>
<path d="M33 64 L30 48 L38 62 Z" fill="url(#${u}tusk)"/><path d="M67 64 L70 48 L62 62 Z" fill="url(#${u}tusk)"/>
<path d="M42 70 L43.4 64.6 L45 70 M48.4 70 L50 65 L51.6 70 M55 70 L56.6 64.6 L58 70" fill="#e8dcb8"/>
<path d="M46 76 C48 80 52 80 54 76" fill="none" stroke="#8a2a3a" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`;
  return wrap(u, { defs, inner, bg: ['#403c28', '#080806', '#ffb04a'], at: [32, 30], halo: 0.32 });
}

function chevalier_dechu(u) {
  const defs = [
    lin(`${u}plate`, [[0, '#6a6a7e'], [0.45, '#2c2c3a'], [1, '#0a0a10']]),
    lin(`${u}plateL`, [[0, '#a6a6c0'], [0.5, '#4a4a5e'], [1, '#14141c']]),
    lin(`${u}cape`, [[0, '#8a1c2a'], [1, '#2a060c']], [0, 0, 0, 1]),
    lin(`${u}blade`, [[0, '#e8e8f4'], [0.5, '#8a8aa4'], [1, '#34344a']], [0, 0, 1, 0]),
    glow(u, 'eye', '#ff3a2a', 1)
  ].join('');
  const inner = `
<!-- cape en lambeaux -->
<path d="M0 100 L4 68 C20 58 36 56 50 58 C64 56 80 58 96 68 L100 100 L92 92 L86 100 L78 90 L70 100 L30 100 L22 90 L14 100 L8 92 Z" fill="url(#${u}cape)"/>
<!-- épée dressée -->
<path d="M84 100 L84 20" stroke="url(#${u}blade)" stroke-width="4" stroke-linecap="round"/>
<path d="M84 4 L87.4 20 L84 24 L80.6 20 Z" fill="url(#${u}blade)"/>
<path d="M83.6 8 V70" stroke="#ff5a4a" stroke-width=".9" opacity=".75"/>
<path d="M76 66 H92" stroke="#2c2c3a" stroke-width="3" stroke-linecap="round"/>
<!-- plastron et épaulières cornues -->
<path d="M8 100 C10 84 24 76 38 74 L62 74 C76 76 90 84 92 100 Z" fill="url(#${u}plate)"/>
<path d="M26 100 L34 76 M74 100 L66 76 M50 100 L50 78" stroke="#0a0a10" stroke-width="1.4" opacity=".6"/>
<path d="M12 92 C16 84 24 80 32 78" fill="none" stroke="#c8c8e0" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
<path d="M10 84 C8 72 18 64 30 66 C34 72 30 80 24 84 C20 82 14 82 10 84 Z" fill="url(#${u}plateL)"/>
<path d="M90 84 C92 72 82 64 70 66 C66 72 70 80 76 84 C80 82 86 82 90 84 Z" fill="url(#${u}plate)"/>
<path d="M12 70 L8 56 L18 66 M22 66 L22 52 L28 64" fill="none" stroke="url(#${u}plateL)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
<!-- heaume fendu -->
<path d="M32 66 L68 66 L66 74 C58 78 42 78 34 74 Z" fill="url(#${u}plate)"/>
<path d="M28 62 C25 36 34 18 50 18 C66 18 75 36 72 62 C66 70 34 70 28 62 Z" fill="url(#${u}plateL)"/>
<path d="M32 38 C34 28 40 22 47 20" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>
<path d="M60 22 L56 36 L62 44 L58 56" fill="none" stroke="#0a0a10" stroke-width="1.6" stroke-linecap="round"/>
<path d="M60 22 L56 36 L62 44 L58 56" fill="none" stroke="#ff3a2a" stroke-width=".5" stroke-linecap="round" opacity=".7"/>
<path d="M30 44 H70 V50 H30 Z" fill="#06060a"/>
<circle cx="40" cy="47" r="8" fill="url(#${u}eye)"/><circle cx="60" cy="47" r="8" fill="url(#${u}eye)"/>
<path d="M34 45.6 L46 46.6 L45.6 49 L34.4 48.4 Z M66 45.6 L54 46.6 L54.4 49 L65.6 48.4 Z" fill="#ffb0a0"/>
<path d="M46 52 H54 M45 56 H55 M46 60 H54" stroke="#0a0a10" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
<!-- cornes brisées -->
<path d="M32 28 C24 28 16 20 14 8 C20 14 28 16 36 18 Z" fill="url(#${u}plateL)"/>
<path d="M68 28 C76 28 84 20 86 8 L82 6 C80 14 74 16 66 18 Z" fill="url(#${u}plate)"/>`;
  return wrap(u, { defs, inner, bg: ['#34293c', '#050408', '#ff4a3a'], at: [26, 34], halo: 0.28 });
}

function sorciere_des_marais(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#bee08a'], [0.5, '#6a9a44'], [1, '#243a16']]),
    lin(`${u}hat`, [[0, '#5a4a6a'], [0.5, '#2a2036'], [1, '#0c0812']]),
    lin(`${u}hair`, [[0, '#a8b8a0'], [1, '#3a4a38']], [0, 0, 1, 1]),
    lin(`${u}robe`, [[0, '#3a4a30'], [1, '#0c140a']], [0, 0, 0, 1]),
    rad(`${u}orb`, [[0, '#f4ffd0', 1], [0.4, '#9aff5a', 0.85], [1, '#2a9a2a', 0]]),
    glow(u, 'eye', '#e6ff4a', 1)
  ].join('');
  const inner = `
<!-- volutes de marais -->
<path d="M6 60 C0 50 8 42 14 46 M92 50 C100 40 94 32 88 36" stroke="#9aff5a" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".4"/>
<!-- robe -->
<path d="M4 100 C8 86 22 80 36 78 L64 78 C78 80 92 86 96 100 Z" fill="url(#${u}robe)"/>
<path d="M24 100 L34 84 M76 100 L66 84" stroke="#0a0f08" stroke-width="1.6" opacity=".6"/>
<path d="M14 94 C22 86 30 82 38 80" fill="none" stroke="#b8d890" stroke-width="1" stroke-linecap="round" opacity=".4"/>
<!-- cheveux fous -->
<path d="M28 44 C16 52 12 70 18 88 C22 76 28 68 32 62 Z M72 44 C84 52 88 70 82 88 C78 76 72 68 68 62 Z" fill="url(#${u}hair)"/>
<path d="M22 56 C18 66 18 76 20 84 M78 56 C82 66 82 76 80 84" stroke="#e6f0d8" stroke-width=".9" fill="none" opacity=".45" stroke-linecap="round"/>
<!-- visage -->
<path d="M44 64 L44 78 C48 81 52 81 56 78 L56 64 Z" fill="#4a6e2c"/>
<path d="M33 40 C33 28 40 24 50 24 C60 24 67 28 67 40 C67 54 60 66 50 68 C40 66 33 54 33 40 Z" fill="url(#${u}skin)"/>
<path d="M36 34 C38 29 42 26 47 25" fill="none" stroke="#f4ffd8" stroke-width="1" stroke-linecap="round" opacity=".55"/>
<!-- grand chapeau -->
<path d="M8 38 C14 30 34 28 50 28 C66 28 86 30 92 38 C80 42 66 36 50 36 C34 36 20 42 8 38 Z" fill="url(#${u}hat)"/>
<path d="M32 33 C34 20 40 8 54 -2 C54 8 60 14 64 20 C68 24 68 28 68 33 Z" fill="url(#${u}hat)" transform="translate(0 4) rotate(-6 50 30)"/>
<path d="M34 34 C42 36 58 36 66 34 L66 30 C58 32 42 32 34 30 Z" fill="#7a2a8a"/>
<path d="M44 29.6 H56 V34.4 H44 Z" fill="none" stroke="#e8c84a" stroke-width="1.2"/>
<path d="M12 36 C22 32 36 31 46 31" fill="none" stroke="#9a88b8" stroke-width="1" stroke-linecap="round" opacity=".6"/>
<!-- yeux, nez crochu, verrue -->
<circle cx="43" cy="44" r="7" fill="url(#${u}eye)"/><circle cx="57" cy="44" r="7" fill="url(#${u}eye)"/>
<path d="M39 44 C41 41.6 45 41.6 47 44 C45 46 41 46 39 44 Z M53 44 C55 41.6 59 41.6 61 44 C59 46 55 46 53 44 Z" fill="#f4ffa0"/>
<circle cx="43" cy="44" r="1.2" fill="#1a2a08"/><circle cx="57" cy="44" r="1.2" fill="#1a2a08"/>
<path d="M36 40 L47 43.4 M64 40 L53 43.4" stroke="#1c2c0e" stroke-width="1.6" stroke-linecap="round"/>
<path d="M50 44 C55 50 58 58 50 60 C48 58 48.4 54 50 50 Z" fill="#4a7a2c"/>
<circle cx="54.4" cy="56.4" r="1.5" fill="#2a4a14"/><circle cx="54" cy="56" r=".6" fill="#8ac45a"/>
<path d="M42 64 C46 68 54 68 58 64 C54 66 46 66 42 64 Z" fill="#2a0a14"/>
<path d="M44.6 64.4 L45.8 68 L47 65 M54.4 64.4 L53.2 68 L52 65" fill="#e8dcb0"/>
<!-- main et orbe -->
<circle cx="20" cy="86" r="14" fill="url(#${u}orb)"/>
<circle cx="20" cy="86" r="5" fill="#f4ffd0"/>
<path d="M10 100 C10 92 14 90 18 92 L26 92 C30 90 32 94 30 100 Z" fill="#4a7a2c"/>
<path d="M12 94 L10 88 M17 92 L16 86 M22 92 L22 86" stroke="#6a9a44" stroke-width="2" stroke-linecap="round"/>`;
  return wrap(u, { defs, inner, bg: ['#2a4228', '#050805', '#9aff5a'], at: [24, 84], halo: 0.34 });
}

function spectre_affame(u) {
  const defs = [
    lin(`${u}shroud`, [[0, '#4a3a5a'], [0.5, '#1e1428'], [1, '#05030a']], [0, 0, 0.6, 1]),
    lin(`${u}face`, [[0, '#d8d0e8'], [0.5, '#7a6a90'], [1, '#2a2038']]),
    lin(`${u}hand`, [[0, '#a898b8'], [1, '#3a2c4a']], [0, 0, 1, 0]),
    glow(u, 'eye', '#ff3a8a', 1),
    rad(`${u}maw`, [[0, '#000', 1], [0.6, '#12040e', 1], [1, '#3a0a2a', 1]])
  ].join('');
  const inner = `
<!-- fumée et lambeaux -->
<path d="M0 100 C0 70 14 50 30 44 L70 44 C86 50 100 70 100 100 L90 94 L84 100 L74 92 L66 100 L56 92 L48 100 L40 92 L32 100 L22 92 L14 100 L8 94 Z" fill="url(#${u}shroud)"/>
<path d="M12 70 C18 58 26 50 34 46 M88 70 C82 58 74 50 66 46" stroke="#a88ac0" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".4"/>
<!-- mains décharnées tendues -->
<g stroke="url(#${u}hand)" stroke-linecap="round" fill="none"><path d="M6 78 C10 70 16 66 24 66" stroke-width="4"/><path d="M4 72 L0 62 M8 68 L5 56 M13 66 L12 54 M18 66 L19 56" stroke-width="2.4"/>
<path d="M94 78 C90 70 84 66 76 66" stroke-width="4"/><path d="M96 72 L100 62 M92 68 L95 56 M87 66 L88 54 M82 66 L81 56" stroke-width="2.4"/></g>
<!-- capuche -->
<path d="M22 60 C14 30 30 6 50 5 C70 6 86 30 78 60 C72 70 28 70 22 60 Z" fill="url(#${u}shroud)"/>
<path d="M26 38 C28 22 38 11 48 8" fill="none" stroke="#c8a8e8" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
<!-- visage émacié -->
<path d="M31 56 C29 38 38 24 50 24 C62 24 71 38 69 56 C66 66 34 66 31 56 Z" fill="url(#${u}face)"/>
<path d="M34 50 C36 58 40 62 44 63 M66 50 C64 58 60 62 56 63" stroke="#2a2038" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".5"/>
<!-- orbites -->
<ellipse cx="41" cy="40" rx="7.4" ry="9" fill="#0a040e"/><ellipse cx="59" cy="40" rx="7.4" ry="9" fill="#0a040e"/>
<circle cx="41" cy="41" r="7" fill="url(#${u}eye)"/><circle cx="59" cy="41" r="7" fill="url(#${u}eye)"/>
<circle cx="41" cy="41" r="2.6" fill="#ffd0e6"/><circle cx="59" cy="41" r="2.6" fill="#ffd0e6"/>
<!-- la gueule affamée -->
<ellipse cx="50" cy="58" rx="11.6" ry="13.4" fill="url(#${u}maw)"/>
<ellipse cx="50" cy="58" rx="11.6" ry="13.4" fill="none" stroke="#6a1a4a" stroke-width="1"/>
${Array.from({ length: 7 }, (_, i) => { const a = Math.PI + (i / 6) * Math.PI; return `<path d="M${50 + Math.cos(a) * 11.4} ${58 + Math.sin(a) * 13.2} l${-Math.cos(a) * 3.4} ${-Math.sin(a) * 4.6 + 1} l${Math.sin(a) * 2.2 + 0.8} 0 Z" fill="#e8dcc8"/>`; }).join('')}
${Array.from({ length: 5 }, (_, i) => { const a = (i / 4) * Math.PI * 0.8 + 0.1 * Math.PI; return `<path d="M${50 + Math.cos(a) * 10.6} ${58 + Math.sin(a) * 12.4} l${-Math.cos(a) * 3} ${-Math.sin(a) * 4} l${0.8} ${-0.6} Z" fill="#cfc4b0"/>`; }).join('')}
<path d="M46 62 C48 66 52 66 54 62" fill="none" stroke="#c0407a" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`;
  return wrap(u, { defs, inner, bg: ['#2a1a3a', '#04020a', '#ff4a9a'], at: [50, 44], halo: 0.28 });
}

function horreur_rampante(u) {
  const defs = [
    lin(`${u}flesh`, [[0, '#b0407a'], [0.5, '#5a1840'], [1, '#1a0614']]),
    lin(`${u}fleshD`, [[0, '#6a2250'], [1, '#12040e']], [0, 0, 0, 1]),
    rad(`${u}maw`, [[0, '#0a0004', 1], [0.7, '#2a0818', 1], [1, '#6a1a3a', 1]]),
    glow(u, 'eye', '#ffe84a', 1),
    glow(u, 'eye2', '#ff6ac8', 1)
  ].join('');
  const tentacles = [[8, 90, 20, 56, 4, 40], [92, 90, 80, 56, 96, 40], [22, 98, 30, 70, 14, 62], [78, 98, 70, 70, 86, 62], [40, 100, 36, 78, 30, 84], [60, 100, 64, 78, 70, 84]]
    .map(([x, y, cx, cy, ex, ey]) => `<path d="M${x} ${y} Q${cx} ${cy} ${ex} ${ey}" fill="none" stroke="url(#${u}fleshD)" stroke-width="7" stroke-linecap="round"/><path d="M${x} ${y} Q${cx} ${cy} ${ex} ${ey}" fill="none" stroke="#e068a8" stroke-width="1" stroke-linecap="round" opacity=".45" transform="translate(-1.4 -1.4)"/>`).join('');
  const eyes = [[30, 36, 6.4, '#ffe84a'], [70, 34, 5.6, '#ffe84a'], [22, 54, 4, '#ff6ac8'], [78, 54, 4.4, '#ff6ac8'], [42, 24, 3.6, '#ffe84a'], [60, 22, 3.2, '#ff6ac8'], [50, 40, 4.4, '#ffe84a']]
    .map(([x, y, r, c], i) => `<circle cx="${x}" cy="${y}" r="${r * 1.7}" fill="url(#${u}${c === '#ffe84a' ? 'eye' : 'eye2'})"/><circle cx="${x}" cy="${y}" r="${r}" fill="#1a0610"/><circle cx="${x}" cy="${y}" r="${r * 0.78}" fill="${c}"/><ellipse cx="${x}" cy="${y}" rx="${r * 0.18}" ry="${r * 0.66}" fill="#1a0610"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.18}" fill="#fff"/>`).join('');
  const teeth = Array.from({ length: 9 }, (_, i) => `<path d="M${33 + i * 4.4} 66 L${35.2 + i * 4.4} ${73 + (i % 2) * 2} L${37.4 + i * 4.4} 66 Z" fill="#f0e4d0"/><path d="M${33 + i * 4.4} 88 L${35.2 + i * 4.4} ${81 - (i % 2) * 2} L${37.4 + i * 4.4} 88 Z" fill="#e0d4bc"/>`).join('');
  const inner = `
${tentacles}
<!-- masse -->
<path d="M14 100 C8 70 20 40 50 34 C80 40 92 70 86 100 Z" fill="url(#${u}flesh)"/>
<path d="M18 86 C14 66 24 46 44 38" fill="none" stroke="#ffa0d8" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
<path d="M30 60 C34 56 40 58 40 62 M64 66 C68 62 74 64 74 68 M48 52 C52 50 56 52 56 56" stroke="#2a0818" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".5"/>
${eyes}
<!-- gueule verticale -->
<path d="M30 76 C30 62 40 56 50 56 C60 56 70 62 70 76 C70 90 60 98 50 98 C40 98 30 90 30 76 Z" fill="url(#${u}maw)"/>
<path d="M30 76 C30 62 40 56 50 56 C60 56 70 62 70 76" fill="none" stroke="#ff7ac0" stroke-width="1.2" opacity=".7"/>
${teeth}
<path d="M44 78 C47 82 53 82 56 78 C54 84 46 84 44 78 Z" fill="#c0306a"/>
<!-- piques -->
<path d="M26 44 L18 32 L32 40 Z M74 44 L82 32 L68 40 Z M50 34 L50 22 L56 34 Z" fill="url(#${u}fleshD)"/>`;
  return wrap(u, { defs, inner, bg: ['#40143a', '#08020a', '#ff4ac0'], at: [50, 40], halo: 0.3 });
}

function gardien_dechu(u) {
  const defs = [
    lin(`${u}gold`, [[0, '#ffeaa8'], [0.45, '#c8923a'], [1, '#4a3010']]),
    lin(`${u}black`, [[0, '#4a4a58'], [0.5, '#1c1c26'], [1, '#050508']]),
    lin(`${u}stone`, [[0, '#4a4640'], [1, '#15130f']], [0, 0, 0, 1]),
    glow(u, 'core', '#fff0b0', 1),
    rad(`${u}arch`, [[0, '#ffc84a', 0.5], [1, '#ffc84a', 0]])
  ].join('');
  const inner = `
<!-- arche de pierre -->
<path d="M0 100 L0 20 C0 -4 30 -10 50 -10 C70 -10 100 -4 100 20 L100 100 L90 100 L90 26 C90 10 70 4 50 4 C30 4 10 10 10 26 L10 100 Z" fill="url(#${u}stone)" opacity=".85"/>
<circle cx="50" cy="40" r="44" fill="url(#${u}arch)"/>
<!-- grande épée -->
<path d="M50 100 L50 66" stroke="url(#${u}gold)" stroke-width="5" stroke-linecap="round"/>
<path d="M38 74 H62" stroke="url(#${u}gold)" stroke-width="4" stroke-linecap="round"/>
<!-- épaulières massives -->
<path d="M0 100 C0 78 10 66 26 62 L74 62 C90 66 100 78 100 100 Z" fill="url(#${u}black)"/>
<path d="M0 84 C0 68 12 58 30 60 C34 70 28 82 14 90 Z" fill="url(#${u}gold)"/><path d="M100 84 C100 68 88 58 70 60 C66 70 72 82 86 90 Z" fill="url(#${u}gold)" opacity=".9"/>
<path d="M4 78 C8 68 16 62 28 61" fill="none" stroke="#fff6d0" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
<path d="M6 72 L0 56 L14 66 M16 66 L14 48 L24 62" fill="none" stroke="url(#${u}gold)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M94 72 L100 56 L86 66 M84 66 L86 48 L76 62" fill="none" stroke="url(#${u}gold)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M30 100 L36 70 M70 100 L64 70" stroke="#ffc84a" stroke-width="1" opacity=".5"/>
<!-- plastron fissuré, lumière au cœur -->
<path d="M34 100 L36 68 L64 68 L66 100 Z" fill="url(#${u}black)"/>
<circle cx="50" cy="84" r="9" fill="url(#${u}core)"/><circle cx="50" cy="84" r="3.6" fill="#fffbe6"/>
<path d="M50 76 L47 66 M50 92 L53 100 M42 84 L36 88 M58 84 L64 80" stroke="#ffe08a" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>
<!-- heaume doré à cimier -->
<path d="M50 -2 C54 6 56 12 54 20 L46 20 C44 12 46 6 50 -2 Z" fill="url(#${u}gold)"/>
<path d="M26 54 C24 30 34 14 50 14 C66 14 76 30 74 54 L70 66 C62 72 38 72 30 66 Z" fill="url(#${u}gold)"/>
<path d="M30 36 C32 26 38 19 46 16" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
<path d="M30 38 H70 V50 H30 Z" fill="#05050a"/>
<path d="M36 44 H64" stroke="url(#${u}core)" stroke-width="5" stroke-linecap="round"/>
<path d="M38 44 H62" stroke="#fffbe6" stroke-width="2" stroke-linecap="round"/>
<circle cx="50" cy="44" r="14" fill="url(#${u}core)" opacity=".75"/>
<rect x="48.2" y="14" width="3.6" height="24" rx="1.4" fill="url(#${u}black)"/>
<path d="M40 54 L40 66 M60 54 L60 66 M50 52 V68" stroke="#4a3010" stroke-width="1.4" opacity=".8"/>
<path d="M68 20 L64 32 L69 40" fill="none" stroke="#050508" stroke-width="1.4" stroke-linecap="round"/>`;
  return wrap(u, { defs, inner, bg: ['#4a3818', '#060504', '#ffc84a'], at: [50, 44], halo: 0.34 });
}

function mannequin(u, { rage = false } = {}) {
  const defs = [
    lin(`${u}sack`, [[0, '#e0c890'], [0.5, '#a88a58'], [1, '#4a3a22']]),
    lin(`${u}wood`, [[0, '#a07a4a'], [0.5, '#6a4a28'], [1, '#2a1a0c']], [0, 0, 1, 0]),
    lin(`${u}straw`, [[0, '#f0d878'], [1, '#a88a38']]),
    lin(`${u}rope`, [[0, '#d8c090'], [1, '#6a5430']])
  ].join('');
  const red = rage ? '#d0201a' : '#b0302a';
  const straw = [[28, 28, -20], [24, 38, -34], [72, 26, 22], [78, 36, 36], [50, 12, 0], [40, 14, -10], [60, 14, 10]]
    .map(([x, y, r]) => `<path d="M${x} ${y} l0 -9" stroke="url(#${u}straw)" stroke-width="1.8" stroke-linecap="round" transform="rotate(${r} ${x} ${y})"/>`).join('');
  const inner = `
<!-- cour d'entraînement : planches au fond -->
<g opacity=".5"><path d="M0 70 H100 M0 84 H100" stroke="#0a0806" stroke-width="2"/><path d="M12 56 V100 M34 56 V100 M56 56 V100 M78 56 V100" stroke="#0a0806" stroke-width="1.4"/></g>
<!-- poteau et bras -->
<rect x="45.6" y="56" width="8.8" height="44" fill="url(#${u}wood)"/>
<rect x="6" y="66" width="88" height="8.4" rx="3" fill="url(#${u}wood)"/>
<path d="M10 66.6 H90" stroke="#d8b078" stroke-width=".8" opacity=".5"/>
<!-- corps de toile -->
<path d="M26 64 C30 58 40 56 50 56 C60 56 70 58 74 64 L72 92 C62 96 38 96 28 92 Z" fill="url(#${u}sack)"/>
<path d="M32 64 C36 60 42 59 48 59" fill="none" stroke="#fff4d0" stroke-width="1" opacity=".5" stroke-linecap="round"/>
<path d="M30 76 L44 80 M70 82 L56 78 M34 88 L48 90" stroke="#4a3a22" stroke-width="1" stroke-dasharray="2 2" opacity=".7"/>
<!-- cible sur la poitrine -->
<circle cx="50" cy="77" r="13" fill="#f4ead0"/><circle cx="50" cy="77" r="13" fill="none" stroke="#2a1a0c" stroke-width=".8"/>
<circle cx="50" cy="77" r="9.6" fill="${red}"/><circle cx="50" cy="77" r="6" fill="#f4ead0"/><circle cx="50" cy="77" r="3.2" fill="${red}"/>
<!-- cordes -->
<g stroke="url(#${u}rope)" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M36 64 L36 74 M64 64 L64 74"/><path d="M42 56 L58 58 M42 60 L58 62" stroke-width="1.6"/></g>
<!-- paille -->
${straw}
<!-- tête de sac -->
<path d="M30 34 C30 18 40 12 50 12 C60 12 70 18 70 34 C70 46 62 54 50 54 C38 54 30 46 30 34 Z" fill="url(#${u}sack)"/>
<path d="M33 26 C35 20 40 16 46 15" fill="none" stroke="#fff4d0" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
<path d="M34 50 L66 50" stroke="url(#${u}rope)" stroke-width="3.2" stroke-linecap="round"/>
<!-- visage cousu -->
${rage
    ? `<path d="M36 28 L45 34 M64 28 L55 34" stroke="${red}" stroke-width="2.6" stroke-linecap="round"/>
<path d="M37 33 L44 39 M44 33 L37 39 M56 33 L63 39 M63 33 L56 39" stroke="#1a0e08" stroke-width="2" stroke-linecap="round"/>
<path d="M38 44 C44 48 56 48 62 44" stroke="#1a0e08" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M42 43.4 V47.4 M47 45 V49 M53 45 V49 M58 43.4 V47.4" stroke="#1a0e08" stroke-width="1.4"/>
<path d="M24 62 L16 52 L30 60 Z M76 62 L84 52 L70 60 Z" fill="#9aa4ae"/><path d="M26 61 L18 54" stroke="#fff" stroke-width=".7" opacity=".7"/>`
    : `<path d="M38 31 L44 37 M44 31 L38 37 M56 31 L62 37 M62 31 L56 37" stroke="#2a1a0c" stroke-width="2" stroke-linecap="round"/>
<path d="M40 44 C46 47 54 47 60 44" stroke="#2a1a0c" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M43 43.6 V46.6 M48 45 V48 M52 45 V48 M57 43.6 V46.6" stroke="#2a1a0c" stroke-width="1.2"/>`}`;
  return wrap(u, { defs, inner, bg: rage ? ['#4a2a22', '#0a0605', '#ff6a3a'] : ['#4a3a2a', '#0a0806', '#ffd890'], at: [34, 26], halo: 0.3 });
}

export const MONSTERS_DEPTHS = {
  ogre_des_cryptes, chevalier_dechu, sorciere_des_marais, spectre_affame, horreur_rampante, gardien_dechu,
  mannequin: (u) => mannequin(u),
  mannequin_agressif: (u) => mannequin(u, { rage: true })
};
