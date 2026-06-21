/**
 * game.js — Logique du jeu Plinko.
 */

const { PLATFORM_COLUMNS } = require('../../../shared/constants');
const { parseStartParams } = require('../../../shared/server/parseStartParams');
const {
  generateBoard,
  simulateDropSeeded,
  generateMinigameLayout,
  rollMinigameAmount,
  resolveMinigameColumn,
  createRng,
} = require('../../../shared/modules/plinko');
const { TurnManager } = require('../../../shared/modules/turn-manager');
const { Scoring } = require('../../../shared/modules/scoring');
const { parseRoster } = require('../../../shared/server/parseRoster');

const TOTAL_ROUNDS = 5;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

const MINIGAME_KINDS = ['knife', 'thief'];

function emptyStats() {
  return {
    drops: 0,
    bombsHit: 0,
    coinsWon: 0,
    coinsLost: 0,
    bestDrop: 0,
    worstDrop: 0,
    neutralHits: 0,
    knivesHit: 0,
    thievesHit: 0,
    minigameHits: 0,
    minigameCoinsTaken: 0,
    minigameCoinsStolen: 0,
  };
}

function isMinigamePhase(phase) {
  return phase === 'minigame_knife' || phase === 'minigame_thief';
}

class Game {
  constructor() {
    const params = parseStartParams();
    const count = this._clampPlayerCount(params.playerCount);
    this.playerCount = count;
    this.players = Array.from({ length: count }, (_, i) => i + 1);
    this.turns = new TurnManager(this.players);
    this.scoring = new Scoring({ players: this.players });
    this.roster = parseRoster(); // profils joueurs choisis (slot, pseudo, photos)
    this.totalRounds = TOTAL_ROUNDS;
    this._seedCounter = Date.now();
    this.pendingAdvance = null;
    this.pendingMinigameArm = null;
    this.minigame = null;
    this.resetAll();
  }

