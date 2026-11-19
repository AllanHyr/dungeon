// ============================================================
//  profile-actions.js — Tout ce qu'on peut faire à un personnage HORS d'une partie
// ============================================================
// Créer, supprimer, équiper, retirer un objet, apprendre une compétence, réinitialiser les compétences, choisir sa spécialisation
// et son deck de sorts, choisir la récompense du farm, partir en expédition et en revenir ; démanteler, protéger, améliorer et forger des objets (voir forge.js).
//
// C'est le MÊME code qui s'exécute :
//   - dans le navigateur, quand on joue seul (la démo publiée) : les personnages sont dans le navigateur ;
//   - sur le serveur, quand on joue en ligne : les personnages sont dans la base de données.
// Ainsi les règles sont identiques des deux côtés, et en ligne le serveur est le seul à pouvoir modifier un personnage :
// un joueur ne peut pas s'offrir un objet légendaire en trafiquant ce qu'il envoie, il ne peut demander que des actions permises.
//
// Usage :
//     const res = applyCharacterAction(content, personnages, { type: 'CHAR_EQUIP', charId, uid }, { newId, locked });
//     res.ok ? res.character : res.error
//
// Ce fichier ne touche ni à l'écran, ni au navigateur, ni aux fichiers.

import { createCharacter, learnSkill, resetSkills, setSpec, setDeck } from './progression.js';
import { equipFromBag, unequipToBag } from './items.js';
import { pickLoot } from './farm.js';
import { startExpedition, claimExpedition, cancelExpedition } from './expeditions.js';
import { salvageValue, canUpgrade, craftableItems, bulkSalvageList, ownedItems, forgeRules } from './forge.js';
import { checkAchievements } from './achievements.js';
import { EQUIP_SLOTS } from './content.js';
import { GameError, assert } from './util.js';

/** Les actions acceptées (le champ `type` d'une demande). */
export const CHARACTER_ACTIONS = ['CHAR_CREATE', 'CHAR_DELETE', 'CHAR_EQUIP', 'CHAR_UNEQUIP', 'CHAR_LEARN', 'CHAR_RESET_SKILLS', 'CHAR_SET_SPEC', 'CHAR_SET_DECK', 'CHAR_PICK_LOOT', 'CHAR_EXPEDITION_START', 'CHAR_EXPEDITION_CLAIM', 'CHAR_EXPEDITION_CANCEL',
  'CHAR_SALVAGE', 'CHAR_SALVAGE_BULK', 'CHAR_LOCK', 'CHAR_UPGRADE', 'CHAR_CRAFT'];

/** Combien de personnages au maximum (une limite de sécurité pour une base de données partagée). */
export const MAX_CHARACTERS = 30;

/** Le nombre de places de personnages : celui du serveur s'il en impose un, sinon `maxCharacters` de rules.json (8). */
export const characterSlots = (content, override = null) => override ?? content.rules.maxCharacters ?? MAX_CHARACTERS;
const MAX_NAME = 24;

/** Nettoie un nom de personnage : pas de caractères de contrôle, pas d'espaces en trop, 24 caractères au plus. */
export function cleanName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

/**
 * Applique une action à la liste de personnages (qui est modifiée sur place).
 *
 * @param content     le contenu du jeu
 * @param characters  la liste des personnages DU JOUEUR (jamais ceux des autres)
 * @param action      { type: 'CHAR_...', charId?, ... }
 * @param ctx         { newId: () => string  (obligatoire pour créer),
 *                      locked?: Set<string>  (personnages engagés dans une partie : on n'y touche pas),
 *                      maxCharacters?: number,
 *                      now?: number  (l'heure, en ms : celle du SERVEUR en ligne — les expéditions en dépendent),
 *                      rand?: () => number  (le hasard des récompenses d'expédition ; Math.random par défaut) }
 * @returns { ok:true, character?, deletedId?, unlocked:[succès débloqués], picked?, shards? }
 *       ou { ok:false, error:"..." } (rien n'a été modifié)
 */
