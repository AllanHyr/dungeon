// ============================================================
//  dialogs.js — Fenêtres de l'accueil : nouveau personnage, sauvegarde, règles
// ============================================================

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, persistProfile, toast, openModal, closeModal } from '../state.js';
import { redraw, startTraining, lockedCharIds, characterAction, logout } from '../controller.js';
import { portrait, previewStats, statsLine } from '../components.js';
import { itemCard, skillIconName } from '../format.js';
import { firstKeys } from '../keys.js';
import { openSheet } from './sheet.js';
import { salvageValue, levelCap, specsOf, characterSlots } from '../../core/index.js';
import { exportCode, importCode, addImported } from '../../storage/profile.js';
import { play } from '../sound.js';

// ---------------- Nouveau personnage ----------------

const ROLE_FR = { tank: 'Tank', healer: 'Soigneur', damage: 'Dégâts' };
const ROLE_WORDS = ['Tank', 'Soin', 'Hybride', 'Dégâts'];

/** Les rôles qu'une classe peut tenir, d'après ses spécialisations (« Tank · Soin · Dégâts ») ; sinon son rôle principal. */
function rolesOf(content, cls) {
  const tags = [...new Set(specsOf(content, cls.id).map((s) => s.tag).filter((t) => ROLE_WORDS.includes(t)))];
  return tags.length ? tags.sort((x, y) => ROLE_WORDS.indexOf(x) - ROLE_WORDS.indexOf(y)) : [ROLE_FR[cls.role]];
}

/**
 * La PRÉSENTATION d'une classe (à la création) : son idée, ses rôles possibles, son sort de classe, sa ressource ou ses modes
 * (formes, postures, auras), son passif de base, ses sorts de départ et ses trois spécialisations (avec leur ultime annoncé).
 * Tout est lu dans classes.json : une nouvelle classe a sa présentation sans rien écrire de plus.
 */
export function classShowcase(content, cls) {
  const skills = cls.skills;
  const cs = content.skills[cls.classSkill];
  const specs = specsOf(content, cls.id);
  const roles = rolesOf(content, cls);
  const passives = skills.filter((s) => s.innate && s.type === 'passive');
  const spells = skills.filter((s) => s.innate && s.type === 'active' && s.id !== cls.classSkill);
  const modes = cls.modes ? Object.entries(cls.modes.list) : [];
  const noun = cls.modes?.noun || (modes.some(([, m]) => m.aura) ? 'aura' : 'mode');
  const plural = `${noun}s`;
  const ult = (spec) => (spec.upcoming || []).find((u) => u.level >= 20);
  const block = (title, ...body) => h('section', { class: 'cs-block' }, h('h4', null, title), ...body);
  return h('div', { class: 'class-showcase', dataset: { classId: cls.id } },
    h('div', { class: 'cs-head' },
      portrait(cls.id, 84),
      h('div', { class: 'cs-id' },
        h('h3', { class: 'cs-name' }, cls.name),
        h('div', { class: 'cs-roles' }, roles.map((r) => h('span', { class: 'role-tag cs-role' }, r))),
        h('p', { class: 'cs-desc' }, cls.description),
        h('p', { class: 'muted small cs-stats' }, `PV ${cls.baseStats.hp} · Attaque ${cls.baseStats.atk} · Défense ${cls.baseStats.def}${cls.baseStats.heal ? ` · Soin ${cls.baseStats.heal}` : ''} · commence au rang ${cls.startRow === 'front' ? 'avant' : 'arrière'}`))),
    h('div', { class: 'cs-grid' },
      cs ? block('Sort de classe', h('div', { class: 'cs-skill' }, h('span', { class: 'cs-ico' }, icon(skillIconName(content, cs), 18)), h('div', null, h('b', null, cs.name), h('p', null, cs.desc)))) : null,
      cls.resource ? block('Ressource', h('p', null, h('b', null, cls.resource.name), ` : jusqu'à ${cls.resource.max}, ${cls.resource.start ? `${cls.resource.start} au début du combat` : 'vide au début de chaque combat'}.`)) : null,
      modes.length ? block(`Ses ${plural}`, h('ul', { class: 'cs-modes' }, modes.map(([id, m]) => h('li', { dataset: { mode: id } }, icon(m.icon || 'star', 15), h('span', null, h('b', null, m.name), m.desc ? ` — ${m.desc}` : ''))))) : null,
      passives.length ? block('Toujours actif', passives.map((p) => h('div', { class: 'cs-skill' }, h('span', { class: 'cs-ico is-passive' }, icon(skillIconName(content, p), 18)), h('div', null, h('b', null, p.name), h('p', null, p.desc))))) : null,
      spells.length ? block('Sorts de départ', h('ul', { class: 'cs-spells' }, spells.map((sp) => h('li', { title: sp.desc }, icon(skillIconName(content, sp), 15), h('span', null, sp.name), sp.level > 1 ? h('small', { class: 'muted' }, ` niv. ${sp.level}`) : null)))) : null),
    specs.length
      ? block(`Spécialisations (niveau ${content.rules.specLevel ?? 4})`,
          h('div', { class: 'cs-specs' }, specs.map((sp) => h('div', { class: 'cs-spec', dataset: { spec: sp.id } },
            h('div', { class: 'cs-spec-head' }, h('b', null, sp.name), sp.tag ? h('span', { class: 'role-tag' }, sp.tag) : null),
            h('p', null, sp.desc),
            ult(sp) ? h('p', { class: 'cs-ult' }, icon('star', 12), ` Ultime : ${ult(sp).name}`) : null))))
      : null);
}

