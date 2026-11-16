// ============================================================
//  dialogs.js — Fenêtres de l'accueil : nouveau personnage, sauvegarde, règles
// ============================================================

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, persistProfile, toast, openModal, closeModal } from '../state.js';
import { redraw, startTraining, lockedCharIds, characterAction, logout } from '../controller.js';
import { portrait, previewStats, statsLine } from '../components.js';
import { itemCard } from '../format.js';
import { firstKeys } from '../keys.js';
import { openSheet } from './sheet.js';
import { chestInfo, levelCap, specsOf } from '../../core/index.js';
import { exportCode, importCode, addImported } from '../../storage/profile.js';
import { play } from '../sound.js';

// ---------------- Nouveau personnage ----------------

/** @param classId  la classe déjà choisie à l'ouverture (l'accueil la propose en grand quand on n'a encore aucun héros) */
export function openCreateModal(classId = null) {
  const content = app.content;
  const state = { name: '', classId: content.classes[classId] ? classId : Object.keys(content.classes)[0] };
  openModal({
    title: 'Nouveau personnage',
    render: (api) => {
      const classCards = Object.values(content.classes).map((cls) =>
        h('button', {
          class: `class-card ${state.classId === cls.id ? 'selected' : ''}`,
          onClick: () => { state.classId = cls.id; api.refresh(); }
        },
          portrait(cls.id, 52),
          h('div', { class: 'class-info' },
            h('div', { class: 'class-name' }, cls.name, h('span', { class: `role-tag role-${cls.role}` }, { tank: 'Tank', healer: 'Soigneur', damage: 'Dégâts' }[cls.role])),
            h('div', { class: 'small' }, cls.description),
            h('div', { class: 'muted small' }, `PV ${cls.baseStats.hp} · Att ${cls.baseStats.atk} · Déf ${cls.baseStats.def}${cls.baseStats.heal ? ` · Soin ${cls.baseStats.heal}` : ''} · Rang ${cls.startRow === 'front' ? 'avant' : 'arrière'}`))));
      const input = h('input', {
        type: 'text', maxlength: 20, placeholder: 'Nom du personnage', class: 'input', value: state.name, id: 'new-char-name',
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
      setTimeout(() => document.getElementById('new-char-name')?.focus(), 30);
      return [
        h('label', { class: 'field' }, h('span', null, 'Nom'), input),
        h('p', { class: 'muted small' }, 'Aucun prérequis : tout le monde peut choisir n\'importe quelle classe. Les classes sont provisoires.'),
        h('div', { class: 'class-list' }, classCards),
        h('div', { class: 'row end gap' },
          h('button', { class: 'btn', onClick: () => closeModal() }, 'Annuler'),
          h('button', { class: 'btn btn-primary', onClick: create }, 'Créer le personnage'))
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


// ---------------- Coffre d'un personnage ----------------

/**
 * Le coffre : les objets gagnés au farm y attendent. On l'ouvre en un clic : tout passe dans l'inventaire,
 * et les objets se révèlent un par un, du moins rare au plus rare (le meilleur arrive en dernier).
 */
export function openChestModal(charId) {
  const state = { revealed: null };
  openModal({
    title: 'Coffre',
    onClose: () => redraw(),
    render: (api) => {
      const content = app.content;
      const ch = app.profile.characters.find((c) => c.id === charId);
      if (!ch) return h('p', null, 'Personnage introuvable.');
      const info = chestInfo(content, ch);
      const locked = lockedCharIds().has(ch.id);
      const head = h('div', { class: 'sheet-head' },
        portrait(ch.classId, 52),
        h('div', null, h('h3', null, `Coffre de ${ch.name}`), h('div', { class: 'muted' }, `${info.count} / ${info.capacity} objets`)));

      if (state.revealed) {
        return [
          head,
          h('p', { class: 'muted' }, `Tu reçois ${state.revealed.length} objet${state.revealed.length > 1 ? 's' : ''}. Ils sont maintenant dans ton inventaire.`),
          h('div', { class: 'reveal-grid' }, state.revealed.map((inst, i) =>
            h('div', { class: 'reveal-item', style: { '--i': i } }, itemCard(content, inst, { realLevel: ch.level })))),
          h('div', { class: 'row end gap' },
            h('button', { class: 'btn', onClick: () => { api.close(); openSheet(ch.id); } }, 'Voir ma fiche & équiper'),
            h('button', { class: 'btn btn-primary', onClick: () => api.close() }, 'Fermer'))
        ];
      }
      if (!info.count) {
        return [
          head,
          h('div', { class: 'chest-empty' }, icon('treasure', 56), h('p', { class: 'muted' }, 'Le coffre est vide. Les objets gagnés dans la zone de farm arrivent ici.')),
          h('div', { class: 'row end' }, h('button', { class: 'btn', onClick: () => api.close() }, 'Fermer'))
        ];
      }
      const open = async () => {
        const res = await characterAction({ type: 'CHAR_OPEN_CHEST', charId: ch.id });
        if (!res.ok) return;
        // Du moins rare au plus rare : le meilleur objet se dévoile en dernier.
        const rank = (inst) => content.rarityIndex[content.items[inst.id].rarity] * 100 + content.items[inst.id].level;
        state.revealed = res.opened.slice().sort((a, b) => rank(a) - rank(b));
        const best = content.rarityIndex[content.items[state.revealed[state.revealed.length - 1].id].rarity];
        play(best >= content.rarityIndex.rare ? 'crit' : 'heal');
        api.refresh();
      };
      return [
        head,
        h('div', { class: 'chest-closed' },
          h('div', { class: 'chest-icon' }, icon('treasure', 72)),
          h('div', { class: 'chest-slots', 'aria-hidden': 'true' }, Array.from({ length: info.count }, () => h('span', { class: 'chest-slot' }, '?'))),
          h('p', null, `${info.count} objet${info.count > 1 ? 's' : ''} t'attendent. Ouvre le coffre pour tout ranger dans ton inventaire.`)),
        locked ? h('p', { class: 'tone-bad small' }, 'Ce personnage est dans une partie en cours : termine-la ou abandonne-la avant d\'ouvrir son coffre.') : null,
        h('div', { class: 'row end gap' },
          h('button', { class: 'btn', onClick: () => api.close() }, 'Plus tard'),
          h('button', { class: 'btn btn-primary btn-xl', id: 'chest-open', disabled: locked, onClick: open }, icon('treasure', 20), 'Ouvrir le coffre'))
      ];
    }
  });
}

// ---------------- Règles ----------------

export function openHelpModal() {
  openModal({
    title: 'Comment jouer',
    wide: true,
    render: () => [
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
          h('li', null, h('b', null, 'Trésor'), ' : le butin va au joueur actif, qui le garde ou le donne. Plus le dé est haut, meilleur est l\'objet.'),
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
        h('p', null, "Un seul personnage affronte des vagues de monstres de plus en plus fortes, avec un boss régulier. Après chaque vague tu choisis : continuer ou partir avec ton coffre. Si tu tombes, tu ne perds que la vague en cours. Les récompenses sont modestes (de l'XP de début de jeu, des objets communs ou inhabituels, rarement rares) : le meilleur équipement vient des donjons en équipe. Ton coffre se vide dans l'inventaire quand tu l'ouvres."),
        h('h3', null, 'Les succès'),
        h('p', null, "Chaque personnage a ses succès (fiche > Succès) : finir un donjon en équipe, vaincre des vagues, atteindre un niveau d'équipement... Ils débloquent des compétences, des fonctions du jeu (le farm automatique) ou des titres, pour ce personnage-là."),
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
    ]
  });
}
