/**
 * index.js — Serveur du jeu Puissance 4.
 *
 * Démarré comme processus enfant par le hub (port fourni via GAME_PORT).
 * Le boilerplate (Express, WS, statique, health, log) vient de
 * shared/server/createGameServer ; ce fichier n'enregistre que les routes
 * propres au jeu et relaie l'état via broadcast().
 */

const path = require('path');
const { createGameServer } = require('../../../shared/server/createGameServer');
const { reportFromRoster } = require('../../../shared/server/reportPlayerStats');
const { Game } = require('./game');

const PORT = process.env.GAME_PORT || process.env.PORT || 3101;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const game = new Game();

function recordPuissance4SeriesStats(seriesWinner) {
  if (!game.roster?.length || !seriesWinner) return;

  const w = Number(seriesWinner);
  reportFromRoster('puissance4', game.roster, {
    1: {
      result: w === 1 ? 'win' : 'loss',
      meta: { seriesScore: game.scores[1] },
    },
    2: {
      result: w === 2 ? 'win' : 'loss',
      meta: { seriesScore: game.scores[2] },
    },
  });
}

const { listen } = createGameServer({
  name: 'Puissance 4',
  publicDir: PUBLIC_DIR,
  getInitMessage: () => ({ type: 'INIT', state: game.getState() }),
  routes: (app, broadcast) => {
    /**
     * POST /api/trigger — Entrée ESP32 (relayée par le hub).
     * Body: { "column": 0-6 } ou query string ?col=3.
     */
    app.post('/api/trigger', (req, res) => {
      const col = parseInt(
        req.body?.column ?? req.body?.col ?? req.query?.col ?? req.query?.column,
        10
      );
      console.log(`[Puissance 4][API] Trigger reçu — colonne: ${col}`);

      if (Number.isNaN(col)) {
        return res
          .status(400)
          .json({ success: false, error: 'Paramètre "column" manquant ou invalide (0-6)' });
      }

      const result = game.dropToken(col);

      if (!result.success) {
        broadcast({ type: 'TOKEN_ERROR', error: result.error, col });
        return res.status(422).json({ success: false, error: result.error });
      }

      if (result.gameOver) {
        if (result.winner) {
          if (result.seriesWinner) {
            recordPuissance4SeriesStats(result.seriesWinner);
          }
          broadcast({
            type: 'GAME_OVER',
            col: result.col,
            row: result.row,
            player: result.player,
            winner: result.winner,
            winningCells: result.winningCells,
            scores: game.scores,
            seriesWinner: result.seriesWinner || null,
            board: game.board,
          });
        } else if (result.isDraw) {
          broadcast({
            type: 'DRAW',
            col: result.col,
            row: result.row,
            player: result.player,
            board: game.board,
          });
        }
      } else {
        broadcast({
          type: 'TOKEN_PLACED',
          col: result.col,
          row: result.row,
          player: result.player,
          currentPlayer: result.currentPlayer,
          board: game.board,
          moveCount: game.moveCount,
        });
      }

      res.json({ success: true, ...result });
    });

    /**
     * POST /api/reset — Nouvelle manche (scores conservés).
     */
    app.post('/api/reset', (req, res) => {
      if (game.seriesWinner) {
        return res.status(422).json({ success: false, error: 'SERIES_OVER' });
      }
      game.resetRound();
      console.log('[Puissance 4][API] Manche réinitialisée');
      broadcast({
        type: 'RESET',
        board: game.board,
        currentPlayer: game.currentPlayer,
        scores: game.scores,
        seriesWinner: game.seriesWinner,
      });
      res.json({ success: true, state: game.getState() });
    });

    /**
     * POST /api/reset-scores — Reset total (scores remis à zéro).
     */
    app.post('/api/reset-scores', (req, res) => {
      game.resetAll();
      console.log('[Puissance 4][API] Scores réinitialisés');
      broadcast({
        type: 'RESET',
        board: game.board,
        currentPlayer: game.currentPlayer,
        scores: game.scores,
        seriesWinner: game.seriesWinner,
      });
      res.json({ success: true, state: game.getState() });
    });

    /**
     * GET /api/state — État courant (debug / reconnexion).
     */
    app.get('/api/state', (req, res) => {
      res.json({ success: true, state: game.getState() });
    });
  },
});

listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       🟠🔵  PUISSANCE 4 — Jeu actif          ║');
  console.log(`║   HTTP + WS  →  http://0.0.0.0:${PORT}          ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
