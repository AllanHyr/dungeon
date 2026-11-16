// ============================================================
//  achievements.js — Les succès (par personnage)
// ============================================================
// Un succès est décrit dans data/achievements.json : une CONDITION et des RÉCOMPENSES.
//   - condition : ce qu'il faut accomplir (farm, donjon terminé en groupe, niveau d'équipement...)
//   - récompenses : une compétence rendue accessible à CE personnage, une fonction du jeu
//     (ex. le farm automatique), ou un titre.
// Les succès sont rangés dans `personnage.achievements` ({ id: true }). Les compteurs qui les
// nourrissent sont dans `personnage.stats`. Ce fichier ne touche à aucun affichage.

import { EQUIP_SLOTS, FEATURES } from './content.js';

/** Niveau d'équipement : la somme des niveaux des objets portés (3 emplacements). */
export function gearLevel(content, ch) {
  let total = 0;
  for (const slot of EQUIP_SLOTS) {
    const inst = ch.equipment?.[slot];
    if (inst) total += content.items[inst.id]?.level || 0;
  }
  return total;
}

/** Les succès qui concernent ce personnage (certains sont réservés à des classes). */
export function achievementsFor(content, ch) {
  return content.achievementList.filter((a) => !a.classes || a.classes.includes(ch.classId));
}

/** Où en est le personnage pour ce succès ? { current, target, done } (current est plafonné à target). */
export function achievementProgress(content, ch, a) {
  const cond = a.condition;
  const s = ch.stats;
  let raw = 0;
  let target = cond.atLeast ?? 1;
  switch (cond.type) {
    case 'farmBestWave': raw = s.farmBest || 0; break;
    case 'farmWaves': raw = s.farmWaves || 0; break;
    case 'reachLevel': raw = ch.level; break;
    case 'gearLevel': raw = gearLevel(content, ch); break;
    case 'dungeonCleared': {
      const rec = s.clears?.[String(cond.tranche)];
      raw = rec ? ((cond.minPartySize || 1) >= 2 ? rec.group : rec.total) : 0;
      target = cond.count ?? 1;
      break;
    }
    default:
  }
  return { current: Math.min(raw, target), raw, target, done: raw >= target };
}

export const isUnlocked = (ch, id) => !!ch.achievements?.[id];

/**
 * Vérifie tous les succès du personnage et débloque (en le modifiant) ceux dont la condition est remplie.
 * À appeler après chaque événement qui peut en débloquer : fin de run, équipement changé, niveau gagné...
 * Renvoie la liste des succès NOUVELLEMENT débloqués (pour les annoncer au joueur).
 */
export function checkAchievements(content, ch) {
  if (!ch.achievements) ch.achievements = {};
  const fresh = [];
  for (const a of achievementsFor(content, ch)) {
    if (ch.achievements[a.id]) continue;
    if (achievementProgress(content, ch, a).done) {
      ch.achievements[a.id] = true;
      fresh.push(a);
    }
  }
  return fresh;
}

/** Une fonction du jeu (ex. 'autoFarm') est-elle débloquée pour ce personnage ? */
export function hasFeature(content, ch, feature) {
  return achievementsFor(content, ch).some((a) => ch.achievements?.[a.id] && a.rewards.some((r) => r.type === 'feature' && r.feature === feature));
}

/** Le succès (non encore débloqué) qui donne cette fonction à ce personnage, pour afficher « il te manque... ». */
export function achievementForFeature(content, ch, feature) {
  return achievementsFor(content, ch).find((a) => a.rewards.some((r) => r.type === 'feature' && r.feature === feature)) || null;
}

/** Les titres obtenus par le personnage. */
export function titlesOf(content, ch) {
  const out = [];
  for (const a of achievementsFor(content, ch)) {
    if (!ch.achievements?.[a.id]) continue;
    for (const r of a.rewards) if (r.type === 'title') out.push(r.text);
  }
  return out;
}

/** Les récompenses d'un succès, en phrases lisibles (pour l'écran). */
export function rewardTexts(content, a) {
  return a.rewards.map((r) => {
    if (r.type === 'skill') return `Compétence : ${content.skills[r.skillId]?.name || r.skillId}`;
    if (r.type === 'feature') return `Fonction : ${FEATURES[r.feature] || r.feature}`;
    return `Titre : « ${r.text} »`;
  });
}
