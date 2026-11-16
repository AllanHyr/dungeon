# La zone de farm solo, le coffre et les succès

Tout est décrit en JSON : **`data/farm.json`** (les zones de farm) et **`data/achievements.json`** (les succès).
Tu n'as pas besoin de toucher au code pour ajouter une zone, régler les récompenses ou créer un succès.

---

## 1. Le principe du farm

* **Un seul personnage** entre dans une petite zone et enchaîne des **vagues** de monstres, de plus en plus fortes.
* Après chaque vague vaincue, il choisit : **vague suivante**, ou **partir avec son coffre**.
* S'il meurt, il **ne perd que la vague en cours** : tout ce qu'il a gagné dans les vagues précédentes est gardé.
* Les récompenses sont **volontairement restreintes** (début de jeu) : de l'XP jusqu'à un niveau plafond, et des objets communs ou inhabituels
  (rarement rares), jamais d'épique ni de légendaire. Le meilleur équipement vient des **donjons en équipe**.
* L'XP est ajoutée tout de suite à la fin de la session ; les **objets vont dans le coffre** du personnage (capacité 24), qu'on **ouvre** quand on veut :
  tout passe alors dans l'inventaire, avec une petite révélation du moins rare au plus rare.
* Pendant une session, on ne peut pas changer d'équipement (seulement boire des potions et se soigner entre deux vagues).
* Le farm se joue avec **tout l'équipement** du personnage (aucune restriction de niveau) : un personnage bien équipé écrase la zone,
  ce qui justifiera le farm automatique (étape suivante), débloqué par un succès.

Une session de farm se sauvegarde comme un donjon (on peut fermer la page et reprendre). Tant qu'une partie est en cours, ses personnages sont
**verrouillés** (pas d'équipement, de compétences ni d'ouverture de coffre) : cela évite d'écraser des changements au moment de la fin de session.

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
        "bossEvery": 5, "bossScale": { "hp": 0.65, "atk": 0.85 }
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
| `scene` | (facultatif) le décor derrière les combattants : `terriers` (défaut du farm), `caves`, `crypt`, `depths`, ou le chemin d'une image (`"img/mon-decor.jpg"`) |
| `countStart`, `extraMonsterEvery`, `countMax` | vague n : `countStart + (n−1) / extraMonsterEvery` monstres, plafonné à `countMax` (ex. 1 monstre, +1 toutes les 3 vagues, 3 au maximum) |
| `hpPerWave`, `atkPerWave` | à chaque vague, PV et attaque des monstres augmentent de ce pourcentage (0,07 = +7 % par vague, cumulés) |
| `bossEvery`, `bossScale` | toutes les `bossEvery` vagues, c'est le boss seul, avec ces multiplicateurs de PV et d'attaque en plus |
| `healBetweenWavesPct` | part des PV max rendue après chaque vague (les poisons et saignements disparaissent) |

Les monstres sont déjà adaptés à **un seul joueur** (`partyScaling` de `rules.json`) : moins de PV, moins d'attaque, moins d'actions.

### Les récompenses (`rewards`)

| Champ | Sens |
| --- | --- |
| `xpMult`, `xpPerWave` | XP d'une vague = XP des monstres × `xpMult` × (1 + `xpPerWave` × (vague − 1)) |
| `xpMaxLevel` | **plafond** : l'XP de cette zone ne fait jamais dépasser ce niveau (un personnage qui l'a atteint ne gagne plus d'XP ici) |
| `lootChance` | probabilité d'un objet après chaque vague normale |
| `bossItems`, `bossMinRarity` | le boss donne ce nombre d'objets, d'au moins cette rareté |
| `rarityWeights` | poids de chaque rareté. **Les raretés absentes ne tombent jamais** (pas d'épique ni de légendaire ici) |
| `itemMaxLevel` | niveau maximum des objets qui peuvent tomber |
| `potionChance` | part des butins qui sont des potions |
| `chestCapacity` (en haut du fichier) | taille du coffre. Plein : on ne peut plus lancer de session ; en cours de route, ce qui dépasse est perdu |

Si une rareté est dans `rarityWeights` sans aucun objet qui convienne (niveau ≤ `itemMaxLevel`), le jeu le dit au chargement
(`aucun objet de rareté "epic" et de niveau <= 0 dans items.json`).

### Régler l'équilibre : `node tests/farm-sim.mjs`

Le simulateur fait jouer des robots dans la zone (chaque classe, plusieurs niveaux) et affiche : vagues atteintes, part des sessions qui atteignent le boss,
part des morts, XP et objets par session.

```bash
node tests/farm-sim.mjs 60           # 60 sessions par ligne
node tests/farm-sim.mjs 60 "niv 1"   # seulement les lignes qui contiennent "niv 1"
```

Repères actuels (robots, provisoires) : un niveau 1 sans équipement tient 4 à 5 vagues et butte sur le premier boss (sauf le Berserker, qui le bat une fois sur deux) ;
il faut environ 6 à 10 sessions pour passer du niveau 1 au niveau 4.

---

## 3. Le coffre

* Chaque personnage a un coffre (`personnage.chest`, une liste d'objets) : les objets du farm y arrivent à la fin de la session.
* **Ouvrir le coffre** déplace tout dans l'inventaire (`openChest` dans `src/core/farm.js`) ; l'interface fait la révélation.
* Le coffre est enregistré avec le personnage (sauvegarde, export / import).

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
| `feature` | `feature` (aujourd'hui : `autoFarm`) | débloque une fonction du jeu |
| `title` | `text` | un titre, affiché dans la fiche |

Une compétence ne peut être débloquée que par **un seul** succès, et seulement par un succès réservé à sa classe (ou ouvert à toutes). Le jeu vérifie tout cela au chargement.

### Quand les succès se vérifient-ils ?

À la fin de chaque run (donjon ou farm), quand on change d'équipement, quand on ouvre un coffre, et au démarrage du jeu (en silence). Un succès débloqué est annoncé par un message
et sur l'écran de fin ; il reste acquis pour toujours (même si on réinitialise ses compétences).

### Ajouter une nouvelle condition

1. Dans `src/core/content.js` : ajoute son nom et ses paramètres obligatoires dans `ACHIEVEMENT_CONDITIONS`.
2. Dans `src/core/achievements.js` : ajoute un `case` dans `achievementProgress` (renvoie le chiffre actuel ; `target` est le but).
3. Si elle a besoin d'un nouveau compteur, ajoute-le dans `newCharacterStats` (`src/core/progression.js`), dans `sanitizeCharacter` (`src/storage/profile.js`),
   et incrémente-le là où l'événement se produit (par exemple `applyRunResult` dans `src/core/results.js`).

---

## 5. Pour la suite : le farm automatique

La fonction `autoFarm` existe déjà comme **récompense de succès** (« Équipé pour la gloire » : niveau d'équipement 12) et l'accueil affiche où en est le personnage.
Le farm lui-même est une machine à états 100 % JSON (`FARM_NEXT`, `FARM_STOP` et les actions de combat) : un robot peut donc la jouer sans écran
(le robot des tests, `tests/bot.mjs`, fait exactement cela). Le farm automatique consistera à promouvoir ce robot dans `src/core/` et à lancer des sessions
en arrière-plan jusqu'à remplir le coffre.
