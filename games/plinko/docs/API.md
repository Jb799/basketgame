# Plinko — API WebSocket et REST

## Endpoints REST

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/trigger` | Lance une chute (`column` / `col` : 0–6). En phase mini-jeu, vise une colonne du mini-jeu. |
| `GET` | `/api/state` | État complet |
| `POST` | `/api/reset` | Nouvelle partie (même nombre de joueurs) |

### Réponse trigger (succès — chute normale)

```json
{
  "success": true,
  "droppingPlayer": 1,
  "entryCol": 3,
  "path": [{ "x": 0.5, "y": 0.03, "bounce": null }, { "x": 0.48, "y": 0.11, "pegId": 2, "bounce": "left" }],
  "slotIndex": 2,
  "slot": { "type": "coin", "value": 15, "width": 12, "iconCount": 2 },
  "delta": 15,
  "appliedDelta": 15,
  "slotDelta": 15,
  "baseSlotDelta": 15,
  "onFireAtLand": false,
  "multiplier": 1,
  "triggersMinigame": false,
  "phase": "resolving",
  "advanceKind": "turn_change",
  "scores": { "1": 15, "2": 0 }
}
```

### Réponse trigger (case couteau / voleur)

```json
{
  "success": true,
  "slot": { "type": "knife", "value": 0 },
  "triggersMinigame": true,
  "minigameKind": "knife",
  "appliedDelta": 0,
  "phase": "resolving",
  "advanceKind": null,
  "minigameStart": {
    "type": "MINIGAME_START",
    "kind": "knife",
    "activePlayer": 1,
    "columns": [
      { "col": 0, "type": "hole" },
      { "col": 1, "type": "player", "player": 2 }
    ],
    "seed": 123457
  }
}
```

`TURN_CHANGE`, `ROUND_END` ou `GAME_OVER` sont envoyés **6500 ms après** une chute normale, ou **5500 ms après** `MINIGAME_RESULT`.

`MINIGAME_START` est diffusé **5500 ms après** `BALL_DROP` sur case couteau/voleur/or (phase `resolving` jusqu'à cet armement).

`appliedDelta` = pièces réellement gagnées/perdues (plancher à 0). `slotDelta` / `delta` = valeur appliquée (déjà ×2 si `onFireAtLand`). `baseSlotDelta` = valeur brute de la case avant multiplicateur feu.

| Champ | Description |
|-------|-------------|
| `onFireAtLand` | `true` si la balle atterrit encore en feu (≥3 même sens sans changement) |
| `multiplier` | `2` si feu actif à l'atterrissage et case non neutre/spéciale, sinon `1` |
| `triggersMinigame` | `true` si case `knife`, `thief` ou `golden` — déclenche `MINIGAME_START` |
| `minigameSkipped` | `true` si case couteau/voleur mais aucun adversaire n'a de pièces — pas de mini-jeu (jamais pour `golden`) |
| `minigameKind` | `"knife"`, `"thief"` ou `"golden"` si mini-jeu (ou case d'origine si annulé) |

### Erreurs trigger

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_COLUMN` | 422 | Colonne hors 0–6 |
| `RESOLVING` | 422 | Résultat ou animation en cours (~6,5 s) |
| `GAME_OVER` | 422 | Partie terminée |
| `ROUND_SUMMARY` | 422 | Pause entre deux tours (~4 s) |
| `BOARD_TRANSITION` | 422 | Nouveau plateau en glissement (~2,5 s) |
| `MINIGAME_ACTIVE` | 422 | Chute principale refusée pendant mini-jeu (utiliser trigger colonne) |
| `NOT_MINIGAME` | 422 | Trigger mini-jeu hors phase `minigame_*` |

---

## Messages WebSocket

Format : `{ "type": "SCREAMING_SNAKE_CASE", ... }`

| `type` | Déclencheur | Données clés |
|--------|-------------|--------------|
| `INIT` | Connexion WS | `state` |
| `BOARD_READY` | Nouveau plateau / reset | `board`, `round`, `seed`, `state` |
| `BALL_DROP` | Trigger valide (plateau) | `droppingPlayer`, `entryCol`, `path`, `slot`, `triggersMinigame`, `minigameStart`, `advanceKind` |
| `MINIGAME_START` | ~5,5 s après `BALL_DROP` knife/thief/golden (armement ; données aussi dans `BALL_DROP.minigameStart`) | `kind`, `activePlayer`, `columns` (couteau/voleur) ou `coinReward`, `periodMs`, `movementStartedAt` (or), `seed` |
| `MINIGAME_RESULT` | Trigger valide en phase mini-jeu | `kind`, `targetCol`, `targetType`, `hit`, `goldenCol`, `coinReward` (or), `targetPlayer`, `rolledAmount`, `resolvedAmount`, `appliedToVictim`, `appliedToAttacker`, `scores`, `advanceKind` |
| `TURN_CHANGE` | ~5,8 s après chute ou ~9 s après mini-jeu | `currentPlayer`, `playersPlayedThisRound`, `scores` |
| `ROUND_END` | idem (dernier joueur du tour) | `round`, `roundScores`, `scores`, `stats`, `totalRounds` |
| `GAME_OVER` | idem (dernier coup) | `ranking`, `isTie`, `tiedPlayers`, `winners`, `stats`, `scores`, `podium` |
| `DROP_ERROR` | Trigger invalide | `error`, `col` |
| `RESET` | Reset manuel | `state` |
| `STRUCTURE_IMPACT` | Impact structure physique (hub → `POST /api/impact`) | `sensors[]`, `drops[]`, `magnitude`, `peakDrop`, `sensorCount`, `timestamp` — **cosmétique uniquement** (`StructureImpact.play`) |

