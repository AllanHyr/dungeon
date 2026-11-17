// ============================================================
//  fx-plan.js — Le « scénario » d'une action de combat (pur : aucun lien avec le navigateur)
// ============================================================
// Le moteur répond à une action par une LISTE D'ÉVÉNEMENTS (qui a lancé quoi, qui a perdu combien de PV...) et par l'état final.
// Pour montrer une attaque, il faut la rejouer coup par coup : ce module découpe la liste en « temps forts » (un par compétence lancée),
// dit pour chacun COMMENT le montrer (élan au corps à corps, projectile, soin, bouclier... : le « style »), et recalcule les PV
// de chaque cible APRÈS chaque impact, pour que les barres de vie descendent coup après coup au lieu de sauter d'un coup au résultat.
// L'affichage (src/ui/fx.js) n'a plus qu'à jouer ce scénario ; les tests, eux, vérifient le scénario sans navigateur.

import { computeStats, totalShield } from '../core/index.js';
import { statusInfo } from './status.js';

// ---------------- Une photo des unités avant l'action ----------------

/** Les PV, le bouclier et l'état (vivant ou non) de chaque unité : le point de départ du rejeu. */
export function snapshotRun(run) {
  const units = {};
  if (!run) return { units, combat: false };
  const add = (u) => {
    let max = u.hp;
    try { max = computeStats(run, u).hpMax; } catch { /* pas de stats : on garde les PV actuels */ }
    units[u.id] = {
      id: u.id, kind: u.kind, name: u.name, hp: u.hp, max, shield: totalShield(u), alive: u.alive !== false,
      statuses: (u.statuses || []).map((s) => s.id), classId: u.classId, look: u.look, boss: !!u.boss
    };
  };
  for (const p of run.players || []) add(p);
  for (const m of run.combat?.monsters || []) add(m);
  return { units, combat: !!run.combat };
}

/**
 * L'état de DÉPART de toutes les unités du rejeu : la photo d'avant, plus les unités APPARUES pendant l'action (les monstres d'un combat
 * qui commence, un renfort) à leur état de départ — PV au maximum, sans bouclier. Sans cela, leurs barres sauteraient d'un coup au résultat.
 */
export function startState(snapshot, after) {
  const units = Object.fromEntries(Object.entries(snapshot?.units || {}).map(([id, u]) => [id, { ...u }]));
  if (after) {
    for (const [id, u] of Object.entries(snapshotRun(after).units)) {
      if (!units[id]) units[id] = { ...u, hp: u.max, shield: 0, alive: true, statuses: [] };
    }
  }
  return units;
}

// ---------------- Le style d'une compétence ----------------
// Chaque compétence se montre de façon différente. On écrit ici le style des compétences du jeu, et une déduction pour toutes les autres
// (d'après leur portée, leur cible et leurs effets). Un fichier JSON peut aussi imposer le sien : voir le champ `fx` dans docs/ECRIRE-UNE-CLASSE.md.
//
//   delivery  comment ça part : melee (élan jusqu'à la cible) · spin (tourbillon : touche tous les ennemis) · projectile (tir) ·
//             smite (frappe venue d'en haut) · wave (onde qui part du lanceur) · self · ally · allies
//   hit       l'impact : slash (entaille) · pierce (estoc) · smash (coup lourd) · claw (griffes) · bite (morsure) · blast (explosion de lumière / magie)
//             · splat (éclaboussure) · sonic (onde) · drain (siphon)
//   element   la couleur : physical · holy · fire · poison · nature · shadow · frost · arcane · blood
//   shot      (projectile) orb · arrow · beam · thorn · spit · bolt · wisp
//   support   (effets non offensifs) heal · shield · guard · buff · haste · taunt · rage · stun · poison · resurrect · cleanse · roots
//   weight    1 léger · 2 normal · 3 lourd (taille des éclats, secousse de l'écran)

