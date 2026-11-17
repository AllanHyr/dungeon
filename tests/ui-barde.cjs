// Test du Barde dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués), puis combat
// (inspiration dans le bandeau, choix du chant en un clic, chant visible sur un allié, Tempo qui fait jouer un allié juste après). Bureau et téléphone.
// Usage : node tests/ui-barde.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 2, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [{ id: 'c1', name: 'Lyre', classId: 'barde', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }]
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
    const tap = (sel) => (phone ? page.tap(sel) : page.click(sel));
    const run = (fn) => page.evaluate(async (src) => { const { app } = await import('/src/ui/state.js'); return new Function('app', `return (${src})(app)`)(app); }, fn.toString());

    // ---------- La fiche
    await page.goto(url);
    await page.waitForSelector('.menu');
    check(await page.$('.char-card:has-text("Lyre") svg') !== null, 'le Barde a son portrait à l\'accueil');
    await page.click('.char-card:has-text("Lyre") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(/Ballade/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est la Ballade');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'barde_note,barde_refrain,barde_tempo,barde_crescendo', `deck de départ (${deck0.join(', ')})`);
    for (const [id, ult] of [['menestrel', 'Symphonie'], ['troubadour', 'Chant éternel'], ['skald', 'Ragnarök']]) {
      check(new RegExp(ult).test(await page.$eval(`.spec-card[data-spec-id="${id}"]`, (e) => e.textContent)), `l'ultime de « ${id} » est annoncé (${ult})`);
    }
    await page.click('.spec-card[data-spec-id="menestrel"]');
    await sleep(350);
    check(await page.$eval('.spell-card[data-skill="barde_tempo"] .sc-name', (e) => e.textContent) === 'Tempo endiablé', 'Ménestrel : le Tempo devient le Tempo endiablé');
    await page.screenshot({ path: `${out}/barde-fiche-${phone ? 'phone' : 'desktop'}.png` });
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : inspiration, chant, Tempo
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'barde', level: 6 }, { classId: 'guerrier', level: 6 }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    for (let i = 0; i < 4 && !/Barde/i.test(await page.$eval('.dock-name', (e) => e.textContent)); i++) { await page.click('.end-turn'); await sleep(900); }
    check(/Barde/i.test(await page.$eval('.dock-name', (e) => e.textContent)), 'c\'est au tour du Barde');
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    const press = async (name) => { const sel = btn(name); if (!phone) await page.click(sel); else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); } await sleep(300); };
    const insp = () => page.$$eval('.dock .resource[data-res="inspiration"] .pip.on', (e) => e.length);

    check((await page.$$('.dock .resource[data-res="inspiration"] .pip')).length === 5, 'l\'inspiration est affichée dans le bandeau : 5 points');
    check(await page.$eval(btn('Crescendo'), (b) => b.disabled || b.classList.contains('is-disabled') || b.getAttribute('aria-disabled') === 'true'), 'le Crescendo (3 inspiration) est grisé au départ');
    await press('Ballade');
    check(/choisis un chant/i.test(await page.$eval('.sd-modes-head', (e) => e.textContent)), 'le menu dit « choisis un chant »');
    const ids = await page.$$eval('.sd-modes .mode-opt', (els) => els.map((e) => e.dataset.mode));
    check(ids.join() === 'bravoure,resilience,clairvoyance', `trois chants : ${ids.join(', ')}`);
    check(/Chant actuel/.test(await page.$eval('.sd-modes .mode-opt.is-current', (e) => e.textContent)), 'le chant en cours est signalé (« Chant actuel »)');
    await tap('.sd-modes .mode-opt[data-mode="clairvoyance"]');
    await sleep(500);
    check((await insp()) === 1, 'changer de chant donne 1 inspiration');
    const ally = '.fighter.player:has(.f-name:has-text("Guerrier"))';
    check(await page.$(`${ally} .fx-chip:has-text("clairvoyance")`) !== null, 'le Guerrier porte le chant de clairvoyance sur sa carte');
    // Le Tempo sur le Guerrier : il joue juste après le Barde
    await press('Tempo');
    if (await page.$(ally)) await tap(ally);
    await sleep(600);
    const order = await run((app) => { const c = app.run.combat; const i = c.timeline.indexOf(app.run.players[0].id); return c.timeline[i + 1] === app.run.players[1].id; });
    check(order, 'dans la frise, le Guerrier joue juste après le Barde');
    await page.screenshot({ path: `${out}/barde-combat-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }
  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Barde : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
