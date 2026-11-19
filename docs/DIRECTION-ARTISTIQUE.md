# Direction artistique : « Lanterne »

Une nuit de donjon éclairée à la lanterne : un fond bleu-nuit presque noir, du **laiton** pour les cadres, et la **flamme
orange** de la lanterne pour tout ce qu'on peut faire (boutons principaux, points d'action, case sélectionnée, héros qui joue).

Tout le style est dans **un seul fichier** : `css/style.css`. Rien dans le code JavaScript ne décide d'une couleur,
à une exception près : la couleur d'une **rareté** vient de `data/items.json` (voir §5).

---

## 1. Changer l'ambiance en 5 minutes

Tout part des variables au début de `css/style.css` (bloc `:root`). Changer ces valeurs change tout le jeu.

| Variable | Rôle | Valeur actuelle |
| --- | --- | --- |
| `--ink-0` … `--ink-5` | **la nuit** : du fond le plus sombre (0) au panneau le plus clair (5) | `#070a0f` … `#1d2b3a` |
| `--line`, `--line-2`, `--line-3` | les filets et bordures, du plus discret au plus visible | `#25323f` … `#4b5b6a` |
| `--brass` … `--brass-4` | **le laiton** : cadres, titres, ce qui est précieux | `#8a6a32` … `#f3d9a0` |
| `--lantern`, `--lantern-2`, `--lantern-ink` | **la flamme** : actions, PA, sélection ; `lantern-ink` = le texte posé dessus | `#f5a83b`, `#1a1204` |
| `--glow` | la lueur autour de ce qui est actif | orange à 45 % |
| `--text`, `--text-2`, `--muted`, `--faint` | le texte, du plus lisible au plus discret | crème → gris bleu |
| `--tank`, `--heal`, `--dps` | la couleur d'un **rôle** (médaillons, icônes des compétences) | bleu acier, turquoise, rouge corail |
| `--ember`, `--ember-text` | **le danger** : monstres, dégâts, alertes | rouge braise |
| `--good`, `--info`, `--violet`, `--ghost` | réussite, information, ressource de classe, fantôme | vert, bleu clair, violet, bleu pâle |

Exemple : pour une ambiance « forêt » au lieu de « nuit de donjon », on change `--ink-*` (vers des verts très sombres)
et `--brass-*` (vers un bois clair). Les noms des anciennes variables (`--bg`, `--panel`, `--gold`...) existent encore
et pointent vers les nouvelles.

**Typographie** (chargée depuis Google Fonts dans `index.html` et `artifact.html`) :

* `--serif` = **Cinzel** : titres, noms, nombres importants (PV, PA, niveaux). Hors ligne, retombe sur Palatino ou Georgia.
* `--sans` = **Alegreya Sans** : tout le texte courant. Hors ligne, retombe sur la police du système.

Pour changer de police : modifier le lien Google Fonts dans les deux fichiers HTML, puis `--serif` / `--sans`.

---

## 2. Le kit : les briques à réutiliser

Une nouvelle fonctionnalité doit **piocher dans cette liste** plutôt qu'inventer un style.