const PRESETS = {
  // — Berserker
  berserker_entaille: { delivery: 'melee', hit: 'slash', element: 'physical', weight: 2 },
  berserker_colere: { delivery: 'melee', hit: 'smash', element: 'fire', weight: 3 },
  berserker_tourbillon: { delivery: 'spin', hit: 'slash', element: 'physical', weight: 2 },
  berserker_provocation: { delivery: 'self', support: 'taunt', element: 'blood', weight: 2 },
  berserker_saignee: { delivery: 'self', hit: 'splat', support: 'rage', element: 'blood', weight: 2 }, // (il se blesse lui-même : l'éclaboussure de sang)
  berserker_rempart: { delivery: 'self', support: 'guard', element: 'physical', weight: 2 },
  // — Veilleur
  veilleur_rayon: { delivery: 'projectile', shot: 'beam', hit: 'blast', element: 'holy', weight: 2 },
  veilleur_jugement: { delivery: 'smite', hit: 'blast', element: 'holy', weight: 3 },
  veilleur_lame_benie: { delivery: 'melee', hit: 'slash', element: 'holy', weight: 2 },
  veilleur_soin: { delivery: 'ally', support: 'heal', element: 'holy', weight: 2 },
  veilleur_bouclier: { delivery: 'ally', support: 'shield', element: 'holy', weight: 2 },
  veilleur_benediction: { delivery: 'allies', support: 'buff', element: 'holy', weight: 2 },
  veilleur_hate: { delivery: 'ally', support: 'haste', element: 'arcane', weight: 2 },
  veilleur_resurrection: { delivery: 'ally', support: 'resurrect', element: 'holy', weight: 3 },
  veilleur_miracle: { delivery: 'allies', support: 'heal', element: 'holy', weight: 3 },
  // — Druide
  druide_epine: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'nature', weight: 2 },
  druide_rosee: { delivery: 'ally', support: 'heal', element: 'nature', weight: 1 },
  druide_floraison: { delivery: 'allies', support: 'heal', element: 'nature', weight: 2 },
  druide_ecorce: { delivery: 'ally', support: 'shield', element: 'nature', weight: 2 },
  druide_racines: { delivery: 'smite', hit: 'blast', support: 'roots', element: 'nature', weight: 2 },
  druide_ronces: { delivery: 'wave', hit: 'pierce', element: 'nature', weight: 2 },
  // — Sacrieur
  sacrieur_pacte: { delivery: 'self', support: 'rage', element: 'blood', weight: 2 },
  sacrieur_entaille: { delivery: 'melee', hit: 'slash', element: 'physical', weight: 2 },
  sacrieur_morsure: { delivery: 'melee', hit: 'bite', element: 'blood', weight: 2, drain: true },
  sacrieur_punition: { delivery: 'melee', hit: 'smash', element: 'blood', weight: 3 },
  sacrieur_carapace: { delivery: 'self', support: 'shield', element: 'blood', weight: 2 },
  sacrieur_temerite: { delivery: 'melee', hit: 'smash', element: 'fire', weight: 3 },
  sacrieur_crochet: { delivery: 'projectile', shot: 'bolt', support: 'roots', element: 'blood', weight: 2 },
  sacrieur_provocation: { delivery: 'self', support: 'taunt', element: 'blood', weight: 2 },
  sacrieur_sang_partage: { delivery: 'allies', hit: 'splat', support: 'shield', element: 'blood', weight: 2 }, // (il se saigne : l'éclaboussure)
  sacrieur_transfusion: { delivery: 'ally', hit: 'splat', support: 'heal', element: 'blood', weight: 2 },
  sacrieur_hemorragie: { delivery: 'melee', hit: 'claw', support: 'poison', element: 'blood', weight: 2 },
  sacrieur_saignee: { delivery: 'self', hit: 'splat', support: 'rage', element: 'blood', weight: 2 },
  sacrieur_lame_protectrice: { delivery: 'melee', hit: 'slash', support: 'shield', element: 'blood', weight: 2 },
  sacrieur_sacrifice: { delivery: 'self', support: 'guard', element: 'blood', weight: 3 },
  sacrieur_dechirure: { delivery: 'melee', hit: 'slash', element: 'blood', weight: 3, cross: true },
  sacrieur_festin: { delivery: 'melee', hit: 'bite', element: 'blood', weight: 3, drain: true },
  sacrieur_punition_bastion: { delivery: 'melee', hit: 'smash', support: 'shield', element: 'blood', weight: 2 },
  sacrieur_punition_equilibre: { delivery: 'melee', hit: 'bite', element: 'blood', weight: 3, drain: true },
  sacrieur_punition_ecorche: { delivery: 'melee', hit: 'smash', element: 'blood', weight: 3, cross: true },
  // — Assassin (tout se lance à distance : des dagues, pour atteindre même le rang arrière)
  assassin_marque: { delivery: 'projectile', shot: 'wisp', support: 'debuff', element: 'shadow', weight: 1 },
  assassin_marque_venin: { delivery: 'projectile', shot: 'wisp', support: 'poison', element: 'poison', weight: 1 },
  assassin_marque_mort: { delivery: 'projectile', shot: 'wisp', support: 'debuff', element: 'blood', weight: 2 },
  assassin_double_marque: { delivery: 'projectile', shot: 'wisp', support: 'debuff', element: 'shadow', weight: 1 },
  assassin_estoc: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'physical', weight: 1 },
  assassin_estoc_venin: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'poison', weight: 1 },
  assassin_estoc_fatal: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'blood', weight: 2 },
  assassin_estoc_traqueur: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'physical', weight: 1 },
  assassin_lame_venimeuse: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', support: 'poison', element: 'poison', weight: 1 },
  assassin_lame_vipere: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', support: 'poison', element: 'poison', weight: 2, flurry: true },
  assassin_dos: { delivery: 'projectile', shot: 'thorn', hit: 'slash', element: 'shadow', weight: 3 },
  assassin_coup_de_grace: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'blood', weight: 3 },
  assassin_grace_venin: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', support: 'poison', element: 'poison', weight: 3 },
  assassin_execution: { delivery: 'projectile', shot: 'thorn', hit: 'slash', element: 'blood', weight: 3, cross: true },
  assassin_grace_vif: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'physical', weight: 2 },
  assassin_disparition: { delivery: 'self', support: 'guard', element: 'shadow', weight: 2 },
  assassin_tourbillon: { delivery: 'spin', hit: 'slash', element: 'physical', weight: 2 },
  assassin_poudre: { delivery: 'projectile', shot: 'orb', support: 'debuff', element: 'shadow', weight: 1 },
  assassin_nuage: { delivery: 'wave', hit: 'splat', support: 'poison', element: 'poison', weight: 2 },
  assassin_garrot: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', support: 'stun', element: 'shadow', weight: 2 },
  assassin_toxine_affaiblissante: { delivery: 'projectile', shot: 'spit', hit: 'splat', support: 'debuff', element: 'poison', weight: 2 },
  assassin_double_morsure: { delivery: 'projectile', shot: 'thorn', hit: 'pierce', element: 'poison', weight: 2, flurry: true },
  assassin_boucherie: { delivery: 'projectile', shot: 'thorn', hit: 'slash', element: 'blood', weight: 3, cross: true },
  assassin_volee: { delivery: 'spin', hit: 'pierce', element: 'physical', weight: 2, flurry: true },
  assassin_lame_ombre: { delivery: 'projectile', shot: 'bolt', hit: 'slash', element: 'shadow', weight: 3 },
  // — Templier (la lumière : éclats dorés ; les coups sont de mêlée)
  templier_aura: { delivery: 'self', support: 'buff', element: 'holy', weight: 2 },
  templier_frappe: { delivery: 'melee', hit: 'smash', element: 'holy', weight: 2 },
  templier_frappe_gardien: { delivery: 'melee', hit: 'smash', support: 'shield', element: 'holy', weight: 2 },
  templier_frappe_lumiere: { delivery: 'melee', hit: 'smash', support: 'heal', element: 'holy', weight: 2 },
  templier_frappe_vengeresse: { delivery: 'melee', hit: 'smash', element: 'fire', weight: 3 },
  templier_benediction: { delivery: 'ally', support: 'heal', element: 'holy', weight: 1 },
  templier_benediction_lumiere: { delivery: 'ally', support: 'heal', element: 'holy', weight: 2 },
  templier_verdict: { delivery: 'smite', hit: 'blast', element: 'holy', weight: 3 },
  templier_verdict_gardien: { delivery: 'smite', hit: 'blast', support: 'shield', element: 'holy', weight: 3 },
  templier_verdict_vengeur: { delivery: 'smite', hit: 'blast', element: 'fire', weight: 3, cross: true },
  templier_eclat: { delivery: 'allies', support: 'heal', element: 'holy', weight: 3 },
  templier_eclat_purificateur: { delivery: 'allies', support: 'cleanse', element: 'holy', weight: 3 },
  templier_marteau: { delivery: 'melee', hit: 'smash', element: 'holy', weight: 3 },
  templier_marteau_colere: { delivery: 'melee', hit: 'smash', support: 'poison', element: 'fire', weight: 3 },
  templier_rempart: { delivery: 'allies', support: 'shield', element: 'holy', weight: 2 },
  templier_defi: { delivery: 'self', support: 'taunt', element: 'holy', weight: 2 },
  templier_defi_gardien: { delivery: 'self', support: 'taunt', element: 'holy', weight: 3 },
  templier_main_protection: { delivery: 'ally', support: 'guard', element: 'holy', weight: 2 },
  templier_imposition: { delivery: 'ally', support: 'heal', element: 'holy', weight: 3 },
  templier_croisade: { delivery: 'self', support: 'rage', element: 'fire', weight: 2 },
  templier_sanctuaire: { delivery: 'allies', support: 'guard', element: 'holy', weight: 3 },
  templier_miracle: { delivery: 'ally', support: 'resurrect', element: 'holy', weight: 3 },
  templier_priere: { delivery: 'allies', support: 'heal', element: 'holy', weight: 2 },
  templier_jugement_final: { delivery: 'smite', hit: 'blast', element: 'holy', weight: 3, cross: true },
  // — Prêtre
  pretre_forme: { delivery: 'self', support: 'buff', element: 'shadow', weight: 2 },
  pretre_chatiment: { delivery: 'projectile', shot: 'beam', hit: 'blast', element: 'holy', weight: 1 },
  pretre_chatiment_sacre: { delivery: 'projectile', shot: 'beam', hit: 'blast', support: 'heal', element: 'holy', weight: 1 },
  pretre_chatiment_discipline: { delivery: 'projectile', shot: 'beam', hit: 'blast', element: 'holy', weight: 2 },
  pretre_pointe_mentale: { delivery: 'projectile', shot: 'bolt', hit: 'blast', element: 'shadow', weight: 2 },
  pretre_soin: { delivery: 'ally', support: 'heal', element: 'holy', weight: 1 },
  pretre_soin_eclatant: { delivery: 'ally', support: 'cleanse', element: 'holy', weight: 2 },
  pretre_soin_superieur: { delivery: 'ally', support: 'heal', element: 'holy', weight: 3 },
  pretre_rayonnement: { delivery: 'ally', support: 'heal', element: 'holy', weight: 2 },
  pretre_douleur: { delivery: 'projectile', shot: 'wisp', hit: 'drain', element: 'shadow', weight: 1 },
  pretre_douleur_ombre: { delivery: 'projectile', shot: 'wisp', hit: 'drain', element: 'shadow', weight: 2 },
  pretre_toucher_vampirique: { delivery: 'projectile', shot: 'wisp', hit: 'drain', element: 'shadow', weight: 2, drain: true },
  pretre_bouclier: { delivery: 'ally', support: 'shield', element: 'holy', weight: 2 },
  pretre_bouclier_discipline: { delivery: 'ally', support: 'shield', element: 'holy', weight: 2 },
  pretre_priere: { delivery: 'allies', support: 'heal', element: 'holy', weight: 2 },
  pretre_priere_guerison: { delivery: 'allies', support: 'heal', element: 'holy', weight: 3 },
  pretre_mort: { delivery: 'smite', hit: 'blast', element: 'shadow', weight: 3 },
  pretre_mort_ombre: { delivery: 'smite', hit: 'blast', element: 'shadow', weight: 3, cross: true },
  pretre_renouveau: { delivery: 'ally', support: 'heal', element: 'nature', weight: 1 },
  pretre_cantique: { delivery: 'ally', support: 'haste', element: 'holy', weight: 2 },
  pretre_cri: { delivery: 'wave', hit: 'sonic', support: 'debuff', element: 'shadow', weight: 2 },
  pretre_penitence: { delivery: 'projectile', shot: 'beam', hit: 'blast', element: 'holy', weight: 3 },
  pretre_hymne: { delivery: 'allies', support: 'heal', element: 'holy', weight: 3 },
  pretre_gardien_ames: { delivery: 'ally', support: 'guard', element: 'holy', weight: 3 },
  pretre_evangelisme: { delivery: 'allies', support: 'buff', element: 'holy', weight: 2 },
  pretre_barriere: { delivery: 'allies', support: 'shield', element: 'holy', weight: 3 },
  pretre_eruption: { delivery: 'wave', hit: 'blast', element: 'shadow', weight: 3 },
  // — Guerrier
  guerrier_posture: { delivery: 'self', support: 'buff', element: 'physical', weight: 2 },
  guerrier_frappe: { delivery: 'melee', hit: 'slash', element: 'physical', weight: 2 },
  guerrier_frappe_armes: { delivery: 'melee', hit: 'slash', element: 'physical', weight: 2 },
  guerrier_sanguinaire: { delivery: 'melee', hit: 'slash', element: 'blood', weight: 2, drain: true },
  guerrier_brise_genou: { delivery: 'melee', hit: 'smash', support: 'debuff', element: 'physical', weight: 1 },
  guerrier_coup_bouclier_prot: { delivery: 'melee', hit: 'smash', support: 'debuff', element: 'physical', weight: 2 },
  guerrier_execution: { delivery: 'melee', hit: 'slash', element: 'blood', weight: 3, cross: true },
  guerrier_execution_armes: { delivery: 'melee', hit: 'slash', element: 'blood', weight: 3, cross: true },
  guerrier_cri: { delivery: 'allies', support: 'rage', element: 'fire', weight: 2 },
  guerrier_cri_rage: { delivery: 'allies', support: 'rage', element: 'fire', weight: 2 },
  guerrier_provocation: { delivery: 'self', support: 'taunt', element: 'physical', weight: 2 },
  guerrier_defi: { delivery: 'self', support: 'taunt', element: 'physical', weight: 3 },
  guerrier_enchainement: { delivery: 'spin', hit: 'slash', element: 'physical', weight: 2 },
  guerrier_coup_bouclier: { delivery: 'melee', hit: 'smash', support: 'stun', element: 'physical', weight: 3 },
  guerrier_interception: { delivery: 'self', support: 'guard', element: 'physical', weight: 2 },
  guerrier_frappe_mortelle: { delivery: 'melee', hit: 'slash', element: 'blood', weight: 3, cross: true },
  guerrier_brise_armure: { delivery: 'melee', hit: 'smash', support: 'debuff', element: 'physical', weight: 3 },
  guerrier_tempete_lames: { delivery: 'spin', hit: 'slash', element: 'blood', weight: 3, flurry: true },
  guerrier_dechainement: { delivery: 'melee', hit: 'slash', element: 'fire', weight: 2, flurry: true },
  guerrier_tourbillon: { delivery: 'spin', hit: 'slash', element: 'fire', weight: 3, flurry: true },
  guerrier_bloc: { delivery: 'self', support: 'shield', element: 'physical', weight: 2 },
  guerrier_mur_boucliers: { delivery: 'allies', support: 'shield', element: 'physical', weight: 3 },
  // — Commune à toutes les classes
  attaque_arme: { delivery: 'melee', hit: 'slash', element: 'physical', weight: 1 },
  // — Duelliste
  duelliste_estoc: { delivery: 'melee', hit: 'pierce', element: 'physical', weight: 1 },
  duelliste_fente: { delivery: 'melee', hit: 'pierce', element: 'physical', weight: 2, dash: 'long' },
  duelliste_coup_de_grace: { delivery: 'melee', hit: 'slash', element: 'blood', weight: 3, cross: true },
  duelliste_danse: { delivery: 'spin', hit: 'slash', element: 'physical', weight: 2, flurry: true },
  duelliste_poison: { delivery: 'melee', hit: 'slash', element: 'poison', weight: 2 },
  duelliste_estoc_venimeux: { delivery: 'melee', hit: 'pierce', element: 'poison', weight: 1 },
  duelliste_venin_vif: { delivery: 'melee', hit: 'pierce', element: 'poison', weight: 2 },
  duelliste_double_estoc: { delivery: 'melee', hit: 'pierce', element: 'poison', weight: 2, flurry: true },
  duelliste_fente_eclair: { delivery: 'melee', hit: 'pierce', element: 'physical', weight: 2, dash: 'long' },
  // — Monstres (le geste dépend de l'espèce : voir styleForMonster)
  coup: { delivery: 'melee', hit: 'auto', element: 'physical', weight: 2 },
  morsure: { delivery: 'melee', hit: 'bite', element: 'physical', weight: 1 },
  coup_puissant: { delivery: 'melee', hit: 'smash', element: 'physical', weight: 3 },
  morsure_venimeuse: { delivery: 'melee', hit: 'bite', element: 'poison', weight: 2 },
  bave_acide: { delivery: 'melee', hit: 'splat', element: 'poison', weight: 2 },
  cri_strident: { delivery: 'wave', hit: 'sonic', element: 'shadow', weight: 2 },
  drain_vital: { delivery: 'melee', hit: 'bite', element: 'blood', weight: 2, drain: true },
  drain_spectral: { delivery: 'projectile', shot: 'wisp', hit: 'blast', element: 'frost', weight: 2 },
  trait_maudit: { delivery: 'projectile', shot: 'bolt', hit: 'blast', element: 'shadow', weight: 2 },
  garde_de_fer: { delivery: 'self', support: 'guard', element: 'physical', weight: 2 },
  soin_obscur: { delivery: 'ally', support: 'heal', element: 'shadow', weight: 2 }
};

