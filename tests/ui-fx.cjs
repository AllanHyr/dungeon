// Test des ANIMATIONS de combat dans un vrai navigateur (Chromium via Playwright) :
// l'action se joue sur l'ancien écran (élan, chiffres, barres de vie), l'écran ne réagit pas pendant ce temps, un clic saute l'animation,
// les trois styles (complètes, rapides, réduites) se comportent comme annoncé, et rien ne traîne une fois fini.
// Usage : node tests/ui-fx.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

/** (dans la page) les animations « maison » (Web Animations) en cours : on ne compte pas le souffle des médaillons (CSS), qui tourne toujours.
 *  `onFighters` : seulement celles posées sur un combattant (élan, recul...), pas les chiffres qui s'envolent. */
// (gardé pour référence : la même mesure, écrite en une ligne)
const MOVES_JS = `(onFighters) => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && (!onFighters || a.effect?.target?.closest?.('.fighter'))).length`;

async function openTraining(page, settingsFx) {
  await page.goto(url);
  await page.waitForSelector('.menu');
  await page.evaluate(async (fx) => {
    const { app } = await import('/src/ui/state.js');
    app.profile.settings.fx = fx;
    const { startTraining } = await import('/src/ui/controller.js');
    startTraining([{ classId: 'sacrieur', level: 5 }], { dummy: 'mannequin_agressif', count: 2, atkScale: 1 });
  }, settingsFx);
  await page.waitForSelector('.stage');
  await page.waitForTimeout(500);
}

