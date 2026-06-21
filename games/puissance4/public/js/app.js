/**
 * app.js — Point d'entrée principal
 * Bootstrap, connexion WebSocket, routage des événements serveur.
 */

window.App = (function () {

  const WS_RECONNECT_DELAY = 3000;

  const BASE = window.location.pathname.replace(/\/[^/]*$/, '');
  const WS_PROTO = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const WS_URL = `${WS_PROTO}://${window.location.host}${BASE}`;

  let ws = null;
  let reconnectTimer = null;
  let isGameOverTriggered = false;
  let isDrawTriggered = false;
  let isSeriesOverTriggered = false;

  function init() {
    Board.init();
    Players.init();
    UI.init();
    connect();
  }

  function connect() {
    UI.setConnectionStatus('connecting');

    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.error('[WS] Impossible de créer le WebSocket:', e);
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onError);
  }

  function onOpen() {
    console.log('[WS] Connecté au serveur');
    UI.setConnectionStatus('connected');
    if (reconnectTimer) clearTimeout(reconnectTimer);
  }

  function onClose(event) {
    console.log('[WS] Connexion fermée:', event.code, event.reason);
    UI.setConnectionStatus('disconnected');
    ws = null;
    scheduleReconnect();
  }

  function onError() {
    console.error('[WS] Erreur WebSocket');
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    UI.showToast(`Reconnexion dans ${WS_RECONNECT_DELAY / 1000}s…`, 'warning');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      UI.setConnectionStatus('connecting');
      connect();
    }, WS_RECONNECT_DELAY);
  }

  async function onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      console.error('[WS] Message JSON invalide:', event.data);
      return;
    }

    console.log('[WS] Message reçu:', msg.type, msg);

    switch (msg.type) {
      case 'INIT':
        await handleInit(msg.state);
        break;
      case 'TOKEN_PLACED':
        await handleTokenPlaced(msg);
        break;
      case 'GAME_OVER':
        await handleGameOver(msg);
        break;
      case 'DRAW':
        await handleDraw(msg);
        break;
      case 'RESET':
        handleReset(msg);
        break;
      case 'TOKEN_ERROR':
        handleError(msg);
        break;
      default:
        console.warn('[WS] Type de message inconnu:', msg.type);
    }
  }

  async function handleInit(state) {
    if (window.PlayerFaces) PlayerFaces.setRoster(state.roster);
    Players.applyRoster();

    if (state.moveCount > 0) {
      Board.renderFromState(state.board);
    }

    Players.updateScores(state.scores);

    if (state.seriesWinner) {
      isSeriesOverTriggered = true;
      isGameOverTriggered = true;
      Board.setGameOver();
      Players.setGameOver();
      if (state.winner) Players.setOutcome(state.winner);
      if (state.winningCells?.length) {
        Board.highlightWinners(state.winningCells);
      }
      UI.showSeriesWin(state.seriesWinner, { delay: 0 });
    } else if (state.isOver) {
      isGameOverTriggered = true;
      if (state.isDraw) isDrawTriggered = true;
      Board.setGameOver();
      Players.setGameOver();
      if (state.winner) Players.setOutcome(state.winner);
      if (state.winningCells?.length) {
        Board.highlightWinners(state.winningCells);
      }
    } else {
      Players.setActiveTurn(state.currentPlayer);
    }

    console.log('[App] État initialisé:', state);
  }

  async function handleTokenPlaced(msg) {
    try {
      const { col, row, player, currentPlayer } = msg;

      Sounds.tokenDrop(player);
      Board.animateDrop(row, col, player);
      Players.setActiveTurn(currentPlayer);
      Sounds.changeTurn();
    } catch (e) {
      console.error('[App] Erreur dans handleTokenPlaced:', e);
    }
  }

  async function handleGameOver(msg) {
    if (isGameOverTriggered) return;
    isGameOverTriggered = true;

    const { col, row, player, winner, winningCells, scores } = msg;

    try { Sounds.tokenDrop(player); } catch (e) {}

    try {
      await Board.animateDrop(row, col, player);
    } catch (e) {
      try { Board.placeDirect(row, col, player); } catch (e2) {}
    }

    await delay(400);

    try { Board.highlightWinners(winningCells); } catch (e) {}
    try { Board.setGameOver(); } catch (e) {}
    try { Players.setGameOver(); } catch (e) {}
    try { Players.setOutcome(winner); } catch (e) {}

    try {
      await Players.animateScoreAddition(winner, scores);
    } catch (e) {
      try { Players.updateScores(scores); } catch (e2) {}
    }

    try { Sounds.victory(winner); } catch (e) {}

    await delay(500);

    try { UI.showVictory(winner); } catch (e) {
      console.error('[App] Erreur dans showVictory:', e);
    }

    if (msg.seriesWinner) {
      isSeriesOverTriggered = true;
      UI.showSeriesWin(msg.seriesWinner);
    }
  }

  async function handleDraw(msg) {
    if (isDrawTriggered) return;
    isDrawTriggered = true;

    try {
      const { col, row, player } = msg;

      Sounds.tokenDrop(player);
      await Board.animateDrop(row, col, player);

      await delay(400);

      Board.setGameOver();
      Players.setGameOver();
      Sounds.draw();
    } catch (e) {
      console.error('[App] Erreur dans handleDraw:', e);
    }
  }

  function handleReset(msg) {
    Board.reset();
    Players.resetRound();
    Players.updateScores(msg.scores);
    Sounds.reset();
    UI.hideVictory();
    UI.hideSeriesWin();

    isGameOverTriggered = false;
    isDrawTriggered = false;
    isSeriesOverTriggered = false;
  }

  function handleError(msg) {
    const { error, col } = msg;

    switch (error) {
      case 'COLUMN_FULL':
        Board.shakeColumn(col);
        Sounds.error();
        break;
      case 'GAME_OVER':
      case 'SERIES_OVER':
      case 'INVALID_COLUMN':
        console.warn('[App] Erreur:', error);
        break;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
