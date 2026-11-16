// ============================================================
//  sheet.js — La fiche d'un personnage sauvegardé (hors run)
// ============================================================
// Quatre onglets :
//   Équipement   « Porté » (3 emplacements) et « Sac » (avec ce que chaque objet changerait)
//   Compétences  l'arbre : une rangée par branche, un panneau de détail, la liste des conditions
//   Succès       ce que ce personnage a accompli
//   Infos        statistiques, copie du code, suppression
// Cet écran ne contient aucune règle : il lit le personnage, appelle le moteur (canEquip, learnSkill...) et affiche.

import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { app, toast, openModal, closeModal, confirmBox } from '../state.js';
import { redraw, lockedCharIds, characterAction } from '../controller.js';
import { portrait, xpBar, previewStats, progressBar } from '../components.js';
import { skillBlurb, rawDice, diceStrip, skillIconName, skillKind } from '../format.js';
import { equipmentView, afterEquipRender } from '../gear.js';
import { play } from '../sound.js';
import {
  skillRequirements, skillPointsToSpend, skillPointsSpent, availableTranches, achievementsFor, achievementProgress,
  rewardTexts, titlesOf, chestInfo, gearLevel, deckSize, specLevel, specsOf, deckEligible, choiceMate, knownSkills, activeSets
} from '../../core/index.js';
import { EQUIP_SLOTS } from '../../core/content.js';
import { exportCode } from '../../storage/profile.js';

const ROLE_FR = { tank: 'Tank', healer: 'Soigneur', damage: 'Dégâts' };

/** Les 8 statistiques de la bande du haut : clé du moteur, nom, icône, et l'explication qui s'affiche au survol. */
const STAT_ROWS = [
  { key: 'hpMax', label: 'PV', ic: 'heart', tip: 'Points de vie. À 0, tu tombes pendant le combat.' },
  { key: 'atk', label: 'Attaque', ic: 'sword', tip: 'La base des dégâts de tes compétences.' },
  { key: 'def', label: 'Défense', ic: 'shield', tip: 'Réduit les dégâts que tu reçois.' },
  { key: 'heal', label: 'Soin', ic: 'cross', tip: 'La base des soins et des boucliers que tu donnes.' },
  { key: 'ini', label: 'Initiative', ic: 'bolt', tip: 'Plus elle est haute, plus tu joues tôt dans la frise du combat.' },
  { key: 'pa', label: 'PA / tour', ic: 'flame', tip: "Points d'action à chaque tour de combat : chaque compétence en coûte." },
  { key: 'save', label: 'Sauvegarde', ic: 'eye', tip: "S'ajoute à ton jet de sauvegarde pour éviter les pièges du donjon." },
  { key: 'luck', label: 'Chance', ic: 'd20', tip: "S'ajoute à tes jets de D20 dans le donjon (cases, trésors...)." }
];

/** Écran de téléphone ? (la fiche passe alors en une seule colonne) */
const isNarrow = () => !!window.matchMedia && window.matchMedia('(max-width: 760px)').matches;

const fmt = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

/** Combien de succès ce personnage a-t-il déjà débloqués ? */
function doneCount(content, ch) {
  return achievementsFor(content, ch).filter((a) => ch.achievements?.[a.id]).length;
}

export function openSheet(charId, startTab = 'equip') {
  const first = app.profile.characters.find((c) => c.id === charId);
  // sel = la compétence affichée dans le panneau de l'arbre ; filter = le filtre du sac
  const state = { tab: startTab, view: 'basic', sel: null, shownTab: null, gear: { sel: null, filter: 'all' } };
  // Si on tourne le téléphone, la mise en page change : on redessine la fiche.
  const mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  const onMq = () => app.modal && app.modal.api.refresh();
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);
  openModal({
    title: first ? first.name : 'Fiche de personnage',
    wide: true,
    className: 'sheet-modal',
    onClose: () => { if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq); redraw(); },
    render: (api) => {
      const ch = app.profile.characters.find((c) => c.id === charId);
      if (!ch) return h('p', null, 'Personnage introuvable.');
      const content = app.content;
      const cls = content.classes[ch.classId];
      const tranche = state.view === 'basic' ? null : Number(state.view);
      const locked = lockedCharIds().has(ch.id);

      // On garde la position de défilement quand on reste sur le même onglet (équiper un objet ne ramène pas en haut).
      const keep = api.body.querySelector('.tab-body');
      const scrollTop = keep && state.shownTab === state.tab ? keep.scrollTop : 0;
      state.shownTab = state.tab;

      const stats = previewStats(ch, tranche);
      const bare = previewStats({ ...ch, equipment: Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null])) }, tranche);
      const title = titlesOf(content, ch)[0];

      const hero = h('div', { class: 'sheet-hero' },
        h('div', { class: 'hero-medal' }, portrait(ch.classId, 'fluid')),
        h('div', { class: 'hero-id' },
          h('div', { class: 'hero-name' }, h('b', null, ch.name), title ? h('span', { class: 'hero-title' }, `« ${title} »`) : null),
          h('div', { class: 'hero-class' },
            h('span', { class: 'hero-cls' }, cls.name),
            h('span', { class: `role-tag role-${cls.role}` }, ROLE_FR[cls.role] || cls.role),
            h('span', { class: 'hero-level' }, `niveau ${ch.level}`)),
          xpBar(ch)),
        h('label', { class: 'hero-view', title: "Dans un donjon de tranche, ton niveau et tes objets sont limités à la tranche : choisis ici ce que tu verrais." },
          h('span', { class: 'muted small' }, 'Stats vues en'),
          h('select', { id: 'sheet-view', class: 'input small', onChange: (e) => { state.view = e.target.value; api.refresh(); } },
            h('option', { value: 'basic', selected: state.view === 'basic' }, 'mode Basic'),
            availableTranches(content).map((t) => h('option', { value: t.id, selected: String(state.view) === String(t.id) }, `Tranche ${t.id} (niv. ${Math.min(ch.level, t.id)})`)))),
        h('div', { class: 'stat-strip' },
          STAT_ROWS.map(({ key, label, ic, tip }) => {
            const bonus = Math.round((stats[key] - bare[key]) * 10) / 10;
            return h('div', { class: 'sstat', title: `${label} : ${tip}${bonus ? ` (dont ${bonus > 0 ? '+' : ''}${fmt(bonus)} grâce à ton équipement)` : ''}` },
              h('div', { class: 'sstat-top' }, icon(ic, 14), h('span', null, label)),
              h('div', { class: 'sstat-val' }, fmt(stats[key]), bonus ? h('small', { class: bonus > 0 ? 'up' : 'down' }, `${bonus > 0 ? '+' : ''}${fmt(bonus)}`) : null));
          })));

      const free = skillPointsToSpend(content, ch);
      const tabs = h('div', { class: 'tabs', role: 'tablist' },
        [['equip', 'Équipement', 'armor'], ['skills', 'Compétences', 'star'], ['ach', `Succès ${doneCount(content, ch)}/${achievementsFor(content, ch).length}`, 'check'], ['info', 'Infos', 'book']].map(([id, label, ic]) =>
          h('button', { class: `tab ${state.tab === id ? 'on' : ''}`, role: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false', 'data-tab': id, onClick: () => { state.tab = id; api.refresh(); } },
            icon(ic, 16), label,
            id === 'skills' && free > 0 ? h('span', { class: 'tab-badge', title: 'Points de compétence à dépenser' }, free) : null)));

      let body;
      if (state.tab === 'equip') body = equipTab(ch, api, state, tranche, locked);
      else if (state.tab === 'skills') body = skillsTab(ch, api, state, tranche, locked);
      else if (state.tab === 'ach') body = achTab(ch);
      else body = infoTab(ch, locked);

      requestAnimationFrame(() => {
        const tb = api.body.querySelector('.tab-body');
        if (tb && scrollTop) tb.scrollTop = scrollTop;
        afterEquipRender(state.gear, api.body);
      });
      return [
        hero,
        locked ? h('div', { class: 'farm-alert tone-bad sheet-alert' }, 'Ce personnage est dans une partie en cours : reprends-la ou abandonne-la pour modifier son équipement et ses compétences.') : null,
        tabs,
        h('div', { class: 'tab-body' }, body)
      ];
    }
  });
}