| Brique | Classe(s) | Usage |
| --- | --- | --- |
| Boutons | `.btn` · `.btn-primary` (la flamme : l'action principale, **une seule par écran**) · `.btn-danger` · `.btn-ghost` · `.btn-small` · `.btn-xl` | partout |
| Panneau | `.panel` / `.card` | un bloc de contenu |
| Médaillon | `.portrait` (+ `.role-tank/healer/damage`, `.is-monster`, `.is-boss`, `.ghostly`) | un personnage ou un monstre, en rond cerclé de laiton ; `portrait(classId, taille)` dans `components.js` |
| Carte d'objet | `.item-card.r-<rareté>` | `itemCard()` dans `format.js` ; la couleur de la rareté borde la carte et teinte l'icône |
| Jauge | `.hpbar` (vie), `.xpbar`, `.progress` | PV, expérience, succès |
| Pastilles | `.chip` (+ `-good/-bad/-info`), `.rarity-pill`, `.pa-badge` | statuts, raretés, coût en PA |
| Fenêtre | `.modal`, `.modal-head`, `.modal-body` | via `openModal()` |
| Onglets | `.tabs` / `.tab` | la fiche de personnage |
| Points d'action | `.flames` / `.flame` | `paFlames(cur, max)` : allumée = il en reste |
| Case de compétence | `.slot` (+ `.kind-attack/heal/defense/buff`) | la barre de compétences du combat |
| Pastilles de stats | `.pill` (+ `.down` pour un malus) | `+11 Attaque`, `−4 PV` : les chiffres d'un objet |
| Emplacement de la poupée | `.dslot` (+ `.filled`/`.empty`, `.is-selected`, `.is-target`, `.blocked`) | un des 14 emplacements d'équipement : pointillé = libre, couleur de la rareté = porté |
| Carte d'objet porté | `.gear` (+ `.r-<rareté>`, `.empty`) | le panneau de détail sous la poupée : médaillon, nom, pastilles |
| Ligne de sac | `.bag-row` + `.bag-cmp` (`.better/.worse/.mixed/.same`), regroupées en `.bag-sec` | un objet du sac et **ce qu'il change** par rapport à ce qu'il remplacerait |
| Nœud de compétence | `.node` (`.is-active` carré / `.is-passive` rond · `.is-known/.is-ready/.is-locked` · `.kind-*`) | l'arbre de la fiche |
| Panneau de détail | `.sd2` | la compétence choisie : description, dé, conditions (`.req-list`), bouton « Apprendre » |
| Fiche de héros (accueil) | `.char-card.hero-card` (+ `.selected`) · `.pick-mark` (la case ronde en haut à droite) · `.hero-tag` (+ `-skill`, `-bad`, `.loot-btn`) | choisir un héros ; les étiquettes disent ce qu'il y a à faire (points de compétence, récompense de farm à choisir, partie en cours) |
| Carte de donjon | `.tranche-card` (+ `.selected`) · `.fit` (+ `-ok/-risky/-deadly`) | un donjon et son verdict pour l'équipe choisie |
| Sélecteur | `.mode-switch` / `.mode-opt` (+ `.on`) | trois positions (la difficulté) |
| Barre de lancement | `.launch-bar` (`.launch-recap`, `.launch-heroes`, `.launch-info`) | en bas de l'accueil : qui part, où, et le gros bouton |
| Joueur d'un salon | `.lobby-member` (+ `.is-me`, `.is-ready`, `.is-empty`) · `.ready-chip` (+ `.on`) · `.presence` (+ `.on`) | la salle d'attente : qui est là, son héros, prêt ou non, en ligne (point vert) ou non |
| Code du salon | `.lobby-code` | le code à 5 caractères, en pointillés laiton ; un clic le copie |
| Bandeau de tour | `.turn-banner` (+ `.mine` / `.theirs`) · `.turn-pill` | à plusieurs : « C'est à toi ! » (flamme) ou « En attente de… » (bleu pâle) ; le minuteur du salon en lecture seule |
| À qui est ce héros | `.owner-tag` (+ `.is-me`, `.is-auto`) · `.f-owner` (sur le champ de bataille) | « Ton héros » (laiton), « Joué par Alice », « Pilote automatique » (pâle, en italique) |

**Règles de style** (pour que tout reste cohérent) :

1. **Une seule couleur « d'action » : la flamme.** Si tout est orange, rien n'est important.
   Pour dire « c'est **choisi** », on utilise le **laiton** (cadre, case cochée), pas la flamme : sur l'accueil, la flamme n'éclaire que le bouton de lancement et « Reprendre ».
2. Le rouge est **réservé au danger** (monstres, dégâts, échec critique). Le doré est réservé au **critique** et aux récompenses.
3. Les titres sont en Cinzel (`--serif`), les nombres importants aussi ; le texte courant en Alegreya Sans.
4. Un élément **cliquable** a toujours un état au survol et un état au clavier (`:focus-visible` est déjà prévu).
5. Pas d'information portée **uniquement** par la couleur : une icône ou un mot l'accompagne (rareté = couleur + nom).

---

## 3. L'écran de combat

Du haut vers le bas :

1. **L'en-tête** : le nom du donjon, le plateau (en miniature, dans l'en-tête pendant un combat) et les boutons.
2. **La frise** : l'ordre de jeu (médaillons arrondis, bord bleu pour les héros, rouge pour les monstres, flamme pour celui qui joue),
   et à droite le message du moteur (« Le combat commence ! »). Avec plus de 7 combattants, seul le nom de celui qui joue reste écrit.
