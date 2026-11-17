// Test du bandeau de combat : raccourcis clavier (AZERTY et QWERTY) et description des compétences en petit format.
// Usage : node tests/ui-combat-clavier.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

/** Lance l'atelier : une Assassin seule (toujours elle qui joue) contre 2 mannequins agressifs. Ses cases, dans l'ordre : Attaque à l'arme (corps à corps basique), Marque mortelle (sort de classe), puis le deck : Estoc de l'ombre, Coup dans le dos (en relance : grisé), Tourbillon de lames (zone), Lame venimeuse. */
async function openTraining(page) {
  await page.goto(url);
  await page.waitForSelector('.menu');
  await page.evaluate(async () => {
    const { startTraining } = await import('/src/ui/controller.js');
    startTraining([{ classId: 'assassin', level: 5 }], { dummy: 'mannequin_agressif', count: 2, atkScale: 1 });
    // Un deck choisi, et le Coup dans le dos en relance (il sera grisé)
    const { app } = await import('/src/ui/state.js');
    const { redraw } = await import('/src/ui/controller.js');
    await new Promise((r) => setTimeout(r, 300));
    const p = app.run.players[0];
    p.deck = ['assassin_estoc', 'assassin_dos', 'assassin_tourbillon', 'assassin_lame_venimeuse'];
    p.cooldowns.assassin_dos = 2;
    redraw();
  });
  await page.waitForSelector('.stage');
  await page.waitForTimeout(400);
}