/** @param classId  la classe déjà choisie à l'ouverture (l'accueil la propose en grand quand on n'a encore aucun héros) */
export function openCreateModal(classId = null) {
  const content = app.content;
  const slots = heroSlots();
  if (app.profile.characters.length >= slots) return toast(`Toutes tes places sont prises (${app.profile.characters.length} sur ${slots}) : supprime un personnage pour en créer un autre.`, 'bad');
  const state = { name: '', classId: content.classes[classId] ? classId : Object.keys(content.classes)[0] };
  openModal({
    title: 'Nouveau personnage',
    wide: true,
    className: 'create-modal',
    render: (api) => {
      const cls = content.classes[state.classId];
      const classCards = Object.values(content.classes).map((c) =>
        h('button', {
          type: 'button', class: `class-card compact ${state.classId === c.id ? 'selected' : ''}`, dataset: { classId: c.id }, 'aria-pressed': String(state.classId === c.id),
          onClick: () => { state.name = document.getElementById('new-char-name')?.value ?? state.name; state.classId = c.id; api.refresh(); }
        },
          portrait(c.id, 40),
          h('div', { class: 'class-info' },
            h('div', { class: 'class-name' }, c.name),
            h('div', { class: 'muted small' }, rolesOf(content, c).join(' · ')))));
      const input = h('input', {
        type: 'text', maxlength: 20, placeholder: `Nom (sinon : ${cls.name})`, class: 'input', value: state.name, id: 'new-char-name',
        onInput: (e) => (state.name = e.target.value),
        onKeydown: (e) => e.key === 'Enter' && create()
      });
      const create = async () => {
        const res = await characterAction({ type: 'CHAR_CREATE', name: state.name, classId: state.classId });
        if (!res.ok) return;
        const ch = res.character;
        if (app.ui.team && app.ui.team.length < 4) app.ui.team.push(ch.id);
        if (app.ui.view === 'farm') { app.ui.farmChar = ch.id; app.profile.settings.farmChar = ch.id; } // en farm, le nouveau personnage est choisi
        persistProfile();
        play('click');
        closeModal();
        toast(`${ch.name} rejoint l'aventure !`, 'good');
        redraw();
      };
      setTimeout(() => document.getElementById('new-char-name')?.focus({ preventScroll: true }), 30);
      return [
        h('label', { class: 'field create-name' }, h('span', null, 'Nom'), input),
        h('div', { class: 'create-layout' },
          h('div', { class: 'class-list', role: 'group', 'aria-label': 'Classes' }, classCards),
          classShowcase(content, cls)),
        h('div', { class: 'create-foot' },
          h('div', { class: 'row end gap' },
            h('button', { class: 'btn', onClick: () => closeModal() }, 'Annuler'),
            h('button', { class: 'btn btn-primary', onClick: create }, 'Créer le personnage')))
      ];
    }
  });
}

