// Test du Sacrieur dans un vrai navigateur : fiche (sort de classe, deck, spécialisations automatiques, pas de points à dépenser),
// puis combat (mode Endurance / Fureur, Pacte de sang gratuit la 1re fois, puis 1 PA). Bureau et téléphone.
// Usage : node tests/ui-sacrieur.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 2, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Sang', classId: 'sacrieur', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Rubis', classId: 'sacrieur', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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

    await page.goto(url);
    await page.waitForSelector('.menu');
    check(await page.$('.char-card:has-text("Sang") .hero-tag-skill') === null, "l'accueil n'annonce pas de points de compétence à dépenser (rien à acheter)");
    await page.click('.char-card:has-text("Sang") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    check(await page.$('.sheet-modal .tab[data-tab="skills"] .tab-badge') === null, "pas de pastille de points sur l'onglet Compétences");
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);

    check(await page.$('.sk-points') === null, 'pas de compteur de points de compétence');
    check(/Pacte de sang/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est le Pacte de sang');
    check(/Attaque à l'arme/.test(await page.$eval('[data-fixed="Corps à corps"]', (e) => e.textContent)), "le corps à corps basique est l'Attaque à l'arme");
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'sacrieur_entaille,sacrieur_morsure,sacrieur_punition,sacrieur_carapace', `deck de départ : ${deck0.join(', ')}`);
    check((await page.$$('.spec-card')).length === 3, 'trois spécialisations : Bastion, Équilibre, Écorché');
    check(await page.$('.talent-card') === null && await page.$('.sec-talents .sec-empty') !== null, "sans spécialisation : aucun talent affiché, la section invite à en choisir une");
    for (const id of ['bastion', 'equilibre', 'ecorche']) {
      check((await page.$$(`.spec-card[data-spec-id="${id}"] .spec-give`)).length >= 4, `la carte « ${id} » annonce ses paliers (niveau 4, 8, 12, 20)`);
      check((await page.$eval(`.spec-card[data-spec-id="${id}"] .spec-give[data-level="4"]`, (e) => e.querySelectorAll('.give-chip').length)) >= 4, `la carte « ${id} » liste au moins 4 compétences au niveau 4`);
    }

    // Choisir Bastion : les compétences automatiques se débloquent
    await page.click('.spec-card[data-spec-id="bastion"]');
    await sleep(350);
    check((await saved()).spec === 'bastion', 'Bastion est enregistrée');
    check((await page.$$('.tier-block')).length === 4, 'quatre paliers : niveau 4, 8, 12 (à venir) et 20 (ultime, à venir)');
    for (const id of ['sacrieur_rempart', 'sacrieur_sacrifice', 'sacrieur_dernier_souffle', 'sacrieur_punition_bastion']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'known', `${id} est débloquée automatiquement`);
    }
    check(await page.$('.talent-card[data-skill="sacrieur_dechirure"]') === null, "les compétences d'une autre spécialisation ne sont pas affichées");
    check(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('is-locked')), 'le palier 8 est fermé à un héros de niveau 6');
    check(!(await saved()).skills.includes('sacrieur_sacrifice'), 'rien n\'est « appris » : la sauvegarde ne contient pas les automatiques');
    check((await page.$eval('.talent-card[data-skill="sacrieur_punition_bastion"] .tc-evo', (e) => e.textContent)).includes('Punition'), 'la Punition protectrice annonce qu\'elle remplace la Punition');
    check(await page.$eval('.spell-card[data-skill="sacrieur_punition"] .sc-name', (e) => e.textContent) === 'Punition protectrice', 'et la barre propose déjà la version évoluée');
    // Remplacer un sort de la barre par Sacrifice
    await page.click('.deck-slot[data-deck-skill="sacrieur_carapace"]');
    await sleep(250);
    await page.click('.spell-card[data-deck-toggle="sacrieur_sacrifice"]');
    await sleep(300);
    check((await saved()).deck.includes('sacrieur_sacrifice'), 'Sacrifice est équipé dans la barre');
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/sacrieur-fiche-${phone ? 'phone' : 'desktop'}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : un seul choix parmi trois, qu'on peut changer ; paliers « à venir »
    await page.click('.char-card:has-text("Rubis") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check((await page.$$('.spec-give.is-upcoming')).length === 6, 'chaque carte de spécialisation annonce ses deux paliers « à venir » (niveau 12 et ultime niveau 20) : 6 lignes');
    check(/Forteresse/.test(await page.$eval('.spec-card[data-spec-id="bastion"]', (e) => e.textContent)), "l'ultime du Bastion est annoncé (Forteresse)");
    check(/Dernier sang/.test(await page.$eval('.spec-card[data-spec-id="ecorche"]', (e) => e.textContent)), "la carte de l'Écorché annonce son ultime");
    await page.click('.spec-card[data-spec-id="ecorche"]');
    await sleep(350);
    check((await page.$$('.tier-set.is-upcoming')).length === 2, 'les talents montrent les deux paliers à venir (niveau 12 et ultime niveau 20)');
    check(/Ultime : Dernier sang/.test(await page.$eval('.tier-set.is-upcoming[data-upcoming-level="20"]', (e) => e.textContent)), "l'ultime est annoncé dans les talents");
    check(await page.$('.tier-set.is-upcoming button') === null, 'les paliers à venir ne sont pas cliquables');
    check(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('needs-choice')), 'le palier 8 est mis en évidence : un choix est à faire');
    check(/1 choix à faire/.test(await page.$eval('.tier-block[data-level="8"] .tier-status', (e) => e.textContent)), 'et le dit');
    for (const id of ['sacrieur_saignee', 'sacrieur_execution', 'sacrieur_frenesie']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'ready', `${id} : un des trois choix du niveau 8`);
    }
    check((await page.$eval('.talent-card[data-skill="sacrieur_saignee"]', (b) => b.textContent)).includes('Choisir'), 'la carte dit « Choisir » (pas de points)');
    await page.click('.talent-card[data-skill="sacrieur_saignee"]');
    await sleep(300);
    check((await saved('c2')).skills.includes('sacrieur_saignee'), 'Saignée volontaire est choisie');
    check(await page.$eval('.talent-card[data-skill="sacrieur_saignee"]', (n) => n.dataset.state) === 'chosen', 'sa carte est marquée « Choisi »');
    check(!(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('needs-choice'))), "le palier n'est plus mis en évidence");
    check(await page.$('.sk-points') === null, 'toujours aucun point à dépenser');
    check((await page.$eval('.talent-card[data-skill="sacrieur_execution"]', (b) => b.textContent)).includes('remplace « Saignée volontaire »'), 'la carte annonce ce que le nouveau choix remplace');
    await page.click('.talent-card[data-skill="sacrieur_execution"]');
    await sleep(300);
    const c2 = await saved('c2');
    check(c2.skills.includes('sacrieur_execution') && !c2.skills.includes('sacrieur_saignee'), 'Exécution remplace Saignée volontaire (gratuit, sans tout réinitialiser)');
    check(!(await page.$eval('.sec-talents .sec-head .btn', (b) => b.disabled)), 'le bouton « Oublier mes choix » est utilisable (on a fait un choix)');
    // La passive choisie apparaît dans « Passifs toujours actifs »
    check(await page.$('.passive-item[data-skill="sacrieur_execution"]') !== null, 'le talent passif choisi apparaît dans les passifs toujours actifs');
    await page.evaluate(() => document.querySelector('.tier-block[data-level="8"]')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/sacrieur-palier8-${phone ? 'phone' : 'desktop'}.png` });
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : le mode et le Pacte de sang
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'sacrieur', level: 6, spec: 'ecorche' }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    check(await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Endurance')), 'en combat, le bandeau annonce le mode Endurance');
    check(await page.$('.fighter .mode-chip') !== null, 'la carte du héros montre aussi son mode');
    const pacte = '.hb-class .slot-btn';
    check(/Pacte de sang/.test(await page.$eval('.hb-class', (e) => e.textContent)), 'le Pacte de sang est dans le bloc « Classe »');
    check((await page.$eval(`${pacte} .slot-pa`, (e) => e.textContent)) === '0', 'la 1re utilisation affiche 0 PA');
    // Sur téléphone, le 1er toucher d'un sort montre son détail et le 2e le lance (comportement du jeu) : on touche jusqu'à ce que ce soit lancé.
    const castPacte = async () => {
      if (!phone) { await page.click(pacte); await sleep(500); return; }
      await page.tap(pacte);
      await sleep(250);
      if (await page.$('.hb-class .slot.is-selected')) await page.tap(pacte);
      await sleep(500);
    };
    const paBefore = await page.$$eval('.flame.on', (e) => e.length);
    await castPacte();
    check(await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Fureur')), 'après le Pacte de sang : mode Fureur');
    check((await page.$$eval('.flame.on', (e) => e.length)) === paBefore, 'sans avoir dépensé de PA');
    check((await page.$eval(`${pacte} .slot-pa`, (e) => e.textContent)) === '1', 'la deuxième utilisation affiche 1 PA');
    await castPacte();
    check(await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Endurance')), 'une seconde bascule revient en Endurance');
    check((await page.$$eval('.flame.on', (e) => e.length)) === paBefore - 1, 'et a coûté 1 PA');
    check((await page.$$('.hb-deck .slot-btn')).length >= 1, 'les sorts du deck sont là');
    await page.screenshot({ path: `${out}/sacrieur-combat-${phone ? 'phone' : 'desktop'}.png` });
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Sacrieur : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
