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
  MINIGAME_AMOUNTS,
  MIN_AMOUNT,
  MAX_AMOUNT,
  generateMinigameLayout,
  rollMinigameAmount,
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
  MINIGAME_AMOUNTS,
  MIN_AMOUNT,
  MAX_AMOUNT,
  generateMinigameLayout,
  rollMinigameAmount,
  resolveMinigameColumn,
};
