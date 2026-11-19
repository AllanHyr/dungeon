// ============================================================
//  gear.js — La page « équipement » : la poupée d'emplacements et le sac rangé par sections
// ============================================================
// Partagée par la fiche du personnage (hors partie) et par le sac d'une partie en cours.
// Ce fichier ne contient AUCUNE règle : il demande au moteur (planEquip, canEquip...) où irait un objet et ce que ça changerait,
// puis il affiche. Les actions (équiper, retirer...) sont fournies par l'écran qui l'utilise : la fiche modifie le personnage
// sauvegardé, le sac de partie envoie des actions au moteur.

import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { EQUIP_SLOTS } from '../core/content.js';
import { canEquip, slotsFor, planEquip, twoHandedWorn, rarityOf, itemSummary, gearLevel, itemView, salvageValue } from '../core/index.js';
import { statEntries, compareItems, typeLabel } from './format.js';

/** L'icône de chaque emplacement. */
export const SLOT_ICON = {
  head: 'head', neck: 'neck', shoulders: 'shoulders', back: 'back', chest: 'chest', hands: 'hands', belt: 'belt', legs: 'legs', feet: 'feet',
  ring1: 'ring', ring2: 'ring', mainHand: 'weapon', offHand: 'offhand', relic: 'relic'
};

/** Les rangées de la poupée : on voit d'un coup d'œil ce qui est porté et ce qui manque. */
const DOLL_ROWS = [
  { title: 'Armure', slots: ['head', 'shoulders', 'back', 'chest'] },
  { slots: ['hands', 'belt', 'legs', 'feet'] },
  { title: 'Bijoux et relique', slots: ['neck', 'ring1', 'ring2', 'relic'] },
  { title: 'Armes', slots: ['mainHand', 'offHand'] }
];

/** Les sections du sac, dans l'ordre : un type d'objet par section. */
const SECTION_ORDER = ['weapon', 'offhand', 'head', 'shoulders', 'back', 'chest', 'hands', 'belt', 'legs', 'feet', 'neck', 'ring', 'relic', 'consumable'];

/** Les filtres du sac (groupes de types). */
const FILTERS = [
  ['all', 'Tout', null],
  ['weapons', 'Armes', ['weapon', 'offhand']],
  ['armor', 'Armures', ['head', 'shoulders', 'back', 'chest', 'hands', 'belt', 'legs', 'feet']],
  ['jewelry', 'Bijoux', ['neck', 'ring']],
  ['relic', 'Reliques', ['relic']],
  ['consumable', 'Potions', ['consumable']]
];

/** Les stats d'un objet en petites pastilles : « +1,5 Défense ». */
export function statPills(content, def) {
  return h('div', { class: 'pills' }, statEntries(content, def).map(({ label, value }) =>
    h('span', { class: `pill ${value < 0 ? 'down' : ''}` }, h('b', null, `${value > 0 ? '+' : ''}${value}`), ` ${label}`)));
}

// (un objet amélioré à la forge se montre avec ses statistiques améliorées)
const defOf = (content, inst) => itemView(content, inst);

/** Le nom d'un objet, avec son amélioration : « Heaume de fer +2 ». */
export const itemName = (def) => (def.plus ? `${def.name} +${def.plus}` : def.name);
const narrowScreen = () => !!window.matchMedia && window.matchMedia('(max-width: 760px)').matches;

