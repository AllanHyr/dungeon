// ============================================================
//  results.js — Fin de run : XP gagnée, butin récupéré, mise à jour des personnages
// ============================================================
// Règle d'or : une run est un "bac à sable". Les personnages sauvegardés ne
// changent QU'À LA FIN d'une VICTOIRE (XP, butin, équipement).
// En cas de défaite ou d'abandon : on perd la progression de la run et le loot
// non récupéré, mais JAMAIS le personnage ni son équipement.

import { pruneDeck } from './progression.js';
import { EQUIP_SLOTS, dungeonRules, dungeonIdOf } from './content.js';
import { addXp, levelFactor, previewXp } from './progression.js';
import { buildJournal } from './journal.js';
import { clamp, log } from './util.js';
import { computeFarmResult } from './farm.js';

/** Contribution réelle d'un joueur (pour pondérer l'XP : on ne gagne pas en regardant les autres). */
export function contribution(state, player) {
  const c = state.content;
  const tr = dungeonRules(state.content, state.setup);
  const s = player.stats;
  return s.damageDealt + s.healingDone + c.rules.contribution.tankedWeight * s.damageTaken + (tr.rollValue || 4) * s.rollsOk;
}

/** Tout ce que le joueur possède en fin de run et qu'il n'avait pas au départ. */
export function newItemsOf(player) {
  const owned = [...player.bag, ...EQUIP_SLOTS.map((s) => player.equipment[s]).filter(Boolean)];
  return owned.filter((it) => !player.initialUids.includes(it.uid));
}

function computeResult(state, outcome) {
  const c = state.content;
  const won = outcome === 'victory';
  const n = state.players.length;
  const contribs = state.players.map((p) => contribution(state, p));
  const avg = contribs.reduce((a, b) => a + b, 0) / n;
  const { minMult, maxMult } = c.rules.contribution;

  const players = state.players.map((p, i) => {
    const relative = avg > 0 ? contribs[i] / avg : 1;
    const contribMult = clamp(0.5 + 0.5 * relative, minMult, maxMult);
    const lvlFactor = levelFactor(c, p.realLevel, state.setup.tranche);
    const raw = state.xpPool * contribMult + p.fountainXp;
    const potential = Math.round(raw * lvlFactor * state.params.xp);
    const total = won ? potential : 0;
    const after = previewXp(c, { level: p.realLevel, xp: p.xpStart }, total);
    const found = newItemsOf(p);
    return {
      playerId: p.id,
      charId: p.charId,
      name: p.name,
      classId: p.classId,
      realLevel: p.realLevel,
      effLevel: p.effLevel,
      alive: p.alive,
      xp: {
        pool: state.xpPool,
        contribution: Math.round(contribs[i]),
        contribMult: +contribMult.toFixed(2),
        fountain: p.fountainXp,
        levelFactor: +lvlFactor.toFixed(2),
        modeMult: state.params.xp,
        potential,
        total
      },
      levelAfter: after.level,
      levelUps: after.gained,
      loot: won ? found : [],
      lostLoot: won ? [] : found
    };
  });

  return {
    outcome,
    won,
    turns: state.turn,
    tilesCleared: Math.max(0, state.dungeon.position + (won ? 1 : 0)),
    goldLeft: state.gold,
    players,
    journal: buildJournal(state),
    applied: false
  };
}

/** Termine la run (victoire, défaite ou abandon) et calcule les récompenses. */
export function endRun(state, outcome) {
  if (state.phase === 'ended') return;
  state.phase = 'ended';
  state.pending = { kind: 'end' };
  state.combat = null;
  if (state.farm) {
    // Session de farm : bilan à part (vagues vaincues, XP de rattrapage, éclats, objets au choix). Voir farm.js.
    state.result = computeFarmResult(state, outcome);
    const text = { stop: 'Fin de la session de farm : tu repars avec tes éclats et une récompense à choisir.', defeat: 'Tu tombes... la vague en cours ne rapporte rien, le reste est gardé.', abandon: 'Tu quittes la zone avec ce que tu as déjà gagné.' };
    log(state, text[outcome] || text.stop, outcome === 'defeat' ? 'bad' : 'info');
    return;
  }
  state.result = computeResult(state, outcome);
  const msg = { victory: 'VICTOIRE ! Le boss est vaincu.', defeat: 'DÉFAITE... Tout le groupe est tombé.', abandon: 'Le groupe abandonne la run.' };
  log(state, msg[outcome], outcome === 'victory' ? 'good' : 'bad');
}

