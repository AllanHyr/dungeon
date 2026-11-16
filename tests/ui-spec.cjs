// Test de la spécialisation et du deck dans un vrai navigateur : cartes de spécialisation, choix « un seul parmi trois »,
// sort évolué, équiper / retirer un sort, deck plein, mémoire des choix quand on change de spé, version téléphone.
// Usage : node tests/ui-spec.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

// Une Duelliste niveau 8, sans deck enregistré (ancienne sauvegarde) : elle sert aussi à vérifier la migration.
const profile = {
  version: 1, nextCharNumber: 2, settings: { sound: false }, lastTeam: ['c1'], lastSetup: { tranche: 4, mode: 'tranche', stasisLevel: 1 },
  characters: [
    { id: 'c1', name: 'Dora', classId: 'duelliste', level: 8, xp: 0, skills: ['duelliste_coup_de_grace', 'duelliste_embuscade', 'duelliste_poison'],
      inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } },
    { id: 'c2', name: 'Novice', classId: 'duelliste', level: 3, xp: 0, skills: [], inventory: [], equipment: {}, stats: { runs: 0, wins: 0, deaths: 0 } }
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
    const saved = (id = 'c1') => page.evaluate((cid) => JSON.parse(localStorage.getItem('donjon.profile.v1')).characters.find((c) => c.id === cid), id);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const openSkills = async (name) => {
      await page.click(`.char-card:has-text("${name}") >> text=Fiche`);
      await page.waitForSelector('.sheet-modal');
      await page.click('.sheet-modal .tab[data-tab="skills"]');
      await sleep(250);
    };

    await page.goto(url);
    await page.waitForSelector('.menu');

    // ---------- Un personnage trop jeune : spé fermée
    await openSkills('Novice');
    check((await page.$$('.spec-card')).length === 2, 'deux cartes de spécialisation (même au niveau 3)');
    check(await page.$$eval('.spec-card', (l) => l.every((b) => b.disabled)), 'au niveau 3 les cartes sont fermées');
    check(/niveau 4/i.test(await page.$eval('.sec-spec', (e) => e.textContent)), "le texte dit que la spécialisation s'ouvre au niveau 4");
    check(/niveau 4/i.test(await page.$eval('.sec-talents .sec-empty', (e) => e.textContent)), 'et la section des talents explique la même chose');
    await page.keyboard.press('Escape');
    await sleep(200);

    // ---------- Dora, niveau 8 : migration (deck rempli avec les sorts déjà appris)
    await openSkills('Dora');
    check((await page.$$('.deck-frame .deck-slot')).length === 4, 'le deck a 4 emplacements');
    check(/Attaque à l'arme/.test(await page.$eval('[data-fixed="Corps à corps"]', (e) => e.textContent)), "le corps à corps basique (Attaque à l'arme) est à part, hors du deck");
    check(/Fente/.test(await page.$eval('[data-fixed="Sort de classe"]', (e) => e.textContent)), 'le sort de classe est à part, hors du deck');
    check(await page.$('.deck-frame .deck-slot[data-deck-skill="duelliste_fente"]') === null && await page.$('.deck-frame .deck-slot[data-deck-skill="attaque_arme"]') === null, 'ni le sort de classe ni le corps à corps ne sont dans le deck');
    check((await page.$$('.deck-slot.is-filled')).length === 3, 'ses sorts actifs sont équipés : Estoc (de départ), Coup de grâce, Lame empoisonnée ; la passive non');
    check(/3 \/ 4/.test(await page.$eval('.deck-frame .fixed-title', (e) => e.textContent)), 'le titre du deck dit 3 / 4');
    check(await page.$('.spec-card.is-selected') === null, 'aucune spécialisation choisie');
    check(await page.$('.talent-card') === null && await page.$('.sec-talents .sec-empty') !== null, 'sans spécialisation, la section des talents invite à en choisir une (aucun talent affiché)');
    check(await page.$('.node[data-skill="duelliste_venin_vif"]') === null && await page.$('.node[data-skill="duelliste_estoc_venimeux"]') === null, "les talents de spécialisation et les versions évoluées n'ont pas de case dans l'arbre");
    check((await page.$$('.spec-card[data-spec-id="poison"] .spec-give')).length >= 2, 'la carte de spécialisation annonce ce qu\'elle donne, niveau par niveau');

    // ---------- Choisir la spécialisation « poison »
    await page.click('.spec-card[data-spec-id="poison"]');
    await sleep(300);
    check((await saved()).spec === 'poison', 'la spécialisation est enregistrée');
    check(await page.$('.spec-card[data-spec-id="poison"].is-selected') !== null, 'la carte est marquée « choisie »');
    check(await page.$eval('.talent-card[data-skill="duelliste_venin_vif"]', (n) => n.dataset.state) === 'ready', 'Venin vif apparaît dans les talents, à choisir');
    check(await page.$eval('.talent-card[data-skill="duelliste_estoc_venimeux"]', (n) => n.dataset.kind) === 'evolution', "l'Estoc venimeux est annoncé comme une évolution");
    check(await page.$eval('.sk-points-num', (e) => e.textContent) === '4', 'choisir la spécialisation ne coûte aucun point (4 restent : 8 − 1 − 1 − 2)');

    // L'évolution est annoncée sur l'Estoc
    await page.click('.node[data-skill="duelliste_estoc"]');
    await sleep(150);
    check(/Estoc venimeux/.test(await page.$eval('.sk-panel', (e) => e.textContent)), 'le détail de l\'Estoc annonce son évolution');

    // Apprendre un des trois choix
    await page.click('.talent-card[data-skill="duelliste_venin_vif"]');
    await sleep(300);
    const afterLearn = await saved();
    check(await page.$eval('.sk-points-num', (e) => e.textContent) === '4', 'apprendre un sort de spécialisation ne coûte aucun point non plus');
    check(afterLearn.skills.includes('duelliste_venin_vif') && afterLearn.deck.includes('duelliste_venin_vif'), 'Venin vif est appris et équipé tout seul');
    // Un seul choix par groupe : un autre choix reste possible, il REMPLACERAIT le précédent (on ne clique pas, la suite du test a besoin de Venin vif)
    check(await page.$eval('.talent-card[data-skill="duelliste_venin_vif"]', (n) => n.dataset.state) === 'chosen', 'Venin vif est marqué « Choisi »');
    check(await page.$eval('.talent-card[data-skill="duelliste_virulence"]', (n) => n.dataset.state) === 'ready', 'Virulence reste choisissable (elle remplacerait Venin vif)');
    check(/Choisis 1 talent parmi 3/.test(await page.$eval('.tier-set.is-choice', (e) => e.textContent)), 'le groupe annonce « Choisis 1 talent parmi 3 »');
    check((await page.$eval('.talent-card[data-skill="duelliste_virulence"]', (b) => b.textContent)).includes('remplace « Venin vif »'), 'la carte annonce « Choisir · remplace Venin vif »');
    check(await page.$eval('.talent-card[data-skill="duelliste_virulence"]', (b) => b.tagName) === 'BUTTON', 'et elle est utilisable (gratuit)');
    check((await page.$$('.deck-slot.is-filled')).length === 4, 'le deck est plein : 4 sorts');

    // ---------- Retirer / équiper un sort, deck plein
    const spell = '.spell-card[data-deck-toggle="duelliste_coup_de_grace"]';
    check(await page.$eval(spell, (b) => b.dataset.equipped) === 'true' && /retirer/.test(await page.$eval(spell, (b) => b.textContent)), 'la carte du sort dit « Dans ta barre · retirer »');
    await page.click(spell);
    await sleep(300);
    check(!(await saved()).deck.includes('duelliste_coup_de_grace'), 'le sort est sorti du deck');
    check(await page.$eval(spell, (b) => b.dataset.equipped) === 'false' && /Équiper/.test(await page.$eval(spell, (b) => b.textContent)), 'la carte propose maintenant « Équiper »');
    await page.click(spell);
    await sleep(300);
    check((await saved()).deck.includes('duelliste_coup_de_grace'), 'il est rééquipé');
    // barre pleine : équiper un autre sort demande d'abord lequel remplacer
    const freeCard = await page.$('.spell-card[data-equipped="false"]:not(:disabled)');
    if (freeCard) {
      const id = await freeCard.getAttribute('data-skill');
      await freeCard.click();
      await sleep(250);
      check(await page.$('.swap-banner') !== null && (await page.$$('.deck-slot.is-swap-target')).length === 4, 'barre pleine : un message demande quel sort remplacer, les emplacements se mettent en évidence');
      const target = await page.$eval('.deck-slot.is-filled', (b) => b.dataset.deckSkill);
      await page.click(`.deck-slot[data-deck-skill="${target}"]`);
      await sleep(300);
      const sw = await saved();
      check(sw.deck.includes(id) && !sw.deck.includes(target) && sw.deck.length === 4, `le sort choisi prend la place de l'autre (${target} → ${id})`);
      await page.click(`.spell-card[data-deck-toggle="${target}"]`);
      await sleep(250);
      await page.click('.deck-slot.is-filled >> nth=0');
      await sleep(300);
      check((await saved()).deck.includes(target), 'et on peut revenir en arrière');
    }
    // on retire un emplacement en cliquant sur le deck
    await page.click('.deck-slot[data-deck-skill="duelliste_poison"]');
    await sleep(300);
    check(!(await saved()).deck.includes('duelliste_poison'), 'cliquer sur un emplacement du deck retire le sort');

    // ---------- Changer de spécialisation : la mémoire est gardée
    await page.click('.spec-card[data-spec-id="precision"]');
    await sleep(300);
    const prec = await saved();
    check(prec.spec === 'precision' && prec.skills.includes('duelliste_venin_vif') && !prec.deck.includes('duelliste_venin_vif'), 'sous « précision », Venin vif reste appris mais hors deck');
    await page.click('.spec-card[data-spec-id="poison"]');
    await sleep(300);
    check((await saved()).deck.includes('duelliste_venin_vif'), 'en revenant à « poison », Venin vif est de nouveau équipé');
    // cliquer sur la carte choisie retire la spécialisation
    await page.click('.spec-card[data-spec-id="poison"]');
    await sleep(300);
    check((await saved()).spec === null, 'recliquer sur la carte choisie retire la spécialisation');

    check(await overflow() <= 1, 'aucun débordement horizontal de la page');
    if (phone) {
      const tree = await page.$eval('.sk-tree', (e) => e.scrollWidth - e.clientWidth);
      check(tree <= 1, `l'arbre ne déborde pas de l'écran (${tree}px)`);
    }
    await page.click('.spec-card[data-spec-id="poison"]');
    await sleep(300);
    await page.evaluate(() => document.querySelector('.sec-talents')?.scrollIntoView({ block: 'start' }));
    await sleep(150);
    await page.screenshot({ path: `${out}/spec-${phone ? 'phone' : 'desktop'}.png` });
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test de la spécialisation et du deck : tout est bon');
  process.exit(failures.length ? 1 : 0);
})();
