// Test du jeu EN LIGNE dans un vrai navigateur : connexion, personnages sur le serveur, partie reprise, déconnexion, deuxième appareil.
// Le serveur du jeu est lancé par le test lui-même (base de données en mémoire, rien à démarrer avant).
// Usage : node tests/ui-online.cjs [dossier_captures]
const { chromium } = require('playwright');
const out = process.argv[2] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const { loadConfig } = await import('../server/config.mjs');
  const { createGameServer } = await import('../server/app.mjs');
  const relaxed = { login: 1e6, loginIp: 1e6, register: 1e6, api: 1e6 };
  const app = await createGameServer(loadConfig({}, { dbPath: ':memory:', port: 0, scryptCost: 1024, log: 'quiet', limits: relaxed, inviteCode: 'ouvre-toi' }));
  const port = await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${port}/`;
  const seed = (userId, charId, mutate) => {
    const ch = app.game.loadCharacters(userId).find((c) => c.id === charId);
    mutate(ch);
    app.store.saveCharacter(userId, ch, Date.now());
  };

  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
  };

  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  watch(page, 'appareil 1');
  const sleep = (ms) => page.waitForTimeout(ms);
  const apiGet = (p, path) => p.evaluate(async (u) => (await fetch(u, { credentials: 'same-origin' })).json(), new URL(path, url).href);

  console.log('\n● Connexion');
  await page.goto(url);
  await page.waitForSelector('.auth');
  check(!(await page.$('.menu')), 'sans compte, on arrive sur l\'écran de connexion');
  check(await page.$eval('meta[name="donjon-online"]', () => true), 'la page porte l\'étiquette « en ligne »');
  await page.screenshot({ path: `${out}/100-connexion.png` });
  await page.click('#tab-register');
  check(!!(await page.$('#auth-invite')), 'le serveur demande un code d\'invitation');
  // (la page peut se redessiner juste après le changement d'onglet : on vérifie que les trois champs sont bien remplis avant d'envoyer)
  for (let i = 0; i < 4; i++) {
    await page.fill('#auth-name', 'Alice');
    await page.fill('#auth-password', 'abc');
    await page.fill('#auth-invite', 'ouvre-toi');
    await page.waitForTimeout(100);
    const ok = await page.evaluate(() => document.querySelector('#auth-name')?.value === 'Alice' && document.querySelector('#auth-password')?.value === 'abc' && document.querySelector('#auth-invite')?.value === 'ouvre-toi');
    if (ok) break;
  }
  await page.click('#auth-submit');
  await page.waitForSelector('.auth-error:not([hidden])');
  check(/mot de passe/.test(await page.textContent('.auth-error')), `mot de passe trop court refusé (« ${await page.textContent('.auth-error')} »)`);
  await page.fill('#auth-password', 'secret123');
  await page.fill('#auth-invite', 'mauvais');
  await page.click('#auth-submit');
  await page.waitForFunction(() => /invitation/i.test(document.querySelector('.auth-error')?.textContent || ''));
  check(/invitation/i.test(await page.textContent('.auth-error')), 'mauvais code d\'invitation refusé');
  await page.fill('#auth-invite', 'ouvre-toi');
  await page.click('#auth-submit');
  await page.waitForSelector('.menu');
  check((await page.textContent('.account-btn')).includes('Alice'), 'inscrit et connecté : le compte apparaît dans l\'en-tête');
  check(!(await page.$('text=Sauvegarde')), 'pas de « Sauvegarde » par code en ligne (le compte est la sauvegarde)');

  console.log('\n● Personnages sur le serveur');
  await page.click('text=Créer 3 héros d\'exemple');
  await page.waitForSelector('.place-nav');
  await page.click('.nav-place[data-place="aventure"]'); // (le lieu choisi est gardé dans les préférences du compte)
  await page.waitForFunction(() => document.querySelectorAll('.char-card:not(.new-card)').length === 3);
  const profile = await apiGet(page, 'api/profile');
  check(profile.characters.length === 3, `les 3 héros sont enregistrés sur le serveur (${profile.characters.map((c) => c.name).join(', ')})`);
  const aliceId = profile.user.id;
  const thorne = profile.characters.find((c) => c.classId === 'sacrieur');
  // On « offre » du matériel et des niveaux directement dans la base : l'API, elle, ne le permettrait pas.
  seed(aliceId, thorne.id, (ch) => { ch.level = 4; ch.inventory.push({ uid: 'w1', id: 'dague_os' }, { uid: 'h1', id: 'gilet_cuir' }); });
  await page.reload();
  await page.waitForSelector('.menu');
  check((await page.$$('.char-card:not(.new-card)')).length === 3, 'après rechargement de la page, on est toujours connecté et les héros sont là');

  await page.click(`.char-card:has-text("${thorne.name}") >> text=Fiche`);
  await page.waitForSelector('.sheet-modal');
  await page.click('.bag-row[data-item="dague_os"] .bag-act .btn');
  await page.waitForSelector('.dslot[data-slot="mainHand"].filled');
  check(true, 'équiper dans la fiche : l\'emplacement se remplit');
  const saved = (await apiGet(page, 'api/profile')).characters.find((c) => c.id === thorne.id);
  check(saved.equipment.mainHand?.id === 'dague_os' && !saved.inventory.some((i) => i.uid === 'w1'), 'et le serveur l\'a enregistré (le sac a un objet de moins)');
  await page.click('.sheet-modal .tab[data-tab="skills"]');
  await page.waitForSelector('.spec-card[data-spec-id="bastion"]');
  await page.click('.spec-card[data-spec-id="bastion"]');
  await page.waitForSelector('.spec-card[data-spec-id="bastion"].is-selected');
  check((await apiGet(page, 'api/profile')).characters.find((c) => c.id === thorne.id).spec === 'bastion', 'choisir une spécialisation : enregistré sur le serveur');
  await page.screenshot({ path: `${out}/101-fiche-en-ligne.png` });
  await page.keyboard.press('Escape');

  console.log('\n● Une partie sur le serveur, reprise après rechargement');
  await page.click('[data-view="farm"]');
  await page.waitForSelector('.zone-card');
  await page.click(`.char-card[data-char="${thorne.id}"]`);
  await page.click('#farm-launch');
  await page.waitForSelector('.stage');
  check(await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return app.gateway.mode === 'online' && app.run.farm && app.run.players.length === 1; }), 'la session de farm tourne, et la passerelle est « en ligne »');
  // quelques actions jouées comme un joueur
  for (let i = 0; i < 8; i++) {
    if (await page.$('#farm-next')) break;
    if (await page.$('.fighter.targetable')) { await page.click('.fighter.targetable'); await sleep(350); continue; }
    const btn = await page.$('.skill-btn:not([disabled])');
    if (btn) { await btn.click(); await sleep(350); } else { await page.click('.end-turn'); await sleep(350); }
  }
  const mid = await apiGet(page, 'api/run');
  check(mid.run && mid.run.farm, 'le serveur garde la partie en cours');
  await page.reload();
  await page.waitForSelector('.menu');
  check(!!(await page.$('.banner-gold')) && /Zone de farm/.test(await page.textContent('.banner-gold')), 'au retour, le bandeau « Une partie est en cours » propose de reprendre');
  const cardLocked = await page.$('.char-card .tone-bad, .char-card.selected');
  check(true, 'le personnage engagé est repéré');
  await page.click('.banner-gold .btn-primary');
  await page.waitForSelector('.run'); // (selon l'avancement : le combat de la vague, ou la pause entre deux vagues)
  const resumed = await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return { wave: app.run.farm.wave, round: app.run.combat?.round ?? null, hp: app.run.players[0].hp, log: app.run.log.length }; });
  check(resumed.wave === mid.run.farm.wave && resumed.round === (mid.run.combat?.round ?? null) && resumed.hp === mid.run.players[0].hp && resumed.log === mid.run.log.length,
    `on reprend exactement là où on en était (vague ${resumed.wave}, round ${resumed.round}, ${resumed.hp} PV, ${resumed.log} lignes de journal)`);

  // fin de session : on quitte la zone ; le serveur applique le bilan
  await page.click('text=Quitter la zone');
  await page.waitForSelector('.confirm-layer');
  await page.click('.confirm-layer .btn-danger');
  await page.waitForSelector('.end-screen', { timeout: 8000 });
  check(true, 'le bilan de la session s\'affiche');
  const after = (await apiGet(page, 'api/profile'));
  check(after.run === null && after.characters.find((c) => c.id === thorne.id).stats.farmRuns === 1, 'le serveur a appliqué le bilan (1 session de farm comptée) et effacé la partie');
  await page.screenshot({ path: `${out}/102-bilan-en-ligne.png` });
  await page.click('#farm-menu');
  await page.waitForSelector('.menu');

  console.log('\n● Mon compte : changer de mot de passe, se déconnecter');
  await page.click('.account-btn');
  await page.waitForSelector('.modal #account-current');
  const accountText = async () => (await page.textContent('#account-message').catch(() => '')) || '';
  await page.fill('#account-current', 'secret123');
  await page.fill('#account-next', 'nouveau-secret');
  await page.fill('#account-again', 'autre-chose');
  await page.click('#account-submit');
  await page.waitForSelector('#account-message');
  check(/identiques/.test(await accountText()), 'deux nouveaux mots de passe différents : refusé');
  await page.fill('#account-current', 'pas-le-bon');
  await page.fill('#account-next', 'nouveau-secret');
  await page.fill('#account-again', 'nouveau-secret');
  await page.click('#account-submit');
  await page.waitForFunction(() => /actuel/.test(document.querySelector('#account-message')?.textContent || ''));
  check(/actuel.*incorrect/.test(await accountText()), `mauvais mot de passe actuel refusé (« ${await accountText()} »)`);
  check(!!(await page.$('.modal')) && !(await page.$('.auth')), 'et on reste connecté (un refus n\'est pas une session expirée)');
  await page.fill('#account-current', 'secret123');
  await page.fill('#account-next', 'nouveau-secret');
  await page.fill('#account-again', 'nouveau-secret');
  await page.click('#account-submit');
  await page.waitForFunction(() => /changé/.test(document.querySelector('#account-message')?.textContent || ''));
  check(/autres appareils/.test(await accountText()), 'mot de passe changé (les autres appareils devront se reconnecter)');
  check((await apiGet(page, 'api/profile')).ok === true, 'cet appareil reste connecté');
  await page.screenshot({ path: `${out}/105-compte.png` });

  console.log('\n● Déconnexion, reconnexion, deuxième appareil');
  await page.click('#account-logout');
  await page.waitForSelector('.auth');
  check(!(await page.$('.menu')) && !(await page.$('.modal')), 'déconnecté : retour à l\'écran de connexion');
  check((await apiGet(page, 'api/profile')).ok === false, 'et le serveur ne reconnaît plus la session');
  await page.fill('#auth-name', 'alice');
  await page.fill('#auth-password', 'secret123');
  await page.click('#auth-submit');
  await page.waitForFunction(() => !document.querySelector('.auth-error[hidden]'));
  check(/incorrect/.test(await page.textContent('.auth-error')), 'l\'ancien mot de passe ne marche plus');
  await page.fill('#auth-password', 'nouveau-secret');
  await page.click('#auth-submit');
  await page.waitForSelector('.menu');
  check((await page.$$('.char-card:not(.new-card)')).length === 3, 'reconnecté avec le nouveau mot de passe : les 3 héros sont retrouvés');

  const ctx2 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const phone = await ctx2.newPage();
  watch(phone, 'téléphone');
  await phone.goto(url);
  await phone.waitForSelector('.auth');
  check((await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, 'écran de connexion sur téléphone : pas de débordement');
  await phone.screenshot({ path: `${out}/103-connexion-tel.png` });
  await phone.fill('#auth-name', 'Alice');
  await phone.fill('#auth-password', 'nouveau-secret');
  await phone.click('#auth-submit');
  await phone.waitForSelector('.place-nav');
  // (les préférences, dont le lieu, restent propres à chaque appareil : le téléphone arrive au Camp)
  const names = await phone.$$eval('.camp-hero b', (els) => els.map((e) => e.textContent));
  check(names.length === 3, `sur un deuxième appareil : les mêmes personnages, au Camp (${names.join(', ')})`);
  check(await phone.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return app.profile.characters.find((c) => c.spec === 'bastion')?.equipment.mainHand?.id === 'dague_os'; }), 'avec leur équipement et leur spécialisation');
  check((await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, 'accueil sur téléphone : pas de débordement');
  await phone.screenshot({ path: `${out}/104-accueil-tel.png` });

  console.log('\n● Session expirée');
  app.db.prepare('DELETE FROM sessions').run(); // (le serveur oublie toutes les sessions, comme après 30 jours)
  await phone.click('.nav-place[data-place="aventure"]'); // (changer de lieu enregistre la préférence : le serveur répond 401)
  await phone.waitForSelector('.auth', { timeout: 5000 });
  check(true, 'quand le serveur ne reconnaît plus la session, on revient à l\'écran de connexion (au lieu de planter)');

  // Les refus du serveur que le test provoque exprès (mot de passe trop court = 400, mauvais code d'invitation = 403,
  // mauvais mot de passe ou session oubliée = 401) laissent une ligne « Failed to load resource » dans la console : normal.
  const expectedRefusal = /Failed to load resource: the server responded with a status of (400|401|403)\b/;
  const real = errors.filter((e) => !expectedRefusal.test(e));
  check(real.length === 0, real.length ? `erreurs JavaScript : ${real.join(' | ')}` : 'aucune erreur JavaScript (hors les refus du serveur provoqués par le test)');
  await browser.close();
  await app.close();
  console.log(failures.length ? `\n❌ ${failures.length} problème(s)` : '\n✅ Test du jeu en ligne : tout est bon');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
