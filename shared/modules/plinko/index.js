/**
 * plinko — Génération de plateau et simulation de chute (style casino).
 */

const {
  generateBoard,
  ZONE_DROP,
  ZONE_SLOTS,
  SIDE_MARGIN,
  PEGS_PER_ROW,
  MIN_SLOT_WIDTH,
} = require('./board-generator');
const { simulateDrop, simulateDropSeeded, resolveSlot, FIRE_STREAK_MIN } = require('./simulator');
const { createRng } = require('./rng');
const {
  MINIGAME_PERCENTS,
  MINIGAME_AMOUNTS,
  MIN_PERCENT,
  MAX_PERCENT,
  generateMinigameLayout,
  rollMinigamePercent,
  rollMinigameAmount,
  resolveMinigameCoins,
  resolveMinigameColumn,
} = require('./minigame');

module.exports = {
  generateBoard,
  simulateDrop,
  simulateDropSeeded,
  resolveSlot,
  createRng,
  ZONE_DROP,
  ZONE_SLOTS,
  SIDE_MARGIN,
  PEGS_PER_ROW,
  MIN_SLOT_WIDTH,
  FIRE_STREAK_MIN,
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
