// ============================================================
//  art/monsters-donjons.js — Les monstres des donjons à thème : bandits, cochons, cultistes, ogres
// ============================================================
// Un dessin par FAMILLE, décliné en variantes (couleurs, accessoire, taille) : les monstres d'un même donjon se ressemblent, comme une bande.
// Pour ajouter un monstre à une famille : une ligne dans MONSTERS_DONJONS, avec ses options.

import { lin, glow, wrap } from './kit.js';

const steel = (u) => lin(`${u}steel`, [[0, '#f4f7fa'], [0.5, '#a8b4c0'], [1, '#3d4856']]);
const ivory = (u) => lin(`${u}ivory`, [[0, '#fffbe8'], [1, '#b9a777']]);

/** Un BANDIT : capuche (ou tricorne), foulard sur le bas du visage, et son arme (`prop` : dagger, crossbow, club, vial, sabre). */
function bandit(u, { hood = ['#4a4f3a', '#1c2016'], skin = ['#d9a982', '#8a5a3e'], mask = '#2a2320', eye = '#f2e6c8', patch = false, scar = false, prop = 'dagger', hat = false, bg = ['#3a3524', '#0b0a07', '#f0b050'] } = {}) {
  const defs = [lin(`${u}hood`, [[0, hood[0]], [1, hood[1]]], [0, 0, 0, 1]), lin(`${u}skin`, [[0, skin[0]], [1, skin[1]]]), steel(u)].join('');
  const props = {
    dagger: `<path d="M79 92 L84 40 L88 43 L86 92 Z" fill="url(#${u}steel)"/><rect x="76" y="88" width="14" height="3" rx="1" fill="#6b4a2a"/>`,
    crossbow: `<path d="M68 74 L96 58" stroke="#5a4028" stroke-width="4" stroke-linecap="round"/><path d="M76 50 C90 52 98 62 97 76" fill="none" stroke="#3a2a1a" stroke-width="2.600"/><path d="M76 50 L97 76" stroke="#d8d2c0" stroke-width=".8"/>`,
    club: `<path d="M80 98 L86 48" stroke="#5a4028" stroke-width="6" stroke-linecap="round"/><ellipse cx="86.500" cy="40" rx="7.500" ry="10" fill="#4a3320"/><g fill="#c2cad2"><circle cx="82" cy="35" r="1.600"/><circle cx="91" cy="40" r="1.600"/><circle cx="85" cy="46" r="1.600"/></g>`,
    vial: `<circle cx="84.500" cy="68" r="12" fill="#6fd13e" opacity=".22"/><rect x="80" y="62" width="9" height="16" rx="3.500" fill="#6fd13e"/><rect x="82" y="57" width="5" height="6" fill="#caa67a"/><circle cx="84.500" cy="69" r="2" fill="#d8ffb0" opacity=".8"/>`,
    sabre: `<path d="M74 98 C80 70 86 52 97 36 C95 56 89 76 83 98 Z" fill="url(#${u}steel)"/><path d="M71 90 H89" stroke="#c9a03c" stroke-width="3" stroke-linecap="round"/>`
  };
  const inner = `
${props[prop] || ''}
<path d="M4 100 L10 84 C18 73 32 69 40 69 L60 69 C68 69 82 73 90 84 L96 100 Z" fill="url(#${u}hood)"/>
<path d="M42 58 L42 70 C46 73 54 73 58 70 L58 58 Z" fill="url(#${u}skin)"/>
<ellipse cx="50" cy="45" rx="14" ry="16.500" fill="url(#${u}skin)"/>
${hat
    ? `<path d="M33 30 C34 11 66 11 67 30 Z" fill="url(#${u}hood)"/><path d="M20 33 C30 23 70 23 80 33 C66 28 34 28 20 33 Z" fill="url(#${u}hood)"/><path d="M34 27 C44 30 56 30 66 27" fill="none" stroke="#c9a03c" stroke-width="1.700"/>`
    : `<path d="M27 54 C21 27 34 9 50 9 C66 9 79 27 73 54 C70 41 64 31 50 31 C36 31 30 41 27 54 Z" fill="url(#${u}hood)"/>`}
<path d="M36.500 49 C42 53 58 53 63.500 49 L62 61 C56 66 44 66 38 61 Z" fill="${mask}"/>
<path d="M39 41 L47 43 M61 41 L53 43" stroke="#1a100a" stroke-width="1.700" stroke-linecap="round"/>
${patch
    ? `<path d="M37 35 L63 47" stroke="#14100c" stroke-width="1.300"/><ellipse cx="43.500" cy="44.500" rx="4.400" ry="3.600" fill="#14100c"/>`
    : `<ellipse cx="43.500" cy="45" rx="2.700" ry="1.800" fill="${eye}"/><circle cx="43.800" cy="45.100" r="1.050" fill="#2a1a10"/>`}
<ellipse cx="56.500" cy="45" rx="2.700" ry="1.800" fill="${eye}"/><circle cx="56.200" cy="45.100" r="1.050" fill="#2a1a10"/>
${scar ? `<path d="M58.500 33 L62.500 52" stroke="#b03a2e" stroke-width="1.500" stroke-linecap="round"/>` : ''}`;
  return wrap(u, { defs, inner, bg, at: [30, 34] });
}