// ---------------- Places et suppression d'un personnage ----------------

/** Le nombre de places de personnages : celui du serveur en ligne, sinon `maxCharacters` de rules.json. */
export const heroSlots = () => characterSlots(app.content, app.gateway?.maxCharacters ?? null);

/**
 * Supprimer un personnage : une vraie confirmation (on tape son nom), parce que c'est définitif.
 * Refusé pendant qu'il est dans une partie. `onDone` : appelé après la suppression (ex. fermer la fiche).
 */
export function openDeleteCharacter(charId, onDone = null) {
  const content = app.content;
  const ch = app.profile.characters.find((c) => c.id === charId);
  if (!ch) return;
  if (lockedCharIds().has(ch.id)) return toast(`${ch.name} est dans la partie en cours : reprends-la ou abandonne-la d'abord.`, 'bad');
  const cls = content.classes[ch.classId];
  const items = Object.values(ch.equipment || {}).filter(Boolean).length + (ch.inventory || []).length + (ch.lootChoice || []).length;
  const state = { typed: '', busy: false };
  const same = (a, b) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr');
  openModal({
    title: `Supprimer ${ch.name} ?`,
    className: 'delete-modal',
    render: (api) => {
      const ok = same(state.typed, ch.name) && !state.busy;
      const confirm = async () => {
        if (!same(state.typed, ch.name) || state.busy) return;
        state.busy = true;
        api.refresh();
        const res = await characterAction({ type: 'CHAR_DELETE', charId: ch.id });
        state.busy = false;
        if (!res.ok) return api.refresh();
        app.ui.team = (app.ui.team || []).filter((id) => id !== ch.id);
        persistProfile();
        closeModal();
        toast(`${ch.name} a quitté l'aventure.`, 'info');
        onDone?.();
        redraw();
      };
      setTimeout(() => document.getElementById('delete-confirm-name')?.focus({ preventScroll: true }), 30);
      return [
        h('div', { class: 'delete-who' }, portrait(ch.classId, 56),
          h('div', null, h('b', null, ch.name), h('div', { class: 'muted small' }, `${cls.name} · niveau ${ch.level}${items ? ` · ${items} objet${items > 1 ? 's' : ''}` : ''}`))),
        h('p', null, 'Ce personnage, son équipement, son sac et ses éclats seront ', h('b', null, 'définitivement perdus'), '.',
          app.gateway.canExport ? ' Si tu veux le garder, copie d\'abord son code (fiche > Infos, ou « Sauvegarde »).' : ''),
        h('label', { class: 'field' }, h('span', null, `Pour confirmer, écris son nom : « ${ch.name} »`),
          h('input', { type: 'text', class: 'input', id: 'delete-confirm-name', autocomplete: 'off', value: state.typed,
            onInput: (e) => { state.typed = e.target.value; const b = document.getElementById('delete-confirm-btn'); if (b) b.disabled = !same(state.typed, ch.name); },
            onKeydown: (e) => e.key === 'Enter' && confirm() })),
        h('div', { class: 'row end gap' },
          h('button', { class: 'btn', onClick: () => closeModal() }, 'Annuler'),
          h('button', { class: 'btn btn-danger', id: 'delete-confirm-btn', disabled: !ok, onClick: confirm }, icon('trash', 16), 'Supprimer définitivement'))
      ];
    }
  });
}

// ---------------- Sauvegarde : export / import ----------------

