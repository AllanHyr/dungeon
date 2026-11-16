// Test de la VISIBILITÉ des bonus et malus en combat, dans un vrai navigateur :
//   · sur chaque carte de combattant : des pastilles lisibles (durée, couleur bonus/malus), trois au plus puis « +N », les malus d'abord ;
//   · le panneau « Tes effets » du bandeau d'action : groupes Bonus / Malus, une phrase qui explique chaque effet, la durée ;
//   · cliquer sur un autre combattant montre SES effets (et on peut revenir) ;
//   · sur petit écran (téléphone, portable peu haut), le panneau devient une pastille à côté de « Fin du tour » (une icône et deux compteurs : bonus, malus) qui ne prend
//     aucune hauteur de plus ; un toucher l'ouvre en surimpression au-dessus du bandeau ;
//   · quand une compétence pose un effet, son nom s'envole au-dessus du combattant.
// Usage : node tests/ui-effets.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

/** Lance un entraînement et pose des effets à la main sur le héros (Sacrieur), son allié (Veilleur) et les deux mannequins. */
async function setup(page, fx = 'reduced') {
  await page.goto(url);
  await page.waitForSelector('.menu');
  await page.evaluate(async (style) => {
    const { app } = await import('/src/ui/state.js');
    app.profile.settings.fx = style;
    const { startTraining, redraw } = await import('/src/ui/controller.js');
    startTraining([{ classId: 'sacrieur', level: 6, spec: 'bastion' }, { classId: 'veilleur', level: 6 }], { dummy: 'mannequin_agressif', count: 2, atkScale: 1 });
    await new Promise((r) => setTimeout(r, 400));
    const [a, v] = app.run.players;
    a.statuses.push({ id: 'mod', stat: 'damage', pct: 0.15, turns: 2 }, { id: 'mod', stat: 'taken', pct: -0.15, turns: 2 }, { id: 'taunt', turns: 2 }, { id: 'redirect', turns: 1, expires: 'turnStart' });
    a.shields.push({ amount: 12, turns: 2 });
    v.statuses.push({ id: 'poison', pct: 0.06, turns: 3 }, { id: 'hot', amount: 6, turns: 3 }, { id: 'mod', stat: 'atk', pct: -0.2, turns: 2 }, { id: 'stun', turns: 1 });
    const [m1, m2] = app.run.combat.monsters;
    m1.statuses.push({ id: 'poison', pct: 0.08, turns: 4 }, { id: 'stun', turns: 1 });
    m2.statuses.push({ id: 'dot', amount: 5, turns: 3, label: 'saigne' }, { id: 'mod', stat: 'def', pct: -0.3, turns: 2 });
    redraw();
  }, fx);
  await page.waitForSelector('.stage');
  await page.waitForTimeout(400);
}

