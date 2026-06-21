# 🏀 BasketGame — Plateforme de jeux pour plateau physique

BasketGame transforme un **plateau physique horizontal à 7 colonnes** (équipé d'une carte ESP32) en console multi-jeux. Une balle qui passe dans une colonne déclenche un signal ; un **hub** central reçoit ce signal et le transmet au jeu en cours, qui s'affiche en temps réel sur une télé.

Le Puissance 4 n'est que le premier jeu : la plateforme est conçue pour en accueillir beaucoup d'autres, chacun dans son propre dossier.

```
                     USB série RAW:v1,…,v7
ESP32 (7 capteurs) ───────────────────────▶ HUB (Node.js, port 3000)
                                              │  calibration + détection,
                                              │  relaie les triggers, proxy /play
                                              ▼
                                       Serveur du jeu actif
                                              │
                       Télé /tv ◀── jeu ──────┘   Contrôleur / ◀── PC / mobile
```

---

## ✨ Concept

- **Hub** : le seul serveur à lancer. Il ne contient aucune logique de jeu — il découvre les jeux, en lance un à la demande, lit les capteurs ESP32 en USB, calibre/détecte les balles, relaie les triggers vers le jeu actif, et sert les interfaces.
- **Écran d'attente** : tant qu'aucun jeu n'est lancé, la télé affiche un écran d'attente. On choisit et lance un jeu depuis le **contrôleur** (PC ou mobile).
- **Jeux modulaires** : ajouter un jeu = déposer un dossier dans `games/` avec un `game.config.json`. Le hub le détecte automatiquement, sans aucune modification du code de base.
- **Modules réutilisables** : la logique commune (grille, tours, scoring, détection d'alignement…) vit dans `shared/modules/` et est réutilisée par les jeux.
- **Profils joueurs** : une page **Joueurs** (`/players`) permet de créer des profils avec un pseudo et **3 photos** prises à la webcam (profil, victoire, défaite), avec des effets façon Snapchat (filtres couleur, fonds flou/colorés, lentilles visage). La photo de profil génère aussi une **tête détourée** (PNG transparent) réutilisée pour des animations « têtes qui tombent » sur la télé. Avant de lancer un jeu compétitif, on choisit qui joue ; les visages s'affichent alors partout (cartes, podium, animations de victoire/défaite/vol) en choisissant la bonne photo selon le contexte.

---

## 🚀 Installation et démarrage

Prérequis : **Node.js >= 18**.

### macOS — script rapide (recommandé)

```bash
./start.zsh              # démarre le hub, affiche les URLs (IP locale incluse)
./start.zsh --open       # + ouvre contrôleur et télé dans le navigateur
./start.zsh --dev        # mode développement (rechargement auto)
./start.zsh --help       # voir toutes les options
```

Le script [`start.zsh`](start.zsh) à la racine :
- vérifie Node.js >= 18 et installe les dépendances si `node_modules/` est absent
- libère les ports 3000 (hub) et 3101 (jeu actif) s'ils sont déjà utilisés
- affiche les URLs avec ton **IP locale** (Wi-Fi) pour accéder depuis la télé ou un mobile
- rappelle l'URL du dashboard capteurs et du simulateur

### Alternative npm

```bash
npm install        # une seule fois
npm start          # démarre le hub sur le port 3000
npm run dev        # développement (rechargement auto)
```

| Écran | URL | Sur quel appareil |
|-------|-----|-------------------|
| **Télé** | `http://<ip-du-pc>:3000/tv` | Grand écran / télé (paysage) |
| **Contrôleur** | `http://<ip-du-pc>:3000/` | PC portable ou téléphone |
| **Joueurs** | `http://<ip-du-pc>:3000/players` | PC ou téléphone (gestion des profils) |
| **Capteurs IR** | `http://<ip-du-pc>:3000/sensors` | Dashboard calibration / détection temps réel |

Sur le contrôleur, choisissez un jeu et appuyez sur **Lancer** : il démarre et s'affiche sur la télé. Le bouton **Arrêter** ramène la télé à l'écran d'attente.

---

## 🎮 Jeux disponibles

| Jeu | Dossier | Joueurs | Doc |
|-----|---------|---------|-----|
| Puissance 4 | `games/puissance4/` | 2 | [games/puissance4/docs/README.md](games/puissance4/docs/README.md) |
| Plinko | `games/plinko/` | 2–5 | [games/plinko/docs/README.md](games/plinko/docs/README.md) |
| Siège Zombie | `games/zombie-siege/` | Coop (1+) | [games/zombie-siege/docs/README.md](games/zombie-siege/docs/README.md) |

---

## 🕹️ Le plateau physique (7 colonnes)

Le plateau fait la largeur de la télé et est divisé en **7 colonnes égales** (index 0 à gauche → 6 à droite). L'ESP32 envoie les valeurs ADC en USB ; le hub détecte la colonne traversée par la balle. Voir [docs/HARDWARE.md](docs/HARDWARE.md) et [docs/ESP32.md](docs/ESP32.md).

---

## 🧪 Tester sans ESP32

**Depuis le contrôleur** (`http://localhost:3000/`) : bouton **Simuler la balle** en bas à droite — panneau avec **7 colonnes** (même effet que l'ESP32). Sans jeu actif, l'animation s'affiche sur la télé ; avec un jeu lancé, le coup est relayé au jeu.

**En ligne de commande** (le jeu doit être lancé depuis le contrôleur) :

> Note : Puissance 4 et Plinko exigent désormais un **roster** de profils (`controller.requiresPlayerRoster`).
> Créez d'abord des joueurs avec leurs 3 photos sur `/players`, puis passez leurs identifiants
> dans le champ `roster` au lancement (voir [docs/API.md](docs/API.md)).

```bash
# Lancer le Puissance 4 avec deux profils
curl -X POST http://localhost:3000/api/games/puissance4/start \
  -H 'Content-Type: application/json' \
  -d '{"roster": ["<id-joueur-1>", "<id-joueur-2>"]}'

# Lancer Plinko avec 3 joueurs
curl -X POST http://localhost:3000/api/games/plinko/start \
  -H 'Content-Type: application/json' \
  -d '{"playerCount": 3, "roster": ["<id1>", "<id2>", "<id3>"]}'

# Lancer Siège Zombie (coop)
curl -X POST http://localhost:3000/api/games/zombie-siege/start

# Simuler une balle dans la colonne 4 (index 3)
curl -X POST "http://localhost:3000/api/trigger?col=3"

# Test end-to-end complet (démarrage, partie gagnante, arrêt)
bash scripts/e2e-test.sh
```

---

## ➕ Ajouter un nouveau jeu

Tout est documenté dans [docs/GAMES.md](docs/GAMES.md). En résumé :

1. Créer `games/mon-jeu/` avec un `game.config.json`.
2. Écrire `server/index.js` (via `shared/server/createGameServer`) et `server/game.js` (en **composant** les modules de `shared/modules/`).
3. Créer l'interface dans `public/` et la doc dans `docs/`.
4. Relancer le hub : le jeu apparaît automatiquement sur le contrôleur.

---

## 📚 Documentation

| Fichier | Contenu |
|---------|---------|
| [AGENTS.md](AGENTS.md) | Règles et conventions (notamment pour les agents IA) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, flux de données, modules |
| [docs/API.md](docs/API.md) | API du hub + contrat d'un serveur de jeu |
| [docs/HARDWARE.md](docs/HARDWARE.md) | Le plateau physique 7 colonnes |
| [docs/ESP32.md](docs/ESP32.md) | Protocole ESP32 + code Arduino |
| [docs/GAMES.md](docs/GAMES.md) | Guide de création d'un jeu |

---

## 📦 Dépendances

| Package | Usage |
|---------|-------|
| `express` | Serveur HTTP + fichiers statiques (hub et jeux) |
| `ws` | WebSocket (hub et jeux) |
| `serialport` | Lecture port série USB ESP32 (capteurs IR) |
| `@serialport/parser-readline` | Parsing des lignes `RAW:…` |
| `http-proxy-middleware` | Proxy HTTP/WS du hub vers le jeu actif |

Frontend : aucune dépendance npm (Google Fonts en CDN, Web APIs natives).

---

## 📄 Licence

MIT.
# basketgame
