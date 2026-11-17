// Joue une run et affiche son journal : le plus simple pour voir si tout tourne.
// Usage : node tests/smoke.mjs [tranche] [classes séparées par des virgules] [graine]
import { loadContent } from './load-data.mjs';
import { makeParty, playRun } from './bot.mjs';

const content = loadContent();
const tranche = Number(process.argv[2]) || 1;
const classes = (process.argv[3] || 'sacrieur,pretre,assassin').split(',');
const seed = Number(process.argv[4]) || 12345;
console.log('Contenu OK :', Object.keys(content.items).length, 'objets,', Object.keys(content.skills).length, 'compétences,', Object.keys(content.monsters).length, 'monstres');
const party = makeParty(content, classes, tranche, 'none', 3);
const { state, actions } = playRun(content, { tranche, mode: 'tranche' }, party, seed);
console.log('Actions:', actions, 'issue:', state.result.outcome, 'tours:', state.turn);
console.log(state.log.slice(0, Number(process.env.LINES) || 70).map((l) => `[${l.kind}] ${l.text}`).join('\n'));
console.log(JSON.stringify(state.result.players.map((p) => ({ n: p.name, xp: p.xp.total, lvl: p.levelAfter, loot: p.loot.length }))));