3. **Le champ de bataille** : les monstres en haut, les héros en bas, la **ligne de front** entre les deux. Un monstre affiche
   ce qu'il a **annoncé** juste au-dessus de lui (deux actions identiques sur la même cible s'écrivent « Coup ×2 → Thorne »).
   Une rangée vide n'est pas dessinée.
4. **Le bandeau du bas** (reste collé en bas de l'écran) :
   * à gauche, **le héros qui joue** et ses **points d'action en flammes** (et sa ressource : Élan...) ;
   * au centre, le **détail de la compétence** survolée (nom, coût, portée, description, bande de dé), puis la **barre de compétences** ;
   * à droite, **Fin du tour** et les trois dernières lignes du journal (« Tout voir » ouvre le journal complet).

**Commandes** : souris (clic sur une compétence, puis sur la cible) · tactile : un premier toucher **sélectionne** la compétence (sa description s'affiche
avec un bouton « Lancer »), le second la lance ; un toucher à côté referme · clavier : voir « Raccourcis clavier » ci-dessous.

### Raccourcis clavier

Les touches de la **rangée du haut** lancent les cases de la barre, dans l'ordre : **& é " ' ( - è _ ç à** sur un clavier AZERTY, **1 2 3 4 5 6 7 8 9 0** sur un QWERTY
(avec ou sans Maj ; le pavé numérique marche aussi). **Échap** annule le choix d'une cible. Une touche maintenue enfoncée ne relance pas ; Ctrl / Alt / Cmd + touche sont ignorés.

* Le code est dans `src/ui/keys.js`. On lit la **position** de la touche (`event.code` : `Digit1`, `Digit2`...) et non son caractère (`event.key`) : sur AZERTY, la touche « 1 » donne `&`,
  et c'est ce qui rend « & é " ' » utilisables sans Maj. Un même code marche donc sur tous les claviers.
* **Ce qui est écrit sur les cases** est la vraie touche du joueur : le navigateur la donne quand il sait (API *Keyboard Map* de Chrome et Edge) ; sinon on suppose AZERTY si le
  navigateur est en français de France / Belgique / Luxembourg / Monaco ; et dès la première frappe sur une touche de la rangée, l'étiquette est corrigée (« apprise »).
* Appuyer sur la touche d'une compétence **indisponible** (pas assez de PA, personne à ressusciter...) fait trembler sa case et affiche la raison quelques secondes.
* Sur un écran **tactile**, les étiquettes de touches sont masquées ; mais un clavier branché sur une tablette lance directement (pas de double toucher).

### La description d'une compétence selon la taille de l'écran

* **Grand écran** : un panneau toujours visible au-dessus de la barre (la compétence survolée, sinon la dernière utilisée).
* **Petit format** (largeur ≤ 760 px, ou fenêtre de moins de 700 px de haut) : **rien au repos**, pour laisser la place au champ de bataille (le bandeau passe d'environ 330 px à
  235 px sur téléphone). La description devient une **infobulle** posée au-dessus de la barre, qui n'apparaît qu'au survol, au premier toucher, ou pendant le choix d'une cible (alors une seule
  ligne : « Estoc : choisis une cible [Annuler] »). Le CSS décide d'après `data-state` (`rest`, `hover`, `picked`, `target`, `flash`) sur `.skill-detail` : voir `actionDock()` dans `run.js`
  et le bloc `@media (max-width: 760px), (max-height: 700px)` de `css/style.css`. Pour changer le seuil, c'est cette ligne (et la même condition dans `isTouch`/`hover` si besoin).

### Comment le champ de bataille s'adapte à l'écran

Sur ordinateur, tout le combat tient dans la hauteur de la fenêtre (pas de défilement). Trois mécanismes se relaient :

1. **Les médaillons s'adaptent à la hauteur disponible** : le champ de bataille est un « conteneur » CSS (`container-type: size`),
   et la taille d'un médaillon est un pourcentage de sa hauteur (`21cqh`, `16,5cqh` ou `13cqh` selon qu'il y a 2, 3 ou 4 rangées, plafonnés à 120, 100
   et 90 px). La classe `rows-N` du champ est posée par `battlefield()` dans `run.js`.
