// Équilibrage des SPÉCIALISATIONS : chacune des 24 est essayée dans la MÊME équipe de référence, à sa place
// (un tank remplace le tank, un soigneur le soigneur, un dégât le dégât). Les deux autres membres ne changent pas :
// l'écart de victoires vient donc de la spécialisation essayée.
// Usage : [STASIS=1|2|3] node tests/specs-sim.mjs [parties_par_donjon] [filtre]     ex. node tests/specs-sim.mjs 30 mage
//   Une ligne par spécialisation : victoires (%) en tranche 4, en tranche 8, et la moyenne. Héros du niveau de la tranche, équipement correct.
//   Équipe de référence : Guerrier Protection (tank) + Prêtre Sacré (soin) + Assassin Exécuteur (dégâts).
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 30;
const FILTER = process.argv[3] || '';
// STASIS=1|2|3 : jouer en Stasis (plus dur : sépare les spécialisations fortes, qui plafonnent à 100 % en Tranche)
const STASIS = Number(process.env.STASIS) || 0;
const SETUP = STASIS ? { mode: 'stasis', stasisLevel: STASIS } : { mode: 'tranche' };

// Le build de chaque spécialisation (le même que dans les simulations de classe : tests/<classe>-sim.mjs).
// `deck` au niveau 8 (avec son talent `learn`), `low` au niveau 4. `slot` : la place qu'elle prend dans l'équipe.
export const BUILDS = {
  'sacrieur:bastion': { slot: 'tank', spec: 'bastion', learn: ['sacrieur_peau_de_pierre'], deck: ['sacrieur_sacrifice', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'] },
  'sacrieur:equilibre': { slot: 'dps', spec: 'equilibre', learn: ['sacrieur_hemorragie'], low: ['sacrieur_lame_protectrice', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'], deck: ['sacrieur_hemorragie', 'sacrieur_lame_protectrice', 'sacrieur_punition', 'sacrieur_carapace'] },
  'sacrieur:ecorche': { slot: 'dps', spec: 'ecorche', learn: ['sacrieur_execution'], deck: ['sacrieur_dechirure', 'sacrieur_festin', 'sacrieur_punition', 'sacrieur_entaille'] },
  'assassin:venin': { slot: 'dps', spec: 'venin', learn: ['assassin_predateur_toxique'], deck: ['assassin_nuage', 'assassin_estoc', 'assassin_lame_venimeuse', 'assassin_coup_de_grace'] },
  'assassin:executeur': { slot: 'dps', spec: 'executeur', learn: ['assassin_boucherie'], low: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] },
  'assassin:traqueur': { slot: 'dps', spec: 'traqueur', learn: ['assassin_lame_ombre'], low: ['assassin_volee', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deck: ['assassin_lame_ombre', 'assassin_volee', 'assassin_estoc', 'assassin_coup_de_grace'] },
  'templier:gardien': { slot: 'tank', spec: 'gardien', learn: ['templier_serment_fer'], low: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_benediction'], deck: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_rempart'] },
  'templier:lumiere': { slot: 'heal', spec: 'lumiere', learn: ['templier_source_vie'], deck: ['templier_frappe', 'templier_benediction', 'templier_imposition', 'templier_eclat'] },
  'templier:vindicte': { slot: 'dps', spec: 'vindicte', learn: ['templier_jugement_final'], low: ['templier_frappe', 'templier_verdict', 'templier_marteau', 'templier_croisade'], deck: ['templier_frappe', 'templier_verdict', 'templier_marteau', 'templier_jugement_final'] },
  'pretre:sacre': { slot: 'heal', spec: 'sacre', learn: ['pretre_hymne'], low: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'] },
  'pretre:discipline': { slot: 'heal', spec: 'discipline', learn: ['pretre_schisme'], deck: ['pretre_douleur', 'pretre_penitence', 'pretre_bouclier', 'pretre_soin'] },
  'pretre:ombre': { slot: 'dps', spec: 'ombre', learn: ['pretre_eruption'], low: ['pretre_chatiment', 'pretre_douleur', 'pretre_toucher_vampirique', 'pretre_mort'], deck: ['pretre_douleur', 'pretre_toucher_vampirique', 'pretre_mort', 'pretre_eruption'] },
  'guerrier:armes': { slot: 'dps', spec: 'armes', learn: ['guerrier_brise_armure'], low: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_genou'], deck: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_armure'] },
  'guerrier:fureur': { slot: 'dps', spec: 'fureur', learn: ['guerrier_massacre'], deck: ['guerrier_frappe', 'guerrier_dechainement', 'guerrier_execution', 'guerrier_cri'] },
  'guerrier:protection': { slot: 'tank', spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  'druide:gardien': { slot: 'tank', spec: 'gardien', learn: ['druide_regeneration_frenetique'], low: ['druide_coup_patte', 'druide_rugissement', 'druide_peau_ecorce', 'druide_epine_sauvage'], deck: ['druide_coup_patte', 'druide_rugissement', 'druide_peau_ecorce', 'druide_regeneration_frenetique'] },
  'druide:restauration': { slot: 'heal', spec: 'restauration', learn: ['druide_abondance'], deck: ['druide_bourgeon', 'druide_toucher', 'druide_croissance', 'druide_floraison_sauvage'] },
  'druide:farouche': { slot: 'dps', spec: 'farouche', learn: ['druide_frenesie_feline'], deck: ['druide_coup_patte', 'druide_lacerer', 'druide_morsure_feroce', 'druide_epine_sauvage'] },
  'barde:menestrel': { slot: 'dps', spec: 'menestrel', learn: ['barde_hymne_hate'], low: ['barde_tempo', 'barde_crescendo', 'barde_gamme', 'barde_refrain'], deck: ['barde_tempo', 'barde_crescendo', 'barde_gamme', 'barde_hymne_hate'] },
  'barde:troubadour': { slot: 'heal', spec: 'troubadour', learn: ['barde_serenade'], deck: ['barde_refrain', 'barde_melopee', 'barde_ode', 'barde_tempo'] },
  'barde:skald': { slot: 'dps', spec: 'skald', learn: ['barde_rengaine'], deck: ['barde_note', 'barde_strophe', 'barde_crescendo', 'barde_cacophonie'] },
  'mage:pyromancien': { slot: 'dps', spec: 'pyromancien', learn: ['mage_feu_interieur'], deck: ['mage_trait_feu', 'mage_embrasement', 'mage_boule_feu', 'mage_barriere'] },
  'mage:cryomancien': { slot: 'dps', spec: 'cryomancien', learn: ['mage_blizzard'], low: ['mage_eclair_givre', 'mage_prison', 'mage_nova', 'mage_barriere'], deck: ['mage_eclair_givre', 'mage_prison', 'mage_blizzard', 'mage_barriere'] },
  'mage:arcaniste': { slot: 'dps', spec: 'arcaniste', learn: ['mage_puissance'], low: ['mage_projectiles', 'mage_surcharge', 'mage_evocation', 'mage_barriere'], deck: ['mage_projectiles', 'mage_surcharge', 'mage_evocation', 'mage_meteore'] }
};
const REF = { tank: 'guerrier:protection', heal: 'pretre:sacre', dps: 'assassin:executeur' };

export function teamWith(key) {
  const slot = BUILDS[key].slot;
  return ['tank', 'heal', 'dps'].map((s) => (s === slot ? key : REF[s]));
}

/** Victoires (%) et tours moyens d'une équipe sur un donjon. */
export function measure(dungeon, members, n = N) {
  const level = dungeon.tranche;
  let wins = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    const b = members.map((m) => BUILDS[m]);
    const extra = { specs: b.map((x) => x.spec), decks: b.map((x) => (level >= 8 ? x.deck : x.low ?? x.deck)), learns: b.map((x) => (level >= 8 ? x.learn : [])) };
    const party = makeParty(content, members.map((m) => m.split(':')[0]), level, 'decent', i + 1, extra);
    const { state } = playRun(content, { tranche: dungeon.tranche, dungeon: dungeon.id, ...SETUP }, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    turns += state.turn || 0;
  }
  return { win: (100 * wins) / n, turns: turns / n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dungeons = content.dungeonList.filter((d) => d.available !== false && d.tranche >= 4);
  const t4 = dungeons.filter((d) => d.tranche === 4), t8 = dungeons.filter((d) => d.tranche === 8);
  if (STASIS) console.log(`(Stasis ${STASIS})`);
  console.log(`--- Spécialisations dans l'équipe de référence (Guerrier Protection + Prêtre Sacré + Assassin Exécuteur) — ${N} parties par donjon ---`);
  console.log(`tranche 4 : ${t4.map((d) => d.name).join(', ')} · tranche 8 : ${t8.map((d) => d.name).join(', ')}`);
  console.log('spécialisation'.padEnd(24) + 'place'.padEnd(7) + 'T4 %'.padStart(7) + 'T8 %'.padStart(7) + 'moy.'.padStart(7) + '   par donjon (T4 | T8)');
  for (const key of Object.keys(BUILDS).filter((k) => k.includes(FILTER))) {
    const team = teamWith(key);
    const r4 = t4.map((d) => measure(d, team)), r8 = t8.map((d) => measure(d, team));
    const avg = (rs) => rs.reduce((a, r) => a + r.win, 0) / rs.length;
    const a4 = avg(r4), a8 = avg(r8);
    console.log(key.padEnd(24) + BUILDS[key].slot.padEnd(7) + a4.toFixed(0).padStart(7) + a8.toFixed(0).padStart(7) + ((a4 + a8) / 2).toFixed(0).padStart(7)
      + '   ' + r4.map((r) => r.win.toFixed(0)).join(' ') + ' | ' + r8.map((r) => r.win.toFixed(0)).join(' '));
  }
}