export function openSaveModal() {
  if (!app.gateway.canExport) return; // (en ligne, le compte est la sauvegarde : importer des personnages permettrait de tricher)
  const content = app.content;
  const state = { selected: new Set(app.profile.characters.map((c) => c.id)), importText: '', message: null };
  openModal({
    title: 'Sauvegarde des personnages',
    wide: true,
    render: (api) => {
      const chars = app.profile.characters;
      const ids = chars.filter((c) => state.selected.has(c.id)).map((c) => c.id);
      const code = ids.length ? exportCode(app.profile, ids) : '';

      const exportBox = h('div', { class: 'save-section' },
        h('h3', null, 'Exporter'),
        h('p', { class: 'muted small' }, app.gateway.persistent
          ? 'Tes personnages sont déjà enregistrés dans ce navigateur. Utilise un code pour les copier sur un autre ordinateur ou en garder une copie.'
          : 'Attention : ce navigateur bloque l\'enregistrement local. Copie ton code pour ne rien perdre !'),
        chars.length
          ? h('div', { class: 'check-list' }, chars.map((c) =>
              h('label', { class: 'check' },
                h('input', { type: 'checkbox', checked: state.selected.has(c.id), onChange: (e) => { e.target.checked ? state.selected.add(c.id) : state.selected.delete(c.id); api.refresh(); } }),
                `${c.name} (${content.classes[c.classId].name} niv. ${c.level})`)))
          : h('p', { class: 'muted' }, 'Aucun personnage à exporter.'),
        h('textarea', { id: 'save-export-code', class: 'code-box', readonly: true, rows: 4, onClick: (e) => e.target.select() }, code),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn btn-primary', disabled: !code,
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(code);
                toast('Code copié !', 'good');
              } catch {
                // Certains navigateurs refusent la copie automatique : on sélectionne le texte à la place.
                document.getElementById('save-export-code')?.select();
                toast('Texte sélectionné : copie-le avec Ctrl+C (ou appui long sur téléphone).', 'info');
              }
            }
          }, 'Copier le code')));

      const importBox = h('div', { class: 'save-section' },
        h('h3', null, 'Importer'),
        h('p', { class: 'muted small' }, 'Colle un code de sauvegarde. Les personnages sont AJOUTÉS (rien n\'est écrasé).'),
        h('textarea', { id: 'save-import-code', class: 'code-box', rows: 4, placeholder: 'DJN1.…', onInput: (e) => (state.importText = e.target.value) }, state.importText),
        state.message ? h('div', { class: `form-msg ${state.message.ok ? 'ok' : 'ko'}` }, state.message.text) : null,
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn btn-primary',
            onClick: () => {
              try {
                const imported = importCode(content, state.importText);
                const n = addImported(app.profile, imported);
                persistProfile();
                state.importText = '';
                state.message = { ok: true, text: `${n} personnage(s) importé(s) !` };
                redraw();
              } catch (e) {
                state.message = { ok: false, text: e.message };
              }
              api.refresh();
            }
          }, 'Importer')));
      return [exportBox, importBox];
    }
  });
}

// ---------------- Compte (jeu en ligne) ----------------

/** « Mon compte » : changer de mot de passe, se déconnecter. (N'existe qu'en ligne : en jeu local il n'y a pas de compte.) */
export function openAccountModal() {
  const gw = app.gateway;
  if (gw.mode !== 'online' || !gw.user) return;
  const state = { current: '', next: '', again: '', message: null, busy: false };
  openModal({
    title: 'Mon compte',
    render: (api) => {
      const field = (id, label, key, autocomplete) => h('label', { class: 'field' },
        h('span', null, label),
        h('input', { class: 'input', id, type: 'password', value: state[key], maxlength: 200, autocomplete, onInput: (e) => (state[key] = e.target.value) }));
      const submit = async (e) => {
        e.preventDefault();
        if (state.busy) return;
        if (!state.current || !state.next) state.message = { ok: false, text: 'Remplis les trois champs.' };
        else if (state.next !== state.again) state.message = { ok: false, text: 'Les deux nouveaux mots de passe ne sont pas identiques.' };
        else {
          state.busy = true;
          const r = await gw.changePassword(state.current, state.next);
          state.busy = false;
          if (r.ok) {
            state.current = state.next = state.again = '';
            state.message = { ok: true, text: 'Mot de passe changé. Tes autres appareils devront se reconnecter.' };
          } else state.message = { ok: false, text: r.error };
        }
        if (app.modal) api.refresh();
      };
      return [
        h('p', null, 'Connecté en tant que ', h('b', null, gw.user.name), '. Tes personnages sont gardés sur le serveur : tu les retrouves sur tous tes appareils.'),
        h('div', { class: 'save-section' },
          h('h3', null, 'Changer de mot de passe'),
          h('form', { class: 'auth-form', onSubmit: submit },
            field('account-current', 'Mot de passe actuel', 'current', 'current-password'),
            field('account-next', 'Nouveau mot de passe (6 caractères au moins)', 'next', 'new-password'),
            field('account-again', 'Nouveau mot de passe, encore une fois', 'again', 'new-password'),
            state.message ? h('div', { class: `form-msg ${state.message.ok ? 'ok' : 'ko'}`, id: 'account-message', role: 'alert' }, state.message.text) : null,
            h('div', { class: 'row gap' }, h('button', { class: 'btn btn-primary', id: 'account-submit', type: 'submit', disabled: state.busy }, 'Changer le mot de passe')))),
        h('div', { class: 'save-section' },
          h('h3', null, 'Session'),
          h('div', { class: 'row gap' },
            h('button', { class: 'btn', id: 'account-logout', type: 'button', onClick: () => { closeModal(); logout(); } }, 'Se déconnecter')))
      ];
    }
  });
}

