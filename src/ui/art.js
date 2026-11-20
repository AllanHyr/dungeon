// ============================================================
//  art.js — Les illustrations du jeu, en pixel art (dessinées en code : aucun fichier image à charger)
// ============================================================
// Un portrait par classe et par monstre (art/pixel-heroes.js, art/pixel-monsters.js), des décors de donjon et des vignettes de cases
// (art/pixel-scenes.js), tous en SVG faits de carrés de couleur. Une classe ou un monstre sans portrait garde son icône.
// Pour remplacer un dessin par une vraie image : voir « art » dans docs/ECRIRE-UNE-CLASSE.md (champ `art` d'une classe ou d'un monstre).

import { PIXEL_HEROES } from './art/pixel-heroes.js';
import { PIXEL_MONSTERS } from './art/pixel-monsters.js';
import { PIXEL_SCENES, PIXEL_VIGNETTES } from './art/pixel-scenes.js';

export const heroIds = () => Object.keys(PIXEL_HEROES);
export const monsterIds = () => Object.keys(PIXEL_MONSTERS);
export const sceneIds = () => Object.keys(PIXEL_SCENES);
export const vignetteIds = () => Object.keys(PIXEL_VIGNETTES);

// (chaque dessin n'est calculé qu'une fois)
const pixelCache = new Map();
const cached = (key, draw) => { if (!pixelCache.has(key)) pixelCache.set(key, draw()); return pixelCache.get(key); };

/** Le dessin SVG (en texte) d'une classe de héros, ou null s'il n'y en a pas. */
export const heroSvg = (classId) => (PIXEL_HEROES[classId] ? cached('h:' + classId, PIXEL_HEROES[classId]) : null);
export const monsterSvg = (monsterId) => (PIXEL_MONSTERS[monsterId] ? cached('m:' + monsterId, PIXEL_MONSTERS[monsterId]) : null);
export const vignetteSvg = (id) => (PIXEL_VIGNETTES[id] ? cached('v:' + id, PIXEL_VIGNETTES[id]) : null);
const sceneCache = new Map();
/**
 * Un décor, sous la forme d'une valeur CSS `url("data:image/svg+xml,...")` à poser en background-image.
 * `id` peut aussi être le chemin d'une vraie image ("img/mes-caves.jpg") : le JSON d'une tranche ou d'une zone de farm peut le donner (champ `scene`).
 */
export function sceneCss(id) {
  if (!id) return 'none';
  if (/[/.]/.test(id)) return `url("${String(id).replace(/"/g, '%22')}")`;
  if (!sceneCache.has(id)) {
    const svg = PIXEL_SCENES[id] ? PIXEL_SCENES[id]() : null;
    sceneCache.set(id, svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : 'none');
  }
  return sceneCache.get(id);
}

/** Le décor d'une partie : celui que le JSON de la tranche (ou de la zone de farm) demande, sinon celui de la profondeur. */
export function sceneIdFor(run, content) {
  if (!run) return null;
  if (run.training) return 'training';
  const zone = run.farm && content?.farm?.zones?.[run.farm.zoneId];
  // (le décor du DONJON d'abord, puis celui de sa tranche)
  const picked = content?.dungeons?.[run.setup?.dungeon];
  const dungeon = (picked && picked.tranche === run.setup?.tranche ? picked : null) || content?.dungeonsByTranche?.[run.setup?.tranche]?.find((d) => d.available !== false);
  const asked = zone?.scene ?? (run.farm ? null : dungeon?.scene) ?? content?.tranches?.[run.setup?.tranche]?.scene;
  if (asked) return asked;
  if (run.farm) return 'terriers';
  const tranche = run.setup?.tranche || 1;
  return tranche >= 8 ? 'depths' : tranche >= 4 ? 'crypt' : 'caves';
}
