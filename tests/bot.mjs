// Un "robot" qui joue une run entière en choisissant des actions légales.
// Sert à tester le moteur (aucun plantage, la partie se termine) et à équilibrer.
import {
  createRun, createFarm, dispatch, getCombatView, createCharacter, learnSkill, addXp, canEquip, computeStats, itemPrice, shopPrice,
  checkUsable, needsPick, validTargets, activeSkillIds, skillOf, totalShield, EQUIP_SLOTS, slotsFor, planEquip, twoHandedWorn, setSpec, setDeck, evalCondition
} from '../src/core/index.js';
import { targetDamagePct } from '../src/core/effects.js';
import { markedEnemies } from '../src/core/geometry.js';
import { nextFloat } from '../src/core/rng.js';

/** Petit hasard pour le robot (indépendant du hasard du jeu). */
export function makeRand(seed) {
  const s = { rng: seed >>> 0 };
  return { f: () => nextFloat(s), pick: (a) => a[Math.floor(nextFloat(s) * a.length)] };
}

/**
 * Crée des personnages de test : niveau, compétences au hasard (selon les points), équipement.
 * `extra` (facultatif) : { specs: [spec | null, ...], decks: [[ids] | null, ...] } (un élément par personnage) pour tester une spécialisation et un deck précis.
 */
export function makeParty(content, classes, level = 1, gear = 'none', seed = 1, extra = {}) {
  const r = makeRand(seed);
  return classes.map((classId, i) => {
    const ch = createCharacter(content, { id: 'c' + i, name: ['Aldric', 'Maeve', 'Borin', 'Lysa'][i], classId });
    while (ch.level < level) {
      const before = ch.level;
      addXp(content, ch, content.rules.xpToNext[ch.level - 1]);
      if (ch.level === before) { ch.level = level; ch.xp = 0; } // plafond de niveau (levelCap) : on force le niveau demandé
    }
    const skills = content.classes[classId].skills.filter((s) => !s.innate);
    for (let k = 0; k < 80; k++) learnSkill(content, ch, r.pick(skills).id);
    if (extra.specs?.[i]) { const res = setSpec(content, ch, extra.specs[i]); if (!res.ok) throw new Error(res.reason); }
    for (const id of extra.learns?.[i] || []) { const res = learnSkill(content, ch, id); if (!res.ok) throw new Error(res.reason); } // (choix d'une spécialisation, appris après l'avoir choisie)
    if (extra.decks?.[i]) { const res = setDeck(content, ch, extra.decks[i]); if (!res.ok) throw new Error(res.reason); }
    if (gear !== 'none') {
      // Tous les emplacements, dans l'ordre : une arme à deux mains libère la main gauche (pas d'objet dedans).
      let n = 0;
      const wanted = gear === 'good' ? ['rare', 'epic', 'uncommon'] : ['common', 'uncommon'];
      for (const slot of EQUIP_SLOTS) {
        if (slot === 'offHand' && twoHandedWorn(content, ch.equipment)) continue;
        const options = content.itemList.filter((it) => slotsFor(it).includes(slot) && it.level <= level && wanted.includes(it.rarity) && canEquip(content, ch.level, it).ok
          && !(it.twoHanded && ch.equipment.offHand));
        if (options.length) ch.equipment[slot] = { uid: `g${i}-${n++}`, id: r.pick(options).id };
      }
    }
    return ch;
  });
}

const hpRatio = (state, u) => u.hp / computeStats(state, u).hpMax;

// ============================================================
//  Le tour de combat d'un joueur-robot
// ============================================================

/** Un soin utile entre deux vagues (compétence de soin ou potion), ou null. */
function betweenWavesHeal(state, me) {
  if (hpRatio(state, me) >= 0.75) return null;
  for (const id of activeSkillIds(state, me)) {
    const sk = skillOf(state, id);
    if (!checkUsable(state, me, sk, { inCombat: false }).ok) continue;
    return { type: 'USE_SKILL', playerId: me.id, skillId: id, targetId: needsPick(sk) ? me.id : undefined };
  }
  const potion = me.bag.find((it) => state.content.items[it.id].consumable);
  if (potion && hpRatio(state, me) < 0.5) return { type: 'USE_ITEM', playerId: me.id, uid: potion.uid, targetId: me.id };
  return null;
}