// ---------------- Atelier de classes ----------------

/** Choisit des personnages de test (classe + niveau) et des mannequins, puis entre dans la salle d'entraînement. */
export function openTrainingModal() {
  const content = app.content;
  const classIds = Object.keys(content.classes);
  const saved = app.profile.settings.training;
  const state = {
    specs: (saved?.specs || [{ classId: classIds[0], level: 4 }]).filter((s) => content.classes[s.classId]),
    dummy: saved?.opts?.dummy || 'mannequin',
    count: saved?.opts?.count || 1,
    atkScale: saved?.opts?.atkScale || 1
  };
  if (!state.specs.length) state.specs = [{ classId: classIds[0], level: 4 }];

  openModal({
    title: 'Atelier de classes',
    wide: true,
    render: (api) => {
      const rows = state.specs.map((s, i) =>
        h('div', { class: 'train-row' },
          portrait(s.classId, 36),
          h('select', { id: `train-class-${i}`, class: 'input', onChange: (e) => { s.classId = e.target.value; s.spec = null; api.refresh(); } },
            classIds.map((id) => h('option', { value: id, selected: s.classId === id }, content.classes[id].name))),
          specsOf(content, s.classId).length
            ? h('select', { id: `train-spec-${i}`, class: 'input', title: 'Spécialisation à tester (niveau 4 et plus)', onChange: (e) => { s.spec = e.target.value || null; api.refresh(); } },
                h('option', { value: '' }, 'Sans spécialisation'),
                specsOf(content, s.classId).map((sp) => h('option', { value: sp.id, selected: s.spec === sp.id }, sp.name)))
            : null,
          h('label', { class: 'train-level' }, h('span', { class: 'muted small' }, 'Niveau'),
            h('input', {
              id: `train-level-${i}`, class: 'input', type: 'number', min: 1, max: levelCap(content), value: s.level,
              onChange: (e) => { s.level = Math.max(1, Math.min(levelCap(content), Number(e.target.value) || 1)); api.refresh(); }
            })),
          state.specs.length > 1 ? h('button', { class: 'btn btn-small btn-ghost', title: 'Retirer', onClick: () => { state.specs.splice(i, 1); api.refresh(); } }, icon('close', 14)) : null));

      return [
        h('p', { class: 'muted' }, "Une salle pour tester vite : tes personnages connaissent TOUTES les compétences de leur niveau, face à des mannequins qui ne meurent jamais. Idéal pour écrire une classe : modifie le JSON, clique sur « Recharger les JSON », re-teste."),
        h('h4', null, 'Personnages de test (1 à 4)'),
        h('div', { class: 'train-list' }, rows),
        state.specs.length < 4 ? h('button', { class: 'btn btn-small', onClick: () => { state.specs.push({ classId: classIds[0], level: 4 }); api.refresh(); } }, icon('plus', 14), 'Ajouter un personnage') : null,
        h('h4', null, 'Mannequins'),
        h('div', { class: 'row gap wrap center' },
          h('select', { id: 'train-dummy', class: 'input', onChange: (e) => { state.dummy = e.target.value; } },
            h('option', { value: 'mannequin', selected: state.dummy === 'mannequin' }, 'Inertes (ne frappent pas)'),
            h('option', { value: 'mannequin_agressif', selected: state.dummy === 'mannequin_agressif' }, 'Agressifs (frappent le groupe)')),
          h('label', { class: 'train-level' }, h('span', { class: 'muted small' }, 'Nombre'),
            h('input', { id: 'train-count', class: 'input', type: 'number', min: 1, max: 3, value: state.count, onChange: (e) => { state.count = Math.max(1, Math.min(3, Number(e.target.value) || 1)); } })),
          h('label', { class: 'train-level' }, h('span', { class: 'muted small' }, 'Force'),
            h('select', { id: 'train-atk', class: 'input', onChange: (e) => { state.atkScale = Number(e.target.value); } },
              [[1, 'normale'], [2, 'forte ×2'], [4, 'très forte ×4']].map(([v, label]) => h('option', { value: v, selected: state.atkScale === v }, label))))),
        h('div', { class: 'row end gap' },
          h('button', { class: 'btn', onClick: () => closeModal() }, 'Annuler'),
          h('button', { class: 'btn btn-primary', onClick: () => { closeModal(); startTraining(state.specs, { dummy: state.dummy, count: state.count, atkScale: state.atkScale }); } }, icon('flask', 16), "Entrer dans l'atelier"))
      ];
    }
  });
}


