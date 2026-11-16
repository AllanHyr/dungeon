// ============================================================
//  data-loader.js — Charge les fichiers JSON du dossier /data dans le navigateur
// ============================================================

import { buildContent, DATA_FILES } from './core/content.js';

/** Télécharge tous les fichiers de données et construit le contenu du jeu. */
export async function loadContent(baseUrl = 'data/') {
  const raw = {};
  await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(`${baseUrl}${name}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Impossible de charger ${name}.json (${res.status})`);
      try {
        raw[name] = await res.json();
      } catch (e) {
        throw new Error(`Le fichier ${name}.json contient une erreur de syntaxe : ${e.message}`);
      }
    })
  );
  return buildContent(raw);
}
