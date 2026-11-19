// ============================================================
//  end.js — Le bilan de fin de run : XP, butin, et le journal de partie
// ============================================================
// Le journal montre qui a été généreux (dons, partage d'XP, soins) et
// qui a fait des coups bas.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { app, toast } from '../state.js';
import { go, startRun, startFarm, characterAction, redraw } from '../controller.js';
import { play } from '../sound.js';
import { portrait, xpBar } from '../components.js';
import { itemCard } from '../format.js';
import { rewardTexts, salvageValue } from '../../core/index.js';
import { inRoom, isMine, ownerOf } from '../turn.js';

const CLASS_NAME = (id) => app.content.classes[id].name;

/** Une phrase lisible pour un acte "social" du journal. */
function socialText(run, ev) {
  const name = (id) => run.players.find((p) => p.id === id)?.name || '?';
  const c = app.content;
  switch (ev.kind) {
    case 'gift': return `${name(ev.from)} a offert ${c.items[ev.detail]?.name || 'un objet'} à ${name(ev.to)}.`;
    case 'share': return `${name(ev.from)} a partagé une fontaine d'XP (+${ev.detail} XP chacun).`;
    case 'sabotage': return `${name(ev.from)} a joué un sale tour à ${name(ev.to)} (${c.lowBlows.find((b) => b.id === ev.detail)?.name || 'coup bas'}).`;
    case 'rebound': return `Le coup bas de ${name(ev.from)} s'est retourné contre lui !`;
    case 'revive': return `${name(ev.from)} a ressuscité ${name(ev.to)}${ev.detail === 'fountain' ? ' grâce à la fontaine' : ''}.`;
    case 'ghost': return `${name(ev.from)} (fantôme) a aidé le groupe.`;
    default: return ev.kind;
  }
}

