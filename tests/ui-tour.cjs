// Visite guidée de l'interface : fiches, fenêtres, scénarios forcés, version téléphone.
// Usage : node tests/ui-tour.cjs [url] [dossier_captures]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

// Profil de test injecté dans le localStorage (4 personnages bien différents).
const profile = {
  version: 1, nextCharNumber: 5, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1', 'c2', 'c4'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Thorne', classId: 'sacrieur', level: 8, xp: 300, skills: [],
      inventory: [{ uid: 'i1', id: 'potion_mineure' }, { uid: 'i2', id: 'lame_cryptique' }, { uid: 'i3', id: 'couronne_dechue' }, { uid: 'i4', id: 'sceau_veilleur' }],
      equipment: { weapon: { uid: 'e1', id: 'hallebarde_fer_noir' }, armor: { uid: 'e2', id: 'harnois_sombre' }, trinket: null }, stats: { runs: 9, wins: 6, deaths: 2 } },
    { id: 'c2', name: 'Maeve', classId: 'pretre', level: 5, xp: 40, skills: [],
      inventory: [{ uid: 'i5', id: 'potion_moyenne' }], equipment: { weapon: { uid: 'e3', id: 'baton_if' }, armor: null, trinket: { uid: 'e4', id: 'fiole_etoile' } }, stats: { runs: 4, wins: 3, deaths: 0 } },
    { id: 'c3', name: 'Kael', classId: 'assassin', level: 3, xp: 10, skills: [], inventory: [], equipment: { weapon: { uid: 'e5', id: 'croc_roi_rat' }, armor: null, trinket: null }, stats: { runs: 2, wins: 1, deaths: 1 } },
    { id: 'c4', name: 'Pip', classId: 'guerrier', level: 1, xp: 0, skills: [], inventory: [], equipment: { weapon: null, armor: null, trinket: null }, stats: { runs: 0, wins: 0, deaths: 0 } }
  ]
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript((p) => {
    if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p));
  }, profile);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const sleep = (ms) => page.waitForTimeout(ms);
  const shot = (name, full = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  // Accès direct à l'état de l'application et au moteur (mêmes modules que la page)
  const ev = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(url);
  await page.waitForSelector('.menu');
  await sleep(200);

  // ----- Accueil avec 4 personnages, tranche 8 choisie : danger pour le niveau 1
  await page.click('.char-card:has-text("Pip")');
  await page.click('.tranche-card:has-text("Profondeurs")');
  await shot('20-menu-danger', true);
  await page.click('.char-card:has-text("Pip")'); // on le retire
  await page.click('.tranche-card:has-text("Crypte")');

  // ----- Fiche de personnage
  await page.click('.char-card:has-text("Thorne") >> text=Fiche');
  await page.waitForSelector('.modal');
  await shot('21-fiche-equipement');
  await page.selectOption('.modal select', '4');
  await sleep(100);
  await shot('22-fiche-apercu-tranche4');
  await page.click('.modal .tab:has-text("Compétences")');
  await shot('23-fiche-competences');
  await page.keyboard.press('Escape');

  // ----- Fenêtres : nouveau personnage, sauvegarde, règles
  await page.click('.new-card');
  await shot('24-nouveau-perso');
  await page.keyboard.press('Escape');
  await page.click('text=Sauvegarde');
  await shot('25-sauvegarde');
  await page.keyboard.press('Escape');
  await page.click('.nav-place[data-place="grimoire"]');
  await page.click('.grimoire-tabs .tab[data-tab="regles"]');
  await page.waitForSelector('.grimoire-rules .help');
  await shot('26-regles');
  await page.click('.nav-place[data-place="aventure"]');
  await page.waitForSelector('.home-grid');

  // ----- Lancer la run (tranche 4, Thorne niv 8 / Maeve niv 5 / Kael niv 3 => niveaux effectifs)
  await page.click('.char-card:has-text("Kael")');
  await page.click('.char-card:has-text("Pip")');
  await page.click('.char-card:has-text("Pip")');
  await page.click('text=Lancer la run');
  await page.waitForSelector('.run');
  await shot('30-run-niveaux-effectifs');

  // ----- Scénario : trésor -> butin -> inventaire
  await ev(async () => {
    const { app } = await import('/src/ui/state.js');
    app.run.dungeon.board[0].type = 'treasure';
    app.run.dungeon.board[1].type = 'low_blow';
    app.run.dungeon.board[2].type = 'merchant';
    for (const t of app.run.dungeon.board) delete t.alt; // (pas de bifurcation dans ce scénario écrit à l'avance)
    app.run.gold = 120;
    app.render();
  });
  await page.click('.advance-card .btn-primary');
  // Un coffre : d'abord le choix (le forcer ou l'ouvrir prudemment)
  await page.waitForSelector('.choice-duo [data-option="force"]');
  await shot('30-coffre-choix');
  if (await page.$('.coach-tile .coach-next')) await page.click('.coach-tile .coach-next'); // (le conseil « première fois »)
  await page.click('.choice-duo [data-option="force"]');
  await page.waitForSelector('.roll-card');
  await shot('31-jet-coffre');
  await page.click('.roll-card .btn-primary');
  await sleep(350);
  await shot('32-de-anime');
  await page.click('.dice-overlay').catch(() => {});
  await sleep(500);
  if (await page.$('.loot-card')) {
    await shot('33-butin');
    await page.click('.loot-card .btn-primary');
    await sleep(300);
  }
  // (on attend que le coffre soit entièrement résolu : dé, butin, journal — sinon la fenêtre du sac peut s'ouvrir sur un écran qui se redessine)
  await page.waitForSelector('.advance-card .btn-primary', { timeout: 10000 });
  await page.click('.unit.player >> nth=0 >> button:has-text("Sac (")');
  await page.waitForSelector('.modal');
  await shot('34-inventaire-run');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' }).catch(() => {});
  await page.waitForSelector('.advance-card .btn-primary'); // (la fin du tour du butin peut prendre un instant)

  // ----- Scénario : coup bas
  await page.click('.advance-card .btn-primary');
  await page.waitForSelector('.choice-card');
  await shot('35-coup-bas');
  await page.click('.choice-card .blow-group >> nth=0 >> .btn-danger >> nth=0');
  await page.waitForSelector('.roll-card');
  await page.click('.roll-card .btn-primary');
  await sleep(400);
  await page.click('.dice-overlay').catch(() => {});
  await sleep(500);
  await page.waitForSelector('.advance-card .btn-primary', { timeout: 10000 }).catch(() => {});
  await shot('36-apres-coup-bas');

  // ----- Scénario : un fantôme + marchand
  await ev(async () => {
    const { app } = await import('/src/ui/state.js');
    const p = app.run.players[2];
    p.hp = 0; p.alive = false; p.ghost = true; p.statuses = [];
    app.run.players[0].hp = 20;
    app.run.players[0].statuses.push({ id: 'poison', pct: 0.06, turns: 3 });
    app.render();
  });
  await shot('37-fantome');
  await page.click('.advance-card .btn-primary').catch(() => {});
  await sleep(300);
  if (await page.$('.roll-card')) {
    await page.click('.roll-card .btn-primary');
    await sleep(400);
    await page.click('.dice-overlay').catch(() => {});
    await sleep(500);
  }
  if (await page.$('.shop-card')) await shot('38-marchand');

  // ----- Scénario : combat de boss avec statuts
  await ev(async () => {
    const { app } = await import('/src/ui/state.js');
    const { dispatch } = await import('/src/core/index.js');
    // On saute au boss
    app.run.dungeon.position = app.run.dungeon.board.length - 2;
    if (app.run.pending.kind === 'shop') dispatch(app.run, { type: 'SHOP_LEAVE' });
    app.render();
  });
  await sleep(200);
  if (await page.$('.advance-card')) {
    await page.click('.advance-card .btn-primary');
    await page.waitForSelector('.roll-card');
    await shot('39-jet-boss');
    await page.click('.roll-card .btn-primary');
    await sleep(400);
    await page.click('.dice-overlay').catch(() => {});
    await sleep(600);
    await shot('40-combat-boss', true);
    // Un tour complet à la souris : une compétence, une cible, puis fin du tour
    await page.waitForSelector('.action-card');
    const first = await page.$('.skill-btn:not([disabled])');
    await first.click();
    if (await page.$('.fighter.targetable')) {
      await shot('41-ciblage', true);
      await page.click('.fighter.targetable');
    }
    await sleep(500);
    await shot('42-apres-competence', true);
    await page.click('.end-turn');
    await sleep(600);
    await shot('43-tour-suivant', true);
  }

  // ----- Version téléphone
  const phone = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.addInitScript((p) => { if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); }, profile);
  const m = await phone.newPage();
  m.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await m.goto(url);
  await m.waitForSelector('.menu');
  await m.screenshot({ path: `${out}/50-mobile-menu.png`, fullPage: false });

  // La fiche (avec les couleurs de rareté) sur téléphone
  await m.click('.char-card:has-text("Thorne") >> text=Fiche');
  await m.waitForSelector('.modal .gear, .modal .bag-row');
  await m.screenshot({ path: `${out}/50b-mobile-fiche.png`, fullPage: false });
  const sheetOverflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('Téléphone : débordement horizontal de la fiche =', sheetOverflow, 'px');
  if (sheetOverflow > 0) errors.push('débordement horizontal de la fiche sur téléphone : ' + sheetOverflow + ' px');
  // Les couleurs de rareté sont-elles bien appliquées (et pas toutes grises) ?
  const colors = await m.$$eval('.modal .gear:not(.empty), .modal .bag-row', (els) => [...new Set(els.map((e) => getComputedStyle(e).getPropertyValue('--rar').trim()))]);
  console.log('Couleurs de rareté distinctes dans la fiche :', colors.length);
  if (colors.length < 2) errors.push('les couleurs de rareté ne sont pas appliquées : ' + colors.join(', '));
  await m.keyboard.press('Escape');
  await m.click('text=Lancer la run');
  await m.waitForSelector('.run');
  await m.click('.advance-card .btn-primary');
  await m.waitForSelector('.roll-card, .choice-card, .loot-card');
  await m.screenshot({ path: `${out}/51-mobile-run.png`, fullPage: true });

  // Le combat sur téléphone (via l'atelier de classes)
  await m.evaluate(async () => {
    const { app } = await import('/src/ui/state.js');
    const { startTraining } = await import('/src/ui/controller.js');
    startTraining([{ classId: 'pretre', level: 5 }, { classId: 'sacrieur', level: 5 }], { dummy: 'mannequin_agressif', count: 2, atkScale: 1 });
  });
  await m.waitForSelector('.stage');
  await m.screenshot({ path: `${out}/52-mobile-combat.png`, fullPage: true });
  const overflowX = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('Téléphone : débordement horizontal du combat =', overflowX, 'px');
  if (overflowX > 0) errors.push('débordement horizontal sur téléphone : ' + overflowX + ' px');

  console.log(errors.length ? 'ERREURS:\n' + errors.join('\n') : 'Visite terminée : aucune erreur JavaScript.');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
