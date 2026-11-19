// Test du Prêtre dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués, palier 8), puis combat
// (forme de lumière puis d'ombre, gratuite la 1re fois puis relance, Expiation visible sur l'allié). Bureau et téléphone.
// Usage : node tests/ui-pretre.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Ombrelune', classId: 'pretre', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Aube', classId: 'pretre', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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

    // ---------- La fiche
    await page.goto(url);
    await page.waitForSelector('.menu');
    check(await page.$('.char-card:has-text("Ombrelune") svg') !== null, 'le Prêtre a son portrait à l\'accueil');
    await page.click('.char-card:has-text("Ombrelune") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(/Forme d'ombre/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est la Forme d\'ombre');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'pretre_chatiment,pretre_soin,pretre_douleur,pretre_bouclier', `deck de départ (${deck0.join(', ')})`);
    check((await page.$$('.spec-card')).length === 3, 'trois spécialisations : Sacré, Discipline, Ombre');
    for (const [id, ult] of [['sacre', 'Salut'], ['discipline', 'Rayonnement absolu'], ['ombre', 'Forme du Vide']]) {
      check(new RegExp(ult).test(await page.$eval(`.spec-card[data-spec-id="${id}"]`, (e) => e.textContent)), `l'ultime de « ${id} » est annoncé (${ult})`);
    }
    await page.click('.spec-card[data-spec-id="discipline"]');
    await sleep(350);
    check((await saved()).spec === 'discipline', 'Discipline est enregistrée');
    for (const id of ['pretre_expiation', 'pretre_penitence', 'pretre_bouclier_discipline', 'pretre_rayonnement', 'pretre_chatiment_discipline']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'known', `${id} est débloquée automatiquement`);
    }
    check(await page.$eval('.spell-card[data-skill="pretre_bouclier"] .sc-name', (e) => e.textContent) === 'Mot de pouvoir : Expiation', 'la barre propose « Mot de pouvoir : Expiation » à la place du Bouclier');
    await page.click('.spec-card[data-spec-id="ombre"]');
    await sleep(350);
    check(await page.$eval('.spell-card[data-skill="pretre_chatiment"] .sc-name', (e) => e.textContent) === 'Pointe mentale', 'Ombre : le Châtiment devient la Pointe mentale');
    check(await page.$('.talent-card[data-skill="pretre_expiation"]') === null, 'les talents de Discipline ne sont plus affichés');
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/pretre-fiche-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : un choix parmi trois
    await page.click('.char-card:has-text("Aube") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    await page.click('.spec-card[data-spec-id="sacre"]');
    await sleep(350);
    for (const id of ['pretre_esprit_redemption', 'pretre_hymne', 'pretre_gardien_ames']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'ready', `${id} : un des trois choix du niveau 8`);
    }
    await page.click('.talent-card[data-skill="pretre_hymne"]');
    await sleep(300);
    check((await saved('c2')).skills.includes('pretre_hymne'), 'Hymne divin est choisi');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : les deux formes, l'Expiation sur l'allié
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'pretre', level: 6, spec: 'discipline' }, { classId: 'templier', level: 6 }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    for (let i = 0; i < 4 && !/Prêtre/i.test(await page.$eval('.dock-name', (e) => e.textContent)); i++) {
      await page.click('.end-turn');
      await sleep(900);
    }
    check(/Prêtre/i.test(await page.$eval('.dock-name', (e) => e.textContent)), 'c\'est au tour du Prêtre');
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    const tapOrClick = (sel) => (phone ? page.tap(sel) : page.click(sel));
    const castOn = async (name, targetSel) => {
      const sel = btn(name);
      if (!phone) await page.click(sel);
      else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); }
      await sleep(300);
      if (targetSel && await page.$(targetSel)) await tapOrClick(targetSel);
      await sleep(500);
    };
    const pa = () => page.$$eval('.flame.on', (e) => e.length);
    const disabled = (sel) => page.$eval(sel, (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('is-disabled'));

    check(await page.$eval('.dock .mode-chip', (e) => /Lumière/.test(e.textContent)), 'le combat commence en forme de lumière');
    check((await page.$eval('.hb-class .slot-pa', (e) => e.textContent)) === '0', 'la Forme d\'ombre affiche 0 PA la première fois');
    const ally = '.fighter.player:has(.f-name:has-text("Templier"))';
    await castOn('Mot de pouvoir : Expiation', ally);
    check(await page.$(`${ally} .fx-chip:has-text("Expiation")`) !== null, 'le Templier porte une pastille « Expiation »');
    const pa0 = await pa();
    await castOn("Forme d'ombre");
    check(await page.$eval('.dock .mode-chip', (e) => /Ombre/.test(e.textContent)), 'après le sort : forme d\'ombre');
    check((await pa()) === pa0, 'la 1re utilisation ne coûte aucun PA');
    check(await disabled(btn("Forme d'ombre")), 'la Forme d\'ombre est en relance : on ne peut pas revenir tout de suite');
    await page.screenshot({ path: `${out}/pretre-combat-${phone ? 'phone' : 'desktop'}.png` });
    await tapOrClick(ally);
    await sleep(250);
    const panel = await page.$eval('.fx-panel', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Expiation/.test(panel) && /soigne/.test(panel), `le panneau d'effets explique l'Expiation : « ${panel.slice(0, 160)} »`);
    if (await page.$('.fx-panel button:has-text("Revenir")')) await tapOrClick('.fx-panel button:has-text("Revenir")');
    await sleep(150);
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Prêtre : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