/** Le geste « naturel » d'un monstre selon son espèce (le champ `kind` de data/monsters.json). */
const HIT_OF_KIND = { beast: 'claw', undead: 'slash', humanoid: 'slash', slime: 'splat', demon: 'claw', boss: 'smash' };

/** Déduit un style d'après les données de la compétence (portée, cible, effets), quand aucun style n'est écrit pour elle. */
function inferStyle(sk) {
  const eff = (sk.effects || []).map((e) => e.type);
  const has = (t) => eff.includes(t);
  const ranged = sk.range === 'ranged';
  const target = sk.target || 'enemy';
  const style = { element: 'physical', weight: 2 };
  if (has('resurrect')) return { ...style, delivery: 'ally', support: 'resurrect', element: 'holy', weight: 3 };
  if (has('damage') || has('dot') || has('poison') || has('stun')) {
    style.hit = has('damage') ? (ranged ? 'blast' : 'slash') : 'blast';
    if (has('poison')) style.element = 'poison';
    else if (has('dot')) style.element = ranged ? 'nature' : 'blood';
    else if (ranged) style.element = 'arcane';
    if (has('stun')) style.support = 'stun';
    if (target === 'enemies') return { ...style, delivery: ranged ? 'wave' : 'spin' };
    return { ...style, delivery: ranged ? 'projectile' : 'melee', shot: ranged ? 'orb' : undefined };
  }
  if (has('heal') || has('hot')) return { ...style, element: 'holy', support: 'heal', delivery: target === 'self' ? 'self' : target === 'allies' ? 'allies' : 'ally' };
  if (has('shield') || has('guard')) return { ...style, support: has('guard') ? 'guard' : 'shield', delivery: target === 'self' ? 'self' : 'ally' };
  if (has('taunt')) return { ...style, delivery: 'self', support: 'taunt', element: 'blood' };
  if (has('cleanse')) return { ...style, delivery: target === 'allies' ? 'allies' : 'ally', support: 'cleanse', element: 'holy' };
  // Un bonus ou un malus : sur soi, sur un allié, ou sur les ennemis
  const debuff = target === 'enemy' || target === 'enemies';
  return { ...style, element: debuff ? 'shadow' : 'holy', support: debuff ? 'debuff' : 'buff', delivery: target === 'self' ? 'self' : target === 'allies' ? 'allies' : debuff ? 'projectile' : 'ally', shot: debuff ? 'orb' : undefined };
}