export function renderEnd(root) {
  const run = app.run;
  if (!run || !run.result) return go('menu');
  const res = run.result;
  const c = app.content;
  if (res.farm) return renderFarmEnd(root, run);
  const title = res.won ? 'VICTOIRE !' : res.outcome === 'abandon' ? 'Run abandonnée' : 'DÉFAITE...';
  const subtitle = res.won
    ? 'Le boss est vaincu. Vos personnages gardent leur XP et leur butin.'
    : res.outcome === 'abandon'
      ? 'Vous avez quitté le donjon. La progression de la run est perdue, vos personnages sont intacts.'
      : 'Tout le groupe est tombé. La progression de la run et le butin sont perdus, mais vos personnages et leur équipement sont saufs.';

  const banner = h('div', { class: `end-banner ${res.won ? 'win' : 'lose'}` },
    h('h1', null, title),
    h('p', null, subtitle),
    h('div', { class: 'end-facts' },
      h('span', null, icon('target', 16), `${res.tilesCleared} salle${res.tilesCleared > 1 ? 's' : ''} franchie${res.tilesCleared > 1 ? 's' : ''}`),
      h('span', null, icon('d20', 16), `${res.turns} tour${res.turns > 1 ? 's' : ''}`),
      h('span', null, icon('coin', 16), `${res.goldLeft} or restant (perdu)`)));

  // À plusieurs : mes héros d'abord ; celui dont le joueur est parti avant la fin ne touche rien.
  const roomRun = inRoom(run);
  const ordered = roomRun ? [...res.players].sort((a, b) => Number(isMine(run, b.playerId)) - Number(isMine(run, a.playerId))) : res.players;
  const playerCards = ordered.map((pr) => {
    const x = pr.xp;
    const mine = roomRun && isMine(run, pr.playerId);
    const owner = roomRun ? ownerOf(run, pr.playerId) : null;
    const left = !!owner && owner.userId === null;
    return h('div', { class: `card end-player ${pr.alive ? '' : 'ghosted'} ${mine ? 'is-mine' : ''} ${left ? 'has-left' : ''}`, dataset: { player: pr.playerId } },
      h('div', { class: 'end-player-head' },
        portrait(pr.classId, 48),
        h('div', null,
          h('div', { class: 'unit-name' }, pr.name, pr.alive ? null : h('span', { class: 'chip chip-info' }, 'fantôme'), mine ? h('span', { class: 'chip chip-good' }, 'toi') : null),
          h('div', { class: 'muted small' }, `${CLASS_NAME(pr.classId)} · niv. ${pr.realLevel}${pr.effLevel !== pr.realLevel ? ` (effectif ${pr.effLevel})` : ''}`),
          roomRun && !mine ? h('div', { class: 'muted small' }, left ? 'Parti avant la fin : aucune récompense' : `Joué par ${owner?.userName || '?'}`) : null),
        left ? null : h('div', { class: 'xp-total' },
          res.won ? h('b', null, `+${x.total} XP`) : h('b', { class: 'tone-bad' }, 'XP perdue'),
          res.won && pr.levelUps ? h('div', { class: 'level-up' }, icon('star', 16), `Niveau ${pr.realLevel} → ${pr.levelAfter} !`) : null)),
      left ? null : h('div', { class: 'muted small xp-detail' },
        `XP du groupe ${x.pool} × contribution ${x.contribMult}`,
        x.fountain ? ` + fontaines ${x.fountain}` : '',
        x.levelFactor < 1 ? ` × écart de niveau ${x.levelFactor}` : '',
        x.modeMult !== 1 ? ` × mode ${x.modeMult}` : '',
        res.won ? '' : ` (aurait donné ${x.potential} XP)`),
      !left && pr.loot.length
        ? h('div', null, h('h4', null, `Butin récupéré (${pr.loot.length})`), h('div', { class: 'loot-grid' }, pr.loot.map((it) => itemCard(c, it, { compact: true }))))
        : null,
      !left && pr.lostLoot.length
        ? h('div', null, h('h4', { class: 'tone-bad' }, `Butin perdu (${pr.lostLoot.length})`), h('div', { class: 'loot-grid lost' }, pr.lostLoot.map((it) => itemCard(c, it, { compact: true }))))
        : null);
  });

  // ---------------- Journal de partie ----------------
  const j = res.journal;
  const awards = j.titles.length
    ? h('div', { class: 'awards' }, j.titles.map((t) =>
        h('div', { class: 'award' },
          h('div', { class: 'award-title' }, icon('star', 14), t.title),
          h('b', null, t.name),
          h('div', { class: 'muted small' }, `${t.desc} : ${t.value}`))))
    : null;

  const table = h('div', { class: 'table-wrap' },
    h('table', { class: 'journal-table' },
      h('thead', null, h('tr', null,
        h('th', null, 'Joueur'),
        h('th', { colspan: 4, class: 'good' }, 'Générosité'),
        h('th', { colspan: 4, class: 'bad' }, 'Coups bas'),
        h('th', null, 'Dégâts'), h('th', null, 'Encaissé')),
        h('tr', { class: 'sub' }, h('th'), ['Objets donnés', 'XP partagée', 'PV soignés', 'Résurrections', 'Tentés', 'Réussis', 'Rebondis', 'Subis', '', ''].map((t) => h('th', null, t)))),
      h('tbody', null, j.rows.map((r) =>
        h('tr', null,
          h('td', null, h('b', null, r.name)),
          h('td', null, r.generosity.itemsGiven), h('td', null, r.generosity.xpShared), h('td', null, r.generosity.healingDone), h('td', null, r.generosity.revivesDone),
          h('td', null, r.lowBlows.tried), h('td', null, r.lowBlows.succeeded), h('td', null, r.lowBlows.rebounded), h('td', null, r.lowBlows.suffered),
          h('td', null, r.damageDealt), h('td', null, r.damageTaken))))));

  const socials = j.social.filter((e) => e.kind !== 'ghost' || true);
  const timeline = socials.length
    ? h('ul', { class: 'timeline' }, socials.map((e) => h('li', { class: `ev-${e.kind}` }, h('span', { class: 'muted small' }, `Tour ${e.turn + 1} · `), socialText(run, e))))
    : h('p', { class: 'muted' }, 'Aucun don, partage ni coup bas pendant cette run : une équipe bien sage...');

  const fullLog = h('details', { class: 'full-log' },
    h('summary', null, 'Voir tout le journal de la run'),
    h('div', { class: 'log-list tall' }, run.log.map((l) => h('div', { class: `log-line k-${l.kind}` }, l.text))));

  const sameTeam = app.profile.lastTeam;
  root.append(h('div', { class: 'end-screen' },
    banner,
    h('div', { class: 'end-actions' },
      h('button', { class: 'btn btn-primary btn-xl', id: 'end-menu', onClick: () => go('menu') }, 'Retour au menu'),
      roomRun
        ? null // (à plusieurs, le salon est fermé : pour rejouer, on en recrée un depuis l'accueil)
        : h('button', {
            class: 'btn btn-xl',
            onClick: () => startRun({ tranche: run.setup.tranche, mode: run.setup.mode, stasisLevel: run.setup.stasisLevel || 1 }, sameTeam.filter((id) => app.profile.characters.some((c) => c.id === id)))
          }, icon('d20', 22), 'Rejouer avec la même équipe')),
    roomRun ? h('p', { class: 'muted small end-room-note' }, icon('user', 14), ' Partie à plusieurs : chacun reçoit les récompenses de son propre héros. Pour rejouer ensemble, créez un nouveau salon.') : null,
    h('h2', null, 'Récompenses'),
    h('div', { class: 'end-players' }, playerCards),
    h('h2', null, 'Journal de partie'),
    awards,
    h('div', { class: 'card' }, h('h3', null, 'Qui a fait quoi ?'), table),
    h('div', { class: 'card' }, h('h3', null, 'Moments marquants'), timeline),
    fullLog));
}

