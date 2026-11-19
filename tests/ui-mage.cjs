// Test du Mage dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués), puis combat
// (charges arcaniques dans le bandeau, Déflagration grisée sans charge, brûlure visible sur la cible, Déflagration qui vide les charges).
// Bureau et téléphone.
// Usage : node tests/ui-mage.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 2, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [{ id: 'c1', name: 'Ysolde', classId: 'mage', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }]
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
    const run = (fn) => page.evaluate(async (src) => { const { app } = await import('/src/ui/state.js'); return new Function('app', `return (${src})(app)`)(app); }, fn.toString());

    // ---------- La fiche
    await page.goto(url);
    await page.waitForSelector('.menu');
    check(await page.$('.char-card:has-text("Ysolde") svg') !== null, 'le Mage a son portrait à l\'accueil');
    await page.click('.char-card:has-text("Ysolde") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(/Déflagration/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est la Déflagration');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'mage_trait_feu,mage_eclair_givre,mage_projectiles,mage_barriere', `deck de départ (${deck0.join(', ')})`);
    for (const [id, ult] of [['pyromancien', 'Cataclysme'], ['cryomancien', 'Ère glaciaire'], ['arcaniste', 'Singularité']]) {
      check(new RegExp(ult).test(await page.$eval(`.spec-card[data-spec-id="${id}"]`, (e) => e.textContent)), `l'ultime de « ${id} » est annoncé (${ult})`);
    }
    await page.click('.spec-card[data-spec-id="pyromancien"]');
    await sleep(350);
    check(await page.$eval('.spell-card[data-skill="mage_trait_feu"] .sc-name', (e) => e.textContent) === 'Trait ardent', 'Pyromancien : le Trait de feu devient le Trait ardent');
    await page.screenshot({ path: `${out}/mage-fiche-${phone ? 'phone' : 'desktop'}.png` });
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : charges, brûlure, Déflagration
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'mage', level: 6 }, { classId: 'guerrier', level: 6 }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    for (let i = 0; i < 4 && !/Mage/i.test(await page.$eval('.dock-name', (e) => e.textContent)); i++) { await page.click('.end-turn'); await sleep(900); }
    check(/Mage/i.test(await page.$eval('.dock-name', (e) => e.textContent)), 'c\'est au tour du Mage');
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    const press = async (name) => { const sel = btn(name); if (!phone) await page.click(sel); else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); } await sleep(350); };
    const target = async () => { const m = '.fighter.monster.targetable, .fighter.enemy.targetable, .fighter.targetable'; if (await page.$(m)) { if (phone) await page.tap(m); else await page.click(m); } await sleep(600); };
    const charges = () => page.$$eval('.dock .resource[data-res="arcane"] .pip.on', (e) => e.length);

    check((await page.$$('.dock .resource[data-res="arcane"] .pip')).length === 5, 'les charges arcaniques sont dans le bandeau : 5 points');
    check((await charges()) === 1, 'le combat commence avec 1 charge (Flux arcanique)');
    // Sans charge, la Déflagration est grisée
    await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); const { redraw } = await import('/src/ui/controller.js'); app.run.players[0].resources.arcane = 0; redraw(); });
    await sleep(300);
    check(await page.$eval(btn('Déflagration'), (b) => b.disabled || b.classList.contains('is-disabled') || b.getAttribute('aria-disabled') === 'true'), 'sans charge, la Déflagration est grisée');
    await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); const { redraw } = await import('/src/ui/controller.js'); app.run.players[0].resources.arcane = 1; redraw(); });
    await sleep(300);
    await press('Trait de feu');
    await target();
    check((await charges()) === 2, 'le Trait de feu donne une charge');
    check(await page.$('.fighter.monster .fx-chip:has-text("brûle"), .fighter .fx-chip:has-text("Brûlure")') !== null, 'la cible brûle (visible sur sa carte)');
    await page.screenshot({ path: `${out}/mage-combat-${phone ? 'phone' : 'desktop'}.png` });
    await press('Déflagration');
    await target();
    const after = await run((app) => ({ charges: app.run.players[0].resources.arcane || 0, dmg: app.run.players[0].stats.damageDealt }));
    check(after.charges === 0, 'la Déflagration a vidé toutes les charges');
    check(after.dmg > 0, `le Mage a infligé des dégâts (${after.dmg})`);
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }
  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Mage : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
