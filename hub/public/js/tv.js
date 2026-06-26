/**
 * tv.js — Écran télé BasketGame.
 *
 * Bascule entre l'écran d'attente (idle) et le jeu en cours, chargé dans une
 * iframe via le proxy /play du hub. En mode idle, un trigger ESP32 (HUB_TRIGGER)
 * fait chuter un 🏀 dans la colonne correspondante.
 */

(function () {
  const PLATFORM_COLUMNS = 7;

  const wait = document.getElementById('tv-wait');
  const lanesEl = document.getElementById('tv-lanes');
  const frame = document.getElementById('tv-frame');
  const statusEl = document.getElementById('tv-status');
  const statusLabel = document.getElementById('tv-status-label');

  let currentGameId = null;
  let isIdle = true;
  const lanes = [];

  initLanes();

  if (window.StructureImpact) {
    StructureImpact.init({
      root: wait,
      lanesRoot: lanesEl,
      showBanner: true,
    });
  }

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  WSClient.connect(`${wsProto}://${location.host}`, {
    onOpen: () => {
      wait.classList.add('is-online');
      statusLabel.textContent = 'Prêt';
    },
    onClose: () => {
      wait.classList.remove('is-online');
      statusLabel.textContent = 'Reconnexion au hub…';
    },
    onMessage: (msg) => {
      if (msg.type === 'HUB_STATE') applyState(msg);
      if (msg.type === 'HUB_TRIGGER' && isIdle) dropBall(msg.column);
      if (msg.type === 'HUB_IMPACT' && isIdle && window.StructureImpact) {
        StructureImpact.play(msg);
      }
    },
  });

  function initLanes() {
    for (let col = 0; col < PLATFORM_COLUMNS; col++) {
      const lane = document.createElement('div');
      lane.className = 'tv-wait__lane platform-column';
      lane.dataset.col = String(col);
      lanesEl.appendChild(lane);
      lanes.push(lane);
    }
  }

  function applyState(state) {
    const running = state.status === 'running' && state.activeGameId;
    isIdle = !running;

    if (running) {
      if (currentGameId !== state.activeGameId) {
        currentGameId = state.activeGameId;
        frame.src = '/play/';
      }
      frame.hidden = false;
      wait.hidden = true;
    } else {
      currentGameId = null;
      if (frame.src) frame.removeAttribute('src');
      frame.hidden = true;
      wait.hidden = false;
      clearLanes();
    }
  }

  function clearLanes() {
    for (const lane of lanes) {
      lane.replaceChildren();
      lane.classList.remove('is-hit');
    }
  }

  function dropBall(col) {
    const index = Number(col);
    if (!Number.isInteger(index) || index < 0 || index >= PLATFORM_COLUMNS) return;

    const lane = lanes[index];
    lane.classList.remove('is-hit');
    void lane.offsetWidth;
    lane.classList.add('is-hit');
    const ball = document.createElement('span');
    ball.className = 'tv-wait__drop-ball';
    ball.textContent = '🏀';
    ball.setAttribute('role', 'presentation');
    lane.appendChild(ball);

    ball.addEventListener('animationend', () => ball.remove(), { once: true });
  }
})();
