/**
 * gameManager.js — Cycle de vie du jeu actif.
 *
 * Lance le serveur d'un jeu comme processus enfant (un seul jeu actif à la
 * fois), surveille sa santé, l'arrête proprement, et émet des événements
 * `change` à chaque transition pour que le hub diffuse l'état aux clients.
 *
 * Le hub proxifie ensuite le trafic HTTP/WS vers `getActiveTarget()`.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const { EventEmitter } = require('events');
const { getGame } = require('./gameRegistry');

const GAME_PORT = Number(process.env.GAME_PORT) || 3101;
const HEALTH_RETRIES = 40;
const HEALTH_INTERVAL_MS = 150;

/**
 * Tue tout processus qui écoute sur le port (processus orphelin après Ctrl+C du hub).
 */
function freePort(port = GAME_PORT) {
  try {
    const out = execSync(`lsof -tnP -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
      encoding: 'utf8',
    }).trim();
    if (!out) return;
    const pids = [...new Set(out.split('\n').filter(Boolean))];
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        /* déjà terminé */
      }
    }
    console.log(`[Manager] Port ${port} libéré (PID ${pids.join(', ')})`);
  } catch {
    /* rien n'écoute sur ce port */
  }
}

class GameManager extends EventEmitter {
  constructor() {
    super();
    this.status = 'idle'; // idle | starting | running | stopping
    this.activeGameId = null;
    this.child = null;
    this.port = GAME_PORT;
  }

  getState() {
    return { status: this.status, activeGameId: this.activeGameId, port: this.port };
  }

  /**
   * URL interne du jeu actif pour le proxy, ou null si aucun jeu prêt.
   */
  getActiveTarget() {
    if (this.status === 'running') return `http://127.0.0.1:${this.port}`;
    return null;
  }

  _setStatus(status, activeGameId = this.activeGameId) {
    this.status = status;
    this.activeGameId = activeGameId;
    this.emit('change', this.getState());
  }

  /**
   * Démarre un jeu par son id. Arrête le jeu en cours s'il y en a un.
   */
  async startGame(id, params = {}) {
    const game = getGame(id);
    if (!game) throw new Error(`Jeu introuvable : ${id}`);

    if (this.child) await this.stopGame();

    freePort(this.port);
    await new Promise((r) => setTimeout(r, 300));

    this._setStatus('starting', id);
    const paramsJson = JSON.stringify(params || {});
    console.log(`[Manager] Démarrage du jeu "${id}" sur le port ${this.port}…`, paramsJson !== '{}' ? paramsJson : '');

    this.child = spawn('node', [game.entryPath], {
      cwd: game.dir,
      env: {
        ...process.env,
        GAME_PORT: String(this.port),
        HUB: '1',
        GAME_START_PARAMS: paramsJson,
      },
      stdio: 'inherit',
    });

    this.child.on('exit', (code, signal) => {
      console.log(`[Manager] Jeu "${id}" terminé (code=${code}, signal=${signal})`);
      this.child = null;
      // Sortie inattendue pendant qu'il tournait → retour à l'écran d'attente.
      if (this.status === 'running' || this.status === 'starting') {
        this._setStatus('idle', null);
      }
    });

    const healthy = await this._waitForHealth();
    if (!healthy) {
      await this.stopGame();
      throw new Error(`Le jeu "${id}" n'a pas répondu au health check`);
    }

    this._setStatus('running', id);
    console.log(`[Manager] Jeu "${id}" prêt.`);
    return this.getState();
  }

  /**
   * Arrête le jeu actif proprement (SIGTERM puis SIGKILL en dernier recours).
   */
  async stopGame() {
    if (!this.child) {
      this._setStatus('idle', null);
      return;
    }
    this._setStatus('stopping');
    const child = this.child;

    await new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 3000);
      child.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      child.kill('SIGTERM');
    });

    this.child = null;
    freePort(this.port);
    this._setStatus('idle', null);
  }

  _waitForHealth() {
    return new Promise((resolve) => {
      let attempts = 0;
      const tryOnce = () => {
        attempts++;
        const req = http.get(
          { host: '127.0.0.1', port: this.port, path: '/api/health', timeout: 1000 },
          (res) => {
            res.resume();
            if (res.statusCode === 200) return resolve(true);
            retry();
          }
        );
        req.on('error', retry);
        req.on('timeout', () => req.destroy());
      };
      const retry = () => {
        if (attempts >= HEALTH_RETRIES) return resolve(false);
        setTimeout(tryOnce, HEALTH_INTERVAL_MS);
      };
      tryOnce();
    });
  }
}

module.exports = { GameManager, freePort, GAME_PORT };
