/**
 * grid7 — Grille à colonnes pour la plateforme BasketGame.
 *
 * Module pur, sans dépendance ni I/O. Gère une grille `rows × cols` (cols = 7
 * par défaut, la contrainte matérielle de la plateforme) où les jetons tombent
 * par gravité dans la rangée libre la plus basse d'une colonne.
 *
 * Réutilisable par tout jeu à colonnes (Puissance 4, empilement, etc.).
 */

const { PLATFORM_COLUMNS } = require('../../constants');

class Grid {
  /**
   * @param {object} options
   * @param {number} options.rows - Nombre de rangées.
   * @param {number} [options.cols=PLATFORM_COLUMNS] - Nombre de colonnes.
   */
  constructor({ rows, cols = PLATFORM_COLUMNS }) {
    this.rows = rows;
    this.cols = cols;
    this.reset();
  }

  reset() {
    // board[row][col] = null | valeur de jeton (ex: 1 | 2)
    this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
  }

  /**
   * Indique si une colonne est dans les limites de la grille.
   */
  isValidColumn(col) {
    return Number.isInteger(col) && col >= 0 && col < this.cols;
  }

  /**
   * Retourne la rangée libre la plus basse d'une colonne, ou -1 si pleine.
   */
  lowestFreeRow(col) {
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.board[r][col] === null) return r;
    }
    return -1;
  }

  isColumnFull(col) {
    return this.lowestFreeRow(col) === -1;
  }

  isFull() {
    return this.board[0].every((cell) => cell !== null);
  }

  /**
   * Pose une valeur dans une colonne (gravité).
   * @returns {{ ok: boolean, row?: number, error?: string }}
   */
  drop(col, value) {
    if (!this.isValidColumn(col)) {
      return { ok: false, error: 'INVALID_COLUMN' };
    }
    const row = this.lowestFreeRow(col);
    if (row === -1) {
      return { ok: false, error: 'COLUMN_FULL' };
    }
    this.board[row][col] = value;
    return { ok: true, row };
  }

  get(row, col) {
    return this.board[row][col];
  }
}

module.exports = { Grid };