/** À appeler juste après avoir affiché la page : sur téléphone, descend au sac quand on vient de choisir un emplacement. */
export function afterEquipRender(view, root) {
  if (!view.focusBag) return;
  view.focusBag = false;
  const bag = root.querySelector('.equip-bag');
  if (bag) bag.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/**
 * La page équipement.
 *  - content   : le contenu du jeu
 *  - holder    : { equipment, bag, realLevel } (un personnage sauvegardé ou un joueur de la partie)
 *  - view      : l'état de la page, à garder entre deux dessins : { sel: emplacement choisi | null, filter: 'all' | ... }
 *  - tranche   : tranche vue (les objets plus haut niveau sont inactifs), ou null
 *  - actions   : { locked, lockedReason, equip(inst, slot|null), unequip(slot), extra?(inst) -> noeud|null }
 *  - rerender  : à appeler quand `view` change (la page est redessinée)
 */
export function equipmentView({ content, holder, view, tranche = null, actions, rerender }) {
  const equipment = holder.equipment;
  const blocked = twoHandedWorn(content, equipment);
  const filled = EQUIP_SLOTS.filter((s) => equipment[s]).length;

  // ---- le panneau de détail sous la poupée (change au survol sans tout redessiner)
  const detail = h('div', { class: 'slot-detail', 'aria-live': 'polite' });
  // (le panneau ne rapetisse jamais pendant qu'on survole : sinon, dans une fenêtre plus haute que l'écran, la page se recale,
  //  l'emplacement glisse hors de la souris, le détail change encore... et tout se met à trembler)
  const showDetail = (slot) => {
    if (detail.isConnected && detail.offsetHeight) detail.style.minHeight = `${Math.max(parseFloat(detail.style.minHeight) || 0, detail.offsetHeight)}px`;
    mount(detail, slotDetail(slot));
  };
  const resetDetail = () => showDetail(view.sel);

  function slotDetail(slot) {
    if (!slot) {
      return h('div', { class: 'gear empty hint' },
        h('div', { class: 'gear-icon' }, icon('star', 26)),
        h('div', { class: 'gear-main' },
          h('div', { class: 'gear-name muted' }, 'Choisis un emplacement'),
          h('div', { class: 'gear-hint' }, 'Clique sur un emplacement pour voir son objet et ne montrer que les objets du sac qui peuvent y aller.')));
    }
    const name = content.slotNames[slot];
    if (slot === 'offHand' && blocked) {
      const two = defOf(content, equipment.mainHand);
      return h('div', { class: 'gear empty' },
        h('div', { class: 'gear-icon' }, icon('weapon', 26)),
        h('div', { class: 'gear-main' },
          h('div', { class: 'gear-slot' }, name),
          h('div', { class: 'gear-name muted' }, 'Prise par une arme à deux mains'),
          h('div', { class: 'gear-hint' }, `${two.name} occupe les deux mains. Retire-la, ou équipe un objet ici pour la remplacer.`)));
    }
    const inst = equipment[slot];
    if (!inst) {
      const fits = holder.bag.filter((i) => { const d = defOf(content, i); return slotsFor(d).includes(slot) && canEquip(content, holder.realLevel, d).ok; }).length;
      return h('div', { class: 'gear empty' },
        h('div', { class: 'gear-icon' }, icon(SLOT_ICON[slot], 26)),
        h('div', { class: 'gear-main' },
          h('div', { class: 'gear-slot' }, name),
          h('div', { class: 'gear-name muted' }, 'Emplacement libre'),
          h('div', { class: 'gear-hint' }, fits ? `${fits} objet${fits > 1 ? 's' : ''} du sac peu${fits > 1 ? 'vent' : 't'} y aller (à droite).` : 'Rien dans le sac pour cet emplacement.')));
    }
    const def = defOf(content, inst);
    const rarity = rarityOf(content, def);
    const inactive = tranche && def.level > tranche;
    const cursed = holder.cursedUid && holder.cursedUid === inst.uid;
    return h('div', { class: `gear r-${rarity.id} ${inactive ? 'is-inactive' : ''}`, style: { '--rar': rarity.color } },
      h('div', { class: 'gear-icon' }, icon(SLOT_ICON[slot], 26)),
      h('div', { class: 'gear-main' },
        h('div', { class: 'gear-slot' }, name, ' · ', `niveau ${def.level}`, h('span', { class: 'rarity-pill' }, rarity.name)),
        h('div', { class: 'gear-name' }, itemName(def)),
        h('div', { class: 'gear-type' }, typeLabel(content, def)),
        statPills(content, def),
        def.effect ? h('div', { class: 'gear-effect' }, icon('star', 12), def.effect) : null,
        def.desc ? h('div', { class: 'gear-desc' }, def.desc) : null,
        inactive ? h('div', { class: 'item-warn' }, `Inactif en tranche ${tranche} : trop haut niveau.`) : null,
        cursed ? h('div', { class: 'item-warn' }, icon('curse', 12), ' Maudit : ses bonus sont perdus pour cette partie.') : null),
      h('button', {
        type: 'button', class: 'btn btn-small gear-remove', disabled: actions.locked, title: actions.locked ? actions.lockedReason : 'Remettre cet objet dans le sac',
        onClick: () => actions.unequip(slot)
      }, 'Retirer'));
  }

  // ---- la poupée
  const tiles = new Map();
  const select = (slot) => {
    view.sel = view.sel === slot ? null : slot;
    // Sur téléphone, le sac filtré est plus bas : si l'emplacement est LIBRE, on y descend (voir afterEquipRender).
    // S'il est occupé, on reste sur le détail de l'objet (juste sous la poupée), pour pouvoir le retirer.
    view.focusBag = !!view.sel && !equipment[slot] && !(slot === 'offHand' && blocked) && narrowScreen();
    rerender();
  };
  function slotTile(slot) {
    const inst = equipment[slot];
    const off = slot === 'offHand' && blocked;
    const shown = off ? equipment.mainHand : inst;
    const def = shown ? defOf(content, shown) : null;
    const rarity = def ? rarityOf(content, def) : null;
    const inactive = tranche && inst && def.level > tranche;
    const cursed = !!(inst && holder.cursedUid && holder.cursedUid === inst.uid);
    const label = def ? `${content.slotNames[slot]} : ${itemName(def)}${off ? ' (arme à deux mains)' : ''}` : `${content.slotNames[slot]} : libre`;
    const tile = h('button', {
      type: 'button', dataset: { slot },
      class: `dslot ${def ? `filled r-${rarity.id}` : 'empty'} ${off ? 'blocked' : ''} ${cursed ? 'cursed' : ''} ${view.sel === slot ? 'is-selected' : ''} ${inactive ? 'is-inactive' : ''}`,
      style: def ? { '--rar': rarity.color } : null, 'aria-label': label, title: label, 'aria-pressed': view.sel === slot ? 'true' : 'false',
      onClick: () => select(slot), onMouseenter: () => showDetail(slot), onMouseleave: resetDetail, onFocus: () => showDetail(slot)
    },
      h('span', { class: 'dslot-icon' },
        icon(off ? 'weapon' : SLOT_ICON[slot], 'fluid'),
        def && !off ? h('span', { class: 'dslot-lvl', title: `Niveau ${def.level}` }, def.level) : null,
        off ? h('span', { class: 'dslot-note' }, '2 mains') : null),
      h('span', { class: 'dslot-name' }, content.slotNames[slot]));
    tiles.set(slot, tile);
    return tile;
  }
  // Quand on survole un objet du sac, on allume les emplacements concernés (celui qui le recevra, et ceux qu'il videra).
  const markTargets = (plan) => {
    for (const [slot, tile] of tiles) tile.classList.toggle('is-target', !!plan && plan.ok && (plan.slot === slot || plan.remove.includes(slot)));
  };

  const doll = h('div', { class: 'doll' },
    DOLL_ROWS.map((row) => h('div', { class: 'doll-group' },
      row.title ? h('div', { class: 'doll-title' }, row.title) : null,
      h('div', { class: `doll-row n${row.slots.length}` }, row.slots.map(slotTile)))));

  // ---- une ligne du sac
  function bagRow(inst) {
    const def = defOf(content, inst);
    const rarity = rarityOf(content, def);
    const extra = actions.extra ? actions.extra(inst) : null;
    const isLocked = !!actions.isLocked?.(inst);
    const lockedMark = isLocked ? h('span', { class: 'lock-mark', title: 'Objet protégé : il ne peut pas être démantelé' }, icon('lock', 12)) : null;
    // Cadenas et démantèlement (la fiche seulement : pas pendant une partie)
    const forgeBtns = actions.salvage && !def.consumable ? [
      h('button', {
        type: 'button', class: `btn btn-small btn-icon bag-lock ${isLocked ? 'on' : ''}`, disabled: actions.locked, 'aria-pressed': isLocked ? 'true' : 'false',
        title: actions.locked ? actions.lockedReason : isLocked ? 'Retirer la protection' : 'Protéger cet objet (il ne pourra pas être démantelé)',
        'aria-label': isLocked ? `Retirer la protection : ${def.name}` : `Protéger : ${def.name}`, onClick: () => actions.lock(inst)
      }, icon('lock', 14)),
      h('button', {
        type: 'button', class: 'btn btn-small btn-icon bag-salvage', disabled: actions.locked || isLocked,
        title: actions.locked ? actions.lockedReason : isLocked ? 'Objet protégé : retire le cadenas pour le démanteler' : `Démanteler : +${salvageValue(content, inst)} éclats`,
        'aria-label': `Démanteler : ${def.name}`, onClick: () => actions.salvage(inst)
      }, icon('trash', 14))
    ] : null;
    const head = (meta) => h('div', { class: 'bag-line1' }, h('b', { class: 'bag-name' }, itemName(def)), lockedMark, h('span', { class: 'rarity-pill' }, rarity.name), h('span', { class: 'bag-meta' }, meta));

    if (def.consumable) {
      return h('div', { class: `bag-row r-${rarity.id}`, style: { '--rar': rarity.color }, dataset: { item: inst.id } },
        h('div', { class: 'bag-icon' }, icon('potion', 22)),
        h('div', { class: 'bag-main' }, head(`Potion · niveau ${def.level}`), h('div', { class: 'bag-text' }, itemSummary(content, def)), extra),
        h('div', { class: 'bag-act' }));
    }

    const check = canEquip(content, holder.realLevel, def);
    const target = view.sel && slotsFor(def).includes(view.sel) ? view.sel : null;
    const plan = check.ok ? planEquip(content, equipment, def, target) : null;
    const displaced = plan && plan.ok ? plan.remove.map((s) => equipment[s]).filter(Boolean) : [];
    const cmp = compareItems(content, def, displaced.map((i) => defOf(content, i)));
    const verdict = !displaced.length
      ? { cls: 'better', ic: 'plus', text: 'Emplacement libre' }
      : { better: { cls: 'better', ic: 'up', text: 'Meilleur' }, worse: { cls: 'worse', ic: 'down', text: 'Moins bon' }, mixed: { cls: 'mixed', ic: 'swap', text: 'Différent' }, same: { cls: 'same', ic: 'check', text: 'Équivalent' } }[cmp.verdict];
    const where = plan && plan.ok && slotsFor(def).length > 1 ? ` → ${content.slotNames[plan.slot]}` : '';
    const inactive = tranche && def.level > tranche;

    let compare;
    if (!check.ok) compare = h('div', { class: 'bag-cmp locked' }, icon('lock', 12), check.reason);
    else {
      compare = h('div', { class: `bag-cmp ${verdict.cls}` },
        h('span', { class: 'verdict' }, icon(verdict.ic, 12), verdict.text),
        displaced.length
          ? h('span', { class: 'deltas' }, 'remplace ', h('i', null, displaced.map((i) => itemName(defOf(content, i))).join(' + ')), where, cmp.deltas.length ? ' : ' : '',
              cmp.deltas.map((d) => h('span', { class: `delta ${d.delta > 0 ? 'up' : 'down'}` }, `${d.delta > 0 ? '▲ +' : '▼ −'}${Math.abs(d.delta)} ${d.label}`)))
          : h('span', { class: 'deltas' }, `rien à remplacer : tout ce qu'il donne est gagné${where}`));
    }

    return h('div', {
      class: `bag-row r-${rarity.id} ${check.ok ? '' : 'is-locked'}`, style: { '--rar': rarity.color }, dataset: { item: inst.id },
      onMouseenter: () => markTargets(plan), onMouseleave: () => markTargets(null)
    },
      h('div', { class: 'bag-icon' }, icon(def.slot, 22)),
      h('div', { class: 'bag-main' },
        head(typeLabel(content, def) + ` · niveau ${def.level}`),
        statPills(content, def),
        def.effect ? h('div', { class: 'gear-effect' }, icon('star', 12), def.effect) : null,
        compare,
        inactive ? h('div', { class: 'item-warn' }, `Inactif en tranche ${tranche} : trop haut niveau.`) : null,
        extra),
      h('div', { class: 'bag-act' },
        h('button', {
          type: 'button', class: 'btn btn-small', disabled: actions.locked || !check.ok,
          title: actions.locked ? actions.lockedReason : check.ok ? `Équiper : ${def.name}${where}` : check.reason,
          onClick: () => actions.equip(inst, target)
        }, 'Équiper'),
        forgeBtns));
  }

  // ---- le sac, en sections
  const rank = (inst) => { const d = defOf(content, inst); return content.rarityIndex[d.rarity] * 100 + d.level; };
  const items = [...holder.bag].sort((a, b) => rank(b) - rank(a));
  const groupOf = (def) => FILTERS.find(([id, , types]) => types && types.includes(def.slot))?.[0];
  const countOf = (f) => (f === 'all' ? items.length : items.filter((i) => groupOf(defOf(content, i)) === f).length);
  const filter = countOf(view.filter) ? view.filter : 'all';
  let shown = items;
  if (view.sel) shown = items.filter((i) => slotsFor(defOf(content, i)).includes(view.sel));
  else if (filter !== 'all') shown = items.filter((i) => groupOf(defOf(content, i)) === filter);
  const sections = SECTION_ORDER
    .map((type) => ({ type, list: shown.filter((i) => defOf(content, i).slot === type) }))
    .filter((s) => s.list.length);

  const bag = h('section', { class: 'equip-bag' },
    h('div', { class: 'sec-head' },
      h('h4', { class: 'sec-title' }, `Sac (${items.length})`),
      view.sel
        ? h('button', { type: 'button', class: 'chip-btn on', title: 'Revoir tout le sac', onClick: () => { view.sel = null; rerender(); } }, `Pour : ${content.slotNames[view.sel]} ✕`)
        : h('div', { class: 'filters', role: 'group', 'aria-label': 'Filtrer le sac' },
            FILTERS.map(([id, label]) => h('button', {
              type: 'button', class: `chip-btn ${filter === id ? 'on' : ''}`, disabled: id !== 'all' && !countOf(id),
              onClick: () => { view.filter = id; rerender(); }
            }, `${label} ${countOf(id)}`)))),
    sections.length
      ? h('div', { class: 'bag-sections' }, sections.map(({ type, list }) => h('div', { class: 'bag-sec', dataset: { type } },
          h('h5', { class: 'bag-sec-title' }, icon(type, 14), content.typeNames[type].section, h('small', null, list.length)),
          h('div', { class: 'bag-list' }, list.map(bagRow)))))
      : h('p', { class: 'muted empty-note' }, items.length
          ? (view.sel ? 'Rien dans le sac pour cet emplacement.' : 'Rien de ce type dans le sac.')
          : 'Ton sac est vide. Les objets trouvés en donjon et au farm arrivent ici.'));

  // ---- l'assemblage
  const total = EQUIP_SLOTS.length;
  showDetail(view.sel);
  return h('div', { class: 'equip-layout' },
    h('section', { class: 'equip-worn' },
      h('div', { class: 'doll-head' },
        h('h4', { class: 'sec-title' }, 'Porté'),
        h('span', { class: `doll-count ${filled === total ? 'full' : ''}`, title: 'Emplacements remplis' }, `${filled} / ${total}`)),
      doll,
      detail,
      h('div', { class: 'gear-level', title: 'La somme des niveaux des objets portés. Certains succès en dépendent.' },
        icon('star', 14), "Niveau d'équipement", h('b', null, gearLevel(content, { equipment }))),
      tranche ? h('p', { class: 'muted small' }, `Aperçu en tranche ${tranche} : les objets de niveau supérieur sont inactifs, mais restent équipés.`) : null),
    bag);
}
