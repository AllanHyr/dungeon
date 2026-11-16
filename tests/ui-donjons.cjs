// Test des DONJONS À THÈME dans un vrai navigateur : le choix du donjon (rangés par tranche), « à savoir », l'encyclopédie (bestiaire avec les
// particularités des monstres, butin exclusif), puis une partie dans le donjon choisi et les particularités visibles en combat. Bureau et téléphone.
// Usage : node tests/ui-donjons.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 4, settings: { sound: false }, lastTeam: ['c1', 'c2', 'c3'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Foi', classId: 'templier', level: 8, xp: 0, skills: [], inventory: [],
      equipment: { neck: { uid: 'a', id: 'dent_d_ogre' }, head: { uid: 'b', id: 'marmite_cabossee' } },
      stats: { runs: 3, wins: 2, deaths: 0, dungeons: { gouffre_aux_ogres: 2 }, bestiary: { ogre_brise_os: 5, roi_ogre: 2 }, found: { dent_d_ogre: true, marmite_cabossee: true } } },
    { id: 'c2', name: 'Ombre', classId: 'assassin', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c3', name: 'Sang', classId: 'sacrieur', level: 8, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // ---------- Le choix du donjon
    await page.goto(url);
    await page.waitForSelector('.menu');
    const heads = await page.$$eval('.tranche-head b', (els) => els.map((e) => e.textContent.trim()));
    check(heads.join(' | ') === 'Niveaux 1 à 3 | Niveaux 4 à 7 | Niveaux 8 à 11', `les donjons sont rangés par tranche de niveaux (${heads.join(' | ')})`);
    const cards = await page.$$eval('.tranche-card', (els) => els.map((e) => ({ id: e.dataset.dungeon, tranche: e.dataset.tranche, name: e.querySelector('.tranche-name').textContent, cx: e.querySelector('.dungeon-cx')?.textContent, theme: e.querySelector('.dungeon-theme')?.textContent, fit: !!e.querySelector('.fit'), sel: e.classList.contains('selected') })));
    check(cards.length === 7, `sept donjons jouables (${cards.length})`);
    check(cards.filter((c) => c.tranche === '4').length === 3 && cards.filter((c) => c.tranche === '8').length === 3, 'trois donjons au niveau 4, trois au niveau 8');
    check(cards.filter((c) => c.tranche === '4').every((c) => c.cx === 'Simple') && cards.filter((c) => c.tranche === '8').every((c) => c.cx === 'Mécaniques'), 'niveau 4 : « Simple » ; niveau 8 : « Mécaniques »');
    check(cards.every((c) => c.theme && c.fit), 'chaque carte dit son thème et le verdict pour l\'équipe');
    check(cards.filter((c) => c.sel).length === 1 && cards.find((c) => c.sel).id === 'crypte_oubliee', 'sans choix enregistré : le premier donjon de la dernière tranche jouée (la Crypte)');
    const soon = await page.textContent('.locked-note');
    check(/12, 16 et 20/.test(soon) && /Dragons/.test(soon), `les tranches à venir sont annoncées, jusqu'aux dragons (« ${soon.trim().slice(0, 90)}… »)`);

    if (phone) {
      // Petit écran : chaque tranche est un volet ; seule celle du donjon choisi est ouverte, pour que la page reste courte.
      const open = await page.$$eval('details.tranche-group', (els) => els.map((e) => `${e.dataset.tranche}:${e.open}`));
      check(open.join() === '1:false,4:true,8:false', `téléphone : seule la tranche du donjon choisi est dépliée (${open.join()})`);
      check(await page.$eval('.tranche-card[data-dungeon="repaire_coupe_jarrets"] .tranche-desc', (e) => getComputedStyle(e).display === 'none'), 'les cartes non choisies sont compactes (sans description)');
      await page.click('details.tranche-group[data-tranche="8"] > summary');
      await sleep(200);
      check(await page.$eval('details.tranche-group[data-tranche="8"]', (e) => e.open), 'un toucher déplie la tranche 8');
    } else {
      check(await page.$('details.tranche-group') === null, 'grand écran : tous les donjons sont visibles d\'un coup');
    }
    await page.click('.tranche-card[data-dungeon="gouffre_aux_ogres"]');
    await sleep(250);
    check(await page.$('.tranche-card.selected[data-dungeon="gouffre_aux_ogres"]') !== null, 'un clic choisit le Gouffre aux Ogres');
    if (phone) check((await page.$$eval('details.tranche-group', (els) => els.filter((e) => e.open).map((e) => e.dataset.tranche))).includes('8'), 'et sa tranche reste dépliée');
    const brief = await page.$eval('.dungeon-brief', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Régénération/.test(brief) && /Brise-bouclier/.test(brief) && /saignent/.test(brief), 'sous la liste : ce qu\'il faut savoir du donjon choisi (régénération, brise-bouclier)');
    check(/Gromm/.test(brief) && /objets ne tombent qu'ici/.test(brief), 'avec son boss et le nombre d\'objets exclusifs');
    check(/Gouffre aux Ogres/.test(await page.textContent('.launch-bar, .launch-where, .launch')), 'la barre de lancement nomme le donjon choisi');
    await page.screenshot({ path: `${out}/dj-accueil-${phone ? 'tel' : 'bureau'}.png`, fullPage: true });
    check((await overflow()) <= 1, 'aucun débordement horizontal à l\'accueil');

    // ---------- L'encyclopédie
    await page.click('.dungeon-brief .guide-btn');
    await page.waitForSelector('.guide-modal');
    await sleep(250);
    check(/Gouffre aux Ogres/.test(await page.textContent('.guide-modal .modal-head')), 'l\'encyclopédie s\'ouvre sur le donjon choisi');
    const monsters = await page.$$eval('.guide-monster', (els) => els.map((e) => ({ id: e.dataset.monster, boss: e.classList.contains('is-boss'), text: e.textContent.replace(/\s+/g, ' '), art: !!e.querySelector('svg') })));
    check(monsters.length === 5 && monsters.filter((m) => m.boss).length === 1 && monsters[4].id === 'roi_ogre', `bestiaire : 4 monstres et le boss en dernier (${monsters.map((m) => m.id).join(', ')})`);
    check(monsters.every((m) => m.art), 'chaque monstre a son portrait');
    check(monsters.every((m) => /Régénération/.test(m.text) && /Ogre/.test(m.text)), 'chaque ogre affiche sa particularité (Régénération) et sa famille');
    check(/Coup de massue/.test(monsters.find((m) => m.id === 'ogre_brise_os').text) && /PV \d+ · Att/.test(monsters[0].text), 'avec ses compétences et ses stats de base');
    check(/Colère du roi/.test(monsters[4].text) && /Boss/i.test(monsters[4].text), 'le boss est signalé, avec sa Colère');
    check(/Ogresse chamane/.test(await page.textContent('.guide-modal')) && /escorte/.test(await page.textContent('.guide-modal')), 'l\'escorte du boss est annoncée');
    const loot = await page.$$eval('.guide-loot .item-card', (els) => els.map((e) => e.querySelector('.item-name').textContent));
    check(loot.length === 4 && loot.includes('Massue de Gromm') && loot.includes('Ceinture en peau d\'ogre'), `butin exclusif : ${loot.join(', ')}`);
    check(/3 % de ses PV max/.test(await page.textContent('.guide-loot')), 'un objet à effet explique ce qu\'il fait');
    check(/ne tombent qu'ici/.test(await page.textContent('.guide-modal')), 'et l\'encyclopédie dit que ces objets ne tombent qu\'ici');
    // La collection du joueur (tous ses héros) et la panoplie du donjon
    const prog = await page.$$eval('.guide-progress', (els) => els.map((e) => e.textContent.trim()));
    check(prog.join(' | ') === 'Terminé 2 fois | Monstres vaincus : 2/5 | Butin trouvé : 2/4', `la collection : ${prog.join(' | ')}`);
    const kills = await page.$$eval('.guide-monster', (els) => els.map((e) => `${e.dataset.monster}:${e.querySelector('.gm-kills').textContent}`));
    check(kills.includes('ogre_brise_os:Vaincu ×5') && kills.includes('roi_ogre:Vaincu ×2') && kills.includes('ogresse_chamane:Jamais vaincu'), `chaque monstre dit s'il a été vaincu (${kills.join(', ')})`);
    const marks = await page.$$eval('.loot-entry', (els) => els.map((e) => `${e.dataset.item}:${e.classList.contains('is-found')}`));
    check(marks.includes('dent_d_ogre:true') && marks.includes('massue_de_gromm:false'), 'chaque objet dit s\'il a déjà été trouvé');
    const set = await page.$eval('.guide-set', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Panoplie de Gromm/.test(set) && /2 pièces : \+14 PV/.test(set) && /3 pièces/.test(set), `la panoplie du donjon et ses bonus (${set.trim()})`);
    check((await page.$$eval('.guide-loot .item-set', (e) => e.length)) === 4, 'chaque objet rappelle sa panoplie');
    await page.evaluate(() => document.querySelector('.guide-loot')?.scrollIntoView({ block: 'center' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/dj-guide-${phone ? 'tel' : 'bureau'}.png` });
    check((await overflow()) <= 1, 'aucun débordement horizontal dans l\'encyclopédie');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- La panoplie portée, sur la fiche du héros
    await page.click('.char-card:has-text("Foi") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await sleep(300);
    const row = await page.$eval('.set-row[data-set="gouffre_aux_ogres"]', (e) => ({ on: e.classList.contains('is-on'), text: e.textContent.replace(/\s+/g, ' '), bonus: [...e.querySelectorAll('.set-bonus')].map((b) => b.classList.contains('on')) }));
    check(row.on && /2 pièces sur 4/.test(row.text) && row.bonus.join() === 'true,false', `fiche : 2 pièces portées, le bonus à 2 est actif, celui à 3 grisé (${row.text.trim()})`);
    const hp = await page.$eval('.sheet-modal .stat-strip', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/PV\s*131/.test(hp), `les PV affichés comptent le bonus de panoplie (108 + 3 + 6 + 14 = 131 : « ${hp.slice(0, 40)} »)`);
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Une partie dans le donjon choisi
    await page.click('#launch-btn, .launch-btn, button:has-text("Lancer la run")');
    await page.waitForSelector('.run');
    await sleep(400);
    const state = await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return { dungeon: app.run.setup.dungeon, name: app.run.dungeon.name, tranche: app.run.setup.tranche }; });
    check(state.dungeon === 'gouffre_aux_ogres' && state.name === 'Le Gouffre aux Ogres' && state.tranche === 8, `la partie se joue dans le Gouffre aux Ogres (${state.name})`);
    check(/Gouffre aux Ogres/.test(await page.textContent('.run')), 'l\'écran de la partie porte le nom du donjon');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).lastSetup);
    check(saved.dungeon === 'gouffre_aux_ogres' && saved.tranche === 8, 'le choix est retenu pour la prochaine fois');

    // ---------- En combat : les particularités des monstres
    await page.evaluate(async () => {
      const { app } = await import('/src/ui/state.js');
      const { redraw } = await import('/src/ui/controller.js');
      const core = await import('/src/core/index.js');
      const { makeMonster, startCombat } = await import('/src/core/combat.js');
      const run = app.run;
      // on force un combat contre deux ogres et un acolyte (sans passer par le plateau)
      const tile = run.dungeon.board[0];
      tile.type = 'combat';
      tile.monsters = [makeMonster(run, 'ogre_brise_os', 1, ''), makeMonster(run, 'ogresse_chamane', 2, ''), makeMonster(run, 'squelette_releve', 3, '')];
      run.dungeon.position = 0;
      run.phase = 'tile';
      startCombat(run, tile, { natural: 10, total: 10 });
      void core;
      redraw();
    });
    await page.waitForSelector('.stage');
    await sleep(500);
    const chips = await page.$$eval('.fighter.monster', (els) => els.map((e) => ({ name: e.querySelector('.f-name').textContent, chips: [...e.querySelectorAll('.fx-chip')].map((c) => c.textContent.trim()) })));
    check(chips.filter((c) => c.chips.some((t) => /Régénération/.test(t))).length === 2, `les deux ogres portent la pastille « Régénération » (${chips.map((c) => `${c.name}: ${c.chips.join('/')}`).join(' ; ')})`);
    check(chips.some((c) => c.chips.some((t) => /Sans repos/.test(t))), 'le squelette relevé porte « Sans repos »');
    await page.click('.fighter.monster >> nth=0');
    await sleep(250);
    if (phone && !(await page.$eval('details.fx-panel', (e) => e.open).catch(() => true))) await page.click('details.fx-panel summary');
    const panel = await page.$eval('.fx-panel', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Particularités/.test(panel) && /Régénération/.test(panel) && /sauf s'il saigne/.test(panel), 'un clic sur un ogre explique sa particularité (groupe « Particularités »)');
    await page.screenshot({ path: `${out}/dj-combat-${phone ? 'tel' : 'bureau'}.png` });
    check((await overflow()) <= 1, 'aucun débordement horizontal en combat');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test des donjons : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
