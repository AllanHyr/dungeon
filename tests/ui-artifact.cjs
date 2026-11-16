// Teste artifact.html tel que la plateforme le publiera : le fragment est enveloppé dans un
// squelette <html> (comme à la publication), puis on vérifie chargement, jeu, et absence de débordement.
// Usage : node tests/ui-artifact.cjs [url_du_serveur] [dossier_captures]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const base = process.argv[2] || 'http://localhost:8765';
const out = process.argv[3] || '/tmp/shots';
const fragment = fs.readFileSync(path.join(__dirname, '..', 'artifact.html'), 'utf8');

// Squelette imité de la plateforme : méta viewport-fit=cover + petite remise à zéro.
const skeleton = (body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let failed = false;

  for (const [label, viewport, mobile] of [['bureau', { width: 1280, height: 860 }, false], ['telephone', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
    // On sert le fragment enveloppé à la place du fichier brut.
    await page.route('**/artifact.html', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: skeleton(fragment) }));
    await page.goto(`${base}/artifact.html`);
    await page.waitForSelector('.menu');
    const title = await page.title();

    await page.click("text=Créer 3 héros d'exemple");
    await page.click('text=Lancer la run');
    await page.waitForSelector('.run');
    await page.click('.advance-card .btn-primary');
    await page.waitForSelector('.roll-card, .choice-card, .loot-card');

    // Débordement horizontal ?
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const gutter = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('app')).paddingLeft));
    console.log(`${label}: titre="${title}" débordement=${overflow}px fond=${bg} gouttière=${gutter}px`);
    if (overflow > 0 || gutter < 16 || title !== 'Donjon coopératif') failed = true;
    await page.screenshot({ path: `${out}/60-artifact-${label}.png`, fullPage: true });
    await ctx.close();
  }

  console.log(errors.length ? 'ERREURS:\n' + errors.join('\n') : 'Aucune erreur JavaScript.');
  await browser.close();
  process.exit(errors.length || failed ? 1 : 0);
})();
