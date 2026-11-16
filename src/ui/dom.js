// ============================================================
//  dom.js — Petit outil pour fabriquer des éléments HTML en JavaScript
// ============================================================
// Au lieu d'écrire du HTML dans des textes, on écrit :
//     h('button', { class: 'btn', onClick: () => alert('salut') }, 'Cliquez-moi')
// ce qui crée <button class="btn">Cliquez-moi</button> avec son événement.

/**
 * Crée un élément.
 * @param tag       nom de la balise ('div', 'button'...)
 * @param attrs     attributs : class, style (objet), onClick (fonction), dataset (objet), html, ...
 * @param children  contenu : textes, autres éléments, tableaux (ignorés si null/false)
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      // Attention : `el.style['--rar'] = ...` ne crée PAS une variable CSS (elle serait ignorée en silence).
      // Il faut passer par setProperty pour les variables (--xxx) et les noms avec tiret.
      for (const [prop, v] of Object.entries(value)) {
        if (v === null || v === undefined || v === false) continue;
        if (prop.includes('-')) el.style.setProperty(prop, String(v));
        else el.style[prop] = v;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

/** Ajoute des enfants (textes ou éléments) à un élément. */
export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Vide un élément. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Raccourci pour ranger des éléments dans un conteneur déjà existant. */
export function mount(container, ...children) {
  clear(container);
  return append(container, children);
}