/**
 * Le style d'une compétence : { delivery, hit, element, shot, support, weight, ... }.
 * `fx` dans le JSON de la compétence (s'il existe) complète ou remplace ce qui est déduit.
 * `casterKind` : l'espèce du lanceur si c'est un monstre ('beast', 'undead'...), pour choisir le bon geste (griffes, entaille...).
 */
export function fxStyleOf(content, skillId, casterKind = null) {
  const sk = content?.skills?.[skillId];
  const base = PRESETS[skillId] || (sk ? inferStyle(sk) : { delivery: 'melee', hit: 'slash', element: 'physical', weight: 2 });
  const style = { ...base, ...(sk && typeof sk.fx === 'object' && sk.fx ? sk.fx : {}) };
  if (style.hit === 'auto') style.hit = HIT_OF_KIND[casterKind] || 'slash';
  style.name = sk?.name || skillId;
  style.preset = !!PRESETS[skillId]; // (vrai : un style écrit à la main ; faux : déduit des données)
  return style;
}

// ---------------- Le scénario ----------------

/** L'état d'une unité après un événement (PV, bouclier, vivant) : sert à faire descendre les barres de vie coup après coup. */
function stateOf(u) {
  return { hp: u.hp, max: u.max, shield: u.shield, alive: u.alive };
}

