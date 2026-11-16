// Équilibrage de l'Assassin : le compare au Duelliste (le dps actuel) dans les mêmes équipes, avec chaque spécialisation.
// Usage : node tests/assassin-sim.mjs [parties_par_ligne]
//   Ce que font les robots est approximatif (ils marquent une proie, la focalisent, jouent le meilleur coup par PA) :
//   ça repère les valeurs franchement trop fortes ou trop faibles, pas le plaisir de jeu.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const BASE = ['assassin_estoc', 'assassin_lame_venimeuse', 'assassin_dos', 'assassin_coup_de_grace'];
const BUILDS = {
  'sans spé': { spec: null, deck: BASE },
  // `learn` : le choix du palier 8 (appris seulement à partir du niveau 8) ; `deckLow` : le deck avant le niveau 8
  'venin': { spec: 'venin', learn: ['assassin_predateur_toxique'], deck: ['assassin_nuage', 'assassin_estoc', 'assassin_lame_venimeuse', 'assassin_coup_de_grace'] },
  'exécuteur': { spec: 'executeur', learn: ['assassin_boucherie'], deckLow: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] },
  'traqueur': { spec: 'traqueur', learn: ['assassin_lame_ombre'], deckLow: ['assassin_volee', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deck: ['assassin_lame_ombre', 'assassin_volee', 'assassin_estoc', 'assassin_coup_de_grace'] }
};

function run(label, setup, classes, level, gear, builds = []) {
  let wins = 0, deaths = 0, turns = 0, dmg = 0, dead = 0;
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => b?.spec ?? null), decks: builds.map((b) => (level >= 8 ? b?.deck : b?.deckLow ?? b?.deck) ?? null), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, classes, level, gear, i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    turns += state.turn;
    const dps = state.players[classes.length - 1];
    dmg += dps.stats.damageDealt;
    dead += dps.stats.deaths > 0 ? 1 : 0;
  }
  console.log(`${label.padEnd(40)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  dégâts du dps ${Math.round(dmg / N)}  (dps mort dans ${(100 * dead / N).toFixed(0).padStart(3)}%)`);
}

console.log(`--- ${N} parties par ligne (équipe : Sacrieur + Veilleur + dps, équipement correct) ---`);
for (const [tr, lvl, name] of [[1, 3, 'Caves (niv 3)'], [4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  console.log(`\n# ${name}`);
  const setup = { tranche: tr, mode: 'tranche' };
  run('Duelliste (référence)', setup, ['sacrieur', 'veilleur', 'duelliste'], lvl, 'decent');
  for (const [bn, b] of Object.entries(BUILDS)) {
    if (b.spec && lvl < 4) continue;
    run(`Assassin ${bn}`, setup, ['sacrieur', 'veilleur', 'assassin'], lvl, 'decent', [null, null, b]);
  }
}
console.log('\n# Seul, Caves niveau 1 et Crypte niveau 6');
run('Duelliste seul (référence), niv 1', { tranche: 1, mode: 'tranche' }, ['duelliste'], 1, 'none');
run('Assassin seul, niv 1', { tranche: 1, mode: 'tranche' }, ['assassin'], 1, 'none', [BUILDS['sans spé']]);
run('Duelliste seul (référence), niv 6, Crypte', { tranche: 4, mode: 'tranche' }, ['duelliste'], 6, 'decent');
for (const [bn, b] of Object.entries(BUILDS)) run(`Assassin ${bn} seul, niv 6, Crypte`, { tranche: 4, mode: 'tranche' }, ['assassin'], 6, 'decent', [b]);
