// Simule des sessions de farm avec un robot : combien de vagues, d'XP et d'objets selon la classe, le niveau et l'équipement ?
// Sert à RÉGLER data/farm.json (vagues, récompenses). Les robots ne remplacent pas un vrai joueur, mais repèrent les murs.
// Usage : node tests/farm-sim.mjs [sessions_par_ligne] [filtre]
//   TUNE="..." n'agit pas ici : modifie data/farm.json (ou un exemplaire en mémoire) pour tester d'autres réglages.
import { loadContent } from './load-data.mjs';
import { makeParty, playFarm } from './bot.mjs';

const content = loadContent();
const N = Number(process.argv[2]) || 60;
const filter = process.argv[3] || '';
const zone = content.farm.zoneList[0];

function line(label, classId, level, gear, opts = {}) {
  if (filter && !label.includes(filter)) return;
  let waves = 0, xp = 0, items = 0, boss = 0, deaths = 0, actions = 0, rarePlus = 0;
  const hist = {};
  for (let i = 0; i < N; i++) {
    const [ch] = makeParty(content, [classId], level, gear, i + 1);
    const { state, actions: a } = playFarm(content, ch, 500 + i * 7919, undefined, opts);
    const r = state.result;
    waves += r.waves;
    xp += r.xp.earned;
    items += r.items.length;
    deaths += r.outcome === 'defeat' ? 1 : 0;
    actions += a;
    if (r.waves >= zone.waves.bossEvery) boss++;
    for (const it of r.items) if (content.rarityIndex[content.items[it.id].rarity] >= content.rarityIndex.rare) rarePlus++;
    const bucket = Math.min(r.waves, 15);
    hist[bucket] = (hist[bucket] || 0) + 1;
  }
  console.log(`${label.padEnd(46)} vagues ${(waves / N).toFixed(1).padStart(5)}  >=boss ${String(Math.round((100 * boss) / N)).padStart(3)}%  morts ${String(Math.round((100 * deaths) / N)).padStart(3)}%  XP ${(xp / N).toFixed(0).padStart(4)}  objets ${(items / N).toFixed(1).padStart(4)} (rare+ ${rarePlus})  actions ${(actions / N).toFixed(0).padStart(4)}`);
}

console.log(`--- ${N} sessions par ligne — zone "${zone.name}" ---`);
for (const classId of Object.keys(content.classes)) {
  line(`${classId} niv 1, sans équipement`, classId, 1, 'none');
  line(`${classId} niv 3, équipement correct`, classId, 3, 'ok');
}
for (const classId of Object.keys(content.classes)) line(`${classId} niv 4, équipement correct`, classId, 4, 'ok');
line('berserker niv 4, bon équipement', 'berserker', 4, 'good');
line('veilleur niv 8, bon équipement (sur-niveau)', 'veilleur', 8, 'good');
line('duelliste niv 8, bon équipement (sur-niveau)', 'duelliste', 8, 'good');
console.log('--- avec un joueur prudent (s\'arrête sous 60 % de PV) ---');
for (const classId of Object.keys(content.classes)) line(`${classId} niv 1, prudent`, classId, 1, 'none', { stopBelow: 0.6 });
