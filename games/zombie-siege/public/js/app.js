/**
 * app.js — Orchestration WebSocket Siège Zombie.
 *
 * Rôle minimal : router les messages serveur vers Shots / Entities / UI.
 * Aucune logique d'animation inline — tout est délégué aux modules dédiés.
 */

window.App = (function () {
  const WS_RECONNECT_DELAY = 3000;
  const BASE = window.location.pathname.replace(/\/[^/]*$/, '');
  const WS_PROTO = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const WS_URL = `${WS_PROTO}://${window.location.host}${BASE}`;

  let ws = null;
  let reconnectTimer = null;
  let state = null;

  function init() {
    Building.init();
    Layout.init();
    UI.init();
    SiegeFx.init();

    const canvas = document.getElementById('confetti-canvas');
    if (canvas && window.Confetti) Confetti.create(canvas);

    connect();
  }

  function connect() {
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      UI.setStatus('Connecté', true);
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      handleMessage(msg).catch((err) => console.error('[App]', err));
    });

    ws.addEventListener('close', () => {
      UI.setStatus('Déconnecté', false);
      ws = null;
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {});
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, WS_RECONNECT_DELAY);
  }

  function applyState(newState) {
    if (!newState) return;
    state = newState;
    UI.updateHud(state);
    const climbMs = newState.waveConfig?.climbIntervalMs;
    Entities.syncFromState(newState.zombies || [], climbMs);
  }

  function resetVisuals() {
    Shots.clearAll();
    Entities.clearAll();
  }

  async function handleMessage(msg) {
    switch (msg.type) {
      case 'INIT':
        resetVisuals();
        UI.hideGameOver();
        applyState(msg.state);
        if (msg.waveStart) {
          await UI.showWaveOverlay(msg.waveStart.wave, msg.waveStart.config);
        }
        break;

      case 'STATE':
      case 'ZOMBIE_SPAWN':
        applyState(msg.state);
        break;

      case 'SHOOT_FIRE':
        Shots.start(msg);
        break;

      case 'SHOT_RESULT':
        Shots.setResult(msg);
        applyState(msg.state);
        break;

      case 'SHOOT_ERROR':
        if (window.Sounds) Sounds.miss();
        break;

      case 'BREACH':
        Shots.breach(msg.col);
        UI.animateLifeLost(msg.livesLeft, state?.startLives ?? 3);
        applyState(msg.state);
        break;

      case 'WAVE_START':
        applyState(msg.state);
        await UI.showWaveOverlay(msg.wave, msg.config);
        break;

      case 'WAVE_COMPLETE':
        applyState(msg.state);
        if (window.Sounds) Sounds.scorePop();
        break;

      case 'GAME_OVER':
        applyState(msg.state);
        await new Promise((r) => setTimeout(r, 600));
        UI.showGameOver(msg);
        break;

      case 'RESET':
        resetVisuals();
        UI.hideGameOver();
        applyState(msg.state);
        break;

      default:
        break;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
