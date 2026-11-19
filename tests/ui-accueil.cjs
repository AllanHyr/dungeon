// Test de l'ACCUEIL dans un vrai navigateur : premier pas (aucun héros), choix d'une classe, équipe, verdict de chaque donjon,
// difficulté, onglet farm, et la mise en page sur grand écran, tablette et téléphone.
// Usage : node tests/ui-accueil.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
  };
  // Le jeu, vu de l'intérieur : on s'en sert pour fabriquer vite des héros ou changer leur niveau (comme le ferait une longue partie).
  const inGame = (page, fn, arg) => page.evaluate(async ([src, a]) => {
    const state = await import('/src/ui/state.js');
    const ctrl = await import('/src/ui/controller.js');
    return await (new Function('state', 'ctrl', 'a', `return (${src})(state, ctrl, a)`))(state, ctrl, a);
  }, [fn.toString(), arg]);
  const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const tagText = async (page, sel) => (await page.$$eval(sel, (els) => els.map((e) => e.textContent.trim())));

  // ============================================================
  console.log('\n● Grand écran : le premier pas');
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  watch(page, 'bureau');
  await page.goto(url);
  await page.waitForSelector('.menu');
  check(!!(await page.$('.welcome')), 'sans héros, la page ne propose qu\'une chose : « Bienvenue »');
  check((await page.$$('.welcome .class-card')).length === 8, 'les 8 classes sont présentées, avec leur rôle et leur description');
  check(!(await page.$('.view-switch')) && !(await page.$('.home-grid')) && !(await page.$('.launch-bar')), 'ni onglets, ni choix de donjon, ni bouton de lancement tant qu\'il n\'y a pas de héros');
  await page.screenshot({ path: `${out}/120-accueil-bienvenue.png` });

  await page.click('.welcome .class-card:has-text("Assassin")');
  await page.waitForSelector('.modal #new-char-name');
  check((await page.textContent('.modal .class-card.selected')).includes('Assassin'), 'cliquer une classe ouvre la création avec CETTE classe déjà choisie');
  // La présentation de la classe choisie : sort de classe, sorts de départ, trois spécialisations avec leur ultime
  const show = await page.$eval('.class-showcase', (e) => ({ id: e.dataset.classId, text: e.textContent, specs: e.querySelectorAll('.cs-spec').length, spells: e.querySelectorAll('.cs-spells li').length, roles: [...e.querySelectorAll('.cs-role')].map((r) => r.textContent) }));
  check(show.id === 'assassin' && /Marque mortelle/.test(show.text) && show.specs === 3 && show.spells >= 4 && /Ultime/.test(show.text), `la présentation de l'Assassin : sort de classe, ${show.spells} sorts de départ, ${show.specs} spécialisations et leur ultime`);
  check(show.roles.join() === 'Dégâts', `ses rôles : ${show.roles.join(', ')}`);
  await page.click('.modal .class-card:has-text("Druide")');
  await page.waitForSelector('.class-showcase[data-class-id="druide"]');
  const dru = await page.$eval('.class-showcase', (e) => ({ modes: e.querySelectorAll('.cs-modes li').length, text: e.textContent, roles: [...e.querySelectorAll('.cs-role')].map((r) => r.textContent) }));
  check(dru.modes === 4 && /Ses formes/i.test(dru.text) && dru.roles.join() === 'Tank,Soin,Dégâts', `le Druide présente ses 4 formes et ses rôles (${dru.roles.join(', ')})`);
  check((await page.$eval('#new-char-name', (i) => i.placeholder)).includes('Druide'), 'le nom par défaut suit la classe choisie');
  await page.click('.modal .class-card:has-text("Assassin")');
  await page.waitForSelector('.class-showcase[data-class-id="assassin"]');
  await page.fill('#new-char-name', 'Zéphyr');
  await page.click('text=Créer le personnage');
  await page.waitForSelector('.place-nav');
  check(!!(await page.$('.nav-place.on[data-place="camp"]')) && (await page.$$('.nav-place')).length === 5, 'le premier héros créé : on arrive au Camp, avec la barre des cinq lieux');
  check(!!(await page.$('.camp-next')) && /Caves/.test(await page.textContent('.camp-next')), 'le Camp conseille un premier donjon (les Caves humides)');
  await page.click('#camp-go');
  await page.waitForSelector('.home-grid');
  check(!!(await page.$('.nav-place.on[data-place="aventure"]')), '« Préparer l\'expédition » mène à l\'Aventure, donjon choisi');
  check((await page.$$('.hero-card')).length === 1 && !!(await page.$('.hero-card.selected')), 'le héros créé est tout de suite dans l\'équipe');
  check((await page.textContent('.hero-card .pick-mark')).trim() === '1', 'la case en haut à droite de la fiche porte son numéro dans l\'équipe');
  check((await page.textContent('.launch-who')).trim() === 'Zéphyr' && !(await page.$eval('.launch-bar .btn-primary', (b) => b.disabled)), 'la barre du bas dit qui part, et le bouton est prêt');

  console.log('\n● Ce qu\'il y a à faire pour un héros');
  check((await page.$$('.hero-tag-skill')).length === 0, 'un héros niveau 1 n\'a rien à choisir : pas d\'étiquette');
  // Niveau 4 : sa spécialisation s'ouvre, l'accueil le signale
  await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); const { redraw } = await import('/src/ui/controller.js'); app.profile.characters[0].level = 4; redraw(); });
  await page.waitForSelector('.hero-tag-skill');
  check((await tagText(page, '.hero-tag-skill')).some((t) => /Spécialisation à choisir/.test(t)), 'un héros dont la spécialisation est ouverte le montre (« Spécialisation à choisir »)');
  await page.click('.hero-tag-skill');
  await page.waitForSelector('.sheet-modal');
  check(!!(await page.$('.sheet-modal .tab.on[data-tab="skills"]')), 'cliquer dessus ouvre sa fiche directement sur les compétences');
  await page.keyboard.press('Escape');
  check((await page.$$('.loot-btn')).length === 0, 'pas d\'étiquette « Récompense à choisir » tant qu\'aucune session de farm n\'en a laissé une');

  console.log('\n● L\'équipe et le verdict de chaque donjon');
  for (const [classId, name] of [['sacrieur', 'Thorne'], ['pretre', 'Kael']]) {
    await page.click('.new-card');
    await page.waitForSelector('#new-char-name');
    await page.click(`.modal .class-card:has-text("${classId === 'sacrieur' ? 'Sacrieur' : 'Prêtre'}")`);
    await page.fill('#new-char-name', name);
    await page.click('text=Créer le personnage');
    await page.waitForFunction((n) => document.querySelectorAll('.hero-card').length === n, name === 'Thorne' ? 2 : 3);
  }
  check((await tagText(page, '.hero-card .pick-mark')).join(',') === '1,2,3', 'trois héros choisis : numérotés 1, 2, 3');
  check(/3 sur 4/.test(await page.textContent('.home-heroes h2')), '« 3 sur 4 dans l\'équipe »');
  const fits = await tagText(page, '.tranche-card .fit');
  check(fits.length === 7 && /Adapté/.test(fits[0]) && fits.slice(1).every((f) => /Très dangereux/.test(f)), `chaque donjon a son verdict pour l'équipe : le premier convient, ceux des niveaux 4 et 8 sont très dangereux (${fits.join(' | ')})`);
  check(/12, 16 et 20/.test(await page.textContent('.locked-note')), 'les donjons verrouillés tiennent sur une ligne (« Bientôt : 12, 16 et 20 »)');
  await page.click('.tranche-card:has-text("Crypte")');
  check(!!(await page.$('.tranche-card.selected:has-text("Crypte")')) && !!(await page.$('.danger-deadly')), 'choisir un donjon dangereux affiche l\'avertissement détaillé');
  check(!!(await page.$('.launch-bar .fit-deadly')), 'et la barre du bas le rappelle juste avant de lancer');
  // les héros gagnent des niveaux : les verdicts suivent
  await inGame(page, (state, ctrl) => { state.app.profile.characters.forEach((c) => { c.level = 6; }); ctrl.redraw(); });
  const fits6 = await tagText(page, '.tranche-card .fit');
  check(fits6.slice(0, 4).every((f) => /Adapté/.test(f)) && fits6.slice(4).every((f) => /Risqué/.test(f)), `au niveau 6 : les donjons des niveaux 1 et 4 conviennent, ceux du niveau 8 sont risqués (${fits6.join(' | ')})`);
  const notes = await tagText(page, '.danger li');
  check(notes.length === 1 && /Zéphyr, Thorne et Kael joueront au niveau effectif 4/.test(notes[0]), `les remarques identiques sont regroupées en une phrase (« ${notes[0]} »)`);
  await page.screenshot({ path: `${out}/121-accueil-equipe.png` });

  console.log('\n● La difficulté');
  check((await page.$$('.mode-opt')).length === 3 && !!(await page.$('.mode-opt.on:has-text("Tranche")')), 'trois positions, « Tranche » par défaut');
  check(await page.$eval('.mode-opt[data-mode="stasis"]', (b) => b.disabled), 'hors ligne, le Stasis est grisé (il se joue à plusieurs)');
  check(/Stasis.*plusieurs/.test(await page.textContent('.mode-multi-note')), 'une note explique pourquoi');
  await page.click('.mode-opt:has-text("Basic")');
  check(!(await page.$('.stasis-levels')) && /restriction/i.test(await page.textContent('.mode-desc')), 'Basic explique ce qu\'il change');
  await page.click('.mode-opt:has-text("Tranche")');

  console.log('\n● Choisir ses héros');
  await page.click('.hero-card:has-text("Zéphyr")');
  check((await tagText(page, '.hero-card .pick-mark')).join(',') === ',1,2', 'décocher un héros renumérote les autres');
  await page.click('.hero-card:has-text("Zéphyr")');
  check((await tagText(page, '.hero-card .pick-mark')).join(',') === '3,1,2', 'le recocher le met en dernier');
  await inGame(page, async (state, ctrl) => {
    for (const [name, classId] of [['Quatre', 'guerrier'], ['Cinq', 'guerrier']]) await ctrl.characterAction({ type: 'CHAR_CREATE', name, classId });
    ctrl.redraw();
  });
  await page.click('.hero-card:has-text("Quatre")');
  await page.click('.hero-card:has-text("Cinq")');
  check(/4 héros au maximum/.test(await page.textContent('#toast')) && (await page.$$('.hero-card.selected')).length === 4, 'une équipe compte 4 héros au maximum, et le jeu le dit');
  for (const name of ['Zéphyr', 'Thorne', 'Kael', 'Quatre']) await page.click(`.hero-card:has-text("${name}")`);
  check((await page.$$('.hero-card.selected')).length === 0 && /au moins un héros/i.test(await page.textContent('.launch-who')) && (await page.$eval('.launch-bar .btn-primary', (b) => b.disabled)), 'sans héros choisi : le bouton est grisé et la barre dit pourquoi');
  check(/Choisis au moins un héros/.test(await page.textContent('.danger, .home-plan')) && (await page.$$('.tranche-card .fit')).length === 0, 'et les verdicts attendent qu\'on choisisse quelqu\'un');

  console.log('\n● La mise en page sur grand écran');
  await page.click('.hero-card:has-text("Zéphyr")');
  const heroesBox = await (await page.$('.home-heroes')).boundingBox();
  const planBox = await (await page.$('.home-plan')).boundingBox();
  check(heroesBox.x + heroesBox.width <= planBox.x + 1 && Math.abs(heroesBox.y - planBox.y) < 4, 'les héros à gauche, le donjon à droite, côte à côte');
  const launchBox = await (await page.$('.launch-bar .btn-primary')).boundingBox();
  check(launchBox.y >= 0 && launchBox.y + launchBox.height <= 900, 'le bouton de lancement est toujours visible, sans défiler');
  check((await page.$$eval('.nav-foot-btn > span:last-child', (els) => els.length === 3 && els.every((e) => e.offsetParent !== null))), 'en bas de la barre des lieux : Atelier, Sauvegarde et Sons, avec leur texte');

  console.log('\n● La zone de farm solo');
  await page.click('[data-view="farm"]');
  await page.waitForSelector('.zone-card');
  check(/Ton héros/.test(await page.textContent('.home-heroes h2')) && (await page.$$('.hero-card.selected')).length === 1, 'un seul héros à la fois');
  await page.click('.hero-card:has-text("Kael")');
  check(!!(await page.$('.hero-card.selected:has-text("Kael")')) && (await page.$$('.hero-card.selected')).length === 1, 'en choisir un autre déplace le choix');
  check((await page.$$('.loot-btn')).length === 0, 'aucune récompense en attente : pas d\'étiquette au farm non plus');
  check((await page.$$('.zone-chip')).length === 4 && !(await page.$eval('.zone-more', (d) => d.open)), 'la zone tient en quatre puces ; le détail se déplie à la demande');
  await page.click('.zone-more summary');
  check(await page.$eval('.zone-more', (d) => d.open), '« Comment ça marche ? » déplie les règles de la zone');
  check(/Entrer dans la zone/.test(await page.textContent('#farm-launch')) && !(await page.$eval('#farm-launch', (b) => b.disabled)), 'le bouton parle de la zone, et il est prêt');
  await page.screenshot({ path: `${out}/122-accueil-farm.png` });
  await page.click('[data-view="dungeon"]');
  await page.waitForSelector('.dungeon-list');
  check(/Lancer la run/.test(await page.textContent('.launch-bar .btn-primary')), 'revenir au donjon rend le bon bouton');
  const aucunScroll = await overflowX(page);
  check(aucunScroll === 0, 'pas de défilement horizontal');

  // ============================================================
  console.log('\n● Tablette');
  const tab = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, locale: 'fr-FR' });
  const tablet = await tab.newPage();
  watch(tablet, 'tablette');
  await tablet.goto(url);
  await tablet.waitForSelector('.menu');
  await inGame(tablet, async (state, ctrl) => {
    for (const [name, classId] of [['Aldric', 'sacrieur'], ['Lysa', 'pretre'], ['Borin', 'assassin']]) await ctrl.characterAction({ type: 'CHAR_CREATE', name, classId });
    state.app.ui.team = state.app.profile.characters.map((c) => c.id);
    state.app.ui.place = 'aventure';
    ctrl.redraw();
  });
  const tb1 = await (await tablet.$('.home-heroes')).boundingBox();
  const tb2 = await (await tablet.$('.home-plan')).boundingBox();
  check(tb2.y >= tb1.y + tb1.height - 1 && Math.abs(tb1.x - tb2.x) < 2, 'une seule colonne : le donjon sous les héros');
  const cardsX = new Set((await tablet.$$eval('.hero-card', (els) => els.map((e) => Math.round(e.getBoundingClientRect().x)))));
  check(cardsX.size === 2, 'les fiches des héros se rangent sur deux colonnes');
  check((await overflowX(tablet)) === 0, 'pas de défilement horizontal');
  await tablet.screenshot({ path: `${out}/123-accueil-tablette.png` });

  // ============================================================
  console.log('\n● Téléphone');
  const pctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const phone = await pctx.newPage();
  watch(phone, 'téléphone');
  await phone.goto(url);
  await phone.waitForSelector('.welcome');
  check((await overflowX(phone)) === 0, 'bienvenue : pas de défilement horizontal');
  await phone.screenshot({ path: `${out}/124-accueil-bienvenue-tel.png`, fullPage: true });
  // Le vrai bouton, tout en bas de la page de bienvenue : on arrive ensuite sur l'accueil par le HAUT de la page.
  await phone.click("text=Créer 3 héros d'exemple");
  await phone.waitForSelector('.place-nav');
  check((await phone.evaluate(() => window.scrollY)) === 0, 'passer de « Bienvenue » à l\'accueil remet la page en haut (même après avoir défilé jusqu\'au bouton)');
  const nav = await (await phone.$('.place-nav')).boundingBox();
  check(Math.abs(nav.y + nav.height - 844) < 2 && nav.height < 80, `sur téléphone, la barre des lieux est en bas de l'écran (${Math.round(nav.height)} px)`);
  check((await overflowX(phone)) === 0, 'le Camp : pas de défilement horizontal');
  await phone.click('.nav-place[data-place="aventure"]');
  await phone.waitForSelector('.home-grid');
  const tabs = await phone.$$eval('.view-tab', (els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
  check(tabs.length === 3 && tabs.every((y) => y === tabs[0]), 'les trois onglets côte à côte');
  check(!(await phone.$eval('.hero-card .char-stats', (e) => e.offsetParent !== null)), 'les fiches de héros sont raccourcies (pas de ligne de stats)');
  const heroH = await phone.$$eval('.hero-card', (els) => Math.max(...els.map((e) => e.getBoundingClientRect().height)));
  check(heroH < 140, `une fiche de héros fait moins de 140 px de haut (${Math.round(heroH)} px)`);
  const bar = await (await phone.$('.launch-bar')).boundingBox();
  check(Math.abs(bar.y + bar.height - nav.y) < 3, 'la barre de lancement est posée juste au-dessus de la barre des lieux');
  const total = await phone.evaluate(() => document.documentElement.scrollHeight);
  check(total < 2000, `toute la page tient en ${Math.round(total / 844 * 10) / 10} écrans (elle en faisait 3,3 avant)`);
  check((await overflowX(phone)) === 0, 'accueil : pas de défilement horizontal');
  await phone.screenshot({ path: `${out}/125-accueil-tel.png`, fullPage: true });
  await phone.click('[data-view="farm"]');
  await phone.waitForSelector('.zone-card');
  check((await overflowX(phone)) === 0, 'farm : pas de défilement horizontal');
  await phone.screenshot({ path: `${out}/126-accueil-farm-tel.png`, fullPage: true });

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test de l\'accueil : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
