// ============================================================
//  login.js — L'écran de connexion (jeu en ligne seulement)
// ============================================================
// Deux onglets : se connecter, ou créer un compte (avec un code d'invitation si le serveur en demande un).
// Le mot de passe n'est jamais gardé par la page : il part au serveur, qui n'en conserve qu'un hachage.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, toast } from '../state.js';
import { go, connectLive } from '../controller.js';
import { setSoundEnabled, setVolume } from '../sound.js';

// Ce qui est tapé survit à un redessin de l'écran (changement d'onglet, par exemple).
const form = { mode: 'login', name: '', password: '', invite: '' };

export function renderLogin(root) {
  const gw = app.gateway;
  const register = form.mode === 'register';

  const error = h('div', { class: 'form-msg ko auth-error', role: 'alert', hidden: true });
  const showError = (text) => {
    error.textContent = text || '';
    error.hidden = !text;
  };

  const nameInput = h('input', {
    class: 'input', id: 'auth-name', type: 'text', value: form.name, maxlength: 20, autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false',
    placeholder: register ? 'Ton pseudo (2 à 20 caractères)' : 'Ton pseudo', onInput: (e) => (form.name = e.target.value)
  });
  const passInput = h('input', {
    class: 'input', id: 'auth-password', type: 'password', value: form.password, maxlength: 200, autocomplete: register ? 'new-password' : 'current-password',
    placeholder: register ? 'Un mot de passe (6 caractères au moins)' : 'Ton mot de passe', onInput: (e) => (form.password = e.target.value)
  });
  const inviteInput = register && gw.inviteRequired
    ? h('input', { class: 'input', id: 'auth-invite', type: 'text', value: form.invite, maxlength: 100, autocomplete: 'off', autocapitalize: 'off', placeholder: "Le code d'invitation (donné par l'hôte du serveur)", onInput: (e) => (form.invite = e.target.value) })
    : null;

  const submit = h('button', { class: 'btn btn-primary btn-xl', id: 'auth-submit', type: 'submit' }, register ? 'Créer mon compte' : 'Se connecter');

  const onSubmit = async (e) => {
    e.preventDefault();
    showError('');
    if (!form.name.trim() || !form.password) return showError('Écris ton pseudo et ton mot de passe.');
    submit.disabled = true;
    try {
      const r = register ? await gw.register(form.name, form.password, form.invite) : await gw.login(form.name, form.password);
      if (!r.ok) return showError(r.error);
      const p = await gw.loadProfile();
      if (!p.ok) return showError(p.error);
      form.password = '';
      app.profile = gw.profile;
      setSoundEnabled(app.profile.settings.sound);
      setVolume(app.profile.settings.volume ?? 0.7);
      toast(register ? `Bienvenue, ${gw.user.name} !` : `Content de te revoir, ${gw.user.name}.`, 'good');
      connectLive();
      go('menu');
    } finally {
      submit.disabled = false;
    }
  };

  const switchTo = (mode) => () => {
    form.mode = mode;
    form.password = '';
    app.render();
  };

  root.append(h('div', { class: 'auth' },
    h('div', { class: 'brand auth-brand' },
      h('div', { class: 'brand-mark' }, icon('boss', 34)),
      h('div', null,
        h('h1', null, 'Donjon'),
        h('p', { class: 'tagline' }, 'Explorez ensemble. Trahissez peut-être. Survivez sûrement.'))),
    h('section', { class: 'panel auth-card' },
      h('div', { class: 'auth-tabs', role: 'tablist' },
        h('button', { type: 'button', class: `auth-tab ${!register ? 'on' : ''}`, role: 'tab', 'aria-selected': String(!register), id: 'tab-login', onClick: switchTo('login') }, 'Connexion'),
        h('button', { type: 'button', class: `auth-tab ${register ? 'on' : ''}`, role: 'tab', 'aria-selected': String(register), id: 'tab-register', onClick: switchTo('register') }, 'Inscription')),
      h('form', { class: 'auth-form', onSubmit },
        h('label', { class: 'field' }, h('span', null, 'Pseudo'), nameInput),
        h('label', { class: 'field' }, h('span', null, 'Mot de passe'), passInput),
        inviteInput ? h('label', { class: 'field' }, h('span', null, "Code d'invitation"), inviteInput) : null,
        error,
        submit),
      register
        ? h('p', { class: 'muted small' }, "Ton compte garde tes personnages sur le serveur : tu les retrouves sur tous tes appareils. N'utilise pas un mot de passe que tu emploies ailleurs.")
        : h('p', { class: 'muted small' }, 'Pas encore de compte ? Crée-en un, c\'est rapide.')),
    h('p', { class: 'muted small foot' }, 'Valeurs de jeu provisoires — le jeu évolue encore beaucoup.')));
  setTimeout(() => (form.name ? passInput : nameInput).focus(), 30);
}