/** Un COCHON vu de face : oreilles, groin, petits yeux ; `tusk` = longueur des défenses (0 = aucune), `s` = sa taille. */
function pig(u, { hide = ['#e8a7a0', '#9c5a56'], snout = '#f0b9b2', tusk = 0, eye = '#1a0f0c', s = 1, mud = false, crown = false, scars = false, angry = false, bg = ['#3d3a22', '#0c0b07', '#e8c060'] } = {}) {
  const defs = [lin(`${u}hide`, [[0, hide[0]], [1, hide[1]]]), ivory(u)].join('');
  const t = tusk;
  const inner = `<g transform="translate(50 56) scale(${s}) translate(-50 -56)">
<path d="M22 34 L13 11 L37 24 Z" fill="url(#${u}hide)"/><path d="M78 34 L87 11 L63 24 Z" fill="url(#${u}hide)"/>
<path d="M21 30 L17 17 L31 25 Z" fill="#7a3f3c" opacity=".55"/><path d="M79 30 L83 17 L69 25 Z" fill="#7a3f3c" opacity=".55"/>
<path d="M18 56 C18 32 32 20 50 20 C68 20 82 32 82 56 C82 78 68 92 50 92 C32 92 18 78 18 56 Z" fill="url(#${u}hide)"/>
${t ? `<path d="M31 75 C27 ${75 - t} 29 ${66 - t} 34 ${61 - t} C33 ${68 - t / 2} 35 72 39 77 Z" fill="url(#${u}ivory)"/><path d="M69 75 C73 ${75 - t} 71 ${66 - t} 66 ${61 - t} C67 ${68 - t / 2} 65 72 61 77 Z" fill="url(#${u}ivory)"/>` : ''}
<ellipse cx="50" cy="68" rx="15" ry="11.500" fill="${snout}"/>
<ellipse cx="44.500" cy="68" rx="2.600" ry="4" fill="#5a2a28"/><ellipse cx="55.500" cy="68" rx="2.600" ry="4" fill="#5a2a28"/>
<path d="M38 59 C44 56 56 56 62 59" fill="none" stroke="#7a3f3c" stroke-width="1" opacity=".6"/>
<circle cx="37" cy="46" r="3.500" fill="#fff6ea"/><circle cx="63" cy="46" r="3.500" fill="#fff6ea"/>
<circle cx="37.500" cy="46.400" r="1.900" fill="${eye}"/><circle cx="62.500" cy="46.400" r="1.900" fill="${eye}"/>
${angry
    ? `<path d="M29 38.500 L43 43 M71 38.500 L57 43" stroke="#3a1a16" stroke-width="2.500" stroke-linecap="round"/>`
    : `<path d="M31 41 C35 39 39 39 42 41 M69 41 C65 39 61 39 58 41" stroke="#7a3f3c" stroke-width="1.300" fill="none" stroke-linecap="round"/>`}
${scars ? `<path d="M60 27 L70 40 M55.500 29 L64 40" stroke="#7a2a24" stroke-width="1.500" stroke-linecap="round"/>` : ''}
${mud ? `<g fill="#4a3620" opacity=".9"><ellipse cx="29" cy="62" rx="6.500" ry="3.500"/><ellipse cx="66" cy="33" rx="5.500" ry="3"/><circle cx="73" cy="66" r="2.600"/><circle cx="40" cy="29" r="2.200"/><ellipse cx="52" cy="84" rx="7" ry="2.600"/></g>` : ''}
${crown ? `<path d="M33 23 L35 7 L43 16 L50 4 L57 16 L65 7 L67 23 Z" fill="#e6b84e" stroke="#8a6420" stroke-width="1"/><circle cx="50" cy="14" r="2.200" fill="#c9302c"/>` : ''}
</g>`;
  return wrap(u, { defs, inner, bg, at: [32, 30] });
}

