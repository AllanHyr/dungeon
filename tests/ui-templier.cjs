// Test du Templier dans un vrai navigateur : fiche (sort de classe, spécialisations, sorts évolués, palier 8), puis combat
// (puissance sacrée dans le bandeau, sorts consommateurs grisés, Aura sacrée gratuite puis payante, aura visible sur les alliés). Bureau et téléphone.
// Usage : node tests/ui-templier.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false, place: 'aventure' }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Foi', classId: 'templier', level: 6, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Lumen', classId: 'templier', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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
    check(await page.$('.char-card:has-text("Foi") .hero-tag-skill:not(.hero-tag-choice)') === null, "l'accueil n'annonce pas de points de compétence à dépenser (rien à acheter)");
    await page.click('.char-card:has-text("Foi") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    check(/Aura sacrée/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est l\'Aura sacrée');
    const deck0 = await page.$$eval('.deck-frame .deck-slot.is-filled', (els) => els.map((e) => e.dataset.deckSkill));
    check(deck0.join() === 'templier_frappe,templier_benediction,templier_verdict,templier_eclat', `deck de départ : 2 générateurs puis 2 consommateurs (${deck0.join(', ')})`);
    check((await page.$$('.spec-card')).length === 3, 'trois spécialisations : Gardien, Lumière, Vindicte');
    for (const id of ['gardien', 'lumiere', 'vindicte']) {
      check((await page.$$(`.spec-card[data-spec-id="${id}"] .spec-give`)).length >= 4, `la carte « ${id} » annonce ses paliers (niveau 4, 8, 12, 20)`);
    }
    check(/Avatar de lumière/.test(await page.$eval('.spec-card[data-spec-id="gardien"]', (e) => e.textContent)), "l'ultime du Gardien est annoncé (Avatar de lumière)");
    check(/Colère divine/.test(await page.$eval('.spec-card[data-spec-id="vindicte"]', (e) => e.textContent)), "l'ultime de la Vindicte est annoncé (Colère divine)");

    await page.click('.spec-card[data-spec-id="gardien"]');
    await sleep(350);
    check((await saved()).spec === 'gardien', 'Gardien est enregistrée');
    for (const id of ['templier_armure_foi', 'templier_main_protection', 'templier_frappe_gardien', 'templier_verdict_gardien', 'templier_defi_gardien']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'known', `${id} est débloquée automatiquement`);
    }
    check(await page.$eval('.spell-card[data-skill="templier_frappe"] .sc-name', (e) => e.textContent) === 'Frappe du gardien', 'la barre propose la Frappe du gardien à la place de la Frappe sacrée');
    check(await page.$eval('.spell-card[data-skill="templier_verdict"] .sc-name', (e) => e.textContent) === 'Verdict du gardien', 'et le Verdict du gardien');
    check(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('is-locked')), 'le palier 8 est fermé à un héros de niveau 6');
    await page.click('.spec-card[data-spec-id="vindicte"]');
    await sleep(350);
    check(await page.$eval('.spell-card[data-skill="templier_verdict"] .sc-name', (e) => e.textContent) === 'Verdict vengeur', 'Vindicte : le Verdict devient le Verdict vengeur');
    check(await page.$('.talent-card[data-skill="templier_armure_foi"]') === null, 'les talents du Gardien ne sont plus affichés');
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/templier-fiche-${phone ? 'phone' : 'desktop'}.png` });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Niveau 8 : un seul choix parmi trois, qu'on peut changer
    await page.click('.char-card:has-text("Lumen") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(300);
    await page.click('.spec-card[data-spec-id="lumiere"]');
    await sleep(350);
    check(await page.$eval('.tier-block[data-level="8"]', (e) => e.classList.contains('needs-choice')), 'le palier 8 est mis en évidence : un choix est à faire');
    for (const id of ['templier_source_vie', 'templier_miracle', 'templier_priere']) {
      check(await page.$eval(`.talent-card[data-skill="${id}"]`, (n) => n.dataset.state) === 'ready', `${id} : un des trois choix du niveau 8`);
    }
    await page.click('.talent-card[data-skill="templier_miracle"]');
    await sleep(300);
    check((await saved('c2')).skills.includes('templier_miracle'), 'Miracle est choisi');
    await page.click('.talent-card[data-skill="templier_source_vie"]');
    await sleep(300);
    const c2 = await saved('c2');
    check(c2.skills.includes('templier_source_vie') && !c2.skills.includes('templier_miracle'), 'Source de vie remplace Miracle (gratuit)');
    check(await page.$('.passive-item[data-skill="templier_source_vie"]') !== null, 'le talent passif choisi apparaît dans les passifs toujours actifs');
    await page.evaluate(() => document.querySelector('.tier-block[data-level="8"]')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/templier-palier8-${phone ? 'phone' : 'desktop'}.png` });
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Combat : puissance sacrée, Aura sacrée, aura visible sur l'allié
    await page.evaluate(async () => {
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'templier', level: 6, spec: 'gardien' }, { classId: 'pretre', level: 6 }], { dummy: 'mannequin', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.hotbar .hb-class');
    await sleep(400);
    // (le Templier joue en premier ou après le Veilleur : on passe le tour du Prêtre si besoin)
    for (let i = 0; i < 4 && !/Templier/i.test(await page.$eval('.dock-name', (e) => e.textContent)); i++) {
      await page.click('.end-turn');
      await sleep(900);
    }
    check(/Templier/i.test(await page.$eval('.dock-name', (e) => e.textContent)), 'c\'est au tour du Templier');
    const btn = (name) => `.skill-btn[aria-label^="${name}"]`;
    const castOn = async (name, targetSel = '.fighter.monster.targetable') => {
      const sel = btn(name);
      if (!phone) await page.click(sel);
      else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); }
      await sleep(300);
      if (await page.$(targetSel)) { await (phone ? page.tap(targetSel) : page.click(targetSel)); }
      await sleep(500);
    };
    const sacre = () => page.$$eval('.dock .resource[data-res="sacre"] .pip.on', (e) => e.length);
    const pa = () => page.$$eval('.flame.on', (e) => e.length);

    check((await page.$$('.dock .resource[data-res="sacre"] .pip')).length === 5, 'la puissance sacrée est affichée dans le bandeau : 5 points');
    check(/Puissance sacrée/.test(await page.$eval('.dock .resource[data-res="sacre"]', (e) => e.textContent)), 'avec son nom');
    check((await sacre()) === 0, 'à 0 au début du combat');
    check(await page.$('.fighter.player.active .resource[data-res="sacre"], .fighter.player:has(.f-name:has-text("Templier")) .resource[data-res="sacre"]') !== null, 'et sur la carte du Templier');
    check(await page.$eval(btn('Verdict du gardien'), (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('is-disabled')), 'le Verdict (3 puissance sacrée) est grisé tant qu\'il en manque');
    check(await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Aura de protection')), 'le bandeau annonce l\'Aura de protection');
    if (!phone) { // (au survol, le détail du sort dit ce qu'il coûte, avec le NOM de la ressource)
      await page.hover('.hb-deck .slot:has(' + btn('Verdict du gardien') + ')');
      await sleep(250);
      const meta = await page.$eval('.sd-meta', (e) => e.textContent);
      check(/coûte 3 Puissance sacrée/.test(meta) && !/sacre\b/.test(meta), `le détail du Verdict nomme la ressource (« ${meta} »)`);
      await page.mouse.move(5, 5);
      await sleep(150);
    }
    check((await page.$eval('.hb-class .slot-pa', (e) => e.textContent)) === '0', 'l\'Aura sacrée affiche 0 PA la première fois');

    const pa0 = await pa();
    await castOn('Frappe du gardien');
    check((await sacre()) === 1, 'la Frappe du gardien donne 1 puissance sacrée');
    check((await pa()) === pa0 - 3, 'et coûte 3 PA');
    // On charge la barre à la main pour tester le consommateur
    await page.evaluate(async () => {
      const { app } = await import('/src/ui/state.js');
      const { redraw } = await import('/src/ui/controller.js');
      app.run.players[0].resources.sacre = 3;
      redraw();
    });
    await sleep(300);
    check((await sacre()) === 3, 'la barre se remplit (3 points)');
    check(!(await page.$eval(btn('Verdict du gardien'), (b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('is-disabled'))), 'le Verdict est de nouveau disponible');
    await castOn('Verdict du gardien');
    check((await sacre()) === 0, 'le Verdict dépense les 3 points');

    // L'Aura sacrée : un clic ouvre le choix des trois auras ; gratuite la 1re fois ; l'aura touche TOUTE l'équipe et l'allié la voit
    const pa1 = await pa();
    const tapOrClick = (sel) => (phone ? page.tap(sel) : page.click(sel));
    const openAura = async () => {
      const sel = btn('Aura sacrée');
      if (!phone) await page.click(sel);
      else { await page.tap(sel); await sleep(250); if (await page.$('.slot.is-selected')) await page.tap(sel); }
      await sleep(300);
    };
    await openAura();
    check(await page.$('.sd-modes') !== null, 'un clic sur l\'Aura sacrée ouvre le choix des auras (rien n\'est lancé tout de suite)');
    check((await pa()) === pa1 && await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Aura de protection')), 'tant qu\'on n\'a pas choisi, rien ne change');
    const auras = await page.$$eval('.sd-modes .mode-opt', (els) => els.map((e) => ({ id: e.dataset.mode, current: e.classList.contains('is-current'), disabled: e.disabled, text: e.textContent.replace(/\s+/g, ' ').trim() })));
    check(auras.map((o) => o.id).join() === 'protection,vengeance,devotion', `trois auras proposées : ${auras.map((o) => o.id).join(', ')}`);
    check(auras[0].current && auras[0].disabled && /actuelle/.test(auras[0].text), 'l\'aura actuelle est signalée et ne se rechoisit pas');
    check(/Gratuit cette fois/.test(await page.$eval('.sd-modes-head', (e) => e.textContent)), 'le panneau dit que c\'est gratuit la première fois');
    check((await page.$$eval('.sd-modes .mode-opt svg', (e) => e.length)) === 3, 'chaque aura a son icône');
    await page.screenshot({ path: `${out}/templier-choix-aura-${phone ? 'phone' : 'desktop'}.png` });
    // Annuler : rien ne change
    await page.keyboard.press('Escape');
    await sleep(200);
    check(await page.$('.sd-modes') === null && await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Aura de protection')), 'Échap referme le choix sans rien changer');
    // On saute la Vengeance : directement la Dévotion
    await openAura();
    await tapOrClick('.sd-modes .mode-opt[data-mode="devotion"]');
    await sleep(500);
    check(await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Aura de dévotion')), 'après le choix : Aura de dévotion, directement');
    check((await pa()) === pa1, 'la 1re utilisation ne coûte aucun PA');
    check(await page.$('.sd-modes') === null, 'le choix se referme');
    const ally = '.fighter.player:has(.f-name:has-text("Prêtre"))';
    check(await page.$(`${ally} .fx-chip:has-text("Aura de dévotion")`) !== null, 'le Prêtre porte une pastille « Aura de dévotion » sur sa carte');
    // La 2e fois coûte 1 PA
    check((await page.$eval('.hb-class .slot-pa', (e) => e.textContent)) === '1', 'la deuxième utilisation affiche 1 PA');
    // (il ne reste qu'1 PA : on en redonne pour que le tour ne se termine pas tout seul quand le dernier est dépensé)
    await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); const { redraw } = await import('/src/ui/controller.js'); app.run.players[0].pa = 4; redraw(); });
    await sleep(250);
    const pa2 = await pa();
    await openAura();
    check(/1 PA/.test(await page.$eval('.sd-modes-head', (e) => e.textContent)), 'le panneau annonce le coût : 1 PA');
    await tapOrClick('.sd-modes .mode-opt[data-mode="vengeance"]');
    await sleep(500);
    check(await page.$eval('.dock .mode-chip', (e) => e.textContent.includes('Aura de vengeance')) && (await pa()) === pa2 - 1, 'Aura de vengeance, pour 1 PA');
    check(await page.$(`${ally} .fx-chip:has-text("Aura de vengeance")`) !== null, 'et le Prêtre la porte aussitôt');
    await page.click(ally);
    await sleep(250);
    const panel = await page.$eval('.fx-panel', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Aura de vengeance de Templier/.test(panel) && /Dégâts infligés \+8 %/.test(panel), `le panneau d'effets explique l'aura : « ${panel.slice(0, 160)} »`);
    await page.screenshot({ path: `${out}/templier-combat-${phone ? 'phone' : 'desktop'}.png` });
    await page.click('.fx-panel button:has-text("Revenir")');
    await sleep(150);
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test du Templier : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
