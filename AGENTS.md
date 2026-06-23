# AGENTS.md — Guide pour agents IA

> Ce fichier est destiné aux agents IA (Copilot, Claude, Gemini, Cursor, etc.) qui travaillent sur ce projet.
> Il décrit l'architecture, les conventions, les commandes importantes et les règles à respecter.

---

## 🚨 RÈGLE OBLIGATOIRE — Documentation en continu

> **Cette règle est non-négociable. Elle s'applique à chaque intervention, quelle que soit sa taille.**

### Analyse documentation — modifications importantes

> **Pour chaque modification importante**, l'agent **doit analyser la documentation existante**
> avant de coder, puis **auditer et mettre à jour** (ou **créer**) toute doc impactée **avant**
> de considérer la tâche terminée.

**Workflow obligatoire :**

```
1. AVANT de coder
   ├─ Lire AGENTS.md + la doc liée à la zone touchée (cf. tableau ci-dessous)
   ├─ Parcourir README.md, docs/, games/<id>/docs/, .cursor/skills/ si pertinent
   └─ Lister explicitement les fichiers de doc susceptibles d'être impactés

2. PENDANT / APRÈS le code
   ├─ Pour chaque fichier de doc identifié : encore valide ? partiellement obsolète ? manquant ?
   ├─ Mettre à jour les sections concernées (commandes, API, structure, exemples…)
   └─ Créer une nouvelle doc si le changement introduit un concept non documenté

3. AVANT de terminer
   └─ Vérifier qu'aucune doc ne décrit un comportement que le code ne fait plus
```

**Modification importante** = tout changement qui affecte au moins un de ces axes :
- installation, démarrage ou scripts (`start.zsh`, `package.json`, ports)
- architecture, flux de données ou responsabilités (hub / jeu / shared)
- API REST, WebSocket ou protocole ESP32
- structure de fichiers, conventions ou modules partagés
- règles, constantes ou comportement d'un jeu
- skills Cursor (`.cursor/skills/`) ou règles agent (`.cursor/rules/`)

Si la modification est **triviale** (typo, commentaire sans impact fonctionnel), une relecture
ciblée suffit — mais en cas de doute, **traiter comme importante**.

### Avant toute modification

1. **Lire `AGENTS.md`** (ce fichier) en entier.
2. **Lire la doc concernée** :
   - Touche au **hub** (`hub/`) → lire `docs/ARCHITECTURE.md` + `docs/API.md`
   - Touche aux **modules partagés** (`shared/`) → lire `docs/ARCHITECTURE.md`
   - Touche à un **jeu** (`games/<id>/`) → lire `games/<id>/docs/` **en entier**
   - Touche au protocole **ESP32** ou au matériel → lire `docs/ESP32.md` + `docs/HARDWARE.md`
   - Ajoute un **nouveau jeu** → lire `docs/GAMES.md`
3. **Lire le `README.md`** si la modification affecte l'installation ou l'utilisation générale.

### Après toute modification

Mettre à jour **tous les fichiers de documentation impactés** avant de considérer la tâche terminée. Ne jamais laisser la documentation en retard sur le code.

#### Tableau de correspondance — Quoi modifier → Quels docs mettre à jour