/** Un CULTISTE : robe et capuche, le visage dans l'ombre, deux yeux qui luisent ; `prop` : hand (main levée), blade, urn, staff ; `mitre` : le grand prêtre. */
function cultist(u, { robe = ['#4a2a52', '#140a18'], glowC = '#8dff7a', prop = '', mitre = false, veil = false, trim = '#c9a03c', bg = ['#2c2238', '#08060b', '#9a7dff'] } = {}) {
  const defs = [lin(`${u}robe`, [[0, robe[0]], [1, robe[1]]], [0, 0, 0, 1]), glow(u, 'eye', glowC, 0.95), glow(u, 'orb', glowC, 0.8), lin(`${u}bone`, [[0, '#f4efdf'], [1, '#9a917a']])].join('');
  const props = {
    hand: `<circle cx="81" cy="50" r="16" fill="url(#${u}orb)"/><path d="M74 80 L76 57 L79 46 L81 57 L83 44 L85.500 57 L88.500 48 L88.500 61 L92.500 57 L88.500 71 L86.500 82 Z" fill="url(#${u}bone)"/>`,
    blade: `<path d="M80 98 L84 34 L87.500 28 L90 35 L88 98 Z" fill="#c9d3dc"/><path d="M76 78 H94" stroke="${trim}" stroke-width="3" stroke-linecap="round"/>`,
    urn: `<circle cx="80" cy="58" r="15" fill="url(#${u}orb)"/><path d="M72 86 C67 73 72 62 80 62 C88 62 93 73 88 86 Z" fill="#3a3038"/><rect x="75" y="58" width="10" height="5" rx="1.500" fill="#57484f"/><path d="M78 56 C75 50 83 48 80 41" stroke="#c9c0c6" stroke-width="1.500" fill="none" stroke-linecap="round" opacity=".85"/>`,
    staff: `<path d="M85 100 L85 28" stroke="url(#${u}bone)" stroke-width="3.200" stroke-linecap="round"/><circle cx="85" cy="20" r="14" fill="url(#${u}orb)"/><path d="M79 22 C79 13 91 13 91 22 C91 26 88 27 88 30.500 H82 C82 27 79 26 79 22 Z" fill="url(#${u}bone)"/><circle cx="82.600" cy="21" r="1.600" fill="#14100c"/><circle cx="87.400" cy="21" r="1.600" fill="#14100c"/>`
  };
  const top = mitre ? 17 : 8;
  const inner = `
${props[prop] || ''}
<path d="M2 100 L9 82 C18 71 32 68 40 68 L60 68 C68 68 82 71 91 82 L98 100 Z" fill="url(#${u}robe)"/>
<path d="M50 72 L50 100" stroke="${trim}" stroke-width="1.200" opacity=".7"/>
<path d="M24 56 C18 28 32 ${top} 50 ${top} C68 ${top} 82 28 76 56 C78 66 72 76 66 80 L34 80 C28 76 22 66 24 56 Z" fill="url(#${u}robe)"/>
${mitre ? `<path d="M36 23 L50 -3 L64 23 Z" fill="url(#${u}robe)" stroke="${trim}" stroke-width="1.200"/><path d="M50 4 V20 M44 13 H56" stroke="${trim}" stroke-width="1.500"/>` : ''}
<ellipse cx="50" cy="48" rx="13.500" ry="16" fill="#060408"/>
${mitre ? `<path d="M40 40 C40 33 60 33 60 40 L59 56 C56 62 44 62 41 56 Z" fill="url(#${u}bone)"/><path d="M46 56 V60.500 M50 57 V61.500 M54 56 V60.500" stroke="#14100c" stroke-width="1"/><ellipse cx="45" cy="46" rx="3.300" ry="3.700" fill="#060408"/><ellipse cx="55" cy="46" rx="3.300" ry="3.700" fill="#060408"/>` : ''}
<circle cx="44.500" cy="46" r="5.200" fill="url(#${u}eye)"/><circle cx="55.500" cy="46" r="5.200" fill="url(#${u}eye)"/>
<circle cx="44.500" cy="46" r="1.350" fill="#f4fff0"/><circle cx="55.500" cy="46" r="1.350" fill="#f4fff0"/>
${veil ? `<path d="M36 52 C42 56 58 56 64 52 L62 70 C56 74 44 74 38 70 Z" fill="#8a8088" opacity=".5"/>` : ''}
<path d="M30 34 C34 22 42 14 50 12" fill="none" stroke="${trim}" stroke-width="1" stroke-linecap="round" opacity=".5"/>`;
  return wrap(u, { defs, inner, bg, at: [32, 30], halo: 0.3 });
}

