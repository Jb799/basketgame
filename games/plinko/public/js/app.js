/**
 * app.js — Orchestration Plinko (WebSocket + état + séquencement tours).
 */

window.App = (function () {
  const WS_RECONNECT_DELAY = 3000;
  const BASE = window.location.pathname.replace(/\/[^/]*$/, '');
  const WS_PROTO = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const WS_URL = `${WS_PROTO}://${window.location.host}${BASE}`;

  let ws = null;
  let reconnectTimer = null;
  let state = null;
  let processingDrop = false;
  let minigameActive = false;
  let pendingMinigameStart = null;

  const pendingQueue = [];

  function init() {
    Board.init();
    Players.init();
    Results.hide();

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
      UI.setHud(null, null, null, 'Connecté');
    });
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', () => {
      UI.setHud(null, null, null, 'Déconnecté');
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

  function isBusy() {
    return processingDrop || minigameActive;
  }

  function enqueueTransition(msg) {
    pendingQueue.push(msg);
    drainQueue();
  }

  async function drainQueue() {
    if (isBusy() || pendingQueue.length === 0) return;

    while (pendingQueue.length > 0 && !isBusy()) {
      const msg = pendingQueue.shift();
      await handleTransition(msg);
    }
  }

  function resolveMinigameStart(fallback) {
    if (pendingMinigameStart) return pendingMinigameStart;
    if (fallback?.minigameStart) return fallback.minigameStart;
    if (state?.minigame) {
      return {
        type: 'MINIGAME_START',
        kind: state.minigame.kind,
        activePlayer: state.minigame.activePlayer,
        columns: state.minigame.columns,
        seed: state.minigame.seed,
        round: state.round,
      };
    }
    return null;
  }

  async function onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'INIT':
        applyFullState(msg.state);
        break;
      case 'BOARD_READY':
        await handleBoardReady(msg);
        break;
      case 'BALL_DROP':
        if (msg.minigameStart) pendingMinigameStart = msg.minigameStart;
        await handleBallDrop(msg);
        break;
      case 'MINIGAME_START':
        pendingMinigameStart = msg;
        break;
      case 'MINIGAME_RESULT':
        await handleMinigameResult(msg);
        break;
      case 'TURN_CHANGE':
      case 'ROUND_END':
      case 'GAME_OVER':
        enqueueTransition(msg);
        break;
      case 'DROP_ERROR':
        Sounds.error();
        UI.setHud(null, null, null, errorLabel(msg.error));
        break;
      case 'RESET':
        pendingQueue.length = 0;
        pendingMinigameStart = null;
        minigameActive = false;
        if (window.Minigame) Minigame.hide();
        Results.hide();
        applyFullState(msg.state);
        break;
      default:
        break;
    }
  }

  async function startMinigameFromPending(fallbackMsg) {
    const msg = resolveMinigameStart(fallbackMsg);
    if (!msg) return;
    pendingMinigameStart = null;
    minigameActive = true;
    if (state) {
      state.phase = msg.kind === 'knife' ? 'minigame_knife' : 'minigame_thief';
      state.minigame = {
        kind: msg.kind,
        activePlayer: msg.activePlayer,
        columns: msg.columns,
        seed: msg.seed,
      };
    }
    await Minigame.showStart(msg);
  }

  async function waitForMinigameStart(maxMs = 2000) {
    let waited = 0;
    while (!pendingMinigameStart && !state?.minigame && waited < maxMs) {
      await UI.sleep(50);
      waited += 50;
    }
  }

  async function handleMinigameResult(msg) {
    if (!minigameActive) {
      minigameActive = true;
      if (state?.minigame) {
        await Minigame.restoreFromState(state.minigame);
      } else {
        await startMinigameFromPending();
      }
    }

    await Minigame.playResult(msg);

    await Minigame.hide();
    minigameActive = false;
    if (state) {
      state.phase = 'resolving';
      state.minigame = null;
    }

    processingDrop = false;
    drainQueue();
  }

  async function handleTransition(msg) {
    if (msg.type === 'TURN_CHANGE') {
      Ball.hide();
      await UI.showTurnBanner(msg.currentPlayer);
      Players.highlightTurn(msg.currentPlayer);
      if (msg.scores) Players.updateScores(msg.scores);
      if (state) {
        state.currentPlayer = msg.currentPlayer;
        state.phase = 'playing';
      }
      UI.setHud(msg.round, state?.totalRounds || 5, playerLabel(msg.currentPlayer), 'À vous de jouer');
      Sounds.changeTurn();
      return;
    }

    if (msg.type === 'ROUND_END') {
      Ball.hide();
      await UI.showRoundBanner(msg.round, msg.totalRounds || state?.totalRounds || 5);
      if (msg.scores) Players.updateScores(msg.scores);
      if (state) state.phase = 'round_summary';
      UI.setHud(msg.round, msg.totalRounds || 5, null, `Fin du tour ${msg.round}`);
      return;
    }

    if (msg.type === 'GAME_OVER') {
      if (state) state.phase = 'game_over';
      UI.setHud(null, null, 'Partie terminée', msg.isTie ? 'Égalité' : 'Podium');
      Results.show(msg.ranking, msg.stats, {
        isTie: msg.isTie,
        tiedPlayers: msg.tiedPlayers,
        winners: msg.winners,
      });
    }
  }

  function playerLabel(n) {
    return window.PlayerFaces ? PlayerFaces.getPseudo(n) : `Joueur ${n}`;
  }

  function applyFullState(s) {
    state = s;
    if (!s) return;

    if (window.PlayerFaces) PlayerFaces.setRoster(s.roster);

    const turnLabel = s.phase === 'game_over' ? 'Partie terminée' : playerLabel(s.currentPlayer);
    UI.setHud(s.round, s.totalRounds, turnLabel, phaseLabel(s.phase));

    Players.setup(s.players, s.scores, s.currentPlayer);

    if (s.minigame && (s.phase === 'minigame_knife' || s.phase === 'minigame_thief')) {
      minigameActive = true;
      Minigame.restoreFromState(s.minigame);
    } else {
      minigameActive = false;
      Minigame.hide();
      Board.renderBoard(s.board);
    }

    if (s.phase === 'game_over' && s.ranking) {
      Results.show(s.ranking, s.stats, {
        isTie: s.isTie,
        tiedPlayers: s.tiedPlayers,
        winners: s.winners,
      });
    }
  }

  async function handleBoardReady(msg) {
    const newSeed = msg.seed ?? msg.state?.boardSeed ?? msg.board?.seed;
    const currentSeed = state?.boardSeed ?? state?.board?.seed;

    if (newSeed != null && currentSeed != null && newSeed === currentSeed) {
      if (msg.state) state = msg.state;
      return;
    }

    Ball.hide();
    if (minigameActive) {
      await Minigame.hide();
      minigameActive = false;
    }

    const board = msg.state?.board || msg.board;
    if (msg.state) state = msg.state;

    await Board.transitionBoard(board);

    if (msg.state) {
      UI.setHud(msg.state.round, msg.state.totalRounds, playerLabel(msg.state.currentPlayer), 'Nouveau plateau');
      Players.setup(msg.state.players, msg.state.scores, msg.state.currentPlayer);
    } else {
      UI.setHud(msg.round, state?.totalRounds || 5, null, `Nouveau plateau — tour ${msg.round}`);
    }
  }

  async function handleBallDrop(msg) {
    processingDrop = true;

    const droppingPlayer = msg.droppingPlayer || msg.player;
    const minigameSkipped = Boolean(msg.minigameSkipped);
    const triggersMinigame = !minigameSkipped && (
      msg.triggersMinigame || msg.slot?.type === 'knife' || msg.slot?.type === 'thief'
    );

    if (triggersMinigame && msg.minigameStart) {
      pendingMinigameStart = msg.minigameStart;
    }

    Players.setDropping(droppingPlayer);
    UI.setHud(msg.round, state?.totalRounds || 5, playerLabel(droppingPlayer), 'Chute en cours…');
    Board.highlightColumn(msg.entryCol);

    const pixelPath = Board.pathToPixels(msg.path);
    const landedOnFire = await Ball.animatePath(pixelPath);

    const applied = msg.appliedDelta != null ? msg.appliedDelta : msg.delta;
    const hasMultiplier = !triggersMinigame && (
      Number(msg.multiplier) >= 2
      || ((msg.onFireAtLand || landedOnFire) && applied !== 0 && msg.slot?.type !== 'neutral')
    );

    Board.highlightSlot(msg.slotIndex);
    const slotEl = document.querySelector(`[data-index="${msg.slotIndex}"]`);
    Fx.onLand(msg.slot, slotEl, { onFire: hasMultiplier, multiplier: msg.multiplier || 1 });

    Ball.hide();

    if (hasMultiplier) {
      await UI.showMultiplierX2();
    }

    if (!triggersMinigame) {
      if (applied !== 0) {
        await Fx.flyScoreToPlayer(droppingPlayer, applied);
        Players.updateScore(droppingPlayer, msg.scores[droppingPlayer], applied);
      } else {
        Players.updateScore(droppingPlayer, msg.scores[droppingPlayer], 0, { animate: false });
      }
    }

    Players.clearDropping();
    Board.clearColumnHighlight();

    if (minigameSkipped) {
      UI.setHud(
        msg.round,
        state?.totalRounds || 5,
        playerLabelText(droppingPlayer),
        'Personne n\'a de pièces — mini-jeu annulé'
      );
      await UI.showResultPause(0, 0, { onFireAtLand: false });
      if (state) state.phase = 'resolving';
      processingDrop = false;
      drainQueue();
      return;
    }

    if (triggersMinigame) {
      const kind = msg.minigameKind || msg.slot?.type;
      if (state) state.phase = kind === 'knife' ? 'minigame_knife' : 'minigame_thief';

      await UI.showMinigameLandPause(kind, droppingPlayer);
      await UI.showMinigameIntro(kind, droppingPlayer);

      if (!resolveMinigameStart(msg)) {
        await waitForMinigameStart();
      }
      await startMinigameFromPending(msg);
      return;
    }

    await UI.showResultPause(applied, msg.baseSlotDelta != null ? msg.baseSlotDelta : msg.slotDelta, {
      onFireAtLand: hasMultiplier,
    });

    if (state) state.phase = 'resolving';
    processingDrop = false;
    drainQueue();
  }

  function phaseLabel(phase) {
    const labels = {
      playing: 'À vous de jouer',
      resolving: 'Résultat…',
      round_summary: 'Fin du tour',
      board_transition: 'Nouveau plateau…',
      game_over: 'Terminé',
      minigame_knife: 'Mini-jeu Couteau — visez !',
      minigame_thief: 'Mini-jeu Voleur — visez !',
    };
    return labels[phase] || '';
  }

  function errorLabel(code) {
    const labels = {
      RESOLVING: 'Patience…',
      BALL_IN_MOTION: 'Balle en chute',
      GAME_OVER: 'Partie terminée',
      ROUND_SUMMARY: 'Pause entre les tours',
      BOARD_TRANSITION: 'Nouveau plateau en cours',
      INVALID_COLUMN: 'Colonne invalide',
      MINIGAME_ACTIVE: 'Mini-jeu en cours',
      NOT_MINIGAME: 'Pas de mini-jeu actif',
    };
    return labels[code] || code;
  }

  init();
  return { getState: () => state };
})();
