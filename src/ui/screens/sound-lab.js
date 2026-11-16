// ============================================================
//  sound-lab.js — « Sons et animations » : les réglages, et le banc d'essai pour écouter chaque son
// ============================================================
// Les sons sont fabriqués par le navigateur (voir src/ui/sound.js). Ici on les règle (marche / arrêt, volume), on choisit le style des
// animations de combat, et on peut écouter CHAQUE son séparément — ou un petit combat complet — pour dire lesquels ne conviennent pas.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, persistProfile, openModal } from '../state.js';
import { redraw } from '../controller.js';
import { play, setSoundEnabled, isSoundEnabled, setVolume, getVolume, soundList, soundGroups } from '../sound.js';
import { resolveMode } from '../fx.js';

const ELEMENTS = [['', 'Aucune'], ['fire', 'Feu'], ['holy', 'Sacré'], ['shadow', 'Ombre'], ['frost', 'Givre'], ['poison', 'Poison'], ['nature', 'Nature'], ['arcane', 'Arcane'], ['blood', 'Sang']];
const FX_CHOICES = [
  [null, 'Automatique', 'Complètes, sauf si ton appareil demande de limiter les animations.'],
  ['full', 'Complètes', 'Élan, entailles, projectiles, étincelles, secousses : tout.'],
  ['fast', 'Rapides', 'Les mêmes effets, deux fois plus vite : pour les longues sessions de farm.'],
  ['min', 'Réduites', 'Seulement les chiffres, les barres de vie et les sons, sans mouvement.']
];

/** Un petit combat en sons : [délai en ms, son, options]. */
const DEMO = [
  [0, 'encounter'], [1100, 'voice_beast'],
  [1750, 'cast_swing'], [1850, 'hit_claw'], [2150, 'turn'],
  [2800, 'cast_swing'], [2900, 'hit_slash'],
  [3500, 'cast_beam', { element: 'holy' }], [3800, 'hit_blast', { element: 'holy' }],
  [4600, 'cast_heavy'], [4850, 'hit_smash'], [4880, 'crit_hit'],
  [5700, 'cast_heal'], [6000, 'heal'],
  [6800, 'shield'], [7300, 'cast_swing'], [7400, 'block'],
  [8100, 'death_monster'], [9000, 'win']
];

export function openSoundLab() {
  const settings = app.profile.settings;
  const ui = { element: '', playing: false, timers: [] };

  const stopDemo = () => {
    ui.timers.forEach(clearTimeout);
    ui.timers = [];
    ui.playing = false;
  };

  openModal({
    title: 'Sons et animations',
    wide: true,
    className: 'sound-lab',
    onClose: stopDemo,
    render: (api) => {
      const mode = resolveMode(settings.fx);
      const volumeLabel = h('output', { class: 'lab-volume-out', id: 'lab-volume-out' }, `${Math.round(getVolume() * 100)} %`);

      const setSound = (on) => {
        settings.sound = on;
        setSoundEnabled(on);
        persistProfile();
        play('click');
        redraw();
        api.refresh();
      };
      const switchRow = h('label', { class: 'lab-switch' },
        h('input', { type: 'checkbox', id: 'lab-sound-on', checked: isSoundEnabled(), onChange: (e) => setSound(e.target.checked) }),
        h('span', null, 'Sons pendant la partie'),
        h('small', { class: 'muted' }, isSoundEnabled() ? 'activés' : 'coupés — tu peux quand même les écouter ci-dessous'));

      const volume = h('div', { class: 'lab-volume' },
        h('span', null, icon('sound_on', 18), 'Volume'),
        h('input', {
          type: 'range', id: 'lab-volume', min: 0, max: 100, step: 1, value: Math.round(getVolume() * 100), 'aria-label': 'Volume des sons',
          onInput: (e) => { setVolume(e.target.value / 100); volumeLabel.textContent = `${e.target.value} %`; },
          onChange: () => { settings.volume = getVolume(); persistProfile(); play('hit_slash', { force: true }); }
        }),
        volumeLabel);

      const fxChoice = h('div', { class: 'lab-fx' },
        h('div', { class: 'lab-seg', role: 'group', 'aria-label': 'Animations de combat' },
          FX_CHOICES.map(([value, label]) => h('button', {
            type: 'button', class: `btn btn-small ${(settings.fx || null) === value ? 'btn-primary' : ''}`, 'data-fx': value || 'auto', 'aria-pressed': String((settings.fx || null) === value),
            onClick: () => { settings.fx = value; persistProfile(); redraw(); api.refresh(); }
          }, label))),
        h('p', { class: 'muted small' }, `${FX_CHOICES.find(([v]) => v === (settings.fx || null))?.[2] || ''} (Actuellement : ${{ full: 'complètes', fast: 'rapides', min: 'réduites' }[mode]}. Un clic pendant une animation la saute.)`));

      const playDemo = () => {
        if (ui.playing) { stopDemo(); api.refresh(); return; }
        ui.playing = true;
        for (const [at, name, opts] of DEMO) ui.timers.push(setTimeout(() => play(name, { force: true, ...opts }), at));
        ui.timers.push(setTimeout(() => { ui.playing = false; if (app.modal) api.refresh(); }, 11500));
        api.refresh();
      };

      const groups = soundGroups();
      const all = soundList();
      const bench = Object.entries(groups).map(([gid, gname]) => h('div', { class: 'lab-group', 'data-group': gid },
        h('h4', null, gname),
        h('div', { class: 'lab-chips' }, all.filter((s) => s.group === gid).map((s) => h('button', {
          type: 'button', class: 'btn btn-small lab-chip', 'data-sound': s.id, title: `${s.label} — ${s.id}${s.flavored ? ' (prend la couleur du sort)' : ''}`,
          onClick: () => play(s.id, { force: true, element: s.flavored && ui.element ? ui.element : undefined })
        }, s.label)))));

      return [
        h('p', { class: 'muted' }, 'Tous les sons sont fabriqués par ton navigateur : rien à télécharger. Clique sur un son pour l\'écouter. Chacun est une petite « recette » (src/ui/sound.js) facile à retoucher.'),
        h('div', { class: 'lab-settings' }, switchRow, volume, h('h3', null, 'Animations de combat'), fxChoice),
        h('div', { class: 'lab-bench' },
          h('h3', null, 'Banc d\'essai'),
          h('div', { class: 'lab-tools' },
            h('label', { class: 'lab-element' }, h('span', null, 'Couleur des sorts'),
              h('select', { id: 'lab-element', class: 'input', onChange: (e) => { ui.element = e.target.value; } },
                ELEMENTS.map(([value, label]) => h('option', { value, selected: ui.element === value }, label)))),
            h('button', { type: 'button', class: 'btn btn-primary', id: 'lab-demo', onClick: playDemo }, icon(ui.playing ? 'close' : 'swap', 16), ui.playing ? 'Arrêter' : 'Écouter un petit combat')),
          bench)
      ];
    }
  });
}