/** Le squelette relevé : un crâne dont les orbites luisent du même vert que la magie des acolytes. */
function squelette_releve(u) {
  const defs = [lin(`${u}bone`, [[0, '#f1ecdc'], [0.6, '#b9b09a'], [1, '#5f5a4c']]), glow(u, 'eye', '#8dff7a', 0.95), lin(`${u}rag`, [[0, '#4a2a52'], [1, '#140a18']], [0, 0, 0, 1])].join('');
  const inner = `
<path d="M6 100 L12 84 C22 74 34 72 42 72 L58 72 C66 72 78 74 88 84 L94 100 Z" fill="url(#${u}rag)"/>
<path d="M44 66 H56 V78 H44 Z" fill="url(#${u}bone)"/><path d="M44 70 H56 M44 74 H56" stroke="#3a362c" stroke-width="1"/>
<path d="M28 42 C28 24 38 14 50 14 C62 14 72 24 72 42 C72 52 68 58 64 61 L63 70 H37 L36 61 C32 58 28 52 28 42 Z" fill="url(#${u}bone)"/>
<circle cx="41" cy="43" r="8.500" fill="url(#${u}eye)"/><circle cx="59" cy="43" r="8.500" fill="url(#${u}eye)"/>
<ellipse cx="41" cy="43" rx="5.500" ry="6" fill="#0a0c08"/><ellipse cx="59" cy="43" rx="5.500" ry="6" fill="#0a0c08"/>
<circle cx="41" cy="43.500" r="1.900" fill="#b8ffa8"/><circle cx="59" cy="43.500" r="1.900" fill="#b8ffa8"/>
<path d="M50 49 L47 56 H53 Z" fill="#14100c"/>
<path d="M40 63 V69 M45 64 V70 M50 64 V70 M55 64 V70 M60 63 V69" stroke="#3a362c" stroke-width="1.200"/>
<path d="M33 30 L41 22 M36 34 L39 31" stroke="#5f5a4c" stroke-width="1.200" stroke-linecap="round"/>`;
  return wrap(u, { defs, inner, bg: ['#243024', '#070a07', '#8dff7a'], at: [32, 30], halo: 0.28 });
}

