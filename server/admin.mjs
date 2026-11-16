// ============================================================
//  admin.mjs — L'outil d'administration (en ligne de commande)
// ============================================================
// Usage :  node server/admin.mjs <commande>
//
//   stats                              l'état du serveur : comptes, personnages, parties, taille de la base
//   users                              la liste des comptes
//   passwd <pseudo> [mot_de_passe]     « mot de passe oublié » : change le mot de passe d'un compte. Sans mot de passe donné,
//                                      un mot de passe au hasard est choisi et affiché. Le compte est déconnecté partout.
//   delete <pseudo> --yes              supprime un compte, ses personnages et sa partie en cours (DÉFINITIF)
//   backup [dossier] [--keep=N]        copie cohérente de la base (par défaut dans var/backups ; on garde les 14 dernières)
//
// On peut le lancer pendant que le serveur tourne. Il lit les mêmes réglages que lui (DONJON_DB...). Voir docs/SERVEUR.md.

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.mjs';
import { openDatabase } from './db.mjs';
import { createStore } from './store.mjs';
import { checkName, checkPassword, hashPassword } from './auth.mjs';

/** Une erreur « normale » (mauvaise commande, compte inconnu...) : on l'affiche sans le détail technique. */
export class AdminError extends Error {}

const USAGE = `Outil d'administration du serveur Donjon

  node server/admin.mjs stats                          l'état du serveur
  node server/admin.mjs users                          la liste des comptes
  node server/admin.mjs passwd <pseudo> [mot_de_passe] mot de passe oublié (sans mot de passe donné : un au hasard)
  node server/admin.mjs delete <pseudo> --yes          supprime un compte (définitif)
  node server/admin.mjs backup [dossier] [--keep=N]    sauvegarde la base (on garde les N plus récentes, 14 par défaut)

Le serveur peut tourner pendant ce temps. La base utilisée est celle de DONJON_DB (par défaut var/donjon.sqlite).`;

const COMMANDS = new Set(['stats', 'users', 'passwd', 'delete', 'backup']);
const BACKUP_NAME = /^donjon-\d{8}-\d{6}\.sqlite$/; // (le ménage ne touche QUE aux fichiers de ce nom)

const fmtDate = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '—');
const fmtSize = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);
/** 20261104-101530 (heure UTC) : les noms de sauvegarde se trient dans l'ordre du temps. */
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function dbSize(path) {
  if (path === ':memory:') return 0;
  let total = 0;
  for (const p of [path, `${path}-wal`]) {
    try { total += statSync(p).size; } catch { /* pas de fichier -wal : normal quand personne n'écrit */ }
  }
  return total;
}

/**
 * Lance une commande. Renvoie le code de sortie (0 = tout va bien).
 * @param args   les mots de la ligne de commande, sans « node admin.mjs »
 * @param opts   { config, db (une base déjà ouverte : tests), out (où écrire), now }
 */