// ============================================================
//  Onglet Équipement : la poupée (ce qu'on porte) et le sac par sections — voir src/ui/gear.js
// ============================================================

function equipTab(ch, api, state, tranche, locked) {
  const content = app.content;
  // Le personnage se présente à la page équipement comme un « porteur » : { equipment, bag, realLevel }.
  // Les changements (équiper, retirer) sont demandés à la passerelle : en jeu local elle les fait dans le navigateur,
  // en ligne c'est le serveur qui vérifie les règles, puis la fiche se redessine avec le résultat.
  const holder = { equipment: ch.equipment, bag: ch.inventory, realLevel: ch.level };
  // Les panoplies portées : combien de pièces, et quels bonus sont actifs (les autres sont grisés).
  const sets = activeSets({ content }, ch);
  const setsBlock = sets.length ? h('div', { class: 'set-list' }, sets.map((s) => h('div', { class: `set-row ${s.bonuses.length ? 'is-on' : ''}`, dataset: { set: s.dungeonId } },
    h('b', null, icon('ring', 14), s.name), h('span', { class: 'muted small' }, `${s.pieces} pièce${s.pieces > 1 ? 's' : ''} sur ${s.total}`),
    s.all.map((b) => h('span', { class: `set-bonus ${s.pieces >= b.pieces ? 'on' : ''}` }, `${b.pieces} : ${b.desc}`))))) : null;
  return h('div', null, setsBlock, equipmentView({
    content, holder, view: state.gear, tranche, rerender: () => api.refresh(),
    actions: {
      locked, lockedReason: 'Ce personnage est dans une partie en cours.',
      equip: async (inst, slot) => {
        const res = await characterAction({ type: 'CHAR_EQUIP', charId: ch.id, uid: inst.uid, slot: slot || undefined });
        if (res.ok) {
          play('click');
          api.refresh();
        }
      },
      unequip: async (slot) => {
        const res = await characterAction({ type: 'CHAR_UNEQUIP', charId: ch.id, slot });
        if (res.ok) api.refresh();
      }
    }
  }));
}

// ============================================================
//  Onglet Compétences : l'arbre
// ============================================================

/** 'known' (apprise), 'ready' (on peut l'apprendre maintenant) ou 'locked' (il manque quelque chose). */
function skillState(content, ch, sk) {
  if (sk.auto) return ch.spec === sk.spec && ch.level >= sk.level ? 'known' : 'locked'; // débloquée toute seule par la spécialisation
  if (ch.skills.includes(sk.id)) return 'known';
  if (sk.innate) return 'known';
  return skillRequirements(content, ch, sk.id).every((r) => r.ok) ? 'ready' : 'locked';
}

/** Un nœud de l'arbre : carré = compétence active (le coût en PA est dans le coin), rond = passive (toujours en effet). */
function skillNode(content, ch, sk, st, state, tranche, onPick, onHover) {
  const active = sk.type === 'active';
  const inactive = tranche && st === 'known' && !sk.innate && sk.level > tranche;
  const sub = st === 'known' ? (sk.innate ? 'De départ' : sk.auto ? 'Spécialisation' : 'Apprise') : sk.auto ? `Niv. ${sk.level} · spécialisation` : sk.cost === 0 ? `Niv. ${sk.level} · choix` : `Niv. ${sk.level} · ${sk.cost} pt${sk.cost > 1 ? 's' : ''}`;
  const mark = { known: ['ok', 'check'], ready: ['plus', 'plus'], locked: ['lock', 'lock'] }[st];
  return h('button', {
    type: 'button', dataset: { skill: sk.id, state: st },
    class: `node ${active ? 'is-active' : 'is-passive'} kind-${skillKind(sk)} is-${st} ${state.sel === sk.id ? 'is-selected' : ''} ${inactive ? 'is-inactive' : ''} ${ch.deck?.includes(sk.id) ? 'is-deck' : ''}`,
    'aria-label': `${sk.name} — ${active ? `active, ${sk.pa} PA` : 'passive'} — ${sub}`,
    onClick: onPick, onMouseenter: onHover, onFocus: onHover
  },
    h('span', { class: 'node-glow' },
      h('span', { class: 'node-frame' },
        h('span', { class: 'node-face' }, icon(skillIconName(content, sk), 'fluid')),
        active ? h('span', { class: 'node-pa', title: "Points d'action" }, sk.pa) : null)),
    h('span', { class: `node-mark ${mark[0]}` }, icon(mark[1], 11)),
    h('span', { class: 'node-name' }, sk.name),
    h('span', { class: 'node-sub' }, sub));
}