/** Le mode (ou l'aura) que le robot veut avoir : celui de sa spécialisation. */
function wantedMode(me) {
  if (me.classId === 'templier') return { lumiere: 'devotion', vindicte: 'vengeance' }[me.spec] || 'protection';
  return me.spec === 'ecorche' ? 'degats' : 'reduction';
}

/** Valeur approximative d'une compétence (par PA dépensé). */

function scoreSkill(state, me, s) {
  const sk = skillOf(state, s.skillId);
  const allies = state.players.filter((a) => a.alive);
  const hurt = allies.filter((a) => hpRatio(state, a) < 0.7);
  const dead = state.players.filter((a) => !a.alive && !a.resurrected);
  const nTargets = sk.target === 'enemies' ? Math.max(1, s.targets.length) : 1;
  // La cible que le robot viserait (`pickTarget`) : les bonus « sur cible marquée » / « sur cible blessée » se jugent sur elle (ou sur chacune, pour une zone).
  const foes = s.targets.map((id) => state.combat?.monsters.find((m) => m.id === id)).filter(Boolean);
  const aim = sk.target === 'enemy' ? [bestFoe(state, me, foes)].filter(Boolean) : sk.target === 'enemies' ? foes : [];
  const okTarget = (cond, t) => evalCondition(state, me, cond, { target: t });
  let score = 0;
  for (const e of sk.effects) {
    if (e.if && !evalCondition(state, me, e.if, {})) continue; // un effet qui dépend d'une condition (ex. le mode) ne compte que s'il s'applique
    if (e.ifTarget && aim.length && !aim.some((t) => okTarget(e.ifTarget, t))) continue; // (ex. « si la cible est marquée »)
    if (e.type === 'damage' && e.to !== 'self') {
      let ev = 1;
      if (s.dice) {
        const pf = s.dice.fumble > 0 ? Math.min(1, s.dice.fumble / 20) : 0;
        const pc = Math.max(0, Math.min(1, (21 - s.dice.crit) / 20));
        ev = 1 - pf - pc + pc * 1.5;
      }
      const missing = Math.max(0, (1 - hpRatio(state, me)) * 100); // (la puissance de certains sorts grandit avec les PV manquants)
      // Les effets qui dépendent de la cible : PV manquants, bonus conditionnels, marque (+x % de dégâts). Pour une zone, on additionne sur chaque cible.
      const per = (aim.length ? aim : [null]).map((t) => {
        const tm = t ? Math.max(0, (1 - hpRatio(state, t)) * 100) : 0;
        let pw = (e.power ?? 1) + (e.powerPerMissingHp || 0) * missing + (e.powerPerTargetMissingHp || 0) * tm;
        for (const b of e.bonus || []) if (t && (!b.ifTarget || okTarget(b.ifTarget, t))) pw += b.power;
        if (e.ifTarget && t && !okTarget(e.ifTarget, t)) return 0;
        return pw * (t ? 1 + targetDamagePct(state, me, t) : 1);
      });
      const total = sk.target === 'enemies' ? per.reduce((a, b) => a + b, 0) : per[0] * nTargets;
      score += total * ev * 10;
      if (e.lifesteal) score += 2;
    } else if (e.type === 'heal' || e.type === 'hot' || e.type === 'shield') {
      // On n'empile pas deux fois le même soin sur la durée / un gros bouclier sur celui qui en a déjà un.
      const needing = hurt.filter((a) => (e.type === 'hot' ? !a.statuses.some((st) => st.id === 'hot' && st.key === sk.id) : e.type === 'shield' ? totalShield(a) < computeStats(state, a).hpMax * 0.3 : true));
      const needy = sk.target === 'allies' ? needing.length : needing.length ? 1 : 0;
      // Un allié en danger de mort rend le soin beaucoup plus urgent.
      const urgent = allies.filter((a) => hpRatio(state, a) < 0.4).length;
      score += needy * (e.power ?? 0.8) * 9 + (needy ? urgent * (e.power ?? 0.8) * 10 : 0);
    } else if (e.type === 'resurrect') score += dead.length ? 40 : 0;
    else if (e.type === 'pa') score += hpRatio(state, me) > 0.6 ? 6 : 0; // gagner des PA contre des PV : seulement s'il en a de reste
    else if (e.type === 'mode') score += me.mode !== wantedMode(me) ? 12 : 0; // le robot choisit le mode (l'aura) de sa spécialisation
    else if (e.type === 'resource' && e.amount > 0 && me.classId === 'templier') score += 2 * e.amount; // de la puissance sacrée : de quoi lancer un consommateur
    else if (e.type === 'redirect') score += allies.some((a) => a.id !== me.id && hpRatio(state, a) < 0.8) ? 8 : 0; // Sacrifice : quand un allié est en danger
    else if (e.type === 'mod' && (e.pct ?? e.flat) > 0 && e.to !== 'self') score += 4;
    else if (e.type === 'mod' && (e.pct ?? e.flat) > 0) score += 3;
    else if (e.type === 'stun') score += 5;
    else if (e.type === 'taunt') score += 2;
    else if (e.type === 'mark') { const mk = markedEnemies(state, me); score += mk.length < (e.max ?? 1) && foes.some((f) => !mk.includes(f)) ? 12 : 0; } // désigner une proie quand on n'en a pas (ou pas assez)
    else if (e.type === 'dot' && e.stack) score += e.power * e.turns * 4 * (e.stacks || 1); // un venin qui se cumule vaut cher
    else if (e.type === 'poison' || e.type === 'dot') score += 3;
    else if (e.type === 'cleanse') score += 1;
  }
  if (sk.effects.some((e) => e.type === 'guard')) score = hpRatio(state, me) < 0.4 ? 3 : 0; // la garde : seulement quand on va mal
  if (sk.id === 'berserker_saignee' && hpRatio(state, me) < 0.4) score = 0; // on évite de se saigner trop bas
  return score / Math.max(1, s.pa);
}

