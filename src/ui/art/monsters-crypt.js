// ============================================================
//  art/monsters-crypt.js — Les monstres de la Crypte Oubliée (tranche 4)
// ============================================================

import { lin, rad, glow, wrap } from './kit.js';

function goule(u) {
  const defs = [
    lin(`${u}skin`, [[0, '#cbd6b0'], [0.5, '#7a8a6c'], [1, '#2a3224']]),
    lin(`${u}rag`, [[0, '#7a7a68'], [1, '#17170f']], [0, 0, 0, 1]),
    lin(`${u}claw`, [[0, '#9aa88a'], [1, '#3a4430']], [0, 0, 1, 0]),
    glow(u, 'eye', '#f2ff9a', 0.8)
  ].join('');
  const topTeeth = Array.from({ length: 7 }, (_, i) => `<path d="M${38 + i * 4} 61 L${40 + i * 4} ${66 + (i % 2) * 2} L${42 + i * 4} 61 Z" fill="#efe8cc"/>`).join('');
  const lowTeeth = Array.from({ length: 6 }, (_, i) => `<path d="M${40 + i * 4} 73 L${42 + i * 4} ${68 - (i % 2) * 2} L${44 + i * 4} 73 Z" fill="#d8cfae"/>`).join('');
  const hand = (flip) => `<g transform="${flip ? 'translate(100 0) scale(-1 1)' : ''}">
<path d="M0 100 C4 86 12 80 20 80 L28 96 L22 100 Z" fill="url(#${u}claw)"/>
<path d="M6 88 L1 74 M11 84 L8 68 M16 82 L15 66 M21 84 L23 70" stroke="url(#${u}claw)" stroke-width="3" stroke-linecap="round"/>
<path d="M1 74 L0 70 M8 68 L7 63 M15 66 L15 61 M23 70 L24 65" stroke="#f0e6c8" stroke-width="1.4" stroke-linecap="round"/></g>`;
  const inner = `
<path d="M4 100 C8 87 22 81 36 79 L64 79 C78 81 92 87 96 100 Z" fill="url(#${u}rag)"/>
<path d="M18 98 L26 86 M70 100 L76 88 M50 100 L48 84" stroke="#0c0c08" stroke-width="1.4" opacity=".6"/>
<!-- cheveux clairsemés -->
<path d="M30 30 C26 44 24 60 28 80 M36 22 C30 40 30 56 33 74 M70 30 C74 44 76 60 72 80 M64 22 C70 40 70 56 67 74" stroke="#9a9a8a" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".7"/>
<!-- cou -->
<path d="M42 70 L42 82 L58 82 L58 70 Z" fill="#4a5440"/><path d="M45 72 V82 M50 72 V82 M55 72 V82" stroke="#2a3224" stroke-width="1"/>
<!-- tête -->
<path d="M50 11 C66 11 75 23 74 40 C74 52 69 61 63 69 L58 77 L42 77 L37 69 C31 61 26 52 26 40 C25 23 34 11 50 11 Z" fill="url(#${u}skin)"/>
<path d="M30 30 C32 22 38 16 46 13" fill="none" stroke="#f2ffe0" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
<path d="M33 52 C37 56 40 60 42 66 M67 52 C63 56 60 60 58 66" stroke="#1c241a" stroke-width="2.4" stroke-linecap="round" opacity=".45" fill="none"/>
<!-- orbites et yeux globuleux -->
<ellipse cx="39" cy="40" rx="9" ry="9.6" fill="#10160e"/><ellipse cx="61" cy="40" rx="9" ry="9.6" fill="#10160e"/>
<circle cx="39" cy="41" r="9" fill="url(#${u}eye)"/><circle cx="61" cy="41" r="9" fill="url(#${u}eye)"/>
<circle cx="39" cy="41" r="5.6" fill="#f0f4b0"/><circle cx="61" cy="41" r="5.6" fill="#f0f4b0"/>
<circle cx="39.6" cy="41.4" r="1.6" fill="#1a1006"/><circle cx="60.4" cy="41.4" r="1.6" fill="#1a1006"/>
<path d="M34 39 L37 40.4 M36 44 L38 42.4 M66 39 L63 40.4 M64 44 L62 42.4" stroke="#b02a2a" stroke-width=".6" opacity=".8"/>
<path d="M30 33 L46 38 M70 33 L54 38" stroke="#1c241a" stroke-width="2" stroke-linecap="round" opacity=".7"/>
<path d="M47 49 L46 55 M53 49 L54 55" stroke="#141a10" stroke-width="1.6" stroke-linecap="round"/>
<!-- gueule -->
<path d="M35 60 C41 78 59 78 65 60 C59 65 41 65 35 60 Z" fill="#14060a"/>
${topTeeth}${lowTeeth}
<path d="M44 70 C47 74 53 74 56 70 C54 72 46 72 44 70 Z" fill="#a43a4a"/>
${hand(false)}${hand(true)}`;
  return wrap(u, { defs, inner, bg: ['#394a34', '#060805', '#c8ff7a'], at: [32, 30], halo: 0.3 });
}