// ---------------- La récompense du farm : 1 objet parmi 3 ----------------

/**
 * La récompense d'une session de farm attend sur le personnage (`lootChoice`) : on garde UN objet (il va dans le sac),
 * les autres sont démantelés en éclats pour la forge. `onDone` : appelé une fois le choix fait.
 */
export function openLootModal(charId, onDone = null) {
  const state = { picked: null };
  openModal({
    title: 'Choisis ta récompense',
    wide: true,
    className: 'loot-modal',
    onClose: () => { redraw(); if (state.picked && onDone) onDone(); },
    render: (api) => {
      const content = app.content;
      const ch = app.profile.characters.find((c) => c.id === charId);
      if (!ch) return h('p', null, 'Personnage introuvable.');
      const locked = lockedCharIds().has(ch.id);
      const head = h('div', { class: 'sheet-head' },
        portrait(ch.classId, 52),
        h('div', null, h('h3', null, `Récompense de ${ch.name}`), h('div', { class: 'muted' }, 'Un objet à garder ; les autres deviennent des éclats pour la forge.')));

      if (state.picked) {
        const { picked, shards } = state.picked;
        return [
          head,
          h('div', { class: 'reveal-grid' }, h('div', { class: 'reveal-item', style: { '--i': 0 } }, itemCard(content, picked, { realLevel: ch.level }))),
          h('p', { class: 'loot-done' }, `${content.items[picked.id].name} est dans ton sac.`, shards ? ` Les autres objets donnent ${shards} éclats (tu en as ${ch.shards || 0}).` : ''),
          h('div', { class: 'row end gap' },
            h('button', { class: 'btn', onClick: () => { api.close(); openSheet(ch.id); } }, 'Voir ma fiche & équiper'),
            h('button', { class: 'btn btn-primary', id: 'loot-close', onClick: () => api.close() }, 'Fermer'))
        ];
      }
      const list = ch.lootChoice || [];
      if (!list.length) {
        return [head, h('p', { class: 'muted' }, 'Aucune récompense à choisir. Termine une session de farm pour en gagner une.'),
          h('div', { class: 'row end' }, h('button', { class: 'btn', onClick: () => api.close() }, 'Fermer'))];
      }
      const pick = async (inst) => {
        const res = await characterAction({ type: 'CHAR_PICK_LOOT', charId: ch.id, uid: inst.uid });
        if (!res.ok) return;
        state.picked = { picked: res.picked, shards: res.shards };
        play(content.rarityIndex[content.items[res.picked.id].rarity] >= content.rarityIndex.rare ? 'crit' : 'heal');
        api.refresh();
      };
      return [
        head,
        h('div', { class: 'loot-choices' }, list.map((inst, i) => {
          const others = list.filter((x) => x !== inst).reduce((t, x) => t + salvageValue(content, x), 0);
          return h('div', { class: 'loot-choice reveal-item', style: { '--i': i }, dataset: { uid: inst.uid, item: inst.id } },
            itemCard(content, inst, { realLevel: ch.level }),
            h('button', { class: 'btn btn-primary loot-pick', disabled: locked, title: locked ? 'Ce personnage est dans une partie en cours.' : `Garder cet objet (les autres : +${others} éclats)`, onClick: () => pick(inst) },
              icon('check', 16), 'Garder', h('small', null, ` · +${others} éclats`)));
        })),
        locked ? h('p', { class: 'tone-bad small' }, 'Ce personnage est dans une partie en cours : termine-la ou abandonne-la avant de choisir.') : null,
        h('div', { class: 'row end gap' }, h('button', { class: 'btn', onClick: () => api.close() }, 'Plus tard'))
      ];
    }
  });
}