/**
 * Applique le résultat d'une run aux personnages SAUVEGARDÉS (modifie le tableau).
 * À appeler une seule fois par run (protégé par `result.applied`).
 */
export function applyRunResult(content, characters, state) {
  const res = state.result;
  if (!res || res.applied) return;
  for (const pr of res.players) {
    const ch = characters.find((x) => x.id === pr.charId);
    if (!ch) continue;
    const p = state.players.find((x) => x.id === pr.playerId);
    ch.stats.runs++;
    if (p.stats.deaths > 0) ch.stats.deaths++;
    // Le bestiaire : les monstres vaincus comptent même si la partie est perdue (on les a bel et bien battus).
    if (!ch.stats.bestiary) ch.stats.bestiary = {};
    for (const [id, k] of Object.entries(state.kills || {})) ch.stats.bestiary[id] = (ch.stats.bestiary[id] || 0) + k;
    if (!res.won) continue;
    ch.stats.wins++;
    // Donjon terminé : on retient lequel, et s'il l'a été en groupe (pour les succès).
    if (!ch.stats.clears) ch.stats.clears = {};
    const rec = (ch.stats.clears[String(state.setup.tranche)] ||= { total: 0, group: 0 });
    rec.total++;
    if (state.players.length >= 2) rec.group++;
    // ... et quel donjon précisément (pour l'encyclopédie : « terminé 3 fois »).
    const did = dungeonIdOf(content, state.setup);
    if (did) { if (!ch.stats.dungeons) ch.stats.dungeons = {}; ch.stats.dungeons[did] = (ch.stats.dungeons[did] || 0) + 1; }
    if (did && state.setup.mode === 'stasis') { if (!ch.stats.stasisClears) ch.stats.stasisClears = {}; ch.stats.stasisClears[did] = (ch.stats.stasisClears[did] || 0) + 1; }
    // ... et les objets EXCLUSIFS qu'il a rapportés (la collection de l'encyclopédie).
    if (!ch.stats.found) ch.stats.found = {};
    for (const it of newItemsOf(p)) if (content.itemDungeon?.[it.id]) ch.stats.found[it.id] = true;
    addXp(content, ch, pr.xp.total);
    // Le sac de la run devient l'inventaire du personnage (butin récupéré, objets achetés...).
    const keep = (it) => (it.plus ? { uid: it.uid, id: it.id, plus: it.plus } : { uid: it.uid, id: it.id }); // (garde l'amélioration de la forge)
    ch.inventory = p.bag.map(keep);
    for (const slot of EQUIP_SLOTS) ch.equipment[slot] = p.equipment[slot] ? keep(p.equipment[slot]) : null;
    // un objet vendu ou perdu pendant la partie perd son cadenas
    if (ch.locked?.length) { const own = new Set([...ch.inventory, ...EQUIP_SLOTS.map((s) => ch.equipment[s]).filter(Boolean)].map((it) => it.uid)); ch.locked = ch.locked.filter((u) => own.has(u)); }
    // Les sorts équipés au feu de camp restent équipés après la partie (seulement ceux que le personnage peut équiper).
    if (Array.isArray(p.deck) && Array.isArray(ch.deck) && p.deck.join() !== ch.deck.join()) {
      const before = ch.deck;
      ch.deck = p.deck.slice();
      pruneDeck(content, ch);
      if (!ch.deck.length) ch.deck = before;
    }
  }
  res.applied = true;
}
