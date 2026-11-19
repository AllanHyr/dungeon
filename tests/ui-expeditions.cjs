// Test des expéditions dans un vrai navigateur : l'onglet, envoyer un héros, son étiquette « En expédition », le héros bloqué
// (donjon, farm), le retour (on avance l'heure de retour), récupérer les récompenses, rappeler un héros, la grande expédition verrouillée.
// Bureau et téléphone.
// Usage : node tests/ui-expeditions.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const hero = (id, name, classId, level) => ({ id, name, classId, level, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } });
const profile = {
  version: 1, nextCharNumber: 4, settings: { sound: false, place: 'aventure', view: 'expeditions', farmChar: 'c2' }, lastTeam: ['c1'], lastSetup: { tranche: 1, mode: 'tranche', stasisLevel: 1 },
  characters: [hero('c1', 'Brunehilde', 'guerrier', 6), hero('c2', 'Lyre', 'barde', 3), hero('c3', 'Ombre', 'assassin', 2)]
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
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.goto(url);
    await page.waitForSelector('.exp-plan');
    check((await page.$$('.view-tab')).length === 3, 'trois onglets : donjon, farm, expéditions');
    check((await page.$$('.exp-card')).length === 3, 'trois expéditions proposées');
    check(/Rattrapage : Lyre/.test(await page.textContent('.exp-plan')), 'Lyre (niv. 3) est en retard : elle gagnera de l\'XP');
    check(await page.$eval('.exp-card[data-exp="grande_expedition"] .exp-go', (b) => b.disabled), 'la grande expédition est verrouillée');
    check(await page.$('.exp-card[data-exp="grande_expedition"] .exp-lock .progress, .exp-card[data-exp="grande_expedition"] .exp-lock [class*="progress"]') !== null, 'avec la progression du succès qui la débloque');

    // Envoyer Lyre à la chasse
    await tap('.exp-card[data-exp="chasse"] .exp-go');
    await sleep(400);
    let chars = await saved();
    const lyre = chars.find((c) => c.id === 'c2');
    check(lyre.expedition?.id === 'chasse' && lyre.expedition.end - lyre.expedition.start === 2 * 3600000, 'Lyre part pour 2 h (sauvegardé)');
    check(/En expédition · 2 h/.test(await page.textContent('.hero-card[data-char="c2"] .exp-tag')), 'son étiquette : « En expédition · 2 h »');
    check(await page.$('.exp-row[data-char="c2"]') !== null && /2 h/.test(await page.textContent('.exp-row[data-char="c2"]')), 'elle est dans « En route », avec le temps restant');
    check(/1 \/ 3 héros en route/.test(await page.textContent('.exp-plan h2')), 'le compteur : 1 / 3 héros en route');
    if (!phone) await page.screenshot({ path: `${out}/exp-depart-desktop.png`, fullPage: true });

    // Elle ne peut pas partir au farm ni en donjon
    await tap('.view-tab[data-view="farm"]');
    await page.waitForSelector('.zone-card');
    await tap('.hero-card[data-char="c2"]');
    await sleep(200);
    check(await page.$eval('#farm-launch', (b) => b.disabled), 'au farm : Lyre ne peut pas partir');
    await tap('.view-tab[data-view="dungeon"]');
    await sleep(300);
    await tap('.hero-card[data-char="c2"]');
    await sleep(300);
    check(!(await page.$('.hero-card[data-char="c2"].selected')), 'en donjon : on ne peut pas l\'ajouter à l\'équipe');

    // Le retour : on avance l'heure de retour, on recharge
    await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('donjon.profile.v1')); const c = p.characters.find((x) => x.id === 'c2'); c.expedition.end = Date.now() - 1000; localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); });
    await page.reload();
    await page.waitForSelector('.menu');
    check(/De retour/.test(await page.textContent('.hero-card[data-char="c2"] .exp-tag')), 'l\'étiquette dit « De retour ! »');
    await tap('.view-tab[data-view="expeditions"]');
    await page.waitForSelector('.exp-row[data-char="c2"] .exp-claim');
    await tap('.exp-row[data-char="c2"] .exp-claim');
    await sleep(500);
    chars = await saved();
    const back = chars.find((c) => c.id === 'c2');
    check(!back.expedition && back.shards >= 6 && back.xp > 0 && back.stats.expeditions === 1, `récompenses : ${back.shards} éclats, ${back.xp} XP`);
    check(/est de retour/.test(await page.textContent('#toast')), 'un message annonce son retour et ce qu\'elle rapporte');

    // Rappeler un héros
    await tap('.hero-card[data-char="c3"]');
    await sleep(200);
    await tap('.exp-card[data-exp="patrouille"] .exp-go');
    await page.waitForSelector('.exp-row[data-char="c3"] .exp-cancel');
    await tap('.exp-row[data-char="c3"] .exp-cancel');
    await page.waitForSelector('[role="alertdialog"]');
    await tap('[role="alertdialog"] .btn-danger');
    await sleep(400);
    chars = await saved();
    check(!chars.find((c) => c.id === 'c3').expedition && !chars.find((c) => c.id === 'c3').shards, 'Ombre rappelée : elle revient sans rien');
    await page.screenshot({ path: `${out}/exp-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    check((await overflow()) <= 1, 'aucun débordement horizontal');
    await ctx.close();
  }
  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test des expéditions : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
