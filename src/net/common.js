// ============================================================
//  common.js — Ce que les deux « passerelles » (locale et en ligne) ont en commun
// ============================================================
// Une PASSERELLE est la seule porte entre l'interface et les personnages / les parties :
//   - la passerelle LOCALE (local-gateway.js) garde tout dans le navigateur : c'est le jeu solo, et la démo publiée ;
//   - la passerelle EN LIGNE (remote-gateway.js) parle au serveur, qui garde tout et applique les règles.
// L'interface (écrans) ne sait pas laquelle elle utilise : elle appelle `app.gateway.character(...)`, `app.gateway.act(...)`, etc.
//
// Ce que toute passerelle offre :
//   mode                'local' | 'online'
//   user                { id, name } ou null
//   profile             { characters, settings, lastTeam, lastSetup, nextCharNumber }  (les personnages sont ceux du joueur)
//   canExport           le joueur peut-il exporter / importer des codes de sauvegarde ? (jeu local seulement)
//   savePrefs()         enregistre les préférences (son, minuteur, dernière équipe...) ; en local, tout le profil
//   character(action)   une action sur un personnage (voir src/core/profile-actions.js) -> { ok, error?, character?, deletedId?, opened?, unlocked:[succès] }
//   savedRunInfo()      résumé de la partie en cours (ou null)
//   startDungeon(setup, charIds, { replace }), startFarm(charId, { replace, zoneId }), resumeRun(), discardRun()   -> { ok, error?, run? }
//   act(run, action)    une action de partie -> { ok, error?, events, run, ended, unlockedList:[{ charId, charName, achievement }] }
//   room, rooms         (en ligne) mon salon et la liste des salons ouverts ; les gestes des salons : createRoom, joinRoom, leaveRoom, roomHero...
//   connect(handlers)   (en ligne) le temps réel : les autres joueurs changent le salon ou la partie, on le reçoit tout de suite
//   reloadContent()     relit les données du jeu (Atelier de classes)
//   logout()

import { createEmptyProfile } from '../storage/profile.js';

/**
 * Après une action sur un personnage : met à jour les préférences qui y faisaient référence
 * (un personnage supprimé disparaît de la dernière équipe et du choix du farm).
 */
export function afterCharacterResult(profile, res) {
  if (res.ok && res.deletedId) {
    profile.lastTeam = profile.lastTeam.filter((id) => id !== res.deletedId);
    if (profile.settings.farmChar === res.deletedId) profile.settings.farmChar = null;
  }
}

/**
 * Rattache à une partie reçue du serveur son « dossier réseau » (run.net), sans qu'il fasse partie de l'état du jeu :
 *   runId, rev   quelle partie, et sa version (elle augmente à chaque action : on ignore les messages déjà vus) ;
 *   me, you      mon compte, et mes héros dans cette partie ;
 *   room         le salon (null en solo) ;
 *   timer        le décompte du tour : { seconds, total, deadline } (deadline : l'heure d'ici, en ms) ou null.
 */
export function attachNet(run, payload, myUserId) {
  const timer = payload.timer ? { seconds: payload.timer.seconds, total: payload.timer.total, deadline: Date.now() + payload.timer.remainingMs } : null;
  Object.defineProperty(run, 'net', {
    value: { runId: payload.runId ?? null, rev: payload.rev ?? 0, me: myUserId ?? null, you: payload.you || [], room: payload.room || null, timer },
    enumerable: false, writable: true, configurable: true
  });
  return run;
}

/** Un profil vide, avec ses préférences par défaut. */
export function emptyProfile() {
  return createEmptyProfile();
}

/** La partie des préférences d'un profil (ce qui reste dans le navigateur même en ligne). */
export function prefsOf(profile) {
  return { settings: profile.settings, lastTeam: profile.lastTeam, lastSetup: profile.lastSetup };
}

/** Applique des préférences lues dans le navigateur (en vérifiant leur forme : le stockage local peut contenir n'importe quoi). */
export function applyPrefs(profile, raw) {
  if (!raw || typeof raw !== 'object') return profile;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const d = profile.settings;
  profile.settings = {
    ...d,
    sound: !!s.sound,
    volume: Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : 0.7,
    fx: ['full', 'fast', 'min'].includes(s.fx) ? s.fx : null,
    turnSeconds: Number.isFinite(s.turnSeconds) && s.turnSeconds >= 0 && s.turnSeconds <= 600 ? s.turnSeconds : 0,
    training: s.training && typeof s.training === 'object' ? s.training : null,
    view: ['farm', 'expeditions'].includes(s.view) ? s.view : 'dungeon',
    farmChar: typeof s.farmChar === 'string' ? s.farmChar : null,
    farmZone: typeof s.farmZone === 'string' ? s.farmZone : null,
    place: ['camp', 'aventure', 'heros', 'forge', 'grimoire'].includes(s.place) ? s.place : null
  };
  if (Array.isArray(raw.lastTeam)) profile.lastTeam = raw.lastTeam.filter((id) => typeof id === 'string').slice(0, 4);
  if (raw.lastSetup && typeof raw.lastSetup === 'object') {
    profile.lastSetup = {
      tranche: Number(raw.lastSetup.tranche) || profile.lastSetup.tranche,
      mode: typeof raw.lastSetup.mode === 'string' ? raw.lastSetup.mode : profile.lastSetup.mode,
      stasisLevel: Number(raw.lastSetup.stasisLevel) || 1
    };
  }
  return profile;
}