/** Simule la frappe d'une touche. Un clavier AZERTY envoie key="&" et code="Digit1" (la POSITION de la touche). */
const press = (page, init) => page.evaluate((i) => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...i })), init);
const armed = (page) => page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return app.ui.target ? app.ui.target.skillId : null; });
const slotName = (page, i) => page.$eval(`.hotbar .slot >> nth=${i} >> .slot-label`, (e) => e.textContent).catch(() => null);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
  };

  // ============ Grand écran, clavier AZERTY (français) ============
  console.log('\n● Grand écran, clavier AZERTY');
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    watch(page, 'grand écran');
    await openTraining(page);
    const labels = await page.$$eval('.hotbar .slot-key', (els) => els.map((e) => e.textContent));
    check(labels.slice(0, 4).join(' ') === '& é " \'', `les cases portent les vraies touches (${labels.slice(0, 4).join(' ')})`);
    check(labels.length >= 7, `et la suite de la rangée (${labels.join(' ')})`);
    check(await page.$eval('.skill-detail', (e) => getComputedStyle(e).display !== 'none'), 'sur grand écran, le panneau de détail reste affiché');

    await press(page, { key: '&', code: 'Digit1' });
    await page.waitForTimeout(120);
    const first = await armed(page);
    check(first === 'attaque_arme' && (await page.$$('.fighter.targetable')).length > 0, `« & » lance la 1re case (le corps à corps basique) : on choisit une cible (${first})`);
    check(await page.$('.hotbar .slot.is-armed') !== null, 'la case est mise en avant');
    await press(page, { key: 'Escape', code: 'Escape' });
    await page.waitForTimeout(100);
    check(await armed(page) === null, 'Échap annule');

    // « é » (2e touche) = Marque mortelle (sort de classe), qui demande aussi une cible
    await press(page, { key: 'é', code: 'Digit2' });
    await page.waitForTimeout(120);
    const second = await armed(page);
    check(second === 'assassin_marque', `« é » lance la 2e compétence (${second})`);
    await press(page, { key: 'Escape', code: 'Escape' });
    await page.waitForTimeout(100);

    await press(page, { key: '1', code: 'Digit1', shiftKey: true });
    await page.waitForTimeout(100);
    check(await armed(page) === first, 'Maj + & (le chiffre 1) marche aussi');
    await press(page, { key: 'Escape', code: 'Escape' });
    await page.waitForTimeout(100);

    await press(page, { key: '1', code: 'Numpad1' });
    await page.waitForTimeout(100);
    check(await armed(page) === first, 'le pavé numérique marche aussi');
    await press(page, { key: 'Escape', code: 'Escape' });
    await page.waitForTimeout(100);
    await press(page, { key: 'End', code: 'Numpad1' });
    await page.waitForTimeout(100);
    check(await armed(page) === null, 'pavé numérique sans verrouillage (touche Fin) : ignoré');

    await press(page, { key: '&', code: 'Digit1', repeat: true });
    await page.waitForTimeout(100);
    check(await armed(page) === null, 'une touche maintenue enfoncée (répétition) ne relance pas');
    await press(page, { key: '&', code: 'Digit1', ctrlKey: true });
    await page.waitForTimeout(100);
    check(await armed(page) === null, 'Ctrl + touche : ignoré (c\'est un raccourci du navigateur)');

    // Une case indisponible : « Coup dans le dos » (en relance) est la 4e case, touche « ' »
    const idx = await page.$$eval('.hotbar .slot', (els) => els.findIndex((e) => e.classList.contains('unusable') && !e.classList.contains('util')));
    check(idx === 3, `« Coup dans le dos » est grisé (case n° ${idx + 1})`);
    await press(page, { key: "'", code: 'Digit4' });
    await page.waitForTimeout(150);
    check(await page.$eval('.hotbar .slot >> nth=3', (e) => e.classList.contains('shake')), 'sa case tremble quand on appuie sur sa touche');
    check(await page.$eval('.skill-detail', (e) => e.dataset.state === 'flash'), 'et le détail explique pourquoi');
    check((await page.$eval('.skill-detail .sd-reason', (e) => e.textContent).catch(() => '')).length > 3, 'avec la raison écrite');
    check(await armed(page) === null, 'sans rien lancer');
    await page.screenshot({ path: `${out}/95-clavier-grand.png` });

    // Une compétence de zone (pas de cible à choisir) : « ( » = Tourbillon de lames, lancé tout de suite
    const flamesBefore = await page.$$eval('.flame.on', (e) => e.length);
    await press(page, { key: '(', code: 'Digit5' });
    await page.waitForTimeout(250);
    await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 }); // (le coup se joue, puis l'écran montre le résultat)
    const flamesAfter = await page.$$eval('.flame.on', (e) => e.length);
    check(flamesAfter < flamesBefore, `« ( » lance le Tourbillon de lames directement (PA ${flamesBefore} → ${flamesAfter})`);
    check((await page.$$('.hotbar .slot')).length <= 10, 'toutes les cases ont une touche (10 au maximum)');
    await ctx.close();
  }

  // ============ Clavier AZERTY mais navigateur en anglais : la disposition s'apprend à la première frappe ============
  console.log('\n● Navigateur en anglais, clavier AZERTY (apprentissage)');
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 }, locale: 'en-US' });
    const page = await ctx.newPage();
    watch(page, 'apprentissage');
    await openTraining(page);
    const before = await page.$$eval('.hotbar .slot-key', (els) => els.slice(0, 2).map((e) => e.textContent));
    check(before.join(' ') === '1 2', `d'abord des chiffres (${before.join(' ')})`);
    await press(page, { key: '&', code: 'Digit1' });
    await press(page, { key: 'é', code: 'Digit2' });
    await page.waitForTimeout(100);
    const after = await page.$$eval('.hotbar .slot-key', (els) => els.slice(0, 2).map((e) => e.textContent));
    check(after.join(' ') === '& é', `puis les vraies touches, apprises à la frappe (${after.join(' ')})`);
    await ctx.close();
  }

  // ============ Petite fenêtre peu haute (portable) : infobulle au survol ============
  console.log('\n● Portable (fenêtre peu haute)');
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 650 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    watch(page, 'portable');
    await openTraining(page);
    check(await page.$eval('.skill-detail', (e) => getComputedStyle(e).display === 'none'), 'au repos, la description ne prend aucune place');
    const dockH = await page.$eval('.dock', (e) => Math.round(e.getBoundingClientRect().height));
    check(dockH < 175, `le bandeau est plus bas (${dockH}px)`);
    await page.hover('.hotbar .slot-btn >> nth=1');
    await page.waitForTimeout(250);
    const tip = await page.$eval('.skill-detail', (e) => { const r = e.getBoundingClientRect(); const hb = document.querySelector('.hotbar').getBoundingClientRect(); return { shown: getComputedStyle(e).display !== 'none', bottom: Math.round(r.bottom), hotbarTop: Math.round(hb.top), state: e.dataset.state, text: e.textContent }; });
    check(tip.shown && tip.state === 'hover', 'au survol, la description apparaît (infobulle)');
    check(tip.bottom <= tip.hotbarTop, `au-dessus de la barre de compétences (bas ${tip.bottom}px ≤ haut de la barre ${tip.hotbarTop}px)`);
    check(/PA/.test(tip.text), 'elle donne le nom et le coût');
    await page.screenshot({ path: `${out}/96-clavier-portable.png` });
    await page.mouse.move(600, 200);
    await page.waitForTimeout(200);
    check(await page.$eval('.skill-detail', (e) => getComputedStyle(e).display === 'none'), 'quand la souris part, elle disparaît');
    await ctx.close();
  }

  // ============ Téléphone ============
  console.log('\n● Téléphone');
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const page = await ctx.newPage();
    watch(page, 'téléphone');
    await openTraining(page);
    check(await page.$eval('.skill-detail', (e) => getComputedStyle(e).display === 'none'), 'au repos, aucune description (la place va au combat)');
    const dockH = await page.$eval('.dock', (e) => Math.round(e.getBoundingClientRect().height));
    check(dockH < 260, `le bandeau est court (${dockH}px, il en faisait plus de 330)`);
    check(await page.$eval('.hotbar .slot-key', (e) => getComputedStyle(e).display === 'none'), 'pas d\'étiquettes de touches sur un écran tactile');

    // Premier toucher : sélection + infobulle
    await page.tap('.hotbar .slot-btn >> nth=1');
    await page.waitForTimeout(250);
    const sel = await page.$eval('.skill-detail', (e) => { const r = e.getBoundingClientRect(); const hb = document.querySelector('.hotbar').getBoundingClientRect(); return { shown: getComputedStyle(e).display !== 'none', state: e.dataset.state, bottom: Math.round(r.bottom), hotbarTop: Math.round(hb.top), cast: !!e.querySelector('.sd-cast'), h: Math.round(r.height) }; });
    check(sel.shown && sel.state === 'picked', 'un premier toucher sélectionne et montre la description');
    check(sel.bottom <= sel.hotbarTop && sel.cast, `au-dessus de la barre, avec le bouton « Lancer » (${sel.h}px de haut)`);
    await page.screenshot({ path: `${out}/97-clavier-tel-selection.png` });
    // Un toucher à côté referme l'infobulle
    await page.tap('.side-monsters .fighter >> nth=0', { force: true }).catch(() => {});
    await page.waitForTimeout(250);
    check(await page.$eval('.skill-detail', (e) => getComputedStyle(e).display === 'none'), 'un toucher à côté la referme');

    // Deuxième toucher (sur la même case) : on lance, puis on choisit la cible
    await page.tap('.hotbar .slot-btn >> nth=0');
    await page.waitForTimeout(200);
    await page.tap('.hotbar .slot-btn >> nth=0');
    await page.waitForTimeout(250);
    const tgt = await page.$eval('.skill-detail', (e) => ({ shown: getComputedStyle(e).display !== 'none', state: e.dataset.state, h: Math.round(e.getBoundingClientRect().height), text: e.innerText }));
    check(tgt.shown && tgt.state === 'target', 'le second toucher lance : on choisit une cible');
    check(tgt.h < 80, `l'invite de ciblage tient sur une ligne (${tgt.h}px)`);
    check(!/brillent/.test(tgt.text), 'sans phrase d\'explication inutile');
    await page.screenshot({ path: `${out}/98-clavier-tel-cible.png` });
    await page.click('.skill-detail .btn');
    await page.waitForTimeout(200);
    check(await armed(page) === null, '« Annuler » annule');

    // Un clavier branché sur un téléphone ou une tablette : la touche lance tout de suite (pas de double toucher)
    await press(page, { key: '&', code: 'Digit1' });
    await page.waitForTimeout(150);
    check(await armed(page) !== null, 'une touche du clavier lance directement, même sur un appareil tactile');
    await press(page, { key: 'Escape', code: 'Escape' });
    await page.waitForTimeout(150);

    // La barre de compétences défile : un toucher ne la ramène pas au début, et la case choisie reste visible
    await press(page, { key: 'Escape', code: 'Escape' });
    await page.waitForTimeout(150);
    await page.$eval('.hotbar', (e) => { e.scrollLeft = e.scrollWidth; });
    await page.waitForTimeout(150);
    const scrolled = await page.$eval('.hotbar', (e) => Math.round(e.scrollLeft));
    check(scrolled > 20, `la barre de compétences défile (${scrolled}px)`);
    await page.tap('.hotbar .slot-btn >> nth=4'); // « Tourbillon de lames » : une compétence de zone
    await page.waitForTimeout(250);
    const keep = await page.$eval('.hotbar', (e) => { const s = e.querySelector('.is-selected'); const hr = e.getBoundingClientRect(); const sr = s ? s.getBoundingClientRect() : null; return { left: Math.round(e.scrollLeft), visible: !!sr && sr.left >= hr.left - 1 && sr.right <= hr.right + 1 }; });
    check(keep.left > 0 && keep.visible, `après le toucher, la barre n'est pas revenue au début (${keep.left}px) et la case choisie est visible`);
    await page.tap('.hotbar .slot-btn >> nth=4'); // 2e toucher : lancé tout de suite (pas de cible à choisir)
    await page.waitForTimeout(300);
    check(await page.$eval('.skill-detail', (e) => getComputedStyle(e).display === 'none'), 'après un lancer direct, l\'infobulle se referme');
    check(await page.$('.hotbar .slot.is-selected') === null, 'et plus aucune case n\'est « sélectionnée »');

    check((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, 'aucun débordement horizontal');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs JavaScript : ${errors.join(' | ')}` : 'aucune erreur JavaScript');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} problème(s)` : '\n✅ Test du bandeau de combat : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