/** La conditions d'apprentissage en liste : ✓ remplie, ✗ manquante. */
function requirementList(content, ch, sk) {
  const reqs = skillRequirements(content, ch, sk.id);
  return h('ul', { class: 'req-list' }, reqs.map((r) => h('li', { class: r.ok ? 'ok' : 'ko' },
    icon(r.ok ? 'check' : 'close', 12),
    h('span', null, r.text, r.kind === 'points' && !r.ok ? ` (tu en as ${r.have})` : ''))));
}

/** Le panneau de droite : tout ce qu'il faut savoir sur la compétence choisie, et le bouton pour l'apprendre. */
function skillDetail(content, ch, sk, api, tranche, locked) {
  const st = skillState(content, ch, sk);
  const active = sk.type === 'active';
  const dice = active ? rawDice(content, sk) : null;
  const range = { melee: 'Corps à corps', ranged: 'À distance' }[sk.range];
  const tags = [
    h('span', { class: `tag ${active ? 'tag-active' : 'tag-passive'}` }, active ? 'Active' : 'Passive'),
    active ? h('span', { class: 'tag tag-pa' }, icon('flame', 11), `${sk.pa} PA`) : h('span', { class: 'tag' }, 'Toujours en effet'),
    range ? h('span', { class: 'tag' }, range) : null,
    sk.cooldown ? h('span', { class: 'tag' }, `Récup. ${sk.cooldown} tours`) : null,
    sk.oncePerDungeon ? h('span', { class: 'tag' }, '1× par donjon') : null,
    sk.perCombat ? h('span', { class: 'tag' }, `${sk.perCombat}× par combat`) : null,
    sk.freeFirst ? h('span', { class: 'tag' }, '1re utilisation du combat gratuite') : null,
    sk.spend ? h('span', { class: 'tag' }, `Coûte ${sk.spend.amount} ${sk.spend.id}`) : null
  ];
  const inactive = tranche && st === 'known' && !sk.innate && sk.level > tranche;
  const check = st === 'locked' ? skillRequirements(content, ch, sk.id).find((r) => !r.ok) : null;
  const fumbleTxt = dice && (dice.fumble > 0
    ? `Échec critique si le D20 fait ${dice.fumble} ou moins ${dice.onFumble === 'endTurn' ? '(tu perds le reste de ton tour)' : '(la compétence rate)'}.`
    : "Jamais d'échec critique.");
  const critTxt = dice && (dice.crit <= 20 ? `Critique dès ${dice.crit} sur le D20 (dégâts ×${content.rules.dice.critMult}).` : 'Pas de critique.');

  const mateOf = choiceMate(content, ch, content.skills[sk.id]); // le choix déjà fait dans ce groupe « un seul parmi N » (le nouveau le remplacera)
  const learnBtn = h('button', {
    type: 'button', class: 'btn btn-primary btn-wide-center', disabled: locked || st !== 'ready',
    title: st === 'ready' ? '' : check?.text || '',
    onClick: async () => {
      const res = await characterAction({ type: 'CHAR_LEARN', charId: ch.id, skillId: sk.id });
      if (res.ok) {
        play('click');
        api.refresh();
      }
    }
  }, icon('flame', 16), st === 'ready'
    ? (sk.cost > 0 ? `Apprendre · ${sk.cost} point${sk.cost > 1 ? 's' : ''}` : mateOf ? `Choisir · remplace « ${content.skills[mateOf].name} »` : 'Choisir')
    : 'Conditions non remplies');

  // Sort équipable : bouton Équiper / Retirer. (Les passives et les sorts de départ n'ont pas à être équipés.)
  const size = deckSize(content);
  const inDeck = !!ch.deck?.includes(sk.id);
  const full = (ch.deck?.length || 0) >= size;
  const deckBtn = st === 'known' && deckEligible(content, ch, sk.id)
    ? h('button', {
        type: 'button', class: 'btn btn-small btn-wide-center', dataset: { deckToggle: sk.id }, disabled: locked || (!inDeck && full),
        title: inDeck ? 'Ce sort ne sera plus utilisable en donjon' : full ? `Le deck est plein (${size} sorts) : retire-en un d'abord` : 'Ce sort sera utilisable en donjon',
        onClick: async () => {
          const deck = inDeck ? ch.deck.filter((id) => id !== sk.id) : [...ch.deck, sk.id];
          const res = await characterAction({ type: 'CHAR_SET_DECK', charId: ch.id, deck });
          if (res.ok) {
            play('click');
            api.refresh();
          }
        }
      }, inDeck ? 'Retirer du deck' : full ? `Deck plein (${size} / ${size})` : 'Équiper dans le deck')
    : null;
  const evolutions = (content.replacedBy[sk.id] || []).map((vid) => content.skills[vid]);

  return h('div', { class: `sd2 kind-${skillKind(sk)}` },
    h('div', { class: 'sd2-scroll' },
      h('div', { class: 'sd2-head' },
        h('div', { class: `sd2-icon ${active ? 'is-active' : 'is-passive'}` }, icon(skillIconName(content, sk), 'fluid')),
        h('div', { class: 'sd2-id' },
          h('h3', { class: 'sd2-name' }, sk.name),
          h('div', { class: 'sd2-where' }, sk.id === content.classes[ch.classId].classSkill ? 'Sort de classe · son propre emplacement, hors deck' : sk.innate ? 'Compétence de départ' : sk.auto ? `Spécialisation « ${content.classes[ch.classId].specs[sk.spec].name} » · automatique` : `${sk.branch} · palier ${sk.tier}`))),
      h('div', { class: 'sd2-tags' }, tags),
      h('p', { class: 'sd2-desc' }, sk.desc),
      active ? h('p', { class: 'sd2-blurb' }, skillBlurb(sk, app.content)) : null,
      sk.spec ? h('p', { class: 'sd2-spec' }, icon('star', 12), ` Spécialisation « ${content.classes[ch.classId].specs[sk.spec].name} »${sk.choiceGroup ? ' · un seul choix dans ce groupe' : ''}`) : null,
      ...evolutions.map((v) => h('p', { class: 'sd2-evo' }, icon('up', 12), ` Évolue en « ${v.name} » avec la spécialisation « ${content.classes[ch.classId].specs[v.spec].name} » : ${v.desc}`)),
      dice
        ? h('div', { class: 'sd2-dice' },
            h('div', { class: 'sd2-label' }, 'Le dé de cette compétence'),
            diceStrip(dice),
            h('ul', { class: 'dice-legend' }, h('li', { class: 'f' }, fumbleTxt), h('li', { class: 'c' }, critTxt)))
        : null,
      inactive ? h('div', { class: 'item-warn' }, `Inactive en tranche ${tranche} (niveau ${sk.level} requis).`) : null,
      st === 'known' ? null : h('div', { class: 'sd2-learn' }, h('div', { class: 'sd2-label' }, "Pour l'apprendre"), requirementList(content, ch, sk))),
    h('div', { class: 'sd2-foot' },
      st === 'known'
        ? [h('div', { class: 'sd2-known' }, icon('check', 16), sk.innate ? 'Connue dès le départ' : sk.auto ? 'Débloquée par la spécialisation' : 'Apprise'), deckBtn]
        : learnBtn));
}

