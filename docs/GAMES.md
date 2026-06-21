# Créer un nouveau jeu

> 📖 **À LIRE** avant d'ajouter un jeu ou de modifier le schéma `game.config.json`.
> 🔄 **À METTRE À JOUR** si la structure d'un jeu ou le schéma de config change.

Ajouter un jeu ne nécessite **aucune modification du hub**. Il suffit de créer un dossier dans `games/` avec la bonne structure ; le hub le découvre automatiquement au démarrage.

---

## 1. Structure d'un jeu

```
games/mon-jeu/
├── game.config.json     ← métadonnées + point d'entrée serveur (OBLIGATOIRE)
├── docs/                ← documentation du jeu (OBLIGATOIRE)
│   ├── README.md        ← règles, objectif, constantes
│   └── API.md           ← messages WebSocket propres au jeu
├── server/
│   ├── index.js         ← routes du jeu (via createGameServer)
│   └── game.js          ← logique (compose shared/modules/*)
└── public/              ← interface graphique (servie sur la télé)
    ├── index.html
    ├── css/
    └── js/
```

---

## 2. `game.config.json`

```json
{
  "id": "mon-jeu",
  "name": "Mon Jeu",
  "description": "Une phrase qui explique le but du jeu.",
  "version": "1.0.0",
  "columns": 7,
  "players": { "min": 1, "max": 4 },
  "icon": "🎯",
  "accent": "#2ed573",
  "server": { "entry": "server/index.js" },
  "controller": {
    "actions": [
      {
        "id": "reset-round",
        "label": "Nouvelle partie",
        "method": "POST",
        "path": "/api/reset",
        "style": "primary"
      },
      {
        "id": "reset-scores",
        "label": "Réinitialiser les scores",
        "method": "POST",
        "path": "/api/reset-scores",
        "style": "danger",
        "confirm": "Remettre tous les scores à zéro ?"
      }
    ]
  },
  "docs": "docs/README.md"
}
```

| Champ | Obligatoire | Rôle |
|-------|:----------:|------|
| `id` | ✅ | Identifiant unique (= nom du dossier conseillé) |
| `name` | ✅ | Nom affiché sur le contrôleur |
| `server.entry` | ✅ | Chemin du serveur, relatif au dossier du jeu |
| `description` | — | Texte sur la carte du contrôleur |
| `columns` | — | Information d'affichage (toujours 7 sur ce plateau) |
| `players` | — | `{ min, max }` affiché sur la carte |
| `icon`, `accent` | — | Présentation sur le contrôleur |
| `controller.startOptions` | — | Paramètres demandés au lancement (voir ci-dessous) |
| `controller.actions` | — | Boutons affichés sur le contrôleur quand le jeu tourne (voir ci-dessous) |
| `docs` | — | Chemin de la doc principale du jeu |

### Section `controller.startOptions` — paramètres au lancement

Quand un jeu déclare des `startOptions`, le contrôleur affiche un panneau de configuration
avant le démarrage. Le hub valide le body de `POST /api/games/:id/start` et transmet les
valeurs au serveur du jeu via la variable d'environnement `GAME_START_PARAMS` (JSON).

| Champ option | Obligatoire | Rôle |
|--------------|:----------:|------|
| `id` | ✅ | Clé dans le body JSON (ex. `playerCount`) |
| `type` | ✅ | `number` (v1) |
| `label` | ✅ | Libellé affiché sur le contrôleur |
| `min` | — | Borne basse (défaut `0`) |
| `max` | — | Borne haute (défaut `100`) |
| `default` | — | Valeur par défaut |

Exemple (Plinko) :

```json
"controller": {
  "startOptions": [
    {
      "id": "playerCount",
      "type": "number",
      "label": "Nombre de joueurs",
      "min": 2,
      "max": 5,
      "default": 2
    }
  ],
  "actions": [ ... ]
}
```

Côté serveur de jeu :

```js
const { parseStartParams } = require('../../../shared/server/parseStartParams');
const params = parseStartParams(); // ex. { playerCount: 4 }
```

### Section `controller.requiresPlayerRoster` — choix des joueurs

Ajouter `"requiresPlayerRoster": true` dans `controller` pour qu'un jeu **impose**
de choisir des profils joueurs (pseudo + 3 photos) avant le lancement.

```json
"controller": {
  "requiresPlayerRoster": true,
  "startOptions": [ ... ],
  "actions": [ ... ]
}
```

- Le contrôleur affiche un emplacement par joueur. Le nombre d'emplacements vaut
  `playerCount` (si une `startOption` du même nom existe) sinon `players.min`.
- Seuls les profils ayant leurs **3 photos** sont sélectionnables ; pas de doublon.
- Le hub valide puis injecte un `roster` enrichi (slot, pseudo, URLs des photos)
  dans `GAME_START_PARAMS`.

Côté serveur de jeu :

```js
const { parseRoster } = require('../../../shared/server/parseRoster');
this.roster = parseRoster(); // [{ slot, profileId, pseudo, photos: { idle, win, lose } }]
// puis l'exposer dans getState() pour l'interface
```

