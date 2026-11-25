// Test du Sacrieur dans un vrai navigateur : fiche (sort de classe, deck, spécialisations automatiques, pas de points à dépenser),
// puis combat (mode Endurance / Fureur, Pacte de sang gratuit la 1re fois, puis 1 PA). Bureau et téléphone.
// Usage : node tests/ui-sacrieur.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 2, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
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
    check(await page.$('.char-card:has-text("Sang") .hero-tag-skill:not(.hero-tag-choice)') === null, "l'accueil n'annonce pas de points de compétence à dépenser (rien à acheter)");
    await page.click('.char-card:has-text("Sang") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    check((await page.$eval('.sheet-modal .tab[data-tab="skills"] .tab-badge', (e) => e.textContent)) === '5', "une pastille : 5 points de talent à répartir");
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);

    check(await page.$('.sk-points') === null, 'pas de compteur de points de compétence');
    check(/Pacte de sang/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est le Pacte de sang');
    check(/Attaque à l'arme/.test(await page.$eval('[data-fixed="Corps à corps"]', (e) => e.textContent)), "le corps à corps basique est l'Attaque à l'arme");
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'sacrieur_entaille,sacrieur_morsure,sacrieur_punition,sacrieur_carapace', `deck de départ : ${deck0.join(', ')}`);
    check((await page.$$('.tt-tree')).length === 3 && await page.$('.spec-card') === null, 'trois arbres de talents : Bastion, Équilibre, Écorché');
    check((await page.$eval('.tt-budget .tt-free', (e) => e.textContent)) === '5', 'niveau 6 : 5 points à répartir (1 par niveau dès le niveau 2)');
    const treeTab = async (id) => { if (phone) { await page.click(`[data-tree-tab="${id}"]`); await sleep(150); } };
    for (const id of ['bastion', 'equilibre', 'ecorche']) {
      await treeTab(id);
      check((await page.$$(`.tt-tree[data-tree="${id}"] .tt-row:not(.is-upcoming)`)).length === 4, `l'arbre « ${id} » a 4 rangées de talents`);
      check((await page.$$(`.tt-tree[data-tree="${id}"] .tt-row.is-upcoming`)).length === 2, `et annonce ses deux rangées « à venir » (9 points, ultime à 15)`);
    }
    await treeTab('bastion');
    check(/Forteresse/.test(await page.$eval('.tt-tree[data-tree="bastion"]', (e) => e.textContent)), "l'ultime du Bastion est annoncé (Forteresse)");
    check(await page.$eval('.tt-talent[data-talent="sacrieur_sacrifice"]', (n) => n.dataset.state) === 'locked', 'Sacrifice attend 2 points dans le Bastion');

    // Mettre des points : la rangée s'ouvre, un sort s'équipe
    for (let i = 0; i < 3; i++) { await page.click('.tt-talent[data-talent="sacrieur_peau_epaisse"] .tt-plus'); await sleep(150); }
    check((await saved()).talents.join() === 'sacrieur_peau_epaisse,sacrieur_peau_epaisse,sacrieur_peau_epaisse', 'trois points dans Peau épaisse, enregistrés dans l\'ordre');
    check(await page.$eval('.tt-talent[data-talent="sacrieur_peau_epaisse"]', (n) => n.dataset.state) === 'maxed', 'Peau épaisse est au rang maximal (3/3)');
    check(await page.$('.tt-talent[data-talent="sacrieur_peau_epaisse"] .tt-plus[disabled]') !== null, 'son « + » est grisé');
    check(await page.$eval('.tt-talent[data-talent="sacrieur_sacrifice"]', (n) => n.dataset.state) === 'available', 'la rangée de Sacrifice est ouverte');
    await page.click('.tt-talent[data-talent="sacrieur_sacrifice"] .tt-plus');
    await sleep(200);
    await page.click('.tt-talent[data-talent="sacrieur_dernier_souffle"] .tt-plus');
    await sleep(200);
    check((await saved()).talents.length === 5 && (await page.$eval('.tt-budget .tt-free', (e) => e.textContent)) === '0', 'les 5 points sont mis');
    check(await page.$eval('.tt-talent[data-talent="sacrieur_punition_bastion"]', (n) => n.dataset.state) === 'locked', 'la Punition protectrice attend 6 points (niveau 7)');
    check(!(await saved()).skills.includes('sacrieur_sacrifice'), 'les talents ne sont pas des compétences « apprises »');
    await page.click('.tt-talent[data-talent="sacrieur_peau_epaisse"] .tt-pick');
    await sleep(200);
    check(/plus bas/.test(await page.$eval('.tt-detail', (e) => e.textContent)) || await page.$('.tt-detail .btn:not(.btn-primary)[disabled]') !== null, 'retirer la Peau est impossible : Sacrifice en a besoin');
    check(await page.$('.passive-item[data-skill="sacrieur_dernier_souffle"]') !== null, 'Dernier souffle apparaît dans les passifs toujours actifs');
    check(/rang 3\/3/.test(await page.$eval('.passive-item[data-skill="sacrieur_peau_epaisse"]', (e) => e.textContent)), 'avec le rang de Peau épaisse');
    // Remplacer un sort de la barre par Sacrifice
    await page.click('.deck-slot[data-deck-skill="sacrieur_carapace"]');
    await sleep(250);
    await page.click('.spell-card[data-deck-toggle="sacrieur_sacrifice"]');
    await sleep(300);
    check((await saved()).deck.includes('sacrieur_sacrifice'), 'Sacrifice est équipé dans la barre');
    await page.evaluate(() => document.querySelector('.sec-tt')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/sacrieur-fiche-${phone ? 'phone' : 'desktop'}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : « Répartir pour moi », le talent clé, l'exclusion des Punitions
    await page.click('.char-card:has-text("Rubis") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    await treeTab('ecorche');
    await page.click('.tt-preset[data-preset="ecorche"]');
    await sleep(350);
    const c2 = await saved('c2');
    check(c2.talents.length === 7 && c2.talents.includes('sacrieur_punition_ecorche'), '« Répartir pour moi » : 7 points dans l\'Écorché, jusqu\'à la Punition sanglante');
    check(await page.$eval('.spell-card[data-skill="sacrieur_punition"] .sc-name', (e) => e.textContent) === 'Punition sanglante', 'la barre montre la Punition évoluée');
    check(await page.$('.tt-tree[data-tree="ecorche"].is-main') !== null, 'l\'Écorché est l\'arbre principal');
    check(await page.$('.tt-talent[data-talent="sacrieur_frenesie"] .tt-minus[disabled]') !== null, 'Frénésie ne peut pas être retirée : la Punition sanglante a besoin de ses 6 points');
    check(await page.$('.tt-talent[data-talent="sacrieur_punition_ecorche"] .tt-minus:not([disabled])') !== null, 'la Punition, tout en bas, peut l\'être');
    await page.click('.sec-tt .sec-head .btn');
    await sleep(200);
    await page.click('.confirm-layer .btn-primary');
    await sleep(300);
    check((await saved('c2')).talents.length === 0, '« Tout retirer » rend tous les points');
    await page.evaluate(() => document.querySelector('.sec-tt')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/sacrieur-talents-${phone ? 'phone' : 'desktop'}.png` });
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
