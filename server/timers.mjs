// ============================================================
//  timers.mjs — Le minuteur de tour, tenu par le serveur
// ============================================================
// À plusieurs, c'est le SERVEUR qui compte le temps (un joueur ne peut pas « tricher » avec l'horloge de son navigateur) :
// quand le décompte du tour en cours arrive à zéro, il appelle `onFire`, qui joue l'action prudente à la place du joueur.
//
// Un décompte par partie. Tant que le « tour » (voir turnKey dans src/core/autopilot.js) ne change pas, le décompte continue ;
// dès que le tour change, un nouveau décompte commence. Un joueur parti (son héros n'a plus de propriétaire) n'a pas de décompte :
// le pilote automatique joue presque tout de suite, pour ne pas faire attendre les autres.

export class TurnTimers {
  /**
   * @param scale     multiplicateur des durées (les tests l'abaissent pour ne pas attendre 60 secondes)
   * @param orphanMs  délai avant que le pilote automatique joue pour un héros sans propriétaire
   * @param onFire    (runId, key) => void : le temps est écoulé
   */
  constructor({ scale = 1, orphanMs = 700, onFire }) {
    this.scale = scale;
    this.orphanMs = orphanMs;
    this.onFire = onFire;
    this.slots = new Map(); // runId -> { key, mode, deadline, seconds, handle }
  }

  /**
   * Met le décompte à jour après un changement de la partie.
   * @param key      le « tour » en cours (null : la partie est finie)
   * @param seconds  durée d'un tour en secondes (0 : pas de minuteur)
   * @param orphan   vrai si le héros qui doit jouer n'a plus de joueur derrière
   */
  sync(runId, key, { seconds = 0, orphan = false } = {}) {
    const mode = orphan ? 'orphan' : 'timer';
    if (!key || (!orphan && !seconds)) return this.clear(runId);
    const current = this.slots.get(runId);
    if (current && current.key === key && current.mode === mode) return; // même tour : le décompte continue
    this.clear(runId);
    const ms = orphan ? this.orphanMs : Math.max(1, Math.round(seconds * 1000 * this.scale));
    const handle = setTimeout(() => {
      const slot = this.slots.get(runId);
      if (!slot || slot.key !== key) return;
      this.slots.delete(runId);
      try {
        this.onFire(runId, key);
      } catch (e) {
        console.error(`[minuteur] partie ${runId} :`, e);
      }
    }, ms);
    handle.unref?.();
    this.slots.set(runId, { key, mode, deadline: Date.now() + ms, seconds: orphan ? 0 : seconds, handle });
  }

  /** Ce qu'il faut montrer aux joueurs : { seconds, remainingMs } (ou null s'il n'y a pas de décompte). */
  view(runId) {
    const slot = this.slots.get(runId);
    if (!slot || slot.mode !== 'timer') return null;
    return { seconds: slot.seconds, remainingMs: Math.max(0, slot.deadline - Date.now()), total: Math.round(slot.seconds * 1000 * this.scale) };
  }

  clear(runId) {
    const slot = this.slots.get(runId);
    if (slot) clearTimeout(slot.handle);
    this.slots.delete(runId);
  }

  clearAll() {
    for (const slot of this.slots.values()) clearTimeout(slot.handle);
    this.slots.clear();
  }
}