function garde_squelette(u) {
  const defs = [
    lin(`${u}steel`, [[0, '#cfe0f0'], [0.45, '#6f86a0'], [1, '#18222e']]),
    lin(`${u}steelD`, [[0, '#46586c'], [1, '#0e141c']], [0, 0, 0, 1]),
    lin(`${u}bone`, [[0, '#eaf0f0'], [0.5, '#a8b4b8'], [1, '#4a5458']]),
    lin(`${u}plume`, [[0, '#d8404a'], [1, '#4a0c14']]),
    glow(u, 'eye', '#6ad8ff', 1)
  ].join('');
  const inner = `
<!-- lance -->
<path d="M86 100 L86 24" stroke="#4a3626" stroke-width="3" stroke-linecap="round"/>
<path d="M86 6 L91 24 L86 21 L81 24 Z" fill="url(#${u}steel)"/>
<!-- bouclier -->
<path d="M0 66 L28 66 C32 82 26 96 14 100 L0 100 Z" fill="url(#${u}steelD)"/>
<path d="M2 70 L24 70 C26 82 22 92 14 96 L2 96 Z" fill="none" stroke="#6ad8ff" stroke-width=".8" opacity=".6"/>
<circle cx="12" cy="82" r="3.4" fill="#0e141c"/><circle cx="12" cy="82" r="1.4" fill="#6ad8ff"/>
<!-- armure -->
<path d="M6 100 C10 86 24 80 36 78 L64 78 C76 80 90 86 94 100 Z" fill="url(#${u}steelD)"/>
<path d="M28 80 C16 82 10 90 8 98 C16 92 26 90 36 90 Z" fill="url(#${u}steel)"/><path d="M72 80 C84 82 90 90 92 98 C84 92 74 90 64 90 Z" fill="url(#${u}steel)" opacity=".9"/>
<path d="M12 90 C18 84 24 82 30 81" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".6"/>
<path d="M40 78 L44 90 L50 80 L56 90 L60 78" fill="none" stroke="#9db0c4" stroke-width="1.4" stroke-linejoin="round" opacity=".6"/>
<!-- cervicales et mâchoire -->
<rect x="44" y="64" width="12" height="6" rx="2.5" fill="url(#${u}bone)"/><rect x="44" y="70" width="12" height="6" rx="2.5" fill="url(#${u}bone)"/>
<path d="M36 56 L64 56 L62 68 C58 72 42 72 38 68 Z" fill="url(#${u}bone)"/>
<path d="M39 62 H61" stroke="#2a3236" stroke-width="3.4"/>
${Array.from({ length: 8 }, (_, i) => `<path d="M${39.2 + i * 2.8} 60.6 V64.4" stroke="#e8f0f0" stroke-width="1.8" stroke-linecap="round"/>`).join('')}
<!-- plumet -->
<path d="M50 20 C40 4 56 -2 70 6 C60 8 60 16 54 22 Z" fill="url(#${u}plume)"/>
<path d="M46 14 C52 8 60 6 66 8" fill="none" stroke="#ff9a8a" stroke-width=".8" opacity=".7"/>
<!-- heaume -->
<path d="M30 56 C28 34 36 20 50 20 C64 20 72 34 70 56 L64 60 L36 60 Z" fill="url(#${u}steel)"/>
<path d="M34 34 C36 28 41 24 47 22" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>
<path d="M31 42 H69" stroke="#10181f" stroke-width="1.2" opacity=".7"/>
<path d="M33 45 L48 46 L47 52 L34 51 Z M67 45 L52 46 L53 52 L66 51 Z" fill="#071018"/>
<circle cx="40.5" cy="48.6" r="7" fill="url(#${u}eye)"/><circle cx="59.5" cy="48.6" r="7" fill="url(#${u}eye)"/>
<path d="M36 47.4 L45 48 L44.6 50.6 L36.6 50.2 Z M64 47.4 L55 48 L55.4 50.6 L63.4 50.2 Z" fill="#c8f6ff"/>
<rect x="48.4" y="26" width="3.2" height="32" rx="1.2" fill="url(#${u}steelD)"/>
<path d="M49 27 V56" stroke="#cfe0f0" stroke-width=".8" opacity=".55"/>
<g fill="#dfeaf5"><circle cx="35" cy="38" r="1"/><circle cx="65" cy="38" r="1"/></g>`;
  return wrap(u, { defs, inner, bg: ['#26384c', '#05080d', '#7ad8ff'], at: [34, 36], halo: 0.3 });
}

