// Test du Guerrier dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués, palier 8), puis combat
// (rage dans le bandeau, Exécution grisée tant qu'il en manque, choix de la posture en un clic, blessure profonde sur le monstre). Bureau et téléphone.
// Usage : node tests/ui-guerrier.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Brann', classId: 'guerrier', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Hilda', classId: 'guerrier', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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
    check(await page.$('.char-card:has-text("Brann") svg') !== null, 'le Guerrier a son portrait à l\'accueil');
    await page.click('.char-card:has-text("Brann") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(/Posture/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est la Posture');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'guerrier_frappe,guerrier_brise_genou,guerrier_execution,guerrier_cri', `deck de départ (${deck0.join(', ')})`);
    for (const [id, ult] of [['armes', 'Colosse'], ['fureur', 'Carnage'], ['protection', 'Dernier bastion']]) {
      check(new RegExp(ult).test(await page.$eval(`.spec-card[data-spec-id="${id}"]`, (e) => e.textContent)), `l'ultime de « ${id} » est annoncé (${ult})`);
    }
    await page.click('.spec-card[data-spec-id="protection"]');
    await sleep(350);
    check((await saved()).spec === 'protection', 'Protection est enregistrée');
    for (const id of ['guerrier_rempart_acier', 'guerrier_bloc', 'guerrier_coup_bouclier_prot', 'guerrier_defi']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'known', `${id} est débloquée automatiquement`);
    }
    check(await page.$eval('.spell-card[data-skill="guerrier_brise_genou"] .sc-name', (e) => e.textContent) === 'Heurt du bouclier', 'le Brise-genou devient le Heurt du bouclier');
    await page.click('.spec-card[data-spec-id="fureur"]');
    await sleep(350);
    check(await page.$eval('.spell-card[data-skill="guerrier_frappe"] .sc-name', (e) => e.textContent) === 'Sanguinaire', 'Fureur : la Frappe héroïque devient Sanguinaire');
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/guerrier-fiche-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : un choix parmi trois
    await page.click('.char-card:has-text("Hilda") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    await page.click('.spec-card[data-spec-id="armes"]');
    await sleep(350);
    for (const id of ['guerrier_brise_armure', 'guerrier_tempete_lames', 'guerrier_sang_froid']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'ready', `${id} : un des trois choix du niveau 8`);
    }
    await page.click('.talent-card[data-skill="guerrier_brise_armure"]');
    await sleep(300);
    check((await saved('c2')).skills.includes('guerrier_brise_armure'), 'Brise-armure est choisi');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : rage, posture, blessure profonde
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'guerrier', level: 6, spec: 'armes' }, { classId: 'veilleur', level: 6 }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    for (let i = 0; i < 4 && !/Guerrier/i.test(await page.$eval('.dock-name', (e) => e.textContent)); i++) {
      await page.click('.end-turn');
      await sleep(900);
    }
    check(/Guerrier/i.test(await page.$eval('.dock-name', (e) => e.textContent)), 'c\'est au tour du Guerrier');
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    const press = async (name) => {
      const sel = btn(name);
      if (!phone) await page.click(sel);
      else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); }
      await sleep(300);
    };
    const castOn = async (name, targetSel = '.fighter.monster.targetable') => { await press(name); if (await page.$(targetSel)) await tapOrClick(targetSel); await sleep(500); };
    const rage = () => page.$$eval('.dock .resource[data-res="rage"] .pip.on', (e) => e.length);
    const pa = () => page.$$eval('.flame.on', (e) => e.length);
    const disabled = (sel) => page.$eval(sel, (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('is-disabled'));

    check((await page.$$('.dock .resource[data-res="rage"] .pip')).length === 10, 'la rage est affichée dans le bandeau : 10 points');
    check((await rage()) === 0, 'à 0 au début du combat');
    check(await disabled(btn('Exécution d\'armes')), 'l\'Exécution (4 rage) est grisée tant qu\'il en manque');
    check(await page.$eval('.dock .mode-chip', (e) => /Posture de combat/.test(e.textContent)), 'le combat commence en posture de combat');
    await castOn('Frappe d\'armes');
    check((await rage()) === 2, 'la Frappe donne 2 rage');
    // La posture : un clic ouvre le choix
    const pa0 = await pa();
    await press('Posture');
    check(await page.$('.sd-modes') !== null, 'un clic sur la Posture ouvre le choix des postures');
    const ids = await page.$$eval('.sd-modes .mode-opt', (els) => els.map((e) => e.dataset.mode));
    check(ids.join() === 'combat,offensive,defensive', `trois postures proposées : ${ids.join(', ')}`);
    await page.screenshot({ path: `${out}/guerrier-posture-${phone ? 'phone' : 'desktop'}.png` });
    await tapOrClick('.sd-modes .mode-opt[data-mode="defensive"]');
    await sleep(500);
    check(await page.$eval('.dock .mode-chip', (e) => /Posture défensive/.test(e.textContent)), 'posture défensive choisie');
    check((await pa()) === pa0 - 1, 'le changement de posture coûte 1 PA');
    // La Frappe mortelle (3 rage) : blessure profonde sur le mannequin
    await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); const { redraw } = await import('/src/ui/controller.js'); app.run.players[0].resources.rage = 5; app.run.players[0].pa = 6; redraw(); });
    await sleep(300);
    await castOn('Frappe mortelle');
    const mon = '.fighter.monster';
    check(await page.$(`${mon} .fx-chip:has-text("Soins reçus")`) !== null, 'le mannequin porte la blessure profonde (« Soins reçus −50 % »)');
    await page.screenshot({ path: `${out}/guerrier-combat-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Guerrier : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
