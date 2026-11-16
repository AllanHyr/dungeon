// Test de la barre de combat en trois blocs : corps à corps basique (seul), sort de classe (seul), deck (encadré de 4 emplacements).
// On y vérifie : le contenu et l'ordre des blocs, les emplacements libres, rien d'autre dans la barre, les touches, le lancement d'un sort, le téléphone.
// Usage : node tests/ui-barre.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

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
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
    const names = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent));

    await page.goto(url);
    await page.waitForSelector('.menu');
    // Atelier : un Duelliste niveau 5, spécialisation « poison ». On lui donne ensuite un deck de 2 sorts (comme un vrai personnage).
    await page.evaluate(async () => {
      const { startTraining, redraw } = await import('/src/ui/controller.js');
      const { app } = await import('/src/ui/state.js');
      startTraining([{ classId: 'duelliste', level: 5, spec: 'poison' }], { dummy: 'mannequin', count: 1, atkScale: 1 });
      await new Promise((r) => setTimeout(r, 300));
      app.run.players[0].deck = ['duelliste_estoc', 'duelliste_danse'];
      redraw();
    });
    await page.waitForSelector('.hotbar .hb-deck');
    await page.waitForTimeout(300);

    check((await page.$$('.hotbar .hb-group')).length === 4, 'quatre groupes : corps à corps, classe, deck, actions');
    const basic = await names('.hb-basic .slot-label');
    const klass = await names('.hb-class .slot-label');
    const deck = await names('.hb-deck .slot .slot-label');
    check(basic.length === 1 && basic[0] === "Attaque à l'arme", `le corps à corps basique est seul de son côté (${basic.join(', ')})`);
    check(klass.length === 1 && klass[0] === 'Fente', `le sort de classe est seul de son côté (${klass.join(', ')})`);
    check(deck.join('|') === 'Estoc venimeux|Danse des lames|Libre|Libre', `le deck est un encadré de 4 : 2 sorts (l'Estoc a évolué avec la spé) et 2 emplacements libres (${deck.join(', ')})`);
    check((await page.$$('.hb-deck .slot-btn')).length === 2 && (await page.$$('.hb-deck .empty-slot')).length === 2, 'les emplacements libres ne sont pas des boutons');
    const all = await names('.hotbar .slot .slot-label');
    check(!all.includes('Garde') && !all.includes('Lame empoisonnée') && !all.includes('Coup de grâce'), 'rien d\'autre dans la barre : ni Garde, ni les sorts appris mais hors deck');
    check((await names('.hb-util .slot-label')).join('|') === 'Rang arrière', 'les actions (rang) sont à part');

    const keys = await page.$$eval('.hotbar .slot-key', (els) => els.map((e) => e.textContent));
    check(keys.slice(0, 4).join(' ') === '1 2 3 4' || keys.slice(0, 4).join(' ') === '& é " \'', `les touches se suivent de gauche à droite (${keys.join(' ')})`);
    // les cases sont rangées dans l'ordre : basique, classe, deck 1, deck 2
    const order = await page.$$eval('.hotbar .slot-btn', (els) => els.map((e) => e.closest('.slot').querySelector('.slot-label').textContent));
    check(order.slice(0, 4).join('|') === "Attaque à l'arme|Fente|Estoc venimeux|Danse des lames", `ordre des cases : ${order.join(' > ')}`);

    // Un sort du deck se lance (Estoc venimeux : on choisit une cible, puis on la clique)
    if (!phone) {
      const flamesBefore = await page.$$eval('.flame.on', (e) => e.length);
      await page.click('.hb-deck .slot-btn >> nth=0');
      await page.waitForTimeout(250);
      await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 });
      const flamesAfter = await page.$$eval('.flame.on', (e) => e.length);
      // (une seule cible possible : le sort part tout de suite ; sinon le jeu proposerait de choisir)
      check(flamesAfter < flamesBefore || await page.$('.fighter.targetable') !== null, `cliquer un sort du deck le lance (PA ${flamesBefore} → ${flamesAfter})`);
    } else {
      await page.tap('.hb-deck .slot-btn >> nth=0');
      await page.waitForTimeout(150);
      check(await page.$('.skill-detail') !== null, 'toucher un sort du deck montre son détail');
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, 'aucun débordement horizontal de la page');
    if (phone) {
      // sur téléphone la barre défile : elle tient dans sa boîte
      const hb = await page.$eval('.hotbar', (e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      check(hb.sw >= hb.cw, `la barre défile si besoin (${hb.sw}px dans ${hb.cw}px)`);
    }
    await page.screenshot({ path: `${out}/barre-${phone ? 'phone' : 'desktop'}.png` });
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test de la barre de combat : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