// ------------------------------------------------------------
//  Les sections de l'onglet : 1 Spécialisation · 2 Talents · 3 Barre de combat · 4 Arbre (classes à points)
// ------------------------------------------------------------

/** Le résumé d'une compétence en quelques mots : « Active · 3 PA · relance 2 » ou « Passive · toujours active ». */
function miniTags(sk) {
  if (sk.type !== 'active') return 'Passive · toujours active';
  const parts = [`Active · ${sk.pa} PA`];
  if (sk.cooldown) parts.push(`relance ${sk.cooldown}`);
  if (sk.perCombat) parts.push(`${sk.perCombat}× par combat`);
  return parts.join(' · ');
}

/** La version « évoluée » d'une compétence de base pour ce personnage (ex. Punition → Punition protectrice), sinon son identifiant. */
function evolvedOf(content, ch, id) {
  return (content.replacedBy[id] || []).find((v) => content.skills[v].spec === ch.spec && ch.level >= content.skills[v].level) || id;
}

/**
 * Les paliers d'une spécialisation, du plus bas au plus haut. Chaque palier : { level, autos (automatiques ou évoluées), groups (les « un seul parmi N »),
 * learn (à apprendre), upcoming (les aperçus « à venir ») }.
 */
function tiersOfSpec(content, classId, specId) {
  const cls = content.classes[classId];
  const byLevel = new Map();
  const tier = (level) => {
    if (!byLevel.has(level)) byLevel.set(level, { level, autos: [], groups: new Map(), learn: [], upcoming: [] });
    return byLevel.get(level);
  };
  for (const sk of cls.skills) {
    if (sk.spec !== specId) continue;
    const t = tier(sk.level);
    if (sk.auto || sk.replaces) t.autos.push(sk);
    else if (sk.choiceGroup) {
      if (!t.groups.has(sk.choiceGroup)) t.groups.set(sk.choiceGroup, []);
      t.groups.get(sk.choiceGroup).push(sk);
    } else t.learn.push(sk);
  }
  for (const u of cls.specs[specId].upcoming || []) tier(u.level).upcoming.push(u);
  return [...byLevel.values()].sort((a, b) => a.level - b.level).map((t) => ({ ...t, groups: [...t.groups.values()] }));
}

/** L'en-tête d'une section : un numéro, un titre, une phrase qui explique, et éventuellement un bouton. */
const secHead = (num, title, hint, extra = null) =>
  h('header', { class: 'sec-head' }, h('span', { class: 'sec-num' }, num), h('h3', null, title), hint ? h('p', { class: 'sec-hint' }, hint) : null, extra);

/** 1 — Choisir sa spécialisation : trois grandes cartes qui montrent CE QU'ELLES DONNENT, niveau par niveau. */
function specSection(content, ch, num, act, locked) {
  const open = ch.level >= specLevel(content);
  const cards = specsOf(content, ch.classId).map((sp) => {
    const on = ch.spec === sp.id;
    const gives = [];
    for (const t of tiersOfSpec(content, ch.classId, sp.id)) {
      if (t.autos.length || t.learn.length) {
        gives.push(h('li', { class: 'spec-give', dataset: { level: String(t.level) } }, h('span', { class: 'lvl' }, `Niv. ${t.level}`),
          h('span', { class: 'what' }, [...t.autos, ...t.learn].map((s) => h('span', { class: `give-chip kind-${skillKind(s)}`, title: s.desc }, icon(skillIconName(content, s), 12), s.name)))));
      }
      for (const g of t.groups) {
        gives.push(h('li', { class: 'spec-give is-choice', dataset: { level: String(t.level) } }, h('span', { class: 'lvl' }, `Niv. ${t.level}`),
          h('span', { class: 'what' }, h('b', null, `1 talent à choisir parmi ${g.length}`), h('span', { class: 'muted small' }, ` : ${g.map((s) => s.name).join(', ')}`))));
      }
      for (const u of t.upcoming) {
        gives.push(h('li', { class: 'spec-give is-upcoming', dataset: { level: String(u.level) } }, h('span', { class: 'lvl' }, `Niv. ${u.level}`),
          h('span', { class: 'what' }, u.level >= 20 ? `Ultime : ${u.name} (à venir)` : `${u.name}`)));
      }
    }
    return h('button', {
      type: 'button', class: `spec-card ${on ? 'is-selected' : ''}`, dataset: { specId: sp.id }, 'aria-pressed': String(on), disabled: locked || !open,
      title: !open ? `Niveau ${specLevel(content)} requis` : on ? 'Cliquer pour retirer la spécialisation' : 'Choisir cette spécialisation',
      onClick: () => act({ type: 'CHAR_SET_SPEC', charId: ch.id, spec: on ? null : sp.id })
    },
      h('div', { class: 'spec-top' }, sp.tag ? h('span', { class: 'spec-tag' }, sp.tag) : h('span'), on ? h('span', { class: 'spec-chosen' }, icon('check', 13), 'Choisie') : null),
      h('h4', { class: 'spec-name' }, sp.name),
      h('p', { class: 'spec-desc' }, sp.desc || ''),
      h('ul', { class: 'spec-gives', 'aria-label': 'Ce que cette spécialisation donne' }, gives),
      h('span', { class: 'spec-cta' }, !open ? `Niveau ${specLevel(content)} requis` : on ? 'Spécialisation choisie · cliquer pour la retirer' : 'Choisir cette spécialisation'));
  });
  return h('section', { class: 'sk-sec sec-spec', dataset: { sec: 'spec' } },
    secHead(num, 'Choisis ta spécialisation', open ? 'Gratuite, et tu peux en changer entre deux parties : tes talents sont gardés si tu reviens.' : `Elle s'ouvre au niveau ${specLevel(content)}.`),
    h('div', { class: 'spec-cards' }, cards));
}

