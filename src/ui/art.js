// ============================================================
//  art.js — Les illustrations du jeu (dessinées en code : aucun fichier image à charger)
// ============================================================
// Quatre portraits de classes, un portrait par monstre, des décors de donjon et des vignettes de cases, tous en SVG.
// Pour remplacer un dessin par une vraie image : voir « art » dans docs/ECRIRE-UNE-CLASSE.md (champ `art` d'une classe ou d'un monstre).

import { uid } from './art/kit.js';
import { HEROES } from './art/heroes.js';
import { MONSTERS_CAVES } from './art/monsters-caves.js';
import { MONSTERS_CRYPT } from './art/monsters-crypt.js';
import { MONSTERS_DEPTHS } from './art/monsters-depths.js';
import { MONSTERS_DONJONS } from './art/monsters-donjons.js';
import { SCENES as SCENE_DRAWINGS, VIGNETTES as VIGNETTE_DRAWINGS } from './art/scenes.js';

const MONSTERS = { ...MONSTERS_CAVES, ...MONSTERS_CRYPT, ...MONSTERS_DEPTHS, ...MONSTERS_DONJONS };
const SCENES = SCENE_DRAWINGS;
const VIGNETTES = VIGNETTE_DRAWINGS;

export const heroIds = () => Object.keys(HEROES);
export const monsterIds = () => Object.keys(MONSTERS);
export const sceneIds = () => Object.keys(SCENES);
export const vignetteIds = () => Object.keys(VIGNETTES);

/** Le dessin SVG (en texte) d'une classe de héros, ou null s'il n'y en a pas. */
export const heroSvg = (classId) => (HEROES[classId] ? HEROES[classId](uid()) : null);
export const monsterSvg = (monsterId) => (MONSTERS[monsterId] ? MONSTERS[monsterId](uid()) : null);
export const vignetteSvg = (id) => (VIGNETTES[id] ? VIGNETTES[id](uid()) : null);
const sceneCache = new Map();
/**
 * Un décor, sous la forme d'une valeur CSS `url("data:image/svg+xml,...")` à poser en background-image.
 * `id` peut aussi être le chemin d'une vraie image ("img/mes-caves.jpg") : le JSON d'une tranche ou d'une zone de farm peut le donner (champ `scene`).
 */
export function sceneCss(id) {
  if (!id) return 'none';
  if (/[/.]/.test(id)) return `url("${String(id).replace(/"/g, '%22')}")`;
  if (!sceneCache.has(id)) {
    const svg = SCENES[id]?.(uid());
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
