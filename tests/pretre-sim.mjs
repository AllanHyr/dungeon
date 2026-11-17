// Équilibrage du Prêtre : le compare au Veilleur (le soigneur actuel) dans les mêmes équipes, avec chaque spécialisation.
// Usage : node tests/pretre-sim.mjs [parties_par_ligne]
//   Les robots changent de forme selon leur spécialisation (l'Ombre reste en ombre ; Sacré et Discipline passent en ombre quand personne
//   n'a besoin de soins) et jouent le meilleur coup par PA : un ordre de grandeur, pas un ressenti.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const BASE = ['pretre_chatiment', 'pretre_soin', 'pretre_douleur', 'pretre_bouclier'];
const BUILDS = {
  'sans spé': { spec: null, deck: BASE },
  // `learn` : le choix du palier 8 ; `deckLow` : le deck avant le niveau 8
  'sacré': { spec: 'sacre', learn: ['pretre_hymne'], deckLow: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'] },
  'discipline': { spec: 'discipline', learn: ['pretre_schisme'], deck: ['pretre_douleur', 'pretre_penitence', 'pretre_bouclier', 'pretre_soin'] },
  'ombre': { spec: 'ombre', learn: ['pretre_eruption'], deckLow: ['pretre_chatiment', 'pretre_douleur', 'pretre_toucher_vampirique', 'pretre_mort'], deck: ['pretre_douleur', 'pretre_toucher_vampirique', 'pretre_mort', 'pretre_eruption'] }
};

function run(label, setup, classes, level, gear, builds = []) {
  let wins = 0, deaths = 0, dmg = 0, heal = 0;
  const idx = classes.indexOf('pretre') >= 0 ? classes.indexOf('pretre') : classes.indexOf(classes.includes('duelliste') && classes.includes('veilleur') && classes.length === 3 && label.startsWith('Duelliste') ? 'duelliste' : 'veilleur');
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => b?.spec ?? null), decks: builds.map((b) => (level >= 8 ? b?.deck : b?.deckLow ?? b?.deck) ?? null), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, classes, level, gear, i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    dmg += state.players[idx].stats.damageDealt;
    heal += state.players[idx].stats.healingDone;
  }
  console.log(`${label.padEnd(40)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  dégâts ${String(Math.round(dmg / N)).padStart(5)}  soins ${String(Math.round(heal / N)).padStart(5)}`);
}

console.log(`--- ${N} parties par ligne (équipe : Berserker + soigneur + Duelliste, équipement correct) ---`);
for (const [tr, lvl, name] of [[1, 3, 'Caves (niv 3)'], [4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  console.log(`\n# ${name}`);
  const setup = { tranche: tr, mode: 'tranche' };
  run('Veilleur (référence)', setup, ['berserker', 'veilleur', 'duelliste'], lvl, 'decent');
  for (const [bn, b] of Object.entries(BUILDS)) {
    if (b.spec && lvl < 4) continue;
    run(`Prêtre ${bn}`, setup, ['berserker', 'pretre', 'duelliste'], lvl, 'decent', [null, b]);
  }
}
console.log('\n# Le Prêtre Ombre comme DPS (équipe : Berserker + Veilleur + dps)');
for (const [tr, lvl, name] of [[4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  const setup = { tranche: tr, mode: 'tranche' };
  run(`Duelliste (référence), ${name}`, setup, ['berserker', 'veilleur', 'duelliste'], lvl, 'decent');
  run(`Prêtre ombre, ${name}`, setup, ['berserker', 'veilleur', 'pretre'], lvl, 'decent', [null, null, BUILDS.ombre]);
}
console.log('\n# Seul : Caves niveau 1 (sans spécialisation) et Crypte niveau 6');
run('Veilleur seul (référence), niv 1', { tranche: 1, mode: 'tranche' }, ['veilleur'], 1, 'none');
run('Prêtre seul, niv 1', { tranche: 1, mode: 'tranche' }, ['pretre'], 1, 'none', [BUILDS['sans spé']]);
run('Veilleur seul (référence), niv 6, Crypte', { tranche: 4, mode: 'tranche' }, ['veilleur'], 6, 'decent');
for (const [bn, b] of Object.entries(BUILDS)) run(`Prêtre ${bn} seul, niv 6, Crypte`, { tranche: 4, mode: 'tranche' }, ['pretre'], 6, 'decent', [b]);
