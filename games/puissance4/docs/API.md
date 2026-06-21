# API & WebSocket — Puissance 4

> 📖 **À LIRE** avant de modifier les routes ou les messages WebSocket du jeu.
> 🔄 **À METTRE À JOUR** après tout changement d'endpoint ou de message diffusé.
> Contrat standard d'un serveur de jeu : [`../../../docs/API.md`](../../../docs/API.md).

En usage normal, ces endpoints sont atteints **à travers le hub** : l'ESP32 poste sur `http://<hub>:3000/api/trigger` (le hub relaie), et l'interface du jeu (servie sous `/play`) appelle les routes en chemin relatif.

---

## Endpoints REST

| Endpoint | Body / Query | Rôle |
|----------|--------------|------|
| `POST /api/trigger` | `{ "column": 0-6 }` ou `?col=N` | Pose un jeton dans la colonne |
| `POST /api/reset` | — | Nouvelle manche (scores conservés) |
| `POST /api/reset-scores` | — | Reset total (scores à zéro) |
| `GET /api/state` | — | État complet du jeu |
| `GET /api/health` | — | `{ "status": "ok", "game": "Puissance 4", "clients": N }` (fourni par la factory) |

### Réponse de `POST /api/trigger`

Coup valide (partie en cours) :

```json
{ "success": true, "row": 5, "col": 3, "player": 1, "gameOver": false, "currentPlayer": 2 }
```

Coup gagnant :

```json
{
  "success": true, "row": 2, "col": 0, "player": 1,
  "gameOver": true, "winner": 1,
  "winningCells": [[2,0],[3,0],[4,0],[5,0]],
  "seriesWinner": null
}
```

Coup invalide → `HTTP 422` :

```json
{ "success": false, "error": "COLUMN_FULL" }
```

Codes d'erreur : `INVALID_COLUMN`, `COLUMN_FULL`, `GAME_OVER`, `SERIES_OVER`.

---

## Messages WebSocket (serveur du jeu → interface)

Tous les messages ont la forme `{ "type": "...", ...payload }`.

| `type` | Déclencheur | Données clés |
|--------|-------------|--------------|
| `INIT` | Connexion WebSocket | `state` (état complet) |
| `TOKEN_PLACED` | Coup valide | `col`, `row`, `player`, `currentPlayer`, `board`, `moveCount` |
| `GAME_OVER` | Victoire (4 alignés) | `winner`, `winningCells`, `scores`, `seriesWinner`, `board` |
| `DRAW` | Grille pleine sans gagnant | `col`, `row`, `player`, `board` |
| `RESET` | Reset manche / scores | `board`, `currentPlayer`, `scores`, `seriesWinner` |
| `TOKEN_ERROR` | Coup invalide | `error`, `col` |

### Forme de `state` (INIT / `GET /api/state`)

```json
{
  "board": [[null, "..."], "..."],
  "currentPlayer": 1,
  "winner": null,
  "winningCells": [],
  "isDraw": false,
  "isOver": false,
  "moveCount": 0,
  "scores": { "1": 0, "2": 0 },
  "seriesWinner": null,
  "lastMove": null,
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
```

`board[row][col]` vaut `null`, `1` (orange) ou `2` (bleu cyan). La rangée `0` est en haut, la rangée `5` en bas (gravité).

`roster` (tableau, slot 1 = joueur orange, slot 2 = joueur bleu) provient des profils choisis sur le contrôleur. Vide `[]` si le jeu a été lancé sans roster (repli sur les jetons colorés et « Joueur N »). `cutoutUrl` (tête détourée PNG transparent) vaut `null` si absente. L'interface choisit la photo `idle` sur les badges, `win` pour le gagnant (badge + portrait `xxl` + overlay de série) et `lose` pour le perdant ; le gagnant déclenche une pluie de têtes (`cutoutUrl`).

---

## Ajouter un message WebSocket

1. Diffuser depuis `server/index.js` via `broadcast({ type: 'MON_EVENT', ... })`.
2. Ajouter un `case 'MON_EVENT':` dans le `switch` de `onMessage()` dans `public/js/app.js`.
3. Implémenter le handler correspondant.
4. Documenter le message dans le tableau ci-dessus.
