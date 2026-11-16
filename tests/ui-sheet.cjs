// Test de la fiche de personnage dans un vrai navigateur : stats, équipement (porté / sac / comparaison),
// arbre de compétences (états, conditions, apprendre, réinitialiser), version téléphone.
// Usage : node tests/ui-sheet.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const profile = {
  version: 1, nextCharNumber: 3, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Thorne', classId: 'berserker', level: 8, xp: 300, skills: ['berserker_colere', 'berserker_saignee', 'berserker_peau_epaisse'],
      inventory: [{ uid: 'i1', id: 'potion_mineure' }, { uid: 'i2', id: 'lame_cryptique' }, { uid: 'i3', id: 'couronne_dechue' }, { uid: 'i4', id: 'sceau_veilleur' }, { uid: 'i6', id: 'gourdin_cabosse' }],
      equipment: { weapon: { uid: 'e1', id: 'hallebarde_fer_noir' }, armor: { uid: 'e2', id: 'harnois_sombre' }, trinket: null }, stats: { runs: 9, wins: 6, deaths: 2 } },
    { id: 'c2', name: 'Pip', classId: 'druide', level: 1, xp: 0, skills: [], inventory: [{ uid: 'p1', id: 'baton_if' }], equipment: { weapon: null, armor: null, trinket: null }, stats: { runs: 0, wins: 0, deaths: 0 } }
  ]
};

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  for (const [label, opts] of [
    ['Bureau', { viewport: { width: 1360, height: 900 } }],
    ['Téléphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]
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
    const savedSkills = () => page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters.find((c) => c.id === 'c1').skills);
    const statText = (name) => page.$eval(`.sstat:has(.sstat-top:has-text("${name}")) .sstat-val`, (e) => e.textContent);

    await page.goto(url);
    await page.waitForSelector('.menu');
    await page.click('.char-card:has-text("Thorne") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await sleep(250);

    // ---------- En-tête et statistiques
    check((await page.$$('.sstat')).length === 8, 'les 8 statistiques sont affichées');
    check(/\+\d/.test(await statText('PV')), "le bonus d'équipement apparaît en vert à côté des PV");
    check(await page.$eval('.hero-name b', (e) => e.textContent) === 'Thorne', 'le nom du personnage est dans l\'en-tête');

    // ---------- Équipement : la poupée (14 emplacements) et le sac par sections
    check((await page.$$('.dslot')).length === 14, 'la poupée a 14 emplacements');
    check((await page.$$('.dslot.filled:not(.blocked)')).length === 2, 'deux emplacements portés (main droite et torse : anciens arme et armure migrés)');
    check((await page.$eval('.doll-count', (e) => e.textContent)).replace(/\s/g, '') === '2/14', 'le compteur dit 2 / 14');
    check(await page.$('.dslot[data-slot="offHand"].blocked') !== null, 'la hallebarde à deux mains bloque la main gauche');
    check((await page.$$('.bag-row')).length === 5, 'le sac affiche ses 5 objets');
    check(await page.$('.bag-sec[data-type="weapon"] .bag-row') !== null && await page.$('.bag-sec[data-type="head"] .bag-row') !== null && await page.$('.bag-sec[data-type="ring"] .bag-row') !== null, 'le sac est rangé en sections (armes, tête, anneaux...)');
    check(await page.$('.bag-row[data-item="lame_cryptique"] .bag-cmp.worse') !== null, "la Lame cryptique (1 main) est « moins bon » que la hallebarde à deux mains qu'elle remplacerait");
    const deltaText = await page.$eval('.bag-row[data-item="lame_cryptique"] .deltas', (e) => e.textContent);
    check(/Hallebarde/.test(deltaText) && /Attaque/.test(deltaText), `la comparaison dit ce qui est remplacé et ce qui baisse (${deltaText.replace(/\s+/g, ' ').trim()})`);
    check(await page.$('.bag-row[data-item="couronne_dechue"] .bag-cmp.better') !== null, 'la couronne va dans un emplacement libre : « meilleur »');
    const colors = await page.$$eval('.dslot.filled, .bag-row', (els) => [...new Set(els.map((e) => getComputedStyle(e).getPropertyValue('--rar').trim()))]);
    check(colors.length >= 3, `les raretés ont des couleurs différentes (${colors.length})`);
    await page.screenshot({ path: `${out}/80-fiche-equip-${phone ? 'tel' : 'bureau'}.png` });

    // Choisir un emplacement filtre le sac sur ce qui peut y aller
    await page.click('.dslot[data-slot="ring1"]');
    await sleep(100);
    check((await page.$$('.bag-row')).length === 1 && await page.$('.bag-row[data-item="sceau_veilleur"]') !== null, 'choisir « Anneau 1 » ne montre que les anneaux du sac');
    check(await page.$('.dslot[data-slot="ring1"].is-selected') !== null, "l'emplacement choisi est mis en valeur");
    await page.click('.sec-head .chip-btn.on');
    await sleep(100);
    check((await page.$$('.bag-row')).length === 5, 'annuler le choix remontre tout le sac');
    // Les filtres par famille
    await page.click('.filters .chip-btn:has-text("Armes")');
    await sleep(100);
    check((await page.$$('.bag-row')).length === 2, 'le filtre « Armes » ne garde que les 2 armes');
    await page.click('.filters .chip-btn:has-text("Tout")');

    // Équiper la couronne : l'attaque monte, le sac se vide d'un objet, la tête est remplie
    const atkBefore = parseFloat(await statText('Attaque'));
    await page.click('.bag-row[data-item="couronne_dechue"] .btn');
    await sleep(200);
    check(await page.$('.dslot[data-slot="head"].filled') !== null, 'la tête est maintenant équipée');
    check((await page.$eval('.doll-count', (e) => e.textContent)).replace(/\s/g, '') === '3/14', 'le compteur dit 3 / 14');
    check((await page.$$('.bag-row')).length === 4, 'le sac a un objet de moins');
    const atkAfter = parseFloat(await statText('Attaque'));
    check(atkAfter > atkBefore, `l'attaque a augmenté (${atkBefore} → ${atkAfter})`);

    // Équiper une arme à une main chasse l'arme à deux mains (qui retourne au sac) et libère la main gauche
    await page.click('.bag-row[data-item="lame_cryptique"] .btn');
    await sleep(200);
    check(await page.$('.dslot[data-slot="offHand"].blocked') === null, "la main gauche n'est plus bloquée");
    check(await page.$('.bag-row[data-item="hallebarde_fer_noir"]') !== null, 'la hallebarde est retournée dans le sac');

    // Retirer un objet depuis le panneau de détail
    await page.click('.dslot[data-slot="chest"]');
    await sleep(100);
    check((await page.$eval('.slot-detail .gear-name', (e) => e.textContent)).includes('Harnois'), "le panneau montre l'objet du torse");
    await page.click('.slot-detail .gear-remove');
    await sleep(200);
    check(await page.$('.dslot[data-slot="chest"].empty') !== null, 'retirer vide le torse');
    check(await page.$('.bag-row[data-item="harnois_sombre"]') !== null, "l'objet est dans le sac");

    // ---------- Compétences
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(250);
    check(await page.$eval('.sk-points-num', (e) => e.textContent) === '5', '5 points de compétence à dépenser (8 − 3)');
    check((await page.$$('.node.is-known')).length === 6, '6 nœuds connus (3 de départ + 3 appris)');
    check(await page.$('.node[data-skill="berserker_tourbillon"].is-ready') !== null, 'Tourbillon est apprenable');
    check(await page.$('.node[data-skill="berserker_frenesie"].is-locked') !== null, 'Frénésie est verrouillée');
    check(await page.$('.node.is-active') !== null && await page.$('.node.is-passive') !== null, 'il y a des actives (carrées) et des passives (rondes)');

    // Une compétence verrouillée : la liste des conditions dit ce qui manque
    await page.click('.node[data-skill="berserker_frenesie"]');
    await sleep(150);
    check(await page.$('.sk-panel .req-list li.ko') !== null, 'la liste des conditions montre au moins une condition manquante');
    check(await page.$eval('.sk-panel .sd2-foot .btn', (b) => b.disabled), 'le bouton « Apprendre » est désactivé tant qu\'il manque quelque chose');
    await page.screenshot({ path: `${out}/81-fiche-comp-${phone ? 'tel' : 'bureau'}.png` });

    // Apprendre Tourbillon (2 points)
    await page.click('.node[data-skill="berserker_tourbillon"]');
    await sleep(150);
    check(!(await page.$eval('.sk-panel .sd2-foot .btn', (b) => b.disabled)), '« Apprendre » est actif pour Tourbillon');
    await page.click('.sk-panel .sd2-foot .btn');
    await sleep(250);
    check(await page.$eval('.sk-points-num', (e) => e.textContent) === '3', 'il reste 3 points après avoir appris Tourbillon');
    check(await page.$('.node[data-skill="berserker_tourbillon"].is-known') !== null, 'Tourbillon est maintenant connu');
    check((await savedSkills()).includes('berserker_tourbillon'), 'la compétence est bien sauvegardée');
    check(await page.$('.node[data-skill="berserker_frenesie"].is-ready') !== null, 'Frénésie devient apprenable (Tourbillon est connu, il reste 3 points)');

    // Réinitialiser
    await page.click('.sk-head .btn');
    await page.waitForSelector('.confirm-layer');
    await page.click('.confirm-layer .btn-primary');
    await sleep(250);
    check(await page.$eval('.sk-points-num', (e) => e.textContent) === '8', 'après « Réinitialiser », les 8 points sont rendus');
    check((await savedSkills()).every((id) => id.includes('entaille') || id.includes('sang_chaud') || id.includes('provocation')), 'seules les compétences de départ restent');

    // ---------- Autres onglets
    await page.click('.sheet-modal .tab[data-tab="ach"]');
    await sleep(150);
    check(await page.$('.ach-card') !== null, 'l\'onglet Succès affiche des succès');
    await page.click('.sheet-modal .tab[data-tab="info"]');
    await sleep(150);
    check(await page.$('.info-grid') !== null, 'l\'onglet Infos affiche les statistiques');

    // ---------- Un personnage de niveau 1 (peu de points, peu d'objets)
    await page.keyboard.press('Escape');
    await page.click('.char-card:has-text("Pip") >> text=Fiche');
    await page.waitForSelector('.sheet-modal');
    await page.click('.sheet-modal .tab[data-tab="skills"]');
    await sleep(200);
    check(await page.$eval('.sk-points-num', (e) => e.textContent) === '1', 'Pip (niveau 1) a 1 point de compétence');
    check(await page.$('.node.is-ready') !== null, 'une compétence de palier 1 est apprenable');

    check((await overflow()) === 0, 'aucun débordement horizontal de la page');
    if (phone) {
      check(await page.$('.sk-tree .sk-panel') !== null, 'sur téléphone, le détail s\'ouvre dans l\'arbre (sous la rangée choisie)');
      const treeOverflow = await page.$eval('.tab-body', (e) => e.scrollWidth - e.clientWidth);
      check(treeOverflow <= 1, `l'arbre ne déborde pas de l'écran (${treeOverflow}px)`);
    }
    await page.screenshot({ path: `${out}/82-fiche-niveau1-${phone ? 'tel' : 'bureau'}.png` });
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} problème(s)` : '\n✅ Test de la fiche : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