  _clampPlayerCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return MIN_PLAYERS;
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(n)));
  }

  _nextSeed() {
    this._seedCounter += 1;
    return this._seedCounter;
  }

  _initStats() {
    this.stats = {};
    for (const p of this.players) {
      this.stats[p] = emptyStats();
    }
  }

  _generateBoard() {
    const seed = this._nextSeed();
    this.board = generateBoard(seed, { platformCols: PLATFORM_COLUMNS });
    this.boardSeed = seed;
  }

  _clearMinigame() {
    this.minigame = null;
  }

  resetAll() {
    this.phase = 'playing';
    this.round = 1;
    this.playersPlayedThisRound = 0;
    this.lastDrop = null;
    this.ranking = null;
    this.roundScoresSnapshot = null;
    this.pendingAdvance = null;
    this.pendingMinigameArm = null;
    this._clearMinigame();
    this.scoring.reset();
    this.turns = new TurnManager(this.players);
    this._initStats();
    this._generateBoard();
  }

  get currentPlayer() {
    return this.turns.current;
  }

  get scores() {
    return this.scoring.scores;
  }

  _updateStats(player, delta, slot) {
    const s = this.stats[player];
    s.drops += 1;
    if (slot.type === 'bomb') s.bombsHit += 1;
    if (slot.type === 'neutral') s.neutralHits += 1;
    if (slot.type === 'knife') s.knivesHit += 1;
    if (slot.type === 'thief') s.thievesHit += 1;
    if (delta > 0) {
      s.coinsWon += delta;
      if (delta > s.bestDrop) s.bestDrop = delta;
    } else if (delta < 0) {
      s.coinsLost += Math.abs(delta);
      if (s.worstDrop === 0 || delta < s.worstDrop) s.worstDrop = delta;
    }
  }

  _updateMinigameStats(activePlayer, victim, appliedToVictim, appliedToAttacker, kind) {
    const attackerStats = this.stats[activePlayer];
    if (appliedToVictim !== 0) {
      attackerStats.minigameHits += 1;
    }
    if (kind === 'knife' && appliedToVictim < 0) {
      attackerStats.minigameCoinsTaken += Math.abs(appliedToVictim);
      const victimStats = this.stats[victim];
      victimStats.coinsLost += Math.abs(appliedToVictim);
    }
    if (kind === 'thief' && appliedToAttacker > 0) {
      attackerStats.minigameCoinsStolen += appliedToAttacker;
      attackerStats.coinsWon += appliedToAttacker;
      const victimStats = this.stats[victim];
      victimStats.coinsLost += appliedToAttacker;
    }
  }

  _computeAdvance() {
    const nextPlayed = this.playersPlayedThisRound + 1;

    if (nextPlayed >= this.players.length) {
      if (this.round >= this.totalRounds) {
        return { kind: 'game_over' };
      }
      return { kind: 'round_end' };
    }

    return { kind: 'turn_change', nextPlayer: this._peekNextPlayer() };
  }

  _peekNextPlayer() {
    const idx = this.turns.players.indexOf(this.turns.current);
    const nextIdx = (idx + 1) % this.turns.players.length;
    return this.turns.players[nextIdx];
  }

  _prepareMinigameArm(kind, activePlayer) {
    const seed = this._nextSeed();
    const layout = generateMinigameLayout(seed, activePlayer, this.players, PLATFORM_COLUMNS);
    return {
      kind,
      activePlayer,
      seed,
      columns: layout.columns,
    };
  }

  _buildMinigameStartFromArm(arm) {
    if (!arm) return null;
    return {
      type: 'MINIGAME_START',
      kind: arm.kind,
      activePlayer: arm.activePlayer,
      columns: arm.columns,
      seed: arm.seed,
      round: this.round,
      scores: { ...this.scoring.scores },
    };
  }

  /**
   * Active le mini-jeu après la chute principale (appelé par le serveur une fois l'animation écoulée).
   */
  armPendingMinigame() {
    if (!this.pendingMinigameArm) return null;

    const arm = this.pendingMinigameArm;
    this.pendingMinigameArm = null;
    this.minigame = {
      kind: arm.kind,
      activePlayer: arm.activePlayer,
      seed: arm.seed,
      columns: arm.columns,
    };
    this.phase = arm.kind === 'knife' ? 'minigame_knife' : 'minigame_thief';
    return this._buildMinigameStartMessage();
  }

  _startMinigame(kind, activePlayer) {
    const seed = this._nextSeed();
    const layout = generateMinigameLayout(seed, activePlayer, this.players, PLATFORM_COLUMNS);
    this.minigame = {
      kind,
      activePlayer,
      seed,
      columns: layout.columns,
    };
    this.phase = kind === 'knife' ? 'minigame_knife' : 'minigame_thief';
  }

  _buildMinigameStartMessage() {
    if (!this.minigame) return null;
    return {
      type: 'MINIGAME_START',
      kind: this.minigame.kind,
      activePlayer: this.minigame.activePlayer,
      columns: this.minigame.columns,
      seed: this.minigame.seed,
      round: this.round,
      scores: { ...this.scoring.scores },
    };
  }

  applyPendingAdvance() {
    if (!this.pendingAdvance) return null;

    const advance = this.pendingAdvance;
    this.pendingAdvance = null;
    this.playersPlayedThisRound += 1;
    this._clearMinigame();

    if (advance.kind === 'turn_change') {
      this.turns.next();
      this.phase = 'playing';
      return {
        type: 'TURN_CHANGE',
        currentPlayer: this.currentPlayer,
        playersPlayedThisRound: this.playersPlayedThisRound,
        round: this.round,
        scores: { ...this.scoring.scores },
      };
    }

    if (advance.kind === 'round_end') {
      this.phase = 'round_summary';
      this.roundScoresSnapshot = { ...this.scoring.scores };
      return {
        type: 'ROUND_END',
        round: this.round,
        roundScores: this.roundScoresSnapshot,
        scores: { ...this.scoring.scores },
        stats: this.stats,
        totalRounds: this.totalRounds,
      };
    }

    if (advance.kind === 'game_over') {
      this.phase = 'game_over';
      this.ranking = this._buildRanking();
      return {
        type: 'GAME_OVER',
        ranking: this.ranking,
        stats: this.stats,
        scores: { ...this.scoring.scores },
        podium: this.ranking.slice(0, 3),
      };
    }

    return null;
  }

  continueFromRoundSummary() {
    if (this.phase !== 'round_summary') {
      return { success: false, error: 'NOT_ROUND_SUMMARY' };
    }
    this.round += 1;
    this.playersPlayedThisRound = 0;
    this.turns.reset();
    this._generateBoard();
    this.phase = 'board_transition';
    this.roundScoresSnapshot = null;
    this._clearMinigame();
    this.pendingMinigameArm = null;
    return { success: true, state: this.getState() };
  }

  /**
   * Applique un delta de pièces sans descendre sous zéro.
   * @returns {number} delta réellement appliqué
   */
  _applyCoinDelta(player, delta) {
    if (!delta) return 0;
    const p = Number(player);
    const current = this.scoring.get(p);
    let applied = delta;
    if (delta < 0) {
      applied = Math.max(delta, -current);
    }
    if (applied !== 0) {
      this.scoring.addPoints(p, applied);
    }
    return applied;
  }

  /**
   * Vol : retire min(tirage, solde victime) à la victime et crédite le voleur du même montant.
   */
  _stealCoins(thief, victim, rolledAmount) {
    const thiefId = Number(thief);
    const victimId = Number(victim);
    const rolled = Number(rolledAmount);
    if (!rolled || rolled <= 0) {
      return { rolledAmount: rolled, resolvedAmount: 0, appliedToVictim: 0, appliedToAttacker: 0 };
    }

    const victimBalance = this.scoring.get(victimId);
    const stolen = Math.min(rolled, victimBalance);
    if (stolen <= 0) {
      return { rolledAmount: rolled, resolvedAmount: 0, appliedToVictim: 0, appliedToAttacker: 0 };
    }

    this.scoring.addPoints(victimId, -stolen);
    this.scoring.addPoints(thiefId, stolen);

    return {
      rolledAmount: rolled,
      resolvedAmount: stolen,
      appliedToVictim: -stolen,
      appliedToAttacker: stolen,
    };
  }

  _resolveMinigameHit(kind, activePlayer, targetPlayer, rolledAmount) {
    const rolled = Number(rolledAmount);
    if (kind === 'thief') {
      return this._stealCoins(activePlayer, targetPlayer, rolled);
    }

    const appliedToVictim = this._applyCoinDelta(targetPlayer, -rolled);
    return {
      rolledAmount: rolled,
      resolvedAmount: Math.abs(appliedToVictim),
      appliedToVictim,
      appliedToAttacker: 0,
    };
  }

  _buildRanking() {
    return [...this.players]
      .map((p) => ({
        player: p,
        score: this.scoring.get(p),
        stats: { ...this.stats[p] },
      }))
      .sort((a, b) => b.score - a.score);
  }

  dropBall(col) {
    if (this.phase === 'game_over') {
      return { success: false, error: 'GAME_OVER' };
    }
    if (this.phase === 'resolving') {
      return { success: false, error: 'RESOLVING' };
    }
    if (this.phase === 'round_summary') {
      return { success: false, error: 'ROUND_SUMMARY' };
    }
    if (this.phase === 'board_transition') {
      return { success: false, error: 'BOARD_TRANSITION' };
    }
    if (isMinigamePhase(this.phase)) {
      return { success: false, error: 'MINIGAME_ACTIVE' };
    }

    if (!Number.isInteger(col) || col < 0 || col >= PLATFORM_COLUMNS) {
      return { success: false, error: 'INVALID_COLUMN' };
    }

    const droppingPlayer = this.currentPlayer;
    const dropSeed = this._nextSeed();
    const simulation = simulateDropSeeded(col, this.board, dropSeed);
    const slot = simulation.slot;
    const triggersMinigame = MINIGAME_KINDS.includes(slot.type);

    const onFireAtLand = triggersMinigame ? false : simulation.onFireAtLand;
    const baseSlotDelta = simulation.delta;
    const slotDelta = onFireAtLand && baseSlotDelta !== 0 ? baseSlotDelta * 2 : baseSlotDelta;
    const appliedDelta = triggersMinigame ? 0 : this._applyCoinDelta(droppingPlayer, slotDelta);
    this._updateStats(droppingPlayer, appliedDelta, slot);

    this.phase = 'resolving';

    let minigameArm = null;
    if (triggersMinigame) {
      minigameArm = this._prepareMinigameArm(slot.type, droppingPlayer);
      this.pendingMinigameArm = minigameArm;
    } else {
      this.pendingAdvance = this._computeAdvance();
    }

    const drop = {
      player: droppingPlayer,
      droppingPlayer,
      entryCol: col,
      path: simulation.path,
      slotIndex: simulation.slotIndex,
      slot,
      delta: slotDelta,
      appliedDelta,
      slotDelta,
      baseSlotDelta,
      onFireAtLand,
      multiplier: onFireAtLand && baseSlotDelta !== 0 ? 2 : 1,
      dropSeed,
      triggersMinigame,
      minigameKind: triggersMinigame ? slot.type : null,
      scores: { ...this.scoring.scores },
      round: this.round,
      phase: this.phase,
      advanceKind: this.pendingAdvance?.kind || null,
    };

    this.lastDrop = drop;

    return {
      success: true,
      ...drop,
      minigameStart: triggersMinigame ? this._buildMinigameStartFromArm(minigameArm) : null,
    };
  }

  minigameDrop(col) {
    if (!isMinigamePhase(this.phase) || !this.minigame) {
      return { success: false, error: 'NOT_MINIGAME' };
    }
    if (this.phase === 'resolving') {
      return { success: false, error: 'RESOLVING' };
    }

    if (!Number.isInteger(col) || col < 0 || col >= PLATFORM_COLUMNS) {
      return { success: false, error: 'INVALID_COLUMN' };
    }

    const { kind, activePlayer, columns } = this.minigame;
    const cell = resolveMinigameColumn(columns, col);
    if (!cell) {
      return { success: false, error: 'INVALID_COLUMN' };
    }

    const rng = createRng(this._nextSeed());
    let rolledAmount = 0;
    let resolvedAmount = 0;
    let targetType = cell.type;
    let targetPlayer = cell.player || null;
    let appliedToVictim = 0;
    let appliedToAttacker = 0;

    if (cell.type === 'player' && targetPlayer) {
      rolledAmount = rollMinigameAmount(rng);
      const hit = this._resolveMinigameHit(kind, activePlayer, targetPlayer, rolledAmount);
      rolledAmount = hit.rolledAmount;
      resolvedAmount = hit.resolvedAmount;
      appliedToVictim = hit.appliedToVictim;
      appliedToAttacker = hit.appliedToAttacker;
      this._updateMinigameStats(activePlayer, targetPlayer, appliedToVictim, appliedToAttacker, kind);
    }

    this.pendingAdvance = this._computeAdvance();
    this.phase = 'resolving';

    const result = {
      success: true,
      type: 'MINIGAME_RESULT',
      kind,
      activePlayer,
      targetCol: col,
      targetType,
      targetPlayer,
      rolledAmount,
      resolvedAmount,
      appliedToVictim,
      appliedToAttacker,
      scores: { ...this.scoring.scores },
      round: this.round,
      phase: this.phase,
      advanceKind: this.pendingAdvance.kind,
    };

    this.lastDrop = { ...this.lastDrop, minigameResult: result };
    return result;
  }

  getState() {
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      currentPlayer: this.currentPlayer,
      playerCount: this.playerCount,
      players: this.players,
      roster: this.roster,
      playersPlayedThisRound: this.playersPlayedThisRound,
      scores: { ...this.scoring.scores },
      board: this.board,
      boardSeed: this.boardSeed,
      stats: this.stats,
      lastDrop: this.lastDrop,
      ranking: this.ranking,
      roundScoresSnapshot: this.roundScoresSnapshot,
      minigame: this.minigame
        ? {
            kind: this.minigame.kind,
            activePlayer: this.minigame.activePlayer,
            columns: this.minigame.columns,
            seed: this.minigame.seed,
          }
        : null,
    };
  }
}

module.exports = { Game, TOTAL_ROUNDS };
