// Répétition générale d'une mise en ligne : le jeu derrière son « portier » HTTPS (Caddy, nginx...), joué dans un vrai navigateur.
// Le serveur du jeu ET le portier sont lancés avant (voir docs/SERVEUR.md) ; ce test joue ensuite comme un vrai visiteur :
// il s'inscrit, crée des héros, joue, recharge la page, change de mot de passe, se reconnecte, et contrôle au passage le cookie,
// le HTTPS et les en-têtes de sécurité.
//
// Usage :  node tests/ui-proxy.cjs https://jeu.exemple.fr/ [CODE_INVITATION] [dossier_captures]
//
// Pour l'essayer SANS vrai nom de domaine (nom inventé qui pointe vers cette machine, certificat de test) :
//   HOST_RULES="MAP jeu.exemple.fr 127.0.0.1" INSECURE=1 node tests/ui-proxy.cjs https://jeu.exemple.fr/ ouvre-toi
// (DIRECT=1 force des connexions directes si ta machine impose un proxy sortant ; les polices Google, elles, ne se chargeront alors pas.)
const { chromium } = require('playwright');

const [url, invite = '', out = '/tmp/shots'] = process.argv.slice(2);
if (!url) {
  console.error('Usage : node tests/ui-proxy.cjs https://adresse-du-jeu/ [code_invitation] [dossier_captures]');
  process.exit(2);
}
const isHttps = url.startsWith('https://');
const gameHost = new URL(url).host;

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const args = [];
  if (process.env.HOST_RULES) args.push(`--host-resolver-rules=${process.env.HOST_RULES}`);
  if (process.env.DIRECT === '1') args.push('--no-proxy-server'); // (connexions directes : utile si ta machine impose un proxy sortant)
  const browser = await chromium.launch({ args });
  const errors = [];
  const unauthorized = { 'appareil 1': 0, téléphone: 0 };
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    // (les polices Google peuvent manquer selon le réseau : ce n'est pas le sujet ; mais un refus du jeu ou du portier — 403, 502... — compte)
    page.on('console', (m) => {
      if (m.type() !== 'error' || /Failed to load resource: net::ERR_/.test(m.text())) return;
      if (/status of 401/.test(m.text())) unauthorized[label]++; // (comptés à part : le test en provoque UN exprès, voir plus bas)
      else errors.push(`${label} console: ${m.text()}`);
    });
    page.on('requestfailed', (r) => {
      if (new URL(r.url()).host !== gameHost) return;
      if (new URL(r.url()).pathname === '/api/events') return; // (le flux temps réel est fermé exprès quand on recharge la page ou qu'on se déconnecte : « ERR_ABORTED » est normal)
      errors.push(`${label} requête échouée : ${r.url()} (${r.failure()?.errorText})`);
    });
  };

  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 }, locale: 'fr-FR', ignoreHTTPSErrors: process.env.INSECURE === '1' });
  const page = await ctx.newPage();
  watch(page, 'appareil 1');
  const sleep = (ms) => page.waitForTimeout(ms);
  const api = (p, path) => p.evaluate(async (u) => (await fetch(u, { credentials: 'same-origin' })).json(), new URL(path, url).href);
  const pseudo = `Test${Date.now().toString(36)}`.slice(0, 20);
  let password = 'secret123';

  console.log(`\n● Arrivée sur ${url}`);
  const response = await page.goto(url);
  const headers = response.headers();
  await page.waitForSelector('.auth');
  check(response.status() === 200, `la page répond 200 (${response.status()})`);
  check(!isHttps || !!headers['strict-transport-security'], isHttps ? 'HTTPS : l\'en-tête HSTS est présent' : 'HTTP simple (essai local)');
  check(/default-src 'self'/.test(headers['content-security-policy'] || '') && headers['x-content-type-options'] === 'nosniff', 'les en-têtes de sécurité du jeu traversent le portier');
  check((await page.evaluate(() => location.protocol)) === (isHttps ? 'https:' : 'http:'), 'le navigateur est bien en ' + (isHttps ? 'HTTPS' : 'HTTP'));
  const hello = await api(page, 'api/hello');
  check(hello.ok && hello.online === true, `le jeu répond à travers le portier (contenu ${hello.contentVersion})`);

  console.log('\n● Inscription');
  await page.click('#tab-register');
  const askedInvite = !!(await page.$('#auth-invite'));
  check(askedInvite === !!hello.inviteRequired, askedInvite ? 'le jeu demande un code d\'invitation' : 'pas de code d\'invitation demandé (inscription ouverte : à éviter en ligne !)');
  await page.fill('#auth-name', pseudo);
  await page.fill('#auth-password', password);
  if (askedInvite) await page.fill('#auth-invite', invite);
  await page.click('#auth-submit');
  await page.waitForSelector('.menu, .auth-error:not([hidden])');
  check(!!(await page.$('.menu')), `inscrit et connecté (${pseudo})`);
  const cookie = (await ctx.cookies()).find((c) => c.name === 'donjon_session');
  check(!!cookie && cookie.httpOnly && cookie.sameSite === 'Lax', 'cookie de session : HttpOnly et SameSite=Lax');
  check(!isHttps || (cookie && cookie.secure), isHttps ? 'cookie de session : Secure (le portier a bien dit « c\'est du HTTPS »)' : 'cookie sans Secure en HTTP simple');
  check(!(await page.evaluate(() => document.cookie.includes('donjon_session'))), 'le code de la page ne peut pas lire le cookie de session');

  console.log('\n● Jouer à travers le portier');
  await page.click('text=Créer 3 héros d\'exemple');
  await page.waitForFunction(() => document.querySelectorAll('.char-card:not(.new-card)').length === 3);
  const profile = await api(page, 'api/profile');
  check(profile.characters.length === 3, `les 3 héros sont sur le serveur (${profile.characters.map((c) => c.name).join(', ')})`);
  const hero = profile.characters[0];
  await page.click('[data-view="farm"]');
  await page.waitForSelector('.zone-card');
  await page.click(`.char-card[data-char="${hero.id}"]`);
  await page.click('#farm-launch');
  await page.waitForSelector('.stage');
  for (let i = 0; i < 8; i++) {
    if (await page.$('#farm-next')) break;
    if (await page.$('.fighter.targetable')) { await page.click('.fighter.targetable'); await sleep(350); continue; }
    const btn = await page.$('.skill-btn:not([disabled])');
    if (btn) { await btn.click(); await sleep(350); } else { await page.click('.end-turn'); await sleep(350); }
  }
  const mid = await api(page, 'api/run');
  check(!!(mid.run && mid.run.farm), 'la partie en cours est gardée par le serveur');
  await page.reload();
  await page.waitForSelector('.menu');
  check(!!(await page.$('.banner-gold')), 'après rechargement : toujours connecté, et le jeu propose de reprendre la partie');
  await page.click('.banner-gold .btn-primary');
  await page.waitForSelector('.run');
  const resumed = await page.evaluate(async () => { const { app } = await import('/src/ui/state.js'); return { hp: app.run.players[0].hp, log: app.run.log.length, wave: app.run.farm.wave }; });
  check(resumed.hp === mid.run.players[0].hp && resumed.log === mid.run.log.length && resumed.wave === mid.run.farm.wave, `reprise exacte (vague ${resumed.wave}, ${resumed.hp} PV, ${resumed.log} lignes de journal)`);
  await page.click('text=Quitter la zone');
  await page.waitForSelector('.confirm-layer');
  await page.click('.confirm-layer .btn-danger');
  await page.waitForSelector('.end-screen', { timeout: 8000 });
  const after = await api(page, 'api/profile');
  check(after.run === null && after.characters.find((c) => c.id === hero.id).stats.farmRuns === 1, 'le bilan est appliqué par le serveur et la partie est effacée');
  await page.screenshot({ path: `${out}/110-portier-bilan.png` });
  await page.click('#farm-menu');
  await page.waitForSelector('.menu');

  console.log('\n● Mon compte');
  await page.click('.account-btn');
  await page.waitForSelector('#account-current');
  const newPassword = 'nouveau-mdp-123';
  await page.fill('#account-current', password);
  await page.fill('#account-next', newPassword);
  await page.fill('#account-again', newPassword);
  await page.click('#account-submit');
  await page.waitForFunction(() => /changé/.test(document.querySelector('#account-message')?.textContent || ''));
  check(true, 'mot de passe changé à travers le portier');
  password = newPassword;
  await page.click('#account-logout');
  await page.waitForSelector('.auth');
  check((await api(page, 'api/profile')).ok === false, 'déconnecté : le serveur ne reconnaît plus la session');
  await page.fill('#auth-name', pseudo.toLowerCase());
  await page.fill('#auth-password', password);
  await page.click('#auth-submit');
  await page.waitForSelector('.menu');
  check((await page.$$('.char-card:not(.new-card)')).length === 3, 'reconnecté avec le nouveau mot de passe : les 3 héros sont là');

  console.log('\n● Un téléphone');
  const phoneCtx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', ignoreHTTPSErrors: process.env.INSECURE === '1' });
  const phone = await phoneCtx.newPage();
  watch(phone, 'téléphone');
  await phone.goto(url);
  await phone.waitForSelector('.auth');
  await phone.fill('#auth-name', pseudo);
  await phone.fill('#auth-password', password);
  await phone.click('#auth-submit');
  await phone.waitForSelector('.menu');
  check((await phone.$$('.char-card:not(.new-card)')).length === 3, 'depuis un deuxième appareil : les mêmes héros');
  check((await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, 'accueil sur téléphone : pas de débordement');
  await phone.screenshot({ path: `${out}/111-portier-tel.png` });

  // Un seul 401 est attendu : la question « suis-je connecté ? » posée exprès après la déconnexion (le serveur doit répondre non).
  check(unauthorized['appareil 1'] === 1 && unauthorized.téléphone === 0, `un seul refus « non connecté » (celui qu'on provoque), aucun autre (${unauthorized['appareil 1']} / ${unauthorized.téléphone})`);
  check(errors.length === 0, errors.length ? `erreurs : ${errors.join(' | ')}` : 'aucune erreur JavaScript, aucune requête refusée par le jeu ou le portier');
  await browser.close();
  console.log(failures.length ? `\n❌ ${failures.length} problème(s)` : '\n✅ Répétition générale réussie : le jeu tient derrière le portier');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC DU TEST:', e.message); process.exit(1); });