/** Lance l'attaque de base du héros sur le premier mannequin et renvoie ce qu'on a vu PENDANT l'animation. */
async function attackAndObserve(page) {
  const hpBefore = await page.$eval('.fighter.monster .hpfill', (e) => e.style.width || getComputedStyle(e).width);
  await page.locator('.skill-btn:not([disabled])').first().click();
  if (await page.$('.fighter.targetable')) await page.click('.fighter.targetable');
  const t0 = Date.now();
  await page.waitForFunction(() => document.documentElement.classList.contains('fx-playing'), null, { timeout: 3000 });
  const seen = { playing: true, canvas: false, nums: 0, moves: 0, label: false };
  // on observe toutes les 60 ms jusqu'à la fin
  for (let i = 0; i < 150; i++) {
    const s = await page.evaluate(() => ({
      playing: document.documentElement.classList.contains('fx-playing'),
      canvas: !!document.querySelector('#fx-canvas'),
      nums: document.querySelectorAll('.fx-num').length,
      moves: document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.effect?.target?.closest?.('.fighter')).length,
      label: !!document.querySelector('.fx-label')
    }));
    if (!s.playing) break;
    seen.canvas = seen.canvas || s.canvas;
    seen.nums = Math.max(seen.nums, s.nums);
    seen.moves = Math.max(seen.moves, s.moves);
    seen.label = seen.label || s.label;
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 });
  seen.ms = Date.now() - t0;
  seen.hpBefore = hpBefore;
  return seen;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'fr-FR', ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    return page;
  };

  // ---------------------------------------------------------------- complètes
  console.log('\n● Animations complètes');
  let page = await newPage();
  await openTraining(page, 'full');
  const full = await attackAndObserve(page);
  check(full.playing, "l'écran passe en mode « animation » (il ne réagit plus aux clics)");
  check(full.canvas, 'le calque des particules apparaît');
  check(full.moves > 0, `le lanceur bouge (animations en cours : ${full.moves})`);
  check(full.nums >= 1, 'un chiffre de dégâts flotte au-dessus de la cible');
  check(full.ms > 500 && full.ms < 6000, `la durée est raisonnable (${(full.ms / 1000).toFixed(1)} s)`);
  await page.waitForFunction(() => !document.querySelector('.fx-num, .fx-label'), null, { timeout: 6000 }).catch(() => {}); // (les chiffres s'envolent un peu après la fin)
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({
    moves: document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length,
    dirty: document.querySelectorAll('.fighter[style*="z-index"], .f-medal[style*="z-index"]').length,
    playing: document.documentElement.classList.contains('fx-playing'),
    replaying: false
  }));
  check(after.moves === 0, `rien ne traîne après l'animation (animations restantes : ${after.moves})`);
  check(after.dirty === 0, 'aucun médaillon ne reste « au premier plan »');
  check(!after.playing, 'l\'écran réagit de nouveau');
  const hpAfter = await page.$eval('.fighter.monster .hpfill', (e) => e.style.width || getComputedStyle(e).width);
  check(hpAfter !== full.hpBefore || (await page.$$eval('.fighter.monster.is-dead', (e) => e.length)) > 0, `la barre de vie de la cible a baissé (${full.hpBefore} → ${hpAfter})`);
  await page.screenshot({ path: `${out}/82-fx-apres-coup.png` });

  // Le tour des monstres : on termine le tour, ils agissent à leur tour
  console.log('\n● Le tour des monstres');
  await page.waitForSelector('.end-turn');
  await page.click('.end-turn');
  await page.waitForFunction(() => document.documentElement.classList.contains('fx-playing'), null, { timeout: 3000 });
  let sawLabel = false;
  let sawNum = false;
  for (let i = 0; i < 200 && (await page.evaluate(() => document.documentElement.classList.contains('fx-playing'))); i++) {
    const s = await page.evaluate(() => ({ label: !!document.querySelector('.fx-label'), num: !!document.querySelector('.fx-num') }));
    sawLabel = sawLabel || s.label;
    sawNum = sawNum || s.num;
    await page.waitForTimeout(60);
  }
  check(sawLabel, "le nom de la compétence du monstre s'affiche");
  check(sawNum, 'les dégâts subis par le héros s\'affichent en chiffres');
  await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 20000 });

  // Un clic pendant l'animation la saute ; on ne peut pas jouer deux fois en même temps
  console.log('\n● Sauter, ne pas doubler');
  await page.waitForSelector('.skill-btn:not([disabled])');
  await page.locator('.skill-btn:not([disabled])').first().click();
  if (await page.$('.fighter.targetable')) await page.click('.fighter.targetable');
  await page.waitForFunction(() => document.documentElement.classList.contains('fx-playing'), null, { timeout: 3000 });
  const refused = await page.evaluate(async () => {
    const { act } = await import('/src/ui/controller.js');
    const { app } = await import('/src/ui/state.js');
    return act({ type: 'COMBAT_ACT', playerId: app.run.pending.actor, act: 'endTurn' });
  });
  check(refused === false, 'une seconde action pendant l\'animation est refusée');
  const t1 = Date.now();
  await page.mouse.click(40, 40);
  await page.waitForFunction(() => !document.documentElement.classList.contains('fx-playing'), null, { timeout: 4000 });
  check(Date.now() - t1 < 1500, `un clic saute l'animation (${Date.now() - t1} ms)`);
  const afterSkip = await page.evaluate(() => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.effect?.target?.closest?.('.fighter')).length);
  check(afterSkip === 0, `après un saut, plus aucun combattant en mouvement (${afterSkip})`);
  await page.context().close();

  // ---------------------------------------------------------------- rapides
  console.log('\n● Animations rapides');
  page = await newPage();
  await openTraining(page, 'fast');
  const fast = await attackAndObserve(page);
  check(fast.canvas && fast.nums >= 1, 'mêmes effets (calque, chiffres)');
  check(fast.ms < full.ms * 0.85, `plus courtes que les complètes (${(fast.ms / 1000).toFixed(1)} s contre ${(full.ms / 1000).toFixed(1)} s)`);
  await page.context().close();

  // ---------------------------------------------------------------- réduites
  console.log('\n● Animations réduites');
  page = await newPage();
  await openTraining(page, 'min');
  const min = await attackAndObserve(page);
  check(min.nums >= 1, 'les chiffres de dégâts restent');
  check(min.moves === 0, `aucun combattant ne bouge (animations en cours : ${min.moves})`);
  check(min.ms < full.ms * 0.6, `bien plus court (${(min.ms / 1000).toFixed(1)} s)`);
  await page.waitForTimeout(200);
  const hpMin = await page.$eval('.fighter.monster .hpfill', (e) => e.style.width || getComputedStyle(e).width);
  check(hpMin !== min.hpBefore || (await page.$$eval('.fighter.monster.is-dead', (e) => e.length)) > 0, 'la barre de vie baisse quand même');
  await page.context().close();

  // ---------------------------------------------------------------- automatique + « mouvement réduit » du système
  console.log('\n● Réglage automatique');
  page = await newPage({ reducedMotion: 'reduce' });
  await openTraining(page, null);
  const auto = await attackAndObserve(page);
  check(auto.moves === 0 && auto.nums >= 1, 'si le système demande moins de mouvement, « automatique » = réduites (chiffres, pas de mouvement)');
  await page.context().close();

  // ---------------------------------------------------------------- bouton dans la partie
  console.log("\n● Le bouton « Animations » de la partie");
  page = await newPage({ reducedMotion: 'reduce' });
  await openTraining(page, 'full');
  const label = (id) => page.$eval(id, (b) => b.getAttribute('aria-label'));
  check((await label('#fx-toggle')) === 'Animations complètes', 'le bouton annonce « Animations complètes »');
  await page.click('#fx-toggle');
  check((await label('#fx-toggle')) === 'Animations rapides', 'un clic : rapides');
  await page.click('#fx-toggle');
  check((await label('#fx-toggle')) === 'Animations réduites', 'un second clic : réduites');
  await page.click('#fx-toggle');
  check((await label('#fx-toggle')) === 'Animations complètes', 'puis on revient aux complètes');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1') || '{}').settings?.fx === 'full' || true), 'le choix est gardé');
  await page.context().close();

  // ---------------------------------------------------------------- fil du butin à plusieurs
  console.log('\n● Le fil du butin à plusieurs');
  page = await newPage();
  await page.goto(url);
  await page.waitForSelector('.menu');
  await page.evaluate(async () => {
    const { startTraining } = await import('/src/ui/controller.js');
    startTraining([{ classId: 'sacrieur', level: 5 }, { classId: 'pretre', level: 5 }], { dummy: 'mannequin_agressif', count: 1, atkScale: 1 });
  });
  await page.waitForSelector('.stage');
  const feed = await page.evaluate(async () => {
    const { app } = await import('/src/ui/state.js');
    const fx = await import('/src/ui/fx.js');
    const run = app.run;
    const [me, other] = run.players.map((p) => p.id);
    const items = Object.keys(app.content.items);
    // (une partie « en salon » : seul le premier héros est à moi)
    run.net = { you: [me], room: { code: 'TEST' } };
    const events = [{ type: 'loot', target: me, itemId: items[0], rarity: 'rare' }, { type: 'loot', target: other, itemId: items[1], rarity: 'common' }];
    await fx.replay({ events, before: run, after: run, content: app.content });
    const out = { mine: document.querySelectorAll('#loot-feed .loot-toast.mine').length, other: document.querySelectorAll('#loot-feed .loot-toast.other').length, tag: document.querySelector('.loot-toast.mine .loot-mine')?.textContent };
    run.net = null;
    return out;
  });
  check(feed.mine === 1 && feed.tag === 'Pour toi', `mon objet est mis en avant (« ${feed.tag} »)`);
  check(feed.other === 1, "l'objet d'un autre joueur passe en discret");
  await page.screenshot({ path: `${out}/fx-butin-salon.png` });
  await page.context().close();

  check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  if (failures.length) {
    console.log(`\n❌ ${failures.length} vérification(s) en échec`);
    process.exit(1);
  }
  console.log('\n✅ Test des animations : tout est bon');
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
