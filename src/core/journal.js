// ============================================================
//  journal.js — Le journal de partie (récap de fin de run)
// ============================================================
// Montre qui a été généreux (dons, partage d'XP, soins) et qui a fait des
// coups bas, plus quelques "titres" amusants.

/** Crée le compteur de statistiques d'un joueur (rempli pendant la run). */
export function newPlayerStats() {
  return {
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    rollsOk: 0,
    rollsKo: 0,
    deaths: 0,
    revived: 0, // combien de fois ce joueur a été ressuscité
    revivesDone: 0, // combien d'alliés ce joueur a ressuscités
    itemsGiven: 0,
    itemsReceived: 0,
    xpShared: 0, // XP offerte aux autres
    xpKept: 0, // XP gardée alors qu'on aurait pu partager
    sabotages: 0, // coups bas tentés
    sabotagesOk: 0,
    sabotagesRebounded: 0,
    sabotagesSuffered: 0,
    ghostActions: 0
  };
}

/** Meilleur joueur selon un critère (ou null si personne n'a au moins `min`). */
function best(players, scoreOf, min = 1) {
  let top = null;
  let topScore = min - 1;
  for (const p of players) {
    const s = scoreOf(p);
    if (s > topScore) {
      top = p;
      topScore = s;
    }
  }
  return top ? { name: top.name, value: topScore } : null;
}

export function buildJournal(state) {
  const P = state.players;
  const rows = P.map((p) => {
    const s = p.stats;
    return {
      playerId: p.id,
      name: p.name,
      classId: p.classId,
      generosity: {
        itemsGiven: s.itemsGiven,
        xpShared: s.xpShared,
        healingDone: s.healingDone,
        revivesDone: s.revivesDone
      },
      lowBlows: {
        tried: s.sabotages,
        succeeded: s.sabotagesOk,
        rebounded: s.sabotagesRebounded,
        suffered: s.sabotagesSuffered
      },
      damageDealt: s.damageDealt,
      damageTaken: s.damageTaken,
      deaths: s.deaths
    };
  });

  const titles = [];
  const add = (title, desc, found) => found && titles.push({ title, desc, name: found.name, value: found.value });
  add('Le Généreux', 'objets donnés et XP partagée', best(P, (p) => p.stats.itemsGiven * 10 + p.stats.xpShared));
  add('Le Traître', 'coups bas tentés', best(P, (p) => p.stats.sabotages));
  add('La Victime', 'coups bas subis', best(P, (p) => p.stats.sabotagesSuffered));
  add('Le Cupide', "XP gardée au lieu de la partager", best(P, (p) => p.stats.xpKept));
  add('Le Guérisseur', 'PV rendus', best(P, (p) => p.stats.healingDone));
  add('Le Bourreau', 'dégâts infligés', best(P, (p) => p.stats.damageDealt));
  add('Le Rempart', 'dégâts encaissés', best(P, (p) => p.stats.damageTaken));
  add('Le Malchanceux', 'mauvais jets de dé', best(P, (p) => p.stats.rollsKo));
  add('Le Revenant', 'résurrections reçues', best(P, (p) => p.stats.revived));

  return { rows, titles, social: state.social.slice() };
}
