/**
 * game.js — Logique du jeu Puissance 4.
 *
 * Compose les modules partagés de la plateforme plutôt que de réimplémenter la
 * grille, l'alternance des tours, le scoring ou la détection d'alignement :
 *   - shared/modules/grid7        → grille 7 colonnes + gravité
 *   - shared/modules/turn-manager → alternance joueur 1 / joueur 2
 *   - shared/modules/win-detector → détection de 4 alignés
 *   - shared/modules/scoring      → scores + persistance disque
 *   - shared/modules/series       → gagnant de la série (premier à 5)
 */

const path = require('path');
const { PLATFORM_COLUMNS } = require('../../../shared/constants');
const { Grid } = require('../../../shared/modules/grid7');
const { TurnManager } = require('../../../shared/modules/turn-manager');
const { findWinningLine } = require('../../../shared/modules/win-detector');
const { Scoring } = require('../../../shared/modules/scoring');
const { getSeriesWinner } = require('../../../shared/modules/series');
const { parseRoster } = require('../../../shared/server/parseRoster');

const COLS = PLATFORM_COLUMNS; // 7 colonnes (contrainte matérielle plateforme)
const ROWS = 6;
const WIN_LENGTH = 4;
const SERIES_WIN_TARGET = 5;

const SCORES_FILE = path.join(__dirname, 'scores.json');

class Game {
  constructor() {
    this.grid = new Grid({ rows: ROWS, cols: COLS });
    this.turns = new TurnManager([1, 2]);
    this.scoring = new Scoring({ players: [1, 2], file: SCORES_FILE });
    this.roster = parseRoster(); // profils joueurs choisis (slot, pseudo, photos)
    this.resetRound();
  }

  /**
   * Réinitialise la manche en cours (les scores et le gagnant de série sont
   * conservés tant que la série n'est pas terminée).
   */
  resetRound() {
    this.grid.reset();
    this.turns.reset();
    this.winner = null;
    this.winningCells = [];
    this.isDraw = false;
    this.isOver = false;
    this.moveCount = 0;
    this.lastMove = null;
  }

  /**
   * Réinitialisation totale : manche + scores + série.
   * seriesWinner est un getter dérivé des scores — scoring.reset() suffit.
   */
  resetAll() {
    this.resetRound();
    this.scoring.reset();
  }

  get board() {
    return this.grid.board;
  }

  get currentPlayer() {
    return this.turns.current;
  }

  get scores() {
    return this.scoring.scores;
  }

  get seriesWinner() {
    return getSeriesWinner(this.scoring.scores, SERIES_WIN_TARGET);
  }

  /**
   * Tente de poser un jeton dans la colonne donnée.
   * @param {number} col - Index de colonne (0-6).
   */
  dropToken(col) {
    if (this.seriesWinner) {
      return { success: false, error: 'SERIES_OVER' };
    }
    if (this.isOver) {
      return { success: false, error: 'GAME_OVER' };
    }

    const player = this.currentPlayer;
    const result = this.grid.drop(col, player);
    if (!result.ok) {
      return { success: false, error: result.error };
    }

    const row = result.row;
    this.moveCount++;
    this.lastMove = { row, col, player };

    const winning = findWinningLine(this.grid.board, row, col, { winLength: WIN_LENGTH });
    if (winning.length > 0) {
      this.winner = player;
      this.winningCells = winning;
      this.isOver = true;
      this.scoring.addWin(player);
      return {
        success: true,
        row,
        col,
        player,
        gameOver: true,
        winner: player,
        winningCells: winning,
        seriesWinner: this.seriesWinner,
      };
    }

    if (this.grid.isFull()) {
      this.isDraw = true;
      this.isOver = true;
      return { success: true, row, col, player, gameOver: true, isDraw: true };
    }

    this.turns.next();

    return {
      success: true,
      row,
      col,
      player,
      gameOver: false,
      currentPlayer: this.currentPlayer,
    };
  }

  /**
   * Retourne l'état complet du jeu pour diffusion WebSocket.
   */
  getState() {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer,
      winner: this.winner,
      winningCells: this.winningCells,
      isDraw: this.isDraw,
      isOver: this.isOver,
      moveCount: this.moveCount,
      scores: this.scores,
      seriesWinner: this.seriesWinner,
      lastMove: this.lastMove,
      roster: this.roster,
    };
  }
}

module.exports = { Game, COLS, ROWS, WIN_LENGTH, SERIES_WIN_TARGET };
