# Donjon — jeu de donjon coopératif au tour par tour

> **État du projet : étape 6 sur 6 — les finitions (animations, sons, illustrations) sont là, le jeu se joue à plusieurs en ligne.** Le jeu (combat à points d'action, rangs, frise d'initiative, D20 par
> compétence, vraies classes, **zone de farm solo**, **forge**, **succès par personnage**, interface « Lanterne ») tourne
> **hors ligne**, comme avant, **et en ligne** : un petit serveur Node sans aucune dépendance garde les **comptes** et les
> **personnages**, **applique lui-même les règles** (impossible de tricher en bricolant la page) et fait jouer des **donjons à plusieurs** :
> on crée un **salon**, on invite ses amis avec un code, et **chacun joue SON héros sur son propre écran** (un seul héros par compte),
> avec un minuteur de tour tenu par le serveur et des mises à jour en direct. Mettre le jeu sur ton VPS : [`docs/SERVEUR.md`](docs/SERVEUR.md).
> Le farm automatique et ce qui reste à imaginer sont décrits tout en bas, §7.

Un jeu de donjon coopératif. Le groupe explore un donjon case par case. À chaque tour, **un joueur est « sous les
projecteurs »** : il avance, lance le D20 et **c'est lui qui décide** (garder ou donner le butin, partager l'XP, saboter un allié…).
Les combats se jouent au **tour par tour, à points d'action**, avec une frise d'initiative à la Dofus.

Fait en **HTML / CSS / JavaScript pur** (modules ES), sans aucune bibliothèque à installer.

---

## 1. Lancer le jeu

Deux façons de jouer, avec **le même jeu** :

