# Carnet d'idées — contenu (classes, compétences, monstres, donjons)

> Document de travail : on y pose les idées, on note si elles tiennent dans le JSON ou si elles demandent du code.
> Légende : 🟢 faisable en JSON · 🟡 un peu de code · 🔴 gros chantier · ❓ à décider

---

## 1. Cadre général

| Idée | Statut |
| --- | --- |
| **Niveau plafonné à 8** pour l'instant (`maxLevel: 8` dans `rules.json`), tranches 12/16/20 restent « bientôt » | 🟢 |
| **Progression lente** (courbe `xpToNext` à rallonger, à régler avec `simulate.mjs` / `farm-sim.mjs`) | 🟢 |
| **3 spécialisations par classe** (façon WoW) : une spé verrouille ses branches | 🟡 code (aujourd'hui les branches ne sont que visuelles) |
| **Passifs de base** de la classe : toujours actifs, sans choix (`innate: true`) | 🟢 |
| **4 sorts équipés au maximum** + **1 sort de classe** (voir §2) : il faut choisir | 🟡 code (barre équipée, choix hors combat, validation serveur) |
| **Écran de présentation de chaque classe** à la création (idée, rôle, ressource, spés, sort de classe) | ✅ fait : la fenêtre « Nouveau personnage » présente la classe choisie |
| ✅ **Fait** : les 4 anciennes classes sont **retirées du jeu** (Berserker → Sacrieur, Veilleur → Prêtre, Duelliste → Assassin par les `aliases` ; elles restent dans `tests/fixtures/classes-de-test.json` pour les tests). **Les 6 nouvelles classes remplacent les 4 anciennes** (on les peaufine). Les `aliases` de `classes.json` convertissent les anciennes sauvegardes de personnage ; les compétences apprises devront être migrées. | 🟡 |
| ✅ **Spé tardive** : tous les personnages d'une classe partent avec les mêmes sorts ; la spécialisation arrive plus tard et **ajoute** des passifs ou des sorts actifs (pas de verrouillage de branches à la création). | 🟡 champ `spec` sur le personnage + `spec` requise sur certaines compétences |
| ✅ **Spé : on peut en changer entre deux parties** (gratuit, pour essayer un autre gameplay). Voir §1 bis pour la progression. | 🟡 |
| ✅ **Changer ses sorts équipés** : à l'accueil (gratuit) et **en donjon** à un feu de camp, au marchand, ou via un PNJ rare (voir §4). | |
| ✅ **Deck de 4 emplacements** *(fait)* (sorts choisis) **+ le sort de classe + une attaque à l'arme** toujours disponible (pour que chaque classe puisse frapper). | 🟡 |

**Structure d'une classe :** passif(s) de base + **4 sorts équipés** choisis dans le pool de la spé + **1 sort de classe** propre à la classe (le « bouton signature »).
❓ Le sort de classe est-il compté en plus des 4 ? (lecture actuelle : oui, 4 + 1.)

---

## 1 bis. Les spécialisations : progression et choix

**Principe** : la spé est une voie qui s'ajoute à la classe, par paliers, et qu'on peut changer **entre deux parties**.

| Niveau | Ce qu'apporte la spé |
| --- | --- |
| **4** | Un premier gain de puissance : la spé débloque son sort signature + **un choix parmi 3** (sort / passif). |
| **8** | Un gain plus gros avec un début de **synergie** : nouveau choix parmi 3, qui fait « parler » les éléments entre eux. *(Dernier palier de la version actuelle, plafonnée à 8.)* |
| **20** | Le **gameplay complet** de la spé + sa **compétence ultime**. *(Pas encore jouable.)* |

**Sorts de base qui évoluent** : choisir une spé peut **transformer** un sort de base de la classe (« version évoluée »). Exemple, Assassin poison : *Entaille* fait des dégâts ; avec la spé, elle **applique aussi du poison**.

**Exemple de palier 4 — Assassin, spé Poison** : on débloque le sort qui empoisonne, **et** on choisit un seul des trois :
1. un sort de **poison anti-soin** ;
2. un **passif** : plus de dégâts sur une cible empoisonnée ;
3. un sort qui **frappe 2 fois** et pose **2 cumuls** de poison.

**Ce que ça demande** (🟡) :
- un champ `spec` sur le personnage (changeable hors partie) ;
- des compétences réservées à une spé et à un palier (`spec`, `specTier`) ;
- des groupes de choix « prends-en un parmi 3 » (`choiceGroup`) ;
- des **sorts évolués** : un sort de base a une variante qui le **remplace** quand la spé est active (`upgradedBy`) ;
- des **cumuls** (stacks) de poison : le moteur actuel ne sait pas empiler un poison, c'est un statut simple. 🟡
- « poison anti-soin » : un statut qui réduit les soins reçus. 🟡 (nouveau `mod` sur `healTaken`)
- ⚠ Les cumuls et les variantes de sort touchent le serveur, l'interface (fiche) et les tests ; à faire **avec** le système de spés, pas après.

**Rythme** : « un point de spé tous les 4 niveaux » = 2 points dans la version actuelle (niveaux 4 et 8).

## 2. Les classes

### Sacrieur ✅ *(écrit : niveaux 1 à 8, premier jet d'équilibrage)*
Dans `data/classes.json` (id `sacrieur`). Il **remplacera le Berserker**, qu'on garde pour l'instant : les tests et le simulateur s'appuient dessus. Le retirer = supprimer son bloc et ajouter `"aliases": ["berserker"]` au Sacrieur.

**Le kit de base** (connu dès la création, débloqué au fil des niveaux 1 à 6) :

| Élément | Ce que c'est | Valeurs (provisoires) |
| --- | --- | --- |
| **Sang chaud** (passif de base) | Selon le **mode** : *Endurance* = moins de dégâts reçus, *Fureur* = plus de dégâts infligés, selon les PV manquants | −0,55 % reçus / +0,85 % infligés **par 1 % de PV manquants** (50 % de PV perdus : −27 % ou +42 %) |
| **Pacte de sang** (sort de classe) | Change de mode. De base : Endurance. **1re utilisation du combat gratuite**, ensuite 1 PA | 1 PA, `freeFirst` |
| **Entaille** *(niv. 1)* | Coup simple | 3 PA, puissance 1,0, pas de relance |
| **Carapace de sang** *(niv. 1)* | Bouclier qui grandit avec les PV manquants. **Lit le mode** | 3 PA, relance 2 ; Endurance : 12 % PV max + 45 % des manquants ; Fureur : 6 % + 20 % |
| **Morsure de sang** *(niv. 2)* | Vol de vie. **Lit le mode** | 5 PA, relance 2 ; Endurance : puissance 1,8, vole 65 % ; Fureur : puissance 2,3, vole 35 % |
| **Provocation** *(niv. 3)* | Les ennemis doivent le viser 2 tours + petit bouclier | 2 PA, relance 3 |
| **Punition** *(niv. 4)* | Frappe plus fort quand il lui manque des PV ; **1×/combat** ; chaque spé la fait évoluer | 4 PA, puissance 1,3 + 0,05 par 1 % de PV manquants |
| **Coup téméraire** *(niv. 5)* | Gros dégâts qui lui coûtent des PV (sans le tuer, **aucun bouclier ne les absorbe**). **Lit le mode** | 4 PA ; Endurance : puissance 2,0, −6 % PV max ; Fureur : puissance 2,6, −10 % |
| **Crochet** *(niv. 6)* | Ramène un ennemi du rang arrière sur le rang avant | 2 PA, portée « toute cible », relance 2 |

**Spécialisations, niveau 4** (tout se débloque **automatiquement** en la choisissant) :
- **Bastion** (tank) : *Rempart de chair* (−0,2 % de plus par 1 %), **Sacrifice** (il encaisse à la place de ses alliés jusqu'au début de son prochain tour ; 3 PA, relance 4), **Dernier souffle** (survit à 1 PV + bouclier de 35 % des PV max, 1×/combat), *Punition protectrice* (moins de dégâts, gros bouclier).
- **Équilibre** (hybride) : *Sang mêlé* (réduction ET dégâts toujours actifs : le côté de son mode à 100 %, l'autre à **50 %**), **Souplesse** (le 1er changement de mode de chaque tour lui rend son PA : il passe d'un mode à l'autre gratuitement), **Lame protectrice** (4 PA, relance 1 : des dégâts + un bouclier de 5 % PV max + 20 % des PV manquants), *Punition vampirique* (dégâts normaux + vol de vie 40 %).
- **Écorché** (dps) : *Fureur sanglante* (+0,1 % de plus par 1 % en Fureur), **Déchirure** (2,6 de puissance, −15 % PV max), **Festin de sang** (1,9 de puissance, vol de vie 50 %), *Punition sanglante* (il se saigne de 12 % **avant** de frapper, donc elle tape plus fort).

**Spécialisations, niveau 8 : un seul choix parmi trois** (on peut en changer librement ; le nouveau remplace l'ancien) :

| Spé | Choix |
| --- | --- |
| **Bastion** | **Représailles** (renvoie des dégâts à qui le frappe) · **Sang partagé** (bouclier de 12 % à toute l'équipe, il s'inflige 10 % ; 3 PA, relance 3) · **Peau de pierre** (bouclier de 15 % au début du combat) |
| **Équilibre** | **Transfusion** (il donne 15 % de ses PV max, l'allié en regagne 25 % des siens ; 3 PA, relance 2) · **Hémorragie** (dégâts + saignement 3 tours, vole 20 % ; 4 PA, relance 2) · **Adaptation** (quand il change de mode : +15 % dégâts et −15 % dégâts reçus pendant 2 tours) |
| **Écorché** | **Saignée volontaire** (−20 % PV max, +3 PA : +2 net ; 1 PA, relance 3) · **Exécution** (un coup en plus sur un ennemi sous 30 % de PV) · **Frénésie** (+2 PA quand il achève un ennemi) |

**Paliers « à venir »** (aperçus affichés dans la fiche, aucune compétence derrière) : **niveau 12** « Un nouveau choix parmi trois » pour les trois spés, et l'**ultime niveau 20** :
- Bastion : **Forteresse** — pendant 2 tours il encaisse pour toute l'équipe et subit moitié moins de dégâts.
- Équilibre : **Pacte parfait** — les deux passifs de Sang chaud à 100 % pendant 3 tours.
- Écorché : **Dernier sang** — sous 15 % de PV, tous ses sorts coûtent 1 PA de moins et font ×1,5.
*(Idée gardée sous le coude : mettre la Punition en ultime de niveau 20 et la retirer du kit de base pour l'instant.)*

**Nouveaux mécanismes du moteur** (réutilisables) : modes de classe, première utilisation gratuite (`freeFirst`), compétences automatiques (`auto`), `redirect` (Sacrifice), `powerPerMissingHp` et `pctMissingHp`, **conditions sur un effet** (`if` : un même sort change selon le mode), déclencheur `modeChange`, **choix de groupe qui se remplacent** gratuitement, paliers `upcoming`, coûts en PV qui ignorent les boucliers, déblocage de sorts de départ par niveau. Voir `docs/ECRIRE-UNE-CLASSE.md` §3 ter.

**Choix d'interprétation à confirmer :**
1. **Équilibre / « sans buff »** : les deux effets actifs en même temps, le côté de son mode à 100 % et l'autre à 50 %, pour que le Pacte de sang garde un sens.
2. **Crochet** : « passer un perso distance en face » compris comme **attirer un ennemi** du rang arrière sur le rang avant (pas déplacer un allié).
3. **Sacrifice « 1 tour complet »** : jusqu'au début du prochain tour du Sacrieur. `turns: 2` le ferait durer plus.
4. **La Garde** n'est plus dans la barre (pas de case) : à voir plus tard.

**Équilibrage (robots, 60 parties, équipe Sacrieur + Veilleur + Duelliste, Profondeurs niv. 8, victoires)** : Berserker (référence) 73 % · Sacrieur sans spé 62 % · Bastion 72 % · Équilibre 70 % · Écorché 77 % (`node tests/sacrieur-sim.mjs 60`). Les robots donnent des ordres de grandeur (±7 points) et ne jouent pas encore finement les choix du palier 8 (ils ne basculent pas de mode pour *Adaptation*).
⚠ Le Sacrieur est **plus facile que le Berserker aux petits niveaux et en solo** (la défense qui suit ses PV max et les sorts de soin le rendent presque intouchable contre des monstres faibles) : à surveiller en jouant. **Reste à faire** : le palier 12 et l'ultime niveau 20 (aujourd'hui des aperçus).

### Templier ✅ *(écrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `templier`). Tank-soigneur-dps de la foi, au rang avant. Stats : PV 52, attaque 5,8, défense 3,4, **soin 4,5** (il peut soigner sans spécialisation).

- **Ressource : Puissance sacrée** (max 5, **0 au début de chaque combat**, affichée en or dans le bandeau et sur sa carte). Les **générateurs** sont plus faibles que les autres sorts : un sort à 3 PA donne **+1**, le Marteau du jugement (5 PA) **+2**. Les **consommateurs** (`spend`) sont très puissants : le *Verdict* (3 points : puissance 3,0 pour 2 PA), le *Rempart de lumière* (3 : bouclier d'équipe), l'*Éclat de lumière* (**5 : gros soin de zone** + purification). Le deck de départ a 2 générateurs et 2 consommateurs. Un consommateur est grisé tant qu'il manque des points.
- **Passif de base : Ferveur** : quand un monstre le frappe, **+1 puissance sacrée** (une fois par tour) : il se charge en encaissant.
- **Sort de classe : Aura sacrée** (1 PA, **1re utilisation gratuite**, comme le Pacte de sang) : **un clic ouvre un petit menu à trois icônes** et on choisit l'**aura** voulue (effet `mode` « pick », action `modeId`). L'aura est un mode de classe dont le bonus profite à **toute l'équipe, lui compris**, tant qu'il est vivant : **Protection** (−8 % de dégâts reçus), **Vengeance** (+8 % de dégâts), **Dévotion** (+15 % de soins et boucliers). La spécialisation renforce son aura (Gardien −10 %, Vindicte +11 %, Lumière +25 %). Un allié voit l'aura sur sa carte (« Aura de vengeance », bonus permanent) et dans son panneau d'effets.
- **Sorts de base** : *Frappe sacrée* (L1, +1), *Bénédiction* (L1, petit soin, +1), *Verdict* (L1, 3), *Éclat de lumière* (L3, 5), *Marteau du jugement* (L4, +2, relance 2), *Rempart de lumière* (L5, 3), *Défi* (L6, provocation + bouclier, +1).
- **Spécialisations** (palier 4 automatique ; palier 8 = 1 choix parmi 3, modifiable ; aperçus 12 et ultime 20) :
  | | Idée | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Gardien** (Tank) | Le rempart de l'équipe | Armure de foi (−5 % de dégâts reçus, aura renforcée), Main de protection (garde un allié), Frappe / Verdict / Défi du gardien (boucliers en frappant) | Serment de fer (+1 puissance par tour) · Sanctuaire (garde toute l'équipe, 5 points) · Dernier rempart (survit une fois) | Avatar de lumière |
  | **Lumière** (Soin) | Le soigneur | Dévotion (+10 % de stat de soin), Imposition des mains (35 % des PV, 3 points), Bénédiction de lumière (soin + soin sur la durée), Éclat purificateur, Frappe de lumière (soigne en frappant) | Source de vie (soin à chaque tour) · Miracle (ressuscite, 5 points) · Prière (soin sur 3 tours, +2 puissance) | Aube nouvelle |
  | **Vindicte** (Dégâts) | Les verdicts dévastateurs | Sainte colère (+8 % ; dépenser de la puissance sacrée donne +20 % pendant 2 tours), Croisade (+20 %, +2 puissance), Frappe vengeresse, Verdict vengeur, Marteau de colère (brûlure) | Jugement final (5 points, puissance 5,0) · Flamme sacrée (brûlure à chaque coup) · Croisé infatigable (achever : +2 puissance, +1 PA) | Colère divine |
- **Nouveau dans le moteur** : `aura` dans un mode de classe (modificateurs donnés à tous les alliés tant que le héros garde ce mode), condition `spec` (sur le porteur de l'aura ou n'importe quel `if`), événement `spend` (réaction quand on dépense une ressource). Détails : `docs/ECRIRE-UNE-CLASSE.md` §3 quinquies.
- **Équilibrage (robots, équipe Templier + Veilleur + Duelliste, Profondeurs niv. 8, victoires ; `node tests/templier-sim.mjs 60`)** : Berserker (référence) ~70 % · Templier sans spé ~60 % · Gardien ~86 % · Lumière ~76 % · Vindicte ~82 %. **Seul** (Crypte niv. 6) : Berserker ~72 %, Templier 92-98 % (sauf Lumière : 16 %, un soigneur seul est fragile). ⚠ Comme le Sacrieur, il est **très solide seul** (aura + boucliers + soins) ; en équipe le Gardien reste le plus fort. Leviers : le −5 % et l'aura du Gardien, le Défi, la garde de la Main de protection (relance 4), la puissance du Verdict.
- ❓ **Questions** : les trois auras suffisent-elles (une aura de rapidité ?). Faut-il un deuxième générateur à 1 PA ? (Le choix de l'aura est direct depuis la version 23 : plus de cycle.)

### Assassin ✅ *(écrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `assassin`). Les anciennes classes sont gardées pour l'instant (tests et simulateur).

- **Identité** : dps fragile (PV 40, attaque 7, défense 2), **au rang avant au départ** ; **tous ses sorts atteignent n'importe quel rang** (`range: any`) : il va chercher les soigneurs et les tireurs du fond. Il n'y a pas de ressource (les points de combo ne sont pas retenus : trop proche de l'Élan du Duelliste).
- **Sort de classe : Marque mortelle** (1 PA, **gratuite tant que rien n'est marqué**, `freeIfNoMark`) : désigne UNE proie ; elle subit **+15 % de dégâts** de l'Assassin, et ses sorts ont des **bonus sur la cible marquée** (`bonus`, `ifTarget: { targetMarked: true }`). Une nouvelle marque retire l'ancienne ; la marque disparaît à la mort de la cible. Quand la proie meurt, la Marque est de nouveau gratuite.
- **Passif de base : Chasseur de têtes** : achever sa proie marquée rend **+1 PA** (une fois par tour).
- **Sorts de base** (4 en deck, tous « any ») : *Estoc de l'ombre* (3 PA), *Lame venimeuse* (3 PA, un **cumul de venin**, +1 sur la proie), *Coup dans le dos* (4 PA, relance 2, le gros coup), *Coup de grâce* (L4, 4 PA, 1×/combat, plus fort sur une cible blessée), puis *Disparition* (L3, rang arrière + garde), *Tourbillon de lames* (L5, zone), *Poudre aveuglante* (L6, l'ennemi inflige moins).
- **Venin** : un `dot` **cumulable** (`stack`, 4 cumuls au plus, tous les venins partagent la même `key`). Il **peut tuer** (c'est un saignement, pas un poison de monstre).
- **Spécialisations** (palier 4 automatique ; palier 8 = 1 choix parmi 3, modifiable ; aperçus 12 et ultime 20) :
  | | Idée | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Venin** (Poison) | Des venins qui frappent fort quand le combat dure | Toxines (+25 % venin), Nuage toxique (zone), Estoc venimeux, Lame de vipère (2 cumuls), Coup de grâce empoisonné (3 cumuls), Marque venimeuse | Toxine affaiblissante · Prédateur toxique (+20 % sur cibles empoisonnées) · Double morsure | Pandémie : 5 cumuls à tous |
  | **Exécuteur** (Assassinat) | Achever les cibles blessées | Instinct de tueur (+20 % sous 40 % de PV), Mise à mort (+1 PA de plus), Garrot (étourdit la proie marquée), Estoc fatal, Exécution (énorme sous 25 %), Marque de mort (+25 %) | Boucherie · Chasse sans fin (la marque passe sur l'ennemi le plus blessé) · Sang-froid (critique dès 17) | Coup fatal |
  | **Traqueur** (Polyvalent) | Marquer, enchaîner, ne jamais manquer de PA | Pas furtifs (−25 % de dégâts reçus au rang arrière), Volée de dagues (zone), Estoc du traqueur (+1 PA sur la proie), Coup de grâce vif (+2 PA), **Double marque** (2 proies, +15 % chacune) | Lame d'ombre (frappe chaque proie marquée) · Danse macabre (+1 PA par ennemi achevé) · Instinct de survie | Chasse mortelle |
- **Nouveau dans le moteur** : effet `mark`, `freeIfNoMark`, `needsMark`, conditions `targetMarked` / `targetStatus`, `ifTarget` (sur un effet), `bonus` et `powerPerTargetMissingHp` (sur `damage`), passif `targetDamage`, `dot` `stack` / `maxStacks` / `key` / `name`, stat `dot`, cible d'effet `lowestEnemy`. Détails : `docs/ECRIRE-UNE-CLASSE.md` §3 quater.
- **Équilibrage (robots, équipe Sacrieur + Veilleur + dps, Profondeurs niv. 8, victoires ; `node tests/assassin-sim.mjs 60`)** : Duelliste (référence) ~65 % · Assassin sans spé ~86 % · avec une spécialisation 96-100 % (les équipes « solides » du jeu font ~92 %). **Solo** (Crypte niv. 6) : sans spé ~6 %, Venin ~20 %, Exécuteur ~58 %, Traqueur ~45 %.
  ⚠ Il est **trop fort avec une spé en équipe** et **fragile en solo** (comme le Duelliste) : à régler à la main selon le ressenti. Les leviers, par ordre d'effet : le bonus des sorts sur cible marquée, le coût/relance du Garrot (étourdir une proie solo est très fort), la puissance des venins (cumul × 4), les PA rendus du Traqueur.
- ❓ **Questions** : le Garrot (étourdissement) est-il trop fort contre les monstres seuls ? La Marque doit-elle aussi améliorer le venin ? Faut-il une 2e passive de base ? L'**archer** : spé de l'assassin, ou classe à part ? (voir « Manques »)

### Prêtre ✅ *(écrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `pretre`). Soigneur au rang arrière (PV 38, attaque 5,2, défense 2,6, **soin 6**), sans ressource : c'est sa **forme** qui change tout.

- **Sort de classe : Forme d'ombre** (mode de classe `lumiere` / `ombre`, `"set": "toggle"`) : **1re utilisation gratuite, ensuite 1 PA, relance 2 tours** (un mauvais moment se paie : on ne revient pas tout de suite). Chaque combat commence en **lumière**.
- **Passif de base : Dualité** : *lumière* = soins et boucliers +10 % ; *ombre* = **dégâts +35 %**, mais **soins et boucliers −50 %**.
- **Sorts de base** : *Châtiment* (L1, à distance), *Soin rapide* (L1), *Mot de l'ombre : Douleur* (L1, 2 PA, petite blessure + douleur 3 tours), *Mot de pouvoir : Bouclier* (L1), *Prière de soins* (L3, zone, relance 2), *Mot de l'ombre : Mort* (L4, énorme sous 30 % de PV), *Rénovation* (L5, soin sur la durée), *Cri psychique* (L6, les ennemis font −20 % pendant 2 tours).
- **Spécialisations** (palier 4 automatique ; palier 8 = 1 choix parmi 3, modifiable ; aperçus 12 et ultime 20) :
  | | Idée | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Sacré** (Soin) | Le grand soigneur, rien de gâché | Égide divine (soins +15 %, **60 % du soin en trop devient un bouclier**), Soin supérieur, Soin éclatant (purifie), Prière de guérison, Châtiment sacré (soigne en frappant) | Esprit de rédemption (survit 1×, soigne l'équipe) · Hymne divin (30 % PV + bouclier à toute l'équipe) · Gardien des âmes (−60 % de dégâts + soin sur 2 tours) | Salut |
  | **Discipline** (Hybride) | Frapper pour soigner | Expiation (+15 % de dégâts ; **ses dégâts soignent les alliés sous Expiation : 60 %, 40 % en ombre**), Pénitence (et l'Expiation sur l'allié le plus blessé), Mot de pouvoir : Expiation, Rayonnement, Châtiment de discipline | Évangélisme (Expiation à toute l'équipe) · Barrière de puissance · Schisme (+20 % sur les cibles rongées) | Rayonnement absolu |
  | **Ombre** (Dégâts) | Des mots qui rongent | Ténèbres intérieures (douleurs +25 % en ombre), Toucher vampirique (douleur dont **40 % soigne l'allié le plus blessé**), Douleur ombreuse, Pointe mentale, Mot de l'ombre : Ruine | Éruption du Vide (frappe chaque ennemi rongé) · Ombres dévorantes (douleurs +35 %) · Folie (+1 PA en achevant, en ombre) | Forme du Vide |
- **Nouveau dans le moteur** : effet `expiation` et cible d'effet `"to": "expiation"`, stat `overhealShield` (soin en trop → bouclier), `drain` sur un `dot`. Détails : `docs/ECRIRE-UNE-CLASSE.md` §3 sexies.
- **Équilibrage (robots, équipe Berserker + soigneur + Duelliste, Profondeurs niv. 8, victoires ; `node tests/pretre-sim.mjs 60`)** : Veilleur (référence) ~75-78 % · Prêtre sans spé ~80-83 % · Sacré ~86-88 % · Discipline ~70-78 % (selon le deck). L'**Ombre** se juge comme **dps** (équipe Berserker + Veilleur + dps) : Duelliste ~75 %, Prêtre Ombre ~90 %. **Seul** (Crypte niv. 6) : Veilleur ~73 %, Ombre ~63 %, les autres 5-20 % (un soigneur pur seul n'a pas de quoi tuer : comme le Templier Lumière).
  Les robots basculent de forme simplement (l'Ombre reste en ombre ; Sacré et Discipline passent en ombre quand personne n'a besoin de soins) : un joueur fera mieux.
- ❓ **Questions** : la relance de 2 tours est-elle trop punitive (ou pas assez) ? L'Expiation doit-elle aussi profiter au Prêtre lui-même ? Un Sacré seul est-il trop faible ?

### Guerrier ✅ *(écrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `guerrier`). Tank au rang avant (PV 56, attaque 6,2, défense 3,8). Il se distingue du Sacrieur par le **contrôle** (affaiblir, assommer), la **provocation**, l'**armure** et la **protection des alliés**.

- **Ressource : Rage** (max 10, **0 au début de chaque combat**). Passif de base **Colère** : chaque coup encaissé donne **+1 rage** (+2 en posture défensive) ; la Frappe héroïque +2, le Cri de guerre +2… Les gros coups en dépensent : *Exécution* (4), *Enchaînement* (3, zone), *Coup de bouclier* (5, assomme). Pas de passif « plus de rage = plus de dégâts ».
- **Sort de classe : Posture** (1 PA, **le joueur choisit** dans un petit menu, comme l'Aura sacrée ; `"noun": "posture"` dans `modes` nomme le menu) : **Combat** (dégâts +5 %, reçus −5 %, la posture de départ), **Offensive** (dégâts +20 %, reçus +10 %), **Défensive** (reçus −20 %, dégâts −15 %, plus de rage quand on le frappe). Elle reste jusqu'à la fin du combat.
- **Sorts de base** : *Frappe héroïque* (L1), *Brise-genou* (L1, la cible fait −15 %), *Exécution* (L1, 4 rage, plus forte sur un blessé), *Cri de guerre* (L1, +10 % de dégâts à l'équipe), *Provocation* (L3), *Enchaînement* (L4), *Coup de bouclier* (L5, assomme), *Interception* (L6, encaisse pour ses alliés).
- **Spécialisations** (palier 4 automatique ; palier 8 = 1 choix parmi 3 ; aperçus 12 et ultime 20) :
  | | Idée | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Armes** (Dégâts) | Précision, blessures, exécutions | Maître d'armes (+10 %, critique dès 19), **Frappe mortelle** (blessure profonde : **soins reçus −50 %**, régénération des monstres comprise), Frappe d'armes, Exécution d'armes | Brise-armure (−35 % de défense) · Tempête de lames (zone + blessure) · Sang-froid (critique : +3 rage, +1 PA) | Colosse |
  | **Fureur** (Dégâts) | Deux coups par sort | Enragé (dépenser de la rage : +10 % pendant 2 tours ; +1 rage en frappant), **Déchaînement** (deux coups), Sanguinaire (vol de vie), Cri de rage | Massacre (+1 PA en achevant) · Tourbillon (deux coups sur tous) · Rage aveugle (posture offensive sans malus) | Carnage |
  | **Protection** (Tank) | Le bouclier de l'équipe | Rempart d'acier (défense +15 %, **riposte**), Bloc du bouclier, Heurt du bouclier, Défi du protecteur (provocation + garde) | Mur de boucliers (bouclier d'équipe) · Inébranlable (survit 1×) · Vengeance (ripostes plus fortes) | Dernier bastion |
- **Nouveau dans le moteur** : la stat **`healTaken`** (soins reçus ; un malus `mod` dessus = « blessure profonde », le statut anti-soin attendu depuis longtemps : utile contre les ogres et les cultistes qui se soignent), le nom du choix de mode `modes.noun`.
- **Équilibrage (robots ; `node tests/guerrier-sim.mjs 60`)** : en **tank** (équipe tank + Veilleur + Duelliste, Profondeurs niv. 8) : Berserker ~77 % · Sacrieur Bastion ~68-73 % · Templier Gardien ~83-88 % · **Guerrier Protection ~87 %** · Guerrier sans spé ~45 %. En **dps** (Berserker + Veilleur + dps) : Duelliste ~75 % · Assassin Exécuteur ~93 % · **Armes ~98 %** · **Fureur ~100 %** (un 2e combattant robuste au rang avant aide beaucoup les robots). **Seul** : niv. 1 ~78 % (Berserker ~53 %), Crypte niv. 6 83-100 %.
  ⚠ Comme les autres nouveaux tanks, il est **très solide seul** et aux petits niveaux ; Armes et Fureur sont **au-dessus** du Duelliste. Leviers : le malus du Brise-genou, la Posture de combat (+5/−5), Enragé, la puissance du Déchaînement, la défense du Rempart d'acier.
- ❓ **Questions** : la posture doit-elle être gratuite la 1re fois (comme les autres sorts de classe) ? Trois postures ou deux ? Le Coup de bouclier (étourdir) à 5 rage est-il trop fort ?

### Druide ✅ *(réécrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `druide` : une ancienne sauvegarde de Druide reste un Druide, avec le nouveau kit). PV 46, attaque 5,6, défense 3, **soin 5,5**, rang arrière au départ.

- **Sort de classe : Métamorphose** (1re gratuite, ensuite 1 PA ; un menu de choix comme l'Aura sacrée, `"noun": "forme"`) : **Naturelle** (sans bonus), **Ours** (défense +40 %, reçus −10 %, dégâts −10 %, soins −30 % ; **passe au rang avant**), **Arbre** (soins +30 %, défense +10 %, dégâts −40 % ; **rang arrière**), **Félin** (dégâts +30 %, critique dès 19, reçus +10 %, soins −40 % ; **rang avant**). Changer de forme rend 5 % des PV max (passif *Esprit sauvage*, déclencheur `modeChange`).
- **Sorts réservés à une forme** (nouveau champ `modes` d'une compétence) : *Coup de patte* (Ours ou Félin : bouclier en ours, saignement en félin), *Toucher guérisseur* et *Floraison sauvage* (Naturelle ou Arbre), *Rugissement* (Ours), *Lacérer* (Félin, saignement cumulable). *Épine sauvage*, *Bourgeon* (soin sur 4 tours) et *Étreinte des racines* (immobilise) se lancent dans toutes les formes. Un sort hors de sa forme est grisé, et le détail dit « Forme d'ours ou Forme de félin requise ».
- **Spécialisations** (palier 4 automatique ; palier 8 = 1 choix parmi 3 ; aperçus 12 et ultime 20) :
  | | Forme | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Gardien** (Tank) | Ours | Cuir épais (PV +15 % ; en ours −10 % de plus et un bouclier à chaque coup reçu), Peau d'écorce, **Patte du gardien** (en ours : bouclier et **provocation** jusqu'à son prochain tour), Rugissement de défi | Régénération frénétique · Instinct de survie · Charge sauvage (assomme) | Colosse de la forêt |
  | **Restauration** (Soin) | Arbre | Arbre de vie (soins +15 % ; en arbre, l'équipe regagne 2 % à chacun de ses tours), Croissance sauvage, Bourgeon vivace (purifie), Toucher régénérant | Tranquillité (35 % à toute l'équipe) · Renaissance (ressuscite) · Abondance (4 % à chaque tour, toutes formes) | Forêt éternelle |
  | **Farouche** (Dégâts) | Félin | Instinct du prédateur (+10 % sur les cibles qui saignent, saignements +20 %), **Morsure féroce**, Griffure, Lacération profonde (2 cumuls d'un coup) | Frénésie féline (+2 PA en achevant) · Bond (n'importe quel rang) · Saignements sauvages | Fureur sauvage |
- **Nouveau dans le moteur** : `modes` sur une compétence (elle ne se lance que dans ces modes ; libre hors combat), `modes.noun` (« forme »), le journal dit « prend la Forme d'ours ».
- **Équilibrage (robots ; `node tests/druide-sim.mjs 60`, Profondeurs niv. 8)** : en tank (tank + Prêtre Sacré + Assassin) : Guerrier Protection ~92 % · Templier Gardien ~97 % · **Druide Gardien ~97 %** (la provocation de la Patte du gardien fait toute la différence : sans elle ~70 %). En soin (Guerrier + soigneur + Assassin) : Prêtre Sacré ~92 % · **Restauration ~100 %** · Druide sans spé ~78 %. En dps (Guerrier + Prêtre + dps) : Assassin ~92 % · **Farouche ~100 %**. **Seul** (Crypte niv. 6) : Gardien ~100 %, Farouche ~93 %, Restauration 0 % (un pur soigneur seul ne tue rien).
  ⚠ Les équipes de **nouvelles classes** passent les Profondeurs à 90-100 % avec des robots : le contenu de niveau 8 devient facile pour elles. À regarder en jouant (et peut-être relever les monstres plutôt que d'affaiblir les classes).

### Barde ✅ *(écrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `barde`). Le **soutien** du groupe, au rang arrière (PV 42, attaque 5,4, défense 2,8, soin 4,5, **initiative 11** : il joue tôt).

- **Ressource : Inspiration** (max 5, 0 au début de chaque combat). Ses sorts ordinaires en donnent +1 ; les grands airs en dépensent : *Crescendo* (3 : toute l'équipe +20 % de dégâts 2 tours), *Berceuse* (2 : endort un ennemi), *Ode héroïque* (5 : soin + bouclier à toute l'équipe).
- **Sort de classe : Ballade** (menu « choisis un chant » ; `"noun": "chant", "article": "un"`) : **Bravoure** (équipe +6 % de dégâts), **Résilience** (équipe mieux soignée +15 %, −4 % de dégâts reçus), **Clairvoyance** (équipe : critique un point plus tôt). Changer de chant donne +1 inspiration (passif *Virtuose*).
- **Sa signature : le Tempo** (nouvel effet `tempo`) : l'allié choisi joue **juste après le Barde** dans la frise (et y reste) ; **s'il avait déjà joué ce round, il rejoue tout de suite**. Relance 5 tours.
- **Sorts de base** : Note discordante, Refrain apaisant, Tempo, Crescendo (L1), Berceuse (L3), Dissonance (L4, les ennemis −15 %), Ode héroïque (L5), Cacophonie (L6, zone + défense −20 %).
- **Spécialisations** :
  | | Idée | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Ménestrel** (Soutien) | Le rythme et les PA | Rythme endiablé (dépenser de l'inspiration : **toute l'équipe +1 PA** au tour suivant, une fois par tour ; chants plus forts), Gammes (+2 inspiration), Tempo endiablé (+1 PA, relance 3), Grand crescendo | Hymne de hâte · Ovation · Marche triomphale | Symphonie |
  | **Troubadour** (Soin) | Des chansons qui soignent | Voix douce (soins +20 %, Résilience plus forte), Mélopée (soin sur la durée de groupe), Refrain du troubadour, Ode de lumière | Requiem inversé (ressuscite) · Sérénade · Chœur | Chant éternel |
  | **Skald** (Dégâts) | Le barde guerrier | Chant de guerre (+8 % ; dépenser : +15 % 2 tours), Strophe tonnante (3 inspiration, puissance 2,0), Note tranchante, Fracas des tambours | Saga funèbre · Rengaine · Cor de bataille | Ragnarök |
- **Nouveau dans le moteur** : l'effet **`tempo`** (réordonne la frise d'initiative), `modes.article` (« un chant » / « une posture » dans le menu et le journal).
- **Équilibrage (robots ; `node tests/barde-sim.mjs 60`, Profondeurs niv. 8)** : en soin (Guerrier + soigneur + Assassin) : Prêtre Sacré ~92 % · **Troubadour ~97 %** · Barde sans spé ~62 %. En dps (Guerrier + Prêtre + dps) : Assassin ~92 % · **Skald ~98 %** (il frappe à distance, depuis le rang arrière). En soutien : **Ménestrel ~78 %** s'il remplace le dps (moins de dégâts), **~95 %** en 4e membre. **Seul** : 0 à 5 % (un soutien seul n'a rien à soutenir).
  ⚠ Troubadour et Skald un peu au-dessus de leurs équivalents ; leviers : les chants (aura), la Strophe, la relance du Tempo. Les robots donnent le Tempo à l'allié qui frappe le plus fort ; un joueur pourra faire mieux (rejouer un soigneur au bon moment).
- ❓ **Questions** : le Tempo « tour de plus » est-il trop fort (le limiter à une fois par combat ?) ; faut-il un 4e chant (vitesse : initiative) ?

### Mage ✅ *(écrit — premier jet, valeurs à régler en jouant)*
Dans `data/classes.json` (id `mage`). Les **dégâts à distance et en zone**, au rang arrière, fragile (PV 38, attaque 7,0, défense 2,2, initiative 9).

- **Ressource : charges arcaniques** (max 5). Le passif *Flux arcanique* en donne 1 au début de chaque combat ; ses sorts ordinaires en donnent +1 ; les grands sorts en dépensent (Boule de feu 2, Météore 3).
- **Sort de classe : Déflagration** : il libère **toutes** ses charges sur un ennemi (puissance 0,5 + 0,45 par charge : 2,75 avec 5 charges). Nouvelles briques du moteur : `"spend": { "id": ..., "amount": 1, "all": true }` et `"powerPerSpent"` sur un effet de dégâts.
- **Les éléments** : le **feu fait brûler** (un `dot` de clé `brulure`), le **givre engourdit** (−15 % de dégâts infligés). Nouvelle condition : **`targetKey`** (« la cible porte CE statut précis », ex. `{ "targetKey": "brulure" }`).
- **Sorts de base** : Trait de feu, Éclair de givre, Projectiles arcaniques (tous rangs, 2 PA), Barrière de mana (deck de départ) ; Nova de givre (L3), Boule de feu (L4), Évocation (L5, +2 charges), Météore (L6).
- **Écoles (spécialisations)** :
  | | Idée | Palier 4 (automatique) | Palier 8 (1 parmi 3) | Ultime 20 *(annoncé)* |
  | --- | --- | --- | --- | --- |
  | **Pyromancien** (Dégâts) | Tout brûle | Combustion (brûlures +40 %, +15 % contre ce qui brûle), Embrasement (+0,8 si la cible brûle), Trait ardent, Pyroclasme | Phénix (renaît une fois) · Mur de flammes · Feu intérieur (+20 % à 3 charges) | Cataclysme |
  | **Cryomancien** (Contrôle) | Gèle et se protège | Cœur de glace (−10 % de dégâts reçus, boucliers +25 %, +30 % contre un ennemi gelé), Prison de glace (fait sauter un tour), Éclair glacial, Armure de givre | Blizzard · Bloc de glace · Hiver éternel | Ère glaciaire |
  | **Arcaniste** (Dégâts) | Les charges, l'explosif | Maîtrise arcanique (+2 charges au départ, +8 %), Surcharge (+2 charges), Missiles arcaniques, Évocation supérieure | Distorsion temporelle (+2 PA) · Écho arcanique · Puissance brute | Singularité |
- **Équilibrage (robots ; `node tests/mage-sim.mjs 40`, Guerrier + Prêtre + dps)** : Profondeurs niv. 8 : Assassin ~88 % · Skald ~98 % · **Pyromancien ~98 %** · **Cryomancien ~100 %** (moins de dégâts, mais le contrôle protège le groupe) · **Arcaniste ~100 %** (le plus de dégâts). Sans spécialisation ~75 %. **Seul** (Crypte niv. 6) : 3 à 25 %, comme l'Assassin.
- **Plus tard** : le **Nécromancien** comme 4e école, quand le moteur saura créer de vraies créatures alliées en combat (l'effet `summon` n'existe que pour les monstres).

---

## 3. Ce qui manque (à discuter)
- Une **vraie classe à distance** (Mage ✔ ; archer : classe à part ou spé d'assassin ?).
- Un **soutien** (Barde ✔).
- Un **invocateur** : réalisable seulement avec une vraie mécanique de créatures alliées (§2, Mage).
- **Équilibre des rôles** : tanks (Sacrieur, Templier, Guerrier, Druide) en nombre ; tenir le compte au fur et à mesure.
- **18+ spécialisations** : commencer par 2 classes terminées plutôt que 6 à moitié.

## 4. Feu de camp ✅ *(premier jet)* et événements
- ✅ **Feu de camp** : une case (`camp`) **garantie au milieu de chaque donjon** (une tranche ou un donjon peut l'enlever : `"camp": false`). Chaque héros **vivant**, à son tour (celui sous les projecteurs d'abord — à plusieurs, chacun joue son héros avec le minuteur du serveur), peut **changer ses sorts équipés** (un emplacement à la fois, parmi ses sorts actifs) puis choisit **une activité** :
  - **Se reposer** : 35 % des PV max, et plus de poison ;
  - **Affûter ses armes** : +12 % de dégâts pendant les **2 prochains combats** ;
  - **Monter la garde** : −12 % de dégâts reçus pendant les 2 prochains combats.
  Tout se règle dans `rules.json` (`camp.activities`). Le bonus s'affiche sur la carte du héros ; le deck choisi au camp est **gardé après la partie**. Le pilote automatique (joueur absent) se repose.
  Effet sur l'équilibrage (robots) : +3-4 points de victoire au niveau 8, rien de notable en tranche 4.
- Pistes : un **repas** (bonus de nourriture pour tout le groupe), un **PNJ rare** au camp (changer de spécialisation), des **rencontres de camp** (une embuscade pendant le repos ?), un camp aléatoire en plus dans les longs donjons.

## 4 bis. Le coup bas ✅ *(refait — premier jet)*
- **Fait (style A + pactes B)** : un coup bas réussi donne un **gain** au saboteur (`gain` dans `data/events.json` : un bonus de quelques combats comme le feu de camp, ou des PV) ;
  la **victime a un droit de réponse** (jet d'esquive, `rules.json > lowBlow.dodgeMin` = 14 : le coup est annulé et le saboteur ne gagne rien) ; le **rebond** reste (5 ou moins).
  La case propose aussi des **pactes** (`pacts` : Autel de sang, Pacte de l'ombre) : un coût tout de suite pour un bonus ; ils marchent **seul**, la case peut donc apparaître en solo.
  En ligne, c'est le joueur de la victime qui lance son dé d'esquive.

### (historique) Le coup bas : à revoir
- **Constat** (lu dans `src/core/tiles.js` et `data/events.json`) : 4 malus purs (poison, −25 % PV, assommer, maudire un objet) contre un allié ; risque de retour de bâton sur un jet ≤ 5. **Aucun gain pour celui qui frappe.** Et **en solo (un seul héros) il n'y a aucune cible** : la case ne propose que « ne rien faire ».
- ✅ **Décision : style A** pour la case « coup bas » (gain pour le saboteur + droit de réponse pour la victime). **B** (pactes / autels, qui marchent aussi en solo) peut s'ajouter **comme case en plus**.
- **Pistes** :
  - A. **Donner un gain au saboteur** (or volé, bouclier, XP) et un **droit de réponse** à la victime (bonus pour sa prochaine action, ou jet pour esquiver).
  - B. **Remplacer par des « pactes » / autels** : des choix à risque et récompense (ex. autel de sang : −20 % PV maintenant, +dégâts au prochain combat), qui marchent aussi en solo ; l'option « sacrifier un allié » reste, avec une vraie récompense.
  - C. **Retirer** (poids 0 dans `tileWeights`, 🟢) et mettre le feu de camp à la place.

## 5. Chantiers de code (par ordre de dépendance)
1. ✅ Plafond niveau 8 (`levelCap`).
2. ✅ **Spécialisations + deck de 4 sorts + sort de classe + attaque à l'arme** (voir `docs/ECRIRE-UNE-CLASSE.md` §3 bis).
   - Fait : `specs` / `spec` / `choiceGroup` / `replaces` dans les JSON, `deckSize` et `specLevel` dans `rules.json`, actions `CHAR_SET_SPEC` et `CHAR_SET_DECK`
     (serveur compris, refusées en pleine partie), fiche (cartes de spé, deck, bouton équiper), Atelier (choix de spé), migration des anciennes sauvegardes.
   - **Attaque à l'arme** : compétence commune, 3 PA, `power` 0,6 (toutes les attaques de base sont à 0,7-1). ❓ Pour les classes à distance (mage…) : prévoir une version à distance.
   - **Barre de combat en trois blocs** (retour d'essai) : **corps à corps basique** seul (l'Attaque à l'arme, commune à toutes les classes, `"slot": "basic"`), **sort de classe** seul
     (champ `classSkill` de la classe), et l'**encadré du deck** (4 emplacements, les libres restent vides). Rien d'autre n'est affiché : la **Garde** n'a plus de case.
     ❓ Garde : la rendre au joueur autrement (action à part, sort de classe, objet) ou la supprimer ?
   - Les classes actuelles ont des `classSkill` **provisoires** (Provocation, Soin, Rosée, Fente) ; leurs anciennes attaques de base sont des sorts du deck équipés au départ.
   - Les spécialisations du Duelliste sont des **exemples** (palier 4 seulement) : elles seront remplacées par les vraies classes.
   - ✅ Fait depuis : le **palier 8** des spés (un choix parmi trois), les **cumuls de venin** (`dot` `stack`), la **marque**, les **auras de groupe**, le choix d'un mode par menu (`pick`).
   - ✅ Fait depuis : l'**écran de présentation de classe à la création** (rôles, sort de classe, ressource ou formes / postures / auras, passif, sorts de départ, 3 spécialisations et leur ultime : tout est lu dans classes.json), le statut **anti-soin** (blessure profonde du Guerrier : stat `healTaken`).
   - ❌ Pas encore fait : le **palier 12** et le **niveau 20** des spés (aujourd'hui des aperçus), ~~le feu de camp~~ ✅ (voir §4).
3. Avec les classes : statuts « de classe ». ✅ mode (Sacrieur), marque (Assassin, dont les sorts atteignent tous les rangs), aura (Templier), forme (Prêtre : lumière / ombre). posture (Guerrier), forme (Druide : sorts réservés à une forme).
4. (Plus tard) **Créatures invoquées**, puis le Nécromancien (école du Mage).

## Plafond de niveau 8 — ✅ fait
- `rules.json` : `levelCap: 8`. `maxLevel: 20` reste la taille de la courbe d'XP.
- **Décision : pas de réserve d'XP.** Au plafond, l'XP gagnée est perdue ; quand on relève le plafond (12, 16…), tout le monde repart de zéro XP (pas de montée en bloc).
- Aucun personnage n'est tronqué au chargement (un niveau > 8 déjà sauvegardé reste tel quel). À l'accueil et à l'Atelier, le niveau saisi ne dépasse pas le plafond.
- À 8, l'XP ne sert plus : c'est l'équipement et le farm qui prennent le relais.

## 6. Monstres et donjons ✅ *(premier jet — valeurs à régler en jouant)*

**Principe** : une tranche de niveaux contient plusieurs **donjons à thème**. Les premiers sont simples, puis chaque donjon a ses mécaniques, portées par le
**type de monstre** (famille + particularités). Chaque donjon a sa **table de butin** (objets qui ne tombent que là) et sa fiche d'**encyclopédie**
(bouton « Monstres et butin » : bestiaire et butin). Données : `data/dungeons.json`, `data/monsters.json` (section `passives`). Détails : `docs/ECRIRE-UNE-CLASSE.md` §13.

| Niv. | Donjon | Thème | Mécanique | Boss |
| --- | --- | --- | --- | --- |
| 1 | Les Caves Humides | Rats et vermine | aucune (apprendre le jeu) | Le Roi des Rats |
| 4 | La Crypte Oubliée | Morts-vivants | simple : des tireurs au rang arrière | Le Seigneur des Ossements |
| 4 | Le Repaire des Coupe-Jarrets | Bandits | simple : **Embuscade** (+25 % de dégâts au 1er round), saignements et poisons | La Balafre (avec un arbalétrier) |
| 4 | Les Soues de Grouinval | Cochons et sangliers | simple : la **Charge**, annoncée un round avant ; le boss s'énerve sous 50 % de PV | Le Grand Verrat |
| 8 | Les Profondeurs Déchues | Chevaliers déchus, spectres | **Riposte** (chaque coup reçu en rend un), **Incorporel** (−30 % sur les coups, pas sur les saignements) | Le Gardien Déchu |
| 8 | Le Sanctuaire des Sans-Repos | Cultistes | **Réanimation** (les acolytes relèvent un mort, une fois chacun, annoncé un round avant), **Sans repos** (le squelette se relève seul une fois), **Magie noire** (ignore la défense), **Voile d'ossements** (boss −40 % tant qu'un serviteur vit) | Le Hiérophante (avec escorte) |
| 8 | Le Gouffre aux Ogres | Ogres | **Régénération** (4 % par tour, coupée par un saignement ou un poison), **Brise-bouclier** (massue, Fracas), **Colère du roi** | Gromm le Ventru (avec une chamane) |
| 12 / 16 / 20 | La Citadelle Engloutie · Les Forges du Titan · L'Aire des Dragons | *aperçus* | à écrire | — |

**Équilibrage pour les NOUVELLES classes** (robots, 40 parties par case, victoires ; `node tests/donjons-sim.mjs 40`). Héros du niveau de la tranche, équipement correct.
Équipe A = Guerrier Protection + Prêtre Sacré + Assassin Exécuteur · B = Templier Gardien + Druide Restauration + Guerrier Armes · C = Druide Gardien + Prêtre Discipline + Assassin Venin · duo = Guerrier Protection + Prêtre Sacré.

| Donjon | A | B | C | 3 tanks | duo | tank seul | anciennes (réf.) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Caves Humides | 100 | 100 | 90 | 100 | 100 | 95 | 98 |
| Crypte Oubliée | 98 | 95 | 80 | 95 | 90 | 83 | 43 |
| Coupe-Jarrets | 88 | 95 | 88 | 70 | 93 | 95 | 23 |
| Grouinval | 85 | 95 | 80 | 95 | 95 | 95 | 38 |
| Profondeurs Déchues | 73 | 100 | 53 | 93 | 73 | 48 | 55 |
| Sans-Repos | 75 | 98 | 60 | 83 | 55 | 50 | 20 |
| Gouffre aux Ogres | 88 | 45 | 90 | **5** | 25 | **15** | 13 |

Cibles : une équipe équilibrée gagne ~85-90 % en tranche 4, ~70-75 % en tranche 8 ; le Gouffre aux Ogres reste celui qui punit les mauvaises compositions.
**Ce qui a changé** (avant, ces équipes gagnaient 93-100 % partout sauf aux Ogres) :
- **Monstres renforcés** (attaque × / PV ×) : Crypte 1,25 / 1,28 · Coupe-Jarrets 1,15 / 1,15 · Grouinval 1,15 / 1,2 · Profondeurs 1,05 / 1,07 · Sanctuaire 1,1 / 1,15. Caves (débutants) et Gouffre aux Ogres inchangés.
- **Le duo n'est plus avantagé** (`partyScaling` « 2 » dans `rules.json` : PV 0,75 → 0,85, attaque 0,8 → 0,87, PA 0,84 → 0,9) : un tank + un soigneur gagnait 98-100 % partout, mieux qu'un trio.
- **Prêtre Discipline renforcé** (c'était lui qui faisait tomber l'équipe C) : Expiation 60 → 80 % (ombre 40 → 55 %), Rayonnement 1,1 → 1,4, bouclier 1,5 → 1,9.

⚠ **Restent à surveiller en jouant** : l'équipe **B passe presque partout** (Templier Gardien + Druide Restauration : beaucoup de protection et de soin sur la durée) sauf aux Ogres (45 %) ; le **Discipline** reste faible au Sanctuaire ; les équipes de **3 tanks** passent encore la tranche 4 et les Profondeurs. Ce sont des réglages de **classes**, pas de donjons. Les anciennes classes (retirées) servent seulement de repère.

**Ajouté ensuite** : ✅ **renforts** (le Roi des Rats appelle jusqu'à 2 rats, La Balafre un coupe-jarret ; ils ne rapportent rien) · ✅ **panoplies** (chaque table de butin est une panoplie : bonus à 2 pièces, puis à 3) · ✅ **collection** dans l'encyclopédie (donjons terminés, monstres vaincus, butin trouvé ; rien n'est caché, on voit ce qui manque).

**Pistes pour la suite** : une attaque **chargée** sur deux tours (le monstre se prépare, on a un tour pour s'en protéger) ; des monstres qui **volent de l'or** (bandits) ; un décor par donjon (aujourd'hui les nouveaux donjons réutilisent les 4 décors existants) ; des **succès** liés à la collection (tout le butin d'un donjon, tous ses monstres) ; un **mode difficile** par donjon.

## 6 bis. Équilibrage des spécialisations ✅ *(robots — à confirmer en jouant)*

**L'outil** : `node tests/specs-sim.mjs [parties] [filtre]` essaie chacune des 24 spécialisations **dans la même équipe de référence**
(Guerrier Protection + Prêtre Sacré + Assassin Exécuteur), à sa place (tank, soin ou dégâts) : l'écart vient donc de la spécialisation.
`STASIS=2` la fait jouer en Stasis 2 avec un bon équipement : c'est là que les écarts se voient (en Tranche, les meilleures plafonnent à 100 %).
Pour essayer un réglage sans toucher aux données : `PATCH=fichier.json` (ex. `{ "mage_missiles": { "effects.0.power": 0.6 } }`).

Victoires (%), moyenne des tranches 4 et 8 (Crypte, Coupe-Jarrets, Grouinval · Profondeurs, Sans-Repos, Ogres) :

| Spécialisation | Tranche avant → après | Stasis 2 avant → après |
| --- | --- | --- |
| Sacrieur Bastion | 63 → 80 | 30 → 43 |
| Assassin Traqueur | 71 → 84 | 35 → 57 |
| Prêtre Discipline | 74 → 87 | 44 → 59 |
| Sacrieur Équilibre | 73 → 80 | 58 → 57 |
| Sacrieur Écorché | 76 → 82 | 47 → 59 |
| Barde Ménestrel | 70 → 75 | 43 → 60 |
| *équipe de référence* | 86 → 86 | 47 → 57 |
| Templier Lumière | 98 → 93 | 84 → 63 |
| Barde Troubadour | 95 → 93 | 78 → 67 |
| Mage Arcaniste | 96 → 94 | 75 → 66 |
| Prêtre Ombre | 96 → 94 | 74 → 71 |
| Mage Cryomancien | 98 → 95 | 70 → 71 |

En Stasis 2, l'écart entre la plus faible et la plus forte passe de **30-84 %** à **43-71 %** (le Bastion reste un peu en dessous : on n'a pas voulu rendre l'équipe de 3 tanks encore plus forte). Les autres bougent peu.
**Ce qui a changé** :
- *Renforcés* : Bastion (−12 % de dégâts reçus en permanence, Endurance plus forte, Dernier souffle 50 %) · Traqueur (+18 % de dégâts) ·
  Discipline (Expiation 100 %, +25 % de dégâts, Pénitence 2,1) · Équilibre (Sang mêlé ~65 %, Lame protectrice 1,6, saignement 0,6) ·
  Écorché (Fureur sanglante +0,25 %/PV manquant, Déchirure 3,0, Festin 2,2) · Ménestrel (le Rythme joue à chaque dépense, Grand crescendo +35 % 3 tours,
  Hymne de hâte 4 inspiration) · Exécuteur (Instinct +30 %) · Sacré (Égide +22 %).
- *Affaiblis* : Lumière (Dévotion +10 % de stat de soin seulement, Imposition 35 %, Éclat 25 %, Source de vie 5 %) · Troubadour (soins +5 %,
  Refrain 1,2, Mélopée 0,28, Ode 20 %, Chœur 18 %, Sérénade 5 %) · Mages (Projectiles 0,6, Maîtrise sans bonus de dégâts, Surcharge 15 % ; Combustion 20 %,
  Embrasement 0,8 + 0,6, Trait ardent 0,3 ; Cœur de glace −5 % / 15 % / 20 %, Éclair glacial 0,8, Armure de givre 20 %, Blizzard 0,5, Prison relance 4) ·
  Ombre (Ténèbres 10 %, Toucher 0,6, Éruption 1,6, Pointe mentale 1,1) · Restauration (soins +5 %) · Armes (+5 %) · Skald et Vindicte (plus de +8 % fixe).

⚠ **Reste à surveiller** : le **Gouffre aux Ogres** reste très dur pour les équipes sans saignement ni poison ni dégâts à distance
(Écorché, Équilibre, Fureur, Farouche : 25-55 % au niveau 8) : c'est son identité (« faites-les saigner »), mais à confirmer en jouant.
L'équipe de **3 tanks** passe encore presque partout sauf aux Ogres (c'était déjà le cas avant ce réglage).
Le **Ménestrel** est un pur soutien : il vaut mieux avec deux autres sources de dégâts (dans l'équipe de référence, il remplace le seul dégât).