// ============================================================
//  Bilan d'une session de farm
// ============================================================

function renderFarmEnd(root, run) {
  const res = run.result;
  const c = app.content;
  const ch = app.profile.characters.find((x) => x.id === res.charId);
  const pending = ch?.lootChoice?.length ? ch.lootChoice : null;

  const title = { stop: 'SESSION TERMINÉE', defeat: 'TU ES TOMBÉ...', abandon: 'TU QUITTES LA ZONE' }[res.outcome] || 'SESSION TERMINÉE';
  const subtitle = {
    stop: res.choices?.length ? 'Tu repars avec tes éclats. Choisis maintenant ton objet.' : 'Tu repars avec tout ce que tu as gagné.',
    defeat: `Tu es tombé dans la vague ${res.diedAtWave} : elle ne rapporte rien, mais tout le reste est à toi.`,
    abandon: 'Tu as quitté la zone : la vague en cours ne rapporte rien, tout le reste est à toi.'
  }[res.outcome];
  const banner = h('div', { class: `end-banner ${res.outcome === 'defeat' ? 'lose' : 'win'}` },
    h('h1', null, title),
    h('p', null, subtitle),
    h('div', { class: 'end-facts' },
      h('span', null, icon('beast', 16), res.zoneName),
      h('span', null, icon('target', 16), `${res.waves} vague${res.waves > 1 ? 's' : ''} vaincue${res.waves > 1 ? 's' : ''}`),
      h('span', null, icon('skull', 16), `${res.kills} monstre${res.kills > 1 ? 's' : ''} abattu${res.kills > 1 ? 's' : ''}`),
      h('span', null, icon('flame', 16), `+${res.shards || 0} éclats`)));

  const x = res.xp;
  const xpCard = h('div', { class: 'card end-player' },
    h('div', { class: 'end-player-head' },
      portrait(res.classId, 48),
      h('div', null,
        h('div', { class: 'unit-name' }, res.name),
        h('div', { class: 'muted small' }, `${CLASS_NAME(res.classId)} · niv. ${x.levelAfter}`)),
      h('div', { class: 'xp-total' },
        x.catchUp ? h('b', null, `+${x.applied} XP`) : h('b', null, `+${res.shards || 0} éclats`),
        x.levelAfter > x.levelBefore ? h('div', { class: 'level-up' }, icon('star', 16), `Niveau ${x.levelBefore} → ${x.levelAfter} !`) : null)),
    ch ? xpBar(ch) : null,
    x.catchUp
      ? h('p', { class: 'muted small' }, `XP de rattrapage, jusqu'au niveau ${x.maxLevel} (celui de ton meilleur héros).`)
      : h('p', { class: 'muted small' }, 'C\'est ton héros le plus avancé : le farm ne lui donne pas d\'XP (il sert à faire rattraper les autres). Ses éclats vont à la forge.'));

  // La récompense : 1 objet parmi 3, à choisir ici même
  const lootCard = h('div', { class: 'card farm-loot' },
    h('h3', null, icon('treasure', 20), ' Ta récompense'),
    !res.choices?.length
      ? h('p', { class: 'muted' }, 'Aucune vague vaincue : pas d\'objet cette fois.')
      : pending
        ? [
            h('p', { class: 'muted small' }, 'Garde un objet ; les autres deviennent des éclats pour la forge.'),
            h('div', { class: 'loot-choices' }, pending.map((inst, i) => {
              const others = pending.filter((o) => o !== inst).reduce((t, o) => t + salvageValue(c, o), 0);
              return h('div', { class: 'loot-choice reveal-item', style: { '--i': i }, dataset: { uid: inst.uid, item: inst.id } },
                itemCard(c, inst, { realLevel: ch.level }),
                h('button', { class: 'btn btn-primary loot-pick', onClick: async () => {
                  const r = await characterAction({ type: 'CHAR_PICK_LOOT', charId: ch.id, uid: inst.uid });
                  if (r.ok) { play('heal'); toast(`${c.items[r.picked.id].name} est dans ton sac${r.shards ? ` (+${r.shards} éclats)` : ''}.`, 'good'); redraw(); }
                } }, icon('check', 16), 'Garder', h('small', null, ` · +${others} éclats`)));
            }))
          ]
        : h('p', { class: 'tone-good' }, icon('check', 14), ' Récompense choisie : elle est dans ton sac.'));

  const unlocked = app.unlocked || [];
  const achCard = unlocked.length
    ? h('div', { class: 'card ach-news' },
        h('h3', null, icon('star', 20), ' Succès débloqués !'),
        unlocked.map((u) => h('div', { class: 'ach-card unlocked' },
          h('div', { class: 'ach-icon' }, icon(u.achievement.icon || 'star', 26)),
          h('div', { class: 'ach-body' }, h('b', null, u.achievement.name), h('div', { class: 'small' }, u.achievement.desc), h('div', { class: 'small ach-rewards' }, icon('gift', 12), ' ', rewardTexts(c, u.achievement).join(' · '))))))
    : null;

  root.append(h('div', { class: 'end-screen farm-end' },
    banner,
    h('div', { class: 'end-actions' },
      h('button', {
        class: 'btn btn-primary btn-xl', id: 'farm-again', disabled: !ch || !!pending, title: pending ? 'Choisis d\'abord ta récompense.' : '',
        onClick: () => ch && startFarm(ch.id, res.zoneId)
      }, icon('beast', 22), 'Rejouer une session'),
      h('button', { class: 'btn btn-xl', id: 'farm-menu', onClick: () => go('menu') }, 'Retour au menu')),
    h('div', { class: 'end-players' }, xpCard, lootCard),
    achCard,
    h('details', { class: 'full-log' },
      h('summary', null, 'Voir tout le journal de la session'),
      h('div', { class: 'log-list tall' }, run.log.map((l) => h('div', { class: `log-line k-${l.kind}` }, l.text))))));
}
