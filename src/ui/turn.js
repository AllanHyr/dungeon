// ============================================================
//  turn.js — Qui joue quoi ? (à plusieurs en ligne, chacun ne contrôle que SON héros)
// ============================================================
// Une partie reçue du serveur porte, en plus de l'état du jeu, un petit « dossier réseau » (run.net) :
//     you    les identifiants des héros de CE joueur (« p2 »)
//     room   le salon (code, hôte, qui joue quel héros, durée d'un tour) — null pour une partie solo
//     timer  le décompte du tour en cours, tenu par le serveur
// Ce module répond aux questions de l'écran : « ce héros est-il à moi ? », « est-ce mon tour ? »...
// (Une partie locale ou un farm solo n'a pas de salon : tout est à moi, comme avant.)

/** Les actions qui « appartiennent » à un héros, et le champ qui dit lequel (le serveur applique la même règle). */
const OWNER_FIELD = { COMBAT_ACT: 'playerId', EQUIP: 'playerId', UNEQUIP: 'playerId', USE_ITEM: 'playerId', USE_SKILL: 'playerId', GHOST: 'playerId', SHOP_SELL: 'playerId', SHOP_BUY: 'buyerId', GIVE: 'fromId' };
/** Celles qui appartiennent au joueur dont c'est le tour. */
const BY_ACTOR = new Set(['ADVANCE', 'ROLL', 'CHOOSE', 'SHOP_LEAVE', 'FARM_NEXT', 'FARM_STOP', 'TIMEOUT']);

/** Cette partie se joue-t-elle à plusieurs (dans un salon) ? */
export const inRoom = (run) => !!run?.net?.room;

/** Ce héros de la partie est-il à moi ? (Toujours vrai en solo.) */
export function isMine(run, playerId) {
  return !inRoom(run) || run.net.you.includes(playerId);
}

/** Est-ce à moi de jouer maintenant ? */
export function isMyTurn(run) {
  return !!run?.pending?.actor && run.phase !== 'ended' && isMine(run, run.pending.actor);
}

/** Je regarde quelqu'un d'autre jouer (partie à plusieurs, pas mon tour). */
export function isWatching(run) {
  return inRoom(run) && run.phase !== 'ended' && !!run.pending?.actor && !isMine(run, run.pending.actor);
}

/** Qui contrôle ce héros ? { userId, userName } (userId null : son joueur est parti, le pilote automatique le joue) ou null hors salon. */
export function ownerOf(run, playerId) {
  return inRoom(run) ? run.net.room.owners.find((o) => o.playerId === playerId) || null : null;
}

/** Durée d'un tour en secondes : celle du salon (tenue par le serveur), ou le réglage « Minuteur » du navigateur en solo. */
export function turnSecondsOf(run, profile) {
  if (inRoom(run)) return run.net.timer?.seconds ?? run.net.room.turnSeconds ?? 0;
  return profile?.settings?.turnSeconds || 0;
}

/** Cette action est-elle une des miennes ? (Une vérification de confort : c'est le serveur qui décide vraiment.) */
export function canSend(run, action) {
  if (!inRoom(run)) return true;
  if (BY_ACTOR.has(action.type)) return isMyTurn(run);
  const field = OWNER_FIELD[action.type];
  if (field) return isMine(run, action[field]);
  return action.type !== 'ABANDON' || run.net.room.hostId === run.net.me;
}
