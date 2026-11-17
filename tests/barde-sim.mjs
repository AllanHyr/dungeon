// Équilibrage du Barde : chaque spécialisation dans son rôle.
//   Troubadour (soin) contre le Prêtre Sacré · Skald (dégâts) contre l'Assassin · Ménestrel (soutien) en 4e membre, contre un 2e dps.
// Usage : node tests/barde-sim.mjs [parties_par_ligne]
//   Les robots prennent le chant de leur spécialisation, gagnent de l'inspiration, et donnent le Tempo à l'allié qui frappe le plus fort :
//   un ordre de grandeur, pas un ressenti.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const B = {
  'barde:sans': { spec: null, deck: ['barde_note', 'barde_refrain', 'barde_tempo', 'barde_crescendo'] },
  // `learn` : le choix du palier 8
  'barde:menestrel': { spec: 'menestrel', learn: ['barde_hymne_hate'], deck: ['barde_tempo', 'barde_crescendo', 'barde_gamme', 'barde_hymne_hate'], deckLow: ['barde_tempo', 'barde_crescendo', 'barde_gamme', 'barde_refrain'] },
  'barde:troubadour': { spec: 'troubadour', learn: ['barde_serenade'], deck: ['barde_refrain', 'barde_melopee', 'barde_ode', 'barde_tempo'] },
  'barde:skald': { spec: 'skald', learn: ['barde_rengaine'], deck: ['barde_note', 'barde_strophe', 'barde_crescendo', 'barde_cacophonie'] },
  'guerrier:protection': { spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  'pretre:sacre': { spec: 'sacre', learn: ['pretre_hymne'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'], deckLow: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'] },
  'assassin:executeur': { spec: 'executeur', learn: ['assassin_boucherie'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deckLow: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] },
  'guerrier:armes': { spec: 'armes', learn: ['guerrier_brise_armure'], deck: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_armure'], deckLow: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_genou'] }
};

function run(label, setup, members, level, watch = 0) {
  let wins = 0, deaths = 0, dmg = 0, heal = 0;
  const builds = members.map((m) => B[m] || null);
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => (level >= 4 ? b?.spec ?? null : null)), decks: builds.map((b) => (b && (level >= 4 || !b.spec) ? (level >= 8 ? b.deck : b.deckLow ?? b.deck) : null)), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, members.map((m) => m.split(':')[0]), level, 'decent', i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    dmg += state.players[watch].stats.damageDealt;
    heal += state.players[watch].stats.healingDone;
  }
  console.log(`${label.padEnd(38)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  dégâts ${String(Math.round(dmg / N)).padStart(5)}  soins ${String(Math.round(heal / N)).padStart(5)}`);
}

console.log(`--- ${N} parties par ligne (équipement correct) ---`);
for (const [tr, lvl, name] of [[4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  const setup = { tranche: tr, mode: 'tranche' };
  console.log(`\n# Le soigneur — ${name} (Guerrier + soigneur + Assassin)`);
  for (const h of ['pretre:sacre', 'barde:troubadour', 'barde:sans']) run(h, setup, ['guerrier:protection', h, 'assassin:executeur'], lvl, 1);
  console.log(`\n# Le dps — ${name} (Guerrier + Prêtre + dps)`);
  for (const d of ['assassin:executeur', 'barde:skald']) run(d, setup, ['guerrier:protection', 'pretre:sacre', d], lvl, 2);
  console.log(`\n# Le soutien — ${name} (Guerrier + Prêtre + ?) : le Ménestrel à la place d'un dps`);
  for (const x of ['assassin:executeur', 'barde:menestrel']) run(x, setup, ['guerrier:protection', 'pretre:sacre', x], lvl, 2);
  console.log(`\n# Le 4e membre — ${name} (Guerrier + Prêtre + Assassin + ?)`);
  for (const x of ['guerrier:armes', 'barde:menestrel']) run(x, setup, ['guerrier:protection', 'pretre:sacre', 'assassin:executeur', x], lvl, 3);
}
console.log('\n# Avant la spécialisation — Caves (niv 3) : Guerrier + soigneur + Assassin');
for (const h of ['pretre:sacre', 'barde:sans']) run(h, { tranche: 1, mode: 'tranche' }, ['guerrier:protection', h, 'assassin:executeur'], 3, 1);
console.log('\n# Seul : Caves niveau 1 et Crypte niveau 6');
run('barde sans spé, niv 1', { tranche: 1, mode: 'tranche' }, ['barde:sans'], 1);
for (const b of ['barde:menestrel', 'barde:troubadour', 'barde:skald']) run(`${b} seul, niv 6`, { tranche: 4, mode: 'tranche' }, [b], 6);
