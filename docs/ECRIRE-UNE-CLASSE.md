# Écrire une classe (guide complet)

Tout se passe dans **`data/classes.json`**. Tu n'as jamais besoin de toucher au code : une classe est une liste de
compétences, et chaque compétence est une petite recette en JSON que le moteur sait exécuter.

> Les exemples de ce guide viennent souvent des **quatre premières classes** (Berserker, Veilleur, Druide, Duelliste) : elles sont **retirées du jeu**
> mais gardées dans `tests/fixtures/classes-de-test.json` (les tests s'en servent). Les classes jouables (Sacrieur, Assassin, Templier, Prêtre, Guerrier)
> sont des exemples complets. Copie-les, casse-les, recommence : c'est fait pour ça.

---

## 1. Tester en 10 secondes : l'Atelier de classes

1. Lance le jeu, clique sur **Atelier de classes** (en haut de l'accueil).
2. Choisis 1 à 4 personnages de test (classe + niveau) et des **mannequins** (inertes ou agressifs, 1 à 3, plus ou moins forts).
3. Tes personnages connaissent **toutes** les compétences de leur niveau : tu peux tout essayer d'un coup.
4. La barre du haut mesure tes **dégâts par round**, tes soins et boucliers.
5. Tu modifies `data/classes.json` dans ton éditeur, puis tu cliques sur **Recharger les JSON** : la salle est refaite avec tes changements, sans recharger la page.

Si tu fais une faute dans le JSON, le jeu l'explique en français (par exemple : `compétence "x" : 'target' "ennemi" inconnue. Cibles connues : enemy, enemies, ally…`).

---

## 2. Le squelette d'une classe

```json
"berserker": {
  "name": "Berserker",
  "aliases": ["tank"],              // anciens noms (les vieilles sauvegardes sont converties)
  "role": "tank",                   // tank | healer | damage : couleur du médaillon seulement
  "icon": "axe",                    // une icône de src/ui/icons.js (axe, cross, leaf, sword, shield...)
  "description": "Plus il est blessé, plus il frappe fort.",
  "baseStats": { "hp": 60, "atk": 6, "def": 4, "heal": 0, "save": 2, "luck": 0, "ini": 8 },
  "growth":    { "hp": 9, "atk": 1.3, "def": 1.2, "heal": 0, "ini": 0.3 },
  "startRow": "front",              // front (devant) | back (derrière)
  "classSkill": "berserker_provocation", // le SORT DE CLASSE (son propre emplacement en combat) : une compétence ACTIVE avec "innate": true
  "basicAttack": "berserker_entaille",   // facultatif : une compétence de départ (ACTIVE, "innate": true) équipée dans le deck dès la création
  "resource": { "id": "elan", "name": "Élan", "max": 5, "start": 0 },   // facultatif (voir §9)
  "branches": {                      // facultatif : une phrase par branche de l'arbre (affichée dans la fiche)
    "Fureur": { "desc": "Frapper très fort, quitte à rater." },
    "Sang":   { "desc": "Vivre sur le fil : se saigner pour frapper plus fort." }
  },
  "skills": [ ... ]
}
```

`branches` : le nom doit être exactement celui d'un `"branch"` de compétence (sinon le jeu refuse le fichier et le dit). Sans `branches`, l'arbre marche
quand même : il n'y a juste pas de phrase sous le nom de la branche.

### Les statistiques

| Stat | Rôle |
| --- | --- |
| `hp` | points de vie |
| `atk` | force des dégâts. Dégâts = `atk² / (atk + déf de la cible)`, multiplié par la `power` de la compétence |
| `def` | réduit les dégâts reçus (même formule) |
| `heal` | force des soins **et des boucliers** |
| `save` | ajouté aux jets de sauvegarde des pièges (hors combat) |
| `luck` | ajouté à **tous** les D20 du joueur, y compris ceux des compétences (plus de critiques, moins d'échecs) |
| `ini` | initiative : place dans la frise (les camps alternent, avec un peu de hasard) |
| `pa` | points d'action par tour : 6 de base, plus objets / passifs / buffs, plafonné à `maxPa` (12) : voir §10 |

À un niveau `L` : `stat = baseStats + growth × (L − 1)`, puis les objets, puis les modificateurs.
Un personnage de **niveau effectif** plus bas (modes Tranche / Stasis) utilise ce niveau-là, pas son niveau réel.

---

## 3. Une compétence ACTIVE

```json
{
  "id": "berserker_colere", "name": "Colère", "type": "active",
  "level": 1, "cost": 1,                     // niveau requis, coût en points de compétence
  "branch": "Fureur", "tier": 1,             // rangement dans l'arbre de la fiche (voir « L'arbre de compétences » plus bas)
  "icon": "bolt",                            // facultatif pour une active (déduite de son effet), recommandé pour un passif
  "requires": ["autre_competence"],          // facultatif : il faut d'abord l'apprendre
  "exclusiveWith": ["autre_competence"],     // facultatif : incompatible avec
  "desc": "Rate presque toujours, mais si ça touche, ça fait TRÈS mal.",
  "pa": 4,                                   // coût en points d'action
  "target": "enemy",
  "range": "melee",
  "dice": { "fumble": 15, "crit": 20, "onFumble": "miss" },
  "effects": [ { "type": "damage", "power": 6 } ]
}
```

| Champ | Valeurs | Sens |
| --- | --- | --- |
| `pa` | nombre | coût en PA (au moins 1 pour une vraie compétence) |
| `target` | `enemy` `enemies` `ally` `allies` `self` `deadAlly` `lowestAlly` | `enemy`/`ally`/`deadAlly` : le joueur **choisit** ; `enemies`/`allies` : tout le camp ; `lowestAlly` : l'allié le plus blessé (automatique) |
| `range` | `melee` (défaut) `ranged` `any` | `melee` ne touche que le rang **avant** ennemi tant qu'il y reste quelqu'un ; `ranged` et `any` touchent tout le monde |
| `from` | `["front"]`, `["back"]`… | rang(s) d'où on peut la lancer |
| `cooldown` | N | utilisable **une fois tous les N tours de son propriétaire** (1 = une fois par tour) |
| `perCombat` | N | N fois par combat au maximum |
| `oncePerDungeon` | true | une fois par donjon (ex. Résurrection) |
| `spend` | `{ "id": "elan", "amount": 3 }` | dépense une ressource de la classe |
| `critEffects` | liste d'effets | **en plus** des effets normaux sur un critique |
| `fumbleEffects` | liste d'effets | appliqués sur un échec critique (ex. se blesser soi-même) |

### L'animation d'une compétence (`fx`, facultatif)

Sans rien écrire, le jeu **déduit** le geste d'une compétence : une attaque de mêlée fonce sur sa cible, une attaque à distance tire un projectile, un
soin fait monter des croix vertes, un bouclier fait naître un dôme... Pour choisir soi-même, on ajoute un champ `fx` :

```json
"fx": { "delivery": "projectile", "shot": "beam", "hit": "blast", "element": "holy", "weight": 2 }
```

| Champ | Valeurs | Sens |
| --- | --- | --- |
| `delivery` | `melee` `spin` `projectile` `smite` `wave` `self` `ally` `allies` | comment ça part : élan jusqu'à la cible · tourbillon (touche tous les ennemis) · tir · frappe venue d'en haut · onde · sur soi · sur un allié · sur tous les alliés |
| `hit` | `slash` `pierce` `smash` `claw` `bite` `blast` `splat` `sonic` `drain` `auto` | l'impact : entaille · estoc · coup lourd · griffes · morsure · explosion de magie · éclaboussure · onde · siphon · `auto` (selon l'espèce du monstre) |
| `element` | `physical` `holy` `fire` `poison` `nature` `shadow` `frost` `arcane` `blood` | la couleur (et la « touche » du son) |
| `shot` | `orb` `arrow` `beam` `thorn` `spit` `bolt` `wisp` | la forme du projectile |
| `support` | `heal` `shield` `guard` `buff` `haste` `taunt` `rage` `stun` `poison` `resurrect` `cleanse` `roots` `debuff` | l'effet non offensif qui accompagne le geste |
| `weight` | `1` léger · `2` normal · `3` lourd | taille des éclats, secousse de l'écran |
| `dash` | `long` | un élan plus long (fente) |
| `flurry` `cross` `drain` | `true` / `false` | rafale de coups · coup en croix · siphon |

Tout est facultatif, et **une faute est expliquée** au chargement des données (« fx.delivery "meele" inconnu. Valeurs connues : melee, spin... »).
Voir `docs/DIRECTION-ARTISTIQUE.md` § 4 pour le fonctionnement des animations.

**Compétence débloquée par un succès** : on ne l'écrit pas dans la classe, on la désigne comme récompense d'un succès (`data/achievements.json`,
récompense `{ "type": "skill", "skillId": "..." }`). Elle devient alors verrouillée pour tous les personnages jusqu'à ce succès (voir `docs/FARM-ET-SUCCES.md`).

### Le D20 de chaque compétence

Chaque compétence qui fait des dégâts lance un D20 (plus la `luck` du personnage) :

* jet `≤ fumble` → **échec critique** : la compétence ne fait rien (les PA sont quand même payés) ;
* jet `≥ crit` → **coup critique** : dégâts × 1,5 (`critMult` dans `rules.json`) + `critEffects` ;
* entre les deux : coup normal.

Par défaut : `fumble` 1, `crit` 20. Pour changer le **risque / la récompense** :

| Tu veux… | Écris |
| --- | --- |
| une compétence qui rate presque toujours mais cogne très fort | `"dice": { "fumble": 15, "crit": 20 }` + `power` énorme |
| une compétence qui ne rate **jamais** | `"dice": { "fumble": 0, "crit": 20 }` |
| beaucoup de critiques | `"dice": { "fumble": 1, "crit": 17 }` (17, 18, 19, 20 = critique) |
| un échec qui fait perdre le tour entier | `"onFumble": "endTurn"` (par défaut `"miss"` = juste raté) |
| pas de dé du tout (soin, bouclier…) | ne rien écrire (les compétences sans dégâts n'ont pas de dé) ; `"dice": false` retire le dé d'une compétence offensive |
| un dé sur un soin | `"dice": { "fumble": 1, "crit": 18 }` : il en aura un |

La petite **bande de 20 cases** affichée sous chaque compétence montre ce profil (rouge = échec, doré = critique).
Les objets et passifs peuvent décaler les seuils avec les stats `critShift` (ex. `-1` : critique dès 19) et `fumbleShift`.

---

### L'arbre de compétences (ce que le joueur voit dans la fiche)

L'onglet **Compétences** de la fiche dessine l'arbre à partir de ces champs :

* **une rangée par branche** (`"branch"`), avec ses compétences classées de gauche à droite par `tier` (1, 2, 3...) ;
* deux compétences avec le **même `tier`** dans la même branche s'affichent l'une sous l'autre (un choix : voir « Foi » du Veilleur) ;
* un trait relie un palier au suivant : plein = déjà pris, pointillé orange = on peut le prendre maintenant, gris = pas encore ;
* **carré = compétence active** (le coût en PA dans le coin), **rond = passive** ;
* trois états : *apprise* (laiton et lueur), *apprenable* (orange), *verrouillée* (grise, avec un cadenas) ;
* le panneau de droite montre la compétence choisie : description, bande de dé expliquée en français, et la **liste de toutes les conditions** pour l'apprendre
  (niveau, compétences à avoir d'abord `requires`, succès `unlockedBy`, incompatibilités `exclusiveWith`, points), chacune ✓ ou ✗ ;
* les compétences `"innate": true` forment la rangée « De départ » (toujours connues, gratuites).

**L'icône** d'une compétence : le champ `"icon"` l'emporte (une icône de `src/ui/icons.js` : sword, axe, shield, cross, leaf, bolt, target, refresh, poison, swap, up, down,
star, ghost, flame, heart, skull, eye, potion, timer, armor, trap, sun, moon, drop, wind...). Sans `icon`, une active prend l'icône de son effet
(un soin = une croix, une attaque de zone = des flèches en rond...) ; un passif prend celle de la première statistique qu'il modifie, sinon une étoile.
La couleur du nœud vient de la « famille » de la compétence (attaque, soin, défense, soutien), déduite de ses effets.


## 3 bis. Spécialisations, deck de sorts et sorts évolués

Trois idées qui s'écrivent entièrement en JSON.

**La barre de combat : trois blocs, et rien d'autre.**

| Bloc | Contenu | Où ça s'écrit |
| --- | --- | --- |
| **Corps à corps basique** (seul) | *Attaque à l'arme* : 3 PA, peu puissante, la même pour **toutes** les classes | `data/skills.json` : la compétence commune qui porte `"slot": "basic"` (une seule) |
| **Sort de classe** (seul) | posture, forme, aura, marque… | classe : `"classSkill": "id_du_sort"` (une compétence `innate` **active** de la classe) |
| **Deck** (encadré de 4) | les sorts équipés, `deckSize` (4) au plus ; les emplacements libres restent vides | choisis par le joueur dans la fiche |

Les **passives** ne prennent aucune place. Les autres compétences communes (*Garde*) ne sont **pas affichées** : sans `slot`, une commune n'a pas de case.
Une compétence `innate` active qui n'est pas le sort de classe est un simple **sort du deck, équipé dès la création** (c'est le cas des anciennes « attaques de base »
Entaille, Rayon, Épine, Estoc : `basicAttack` n'est plus qu'une compétence de départ comme une autre, et il est facultatif pour une nouvelle classe).
Un sort qu'on apprend s'équipe tout seul s'il reste de la place ; on change son deck à tout moment **hors donjon** (fiche > Compétences). Les classes testées
dans l'**Atelier** n'ont pas de limite de deck (on y essaie tout).

**Les spécialisations.** Elles s'ouvrent au niveau `specLevel` (4) ; elles sont **gratuites** et on peut en changer **entre deux parties** (jamais en plein donjon).
On les déclare dans la classe, puis on y rattache des compétences avec `"spec"` :

```json
"specs": {
  "poison":    { "name": "Lame empoisonnée", "desc": "Chaque coup laisse du poison." },
  "precision": { "name": "Escrime de précision", "desc": "Des coups plus économes en PA." }
},
"skills": [
  { "id": "duelliste_venin_vif", "name": "Venin vif", "type": "active", "level": 4, "cost": 0,
    "spec": "poison", "choiceGroup": "poison_4", "branch": "Poison", "tier": 1, ... }
]
```

* `spec` : la compétence ne s'apprend et ne fonctionne que si le personnage a choisi **cette** spécialisation. Si on en change, ses choix sont **gardés** (ils se réactivent si on revient), mais sans effet entre-temps.
* `cost: 0` : une compétence de spécialisation ne coûte aucun point de compétence (le palier et la spé suffisent). Mets un coût si tu préfères.
* `choiceGroup` : un **« un seul parmi N »**. Les compétences d'une même classe qui partagent ce nom forment un choix : on n'en a **qu'une à la fois**, et **en choisir une autre remplace la précédente**, gratuitement et sans rien réinitialiser (le bouton annonce « Choisir · remplace … »). Donne-leur le même `level` et le même `tier`. (Pour une vraie incompatibilité qui *bloque*, utilise `exclusiveWith`.)
* `tag` (dans la définition d'une **spécialisation**) : le rôle affiché sur sa carte (« Tank », « Hybride », « Dégâts »).
* **Ce que le joueur voit** (fiche > Compétences) : **1** trois grandes cartes de spécialisation qui listent ce que chacune donne, niveau par niveau ; **2** les **talents** de la spé choisie, palier par palier (les automatiques, les « choisis 1 parmi N », les aperçus à venir) ; **3** la **barre de combat** (emplacements, sorts disponibles à équiper, passifs toujours actifs) ; **4** l'arbre à points, seulement pour une classe qui a des compétences à acheter. Les paliers se déduisent des `level` de tes compétences : il n'y a rien d'autre à écrire.
* `upcoming` (dans la définition d'une **spécialisation**) : des paliers « **à venir** » qu'on laisse entrevoir aux joueurs : `"upcoming": [ { "level": 12, "name": "À venir", "desc": "Un nouveau choix parmi trois." }, { "level": 20, "name": "Forteresse", "desc": "Ultime : ..." } ]`. Ce ne sont **pas** des compétences : la fiche les montre en cases grisées en pointillés au bout de la rangée de la spé, et l'ultime (niveau 20) sur la carte de la spécialisation. Quand le palier sera écrit, on le remplace par de vraies compétences.

**Un sort de base qui évolue.** `"replaces": "id_du_sort_de_base"` crée une **version évoluée** (active, rattachée à une `spec`) : tant que la spécialisation est choisie
et le niveau atteint, elle **prend la place** du sort de base dans la barre de combat (le sort de base n'est alors plus lançable). Elle ne s'apprend pas : elle est automatique.
Elle marche aussi sur l'attaque de base et les sorts de départ (exemple fourni : l'Estoc du Duelliste devient *Estoc venimeux* avec la spé « poison »).
Elle a ses propres dégâts, coût en PA, effets et animation (`fx`) ; une compétence ne peut en remplacer qu'une, et on ne remplace pas une version évoluée.

> Les spécialisations du Duelliste sont des **exemples** pour tester le système (palier 4 seulement). Elles seront remplacées par les vraies classes.
> Le jeu refuse un fichier incohérent et l'explique : `spec` inconnue, `replaces` vers un sort qui n'existe pas, version évoluée sans spécialisation…

---

## 3 ter. Modes de classe, première utilisation gratuite et compétences automatiques

**Un mode de classe** est un état propre à la classe qu'un sort bascule, et dont dépendent des passives. Exemple fourni : le **Sacrieur** est en mode *Endurance*
(les PV manquants réduisent les dégâts qu'il reçoit) ou *Fureur* (ils augmentent les dégâts qu'il inflige). On le déclare dans la classe :

```json
"modes": {
  "default": "reduction",
  "list": {
    "reduction": { "name": "Endurance", "icon": "shield", "desc": "Moins il a de PV, moins il subit de dégâts." },
    "degats":    { "name": "Fureur",    "icon": "flame",  "desc": "Moins il a de PV, plus il inflige de dégâts." }
  }
}
```

* le mode **repart de `default` au début de chaque combat** ; il s'affiche sur la carte du héros et dans le bandeau d'action ;
* un sort le change avec l'effet `{ "type": "mode", "set": "toggle" }` (ou `"set": "degats"` pour viser un mode précis) ;
* une passive en dépend avec la condition `"if": { "mode": "reduction" }`, par exemple :
  `{ "stat": "taken", "pctPer": { "missingHpPct": -0.55 }, "if": { "mode": "reduction" } }` ;
* **un effet** peut aussi avoir sa propre condition `"if"` : il ne s'applique que si elle est vraie pour le lanceur. C'est ce qui fait qu'un même sort se comporte
  autrement selon le mode (la Morsure de sang du Sacrieur vole plus de vie en Endurance, frappe plus fort en Fureur) :
  `"effects": [ { "type": "damage", "power": 1.8, "lifesteal": 0.65, "if": { "mode": "reduction" } }, { "type": "damage", "power": 2.3, "lifesteal": 0.35, "if": { "mode": "degats" } } ]`.
  Écris la description du sort en conséquence : le petit résumé de la fiche ignore les effets conditionnels ;
* le déclencheur `modeChange` réagit au changement de mode (par exemple *Adaptation* : « +15 % de dégâts et −15 % de dégâts reçus pendant 2 tours »).

**Un coût en PV ne se paie pas avec un bouclier.** Un effet `damage` visant `"to": "self"` (« il s'inflige 8 % de ses PV max ») **ignore les boucliers** : c'est un vrai coût.
Place aussi ces effets **avant** ceux qui donnent un bouclier, sinon l'ordre des effets compte pour la lecture des PV manquants.

**Première utilisation gratuite** : `"freeFirst": true` sur une compétence active : sa **première utilisation de chaque combat coûte 0 PA** ; ensuite elle coûte son `pa`
(le Pacte de sang du Sacrieur : `"pa": 1, "freeFirst": true`). Le coût affiché sur la case suit : 0, puis 1.

**Compétences automatiques** : `"auto": true` (avec `"spec": "..."`) : la spécialisation les donne **toute seule** dès qu'on la choisit (au niveau `level`), sans rien apprendre
ni dépenser. Elles servent aux passives et aux sorts propres à une spé. Les sorts automatiques se mettent dans le deck comme les autres ; changer de spécialisation change les
automatiques. Une classe dont **toutes** les compétences sont de départ ou automatiques n'a rien à acheter : le jeu n'affiche alors aucun point de compétence.
Une version évoluée d'un sort de base (`"replaces"`) est elle aussi automatique : c'est ce que fait la Punition du Sacrieur selon sa spécialisation.

**Déblocage par niveau** : une compétence `innate` peut avoir un `level` supérieur à 1 : elle est connue dès le départ mais ne se lance qu'au niveau indiqué (grisée avant).
C'est ce qui étale les sorts de base du Sacrieur sur les niveaux 1 à 6.

**Le palier 8 d'une spécialisation** s'écrit avec les outils précédents : trois compétences de niveau 8 (`level: 8`, `cost: 0`, la même `spec`, le même `choiceGroup`, `tier: 2`) dont le joueur **choisit une** (il peut en changer librement). Exemple : les `sacrieur_*` de `"choiceGroup": "bastion_8"`, `"equilibre_8"` et `"ecorche_8"`. Le palier 20 (ultime) et un palier 12 « à venir » se déclarent avec `upcoming` (voir plus haut).

---

## 3 quater. Marque, effets sur la cible et cumuls (l'Assassin)

Tout ce qui suit est écrit en JSON ; l'**Assassin** (`data/classes.json`) s'en sert de bout en bout.

**La marque.** Effet `{ "type": "mark", "pct": 0.15 }` : la cible subit `pct` de dégâts **en plus** de celui qui l'a marquée, et ses sorts peuvent réagir à la marque (conditions plus bas).
Un lanceur n'a **qu'une marque à la fois** (`"max": 2` pour en garder deux : la plus ancienne disparaît). La marque dure jusqu'à la mort de la cible ou la fin du combat.
Sur la compétence : `"freeIfNoMark": true` (**coût 0 tant que le lanceur n'a marqué personne**, `pa` ensuite : « gratuite, puis 1 PA pour changer de cible ») et `"needsMark": true`
(inutilisable tant qu'il n'a marqué personne). Le coût affiché suit.

**Conditions sur la cible.** Deux conditions décrivent la cible visée : `{ "targetMarked": true }` (marquée par le lanceur) et `{ "targetStatus": "dot" }` (porte ce statut :
`dot`, `poison`, `mark`, `stun`...), en plus de `targetHpPctBelow`. Elles s'écrivent à trois endroits :

* **`ifTarget` sur un effet** : `{ "type": "stun", "turns": 1, "ifTarget": { "targetMarked": true } }`. L'effet qui vise la cible n'agit que sur celles qui remplissent la condition (utile
  dans une zone : `{ "type": "damage", "power": 2.0, "ifTarget": { "targetMarked": true } }` ne frappe que les ennemis marqués) ; un effet qui vise **autre chose** (`"to": "self"`)
  s'applique si au moins une cible la remplit (`{ "type": "pa", "amount": 1, "to": "self", "ifTarget": ... }` : « rend 1 PA si la cible est marquée »).
* **`bonus` sur un effet `damage`** : des suppléments de puissance conditionnels, sans second coup : `"bonus": [ { "ifTarget": { "targetMarked": true }, "power": 0.3 } ]`.
  `"powerPerTargetMissingHp": 0.02` ajoute de la puissance par **1 % de PV manquants de la cible** (un coup de grâce).
* **`targetDamage` sur une passive** : `"targetDamage": [ { "ifTarget": { "targetStatus": "dot" }, "pct": 0.2 } ]` = « +20 % de dégâts contre les cibles empoisonnées » (compté avec la marque).
* dans un **déclencheur** `kill`, `if: { "targetMarked": true }` : « quand il achève sa proie marquée ».

**Un poison qui se cumule.** L'effet `dot` accepte `"stack": true` (chaque nouvelle pose **ajoute un cumul** au lieu de remplacer, jusqu'à `"maxStacks"`, 5 par défaut ; les dégâts sont
`dégâts × cumuls` à chaque tour), `"key": "venin"` (des compétences différentes qui partagent la même clé cumulent sur le **même** statut), `"name": "Venin"` (le nom affiché) et `"label"`
(le verbe du journal : « souffre du venin »). `"stacks": 2` pose plusieurs cumuls d'un coup. Un `dot` **peut tuer** (contrairement au `poison` des monstres, qui laisse 1 PV).
La stat `dot` (`{ "stat": "dot", "pct": 0.25 }` dans une passive) augmente les dégâts de ses venins et saignements.

**Cible d'effet `lowestEnemy`** : l'ennemi le plus blessé (en proportion de ses PV), par exemple pour faire passer la marque sur la proie suivante.

---

## 3 quinquies. Auras de groupe, condition `spec` et dépense de ressource (le Templier)

**Une aura** est un **mode de classe** (voir §3 ter) dont le bonus profite à **toute l'équipe**. Dans `modes.list`, un mode peut avoir une liste `aura` de modificateurs :

```json
"modes": { "default": "protection", "list": {
  "protection": { "name": "Aura de protection", "icon": "shield", "desc": "Toute l'équipe subit 8 % de dégâts en moins.",
                  "aura": [ { "stat": "taken", "pct": -0.08 }, { "stat": "taken", "pct": -0.02, "if": { "spec": "gardien" } } ] },
  "vengeance":  { "name": "Aura de vengeance", "icon": "flame", "aura": [ { "stat": "damage", "pct": 0.08 } ] }
} }
```

* **un sort réservé à certains modes** : `"modes": ["ours", "felin"]` sur une compétence active : en combat elle ne se lance que dans ces modes (grisée sinon, avec la raison « Forme d'ours ou Forme de félin requise ») ; hors combat elle est libre. Le Druide s'en sert pour ses formes ;
* `"noun": "posture"` (dans `modes`, facultatif) : le nom de ce qu'on choisit dans le menu (« Posture : choisis une posture ») ; sans lui, « aura » si les modes en donnent une, sinon « mode ». Le Guerrier s'en sert ;
* le bonus s'applique à **tous les héros vivants de l'équipe, le porteur compris**, **en combat seulement**, tant que le porteur est vivant et garde ce mode ; jamais aux monstres ;
* un sort change d'aura avec l'effet `{ "type": "mode", "set": "pick" }` : **le joueur choisit** l'aura. Un clic sur le sort ouvre, dans le panneau du sort, **une icône par mode** (l'actuel est grisé,
  « Aura actuelle ») ; son choix part dans l'action de combat (`modeId`), et le moteur refuse un mode inconnu, absent ou déjà actif. Le Templier le met en sort de classe avec `freeFirst`
  (1er choix gratuit, ensuite 1 PA, quelle que soit l'aura visée). Avec `"set": "toggle"` (le Sacrieur), le sort passe simplement au mode suivant de la liste, sans choix ;
* un modificateur d'aura peut avoir une condition `if`, jugée **sur le porteur de l'aura** (et non sur l'allié qui en profite) : `{ "spec": "gardien" }` (sa spécialisation) ou `{ "mode": ... }` ;
* l'écran montre l'aura aux **alliés** comme un bonus permanent (« Aura de vengeance de Templier : dégâts infligés +8 %, tant que… ») sur leur carte et dans leur panneau d'effets ;
  le porteur, lui, voit son mode. Écris donc dans `desc` du mode les valeurs de base et celles des spécialisations.

**La condition `spec`** : `{ "spec": "gardien" }` est vraie si le héros a choisi cette spécialisation. Elle marche dans tous les `if` (modificateurs, déclencheurs, effets) : le jeu vérifie que la spécialisation existe.

**Dépenser une ressource.** `"spend": { "id": "sacre", "amount": 3 }` sur une active (voir §9) : elle n'est lançable que s'il y en a assez, et la dépense est payée avant les effets.
Le déclencheur **`spend`** (`{ "on": "spend", "effect": ... }`) réagit à toute dépense de ressource, **avant** les effets du sort : c'est ce qui permet à *Sainte colère* de donner « +20 % de dégâts pendant 2 tours »
*dès le coup qui dépense* (un sort qui rate par échec critique ne le déclenche pas). Pour **gagner** de la ressource, un sort a un effet `{ "type": "resource", "id": "sacre", "amount": 1, "to": "self" }` (sans `"to": "self"` la ressource irait à la cible).
Le Templier s'en sert en grand : des sorts à 3 PA donnent +1, à 5 PA +2, et les très gros sorts en dépensent 3 ou 5.

---

## 3 sexies. Expiation, soin en trop et drain (le Prêtre)

Le **Prêtre** (`data/classes.json`) n'a pas de ressource : sa **forme** est un mode de classe (§3 ter, `lumiere` / `ombre`) que son sort de classe bascule
(`"set": "toggle"`, `freeFirst` et `"cooldown": 2` : gratuit la 1re fois, ensuite 1 PA, et jamais deux fois de suite). Trois petites briques en plus, réutilisables :

* **L'Expiation** : l'effet `{ "type": "expiation", "turns": 3 }` pose sur un allié un statut lié au lanceur. La cible d'effet **`"to": "expiation"`** désigne alors
  **les alliés qui portent l'Expiation de ce lanceur**. La passive de la Discipline s'écrit :
  `{ "on": "dealDamage", "effect": { "type": "heal", "pctOfDamage": 0.6, "to": "expiation" } }` (« ses dégâts soignent les alliés sous Expiation »).
  Deux Prêtres ont chacun leur Expiation. L'allié la voit sur sa carte (pastille « Expiation ») et dans son panneau d'effets.
* **Le soin en trop devient un bouclier** : la stat **`overhealShield`** (`{ "stat": "overhealShield", "pct": 0.6 }`) transforme 60 % du soin **au-delà des PV max**
  en bouclier de 2 tours. Elle vaut pour tous les soins directs du héros (`heal`), pas pour les soins sur la durée.
* **Un poison qui soigne** : un `dot` peut avoir **`"drain": 0.4`** : à chaque tour, 40 % des dégâts qu'il inflige soignent **l'allié le plus blessé** de celui qui l'a posé
  (le Toucher vampirique). La description du statut le dit au joueur.

---

## 4. Les effets (`effects`)

Un effet est un petit objet `{ "type": ..., ... }`. Une compétence en a autant qu'on veut, appliqués dans l'ordre.

| `type` | Paramètres | Ce que ça fait |
| --- | --- | --- |
| `damage` | `power` (× l'attaque) **ou** `pctMaxHp` (fixe, ignore la défense) ; `lifesteal` (part des dégâts rendue en PV) ; `ignoreDef: true` ; `nonLethal: true` ; `critMult` | inflige des dégâts |
| `heal` | `power` (× la stat `heal`) **ou** `pctMaxHp` **ou** `pctOfDamage` (part des dégâts qui viennent d'être infligés, pour un « soigneur qui frappe ») | soigne |
| `shield` | `power` ou `pctMaxHp` ; `turns` (durée, 2 par défaut) | pose un **bouclier** (voir §8) |
| `hot` | `power`, `turns` | soin **sur la durée** : soigne `heal × power` au début de chaque tour de la cible |
| `dot` | `power`, `turns`, `label` ; `stack`, `key`, `name` (§3 quater) ; `drain` (§3 sexies) | saignement : dégâts à chaque tour |
| `poison` | `pct` (de ses PV max), `turns` | poison (ne tue jamais) |
| `mod` | `stat`, `pct` ou `flat`, `turns` | bonus ou malus temporaire (ex. `{"stat":"damage","pct":0.4,"turns":2}`) |
| `taunt` | `turns` | les ennemis doivent viser cette unité |
| `stun` | `turns` | étourdi : passe son tour (les boss résistent) |
| `guard` | `reduction` (0,5 = −50 %) | réduit les dégâts reçus jusqu'au début de son prochain tour |
| `move` | `row`: `front` / `back` / `toggle` | change de rang |
| `resource` | `id`, `amount` (peut être négatif) | gagne / perd de la ressource de classe |
| `pa` | `amount` | donne des PA (ex. +2 PA : « Danse des lames ») |
| `cleanse` | | retire poisons, saignements et malus |
| `resurrect` | `hpPct`, `hpMaxPenalty`, `casterHpMaxPenalty` | ressuscite un fantôme (coût partagé : voir `rules.json` → `resurrection`) |
| `survive` | `hp` | **uniquement dans un déclencheur `wouldDie`** : survit à 1 PV au lieu de mourir |
| `mode` | `set`: `"toggle"` (mode suivant de la liste), `"pick"` (le joueur choisit dans un petit menu d'icônes) ou l'identifiant d'un mode | change le **mode de classe** (voir §3 ter et §3 quinquies) |
| `redirect` | `turns` (1 = jusqu'au début de son prochain tour ; 2 et plus = plus longtemps) | « Sacrifice » : le lanceur **encaisse à la place de ses alliés** les coups directs des monstres (pas le poison) |
| `mark` | `pct` (+x % de dégâts du lanceur), `max` (nombre de marques, 1 par défaut) | « Marque » de l'Assassin : désigne une proie (voir §3 quater) |
| `expiation` | `turns` | « Expiation » du Prêtre : un allié que les passifs du lanceur soignent avec `"to": "expiation"` (voir §3 sexies) |

**Ce que le joueur voit des bonus et malus** (rien à écrire de ton côté, tout vient de `src/ui/status.js`) : sur chaque carte de combattant, des pastilles
avec la durée restante (les malus d'abord, trois au plus puis « +N ») ; dans le bandeau d'action, le panneau « Tes effets » (Bonus / Malus, une phrase par effet) ;
un clic sur un autre combattant affiche les siens ; et le nom de l'effet s'envole au-dessus du combattant quand il est posé. Les boucliers, le mode de classe
et l'objet maudit y figurent aussi.

Deux paramètres facultatifs qui font dépendre un effet des **PV manquants** :

* `damage` : `"powerPerMissingHp": 0.05` ajoute 0,05 de puissance **par 1 % de PV manquants du lanceur**, calculé au moment du coup (50 % de PV manquants : +2,5 de puissance). L'ordre des effets compte : un effet qui le fait perdre des PV placé **avant** augmente la puissance.
* `shield` : `"pctMissingHp": 0.4` ajoute 40 % des PV **manquants de celui qui reçoit le bouclier** (se cumule avec `pctMaxHp`).

### À qui s'applique un effet : `to`

Par défaut un effet vise la **cible de la compétence**. `"to"` change ça, effet par effet :
`target`, `self`, `allies` (= `allAllies`), `enemies` (= `allEnemies`), `lowestAlly`, `lowestEnemy`, `randomEnemy`, `expiation` (les alliés sous son Expiation), et dans un déclencheur : `source` / `attacker` (celui qui t'a frappé).

Exemple : *« frappe un ennemi, gagne 1 Élan et un bouclier »*

```json
"effects": [
  { "type": "damage", "power": 1 },
  { "type": "resource", "id": "elan", "amount": 1, "to": "self" },
  { "type": "shield", "pctMaxHp": 0.05, "to": "self" }
]
```

---

## 5. Les PASSIVES

Une passive n'a pas de `pa` ni de `target` : elle agit toute seule, tant qu'elle est apprise (et active au niveau effectif).

```json
{
  "id": "berserker_sang_chaud", "name": "Sang chaud", "type": "passive", "innate": true, "level": 1, "cost": 0,
  "modifiers": [ { "stat": "damage", "pctPer": { "missingHpPct": 0.8 } } ],
  "triggers":  [ { "on": "turnStart", "effect": { "type": "heal", "pctMaxHp": 0.04 } } ]
}
```

### `modifiers` : changer une stat en permanence

```json
{ "stat": "def", "pct": 0.25 }                                  // +25 % de défense
{ "stat": "taken", "pct": -0.08 }                               // 8 % de dégâts reçus en moins
{ "stat": "atk", "flat": 2, "if": { "hpPctBelow": 50 } }        // +2 d'attaque quand il est sous 50 % de PV
{ "stat": "damage", "pctPer": { "missingHpPct": 0.8 } }         // +0,8 % de dégâts PAR 1 % de PV manquants
```

Stats modifiables : `hp` `atk` `def` `heal` `save` `luck` `ini` `pa` (valeurs de base) et les **multiplicateurs**
`damage` (dégâts infligés), `taken` (dégâts reçus), `healPower` (soins et boucliers), `dot` (ses poisons et saignements), `overhealShield` (part du soin en trop changée en bouclier), `healTaken` (soins **reçus** : un `mod` à −0,5 = « blessure profonde », la cible n'est plus soignée qu'à moitié, régénération comprise), `critShift`, `fumbleShift`.

* `pct` : pourcentage (0,25 = +25 %) · `flat` : valeur ajoutée.
* `pctPer` / `flatPer` : proportionnel à une quantité variable : `missingHpPct` (0 à 100), `hpPct`, `alliesAlive`, `enemiesAlive`, `resource:<id>` (ex. `"resource:elan"`).
* `if` : condition (voir §6).

### `triggers` : réagir à un événement

```json
{ "on": "dealDamage", "effect": { "type": "heal", "pctOfDamage": 0.75, "to": "lowestAlly" } }
{ "on": "wouldDie", "oncePerCombat": true,
  "effects": [ { "type": "survive", "hp": 1 }, { "type": "mod", "stat": "damage", "pct": 0.5, "turns": 2 } ] }
```

| `on` | Quand |
| --- | --- |
| `combatStart` | au début du combat |
| `turnStart` / `turnEnd` | au début / à la fin de **son propre** tour |
| `dealDamage` | il vient d'infliger des dégâts (`pctOfDamage` = ces dégâts) |
| `takeDamage` | il vient d'en recevoir (`to: "attacker"` pour riposter) |
| `kill` | il vient de tuer quelqu'un |
| `crit` / `fumble` | il vient de faire un critique / un échec critique |
| `wouldDie` | un coup mortel arrive : on peut le sauver avec `survive` |
| `modeChange` | il vient de **changer de mode de classe** (voir §3 ter) ; la condition `if: { "mode": ... }` lit le **nouveau** mode |

Options d'un déclencheur : `if` (condition), `chance` (0 à 1), `oncePerTurn`, `oncePerCombat`.
Par sécurité, les réactions en chaîne s'arrêtent à 2 niveaux (`triggerDepth` dans `rules.json`).

---

## 6. Les conditions (`if`)

| Condition | Vrai quand… |
| --- | --- |
| `hpPctBelow: 40` | l'unité a **moins de** 40 % de ses PV (les boucliers ne comptent pas) |
| `hpPctAbove: 80` | plus de 80 % |
| `row: "front"` | elle est sur ce rang |
| `resourceAtLeast: { "id": "elan", "amount": 3 }` | assez de ressource |
| `targetHpPctBelow: 30` | la cible visée est sous 30 % de PV (pour « exécution ») |
| `alliesAliveAtLeast: 2` | au moins 2 alliés vivants (elle comprise) |
| `mode: "reduction"` | l'unité est dans ce **mode de classe** (voir §3 ter) |

---

## 7. Les rangs

Chaque camp est rangé sur 2 rangs. Un attaquant au corps à corps ne touche que le **rang avant** ennemi tant qu'il y reste
quelqu'un : un tank devant protège donc ses alliés fragiles derrière. Les attaques `ranged` / `any` passent par-dessus.
Changer de rang coûte 1 PA (`moveCostPa`). Toute la géométrie est isolée dans `src/core/geometry.js` : le jour où on voudra
une grille, on ne réécrira que ce fichier.

---

## 8. Les boucliers (règle importante)

* Un bouclier est une **réserve séparée** : il absorbe les dégâts **avant** les PV.
* Il **ne compte jamais comme des PV** : un Berserker avec 5 PV sur 15 et un bouclier de 10 est toujours « à 66 % de PV manquants » pour son passif.
* Il grossit la réserve totale : 10 PV + 5 de bouclier = on peut encaisser un coup de 11.
* Il est plafonné à `shieldCapPct` × les PV max (réglable dans `rules.json`) et dure `turns` tours de son porteur.
* Les dégâts qu'un bouclier **absorbe** comptent comme du **soin** pour le lanceur (XP de contribution) : un bon soigneur-bouclier est récompensé.

---

## 9. Les ressources de classe

```json
"resource": { "id": "elan", "name": "Élan", "max": 5, "start": 0 }
```

Puis, dans les compétences : `{ "type": "resource", "id": "elan", "amount": 1, "to": "self" }` pour en gagner,
`"spend": { "id": "elan", "amount": 3 }` pour en dépenser, `resourceAtLeast` / `"resource:elan"` pour y réagir.
La jauge s'affiche automatiquement sur la fiche du combattant.

---

## 10. Augmenter les PA (les 5 routes)

Les PA sont **le** levier de puissance du jeu : un PA de plus, c'est environ un sixième d'actions en plus à chaque tour.
Base : **6 PA**. Plafond : **12** (`maxPa` dans `rules.json`, une sécurité qui s'applique à tout : objets, passifs et buffs empilés ne peuvent pas le dépasser).

| Route | Dure | Écriture | Exemple fourni |
| --- | --- | --- | --- |
| **Équipement** | tant qu'il est porté | `"stats": { "pa": 1, "hp": -12 }` dans `items.json` (les valeurs négatives marchent : c'est le « prix ») | *Cœur de la crypte* (légendaire, +1 PA), *Sablier fêlé* (épique, +1 PA mais −12 PV et −3 déf.), *Rapière d'orage* (épique, +1 PA mais −4 déf.) |
| **Passif permanent** | toujours | `"modifiers": [ { "stat": "pa", "flat": 1 } ]` | *Second souffle* (Duelliste, niv. 8) |
| **Passif conditionnel** | tant que la condition est vraie **au début du tour** | `{ "stat": "pa", "flat": 1, "if": { "hpPctBelow": 35 } }` | à écrire : « +1 PA sous 35 % de PV » pour un Berserker qui joue avec le feu |
| **Buff** (sur soi ou sur un allié) | N tours **du bénéficiaire** | `{ "type": "mod", "stat": "pa", "flat": 2, "turns": 1 }` | *Cantique de hâte* (Veilleur, niv. 4) : un allié joue son **prochain** tour avec +2 PA |
| **Gain instantané** | **le tour en cours** seulement | `{ "type": "pa", "amount": 2 }`, souvent dans un déclencheur (`crit`, `kill`…) | *Frénésie* (Berserker : un critique redonne 2 PA, 1×/tour), *Pas de l'ombre* (Duelliste : il achève un ennemi → +2 PA) |

À savoir :

* Les PA d'un tour sont **calculés au début de ce tour**. Un buff ne profite donc jamais au tour en cours de son bénéficiaire : il profite à son **prochain** tour. Seul le gain instantané agit tout de suite.
* Un gain instantané donné à un **allié** est perdu (ses PA sont recalculés quand vient son tour). Pour donner des PA à quelqu'un d'autre, utilise toujours un `mod`.
* Une réserve de PA ne dépasse jamais `maxPa`.
* **Pense au prix.** +1 PA sur un objet, c'est environ +16 % d'actions. Réserve-le aux objets épiques ou légendaires, ou donne-lui un défaut (moins de PV, moins de défense), pour que 6 PA reste la norme et que 7 soit un cap à gagner.
* Un sort de buff de PA doit coûter presque autant qu'il donne : il sert à **transférer** des PA d'un personnage qui les convertit mal (un soigneur) vers un qui les convertit bien (un duelliste à combos).
* Les monstres ont aussi des PA (`pa` dans `monsters.json`), mais ils ne jouent qu'au plus `maxPlanActions` actions par round.

---

## 11. Recettes

**Le tank qui joue avec le feu** (Berserker) : passive `damage` + `pctPer: { missingHpPct }` + régénération `turnStart`,
compétence « Saignée » qui se retire des PV pour gagner des dégâts, passive `wouldDie` + `survive`.

**Le soigneur qui frappe** (Veilleur) : une attaque de base (`Rayon`) + passive `dealDamage` →
`heal` avec `pctOfDamage: 0.75` sur `lowestAlly`. Il frappe moins fort que les autres, mais chaque coup soigne.

**Le soigneur sur la durée** (Druide) : `hot` (`power`, `turns`). Ne pas empiler deux fois le même soin sur la même cible.

**Le donneur de boucliers** : `shield` avec `power` (× la stat `heal`) — le meilleur ami d'un Berserker.

**Le duelliste à combos** : l'attaque de base donne 1 `Élan` ; le gros coup en dépense 3 (`spend`) et ne rate jamais (`fumble: 0`).

**Une compétence « pari »** : `fumble` haut + `power` énorme + `fumbleEffects` pour punir l'échec (ex. `{ "type": "damage", "pctMaxHp": 0.1, "to": "self", "nonLethal": true }`).

**Un bourreau** (frappe en plus les cibles presque mortes) : un déclencheur avec condition sur la **cible** :

```json
{ "on": "dealDamage", "if": { "targetHpPctBelow": 30 }, "effect": { "type": "damage", "power": 1, "to": "target" } }
```

(`targetHpPctBelow` ne marche que dans le `if` d'un **déclencheur**, pas dans celui d'un modificateur : un modificateur ne sait pas qui est la cible.)

---

## 12. Les objets avec effets

Un objet de `data/items.json` peut avoir les mêmes `modifiers` et `triggers` qu'une passive, avec `effect` = la phrase affichée :

```json
{ "id": "larme_cristal", "name": "Larme de cristal", "slot": "relic", "rarity": "epic", "level": 4,
  "stats": { "heal": 6, "hp": 14, "luck": 1 },
  "effect": "Au début du combat : bouclier de 10 % des PV max pendant 2 tours.",
  "triggers": [ { "on": "combatStart", "effect": { "type": "shield", "pctMaxHp": 0.1, "turns": 2 } } ] }
```

`"stats": { "pa": 1 }` donne +1 PA par tour (voir §10) ; les valeurs négatives (`"def": -3`) sont permises : c'est le prix d'un objet puissant. La couleur d'un objet vient de sa `rarity` (couleurs réglables dans `data/items.json`, section `rarities`).

---

## 13. Les monstres

Un monstre a des PA, une initiative, un rang, et des compétences **pondérées** (plus le poids est grand, plus il la choisit).
Chaque round il **annonce** ses actions (compétence + cible) : les joueurs peuvent donc réagir (provoquer, étourdir, tuer d'abord).

```json
{ "id": "rat_geant", "name": "Rat géant", "kind": "beast", "tranche": 1,
  "hp": 21, "atk": 6.3, "def": 1, "ini": 12, "pa": 6, "row": "front", "xp": 5,
  "skills": [ { "skill": "morsure", "weight": 3 }, { "skill": "morsure_venimeuse", "weight": 1 } ] }
```

Ses compétences se décrivent dans la section `skills` de `data/monsters.json` (**même format** que celles des classes) :

```json
"morsure_venimeuse": { "name": "Morsure venimeuse", "pa": 4, "target": "enemy", "range": "melee",
  "effects": [ { "type": "damage", "power": 0.7 }, { "type": "poison", "pct": 0.06, "turns": 3 } ] }
```

`"boss": true` : résiste à l'étourdissement. `kind` : `undead`, `beast`, `humanoid`, `slime`, `demon`, `boss` (l'icône de repli, la voix et le geste :
une bête griffe, un mort-vivant entaille, une gelée éclabousse, un boss écrase).

**Son portrait** : chaque monstre fourni a un dessin (`src/ui/art/monsters-*.js`, clé = son `id`). Un monstre ajouté sans dessin garde l'icône de son
`kind` ; pour lui donner une image, ajouter `"art": "img/mon-monstre.png"` à sa fiche (de même pour une classe : `"art"` dans sa définition).
Voir `docs/DIRECTION-ARTISTIQUE.md` § 4 ter.
Les monstres s'adaptent au **nombre** de joueurs (jamais à leur niveau) : `partyScaling` dans `rules.json`.
Si un combat dure plus de 8 rounds, les monstres s'énervent (+15 % de dégâts par round) : pas de combat éternel.

### Les mécaniques par type de monstre : `family` et `passives`

`"family": "Ogre"` range un monstre dans une famille (affichée dans l'encyclopédie). Ses **particularités** — la mécanique de son espèce — sont des
passives, écrites dans la section `passives` de `data/monsters.json` (**même format** que les passives des classes : `modifiers`, `triggers`, avec un
`name`, une `icon` et une `desc` que le joueur lira), puis données au monstre par `"passives": ["regeneration"]` :

```json
"passives": {
  "regeneration": { "name": "Régénération", "icon": "heart", "desc": "Récupère 4 % de ses PV max au début de son tour — sauf s'il saigne ou s'il est empoisonné.",
    "triggers": [ { "on": "turnStart", "if": { "notAfflicted": true }, "effect": { "type": "heal", "pctMaxHp": 0.04, "to": "self" } } ] },
  "embuscade":    { "name": "Embuscade", "icon": "eye", "desc": "Inflige 25 % de dégâts en plus pendant le premier round du combat.",
    "modifiers": [ { "stat": "damage", "pct": 0.25, "if": { "roundAtMost": 1 } } ] }
}
```

En combat, les particularités d'un monstre s'affichent en pastilles sur sa carte et dans le panneau « Particularités » quand on clique dessus.
Ce que le moteur sait faire pour elles (en plus de tout le vocabulaire des classes) :

| Outil | Sens | Exemple fourni |
| --- | --- | --- |
| condition `"roundAtMost": 1` | vrai pendant les N premiers rounds du combat | *Embuscade* des bandits |
| condition `"notAfflicted": true` | l'unité ne saigne pas et n'est pas empoisonnée | *Régénération* des ogres (un saignement la coupe) |
| condition `"alliesAliveAtLeast": 2` | il lui reste au moins un allié debout | *Voile d'ossements* du Hiérophante |
| effet `reanimate` (`hpPct`) sur une compétence `"target": "deadAlly"` | un monstre **relève un monstre tombé** (une seule fois chacun, jamais un boss) ; il l'annonce un round avant | *Relever les morts* des acolytes |
| effet `survive` avec `hpPct` dans un déclencheur `wouldDie` | se relève seul avec une part de ses PV (un saignement ou un poison l'achève pour de bon) | *Sans repos* des squelettes relevés |
| effet `summon` (`monster`, `count`, `max`) sur une compétence `"target": "self"` | un monstre **appelle des renforts** : jamais plus de `max` vivants à la fois ; ils jouent dès le round suivant et ne rapportent ni or ni XP | *Appel de la meute* du Roi des Rats, *À moi, la bande !* de La Balafre |
| effet `breakShield` (avant l'effet de dégâts) | détruit tous les boucliers de la cible | *Coup de massue*, *Fracas* |
| `"ignoreDef": true` sur un effet `damage` | la défense de la cible ne compte pas | *Trait d'ombre* des cultistes |
| déclencheur `takeDamage` + dégâts `"to": "attacker"` | rend un coup à chaque coup reçu | *Riposte* des chevaliers déchus |
| modificateur `taken` | moins de dégâts des coups directs (les saignements et poisons passent) | *Incorporel* des spectres |

L'IA d'un monstre ne gaspille pas un soin (une compétence qui ne fait que soigner n'est choisie que si un allié est blessé) et ne propose
*Relever les morts* que s'il y a quelqu'un à relever.

### Les donjons (`data/dungeons.json`)

Une **tranche** (`data/tranches.json`) est une plage de niveaux avec ses réglages communs (longueur du plateau, cases, or, pièges). Elle contient
**un ou plusieurs donjons à thème** :

```json
{ "id": "gouffre_aux_ogres", "tranche": 8, "name": "Le Gouffre aux Ogres", "theme": "Ogres", "complexity": "mecaniques", "scene": "depths",
  "description": "Ils sont gros, ils ont faim, et leurs blessures se referment à vue d'œil.",
  "monsterPool": ["ogre_des_cryptes", "ogre_brise_os", "ogresse_chamane", "ogrillon_lanceur"],
  "bossId": "roi_ogre", "bossEscort": ["ogresse_chamane"], "minMonsters": 2,
  "mechanics": [ { "name": "Régénération", "desc": "Les ogres récupèrent 4 % de leurs PV à chaque tour..." } ],
  "loot": ["dent_d_ogre", "marmite_cabossee", "ceinture_en_peau_d_ogre", "massue_de_gromm"] }
```

| Champ | Sens |
| --- | --- |
| `tranche` | la plage de niveaux du donjon (1, 4, 8...) : niveau effectif, objets et réglages viennent d'elle |
| `theme`, `description`, `complexity` | affichés sur la carte du donjon ; `complexity` : `simple` ou `mecaniques` |
| `monsterPool`, `bossId` | ses monstres et son boss (`monsters.json`) |
| `bossEscort` | les gardes du boss : autant que le groupe le permet (aucun en solo, sauf `minMonsters`) |
| `minMonsters` | au moins tant de monstres par combat, **même en solo** — sans quoi une mécanique de groupe (relever un mort, soigner un allié) n'existerait pas |
| `mechanics` | « à savoir avant d'entrer » : une liste de `{ "name", "desc" }`, affichée à l'accueil et dans l'encyclopédie. Les mécaniques elles-mêmes sont les `passives` des monstres |
| `loot` | la **table de butin** du donjon : ces objets (de `items.json`) ne tombent **que là** — jamais ailleurs, ni au farm, ni chez le marchand |
| `scene` | le décor (`caves`, `crypt`, `depths`, `terriers`, ou le chemin d'une image) |
| `available: false` | un aperçu « à venir » (affiché dans « Bientôt ») |
| tout réglage d'une tranche | un donjon peut surcharger `boardLength`, `tileWeights`, `lootChance`, `enrageAfterRound`, `enragePerRound`... |

**Le butin d'un donjon.** Chaque objet trouvé a `dungeonTableChance` (30 %, `rules.json` → `loot`) de venir de la table du donjon ; le reste est du butin
ordinaire de la tranche. Le **premier objet du boss vient toujours de la table**. Un objet ne peut être dans la table que d'un seul donjon.

**La panoplie d'un donjon.** `"setName": "Panoplie de Gromm"` et `"setBonus": [ { "pieces": 2, "desc": "+14 PV.", "modifiers": [ { "stat": "hp", "flat": 14 } ] }, { "pieces": 3, ... } ]` :
porter 2, 3... objets **différents** de la table du donjon donne ces bonus (ils se cumulent). Un objet maudit, ou inactif parce que trop haut pour la tranche jouée, ne compte pas.
Chaque objet rappelle sa panoplie, et la fiche du héros (onglet Équipement) montre les panoplies portées et les bonus actifs.

**La collection.** Chaque personnage retient les donjons terminés, les monstres vaincus (même quand la partie est perdue) et les objets exclusifs rapportés (victoire seulement).
L'encyclopédie additionne tous les héros du joueur : « Terminé 2 fois », « Monstres vaincus : 2/5 », « Butin trouvé : 3/4 », et le détail sur chaque fiche.

**L'encyclopédie.** À l'accueil (et dans un salon), le bouton « Monstres et butin » du donjon choisi ouvre sa fiche : ce qu'il faut savoir, le bestiaire
(portrait, famille, rang, stats de base, compétences, particularités) et la table de butin. Rien à écrire : tout vient des JSON.

**Ajouter un donjon** : copier un bloc de `dungeons.json`, lui donner ses monstres (nouveaux ou existants) et ses objets. Aucun code à toucher.
`node tests/donjons-sim.mjs 40` joue chaque donjon avec six équipes de robots : un donjon nettement plus dur que ses voisins se voit tout de suite.

---

## 14. Ajouter un NOUVEL effet (si le vocabulaire ne suffit pas)

1. Ajoute son nom dans `EFFECT_TYPES` (`src/core/content.js`) et ses paramètres obligatoires dans `checkEffect`.
2. Ajoute un `case` dans `applyEffect` (`src/core/effects.js`). Tout ce dont tu as besoin est là : `caster`, `units`
   (les cibles de **cet** effet), `ctx.outcome` (`hit` / `crit`), les fonctions `dealDamage`, `healUnit`, `addShield`, `giveStatus`.
3. Si l'effet pose un statut durable (bonus, malus...), ajoute sa gestion dans `src/core/units.js` **et sa description dans `statusInfo`
   (`src/ui/status.js`)** : un nom, un résumé court (la pastille), une phrase qui explique ce que ça fait, et s'il aide (`buff`) ou gêne (`debuff`).
   C'est ce texte que le joueur lit sur les cartes, dans le panneau « Tes effets » et dans l'annonce flottante au moment où l'effet est posé.
   Sans cette description, l'effet apparaît quand même mais avec son identifiant brut et sans explication.
4. Lance `node tests/run-tests.mjs` et `node tests/fuzz.mjs 300` : le fuzz vérifie qu'aucune action n'abîme l'état.

---

## 15. Check-list avant de dire « c'est équilibré »

* Dans l'Atelier, mesure les **dégâts par round** de chaque compétence seule (2 mannequins inertes, force normale).
* Une compétence « pari » doit valoir la peine **en moyenne** (probabilité de toucher × dégâts > une attaque sûre) ET être excitante.
* Aucune classe ne doit gagner seule contre le boss tranche 1 en jouant n'importe comment, ni perdre systématiquement en jouant bien.
* `node tests/simulate.mjs 100` donne les taux de victoire par tranche et par composition (des robots, pas des humains : ça repère les grosses erreurs, pas le plaisir).
* Le plaisir se juge en jouant. Fais jouer un ami.
