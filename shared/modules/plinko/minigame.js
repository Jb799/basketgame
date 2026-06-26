/**
 * minigame — Layout et tirage aléatoire pour mini-jeux Couteau / Voleur / Panier d'Or.
 * Module pur : pas de scoring ni I/O réseau.
 */

const { createRng } = require('./rng');

const GOLDEN_BASKET_MIN = 50;
const GOLDEN_BASKET_MAX = 100;
const GOLDEN_BASKET_PERIOD_MS = 9000;

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

/**
 * @param {() => number} rng
 * @returns {number} 50–100 pièces (entier)
 */
function rollGoldenBasketCoins(rng) {
  return GOLDEN_BASKET_MIN + Math.floor(rng() * (GOLDEN_BASKET_MAX - GOLDEN_BASKET_MIN + 1));
}

/**
 * Colonne du panier d'or à un instant donné (ping-pong fluide, arrondi à la colonne la plus proche).
 * @param {number} elapsedMs
 * @param {number} [periodMs=GOLDEN_BASKET_PERIOD_MS]
 * @param {number} [colCount=7]
 * @returns {number} index colonne 0 … colCount-1
 */
function getGoldenColAt(elapsedMs, periodMs = GOLDEN_BASKET_PERIOD_MS, colCount = 7) {
  const maxCol = colCount - 1;
  if (maxCol <= 0) return 0;

  const cycle = ((elapsedMs % periodMs) + periodMs) % periodMs;
  const half = periodMs / 2;
  const t = cycle / half;
  const pos = t <= 1 ? t * maxCol : (2 - t) * maxCol;
  return Math.round(pos);
}

/**
 * @param {number} seed
 * @param {number} [columnCount=7]
 * @returns {{ seed: number, coinReward: number, periodMs: number, columnCount: number }}
 */
function generateGoldenBasketConfig(seed, columnCount = 7) {
  const rng = createRng(seed);
  return {
    seed,
    coinReward: rollGoldenBasketCoins(rng),
    periodMs: GOLDEN_BASKET_PERIOD_MS,
    columnCount,
  };
}

module.exports = {
  GOLDEN_BASKET_MIN,
  GOLDEN_BASKET_MAX,
  GOLDEN_BASKET_PERIOD_MS,
  MINIGAME_PERCENTS,
  MINIGAME_AMOUNTS,
  MIN_PERCENT,
  MAX_PERCENT,
  generateMinigameLayout,
  generateGoldenBasketConfig,
  rollMinigamePercent,
  rollMinigameAmount,
  rollGoldenBasketCoins,
  getGoldenColAt,
  resolveMinigameCoins,
  resolveMinigameColumn,
};