// ---------------- Règles ----------------

export function openHelpModal() {
  openModal({
    title: 'Comment jouer',
    wide: true,
    render: () => helpContent()
  });
}

/** Les règles du jeu (la fenêtre « Comment jouer », et l'onglet Règles du Grimoire). */
export function helpContent() {
  return [
      h('div', { class: 'help' },
        h('h3', null, 'Le principe'),
        h('p', null, 'Votre groupe (1 à 4 personnages) explore un donjon case par case jusqu\'au boss final. À chaque tour, UN joueur est « sous les projecteurs » : il avance, lance le D20 et c\'est LUI qui décide quoi faire du résultat.'),
        app.gateway.mode === 'online' ? [
          h('h3', null, 'Jouer à plusieurs'),
          h('p', null, "Un donjon se joue dans un salon : un joueur le crée et donne son code à ses amis (ou ils le trouvent dans la liste des salons ouverts). Chacun amène UN seul héros et choisit « Je suis prêt » ; l'hôte règle le donjon et lance la partie. Chacun ne joue que son héros : les boutons des autres sont grisés, et un bandeau dit à qui est le tour."),
          h('p', null, "Quand le temps d'un tour (réglé par l'hôte) est écoulé, ou si un joueur est parti, le pilote automatique joue à sa place, très prudemment. Quitter en pleine partie : ton héros reste dans le donjon mais ne gagne rien. À la fin, chacun reçoit l'XP et le butin sur son propre héros.")
        ] : null,
        h('h3', null, 'Les cases'),
        h('ul', null,
          h('li', null, h('b', null, 'Combat'), ' : au tour par tour. Le D20 d\'initiative peut donner l\'avantage (17+) ou vous faire surprendre (4 ou moins).'),
          h('li', null, h('b', null, 'Trésor'), ' : le butin va dans le sac du joueur actif (il peut le donner ensuite, depuis son sac). Plus le dé est haut, meilleur est l\'objet.'),
          h('li', null, h('b', null, 'Piège'), ' : jet de sauvegarde au D20. Un échec fait mal.'),
          h('li', null, h('b', null, 'Fontaine d\'XP'), ' : tout garder ou partager ? Mais l\'eau est peut-être empoisonnée…'),
          h('li', null, h('b', null, 'Fontaine de vie'), ' : rare. Ressuscite un allié (une seule résurrection par joueur et par run).'),
          h('li', null, h('b', null, 'Coup bas'), ' : vous pouvez saboter un allié (poison, croche-pied…). Mais sur un 5 ou moins, ça se retourne contre vous !'),
          h('li', null, h('b', null, 'Marchand'), ' : vend et achète des objets contre l\'or de la run.')),
        h('h3', null, 'Le combat'),
        h('ul', null,
          h('li', null, h('b', null, 'La frise'), " : l'ordre de jeu est fixé par l'initiative. Les camps alternent (un allié, un monstre, un allié…)."),
          h('li', null, h('b', null, "Points d'action (PA)"), ' : à ton tour tu as des PA (6 de base). Chaque compétence en coûte. Quand il n\'en reste plus, ton tour se termine (ou clique sur « Fin du tour »).'),
          h('li', null, h('b', null, 'Les rangs'), ' : devant et derrière. Le corps à corps ne touche que le rang AVANT tant qu\'il reste quelqu\'un dedans ; les attaques à distance touchent tout le monde. Changer de rang coûte 1 PA.'),
          h('li', null, h('b', null, 'Les monstres annoncent leurs actions'), ' : compétences et cibles sont visibles. Tue-les, étourdis-les ou provoque-les avant leur tour !'),
          h('li', null, h('b', null, 'Le D20 de chaque compétence'), ' : chaque compétence a son propre risque. La petite bande de 20 cases le montre : rouge = échec critique (la compétence rate), doré = coup critique. Certaines compétences ne ratent jamais, d\'autres ratent presque toujours mais font très mal.'),
          h('li', null, h('b', null, 'Au clavier'), ` : les touches de la rangée du haut (${firstKeys(4)} ...) lancent les compétences dans l'ordre, comme la barre d'action d'un MMORPG. Échap annule le choix d'une cible. Sur téléphone : un premier toucher montre la compétence, le second la lance.`),
          h('li', null, h('b', null, 'Les boucliers'), " absorbent les dégâts avant les PV, mais ne comptent pas comme des PV (ils n'enlèvent pas la force d'un Berserker blessé).")),
        h('h3', null, 'La zone de farm (solo)'),
        h('p', null, "Un seul personnage affronte des vagues de monstres de plus en plus fortes, avec un boss régulier. Après chaque vague tu choisis : continuer ou t'arrêter. Si tu tombes, tu ne perds que la vague en cours. Chaque vague donne des éclats pour la forge ; à la fin, tu gardes 1 objet parmi 3, d'autant meilleurs que tu as tenu longtemps (les autres deviennent des éclats). L'XP du farm sert à rattraper : seul un héros plus bas que ton meilleur héros en gagne. Le meilleur équipement vient des donjons en équipe."),
        h('h3', null, 'Les succès'),
        h('p', null, "Chaque personnage a ses succès (fiche > Succès) : finir un donjon en équipe, vaincre des vagues, atteindre un niveau d'équipement... Ils débloquent des compétences, des fonctions du jeu (les grandes expéditions) ou des titres, pour ce personnage-là."),
        h('h3', null, 'Mort et fantômes'),
        h('p', null, 'Un joueur mort devient un fantôme : il aide encore (bénir ou gêner un jet, éclairer la prochaine case). Il peut être ressuscité par une fontaine de vie ou par le Soigneur (avec un coût partagé : PV max en moins, uniquement pendant la run).'),
        h('h3', null, 'Les modes'),
        h('ul', null,
          h('li', null, h('b', null, 'Basic'), ' : aucune restriction, mais XP et butin très réduits.'),
          h('li', null, h('b', null, 'Tranche'), ' : seuls l\'équipement et les compétences de niveau ≤ à la tranche comptent (niveau effectif).'),
          h('li', null, h('b', null, 'Stasis'), ' : comme Tranche, mais bien plus dur. Le butin est de meilleure QUALITÉ (jamais de meilleur niveau).')),
        h('h3', null, 'Les raretés'),
        h('p', null, "La couleur d'un objet dit sa rareté d'un coup d'œil (bordure, nom et pastille). Plus l'objet est rare, plus ses stats et ses effets sont puissants :"),
        h('div', { class: 'rarity-legend' }, app.content.rarities.map((r) => h('span', { class: `rarity-pill r-${r.id}`, style: { '--rar': r.color } }, r.name))),
        h('h3', null, 'Ce que vous gardez'),
        h('p', null, 'Victoire : XP, objets trouvés et équipement sont ajoutés à vos personnages. Défaite ou abandon : vous perdez la progression de la run et le butin non récupéré, mais JAMAIS votre personnage ni son équipement. Les coups bas ne touchent jamais votre personnage sauvegardé : leurs effets disparaissent à la fin de la run.'),
        h('h3', null, app.gateway.canExport ? 'Sauvegarde' : 'Votre compte'),
        app.gateway.canExport
          ? h('p', null, 'Vos personnages sont enregistrés dans ce navigateur. Utilisez « Sauvegarde » pour exporter un code et le retrouver ailleurs.')
          : h('p', null, 'Vos personnages et votre partie en cours sont enregistrés sur le serveur, avec votre compte : vous les retrouvez sur tous vos appareils, et vous pouvez reprendre une partie là où vous l\'avez laissée. Le bouton de votre pseudo (en haut à droite de l\'accueil) permet de changer de mot de passe ou de se déconnecter.'))
  ];
}