| | Hors ligne (solo, sans compte) | En ligne (comptes, serveur) |
| --- | --- | --- |
| Lancer | `node serve.mjs` (ou n'importe quel serveur de fichiers) | `node server/server.mjs` |
| Les personnages sont gardés… | dans le navigateur (`localStorage`) | **sur le serveur** : on les retrouve sur tous ses appareils |
| Qui applique les règles | le navigateur | **le serveur** (donc pas de triche possible) |
| Une partie interrompue | reprise dans le même navigateur | reprise depuis n'importe quel appareil |
| Les donjons | une équipe de 1 à 4 héros, tous à toi | **à plusieurs, dans un salon : UN héros par joueur**, chacun sur son écran |
| Pour y jouer | rien à installer côté joueur | un compte (pseudo + mot de passe, éventuellement un code d'invitation) |

La suite de ce paragraphe décrit le jeu **hors ligne**. Pour le jeu **en ligne** (essai en une minute, puis mise en service sur un
VPS avec HTTPS, sauvegardes, mises à jour) : **[`docs/SERVEUR.md`](docs/SERVEUR.md)**.

### Hors ligne

Le jeu doit être ouvert avec un petit serveur local (un double-clic sur `index.html` ne marche pas :
le navigateur interdit de charger les fichiers `data/*.json` depuis un fichier local).

Choisis **une** de ces façons :

```bash
node serve.mjs            # si Node.js est installé  -> http://localhost:8000
```
```bash
python3 -m http.server 8000     # si Python est installé -> http://localhost:8000
```
(Sous Windows : `python -m http.server 8000` ou `py -m http.server 8000`.)

Ou, dans Visual Studio Code : clic droit sur `index.html` → « Open with Live Server » (extension Live Server).

Puis ouvre **http://localhost:8000** dans ton navigateur.

Tes personnages sont enregistrés dans le navigateur (`localStorage`) : fermer puis rouvrir la page
les retrouve. Pour les copier sur un autre ordinateur, utilise le bouton **Sauvegarde** (export d'un code
à coller là où tu veux, import ailleurs).

### En ligne

```bash
node server/server.mjs        # Node 22.13 ou plus récent, rien à installer -> http://127.0.0.1:8000
```

Écran de connexion, **Inscription**, puis le même accueil qu'en solo. Ce qui change en ligne :

* le bouton du **compte** (ton pseudo, en haut à droite) remplace **Sauvegarde** : on y change son mot de passe et on se déconnecte.
  Il n'y a plus de « code de sauvegarde » (le compte *est* la sauvegarde ; importer des personnages permettrait de tricher) ;
* tes personnages, tes parties en cours et tes succès sont sur le serveur ; **recharge la page ou change d'appareil** : le bandeau
  « Une partie est en cours » te propose de reprendre exactement là où tu en étais ;
* l'**Atelier de classes** reste local (c'est un laboratoire : rien n'y est enregistré) ;
* **un seul héros par compte dans un donjon** : pour en faire un, on **crée un salon** (ou on rejoint celui d'un ami avec son code), chacun choisit
  son héros et se déclare « prêt », l'hôte règle le donjon et lance (voir §3 quater). Le farm reste solo ;
* le son et le dernier héros choisi restent des préférences **du navigateur** ; le **minuteur de tour** à plusieurs est réglé par l'hôte du salon
  (et tenu par le serveur).

---

## 2. Comment jouer (en bref)

**Se repérer** : le jeu est rangé en **cinq lieux**, toujours visibles à gauche (en bas sur téléphone) :

| Lieu | Ce qu'on y trouve |
| --- | --- |
| **Le Camp** | la page d'arrivée : *que faire maintenant* (expédition revenue, objet à choisir, points de compétence, amélioration possible), le **donjon conseillé** pour ton équipe, tes héros et ta progression |
| **Aventure** | lancer un **donjon**, la **zone de farm** solo, les **expéditions** |
| **Héros** | la fiche complète d'un héros : équipement et sac, compétences, succès, infos |
| **Forge** | démanteler, améliorer, forger (on choisit d'abord pour quel héros) |
| **Grimoire** | les donjons, le bestiaire et les règles du jeu |

En bas de la barre : l'Atelier de classes, la Sauvegarde (ou ton Compte en ligne) et le son. Le jeu retient le dernier lieu ouvert.

1. **Crée ton héros** (au premier lancement, clique sur la classe qui te plaît ; ou sur « Créer 3 héros d'exemple »), puis, dans **Aventure**, choisis ton **équipe** (1 à 4 héros, à gauche), un **donjon** et sa **difficulté** (à droite).
   Chaque donjon dit tout de suite s'il convient à l'équipe : *Adapté*, *Risqué* ou *Très dangereux*. Les étiquettes sur un héros disent ce qu'il y a à faire (points de compétence à dépenser, récompense de farm à choisir).
   *(En ligne, chaque joueur amène UN héros dans un salon ; l'équipe de 1 à 4 héros sert à jouer seul, hors ligne.)*
2. Chaque tour : le joueur sous les projecteurs clique **Avancer**, lance le **D20**, puis décide.
3. Cases possibles : combat, trésor, piège, fontaine d'XP, fontaine de vie (rare), coup bas, marchand, un **feu de camp garanti au milieu** (chacun peut changer ses sorts équipés et choisir : se reposer, affûter ses armes ou monter la garde), et le boss à la fin.
   **Le coup bas** : on peut jouer un sale tour à un allié (empoisonner, croche-pied, assommer, maudire un objet). S'il réussit, le saboteur **gagne** un petit bonus
   (+dégâts, PV, protection) ; mais le coup peut se retourner contre lui (5 ou moins au dé), et la **victime a un droit de réponse** : un jet d'esquive (14 ou plus).
   La même case propose aussi des **pactes** (un coût tout de suite, un bonus pour les prochains combats) : ils marchent seul, sans victime.
   *(Ou, dans Aventure, l'onglet **Zone de farm solo** : un seul personnage, des vagues de monstres, un objet au choix — voir §3.)*
3 bis. **Le premier combat est guidé** : cinq bulles montrent l'ordre de jeu, le champ de bataille, les points d'action, les sorts et la fin du tour (une seule fois, « Passer le guide » pour le fermer).
4. Un mort devient **fantôme** : il peut encore aider. Il peut être ressuscité (fontaine de vie ou compétence du Veilleur), **une seule fois par run**.
5. **L'équipement** (bouton **Équiper le meilleur** : il équipe tout ce qui est clairement meilleur, sans aucune caractéristique en baisse) : 14 emplacements (tête, épaules, dos, torse, mains, ceinture, jambes, pieds, cou, 2 anneaux, relique, main droite et main gauche). Une arme à
   **deux mains** occupe les deux mains ; sinon, deux armes à une main, ou une arme et un bouclier. Détails : [`docs/EQUIPEMENT.md`](docs/EQUIPEMENT.md).
5 bis. **Le butin** va directement dans le sac du héros qui le trouve (son nom s'affiche à l'écran, dans la couleur de sa rareté) ; on peut le **donner** à un allié depuis son sac, hors combat. (`loot.ask` dans `data/rules.json` rétablit la question « garder ou donner » à chaque objet.)
6. Fin de run : **victoire** = XP et butin ajoutés à tes personnages. **Défaite / abandon** = tu perds la run, mais **jamais** ton personnage ni son équipement.

### Le combat

| Élément | Règle |
| --- | --- |
| **Frise d'initiative** | L'ordre de jeu est fixé par l'initiative. Les camps **alternent** (un allié, un monstre, un allié…). Elle est affichée en haut du combat. |
| **Barre de compétences** | En bas de l'écran : une case par compétence (coût en PA dans le coin, petite bande de risque du dé, touche du clavier). Clique sur une case, puis sur la cible. **Au clavier** : les touches de la rangée du haut les lancent dans l'ordre — **& é " ' ( - è _ ç à** sur un clavier AZERTY, 1 2 3 4 5 6 7 8 9 0 sur un QWERTY (le pavé numérique marche aussi) ; **Échap** annule le choix d'une cible. Sur grand écran le **détail** de la compétence survolée reste affiché ; sur petit écran (téléphone, fenêtre peu haute) il n'apparaît qu'à la demande, en infobulle (au survol, ou au premier toucher : le second lance). |
| **Points d'action (PA)** | À ton tour tu as des PA (6 de base, 12 au maximum). Chaque compétence en coûte. Quand il n'en reste plus (ou si tu cliques sur **Fin du tour**), le tour passe. On en gagne plus avec de l'**équipement** (Cœur de la crypte, Sablier fêlé, Rapière d'orage), des **passifs** (Second souffle), des **buffs** (Cantique de hâte du Veilleur : +2 PA au prochain tour d'un allié) ou des **gains instantanés** (Frénésie, Pas de l'ombre). |
| **Rangs** | Devant / derrière. Le **corps à corps** ne touche que le rang **avant** ennemi tant qu'il y reste quelqu'un ; la **distance** touche tout le monde. Changer de rang coûte 1 PA. |
| **Monstres lisibles** | Chaque round, un monstre **annonce** ses actions et ses cibles (sous sa barre de vie). On peut donc réagir : le tuer, l'étourdir, le provoquer. |
| **D20 par compétence** | Chaque compétence a son propre profil : la petite bande de 20 cases montre le risque (rouge = **échec critique**, la compétence rate) et la récompense (doré = **critique**, ×1,5). Certaines ne ratent jamais, d'autres ratent presque toujours mais font très mal. |
| **Boucliers** | Une réserve séparée qui absorbe avant les PV, sans compter comme des PV (elle n'enlève pas la force d'un Sacrieur blessé). |
| **Minuteur de tour** | Optionnel (bouton **Minuteur** en haut) : à la fin du décompte le tour se termine tout seul. |
| **Combat qui s'éternise** | Après 8 rounds, les monstres s'énervent (+15 % de dégâts par round). |
| **Donjons à thème** | Chaque tranche de niveaux a plusieurs donjons : simples au début (rats, bandits, cochons), puis avec leurs **mécaniques** (des cultistes qui relèvent leurs morts, des ogres qui se régénèrent). La carte d'un donjon dit ce qu'il faut savoir ; le bouton **Monstres et butin** ouvre son **encyclopédie** : le bestiaire (avec la particularité de chaque monstre) et les **objets qui ne tombent que là**. Ces objets forment la **panoplie** du donjon (un bonus à 2 pièces, un autre à 3), et l'encyclopédie suit ta **collection** : donjons terminés, monstres vaincus, butin trouvé. En combat, les particularités d'un monstre se lisent sur sa carte. |

### Les classes (provisoires)

| Classe | Idée |
| --- | --- |
| **Sacrieur** (tank / dégâts) | Deux **modes** que son sort de classe *Pacte de sang* bascule (le 1er changement du combat est gratuit) : **Endurance** (plus il est blessé, moins il subit de dégâts) et **Fureur** (plus il est blessé, plus il frappe fort). Des sorts qui se paient en PV, qui volent de la vie, un bouclier qui grandit avec ses blessures et un **Crochet** qui ramène un ennemi du fond. Une **Provocation**. Trois spécialisations (niveau 4) : **Bastion** (tank : *Sacrifice*, il encaisse pour ses alliés, et *Dernier souffle*), **Équilibre** (les deux passifs à la fois) et **Écorché** (dps : sorts qui se paient en PV). Sa **Punition** (1×/combat) évolue selon la spé. Au **niveau 8**, chaque spé offre **un choix parmi trois** (modifiable à volonté) ; le **niveau 12** et un **ultime de niveau 20** sont annoncés « à venir ». Détails : `docs/IDEES.md`. |
| **Assassin** (dégâts) | Un chasseur fragile dont **tous les sorts atteignent n'importe quel rang**. Son sort de classe, la **Marque mortelle**, désigne une proie (gratuite tant que rien n'est marqué, 1 PA pour changer) : elle subit des dégâts en plus et ses sorts gagnent des effets bonus contre elle. Un **venin qui se cumule**, un coup de grâce qui frappe les blessés, et un PA rendu quand il achève sa proie. Trois spécialisations : **Venin** (poison), **Exécuteur** (achever les cibles blessées), **Traqueur** (deux marques, des PA qui reviennent, de la zone) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |
| **Templier** (tank / soin / dégâts) | Un chevalier de la foi qui se charge en **puissance sacrée** : ses coups bénis et ses soins en donnent, ses *verdicts* et son grand *soin de zone* en dépensent (et frappent très fort). Son sort de classe, l'**Aura sacrée**, ouvre un petit menu : tu **choisis l'aura** de toute l'équipe, Protection (moins de dégâts reçus), Vengeance (plus de dégâts) ou Dévotion (soins plus forts) ; les alliés voient l'aura sur leur carte. Trois spécialisations : **Gardien** (tank), **Lumière** (soin, Imposition des mains, Miracle) et **Vindicte** (dégâts, Sainte colère) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |
| **Prêtre** (soin / dégâts) | Un soigneur à double visage. Son sort de classe, la **Forme d'ombre**, le fait passer de la *lumière* (soins et boucliers +10 %) à l'*ombre* (dégâts +35 %, soins −50 %) : gratuit la première fois, ensuite 1 PA, et **2 tours de relance** (on ne revient pas tout de suite). Trois spécialisations : **Sacré** (le soin en trop devient un bouclier), **Discipline** (ses dégâts soignent les alliés sous **Expiation**) et **Ombre** (douleurs qui rongent, Toucher vampirique qui soigne l'équipe) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |
| **Guerrier** (tank / dégâts) | Un soldat aguerri : chaque coup qu'il encaisse nourrit sa **rage**, qu'il dépense en coups décisifs (Exécution, Enchaînement, Coup de bouclier qui assomme). Son sort de classe, la **Posture**, ouvre un petit menu : Combat, Offensive ou Défensive. Il affaiblit, provoque et protège ses alliés. Trois spécialisations : **Armes** (Frappe mortelle et sa *blessure profonde* : la cible est moitié moins soignée), **Fureur** (deux coups par sort) et **Protection** (tank, riposte) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |
| **Druide** (tank / soin / dégâts) | Un gardien de la nature qui change de **forme** avec son sort de classe, la **Métamorphose** (un petit menu) : **Ours** pour encaisser (rang avant), **Arbre** pour soigner (rang arrière), **Félin** pour déchirer (rang avant), ou sa forme naturelle. Chaque forme ouvre ses propres sorts (les autres sont grisés). Trois spécialisations : **Gardien** (ours, provoque en frappant), **Restauration** (arbre, soins sur la durée) et **Farouche** (félin, saignements cumulables) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |
| **Barde** (soutien / soin / dégâts) | Le soutien du groupe. Son sort de classe, la **Ballade**, ouvre un menu de **chants** pour toute l'équipe (Bravoure, Résilience, Clairvoyance). Ses sorts lui donnent de l'**inspiration**, qu'il dépense en grands airs (Crescendo, Berceuse, Ode héroïque). Sa signature, le **Tempo** : un allié joue juste après lui, et rejoue s'il avait déjà joué ce round. Trois spécialisations : **Ménestrel** (rythme et PA pour l'équipe), **Troubadour** (soin) et **Skald** (dégâts) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |
| **Mage** (dégâts / contrôle) | Les dégâts à distance et en zone, au rang arrière, fragile. Ses sorts lui donnent des **charges arcaniques** ; son sort de classe, la **Déflagration**, les libère toutes d'un coup (plus il y en a, plus elle frappe). Le **feu** fait brûler, le **givre** engourdit. Trois écoles : **Pyromancien** (brûlures, zone), **Cryomancien** (contrôle, boucliers) et **Arcaniste** (les charges, l'explosif) ; un choix parmi trois au niveau 8. Détails : `docs/IDEES.md`. |

> Les **quatre premières classes** (Berserker, Veilleur, Druide, Duelliste) ont été **retirées du jeu** : une ancienne sauvegarde devient Sacrieur, Prêtre ou Assassin (`aliases` dans `data/classes.json` ; le niveau, l'équipement et les succès sont gardés, les compétences repartent de celles de départ). Un ancien Druide reste un Druide (le nouveau, avec ses formes). Les tests et les simulateurs les gardent comme **classes de test** (`tests/fixtures/classes-de-test.json`) : elles exercent le moteur et servent de référence d'équilibrage.

**Spécialisations et deck de sorts** : à partir du niveau 4, on choisit une **spécialisation** (gratuite, modifiable entre deux parties) qui apporte des choix
« un seul parmi trois » et peut faire évoluer un sort de base. La **barre de combat** a trois blocs : le **corps à corps basique** (*Attaque à l'arme*, 3 PA, le même pour
toutes les classes), le **sort de classe**, et un encadré de **4 sorts équipés** (le *deck*). Rien d'autre n'est affiché. Voir [`docs/ECRIRE-UNE-CLASSE.md`](docs/ECRIRE-UNE-CLASSE.md) §3 bis.
*(Les spécialisations du Duelliste sont des exemples pour tester le système.)*

Le **niveau maximum est bridé à 8** pour l'instant (`levelCap` dans `data/rules.json` ; l'XP au-delà est perdue). On le relèvera à mesure que le contenu arrive.

Les **modes** :

| Mode | Qui | Équipement et compétences | XP / butin | Meilleure rareté | Difficulté |
| --- | --- | --- | --- | --- | --- |
| **Basic** | seul ou à plusieurs | aucune restriction | très réduits | épique (très rare) | normale |
| **Tranche** | seul ou à plusieurs | niveau ≤ tranche du donjon | normaux | épique (très rare) | normale |
| **Stasis 1 / 2 / 3** | seul ou à plusieurs | comme Tranche | bien meilleurs (qualité, pas niveau) | seul : **épique** ; à plusieurs (2 joueurs ou plus, en ligne) : **légendaire** | très élevée |

Le **Stasis** est la fin de partie : seul, ses trois niveaux de difficulté rapportent des objets jusqu'à l'**épique** (bien plus souvent qu'en Tranche) ;
à plusieurs (2 joueurs différents ou plus, en ligne), il donne aussi les **objets légendaires** (y compris ceux des tables de donjon).
Un légendaire ne se **forge** qu'après avoir terminé son donjon en Stasis **à plusieurs**. Tout est dans `data/modes.json`
(`maxRarity`, `soloMaxRarity`, `legendaryMinPlayers`, `rarityWeights` : l'épique est 4 fois plus rare hors Stasis).
Le butin d'un donjon suit la taille du groupe (`partyScaling` dans `data/rules.json` : `loot`, `bossDrops`) : chaque héros ramasse à peu près autant, seul ou à plusieurs.
Chaque objet ramassé s'annonce dans le **fil du butin** (en haut à droite) ; à plusieurs, ce que **tes** héros ramassent est mis en avant
(« Pour toi », reste plus longtemps) et le butin des autres passe en discret. Au **niveau maximum** (`levelCap`), l'écran de fin affiche
« Niveau max » au lieu de l'XP gagnée : la suite, ce sont les objets, la forge et le Stasis.

Le bouton **Réglages** (accueil et pied des lieux) regroupe le son et le volume, le **minuteur de tour en solo** (60 s ou sans limite)
et **« Revoir les conseils »** (le guide du premier combat et les bulles des cases repartent de zéro).

Le jeu distingue toujours le **niveau réel** (sauvegardé) du **niveau effectif** (celui utilisé dans le donjon :
en Tranche et Stasis, c'est `min(niveau réel, tranche)`).

> Toutes les valeurs (stats, classes, XP, butin…) sont **provisoires** : elles ont été calibrées avec des robots
> (qui jouent des centaines de parties), ce qui repère les grosses erreurs mais **ne dit rien sur le plaisir de jeu**.
> C'est en jouant qu'on saura si c'est fun — et c'est justement ce qu'on veut régler ensuite.

---

## 3. La zone de farm solo, la forge et les succès

Dans **Aventure**, l'onglet **Zone de farm solo** :

* **Un seul personnage** enchaîne des **vagues** de monstres, de plus en plus fortes, avec un boss toutes les 5 vagues. Trois zones : **Les Terriers** (dès le niveau 1),
  **Les Fourrés de Grouinval** (niveau 4, tranche 4) et **Les Fosses aux ogres** (niveau 8, tranche 8) : plus haut, plus d'éclats et de meilleurs objets.
* Après chaque vague : **vague suivante**, ou **s'arrêter**. Si le personnage meurt, il **ne perd que la vague en cours**.
* Chaque vague donne des **éclats** pour la forge. En fin de session, on **garde 1 objet parmi 3** (meilleurs si l'on a tenu longtemps), les deux autres deviennent des éclats.
  Jamais d'épique ni de légendaire : le meilleur équipement vient des donjons en équipe.
* Seul face aux vagues, un **soigneur** (Prêtre, Druide, Barde) tue lentement : au farm, et là seulement, il frappe **+50 %** plus fort (`roleDamage` dans `data/farm.json`). Un **dps** fragile (Assassin, Mage) récupère **30 %** de PV en plus entre deux vagues (`roleHeal`).
* L'**XP sert à rattraper** : seul un héros plus bas que ton meilleur héros en gagne, jusqu'au niveau de celui-ci. Ton meilleur héros, lui, y gagne des éclats et un objet.
* Les **succès** (fiche du personnage > onglet *Succès*) sont propres à chaque personnage : finir un donjon en équipe, vaincre des vagues,
  atteindre un niveau d'équipement... Ils débloquent une **compétence** pour ce personnage, une **fonction** du jeu (le farm automatique,
  à l'étape suivante) ou un **titre**. Exemple fourni : le Veilleur ne peut apprendre *Cantique de hâte* qu'après avoir fini le premier donjon en groupe.

**Les expéditions** (onglet d'Aventure) : quand tu n'as pas le temps de jouer, envoie un héros en mission (30 min, 2 h, une nuit).
Il revient, même jeu fermé, avec des éclats, de l'XP de rattrapage (s'il est en retard sur ton meilleur héros) et parfois un objet. Trois héros en route au plus.

**La forge** (fiche du personnage) : le butin inutile n'est jamais perdu.

* Dans le sac, un **cadenas** protège un objet, une **corbeille** le **démantèle** en **éclats** (plus il est rare, plus il en donne) ; on peut aussi tout démanteler d'un coup (les communs...).
* Onglet **Forge** : **améliorer** un objet de +1 à +5 (+10 % à ses PV, attaque, défense et soin par cran), ou **forger** un objet exclusif d'un donjon que ce personnage a déjà terminé.

Tout est réglable en JSON : [`docs/FARM-ET-SUCCES.md`](docs/FARM-ET-SUCCES.md).

---

## 3 bis. L'Atelier de classes (le coin « laboratoire »)

En bas de la barre des lieux, bouton **Atelier de classes** : une salle d'entraînement pour tester vite.

* 1 à 4 personnages de test (classe + niveau), qui connaissent **toutes** les compétences de leur niveau ;
* des **mannequins** qui ne meurent jamais (inertes ou agressifs, 1 à 3, force ×1 / ×2 / ×4) ;
* une barre de mesure : dégâts infligés, soins et boucliers, dégâts par round ;
* **Recharger les JSON** : tu modifies `data/classes.json`, tu cliques, la salle est refaite avec tes changements, sans recharger la page.

C'est l'outil prévu pour écrire les classes : guide complet dans **[`docs/ECRIRE-UNE-CLASSE.md`](docs/ECRIRE-UNE-CLASSE.md)**.

---

## 3 ter. L'interface : la direction artistique « Lanterne »

Une nuit de donjon éclairée à la lanterne : fond bleu-nuit, cadres en **laiton**, et la **flamme orange** pour tout ce qu'on peut faire
(boutons principaux, points d'action, héros qui joue). Polices pixel (DotGothic16, Jersey 10, Press Start 2P) et *Alegreya Sans* pour les longs textes, **hébergées avec le jeu**
(`css/fonts/` + `css/fonts.css`, licence OFL) : la version serveur n'appelle aucun site extérieur. Seule la version publiée (`artifact.html`) les prend chez Google Fonts.

* Tout le style tient dans **`css/style.css`**, piloté par quelques variables au début du fichier : changer l'ambiance = changer ces variables.
* Les **points d'action** s'affichent en petites flammes, les **personnages et monstres** en cadres carrés **illustrés en pixel art** (8 classes, 39 monstres, dessinés en code),
  devant un **décor** par donjon (caves, crypte, profondeurs, terriers, salle d'entraînement). Chaque case a sa **vignette** (coffre, piège, fontaine, marchand, boss...).
* Les **combats s'animent** : élan et entailles, projectiles, éclairs, boucliers, soins, étincelles, chiffres qui s'envolent, barres de vie qui descendent coup après coup. Trois styles
  (complètes, rapides, réduites) ; un clic saute l'animation. Chaque compétence a son geste, déduit de ses données ou écrit dans un champ `fx`.
* **57 sons** fabriqués par le navigateur (aucun fichier audio), avec un **banc d'essai** (menu → **Sons**) pour les écouter un par un, régler le volume et choisir le style des animations.
* Le combat tient dans la hauteur de l'écran (même sur un portable) : les médaillons s'adaptent à la place disponible.
* Les **raretés** se voient d'un coup d'œil : la couleur borde la carte de l'objet (gris, vert, bleu, violet, orange).
* La **fiche de personnage** : une **poupée de 14 emplacements** (tête, épaules, dos, torse, mains, ceinture, jambes, pieds, cou, 2 anneaux, relique, main droite,
  main gauche : on voit d'un coup d'œil ce qui manque) et un **sac rangé par sections** qui dit ce que chaque objet changerait (▲ ▼) ; les compétences en **arbre**
  (une rangée par branche, un panneau de détail avec la liste des conditions pour apprendre).

Le guide complet (variables, briques réutilisables, règles de style, fonctionnement de l'écran de combat, animations, sons, illustrations) :
**[`docs/DIRECTION-ARTISTIQUE.md`](docs/DIRECTION-ARTISTIQUE.md)**.

---

## 3 quater. Jouer à plusieurs (en ligne)

1. **Dans Aventure**, choisis **ton héros** (un seul : tes amis amènent le leur).
2. **Crée un salon** (tu en deviens l'hôte) ou **rejoins** celui d'un ami : avec son **code** de 5 caractères, ou depuis la liste des salons ouverts.
3. **Salle d'attente** : chacun voit les autres arriver en direct, peut changer de héros et dire **« Je suis prêt »**. L'hôte choisit le donjon, la difficulté
   et la **durée d'un tour** (sans minuteur, 30 s, 60 s, 90 s, 2 min), peut retirer un joueur, et **lance** quand tout le monde est prêt.
4. **La partie** : à chaque tour, un joueur est « sous les projecteurs ». Un bandeau dit **à qui est le tour** (et le titre de l'onglet change quand c'est à toi,
   pratique quand on a changé d'onglet en attendant). Chacun ne joue que **son** héros : le reste est grisé. En combat, tu vois les autres jouer en direct
   (frise d'initiative, dés, dégâts).
5. **Si un joueur ne répond pas** quand le temps est écoulé, ou s'il est parti, le **pilote automatique** du serveur joue à sa place, prudemment (il avance,
   lance les dés, garde le butin, reste honnête, et ne fait rien en combat). **Quitter en pleine partie** : ton héros reste dans le donjon mais ne gagne rien.
   Seul l'hôte peut **abandonner** pour tout le monde.
6. **Fin de partie** : chacun reçoit l'XP et le butin sur **son** héros. Pour rejouer ensemble, on recrée un salon.

Les règles complètes et le fonctionnement (salons, temps réel, minuteur) : [`docs/SERVEUR.md`](docs/SERVEUR.md) §9.

---

## 4. Organisation du projet

```
donjon/
├── index.html            la page
├── main.js               point d'entrée (charge les données puis lance le jeu)
├── artifact.html         la même page sans <html>/<head>/<body> (pour la publier sur la plateforme Claude)
├── serve.mjs             mini serveur de fichiers, pour jouer hors ligne (facultatif)
├── css/style.css         l'apparence de base (« Lanterne » : briques, écrans, mises en page)
├── css/table-pixel.css   la direction artistique « Table pixel » (table en bois, cartes crème, polices pixel), posée par-dessus
├── server/               LE SERVEUR EN LIGNE (Node 22.13+, aucune dépendance) — voir docs/SERVEUR.md
│   ├── server.mjs        le point d'entrée : `node server/server.mjs`
│   ├── admin.mjs         l'outil d'administration : sauvegarde, mot de passe oublié, liste des comptes
│   ├── app.mjs           les routes de l'API (comptes, personnages, parties, salons) et le service des fichiers du jeu
│   ├── game.mjs          le jeu côté serveur : contenu, personnages, parties, qui a le droit de faire quoi
│   ├── rooms.mjs         les salons : créer, rejoindre, prêt, réglages, lancer, quitter
│   ├── hub.mjs           le temps réel (flux SSE) : qui est en ligne, messages poussés aux joueurs
│   ├── timers.mjs        le minuteur de tour tenu par le serveur (le pilote automatique joue pour les absents)
│   ├── auth.mjs          pseudo, mots de passe (scrypt), sessions, cookies, limiteur de débit
│   ├── db.mjs, store.mjs la base SQLite (tables, évolutions) et les requêtes
│   ├── http-utils.mjs    corps JSON, en-têtes de sécurité, fichiers publics
│   └── config.mjs        les réglages (variables d'environnement)
├── var/                  (créé au premier lancement du serveur) la base de données `donjon.sqlite` et les sauvegardes
├── docs/
│   ├── SERVEUR.md             mettre le jeu en ligne : VPS, HTTPS, sauvegardes, mises à jour, sécurité, API, dépannage
│   ├── ECRIRE-UNE-CLASSE.md   le guide pour écrire des classes, compétences, monstres et objets à effets
│   ├── FARM-ET-SUCCES.md      le guide de la zone de farm, de la récompense au choix, de la forge et des succès
│   ├── DIRECTION-ARTISTIQUE.md  le guide du style : variables, briques réutilisables, écran de combat
│   └── EQUIPEMENT.md          les 14 emplacements, les deux mains, les anneaux, comment ajouter des objets
├── data/                 TOUT LE CONTENU (fichiers JSON, modifiables sans toucher au code)
│   ├── rules.json        règles globales (PA, dés, XP, poison, résurrection, marchand, mise à l'échelle...)
│   ├── modes.json        Basic / Tranche / Stasis
│   ├── tranches.json     les tranches de niveaux (1, 4, 8 jouables ; 12, 16, 20 « bientôt ») et leurs réglages communs
│   ├── dungeons.json     les DONJONS à thème de chaque tranche : monstres, boss, mécaniques, table de butin
│   ├── classes.json      les classes, leurs stats et leurs compétences (provisoires)
│   ├── skills.json       les compétences communes à toutes les classes (ex. Garde)
│   ├── items.json        raretés (couleurs) et objets (certains ont des effets)
│   ├── farm.json         les zones de farm solo : vagues, éclats, paliers de la récompense au choix, XP de rattrapage
│   ├── achievements.json les succès (condition + récompenses : compétence, fonction, titre)
│   ├── monsters.json     monstres, boss, leurs compétences et leurs particularités (régénération, riposte...)
│   ├── tiles.json        types de cases et textes d'ambiance
│   └── events.json       les coups bas et les pactes
├── src/
│   ├── core/             LA LOGIQUE DU JEU (aucun lien avec le navigateur !) — la même, dans le navigateur et sur le serveur
│   ├── net/              les « passerelles » : l'écran parle à l'une des deux, sans savoir laquelle
│   │                     (hors ligne : le navigateur applique les règles et enregistre ; en ligne : le serveur)
│   ├── storage/          sauvegarde locale (localStorage, export/import de codes)
│   └── ui/               l'affichage (écrans, animations, sons, illustrations)
│       ├── fx.js, fx-plan.js, fx-canvas.js   les animations de combat (scénario pur, mise en scène, particules)
│       ├── status.js                         décrire un bonus ou un malus (nom, résumé, phrase qui l'explique, durée) — pur, sans navigateur
│       ├── sound.js                          les 57 sons (synthèse Web Audio) ; screens/sound-lab.js : le banc d'essai
│       └── art.js, art/                      les illustrations SVG : portraits en pixel art (pixel.js, pixel-heroes.js, pixel-monsters.js), décors, vignettes
├── tools/galerie.html    la galerie de toutes les illustrations (à ouvrir avec le serveur de fichiers)
└── tests/                tests automatiques, simulateur, tests d'interface
```

**Règle d'or : séparer la logique de l'affichage.**

- `src/core/` contient les règles (dés, combats, compétences, butin, état de la partie, actions sur les personnages, bilan de fin
  de partie). Il ne touche jamais à `document`, `window` ou `localStorage` : il tourne donc aussi dans Node — c'est ce
  qu'utilisent les tests **et le serveur**, qui rejoue les mêmes règles que le navigateur pour valider chaque action.
- `src/ui/` ne contient **aucune règle** : il lit l'état du jeu, l'affiche, et envoie des actions (par la passerelle de `src/net/`).
- Tout ce qui concerne la **position** (rangs, portée) passe par `src/core/geometry.js` : le jour où on voudra une vraie
  grille, on ne réécrira que ce fichier.

Le principe du moteur tient en quelques lignes :

```js
const state = createRun(content, { tranche: 4, mode: 'tranche' }, personnages);
state.pending;                       // ce que le jeu attend : avancer, lancer un dé, un joueur qui doit jouer...
dispatch(state, { type: 'ADVANCE' }); // le joueur agit, l'état est mis à jour
```

`state` est un objet 100 % JSON : il se sauvegarde, se reprend, et voyage sur le réseau (en ligne, le serveur le garde dans sa
base et renvoie la version à jour après chaque action). Le moteur n'a pas d'horloge : le minuteur de tour est géré par
l'interface en solo, par le **serveur** à plusieurs en ligne : il joue alors à la place d'un joueur absent avec le **pilote automatique**
(`src/core/autopilot.js` : l'action la plus prudente, qui est aussi envoyée comme n'importe quelle autre action au moteur).

---

## 5. Ajouter du contenu (sans toucher au code)

Après une modification, recharge la page (ou clique sur **Recharger les JSON** dans l'Atelier). Si tu fais une faute
dans un JSON, le jeu affiche une erreur en français qui dit où chercher.

* **Classes, compétences, passifs, ressources, effets, monstres, objets à effets** → [`docs/ECRIRE-UNE-CLASSE.md`](docs/ECRIRE-UNE-CLASSE.md).
* **Une zone de farm, ses vagues et ses récompenses, ou un succès** → [`docs/FARM-ET-SUCCES.md`](docs/FARM-ET-SUCCES.md).
* **Un objet simple** (`data/items.json`) :

  ```json
  { "id": "heaume_du_roi", "name": "Heaume du roi", "slot": "head", "rarity": "rare", "level": 4,
    "stats": { "def": 2.5, "hp": 8 }, "desc": "Il brille encore." }
  ```

  `slot` = le **type** de l'objet : `head`, `neck`, `shoulders`, `back`, `chest`, `hands`, `belt`, `legs`, `feet`, `ring` (l'un des 2 anneaux), `weapon`
  (une main ; ajoute `"twoHanded": true` pour une arme à deux mains), `offhand` (main gauche : bouclier, grimoire...), `relic` ou `consumable` (potion :
  `"consumable": { "healPct": 0.5 }`). Les 14 emplacements, la règle des deux mains et tout le reste : **[`docs/EQUIPEMENT.md`](docs/EQUIPEMENT.md)**.
  `rarity` : `common` (gris), `uncommon` (vert), `rare` (bleu), `epic` (violet), `legendary` (orange) — les couleurs, noms,
  prix et probabilités se règlent dans la section `rarities` du même fichier. `level` : niveau requis **et** tranche minimale d'apparition.
  `stats` : `hp`, `atk`, `def`, `heal`, `save`, `luck`, `ini`, `pa` (les valeurs négatives sont permises : c'est le prix d'un objet puissant ; attaque, défense et soin acceptent les demi-points).
* **Un donjon** (`data/dungeons.json`) : copie un bloc, donne-lui ses monstres (`monsterPool`, `bossId`), ce qu'il faut savoir (`mechanics`)
  et sa table de butin (`loot` : des objets qui ne tomberont que là). Les mécaniques d'un type de monstre sont ses `passives` dans
  `data/monsters.json`. Tout est expliqué dans [`docs/ECRIRE-UNE-CLASSE.md`](docs/ECRIRE-UNE-CLASSE.md) §13.
* **Une tranche de niveau** (`data/tranches.json`) : copie un bloc, change l'`id` (12, 16 et 20 existent déjà en « bientôt »),
  mets `"available": true`, écris-lui au moins un donjon (`dungeons.json`) et quelques objets de ce niveau.
* **L'équilibrage** (`data/rules.json`, `data/modes.json`) : PA de base, coût d'un déplacement, bandes du D20, enragement,
  courbe d'XP, poison, coût de résurrection, prix du marchand, difficulté selon le nombre de joueurs (`partyScaling`), Stasis…

---

## 6. Les tests

```bash
node tests/run-tests.mjs        # 270 tests de règles (PA, rangs, dés, boucliers, passifs, donjons à thème et mécaniques de monstres, butin exclusif, description des bonus et malus, marque et venin de l'Assassin, puissance sacrée et auras du Templier, formes et Expiation du Prêtre, rage, postures et blessure profonde du Guerrier, formes du Druide, chants et Tempo du Barde, charges et Déflagration du Mage, feu de camp, forge, équipement à 14 emplacements, raccourcis clavier, farm (rattrapage, récompense au choix), expéditions, succès, actions sur les personnages, niveau effectif, stasis (à plusieurs, raretés par mode), coups bas (gain, esquive, pactes), sauvegarde, pilote automatique...)
node tests/server-api.mjs       # 36 tests du SERVEUR (sans navigateur : on parle à l'API) : comptes, sessions, mots de passe, limites anti-abus, tricheries refusées, parties complètes jouées par un robot, fichiers publics, outil d'administration
node tests/server-rooms.mjs     # 21 tests des SALONS (sans navigateur) : un héros par compte, prêt / réglages / retirer / quitter, parties à 2-3 joueurs jouées par des robots, tricheries refusées, rien de secret envoyé, temps réel, minuteur du serveur, redémarrage
node tests/fuzz.mjs 1000        # 1000 parties (avec un donjon, des spécialisations et des talents tirés au hasard), salles d'entraînement et sessions de farm « chaotiques » : aucune erreur attendue (et une action refusée ne change jamais l'état)
node tests/donjons-sim.mjs 40        # équilibrage des DONJONS : chaque donjon joué par des équipes de robots (trois équipes équilibrées de nouvelles classes, trois tanks, duo, solo)
node tests/templier-sim.mjs 60       # équilibrage du Templier : le compare au Berserker, avec chaque spécialisation (équipe de 3, Caves / Crypte / Profondeurs, et en solo)
node tests/pretre-sim.mjs 60         # équilibrage du Prêtre : le compare au Veilleur (soin) et l'Ombre au Duelliste (dps), avec chaque spécialisation, et en solo
node tests/guerrier-sim.mjs 60       # équilibrage du Guerrier : la Protection face aux autres tanks, Armes et Fureur face aux dps, et en solo
node tests/druide-sim.mjs 60         # équilibrage du Druide : chaque spécialisation face aux classes du même rôle (tank, soin, dps), et en solo
node tests/barde-sim.mjs 60          # équilibrage du Barde : Troubadour face au Prêtre, Skald face à l'Assassin, Ménestrel en soutien (3e ou 4e membre), et en solo
node tests/mage-sim.mjs 40           # équilibrage du Mage : chaque école en dps (face à l'Assassin et au Skald), et en solo
node tests/assassin-sim.mjs 60       # équilibrage de l'Assassin : le compare au Duelliste, avec chaque spécialisation (équipe de 3, Caves / Crypte / Profondeurs, et en solo)
node tests/sacrieur-sim.mjs 60       # équilibrage du Sacrieur : le compare au Berserker, avec chaque spécialisation (équipe de 3, Caves / Crypte / Profondeurs)
node tests/simulate.mjs 100     # des robots jouent des centaines de runs : taux de victoire, durée, morts...
node tests/economie-sim.mjs 30   # l'ÉCONOMIE : ce que rapporte chaque activité (donjon, farm, expéditions, Stasis seul) par minute de jeu
node tests/farm-sim.mjs 60      # robots dans la zone de farm : vagues atteintes, XP et objets par session (pour régler data/farm.json)
node tests/smoke.mjs 4 berserker,veilleur,duelliste   # joue UNE run et affiche son journal
node tests/find-stuck.mjs       # cherche une partie qui ne se termine pas
```

`simulate.mjs` sert à **équilibrer** : `TUNE="1:1.2:1" node tests/simulate.mjs` rend les monstres de la tranche 1
20 % plus forts (en mémoire, sans toucher aux JSON) pour voir l'effet sur les taux de victoire.

Tests de l'interface dans un vrai navigateur (nécessite Playwright, et le jeu lancé sur le port 8765) :

```bash
PORT=8765 node serve.mjs &
node tests/ui-smoke.cjs http://localhost:8765/ /tmp     # joue une run en cliquant comme un humain
node tests/ui-tour.cjs http://localhost:8765/ /tmp      # fiches, fenêtres, scénarios forcés, combat, version téléphone
node tests/ui-expeditions.cjs http://localhost:8765/ /tmp    # expéditions : onglet, envoyer, héros bloqué (donjon, farm), retour et récompenses, rappeler, téléphone
node tests/ui-farm.cjs http://localhost:8765/ /tmp      # farm : onglet, XP de rattrapage, vagues et éclats, 1 objet au choix parmi 3, succès, mort, reprise, ancien coffre, téléphone
node tests/ui-sheet.cjs http://localhost:8765/ /tmp     # la fiche : stats, poupée d'équipement, sac par sections, arbre de compétences, téléphone
node tests/ui-coach.cjs http://localhost:8765/ /tmp     # le premier combat guidé : cinq bulles une seule fois, « Passer le guide »
node tests/ui-spec.cjs http://localhost:8765/ /tmp     # spécialisation et deck : cartes, choix unique, sort évolué, équiper / retirer, téléphone
node tests/ui-donjons.cjs http://localhost:8765/ /tmp  # les donjons : choix par tranche, « à savoir », encyclopédie (bestiaire, butin exclusif), partie dans le donjon choisi, particularités en combat, téléphone
node tests/ui-templier.cjs http://localhost:8765/ /tmp # le Templier : fiche (sorts évolués selon la spé, palier 8), combat (puissance sacrée, sorts grisés, choix de l'aura en un clic, aura visible sur les alliés), téléphone
node tests/ui-pretre.cjs http://localhost:8765/ /tmp   # le Prêtre : fiche (3 spés, sorts évolués, palier 8), combat (forme de lumière puis d'ombre, relance, Expiation visible sur l'allié), téléphone
node tests/ui-guerrier.cjs http://localhost:8765/ /tmp # le Guerrier : fiche (3 spés, sorts évolués, palier 8), combat (rage, Exécution grisée, choix de la posture, blessure profonde), téléphone
node tests/ui-druide.cjs http://localhost:8765/ /tmp   # le Druide : fiche (3 spés, sorts évolués, palier 8), combat (choix de la forme, changement de rang, sorts grisés hors de leur forme), téléphone
node tests/ui-barde.cjs http://localhost:8765/ /tmp    # le Barde : fiche (3 spés, sorts évolués), combat (inspiration, choix du chant, chant sur l'allié, Tempo dans la frise), téléphone
node tests/ui-mage.cjs http://localhost:8765/ /tmp    # le Mage : fiche (3 écoles, sorts évolués), combat (charges dans le bandeau, brûlure sur la cible, Déflagration qui vide les charges), téléphone
node tests/ui-forge.cjs http://localhost:8765/ /tmp    # la forge : cadenas et démantèlement dans le sac, tout démanteler, améliorer un objet porté, forger, rechargement ; téléphone
node tests/ui-personnages.cjs http://localhost:8765/ /tmp # les places de personnages (8 par défaut) et la suppression d'un héros (corbeille sur sa carte, confirmation en tapant son nom), téléphone
node tests/ui-camp.cjs http://localhost:8765/ /tmp       # le feu de camp : au milieu du donjon, chacun change ses sorts puis choisit une activité (repos, affûter, garde), téléphone
node tests/ui-assassin.cjs http://localhost:8765/ /tmp # l'Assassin : fiche (sorts évolués selon la spé, palier 8), combat (Marque gratuite puis 1 PA, proie marquée, venin cumulable), téléphone
node tests/ui-sacrieur.cjs http://localhost:8765/ /tmp # le Sacrieur : fiche (sort de classe, deck, spécialisations automatiques), combat (modes Endurance / Fureur, Pacte de sang), téléphone
node tests/ui-barre.cjs http://localhost:8765/ /tmp    # la barre de combat en trois blocs : corps à corps, sort de classe, deck et emplacements libres, touches, téléphone
node tests/ui-inventaire.cjs http://localhost:8765/ /tmp # le sac d'une partie en cours : équiper (2 anneaux, 2 mains), donner, retirer
node tests/ui-combat-clavier.cjs http://localhost:8765/ /tmp # le bandeau de combat : raccourcis AZERTY/QWERTY, description en petit format, téléphone
node tests/ui-accueil.cjs http://localhost:8765/ /tmp    # l'accueil : premier pas, équipe, verdict de chaque donjon, difficulté, farm ; grand écran, tablette, téléphone
node tests/ui-effets.cjs http://localhost:8765/ /tmp    # les bonus et malus en combat : pastilles avec durée, panneau « Tes effets », clic sur un combattant, texte flottant, téléphone
node tests/ui-fx.cjs http://localhost:8765/ /tmp        # les animations : élan, chiffres, barres, saut d'un clic, trois styles, rien ne traîne
node tests/ui-sound.cjs http://localhost:8765/ /tmp     # les sons : chacun est fabriqué hors ligne et vérifié (silence, écrêtage, durée) ; le banc d'essai, le volume
node tests/ui-art.cjs http://localhost:8765/ /tmp       # les illustrations : galerie, portraits, décors, vignettes, remplacement par une vraie image, téléphone
node tests/ui-artifact.cjs http://localhost:8765 /tmp   # la version publiée (artifact.html), bureau et téléphone
node tests/ui-salon.cjs /tmp                            # une partie À PLUSIEURS dans deux vrais navigateurs : salon, code, « prêt », chacun son tour, départ en pleine partie, minuteur du serveur, téléphone
node tests/ui-online.cjs /tmp                           # le jeu EN LIGNE : inscription, personnages sur le serveur, partie reprise après rechargement, compte, 2e appareil
node tests/ui-proxy.cjs https://jeu.exemple.fr/ CODE /tmp # la « répétition générale » d'une mise en ligne : le jeu derrière Caddy / nginx en HTTPS (cookie Secure, en-têtes, reprise...), voir docs/SERVEUR.md
node tests/proxy-sse.mjs https://jeu.exemple.fr CODE     # le TEMPS RÉEL traverse-t-il ton portier sans retard ? (sans navigateur ; voir docs/SERVEUR.md §3.6)
```

(`ui-online.cjs` et `ui-salon.cjs` n'ont pas besoin du serveur de fichiers ci-dessus : ils lancent eux-mêmes un serveur du jeu, avec une base en mémoire.)
`npm test` enchaîne les tests de règles, le fuzz et les tests du serveur (comptes et salons).

---

## 7. Feuille de route

Le plan convenu (une étape = un jeu qui marche et qu'on peut tester) :

1. ✅ **Nouveau combat, hors ligne** : points d'action, rangs, frise d'initiative, D20 par compétence, boucliers, système de
   compétences et de passifs 100 % en JSON, 4 classes d'exemple, Atelier de classes.
2. ✅ **Zone de farm solo + succès** : une petite zone en vagues ; des éclats à chaque vague, **1 objet au choix parmi 3** en fin de session,
   de l'**XP de rattrapage** pour les héros en retard (le coffre d'origine a été retiré) ; la **forge** ; des **succès par personnage** (finir le 1er donjon en groupe → débloque une compétence ; atteindre un niveau
   d'équipement → débloque le farm auto), le tout décrit en JSON.
3. ✅ **Expéditions** (à la place du farm automatique) : on envoie un héros 30 min, 2 h ou une nuit ; il revient, même jeu fermé, avec des éclats,
   de l'XP de rattrapage et parfois un objet. La grande expédition (8 h) se débloque avec le succès « Équipé pour la gloire ». En ligne, l'heure est celle du serveur.
4. **Serveur sur ton VPS** : Node 22 sans dépendance (`http` + `node:sqlite`), le serveur applique les règles (donc impossible de tricher).
   * ✅ **4a — comptes et parties solo en ligne** : inscription / connexion (mots de passe hachés, sessions, code d'invitation),
     personnages, éclats et succès **stockés sur le serveur**, parties (farm solo, donjon avec ses propres personnages) jouées
     *via* le serveur et reprises après un rechargement ou sur un autre appareil, sauvegarde et administration en ligne de commande.
     Guide de mise en service : [`docs/SERVEUR.md`](docs/SERVEUR.md). Remarque : la version publiée sur la plateforme Claude ne peut pas appeler
     ton VPS (page isolée) : elle reste une démo en mode hors ligne.
   * ✅ **4b — salons** : plusieurs joueurs dans la même partie (voir l'étape 5).
5. ✅ **Donjons en ligne** : **salons** (code à partager, liste des salons ouverts, salle d'attente avec « prêt » et réglages de l'hôte),
   **un personnage par joueur** sur son propre écran, **minuteur de tour tenu par le serveur** avec pilote automatique pour les absents,
   **mises à jour en direct** (SSE), garder / donner / saboter entre vrais joueurs, départ en pleine partie, bilan pour chacun. Le serveur
   vérifie que chaque action est bien pour *ton* héros et à *ton* tour ; rien de secret n'est envoyé aux navigateurs. Vérifié par des tests du serveur
   et par un test à deux navigateurs. **Pas encore essayé avec de vrais amis sur un vrai VPS** : c'est la suite, et c'est là qu'on réglera la durée
   des tours et la prudence du pilote automatique.
6. ✅ **Finitions** : le socle de la direction artistique « Lanterne » (couleurs, polices, kit d'interface, combat, accueil, fiche), puis **les animations de combat**
   (un geste par compétence, trois styles), **57 sons** avec leur banc d'essai, et **les illustrations** (24 portraits, 5 décors, 8 vignettes de cases, tous dessinés en code
   et remplaçables par de vraies images). Reste, si tu veux : de la musique d'ambiance, des images peintes, une passe d'accessibilité.
   *Je ne peux pas écouter les sons : ils sont réglés à l'aide de mesures (niveaux, durées, spectres), pas à l'oreille. Le banc d'essai est là pour que tu me dises lesquels retoucher.*

En parallèle : une session dédiée à **l'identité des classes** (compétences, arbres, ressources), avec l'Atelier comme outil.
Idées plus tard : un petit chat ou des « emotes » entre joueurs, des invitations directes entre amis, des spectateurs, grille façon Wakfu à la place des rangs (`geometry.js`), tranches 12/16/20, parrainage des vétérans,
échanges d'équipement, classement.
