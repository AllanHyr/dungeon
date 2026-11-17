# Mettre le jeu en ligne : le serveur

Ce guide explique comment faire tourner le jeu sur **ton VPS**, pour que toi et tes amis jouiez avec un compte :
les personnages sont gardés **sur le serveur** (tu les retrouves sur tous tes appareils) et c'est **le serveur qui applique
les règles** (impossible de se donner de l'équipement ou des niveaux en bricolant la page). Les donjons se jouent **à plusieurs,
dans un salon** : chacun sur son écran, avec **un seul héros par joueur**.

Les commandes sont à copier telles quelles ; ce qui est à adapter est écrit en `majuscules` ou dit clairement.

> **Ce qui a été répété.** Les étapes de ce guide ont été rejouées sur un Ubuntu 24.04 avec Node 22.23, **Caddy 2.6.2** et
> **nginx 1.24** (les versions des paquets Ubuntu) et un vrai navigateur ([`tests/ui-proxy.cjs`](../tests/ui-proxy.cjs)) : utilisateur de service,
> décompression et droits, HTTPS, cookie `Secure`, adresse des visiteurs, sauvegarde, **restauration**, redémarrage avec reprise de la partie,
> et le **temps réel des salons** à travers les deux portiers ([`tests/proxy-sse.mjs`](../tests/proxy-sse.mjs) : messages reçus en une vingtaine de millisecondes, flux resté
> ouvert 70 secondes sans rien d'autre que les « ping », donc plus longtemps que le délai de 60 s de nginx).
> Deux choses n'ont **pas** pu être essayées là-bas : le démarrage réel du service par systemd (le fichier a seulement été validé par
> `systemd-analyze verify`) et l'obtention d'un vrai certificat Let's Encrypt (il faut un vrai nom de domaine). Si quelque chose coince
> sur ton VPS, c'est probablement là : le tableau du §10 est fait pour ça.

---

## 1. En deux mots

```
navigateur  ──HTTPS──►  Caddy ou nginx  ──HTTP──►  node server/server.mjs  ──►  var/donjon.sqlite
 (joueur)               (le « portier »)           (le jeu : 127.0.0.1:8000)      (la base de données)
```

* **Un seul programme**, `server/server.mjs`, qui sert la page du jeu **et** l'API (comptes, personnages, parties, salons).
* **Rien à installer** à part Node.js : pas de `npm install`, aucune bibliothèque. La base de données est **SQLite**, déjà
  fournie par Node (module `node:sqlite`) : un seul fichier, `var/donjon.sqlite`.
* **Node 22.13 ou plus récent** (testé avec 22.23 ; les versions suivantes conviennent aussi).
  Entre 22.5 et 22.12 ça marche aussi, mais il faut lancer `node --experimental-sqlite server/server.mjs`.
* Le **temps réel** (voir arriver un ami dans le salon, voir le coup qui vient d'être joué) passe par un flux `GET /api/events`
  (« Server-Sent Events » : une réponse HTTP qui ne se termine jamais, sur laquelle le serveur écrit quand quelque chose change).
  Rien de plus à installer, mais le portier ne doit pas garder ce flux en tampon : c'est le cas avec les réglages du §3.4.
* Le serveur écoute **uniquement sur la machine** (`127.0.0.1`) : c'est voulu. Devant lui, **Caddy** (ou nginx) gère le HTTPS
  et le nom de domaine. Sans HTTPS, les mots de passe circuleraient en clair.
* Le jeu **hors ligne** (`node serve.mjs`, ou la version publiée sur la plateforme Claude) continue de marcher exactement
  comme avant : il enregistre dans le navigateur et n'a besoin d'aucun serveur.

---

## 2. L'essayer sur ton ordinateur (1 minute)

```bash
node -v                       # doit afficher v22.13 ou plus
node server/server.mjs
```

Ouvre **http://127.0.0.1:8000** : tu arrives sur l'écran de connexion. Crée un compte, crée un héros, lance une session
de farm, **recharge la page** : le bandeau « Une partie est en cours » te propose de reprendre exactement là où tu en étais.

Le serveur affiche ce qu'il fait au démarrage :

```
Donjon — serveur en ligne
  Adresse        http://127.0.0.1:8000   (écoute sur 127.0.0.1:8000)
  Base           /…/donjon/var/donjon.sqlite
  Comptes        0  ·  personnages 0  ·  parties en cours 0
  Inscription    OUVERTE à tous (conseillé : DONJON_INVITE_CODE=un-secret)
  Proxy HTTPS    non
```

**Essayer le jeu à plusieurs tout seul** : ouvre une **deuxième fenêtre de navigation privée** (un autre « visiteur », avec ses propres cookies), crée un second compte, puis
dans la première fenêtre clique **Créer un salon** et, dans la seconde, entre le **code** du salon (ou prends-le dans la liste des salons ouverts). Chacun choisit son
héros, dit « Je suis prêt », et la première fenêtre lance la partie : vous jouez chacun votre tour, comme avec un ami. (Pour tester le minuteur sans attendre,
choisis « 30 s » dans la salle d'attente, et ne touche à rien dans l'une des deux fenêtres.)

Pour changer un réglage, on le met devant la commande (liste complète au §4) :

```bash
PORT=8001 DONJON_INVITE_CODE=ouvre-toi node server/server.mjs
```

> Pas de nom de domaine pour l'instant ? Tu peux quand même jouer **en privé et en sécurité** depuis ton ordinateur grâce
> à un tunnel SSH : `ssh -L 8000:127.0.0.1:8000 UTILISATEUR@IP_DU_VPS`, puis ouvre http://127.0.0.1:8000 pendant que la
> connexion SSH reste ouverte. (Pour inviter des amis, il faudra un vrai nom de domaine avec HTTPS : §3.)

---

## 3. Mise en ligne sur un VPS (Debian / Ubuntu)

Il te faut : un VPS avec un accès `sudo`, et **un nom de domaine** (ou sous-domaine, par exemple `jeu.exemple.fr`) dont
l'enregistrement **A** pointe vers l'adresse IP du VPS. Compte une demi-heure la première fois.

### 3.1 Installer Node.js 22

Le Node fourni par défaut par Debian et Ubuntu est trop ancien. Le plus simple (dépôt officiel NodeSource) :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs unzip
node -v
```

`node -v` doit afficher `v22.13` ou plus. (Évite `nvm` pour ce service : il installe Node dans ton dossier personnel, que le service ne
peut pas lire — c'est le rôle de `ProtectHome=true` à l'étape 3.3. L'archive de nodejs.org décompressée dans `/opt` ou `/usr/local`
convient : note alors le chemin de `node`, `which node`, pour la ligne `ExecStart`.)

### 3.2 Copier le jeu

**Le plus simple : depuis GitHub** (le dépôt `AllanHyr/dungeon`). Sur **le VPS** : git, un utilisateur dédié (qui ne peut rien faire
d'autre que faire tourner le jeu), les fichiers, et le dossier où la base sera écrite.

```bash
sudo apt-get install -y git
sudo useradd --system --home-dir /opt/donjon --shell /usr/sbin/nologin donjon
sudo git clone https://github.com/AllanHyr/dungeon.git /opt/donjon
sudo mkdir -p /opt/donjon/var
sudo chown -R donjon:donjon /opt/donjon/var
```

(Si le dépôt est **privé**, `git clone` demande un identifiant : utilise un *token* GitHub en lecture seule à la place du mot de passe,
ou une clé SSH de déploiement. `var/` n'est jamais dans le dépôt : la base de données reste sur le VPS.)

*Sans git* : envoie une archive depuis ton ordinateur (`scp donjon.zip UTILISATEUR@IP_DU_VPS:/tmp/`), puis sur le VPS
`sudo unzip -o /tmp/donjon.zip -d /opt` à la place du `git clone` (le dossier doit s'appeler `/opt/donjon`).

Les fichiers du jeu appartiennent à `root` (le service peut les lire mais pas les modifier) ; seul `var/` est à lui.
Essai à blanc, pour vérifier que tout démarre :

```bash
cd /opt/donjon && sudo -u donjon node server/server.mjs
```

Tu dois voir le message « Donjon — serveur en ligne ». `Ctrl+C` pour l'arrêter.

### 3.3 Le service (il démarre au démarrage du VPS et redémarre en cas de problème)

Crée le fichier `/etc/systemd/system/donjon.service` (par exemple avec `sudo nano /etc/systemd/system/donjon.service`) :

```ini
[Unit]
Description=Donjon (serveur du jeu)
After=network.target

[Service]
Type=simple
User=donjon
Group=donjon
WorkingDirectory=/opt/donjon
ExecStart=/usr/bin/node server/server.mjs
Restart=on-failure
RestartSec=3

# Les réglages (voir §4). TRUST_PROXY=1 parce que Caddy / nginx est devant.
Environment=PORT=8000
Environment=HOST=127.0.0.1
Environment=DONJON_TRUST_PROXY=1
Environment=DONJON_INVITE_CODE=CHOISIS-UN-CODE-SECRET

# Durcissement : le service ne peut écrire que dans var/
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/donjon/var

[Install]
WantedBy=multi-user.target
```

(Si `which node` n'affiche pas `/usr/bin/node`, remplace le chemin dans `ExecStart`.) Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now donjon
systemctl status donjon
```

`status` doit montrer **active (running)**. Les messages du serveur se lisent avec `journalctl -u donjon -e` (ou
`journalctl -u donjon -f` pour les suivre en direct ; `Ctrl+C` pour quitter). Vérification rapide :

```bash
curl -s http://127.0.0.1:8000/api/health
```

→ `{"ok":true,"users":0,"characters":0,"runs":0}`

### 3.4 Le HTTPS devant le jeu

**Option A — Caddy (le plus simple : il obtient et renouvelle tout seul le certificat HTTPS).**

```bash
sudo apt-get install -y caddy
```

(Si ton système ne le propose pas : [caddyserver.com/docs/install](https://caddyserver.com/docs/install).)
Remplace le contenu de `/etc/caddy/Caddyfile` par (avec TON nom de domaine) :

```
jeu.exemple.fr {
	reverse_proxy 127.0.0.1:8000
}
```

```bash
sudo systemctl reload caddy
```

C'est tout : ouvre `https://jeu.exemple.fr`. (Les ports 80 et 443 du VPS doivent être accessibles — voir §3.5 — et le nom
de domaine doit déjà pointer vers le VPS, sinon Caddy n'obtient pas le certificat. Utilise une version récente de Caddy, 2.5 ou plus.)

**Option B — nginx + certbot.**

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Fichier `/etc/nginx/sites-available/donjon` :

```nginx
server {
    listen 80;
    server_name jeu.exemple.fr;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $http_host;                # ($http_host et non $host : il garde le numéro de port si le jeu n'est pas sur le 80 / 443)
        proxy_set_header X-Forwarded-For $remote_addr;   # (pas $proxy_add_x_forwarded_for : un visiteur ne doit pas pouvoir truquer son adresse)
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
        client_max_body_size 128k;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/donjon /etc/nginx/sites-enabled/donjon
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jeu.exemple.fr
```

> **Le temps réel (salons).** Le serveur envoie l'en-tête `X-Accel-Buffering: no` sur son flux `/api/events` et un message « ping » toutes
> les 20 secondes : avec les configurations ci-dessus, **il n'y a rien de plus à régler**, ni dans nginx (son délai de lecture par défaut,
> 60 s, est bien plus long que 20 s) ni dans Caddy (il transmet tout de suite les flux `text/event-stream`). Ça a été vérifié avec Caddy 2.6 et
> nginx 1.24 : `node tests/proxy-sse.mjs https://jeu.exemple.fr` mesure le temps que met un message à traverser ton portier (quelques dizaines de
> millisecondes). Si tu mets **encore un autre intermédiaire** devant (un CDN, un répartiteur de charge...), désactive la mise en tampon des
> réponses pour `/api/events`.

> **Important** : `DONJON_TRUST_PROXY=1` ne doit être mis que parce que le portier est **la seule porte d'entrée** (le jeu
> n'écoute que sur 127.0.0.1, donc personne ne peut lui parler directement). Sans ce réglage, tous les visiteurs auraient la
> même adresse (celle du portier) et les protections contre les abus se déclencheraient pour tout le monde en même temps.

### 3.5 Le pare-feu

Seuls le SSH et le web doivent être ouverts ; le port 8000 du jeu reste fermé (il n'écoute de toute façon que sur la machine).
**Autorise le SSH AVANT d'activer le pare-feu**, sinon tu te coupes l'accès :

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3.6 Vérifier que tout marche

1. Ouvre `https://jeu.exemple.fr` : l'écran de connexion s'affiche, avec le cadenas.
2. Onglet **Inscription** : le jeu demande le **code d'invitation** (celui du fichier de service). Crée ton compte.
3. Crée un héros, lance une session de farm, joue deux ou trois actions.
4. Sur le VPS : `sudo systemctl restart donjon`. Recharge la page : le bandeau **« Une partie est en cours »** te propose de reprendre.
5. Ouvre le jeu depuis ton téléphone, connecte-toi : tu retrouves les mêmes personnages.
6. *(Facultatif, si tu as Playwright sur ton ordinateur)* le même parcours, automatique, de l'inscription au téléphone :
   ```bash
   node tests/ui-proxy.cjs https://jeu.exemple.fr/ TON-CODE-D-INVITATION
   ```
   Il crée un compte de test (`TestXXXX…`, affiché au début) avec trois héros : supprime-le ensuite avec
   `sudo -u donjon node server/admin.mjs delete TestXXXX… --yes`.
7. *(Pour jouer à plusieurs : **le temps réel traverse-t-il ton portier ?**)*
   ```bash
   node tests/proxy-sse.mjs https://jeu.exemple.fr TON-CODE-D-INVITATION
   ```
   Il crée deux comptes de test (`sse-a-…` et `sse-b-…`, un héros chacun), fait créer un salon à l'un et mesure le temps que met l'autre à
   l'apprendre. Tout doit être en vert, avec des délais de quelques dizaines de millisecondes. Les commandes pour supprimer les deux comptes
   sont affichées à la fin.

---

## 4. Les réglages

Tous facultatifs ; on les écrit en `Environment=NOM=valeur` dans le fichier de service (puis `sudo systemctl daemon-reload &&
sudo systemctl restart donjon`), ou devant la commande en test.

| Variable | Par défaut | Rôle |
| --- | --- | --- |
| `PORT` | `8000` | Port où le jeu écoute. |
| `HOST` | `127.0.0.1` | Adresse d'écoute. Le défaut (la machine seulement) convient derrière Caddy / nginx. `0.0.0.0` ouvre à tout le monde (déconseillé sans HTTPS devant). |
| `DONJON_DB` | `var/donjon.sqlite` | Où est la base de données. |
| `DONJON_INVITE_CODE` | *(vide)* | Si renseigné, il faut ce code pour **créer un compte**. **Fortement conseillé** : sinon n'importe qui qui trouve l'adresse peut s'inscrire. |
| `DONJON_TRUST_PROXY` | `0` | `1` quand Caddy / nginx est devant : le jeu lit alors l'adresse du visiteur et « c'est du HTTPS » dans les en-têtes `X-Forwarded-*`. |
| `DONJON_COOKIE_SECURE` | `auto` | Cookie de connexion réservé au HTTPS : `auto` (dès que le HTTPS est détecté), `1` (toujours), `0` (jamais). |
| `DONJON_MAX_USERS` | `200` | Nombre maximal de comptes. |
| `DONJON_MAX_CHARACTERS` | `30` | Nombre maximal de personnages par compte. |
| `DONJON_SESSION_DAYS` | `30` | Durée d'une connexion (elle se prolonge tant qu'on joue). |
| `DONJON_LOG` | `api` | Ce que le serveur écrit : `api` (les requêtes de l'API et les erreurs), `all` (tout), `quiet` (rien). |

---

## 5. Les comptes

* **S'inscrire** : un pseudo (2 à 20 caractères : lettres, chiffres, espace, `- _ . '` ; unique, sans tenir compte des majuscules
  ni des accents : *Alice*, *alice* et *Alicé* sont le même pseudo) et un mot de passe de **6 caractères au moins**, plus le
  code d'invitation si tu en as mis un.
* **Changer son mot de passe** : bouton du compte (le pseudo, en haut à droite de l'accueil) → **Changer de mot de passe**. Il faut
  connaître l'ancien. Les autres appareils sont alors déconnectés.
* **Mot de passe oublié** : il n'y a pas d'e-mail (c'est toi l'administrateur). Sur le VPS :
  ```bash
  cd /opt/donjon && sudo -u donjon node server/admin.mjs passwd Alice
  ```
  Ça choisit un mot de passe au hasard et l'affiche ; transmets-le à son propriétaire, qui le change aussitôt dans le jeu.
  (Tu peux aussi imposer le tien : `… passwd Alice nouveau-mot-de-passe`.)
* **Fermer les inscriptions** une fois que tes amis sont inscrits : change le code d'invitation pour un secret que tu gardes
  pour toi, ou règle `DONJON_MAX_USERS` sur le nombre de comptes actuel.

### L'outil d'administration

`server/admin.mjs` se lance **pendant que le serveur tourne** (pas besoin de l'arrêter) :

```bash
cd /opt/donjon
sudo -u donjon node server/admin.mjs stats                  # comptes, personnages, parties, taille de la base
sudo -u donjon node server/admin.mjs users                  # la liste des comptes (dernière connexion, nombre de personnages)
sudo -u donjon node server/admin.mjs passwd Alice           # mot de passe oublié
sudo -u donjon node server/admin.mjs delete Alice --yes     # supprime un compte, ses personnages, sa partie (DÉFINITIF)
sudo -u donjon node server/admin.mjs backup                 # sauvegarde (voir ci-dessous)
```

(Sans `--yes`, `delete` explique ce qu'il va faire et ne supprime rien.)

---

## 6. Sauvegardes

**Tout ce que les joueurs ont gagné est dans un seul fichier : `var/donjon.sqlite`.** Il faut le sauvegarder.
Ne le copie pas « à la main » pendant que le serveur tourne (une partie des données peut encore être dans le fichier
`donjon.sqlite-wal`) : utilise l'outil, qui fait une copie **cohérente** sans arrêter le jeu :

```bash
cd /opt/donjon && sudo -u donjon node server/admin.mjs backup
```

Il écrit `var/backups/donjon-AAAAMMJJ-HHMMSS.sqlite` (heure UTC) et ne garde que les **14 plus récentes**
(`--keep=30` pour en garder 30 ; il ne touche jamais à d'autres fichiers du dossier). Pour une sauvegarde **chaque nuit**,
dans le crontab de root (`sudo crontab -e`) :

```
17 4 * * * cd /opt/donjon && sudo -u donjon /usr/bin/node server/admin.mjs backup >> /var/log/donjon-backup.log 2>&1
```

**Une sauvegarde sur le même disque que le jeu ne protège pas d'un disque qui lâche** : copie de temps en temps le dossier
`var/backups/` ailleurs (ton ordinateur, un autre serveur) :

```bash
scp -r UTILISATEUR@IP_DU_VPS:/opt/donjon/var/backups ./sauvegardes-donjon
```

**Restaurer** une sauvegarde (le jeu doit être arrêté) :

```bash
sudo systemctl stop donjon
sudo cp /opt/donjon/var/backups/donjon-20261104-041700.sqlite /opt/donjon/var/donjon.sqlite
sudo rm -f /opt/donjon/var/donjon.sqlite-wal /opt/donjon/var/donjon.sqlite-shm
sudo chown donjon:donjon /opt/donjon/var/donjon.sqlite
sudo systemctl start donjon
```

---

## 7. Mettre à jour le jeu

**Avec git** (installation du §3.2) : une sauvegarde par prudence, la nouvelle version (`var/`, donc la base, n'est pas touché), puis un redémarrage :

```bash
cd /opt/donjon && sudo -u donjon node server/admin.mjs backup
sudo git -C /opt/donjon pull
sudo systemctl restart donjon
```

*Avec une archive* : `scp donjon-NOUVELLE-VERSION.zip UTILISATEUR@IP_DU_VPS:/tmp/`, puis sur le VPS la même sauvegarde,
`sudo unzip -o /tmp/donjon-NOUVELLE-VERSION.zip -d /opt` et le redémarrage.

* Les **parties en cours ne sont pas perdues** : elles sont dans la base, les joueurs les reprennent après le redémarrage
  (une partie commencée avec une version du jeu incompatible est abandonnée, sans toucher aux personnages).
  **À plusieurs** : les salons et les parties en cours reprennent aussi ; le temps réel se rétablit tout seul chez les joueurs (leur navigateur
  rouvre le flux au bout de 3 secondes, après un petit message « Connexion perdue ») et les décomptes de tour repartent à neuf.
  Évite quand même de redémarrer en pleine partie à quatre : c'est une coupure de quelques secondes pour tout le monde.
* La base se met à jour toute seule si la nouvelle version change sa structure (son numéro de version est dans le fichier).
* **Modifier seulement le contenu** (`data/*.json` : équilibrage, objets, classes) **ne demande pas de redémarrage** : le serveur
  relit les fichiers modifiés dans la seconde qui suit. Si le nouveau fichier contient une erreur, il garde l'ancienne version
  et écrit l'erreur dans son journal (`journalctl -u donjon -e`). Les joueurs déjà connectés voient s'afficher « Le jeu a été
  mis à jour sur le serveur : recharge la page » et rechargent.

---

## 8. Sécurité

**Ce que le serveur fait déjà**

* Les **mots de passe** ne sont jamais enregistrés : seulement un hachage `scrypt` avec un sel propre à chaque compte.
* La **connexion** donne un jeton aléatoire (256 bits) rangé dans un cookie `HttpOnly` (le code de la page ne peut pas le
  lire), `SameSite=Lax`, et `Secure` dès que le HTTPS est détecté. La base ne garde que l'**empreinte** du jeton : copier la base ne
  donne aucune session ouverte.
* **Impossible de tricher** : le navigateur n'envoie que des *demandes* (« équiper cet objet », « lancer cette compétence »).
  Le serveur les vérifie avec **le même moteur de règles que le jeu** et refuse tout ce qui n'est pas permis : l'objet n'est pas dans
  ton sac, le niveau est trop bas, ce n'est pas ton tour, ce n'est pas ton personnage, une action qui n'existe pas…
  Les tests simulent ces tricheries (`tests/server-api.mjs`).
* **Limites anti-abus** : 8 essais de connexion de suite sur un même pseudo (compteur remis à zéro dès qu'on réussit ; 10 minutes
  d'attente sinon) et 40 essais de connexion par adresse et par 10 minutes, 6 créations de compte par heure et par adresse,
  900 requêtes par minute et par adresse, corps de requête limité à 64 Ko, requêtes d'un autre site refusées (contrôle de
  l'en-tête `Origin`). Le serveur répond de la même façon que le pseudo existe ou non.
* **En-têtes de sécurité** : la page ne peut charger de code que de ce site (`Content-Security-Policy`), ne peut pas être
  mise dans le cadre d'un autre site, `HSTS` en HTTPS.
* **Seuls quelques dossiers sont publics** (la page, `css/`, `src/`, `data/`, `img/` pour les images que tu mets à la place des dessins du jeu). Jamais `server/`, `tests/`, `docs/` ni `var/` (la base).
* Aucune dépendance : rien à mettre à jour côté bibliothèques, rien à pirater de ce côté-là.

**Ce qui reste à toi**

* **HTTPS dès qu'il y a d'autres joueurs** (sinon les mots de passe voyagent en clair).
* Un **code d'invitation** (`DONJON_INVITE_CODE`).
* Garder **Node.js et le système à jour** (`sudo apt-get update && sudo apt-get upgrade`).
* Des **sauvegardes**, dont une copie **hors du VPS** (§6).
* Dire à tes amis de ne **pas réutiliser un mot de passe** qu'ils emploient ailleurs : tu es le seul à voir la base, mais ça reste de la bonne hygiène.

**Limites connues** (acceptables pour un jeu entre amis)

* Les compteurs anti-abus sont en mémoire : un redémarrage du serveur les remet à zéro.
* Un seul processus (pas de répartition de charge) : largement suffisant pour quelques dizaines de joueurs.
* `node:sqlite` est encore étiqueté « expérimental » par Node. En pratique il est stable ; le jeu n'utilise que le strict minimum
  (`DatabaseSync`, `prepare`, `exec`). Si une future version de Node le changeait, c'est un seul fichier à adapter (`server/db.mjs`).

---

## 9. Comment ça marche (pour les curieux)

### Le chemin d'une action

```
1. Tu cliques sur « Colère » puis sur un monstre.
2. La page envoie     POST /api/run/action   { action: { type: 'COMBAT_ACT', playerId, skillId, targetId } }
3. Le serveur         retrouve ta partie → vérifie que le personnage est BIEN le tien et que c'est son tour
                      → applique l'action avec le moteur (src/core) → enregistre la partie → te renvoie le nouvel état
4. La page            n'a plus qu'à afficher (animations comprises : le serveur renvoie aussi la liste des « événements »)
```

Même si la page est trafiquée, elle ne peut rien obtenir que les règles n'autorisent pas. Une action refusée renvoie quand même l'état
à jour de la partie : l'écran se resynchronise tout seul.

### Jouer à plusieurs : les salons

Un donjon se joue **dans un salon** (le farm solo, lui, reste individuel). Les règles :

* **Un seul héros par joueur.** Chaque compte amène UN personnage : le serveur refuse d'en mettre deux dans la même partie, ou celui d'un
  autre compte. (Hors ligne, dans le navigateur, on peut toujours jouer une équipe de 1 à 4 héros à soi tout seul.)
* Un compte n'est que dans **un seul salon à la fois**, et pas en même temps dans une partie de farm.
* Un salon a un **code** de 5 caractères (sans 0/O ni 1/I : on peut le dicter au téléphone), figure dans la **liste des salons ouverts**,
  et accueille **1 à 4 joueurs**.
* **L'hôte** (celui qui crée le salon) règle le donjon, la difficulté et la **durée d'un tour** (sans minuteur, 30, 60, 90 ou 120 s),
  peut **retirer** un joueur et **lance** la partie quand tout le monde est « prêt ». Changer de héros ou de réglage remet les autres « pas prêts ».
* Pendant la partie, **chacun ne joue que son héros**. Les actions « du tour » (avancer, lancer le dé, choisir, quitter le marchand...) ne sont
  acceptées que du joueur dont c'est le tour ; équiper, soigner, acheter, offrir... que pour son propre héros. Le serveur vérifie tout
  (`authorize` dans `server/game.mjs`) ; l'écran se contente de griser ce qui n'est pas à toi.
* **Le minuteur est tenu par le serveur.** Quand le temps est écoulé, le **pilote automatique** (`src/core/autopilot.js`) joue à la place du joueur
  qui ne répond pas, toujours de la façon la plus prudente : il avance, lance les dés, garde le butin, ne boit pas aux fontaines, reste honnête,
  et ne fait rien en combat (le tour se termine). Le héros d'un joueur parti est joué de la même façon, presque tout de suite (0,7 s).
* **Quitter en pleine partie** : le héros reste dans le donjon (joué par le pilote automatique) mais **ne gagne rien** (ni XP ni butin).
  Si c'est l'hôte qui part, le joueur arrivé en premier reprend le salon. Seul l'hôte peut **abandonner** pour tout le monde.
* **Le bilan** (XP, butin, succès) est appliqué **à chaque joueur présent à la fin**, sur son propre héros ; ensuite la partie et le salon disparaissent.
* **Rien de secret ne part vers les navigateurs** : ni la graine du hasard, ni les cases du donjon pas encore découvertes (elles arrivent « cachées »).
* Un joueur qui perd sa connexion **retrouve sa partie** en rechargeant la page (bandeau « Retourner au salon » / « Reprendre »).
  Un salon d'attente oublié depuis 3 heures est supprimé. Si le serveur redémarre, les salons et les parties en cours reprennent là où ils étaient
  (les décomptes de tour repartent à neuf).

### Le temps réel (SSE)

Chaque joueur connecté ouvre **un** flux `GET /api/events` (4 flux au plus par compte : les plus anciens sont fermés). Le serveur y écrit :

| Message | Quand |
| --- | --- |
| `sync` | À l'ouverture du flux, et à chaque reconnexion : mon salon, ma partie, la version du jeu. Le navigateur se remet ainsi à jour tout seul après une coupure. |
| `room` | Mon salon a changé (un joueur arrive ou part, un héros, « prêt », les réglages...). `null` : je n'y suis plus. |
| `run` | La partie a changé : quelqu'un a joué, le minuteur a joué à la place de quelqu'un, la partie commence ou se termine. Chaque message porte un numéro de version (`rev`) : le navigateur ignore ceux qu'il a déjà vus. |
| `rooms` | La liste des salons ouverts a changé (l'accueil la relit). |
| `ping` | Toutes les 20 s : « je suis toujours là ». Si le navigateur n'entend plus rien pendant plus d'une minute, il rouvre le flux. |

Le navigateur compte aussi sur le flux pour savoir qui est **en ligne** (le point vert à côté de chaque joueur) : un joueur est « en ligne »
tant qu'il a au moins un flux ouvert.

### L'API (JSON ; le navigateur se reconnaît à son cookie)

| Route | Corps | Ce que ça fait |
| --- | --- | --- |
| `GET /api/health` | | `{ ok, users, characters, runs }` (pour surveiller le serveur) |
| `GET /api/hello` | | Qui es-tu ? Version du contenu, code d'invitation demandé ou non. Sert à la page à savoir qu'elle est « en ligne ». |
| `GET /api/content` | | Les fichiers `data/*.json` en un seul paquet, avec une version (le navigateur construit le jeu avec les mêmes données que le serveur). |
| `POST /api/register` | `{ name, password, invite? }` | Crée un compte et connecte. |
| `POST /api/login` | `{ name, password }` | Connecte. |
| `POST /api/logout` | | Déconnecte. |
| `POST /api/password` | `{ current, next }` | Change le mot de passe (les autres appareils sont déconnectés). |
| `GET /api/profile` | | Mes personnages + un résumé de ma partie en cours. |
| `POST /api/character` | `{ type, … }` | Une action de personnage : `CHAR_CREATE`, `CHAR_DELETE`, `CHAR_EQUIP`, `CHAR_UNEQUIP`, `CHAR_LEARN`, `CHAR_RESET_SKILLS`, `CHAR_OPEN_CHEST`. |
| `POST /api/run/start` | `{ kind: 'farm', charId }` | Lance une session de farm solo. (Les donjons se lancent depuis un salon : `kind: 'dungeon'` est refusé.) |
| `GET /api/run` | | Reprend la partie en cours (farm, ou partie de mon salon). |
| `POST /api/run/action` | `{ action }` | Joue une action — pour MON héros, et à mon tour s'il s'agit d'une action « du tour ». À la fin, le serveur applique le bilan aux personnages et efface la partie. |
| `POST /api/run/discard` | | Jette une session de farm sans bilan. (Une partie de salon se quitte ou s'abandonne : voir « Jouer à plusieurs », plus haut.) |
| `GET /api/events` | | Le flux temps réel (voir « Le temps réel », plus haut). |
| `GET /api/rooms` | | Les salons ouverts (en attente de joueurs). |
| `GET /api/room` | | Mon salon. |
| `POST /api/room/create` | `{ charId, setup? }` | Crée un salon avec ce héros : on en devient l'hôte. |
| `POST /api/room/join` | `{ code }` ou `{ id }`, et `{ charId }` | Rejoint un salon avec ce héros. |
| `POST /api/room/leave` | | Quitte le salon, même en pleine partie. |
| `POST /api/room/hero` | `{ charId }` | Change mon héros (avant le lancement). |
| `POST /api/room/ready` | `{ ready }` | « Je suis prêt » / « pas encore ». |
| `POST /api/room/setup` | `{ tranche?, mode?, stasisLevel?, turnSeconds? }` | L'hôte règle la partie. |
| `POST /api/room/kick` | `{ userId }` | L'hôte retire un joueur. |
| `POST /api/room/start` | | L'hôte lance la partie. |

Les réponses sont toujours `{ ok: true, … }` ou `{ ok: false, error: "un message en français" }`. Codes HTTP :
`400` demande invalide, `401` pas connecté (ou session expirée), `403` interdit, `404` introuvable, `409` conflit (pseudo pris, partie déjà en cours),
`413` trop gros, `429` trop de requêtes.

### La base de données

| Table | Contient |
| --- | --- |
| `users` | Les comptes : pseudo, hachage du mot de passe, dates. |
| `sessions` | Les connexions ouvertes (empreinte du jeton, expiration). |
| `characters` | Les personnages, un par ligne, en **JSON** (c'est exactement le format du jeu : niveau, XP, équipement, sac, coffre, compétences, succès). |
| `runs` | Les parties en cours : l'état complet du jeu, en JSON, et son numéro de version (`rev`, qui augmente à chaque action). |
| `run_players` | Qui joue quel héros dans quelle partie : une ligne par joueur. Un joueur qui part en pleine partie voit sa ligne supprimée (son héros reste, joué par le pilote automatique). |
| `rooms` | Les salons : code, hôte, réglages (JSON), « en attente » ou « en cours » (et la partie liée). |
| `room_members` | Qui est dans quel salon, avec quel héros, prêt ou non. Un compte ne peut figurer que dans un salon (contrainte d'unicité). |

Pour regarder dedans : `sqlite3 var/donjon.sqlite` (si l'outil `sqlite3` est installé : `sudo apt-get install -y sqlite3`), **sur une copie** de préférence.

---

## 10. Dépannage

| Symptôme | Cause probable et remède |
| --- | --- |
| `Ce serveur a besoin de Node 22.5 ou plus récent` | Node est trop ancien. `node -v`, puis voir §3.1. Entre 22.5 et 22.12 : `node --experimental-sqlite server/server.mjs`. |
| `Ce port est déjà utilisé` | Un autre programme (ou une autre copie du jeu) écoute déjà. Change `PORT=8001`, ou arrête l'autre. |
| `502 Bad Gateway` (page d'erreur de Caddy / nginx) | Le jeu ne tourne pas : `systemctl status donjon`, puis `journalctl -u donjon -e`. |
| Le service ne démarre pas, `status=226/NAMESPACE` | Le dossier `var/` n'existe pas : `sudo mkdir -p /opt/donjon/var && sudo chown donjon:donjon /opt/donjon/var`. |
| Le service ne démarre pas, `status=203/EXEC` | Le chemin de `node` dans `ExecStart` est faux : `which node`. |
| « Requête refusée (origine inconnue) » | Le portier ne transmet pas le nom de domaine d'origine. Avec nginx : `proxy_set_header Host $http_host;` et `proxy_set_header X-Forwarded-Host $http_host;` (`$http_host`, pas `$host` : seul le premier garde le numéro de port quand le jeu n'est pas sur le 80 / 443). Vérifie aussi `DONJON_TRUST_PROXY=1`. |
| Tout le monde reçoit « Trop de requêtes » ou « Trop d'essais » | `DONJON_TRUST_PROXY=1` manque : tous les visiteurs semblent venir de la même adresse (celle du portier). |
| On se connecte mais on est aussitôt déconnecté | Avec `DONJON_COOKIE_SECURE=1`, le cookie est refusé en HTTP simple : utilise le HTTPS, ou remets `auto`. |
| Caddy n'obtient pas de certificat | Le nom de domaine ne pointe pas (encore) vers le VPS, ou les ports 80/443 sont fermés (§3.5). `journalctl -u caddy -e`. |
| « Le jeu a été mis à jour sur le serveur : recharge la page » s'affiche | Normal après une modification de `data/*.json` : recharger la page (F5). |
| `database is locked` dans le journal | Deux écritures en même temps ont dépassé 3 secondes d'attente. Rare ; si ça se répète, vérifie qu'un seul serveur utilise cette base. |
| Les amis ne voient les changements du salon ou de la partie qu'en rechargeant la page | Le portier garde le flux temps réel en tampon, ou coupe les connexions longues. Mesure-le : `node tests/proxy-sse.mjs https://jeu.exemple.fr` (§3.6). Avec nginx et Caddy, les configurations du §3.4 suffisent ; avec un autre intermédiaire, désactive la mise en tampon de `/api/events`. |
| Un joueur n'est jamais « en ligne » (point gris) alors qu'il est là | Son flux temps réel ne s'est pas ouvert (même cause que la ligne du dessus), ou un bloqueur de publicité / une extension coupe les flux `text/event-stream`. |
| Un joueur a oublié son mot de passe | `node server/admin.mjs passwd PSEUDO` (§5). |
| Repartir de zéro (**efface tout**) | `sudo systemctl stop donjon && sudo rm /opt/donjon/var/donjon.sqlite* && sudo systemctl start donjon`. À éviter : fais plutôt une sauvegarde avant. |

---

## 11. Et ensuite

Ce que ce serveur fait aujourd'hui (étapes **4a** et **4b**) : les comptes, les personnages sur le serveur, le **farm solo**, et les
**donjons à plusieurs** (salons avec code, un héros par joueur, minuteur de tour tenu par le serveur, pilote automatique pour les absents,
mises à jour en direct), avec reprise après rechargement ou changement d'appareil.

À venir : le **farm automatique** (le succès « Équipé pour la gloire »), comme une tâche du serveur qui tourne même quand personne n'est
connecté ; puis la finition (illustrations, animations, sons).

> La version du jeu **publiée sur la plateforme Claude** reste en mode local (la page y est isolée : elle ne peut pas appeler ton
> serveur). Elle sert de démonstration ; le vrai jeu en ligne, c'est celui de ton VPS.
