// Test de la forge dans un vrai navigateur : cadenas et démantèlement dans le sac, onglet Forge (démanteler en masse,
// améliorer un objet porté, forger un objet d'un donjon terminé), rechargement de la page (tout est sauvegardé). Bureau et téléphone.
// Usage : node tests/ui-forge.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 2, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 1, mode: 'tranche', stasisLevel: 1 },
  characters: [{
    id: 'c1', name: 'Brunehilde', classId: 'guerrier', level: 3, xp: 0, skills: [], shards: 10,
    inventory: [
      { uid: 'a1', id: 'capuchon_de_toile_rapee' }, { uid: 'a2', id: 'piece_percee' }, { uid: 'a3', id: 'epaulieres_de_toile_rapee' },
      { uid: 'b1', id: 'amulette_corbeau' }, { uid: 'r1', id: 'collier_de_saphir' }
    ],
    equipment: { head: { uid: 'w1', id: 'heaume_de_fer_noirci' } },
    stats: { runs: 1, wins: 1, deaths: 0, dungeons: { caves_humides: 1 } }
  }]
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
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters[0]);
    const okConfirm = async () => { await page.waitForSelector('[role="alertdialog"]'); await page.click('[role="alertdialog"] .btn-danger, [role="alertdialog"] button:last-child'); await sleep(300); };
    const openTab = async (tab) => { await tap(`.sheet-modal .tab[data-tab="${tab}"]`); await sleep(300); };

    await page.goto(url);
    await page.waitForSelector('.menu');
    await page.click('.char-card:has-text("Brunehilde") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');

    // ---------- Le sac : cadenas, démanteler un objet
    const row = (uid) => `.bag-row[data-item="${uid}"]`;
    check((await page.$$('.bag-row .bag-salvage')).length === 5, 'chaque objet du sac a un bouton « démanteler »');
    await tap(`${row('collier_de_saphir')} .bag-lock`);
    await sleep(300);
    check(await page.$(`${row('collier_de_saphir')} .bag-lock.on`) !== null, 'le cadenas est posé sur le collier');
    check(await page.$eval(`${row('collier_de_saphir')} .bag-salvage`, (b) => b.disabled), 'un objet protégé ne peut pas être démantelé');
    await tap(`${row('amulette_corbeau')} .bag-salvage`);
    await sleep(400);
    let c = await saved();
    check(c.shards === 13 && !c.inventory.some((i) => i.uid === 'b1'), `l'amulette (peu commune) démantelée : +3 éclats (${c.shards})`);
    check(c.locked.includes('r1'), 'le cadenas est sauvegardé');
    await page.screenshot({ path: `${out}/forge-sac-${phone ? 'phone' : 'desktop'}.png` });

    // ---------- L'onglet Forge
    await openTab('forge');
    check(/13/.test(await page.$eval('.forge-shards', (e) => e.textContent)), 'la forge affiche 13 éclats');
    check(/13/.test(await page.$eval('.sheet-modal .tab[data-tab="forge"]', (e) => e.textContent)), 'l\'onglet indique le nombre d\'éclats');
    // Tout démanteler : les communs (3 objets, +3)
    await tap('.forge-bulk [data-bulk="common"]');
    await okConfirm();
    c = await saved();
    check(c.shards === 16 && c.inventory.length === 1 && c.inventory[0].uid === 'r1', `les 3 communs démantelés, le collier protégé reste (${c.shards} éclats)`);
    // Améliorer le heaume porté (rare : 8 éclats)
    await tap('.forge-row[data-uid="w1"] .forge-up');
    await sleep(400);
    c = await saved();
    check(c.equipment.head.plus === 1 && c.shards === 8, `le heaume passe à +1 (8 éclats dépensés, reste ${c.shards})`);
    check(/\+1/.test(await page.$eval('.forge-row[data-uid="w1"] .bag-name', (e) => e.textContent)), 'son nom affiche « +1 »');
    check((await page.$$('.forge-row[data-uid="w1"] .forge-pips .pip.on')).length === 1, 'une pastille d\'amélioration allumée');
    const pills = await page.$eval('.forge-row[data-uid="w1"] .bag-main > .pills', (e) => e.textContent);
    check(/\+1\.1 Défense/.test(pills), `ses statistiques grandissent de 10 % (${pills})`);
    // Forger : la liste des Cavernes humides (donjon terminé)
    check(await page.$('.forge-dungeon[data-dungeon="caves_humides"]') !== null, 'les objets des Cavernes humides (donjon terminé) sont dans la forge');
    check(await page.$('.forge-dungeon[data-dungeon="crypte_oubliee"]') === null, 'pas ceux d\'un donjon jamais terminé');
    check(await page.$eval('.forge-row[data-craft="cape_en_peau_de_rat"] .forge-craft', (b) => b.disabled), 'la cape (30 éclats) est trop chère pour l\'instant');
    await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('donjon.profile.v1')); p.characters[0].shards = 40; localStorage.setItem('donjon.profile.v1', JSON.stringify(p)); });
    await page.reload();
    await page.waitForSelector('.menu');
    await page.click('.char-card:has-text("Brunehilde") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await openTab('forge');
    await tap('.forge-row[data-craft="cape_en_peau_de_rat"] .forge-craft');
    await sleep(400);
    c = await saved();
    check(c.shards === 10 && c.inventory.some((i) => i.id === 'cape_en_peau_de_rat'), `la cape forgée arrive dans le sac (reste ${c.shards} éclats)`);
    check(c.equipment.head.plus === 1, 'l\'amélioration du heaume a survécu au rechargement');
    await page.screenshot({ path: `${out}/forge-${phone ? 'phone' : 'desktop'}.png`, fullPage: false });
    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, 'aucun débordement horizontal');
    await ctx.close();
  }
  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test de la forge : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
