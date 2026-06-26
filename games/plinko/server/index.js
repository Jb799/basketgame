/**
 * index.js — Serveur du jeu Plinko.
 */

const path = require('path');
const { createGameServer } = require('../../../shared/server/createGameServer');
const { reportFromRoster } = require('../../../shared/server/reportPlayerStats');
const { Game } = require('./game');

const PORT = process.env.GAME_PORT || process.env.PORT || 3101;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const RESOLVE_MS = 6500;
const MINIGAME_ARM_MS = 5500;
const MINIGAME_RESOLVE_MS = 5500;
const ROUND_SUMMARY_MS = 4000;
const BOARD_TRANSITION_MS = 2500;

const game = new Game();

let resolveTimer = null;
let roundSummaryTimer = null;
let boardUnlockTimer = null;

function clearResolveTimer() {
  if (resolveTimer) {
    clearTimeout(resolveTimer);
    resolveTimer = null;
  }
}

function clearRoundSummaryTimer() {
  if (roundSummaryTimer) {
    clearTimeout(roundSummaryTimer);
    roundSummaryTimer = null;
  }
}

function clearBoardUnlockTimer() {
  if (boardUnlockTimer) {
    clearTimeout(boardUnlockTimer);
    boardUnlockTimer = null;
  }
}

function clearAllTimers() {
  clearResolveTimer();
  clearRoundSummaryTimer();
  clearBoardUnlockTimer();
}

function scheduleMinigameArm(broadcast, delayMs = MINIGAME_ARM_MS) {
  clearResolveTimer();
  resolveTimer = setTimeout(() => {
    const msg = game.armPendingMinigame();
    if (msg) broadcast(msg);
    resolveTimer = null;
  }, delayMs);
}

function scheduleBoardUnlock() {
  clearBoardUnlockTimer();
  boardUnlockTimer = setTimeout(() => {
    if (game.phase === 'board_transition') {
      game.phase = 'playing';
    }
    boardUnlockTimer = null;
  }, BOARD_TRANSITION_MS);
}

function recordPlinkoGameStats(msg) {
  if (!game.roster?.length || !msg?.ranking?.length) return;

  const resultsBySlot = {};
  if (msg.isTie && msg.tiedPlayers?.length) {
    const tied = new Set(msg.tiedPlayers.map(Number));
    msg.ranking.forEach((entry, index) => {
      const slot = Number(entry.player);
      resultsBySlot[slot] = {
        result: tied.has(slot) ? 'tie' : 'loss',
        meta: { rank: index + 1, score: entry.score },
      };
    });
  } else {
    const winners = new Set((msg.winners || []).map(Number));
    msg.ranking.forEach((entry, index) => {
      const slot = Number(entry.player);
      resultsBySlot[slot] = {
        result: winners.has(slot) ? 'win' : 'loss',
        meta: { rank: index + 1, score: entry.score },
      };
    });
  }

  reportFromRoster('plinko', game.roster, resultsBySlot);
}

function scheduleAdvance(broadcast, delayMs = RESOLVE_MS) {
  clearResolveTimer();
  resolveTimer = setTimeout(() => {
    const msg = game.applyPendingAdvance();
    if (!msg) return;

    broadcast(msg);

    if (msg.type === 'GAME_OVER') {
      recordPlinkoGameStats(msg);
    }

    if (msg.type === 'ROUND_END') {
      scheduleRoundContinue(broadcast);
    }

    resolveTimer = null;
  }, delayMs);
}

function scheduleRoundContinue(broadcast) {
  clearRoundSummaryTimer();
  roundSummaryTimer = setTimeout(() => {
    const result = game.continueFromRoundSummary();
    if (result.success) {
      broadcast({
        type: 'BOARD_READY',
        state: game.getState(),
        board: game.board,
        round: game.round,
        seed: game.boardSeed,
      });
      scheduleBoardUnlock();
    }
    roundSummaryTimer = null;
  }, ROUND_SUMMARY_MS);
}