/** 2 — Les talents de la spécialisation choisie, palier par palier : ce qui est offert, ce qu'il faut choisir, ce qui arrive. */
function talentsSection(content, ch, num, act, locked, hasLearned) {
  const cls = content.classes[ch.classId];
  const open = ch.level >= specLevel(content);
  const resetBtn = hasLearned
    ? h('button', {
        type: 'button', class: 'btn btn-small', disabled: locked, title: 'Oublie tous tes choix de talents (gratuit)',
        onClick: async () => {
          if (await confirmBox({ title: 'Oublier tes choix de talents ?', text: 'Tous les talents que tu as choisis seront oubliés (gratuit). Tu pourras les rechoisir.', okLabel: 'Oublier' })) act({ type: 'CHAR_RESET_SKILLS', charId: ch.id });
        }
      }, icon('refresh', 14), 'Oublier mes choix')
    : null;
  if (!ch.spec) {
    return h('section', { class: 'sk-sec sec-talents', dataset: { sec: 'talents' } },
      secHead(num, 'Tes talents', null, resetBtn),
      h('p', { class: 'sec-empty' }, open
        ? 'Choisis une spécialisation ci-dessus : tu verras ici, niveau par niveau, tout ce qu\'elle te donne et les talents à choisir.'
        : `Les spécialisations s'ouvrent au niveau ${specLevel(content)}.`));
  }

  const card = (sk, kind) => {
    const st = skillState(content, ch, sk);
    const reached = ch.level >= sk.level;
    const chosen = kind === 'choice' && ch.skills.includes(sk.id);
    const known = kind === 'auto' || kind === 'evolution' ? reached : st === 'known';
    const canPick = (kind === 'choice' || kind === 'learn') && st === 'ready' && !chosen && !locked;
    const mate = kind === 'choice' ? choiceMate(content, ch, content.skills[sk.id]) : null;
    const base = sk.replaces ? content.skills[sk.replaces] : null;
    const state = chosen ? 'chosen' : known ? 'known' : reached ? (st === 'ready' ? 'ready' : 'locked') : 'locked';
    const foot = kind === 'choice'
      ? (chosen ? [icon('check', 14), 'Choisi'] : !reached ? [icon('lock', 14), `Niveau ${sk.level} requis`] : [icon('plus', 14), mate ? `Choisir · remplace « ${content.skills[mate].name} »` : 'Choisir'])
      : kind === 'learn'
        ? (known ? [icon('check', 14), 'Appris'] : [icon('plus', 14), `Apprendre · ${sk.cost} point${sk.cost > 1 ? 's' : ''}`])
        : (known ? [icon('check', 14), 'Débloqué'] : [icon('lock', 14), `Niveau ${sk.level} requis`]);
    return h(canPick ? 'button' : 'div', {
      ...(canPick ? { type: 'button', onClick: () => act({ type: 'CHAR_LEARN', charId: ch.id, skillId: sk.id }) } : {}),
      class: `talent-card kind-${skillKind(sk)} is-${kind} is-${state} ${canPick ? 'can-pick' : ''}`, dataset: { skill: sk.id, kind, state }
    },
      h('div', { class: 'tc-head' },
        h('span', { class: `tc-icon ${sk.type === 'active' ? 'is-active' : 'is-passive'}` }, icon(skillIconName(content, sk), 'fluid')),
        h('div', { class: 'tc-id' }, h('b', { class: 'tc-name' }, sk.name), h('span', { class: 'tc-tags' }, miniTags(sk)))),
      h('p', { class: 'tc-desc' }, sk.desc),
      base ? h('p', { class: 'tc-evo' }, icon('up', 12), ` Évolution : prend la place de « ${base.name} » dans ta barre`) : null,
      h('span', { class: 'tc-foot' }, ...foot));
  };

  const blocks = tiersOfSpec(content, ch.classId, ch.spec).map((t) => {
    const reached = ch.level >= t.level;
    const todo = t.groups.filter((g) => !g.some((s) => ch.skills.includes(s.id))).length;
    const onlyUpcoming = !t.autos.length && !t.groups.length && !t.learn.length;
    const status = onlyUpcoming ? 'À venir' : !reached ? `Niveau ${t.level} requis` : todo ? `${todo} choix à faire` : t.groups.length ? 'Choix fait' : 'Automatique';
    const parts = [];
    if (t.autos.length) {
      parts.push(h('div', { class: 'tier-set' },
        h('div', { class: 'tier-label' }, reached ? 'Débloqués automatiquement' : `Se débloquent au niveau ${t.level}`),
        h('div', { class: 'talent-grid' }, t.autos.map((s) => card(s, s.replaces ? 'evolution' : 'auto')))));
    }
    for (const g of t.groups) {
      parts.push(h('div', { class: 'tier-set is-choice', dataset: { group: g[0].choiceGroup } },
        h('div', { class: 'tier-label' }, h('b', null, `Choisis 1 talent parmi ${g.length}`), h('span', { class: 'muted small' }, ' · gratuit, tu peux en changer quand tu veux')),
        h('div', { class: 'talent-grid' }, g.map((s) => card(s, 'choice')))));
    }
    if (t.learn.length) parts.push(h('div', { class: 'tier-set' }, h('div', { class: 'tier-label' }, 'À apprendre'), h('div', { class: 'talent-grid' }, t.learn.map((s) => card(s, 'learn')))));
    for (const u of t.upcoming) {
      parts.push(h('div', { class: 'tier-set is-upcoming', dataset: { upcomingLevel: String(u.level) }, title: `Niveau ${u.level} : ${u.name}${u.desc ? ` — ${u.desc}` : ''} (à venir)` },
        h('div', { class: 'talent-card is-upcoming' },
          h('div', { class: 'tc-head' },
            h('span', { class: 'tc-icon' }, icon('lock', 'fluid')),
            h('div', { class: 'tc-id' }, h('b', { class: 'tc-name' }, u.level >= 20 ? `Ultime : ${u.name}` : u.name), h('span', { class: 'tc-tags' }, `Niveau ${u.level} · à venir`))),
          u.desc ? h('p', { class: 'tc-desc' }, u.desc) : null)));
    }
    return h('div', { class: `tier-block ${!reached ? 'is-locked' : ''} ${onlyUpcoming ? 'is-upcoming' : ''} ${todo && reached ? 'needs-choice' : ''}`, dataset: { level: String(t.level) } },
      h('header', { class: 'tier-head' }, h('span', { class: 'tier-lvl' }, `Niveau ${t.level}`), h('span', { class: 'tier-status' }, status)),
      parts);
  });
  return h('section', { class: 'sk-sec sec-talents', dataset: { sec: 'talents' } },
    secHead(num, `Tes talents · ${cls.specs[ch.spec].name}`, 'Ce que ta spécialisation te donne, palier après palier. Les talents « à choisir » sont gratuits et modifiables.', resetBtn),
    h('div', { class: 'tier-blocks' }, blocks));
}

