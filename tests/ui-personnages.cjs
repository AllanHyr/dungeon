// Test des PLACES de personnages et de la SUPPRESSION dans un vrai navigateur : compteur de places, bouton corbeille sur chaque héros,
// confirmation en tapant le nom, places pleines, suppression depuis la fiche. Bureau et téléphone.
// Usage : node tests/ui-personnages.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const hero = (id, name, classId, level) => ({ id, name, classId, level, xp: 0, skills: [], inventory: [{ uid: `${id}-p`, id: 'potion_mineure' }], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } });
const profile = {
  version: 1, nextCharNumber: 4, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1', 'c2'], lastSetup: { tranche: 1, mode: 'tranche', stasisLevel: 1 },
  characters: [hero('c1', 'Thorne', 'sacrieur', 3), hero('c2', 'Maeve', 'pretre', 2), hero('c3', 'Kael', 'assassin', 1)]
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
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters.map((c) => c.name));
    const tap = (sel) => (phone ? page.tap(sel) : page.click(sel));

    await page.goto(url);
    await page.waitForSelector('.menu');
    check(/3 \/ 8 places/.test(await page.textContent('.new-card')), 'la case « Nouveau héros » dit combien de places sont prises (3 / 8)');
    check((await page.$$('.hero-card .hero-delete')).length === 3, 'chaque héros a son bouton Supprimer (corbeille)');

    // ---------- Supprimer Maeve : il faut taper son nom
    await tap('.hero-card:has-text("Maeve") .hero-delete');
    await page.waitForSelector('.delete-modal');
    check(await page.$eval('#delete-confirm-btn', (b) => b.disabled), 'le bouton « Supprimer définitivement » est désactivé tant que le nom n\'est pas tapé');
    check(/définitivement perdus/.test(await page.textContent('.delete-modal')), 'la fenêtre prévient que c\'est définitif');
    check(/1 objet/.test(await page.textContent('.delete-who')), 'elle rappelle ce qui sera perdu (1 objet)');
    await page.fill('#delete-confirm-name', 'Mave');
    check(await page.$eval('#delete-confirm-btn', (b) => b.disabled), 'un nom mal tapé ne suffit pas');
    await page.screenshot({ path: `${out}/supprimer-${phone ? 'phone' : 'desktop'}.png` });
    await page.fill('#delete-confirm-name', 'maeve');
    check(!(await page.$eval('#delete-confirm-btn', (b) => b.disabled)), 'le bon nom (sans tenir compte des majuscules) active le bouton');
    await tap('#delete-confirm-btn');
    await page.waitForSelector('.delete-modal', { state: 'detached' });
    await sleep(200);
    check((await saved()).join() === 'Thorne,Kael', `Maeve est supprimée et la sauvegarde aussi (${(await saved()).join(', ')})`);
    check((await page.$$('.hero-card')).length === 2 && /2 \/ 8 places/.test(await page.textContent('.new-card')), 'l\'accueil montre 2 héros et 2 / 8 places');
    check(!(await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return app.ui.team.includes('c2'); })), 'elle a quitté l\'équipe');

    // ---------- Annuler ne supprime rien
    await tap('.hero-card:has-text("Kael") .hero-delete');
    await page.waitForSelector('.delete-modal');
    await tap('.delete-modal .btn:has-text("Annuler")');
    await sleep(200);
    check((await saved()).length === 2, 'Annuler ne supprime rien');

    // ---------- Places pleines
    await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); const { redraw } = await import('/src/ui/controller.js'); app.content.rules.maxCharacters = 2; redraw(); });
    await sleep(200);
    check(await page.$('.new-card.is-full') !== null && /Places pleines \(2\/2\)/.test(await page.textContent('.new-card')), 'places pleines : la case le dit (« Places pleines (2/2) »)');
    check(await page.$('button.new-card') === null, 'et ce n\'est plus un bouton');
    await page.evaluate(async () => { const { openCreateModal } = await import('/src/ui/screens/dialogs.js'); openCreateModal(); });
    await sleep(200);
    check(await page.$('.create-modal') === null && /places sont prises/.test(await page.textContent('.toast-stack, .toasts, body')), 'la création est refusée avec un message clair');

    // ---------- Depuis la fiche, la même confirmation
    await page.click('.char-card:has-text("Kael") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="info"]');
    await sleep(150);
    await page.click('.sheet-modal .btn-danger');
    await page.waitForSelector('.delete-modal');
    check(true, 'le bouton de la fiche ouvre la même confirmation');
    await page.fill('#delete-confirm-name', 'Kael');
    await page.click('#delete-confirm-btn');
    await page.waitForSelector('.delete-modal', { state: 'detached' });
    await sleep(200);
    check((await saved()).join() === 'Thorne' && await page.$('.sheet-modal') === null, 'Kael est supprimé et la fiche se ferme');
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await ctx.close();
  }
  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test des places et de la suppression : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