| Zone modifiée | Fichiers de docs à mettre à jour |
|---------------|----------------------------------|
| `hub/index.js`, `hub/gameManager.js`, `hub/gameRegistry.js` | `docs/ARCHITECTURE.md`, `docs/API.md`, `AGENTS.md`, `README.md` |
| `hub/playerProfiles.js`, profils joueurs (`/api/players`, `data/players/`) | `docs/API.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `README.md` |
| `shared/modules/*` | `docs/ARCHITECTURE.md` (section modules), `AGENTS.md` (tableau modules) |
| `shared/server/*`, `shared/client/*` | `docs/ARCHITECTURE.md`, `AGENTS.md` |
| `shared/client/sounds/*`, `sound-engine.js`, API `Sounds` | `docs/SOUNDS.md`, `AGENTS.md`, `README.md`, `games/*/docs/README.md` |
| `shared/constants.js` | `docs/HARDWARE.md`, `AGENTS.md` |
| `games/<id>/server/*` ou `games/<id>/public/*` | **`games/<id>/docs/*` (OBLIGATOIRE)** |
| `games/<id>/game.config.json` | `games/<id>/docs/README.md`, `docs/GAMES.md` si le schéma change |
| **Ajout d'un jeu** | `games/<id>/docs/README.md` + `games/<id>/docs/API.md` + `game.config.json` |
| **Suppression d'un jeu** | Retirer le dossier ; aucune modif du hub nécessaire |
| Protocole ESP32 / endpoints hub | `docs/ESP32.md`, `docs/API.md` |
| Dépendances npm | `AGENTS.md` (dépendances), `README.md` |
| Port / config | `README.md`, `docs/ESP32.md`, `AGENTS.md` |
| `start.zsh`, `start.ps1`, scripts racine | `README.md`, `AGENTS.md` (commandes) |
| `.cursor/skills/*`, `.cursor/rules/*` | Skill/rule concerné + `AGENTS.md` si convention globale |

### Règle de style pour la documentation

- Les diagrammes ASCII/mermaid doivent rester cohérents avec le code réel.
- Les exemples de code (curl, Arduino, JS) doivent être testés ou marqués comme illustratifs.
- Les tableaux de référence (messages WS, endpoints, constantes) doivent refléter exactement l'implémentation.
- Ne jamais documenter une fonctionnalité planifiée comme si elle existait — utiliser `> ⚠️ À implémenter`.

---

## 🧩 RÈGLE OBLIGATOIRE — Priorité aux modules partagés

> **Avant d'écrire de la logique dans un jeu, vérifier `shared/modules/`.**

1. **Toujours regarder d'abord** ce qui existe dans `shared/modules/` et `shared/client/`.
2. Si un module couvre le besoin (grille, tours, scoring, détection d'alignement, série…), **l'utiliser** ou **l'étendre** — ne jamais le redupliquer dans un jeu.
3. Si une logique d'un jeu est susceptible d'être réutilisée par d'autres jeux, **la généraliser en module** dans `shared/modules/` plutôt que de la coder en dur dans le jeu.
4. Un module partagé doit rester **pur** : pas d'I/O réseau, pas de couplage à un jeu précis (la persistance fichier est isolée dans le module `scoring`).

> Objectif : ne jamais recoder deux fois la même mécanique. Le code d'un jeu doit surtout **composer** des modules + définir ses règles propres + son interface graphique.

---

## 📚 RÈGLE OBLIGATOIRE — Documentation par jeu

> **Chaque jeu possède son propre dossier `games/<id>/docs/`.**

- Toute modification d'un jeu **doit** mettre à jour sa doc locale (`games/<id>/docs/`) avant de terminer.
- Au minimum : `games/<id>/docs/README.md` (règles, objectif, constantes) et `games/<id>/docs/API.md` (messages WebSocket propres au jeu).
- La doc globale (`docs/`) décrit la **plateforme** ; la doc d'un jeu décrit **ce jeu uniquement**.

---

## 📌 Résumé du projet

**BasketGame** — Plateforme multi-jeux pour un plateau physique connecté.

- Un plateau **horizontal**, de la largeur de la télé, divisé en **7 colonnes égales**.
- Une carte **ESP32** lit les 7 capteurs IR et envoie les valeurs ADC en USB au Mac.
- Le **hub** (serveur principal Node.js) calibre, détecte les balles et relaie les triggers vers le serveur du jeu actif. Il ne contient **aucune logique de jeu**.
- Chaque **jeu** est autonome : son propre serveur + sa propre interface graphique + sa propre doc.
- Deux écrans : la **télé** (`/tv`, affichage du jeu) et le **contrôleur** (`/`, PC/mobile, choix et lancement des jeux).

```
                     USB série RAW:v1,…,v7
ESP32 (7 capteurs) ───────────────────────▶ HUB (port 3000)
                                              │  calibration + détection,
                                              │  relaie triggers, proxy /play
                                              │  ├─ découvre games/*/game.config.json
                                              │  ├─ spawn serveur du jeu (port 3101)
                                              │  └─ proxy HTTP + WS sous /play
                                              ▼
                                       Serveur du jeu actif
                                       (compose shared/modules/*)
                                              │
                       télé /tv ◀──iframe /play──┘   contrôleur / ◀── WS hub
```

---

## 🗂️ Structure du projet

```
basketgame/
├── AGENTS.md                  ← Ce fichier
├── README.md                  ← Documentation utilisateur
├── start.zsh                  ← Script zsh macOS — lancement rapide du hub
├── start.ps1                  ← Script PowerShell Windows — lancement rapide du hub
├── package.json               ← Dépendances racine + scripts (npm start = hub)
├── docs/
│   ├── ARCHITECTURE.md        ← Hub + jeux + modules + flux de données
│   ├── API.md                 ← API du hub + contrat standard d'un serveur de jeu
│   ├── ESP32.md               ← Protocole ESP32 + code Arduino
│   ├── HARDWARE.md            ← Système physique 7 colonnes
│   └── GAMES.md               ← Guide : créer un nouveau jeu
├── scripts/
│   └── e2e-test.sh            ← Test end-to-end du hub (curl)
├── data/
│   └── players/               ← Profils joueurs (pseudo + photos) — gitignoré
├── shared/                    ← Code réutilisable par tous les jeux
│   ├── constants.js           ← PLATFORM_COLUMNS = 7, PLAYER_PHOTO_VARIANTS
│   ├── server/
│   │   ├── createGameServer.js ← Factory Express + WS + statique pour un jeu
│   │   ├── parseStartParams.js ← Lit GAME_START_PARAMS au spawn
│   │   ├── parseRoster.js      ← Extrait le roster enrichi (profils choisis)
│   │   └── broadcast.js        ← Helpers safeSend / broadcastTo
│   ├── client/
│   │   ├── brand.css           ← Tokens CSS noir & orange (identité paniers)
│   │   ├── sound-engine.js     ← Moteur audio samples (servi sous /shared)
│   │   ├── effects.js          ← Particules, confettis, API Sounds (servi sous /shared)
│   │   ├── sounds/             ← Fichiers audio + sounds-manifest.json
│   │   ├── ws-client.js        ← Client WebSocket avec reconnexion auto
│   │   ├── column-layout.css   ← Layout 7 colonnes pleine largeur télé
│   │   ├── player-faces.js/css ← Visages joueurs (idle/win/lose) + repli initiales + têtes qui tombent (cutout)
│   │   └── camera-capture.js/css ← Capture photo carrée via webcam + effets (filtres, fonds MediaPipe, lentilles Jeeliz) + tête détourée PNG
│   └── modules/                ← Logique de jeu réutilisable (pure)
│       ├── grid7/              ← Grille à colonnes + gravité
│       ├── turn-manager/       ← Alternance des joueurs
│       ├── scoring/            ← Scores + persistance fichier
│       ├── win-detector/       ← Détection d'alignement (N en ligne)
│       ├── series/             ← Gagnant d'une série de manches
│       ├── plinko/             ← Plateau aléatoire + simulation chute
│       └── player-profiles/    ← Profils joueurs (pseudo + photos + tête détourée cutout.png) + persistance
├── hub/                       ← Serveur principal (sans logique de jeu)
│   ├── index.js               ← Express + WS + proxy + API + pages
│   ├── esp32SensorService.js  ← Port série ESP32, calibration, détection balle
│   ├── gameRegistry.js        ← Découverte des jeux (scan games/*/game.config.json)
│   ├── gameManager.js         ← Cycle de vie du jeu actif (spawn/stop/health)
│   ├── playerProfiles.js      ← Routeur /api/players + roster enrichi
│   └── public/
│       ├── index.html         ← Contrôleur responsive (lobby)
│       ├── tv.html            ← Écran télé (attente + iframe du jeu)
│       ├── players.html       ← Gestion des joueurs (pseudo + photos)
│       ├── sensors.html       ← Dashboard capteurs IR temps réel
│       ├── css/hub.css, css/players.css, css/sensors.css
│       └── js/
│           ├── lobby.js        ← Liste jeux, start/stop, choix joueurs
│           ├── players-manager.js ← CRUD profils + capture photos
│           └── tv.js           ← Bascule attente / jeu
└── games/
    ├── puissance4/            ← Jeu de référence (grille)
    ├── plinko/                ← Plinko (chute + pièces, 2–5 joueurs)
    └── zombie-siege/          ← Siège Zombie (coop tower defense, vagues)