function cultiste_maudit(u) {
  const defs = [
    lin(`${u}robe`, [[0, '#6a3a86'], [0.5, '#341848'], [1, '#0d0614']], [0.1, 0, 0.9, 1]),
    lin(`${u}hood`, [[0, '#7a4698'], [0.5, '#3a1c52'], [1, '#110718']]),
    lin(`${u}trim`, [[0, '#ffd88a'], [1, '#9a5a1a']], [0, 0, 1, 0]),
    glow(u, 'eye', '#ff4aa8', 1),
    rad(`${u}orb`, [[0, '#fff0f8', 1], [0.4, '#ff5ab0', 0.8], [1, '#c01a6a', 0]])
  ].join('');
  const inner = `
<!-- robe -->
<path d="M2 100 L10 80 C20 68 34 62 40 60 L60 60 C66 62 80 68 90 80 L98 100 Z" fill="url(#${u}robe)"/>
<path d="M26 100 C28 86 36 74 42 66 M74 100 C72 86 64 74 58 66 M50 100 L50 74" stroke="#0a0410" stroke-width="1.4" fill="none" opacity=".6"/>
<path d="M8 84 C16 74 28 68 38 64" fill="none" stroke="#d494f0" stroke-width="1" stroke-linecap="round" opacity=".5"/>
<path d="M36 98 L40 64 M64 98 L60 64" stroke="url(#${u}trim)" stroke-width="1.8" opacity=".85"/>
<!-- sceau sur la poitrine -->
<g opacity=".95"><path d="M50 70 L58 84 L42 84 Z" fill="none" stroke="#ff5ab0" stroke-width="1.2"/><ellipse cx="50" cy="79.4" rx="3.6" ry="2.2" fill="none" stroke="#ff9ad0" stroke-width=".9"/><circle cx="50" cy="79.4" r="1" fill="#fff0f8"/></g>
<!-- capuche -->
<path d="M24 64 C14 34 28 8 50 5 C72 8 86 34 76 64 C71 72 62 74 50 74 C38 74 29 72 24 64 Z" fill="url(#${u}hood)"/>
<path d="M27 40 C29 24 38 13 48 9" fill="none" stroke="#e0a8ff" stroke-width="1.2" stroke-linecap="round" opacity=".65"/>
<path d="M25 62 C32 70 40 72 50 72 C60 72 68 70 75 62" fill="none" stroke="url(#${u}trim)" stroke-width="1.4" opacity=".85"/>
<!-- le vide du visage -->
<path d="M33.5 56 C30 36 40 22 50 22 C60 22 70 36 66.5 56 C62 66 38 66 33.5 56 Z" fill="#050208"/>
<path d="M36 48 C34 38 40 28 48 25" fill="none" stroke="#2a1038" stroke-width="2" opacity=".7" stroke-linecap="round"/>
<!-- trois yeux -->
<circle cx="42" cy="46" r="7" fill="url(#${u}eye)"/><circle cx="58" cy="46" r="7" fill="url(#${u}eye)"/><circle cx="50" cy="32" r="6" fill="url(#${u}eye)"/>
<path d="M38 46 C40 43.4 44 43.4 46 46 C44 48 40 48 38 46 Z M54 46 C56 43.4 60 43.4 62 46 C60 48 56 48 54 46 Z" fill="#ffd0ea"/>
<path d="M47 32 C49 30 51 30 53 32 C51 34 49 34 47 32 Z" fill="#ffd0ea"/>
<path d="M44 58 L50 62 L56 58" fill="none" stroke="#ff4aa8" stroke-width="1" opacity=".4" stroke-linecap="round"/>
<!-- mains jointes et lueur -->
<circle cx="50" cy="90" r="14" fill="url(#${u}orb)"/>
<path d="M36 100 C38 90 44 86 50 86 C56 86 62 90 64 100 Z" fill="#3a2230"/>
<path d="M42 92 C46 88 54 88 58 92" fill="none" stroke="#c89ab0" stroke-width="1" opacity=".6"/>`;
  return wrap(u, { defs, inner, bg: ['#3e1a4a', '#07040a', '#ff5aa0'], at: [50, 88], halo: 0.3 });
}

