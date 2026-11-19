// Test du FEU DE CAMP dans un vrai navigateur : la case au milieu du plateau, chaque héros à son tour change ses sorts puis choisit
// une activité ; le bonus de camp s'affiche sur sa carte. Bureau et téléphone.
// Usage : node tests/ui-camp.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const hero = (id, name, classId, level) => ({ id, name, classId, level, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } });
const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1', 'c2'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [hero('c1', 'Brann', 'guerrier', 6), hero('c2', 'Aube', 'pretre', 6)]
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
    const tap = (sel) => (phone ? page.tap(sel) : page.click(sel));

    await page.goto(url);
    await page.waitForSelector('.menu');
    await page.click('text=Lancer la run');
    await page.waitForSelector('.run');
    const board = await run((app) => app.run.dungeon.board.map((t) => t.type));
    const mid = Math.floor((board.length - 1) / 2);
    check(board[mid] === 'camp' && board.filter((t) => t === 'camp').length === 1, `un feu de camp, au milieu du donjon (case ${mid + 1} sur ${board.length})`);

    // On saute jusqu'au camp : la case d'avant devient la position actuelle
    await run((app) => { const d = app.run.dungeon; d.position = d.board.findIndex((t) => t.type === 'camp') - 1; app.run.players[1].hp = 10; app.render(); });
    await page.click('.advance-card .btn-primary');
    await page.waitForSelector('.camp-card');
    check(/Feu de camp/.test(await page.textContent('.tile-card')), 'la case annonce le feu de camp (avec son illustration)');
    check(await page.$('.tile-card .tile-art svg') !== null, 'la vignette du feu de camp est dessinée');
    const first = await run((app) => app.run.pending.actor);
    const firstName = await run((app) => app.run.players.find((p) => p.id === app.run.pending.actor).name);
    check((await page.$$('.camp-act')).length === 3, 'trois activités : se reposer, affûter, monter la garde');
    check((await page.$$('.camp-slot select')).length === 4, 'quatre emplacements de sorts à changer');

    // Changer un sort : le premier héros remplace son 4e sort par un autre de ses sorts
    const slotOpts = await page.$$eval('.camp-slot select >> nth=3', (els) => [...els[0].options].map((o) => o.value).filter(Boolean));
    const before = await run((app) => app.run.players.find((p) => p.id === app.run.pending.actor).deck.slice());
    const pickId = slotOpts.find((id) => !before.includes(id));
    check(!!pickId, `il y a un autre sort à équiper (${pickId})`);
    await page.selectOption('.camp-slot select >> nth=3', pickId);
    await sleep(300);
    const after = await run((app) => app.run.players.find((p) => p.id === app.run.pending.actor).deck.slice());
    check(after[3] === pickId && after.length === 4, `le 4e sort est remplacé (${before[3]} → ${after[3]})`);
    await page.screenshot({ path: `${out}/camp-${phone ? 'phone' : 'desktop'}.png` });

    // Son activité : affûter ses armes ; puis c'est au suivant
    await tap('.camp-act[data-activity="sharpen"]');
    await sleep(300);
    const second = await run((app) => app.run.pending.kind === 'camp' ? app.run.pending.actor : null);
    check(second && second !== first, 'puis c\'est au tour du héros suivant');
    check(/check/.test(await page.innerHTML('.camp-roll')) || /Affûter/.test(await page.getAttribute('.camp-roll .is-done', 'title') || ''), `${firstName} est marqué comme ayant choisi`);
    // Le second se repose (il était blessé)
    const hp0 = await run((app) => app.run.players[1].hp);
    await tap('.camp-act[data-activity="rest"]');
    await sleep(400);
    check(await run((app) => app.run.pending.kind) === 'advance', 'tout le monde a choisi : on lève le camp');
    check((await run((app) => app.run.players[1].hp)) > hp0, 'se reposer rend des PV');
    const buffs = await run((app) => app.run.players.find((p) => p.campBuffs?.length)?.campBuffs);
    check(buffs?.[0]?.id === 'sharpen' && buffs[0].combats === 2, 'le bonus « Affûter ses armes » dure 2 combats');
    check(await page.$('[data-effect="camp"]') !== null, 'le bonus est visible sur la carte du héros (pastille de camp)');
    // Le deck changé au camp reste équipé pour la suite
    check((await run((app) => app.run.players.find((p) => p.campBuffs?.length).deck)).includes(pickId), 'le sort équipé au camp reste dans sa barre');
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await ctx.close();
  }
  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du feu de camp : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
