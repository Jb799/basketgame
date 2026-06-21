/**
 * index.js — Serveur Siège Zombie.
 */

const path = require('path');
const { createGameServer } = require('../../../shared/server/createGameServer');
const { Game, TICK_MS } = require('./game');

const PORT = process.env.GAME_PORT || process.env.PORT || 3101;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const game = new Game();
let tickInterval = null;
const impactTimers = new Map();

function parseCol(req) {
  return parseInt(
    req.body?.column ?? req.body?.col ?? req.query?.col ?? req.query?.column,
    10
  );
}

function clearImpactTimers() {
  for (const timer of impactTimers.values()) clearTimeout(timer);
  impactTimers.clear();
}

function scheduleImpact(broadcast, col, shotId, impactMs) {
  const timer = setTimeout(() => {
    impactTimers.delete(shotId);
    const result = game.resolveImpact(col);

    if (result.hit) {
      broadcast({
        type: 'SHOT_RESULT',
        shotId,
        col,
        hit: true,
        zombieId: result.zombie.id,
        row: result.zombie.row,
        points: result.points,
        score: result.score,
        state: game.getState(),
      });
    } else {
      broadcast({
        type: 'SHOT_RESULT',
        shotId,
        col,
        hit: false,
        state: game.getState(),
      });
    }
  }, impactMs);

  impactTimers.set(shotId, timer);
}

function startTickLoop(broadcast) {
  stopTickLoop();
  tickInterval = setInterval(() => {
    const events = game.tick();
    for (const ev of events) {
      broadcast(ev);
      if (ev.type === 'BREACH' && ev.gameOver) {
        broadcast({
          type: 'GAME_OVER',
          ...ev.gameOver,
        });
      }
    }
  }, TICK_MS);
}

function stopTickLoop() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

const { listen, server } = createGameServer({
  name: 'Siège Zombie',
  publicDir: PUBLIC_DIR,
  getInitMessage: () => ({
    type: 'INIT',
    state: game.getState(),
    waveStart: { wave: game.wave, config: game.waveConfig },
  }),
  routes: (app, broadcast) => {
    startTickLoop(broadcast);

    app.post('/api/trigger', (req, res) => {
      const col = parseCol(req);
      console.log(`[ZombieSiege][API] Trigger — colonne: ${col}, phase: ${game.phase}`);

      if (Number.isNaN(col)) {
        return res
          .status(400)
          .json({ success: false, error: 'Paramètre "column" manquant ou invalide (0-6)' });
      }

      const result = game.fire(col);

      if (!result.success) {
        broadcast({ type: 'SHOOT_ERROR', error: result.error, col });
        return res.status(422).json({ success: false, error: result.error });
      }

      broadcast({
        type: 'SHOOT_FIRE',
        col: result.col,
        shotId: result.shotId,
        impactMs: result.impactMs,
      });

      scheduleImpact(broadcast, result.col, result.shotId, result.impactMs);

      res.json({ success: true, col: result.col, shotId: result.shotId, pending: true });
    });

    app.post('/api/reset', (req, res) => {
      clearImpactTimers();
      game.reset();
      console.log('[ZombieSiege][API] Nouvelle partie');
      const waveStart = {
        type: 'WAVE_START',
        wave: game.wave,
        config: game.waveConfig,
        state: game.getState(),
      };
      broadcast({ type: 'RESET', state: game.getState() });
      broadcast(waveStart);
      res.json({ success: true, state: game.getState() });
    });

    app.post('/api/reset-scores', (req, res) => {
      game.resetHighScore();
      console.log('[ZombieSiege][API] TOP score réinitialisé');
      broadcast({ type: 'STATE', state: game.getState() });
      res.json({ success: true, state: game.getState() });
    });

    app.get('/api/state', (req, res) => {
      res.json({ success: true, state: game.getState() });
    });
  },
});

function shutdown() {
  stopTickLoop();
  clearImpactTimers();
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        🧟  SIÈGE ZOMBIE — Jeu actif          ║');
  console.log(`║   HTTP + WS  →  http://0.0.0.0:${PORT}          ║`);
  console.log(`║   TOP score  →  ${game.persistent.highScore}                              ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