### `STRUCTURE_IMPACT` (cosmétique)

Diffusé par `createGameServer` lorsqu'un impact structure est relayé par le hub. Aucun effet sur les pièces, tours ou plateau. Voir `shared/client/structure-impact.js`.

### Séquence mini-jeu (panier d'or)

```
BALL_DROP  { slot: { type: "golden" }, triggersMinigame: true, minigameStart: { kind: "golden", coinReward: 75, periodMs: 9000 } }
MINIGAME_START { kind: "golden", coinReward: 75, periodMs: 9000, movementStartedAt: 1710000000000 }
  … joueur tire colonne 3 alors que le panier est en colonne 3 …
MINIGAME_RESULT { kind: "golden", targetCol: 3, goldenCol: 3, hit: true, coinReward: 75, appliedToAttacker: 75, targetType: "golden" }
  … 5500 ms …
  TURN_CHANGE { currentPlayer: 2 }
```

### Séquence mini-jeu (couteau)

```
BALL_DROP  { slot: { type: "knife" }, triggersMinigame: true, minigameStart: { kind: "knife", columns: [...] } }
MINIGAME_START { kind: "knife", activePlayer: 1, columns: [...] }  // optionnel, même payload
  … joueur tire colonne 3 …
MINIGAME_RESULT { targetCol: 3, targetType: "player", targetPlayer: 2, rolledAmount: 12, appliedToVictim: -12, appliedToAttacker: 0 }
  … 5500 ms …
  TURN_CHANGE { currentPlayer: 2 }
```

### Séquence typique (2 joueurs)

```
BALL_DROP  { droppingPlayer: 1, advanceKind: "turn_change" }
  … 3600 ms …
  TURN_CHANGE { currentPlayer: 2 }
  BALL_DROP  { droppingPlayer: 2, advanceKind: "round_end" }
  … 3600 ms …
  ROUND_END  { round: 1 }
  … 4000 ms …
BOARD_READY { round: 2, board: {...} }
```

### Forme de `state`

```json
{
  "phase": "playing",
  "round": 1,
  "totalRounds": 5,
  "currentPlayer": 1,
  "playerCount": 3,
  "players": [1, 2, 3],
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
  ],
  "playersPlayedThisRound": 0,
  "scores": { "1": 0, "2": 0, "3": 0 },
  "board": { "seed": 123456, "slots": [{ "type": "coin", "value": 10, "width": 14 }] },
  "minigame": null,
  "stats": {
    "1": {
      "drops": 0,
      "bombsHit": 0,
      "coinsWon": 0,
      "coinsLost": 0,
      "bestDrop": 0,
      "worstDrop": 0,
      "neutralHits": 0,
      "knivesHit": 0,
      "thievesHit": 0,
      "goldenHits": 0,
      "minigameHits": 0,
      "minigameCoinsTaken": 0,
      "minigameCoinsStolen": 0,
      "goldenBasketsHit": 0
    }
  }
}
```

En phase mini-jeu, `minigame` contient `{ kind, activePlayer, seed, columns }` (couteau/voleur) ou `{ kind, activePlayer, seed, coinReward, periodMs, columnCount, movementStartedAt }` (or).

`roster` (tableau, slot N = joueur N) provient des profils choisis sur le contrôleur
(`controller.optionalPlayerRoster`). Vide `[]` si lancé sans profil — avatars initiales par défaut. `cutoutUrl` (tête
détourée PNG transparent) vaut `null` si absente. L'interface choisit `idle` sur les
onglets, `win`/`lose` lors des variations de score et des vols, `win` pour le 1er du podium
et `lose` pour le dernier ; le vainqueur déclenche une pluie de têtes (photo `win`).
En cas d'égalité (`isTie: true`), pas de vainqueur ni de pluie de têtes.
Voir [`README.md`](README.md).

### `advanceKind` (dans `BALL_DROP` ou `MINIGAME_RESULT`)

- `turn_change` — joueur suivant, même plateau (suivi de `TURN_CHANGE`)
- `round_end` — fin du tour (suivi de `ROUND_END` puis `BOARD_READY`)
- `game_over` — fin de partie (suivi de `GAME_OVER`)

Absent dans `BALL_DROP` si `triggersMinigame: true` (calculé après le mini-jeu).

### `MINIGAME_RESULT` — champs

| Champ | Description |
|-------|-------------|
| `targetCol` | Colonne visée (0–6) |
| `targetType` | `"hole"`, `"player"` ou `"golden"` |
| `hit` | `true` si panier d'or touché (kind `golden`), absent sinon |
| `goldenCol` | Colonne du panier au moment du tir (kind `golden`) |
| `coinReward` | Montant affiché sur le panier (50–100, kind `golden`) |
| `targetPlayer` | Numéro joueur victime, ou `null` si trou |
| `rolledPercent` | Pourcentage tiré (5, 10, 15, 20 ou 25), 0 si trou |
| `rolledAmount` | Montant en pièces calculé à partir du % et du solde victime, 0 si trou |
| `resolvedAmount` | Montant réellement appliqué (vol ou dégâts), ≤ solde victime |
| `appliedToVictim` | Delta réel sur la victime (≤ 0) |
| `appliedToAttacker` | Pièces gagnées par le lanceur (voleur : égal à `resolvedAmount`) |
