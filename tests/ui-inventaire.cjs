// Test du sac d'une partie en cours (poupée d'équipement + dons), dans un vrai navigateur.
// Usage : node tests/ui-inventaire.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 4, settings: { sound: false }, lastTeam: ['c1', 'c2'], lastSetup: { tranche: 4, mode: 'basic', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Thorne', classId: 'sacrieur', level: 8, xp: 0, skills: [],
      inventory: [{ uid: 'i1', id: 'couronne_dechue' }, { uid: 'i2', id: 'sceau_veilleur' }, { uid: 'i3', id: 'anneau_sang' }, { uid: 'i4', id: 'anneau_rubis' }, { uid: 'i5', id: 'potion_mineure' }, { uid: 'i6', id: 'dague_os' }],
      equipment: { weapon: { uid: 'e1', id: 'hallebarde_fer_noir' } }, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Maeve', classId: 'pretre', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
  ]
};

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [label, opts] of [
    ['Bureau', { viewport: { width: 1360, height: 900 } }],
    ['Téléphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]
  ]) {
    console.log(`\n● ${label}`);
    const phone = label === 'Téléphone';
    const ctx = await browser.newContext({ reducedMotion: 'reduce', ...opts });
    await ctx.addInitScript((p) => { if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); }, profile);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
    const sleep = (ms) => page.waitForTimeout(ms);
    const player = (fn) => page.evaluate(async (src) => { const { app } = await import('/src/ui/state.js'); return new Function('app', `return (${src})(app)`)(app); }, fn.toString());

    await page.goto(url);
    await page.waitForSelector('.menu');
    await page.click('text=Lancer la run');
    await page.waitForSelector('.run');
    await page.click('.unit.player >> nth=0 >> button:has-text("Sac (")');
    await page.waitForSelector('.modal .equip-layout');
    await sleep(200);

    check((await page.$$('.modal .dslot')).length === 14, 'le sac de la partie montre la poupée de 14 emplacements');
    check(await page.$('.modal .dslot[data-slot="offHand"].blocked') !== null, 'la hallebarde (deux mains) bloque la main gauche');
    check((await page.$$('.modal .bag-row')).length === 6, 'le sac a ses 6 objets, rangés en sections');

    // Équiper la couronne (tête libre) : le moteur de la partie est appelé
    await page.click('.modal .bag-row[data-item="couronne_dechue"] .bag-act .btn');
    await sleep(250);
    check(await page.$('.modal .dslot[data-slot="head"].filled') !== null, 'la tête est équipée');
    check(await player((app) => !!app.run.players[0].equipment.head), 'et la partie (le moteur) le sait');

    // Deux anneaux : le premier libre, puis le second
    await page.click('.modal .bag-row[data-item="sceau_veilleur"] .bag-act .btn');
    await sleep(200);
    await page.click('.modal .bag-row[data-item="anneau_sang"] .bag-act .btn');
    await sleep(200);
    check(await player((app) => `${app.run.players[0].equipment.ring1?.id}+${app.run.players[0].equipment.ring2?.id}`) === 'sceau_veilleur+anneau_sang', 'les deux anneaux vont dans les deux emplacements');

    // Un troisième anneau : on choisit celui à remplacer en cliquant d'abord sur l'emplacement
    await page.click('.modal .dslot[data-slot="ring2"]');
    await sleep(150);
    check((await page.$$('.modal .bag-row')).length === 1, "choisir l'anneau 2 ne montre que les anneaux du sac");
    await page.click('.modal .bag-row[data-item="anneau_rubis"] .bag-act .btn');
    await sleep(250);
    check(await player((app) => `${app.run.players[0].equipment.ring1?.id}+${app.run.players[0].equipment.ring2?.id}`) === 'sceau_veilleur+anneau_rubis', "l'anneau 2 est remplacé, l'anneau 1 reste");
    check(await player((app) => app.run.players[0].bag.some((i) => i.id === 'anneau_sang')), "l'anneau remplacé est revenu dans le sac");
    await page.screenshot({ path: `${out}/90-sac-partie-${phone ? 'tel' : 'bureau'}.png` });

    // Équiper une arme à une main chasse l'arme à deux mains
    await page.click('.modal .sec-head .chip-btn.on').catch(() => {});
    await sleep(150);
    await page.click('.modal .bag-row[data-item="dague_os"] .bag-act .btn');
    await sleep(250);
    check(await player((app) => `${app.run.players[0].equipment.mainHand?.id}|${app.run.players[0].equipment.offHand?.id ?? ''}`) === 'dague_os|', 'la dague remplace la hallebarde en main droite');
    check(await player((app) => app.run.players[0].bag.some((i) => i.id === 'hallebarde_fer_noir')), 'la hallebarde est dans le sac');

    // Don à un équipier
    await page.selectOption('.modal .bag-row[data-item="anneau_sang"] .bag-actions select >> nth=0', 'p2').catch(() => {});
    await page.click('.modal .bag-row[data-item="anneau_sang"] .bag-actions .btn');
    await sleep(250);
    check(await player((app) => app.run.players[1].bag.some((i) => i.id === 'anneau_sang')), "l'anneau a été offert à Maeve");

    // Retirer depuis la poupée
    await page.click('.modal .dslot[data-slot="head"]');
    await sleep(120);
    await page.click('.modal .slot-detail .gear-remove');
    await sleep(250);
    check(await player((app) => !app.run.players[0].equipment.head), 'retirer vide la tête dans la partie');

    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, 'aucun débordement horizontal');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} problème(s)` : '\n✅ Test du sac de partie : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
