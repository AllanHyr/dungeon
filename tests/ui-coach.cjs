// Le premier combat guidé : cinq bulles la première fois, plus jamais ensuite (ni en salle d'entraînement).
// Usage : node tests/ui-coach.cjs [url] [dossier_captures]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const toCombat = async () => {
    await page.click('.nav-place[data-place="aventure"]');
    await page.click('text=Lancer la run');
    await page.waitForSelector('.run');
    await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); app.run.dungeon.board[0].type = 'combat'; app.render(); });
    await page.click('.advance-card .btn-primary');
    await page.click('.roll-card .btn-primary');
    await page.waitForTimeout(400);
    await page.click('.dice-overlay').catch(() => {});
    await page.waitForSelector('.dock.action-card', { timeout: 20000 });
  };

  await page.goto(url);
  await page.waitForSelector('.menu');
  await page.click("text=Créer 3 héros d'exemple");
  await page.waitForSelector('.place-nav');

  console.log('\n● Le premier combat');
  await toCombat();
  await page.waitForSelector('.coach');
  check(/1 \/ 5/.test(await page.textContent('.coach-count')) && /ordre de jeu/i.test(await page.textContent('.coach-title')), 'première bulle : l\'ordre de jeu');
  check(!!(await page.$('.frise.coach-target')), 'elle encadre la frise');
  await page.screenshot({ path: `${out}/coach-1.png` });
  const titles = [];
  for (let i = 0; i < 4; i++) {
    await page.click('.coach-next');
    await page.waitForSelector(`.coach-count:has-text("${i + 2} / 5")`);
    titles.push(await page.textContent('.coach-title'));
  }
  check(titles.join(' | ') === "Le champ de bataille | Tes points d'action | Tes sorts | Finir son tour", `les bulles suivantes (${titles.join(' | ')})`);
  check(!!(await page.$('.end-turn.coach-target')), 'la dernière encadre « Fin du tour »');
  await page.screenshot({ path: `${out}/coach-5.png` });
  await page.click('.coach-next');
  check(!(await page.$('.coach')) && !(await page.$('.coach-target')), '« Compris ! » ferme le guide');
  check(await page.evaluate(async () => (await import('/src/ui/state.js')).app.profile.settings.coachCombat === true), 'et le profil s\'en souvient');

  console.log('\n● Plus jamais ensuite');
  await page.reload();
  await page.waitForSelector('.run, .menu');
  await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); app.render(); });
  check(!(await page.$('.coach')), 'après rechargement : pas de guide');

  console.log('\n● Passer le guide');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.menu');
  await page.click("text=Créer 3 héros d'exemple");
  await page.waitForSelector('.place-nav');
  await toCombat();
  await page.waitForSelector('.coach');
  await page.click('.coach-skip');
  check(!(await page.$('.coach')), '« Passer le guide » le ferme');
  check(await page.evaluate(async () => (await import('/src/ui/state.js')).app.profile.settings.coachCombat === true), 'pour de bon');

  console.log(errors.length ? 'ERREURS:\n' + errors.join('\n') : '  ✅ aucune erreur JavaScript');
  await browser.close();
  const bad = failures.length + errors.length;
  console.log(bad ? `\n❌ ${bad} problème(s)` : '\n✅ Le premier combat guidé : tout est bon');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
