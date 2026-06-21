/**
 * index.js — Hub BasketGame (serveur principal).
 *
 * Rôles :
 *   - Point d'entrée unique de l'ESP32 : POST /api/trigger (relayé au jeu actif).
 *   - Découverte des jeux (gameRegistry) et cycle de vie (gameManager).
 *   - Sert le contrôleur responsive (/) et l'écran télé (/tv).
 *   - Proxifie HTTP + WebSocket vers le jeu actif sous /play.
 *   - Diffuse l'état (idle / running) aux interfaces via WebSocket.
 *
 * Le hub NE contient aucune logique de jeu : tout est délégué au serveur du jeu.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');

const { listGames, getGame, toPublic, validateStartParams } = require('./gameRegistry');
const { GameManager, freePort, GAME_PORT } = require('./gameManager');
const { createPlayersRouter, buildEnrichedRoster } = require('./playerProfiles');
const { Esp32SensorService } = require('./esp32SensorService');
const { PLATFORM_COLUMNS } = require('../shared/constants');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const server = http.createServer(app);
const manager = new GameManager();
const sensorService = new Esp32SensorService();

// ─── WebSocket de contrôle (lobby + télé) ─────────────────────────────────────
const hubWss = new WebSocket.Server({ noServer: true });
const hubClients = new Set();

function getEsp32State() {
  return {
    connected: sensorService.serialConnected,
    calibrating: sensorService.calibrationPhase,
    ready: sensorService.isReady(),
    port: sensorService.serialPortName,
  };
}

function hubStateMessage() {
  return {
    type: 'HUB_STATE',
    ...manager.getState(),
    games: listGames().map(toPublic),
    esp32: getEsp32State(),
  };
}

function broadcastHubState() {
  const payload = JSON.stringify(hubStateMessage());
  for (const ws of hubClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

/** Diffuse un message JSON à tous les clients WS du hub (contrôleur + télé). */
function broadcastHubMessage(data) {
  const payload = JSON.stringify(data);
  for (const ws of hubClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function parseTriggerColumn(req) {
  const raw = req.body?.column ?? req.body?.col ?? req.query?.col ?? req.query?.column;
  if (raw === undefined || raw === null || raw === '') return null;
  const col = Number(raw);
  if (!Number.isInteger(col) || col < 0 || col >= PLATFORM_COLUMNS) return null;
  return col;
}

hubWss.on('connection', (ws) => {
  hubClients.add(ws);
  ws.send(JSON.stringify(hubStateMessage()));
  sensorService.syncClient((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  });
  ws.on('close', () => hubClients.delete(ws));
  ws.on('error', () => hubClients.delete(ws));
});

manager.on('change', broadcastHubState);

// ─── Proxy vers le jeu actif (/play) ──────────────────────────────────────────
// Matche le segment exact `/play` (et non un simple préfixe, sinon `/players`
// serait capturé par erreur).
function isPlayPath(pathname) {
  return pathname === '/play' || pathname.startsWith('/play/');
}

const playProxy = createProxyMiddleware({
  pathFilter: (pathname) => isPlayPath(pathname),
  router: () => manager.getActiveTarget() || undefined,
  target: 'http://127.0.0.1:3101', // fallback ; remplacé par router quand un jeu tourne
  changeOrigin: true,
  ws: true,
  pathRewrite: (pathname) => {
    const rewritten = pathname.replace(/^\/play/, '');
    return rewritten === '' ? '/' : rewritten;
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());

// Garde : si aucun jeu actif, /play renvoie 503 (l'ESP32/télé peut l'ignorer).
app.use((req, res, next) => {
  if (isPlayPath(req.path) && !manager.getActiveTarget()) {
    return res.status(503).send('Aucun jeu actif');
  }
  next();
});
app.use(playProxy);

app.use(express.json());

// ─── API du hub ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ...manager.getState(), esp32: getEsp32State(), clients: hubClients.size });
});

app.get('/api/games', (req, res) => {
  res.json({ success: true, games: listGames().map(toPublic) });
});

app.get('/api/state', (req, res) => {
  res.json({ success: true, ...manager.getState(), games: listGames().map(toPublic) });
});

// CRUD profils joueurs + service des photos (data/players/).
app.use('/api/players', createPlayersRouter());

app.post('/api/games/:id/start', async (req, res) => {
  try {
    if (!sensorService.isReady()) {
      const esp = getEsp32State();
      const error = !esp.connected ? 'ESP32_NOT_CONNECTED' : 'ESP32_CALIBRATING';
      return res.status(503).json({ success: false, error, esp32: esp });
    }

    const game = getGame(req.params.id);
    if (!game) {
      return res.status(404).json({ success: false, error: 'GAME_NOT_FOUND' });
    }

    const validation = validateStartParams(game, req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const params = { ...validation.params };

    // Jeux à roster : résout les profils choisis en données enrichies (URLs photos).
    if (game.controller?.requiresPlayerRoster) {
      const enriched = buildEnrichedRoster(params.roster || []);
      if (!enriched.valid) {
        return res.status(400).json({ success: false, error: enriched.error });
      }
      params.roster = enriched.roster;
    }

    const state = await manager.startGame(req.params.id, params);
    res.json({ success: true, ...state, startParams: params });
  } catch (e) {
    console.error('[Hub] Échec du démarrage :', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/games/stop', async (req, res) => {
  await manager.stopGame();
  res.json({ success: true, ...manager.getState() });
});

/**
 * POST /api/games/action/:actionId
 * Exécute une action du contrôleur définie dans game.config.json du jeu actif.
 * Le hub relaie la requête vers le serveur du jeu (sans logique de jeu).
 */
app.post('/api/games/action/:actionId', async (req, res) => {
  const { activeGameId, status } = manager.getState();
  if (status !== 'running' || !activeGameId) {
    return res.status(503).json({ success: false, error: 'NO_ACTIVE_GAME' });
  }

  const game = getGame(activeGameId);
  if (!game) {
    return res.status(404).json({ success: false, error: 'GAME_NOT_FOUND' });
  }

  const action = game.controller?.actions?.find((a) => a.id === req.params.actionId);
  if (!action) {
    return res.status(404).json({ success: false, error: 'ACTION_NOT_FOUND' });
  }

  const target = manager.getActiveTarget();
  if (!target) {
    return res.status(503).json({ success: false, error: 'NO_ACTIVE_GAME' });
  }

  try {
    const r = await fetch(`${target}${action.path}`, {
      method: action.method,
      headers: action.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: action.method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    console.error(`[Hub] Action "${action.id}" injoignable :`, e.message);
    res.status(502).json({ success: false, error: 'GAME_UNREACHABLE' });
  }
});

/**
 * Traite un trigger de colonne (ESP32 série, HTTP ou simulateur).
 * @returns {{ status: number, body: object }}
 */
async function handleTrigger(col) {
  if (!sensorService.isReady()) {
    return { status: 503, body: { success: false, error: 'ESP32_NOT_READY' } };
  }

  const target = manager.getActiveTarget();

  if (!target) {
    if (col !== null) {
      broadcastHubMessage({ type: 'HUB_TRIGGER', column: col });
    }
    return { status: 503, body: { success: false, error: 'NO_ACTIVE_GAME' } };
  }

  if (col === null) {
    return { status: 400, body: { success: false, error: 'INVALID_COLUMN' } };
  }

  try {
    const r = await fetch(`${target}/api/trigger?col=${encodeURIComponent(col)}`, {
      method: 'POST',
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, body: data };
  } catch (e) {
    console.error('[Hub] Jeu injoignable pour le trigger :', e.message);
    return { status: 502, body: { success: false, error: 'GAME_UNREACHABLE' } };
  }
}

/**
 * POST /api/trigger — Entrée manuelle (simulateur) ou HTTP legacy.
 * Body: { "column": 0-6 } ou query string ?col=3.
 */
app.post('/api/trigger', async (req, res) => {
  const col = parseTriggerColumn(req);
  const result = await handleTrigger(col);
  res.status(result.status).json(result.body);
});

// ─── Capteurs ESP32 (série USB) ───────────────────────────────────────────────
sensorService.setBroadcast(broadcastHubMessage);
sensorService.setOnTrigger(async (col) => {
  await handleTrigger(col);
});
sensorService.setOnStateChange(async () => {
  broadcastHubState();
  if (!sensorService.serialConnected && manager.getState().status === 'running') {
    console.warn('[Hub] ESP32 déconnecté — arrêt du jeu actif');
    await manager.stopGame();
  }
});

app.get('/api/sensors/status', (req, res) => {
  res.json({ success: true, ...sensorService.getStatus() });
});

app.post('/api/sensors/recalibrate', (req, res) => {
  if (!sensorService.serialConnected) {
    return res.status(503).json({ success: false, error: 'SERIAL_NOT_CONNECTED' });
  }
  sensorService.recalibrate();
  res.json({ success: true, calibrating: true });
});

function handleThresholdUpdate(req, res) {
  if (req.body?.resetAll === true) {
    const result = sensorService.resetAllSensorOverrides();
    return res.json({
      success: true,
      resetAll: true,
      ratio: result.ratio,
      percent: Math.round(result.ratio * 100),
      sensorOverrides: result.sensorOverrides,
      effectiveRatios: result.effectiveRatios,
      thresholds: result.thresholds,
    });
  }

  const sensorRaw = req.body?.sensor;
  const hasSensor = sensorRaw !== undefined && sensorRaw !== null && sensorRaw !== '';

  if (hasSensor) {
    const sensor = Number(sensorRaw);
    if (!Number.isInteger(sensor) || sensor < 0 || sensor >= PLATFORM_COLUMNS) {
      return res.status(400).json({ success: false, error: 'INVALID_SENSOR' });
    }

    if (req.body?.reset === true) {
      const result = sensorService.setSensorOverride(sensor, null);
      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.json({
        success: true,
        sensor,
        reset: true,
        ratio: result.ratio,
        percent: Math.round(result.ratio * 100),
        sensorOverrides: result.sensorOverrides,
        effectiveRatios: result.effectiveRatios,
        thresholds: result.thresholds,
      });
    }

    const raw = req.body?.percent ?? req.body?.ratio;
    if (raw === undefined || raw === null || raw === '') {
      return res.status(400).json({ success: false, error: 'THRESHOLD_REQUIRED' });
    }

    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return res.status(400).json({ success: false, error: 'INVALID_THRESHOLD_RATIO' });
    }

    const ratio = num > 1 ? num / 100 : num;
    const result = sensorService.setSensorOverride(sensor, ratio);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const effective = result.effectiveRatios[sensor];
    return res.json({
      success: true,
      sensor,
      ratio: result.ratio,
      percent: Math.round(effective * 100),
      sensorOverrides: result.sensorOverrides,
      effectiveRatios: result.effectiveRatios,
      thresholds: result.thresholds,
    });
  }

  const raw = req.body?.percent ?? req.body?.ratio;
  if (raw === undefined || raw === null || raw === '') {
    return res.status(400).json({ success: false, error: 'THRESHOLD_REQUIRED' });
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return res.status(400).json({ success: false, error: 'INVALID_THRESHOLD_RATIO' });
  }

  const ratio = num > 1 ? num / 100 : num;
  const result = sensorService.setThresholdRatio(ratio);
  if (!result.ok) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.json({
    success: true,
    ratio: result.ratio,
    percent: Math.round(result.ratio * 100),
    sensorOverrides: result.sensorOverrides,
    effectiveRatios: result.effectiveRatios,
    thresholds: result.thresholds,
  });
}

app.patch('/api/sensors/threshold', handleThresholdUpdate);
app.post('/api/sensors/threshold', handleThresholdUpdate);

// ─── Pages ────────────────────────────────────────────────────────────────────
app.use('/shared', express.static(path.join(__dirname, '..', 'shared', 'client')));
app.use(express.static(PUBLIC_DIR));

app.get('/tv', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'tv.html'));
});

app.get('/players', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'players.html'));
});

app.get('/sensors', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'sensors.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Routage des upgrades WebSocket ───────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  if (isPlayPath(req.url.split('?')[0])) {
    if (manager.getActiveTarget()) {
      playProxy.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  } else {
    hubWss.handleUpgrade(req, socket, head, (ws) => {
      hubWss.emit('connection', ws, req);
    });
  }
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
freePort(GAME_PORT);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        🏀  BASKETGAME — Hub actif            ║');
  console.log(`║   Contrôleur →  http://localhost:${PORT}        ║`);
  console.log(`║   Télé       →  http://localhost:${PORT}/tv     ║`);
  console.log(`║   Capteurs   →  http://localhost:${PORT}/sensors  ║`);
  console.log(`║   Trigger    →  POST /api/trigger            ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  const games = listGames();
  console.log(`[Hub] ${games.length} jeu(x) découvert(s) :`, games.map((g) => g.id).join(', ') || '(aucun)');

  const serialArg = process.argv.find((a) => a.startsWith('--serial-port='));
  const serialPort = serialArg ? serialArg.split('=')[1] : null;
  sensorService.start(serialPort).catch((e) => {
    console.error('[ESP32] Démarrage capteurs :', e.message);
  });
});

async function shutdown(signal) {
  console.log(`\n[Hub] Arrêt (${signal})…`);
  try {
    await sensorService.stop();
  } catch (e) {
    console.error('[Hub] Erreur arrêt capteurs :', e.message);
  }
  try {
    await manager.stopGame();
  } catch (e) {
    console.error('[Hub] Erreur arrêt jeu :', e.message);
  }
  freePort(GAME_PORT);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