function ame_en_peine(u) {
  const defs = [
    lin(`${u}ghost`, [[0, '#f0fbff', 0.95], [0.45, '#8ac4e8', 0.8], [1, '#2a5a98', 0]], [0.2, 0, 0.8, 1]),
    lin(`${u}shroud`, [[0, '#b8e0f8', 0.85], [1, '#1a3a68', 0]], [0, 0, 0, 1]),
    rad(`${u}aura`, [[0, '#bfeaff', 0.55], [1, '#4a90d0', 0]]),
    glow(u, 'eye', '#ffffff', 0.9)
  ].join('');
  const inner = `
<circle cx="50" cy="46" r="42" fill="url(#${u}aura)"/>
<!-- bras tendus -->
<path d="M30 58 C18 56 8 62 2 74 C10 70 18 70 26 72 C22 76 22 82 24 86 C28 78 32 74 36 72 Z" fill="url(#${u}shroud)"/>
<path d="M70 58 C82 56 92 62 98 74 C90 70 82 70 74 72 C78 76 78 82 76 86 C72 78 68 74 64 72 Z" fill="url(#${u}shroud)"/>
<path d="M6 72 L1 80 M10 71 L7 82 M15 70 L13 80 M21 71 L20 78" stroke="#d8f2ff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
<path d="M94 72 L99 80 M90 71 L93 82 M85 70 L87 80 M79 71 L80 78" stroke="#d8f2ff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
<!-- linceul qui s'effiloche -->
<path d="M26 56 C22 78 14 92 8 100 L22 96 L30 100 L38 94 L46 100 L54 94 L62 100 L70 94 L78 100 L92 100 C86 92 78 78 74 56 Z" fill="url(#${u}shroud)"/>
<path d="M36 60 C34 76 30 88 26 98 M50 62 C50 78 50 88 50 98 M64 60 C66 76 70 88 74 98" stroke="#e8f8ff" stroke-width="1" fill="none" opacity=".35"/>
<!-- capuche et crâne -->
<path d="M26 54 C20 28 32 8 50 6 C68 8 80 28 74 54 C68 62 32 62 26 54 Z" fill="url(#${u}ghost)"/>
<path d="M30 34 C32 22 40 14 48 11" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
<path d="M34.5 48 C33 34 40 26 50 26 C60 26 67 34 65.5 48 C65 58 59 66 50 67 C41 66 35 58 34.5 48 Z" fill="#dcefff" opacity=".95"/>
<path d="M36 40 C37 32 42 28 48 27" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
<path d="M36 52 C39 58 43 62 47 63 M64 52 C61 58 57 62 53 63" stroke="#6a9ac8" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>
<!-- orbites creuses, regard de lumière, bouche qui hurle -->
<ellipse cx="42.4" cy="42" rx="6.2" ry="8" fill="#050d1c"/><ellipse cx="57.6" cy="42" rx="6.2" ry="8" fill="#050d1c"/>
<circle cx="42.4" cy="43" r="6.6" fill="url(#${u}eye)"/><circle cx="57.6" cy="43" r="6.6" fill="url(#${u}eye)"/>
<circle cx="42.4" cy="43" r="2.2" fill="#ffffff"/><circle cx="57.6" cy="43" r="2.2" fill="#ffffff"/>
<path d="M50 49 L47.6 55 H52.4 Z" fill="#12263e" opacity=".8"/>
<path d="M43 57 C44 70 56 70 57 57 C54 59.6 46 59.6 43 57 Z" fill="#050d1c"/>
<path d="M45 58 L46 61 L47.4 58.6 M52.6 58.6 L54 61 L55 58" fill="#dcefff" opacity=".9"/>
<!-- volutes -->
<path d="M16 40 C10 30 14 20 22 16 M84 38 C92 28 88 18 80 14 M40 96 C34 84 38 76 44 72" stroke="#cdeeff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".5"/>`;
  return wrap(u, { defs, inner, bg: ['#1c3254', '#03050a', '#9ae0ff'], at: [50, 40], halo: 0.34 });
}