/** 3 — La barre de combat : les emplacements (corps à corps, sort de classe, deck), les sorts qu'on peut y mettre, et les passifs toujours actifs. */
function deckSection(content, ch, num, act, locked, state, api) {
  const cls = content.classes[ch.classId];
  const size = deckSize(content);
  const deck = ch.deck || [];
  const swap = state.swap && !deck.includes(state.swap) ? state.swap : null; // un sort qui attend la place d'un autre
  const swapSk = swap ? content.skills[evolvedOf(content, ch, swap)] : null;
  const shown = (id) => content.skills[evolvedOf(content, ch, id)];

  const fixed = (title, skillId, hint) => {
    const sk = skillId ? shown(skillId) : null;
    return h('div', { class: 'fixed-slot', dataset: { fixed: title } },
      h('span', { class: 'fixed-title' }, title),
      sk ? h('div', { class: 'deck-slot is-fixed', title: hint }, icon(skillIconName(content, sk), 18), h('span', { class: 'deck-name' }, sk.name), h('span', { class: 'deck-pa' }, `${sk.pa} PA`))
         : h('div', { class: 'deck-slot is-empty' }, 'Aucun'));
  };
  const slots = Array.from({ length: size }, (_, i) => deck[i] || null).map((id) => {
    if (!id) return h('div', { class: 'deck-slot is-empty' }, 'Emplacement libre');
    const sk = shown(id);
    return h('button', {
      type: 'button', class: `deck-slot is-filled ${swap ? 'is-swap-target' : ''}`, dataset: { deckSkill: id }, disabled: locked,
      title: swap ? `Remplacer « ${sk.name} » par « ${swapSk.name} »` : 'Retirer de la barre',
      onClick: () => act({ type: 'CHAR_SET_DECK', charId: ch.id, deck: swap ? deck.map((d) => (d === id ? swap : d)) : deck.filter((d) => d !== id) })
    }, icon(skillIconName(content, sk), 18), h('span', { class: 'deck-name' }, sk.name), h('span', { class: 'deck-pa' }, `${sk.pa} PA`));
  });

  const toggle = (id) => {
    if (deck.includes(id)) return act({ type: 'CHAR_SET_DECK', charId: ch.id, deck: deck.filter((d) => d !== id) });
    if (deck.length < size) return act({ type: 'CHAR_SET_DECK', charId: ch.id, deck: [...deck, id] });
    state.swap = state.swap === id ? null : id; // barre pleine : on choisit d'abord quel sort remplacer
    return api.refresh();
  };
  const available = knownSkills(content, ch).filter((id) => deckEligible(content, ch, id));
  const spells = available.map((id) => {
    const sk = shown(id);
    const equipped = deck.includes(id);
    const tooEarly = ch.level < content.skills[id].level;
    return h('button', {
      type: 'button', class: `spell-card kind-${skillKind(sk)} ${equipped ? 'is-equipped' : ''} ${tooEarly ? 'is-locked' : ''} ${swap === id ? 'is-pending' : ''}`,
      dataset: { skill: id, deckToggle: id, equipped: String(equipped) }, disabled: locked || (tooEarly && !equipped), title: sk.desc, onClick: () => toggle(id)
    },
      h('div', { class: 'sc-head' },
        h('span', { class: 'tc-icon is-active' }, icon(skillIconName(content, sk), 'fluid')),
        h('b', { class: 'sc-name' }, sk.name),
        h('span', { class: 'sc-pa', title: "Points d'action" }, `${sk.pa} PA`)),
      h('p', { class: 'sc-desc' }, sk.desc),
      h('span', { class: 'sc-state' }, equipped ? [icon('check', 13), 'Dans ta barre · retirer'] : tooEarly ? [icon('lock', 13), `Niveau ${content.skills[id].level} requis`] : swap === id ? 'Clique sur le sort à remplacer…' : deck.length >= size ? 'Barre pleine · remplacer un sort…' : [icon('plus', 13), 'Équiper']));
  });

  const passives = knownSkills(content, ch).map((id) => content.skills[id]).filter((sk) => sk.type === 'passive' && ch.level >= sk.level && (!sk.spec || sk.spec === ch.spec));

  return h('section', { class: 'sk-sec sec-deck', dataset: { sec: 'deck' } },
    secHead(num, 'Ta barre de combat', `En donjon, tu disposes d'un corps à corps basique et d'un sort de classe (toujours là), plus ${size} sorts à ton choix.`),
    h('div', { class: 'deck-layout' },
      fixed('Corps à corps', content.basicSkillId, 'Le même pour toutes les classes'),
      fixed('Sort de classe', cls.classSkill, 'Propre à la classe, hors barre'),
      h('div', { class: 'deck-frame', dataset: { frame: 'deck' } },
        h('span', { class: 'fixed-title' }, `Tes ${size} sorts · ${deck.length} / ${size}`),
        swap ? h('p', { class: 'swap-banner', role: 'status' }, icon('swap', 14), ` Ta barre est pleine : clique sur le sort à remplacer par « ${swapSk.name} » (ou reclique sur ce sort pour annuler).`) : null,
        h('div', { class: 'deck-slots' }, slots))),
    h('div', { class: 'sub-label' }, h('b', null, 'Sorts disponibles'), h('span', { class: 'muted small' }, ' · clique sur un sort pour l\'équiper ou le retirer')),
    h('div', { class: 'spell-grid' }, spells),
    passives.length
      ? h('div', { class: 'passive-box' },
          h('div', { class: 'sub-label' }, h('b', null, 'Passifs toujours actifs'), h('span', { class: 'muted small' }, ' · ils n\'occupent aucune place')),
          h('ul', { class: 'passive-list' }, passives.map((sk) => h('li', { class: `passive-item kind-${skillKind(sk)}`, dataset: { skill: sk.id } },
            h('span', { class: 'tc-icon is-passive' }, icon(skillIconName(content, sk), 'fluid')),
            h('div', null, h('b', null, sk.name), h('p', null, sk.desc))))))
      : null);
}

