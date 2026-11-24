// Charge les fichiers JSON de /data côté Node (pour les tests), sans navigateur.
//
// Curseurs de réglage rapides (EN MÉMOIRE seulement, les JSON ne changent pas) :
//   TUNE="1:0.8:1,4:1:1" node tests/simulate.mjs
// = pour chaque tranche  tranche:coef_attaque:coef_PV  (appliqué à tous ses monstres)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContent, DATA_FILES } from '../src/core/content.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Les JSON bruts (utile pour les tests qui veulent les modifier avant buildContent), PLUS les classes de test
 * (`tests/fixtures/classes-de-test.json` : les quatre premières classes, retirées du jeu, qui exercent encore le moteur
 * et servent de référence d'équilibrage). `{ legacy: false }` : les JSON du jeu seuls.
 */
export function loadRaw({ legacy = true } = {}) {
  const raw = {};
  for (const f of DATA_FILES) raw[f] = JSON.parse(readFileSync(join(here, '..', 'data', `${f}.json`), 'utf8'));
  if (legacy) Object.assign(raw.classes.classes, JSON.parse(readFileSync(join(here, 'fixtures', 'classes-de-test.json'), 'utf8')).classes);
  return raw;
}

/** Le contenu (avec les classes de test, sauf `{ legacy: false }` : voir loadRaw). */
export function loadContent({ legacy = true } = {}) {
  const raw = loadRaw({ legacy });
  for (const part of (process.env.TUNE || '').split(',').filter(Boolean)) {
    const [tranche, atk, hp] = part.split(':').map(Number);
    for (const m of raw.monsters.monsters) {
      if (m.tranche !== tranche) continue;
      m.atk = +(m.atk * atk).toFixed(2);
      m.hp = Math.round(m.hp * hp);
    }
  }
  // Retouches de compétences (EN MÉMOIRE) : PATCH=fichier.json, au format { "id_competence": { "effects.0.power": 1.2, "pa": 3 } }
  if (process.env.PATCH) {
    const patch = JSON.parse(readFileSync(process.env.PATCH, 'utf8'));
    const all = Object.values(raw.classes.classes).flatMap((c) => c.skills || []);
    for (const [id, changes] of Object.entries(patch)) {
      const sk = all.find((x) => x.id === id);
      if (!sk) throw new Error(`PATCH : compétence inconnue ${id}`);
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split('.');
        let o = sk;
        for (const k of keys.slice(0, -1)) o = o[k];
        if (!(keys.at(-1) in o) && value !== null) console.warn(`PATCH : ${id}.${path} n'existait pas`);
        if (value === null) delete o[keys.at(-1)]; else o[keys.at(-1)] = value;
      }
    }
  }
  return buildContent(raw);
}
