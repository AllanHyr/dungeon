// Test des ILLUSTRATIONS dans un vrai navigateur (Chromium via Playwright) :
// portraits des héros et des monstres, décors du champ de bataille, vignettes des cases, galerie, et remplacement par de vraies images.
// Usage : node tests/ui-art.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

const profile = {
  version: 1, nextCharNumber: 5, settings: { sound: false, place: 'aventure', fx: 'min' }, lastTeam: ['c1', 'c2', 'c3', 'c4'], lastSetup: { tranche: 1, mode: 'tranche', stasisLevel: 1 },
  characters: ['sacrieur', 'pretre', 'guerrier', 'assassin'].map((classId, i) => ({
    id: `c${i + 1}`, name: ['Thorne', 'Maeve', 'Sylve', 'Gundar'][i], classId, level: 4, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 }
  }))
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce', locale: 'fr-FR' });
  await ctx.addInitScript((p) => { if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); }, profile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('\n● La galerie des illustrations');
  await page.goto(url + 'tools/galerie.html');
  await page.waitForSelector('.portrait');
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => ({
    heroes: document.querySelectorAll('h2')[0]?.nextElementSibling?.querySelectorAll('.item').length,
    monsters: document.querySelectorAll('h2')[1]?.nextElementSibling?.querySelectorAll('.item').length,
    scenes: document.querySelectorAll('.scene').length,
    vignettes: document.querySelectorAll('.vig svg').length,
    svg: document.querySelectorAll('.portrait svg').length
  }));
  check(g.heroes === 12, `12 portraits de classes, anciennes comprises (${g.heroes})`);
  check(g.monsters >= 20, `${g.monsters} portraits de monstres`);
  check(g.scenes === 5, `5 décors (${g.scenes})`);
  check(g.vignettes === 9, `9 vignettes de cases, feu de camp compris (${g.vignettes})`);
  await page.screenshot({ path: `${out}/90-galerie.png`, fullPage: true });

  console.log('\n● Les héros à l\'accueil');
  await page.goto(url);
  await page.waitForSelector('.menu');
  const menu = await page.evaluate(() => ({
    cards: document.querySelectorAll('.char-card').length,
    withArt: document.querySelectorAll('.char-card .portrait.has-art svg').length,
    leaked: document.querySelectorAll('.char-card .portrait:not(.has-art)').length
  }));
  check(menu.withArt === 4, `les 4 héros ont leur illustration (${menu.withArt} médaillons illustrés)`);
  check(menu.leaked === 0, "aucun médaillon n'est resté une simple icône");
  const distinct = await page.evaluate(() => new Set([...document.querySelectorAll('.char-card .portrait svg')].map((s) => s.innerHTML.replace(/a[0-9a-z]+(bg|halo|vg|[a-zA-Z]+)/g, '#').length)).size);
  check(distinct === 4, 'les 4 portraits sont différents');
  await page.screenshot({ path: `${out}/91-accueil-art.png` });

  console.log('\n● Le champ de bataille');
  await page.evaluate(async () => {
    const { startTraining } = await import('/src/ui/controller.js');
    startTraining([{ classId: 'sacrieur', level: 5 }, { classId: 'pretre', level: 5 }, { classId: 'guerrier', level: 5 }, { classId: 'assassin', level: 5 }], { dummy: 'mannequin_agressif', count: 2, atkScale: 1 });
  });
  await page.waitForSelector('.stage');
  const stage = await page.evaluate(() => {
    const st = document.querySelector('.stage');
    return {
      scene: st.style.getPropertyValue('--scene').slice(0, 24),
      fighters: document.querySelectorAll('.fighter').length,
      art: document.querySelectorAll('.fighter .portrait.has-art svg').length,
      friseArt: document.querySelectorAll('.tl-chip .portrait svg').length
    };
  });
  check(stage.scene.startsWith('url("data:image/svg'), 'le décor de la salle d\'entraînement est posé derrière les combattants');
  check(stage.art === stage.fighters && stage.fighters >= 6, `tous les combattants sont illustrés (${stage.art}/${stage.fighters})`);
  check(stage.friseArt >= 6, `la frise d'initiative aussi (${stage.friseArt})`);
  const ghostly = await page.evaluate(() => getComputedStyle(document.querySelector('.fighter .portrait')).overflow);
  check(ghostly === 'hidden', "l'illustration est rognée en rond (le cadre en laiton reste net)");
  await page.screenshot({ path: `${out}/92-combat-art.png` });

  // Les décors suivent la profondeur
  for (const [tranche, attendu] of [[1, 'caves'], [4, 'crypt'], [8, 'depths']]) {
    const ok = await page.evaluate(async ({ tranche, attendu }) => {
      const { app } = await import('/src/ui/state.js');
      const { redraw } = await import('/src/ui/controller.js');
      const { sceneIdFor } = await import('/src/ui/art.js');
      app.run.training = false;
      app.run.setup.tranche = tranche;
      redraw();
      return sceneIdFor(app.run, app.content) === attendu && document.querySelector('.stage').style.getPropertyValue('--scene').length > 100;
    }, { tranche, attendu });
    check(ok, `tranche ${tranche} : décor « ${attendu} »`);
  }

  console.log('\n● Une vraie image à la place du dessin');
  const svgDot = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c0392b"/></svg>');
  const swapped = await page.evaluate(async (src) => {
    const { app } = await import('/src/ui/state.js');
    const { redraw } = await import('/src/ui/controller.js');
    app.content.classes.sacrieur.art = src;
    app.content.monsters.mannequin_agressif.art = src;
    redraw();
    return { heroImg: document.querySelectorAll('.fighter.player img.art-img').length, monsterImg: document.querySelectorAll('.fighter.monster img.art-img').length };
  }, svgDot);
  check(swapped.heroImg === 1, 'la classe qui déclare `art` montre son image');
  check(swapped.monsterImg === 2, 'les monstres qui déclarent `art` montrent leur image');

  console.log('\n● Une case de donjon illustrée');
  await page.evaluate(async () => {
    const { app } = await import('/src/ui/state.js');
    const { startRun } = await import('/src/ui/controller.js');
    delete app.content.classes.sacrieur.art; delete app.content.monsters.mannequin_agressif.art;
    await startRun({ tranche: 1, mode: 'tranche', stasisLevel: 1 }, ['c1', 'c2', 'c3']);
  });
  await page.waitForSelector('.advance-card');
  const banner = await page.evaluate(() => getComputedStyle(document.querySelector('.advance-art')).backgroundImage.includes('data:image/svg'));
  check(banner, "l'écran « Avancer » montre le couloir de la tranche");
  await page.evaluate(async () => {
    const { app } = await import('/src/ui/state.js');
    const b = app.run.dungeon.board[app.run.dungeon.position + 1];
    b.type = 'treasure';
    b.flavor = 0;
  });
  await page.click('.advance-card .btn-primary');
  await page.waitForSelector('.tile-card');
  const tile = await page.evaluate(() => ({ svg: !!document.querySelector('.tile-card.has-art .tile-art svg'), h: document.querySelector('.tile-art')?.getBoundingClientRect().height }));
  check(tile.svg && tile.h > 90, `la case « Trésor » a sa vignette (${Math.round(tile.h)} px de haut)`);
  await page.screenshot({ path: `${out}/93-case-art.png` });

  console.log('\n● Téléphone');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const ph = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, tileH: document.querySelector('.tile-art')?.getBoundingClientRect().height }));
  check(ph.overflow <= 0, `pas de débordement horizontal (${ph.overflow}px)`);
  check(ph.tileH > 60 && ph.tileH < 200, `la vignette reste raisonnable (${Math.round(ph.tileH)} px)`);
  await page.screenshot({ path: `${out}/94-case-art-telephone.png` });

  check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  if (failures.length) {
    console.log(`\n❌ ${failures.length} vérification(s) en échec`);
    process.exit(1);
  }
  console.log('\n✅ Test des illustrations : tout est bon');
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
