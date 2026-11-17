// ============================================================
//  profile-actions.js — Tout ce qu'on peut faire à un personnage HORS d'une partie
// ============================================================
// Créer, supprimer, équiper, retirer un objet, apprendre une compétence, réinitialiser les compétences, choisir sa spécialisation
// et son deck de sorts, ouvrir le coffre.
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
import { openChest } from './farm.js';
import { checkAchievements } from './achievements.js';
import { EQUIP_SLOTS } from './content.js';
import { GameError, assert } from './util.js';

/** Les actions acceptées (le champ `type` d'une demande). */
export const CHARACTER_ACTIONS = ['CHAR_CREATE', 'CHAR_DELETE', 'CHAR_EQUIP', 'CHAR_UNEQUIP', 'CHAR_LEARN', 'CHAR_RESET_SKILLS', 'CHAR_SET_SPEC', 'CHAR_SET_DECK', 'CHAR_OPEN_CHEST'];

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
 *                      maxCharacters?: number }
 * @returns { ok:true, character?, deletedId?, unlocked:[succès débloqués], opened?:[objets du coffre] }
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
      case 'CHAR_OPEN_CHEST': {
        assert(ch.chest.length > 0, 'Le coffre est vide.');
        const opened = openChest(content, ch);
        return { ok: true, character: ch, opened, unlocked: checkAchievements(content, ch) };
      }
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
