// Cherche une partie "bloquée" (trop d'actions) et affiche ce qui s'y passe.
// Usage : node tests/find-stuck.mjs      (ou avec TUNE="1:1.15:1.08", voir load-data.mjs)
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const CLASSES = Object.keys(content.classes);
const configs = [];
for (const tranche of [1, 4, 8]) {
  for (const classes of [[...CLASSES], ['berserker'], ['druide'], ['veilleur'], ['veilleur', 'druide'], ['duelliste', 'berserker']]) {
    for (const mode of [{ mode: 'tranche' }, { mode: 'stasis', stasisLevel: 1 }, { mode: 'stasis', stasisLevel: 3 }]) configs.push({ tranche, classes, mode });
  }
}
let games = 0;
for (const cfg of configs) {
  for (let i = 0; i < 40; i++) {
    const party = makeParty(content, cfg.classes, cfg.tranche, 'none', i + 1);
    try {
      playRun(content, { tranche: cfg.tranche, ...cfg.mode }, party, 1000 + i * 7919);
      games++;
    } catch (e) {
      if (!e.state) throw e;
      const s = e.state;
      console.log(`BLOQUÉ : tranche ${cfg.tranche}, ${cfg.classes}, ${cfg.mode.mode}${cfg.mode.stasisLevel || ''} (partie ${i})`);
      console.log('phase:', s.phase, 'pending:', JSON.stringify(s.pending).slice(0, 200));
      console.log('tour:', s.turn, 'round:', s.combat?.round, 'monstres:', s.combat?.monsters.map((m) => `${m.name} ${m.hp}/${m.hpMax}`).join(', '));
      console.log('joueurs:', s.players.map((p) => `${p.name} ${p.hp}${p.alive ? '' : ' (mort)'}`).join(', '));
      console.log(s.log.slice(-14).map((l) => '  ' + l.text).join('\n'));
      process.exit(1);
    }
  }
}
console.log(`Aucune partie bloquée (${games} parties jouées).`);
