# API — Plateforme BasketGame

> 📖 **À LIRE** avant de modifier les endpoints du hub ou le contrat d'un serveur de jeu.
> 🔄 **À METTRE À JOUR** après tout changement d'endpoint, de message WebSocket ou de schéma JSON.
> Voir la règle complète dans [`AGENTS.md`](../AGENTS.md#-règle-obligatoire--documentation-en-continu).

Les messages WebSocket **propres à un jeu** sont documentés dans `games/<id>/docs/API.md`.

---

## 1. API du hub (port 3000)

### `GET /api/health`

Santé du hub et état courant.

```json
{ "status": "ok", "activeGameId": "puissance4", "port": 3101, "clients": 2 }
```

> Note : le champ `status` reflète l'état du gestionnaire de jeu (`idle` quand aucun jeu n'est lancé). Le hub répond toujours, qu'un jeu soit actif ou non.

### `GET /api/games`

Liste des jeux découverts dans `games/`.

```json
{
  "success": true,
  "games": [
    {
      "id": "puissance4",
      "name": "Puissance 4",
      "description": "Alignez 4 jetons d'affilée…",
      "version": "1.0.0",
      "columns": 7,
      "players": { "min": 2, "max": 2 },
      "icon": "🟠",
      "accent": "#ff6b00",
      "controller": {
        "actions": [
          {
            "id": "reset-round",
            "label": "Nouvelle partie",
            "method": "POST",
            "path": "/api/reset",
            "style": "primary"
          }
        ]
      },
      "docs": "docs/README.md"
    }
  ]
}
```

### `GET /api/state`

État du hub + liste des jeux.

```json
{ "success": true, "status": "running", "activeGameId": "puissance4", "port": 3101, "games": [ ... ] }
```

### `POST /api/games/:id/start`