/** Les pastilles d'un combattant : [{ tone, text, turns }] (sans le « +N »). */
const chipsOf = (page, unitId) => page.$$eval(`.fighter[data-unit="${unitId}"] .fx-chip:not(.fx-more)`, (els) => els.map((e) => ({
  tone: e.classList.contains('is-debuff') ? 'debuff' : e.classList.contains('is-buff') ? 'buff' : 'neutral',
  text: e.querySelector('.fx-txt')?.textContent.trim() || '',
  turns: e.querySelector('.fx-turns')?.textContent.trim() || '',
  label: e.getAttribute('aria-label') || e.title || ''
})));
const moreOf = (page, unitId) => page.$eval(`.fighter[data-unit="${unitId}"]`, (el) => el.querySelector('.fx-more')?.textContent.trim() || '');

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  for (const [label, opts] of [
    ['Bureau', { viewport: { width: 1360, height: 900 }, locale: 'fr-FR', reducedMotion: 'reduce' }],
    ['Portable peu haut', { viewport: { width: 1366, height: 650 }, locale: 'fr-FR', reducedMotion: 'reduce' }],
    ['Téléphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', reducedMotion: 'reduce' }]
  ]) {
    console.log(`\n● ${label}`);
    const phone = label !== 'Bureau'; // (« petit écran » : le panneau est une pastille)
    const tag = label === 'Bureau' ? 'bureau' : label === 'Téléphone' ? 'tel' : 'portable';
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
    await setup(page);

    const ids = await page.evaluate(async () => {
      const { app } = await import('/src/ui/state.js');
      return { actor: app.run.pending.actor, players: app.run.players.map((p) => p.id), monsters: app.run.combat.monsters.map((m) => m.id) };
    });
    const [sacId, vigId] = ids.players;
    const [m1, m2] = ids.monsters;

    // ---- les pastilles sur les cartes
    const sac = await chipsOf(page, sacId);
    check(sac.length === 3, `Sacrieur : trois pastilles au plus sur la carte (${sac.length})`);
    check((await moreOf(page, sacId)) === '+2', `Sacrieur : « +2 » annonce les autres effets (« ${await moreOf(page, sacId)} »)`);
    check(sac.every((c) => c.turns && /^\d+$/.test(c.turns)), 'chaque pastille porte sa durée (un petit badge)');
    check(sac.every((c) => c.label.length > 12), 'chaque pastille a une infobulle qui explique l\'effet');
    const vig = await chipsOf(page, vigId);
    check(vig[0]?.tone === 'debuff', `Veilleur : les malus passent en premier (« ${vig[0]?.text} »)`);
    check(vig.filter((c) => c.tone === 'debuff').length >= 2, 'Veilleur : poison et étourdissement visibles tout de suite');
    const mm1 = await chipsOf(page, m1);
    check(mm1.length === 2 && mm1.every((c) => c.tone === 'debuff'), `un mannequin empoisonné et étourdi : deux pastilles de malus (${mm1.map((c) => c.text).join(', ')})`);
    check(await moreOf(page, m1) === '', 'pas de « +N » quand tout tient');
    await page.screenshot({ path: `${out}/90-effets-${tag}-cartes.png` });

    // ---- le panneau « Tes effets » (le héros qui joue)
    const actorIsSac = ids.actor === sacId;
    const panel = page.locator('.fx-panel').first();
    check(await panel.count() === 1, 'le panneau des effets du héros qui joue est dans le bandeau d\'action');
    const dockH = await page.$eval('.dock', (e) => Math.round(e.getBoundingClientRect().height));
    if (phone) {
      check(await page.$('.dock-end details.fx-panel.is-folded') !== null, 'petit écran : le panneau est une pastille rangée à côté de « Fin du tour »');
      check(await page.$('.dock-hero .fx-panel') === null, 'et il ne prend plus de place dans la colonne du héros');
      check((await page.$eval('details.fx-panel', (e) => e.open)) === false, 'replié par défaut');
      check(await page.$eval('details.fx-panel .fx-pop', (e) => getComputedStyle(e).display === 'none'), 'sa fiche est cachée tant qu\'on ne touche pas');
      const sum = await page.$eval('details.fx-panel summary', (e) => ({ text: e.textContent.trim(), buff: e.querySelector('.fx-count.is-buff')?.textContent, debuff: e.querySelector('.fx-count.is-debuff')?.textContent, aria: e.getAttribute('aria-label') }));
      check(sum.buff && sum.debuff, `la pastille compte les bonus (${sum.buff}) et les malus (${sum.debuff})`);
      check(/Tes effets/.test(sum.aria), 'avec une infobulle « Tes effets »');
      check(/bonus/.test(sum.aria) && /malus/.test(sum.aria), `et le dit aux lecteurs d'écran (« ${sum.aria} »)`);
      const endBox = await page.$eval('.end-turn', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      check(endBox.w > 120 && endBox.h >= 40, `« Fin du tour » reste large et facile à toucher (${Math.round(endBox.w)}×${Math.round(endBox.h)})`);
      await page.screenshot({ path: `${out}/90b-effets-${tag}-pastille.png` });
      await page.click('details.fx-panel summary');
      await page.waitForTimeout(200);
      check(await page.$eval('details.fx-panel', (e) => e.open), 'un toucher l\'ouvre');
      const pop = await page.$eval('details.fx-panel .fx-pop', (e) => { const r = e.getBoundingClientRect(); const d = document.querySelector('.dock').getBoundingClientRect(); return { bottom: r.bottom, dockTop: d.top, h: r.height, w: r.width, vw: window.innerWidth }; });
      check(pop.bottom <= pop.dockTop + 1, `elle flotte au-dessus du bandeau (bas ${Math.round(pop.bottom)}px ≤ haut du bandeau ${Math.round(pop.dockTop)}px)`);
      check(pop.w <= pop.vw - 8, 'sans déborder de l\'écran');
      check(await page.$eval('.dock', (e) => Math.round(e.getBoundingClientRect().height)) === dockH, `le bandeau n'a pas grandi (${dockH}px)`);
    } else {
      check(await page.$('.dock-hero .fx-panel:not(.is-folded)') !== null, 'grand écran : le panneau complet reste dans la colonne du héros');
    }
    const head = await panel.textContent();
    check(/Tes effets/.test(head), 'titre « Tes effets »');
    const groups = await page.$$eval('.fx-panel .fx-group', (els) => els.map((e) => e.textContent.trim()));
    check(groups.includes('Bonus') && groups.includes('Malus'), `les effets sont rangés en groupes (${groups.join(', ')})`);
    const rows = await page.$$eval('.fx-panel .fx-row', (els) => els.map((e) => ({ id: e.dataset.effect, tone: e.dataset.tone, text: e.textContent })));
    check(rows.length >= 4, `chaque effet a sa ligne (${rows.length})`);
    check(rows.every((r) => r.text.replace(/\s+/g, ' ').length > 25), 'chaque ligne explique ce que fait l\'effet (phrase complète)');
    if (actorIsSac) {
      check(rows.some((r) => r.id === 'shield' && /Absorbe 12 dégâts/.test(r.text)), 'le bouclier dit combien il absorbe');
      check(rows.some((r) => r.id === 'taunt' && /viser/.test(r.text)), 'la provocation dit ce qu\'elle impose');
      check(rows.some((r) => r.id === 'mod' && r.tone === 'buff' && /Bonus temporaire/.test(r.text)), 'un bonus de caractéristique est expliqué (« Bonus temporaire »)');
    } else {
      check(rows.some((r) => r.id === 'poison' && r.tone === 'debuff' && /ne tue jamais/.test(r.text)), 'le poison dit qu\'il ne tue jamais');
    }
    check(rows.filter((r) => r.id !== 'mode').every((r) => /tour/.test(r.text)), 'chaque ligne annonce sa durée en tours');
    await page.screenshot({ path: `${out}/91-effets-${tag}-panneau.png` });
    if (phone) { await page.click('details.fx-panel summary'); await page.waitForTimeout(150); check(!(await page.$eval('details.fx-panel', (e) => e.open)), 'un second toucher la referme'); }

    // ---- cliquer sur un autre combattant : ses effets
    await page.click(`.fighter[data-unit="${m2}"]`);
    await page.waitForTimeout(250);
    check(await page.$(`.fighter[data-unit="${m2}"].is-inspected`) !== null, 'le combattant cliqué est mis en avant');
    const other = await page.$eval('.fx-panel', (e) => e.textContent.replace(/\s+/g, ' '));
    check(/Effets · /.test(other), 'le panneau annonce de qui sont les effets');
    check(/saigne|Saignement/i.test(other) && /5 PV/.test(other), 'le saignement du mannequin est expliqué (5 PV par tour)');
    check(/Malus temporaire/.test(other), 'son malus de défense est expliqué');
    check(/PV \d+\/\d+ · Att/.test(other), 'on voit aussi ses PV et ses caractéristiques du moment');
    check(/Revenir à/.test(other), 'un bouton ramène au héros qui joue');
    await page.screenshot({ path: `${out}/92-effets-${tag}-autre.png` });
    await page.click('.fx-panel button:has-text("Revenir")');
    await page.waitForTimeout(250);
    check(/Tes effets/.test(await page.$eval('.fx-panel', (e) => e.textContent)), '« Revenir » remet les effets du héros qui joue');
    check(await page.$('.fighter.is-inspected') === null, 'plus personne n\'est mis en avant');

    // recliquer sur le même combattant referme son inspection
    await page.click(`.fighter[data-unit="${m1}"]`);
    await page.waitForTimeout(200);
    check(await page.$(`.fighter[data-unit="${m1}"].is-inspected`) !== null, 'clic : inspecté');
    await page.click(`.fighter[data-unit="${m1}"]`);
    await page.waitForTimeout(200);
    check(await page.$('.fighter.is-inspected') === null, 'second clic : retour au héros qui joue');

    // un combattant sans aucun effet : on le dit plutôt que de laisser un trou
    await page.evaluate(async (id) => {
      const { app } = await import('/src/ui/state.js');
      const { redraw } = await import('/src/ui/controller.js');
      app.run.combat.monsters.find((m) => m.id === id).statuses = [];
      redraw();
    }, m2);
    await page.click(`.fighter[data-unit="${m2}"]`);
    await page.waitForTimeout(200);
    check(/Aucun effet actif/.test(await page.$eval('.fx-panel', (e) => e.textContent)), 'un combattant sans effet : « Aucun effet actif »');
    await page.click(`.fighter[data-unit="${m2}"]`);

    if (phone) {
      // choisir une compétence referme la fiche des effets : elle ne doit jamais cacher la description ni « Annuler »
      await page.click('details.fx-panel summary');
      await page.waitForTimeout(150);
      check(await page.$eval('details.fx-panel', (e) => e.open), 'la fiche des effets est ouverte');
      await page.evaluate(() => document.querySelectorAll('.hotbar .slot-btn')[0].dispatchEvent(new CustomEvent('hotkey')));
      await page.waitForTimeout(250);
      check(await page.$eval('details.fx-panel', (e) => !e.open), 'choisir une compétence referme la fiche des effets');
      const cancel = await page.evaluate(() => {
        const b = document.querySelector('.skill-detail .btn');
        if (!b || !b.getClientRects().length) return 'absent';
        const r = b.getBoundingClientRect();
        return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) ? 'libre' : 'cachée';
      });
      check(cancel !== 'cachée', `« Annuler » n'est jamais cachée par la fiche des effets (${cancel})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- le texte qui s'envole quand un effet est posé
  console.log('\n● Annonce d\'un effet posé (animations complètes)');
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'fr-FR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(url);
    await page.waitForSelector('.menu');
    await page.evaluate(async () => {
      const { app } = await import('/src/ui/state.js');
      app.profile.settings.fx = 'full';
      const { startTraining } = await import('/src/ui/controller.js');
      startTraining([{ classId: 'sacrieur', level: 6, spec: 'bastion' }], { dummy: 'mannequin_agressif', count: 1, atkScale: 1 });
    });
    await page.waitForSelector('.stage');
    await page.waitForTimeout(500);
    const prov = page.locator('.skill-btn:not([disabled])[aria-label^="Provocation"]').first();
    if (await prov.count()) {
      await prov.click();
      if (await page.$('.fighter.targetable')) await page.click('.fighter.targetable');
      await page.waitForFunction(() => document.documentElement.classList.contains('fx-playing'), null, { timeout: 3000 });
      const seen = new Set();
      for (let i = 0; i < 120 && (await page.evaluate(() => document.documentElement.classList.contains('fx-playing'))); i++) {
        (await page.$$eval('.fx-num', (els) => els.map((e) => `${e.className}|${e.textContent}`))).forEach((t) => seen.add(t));
        await page.waitForTimeout(50);
      }
      const all = [...seen].join(' ; ');
      check(/Provocation/.test(all), `« Provocation » s'envole au-dessus du héros (${all})`);
      check([...seen].some((t) => /Provocation/.test(t) && /buff|info/.test(t.split('|')[0])), 'le texte est coloré comme un bonus');
      await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      const chips = await page.$$eval('.fighter.player .fx-chip', (els) => els.map((e) => e.textContent));
      check(chips.some((t) => /Provocation/.test(t)), 'et la pastille « Provocation » est ensuite posée sur sa carte');
      await page.screenshot({ path: `${out}/93-effets-annonce.png` });
    } else {
      check(false, 'le bouton Provocation est introuvable dans la barre de combat');
    }
    await ctx.close();
  }

  await browser.close();
  if (errors.length) { console.log('\nErreurs de la page :'); errors.forEach((e) => console.log('  ❌', e)); }
  const bad = failures.length + errors.length;
  console.log(bad ? `\n❌ ${bad} problème(s)` : '\n✅ Tout est bon');
  process.exit(bad ? 1 : 0);
})();