function isMinigamePhase(phase) {
  return phase === 'minigame_knife' || phase === 'minigame_thief' || phase === 'minigame_golden';
}

const { listen } = createGameServer({
  name: 'Plinko',
  publicDir: PUBLIC_DIR,
  getInitMessage: () => ({ type: 'INIT', state: game.getState() }),
  routes: (app, broadcast) => {
    app.post('/api/trigger', (req, res) => {
      const col = parseInt(
        req.body?.column ?? req.body?.col ?? req.query?.col ?? req.query?.column,
        10
      );
      console.log(`[Plinko][API] Trigger reçu — colonne: ${col}, phase: ${game.phase}`);

      if (Number.isNaN(col)) {
        return res
          .status(400)
          .json({ success: false, error: 'Paramètre "column" manquant ou invalide (0-6)' });
      }

      if (isMinigamePhase(game.phase)) {
        const result = game.minigameDrop(col);

        if (!result.success) {
          broadcast({ type: 'DROP_ERROR', error: result.error, col });
          return res.status(422).json({ success: false, error: result.error });
        }

        broadcast({
          type: 'MINIGAME_RESULT',
          kind: result.kind,
          activePlayer: result.activePlayer,
          targetCol: result.targetCol,
          targetType: result.targetType,
          targetPlayer: result.targetPlayer,
          rolledPercent: result.rolledPercent,
          rolledAmount: result.rolledAmount,
          resolvedAmount: result.resolvedAmount,
          appliedToVictim: result.appliedToVictim,
          appliedToAttacker: result.appliedToAttacker,
          hit: result.hit,
          goldenCol: result.goldenCol,
          coinReward: result.coinReward,
          scores: result.scores,
          round: result.round,
          phase: result.phase,
          advanceKind: result.advanceKind,
        });

        scheduleAdvance(broadcast, MINIGAME_RESOLVE_MS);

        return res.json({ success: true, ...result });
      }

      const result = game.dropBall(col);

      if (!result.success) {
        broadcast({ type: 'DROP_ERROR', error: result.error, col });
        return res.status(422).json({ success: false, error: result.error });
      }

      broadcast({
        type: 'BALL_DROP',
        droppingPlayer: result.droppingPlayer,
        player: result.droppingPlayer,
        entryCol: result.entryCol,
        path: result.path,
        slotIndex: result.slotIndex,
        slot: result.slot,
        delta: result.delta,
        appliedDelta: result.appliedDelta,
        slotDelta: result.slotDelta,
        baseSlotDelta: result.baseSlotDelta,
        onFireAtLand: result.onFireAtLand,
        multiplier: result.multiplier,
        triggersMinigame: result.triggersMinigame,
        minigameSkipped: result.minigameSkipped || false,
        minigameKind: result.minigameKind,
        minigameStart: result.minigameStart || null,
        scores: result.scores,
        round: result.round,
        phase: result.phase,
        advanceKind: result.advanceKind,
      });

      if (result.triggersMinigame) {
        scheduleMinigameArm(broadcast);
      } else {
        scheduleAdvance(broadcast);
      }

      res.json({ success: true, ...result });
    });

    app.post('/api/reset', (req, res) => {
      clearAllTimers();
      game.resetAll();
      console.log('[Plinko][API] Partie réinitialisée');
      broadcast({ type: 'RESET', state: game.getState() });
      broadcast({
        type: 'BOARD_READY',
        state: game.getState(),
        board: game.board,
        round: game.round,
        seed: game.boardSeed,
      });
      res.json({ success: true, state: game.getState() });
    });

    app.get('/api/state', (req, res) => {
      res.json({ success: true, state: game.getState() });
    });
  },
});

listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║          🪙  PLINKO — Jeu actif              ║');
  console.log(`║   HTTP + WS  →  http://0.0.0.0:${PORT}          ║`);
  console.log(`║   Joueurs    →  ${game.playerCount}                              ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