/** 4 — L'arbre de compétences, pour les classes qui ont des compétences à acheter avec des points (rangées par branche + panneau de détail). */
function treeSection(content, ch, num, api, state, tranche, locked) {
  const cls = content.classes[ch.classId];
  const free = skillPointsToSpend(content, ch);
  const spent = skillPointsSpent(content, ch);
  const hasLearned = ch.skills.some((id) => !content.skills[id]?.innate);
  const byId = Object.fromEntries(cls.skills.map((s) => [s.id, s]));
  const innate = cls.skills.filter((s) => s.innate);
  const branches = new Map();
  for (const sk of cls.skills) {
    if (sk.innate || sk.replaces || sk.spec) continue; // les talents de spécialisation ont leur propre section ; une version évoluée s'affiche avec sa base
    const name = sk.branch || 'Autres';
    if (!branches.has(name)) branches.set(name, []);
    branches.get(name).push(sk);
  }
  for (const list of branches.values()) list.sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.level - b.level);

  // La compétence montrée : celle qu'on a choisie, sinon la première qu'on peut apprendre, sinon la première de départ.
  if (!state.sel || !byId[state.sel] || byId[state.sel].spec) {
    const ready = cls.skills.find((s) => !s.innate && !s.replaces && !s.spec && skillState(content, ch, s) === 'ready');
    state.sel = (ready || byId[cls.basicAttack] || innate[0] || cls.skills[0]).id;
  }

  const narrow = isNarrow(); // téléphone : le détail s'ouvre juste sous la rangée choisie (au lieu d'un panneau à droite)
  const panel = h('aside', { class: 'sk-panel', 'aria-live': 'polite' });
  // (on ne redessine pas le panneau s'il montre déjà la bonne compétence : sinon un clic sur « Apprendre » pourrait se perdre)
  let shownId = null;
  const show = (id) => {
    if (shownId === id) return;
    shownId = id;
    mount(panel, skillDetail(content, ch, byId[id], api, tranche, locked));
  };
  show(state.sel);
  const pick = (id) => () => {
    state.sel = id;
    if (narrow) return api.refresh(); // le panneau change de place : on redessine
    for (const el of document.querySelectorAll('.sk-tree .node')) el.classList.toggle('is-selected', el.dataset.skill === id);
    show(id);
  };
  const hover = (id) => () => { if (!narrow) show(id); };
  const leave = () => { if (!narrow) show(state.sel); };
  const node = (sk) => {
    const el = skillNode(content, ch, sk, skillState(content, ch, sk), state, tranche, pick(sk.id), hover(sk.id));
    el.addEventListener('mouseleave', leave);
    return el;
  };

  /** Une rangée : la branche (nom, phrase, avancement) puis ses paliers reliés entre eux. */
  const branchRow = (name, list) => {
    const info = cls.branches?.[name];
    const known = list.filter((s) => ch.skills.includes(s.id)).length;
    const tiers = [...new Set(list.map((s) => s.tier || 1))].sort((a, b) => a - b);
    const cols = [];
    tiers.forEach((t, i) => {
      const here = list.filter((s) => (s.tier || 1) === t);
      if (i > 0) {
        const lit = here.some((s) => ch.skills.includes(s.id));
        const near = here.some((s) => skillState(content, ch, s) === 'ready');
        cols.push(h('span', { class: `link ${lit ? 'on' : near ? 'near' : ''}`, 'aria-hidden': 'true' }));
      }
      cols.push(h('div', { class: `tier ${here.length > 1 ? 'fork' : ''}` }, here.map(node)));
    });
    return h('section', { class: 'branch-row' },
      h('header', { class: 'branch-head' },
        h('div', { class: 'branch-title' }, h('h4', null, name), h('span', { class: 'branch-count', title: 'Compétences apprises dans cette branche' }, `${known} / ${list.length}`)),
        info?.desc ? h('p', { class: 'branch-desc' }, info.desc) : null),
      h('div', { class: 'branch-nodes' }, cols));
  };

  const head = h('div', { class: 'sk-head' },
    h('div', { class: `sk-points ${free > 0 ? 'has' : ''}`, title: '1 point par niveau. Une compétence de palier 1 coûte 1 point, de palier 2 : 2 points, de palier 3 : 3 points.' },
      h('span', { class: 'sk-points-num' }, free),
      h('span', { class: 'sk-points-text' }, h('b', null, `point${free > 1 ? 's' : ''} de compétence`), h('small', null, `à dépenser · ${spent} déjà dépensé${spent > 1 ? 's' : ''} sur ${ch.level}`))),
    h('div', { class: 'sk-legend', 'aria-label': 'Légende' },
      h('span', null, h('i', { class: 'lg lg-active' }), 'Active (coût en PA)'),
      h('span', null, h('i', { class: 'lg lg-passive' }), 'Passive (toujours en effet)'),
      h('span', { class: 'lgd ok' }, icon('check', 11), 'Apprise'),
      h('span', { class: 'lgd plus' }, icon('plus', 11), 'Apprenable'),
      h('span', { class: 'lgd lock' }, icon('lock', 11), 'Verrouillée')),
    h('button', {
      class: 'btn btn-small', disabled: locked || !hasLearned, title: hasLearned ? 'Oublie tout ce que tu as appris et rend tes points (gratuit)' : 'Aucune compétence à oublier',
      onClick: async () => {
        if (await confirmBox({ title: 'Réinitialiser les compétences ?', text: 'Tout ce que tu as appris sera oublié et tes points rendus (gratuit).', okLabel: 'Réinitialiser' })) {
          const res = await characterAction({ type: 'CHAR_RESET_SKILLS', charId: ch.id });
          if (res.ok) api.refresh();
        }
      }
    }, icon('refresh', 14), 'Réinitialiser'));

  const rows = [
    { ids: innate.map((s) => s.id), el: h('section', { class: 'branch-row is-innate' },
      h('header', { class: 'branch-head' },
        h('div', { class: 'branch-title' }, h('h4', null, 'De départ')),
        h('p', { class: 'branch-desc' }, 'Toujours connues, gratuites. Ce sont ta base en combat.')),
      h('div', { class: 'branch-nodes' }, h('div', { class: 'tier row' }, innate.map(node)))) },
    ...[...branches.entries()].map(([name, list]) => ({ ids: list.map((s) => s.id), el: branchRow(name, list) }))
  ];
  const flow = [];
  for (const row of rows) {
    flow.push(row.el);
    if (narrow && row.ids.includes(state.sel)) flow.push(panel);
  }
  return h('section', { class: 'sk-sec sec-tree', dataset: { sec: 'tree' } },
    secHead(num, 'Arbre de compétences', 'Dépense tes points de compétence : une voie par branche, un palier après l\'autre.'),
    h('div', { class: 'sk-layout' }, h('div', { class: 'sk-tree' }, head, flow), narrow ? null : panel));
}