/** Un OGRE : grosse tête, front bas, défenses qui remontent ; `prop` : club (massue), rock (rocher), totem ; `s` = sa taille. */
function ogre(u, { skin = ['#8fae6a', '#3d5230'], prop = '', paint = false, crown = false, hair = false, s = 1, bg = ['#3a3326', '#0b0907', '#ffb060'] } = {}) {
  const defs = [lin(`${u}skin`, [[0, skin[0]], [1, skin[1]]]), ivory(u), lin(`${u}wood`, [[0, '#8a623a'], [1, '#2e1e10']])].join('');
  const props = {
    club: `<path d="M85 100 L90 52" stroke="url(#${u}wood)" stroke-width="8" stroke-linecap="round"/><ellipse cx="91" cy="38" rx="9.500" ry="15" fill="url(#${u}wood)"/><g fill="#d8d2c0"><path d="M82.500 30 l-5.500 -3 l5.500 -2.500z"/><path d="M99.500 36 l-4 5 l1 -6z"/><path d="M88 23 l1.500 -6 l3 5z"/></g>`,
    rock: `<path d="M74 40 L84 29 L96 35 L98 50 L88 59 L76 53 Z" fill="#7d7a72"/><path d="M84 29 L88 44 L98 50 M88 44 L76 53" stroke="#4a4842" stroke-width="1" fill="none"/>`,
    totem: `<path d="M87 100 L87 32" stroke="url(#${u}wood)" stroke-width="4" stroke-linecap="round"/><circle cx="87" cy="24" r="7.500" fill="#e6dcc0"/><circle cx="84.400" cy="23" r="1.700" fill="#14100c"/><circle cx="89.600" cy="23" r="1.700" fill="#14100c"/><path d="M79 34 L75 45 M95 34 L99 45 M87 34 L87 47" stroke="#c9302c" stroke-width="1.700" stroke-linecap="round"/>`
  };
  const inner = `
${props[prop] || ''}
<g transform="translate(46 62) scale(${s}) translate(-50 -62)">
<path d="M0 100 L6 82 C16 70 30 66 40 66 L60 66 C70 66 84 70 94 82 L100 100 Z" fill="url(#${u}skin)"/>
<path d="M23 44 L9 35 L20 57 Z" fill="url(#${u}skin)"/><path d="M77 44 L91 35 L80 57 Z" fill="url(#${u}skin)"/>
<path d="M22 50 C20 26 34 14 50 14 C66 14 80 26 78 50 C80 68 68 82 50 82 C32 82 20 68 22 50 Z" fill="url(#${u}skin)"/>
${hair ? `<path d="M33 19 C40 6 60 6 67 19 C58 14 42 14 33 19 Z" fill="#2a1e14"/><circle cx="50" cy="8" r="5.500" fill="#2a1e14"/>` : ''}
<path d="M28 40 C36 33 44 35 48 40 M72 40 C64 33 56 35 52 40" stroke="#22301a" stroke-width="3.600" stroke-linecap="round" fill="none"/>
<circle cx="39" cy="45" r="3.100" fill="#ffe9a0"/><circle cx="61" cy="45" r="3.100" fill="#ffe9a0"/><circle cx="39.400" cy="45.300" r="1.450" fill="#1a1208"/><circle cx="60.600" cy="45.300" r="1.450" fill="#1a1208"/>
<path d="M44 52 C46 58 54 58 56 52 C54 50 46 50 44 52 Z" fill="#33472a"/>
<path d="M32 66 C40 72 60 72 68 66 C62 77 38 77 32 66 Z" fill="#1c1410"/>
<path d="M36.500 70 L39 55 L44.500 70 Z" fill="url(#${u}ivory)"/><path d="M63.500 70 L61 55 L55.500 70 Z" fill="url(#${u}ivory)"/>
${paint ? `<path d="M29 52 L37 58 M29 57.500 L35 61.500 M71 52 L63 58 M71 57.500 L65 61.500 M50 19 V31" stroke="#e6dcc0" stroke-width="1.900" stroke-linecap="round"/>` : ''}
${crown ? `<path d="M32 20 L34 4 L42 13 L50 1 L58 13 L66 4 L68 20 Z" fill="#e6b84e" stroke="#8a6420" stroke-width="1"/><circle cx="50" cy="11" r="2.300" fill="#c9302c"/>` : ''}
</g>`;
  return wrap(u, { defs, inner, bg, at: [32, 30] });
}