export async function runAdmin(args, opts = {}) {
  const config = opts.config ?? loadConfig();
  const out = opts.out ?? ((line = '') => console.log(line));
  const now = opts.now ?? new Date();
  const [cmd, ...rest] = args;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    out(USAGE);
    return 0;
  }
  if (!COMMANDS.has(cmd)) throw new AdminError(`Commande inconnue : « ${cmd} ».\n\n${USAGE}`);
  const flags = rest.filter((a) => a.startsWith('--'));
  const params = rest.filter((a) => !a.startsWith('--'));
  for (const f of flags) if (f !== '--yes' && !/^--keep=/.test(f)) throw new AdminError(`Option inconnue : ${f}`);

  const own = !opts.db;
  if (own && config.dbPath !== ':memory:' && !existsSync(config.dbPath)) {
    throw new AdminError(`Aucune base de données à cet endroit : ${config.dbPath}\n(Le serveur la crée à son premier lancement. Si elle est ailleurs : DONJON_DB=/chemin/donjon.sqlite node server/admin.mjs ${cmd})`);
  }
  const db = opts.db ?? await openDatabase(config.dbPath);
  const store = createStore(db);

  /** Retrouve un compte par son pseudo (sans tenir compte des majuscules ni des accents, comme à la connexion). */
  const findUser = (raw) => {
    if (!raw) throw new AdminError(`Il faut donner un pseudo.   Exemple : node server/admin.mjs ${cmd} Alice`);
    const n = checkName(raw);
    const row = n.key ? store.userByKey(n.key) : null;
    if (!row) throw new AdminError(`Aucun compte « ${raw} ». (node server/admin.mjs users : la liste des comptes)`);
    return row;
  };

  try {
    switch (cmd) {
      case 'stats': {
        const s = store.stats();
        out(`Base de données   ${config.dbPath}  (${fmtSize(dbSize(config.dbPath))})`);
        out(`Comptes           ${s.users}`);
        out(`Personnages       ${s.characters}`);
        out(`Parties en cours  ${s.runs}`);
        out(`Sessions ouvertes ${store.countSessions()}  (une par appareil connecté)`);
        return 0;
      }

      case 'users': {
        const users = store.listUsers();
        if (!users.length) {
          out('Aucun compte pour le moment.');
          return 0;
        }
        const w = Math.max(6, ...users.map((u) => u.name.length));
        out(`${'id'.padStart(3)}  ${'pseudo'.padEnd(w)}  ${'créé (UTC)'.padEnd(16)}  ${'dernière connexion'.padEnd(18)}  persos`);
        for (const u of users) out(`${String(u.id).padStart(3)}  ${u.name.padEnd(w)}  ${fmtDate(u.created_at).padEnd(16)}  ${fmtDate(u.last_login).padEnd(18)}  ${u.characters}`);
        return 0;
      }

      case 'passwd': {
        const row = findUser(params[0]);
        const given = params[1];
        const password = given ?? randomBytes(9).toString('base64url');
        const p = checkPassword(password);
        if (p.error) throw new AdminError(p.error);
        const { salt, hash } = await hashPassword(p.password, config.scryptCost);
        store.setPassword(row.id, salt, hash);
        store.deleteSessionsOfUser(row.id); // (si quelqu'un d'autre avait la session, elle ne marche plus)
        out(`Le mot de passe de « ${row.name} » est changé ; ce compte est déconnecté de tous ses appareils.`);
        if (!given) out(`Nouveau mot de passe :  ${password}`);
        out('Transmets-le à son propriétaire : il peut en choisir un autre dans le jeu (bouton de son compte, en haut à droite).');
        return 0;
      }

      case 'delete': {
        const row = findUser(params[0]);
        const info = store.listUsers().find((u) => u.id === row.id);
        if (!flags.includes('--yes')) {
          out(`« ${row.name} » a ${info.characters} personnage(s). Supprimer ce compte effacerait aussi ses personnages et sa partie en cours : c'est DÉFINITIF.`);
          out(`Pour confirmer :  node server/admin.mjs delete ${params[0]} --yes`);
          return 1;
        }
        store.deleteUser(row.id);
        out(`Le compte « ${row.name} » est supprimé (avec ${info.characters} personnage(s) et sa partie en cours).`);
        return 0;
      }

      case 'backup': {
        const keepFlag = flags.find((f) => f.startsWith('--keep='));
        const keep = keepFlag ? Number(keepFlag.slice('--keep='.length)) : 14;
        if (!Number.isInteger(keep) || keep < 1) throw new AdminError('--keep=N : un nombre entier, 1 au moins.');
        const dir = resolve(params[0] || join(dirname(config.dbPath), 'backups'));
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `donjon-${stamp(now)}.sqlite`);
        if (existsSync(file)) throw new AdminError(`${file} existe déjà (une sauvegarde par seconde au plus).`);
        db.prepare('VACUUM INTO ?').run(file); // une copie cohérente, même si le serveur écrit en même temps
        // Ménage : on ne garde que les `keep` sauvegardes les plus récentes (et on ne touche à aucun autre fichier du dossier).
        const names = readdirSync(dir).filter((n) => BACKUP_NAME.test(n)).sort();
        const old = names.slice(0, Math.max(0, names.length - keep));
        for (const n of old) unlinkSync(join(dir, n));
        out(`Sauvegarde faite : ${file}  (${fmtSize(statSync(file).size)})`);
        out(`${names.length - old.length} sauvegarde(s) gardée(s) dans ${dir}${old.length ? `, ${old.length} ancienne(s) supprimée(s)` : ''}.`);
        return 0;
      }
    }
  } finally {
    if (own) db.close();
  }
  return 0;
}

// Lancé depuis le terminal (et non importé par les tests) :
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAdmin(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      if (e instanceof AdminError) console.error(`\n${e.message}\n`);
      else console.error(e);
      process.exit(1);
    }
  );
}