```

### Ordre de chargement des scripts du jeu Puissance 4 (`games/puissance4/public/index.html`)

```
/shared/sound-engine.js → /shared/effects.js → js/board.js → js/players.js → js/ui.js → js/app.js
```

`app.js` orchestre les autres et expose `window.App`. `effects.js` (partagé) expose `window.Confetti` et `window.Sounds`. Catalogue sons : `docs/SOUNDS.md`. Ne pas modifier cet ordre.

---

## ⚙️ Commandes de développement

### Démarrer le hub (serveur principal)

**Sur macOS — script recommandé :**

```bash
./start.zsh              # démarre le hub (vérifie Node, installe si besoin, affiche les URLs)
./start.zsh --open       # + ouvre contrôleur et télé dans le navigateur
./start.zsh --dev        # mode développement (rechargement auto)
./start.zsh --install    # force npm install avant le démarrage
./start.zsh --help       # aide
```

**Sur Windows — script recommandé :**

```powershell
.\start.ps1              # démarre le hub (vérifie Node, installe si besoin, affiche les URLs)
.\start.ps1 --open       # + ouvre contrôleur et télé dans le navigateur
.\start.ps1 --dev        # mode développement (rechargement auto)
.\start.ps1 --install    # force npm install avant le démarrage
.\start.ps1 --help       # aide
```

> Windows : si l'exécution est bloquée, `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` ou `powershell -ExecutionPolicy Bypass -File .\start.ps1`.

Les scripts `start.zsh` / `start.ps1` à la racine :
- vérifie **Node.js >= 18**
- lance `npm install` si `node_modules/` est absent
- libère les ports **3000** (hub) et **3101** (jeu actif) s'ils sont occupés
- affiche les URLs avec l'**IP locale** (Wi-Fi) pour la télé et le mobile
- rappelle l'URL du dashboard capteurs et du simulateur

**Alternative npm :**

```bash
npm install        # À faire une seule fois (à la racine)
npm start          # Production — démarre le hub sur le port 3000
npm run dev        # Développement (rechargement auto, Node.js >= 18)
```

Le hub lance lui-même le serveur d'un jeu (processus enfant sur le port 3101) quand on le sélectionne depuis le contrôleur. **Ne pas démarrer les jeux à la main** en usage normal.

### URLs

| URL | Écran | Usage |
|-----|-------|-------|
| `http://localhost:3000/` | Contrôleur | PC / mobile — choisir et lancer un jeu |
| `http://localhost:3000/tv` | Télé | Affichage du jeu / écran d'attente |
| `http://localhost:3000/players` | Joueurs | Gérer les profils (pseudo + 3 photos via webcam) |
| `http://localhost:3000/sensors` | Capteurs IR | Dashboard calibration / détection temps réel |

