// Test de l'interface dans un vrai navigateur (Chromium via Playwright).
// Il joue une run complète en cliquant, comme un humain, et prend des captures d'écran.
// Usage : node tests/ui-smoke.cjs [url] [dossier_captures]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto(url);
  await page.waitForSelector('.menu');
  await page.screenshot({ path: `${out}/01-menu-vide.png` });

  // Équipe d'exemple
  await page.click("text=Créer 3 héros d'exemple");
  await page.waitForSelector('.char-card.selected');
  await page.screenshot({ path: `${out}/02-menu-equipe.png`, fullPage: true });

  // Lancer
  await page.click('text=Lancer la run');
  await page.waitForSelector('.run');
  await page.screenshot({ path: `${out}/03-run-debut.png`, fullPage: true });

  const shots = new Set();
  const shot = async (name) => {
    if (!shots.has(name)) {
      shots.add(name);
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    }
  };

  let steps = 0;
  const sleep = (ms) => page.waitForTimeout(ms);
  while (steps++ < 700) {
    if (await page.$('.end-screen')) break;
    // (une action vient peut-être de se jouer : on attend la fin de l'animation, l'écran se redessine alors — sans cela on lirait l'ancien écran)
    await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 }).catch(() => {});
    // dé en cours -> on clique pour passer
    if (await page.$('.dice-overlay')) {
      await page.click('.dice-overlay').catch(() => {});
      await sleep(250);
      continue;
    }
    if (await page.$('.center-card')) {
      await page.click('.center-card .btn-primary');
      await sleep(200);
      continue;
    }
    if (await page.$('.advance-card')) {
      await shot('04-avancer');
      await page.click('.advance-card .btn-primary');
      await sleep(150);
      continue;
    }
    if (await page.$('.roll-card')) {
      const hasMonsters = await page.$('.monster-row.preview');
      await shot(hasMonsters ? '05-jet-combat' : '05b-jet-case');
      await page.click('.roll-card .btn-primary');
      await sleep(150);
      continue;
    }
    if (await page.$('.loot-card')) {
      await shot('06-butin');
      await page.click('.loot-card .btn-primary');
      await sleep(150);
      continue;
    }
    if (await page.$('.choice-card')) {
      const isBlow = await page.$('.blow-group');
      await shot(isBlow ? '07-coup-bas' : '07b-choix');
      const btn = (await page.$('.choice-card .btn-primary')) || (await page.$('.choice-card .btn'));
      await btn.click();
      await sleep(150);
      continue;
    }
    if (await page.$('.camp-card')) {
      await shot('08b-feu-de-camp');
      await page.click('.camp-act[data-activity="rest"]');
      await sleep(150);
      continue;
    }
    if (await page.$('.shop-card')) {
      await shot('08-marchand');
      await page.click('.shop-card >> text=Quitter le marchand');
      await sleep(150);
      continue;
    }
    if (await page.$('.action-card')) {
      await shot('09-combat');
      // Un ciblage est ouvert : on clique sur la première cible possible (en vert)
      if (await page.$('.fighter.targetable')) {
        await page.click('.fighter.targetable');
        await sleep(220);
        continue;
      }
      // Sinon : une compétence utilisable au hasard (la dernière de la liste = souvent la plus chère), ou fin de tour
      // (on cherche le bouton au moment du clic : l'écran se redessine à la fin des animations, un bouton repéré avant aurait disparu)
      const skills = page.locator('.skill-btn:not([disabled])');
      const n = await skills.count();
      if (n && Math.random() < 0.8) await skills.nth(Math.random() < 0.5 ? n - 1 : Math.floor(Math.random() * n)).click({ timeout: 8000 }).catch(() => {});
      else await page.click('.end-turn', { timeout: 8000 }).catch(() => {});
      await sleep(220);
      continue;
    }
    await sleep(200);
  }
  await sleep(500);
  await page.screenshot({ path: `${out}/10-fin.png`, fullPage: true });
  const ended = !!(await page.$('.end-screen'));
  console.log('Fin de run atteinte :', ended, '— étapes :', steps);
  const summary = await page
    .evaluate(async () => {
      const { app } = await import('/src/ui/state.js');
      return app.run ? { issue: app.run.result.outcome, tours: app.run.turn, morts: app.run.players.filter((p) => !p.alive).length } : null;
    })
    .catch(() => null);
  console.log('Résumé :', JSON.stringify(summary));

  // Persistance : on recharge la page, les personnages doivent toujours être là
  await page.reload();
  await page.waitForSelector('.menu');
  const n = await page.$$eval('.char-card:not(.new-card)', (els) => els.length);
  console.log('Personnages après rechargement :', n);
  await page.screenshot({ path: `${out}/11-menu-apres-run.png`, fullPage: true });

  console.log(errors.length ? 'ERREURS:\n' + errors.join('\n') : 'Aucune erreur JavaScript.');
  await browser.close();
  process.exit(errors.length || !ended || n !== 3 ? 1 : 0);
})();
