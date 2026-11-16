// ============================================================
//  keys.js — Les raccourcis clavier des compétences (la « barre d'action » à la MMORPG)
// ============================================================
// Les touches de la RANGÉE DU HAUT lancent les compétences 1, 2, 3, 4...
//   - sur un clavier AZERTY, ce sont  &  é  "  '  (  -  è  _  ç  à  (sans Maj)
//   - sur un QWERTY, ce sont 1 2 3 4 5 6 7 8 9 0
// On lit la POSITION de la touche (event.code : « Digit1 », « Digit2 »...) et non le caractère (event.key) :
// c'est ce qui fait marcher la même touche physique quelle que soit la disposition du clavier.
// (Avec event.key, un clavier AZERTY donnerait « & » au lieu de « 1 », et seul « Maj + & » aurait marché.)
// Le pavé numérique fonctionne aussi.
//
// Ce fichier ne dépend d'aucun écran : il sait seulement quelle case correspond à une touche, et quel texte écrire
// sur la case (la VRAIE touche du clavier du joueur, pas forcément un chiffre).

/** La rangée du haut d'un clavier AZERTY : de la touche « 1 » à la touche « 0 ». */
const AZERTY_ROW = ['&', 'é', '"', "'", '(', '-', 'è', '_', 'ç', 'à'];
/** Combien de cases peuvent avoir un raccourci (une par touche de la rangée : 1 à 9, puis 0). */
export const HOTKEY_COUNT = 10;

/** Ce qu'on a appris du clavier : { 'Digit1': '&', ... }. */
const known = {};
/** Les claviers AZERTY (français de France, Belgique...) : on y écrit « & é " ' » avant même d'avoir pu lire la disposition. */
const looksAzerty = () => /^fr(-(FR|BE|LU|MC))?$/i.test((typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || '');

const codeOf = (i) => `Digit${(i + 1) % 10}`;

/**
 * Le numéro (0, 1, 2...) de la case que cette touche lance, ou -1 si ce n'est pas une touche de raccourci.
 * Accepte la rangée du haut (avec ou sans Maj) et le pavé numérique.
 */
export function hotkeyIndex(e) {
  const m = /^(Digit|Numpad)(\d)$/.exec(e.code || '');
  if (m) {
    // Pavé numérique sans verrouillage : les touches « 1 » à « 9 » sont des flèches, Fin, Début... : on n'y touche pas.
    if (m[1] === 'Numpad' && !/^\d$/.test(e.key)) return -1;
    return (Number(m[2]) + 9) % 10;
  }
  // Repli pour les claviers virtuels qui ne donnent pas de « code » : on regarde le caractère.
  const i = AZERTY_ROW.indexOf(e.key);
  if (i >= 0) return i;
  if (/^\d$/.test(e.key || '')) return (Number(e.key) + 9) % 10;
  return -1;
}

/** Le texte à écrire sur la case n° i : « & », « é », « " »... sur AZERTY ; « 1 », « 2 »... ailleurs. */
export function keyLabel(i) {
  if (i < 0 || i >= HOTKEY_COUNT) return '';
  return known[codeOf(i)] || (looksAzerty() ? AZERTY_ROW[i] : String((i + 1) % 10));
}

/**
 * Apprend la disposition du clavier à partir d'une frappe : si le joueur appuie sur la touche « Digit2 » et obtient « é »,
 * alors la case n° 2 s'écrit « é ». Renvoie true si on vient d'apprendre quelque chose de nouveau (l'affichage doit être mis à jour).
 * On ignore les frappes avec Maj, Alt, Ctrl ou Verr. Maj : elles donnent des chiffres ou d'autres symboles.
 */
export function learnKey(e) {
  if (!/^Digit\d$/.test(e.code || '') || !e.key || e.key.length !== 1) return false;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return false;
  if (e.getModifierState && e.getModifierState('CapsLock')) return false;
  if (known[e.code] === e.key) return false;
  known[e.code] = e.key;
  return true;
}

/**
 * Demande au navigateur la disposition du clavier (API « Keyboard Map », disponible sur Chrome et Edge).
 * `onChange` est rappelé quand elle est connue. Ailleurs (Firefox, Safari) ou dans une page isolée qui n'a pas le droit,
 * on ne fait rien : l'affichage se corrige tout seul à la première frappe (voir learnKey).
 */
export function detectKeyboardLayout(onChange) {
  try {
    const kb = typeof navigator !== 'undefined' ? navigator.keyboard : null;
    if (!kb || !kb.getLayoutMap) return;
    kb.getLayoutMap().then((map) => {
      let changed = false;
      for (let i = 0; i < HOTKEY_COUNT; i++) {
        const v = map.get(codeOf(i));
        if (v && v.length === 1 && known[codeOf(i)] !== v) { known[codeOf(i)] = v; changed = true; }
      }
      if (changed) onChange();
    }).catch(() => {});
  } catch { /* pas de disposition lisible : tant pis */ }
}

/** Les quatre premières touches, pour les phrases d'aide : « & é " ' ». */
export const firstKeys = (n = 4) => Array.from({ length: n }, (_, i) => keyLabel(i)).join(' ');
