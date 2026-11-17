// Test du Druide dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués, palier 8), puis combat
// (choix de la forme en un clic, changement de rang, sorts grisés hors de leur forme avec la raison). Bureau et téléphone.
// Usage : node tests/ui-druide.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Sylve', classId: 'druide', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Orme', classId: 'druide', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
  ]
};

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  for (const [label, opts] of [
    ['Bureau', { viewport: { width: 1360, height: 900 }, locale: 'fr-FR' }],
    ['Téléphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' }]
  ]) {
    console.log(`\n● ${label}`);
    const phone = label === 'Téléphone';
    const ctx = await browser.newContext({ reducedMotion: 'reduce', ...opts });
    await ctx.addInitScript((p) => { if (!localStorage.getItem('donjon.profile.v1')) localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); }, profile);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
    const sleep = (ms) => page.waitForTimeout(ms);
    const saved = (id = 'c1') => page.evaluate((cid) => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters.find((c) => c.id === cid), id);
    const tapOrClick = (sel) => (phone ? page.tap(sel) : page.click(sel));

    // ---------- La fiche
    await page.goto(url);
    await page.waitForSelector('.menu');
    check(await page.$('.char-card:has-text("Sylve") svg') !== null, 'le Druide a son portrait à l\'accueil');
    await page.click('.char-card:has-text("Sylve") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(/Métamorphose/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est la Métamorphose');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'druide_epine_sauvage,druide_bourgeon,druide_coup_patte,druide_toucher', `deck de départ (${deck0.join(', ')})`);
    for (const [id, ult] of [['gardien', 'Colosse de la forêt'], ['restauration', 'Forêt éternelle'], ['farouche', 'Fureur sauvage']]) {
      check(new RegExp(ult).test(await page.$eval(`.spec-card[data-spec-id="${id}"]`, (e) => e.textContent)), `l'ultime de « ${id} » est annoncé (${ult})`);
    }
    await page.click('.spec-card[data-spec-id="farouche"]');
    await sleep(350);
    check((await saved()).spec === 'farouche', 'Farouche est enregistrée');
    for (const id of ['druide_predateur', 'druide_morsure_feroce', 'druide_griffure', 'druide_laceration_profonde']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'known', `${id} est débloquée automatiquement`);
    }
    check(await page.$eval('.spell-card[data-skill="druide_coup_patte"] .sc-name', (e) => e.textContent) === 'Griffure', 'le Coup de patte devient la Griffure');
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/druide-fiche-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : un choix parmi trois
    await page.click('.char-card:has-text("Orme") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    await page.click('.spec-card[data-spec-id="restauration"]');
    await sleep(350);
    for (const id of ['druide_tranquillite', 'druide_renaissance', 'druide_abondance']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'ready', `${id} : un des trois choix du niveau 8`);
    }
    await page.click('.talent-card[data-skill="druide_abondance"]');
    await sleep(300);
    check((await saved('c2')).skills.includes('druide_abondance'), 'Abondance est choisie');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : les formes
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'druide', level: 6, spec: 'gardien' }, { classId: 'pretre', level: 6 }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    for (let i = 0; i < 4 && !/Druide/i.test(await page.$eval('.dock-name', (e) => e.textContent)); i++) {
      await page.click('.end-turn');
      await sleep(900);
    }
    check(/Druide/i.test(await page.$eval('.dock-name', (e) => e.textContent)), 'c\'est au tour du Druide');
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    const disabled = (sel) => page.$eval(sel, (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('is-disabled'));
    const press = async (name) => {
      const sel = btn(name);
      if (!phone) await page.click(sel);
      else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); }
      await sleep(300);
    };
    const row = () => page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return app.run.players[0].row; });

    check(await page.$eval('.dock .mode-chip', (e) => /Forme naturelle/.test(e.textContent)), 'le combat commence en forme naturelle');
    check(await disabled(btn('Patte du gardien')), 'la Patte du gardien (ours ou félin) est grisée en forme naturelle');
    if (!phone) {
      await page.hover('.hb-deck .slot:has(' + btn('Patte du gardien') + ')');
      await sleep(250);
      const why = await page.$eval('.skill-detail', (e) => e.textContent);
      check(/Forme d'ours ou Forme de félin requise/.test(why), `le détail dit pourquoi (« ${why.slice(0, 120)} »)`);
      await page.mouse.move(5, 5);
      await sleep(150);
    }
    check((await row()) === 'back', 'il commence au rang arrière');
    await press('Métamorphose');
    check(await page.$('.sd-modes') !== null, 'un clic sur la Métamorphose ouvre le choix des formes');
    check(/choisis une forme/i.test(await page.$eval('.sd-modes-head', (e) => e.textContent)), 'le panneau parle de « forme »');
    const ids = await page.$$eval('.sd-modes .mode-opt', (els) => els.map((e) => e.dataset.mode));
    check(ids.join() === 'naturelle,ours,arbre,felin', `quatre formes proposées : ${ids.join(', ')}`);
    await page.screenshot({ path: `${out}/druide-formes-${phone ? 'phone' : 'desktop'}.png` });
    await tapOrClick('.sd-modes .mode-opt[data-mode="ours"]');
    await sleep(600);
    check(await page.$eval('.dock .mode-chip', (e) => /Forme d'ours/.test(e.textContent)), 'forme d\'ours choisie');
    check((await row()) === 'front', 'en ours, il passe au rang avant');
    check(!(await disabled(btn('Patte du gardien'))), 'la Patte du gardien est disponible en ours');
    check(await disabled(btn('Toucher guérisseur')), 'le Toucher guérisseur ne se lance pas en ours');
    await page.screenshot({ path: `${out}/druide-combat-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Druide : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