function golem_de_boue(u) {
  const defs = [
    lin(`${u}mud`, [[0, '#b58a58'], [0.5, '#6a4a2a'], [1, '#26180c']]),
    lin(`${u}mudD`, [[0, '#7a5632'], [1, '#1a1008']], [0, 0, 0, 1]),
    lin(`${u}moss`, [[0, '#9ad05a'], [1, '#2a5a1a']]),
    glow(u, 'eye', '#ffb02a', 1),
    glow(u, 'crack', '#ff7a1a', 0.9)
  ].join('');
  const stones = [[30, 30, 3.4], [68, 40, 3], [42, 60, 2.6], [76, 24, 2.2], [24, 52, 2.4], [58, 18, 2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#8a8a84"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.4}" fill="#cfcfc8" opacity=".6"/>`).join('');
  const inner = `
<!-- épaules massives -->
<path d="M0 100 C0 76 10 62 28 60 L72 60 C90 62 100 76 100 100 Z" fill="url(#${u}mud)"/>
<ellipse cx="14" cy="78" rx="16" ry="14" fill="url(#${u}mud)"/><ellipse cx="86" cy="78" rx="16" ry="14" fill="url(#${u}mudD)"/>
<path d="M4 72 C8 64 16 62 22 64" fill="none" stroke="#f0d0a0" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
<path d="M34 100 C36 86 44 78 50 78 C56 78 64 86 66 100 Z" fill="url(#${u}mudD)" opacity=".7"/>
<path d="M42 70 L46 80 L44 90 M58 72 L56 82 L60 92" stroke="#ff7a1a" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M10 92 q3 -4 6 0 M80 94 q3 -4 6 0" stroke="#2a5a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
<!-- tête -->
<path d="M28 26 C27 14 38 8 50 8 C62 8 73 14 72 26 L75 50 C75 62 65 68 50 68 C35 68 25 62 25 50 Z" fill="url(#${u}mud)"/>
<path d="M30 22 C32 14 40 10 48 9.4" fill="none" stroke="#f6dcb0" stroke-width="1.3" stroke-linecap="round" opacity=".65"/>
${stones}
<!-- mousse -->
<path d="M30 14 C36 6 48 6 52 12 C46 12 40 16 38 20 C34 20 32 18 30 14 Z" fill="url(#${u}moss)"/>
<path d="M62 12 C70 10 76 18 74 24 C70 20 66 18 62 12 Z" fill="url(#${u}moss)" opacity=".9"/>
<path d="M44 8 l2 -6 M50 8 l0 -7 M56 8 l-2 -6" stroke="#6ab04a" stroke-width="1.4" stroke-linecap="round"/>
<!-- yeux et fissure -->
<path d="M30 36 C34 30 44 31 46 38 C44 42 34 43 30 36 Z" fill="#150b04"/><path d="M70 36 C66 30 56 31 54 38 C56 42 66 43 70 36 Z" fill="#150b04"/>
<circle cx="38" cy="37" r="8" fill="url(#${u}eye)"/><circle cx="62" cy="37" r="8" fill="url(#${u}eye)"/>
<ellipse cx="38" cy="37" rx="4.6" ry="3.4" fill="#ffd25a"/><ellipse cx="62" cy="37" rx="4.6" ry="3.4" fill="#ffd25a"/>
<path d="M50 46 L47 56 L51 62" stroke="#ff7a1a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9"/>
<path d="M36 56 C42 62 58 62 64 56 C58 58 42 58 36 56 Z" fill="#150b04"/>
<path d="M40 56.6 L42 60 L44 57.4 M48 58 L50 61.4 L52 58 M56 57.4 L58 60 L60 56.6" fill="#8a8a84"/>
<!-- gouttes de boue -->
<path d="M30 68 C29 72 31 74 32 72 C33 70 31 69 30 68 Z M68 66 C67 71 69 73 70 71 C71 69 69 67 68 66 Z" fill="#6a4a2a"/>`;
  return wrap(u, { defs, inner, bg: ['#4a3622', '#090705', '#ffb04a'], at: [32, 28], halo: 0.34 });
}

function seigneur_des_ossements(u) {
  const defs = [
    lin(`${u}bone`, [[0, '#f8f2dc'], [0.5, '#c8bc98'], [1, '#6a5e46']]),
    lin(`${u}boneD`, [[0, '#a89c7c'], [1, '#2e281c']], [0, 0, 0, 1]),
    lin(`${u}cloak`, [[0, '#3a2a52'], [1, '#0a0612']], [0, 0, 0, 1]),
    lin(`${u}gold`, [[0, '#fff0b8'], [0.5, '#d8a840'], [1, '#6a4814']]),
    glow(u, 'eye', '#5aff8a', 1),
    rad(`${u}fire`, [[0, '#e6ffd8', 1], [0.4, '#5aff8a', 0.85], [1, '#1a9a3a', 0]])
  ].join('');
  const spikes = [[26, 22, 16, 4], [34, 16, 28, -4], [43, 12, 42, -6], [57, 12, 58, -6], [66, 16, 72, -4], [74, 22, 84, 4]]
    .map(([x, y, tx, ty]) => `<path d="M${x - 3} ${y + 4} L${tx} ${ty} L${x + 3} ${y + 4} Z" fill="url(#${u}bone)"/>`).join('');
  const teeth = Array.from({ length: 9 }, (_, i) => `<path d="M${36 + i * 3.5} 66 L${37.8 + i * 3.5} ${72 + (i % 2) * 2} L${39.6 + i * 3.5} 66 Z" fill="#efe6c8"/>`).join('');
  const inner = `
<circle cx="50" cy="38" r="34" fill="url(#${u}fire)" opacity=".28"/>
<!-- sceptre -->
<path d="M90 100 L90 30" stroke="url(#${u}gold)" stroke-width="2.6" stroke-linecap="round"/>
<circle cx="90" cy="24" r="8" fill="url(#${u}bone)"/><circle cx="87" cy="24" r="1.8" fill="#0a1a10"/><circle cx="93" cy="24" r="1.8" fill="#0a1a10"/><path d="M87 29 H93" stroke="#2e281c" stroke-width="1.2"/>
<circle cx="87" cy="24" r="3.4" fill="url(#${u}fire)"/><circle cx="93" cy="24" r="3.4" fill="url(#${u}fire)"/>
<!-- manteau et épaulières -->
<path d="M0 100 L4 74 C18 62 34 60 50 62 C66 60 82 62 96 74 L100 100 Z" fill="url(#${u}cloak)"/>
<g><ellipse cx="14" cy="80" rx="14" ry="10" fill="url(#${u}boneD)"/><ellipse cx="86" cy="80" rx="14" ry="10" fill="url(#${u}boneD)"/>
<path d="M4 76 L10 64 L16 76 M18 72 L26 62 L28 74 M96 76 L90 64 L84 76 M82 72 L74 62 L72 74" fill="none" stroke="url(#${u}bone)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></g>
<!-- cage thoracique -->
<path d="M34 74 C40 70 60 70 66 74 M32 82 C40 78 60 78 68 82 M34 90 C42 86 58 86 66 90" stroke="url(#${u}bone)" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M50 68 V100" stroke="url(#${u}bone)" stroke-width="3.4" stroke-linecap="round"/>
<!-- crâne géant -->
<path d="M50 20 C68 20 80 32 79 49 C79 57 75 61 72 64 L71 71 C71 75 68 77 64 77 L36 77 C32 77 29 75 29 71 L28 64 C25 61 21 57 21 49 C20 32 32 20 50 20 Z" fill="url(#${u}bone)"/>
<path d="M25 46 C25 34 33 26 42 23" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>
<path d="M66 30 L62 42 L67 50" fill="none" stroke="#6a5e46" stroke-width="1.1" stroke-linecap="round"/>
<!-- orbites et flammes vertes -->
<ellipse cx="38" cy="50" rx="9.4" ry="10.4" fill="#06100a"/><ellipse cx="62" cy="50" rx="9.4" ry="10.4" fill="#06100a"/>
<circle cx="38" cy="50" r="10" fill="url(#${u}eye)"/><circle cx="62" cy="50" r="10" fill="url(#${u}eye)"/>
<path d="M38 56 C32 52 33 44 38 38 C37 44 41 44 40 40 C44 44 44 52 38 56 Z" fill="#c8ffd8"/>
<path d="M62 56 C56 52 57 44 62 38 C61 44 65 44 64 40 C68 44 68 52 62 56 Z" fill="#c8ffd8"/>
<path d="M50 60 L45.6 68 L54.4 68 Z" fill="#0a0e0a"/>
<path d="M33 66 H67 V74 H33 Z" fill="#14100a"/>${teeth}
<!-- couronne d'os -->
<path d="M24 28 C30 22 40 19 50 19 C60 19 70 22 76 28 L74 34 C66 28 34 28 26 34 Z" fill="url(#${u}gold)"/>
${spikes}
<circle cx="50" cy="26" r="2.6" fill="#3aff7a"/><circle cx="36" cy="26" r="1.5" fill="#d02a3a"/><circle cx="64" cy="26" r="1.5" fill="#d02a3a"/>`;
  return wrap(u, { defs, inner, bg: ['#28483a', '#04080a', '#5aff8a'], at: [50, 34], halo: 0.32 });
}

export const MONSTERS_CRYPT = { goule, garde_squelette, cultiste_maudit, ame_en_peine, golem_de_boue, seigneur_des_ossements };
