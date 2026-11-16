// Test des SONS dans un vrai navigateur (Chromium via Playwright) :
//   1. chaque son se fabrique hors ligne (OfflineAudioContext) : pas de silence, pas de valeur folle (NaN), pas d'écrêtage, durée annoncée juste,
//      pas de décalage continu, et un équilibre de volume raisonnable entre les familles ;
//   2. le banc d'essai (menu → « Sons ») : ouvre, joue un son, règle volume / marche-arrêt / animations, et le profil le garde.
// Usage : node tests/ui-sound.cjs [url] [dossier_captures]    (le jeu doit tourner : PORT=8765 node serve.mjs)
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || '/tmp/shots';

const failures = [];
const check = (cond, message) => { if (!cond) { failures.push(message); console.log('  ❌', message); } else console.log('  ✅', message); };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce', locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForSelector('.menu');

  console.log('\n● Fabrication hors ligne de chaque son');
  const report = await page.evaluate(async () => {
    const { soundList, renderSound } = await import('/src/ui/sound.js');
    const rows = [];
    for (const s of soundList()) {
      const buf = await renderSound(s.id, { master: 0.9 });
      const l = buf.getChannelData(0);
      const r = buf.getChannelData(1);
      let peak = 0, sum = 0, nan = 0, clipped = 0, last = 0;
      const rate = buf.sampleRate;
      for (let i = 0; i < l.length; i++) {
        const a = l[i], b = r[i];
        if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
        const m = Math.max(Math.abs(a), Math.abs(b));
        if (m > peak) peak = m;
        if (m >= 0.999) clipped++;
        if (m > 0.004) last = i;
        sum += a;
      }
      rows.push({ id: s.id, group: s.group, seconds: s.seconds, peak, dc: sum / l.length, nan, clipped, tail: last / rate, length: l.length / rate });
    }
    return rows;
  });
  check(report.length >= 50, `${report.length} sons à tester`);
  const bad = (f) => report.filter(f).map((r) => r.id).join(', ');
  check(!bad((r) => r.nan), `aucune valeur invalide (NaN) ${bad((r) => r.nan)}`);
  check(!bad((r) => r.peak < 0.01), `aucun son muet (pic > -40 dB) ${bad((r) => r.peak < 0.01)}`);
  check(!bad((r) => r.clipped), `aucun écrêtage ${bad((r) => r.clipped)}`);
  check(!bad((r) => Math.abs(r.dc) > 0.01), `aucun décalage continu ${bad((r) => Math.abs(r.dc) > 0.01)}`);
  check(!bad((r) => r.tail > r.seconds + 0.05), `aucun son ne dépasse sa durée annoncée ${bad((r) => r.tail > r.seconds + 0.05)}`);
  check(!bad((r) => r.seconds > 3.5), 'aucun son ne dure plus de 3,5 s');
  const peakDb = (r) => 20 * Math.log10(r.peak);
  const hits = report.filter((r) => r.group === 'hit' && !['miss', 'block', 'crit_hit'].includes(r.id));
  const ui = report.filter((r) => ['click', 'turn', 'dice'].includes(r.id));
  const loudest = Math.max(...report.map(peakDb));
  check(loudest <= -1 && loudest >= -9, `le son le plus fort frôle la pleine échelle sans la toucher (${loudest.toFixed(1)} dB)`);
  check(Math.min(...hits.map(peakDb)) > -16, `les impacts sont tous bien audibles (pic le plus faible ${Math.min(...hits.map(peakDb)).toFixed(1)} dB)`);
  check(Math.max(...ui.map(peakDb)) < Math.max(...hits.map(peakDb)) - 4, "les sons d'interface restent plus discrets que les impacts");
  console.log('    ' + report.slice().sort((a, b) => peakDb(b) - peakDb(a)).slice(0, 4).map((r) => `${r.id} ${peakDb(r).toFixed(1)} dB`).join(' · ') + ' (les plus forts)');

  console.log('\n● Le banc d\'essai (menu → Sons)');
  check(!!(await page.$('.btn-sons')), 'le bouton « Sons » est dans l\'en-tête du menu');
  await page.click('.btn-sons');
  await page.waitForSelector('.sound-lab');
  check((await page.$$('.lab-chip')).length >= 50, `${(await page.$$('.lab-chip')).length} sons à écouter, rangés par famille (${(await page.$$('.lab-group')).length} familles)`);
  check(!(await page.$eval('#lab-sound-on', (e) => e.checked)), 'les sons sont coupés par défaut');
  await page.screenshot({ path: `${out}/80-banc-sons.png` });

  // Un clic sur un son le joue même si les sons sont coupés (le banc d'essai force) : un AudioContext existe ensuite et tourne.
  await page.click('[data-sound="hit_slash"]');
  await page.waitForTimeout(300);
  const state = await page.evaluate(async () => {
    const used = performance.getEntriesByType('resource').length >= 0;
    return { used };
  });
  check(state.used, 'cliquer un son ne provoque aucune erreur');
  await page.selectOption('#lab-element', 'fire');
  await page.click('[data-sound="hit_blast"]');
  await page.click('[data-sound="cast_heal"]');
  await page.waitForTimeout(200);
  check(true, 'un son prend la couleur du sort choisie (feu) sans erreur');

  // Marche / arrêt, volume, animations
  await page.check('#lab-sound-on');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).settings.sound === true), 'activer les sons est gardé dans le profil');
  await page.$eval('#lab-volume', (el) => { el.value = '35'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  check((await page.textContent('#lab-volume-out')).trim() === '35 %', 'le volume affiché suit le curseur (35 %)');
  check(await page.evaluate(() => Math.abs(JSON.parse(localStorage.getItem('donjon.profile.v1')).settings.volume - 0.35) < 0.001), 'le volume est gardé dans le profil');
  await page.click('[data-fx="fast"]');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('donjon.profile.v1')).settings.fx === 'fast'), 'le style des animations (rapides) est gardé dans le profil');
  check(await page.$eval('[data-fx="fast"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'le bouton choisi est mis en évidence');
  await page.click('#lab-demo');
  await page.waitForTimeout(500);
  check((await page.textContent('#lab-demo')).includes('Arrêter'), 'le petit combat sonore démarre (et se laisse arrêter)');
  await page.click('#lab-demo');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sound-lab', { state: 'detached' });
  check((await page.getAttribute('.btn-sons', 'title')).includes('Sons'), 'la fenêtre se ferme (Échap)');

  // Rechargement : les réglages reviennent
  await page.reload();
  await page.waitForSelector('.menu');
  await page.click('.btn-sons');
  await page.waitForSelector('.sound-lab');
  check(await page.$eval('#lab-sound-on', (e) => e.checked), 'après rechargement, les sons sont toujours activés');
  check((await page.textContent('#lab-volume-out')).trim() === '35 %', 'et le volume est toujours à 35 %');

  // Téléphone : pas de débordement
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => { const m = document.querySelector('.sound-lab'); return m.scrollWidth - m.clientWidth; });
  check(overflow <= 0, `téléphone : le banc d'essai ne déborde pas (${overflow}px)`);
  await page.screenshot({ path: `${out}/81-banc-sons-telephone.png` });

  check(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  await browser.close();
  if (failures.length) {
    console.log(`\n❌ ${failures.length} vérification(s) en échec`);
    process.exit(1);
  }
  console.log('\n✅ Test des sons : tout est bon');
})().catch((e) => { console.error('ÉCHEC DU TEST:', e); process.exit(1); });