2. **Des paliers** (`@container stage (max-height: …)`) retirent le texte secondaire (classe et niveau) et resserrent les marges
   quand la place manque.
3. **Si malgré tout ça déborde**, la fonction `fitStage()` de `run.js` essaie d'abord de réduire les médaillons (variable `--fit` : 100 %, 88 %,
   76 %, 66 %). Si le médaillon obtenu reste petit (moins de 56 px), elle essaie les **cartes compactes** (classe `mini` : médaillon à gauche, nom et barre
   à droite) avec le **plus grand médaillon qui tient** (88, 80, 72... jusqu'à 40 px, variable `--mini-medal`), et garde la mise en page qui donne le plus
   grand médaillon : les illustrations ont ainsi toute la place possible, même sur un portable de 1366 × 650.
   Elle se relance à chaque dessin et quand on redimensionne la fenêtre.

Sur **téléphone** (moins de 760 px de large) le champ de bataille reprend sa hauteur naturelle (la page défile), le bandeau du bas
se compacte, et la barre de compétences défile horizontalement.

---

## 3 bis. La fiche de personnage

Une fenêtre à **hauteur fixe** : l'en-tête (nom, classe, XP, les 8 statistiques avec leur bonus d'équipement en vert) et les onglets restent en place,
seul le contenu défile. Sur téléphone elle prend tout l'écran.

* **Équipement** : à gauche la **poupée** (les 14 emplacements rangés par famille, avec le compteur « 9 / 14 » : pointillé = libre, couleur de la rareté = porté,
  une arme à deux mains grise la main gauche) et le détail de l'emplacement survolé ou choisi ; à droite le **sac rangé en sections** (armes, tête, torse, anneaux...).
  Clic sur un emplacement = le sac ne montre que ce qui peut y aller. Chaque ligne du sac dit en une phrase ce que l'objet remplacerait et ce que ça changerait
  (`▲ +3 Attaque`, `▼ −4 PV`), avec un verdict (*Meilleur*, *Moins bon*, *Différent*, *Emplacement libre*) ; un objet trop haut niveau est grisé avec la raison.
  Le composant est dans `src/ui/gear.js` (partagé avec le sac de la partie en cours) ; les règles de placement viennent du moteur (`planEquip`, voir `docs/EQUIPEMENT.md`).