export function applyCharacterAction(content, characters, action, ctx = {}) {
  try {
    assert(action && typeof action === 'object' && typeof action.type === 'string', 'Action invalide.');
    assert(CHARACTER_ACTIONS.includes(action.type), `Action inconnue : ${action.type}`);

    if (action.type === 'CHAR_CREATE') return create(content, characters, action, ctx);

    const ch = characters.find((c) => c.id === action.charId);
    assert(ch, 'Personnage introuvable.');
    assert(!ctx.locked?.has(ch.id), 'Ce personnage est dans une partie en cours : termine-la ou abandonne-la d\'abord.');

    switch (action.type) {
      case 'CHAR_DELETE': {
        characters.splice(characters.indexOf(ch), 1);
        return { ok: true, deletedId: ch.id, unlocked: [] };
      }
      case 'CHAR_EQUIP': {
        assert(typeof action.uid === 'string', 'Objet invalide.');
        assert(action.slot === undefined || action.slot === null || EQUIP_SLOTS.includes(action.slot), 'Emplacement inconnu.');
        const res = equipFromBag(content, { equipment: ch.equipment, bag: ch.inventory, realLevel: ch.level }, action.uid, action.slot ?? null);
        assert(res.ok, res.reason);
        break;
      }
      case 'CHAR_UNEQUIP': {
        assert(EQUIP_SLOTS.includes(action.slot), 'Emplacement inconnu.');
        const inst = unequipToBag({ equipment: ch.equipment, bag: ch.inventory }, action.slot);
        assert(inst, 'Rien à retirer.');
        break;
      }
      case 'CHAR_LEARN': {
        assert(typeof action.skillId === 'string', 'Compétence invalide.');
        const res = learnSkill(content, ch, action.skillId);
        assert(res.ok, res.reason);
        break;
      }
      case 'CHAR_RESET_SKILLS':
        resetSkills(content, ch);
        break;
      case 'CHAR_SET_SPEC': {
        // spec: l'identifiant d'une spécialisation de la classe, ou null pour n'en avoir aucune. Interdit en partie (voir `locked`).
        assert(action.spec === null || typeof action.spec === 'string', 'Spécialisation invalide.');
        const res = setSpec(content, ch, action.spec);
        assert(res.ok, res.reason);
        break;
      }
      case 'CHAR_SET_DECK': {
        assert(Array.isArray(action.deck), 'Deck invalide.');
        const res = setDeck(content, ch, action.deck);
        assert(res.ok, res.reason);
        break;
      }
      case 'CHAR_PICK_LOOT': {
        // La récompense d'une session de farm : on garde un objet, les autres sont démantelés en éclats.
        assert(typeof action.uid === 'string', 'Objet invalide.');
        assert(ch.lootChoice?.length, 'Aucune récompense à choisir.');
        const res = pickLoot(content, ch, action.uid);
        return { ok: true, character: ch, picked: res.picked, shards: res.shards, unlocked: checkAchievements(content, ch) };
      }
      case 'CHAR_SALVAGE': {
        // Démanteler un objet DU SAC (pas un objet porté, pas un objet protégé, pas une potion) : il devient des éclats.
        assert(typeof action.uid === 'string', 'Objet invalide.');
        const i = ch.inventory.findIndex((it) => it.uid === action.uid);
        assert(i >= 0, 'Cet objet n\'est pas dans le sac.');
        assert(!(ch.locked || []).includes(action.uid), 'Cet objet est protégé : retire le cadenas pour le démanteler.');
        const gain = salvageValue(content, ch.inventory[i]);
        assert(gain > 0, 'Cet objet ne se démantèle pas.');
        ch.inventory.splice(i, 1);
        ch.shards = (ch.shards || 0) + gain;
        return { ok: true, character: ch, shards: gain, salvaged: 1, unlocked: checkAchievements(content, ch) };
      }
      case 'CHAR_SALVAGE_BULK': {
        // Tout démanteler jusqu'à une rareté (« tous les objets communs ») ; jamais les objets protégés ni les potions.
        assert(typeof action.rarity === 'string' && content.rarityIndex[action.rarity] !== undefined, 'Rareté inconnue.');
        const list = bulkSalvageList(content, ch, action.rarity);
        assert(list.length > 0, 'Rien à démanteler.');
        let gain = 0;
        for (const inst of list) gain += salvageValue(content, inst);
        const gone = new Set(list.map((it) => it.uid));
        ch.inventory = ch.inventory.filter((it) => !gone.has(it.uid));
        ch.shards = (ch.shards || 0) + gain;
        return { ok: true, character: ch, shards: gain, salvaged: list.length, unlocked: checkAchievements(content, ch) };
      }
      case 'CHAR_LOCK': {
        // Poser ou retirer le cadenas d'un objet (dans le sac ou porté).
        assert(typeof action.uid === 'string' && ownedItems(ch).some((o) => o.inst.uid === action.uid), 'Objet introuvable.');
        const locked = new Set(ch.locked || []);
        if (locked.has(action.uid)) locked.delete(action.uid); else locked.add(action.uid);
        ch.locked = [...locked];
        break;
      }
      case 'CHAR_UPGRADE': {
        // Améliorer un objet (sac ou porté) d'un cran : +1 à +5.
        assert(typeof action.uid === 'string', 'Objet invalide.');
        const own = ownedItems(ch).find((o) => o.inst.uid === action.uid);
        assert(own, 'Objet introuvable.');
        const res = canUpgrade(content, ch, own.inst);
        assert(res.ok, res.reason);
        ch.shards -= res.cost;
        own.inst.plus = (own.inst.plus || 0) + 1;
        break;
      }
      case 'CHAR_CRAFT': {
        // Forger un objet exclusif d'un donjon déjà terminé ; il arrive dans le sac.
        assert(typeof action.itemId === 'string', 'Objet invalide.');
        const entry = craftableItems(content, ch).find((x) => x.id === action.itemId);
        assert(entry, 'Termine d\'abord le donjon où tombe cet objet pour pouvoir le forger.');
        assert(!entry.locked, 'Un objet légendaire ne se forge qu\'après avoir terminé ce donjon en Stasis (à plusieurs).');
        assert((ch.shards || 0) >= entry.cost, `${entry.cost} éclats requis (tu en as ${ch.shards || 0}).`);
        const cap = forgeRules(content).bagMax;
        assert(ch.inventory.length < cap, `Ton sac est plein (${cap} objets) : démantèle quelque chose d'abord.`);
        ch.shards -= entry.cost;
        const inst = { uid: `${entry.id}-${Math.random().toString(36).slice(2, 8)}`, id: entry.id };
        ch.inventory.push(inst);
        return { ok: true, character: ch, crafted: inst, unlocked: checkAchievements(content, ch) };
      }
      case 'CHAR_EXPEDITION_START': {
        // Envoyer le héros en expédition : il revient au bout du temps prévu (temps réel)
        assert(typeof action.expeditionId === 'string', 'Expédition invalide.');
        startExpedition(content, characters, ch, action.expeditionId, ctx.now ?? Date.now());
        break;
      }
      case 'CHAR_EXPEDITION_CLAIM': {
        // Le héros est revenu : on récupère ses récompenses (éclats, XP de rattrapage, parfois un objet)
        const claim = claimExpedition(content, characters, ch, ctx.now ?? Date.now(), ctx.rand || Math.random);
        return { ok: true, character: ch, claim: { expeditionId: claim.expedition?.id ?? null, shards: claim.shards, xp: claim.xp, levels: claim.levels, item: claim.item }, unlocked: checkAchievements(content, ch) };
      }
      case 'CHAR_EXPEDITION_CANCEL':
        cancelExpedition(ch);
        break;
      default:
        throw new GameError(`Action inconnue : ${action.type}`);
    }
    // Un changement d'équipement, de compétences... peut remplir la condition d'un succès.
    return { ok: true, character: ch, unlocked: checkAchievements(content, ch) };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message };
    throw e;
  }
}

function create(content, characters, action, ctx) {
  assert(typeof ctx.newId === 'function', 'Création impossible ici.');
  assert(typeof action.classId === 'string' && content.classes[action.classId], 'Classe inconnue.');
  const slots = characterSlots(content, ctx.maxCharacters);
  assert(characters.length < slots, `Toutes tes places sont prises (${characters.length} sur ${slots}) : supprime un personnage pour en créer un autre.`);
  const ch = createCharacter(content, { id: ctx.newId(), name: cleanName(action.name), classId: action.classId });
  characters.push(ch);
  return { ok: true, character: ch, unlocked: checkAchievements(content, ch) };
}
