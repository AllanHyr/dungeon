// Équilibrage du Sacrieur : le compare au Berserker (le tank actuel) dans les mêmes équipes, avec chaque spécialisation.
// Usage : node tests/sacrieur-sim.mjs [parties_par_ligne]
//   Ce que font les robots est approximatif (ils choisissent le mode de leur spécialisation et jouent le meilleur coup par PA) :
//   ça repère les valeurs franchement trop fortes ou trop faibles, pas le plaisir de jeu.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const BASE = ['sacrieur_entaille', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'];
const BUILDS = {
  'sans spé': { spec: null, deck: BASE },
  // `learn` : le choix du palier 8 (appris seulement à partir du niveau 8)
  'bastion': { spec: 'bastion', learn: ['sacrieur_peau_de_pierre'], deck: ['sacrieur_sacrifice', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'] },
  'équilibre': { spec: 'equilibre', learn: ['sacrieur_hemorragie'], deckLow: ['sacrieur_lame_protectrice', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'], deck: ['sacrieur_hemorragie', 'sacrieur_lame_protectrice', 'sacrieur_punition', 'sacrieur_carapace'] },
  'écorché': { spec: 'ecorche', learn: ['sacrieur_execution'], deck: ['sacrieur_dechirure', 'sacrieur_festin', 'sacrieur_punition', 'sacrieur_entaille'] }
};

function run(label, setup, classes, level, gear, builds = []) {
  let wins = 0, deaths = 0, turns = 0, tankHp = 0, tankDied = 0;
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => b?.spec ?? null), decks: builds.map((b) => (level >= 8 ? b?.deck : b?.deckLow ?? b?.deck) ?? null), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, classes, level, gear, i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    turns += state.turn;
    tankDied += state.players[0].stats.deaths > 0 ? 1 : 0;
  }
  console.log(`${label.padEnd(46)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  (tank mort dans ${(100 * tankDied / N).toFixed(0).padStart(3)}% des parties)`);
}

console.log(`--- ${N} parties par ligne (équipe : tank + Veilleur + Duelliste, équipement correct) ---`);
for (const [tr, lvl, name] of [[1, 3, 'Caves (niv 3)'], [4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  console.log(`\n# ${name}`);
  const setup = { tranche: tr, mode: 'tranche' };
  run('Berserker (référence)', setup, ['berserker', 'veilleur', 'duelliste'], lvl, 'decent');
  for (const [bn, b] of Object.entries(BUILDS)) {
    if (b.spec && lvl < 4) continue;
    run(`Sacrieur ${bn}`, setup, ['sacrieur', 'veilleur', 'duelliste'], lvl, 'decent', [b]);
  }
}
console.log('\n# Seul, Caves niveau 1 (sans spécialisation) et Crypte niveau 6');
run('Berserker seul (référence), niv 1', { tranche: 1, mode: 'tranche' }, ['berserker'], 1, 'none');
run('Sacrieur seul, niv 1', { tranche: 1, mode: 'tranche' }, ['sacrieur'], 1, 'none', [BUILDS['sans spé']]);
run('Berserker seul (référence), niv 6, Crypte', { tranche: 4, mode: 'tranche' }, ['berserker'], 6, 'decent');
for (const [bn, b] of Object.entries(BUILDS)) run(`Sacrieur ${bn} seul, niv 6, Crypte`, { tranche: 4, mode: 'tranche' }, ['sacrieur'], 6, 'decent', [b]);
