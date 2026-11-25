# Le premier vrai test en ligne : la liste de vérifications

Les tests automatiques couvrent déjà beaucoup (les règles, le serveur, les salons, l'interface jouée par des robots). Ce qu'ils ne
peuvent pas voir, c'est **le vrai VPS** (son portier HTTPS, son réseau, son redémarrage) et **de vraies personnes** qui jouent
ensemble sur des appareils différents. Cette liste sert à ça. Coche au fur et à mesure ; quand quelque chose cloche, note-le dans le
tableau de la fin (§6).

Prévoir : **toi + 2 ou 3 amis**, au moins **un téléphone**, environ **1 h 30**. Le guide d'installation est dans [SERVEUR.md](SERVEUR.md).

---

## 0. Avant que les amis arrivent (toi seul, 10 minutes)

Sur le VPS :

- [ ] **Mettre le jeu à jour** et le redémarrer (§7 de SERVEUR.md) :
  ```bash
  cd /opt/donjon && sudo -u donjon node server/admin.mjs backup
  sudo git -C /opt/donjon pull
  sudo systemctl restart donjon
  ```
- [ ] `systemctl status donjon` → **active (running)**.
- [ ] `curl -s http://127.0.0.1:8000/api/health` → `{"ok":true,...}`.
- [ ] `node -v` → `v22.13` ou plus.
- [ ] Le service a bien `DONJON_TRUST_PROXY=1` et un `DONJON_INVITE_CODE` (`systemctl cat donjon`).
- [ ] Garder une fenêtre ouverte sur le journal pendant tout le test : `journalctl -u donjon -f`.

Depuis ton ordinateur (avec Node 22 et Playwright, dans le dossier du jeu) :

- [ ] Le parcours automatique complet à travers le HTTPS :
  ```bash
  node tests/ui-proxy.cjs https://jeu.exemple.fr/ TON-CODE-D-INVITATION
  ```
  Tout en vert, puis supprimer le compte de test qu'il affiche (`sudo -u donjon node server/admin.mjs delete TestXXXX --yes`).
- [ ] Le temps réel traverse le portier :
  ```bash
  node tests/proxy-sse.mjs https://jeu.exemple.fr TON-CODE-D-INVITATION
  ```
  Délais de quelques dizaines de millisecondes ; supprimer ensuite les deux comptes `sse-…` (commandes affichées à la fin).
- [ ] Dans le navigateur : `https://jeu.exemple.fr` affiche le **cadenas**, et `http://jeu.exemple.fr` renvoie vers le HTTPS.

## 1. Chacun chez soi (15 minutes, en parallèle)

Chaque ami, sur son propre appareil :

- [ ] **S'inscrire** avec le code d'invitation (pseudo + mot de passe de 6 caractères au moins).
- [ ] **Créer un héros** (chacun une classe différente, idéalement : un soigneur, un tank, deux qui tapent).
- [ ] Faire une **session de farm** de quelques vagues, et voir le bilan.
- [ ] Ouvrir la **fiche du héros** : équiper un objet, choisir une spécialisation si le niveau le permet.
- [ ] **Recharger la page** (F5) : toujours connecté, rien de perdu.
- [ ] Envoyer le héros en **expédition** courte ; la retrouver au retour (l'horloge est celle du serveur).
- [ ] Passer par la **Forge** (démanteler un objet sans valeur).
- [ ] Sur **téléphone** : se connecter au même compte → les mêmes héros, rien ne déborde de l'écran.

## 2. Un donjon à plusieurs (30 à 45 minutes)

**Le salon :**

- [ ] L'hôte crée un salon : un **code de 5 caractères** s'affiche.
- [ ] Un ami rejoint **avec le code** (dicté à voix haute), un autre **depuis la liste** des salons ouverts.
- [ ] Chacun choisit son héros. Un héros parti en expédition est refusé (« … est en expédition »).
- [ ] L'hôte règle le donjon, la difficulté et un **minuteur de 60 s**. Chaque changement remet les autres « pas prêts ».
- [ ] Les points de **présence** (en ligne / hors ligne) sont justes.
- [ ] Tout le monde « prêt », l'hôte lance : **les écrans de tous** passent au donjon en même temps.

**Pendant la partie** (cocher quand la case est arrivée et s'est bien passée, pour **le joueur dont c'est le tour ET pour les autres**) :

- [ ] **Avancer** : le bandeau dit « c'est à toi ! » au joueur dont c'est le tour et « on attend X » aux autres, avec le décompte ; chez eux, le bouton est grisé.
- [ ] **Une bifurcation** : les deux routes s'affichent chez tout le monde, seul le joueur dont c'est le tour peut choisir.
- [ ] **Un combat** : l'initiative au dé, puis chacun joue SON héros à son tour ; les sorts, la cible, les points d'action, la fin du tour.
- [ ] Les **animations et les sons** arrivent chez les autres au bon moment (pas en retard de plusieurs secondes).
- [ ] **Un coffre** : forcer (le dé) ou ouvrir prudemment.
- [ ] **Un piège** : le désarmer (les chances affichées) ou le contourner.
- [ ] **Une fontaine** (XP ou vie).
- [ ] **Le marchand** : chacun achète pour son héros avec l'or du groupe.
- [ ] **Le feu de camp** : chacun change ses sorts, achète une potion au colporteur, choisit son activité.
- [ ] **Un coup bas** : la victime reçoit bien la proposition et peut répondre.
- [ ] Utiliser une **potion** entre deux cases ; **donner** un objet à un coéquipier.
- [ ] *(Si ça arrive)* un héros **tombe** : il continue en fantôme, la fontaine de vie peut le ramener.
- [ ] **Le boss**, puis **le bilan** : chacun reçoit SON XP et SON butin, et les éclats de forge de l'or restant.
- [ ] Après le bilan, le salon a disparu et chacun retrouve son héros **avec ses gains** sur l'accueil.

## 3. Les incidents (provoqués exprès, pendant un deuxième donjon)

- [ ] **Un joueur laisse passer son tour** sans rien faire : à la fin du minuteur, le pilote automatique joue à sa place (prudemment) et le journal le dit.
- [ ] **Un joueur ferme l'onglet** en pleine partie, puis revient : le bandeau « Reprendre » le ramène exactement où en était la partie.
- [ ] **Un joueur coupe le wifi de son téléphone** 30 secondes : message « Connexion perdue », puis tout revient seul.
- [ ] **Toi, sur le VPS, en pleine partie** : `sudo systemctl restart donjon`. Tout le monde voit « Connexion perdue » quelques secondes, puis la partie continue.
- [ ] **Un joueur quitte le salon** en pleine partie : son héros est joué par le pilote automatique et ne gagnera rien.
- [ ] **L'hôte quitte la salle d'attente** (avant le lancement) : le joueur arrivé en premier devient l'hôte.
- [ ] **L'hôte abandonne** : tout le monde reçoit le bilan « abandon », sans gain.
- [ ] **Le même compte sur deux appareils** en même temps (ordinateur + téléphone) : les deux écrans restent d'accord.
- [ ] *(Facultatif)* modifier un chiffre dans `data/rules.json` sur le VPS : les joueurs voient « Le jeu a été mis à jour sur le serveur : recharge la page ». Remettre la valeur ensuite.

## 4. Après le test (toi seul, 5 minutes)

- [ ] Chercher les erreurs dans le journal de la session :
  ```bash
  journalctl -u donjon --since "2 hours ago" | grep -E "\[erreur\]|\[minuteur\]|Impossible"
  ```
  Rien ne doit sortir. Sinon, copier les lignes dans le tableau du §6.
- [ ] `sudo -u donjon node server/admin.mjs stats` : le nombre de comptes, de personnages et de parties en cours (0 si tout le monde a fini).
- [ ] Supprimer les comptes de test restants (`admin.mjs users`, puis `delete … --yes`).
- [ ] Une sauvegarde : `sudo -u donjon node server/admin.mjs backup`.

## 5. Les questions à poser aux joueurs

À chaud, juste après le donjon à plusieurs :

1. Est-ce que tu as **compris ce que tu devais faire** à chaque écran ? Où as-tu hésité ?
2. Est-ce que **l'attente** pendant le tour des autres était longue ? Le minuteur de 60 s est-il trop long, trop court ?
3. La **difficulté** : trop facile, juste, trop dur ? Le groupe est-il arrivé **usé** au boss ?
4. Aux **bifurcations**, aux **pièges** et aux **coffres** : as-tu eu l'impression d'un vrai choix ?
5. Une **classe** qui t'a semblé trop forte ou trop faible ?
6. Sur **téléphone** : quelque chose de trop petit, de caché, de pénible ?
7. Qu'est-ce qui t'a donné envie de **refaire un donjon** ? Qu'est-ce qui t'en a moins donné envie ?

## 6. Ce qui a cloché

| Quoi (ce qu'on voit) | Qui / quel appareil | À quel moment | Capture ou ligne du journal |
| --- | --- | --- | --- |
| | | | |
| | | | |
| | | | |

Envoie-moi ce tableau (et les réponses aux questions) : je corrige à partir de là.