function skillsTab(ch, api, state, tranche, locked) {
  const content = app.content;
  const cls = content.classes[ch.classId];
  const hasSpecs = specsOf(content, ch.classId).length > 0;
  // Y a-t-il quelque chose à acheter avec des points ? (sinon pas d'arbre, pas de compteur : tout est de départ, automatique ou à choisir)
  const buyable = cls.skills.some((s) => !s.innate && !s.auto && !s.replaces && !s.spec && (s.cost > 0 || !s.choiceGroup));
  const hasLearned = ch.skills.some((id) => !content.skills[id]?.innate && content.skills[id]?.spec); // un talent de spécialisation choisi ?
  const act = async (action) => {
    state.swap = null;
    const res = await characterAction(action);
    if (res.ok) {
      play('click');
      api.refresh();
    }
    return res;
  };
  let n = 0;
  const sections = [];
  if (hasSpecs) {
    sections.push(specSection(content, ch, ++n, act, locked));
    sections.push(talentsSection(content, ch, ++n, act, locked, hasLearned && !buyable));
  }
  sections.push(deckSection(content, ch, ++n, act, locked, state, api));
  if (buyable) sections.push(treeSection(content, ch, ++n, api, state, tranche, locked));

  return h('div', { class: 'sk-page' },
    sections,
    h('details', { class: 'sk-help' },
      h('summary', null, 'Comment ça marche ?'),
      h('ul', null,
        hasSpecs ? h('li', null, `La spécialisation (à partir du niveau ${specLevel(content)}) est gratuite et change ton style de jeu : elle te donne des talents automatiquement, puis des choix « un seul parmi trois » aux paliers suivants. Tu peux en changer entre deux parties.`) : null,
        h('li', null, `En donjon, tu ne peux utiliser que ${deckSize(content)} sorts actifs équipés dans ta barre, plus ton corps à corps basique et ton sort de classe. Les passifs sont toujours actifs et n'occupent aucune place.`),
        buyable ? h('li', null, "Tu gagnes 1 point par niveau : les paliers coûtent 1, 2 puis 3 points. Investir dans une direction coûte dans l'autre. Se tromper ne coûte rien : « Réinitialiser » rend tous les points.") : null,
        h('li', null, 'Les compétences de niveau supérieur à la tranche du donjon sont inactives en modes Tranche et Stasis.'))));
}

// ============================================================
//  Onglet Succès
// ============================================================

/** Les succès du personnage : ce qu'il a accompli, et ce qu'il lui reste à faire (avec sa progression). */
function achTab(ch) {
  const content = app.content;
  const list = achievementsFor(content, ch);
  const titles = titlesOf(content, ch);
  const done = list.filter((a) => ch.achievements?.[a.id]);
  const sorted = [...list].sort((a, b) => Number(!!ch.achievements?.[b.id]) - Number(!!ch.achievements?.[a.id]));
  return [
    h('p', { class: 'muted small' }, "Les succès sont propres à CE personnage. Ils débloquent des compétences, des fonctions du jeu ou des titres."),
    titles.length ? h('p', null, h('b', null, 'Titres : '), titles.map((t) => `« ${t} »`).join(', ')) : null,
    h('div', { class: 'ach-list' }, sorted.map((a) => {
      const unlocked = !!ch.achievements?.[a.id];
      const prog = achievementProgress(content, ch, a);
      return h('div', { class: `ach-card ${unlocked ? 'unlocked' : ''}`, dataset: { ach: a.id } },
        h('div', { class: 'ach-icon' }, icon(unlocked ? a.icon || 'star' : 'lock', 26)),
        h('div', { class: 'ach-body' },
          h('div', { class: 'ach-head' }, h('b', null, a.name), unlocked ? h('span', { class: 'known-tag' }, icon('check', 14), 'Débloqué') : null),
          h('div', { class: 'small' }, a.desc),
          unlocked ? null : progressBar(prog.raw, prog.target),
          h('div', { class: 'small ach-rewards' }, icon('gift', 12), ' ', rewardTexts(content, a).join(' · '))));
    })),
    h('p', { class: 'muted small' }, `${done.length} / ${list.length} débloqués.`)
  ];
}

// ============================================================
//  Onglet Infos
// ============================================================

function infoTab(ch, locked = false) {
  const content = app.content;
  const chest = chestInfo(content, ch);
  return [
    h('div', { class: 'info-grid' },
      h('div', null, h('span', { class: 'muted' }, 'Parties jouées'), h('b', null, ch.stats.runs)),
      h('div', null, h('span', { class: 'muted' }, 'Victoires'), h('b', null, ch.stats.wins)),
      h('div', null, h('span', { class: 'muted' }, 'Runs avec une mort'), h('b', null, ch.stats.deaths)),
      h('div', null, h('span', { class: 'muted' }, 'Sessions de farm'), h('b', null, ch.stats.farmRuns)),
      h('div', null, h('span', { class: 'muted' }, 'Vagues vaincues'), h('b', null, ch.stats.farmWaves)),
      h('div', null, h('span', { class: 'muted' }, 'Record de vagues'), h('b', null, ch.stats.farmBest))),
    h('p', { class: 'muted small' }, `Coffre : ${chest.count} / ${chest.capacity} objets. Niveau d'équipement : ${gearLevel(content, ch)}.`),
    h('div', { class: 'row gap wrap' },
      app.gateway.canExport ? h('button', {
        class: 'btn',
        onClick: async () => {
          try { await navigator.clipboard.writeText(exportCode(app.profile, [ch.id])); toast('Code de ce personnage copié !', 'good'); } catch { toast('Copie impossible : utilise le bouton Sauvegarde.', 'bad'); }
        }
      }, icon('save', 16), 'Copier le code de ce personnage') : null,
      h('button', {
        class: 'btn btn-danger', disabled: locked,
        onClick: async () => {
          const warning = app.gateway.canExport ? " (Exporte-le d'abord si tu veux le garder.)" : '';
          if (await confirmBox({ title: `Supprimer ${ch.name} ?`, text: `Ce personnage, son équipement et son coffre seront définitivement perdus.${warning}`, okLabel: 'Supprimer', danger: true })) {
            const res = await characterAction({ type: 'CHAR_DELETE', charId: ch.id });
            if (res.ok) {
              closeModal();
              redraw();
            }
          }
        }
      }, icon('trash', 16), 'Supprimer le personnage'))
  ];
}
