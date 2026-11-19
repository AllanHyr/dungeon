// Équilibrage du Mage : chaque école dans le rôle du dps (Guerrier + Prêtre + dps), comparée à l'Assassin et au Skald ; puis seul.
// Usage : node tests/mage-sim.mjs [parties_par_ligne]
//   Les robots gagnent des charges avec les petits sorts et lâchent la Déflagration à 3 charges ou plus : un ordre de grandeur, pas un ressenti.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;

const B = {
  'mage:sans': { spec: null, deck: ['mage_trait_feu', 'mage_eclair_givre', 'mage_projectiles', 'mage_barriere'] },
  // `learn` : le choix du palier 8
  'mage:pyromancien': { spec: 'pyromancien', learn: ['mage_feu_interieur'], deck: ['mage_trait_feu', 'mage_embrasement', 'mage_boule_feu', 'mage_barriere'] },
  'mage:cryomancien': { spec: 'cryomancien', learn: ['mage_blizzard'], deck: ['mage_eclair_givre', 'mage_prison', 'mage_blizzard', 'mage_barriere'], deckLow: ['mage_eclair_givre', 'mage_prison', 'mage_nova', 'mage_barriere'] },
  'mage:arcaniste': { spec: 'arcaniste', learn: ['mage_puissance'], deck: ['mage_projectiles', 'mage_surcharge', 'mage_evocation', 'mage_meteore'], deckLow: ['mage_projectiles', 'mage_surcharge', 'mage_evocation', 'mage_barriere'] },
  'barde:skald': { spec: 'skald', learn: ['barde_rengaine'], deck: ['barde_note', 'barde_strophe', 'barde_crescendo', 'barde_cacophonie'] },
  'guerrier:protection': { spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  'pretre:sacre': { spec: 'sacre', learn: ['pretre_hymne'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'], deckLow: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'] },
  'assassin:executeur': { spec: 'executeur', learn: ['assassin_boucherie'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], deckLow: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] }
};

function run(label, setup, members, level, watch = 0) {
  let wins = 0, deaths = 0, dmg = 0;
  const builds = members.map((m) => B[m] || null);
  for (let i = 0; i < N; i++) {
    const extra = { specs: builds.map((b) => (level >= 4 ? b?.spec ?? null : null)), decks: builds.map((b) => (b && (level >= 4 || !b.spec) ? (level >= 8 ? b.deck : b.deckLow ?? b.deck) : null)), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
    const party = makeParty(content, members.map((m) => m.split(':')[0]), level, 'decent', i + 1, extra);
    const { state } = playRun(content, setup, party, 1000 + i * 7919);
    if (state.result.won) wins++;
    deaths += state.players.reduce((s, p) => s + p.stats.deaths, 0);
    dmg += state.players[watch].stats.damageDealt;
  }
  console.log(`${label.padEnd(30)} victoires ${(100 * wins / N).toFixed(0).padStart(3)}%  morts ${(deaths / N).toFixed(1)}  dégâts du dps ${String(Math.round(dmg / N)).padStart(5)}`);
}

console.log(`--- ${N} parties par ligne (équipement correct) ---`);
for (const [tr, lvl, name] of [[4, 6, 'Crypte (niv 6)'], [8, 8, 'Profondeurs (niv 8)']]) {
  const setup = { tranche: tr, mode: 'tranche' };
  console.log(`\n# Le dps — ${name} (Guerrier + Prêtre + dps)`);
  for (const d of ['assassin:executeur', 'barde:skald', 'mage:sans', 'mage:pyromancien', 'mage:cryomancien', 'mage:arcaniste']) run(d, setup, ['guerrier:protection', 'pretre:sacre', d], lvl, 2);
}
console.log('\n# Avant la spécialisation — Caves (niv 3) : Guerrier + Prêtre + dps');
for (const d of ['assassin:executeur', 'mage:sans']) run(d, { tranche: 1, mode: 'tranche' }, ['guerrier:protection', 'pretre:sacre', d], 3, 2);
console.log('\n# Seul : Caves niveau 1 et Crypte niveau 6');
run('mage sans spé, niv 1', { tranche: 1, mode: 'tranche' }, ['mage:sans'], 1);
for (const b of ['mage:pyromancien', 'mage:cryomancien', 'mage:arcaniste', 'assassin:executeur']) run(`${b} seul, niv 6`, { tranche: 4, mode: 'tranche' }, [b], 6);
