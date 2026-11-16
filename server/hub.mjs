// ============================================================
//  hub.mjs — Le temps réel : on pousse les nouvelles aux navigateurs au lieu d'attendre qu'ils les demandent
// ============================================================
// Chaque joueur connecté ouvre UN flux « Server-Sent Events » (GET /api/events) : une réponse HTTP qui ne se termine jamais,
// sur laquelle le serveur écrit des messages quand quelque chose change (un joueur rejoint le salon, un coup est joué...).
// C'est plus simple et plus léger que les WebSockets, et le navigateur se reconnecte tout seul si le réseau coupe.
//
// Le hub sait aussi qui est EN LIGNE (au moins un flux ouvert), pour afficher un point vert à côté des joueurs.

/** Un message SSE : « event: nom » puis « data: {json} », terminé par une ligne vide. */
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function createHub({ heartbeatMs = 20_000, maxStreamsPerUser = 4, onPresence = () => {} } = {}) {
  const streams = new Map(); // id du compte -> ensemble de réponses HTTP ouvertes

  const write = (res, text) => {
    try {
      res.write(text);
    } catch {
      /* le navigateur est parti : le nettoyage se fait sur « close » */
    }
  };

  return {
    /** Ce compte a-t-il au moins un flux ouvert ? */
    isOnline: (userId) => (streams.get(userId)?.size || 0) > 0,

    /** Nombre de comptes en ligne (pour les statistiques). */
    onlineCount: () => streams.size,

    /**
     * Ouvre un flux pour ce compte. `first` : les messages à envoyer tout de suite [[événement, données], ...]
     * (l'état actuel : ainsi, après une coupure, le navigateur se remet à jour tout seul).
     */
    open(userId, req, res, { headers = {}, first = [] } = {}) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // (nginx : ne pas garder les messages en tampon, sinon on ne les reçoit qu'en retard)
        ...headers
      });
      res.write('retry: 3000\n\n'); // si le réseau coupe, le navigateur retente au bout de 3 s
      for (const [event, data] of first) write(res, frame(event, data));

      let set = streams.get(userId);
      const wasOnline = !!set && set.size > 0;
      if (!set) streams.set(userId, (set = new Set()));
      set.add(res);
      // Trop de flux pour ce compte (onglets oubliés...) : on ferme les plus anciens.
      while (set.size > maxStreamsPerUser) {
        const oldest = set.values().next().value;
        set.delete(oldest);
        try { oldest.end(); } catch { /* déjà fermé */ }
      }

      // Un message « de vie » régulier : les portiers (proxys) coupent les connexions silencieuses, et le navigateur sait que le flux vit encore
      // (s'il n'entend plus rien pendant plus d'une minute, il rouvre le flux : voir remote-gateway.js).
      const beat = setInterval(() => write(res, frame('ping', {})), heartbeatMs);
      beat.unref?.();
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        const current = streams.get(userId);
        if (current) {
          current.delete(res);
          if (!current.size) {
            streams.delete(userId);
            onPresence(userId, false);
          }
        }
      };
      req.on('close', cleanup);
      res.on('close', cleanup);
      if (!wasOnline) onPresence(userId, true);
    },

    /** Envoie le même message à plusieurs comptes. */
    send(userIds, event, data) {
      const text = frame(event, data);
      for (const id of userIds) for (const res of streams.get(id) || []) write(res, text);
    },

    /** Envoie un message à tous les comptes en ligne. */
    broadcast(event, data) {
      const text = frame(event, data);
      for (const set of streams.values()) for (const res of set) write(res, text);
    },

    /** Ferme tous les flux (arrêt du serveur). */
    closeAll() {
      for (const set of streams.values()) for (const res of set) {
        try { res.end(); } catch { /* déjà fermé */ }
      }
      streams.clear();
    }
  };
}
