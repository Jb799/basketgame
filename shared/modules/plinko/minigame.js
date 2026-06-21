/**
 * minigame — Layout et tirage aléatoire pour mini-jeux Couteau / Voleur.
 * Module pur : pas de scoring ni I/O réseau.
 */

const { createRng } = require('./rng');

const MINIGAME_PERCENTS = [5, 10, 15, 20, 25];
const MIN_PERCENT = MINIGAME_PERCENTS[0];
const MAX_PERCENT = MINIGAME_PERCENTS[MINIGAME_PERCENTS.length - 1];

/** @deprecated Utiliser MINIGAME_PERCENTS */
const MINIGAME_AMOUNTS = MINIGAME_PERCENTS;

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
 * @returns {number} 5, 10, 15, 20 ou 25 (pourcentage entier)
 */
function rollMinigamePercent(rng) {
  const idx = Math.floor(rng() * MINIGAME_PERCENTS.length);
  return MINIGAME_PERCENTS[idx];
}

/**
 * Convertit un pourcentage en pièces entières (plancher 1 si la victime a des pièces).
 * @param {number} victimBalance
 * @param {number} percent
 * @returns {number}
 */
function resolveMinigameCoins(victimBalance, percent) {
  const balance = Math.max(0, Number(victimBalance));
  const pct = Number(percent);
  if (!balance || !pct) return 0;
  const raw = Math.round(balance * pct / 100);
  return Math.max(1, Math.min(raw, balance));
}

/** @deprecated Utiliser rollMinigamePercent + resolveMinigameCoins */
function rollMinigameAmount(rng) {
  return rollMinigamePercent(rng);
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
  MINIGAME_PERCENTS,
  MINIGAME_AMOUNTS,
  MIN_PERCENT,
  MAX_PERCENT,
  generateMinigameLayout,
  rollMinigamePercent,
  rollMinigameAmount,
  resolveMinigameCoins,
  resolveMinigameColumn,
};
