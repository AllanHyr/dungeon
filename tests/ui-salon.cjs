// Test d'une partie À PLUSIEURS en ligne, dans de vrais navigateurs (Chromium via Playwright) : deux joueurs, deux fenêtres.
//   1. Alice crée un salon, Bob le rejoint avec le code ; la salle d'attente se met à jour des deux côtés sans recharger.
//   2. Ils jouent un donjon ensemble : chacun ne peut agir qu'à son tour, sur son héros ; l'écran dit à qui est le tour.
//   3. Un joueur qui quitte en pleine partie : son héros passe au pilote automatique, et il ne gagne rien.
//   4. Le minuteur est tenu par le serveur : un joueur qui ne répond pas est remplacé, les écrans suivent tout seuls.
// Le serveur du jeu est lancé par le test lui-même (base en mémoire, rien à démarrer avant).
// Usage : node tests/ui-salon.cjs [dossier_captures]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { startServer } = await import('./server-kit.mjs');
  const server = await startServer();
  const url = `${server.base}/`;
  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
  };
  const apiGet = (page, path) => page.evaluate(async (u) => (await fetch(u, { credentials: 'same-origin' })).json(), new URL(path, page.url()).href);

  /** Une fenêtre de navigateur : un joueur inscrit, avec ses trois héros d'exemple. */
  async function newPlayer(base, name, viewport = { width: 1360, height: 900 }) {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport, locale: 'fr-FR' });
    const page = await ctx.newPage();
    watch(page, name);
    await page.goto(`${base}/`);
    await page.waitForSelector('.auth');
    await page.click('#tab-register');
    await page.fill('#auth-name', name);
    await page.fill('#auth-password', 'secret123');
    await page.click('#auth-submit');
    await page.waitForSelector('.menu');
    await page.click("text=Créer 3 héros d'exemple");
    await page.waitForFunction(() => document.querySelectorAll('.char-card:not(.new-card)').length === 3);
    const profile = await apiGet(page, 'api/profile');
    return { name, ctx, page, id: profile.user.id, heroes: profile.characters };
  }

  /** Ce que l'écran affiche, lu d'un seul coup (jamais d'après l'état interne : c'est ce que le joueur voit qui compte). */
  const snapshot = (page) => page.evaluate(() => {
    const $ = (s) => document.querySelector(s);
    const dis = (s) => $(s) ? $(s).disabled : null;
    return {
      screen: $('.end-screen') ? 'end' : $('.run') ? 'run' : $('.lobby') ? 'lobby' : $('.menu') ? 'menu' : $('.auth') ? 'login' : '?',
      mine: !!($('#turn-banner.mine') || $('.dock.my-turn')),
      theirs: !!($('#turn-banner.theirs') || $('.dock.spectator')),
      kind: $('.advance-card') ? 'advance' : $('.roll-card') ? 'roll' : $('.loot-card') ? 'loot' : $('.choice-card') ? 'choice' : $('.shop-card') ? 'shop' : $('.camp-card') ? 'camp' : $('.action-card') ? 'combat' : $('.center-card') ? 'over' : null,
      advance: dis('#advance-btn'), roll: dis('#roll-btn'), shopLeave: dis('#shop-leave'), endTurn: dis('.end-turn'),
      choices: [...document.querySelectorAll('.choice-card .btn, .loot-card .btn')].map((b) => b.disabled),
      skills: [...document.querySelectorAll('.skill-btn')].map((b) => b.disabled),
      dice: !!$('.dice-overlay'), title: document.title
    };
  });
  const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  /** Attend un élément ; s'il n'apparaît pas, dit où l'on est et ce que le message à l'écran raconte (au lieu d'un simple « timeout »). */
  const waitFor = async (page, selector, label, timeout = 8000) => {
    try {
      await page.waitForSelector(selector, { timeout });
    } catch (e) {
      const info = await page.evaluate(() => ({ screen: document.querySelector('.end-screen') ? 'end' : document.querySelector('.run') ? 'run' : document.querySelector('.lobby') ? 'lobby' : document.querySelector('.menu') ? 'menu' : '?', toast: document.getElementById('toast')?.textContent || '' }));
      await page.screenshot({ path: `${out}/999-echec.png`, fullPage: true }).catch(() => {});
      throw new Error(`« ${label} » n'est pas apparu (${selector}) : écran « ${info.screen} », message « ${info.toast} »`);
    }
  };

  /** Joue la partie, chacun à son tour (en cliquant, comme un humain) et vérifie à chaque pas que l'écran ne laisse agir que celui qui doit. */
  async function playTogether(players, { until = () => false, maxMs = 240000, shots = null, phoneOnCombat = null } = {}) {
    const seen = new Set();
    const stats = { steps: 0, violations: [], mineSeen: new Set(), theirsSeen: new Set() };
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      if (await until(stats)) break;
      let acted = false;
      for (const p of players) {
        const { page } = p;
        let s = await snapshot(page);
        if (s.dice) { await page.click('.dice-overlay', { timeout: 1500 }).catch(() => {}); acted = true; continue; }
        if (s.screen !== 'run') continue;
        // Contrôle de cohérence : quand ce n'est pas mon tour, rien de ce qui agit ne doit être cliquable.
        if (s.theirs) {
          stats.theirsSeen.add(s.kind);
          const open = [s.advance === false && 'Avancer', s.roll === false && 'Lancer', s.shopLeave === false && 'Quitter l\'étal', s.endTurn === false && 'Fin du tour', s.choices.includes(false) && 'un choix', s.skills.includes(false) && 'une compétence'].filter(Boolean);
          if (open.length) stats.violations.push(`${p.name} (${s.kind}) : ${open.join(', ')} cliquable(s) hors de son tour`);
          if (shots && !seen.has(`theirs-${s.kind}`)) { seen.add(`theirs-${s.kind}`); await page.screenshot({ path: `${out}/${shots}-${p.name}-${s.kind}-spectateur.png` }); }
        }
        if (phoneOnCombat === p && s.kind === 'combat' && !seen.has('phone-combat')) {
          // le même combat sur un téléphone : rien ne doit déborder, et chaque héros dit à qui il est
          seen.add('phone-combat');
          await page.setViewportSize({ width: 390, height: 844 });
          await sleep(400);
          stats.phoneCombat = {
            overflow: await overflowOf(page),
            owners: await page.$$eval('.fighter.player .f-owner', (els) => els.map((e) => e.textContent.trim())),
            mineRing: (await page.$$('.fighter.player.mine')).length
          };
          await page.screenshot({ path: `${out}/211-combat-telephone-${s.mine ? 'a-toi' : 'spectateur'}.png` });
          await page.setViewportSize({ width: 1360, height: 900 });
          await sleep(300);
          s = await snapshot(page);
        }
        if (!s.mine) continue;
        stats.mineSeen.add(s.kind);
        if (shots && !seen.has(`mine-${s.kind}`)) { seen.add(`mine-${s.kind}`); await page.screenshot({ path: `${out}/${shots}-${p.name}-${s.kind}-a-toi.png` }); }
        const click = (sel) => page.click(sel, { timeout: 2500 }).then(() => true, () => false);
        let ok = false;
        if (s.kind === 'advance') ok = await click('#advance-btn');
        else if (s.kind === 'roll') ok = await click('#roll-btn');
        else if (s.kind === 'loot') ok = await click('.loot-card .btn-primary');
        else if (s.kind === 'choice') ok = (await click('.choice-card .btn-primary')) || (await click('.choice-card .btn:not([disabled])'));
        else if (s.kind === 'shop') ok = await click('#shop-leave');
        else if (s.kind === 'camp') ok = await click('.camp-act[data-activity="rest"]'); // (au feu de camp : chacun à son tour)
        else if (s.kind === 'over') ok = await click('.center-card .btn-primary');
        else if (s.kind === 'combat') {
          if (await page.$('.fighter.targetable')) ok = await click('.fighter.targetable');
          else {
            const skills = await page.$$('.skill-btn:not([disabled])');
            if (skills.length && Math.random() < 0.8) ok = await skills[Math.floor(Math.random() * skills.length)].click({ timeout: 2500 }).then(() => true, () => false);
            else ok = await click('.end-turn');
          }
        }
        if (ok) { stats.steps++; acted = true; await sleep(120); }
      }
      if (!acted) await sleep(150);
    }
    return stats;
  }

  // =====================================================================================================
  console.log('\n● Accueil en ligne : UN héros par compte');
  const alice = await newPlayer(server.base, 'Alice');
  const A = alice.page;
  await A.click(`.char-card[data-char="${alice.heroes[0].id}"]`);
  await A.click(`.char-card[data-char="${alice.heroes[1].id}"]`);
  check((await A.$$('.char-card.selected')).length === 1, 'cliquer un deuxième héros remplace le premier : on n\'en amène qu\'un seul');
  check(!!(await A.$('#room-create')) && /salon/i.test(await A.textContent('#room-create')), 'le gros bouton dit « Créer un salon »');
  check(!!(await A.$('#room-code')) && !!(await A.$('#room-join-code')), 'on peut rejoindre un salon avec son code');
  check((await A.$$('.launch-heroes .portrait')).length === 1, 'la barre du bas ne montre qu\'un héros');
  await A.screenshot({ path: `${out}/200-accueil-salon.png`, fullPage: true });
  await A.click(`.char-card[data-char="${alice.heroes[0].id}"]`);

  console.log('\n● Créer un salon, inviter un ami');
  await A.click('#room-create');
  await A.waitForSelector('.lobby');
  const code = (await A.textContent('.lobby-code b')).trim();
  check(/^[A-Z2-9]{5}$/.test(code), `le salon a un code à 5 caractères (${code})`);
  check((await A.$$('.lobby-member:not(.is-empty)')).length === 1 && (await A.$$('.lobby-member.is-empty')).length === 3, 'un joueur dans le salon, trois places libres');
  check(!(await A.$eval('#lobby-start', (b) => b.disabled)), 'seul dans son salon, l\'hôte peut lancer');
  await A.click('.lobby-code');
  check(await A.$eval('#toast', (t) => t.classList.contains('show')).catch(() => false), 'copier le code : un message le confirme');
  await A.screenshot({ path: `${out}/201-salle-attente-hote.png`, fullPage: true });

  const bob = await newPlayer(server.base, 'Bob');
  const B = bob.page;
  await B.click(`.char-card[data-char="${bob.heroes[0].id}"]`);
  await B.fill('#room-code', code.toLowerCase());
  await B.click('#room-join-code');
  await B.waitForSelector('.lobby');
  check((await B.textContent('.lobby-code b')).trim() === code, 'Bob entre dans le salon avec le code');
  await A.waitForFunction(() => document.querySelectorAll('.lobby-member:not(.is-empty)').length === 2);
  check(true, 'Alice voit Bob arriver, sans recharger la page');
  check(await A.$eval('#lobby-start', (b) => b.disabled), 'le bouton « Lancer » attend que Bob soit prêt');
  check(/Bob/.test(await A.textContent('.launch-who')), 'et la barre dit qu\'on attend Bob');
  check((await B.$$('.tranche-card:not([disabled])')).length === 0, 'chez Bob, le choix du donjon est en lecture seule');
  check(!!(await B.$('#lobby-ready')) && !(await B.$('#lobby-start')), 'Bob a « Je suis prêt », pas « Lancer »');

  // l'hôte règle la partie : Bob le voit
  await A.click('.mode-opt[data-turn="0"]');
  await B.waitForFunction(() => /Pas de minuteur/.test(document.querySelector('.lobby-setup')?.textContent || ''));
  check(true, 'Alice règle « sans minuteur » : Bob le voit tout de suite');
  // Bob change de héros : Alice le voit
  await B.click(`.lobby-hero[data-char="${bob.heroes[1].id}"]`);
  await A.waitForFunction((n) => document.querySelector(`.lobby-member[data-user]:not(.is-me) .char-name`)?.textContent === n, bob.heroes[1].name);
  check(true, `Bob choisit ${bob.heroes[1].name} : Alice le voit`);
  // l'hôte retire un joueur : il retourne à l'accueil et peut revenir avec le code
  await A.click('.kick-btn');
  await A.waitForSelector('.confirm-layer');
  await A.click('.confirm-layer .btn-danger');
  await waitFor(B, '.menu', 'l\'accueil de Bob après avoir été retiré');
  check(/plus dans ce salon/.test(await B.textContent('#toast')), 'Alice retire Bob : il retourne à l\'accueil, avec un message');
  await A.waitForFunction(() => document.querySelectorAll('.lobby-member:not(.is-empty)').length === 1);
  check((await A.$$('.lobby-member.is-empty')).length === 3, 'le salon d\'Alice repasse à un joueur, trois places libres');
  check(!(await B.$('.room-banner')), 'et Bob n\'a plus de salon');
  await B.click(`.char-card[data-char="${bob.heroes[1].id}"]`);
  await B.fill('#room-code', code);
  await B.click('#room-join-code');
  await waitFor(B, '.lobby', 'le retour de Bob dans le salon');
  await A.waitForFunction(() => document.querySelectorAll('.lobby-member:not(.is-empty)').length === 2);
  check(true, 'Bob revient avec le code');
  await B.click('#lobby-ready');
  await A.waitForFunction(() => !document.querySelector('#lobby-start').disabled);
  check(true, 'Bob se dit prêt : le bouton « Lancer » s\'allume chez Alice');
  check((await A.$$('.ready-chip.on')).length === 2, 'les deux joueurs sont « prêts »');
  await A.screenshot({ path: `${out}/202-salle-attente-prets.png`, fullPage: true });
  await B.screenshot({ path: `${out}/203-salle-attente-invite.png`, fullPage: true });

  // un joueur qui recharge sa page retrouve son salon
  await B.reload();
  await B.waitForSelector('.menu');
  check(!!(await B.$('.room-banner')), 'après un rechargement, l\'accueil rappelle le salon de Bob');
  await B.click('.room-banner .btn-primary');
  await B.waitForSelector('.lobby');
  check(true, 'et le bouton le ramène dans la salle d\'attente');

  // le flux temps réel de Bob est coupé quelques secondes : un message le dit, Alice voit son point passer au gris, puis au vert
  const dotOf = (page) => page.evaluate(() => document.querySelector('.lobby-member:not(.is-me) .presence')?.classList.contains('on'));
  check(await dotOf(A), 'avant la coupure, Bob est « en ligne » chez Alice (point vert)');
  await B.route('**/api/events', (route) => route.abort());
  server.app.hub.closeAll(); // (le serveur ferme tous les flux : les navigateurs retentent, mais Bob est empêché de se reconnecter)
  await waitFor(B, '#link-lost', 'le message « connexion perdue » de Bob', 15000);
  check(true, 'le flux de Bob est coupé : un message « Connexion perdue » apparaît');
  await A.waitForFunction(() => !document.querySelector('.lobby-member:not(.is-me) .presence')?.classList.contains('on'), null, { timeout: 15000 });
  check(true, 'chez Alice, le point de Bob passe au gris (hors ligne)');
  await B.unroute('**/api/events');
  await B.waitForSelector('#link-lost', { state: 'detached', timeout: 15000 });
  check(true, 'le réseau revient : le message disparaît tout seul');
  await A.waitForFunction(() => document.querySelector('.lobby-member:not(.is-me) .presence')?.classList.contains('on'), null, { timeout: 15000 });
  check(true, 'et le point de Bob repasse au vert chez Alice');

  // la salle d'attente sur téléphone
  await B.setViewportSize({ width: 390, height: 844 });
  await sleep(250);
  check((await overflowOf(B)) <= 0, 'téléphone : la salle d\'attente ne déborde pas');
  await B.screenshot({ path: `${out}/204-salle-attente-telephone.png`, fullPage: true });
  await B.setViewportSize({ width: 1360, height: 900 });

  console.log('\n● La partie, chacun son tour');
  await A.click('#lobby-start');
  await A.waitForSelector('.run');
  await B.waitForSelector('.run', { timeout: 8000 });
  check(true, 'Alice lance : Bob arrive dans la partie tout seul');
  check((await A.textContent('.run-title .muted')).includes(code), 'l\'en-tête rappelle le code du salon');
  check(!!(await A.$('#turn-pill')) && /Sans minuteur/.test(await A.textContent('#turn-pill')), 'le minuteur du salon est affiché (en lecture seule)');
  check(!(await A.$('.run-stats .btn-on')), 'pas de bouton « Minuteur » à plusieurs : c\'est le salon qui décide');
  check(!!(await A.$('#run-abandon')) && !(await B.$('#run-abandon')), 'seul l\'hôte voit « Abandonner »');
  check(!!(await A.$('#room-leave')) && !!(await B.$('#room-leave')), 'tout le monde peut « Quitter »');
  const first = [await snapshot(A), await snapshot(B)];
  check(first.filter((s) => s.mine).length === 1 && first.filter((s) => s.theirs).length === 1, 'au début, un seul des deux a la main, l\'autre regarde');
  const actorPage = first[0].mine ? A : B;
  const watchPage = first[0].mine ? B : A;
  check(/À toi de jouer/.test(await actorPage.title()), 'l\'onglet de celui qui joue le dit dans son titre');
  check(!/À toi de jouer/.test(await watchPage.title()), 'et pas celui de l\'autre');
  check((await watchPage.$eval('#advance-btn', (b) => b.disabled)), 'celui qui regarde ne peut pas cliquer sur « Avancer »');
  check(!(await actorPage.$eval('#advance-btn', (b) => b.disabled)), 'celui qui joue le peut');
  check(/En attente d[e']/.test(await watchPage.textContent('#turn-banner')), 'le bandeau dit « En attente de… »');
  check(/C'est à toi/.test(await actorPage.textContent('#turn-banner')), 'et chez l\'autre « C\'est à toi de jouer ! »');
  check((await watchPage.$$('.unit.mine')).length === 1 && (await actorPage.$$('.unit.mine')).length === 1, 'chacun voit un seul héros « à lui » dans l\'équipe');
  check((await watchPage.$$('.owner-tag')).length === 2, 'et chaque héros dit à qui il est');
  check((await watchPage.$$('.unit .btn-small')).length === 1, 'chacun n\'ouvre que le sac de SON héros');
  // tricher depuis la console : le garde-fou du navigateur répond « Ce n'est pas ton tour »
  const refused = await watchPage.evaluate(async () => {
    const { act } = await import('/src/ui/controller.js');
    return act({ type: 'ADVANCE' });
  });
  check(refused === false, 'même en forçant l\'action depuis la console, le navigateur de celui qui regarde ne l\'envoie pas');
  const cheat = await watchPage.evaluate(async () => {
    const r = await fetch('api/run/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: { type: 'ADVANCE' } }) });
    return r.json();
  });
  check(cheat.ok === false, `et le serveur refuse aussi (« ${cheat.error} »)`);
  await watchPage.screenshot({ path: `${out}/205-partie-spectateur.png`, fullPage: true });
  await actorPage.screenshot({ path: `${out}/206-partie-a-toi.png`, fullPage: true });
  await watchPage.setViewportSize({ width: 390, height: 844 });
  await sleep(250);
  check((await overflowOf(watchPage)) <= 0, 'téléphone : l\'écran de partie à plusieurs ne déborde pas');
  await watchPage.screenshot({ path: `${out}/207-partie-telephone.png` });
  await watchPage.setViewportSize({ width: 1360, height: 900 });

  console.log('\n● On joue ensemble jusqu\'à la fin');
  const players = [{ name: 'Alice', page: A }, { name: 'Bob', page: B }];
  const stats = await playTogether(players, { shots: '210', phoneOnCombat: players[1], until: async () => (await snapshot(A)).screen === 'end' && (await snapshot(B)).screen === 'end' });
  console.log(`   (${stats.steps} actions jouées ; écrans « à toi » : ${[...stats.mineSeen].join(', ')} ; écrans « spectateur » : ${[...stats.theirsSeen].join(', ')})`);
  check((await snapshot(A)).screen === 'end' && (await snapshot(B)).screen === 'end', 'les deux joueurs arrivent au bilan');
  check(stats.violations.length === 0, stats.violations.length ? `rien de cliquable hors de son tour — ${stats.violations.slice(0, 3).join(' | ')}` : 'à aucun moment un joueur n\'a pu cliquer hors de son tour');
  check(stats.mineSeen.has('combat') && stats.theirsSeen.has('combat'), 'le combat a été vu des deux côtés (acteur et spectateur)');
  check(!!stats.phoneCombat && stats.phoneCombat.overflow <= 0, `téléphone : le combat à plusieurs ne déborde pas (${stats.phoneCombat ? stats.phoneCombat.overflow : '?'} px)`);
  check(!!stats.phoneCombat && stats.phoneCombat.owners.length >= 2 && stats.phoneCombat.owners.includes('toi') && stats.phoneCombat.mineRing === 1, `téléphone : chaque héros dit à qui il est (${stats.phoneCombat ? stats.phoneCombat.owners.join(', ') : '?'})`);
  check((await A.$$('.end-player')).length === 2 && (await A.$$('.end-player.is-mine')).length === 1, 'le bilan montre les deux héros, dont un seul est « à moi »');
  check(/toi/.test(await A.textContent('.end-player.is-mine .unit-name')), 'mon héros est marqué « toi » et passe en premier');
  check(!(await A.$('text=Rejouer avec la même équipe')), 'pas de « Rejouer » à plusieurs : le salon est fermé');
  check(!!(await A.$('.end-room-note')), 'une note explique comment rejouer ensemble');
  await A.screenshot({ path: `${out}/220-bilan-salon.png`, fullPage: true });
  const aProfile = await apiGet(A, 'api/profile');
  const bProfile = await apiGet(B, 'api/profile');
  check(aProfile.room === null && aProfile.run === null && bProfile.room === null && bProfile.run === null, 'le serveur a effacé la partie et le salon pour tout le monde');
  check(aProfile.characters.find((c) => c.id === alice.heroes[0].id).stats.runs === 1, 'le bilan d\'Alice est appliqué à son héros');
  check(bProfile.characters.find((c) => c.id === bob.heroes[1].id).stats.runs === 1, 'et celui de Bob au sien');
  check(bProfile.characters.filter((c) => c.stats.runs > 0).length === 1, 'les autres héros de Bob n\'ont pas bougé (un seul héros par partie)');
  await A.click('#end-menu');
  await A.waitForSelector('.menu');
  check(!(await A.$('.room-banner')), 'retour à l\'accueil : plus de salon');

  // =====================================================================================================
  console.log('\n● Quitter en pleine partie');
  await A.click(`.char-card[data-char="${alice.heroes[0].id}"]`);
  await A.click('#room-create');
  await waitFor(A, '.lobby', 'la salle d\'attente du deuxième salon');
  const code2 = (await A.textContent('.lobby-code b')).trim();
  await A.click('.mode-opt[data-turn="0"]');
  await B.click('#end-menu');
  await B.waitForSelector('.menu');
  await B.click(`.char-card[data-char="${bob.heroes[2].id}"]`);
  await B.fill('#room-code', code2);
  await B.click('#room-join-code');
  await waitFor(B, '.lobby', 'la salle d\'attente de Bob (deuxième salon)');
  await B.click('#lobby-ready');
  await A.waitForFunction(() => !document.querySelector('#lobby-start').disabled);
  const bobBefore = (await apiGet(B, 'api/profile')).characters.find((c) => c.id === bob.heroes[2].id);
  await A.click('#lobby-start');
  await A.waitForSelector('.run');
  await B.waitForSelector('.run', { timeout: 8000 });
  await playTogether(players, { maxMs: 40000, until: async (st) => st.steps >= 6 });
  // Bob quitte
  await B.click('#room-leave');
  await B.waitForSelector('.confirm-layer');
  check(/pilote automatique/.test(await B.textContent('.confirm-layer')), 'la confirmation prévient : le héros reste, joué par le pilote automatique');
  await B.click('.confirm-layer .btn-danger');
  await B.waitForSelector('.menu', { timeout: 6000 });
  check(!(await B.$('.room-banner')) && (await apiGet(B, 'api/profile')).run === null, 'Bob est libre : retour à l\'accueil, plus de partie');
  await A.waitForSelector('.owner-tag.is-auto, .f-owner.is-auto, #turn-banner:has-text("pilote automatique")', { timeout: 6000 });
  check(true, 'chez Alice, le héros de Bob est marqué « pilote automatique »');
  await A.screenshot({ path: `${out}/230-apres-depart.png`, fullPage: true });
  // Alice continue seule : les tours du héros de Bob sont joués par le serveur
  const revBefore = await A.evaluate(async () => (await import('/src/ui/state.js')).app.run.net.rev);
  // (le nombre de versions gagnées dépend du donjon tiré au hasard : on joue jusqu'à ce que la partie ait avancé de plus que les seuls pas d'Alice)
  await playTogether([players[0]], { maxMs: 60000, until: async (st) => st.steps >= 8 && (await A.evaluate(async () => (await import('/src/ui/state.js')).app.run.net.rev)) > revBefore + 8 });
  const revAfter = await A.evaluate(async () => (await import('/src/ui/state.js')).app.run.net.rev);
  check(revAfter > revBefore + 8, `la partie avance sans Bob (le pilote automatique joue son héros : version ${revBefore} → ${revAfter})`);
  // l'hôte abandonne
  if ((await snapshot(A)).screen === 'run') {
    await A.click('#run-abandon');
    await A.waitForSelector('.confirm-layer');
    check(/TOUT le groupe/.test(await A.textContent('.confirm-layer')), 'à plusieurs, « Abandonner » prévient que c\'est pour tout le groupe');
    await A.click('.confirm-layer .btn-danger');
  }
  await A.waitForSelector('.end-screen', { timeout: 10000 });
  check(/Parti avant la fin/.test(await A.textContent('.end-screen')), 'le bilan dit que le joueur parti ne touche rien');
  check((await A.$$('.end-player.has-left')).length === 1, 'et marque son héros à part');
  await A.screenshot({ path: `${out}/231-bilan-depart.png`, fullPage: true });
  const bobAfter = (await apiGet(B, 'api/profile')).characters.find((c) => c.id === bob.heroes[2].id);
  check(JSON.stringify(bobAfter) === JSON.stringify(bobBefore), 'le héros de Bob n\'a rien gagné ni rien perdu');
  await alice.ctx.close();
  await bob.ctx.close();

  // =====================================================================================================
  console.log('\n● Quand l\'hôte part, le salon continue');
  await server.app.close();
  const fast = await startServer({ timerScale: 0.1 }); // (« 30 s » durent 3 s : on n'a pas le temps d'attendre pour de vrai)
  const carol = await newPlayer(fast.base, 'Carol');
  const dave = await newPlayer(fast.base, 'Dave');
  const C = carol.page;
  const D = dave.page;
  await C.click(`.char-card[data-char="${carol.heroes[0].id}"]`);
  await C.click('#room-create');
  await waitFor(C, '.lobby', 'le salon de Carol');
  const code3 = (await C.textContent('.lobby-code b')).trim();
  await D.click(`.char-card[data-char="${dave.heroes[0].id}"]`);
  await D.fill('#room-code', code3);
  await D.click('#room-join-code');
  await waitFor(D, '.lobby', 'Dave dans le salon de Carol');
  await C.waitForFunction(() => document.querySelectorAll('.lobby-member:not(.is-empty)').length === 2);
  await C.click('.lobby-leave');
  await C.waitForSelector('.confirm-layer');
  await C.click('.confirm-layer .btn-primary');
  await waitFor(C, '.menu', 'l\'accueil de Carol après avoir quitté');
  await waitFor(D, '#lobby-start', 'le bouton « Lancer » de Dave');
  check(true, 'Carol (l\'hôte) quitte le salon : Dave en devient l\'hôte et peut lancer');
  check(/Dave/.test(await D.textContent('.lobby-header .tagline')), 'le salon porte maintenant le nom de Dave');
  await C.click(`.char-card[data-char="${carol.heroes[0].id}"]`);
  await C.fill('#room-code', code3);
  await C.click('#room-join-code');
  await waitFor(C, '#lobby-ready', 'Carol, revenue comme simple joueur');
  check(true, 'Carol revient avec le code, cette fois comme simple joueur');

  console.log('\n● Le minuteur est tenu par le serveur');
  await D.click('.mode-opt[data-turn="30"]');
  await C.waitForFunction(() => /30 s/.test(document.querySelector('.lobby-setup')?.textContent || ''));
  await C.click('#lobby-ready');
  await D.waitForFunction(() => !document.querySelector('#lobby-start').disabled);
  await D.click('#lobby-start');
  await C.waitForSelector('.run');
  await D.waitForSelector('.run', { timeout: 8000 });
  await C.waitForSelector('#turn-banner .timer-text');
  const timerText = (await C.textContent('#turn-banner .timer-text')).trim();
  check(/^\d+ s$/.test(timerText) && parseInt(timerText, 10) <= 3, `le décompte du tour s'affiche et descend tout seul (« ${timerText} »)`);
  const rev0 = await C.evaluate(async () => (await import('/src/ui/state.js')).app.run.net.rev);
  await sleep(6500); // (personne ne joue : le serveur joue à la place de celui dont c'est le tour, puis du suivant...)
  const revC = await C.evaluate(async () => (await import('/src/ui/state.js')).app.run.net.rev);
  const revD = await D.evaluate(async () => (await import('/src/ui/state.js')).app.run.net.rev);
  check(revC > rev0 && revC === revD, `personne n'a cliqué : le serveur a joué et les deux écrans sont à la même version (${rev0} → ${revC})`);
  const log = await C.evaluate(async () => (await import('/src/ui/state.js')).app.run.log.map((l) => l.text).join('\n'));
  check(/temps|minuteur|absent|pilote/i.test(log) || revC > rev0, 'la partie a avancé sans aucun clic');
  await C.screenshot({ path: `${out}/240-minuteur-serveur.png` });
  await carol.ctx.close();
  await dave.ctx.close();
  await fast.app.close();

  // =====================================================================================================
  const realErrors = errors.filter((e) => !/40[0-9]|409|403|ERR_FAILED|ERR_INCOMPLETE_CHUNKED/.test(e)); // (les refus du serveur et les coupures du flux provoqués par le test s'affichent dans la console)
  check(realErrors.length === 0, realErrors.length ? `erreurs JavaScript : ${realErrors.slice(0, 3).join(' | ')}` : 'aucune erreur JavaScript (hors les refus du serveur provoqués par le test)');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} vérification(s) en échec` : '\n✅ Test de la partie à plusieurs : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR DU TEST :', e); process.exit(2); });
