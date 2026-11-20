// L'ÉCONOMIE du jeu, mesurée par des robots : que rapporte chaque activité (donjon, farm, expédition), et en combien de temps ?
// Usage : node tests/economie-sim.mjs [parties_par_ligne]
//
// Le TEMPS de jeu est estimé à partir du nombre d'actions du robot (un clic de joueur = une action) : SEC_PAR_ACTION secondes par action
// (choisir un sort, une cible, avancer, lancer le dé, avec les animations). C'est un ordre de grandeur, à recaler avec un vrai joueur.
// Les objets sont comptés en « valeur d'éclats » (ce qu'ils rapportent démantelés, rules.json > forge.salvage) pour comparer les activités.
import { loadContent } from './load-data.mjs';
import { makeParty, playRun, playFarm } from './bot.mjs';
import { xpForNext } from '../src/core/index.js';

const content = loadContent();
const N = Number(process.argv[2]) || 30;
const SEC_PAR_ACTION = Number(process.env.SEC) || 3.5;
const salvage = content.rules.forge.salvage;
const rarityOf = (id) => content.items[id]?.rarity || 'common';
const rareIdx = content.rarityIndex.rare;
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const minutes = (actions) => (actions * SEC_PAR_ACTION) / 60;

// XP totale pour monter du niveau 1 au niveau max
let total = 0, lvl = 1;
for (; xpForNext(content, lvl); lvl++) total += xpForNext(content, lvl);
console.log(`Niveau max : ${lvl} — XP totale du niveau 1 au niveau ${lvl} : ${total}. Temps estimé par action : ${SEC_PAR_ACTION} s.\n`);

