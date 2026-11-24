# La zone de farm solo, la récompense au choix, la forge, les expéditions et les succès

Tout est décrit en JSON : **`data/farm.json`** (les zones de farm) et **`data/achievements.json`** (les succès).
Tu n'as pas besoin de toucher au code pour ajouter une zone, régler les récompenses ou créer un succès.

---

## 1. Le principe du farm

* **Un seul personnage** entre dans une petite zone et enchaîne des **vagues** de monstres, de plus en plus fortes.
* Après chaque vague vaincue, il choisit : **vague suivante**, ou **s'arrêter**.
* S'il meurt, il **ne perd que la vague en cours** : tout ce qu'il a gagné dans les vagues précédentes est gardé.
* Chaque vague donne des **éclats** (pour la forge, voir §3 bis), un boss en donne plus.
* À la fin de la session (au moins une vague vaincue), on **choisit 1 objet parmi 3** : il va dans le sac, les deux autres sont démantelés en éclats.
  Plus on a tenu de vagues, meilleurs sont les objets proposés (paliers `choiceTiers`). Jamais d'épique ni de légendaire, ni d'objet exclusif d'un donjon :
  le meilleur équipement vient des **donjons en équipe**. Le choix attend sur le personnage (`personnage.lootChoice`) tant qu'il n'est pas fait,
  et bloque la session suivante (l'accueil affiche « Récompense à choisir »).
* L'**XP sert à rattraper** : seul un héros **plus bas que le meilleur héros du joueur** en gagne (×`catchUpXpMult`), et jamais au-delà du niveau de ce meilleur héros.
  Le héros le plus avancé ne gagne pas d'XP au farm : pour lui, ce sont des éclats et un objet. Le plafond est calculé au lancement de la session
  (`catchUpLevel` dans `src/core/farm.js`) : par le navigateur hors ligne, par le serveur en ligne (le joueur ne peut pas le choisir).
* Pendant une session, on ne peut pas changer d'équipement (seulement boire des potions et se soigner entre deux vagues).
* Le farm se joue avec **tout l'équipement** du personnage (aucune restriction de niveau) : un personnage bien équipé écrase la zone,
  et l'onglet **Expéditions** (§5) prend le relais quand on n'a pas le temps de jouer.

Une session de farm se sauvegarde comme un donjon (on peut fermer la page et reprendre). Tant qu'une partie est en cours, ses personnages sont
**verrouillés** (pas d'équipement, de compétences, de forge ni de choix de récompense) : cela évite d'écraser des changements au moment de la fin de session.

---

## 2. Écrire une zone de farm — `data/farm.json`

```json
{
  "chestCapacity": 24,
  "zones": {
    "terriers": {
      "name": "Les Terriers",
      "description": "L'entrée des caves, grouillante de rats...",
      "trancheId": 1,
      "monsterPool": ["rat_geant", "gelee_verte", "chauve_souris_vampire", "squelette_rouille", "gobelin_pillard"],
      "bossId": "roi_des_rats",
      "waves": {
        "countStart": 1, "extraMonsterEvery": 3, "countMax": 3,
        "hpPerWave": 0.07, "atkPerWave": 0.05,
        "bossEvery": 5, "bossScale": { "hp": 0.35, "atk": 0.6 }
      },
      "healBetweenWavesPct": 0.2,
      "rewards": {
        "xpMult": 1.0, "xpPerWave": 0.08, "xpMaxLevel": 4,
        "lootChance": 0.28, "bossItems": 1, "bossMinRarity": "uncommon",
        "rarityWeights": { "common": 80, "uncommon": 18, "rare": 2 },
        "itemMaxLevel": 1, "potionChance": 0.2
      }
    }
  }
}
```

### Les vagues (`waves`)

| Champ | Sens |
| --- | --- |
| `monsterPool`, `bossId` | les monstres de `monsters.json` qui peuplent la zone, et son boss |
| `scene` | (facultatif) le décor derrière les combattants : `terriers` (défaut du farm), `thicket`, `ogres`, `caves`, `crypt`, `depths`, `hideout`, `pigsty`, `sanctuary`, ou le chemin d'une image (`"img/mon-decor.jpg"`) |
| `countStart`, `extraMonsterEvery`, `countMax` | vague n : `countStart + (n−1) / extraMonsterEvery` monstres, plafonné à `countMax` (ex. 1 monstre, +1 toutes les 3 vagues, 3 au maximum) |
| `hpPerWave`, `atkPerWave` | à chaque vague, PV et attaque des monstres augmentent de ce pourcentage (0,07 = +7 % par vague, cumulés) |
| `bossEvery`, `bossScale` | toutes les `bossEvery` vagues, c'est le boss seul, avec ces multiplicateurs de PV et d'attaque en plus |
| `healBetweenWavesPct` | part des PV max rendue après chaque vague (les poisons et saignements disparaissent) |

Les monstres sont déjà adaptés à **un seul joueur** (`partyScaling` de `rules.json`) : moins de PV, moins d'attaque, moins d'actions.

### Les zones actuelles

| Zone | Tranche | Niveau requis (`minLevel`) | Monstres | Force (`waves.scale`) | Éclats / vague (+ boss) | Objets |
| --- | --- | --- | --- | --- | --- | --- |
| Les Terriers | 1 | 1 | rats, gelées, chauves-souris... (Roi des rats) | ×1 | 1 (+4) | niveau ≤ 1 |

Le boss des **Terriers** est volontairement léger (`bossScale` ×0,35 PV, ×0,6 attaque) : c'est souvent le premier boss d'un nouveau joueur, seul et au niveau 1. Avant, seuls le Sacrieur et le Guerrier le battaient régulièrement ; l'Assassin, le Druide et le Barde ne le battaient jamais. Maintenant chaque classe le bat dans 55 à 100 % des sessions (robots, sans équipement).
| Les Fourrés de Grouinval | 4 | 4 | cochons sauvages (Grand Verrat) | ×0,65 PV, ×0,7 attaque | 2 (+6) | niveau ≤ 4 |
| Les Fosses aux ogres | 8 | 8 | ogres (Roi ogre) | ×0,7 PV, ×0,7 attaque | 3 (+10) | niveau ≤ 8 |

`waves.scale` (facultatif) multiplie la force de tous les monstres d'une zone : c'est le bouton pour régler une zone sans toucher aux monstres
(qui servent aussi dans les donjons, à plusieurs). Réglées aux robots pour qu'un héros au niveau requis, correctement équipé, tienne en moyenne
6 à 7 vagues, comme aux Terriers au niveau 1. L'accueil propose les zones ouvertes au héros choisi et retient la dernière.

### Les récompenses (`rewards`)

| Champ | Sens |
| --- | --- |
| `xpMult`, `xpPerWave` | XP d'une vague = XP des monstres × `xpMult` × (1 + `xpPerWave` × (vague − 1)) × `catchUpXpMult` |
| `catchUpXpMult` | bonus de l'XP de **rattrapage** (seul un héros plus bas que ton meilleur héros gagne de l'XP au farm) |
| `shardsPerWave`, `bossShards` | éclats gagnés par vague vaincue, et en plus pour un boss |
| `choiceCount` | nombre d'objets proposés en fin de session (on en garde un) |
| `itemMaxLevel` | niveau maximum des objets proposés |
| `choiceTiers` | les paliers de la récompense : `{ "waves": 5, "rarityWeights": { ... } }` = à partir de 5 vagues vaincues, ces poids de rareté. **Les raretés absentes ne sortent jamais** |

Si une rareté d'un palier n'a aucun objet qui convienne (niveau ≤ `itemMaxLevel`, ni potion ni objet exclusif), le jeu le dit au chargement
(`aucun objet de rareté "epic" et de niveau <= 0 dans items.json`).

### Régler l'équilibre : `node tests/farm-sim.mjs`

Le simulateur fait jouer des robots dans la zone (chaque classe, plusieurs niveaux) et affiche : vagues atteintes, part des sessions qui atteignent le boss,
part des morts, XP de rattrapage (le robot rattrape un héros de niveau 8), éclats, et nombre d'objets rares proposés.

```bash
node tests/farm-sim.mjs 60           # 60 sessions par ligne
node tests/farm-sim.mjs 60 "niv 1"   # seulement les lignes qui contiennent "niv 1"
ZONE=fourres node tests/farm-sim.mjs 30   # une autre zone (fourres, fosses)
```

Repères actuels (robots, provisoires) : un niveau 1 sans équipement tient environ 4 vagues (≈ 4 éclats, ≈ 50 XP de rattrapage) ;
un niveau 3-4 correctement équipé tient 10 à 25 vagues (17 à 45 éclats) et rattrape plusieurs niveaux en une ou deux sessions.

---

## 3. La récompense au choix

* En fin de session, `computeFarmResult` tire les objets proposés (`result.choices`) ; `applyFarmResult` les pose sur le personnage (`lootChoice`).
* L'action `CHAR_PICK_LOOT { uid }` (`pickLoot` dans `src/core/farm.js`) met l'objet choisi dans le sac et démantèle les autres en éclats.
* Il n'y a plus de coffre : une ancienne sauvegarde qui en avait un voit son contenu passer dans le sac au chargement.

## 3 bis. La forge : que faire du butin — `src/core/forge.js`

Fiche du personnage : dans le **sac** (onglet *Équipement*), chaque objet a un **cadenas** (le protéger) et une **corbeille** (le démanteler) ;
l'onglet **Forge** regroupe le reste. Tous les nombres sont dans `data/rules.json` > `forge`.

* **Démanteler** un objet du sac donne des **éclats** (`personnage.shards`) selon sa rareté (`salvage` : commun 1, inhabituel 3, rare 8, épique 20, légendaire 50).
  Un objet amélioré rend en plus la moitié des éclats qu'on y a mis. Jamais : un objet **porté**, un objet **protégé** (`personnage.locked`, des `uid`), une potion.
  La forge propose aussi de tout démanteler d'un coup (les communs ; jusqu'aux inhabituels ; jusqu'aux rares).
* **Améliorer** un objet (porté ou dans le sac) : +1 à +5 (`upgradeMax`). Chaque cran donne **+10 %** (`upgradeStep`) aux PV, attaque, défense et soin
  **de l'objet** (pas aux PA, initiative, chance ni sauvegarde ; un malus ne grandit pas). Le cran n coûte `upgradeCost[rareté]` × n.
  L'amélioration est portée par l'objet lui-même (`{ uid, id, plus }`) : elle le suit dans les parties, et s'affiche « Heaume de fer +2 ».
* **Forger** un objet **exclusif d'un donjon que ce personnage a terminé** (`stats.dungeons`), au prix `craftCost[rareté]` : il arrive dans le sac.
  Un **légendaire** demande d'avoir terminé ce donjon **en Stasis** (`stats.stasisClears`), puisqu'il ne tombe qu'en Stasis, à plusieurs.
  Le meilleur butin reste à gagner en donjon, mais on n'est plus à la merci de la chance pour la pièce qui manque.
* Actions (mêmes règles hors ligne et sur le serveur, `src/core/profile-actions.js`) : `CHAR_SALVAGE {uid}`, `CHAR_SALVAGE_BULK {rarity}`, `CHAR_LOCK {uid}`, `CHAR_UPGRADE {uid}`, `CHAR_CRAFT {itemId}`.

---

## 4. Les succès — `data/achievements.json`

Un succès est **propre à un personnage**. Il a une **condition** et des **récompenses**.

```json
{
  "id": "main_tendue",
  "name": "Main tendue",
  "icon": "cross",
  "classes": ["veilleur"],
  "desc": "Terminer le donjon de la tranche 1 en groupe (au moins 2 personnages).",
  "condition": { "type": "dungeonCleared", "tranche": 1, "minPartySize": 2 },
  "rewards": [ { "type": "skill", "skillId": "veilleur_hate" } ]
}
```

* `classes` (facultatif) : le succès n'existe que pour ces classes. Sans `classes`, il concerne tout le monde.
* `icon` : un nom d'icône de `src/ui/icons.js` (`skull`, `beast`, `star`, `cross`, `armor`, `sword`, `shield`, `heart`, `boss`…).

### Les conditions

| `type` | Paramètres | Vrai quand… |
| --- | --- | --- |
| `farmBestWave` | `atLeast` | le record de vagues d'une même session atteint `atLeast` |
| `farmWaves` | `atLeast` | le total de vagues de farm vaincues atteint `atLeast` |
| `reachLevel` | `atLeast` | le personnage atteint ce niveau |
| `gearLevel` | `atLeast` | le **niveau d'équipement** atteint `atLeast` (somme des niveaux des objets portés : trois objets de la tranche 4 = 12) |
| `dungeonCleared` | `tranche`, `minPartySize` (2 = en groupe), `count` (combien de fois, 1 par défaut) | des donjons de cette tranche ont été terminés |

### Les récompenses

| `type` | Paramètres | Effet |
| --- | --- | --- |
| `skill` | `skillId` | la compétence devient **apprenable par ce personnage**. Avant le succès, elle est verrouillée (« Succès requis : … »). Le succès ne l'apprend pas à ta place : il faut toujours des points de compétence |
| `feature` | `feature` (aujourd'hui : `grandesExpeditions`) | débloque une fonction du jeu |
| `title` | `text` | un titre, affiché dans la fiche |

Une compétence ne peut être débloquée que par **un seul** succès, et seulement par un succès réservé à sa classe (ou ouvert à toutes). Le jeu vérifie tout cela au chargement.

### Quand les succès se vérifient-ils ?

À la fin de chaque run (donjon ou farm), quand on change d'équipement, quand on choisit une récompense, et au démarrage du jeu (en silence). Un succès débloqué est annoncé par un message
et sur l'écran de fin ; il reste acquis pour toujours (même si on réinitialise ses compétences).

### Ajouter une nouvelle condition

1. Dans `src/core/content.js` : ajoute son nom et ses paramètres obligatoires dans `ACHIEVEMENT_CONDITIONS`.
2. Dans `src/core/achievements.js` : ajoute un `case` dans `achievementProgress` (renvoie le chiffre actuel ; `target` est le but).
3. Si elle a besoin d'un nouveau compteur, ajoute-le dans `newCharacterStats` (`src/core/progression.js`), dans `sanitizeCharacter` (`src/storage/profile.js`),
   et incrémente-le là où l'événement se produit (par exemple `applyRunResult` dans `src/core/results.js`).

---

## 5. Les expéditions (le côté « idle ») — `src/core/expeditions.js`

Sur l'accueil, l'onglet **Expéditions** : on envoie un héros en mission, il revient au bout d'un temps **réel** (même jeu fermé) avec :

* des **éclats** (entre `shards[0]` et `shards[1]`) ;
* de l'**XP de rattrapage** (`xpFraction` × l'XP de son niveau suivant), seulement s'il est plus bas que ton meilleur héros, jamais au-delà (même règle qu'au farm) ;
* avec la probabilité `itemChance`, un **objet** de niveau ≤ min(niveau du héros, `itemMaxLevel`), selon `rarityWeights` (jamais d'objet exclusif de donjon), directement dans le sac.

Tout est dans `data/farm.json` > `expeditions` : `maxActive` (héros d'un même joueur en route à la fois, 3), puis la liste
(`id`, `name`, `icon`, `minutes`, `minLevel`, `desc`, `rewards`, et `feature` pour une expédition débloquée par un succès).
Aujourd'hui : **Patrouille** (30 min), **Chasse** (2 h, niveau 3) et **Grande expédition** (8 h, niveau 5, débloquée par le succès « Équipé pour la gloire »).

* Un héros en expédition ne part **ni en donjon, ni au farm, ni dans un salon** ; on peut le **rappeler** à tout moment, mais il revient les mains vides.
* L'expédition est enregistrée sur le personnage (`personnage.expedition = { id, start, end }`). L'heure vient de l'appelant :
  en ligne c'est l'horloge du **serveur** (impossible d'avancer sa montre pour tricher), hors ligne celle du navigateur.
* Actions : `CHAR_EXPEDITION_START { expeditionId }`, `CHAR_EXPEDITION_CLAIM` (refusée avant l'heure), `CHAR_EXPEDITION_CANCEL`.