/**
 * Découpe les événements d'une action en « temps forts » :
 *   { type: 'cast', caster, skillId, outcome, total, announce, style, steps: [...] }   une compétence lancée
 *   { type: 'tick', unitId, cause, steps: [...] }                                        poison, saignement, soin sur la durée, piège...
 *   { type: 'advance', tileType }                                                       le groupe avance d'une case
 * Chaque étape (`step`) décrit un effet : { type: 'damage' | 'heal' | 'shield' | 'death' | 'revive' | 'resource' | 'status' | 'move', target, amount, ...,
 * before: {hp, max, shield, alive}, after: {...} } — les PV avant et après CET effet.
 */
export function planBeats(events, snapshot, after, content) {
  const ledger = new Map(Object.entries(startState(snapshot, after)));
  const beats = [];
  let cur = null; // le temps fort en cours
  let announce = null; // un monstre vient de commencer son tour
  let turnOf = null; // l'unité dont le tour vient de commencer (pour attribuer poison et soins sur la durée)
  const flush = () => {
    if (cur) beats.push(cur);
    cur = null;
  };
  const finalOf = (id) => [...(after?.players || []), ...(after?.combat?.monsters || [])].find((u) => u.id === id);

  for (const ev of events || []) {
    switch (ev.type) {
      case 'turn':
        flush();
        turnOf = ev.unitId;
        break;
      case 'monsterAct':
        flush();
        announce = ev.id;
        break;
      case 'roll':
        if (!ev.minor) flush(); // (le dé montré en plein écran coupe l'action ; le petit jet d'une compétence, lui, fait partie d'elle)
        break;
      case 'advance':
        flush();
        beats.push({ type: 'advance', tileType: ev.tileType, index: ev.index });
        turnOf = null;
        break;
      case 'skill': {
        flush();
        const caster = ledger.get(ev.unitId);
        cur = {
          type: 'cast', caster: ev.unitId, casterKind: caster?.kind || null, skillId: ev.skillId, outcome: ev.outcome, total: ev.total ?? null,
          announce: announce === ev.unitId, style: fxStyleOf(content, ev.skillId, caster?.kind === 'monster' ? caster.look : null),
          targets: Array.isArray(ev.targets) ? ev.targets : [], steps: []
        };
        announce = null;
        turnOf = null;
        break;
      }
      case 'damage':
      case 'heal':
      case 'shield':
      case 'death':
      case 'revive':
      case 'resource':
      case 'status':
      case 'shieldBreak':
      case 'move': {
        if (!cur) {
          const u = ledger.get(ev.target);
          const cause = ev.type === 'heal' ? 'hot'
            : u?.statuses?.includes('poison') ? 'poison' : u?.statuses?.includes('dot') ? 'bleed' : 'hurt';
          cur = { type: 'tick', unitId: turnOf || ev.target, cause, steps: [] };
        }
        const u = ledger.get(ev.target);
        const before = u ? stateOf(u) : null;
        if (u) {
          if (ev.type === 'damage') {
            u.hp = Math.max(0, u.hp - (ev.amount || 0));
            u.shield = Math.max(0, u.shield - (ev.absorbed || 0));
          } else if (ev.type === 'heal') u.hp = Math.min(u.max, u.hp + (ev.amount || 0));
          else if (ev.type === 'shield') u.shield += ev.amount || 0;
          else if (ev.type === 'shieldBreak') u.shield = 0;
          else if (ev.type === 'death') Object.assign(u, { alive: false, hp: 0, shield: 0 });
          else if (ev.type === 'revive') Object.assign(u, { alive: true, hp: finalOf(ev.target)?.hp ?? Math.max(1, Math.round(u.max * 0.3)) });
        }
        // (un bouclier brisé s'annonce comme un malus posé : « Bouclier brisé » au-dessus du combattant)
        const extra = ev.type === 'status' ? (({ short, tone }) => ({ label: short, tone }))(statusInfo(ev)) : ev.type === 'shieldBreak' ? { type: 'status', label: 'Bouclier brisé', tone: 'debuff' } : {};
        cur.steps.push({ ...ev, ...extra, before, after: u ? stateOf(u) : null, unitKind: u?.kind || null, look: u?.look || null, boss: !!u?.boss });
        break;
      }
      default:
        break;
    }
  }
  flush();
  return beats;
}

/** Les cibles (sans doublon, dans l'ordre) d'un temps fort : celles que la compétence visait, puis toute autre unité touchée. */
export function targetsOf(beat) {
  const seen = new Set(beat.targets || []);
  for (const s of beat.steps || []) if (s.target && ['damage', 'heal', 'shield', 'revive'].includes(s.type)) seen.add(s.target);
  return [...seen];
}
