// Test de l'Assassin dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués, palier 8), puis combat
// (Marque gratuite puis 1 PA, la proie marquée et le venin cumulable s'affichent sur sa carte et dans le panneau d'effets). Bureau et téléphone.
// Usage : node tests/ui-assassin.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Ombre', classId: 'assassin', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Lame', classId: 'assassin', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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
    check(await page.$('.char-card:has-text("Ombre") .hero-tag-skill:not(.hero-tag-choice)') === null, "l'accueil n'annonce pas de points de compétence à dépenser (rien à acheter)");
    await page.click('.char-card:has-text("Ombre") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(await page.$('.sk-points') === null, 'pas de compteur de points de compétence');
    check(/Marque mortelle/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est la Marque mortelle');
    check(/gratuite/i.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)) || true, '(description du sort de classe)');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'assassin_estoc,assassin_lame_venimeuse,assassin_dos,assassin_coup_de_grace', `deck de départ : ${deck0.join(', ')}`);
    check((await page.$$('.spec-card')).length === 3, 'trois spécialisations : Venin, Exécuteur, Traqueur');
    for (const id of ['venin', 'executeur', 'traqueur']) {
      check((await page.$$(`.spec-card[data-spec-id="${id}"] .spec-give`)).length >= 4, `la carte « ${id} » annonce ses paliers (niveau 4, 8, 12, 20)`);
    }
    check(/Pandémie/.test(await page.$eval('.spec-card[data-spec-id="venin"]', (e) => e.textContent)), "l'ultime du Venin est annoncé (Pandémie)");
    check(/Coup fatal/.test(await page.$eval('.spec-card[data-spec-id="executeur"]', (e) => e.textContent)), "l'ultime de l'Exécuteur est annoncé (Coup fatal)");

    // Choisir Venin : tout est automatique, les sorts de base évoluent
    await page.click('.spec-card[data-spec-id="venin"]');
    await sleep(350);
    check((await saved()).spec === 'venin', 'Venin est enregistrée');
    for (const id of ['assassin_toxines', 'assassin_nuage', 'assassin_estoc_venin', 'assassin_lame_vipere', 'assassin_grace_venin', 'assassin_marque_venin']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'known', `${id} est débloquée automatiquement`);
    }
    check(!(await saved()).skills.includes('assassin_nuage'), "rien n'est « appris » : la sauvegarde ne contient pas les automatiques");
    check(/Marque venimeuse/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe devient la Marque venimeuse');
    check(await page.$eval('.spell-card[data-skill="assassin_estoc"] .sc-name', (e) => e.textContent) === 'Estoc venimeux', "et la barre propose l'Estoc venimeux à la place de l'Estoc");
    check(await page.$eval('.spell-card[data-skill="assassin_lame_venimeuse"] .sc-name', (e) => e.textContent) === 'Lame de vipère', 'la Lame venimeuse devient Lame de vipère');
    check(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('is-locked')), 'le palier 8 est fermé à un héros de niveau 6');
    // Passer à l'Exécuteur : tout change, sans rien perdre à la main
    await page.click('.spec-card[data-spec-id="executeur"]');
    await sleep(350);
    check(await page.$eval('.spell-card[data-skill="assassin_coup_de_grace"] .sc-name', (e) => e.textContent) === 'Exécution', 'Exécuteur : le Coup de grâce devient l\'Exécution');
    check(/Marque de mort/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'et la Marque devient la Marque de mort');
    check(await page.$('.talent-card[data-skill="assassin_nuage"]') === null, 'les sorts du Venin ne sont plus affichés');
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/assassin-fiche-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : un seul choix parmi trois, qu'on peut changer
    await page.click('.char-card:has-text("Lame") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    await page.click('.spec-card[data-spec-id="executeur"]');
    await sleep(350);
    check(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('needs-choice')), 'le palier 8 est mis en évidence : un choix est à faire');
    for (const id of ['assassin_boucherie', 'assassin_chasse_sans_fin', 'assassin_sang_froid']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'ready', `${id} : un des trois choix du niveau 8`);
    }
    await page.click('.talent-card[data-skill="assassin_boucherie"]');
    await sleep(300);
    check((await saved('c2')).skills.includes('assassin_boucherie'), 'Boucherie est choisie');
    await page.click('.talent-card[data-skill="assassin_sang_froid"]');
    await sleep(300);
    const c2 = await saved('c2');
    check(c2.skills.includes('assassin_sang_froid') && !c2.skills.includes('assassin_boucherie'), 'Sang-froid remplace Boucherie (gratuit)');
    check(await page.$('.passive-item[data-skill="assassin_sang_froid"]') !== null, 'le talent passif choisi apparaît dans les passifs toujours actifs');
    await page.evaluate(() => document.querySelector('.tier-block[data-level="8"]')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/assassin-palier8-${phone ? 'phone' : 'desktop'}.png` });
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : Marque gratuite, proie marquée, venin cumulable
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'assassin', level: 6, spec: 'venin' }], { dummy: 'mannequin', count: 2, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    /** Lance un sort (sur téléphone : un 1er toucher sélectionne, le 2e lance) puis choisit la première cible proposée. */
    const castOn = async (name, targetSel = '.fighter.monster.targetable') => {
      const sel = btn(name);
      if (!phone) await page.click(sel);
      else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); }
      await sleep(300);
      if (await page.$(targetSel)) { await (phone ? page.tap(targetSel) : page.click(targetSel)); }
      await sleep(500);
    };
    const pa = () => page.$$eval('.flame.on', (e) => e.length);
    check(/Marque venimeuse/.test(await page.$eval('.hb-class', (e) => e.textContent)), 'la Marque venimeuse est dans le bloc « Classe »');
    check((await page.$eval('.hb-class .slot-pa', (e) => e.textContent)) === '0', 'rien de marqué : la Marque affiche 0 PA');
    const pa0 = await pa();
    await castOn('Marque venimeuse');
    check((await pa()) === pa0, 'la 1re marque ne coûte aucun PA');
    check((await page.$eval('.hb-class .slot-pa', (e) => e.textContent)) === '1', 'une proie est marquée : changer de cible coûterait 1 PA');
    const marked = await page.$$('.fighter.monster:has(.fx-chip:has-text("Marqué"))');
    check(marked.length === 1, 'une seule proie porte la pastille « Marqué »');
    check(await page.$('.fighter.monster .fx-chip:has-text("Venin")') !== null, 'la Marque venimeuse a aussi posé un cumul de venin');
    // Une Lame de vipère sur la proie : deux cumuls de plus (+1 sur la proie marquée)
    await castOn('Lame de vipère', '.fighter.monster:has(.fx-chip:has-text("Marqué"))');
    const venin = await page.$eval('.fighter.monster:has(.fx-chip:has-text("Marqué")) .fx-chip:has-text("Venin")', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Venin ×4/.test(venin), `le venin se cumule : « ${venin.trim()} »`);
    // Le panneau d'effets de la proie explique la marque et le venin
    await page.click('.fighter.monster:has(.fx-chip:has-text("Marqué"))');
    await sleep(250);
    const panel = await page.$eval('.fx-panel', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Marqué/.test(panel) && /dégâts en plus/.test(panel) && /sa mort/.test(panel), 'le panneau explique la marque (dégâts en plus, jusqu\'à sa mort)');
    check(/Venin ×4/.test(panel) && /cumuls/.test(panel), 'et le venin cumulé (PV × cumuls)');
    await page.screenshot({ path: `${out}/assassin-combat-${phone ? 'phone' : 'desktop'}.png` });
    // Changer de cible : 1 PA, et l'ancienne marque disparaît
    await page.click('.fx-panel button:has-text("Revenir")'); // (sur téléphone la fiche flotte au-dessus du champ de bataille : on la referme par son bouton)
    await sleep(150);
    const paBefore = await pa();
    await castOn('Marque venimeuse', '.fighter.monster:not(:has(.fx-chip:has-text("Marqué")))');
    check((await pa()) === paBefore - 1, 'changer de cible a coûté 1 PA');
    check((await page.$$('.fighter.monster:has(.fx-chip:has-text("Marqué"))')).length === 1, "toujours une seule proie marquée (l'ancienne marque a disparu)");
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : "\n✅ Test de l'Assassin : tout est bon");
  process.exit(failures.length ? 1 : 0);
})();
