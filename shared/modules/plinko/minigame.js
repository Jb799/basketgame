/**
 * minigame — Layout et tirage aléatoire pour mini-jeux Couteau / Voleur.
 * Module pur : pas de scoring ni I/O réseau.
 */

const { createRng } = require('./rng');

const MINIGAME_AMOUNTS = [5, 10, 15, 20];
const MIN_AMOUNT = MINIGAME_AMOUNTS[0];
const MAX_AMOUNT = MINIGAME_AMOUNTS[MINIGAME_AMOUNTS.length - 1];

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Génère le layout du mini-jeu : 7 colonnes avec tous les autres joueurs + trous.
 * @param {number} seed
 * @param {number} activePlayer
 * @param {number[]} allPlayers
 * @param {number} [columnCount=7]
 * @returns {{ seed: number, columns: Array<{ col: number, type: 'hole'|'player', player?: number }> }}
 */
function generateMinigameLayout(seed, activePlayer, allPlayers, columnCount = 7) {
  const rng = createRng(seed);
  const active = Number(activePlayer);
  const others = allPlayers.filter((p) => Number(p) !== active);

  const cells = others.map((player) => ({ type: 'player', player }));
  while (cells.length < columnCount) {
    cells.push({ type: 'hole' });
  }

  shuffleInPlace(cells, rng);

  const columns = cells.map((cell, col) => ({
    col,
    type: cell.type,
    ...(cell.type === 'player' ? { player: cell.player } : {}),
  }));

  return { seed, columns };
}

/**
 * @param {() => number} rng
 * @returns {number} 5, 10, 15 ou 20
 */
function rollMinigameAmount(rng) {
  const idx = Math.floor(rng() * MINIGAME_AMOUNTS.length);
  return MINIGAME_AMOUNTS[idx];
}

/**
 * Résout une colonne du mini-jeu.
 * @param {Array} columns
 * @param {number} col
 */
function resolveMinigameColumn(columns, col) {
  if (!Array.isArray(columns) || col < 0) {
    return null;
  }
  const byCol = columns.find((c) => Number(c.col) === Number(col));
  if (byCol) return byCol;
  if (col < columns.length) return columns[col] || null;
  return null;
}

module.exports = {
  MINIGAME_AMOUNTS,
  MIN_AMOUNT,
  MAX_AMOUNT,
  generateMinigameLayout,
  rollMinigameAmount,
  resolveMinigameColumn,
};
