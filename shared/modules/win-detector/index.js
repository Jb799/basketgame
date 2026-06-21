/**
 * win-detector — Détection d'alignements sur une grille.
 *
 * Module pur, sans dépendance. Cherche, à partir d'une cellule jouée, un
 * alignement d'au moins `winLength` jetons identiques dans les 4 axes
 * (horizontal, vertical, deux diagonales). Les dimensions de la grille sont
 * déduites du tableau `board`.
 *
 * Réutilisable par Puissance 4 et tout jeu d'alignement à longueur configurable.
 */

const DIRECTIONS = [
  [0, 1],   // horizontal →
  [1, 0],   // vertical ↓
  [1, 1],   // diagonale ↘
  [1, -1],  // diagonale ↙
];

/**
 * @param {Array<Array<*>>} board - Grille board[row][col].
 * @param {number} row - Rangée du dernier jeton posé.
 * @param {number} col - Colonne du dernier jeton posé.
 * @param {object} options
 * @param {number} options.winLength - Nombre de jetons à aligner pour gagner.
 * @returns {Array<[number, number]>} Cellules gagnantes (vide si aucune).
 */
function findWinningLine(board, row, col, { winLength }) {
  const rows = board.length;
  const cols = board[0].length;
  const player = board[row][col];
  if (player === null || player === undefined) return [];

  for (const [dr, dc] of DIRECTIONS) {
    const cells = collectAligned(board, row, col, dr, dc, player, rows, cols, winLength);
    if (cells.length >= winLength) {
      return cells.slice(0, winLength);
    }
  }
  return [];
}

function collectAligned(board, row, col, dr, dc, player, rows, cols, winLength) {
  const cells = [[row, col]];

  for (let i = 1; i < winLength; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === player) {
      cells.push([r, c]);
    } else break;
  }

  for (let i = 1; i < winLength; i++) {
    const r = row - dr * i;
    const c = col - dc * i;
    if (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === player) {
      cells.unshift([r, c]);
    } else break;
  }

  return cells;
}

module.exports = { findWinningLine };
