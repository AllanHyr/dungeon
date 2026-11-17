// Simule des centaines de runs avec des robots : détecte les bugs ET donne des taux de victoire.
// Usage : node tests/simulate.mjs [nombre_de_parties] [filtre]
// Réglage rapide (en mémoire) : TUNE="1:1.2:1" node tests/simulate.mjs   (voir load-data.mjs)
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 100;
const filter = process.argv[3] || '';

function sim(label, setup, classes, level, gear, mode = 'smart') {
  if (filter && !label.includes(filter)) return;
  let wins = 0, turns = 0, actions = 0, deaths = 0, xp = 0, loot = 0;
  for (let i = 0; i < N; i++) {
    const party = makeParty(content, classes, level, gear, i + 1);
    const { state, actions: a } = playRun(content, setup, party, 1000 + i * 7919, undefined, undefined, mode);
    if (state.result.won) wins++;
    turns += state.turn; actions += a;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    xp += state.result.players.reduce((s, p) => s + p.xp.total, 0) / state.players.length;
    loot += state.result.players.reduce((s, p) => s + p.loot.length, 0);
  }
  console.log(`${label.padEnd(50)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  tours ${(turns / N).toFixed(1).padStart(5)}  actions ${(actions / N).toFixed(0).padStart(4)}  morts ${(deaths / N).toFixed(1)}  xp ${(xp / N).toFixed(0).padStart(4)}`);
}

const A = ['berserker', 'veilleur', 'duelliste'];
const B = ['berserker', 'druide_ancien', 'duelliste'];
const C = ['berserker', 'veilleur', 'druide_ancien'];
console.log(`--- ${N} parties par ligne ---`);
for (const [tr, lvl] of [[1, 1], [4, 4], [8, 8]]) {
  sim(`T${tr} Tranche, ${A.join('+')}, sans équip.`, { tranche: tr, mode: 'tranche' }, A, lvl, 'none');
  sim(`T${tr} Tranche, ${B.join('+')}, sans équip.`, { tranche: tr, mode: 'tranche' }, B, lvl, 'none');
  sim(`T${tr} Tranche, ${C.join('+')}, sans équip.`, { tranche: tr, mode: 'tranche' }, C, lvl, 'none');
  sim(`T${tr} Tranche, ${A.join('+')}, équip. correct`, { tranche: tr, mode: 'tranche' }, A, lvl, 'decent');
  sim(`T${tr} Tranche, ${A.join('+')}, bon équip.`, { tranche: tr, mode: 'tranche' }, A, lvl, 'good');
  sim(`T${tr} Stasis 1, ${A.join('+')}, équip. correct`, { tranche: tr, mode: 'stasis', stasisLevel: 1 }, A, lvl, 'decent');
  sim(`T${tr} Stasis 3, ${A.join('+')}, bon équip.`, { tranche: tr, mode: 'stasis', stasisLevel: 3 }, A, lvl, 'good');
  sim(`T${tr} Tranche, ${A.join('+')}, attaque de base seule`, { tranche: tr, mode: 'tranche' }, A, lvl, 'none', 'basic');
}
sim('T1 Tranche, 4 héros niv 1', { tranche: 1, mode: 'tranche' }, ['berserker', 'veilleur', 'druide_ancien', 'duelliste'], 1, 'none');
sim('T1 Tranche, 2 héros berserker+veilleur', { tranche: 1, mode: 'tranche' }, ['berserker', 'veilleur'], 1, 'none');
sim('T1 Tranche, 2 héros duelliste+druide', { tranche: 1, mode: 'tranche' }, ['duelliste', 'druide_ancien'], 1, 'none');
for (const c of ['berserker', 'veilleur', 'druide_ancien', 'duelliste']) sim(`T1 Tranche, solo ${c} niv 1`, { tranche: 1, mode: 'tranche' }, [c], 1, 'none');
sim('T8 Tranche, 3 héros niv 1 (suicide)', { tranche: 8, mode: 'tranche' }, A, 1, 'none');
sim('T4 Tranche, 3 héros niv 2', { tranche: 4, mode: 'tranche' }, A, 2, 'none');
sim('T1 Basic, 3 héros niv 12 (sur-niveau)', { tranche: 1, mode: 'basic' }, A, 12, 'good');
sim('T1 Tranche, 3 héros niv 12 (sur-niveau)', { tranche: 1, mode: 'tranche' }, A, 12, 'good');