Côté interface (télé), charger `/shared/player-faces.js` + `/shared/player-faces.css`,
appeler `PlayerFaces.setRoster(state.roster)` puis utiliser `PlayerFaces` pour afficher
la bonne photo (`idle` / `win` / `lose`) selon le contexte.

### Section `controller.actions` — boutons du contrôleur

Quand un jeu est **en cours**, le contrôleur (`/`) affiche les boutons définis ici.
Chaque action est relayée par le hub vers le serveur du jeu (`POST /api/games/action/:id`).

| Champ action | Obligatoire | Rôle |
|--------------|:----------:|------|
| `id` | ✅ | Identifiant unique (utilisé dans l'URL hub) |
| `label` | ✅ | Texte du bouton |
| `path` | ✅ | Route API du **serveur du jeu** (doit commencer par `/api/`) |
| `method` | — | `GET` ou `POST` (défaut : `POST`) |
| `style` | — | `primary`, `danger` ou `ghost` (défaut : `primary`) |
| `confirm` | — | Message de confirmation avant exécution |
| `icon` | — | Emoji ou préfixe affiché avant le label |

Le **serveur du jeu** doit implémenter les routes référencées (`/api/reset`, etc.).
Le hub ne contient aucune logique de jeu — il ne fait que relayer.

---

## 3. Serveur du jeu — utiliser la factory partagée

```js
// games/mon-jeu/server/index.js
const path = require('path');
const { createGameServer } = require('../../../shared/server/createGameServer');
const { Game } = require('./game');

const PORT = process.env.GAME_PORT || process.env.PORT || 3101;
const game = new Game();

const { listen } = createGameServer({
  name: 'Mon Jeu',
  publicDir: path.join(__dirname, '..', 'public'),
  getInitMessage: () => ({ type: 'INIT', state: game.getState() }),
  routes: (app, broadcast) => {
    app.post('/api/trigger', (req, res) => {
      const col = parseInt(req.body?.column ?? req.body?.col ?? req.query?.col, 10);
      const result = game.play(col);
      broadcast({ type: 'STATE', state: game.getState() });
      res.json({ success: true, ...result });
    });

    app.post('/api/reset', (req, res) => {
      game.reset();
      broadcast({ type: 'RESET', state: game.getState() });
      res.json({ success: true });
    });

    app.get('/api/state', (req, res) => res.json({ success: true, state: game.getState() }));
  },
});

listen(PORT, () => console.log(`[Mon Jeu] prêt sur ${PORT}`));
```

`createGameServer` fournit déjà : Express + CORS + JSON, le WebSocket (avec `INIT`), `/api/health`, `/api/log`, le service statique du jeu et du client partagé sous `/shared`. Respecter le [contrat standard d'un serveur de jeu](API.md#3-contrat-standard-dun-serveur-de-jeu).

---

## 4. Logique du jeu — COMPOSER les modules partagés

> ⚠️ **Règle prioritaire** : avant d'écrire de la logique, vérifier [`shared/modules/`](../shared/modules). Réutiliser ou étendre un module existant ; ne jamais redupliquer une mécanique.

```js
// games/mon-jeu/server/game.js
const { Grid } = require('../../../shared/modules/grid7');
const { TurnManager } = require('../../../shared/modules/turn-manager');
const { findWinningLine } = require('../../../shared/modules/win-detector');
const { Scoring } = require('../../../shared/modules/scoring');
```

| Besoin | Module à utiliser |
|--------|-------------------|
| Grille à colonnes + gravité | `grid7` (`Grid`) |
| Alternance des joueurs | `turn-manager` (`TurnManager`) |
| Scores + persistance | `scoring` (`Scoring`) |
| Alignement de N jetons | `win-detector` (`findWinningLine`) |
| Série de manches | `series` (`getSeriesWinner`) |

Si ton jeu introduit une mécanique réutilisable absente de `shared/modules/`, **crée un nouveau module** dans `shared/modules/` et documente-le dans [`ARCHITECTURE.md`](ARCHITECTURE.md) + [`AGENTS.md`](../AGENTS.md).

---

## 5. Interface graphique (`public/`)

- Pages servies sur la télé via le proxy `/play`.
- **Chemins relatifs** : dériver les URLs API/WS du chemin de la page pour fonctionner derrière `/play` :

```js
const BASE = window.location.pathname.replace(/\/[^/]*$/, '');
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${BASE}`;
const api = (p) => `${BASE}${p}`;
```

- Réutiliser le client partagé : `<script src="shared/effects.js"></script>` (sons, confettis) et `shared/column-layout.css` si la grille 7 colonnes convient.

---

## 6. Documentation du jeu (`docs/`) — OBLIGATOIRE

Créer au minimum :

- `games/mon-jeu/docs/README.md` — règles, objectif, constantes, particularités.
- `games/mon-jeu/docs/API.md` — les messages WebSocket diffusés par ce jeu.

Toute modification ultérieure du jeu **doit** mettre à jour cette doc locale.

---

## 7. Vérifier

```bash
npm start                                   # relancer le hub
curl http://localhost:3000/api/games        # mon-jeu doit apparaître
curl -X POST http://localhost:3000/api/games/mon-jeu/start
```

Le jeu doit s'afficher sur `/tv` et réagir aux triggers.
