# L'équipement : 14 emplacements

Chaque personnage porte jusqu'à **14 objets**, un par emplacement. La page « Équipement » de la fiche (et le sac d'une partie en cours)
montre une **poupée** : les 14 emplacements d'un coup d'œil (pointillé = libre, couleur de la rareté = porté), et un **sac rangé par sections**.

## 1. Les emplacements

| Emplacement | Nom affiché | Types d'objets acceptés (`"slot"` d'un objet) |
| --- | --- | --- |
| `head` | Tête | `head` |
| `shoulders` | Épaules | `shoulders` |
| `back` | Dos | `back` (cape) |
| `chest` | Torse | `chest` |
| `hands` | Mains | `hands` (gants) |
| `belt` | Ceinture | `belt` |
| `legs` | Jambes | `legs` |
| `feet` | Pieds | `feet` |
| `neck` | Cou | `neck` (amulette, collier) |
| `ring1`, `ring2` | Anneau 1, Anneau 2 | `ring` (l'un ou l'autre) |
| `relic` | Relique | `relic` |
| `mainHand` | Main droite | `weapon` |
| `offHand` | Main gauche | `weapon` (à une main) ou `offhand` (bouclier, grimoire, orbe...) |

Les potions (`"slot": "consumable"`) ne se portent pas : elles restent dans le sac et s'utilisent pendant une partie.

## 2. Les règles

* **Arme à deux mains** (`"twoHanded": true`, uniquement pour `"slot": "weapon"`) : elle va en main droite et **bloque la main gauche**.
  En l'équipant, l'objet de la main gauche retourne dans le sac. À l'inverse, équiper quelque chose en main gauche renvoie l'arme à deux mains au sac.
* **Deux armes à une main** : l'une en main droite, l'autre en main gauche (le moteur choisit le premier emplacement libre).
* **Deux anneaux** : le premier libre est choisi ; si les deux sont pris, on **clique d'abord sur l'anneau à remplacer** dans la poupée, puis sur « Équiper ».
* **Rien ne se perd** : un objet remplacé retourne toujours dans le sac.
* **Niveau requis** : comme avant, il faut le niveau **réel** du personnage. En mode Tranche / Stasis, un objet de niveau supérieur à la tranche reste porté mais est **inactif**.
* **Niveau d'équipement** = la somme des niveaux des objets portés (14 emplacements maximum). Le succès « Équipé pour la gloire » (grandes expéditions) demande **36**.
* **Raretés et modes** : hors Stasis (Basic, Tranche), un objet est au mieux **épique**, et très rarement (poids ×0,25) ; le **légendaire** ne tombe
  qu'en **Stasis**, qui se joue à plusieurs (2 joueurs ou plus, en ligne). Réglages : `maxRarity` et `rarityWeights` dans `data/modes.json`.
  Le farm et les expéditions restent plafonnés à « rare ». Un légendaire de donjon ne se forge qu'après avoir terminé ce donjon en Stasis.
* **La relique** est l'emplacement du « gameplay » : ses objets ont souvent un effet (`effect`, `modifiers`, `triggers`, `+1 PA`...).
  Il n'y en a que de rares (épiques et légendaires), pour l'instant six.

## 3. Où se règle quoi

| Je veux... | Je modifie... |
| --- | --- |
| changer un nom d'emplacement | `data/items.json` → `"slots"` |
| changer le nom d'un type (ou le titre de sa section dans le sac) | `data/items.json` → `"types"` |
| ajouter / modifier un objet | `data/items.json` → `"items"` (voir §4) |
| **ajouter ou retirer un emplacement** | `EQUIP_SLOTS` et `ITEM_TYPES` dans `src/core/content.js`, son nom dans `"slots"`, son icône dans `src/ui/icons.js`, sa place dans la poupée (`DOLL_ROWS` de `src/ui/gear.js`) |
| changer le seuil du succès d'équipement | `data/achievements.json` → `equipe_pour_la_gloire` |

Les règles de placement (où va un objet, ce qu'il chasse) sont dans `src/core/items.js` (`slotsFor`, `planEquip`, `equipFromBag`) : l'interface les appelle, elle n'en décide rien.

## 4. Ajouter un objet

```json
{ "id": "heaume_du_roi", "name": "Heaume du roi", "slot": "head", "rarity": "epic", "level": 4,
  "stats": { "def": 3, "hp": 9, "save": 1 }, "desc": "Il a été trop lourd pour son propriétaire." }
```

* `slot` = le **type** (voir le tableau) ; `rarity` = `common`, `uncommon`, `rare`, `epic`, `legendary` ; `level` = niveau requis **et** tranche minimale de drop.
* `stats` : `hp`, `atk`, `def`, `heal`, `save`, `luck`, `ini`, `pa`. Les valeurs négatives sont permises (le prix d'un objet puissant).
  **Attaque, défense et soin acceptent les demi-points** (`"def": 1.5`) : avec 14 emplacements, un objet donne souvent moins d'un point entier.
* Une arme à deux mains : `"slot": "weapon", "twoHanded": true` (comptez à peu près **deux fois** les chiffres d'une arme à une main : on renonce à la main gauche).
* Un effet spécial : `effect` (la phrase affichée) + `modifiers` / `triggers` (voir `docs/ECRIRE-UNE-CLASSE.md` §12).
* Le loot tire d'abord une rareté, puis un objet de cette rareté parmi ceux de niveau ≤ tranche : **plus un emplacement a d'objets, plus il tombe souvent**.

## 5. D'où viennent les chiffres (provisoires)

La plupart des objets du catalogue (208) ont été **générés** : les anciens objets (arme, armure, relique) ont été rangés dans les nouveaux emplacements,
et les cases vides de la grille *emplacement × tranche (1, 4, 8) × rareté* ont été remplies. Pour que 14 emplacements ne rendent pas le jeu trivial, chaque
emplacement reçoit une **part du budget** d'un ancien équipement complet : torse 12 %, jambes 8 %, tête 7 %, épaules 6 %, mains 6 %, pieds 6 %, cou 5 %,
ceinture 4 %, dos 4 %, anneau 4,5 % chacun, main gauche 10 %, arme à une main 17 %, arme à deux mains 30 %. Le tout est multiplié par un coefficient (0,9),
réglé avec les robots (`node tests/simulate.mjs`) pour que les taux de victoire d'un groupe « bien équipé » restent proches de ceux d'avant.
Une rareté plus haute n'est jamais plus faible que la précédente pour un même emplacement et une même tranche.

**Tout ça se retouche à la main** dans `data/items.json`. Les objets trouvés *pendant* un donjon sont désormais plus petits (14 emplacements à remplir) :
si les parties paraissent moins gratifiantes, augmenter le butin par donjon (`data/rules.json`) est le premier réglage à essayer.

## 6. Les anciennes sauvegardes

Un personnage sauvegardé avec l'ancien système (arme / armure / relique) est **migré automatiquement** au chargement : chaque objet va au premier emplacement
possible (l'ancienne arme en main droite, l'ancienne armure au torse, l'ancienne relique à son nouvel emplacement : anneau, cou, tête ou relique selon l'objet).
Aucun objet n'est perdu. Une **partie en cours** sauvegardée avec l'ancien système est abandonnée (le personnage, lui, n'est pas touché).