/** L'ennemi que le robot attaque en priorité : sa proie marquée s'il en a une, sinon le plus faible. */
function bestFoe(state, me, foes) {
  if (!foes.length) return null;
  const marked = markedEnemies(state, me).find((m) => foes.includes(m));
  return marked || [...foes].sort((a, b) => a.hp - b.hp)[0];
}

/** Choisit la meilleure cible d'une compétence. */
function pickTarget(state, me, s, rand) {
  const sk = skillOf(state, s.skillId);
  if (!s.needsPick) return undefined;
  const t = s.targets.map((id) => (state.players.find((p) => p.id === id) || state.combat.monsters.find((m) => m.id === id)));
  if (sk.effects.some((e) => e.type === 'mark')) return bestFoe(state, me, t.filter((u) => !markedEnemies(state, me).includes(u)).length ? t.filter((u) => !markedEnemies(state, me).includes(u)) : t).id; // une marque de plus : sur une proie pas encore marquée
  if (sk.target === 'enemy') return bestFoe(state, me, t).id;
  if (sk.target === 'ally') return t.sort((a, b) => hpRatio(state, a) - hpRatio(state, b))[0].id;
  return rand.pick(s.targets);
}

/** Une action de combat sensée (pour un joueur "normal"). mode: 'smart' | 'basic' (attaque de base seulement). */
export function combatAction(state, actorId, rand, mode = 'smart') {
  const me = state.players.find((p) => p.id === actorId);
  const view = getCombatView(state, actorId);
  const usable = view.skills.filter((s) => s.usable);
  if (mode === 'basic') {
    const atk = usable.find((s) => s.basic);
    return atk ? { type: 'COMBAT_ACT', playerId: actorId, act: 'skill', skillId: atk.skillId, targetId: pickTarget(state, me, atk, rand) } : { type: 'COMBAT_ACT', playerId: actorId, act: 'endTurn' };
  }
  // Potion si un allié est en danger et qu'on n'a pas de soin
  const critical = state.players.filter((a) => a.alive && hpRatio(state, a) < 0.3).sort((a, b) => a.hp - b.hp)[0];
  const healer = usable.some((s) => ['heal', 'hot', 'shield'].some((t) => skillOf(state, s.skillId).effects.some((e) => e.type === t)));
  if (critical && !healer && view.items.length && view.items[0].usable) return { type: 'COMBAT_ACT', playerId: actorId, act: 'item', itemUid: view.items[0].uid, targetId: critical.id };

  let best = null;
  let bestScore = 0.2;
  for (const s of usable) {
    const sc = scoreSkill(state, me, s) + rand.f() * 0.05;
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  if (!best) return { type: 'COMBAT_ACT', playerId: actorId, act: 'endTurn' };
  return { type: 'COMBAT_ACT', playerId: actorId, act: 'skill', skillId: best.skillId, targetId: pickTarget(state, me, best, rand), ...(best.modePick ? { modeId: wantedMode(me) } : {}) };
}

// ============================================================
//  Le reste de la run
// ============================================================

/** Choisit une action légale selon ce que le jeu attend. */
export function chooseAction(state, rand, combatMode = 'smart', opts = {}) {
  const p = state.pending;
  switch (p.kind) {
    case 'advance': {
      // Les fantômes aident parfois
      const ghost = state.players.find((g) => !g.alive && !g.ghostActed);
      if (ghost && rand.f() < 0.5) return { type: 'GHOST', playerId: ghost.id, mode: 'bless' };
      // Les soigneurs soignent hors combat
      const living = state.players.filter((x) => x.alive);
      for (const h of living) {
        for (const id of activeSkillIds(state, h)) {
          const sk = skillOf(state, id);
          if (!checkUsable(state, h, sk, { inCombat: false }).ok) continue;
          if (sk.target === 'deadAlly') {
            const dead = state.players.find((x) => !x.alive && !x.resurrected);
            if (dead) return { type: 'USE_SKILL', playerId: h.id, skillId: id, targetId: dead.id };
          } else if (needsPick(sk)) {
            const hurt = living.filter((x) => hpRatio(state, x) < 0.6).sort((a, b) => a.hp - b.hp)[0];
            if (hurt) return { type: 'USE_SKILL', playerId: h.id, skillId: id, targetId: hurt.id };
          }
        }
      }
      // Équipe le meilleur matériel trouvé
      for (const pl of living) {
        for (const it of pl.bag) {
          const def = state.content.items[it.id];
          if (def.consumable) continue;
          // on n'équipe que ce qui trouve une place libre (rien n'est remplacé)
          const plan = canEquip(state.content, pl.realLevel, def).ok ? planEquip(state.content, pl.equipment, def) : null;
          if (plan && plan.ok && plan.remove.length === 0) return { type: 'EQUIP', playerId: pl.id, uid: it.uid };
        }
      }
      return { type: 'ADVANCE' };
    }
    case 'roll':
      return { type: 'ROLL' };
    case 'choice': {
      const opts = p.options;
      if (p.subtype === 'loot') {
        const give = opts.filter((o) => o.id.startsWith('give:'));
        if (give.length && rand.f() < 0.3) return { type: 'CHOOSE', option: rand.pick(give).id };
        return { type: 'CHOOSE', option: 'keep' };
      }
      if (p.subtype === 'low_blow') {
        if (rand.f() < 0.4) return { type: 'CHOOSE', option: rand.pick(opts).id };
        return { type: 'CHOOSE', option: 'pass' };
      }
      if (p.subtype === 'xp_fountain') return { type: 'CHOOSE', option: rand.pick(opts.map((o) => o.id)) };
      const revive = opts.find((o) => o.id.startsWith('revive:'));
      if (revive) return { type: 'CHOOSE', option: revive.id };
      return { type: 'CHOOSE', option: rand.pick(opts).id };
    }
    case 'shop': {
      const tile = state.dungeon.board[state.dungeon.position];
      const buyer = state.players.find((x) => x.alive);
      for (let i = 0; i < tile.stock.length; i++) {
        const e = tile.stock[i];
        if (e.sold) continue;
        const def = state.content.items[e.inst.id];
        if (state.gold >= shopPrice(state, tile, itemPrice(state.content, def))) return { type: 'SHOP_BUY', index: i, buyerId: buyer.id };
      }
      return { type: 'SHOP_LEAVE' };
    }
    case 'combat':
      return combatAction(state, p.actor, rand, combatMode);
    case 'farm': {
      // Entre deux vagues : on se soigne, puis on repart tant que les PV sont corrects (sinon on part avec le coffre).
      const me = state.players[0];
      const heal = betweenWavesHeal(state, me);
      if (heal) return heal;
      if (hpRatio(state, me) < (opts.stopBelow ?? 0.4) || (opts.maxWaves && state.farm.cleared >= opts.maxWaves)) return { type: 'FARM_STOP' };
      return { type: 'FARM_NEXT' };
    }
    default:
      throw new Error('Pending inconnu : ' + p.kind);
  }
}

/** Contrôles de cohérence appelés après chaque action. */
export function checkInvariants(state) {
  for (const p of state.players) {
    const max = computeStats(state, p).hpMax;
    if (!Number.isFinite(p.hp)) throw new Error(`PV non numériques pour ${p.name}`);
    if (p.hp < 0 || p.hp > max + 0.0001) throw new Error(`PV hors limites pour ${p.name}: ${p.hp}/${max}`);
    if (p.alive && p.hp <= 0) throw new Error(`${p.name} vivant avec 0 PV`);
    if (!p.alive && p.hp !== 0) throw new Error(`${p.name} mort avec ${p.hp} PV`);
    if (p.alive === p.ghost) throw new Error(`${p.name} : alive/ghost incohérents`);
    if (!Number.isFinite(p.pa) || p.pa < 0) throw new Error(`PA invalides pour ${p.name}: ${p.pa}`);
    for (const sh of p.shields) if (!(sh.amount > 0)) throw new Error('bouclier vide conservé');
    for (const [k, v] of Object.entries(p.resources || {})) if (!(v >= 0)) throw new Error(`ressource ${k} négative`);
  }
  if (state.combat) {
    for (const m of state.combat.monsters) {
      if (m.hp < 0 || m.hp > m.hpMax) throw new Error(`PV monstre hors limites ${m.name}`);
      if (m.alive && m.hp <= 0) throw new Error('monstre vivant à 0 PV');
    }
    if (state.pending?.kind === 'combat') {
      const actor = state.players.find((p) => p.id === state.pending.actor);
      if (!actor?.alive) throw new Error('le tour de combat est donné à un joueur mort');
    }
  }
  if (state.farm) {
    const f = state.farm;
    if (f.cleared > f.wave || f.cleared < f.wave - 1) throw new Error(`farm : vagues incohérentes (vague ${f.wave}, vaincues ${f.cleared})`);
    if (f.items.length > f.chestFree) throw new Error('farm : plus d\'objets que de place dans le coffre');
    if (f.xp < 0 || !Number.isFinite(f.xp)) throw new Error('farm : XP invalide');
    if (state.pending?.kind === 'farm' && state.combat) throw new Error('farm : entre deux vagues il ne peut pas y avoir de combat');
  }
  if (state.phase !== 'ended' && !state.pending) throw new Error('Aucun pending alors que la run continue');
}

/** Joue une run complète. Renvoie un résumé. */
export function playRun(content, setup, characters, seed, botSeed = seed + 7, maxActions = 4000, combatMode = 'smart') {
  const state = createRun(content, setup, characters, seed);
  const rand = makeRand(botSeed);
  let actions = 0;
  while (state.phase !== 'ended') {
    const action = chooseAction(state, rand, combatMode);
    const res = dispatch(state, action);
    if (!res.ok) throw new Error(`Action refusée (${JSON.stringify(action)}) : ${res.error}\n pending=${JSON.stringify(state.pending).slice(0, 300)}`);
    checkInvariants(state);
    if (++actions > maxActions) {
      const err = new Error("Trop d'actions : partie bloquée ?");
      err.state = state; // pour pouvoir inspecter la partie bloquée
      throw err;
    }
  }
  return { state, actions };
}

/** Joue une session de farm complète (jusqu'à l'arrêt ou la mort). opts : { zoneId, stopBelow, maxWaves, combatMode } */
export function playFarm(content, character, seed, botSeed = seed + 7, opts = {}, maxActions = 6000) {
  const state = createFarm(content, character, { zoneId: opts.zoneId, seed });
  const rand = makeRand(botSeed);
  let actions = 0;
  while (state.phase !== 'ended') {
    const action = chooseAction(state, rand, opts.combatMode || 'smart', opts);
    const res = dispatch(state, action);
    if (!res.ok) throw new Error(`Action refusée (${JSON.stringify(action)}) : ${res.error}\n pending=${JSON.stringify(state.pending).slice(0, 300)}`);
    checkInvariants(state);
    if (++actions > maxActions) {
      const err = new Error("Trop d'actions : session de farm bloquée ?");
      err.state = state;
      throw err;
    }
  }
  return { state, actions };
}