> ⚠️ La capture caméra (`/players`) nécessite un contexte sécurisé : `localhost` ou HTTPS. En accès par IP locale, le navigateur peut bloquer la webcam.

### Tester l'API manuellement

```bash
# Santé du hub
curl http://localhost:3000/api/health

# Liste des jeux découverts
curl http://localhost:3000/api/games

# Lancer un jeu
curl -X POST http://localhost:3000/api/games/puissance4/start

# Lancer Plinko avec 4 joueurs
curl -X POST http://localhost:3000/api/games/plinko/start \
 -H 'Content-Type: application/json' \
 -d '{"playerCount": 4}'

# Profils joueurs (pseudo + photos) — stockés dans data/players/
curl http://localhost:3000/api/players
curl -X POST http://localhost:3000/api/players \
 -H 'Content-Type: application/json' \
 -d '{"pseudo": "Alice"}'

# Lancer Puissance 4 avec un roster (jeux requiresPlayerRoster)
curl -X POST http://localhost:3000/api/games/puissance4/start \
 -H 'Content-Type: application/json' \
 -d '{"roster": ["<id-joueur-1>", "<id-joueur-2>"]}'

# Lancer Siège Zombie (coop)
curl -X POST http://localhost:3000/api/games/zombie-siege/start

# Trigger ESP32 (relayé au jeu actif) — colonne 4 (index 3)
curl -X POST "http://localhost:3000/api/trigger?col=3"

# Arrêter le jeu actif
curl -X POST http://localhost:3000/api/games/stop
```

