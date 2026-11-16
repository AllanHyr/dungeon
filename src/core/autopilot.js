// ============================================================
//  autopilot.js — Que jouer à la place d'un joueur qui ne répond plus ?
// ============================================================
// En ligne, à plusieurs, le groupe ne doit pas rester bloqué parce qu'un joueur a fermé son navigateur ou s'est endormi.
// Quand son minuteur de tour est écoulé (ou qu'il a quitté la partie), le serveur joue à sa place : toujours l'action la
// plus PRUDENTE — il avance, lance les dés, garde le butin, ne boit pas aux fontaines, reste honnête, et ne fait rien en combat.
// (Pur : aucun lien avec le navigateur ni le serveur. Le moteur reste le seul à appliquer les règles.)

/**
 * L'action à jouer maintenant à la place du joueur dont c'est le tour, ou null s'il n'y a rien à faire.
 * L'action est à envoyer à dispatch() comme n'importe quelle autre.
 */
export function afkAction(state) {
  const pend = state.pending;
  if (!pend || state.phase === 'ended') return null;
  switch (pend.kind) {
    case 'advance': return { type: 'ADVANCE' };
    case 'roll': return { type: 'ROLL' };
    case 'combat': return { type: 'TIMEOUT' }; // le tour se termine (les PA restants sont perdus)
    case 'shop': return { type: 'SHOP_LEAVE' };
    case 'farm': return { type: 'FARM_STOP' }; // le farm est solo, mais au cas où : on part avec ce qu'on a gagné
    case 'choice': {
      // « keep » = garder le butin ; « skip » = passer son chemin (fontaines) ; « pass » = rester honnête (coup bas)
      const ids = pend.options.map((o) => o.id);
      const safe = ['keep', 'skip', 'pass'].find((id) => ids.includes(id)) ?? ids[0];
      return { type: 'CHOOSE', option: safe };
    }
    default: return null; // 'end' : la partie est finie
  }
}

/** Qui doit répondre maintenant ? L'identifiant du joueur de la partie (« p1 », « p2 »...), ou null. */
export function whoMustAct(state) {
  return state.phase === 'ended' || !state.pending ? null : state.pending.actor || null;
}

/**
 * Identifie « le tour en cours » : tant que cette clé ne change pas, le décompte du minuteur continue ; dès qu'elle change
 * (autre joueur, autre attente, autre round...), un nouveau décompte commence. (Le même calcul sert au serveur et à l'écran.)
 */
export function turnKey(state) {
  const pend = state.pending;
  if (!pend || state.phase === 'ended') return null;
  const combat = state.combat;
  // (le jet demandé et l'objet à répartir en font partie : deux objets de suite = deux questions = deux décomptes)
  return [pend.kind, pend.subtype || '', pend.purpose || '', pend.item?.uid || '', pend.actor || '', state.turn, combat ? combat.round : '', combat ? combat.turn : '', state.dungeon?.position ?? '', state.farm ? state.farm.wave : ''].join('|');
}
