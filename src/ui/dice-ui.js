// ============================================================
//  dice-ui.js — L'animation du D20
// ============================================================
// Le résultat du dé est DÉJÀ décidé par le moteur de jeu. Ici on ne fait que
// l'afficher joliment : le dé "tourne" avec des nombres au hasard, puis
// s'arrête sur le vrai résultat.

import { h } from './dom.js';
import { icon } from './icons.js';
import { play } from './sound.js';

const PURPOSE = {
  initiative: "Jet d'initiative",
  treasure: 'Ouverture du coffre',
  trap: 'Jet de sauvegarde',
  purity: "Pureté de l'eau",
  rebound: 'Le coup bas va-t-il rebondir ?',
  haggle: 'Marchandage',
  ghost: 'Souffle du fantôme',
  attack: 'Attaque'
};
export const purposeLabel = (p) => PURPOSE[p] || 'Jet de dé';

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Montre un lancer de D20 en plein écran. Renvoie une promesse terminée à la fin
 * de l'animation (un clic permet de passer).
 */
export function showDice(ev, playerName) {
  return new Promise((resolve) => {
    const num = h('div', { class: 'die-num' }, '?');
    const caption = h('div', { class: 'die-caption' }, `${playerName} — ${purposeLabel(ev.purpose)}`);
    const detail = h('div', { class: 'die-detail' }, ' ');
    const die = h('div', { class: 'die rolling' }, icon('d20', 150), num);
    const overlay = h('div', { class: 'dice-overlay', role: 'status' }, caption, die, detail, h('div', { class: 'die-hint' }, 'Cliquer pour passer'));
    document.body.append(overlay);

    const quick = reduceMotion();
    let finished = false;
    let spin;
    let hold;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(spin);
      clearTimeout(hold);
      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.remove();
        resolve();
      }, 140);
    };

    const settle = () => {
      clearInterval(spin);
      die.classList.remove('rolling');
      num.textContent = ev.natural;
      if (ev.natural === 20) die.classList.add('crit');
      if (ev.natural === 1) die.classList.add('fumble');
      const parts = [`${ev.natural}`];
      if (ev.luck) parts.push(`${ev.luck > 0 ? '+' : '-'} ${Math.abs(ev.luck)} (chance)`);
      if (ev.ghostMod) parts.push(`${ev.ghostMod > 0 ? '+' : '-'} ${Math.abs(ev.ghostMod)} (fantôme)`);
      detail.textContent = parts.length > 1 ? `${parts.join(' ')} = ${ev.total}` : ev.natural === 20 ? 'CRITIQUE !' : ev.natural === 1 ? 'ÉCHEC CRITIQUE...' : '';
      play(ev.natural === 20 ? 'crit' : ev.natural === 1 ? 'death' : 'click');
      hold = setTimeout(finish, quick ? 500 : 950);
    };

    play('dice');
    overlay.addEventListener('click', finish);
    if (quick) {
      settle();
    } else {
      spin = setInterval(() => (num.textContent = 1 + Math.floor(Math.random() * 20)), 55);
      setTimeout(() => !finished && settle(), 750);
    }
  });
}
