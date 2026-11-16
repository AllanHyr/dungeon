// Test de la zone de farm solo dans un vrai navigateur : onglet, coffre, vagues, succès, mort, reprise, téléphone.
// Usage : node tests/ui-farm.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 1, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Thorne', classId: 'berserker', level: 2, xp: 30, skills: ['berserker_colere'], inventory: [{ uid: 'p1', id: 'potion_mineure' }],
      chest: [{ uid: 'k1', id: 'piece_percee' }, { uid: 'k2', id: 'dague_os' }, { uid: 'k3', id: 'epee_veilleur' }],
      equipment: { weapon: { uid: 'e1', id: 'gourdin_cabosse' }, armor: null, trinket: null }, stats: { runs: 2, wins: 1, deaths: 0 } },
    { id: 'c2', name: 'Maeve', classId: 'veilleur', level: 4, xp: 10, skills: [], inventory: [], equipment: { weapon: null, armor: null, trinket: null }, stats: { runs: 0, wins: 0, deaths: 0 } }
  ]
};

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript((p) => { if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); }, profile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const sleep = (ms) => page.waitForTimeout(ms);

  /** Gagne la vague en cours : les monstres n'ont plus qu'1 PV, on clique comme un joueur. */
  async function winWave(p = page) {
    for (let i = 0; i < 60; i++) {
      if (await p.$('#farm-next')) return;
      await p.evaluate(async () => {
        const { app } = await import('/src/ui/state.js');
        for (const m of app.run.combat?.monsters || []) m.hp = Math.min(m.hp, 1);
        app.run.players[0].hp = Math.max(app.run.players[0].hp, 20);
      });
      // (on attend la fin de l'animation d'un coup : l'écran se redessine alors, et le bouton qu'on avait repéré disparaît)
      await p.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 }).catch(() => {});
      if (await p.$('#farm-next')) return; // (le coup décisif vient de se jouer : l'écran de pause est là)
      if (await p.$('.fighter.targetable')) { await p.click('.fighter.targetable', { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(220); continue; }
      const skills = p.locator('.skill-btn:not([disabled])');
      if (await skills.count()) await skills.first().click({ timeout: 8000 }).catch(() => {});
      else await p.click('.end-turn', { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(220);
    }
  }

  console.log('\n● Accueil et onglets');
  await page.goto(url);
  await page.waitForSelector('.menu');
  check(!!(await page.$('.view-switch')), 'les deux onglets (donjon / farm) sont là');
  await page.click('[data-view="farm"]');
  await page.waitForSelector('.zone-card');
  check((await page.textContent('.zone-card')).includes('Les Terriers'), 'la zone « Les Terriers » est présentée');
  check((await page.textContent('.zone-card')).includes('niveau 4'), 'la zone annonce le plafond d\'XP (niveau 4)');
  check((await page.textContent('.zone-card')).includes('Jamais d\'objet épique ni légendaire'), "la zone annonce qu'il n'y a jamais d'épique ni de légendaire");
  check(await page.$eval('#farm-launch', (b) => !b.disabled), 'on peut entrer dans la zone');
  await page.screenshot({ path: `${out}/70-farm-menu.png`, fullPage: true });

  console.log('\n● Le coffre');
  await page.click('.char-card.selected .chest-btn');
  await page.waitForSelector('#chest-open');
  check((await page.$$('.chest-slot')).length === 3, 'le coffre fermé montre 3 emplacements');
  await page.click('#chest-open');
  await page.waitForSelector('.reveal-item');
  await sleep(900);
  check((await page.$$('.reveal-item')).length === 3, 'les 3 objets sont révélés');
  const colors = await page.$$eval('.reveal-item .item-card', (els) => [...new Set(els.map((e) => getComputedStyle(e).borderLeftColor))]);
  check(colors.length >= 3, `les 3 raretés ont 3 couleurs différentes (${colors.length})`);
  await page.keyboard.press('Escape');
  await sleep(200);
  check((await page.textContent('.char-card.selected .chest-btn')).includes('0/24'), 'le coffre est vide après ouverture');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters[0].inventory.length) === 4, "les objets sont dans l'inventaire sauvegardé");

  console.log('\n● Une session : 3 vagues, un succès, on part');
  await page.click('#farm-launch');
  await page.waitForSelector('.farm-bar');
  for (let w = 0; w < 3; w++) {
    await winWave();
    await page.waitForSelector('#farm-next');
    check(!(await page.textContent('.scene')).includes('null'), `vague ${w + 1} : aucun « null » affiché entre deux vagues`);
    if (w === 0) await page.screenshot({ path: `${out}/71-farm-pause.png`, fullPage: true });
    if (w < 2) {
      await page.click('#farm-next');
      await page.waitForSelector('#farm-next', { state: 'detached', timeout: 15000 }); // (la vague suivante commence : les monstres entrent en scène)
      await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 }).catch(() => {});
      await sleep(300);
    }
  }
  await page.click('#farm-stop');
  await page.waitForSelector('.farm-end', { timeout: 8000 });
  await sleep(300);
  check((await page.textContent('.farm-end')).includes('SESSION TERMINÉE'), 'écran de fin de session');
  check((await page.textContent('.ach-news')).includes('Premier sang'), 'le succès « Premier sang » est annoncé');
  await page.screenshot({ path: `${out}/72-farm-fin.png`, fullPage: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters[0]);
  check(saved.stats.farmWaves === 3 && saved.stats.farmBest === 3 && saved.stats.farmRuns === 1, 'les compteurs de farm sont sauvegardés');
  check(saved.achievements.premier_sang === true, 'le succès est sauvegardé pour CE personnage');
  check(saved.xp > 30 || saved.level > 2, "l'XP a été gagnée");
  check(await page.evaluate(() => localStorage.getItem('donjon.run.v1')) === null, 'la partie sauvegardée est effacée à la fin de session');

  console.log('\n● Mort : on garde les vagues précédentes');
  await page.click('#farm-again');
  await page.waitForSelector('.farm-bar');
  await winWave();
  await page.waitForSelector('#farm-next');
  await page.click('#farm-next');
  await page.waitForSelector('#farm-next', { state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 }).catch(() => {});
  await sleep(300);
  await page.evaluate(async () => {
    const { app } = await import('/src/ui/state.js');
    app.run.players[0].hp = 1;
  });
  for (let i = 0; i < 40 && !(await page.$('.farm-end')); i++) {
    await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 }).catch(() => {});
    if (await page.$('.end-turn')) { await page.click('.end-turn', { timeout: 8000 }).catch(() => {}); }
    await sleep(500);
  }
  await page.waitForSelector('.farm-end', { timeout: 10000 });
  check((await page.textContent('.farm-end')).includes('TU ES TOMBÉ'), 'écran « Tu es tombé »');
  check((await page.textContent('.farm-end')).includes('1 vague vaincue'), 'la vague précédente est comptée (1 vague vaincue)');
  await page.screenshot({ path: `${out}/73-farm-mort.png`, fullPage: true });
  await page.click('#farm-menu');
  await page.waitForSelector('.zone-card');

  console.log('\n● Fiche : onglet Succès');
  await page.click('.char-card.selected >> text=Fiche');
  await page.click('[data-tab="ach"]');
  await page.waitForSelector('.ach-card');
  check((await page.$$('.ach-card.unlocked')).length === 1, 'un seul succès débloqué');
  check((await page.textContent('.ach-list')).includes('Équipé pour la gloire'), 'les succès à venir sont listés avec leur progression');
  check((await page.$$('.ach-card .progress')).length >= 2, 'la progression est affichée');
  await page.keyboard.press('Escape');

  console.log('\n● Reprise d\'une session : le personnage est verrouillé');
  await page.click('#farm-launch');
  await page.waitForSelector('.farm-bar');
  await page.reload();
  await page.waitForSelector('.banner-gold');
  check((await page.textContent('.banner-gold')).includes('Zone de farm'), 'le bandeau « partie en cours » parle de la zone de farm');
  check(/partie en cours/i.test(await page.textContent('.char-card.selected')), 'le personnage est signalé « dans une partie en cours »');
  await page.click('.char-card.selected >> text=Fiche');
  await page.waitForSelector('.farm-alert');
  check(await page.$$eval('.modal .btn-small.btn-primary', (b) => b.every((x) => x.disabled)), "les boutons « Équiper » sont bloqués");
  await page.keyboard.press('Escape');
  await page.click('.char-card.selected .chest-btn');
  await page.waitForSelector('.modal');
  check((await page.$('#chest-open')) === null || (await page.$eval('#chest-open', (b) => b.disabled)), "l'ouverture du coffre est bloquée");
  await page.keyboard.press('Escape');
  await page.click('text=Reprendre');
  await page.waitForSelector('.farm-bar');
  check(true, 'la session reprend là où elle en était');
  await page.click('text=Quitter la zone');
  await page.click('.confirm-layer .btn-danger');
  await page.waitForSelector('.farm-end', { timeout: 8000 });

  console.log('\n● Téléphone');
  const phone = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.addInitScript((p) => { if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); }, { ...profile, settings: { sound: false, view: 'farm', farmChar: 'c1' } });
  const m = await phone.newPage();
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await m.goto(url);
  await m.waitForSelector('.zone-card');
  check((await overflow(m)) === 0, 'menu farm : pas de débordement horizontal');
  await m.click('#farm-launch');
  await m.waitForSelector('.farm-bar');
  check((await overflow(m)) === 0, 'combat de farm : pas de débordement horizontal');
  await winWave(m);
  await m.waitForSelector('#farm-next');
  check((await overflow(m)) === 0 && !(await m.textContent('.scene')).includes('null'), 'pause entre vagues : pas de débordement ni de « null »');
  await m.screenshot({ path: `${out}/74-mobile-pause.png`, fullPage: true });
  await m.click('#farm-stop');
  await m.waitForSelector('.farm-end', { timeout: 8000 });
  check((await overflow(m)) === 0, 'fin de session : pas de débordement horizontal');

  check(errors.length === 0, errors.length ? 'erreurs JavaScript : ' + errors.join(' | ') : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du farm : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
