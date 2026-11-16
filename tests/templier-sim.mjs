// Équilibrage du Templier : le compare au Berserker (le tank actuel) dans les mêmes équipes, avec chaque spécialisation.
// Usage : node tests/templier-sim.mjs [parties_par_ligne]
//   Ce que font les robots est approximatif (ils choisissent l'aura de leur spécialisation, génèrent de la puissance sacrée et la dépensent
//   sur le meilleur coup par PA) : ça repère les valeurs franchement trop fortes ou trop faibles, pas le plaisir de jeu.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const BASE = ['templier_frappe', 'templier_benediction', 'templier_verdict', 'templier_eclat'];
const BUILDS = {
  'sans spé': { spec: null, deck: BASE },
  // `learn` : le choix du palier 8 (appris seulement à partir du niveau 8) ; `deckLow` : le deck avant le niveau 8
  'gardien': { spec: 'gardien', learn: ['templier_serment_fer'], deck: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_rempart'] },
  'lumière': { spec: 'lumiere', learn: ['templier_source_vie'], deck: ['templier_frappe', 'templier_benediction', 'templier_imposition', 'templier_eclat'] },
  'vindicte': { spec: 'vindicte', learn: ['templier_jugement_final'], deckLow: ['templier_frappe', 'templier_verdict', 'templier_marteau', 'templier_croisade'], deck: ['templier_frappe', 'templier_verdict', 'templier_marteau', 'templier_jugement_final'] }
};

function run(label, setup, classes, level, gear, builds = []) {
  let wins = 0, deaths = 0, tankDied = 0, dmg = 0, heal = 0;
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => b?.spec ?? null), decks: builds.map((b) => (level >= 8 ? b?.deck : b?.deckLow ?? b?.deck) ?? null), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, classes, level, gear, i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    tankDied += state.players[0].stats.deaths > 0 ? 1 : 0;
    dmg += state.players[0].stats.damageDealt;
    heal += state.players[0].stats.healingDone;
  }
  console.log(`${label.padEnd(40)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  (tank mort ${(100 * tankDied / N).toFixed(0).padStart(3)}%)  dégâts ${Math.round(dmg / N)}  soins ${Math.round(heal / N)}`);
}

console.log(`--- ${N} parties par ligne (équipe : tank + Veilleur + Duelliste, équipement correct) ---`);
for (const [tr, lvl, name] of [[1, 3, 'Caves (niv 3)'], [4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  console.log(`\n# ${name}`);
  const setup = { tranche: tr, mode: 'tranche' };
  run('Berserker (référence)', setup, ['berserker', 'veilleur', 'duelliste'], lvl, 'decent');
  for (const [bn, b] of Object.entries(BUILDS)) {
    if (b.spec && lvl < 4) continue;
    run(`Templier ${bn}`, setup, ['templier', 'veilleur', 'duelliste'], lvl, 'decent', [b]);
  }
}
console.log('\n# Seul : Caves niveau 1 (sans spécialisation) et Crypte niveau 6');
run('Berserker seul (référence), niv 1', { tranche: 1, mode: 'tranche' }, ['berserker'], 1, 'none');
run('Templier seul, niv 1', { tranche: 1, mode: 'tranche' }, ['templier'], 1, 'none', [BUILDS['sans spé']]);
run('Berserker seul (référence), niv 6, Crypte', { tranche: 4, mode: 'tranche' }, ['berserker'], 6, 'decent');
for (const [bn, b] of Object.entries(BUILDS)) run(`Templier ${bn} seul, niv 6, Crypte`, { tranche: 4, mode: 'tranche' }, ['templier'], 6, 'decent', [b]);
