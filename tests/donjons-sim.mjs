// Équilibrage des DONJONS : chaque donjon joué par les mêmes équipes de robots (anciennes classes, nouvelles classes, que des tanks, solo).
// Usage : node tests/donjons-sim.mjs [parties_par_case] [tranche]
//   Une ligne par donjon, une colonne par équipe : le taux de victoire. Sert à repérer un donjon nettement plus dur (ou plus facile) que
//   ses voisins de tranche, et les équipes qui passent partout. Les robots jouent le meilleur coup par PA : un ordre de grandeur, pas un ressenti.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 40;
const ONLY = Number(process.argv[3]) || null;

// Un « build » par classe et par spécialisation : `deck` au niveau 8 (avec son talent `learn`), `low` avant.
const B = {
  'sacrieur:bastion': { spec: 'bastion', learn: ['sacrieur_peau_de_pierre'], deck: ['sacrieur_sacrifice', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'] },
  'templier:gardien': { spec: 'gardien', learn: ['templier_serment_fer'], deck: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_rempart'], low: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_benediction'] },
  'assassin:executeur': { spec: 'executeur', learn: ['assassin_boucherie'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], low: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] },
  'assassin:venin': { spec: 'venin', learn: ['assassin_predateur_toxique'], deck: ['assassin_nuage', 'assassin_estoc', 'assassin_lame_venimeuse', 'assassin_coup_de_grace'] },
  'pretre:sacre': { spec: 'sacre', learn: ['pretre_hymne'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'], low: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'] },
  'pretre:discipline': { spec: 'discipline', learn: ['pretre_schisme'], deck: ['pretre_douleur', 'pretre_penitence', 'pretre_bouclier', 'pretre_soin'] },
  'guerrier:protection': { spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  'guerrier:armes': { spec: 'armes', learn: ['guerrier_brise_armure'], deck: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_armure'], low: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_genou'] },
  'druide:gardien': { spec: 'gardien', learn: ['druide_regeneration_frenetique'], deck: ['druide_coup_patte', 'druide_rugissement', 'druide_peau_ecorce', 'druide_regeneration_frenetique'], low: ['druide_coup_patte', 'druide_rugissement', 'druide_peau_ecorce', 'druide_epine_sauvage'] },
  'druide:restauration': { spec: 'restauration', learn: ['druide_abondance'], deck: ['druide_bourgeon', 'druide_toucher', 'druide_croissance', 'druide_floraison_sauvage'] },
  'druide:farouche': { spec: 'farouche', learn: ['druide_frenesie_feline'], deck: ['druide_coup_patte', 'druide_lacerer', 'druide_morsure_feroce', 'druide_epine_sauvage'] }
};
// Équipes de NOUVELLES classes (les anciennes, retirées du jeu, gardent une colonne de référence).
const TEAMS = {
  'équilibrée A': ['guerrier:protection', 'pretre:sacre', 'assassin:executeur'],
  'équilibrée B': ['templier:gardien', 'druide:restauration', 'guerrier:armes'],
  'équilibrée C': ['druide:gardien', 'pretre:discipline', 'assassin:venin'],
  '3 tanks': ['templier:gardien', 'guerrier:protection', 'sacrieur:bastion'],
  'duo': ['guerrier:protection', 'pretre:sacre'],
  'solo tank': ['guerrier:protection'],
  'anciennes (réf.)': ['berserker', 'veilleur', 'duelliste']
};

function winRate(dungeon, members) {
  const level = dungeon.tranche;
  let wins = 0;
  for (let i = 0; i < N; i++) {
    const builds = members.map((m) => (level >= 4 ? B[m] : null) || null);
    const extra = { specs: builds.map((b) => b?.spec ?? null), decks: builds.map((b) => (b ? (level >= 8 ? b.deck : b.low ?? b.deck) : null)), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, members.map((m) => m.split(':')[0]), level, 'decent', i + 1, extra);
    const { state } = playRun(content, { tranche: dungeon.tranche, dungeon: dungeon.id, mode: 'tranche' }, party, 1000 + i * 7919);
    if (state.result.won) wins++;
  }
  return Math.round((100 * wins) / N);
}

const names = Object.keys(TEAMS);
console.log(`--- Victoires (%) par donjon et par équipe — ${N} parties par case, héros du niveau de la tranche, équipement correct ---`);
console.log(''.padEnd(34) + names.map((n) => n.padStart(17)).join(''));
for (const d of content.dungeonList.filter((x) => x.available !== false && (!ONLY || x.tranche === ONLY))) {
  const row = names.map((n) => `${winRate(d, TEAMS[n])}`.padStart(17)).join('');
  console.log(`${String(d.tranche).padStart(2)} ${d.name.padEnd(31)}${row}`);
}