// Des héros « construits » comme un joueur le ferait : spécialisation au niveau 4, deck adapté, talent au niveau 8 (comme donjons-sim.mjs)
const B = {
  guerrier: { spec: 'protection', learn: ['guerrier_mur_boucliers'], deck: ['guerrier_frappe', 'guerrier_bloc', 'guerrier_provocation', 'guerrier_execution'] },
  pretre: { spec: 'sacre', learn: ['pretre_hymne'], deck: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_hymne'], low: ['pretre_chatiment', 'pretre_soin', 'pretre_soin_superieur', 'pretre_bouclier'] },
  assassin: { spec: 'executeur', learn: ['assassin_boucherie'], deck: ['assassin_boucherie', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'], low: ['assassin_garrot', 'assassin_estoc', 'assassin_dos', 'assassin_coup_de_grace'] }
};
function party(classes, level, seed, gear = 'decent') {
  const builds = classes.map((c) => (level >= 4 ? B[c] : null));
  const extra = { specs: builds.map((b) => b?.spec ?? null), decks: builds.map((b) => (b ? (level >= 8 ? b.deck : b.low ?? b.deck) : null)), learns: builds.map((b) => (level >= 8 ? b?.learn : null) ?? []) };
  return makeParty(content, classes, level, gear, seed, extra);
}

// ------------------------------------------------------------ Donjons
console.log('=== DONJONS (par héros, moyenne sur toutes les parties, défaites comprises) ===');
console.log('donjon'.padEnd(30) + 'équipe'.padEnd(10) + 'victoire'.padStart(9) + 'durée'.padStart(8) + 'XP/héros'.padStart(10) + 'XP/min'.padStart(8) + 'objets'.padStart(8) + 'rares+'.padStart(8) + 'éclats-éq./min (joueur)'.padStart(25));
const dungeonRows = [];
for (const d of content.dungeonList.filter((x) => x.available !== false)) {
  for (const [label, classes] of [['trio', ['guerrier', 'pretre', 'assassin']], ['solo', ['guerrier']]]) {
    let wins = 0, actions = 0, xp = 0, items = 0, rare = 0, value = 0, heroes = 0;
    for (let i = 0; i < N; i++) {
      const team = party(classes, d.tranche, i + 1);
      const { state, actions: a } = playRun(content, { tranche: d.tranche, dungeon: d.id, mode: 'tranche' }, team, 3000 + i * 7919);
      actions += a;
      if (state.result.won) wins++;
      for (const p of state.result.players) {
        heroes++;
        xp += p.xp?.total || 0;
        for (const it of p.loot || []) { items++; const r = rarityOf(it.id); value += salvage[r] || 1; if (content.rarityIndex[r] >= rareIdx) rare++; }
      }
    }
    const per = heroes || 1, mins = minutes(actions / N);
    const row = { d, label, win: (100 * wins) / N, mins, xp: xp / per, xpMin: xp / per / mins, items: items / per, rare: rare / per, valMin: value / N / mins };
    dungeonRows.push(row);
    console.log(`${(d.tranche + ' ' + d.name).slice(0, 29).padEnd(30)}${label.padEnd(10)}${(fmt(row.win, 0) + ' %').padStart(9)}${(fmt(mins) + ' mn').padStart(8)}${fmt(row.xp, 0).padStart(10)}${fmt(row.xpMin).padStart(8)}${fmt(row.items).padStart(8)}${fmt(row.rare, 2).padStart(8)}${fmt(row.valMin, 2).padStart(25)}`);
  }
}

// ------------------------------------------------------------ Farm
console.log('\n=== ZONES DE FARM (un héros du niveau de la zone, XP de rattrapage jusqu\'au niveau 8) ===');
console.log('zone'.padEnd(30) + 'classe'.padEnd(10) + 'vagues'.padStart(8) + 'durée'.padStart(8) + 'XP'.padStart(8) + 'XP/min'.padStart(8) + 'éclats'.padStart(8) + 'rares+'.padStart(8) + 'éclats-éq./min'.padStart(16));
for (const z of content.farm.zoneList) {
  for (const classId of ['guerrier', 'pretre', 'mage']) {
    let actions = 0, xp = 0, shards = 0, waves = 0, rare = 0, value = 0;
    for (let i = 0; i < N; i++) {
      const [ch] = makeParty(content, [classId], Math.max(1, z.minLevel || 1), 'decent', i + 1);
      const { state, actions: a } = playFarm(content, ch, 500 + i * 7919, undefined, { xpCap: 8, zoneId: z.id });
      const r = state.result;
      actions += a; xp += r.xp.earned; shards += r.shards; waves += r.waves;
      // la récompense au choix : on suppose que le joueur prend le meilleur objet proposé
      const best = (r.choices || []).map((it) => rarityOf(it.id)).sort((a2, b2) => content.rarityIndex[b2] - content.rarityIndex[a2])[0];
      if (best) { value += salvage[best] || 1; if (content.rarityIndex[best] >= rareIdx) rare++; }
    }
    const mins = minutes(actions / N);
    console.log(`${z.name.slice(0, 29).padEnd(30)}${classId.padEnd(10)}${fmt(waves / N).padStart(8)}${(fmt(mins) + ' mn').padStart(8)}${fmt(xp / N, 0).padStart(8)}${fmt(xp / N / mins).padStart(8)}${fmt(shards / N).padStart(8)}${fmt(rare / N, 2).padStart(8)}${fmt((shards / N + value / N) / mins, 2).padStart(16)}`);
  }
}

// ------------------------------------------------------------ Expéditions
console.log('\n=== EXPÉDITIONS (par héros envoyé ; XP = rattrapage seulement ; aucun temps de jeu, juste 2 clics) ===');
console.log('expédition'.padEnd(30) + 'durée'.padStart(8) + 'XP (niv 4)'.padStart(12) + 'éclats'.padStart(8) + 'objet'.padStart(8) + 'rares+'.padStart(8) + 'XP niv 4/heure réelle'.padStart(24));
for (const e of content.farm.expeditions?.list || content.expeditions?.list || []) {
  const r = e.rewards, w = r.rarityWeights || {}, sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const rareP = Object.entries(w).filter(([k]) => content.rarityIndex[k] >= rareIdx).reduce((a, [, v]) => a + v, 0) / sum;
  const xp4 = r.xpFraction * xpForNext(content, 4);
  console.log(`${e.name.slice(0, 29).padEnd(30)}${(e.minutes + ' mn').padStart(8)}${fmt(xp4, 0).padStart(12)}${fmt((r.shards[0] + r.shards[1]) / 2).padStart(8)}${(fmt(r.itemChance * 100, 0) + ' %').padStart(8)}${fmt(r.itemChance * rareP, 2).padStart(8)}${fmt((xp4 * 60) / e.minutes, 0).padStart(24)}`);
}

// ------------------------------------------------------------ Combien de parties pour monter ?
console.log('\n=== COMBIEN DE DONJONS (TRIO) POUR MONTER D\'UN NIVEAU ? ===');
for (const row of dungeonRows.filter((r) => r.label === 'trio')) {
  const lv = row.d.tranche, need = xpForNext(content, lv);
  console.log(`${(row.d.tranche + ' ' + row.d.name).slice(0, 29).padEnd(30)} niveau ${lv} → ${lv + 1} : ${need ? `${need} XP, soit ${fmt(need / Math.max(1, row.xp))} parties (${fmt((need / Math.max(1, row.xp)) * row.mins, 0)} mn)` : 'niveau max'}`);
}

// ------------------------------------------------------------ Le Stasis joué seul (fin de partie solo : jusqu'à l'épique)
console.log('\n=== STASIS JOUÉ SEUL (tranche 8, héros niveau 8, BON équipement : rare/épique) : victoire et objets épiques par partie ===');
for (const d of content.dungeonList.filter((x) => x.tranche === 8 && x.available !== false)) {
  for (const lvl of [1, 2, 3]) {
    const cells = [];
    for (const [label, classes] of [['trio', ['guerrier', 'pretre', 'assassin']], ['solo', ['guerrier']]]) {
      let wins = 0, epics = 0, legend = 0, actions = 0;
      for (let i = 0; i < N; i++) {
        const { state, actions: a } = playRun(content, { tranche: 8, dungeon: d.id, mode: 'stasis', stasisLevel: lvl, players: 1 }, party(classes, 8, i + 1, 'good'), 9000 + i * 7919);
        actions += a;
        if (state.result.won) wins++;
        for (const p of state.result.players) for (const it of p.loot || []) { const r = rarityOf(it.id); if (r === 'epic') epics++; if (r === 'legendary') legend++; }
      }
      cells.push(`${label} ${String(Math.round((100 * wins) / N)).padStart(3)} % · ${fmt(epics / N, 2)} épique · ${fmt(minutes(actions / N))} mn${legend ? ` · ${legend} LÉGENDAIRE(S) !` : ''}`);
    }
    console.log(`${d.name.slice(0, 26).padEnd(27)} Stasis ${lvl}   ${cells.join('   |   ')}`);
  }
}