export const MONSTERS_DONJONS = {
  // Le Repaire des Coupe-Jarrets
  coupe_jarret: (u) => bandit(u, { prop: 'dagger' }),
  brute_du_repaire: (u) => bandit(u, { hood: ['#5a3a2a', '#1e120c'], prop: 'club', mask: '#3a1e16', skin: ['#c98f68', '#7a4a30'] }),
  arbaletrier_borgne: (u) => bandit(u, { hood: ['#3a4a52', '#12181c'], prop: 'crossbow', patch: true }),
  empoisonneuse: (u) => bandit(u, { hood: ['#3d5236', '#121a10'], prop: 'vial', mask: '#1f2a1a', skin: ['#e2bfa0', '#9a6a4e'], eye: '#c8f5b0' }),
  capitaine_balafre: (u) => bandit(u, { hood: ['#6a1e22', '#1c0709'], prop: 'sabre', hat: true, scar: true, mask: '#241012', bg: ['#4a2a22', '#0c0706', '#ff9a50'] }),
  // Les Soues de Grouinval
  porcelet_teigneux: (u) => pig(u, { s: 0.78, angry: true }),
  sanglier_des_fourres: (u) => pig(u, { hide: ['#8a6a4e', '#3a281a'], snout: '#b08a6e', tusk: 10, angry: true }),
  truie_colossale: (u) => pig(u, { hide: ['#e0a098', '#8a4a48'], s: 1.1, scars: true }),
  goret_boueux: (u) => pig(u, { hide: ['#c99a86', '#6a4638'], snout: '#d8ab98', s: 0.9, mud: true }),
  grand_verrat: (u) => pig(u, { hide: ['#7a4a3a', '#2a1610'], snout: '#a87462', tusk: 16, angry: true, scars: true, crown: true, s: 1.06, eye: '#c9302c', bg: ['#4a2a1c', '#0c0705', '#ff8a40'] }),
  // Le Sanctuaire des Sans-Repos
  zelote_fanatique: (u) => cultist(u, { robe: ['#5a1e26', '#18070a'], glowC: '#ff6a4a', prop: 'blade', bg: ['#38201c', '#0a0605', '#ff7a50'] }),
  acolyte_reanimateur: (u) => cultist(u, { prop: 'hand' }),
  squelette_releve,
  pretresse_des_cendres: (u) => cultist(u, { robe: ['#4a4650', '#121116'], glowC: '#d8d2e6', prop: 'urn', veil: true, trim: '#b9b0b6', bg: ['#2e2c34', '#08080a', '#c8c0e0'] }),
  hierophante: (u) => cultist(u, { robe: ['#3a1e5a', '#0c0616'], prop: 'staff', mitre: true, bg: ['#2a1c40', '#07050c', '#8dff7a'] }),
  // Le Gouffre aux Ogres
  ogre_brise_os: (u) => ogre(u, { prop: 'club' }),
  ogresse_chamane: (u) => ogre(u, { skin: ['#9ab87a', '#44603a'], prop: 'totem', paint: true, hair: true, s: 0.94 }),
  ogrillon_lanceur: (u) => ogre(u, { skin: ['#a8c486', '#4e6a3e'], prop: 'rock', s: 0.8 }),
  roi_ogre: (u) => ogre(u, { skin: ['#7a9a5a', '#2e4224'], prop: 'club', crown: true, s: 1.06, bg: ['#4a3a1e', '#0c0905', '#ffb040'] })
};
