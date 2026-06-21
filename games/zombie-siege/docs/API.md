# Siège Zombie — API WebSocket et HTTP

> Contrat du serveur de jeu `games/zombie-siege/server/`. Le hub proxifie les routes sous `/play` et relaye les triggers ESP32 vers `POST /api/trigger`.

## Endpoints HTTP

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/trigger` | Tir dans une colonne (`column` / `col` body ou query, 0–6) |
| `POST` | `/api/reset` | Nouvelle partie |
| `POST` | `/api/reset-scores` | Remise à zéro du TOP score |
| `GET` | `/api/state` | État complet |
| `GET` | `/api/health` | Santé (fourni par `createGameServer`) |

### `POST /api/trigger`

**Tir accepté (200)** — bombe lancée (résolution à l'impact ~620 ms) :

```json
{
  "success": true,
  "col": 3,
  "shotId": 12,
  "pending": true
}
```

**Erreur (422)** — partie terminée, pause entre vagues ou colonne invalide :

```json
{ "success": false, "error": "Partie terminée" }
```

## Messages WebSocket

Convention : champ `type` en `SCREAMING_SNAKE_CASE`.

| `type` | Déclencheur | Payload |
|--------|-------------|---------|
| `INIT` | Connexion WS | `state`, `waveStart: { wave, config }` |
| `STATE` | Tick (montée zombies) | `state` |
| `ZOMBIE_SPAWN` | Nouveau zombie | `id`, `col`, `row`, `state` |
| `SHOOT_FIRE` | Trigger accepté (t=0) | `col`, `shotId`, `impactMs` |
| `SHOT_RESULT` | Impact résolu (t=`impactMs`) | `shotId`, `col`, `hit`, puis si `hit` : `zombieId`, `row`, `points`, `score`, et toujours `state` |
| `SHOOT_ERROR` | Tir refusé (phase) | `error`, `col` |
| `BREACH` | Zombie au sommet | `id`, `col`, `livesLeft`, `state`, `gameOver?` |
| `WAVE_START` | Début de vague | `wave`, `config`, `state` |
| `WAVE_COMPLETE` | Vague terminée | `wave`, `bonus`, `score`, `state` |
| `GAME_OVER` | 0 vies | `score`, `highScore`, `wave`, `isNewRecord`, `state` |
| `RESET` | Reset manuel | `state` |

### Objet `state`

```json
{
  "phase": "playing",
  "wave": 1,
  "score": 0,
  "lives": 3,
  "highScore": 0,
  "bestWave": 0,
  "waveConfig": {
    "totalZombies": 6,
    "spawnIntervalMs": 4150,
    "climbIntervalMs": 2620,
    "scorePerKill": 125,
    "waveClearBonus": 200
  },
  "zombies": [{ "id": 1, "col": 3, "row": 7 }],
  "spawnRemaining": 5,
  "rows": 10,
  "cols": 7,
  "startLives": 3
}
```

Phases : `playing`, `wave_break`, `game_over`.

### Exemple séquence

```
SHOOT_FIRE → (chute 💣, THROW 140 ms + FALL 480 ms) → SHOT_RESULT { hit: true }  (zombie présent à l'impact)
SHOOT_FIRE → (chute 💣)                              → SHOT_RESULT { hit: false } (colonne vide à l'impact)
```

`impactMs = THROW_MS + FALL_MS` (constantes partagées dans `server/game.js`). Le client (`shots.js`) anime la bombe sur exactement cette durée et bufferise le `SHOT_RESULT` jusqu'à la frame d'impact, garantissant que l'explosion et la tache verte tombent sur le zombie.

**Exemple `SHOT_RESULT` (touche) :**

```json
{
  "type": "SHOT_RESULT",
  "shotId": 12,
  "col": 3,
  "hit": true,
  "zombieId": 5,
  "row": 4,
  "points": 125,
  "score": 450,
  "state": { "...": "..." }
}
```

**Exemple `SHOT_RESULT` (raté) :**

```json
{ "type": "SHOT_RESULT", "shotId": 12, "col": 3, "hit": false, "state": { "...": "..." } }
```

Un tir anticipé (« pre-shot ») est possible : la bombe part dans une colonne vide et tue le zombie le plus haut si celui-ci entre dans la colonne avant l'impact.

## Persistance

Fichier `server/scores.json` :

```json
{
  "highScore": 3400,
  "bestWave": 8
}
```

Mis à jour automatiquement en `GAME_OVER` si record battu.