Lance un jeu (arrête le jeu en cours s'il y en a un). Réservé au contrôleur.

**Body optionnel (JSON)** — paramètres déclarés dans `game.config.json` → `controller.startOptions[]`.
Le hub valide les valeurs (type, min, max) puis les transmet au processus du jeu via `GAME_START_PARAMS`.

Exemple Plinko (2–5 joueurs) :

```bash
curl -X POST http://localhost:3000/api/games/plinko/start \
  -H 'Content-Type: application/json' \
  -d '{"playerCount": 4}'
```

**Roster de joueurs** — si le jeu déclare `controller.requiresPlayerRoster: true`,
le body doit aussi contenir `roster` : une liste **ordonnée** d'identifiants de
profils (index 0 = slot 1). Sa longueur doit valoir le nombre de joueurs
(`playerCount` si présent, sinon `players.min`). Le hub résout chaque profil et
injecte un roster **enrichi** (slot, pseudo, URLs des photos) dans `GAME_START_PARAMS`.

```bash
curl -X POST http://localhost:3000/api/games/puissance4/start \
  -H 'Content-Type: application/json' \
  -d '{"roster": ["<id-joueur-1>", "<id-joueur-2>"]}'
```

Réponse succès (roster enrichi) :

```json
{
  "success": true,
  "status": "running",
  "activeGameId": "puissance4",
  "port": 3101,
  "startParams": {
    "roster": [
      {
        "slot": 1,
        "profileId": "<id>",
        "pseudo": "Alice",
        "photos": {
          "idle": "/api/players/<id>/photos/idle",
          "win": "/api/players/<id>/photos/win",
          "lose": "/api/players/<id>/photos/lose"
        },
        "cutoutUrl": "/api/players/<id>/cutout"
      }
    ]
  }
}
```

> `cutoutUrl` vaut `null` si le profil n'a pas (encore) de tête détourée.

Jeux sans `startOptions` ni `requiresPlayerRoster` : body vide ou absent, comportement inchangé.

Erreurs :
- Jeu introuvable → `HTTP 404` `{ "success": false, "error": "GAME_NOT_FOUND" }`
- Paramètre invalide → `HTTP 400` `{ "success": false, "error": "INVALID_PLAYERCOUNT" }` ou `OUT_OF_RANGE_*`
- Roster mal formé (taille incorrecte, id manquant) → `HTTP 400` `INVALID_ROSTER`
- Profil en double dans le roster → `HTTP 400` `DUPLICATE_ROSTER`
- Profil introuvable → `HTTP 400` `ROSTER_PROFILE_NOT_FOUND`
- Profil sans ses 3 photos → `HTTP 400` `ROSTER_PHOTOS_INCOMPLETE`
- Échec du démarrage → `HTTP 500` `{ "success": false, "error": "..." }`

### `POST /api/games/stop`

Arrête le jeu actif.

```json
{ "success": true, "status": "idle", "activeGameId": null, "port": 3101 }
```

### `POST /api/games/action/:actionId`

**Contrôleur — action de jeu.** Exécute une action déclarée dans `game.config.json`
du jeu actif (`controller.actions[]`). Le hub relaie la requête vers le serveur du
jeu **sans logique de jeu** (même principe que `/api/trigger`).

Exemple Puissance 4 : `POST /api/games/action/reset-round` → relaie vers
`POST http://127.0.0.1:3101/api/reset`.

- Jeu actif + action valide → renvoie la réponse du jeu.
- Aucun jeu actif → `HTTP 503` `{ "success": false, "error": "NO_ACTIVE_GAME" }`.
- Action inconnue → `HTTP 404` `{ "success": false, "error": "ACTION_NOT_FOUND" }`.
- Jeu injoignable → `HTTP 502` `{ "success": false, "error": "GAME_UNREACHABLE" }`.

Les actions disponibles sont exposées dans `GET /api/games` et `HUB_STATE`, sous
`games[].controller.actions` (cf. [`docs/GAMES.md`](GAMES.md)).

### `POST /api/trigger`

**Entrée manuelle** (simulateur intégré au contrôleur : bouton **Simuler la balle** → 7 colonnes) ou tests HTTP.
En production, les détections ESP32 passent par le port série USB et le hub déclenche ce flux en interne.
Accepte le body JSON `{ "column": N }` ou la query string `?col=N` (N = 0 à 6).

- Jeu actif → renvoie la réponse du jeu (voir contrat ci-dessous).
- Aucun jeu actif → `HTTP 503` `{ "success": false, "error": "NO_ACTIVE_GAME" }`. En parallèle, le hub diffuse un message WebSocket `HUB_TRIGGER` à la télé (prévisualisation sur l'écran d'attente).
- Colonne invalide (hors 0–6) → `HTTP 400` `{ "success": false, "error": "INVALID_COLUMN" }`.
- Jeu injoignable → `HTTP 502` `{ "success": false, "error": "GAME_UNREACHABLE" }`.

### Proxy `/play/*`

Tout ce qui commence par `/play` (HTTP et WebSocket) est proxifié vers le serveur du jeu actif (préfixe `/play` retiré). Renvoie `503` si aucun jeu n'est actif. C'est ce que charge l'iframe de la télé.

### Profils joueurs (`/api/players`)

Profils persistés dans `data/players/` (pseudo + 3 photos carrées : `idle`, `win`, `lose`).
Servis par le hub afin d'être accessibles à la télé comme au contrôleur.

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/api/players` | Liste des profils (`photos` = booléens, `photoUrls` = URLs ou `null`, `hasCutout` = booléen, `cutoutUrl` = URL ou `null`) |
| `POST` | `/api/players` | Crée un profil `{ "pseudo": "..." }` |
| `GET` | `/api/players/:id` | Détail d'un profil |
| `PATCH` | `/api/players/:id` | Modifie le pseudo |
| `DELETE` | `/api/players/:id` | Supprime le profil et ses photos |
| `PUT` | `/api/players/:id/photos/:variant` | Envoie une photo (corps binaire JPEG, `variant` = `idle`\|`win`\|`lose`) |
| `GET` | `/api/players/:id/photos/:variant` | Sert la photo JPEG (cache court) |
| `PUT` | `/api/players/:id/cutout` | Envoie la tête détourée (corps binaire PNG transparent) |
| `GET` | `/api/players/:id/cutout` | Sert la tête détourée PNG (cache court) |

```bash
# Créer un joueur puis lui ajouter sa photo de profil
ID=$(curl -s -X POST http://localhost:3000/api/players \
  -H 'Content-Type: application/json' -d '{"pseudo":"Alice"}' | jq -r .player.id)
curl -X PUT "http://localhost:3000/api/players/$ID/photos/idle" \
  -H 'Content-Type: image/jpeg' --data-binary @idle.jpg
```

> La tête détourée (`cutout.png`, fond transparent) est générée automatiquement
> côté client lors de la capture de la photo `idle` (segmentation MediaPipe) et
> sert aux animations « têtes qui tombent » dans les jeux.

Erreurs : `PROFILE_NOT_FOUND` (404), `PSEUDO_REQUIRED` / `INVALID_VARIANT` / `EMPTY_PHOTO` (400), `PHOTO_NOT_FOUND` / `CUTOUT_NOT_FOUND` (404).

### Capteurs ESP32 (série USB)

Gérés par `hub/esp32SensorService.js`. Calibration et détection côté hub ; les détections déclenchent le même flux que `POST /api/trigger`.

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/api/sensors/status` | État capteurs (valeurs, seuils, baselines, `ratio`, `sensorOverrides`, `effectiveRatios`, port série, calibration) |
| `POST` | `/api/sensors/recalibrate` | Relance la calibration (5 s, sans balle) — `503` si port non connecté |
| `PATCH` / `POST` | `/api/sensors/threshold` | Modifie les seuils (persiste dans `data/sensors-config.json`, recalcule si calibré) |

Corps acceptés par `/api/sensors/threshold` :

| Corps JSON | Effet |
|------------|-------|
| `{ "percent": 55 }` ou `{ "ratio": 0.55 }` | Seuil **global** (10–90 %) |
| `{ "sensor": 2, "percent": 40 }` | Override absolu du capteur 3 (index `2`) |
| `{ "sensor": 2, "reset": true }` | Retour au seuil global pour ce capteur |
| `{ "resetAll": true }` | Efface tous les overrides individuels |

Erreurs : `THRESHOLD_REQUIRED`, `INVALID_THRESHOLD_RATIO`, `INVALID_SENSOR` (400).

### Pages

| Route | Contenu |
|-------|---------|
| `GET /` | Contrôleur (lobby) |
| `GET /tv` | Écran télé |
| `GET /players` | Gestion des joueurs (pseudo + photos) |
| `GET /sensors` | Dashboard capteurs IR (temps réel) |
| `GET /shared/*` | Client partagé (`shared/client/`) |

---

## 2. WebSocket de contrôle du hub (racine `ws://<hub>:3000`)

Utilisé par le contrôleur et la télé. À la connexion et à chaque changement d'état, le hub envoie :

| `type` | Données | Déclencheur |
|--------|---------|-------------|
| `HUB_STATE` | `status`, `activeGameId`, `port`, `games[]` | Connexion + démarrage/arrêt/crash d'un jeu |
| `HUB_TRIGGER` | `column` (0–6) | Trigger reçu alors qu'**aucun jeu n'est actif** (prévisualisation TV) |
| `SENSOR_UPDATE` | `values[]`, `states[]`, `counts[]`, `history[][]`, `thresholds[]`, `baselines[]`, `ratio`, `sensorOverrides`, `effectiveRatios`, `calibrating`, `port` | Lecture série ESP32 (~10 ms) |
| `SENSOR_EVENT` | `sensor` (0–6), `state` (bool) | Front détection / libération capteur |
| `SENSOR_CALIBRATION_START` | `duration` (s) | Début calibration |
| `SENSOR_CALIBRATION_PROGRESS` | `progress`, `elapsed`, `values[]` | Pendant calibration |
| `SENSOR_CALIBRATION_DONE` | `baselines[]`, `thresholds[]`, `ratio`, `sensorOverrides`, `effectiveRatios` | Calibration terminée |
| `SENSOR_THRESHOLD_CHANGED` | `sensor` (index ou `null` si global), `ratio`, `sensorOverrides`, `effectiveRatios`, `thresholds[]` | Seuil modifié (recalcul immédiat si calibré) |
| `SENSOR_SERIAL_STATUS` | `connected`, `port` ou `message` | Connexion / déconnexion port série |

```json
{
  "type": "HUB_STATE",
  "status": "running",
  "activeGameId": "puissance4",
  "port": 3101,
  "games": [ { "id": "puissance4", "name": "Puissance 4", "...": "..." } ]
}
```

Exemple `HUB_TRIGGER` (idle, déclenché par l'ESP32) :

```json
{ "type": "HUB_TRIGGER", "column": 3 }
```

La page `/tv` fait alors chuter un 🏀 dans la colonne correspondante sur l'écran d'attente.

---

## 3. Contrat standard d'un serveur de jeu

Tout serveur de jeu (lancé par le hub sur le port `GAME_PORT`) **doit** exposer :

| Endpoint | Rôle |
|----------|------|
| `POST /api/trigger` | Reçoit une colonne (`column` ou `col`) et joue un coup |
| `GET /api/state` | Retourne l'état complet du jeu |
| `POST /api/reset` | Réinitialise la manche en cours |
| `GET /api/health` | `{ "status": "ok", "game": "...", "clients": N }` |
| `WS /` | Envoie `INIT` à la connexion puis diffuse les événements du jeu |

`createGameServer()` fournit gratuitement `/api/health`, `/api/log`, le WebSocket (avec `INIT`), le service statique du jeu et de `/shared`. Le jeu n'écrit que ses routes `trigger`/`reset`/`state` et ses propres messages WebSocket.

### Réponse type de `POST /api/trigger` (exemple Puissance 4)

Coup valide :

```json
{ "success": true, "row": 5, "col": 3, "player": 1, "gameOver": false, "currentPlayer": 2 }
```

Coup invalide → `HTTP 422` `{ "success": false, "error": "COLUMN_FULL" }`.

> Les messages WebSocket diffusés par chaque jeu (ex. `TOKEN_PLACED`, `GAME_OVER`, `DRAW`, `RESET`, `TOKEN_ERROR` pour Puissance 4) sont décrits dans la doc du jeu : `games/<id>/docs/API.md`.
