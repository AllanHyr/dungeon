// Équilibrage du Guerrier : la Protection comparée aux autres tanks (Berserker, Sacrieur, Templier) ; Armes et Fureur comparées aux dps
// (Duelliste, Assassin). Usage : node tests/guerrier-sim.mjs [parties_par_ligne]
//   Les robots prennent la posture de leur spécialisation (Protection : défensive, Fureur : offensive, sinon combat), gagnent de la rage
//   et la dépensent sur le meilleur coup par PA : un ordre de grandeur, pas un ressenti.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const G = {
  'sans spé': { spec: null, deck: ['guerrier_frappe', 'guerrier_brise_genou', 'guerrier_execution', 'guerrier_cri'] },
  // `learn` : le choix du palier 8 ; `deckLow` : le deck avant le niveau 8
  protection: { spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  armes: { spec: 'armes', learn: ['guerrier_brise_armure'], deckLow: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_genou'], deck: ['guerrier_frappe', 'guerrier_frappe_mortelle', 'guerrier_execution', 'guerrier_brise_armure'] },
  fureur: { spec: 'fureur', learn: ['guerrier_massacre'], deck: ['guerrier_frappe', 'guerrier_dechainement', 'guerrier_execution', 'guerrier_cri'] }
};
const OTHER = {
  'sacrieur:bastion': { spec: 'bastion', learn: ['sacrieur_peau_de_pierre'], deck: ['sacrieur_sacrifice', 'sacrieur_morsure', 'sacrieur_punition', 'sacrieur_carapace'] },
  'templier:gardien': { spec: 'gardien', learn: ['templier_serment_fer'], deck: ['templier_frappe', 'templier_main_protection', 'templier_verdict', 'templier_rempart'] },
  'assassin:executeur': { spec: 'executeur', learn: ['assassin_boucherie'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deckLow: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] }
};

/** `members` : ['berserker', 'guerrier:protection', ...] (classe:build). */
function run(label, setup, members, level, gear, watch = 0) {
  let wins = 0, deaths = 0, dmg = 0, taken = 0;
  const builds = members.map((m) => { const [cls, b] = m.split(':'); return cls === 'guerrier' ? G[b] : OTHER[m] || null; });
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => (level >= 4 ? b?.spec ?? null : null)), decks: builds.map((b) => (b ? (level >= 8 ? b.deck : b.deckLow ?? b.deck) : null)), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, members.map((m) => m.split(':')[0]), level, gear, i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    dmg += state.players[watch].stats.damageDealt;
    taken += state.players[watch].stats.damageTaken;
  }
  console.log(`${label.padEnd(44)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  dégâts ${String(Math.round(dmg / N)).padStart(5)}  encaissés ${String(Math.round(taken / N)).padStart(5)}`);
}

console.log(`--- ${N} parties par ligne (équipement correct) ---`);
for (const [tr, lvl, name] of [[4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  const setup = { tranche: tr, mode: 'tranche' };
  console.log(`\n# Le tank — ${name} (tank + Veilleur + Duelliste)`);
  run('Berserker (référence)', setup, ['berserker', 'veilleur', 'duelliste'], lvl, 'decent');
  run('Sacrieur Bastion', setup, ['sacrieur:bastion', 'veilleur', 'duelliste'], lvl, 'decent');
  run('Templier Gardien', setup, ['templier:gardien', 'veilleur', 'duelliste'], lvl, 'decent');
  run('Guerrier sans spé', setup, ['guerrier:sans spé', 'veilleur', 'duelliste'], lvl, 'decent');
  run('Guerrier Protection', setup, ['guerrier:protection', 'veilleur', 'duelliste'], lvl, 'decent');
  console.log(`\n# Le dps — ${name} (Berserker + Veilleur + dps)`);
  run('Duelliste (référence)', setup, ['berserker', 'veilleur', 'duelliste'], lvl, 'decent', 2);
  run('Assassin Exécuteur', setup, ['berserker', 'veilleur', 'assassin:executeur'], lvl, 'decent', 2);
  run('Guerrier Armes', setup, ['berserker', 'veilleur', 'guerrier:armes'], lvl, 'decent', 2);
  run('Guerrier Fureur', setup, ['berserker', 'veilleur', 'guerrier:fureur'], lvl, 'decent', 2);
}
console.log('\n# Seul : Caves niveau 1 et Crypte niveau 6');
run('Berserker seul (référence), niv 1', { tranche: 1, mode: 'tranche' }, ['berserker'], 1, 'none');
run('Guerrier seul, niv 1', { tranche: 1, mode: 'tranche' }, ['guerrier:sans spé'], 1, 'none');
run('Berserker seul (référence), niv 6, Crypte', { tranche: 4, mode: 'tranche' }, ['berserker'], 6, 'decent');
for (const b of ['sans spé', 'protection', 'armes', 'fureur']) run(`Guerrier ${b} seul, niv 6, Crypte`, { tranche: 4, mode: 'tranche' }, [`guerrier:${b}`], 6, 'decent');