### Test end-to-end automatisé

```bash
bash scripts/e2e-test.sh
```

---

## 🏗️ Conventions de code

### Serveur (Node.js)

- **Le hub ne contient aucune logique de jeu.** Toute mécanique de jeu vit dans `games/<id>/server/` ou `shared/modules/`.
- **Les modules `shared/modules/*` sont purs** : aucune dépendance, aucun I/O réseau, testables isolément.
- **Un seul jeu actif à la fois** (géré par `hub/gameManager.js`).
- Un serveur de jeu utilise `createGameServer()` et n'enregistre que ses routes propres.
- Les messages WebSocket sont des objets JSON avec un champ `type` en SCREAMING_SNAKE_CASE.
- Utiliser `broadcast()` (fourni par `createGameServer`) pour diffuser, jamais d'envoi direct.

### JavaScript (frontend)

- **Pattern module IIFE** : chaque fichier expose un global `window.NomModule = (function() { ... })()`.
- **Aucun framework, aucun bundler** — JS vanilla ES2022, scripts chargés directement.
- Les chemins API/WS d'un jeu sont **relatifs au chemin de la page** (`BASE`) pour fonctionner derrière le proxy `/play` du hub comme en accès direct.

### CSS

- Variables CSS dans `:root` (hub : `hub/public/css/hub.css` ; jeu : `main.css`). Toujours utiliser les variables.
- Naming BEM : `.block__element--modifier`.
- Layout 7 colonnes réutilisable : `shared/client/column-layout.css`.

### Responsive

- Le **contrôleur** (`/`) est mobile-first (PC + téléphone).
- La **télé** (`/tv`) est pensée pour un grand écran paysage plein écran.

---

## 📐 Constantes de la plateforme

| Constante | Valeur | Fichier |
|-----------|--------|---------|
| `PLATFORM_COLUMNS` | 7 | `shared/constants.js` |
| Port du hub | 3000 (`PORT`) | `hub/index.js` |
| Port du jeu actif | 3101 (`GAME_PORT`) | `hub/gameManager.js` |

Constantes propres à Puissance 4 (`games/puissance4/server/game.js`) : `ROWS = 6`, `WIN_LENGTH = 4`, `SERIES_WIN_TARGET = 5`, `COLS = PLATFORM_COLUMNS`.

---

## 🧩 Modules partagés disponibles

| Module | Export | Rôle |
|--------|--------|------|
| `shared/modules/grid7` | `Grid` | Grille `rows × cols` (7 par défaut) + gravité (`drop`, `isFull`…) |
| `shared/modules/turn-manager` | `TurnManager` | Alternance circulaire des joueurs (`current`, `next`) |
| `shared/modules/scoring` | `Scoring` | Scores par joueur + persistance JSON (`addWin`, `addPoints`, `get`) |
| `shared/modules/win-detector` | `findWinningLine` | Détection de N jetons alignés (4 axes) |
| `shared/modules/series` | `getSeriesWinner` | Gagnant d'une série (premier à N victoires) |
| `shared/modules/plinko` | `generateBoard`, `simulateDropSeeded`, `generateMinigameLayout`, `rollMinigamePercent`, `resolveMinigameCoins` | Plateau Plinko + chute discrète + mini-jeux couteau/voleur |
| `shared/modules/player-profiles` | `PlayerProfiles` | Profils joueurs (pseudo + 3 photos + tête détourée `cutout.png`) + persistance `data/players/` |
| `shared/client/brand.css` | variables `--brand-*` | Palette noir & orange (paniers physiques) |
| `shared/client/sound-engine.js` | `window.SoundEngine` | Moteur audio samples (preload, debounce, manifest) — voir `docs/SOUNDS.md` |
| `shared/client/effects.js` | `window.Confetti`, `window.Sounds` | Effets visuels + API sons sémantique (client) |
| `shared/client/sounds/` | `sounds-manifest.json` | Fichiers audio normalisés — catalogue dans `docs/SOUNDS.md` |
| `shared/client/ws-client.js` | `window.WSClient` | Connexion WS avec reconnexion |
| `shared/client/column-layout.css` | classes `.platform-*` | Grille 7 colonnes télé |
| `shared/client/player-faces.js` | `window.PlayerFaces` | Visages joueurs (variante idle/win/lose, tailles sm→xxl) + repli initiales + `getCutoutUrl` + têtes qui tombent (`dropHead`/`rainHeads`, photo win/lose si demandée) |
| `shared/client/player-faces.css` | classes `.player-face*`, `.player-head-drop*` | Style des visages joueurs + couche/anim des têtes qui tombent |
| `shared/client/camera-capture.js` | `window.CameraCapture` | Capture photo carrée via webcam + effets : filtres couleur, fonds (flou/coloré via MediaPipe SelfieSegmentation), lentilles visage (accessoires vectoriels calés sur le suivi du visage Jeeliz FaceFilter) — libs CDN lazy ; option `withCutout` → PNG détouré transparent |

