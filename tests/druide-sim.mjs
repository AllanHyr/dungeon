// Équilibrage du Druide : chaque spécialisation dans son rôle, face aux classes du même rôle.
//   Gardien (ours) contre les autres tanks · Restauration (arbre) contre le Prêtre · Farouche (félin) contre l'Assassin.
// Usage : node tests/druide-sim.mjs [parties_par_ligne]
//   Les robots prennent la forme de leur spécialisation (Gardien : ours, Restauration : arbre, Farouche : félin, sinon naturelle)
//   et jouent le meilleur coup par PA : un ordre de grandeur, pas un ressenti.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const B = {
  'druide:sans': { spec: null, deck: ['druide_epine_sauvage', 'druide_bourgeon', 'druide_coup_patte', 'druide_toucher'] },
  // `learn` : le choix du palier 8 ; `deckLow` : le deck avant le niveau 8
  'druide:gardien': { spec: 'gardien', learn: ['druide_regeneration_frenetique'], deckLow: ['druide_coup_patte', 'druide_rugissement', 'druide_peau_ecorce', 'druide_epine_sauvage'], deck: ['druide_coup_patte', 'druide_rugissement', 'druide_peau_ecorce', 'druide_regeneration_frenetique'] },
  'druide:restauration': { spec: 'restauration', learn: ['druide_abondance'], deck: ['druide_bourgeon', 'druide_toucher', 'druide_croissance', 'druide_floraison_sauvage'] },
  'druide:farouche': { spec: 'farouche', learn: ['druide_frenesie_feline'], deck: ['druide_coup_patte', 'druide_lacerer', 'druide_morsure_feroce', 'druide_epine_sauvage'] },
  'guerrier:protection': { spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  'templier:gardien': { spec: 'gardien', learn: ['templier_serment_fer'], deck: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_rempart'] },
  'pretre:sacre': { spec: 'sacre', learn: ['pretre_hymne'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'], deckLow: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'] },
  'assassin:executeur': { spec: 'executeur', learn: ['assassin_boucherie'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deckLow: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] }
};

function run(label, setup, members, level, watch = 0) {
  let wins = 0, deaths = 0, dmg = 0, heal = 0;
  const builds = members.map((m) => B[m] || null);
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => (level >= 4 ? b?.spec ?? null : null)), decks: builds.map((b) => (b ? (level >= 8 ? b.deck : b.deckLow ?? b.deck) : null)), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, members.map((m) => m.split(':')[0]), level, 'decent', i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    dmg += state.players[watch].stats.damageDealt;
    heal += state.players[watch].stats.healingDone;
  }
  console.log(`${label.padEnd(36)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  dégâts ${String(Math.round(dmg / N)).padStart(5)}  soins ${String(Math.round(heal / N)).padStart(5)}`);
}

console.log(`--- ${N} parties par ligne (équipement correct) ---`);
for (const [tr, lvl, name] of [[4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  const setup = { tranche: tr, mode: 'tranche' };
  console.log(`\n# Le tank — ${name} (tank + Prêtre Sacré + Assassin)`);
  for (const t of ['guerrier:protection', 'templier:gardien', 'druide:gardien']) run(t, setup, [t, 'pretre:sacre', 'assassin:executeur'], lvl);
  console.log(`\n# Le soigneur — ${name} (Guerrier + soigneur + Assassin)`);
  for (const h of ['pretre:sacre', 'druide:restauration', 'druide:sans']) run(h, setup, ['guerrier:protection', h, 'assassin:executeur'], lvl, 1);
  console.log(`\n# Le dps — ${name} (Guerrier + Prêtre + dps)`);
  for (const d of ['assassin:executeur', 'druide:farouche']) run(d, setup, ['guerrier:protection', 'pretre:sacre', d], lvl, 2);
}
console.log('\n# Seul : Caves niveau 1 et Crypte niveau 6');
run('druide sans spé, niv 1', { tranche: 1, mode: 'tranche' }, ['druide:sans'], 1);
for (const b of ['druide:gardien', 'druide:restauration', 'druide:farouche']) run(`${b} seul, niv 6`, { tranche: 4, mode: 'tranche' }, [b], 6);
