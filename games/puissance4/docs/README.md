# Puissance 4 — Jeu BasketGame

> 📖 **À LIRE** avant de modifier `games/puissance4/server/*` ou `games/puissance4/public/*`.
> 🔄 **À METTRE À JOUR** après tout changement de règles, de constantes ou de comportement de ce jeu.
> Doc de la plateforme : [`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md). Messages WebSocket : [`API.md`](API.md).

---

## Objectif

Aligner **4 jetons** de sa couleur, horizontalement, verticalement ou en diagonale, sur une grille de **7 colonnes × 6 rangées**. Deux joueurs jouent à tour de rôle (orange = joueur 1, bleu cyan = joueur 2). Une balle qui tombe dans une colonne du plateau physique y dépose le jeton du joueur courant (gravité : il se pose sur la pile existante).

Les manches s'enchaînent : le **premier joueur à 5 victoires** remporte la **série**.

---

## Profils joueurs (roster)

Puissance 4 déclare `controller.requiresPlayerRoster` : avant de lancer la partie,
le contrôleur impose de choisir **2 profils** (créés sur `/players`, chacun avec ses
3 photos). Le hub transmet un `roster` enrichi (slot, pseudo, URLs des photos) que le
serveur range dans `state.roster` (voir [`API.md`](API.md)).

Côté télé, le module partagé `window.PlayerFaces` affiche la bonne photo selon le moment :

| Moment | Photo utilisée |
|--------|----------------|
| Badge joueur, tour en cours | `idle` |
| Manche gagnée (badge + portrait central + overlay de série) | `win` du gagnant |
| Manche perdue (badge du perdant) | `lose` |

À la victoire d'une manche et à la fin de série, le jeu déclenche aussi une **pluie
de têtes** du gagnant (`PlayerFaces.rainHeads`) : la tête détourée (PNG transparent,
`cutoutUrl` du roster) tombe en cascade sur la télé. Le portrait central de victoire
est affiché en taille `xxl` pour bien le voir sur grand écran.

Sans roster (lancement en ligne de commande sans `roster`), le jeu retombe sur les
jetons colorés et les libellés « Joueur Orange / Bleu » (et la pluie de têtes est
désactivée).

---

## Constantes

| Constante | Valeur | Fichier |
|-----------|--------|---------|
| `COLS` | 7 (= `PLATFORM_COLUMNS`) | `server/game.js` |
| `ROWS` | 6 | `server/game.js` |
| `WIN_LENGTH` | 4 | `server/game.js` |
| `SERIES_WIN_TARGET` | 5 | `server/game.js` |

> `COLS` vient de la contrainte matérielle (`shared/constants.js`). Si `ROWS` change, adapter aussi `grid-template-rows: repeat(6, 1fr)` dans `public/css/board.css`.

---

## Architecture du jeu

Le jeu **compose les modules partagés** plutôt que de réimplémenter la logique :

| Module partagé | Utilisation dans Puissance 4 |
|----------------|------------------------------|
| `shared/modules/grid7` (`Grid`) | Grille 7×6 + gravité (`drop`, `isFull`) |
| `shared/modules/turn-manager` (`TurnManager`) | Alternance joueur 1 / joueur 2 |
| `shared/modules/win-detector` (`findWinningLine`) | Détection des 4 alignés (4 axes) |
| `shared/modules/scoring` (`Scoring`) | Scores + persistance `server/scores.json` |
| `shared/modules/series` (`getSeriesWinner`) | Gagnant de la série (premier à 5) |

`server/game.js` (classe `Game`) expose : `dropToken(col)`, `resetRound()`, `resetAll()`, `getState()`, et les accesseurs `board`, `currentPlayer`, `scores`, `seriesWinner`.

`server/index.js` enregistre les routes via `createGameServer` et diffuse l'état en WebSocket.

---

## Contrôles depuis le contrôleur (PC / mobile)

Les actions de jeu (nouvelle manche, reset scores) sont disponibles **uniquement depuis le contrôleur** via `game.config.json` → `controller.actions`. Le hub relaie chaque action vers le serveur du jeu (`POST /api/games/action/:id`).

| Action | Route jeu | Effet |
|--------|-----------|-------|
| `reset-round` | `POST /api/reset` | Nouvelle manche (scores conservés) |
| `reset-scores` | `POST /api/reset-scores` | Reset total (scores + série) |

L'écran **télé** n'affiche aucun bouton : interface en lecture seule optimisée pour le grand écran.

---

## Interface télé (`public/`)

Servie sur la télé via le proxy `/play` du hub.

### Layout minimaliste

```
┌─────────────────────────────────────────────┐
│                                             │
│         Grille 7×6 pleine largeur         │
│         (hauteur max, sans débordement)     │
│                                             │
├─────────────────────────────────────────────┤
│  🟠 3                          2 🔵        │  ← HUD badges
└─────────────────────────────────────────────┘
```

- **Grille** : **7 colonnes égales sur toute la largeur de l'écran** (`repeat(7, 1fr)`), 6 rangées sur la hauteur utile. Les jetons restent circulaires (`100cqmin` centré dans chaque case) ; l'espace entre les cases (`--board-gap`) s'adapte à la largeur.
- **HUD** : cercle orange (gauche) et cercle bleu cyan (droite) avec le nombre de victoires ; le joueur actif est mis en évidence (badge « À TOI », agrandi, lueur colorée) tandis que l'autre est fortement atténué (grisé, réduit).
- **Bandeau de tour** : pilule « À TOI » + pseudo du joueur actif, centrée en bas de la grille, avec bordure et lueur orange ou cyan selon le joueur. La grille elle-même prend une bordure lumineuse de la couleur du joueur actif.
- **Animation de chute** : jeton flottant animé en CSS (`tokenColumnDrop`), durée 380–680 ms selon la hauteur. Son `Sounds.tokenLand()` à la fin (rebond).
- **Sons** : API partagée `window.Sounds` — victoire de manche `roundWin()`, série / podium `victory()`, match nul `draw()`. Catalogue : [`docs/SOUNDS.md`](../../../docs/SOUNDS.md).
- **Trainée lumineuse** : synchronisée frame par frame avec la balle — les rangées déjà traversées restent légèrement éclairées, la tête de lumière suit la balle sans la dépasser (centre de la balle ≥ milieu de la rangée). Flash court à l'atterrissage (`columnLandPulse`).
- **Effets de victoire de manche** : flash plein écran + confettis (pas de texte ni bouton sur la grille).
- **Fin de série (5 victoires)** : après 5 secondes (plateau visible avec les 4 alignés), bannière semi-transparente en haut de l'écran (« Champion de la série ») + confettis ; le plateau reste visible en dessous. Reset via le contrôleur.

Ordre de chargement des scripts (`public/index.html`) :

```
/shared/sound-engine.js → /shared/effects.js → js/board.js → js/players.js → js/ui.js → js/app.js
```

| Module | Global | Rôle |
|--------|--------|------|
| `sound-engine.js` (partagé) | `window.SoundEngine` | Moteur audio samples |
| `effects.js` (partagé) | `window.Confetti`, `window.Sounds` | Confettis, sons (voir `docs/SOUNDS.md`) |
| `board.js` | `window.Board` | Rendu de la grille, chute physique, flash colonne, shake erreur |
| `players.js` | `window.Players` | HUD badges, scores, tour actif |
| `ui.js` | `window.UI` | Flash + confettis victoire, écran série (5 manches) |
| `app.js` | `window.App` | Bootstrap, WebSocket, routage des événements |

`app.js` dérive ses URLs WebSocket du chemin de la page (`BASE`), pour fonctionner derrière `/play` comme en accès direct au port du jeu.

---

## Comportements particuliers

- **Reset de manche** (`POST /api/reset`) : conserve les scores. Refusé (`422 SERIES_OVER`) si la série est déjà terminée.
- **Reset total** (`POST /api/reset-scores`) : remet les scores à zéro et lève le blocage de série.
- **Fin de série** : à 5 victoires, les nouveaux coups sont refusés (`SERIES_OVER`) jusqu'à un reset total via le contrôleur.
- **Persistance** : les scores sont sauvegardés dans `server/scores.json` à chaque victoire (via le module `scoring`).