* **Compétences** : une rangée par branche (`data/classes.json` : `branch`, `tier`, et `branches` pour la phrase de la branche), les paliers reliés par un trait,
  un **panneau de détail** à droite qui reste visible (sur téléphone il s'ouvre sous la rangée choisie). Les conditions d'apprentissage viennent de
  `skillRequirements()` dans `src/core/progression.js`. Le survol d'un nœud prévisualise ; le clic le choisit.
* **Succès** et **Infos** : listes simples.

---

## 3 ter. L'accueil

Une seule idée : **à gauche, qui part ; à droite, où ; en bas, un résumé et le bouton**. Le code est dans `src/ui/screens/menu.js`, les styles dans la section 5 de `css/style.css`.

* **Premier pas** (aucun héros) : la page ne propose qu'une chose, créer un héros, en choisissant une classe (`openCreateModal(classId)` s'ouvre avec la classe déjà cochée) ou en prenant les 3 héros d'exemple.
* **Deux onglets** : *Donjon en équipe* et *Zone de farm solo*. Les héros sont les mêmes ; en équipe on en coche jusqu'à 4 (numérotés dans l'ordre), en farm un seul.
* **① Les héros** (colonne de gauche) : une fiche par héros, courte. Les **étiquettes** disent ce qu'il y a à faire : *★ N points* (points de compétence à dépenser : ouvre l'arbre),
  *Coffre n/24* (farm, ou dès qu'il contient quelque chose), *Partie en cours* (le héros est engagé).
* **② Le donjon** (colonne de droite) : une carte par donjon avec une puce **Adapté / Risqué / Très dangereux** calculée pour l'équipe choisie (`assess()`), l'explication détaillée du donjon choisi
  (les remarques identiques sont regroupées), puis la **difficulté** (Basic / Tranche / Stasis) en sélecteur à trois positions. Les donjons « bientôt » tiennent sur une seule ligne.
  En farm : la zone en quatre puces (le détail se déplie : *Comment ça marche ?*). Onglet Expéditions : « En route » (barre d'avancée, Récupérer / Rappeler), puis une carte par expédition (`.exp-card`).
* **La barre du bas** (`.launch-bar`) reste visible : les médaillons de l'équipe, « qui · où · difficulté » (avec la puce de verdict), et le bouton. Grisé tant qu'aucun héros n'est choisi, et elle dit pourquoi.
* **Écrans** : au-dessus de 1000 px, deux colonnes ; en dessous, une colonne (les fiches se rangent sur deux colonnes sur tablette) ; sous 760 px (téléphone), l'en-tête tient sur une ligne (icônes seules),
  les fiches perdent leur ligne de stats et leur barre d'XP, et la barre du bas passe sur deux lignes.

Deux noms à ne pas réutiliser : `.pill` est pris (les stats d'un objet : « +11 Attaque ») et `.verdict` aussi (la comparaison d'un objet du sac) ; l'accueil utilise `.hero-tag` et `.fit`.

### En ligne : un héros, un salon

L'accueil **en ligne** garde la même structure, mais le premier onglet n'est plus « une équipe » : **on n'amène qu'un héros** (un clic sur un autre héros remplace le premier),
et la colonne de droite devient **Créer un salon** (le donjon et la difficulté proposés d'avance, modifiables ensuite dans la salle d'attente) puis **Rejoindre un salon**
(le champ du code, et la liste des salons ouverts). Un bandeau laiton rappelle le salon où l'on est déjà (« Retourner au salon » / « Quitter »). Code : `roomPlan()` et `roomBanner()` dans `menu.js`.

### La salle d'attente (`src/ui/screens/lobby.js`)

Même grille que l'accueil : **① Les joueurs** à gauche (quatre places, dont les vides en pointillés, puis « Mon héros » : une pastille par héros, un seul est choisi),
**② Le donjon** à droite (l'hôte règle le donjon, la difficulté et la durée d'un tour ; les autres voient les mêmes cartes en lecture seule), et la **barre du bas** :
« Je suis prêt » pour un joueur (la flamme dit « à toi d'agir » ; une fois prêt, le bouton passe en discret), « Lancer la partie » pour l'hôte (grisé tant que quelqu'un n'est pas prêt,
avec le nom de celui qu'on attend). Tout se met à jour **sans recharger** (le serveur pousse chaque changement) ; l'écran ne redessine jamais le champ où l'on tape.

### La partie à plusieurs (`src/ui/screens/run.js`)

Rien ne change pour celui qui joue seul ; à plusieurs :

* **À qui est le tour ?** Hors combat, un **bandeau** en haut de la scène : flamme et « C'est à toi de jouer ! », ou œil bleu pâle et « En attente d'Alice » (avec le décompte du tour, tenu par le serveur).
  En combat c'est le **bandeau du bas** qui le dit : bordure de flamme quand c'est à toi, estompé (« spectateur ») quand tu regardes. Le titre de l'onglet devient « ▶ À toi de jouer » : utile quand on a changé d'onglet.
* **À qui est ce héros ?** Chaque héros porte son propriétaire (colonne de gauche, champ de bataille, bandeau du bas) ; les tiens ont un liseré **laiton**. Un héros dont le joueur est parti est marqué « Pilote automatique ».
* **Ce qui n'est pas à toi est grisé** (boutons *Avancer*, *Lancer le D20*, choix, compétences, *Fin du tour*) et les raccourcis clavier se taisent. Le sac, les soins et potions, les achats et les actions de fantôme ne concernent que ton héros.
  L'écran grise, mais c'est le **serveur** qui refuse : on ne peut pas tricher en bricolant la page.
* **En-tête** : le minuteur n'est plus un bouton (c'est le salon qui le règle : une pastille en lecture seule) ; **Quitter** pour tout le monde, **Abandonner** (pour tout le groupe) pour l'hôte seulement.
* **Bilan** : mes héros d'abord (liseré laiton, pastille « toi »), « Joué par… » sous les autres, « Parti avant la fin : aucune récompense » pour celui dont le joueur est parti ; pas de bouton « Rejouer » (le salon est fermé).

---

## 4. Les animations de combat (`src/ui/fx*.js`)

Le moteur répond à une action par **une liste d'événements** (qui a lancé quoi, qui a perdu combien de PV...) et par l'état final. L'interface
ne se redessine **pas** tout de suite : elle **rejoue d'abord l'action, coup par coup, sur l'ancien écran**, puis affiche le résultat.

```
act() ──► le moteur répond (événements + état final)
              │
              ▼
   fx-plan.js    découpe les événements en « temps forts » (un par compétence lancée) et dit COMMENT chacun se montre ;
                 recalcule les PV de chaque cible APRÈS chaque impact (les barres descendent coup après coup) — pur, testé sans navigateur
              │
              ▼
   fx.js         joue le scénario : élan, impact, recul, chiffres, barres de vie, étiquettes, sons
   fx-canvas.js  les particules (calque plein écran, éteint au repos) : étincelles, entailles, projectiles, dômes, halos...
              │
              ▼
          redraw()   l'écran montre le résultat
```

* **Chaque compétence a son geste** : mêlée (élan jusqu'à la cible), tourbillon (onde qui touche chaque ennemi quand elle l'atteint),
  projectile (flèche, épine, rayon, éclair, esprit), frappe d'en haut, onde, ou soutien (soin, bouclier, bonus, provocation, étourdissement, racines,
  résurrection...). Les monstres griffent, mordent, entaillent ou écrasent selon leur **espèce** (`kind` dans `monsters.json`).
* **Quand l'ancien écran ne montre pas les combattants** (un combat commence, la vague suivante du farm arrive), l'écran se redessine d'abord,
  les monstres **entrent en scène**, puis on y rejoue ce qu'ils ont fait.
* **Trois styles** (bouton « éclair » de la partie, ou *Sons et animations* dans le menu) : **complètes**, **rapides** (deux fois plus vite : pour
  les longues sessions de farm), **réduites** (les chiffres, les barres de vie et les sons, **sans mouvement**). Par défaut : complètes, sauf si le
  système demande moins de mouvement (`prefers-reduced-motion`). **Un clic ou une touche pendant une animation la saute.**
* Pendant l'animation l'écran ne réagit pas (`html.fx-playing`), et `act()` refuse une seconde action : impossible de jouer deux fois en même temps.
* Une animation qui plante ne bloque jamais la partie (le résultat s'affiche quand même ; garde de 14 s).

### Donner son geste à une compétence

Le jeu **déduit** le geste d'une compétence de sa portée, de sa cible et de ses effets. Pour le choisir soi-même, on ajoute un champ `fx` à la
compétence (voir « L'animation d'une compétence » dans [`ECRIRE-UNE-CLASSE.md`](ECRIRE-UNE-CLASSE.md)). Les styles des compétences fournies sont
écrits dans le tableau `PRESETS` de `src/ui/fx-plan.js`.

### Ajouter un effet visuel

Une image = une fonction de `fx-canvas.js` (`sparks`, `slash`, `ring`, `flash`, `rise`, `dome`, `projectile`...) appelée depuis `hitFx` (impacts),
`supportFx` (états) ou `runCast` (gestes) dans `fx.js`. Les couleurs viennent de la table `ELEMENTS` de `fx-canvas.js` (physique, sacré, feu, poison,
nature, ombre, givre, arcane, sang). Le test `tests/ui-fx.cjs` vérifie qu'après chaque animation plus rien ne traîne (poses annulées, calque vide).

---

## 4 bis. Les sons (`src/ui/sound.js`)

**Aucun fichier audio** : tout est fabriqué par le navigateur (Web Audio). Un son est une petite « recette » de quelques couches — un souffle de
bruit filtré pour le mouvement de l'air, un coup grave pour le poids, une cloche métallique pour l'éclat, des étincelles aiguës pour la magie —,
chacune avec sa courbe de volume et son glissement de hauteur. Tout passe ensuite par une chaîne commune : volume → compresseur (dix coups
d'affilée ne saturent jamais) → écrêtage doux, avec une petite salle de **réverbération** pour les sons « magiques » ou « solennels ».

* **57 sons**, rangés en 7 familles : interface, donjon (rencontre, coffre, piège, fontaine...), gestes et sorts, impacts (entaille, estoc, coup écrasant,
  griffes, morsure, magie, éclaboussure, onde, siphon, critique, bloqué, raté), états (bouclier, bonus, poison, étourdi...), voix des monstres (une par
  **espèce**), fins de combat (victoire, défaite).
* Les impacts et les sorts prennent la **couleur du sort** (le feu crépite, le sacré tinte, l'ombre gronde...) et sont **placés à gauche ou à droite**
  selon la position du combattant à l'écran.
* Les sons sont **coupés par défaut**. Menu → **Sons** : marche / arrêt, **volume**, style des animations, et le **banc d'essai** : un bouton par son,
  un choix de couleur de sort, et « Écouter un petit combat ». C'est l'outil pour dire quels sons ne conviennent pas.
* **Retoucher un son** : c'est une entrée de la table `SOUNDS` (`g` famille, `n` nom, `d` durée, `k` gain, `f` la recette). Les couches s'écrivent avec
  `v.tone` (note), `v.noise` (souffle), `v.thump` (coup grave), `v.bell` (cloche), `v.pluck` (corde pincée), `v.sparkle` (étincelles), `v.brass`, `v.pad`.
  Les gains `k` ont été réglés pour que la **sonie** (pas seulement le pic) soit équilibrée entre familles ; `tests/ui-sound.cjs` fabrique chaque son hors
  ligne et vérifie : pas de silence, pas d'écrêtage, pas de valeur folle, durée annoncée juste. Un test sans navigateur vérifie que **chaque nom de
  son demandé par l'interface existe** (une faute de frappe = silence, on la refuse).

---

## 4 ter. Les illustrations (`src/ui/art.js`, `src/ui/art/`)

Les personnages, les monstres, les décors et les cases sont **dessinés en code** (SVG de 100 × 100) : aucune image à charger, ça passe à toutes les
tailles, et la lumière vient toujours d'en haut à gauche (la lanterne), avec un reflet chaud sur les bords et un voile sombre qui unifie l'ensemble.

| Quoi | Où | Combien |
| --- | --- | --- |
| Portraits des **classes** | `art/heroes.js` | 4 (Berserker, Veilleur, Druide, Duelliste) |
| Portraits des **monstres** | `art/monsters-caves.js` · `-crypt.js` · `-depths.js` | 20 (un par monstre, mannequins compris) |
| **Décors** du champ de bataille | `art/scenes.js` (`SCENES`) | 5 : caves, crypte, profondeurs, terriers (farm), salle d'entraînement |
| **Vignettes** des cases | `art/scenes.js` (`VIGNETTES`) | 8 : embuscade, trésor, piège, 2 fontaines, coup bas, marchand, boss |

* Le **décor** suit la profondeur du donjon (tranche ≥ 8 : profondeurs, ≥ 4 : crypte, sinon caves), la zone de farm, ou la salle d'entraînement. Le JSON peut en imposer un :
  champ `scene` d'une tranche (`data/tranches.json`) ou d'une zone de farm (`data/farm.json`).
* La **vignette** d'une case s'affiche en bandeau sur sa carte (coffre, piège, fontaine...) ; l'écran « Avancer » montre le couloir de la tranche.
* **La galerie** : ouvre `tools/galerie.html` (avec `node serve.mjs`, adresse `/tools/galerie.html`) pour voir tous les dessins à plusieurs tailles ;
  `?only=berserker` n'en montre qu'un, en grand.
* **Remplacer un dessin par une vraie image** (PNG, JPG, WebP, SVG...) : ajouter `"art": "img/berserker.png"` à une classe, à un monstre ou à un type de case
  (`data/tiles.json`), ou `"scene": "img/mes-caves.jpg"` à une tranche ou à une zone de farm. Le fichier se pose où l'on veut (par exemple un dossier `img/`).
  Les portraits sont rognés en rond : prévoir un sujet centré, carré.
* **Ajouter un portrait** : une fonction dans le fichier de la bonne série, qui prend le préfixe unique `u` et renvoie `wrap(u, { defs, inner, bg, at })`
  (voir `art/kit.js` : dégradés `lin` / `rad`, halos `glow`). Puis l'inscrire dans la table de la série. Un monstre ou une classe sans portrait garde
  son icône dans le médaillon : rien ne casse. Le test `tests/run-tests.mjs` vérifie que chaque dessin est bien formé et que chaque dégradé cité existe.

---

## 4 quater. Ce qui reste pour les finitions

Le jeu a maintenant ses images, ses mouvements et ses sons. Il reste :

* des **images peintes** (si tu en veux : le champ `art` les accepte) et des cadres plus travaillés ;
* une **musique** d'ambiance et des bruits de fond (un son par tranche) ;
* une passe d'**accessibilité** (contrastes, daltonisme, tailles de texte réglables).

Aucune de ces tâches ne demande de toucher à la logique du jeu : elles se font toutes dans `src/ui/` et `css/style.css`.

---

## 5. La couleur des raretés

Elle ne vient **pas** du CSS : elle est écrite dans `data/items.json` (section `rarities`, champ `color`). L'interface la pose sur la carte
dans la variable `--rar`, que le CSS utilise pour la bordure, le nom, la pastille et le halo (épique) ou le reflet (légendaire).
Changer une couleur de rareté = changer une ligne dans le JSON.

| Rareté | Couleur |
| --- | --- |
| Commun | gris |
| Inhabituel | vert |
| Rare | bleu |
| Épique | violet |
| Légendaire | orange |