---

## 📡 Protocole de communication (résumé)

### ESP32 → Hub (USB série)

```
RAW:v1,v2,v3,v4,v5,v6,v7   (115200 baud, ~10 ms)
```

Le hub (`esp32SensorService.js`) calibre (5 s), calcule un seuil par capteur (`baseline × ratio`, défaut global 55 %, overrides individuels 10–90 % possibles sur `/sensors`, persistés dans `data/sensors-config.json`), détecte les balles et appelle le même flux que `POST /api/trigger`. Dashboard : `/sensors`.

Si aucun jeu n'est lancé → le hub diffuse `HUB_TRIGGER` à la télé (prévisualisation idle).

### Trigger manuel (simulateur / tests)

```
POST http://<hub>:3000/api/trigger?col=N
```

### Hub → Contrôleur / Télé (WebSocket racine)

| `type` | Déclencheur | Données |
|--------|-------------|---------|
| `HUB_STATE` | Connexion + tout changement | `status`, `activeGameId`, `port`, `games[]` |
| `HUB_TRIGGER` | Trigger sans jeu actif | `column` (0–6) — chute d'un 🏀 sur l'écran d'attente `/tv` |
| `SENSOR_UPDATE` | Lecture série | `values[]`, `states[]`, `thresholds[]`, `history[][]`, … |
| `SENSOR_EVENT` | Front détection | `sensor`, `state` |
| `SENSOR_CALIBRATION_*` | Calibration IR | voir `docs/API.md` |
| `SENSOR_SERIAL_STATUS` | Connexion port USB | `connected`, `port` / `message` |

### Serveur de jeu → Télé (WebSocket via `/play`)

Voir le contrat dans `docs/API.md` et les messages propres à chaque jeu dans `games/<id>/docs/API.md`.

---

## ✅ Checklist avant de terminer une tâche

- [ ] **Audit doc** : toutes les docs impactées ont été relues et mises à jour (ou créées)
- [ ] `curl http://localhost:3000/api/health` retourne `{ "status": "ok", ... }`
- [ ] `curl http://localhost:3000/api/games` liste bien les jeux attendus
- [ ] Lancer un jeu depuis le contrôleur l'affiche sur `/tv`
- [ ] Un trigger (`curl -X POST .../api/trigger?col=3`) agit sur le jeu actif
- [ ] L'arrêt d'un jeu ramène la télé à l'écran d'attente
- [ ] Aucune logique de jeu n'a été ajoutée au hub
- [ ] La logique réutilisable a été mise dans `shared/modules/`, pas dupliquée
- [ ] La doc du jeu (`games/<id>/docs/`) est à jour
- [ ] La doc globale impactée (`docs/`, `AGENTS.md`, `README.md`) est à jour
- [ ] Les constantes (`PLATFORM_COLUMNS`, ports) sont cohérentes partout
- [ ] Aucune erreur dans la console navigateur ni dans les logs du hub/jeu
