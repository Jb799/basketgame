/**
 * board-generator — Génération aléatoire d'un plateau Plinko pleine largeur.
 *
 * Coordonnées x/y normalisées sur tout le board (0–1).
 * Zone drop en haut (7 col physiques), clous sur toute la largeur, cases en bas.
 */

const { createRng } = require('./rng');

const ZONE_DROP = 0.06;
const ZONE_SLOTS = 0.14;
const SIDE_MARGIN = 0.04;
const PEGS_PER_ROW = 11;
const MIN_SLOT_WIDTH = 8;
const SLOT_TYPES = ['coin', 'bomb', 'neutral', 'knife', 'thief'];
const SLOT_WEIGHTS = [0.5, 0.22, 0.13, 0.075, 0.075];
const BOMB_SIZES = ['small', 'medium', 'large'];
const BOMB_SIZE_WEIGHTS = [0.5, 0.35, 0.15];

function pickWeighted(rng, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Tirage uniforme parmi les multiples de 5 entre min et max (inclus). */
function randomMultipleOf5(rng, min, max) {
  const start = Math.ceil(min / 5) * 5;
  const end = Math.floor(max / 5) * 5;
  if (start > end) return start;
  const steps = (end - start) / 5 + 1;
  return start + Math.floor(rng() * steps) * 5;
}

function coinIconCount(value) {
  if (value <= 5) return 1;
  if (value <= 15) return 2;
  if (value <= 30) return 3;
  if (value <= 40) return 4;
  return 5;
}

function generateSlot(rng) {
  const type = pickWeighted(rng, SLOT_TYPES, SLOT_WEIGHTS);

  if (type === 'neutral') {
    return { type, value: 0, width: 0, iconCount: 0, size: null };
  }

  if (type === 'coin') {
    const value = randomMultipleOf5(rng, 5, 50);
    return { type, value, width: 0, iconCount: coinIconCount(value), size: null };
  }

  if (type === 'knife' || type === 'thief') {
    return { type, value: 0, width: 0, iconCount: 0, size: null };
  }

  const size = pickWeighted(rng, BOMB_SIZES, BOMB_SIZE_WEIGHTS);
  const ranges = { small: [5, 10], medium: [15, 20], large: [25, 30] };
  const [min, max] = ranges[size];
  const value = -randomMultipleOf5(rng, min, max);
  return { type, value, width: 0, iconCount: 0, size };
}

function distributeWidths(rng, count, minWidth) {
  const remaining = 100 - minWidth * count;
  const extras = Array.from({ length: count }, () => rng());
  const extraSum = extras.reduce((a, b) => a + b, 0) || 1;
  return extras.map((e) => minWidth + Math.round((e / extraSum) * remaining));
}

function fixWidthSum(widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum === 100) return widths;
  const copy = [...widths];
  copy[copy.length - 1] += 100 - sum;
  return copy;
}

/**
 * Position X normalisée d'un clou dans une rangée.
 */
function pegX(index, countInRow, row) {
  const usable = 1 - 2 * SIDE_MARGIN;
  const isOddRow = row % 2 === 1;
  const offset = isOddRow ? 0.5 : 0;
  return SIDE_MARGIN + ((index + 0.5 + offset) / PEGS_PER_ROW) * usable;
}

/**
 * Position Y normalisée d'une rangée de clous.
 */
function pegY(row, pegRows) {
  const pegsTop = ZONE_DROP;
  const pegsHeight = 1 - ZONE_DROP - ZONE_SLOTS;
  return pegsTop + ((row + 1) / (pegRows + 1)) * pegsHeight;
}

/**
 * @param {number} seed
 * @param {object} [options]
 * @returns {object} board
 */
function generateBoard(seed, options = {}) {
  const rng = createRng(seed);
  const pegRows = randomInt(rng, 14, 16);
  const pegsPerRow = options.pegsPerRow || PEGS_PER_ROW;
  const slotCount = randomInt(rng, 6, 10);
  const platformCols = options.platformCols || 7;

  let widths = fixWidthSum(distributeWidths(rng, slotCount, MIN_SLOT_WIDTH));
  const slots = [];
  let offset = 0;

  for (let i = 0; i < slotCount; i++) {
    const slot = generateSlot(rng);
    slot.width = widths[i];
    slot.x = (offset + widths[i] / 2) / 100;
    slot.index = i;
    offset += widths[i];
    slots.push(slot);
  }

  const pegs = [];
  let pegId = 0;

  for (let row = 0; row < pegRows; row++) {
    const isOddRow = row % 2 === 1;
    const countInRow = isOddRow ? pegsPerRow - 1 : pegsPerRow;

    for (let i = 0; i < countInRow; i++) {
      pegs.push({
        id: pegId++,
        row,
        index: i,
        x: pegX(i, countInRow, row),
        y: pegY(row, pegRows),
      });
    }
  }

  const entryXs = [];
  for (let c = 0; c < platformCols; c++) {
    entryXs.push((c + 0.5) / platformCols);
  }

  return {
    seed,
    zones: {
      drop: ZONE_DROP,
      slots: ZONE_SLOTS,
      pegsTop: ZONE_DROP,
      pegsBottom: ZONE_SLOTS,
      sideMargin: SIDE_MARGIN,
    },
    pegsPerRow,
    pegRows,
    pegs,
    slots,
    entryXs,
    platformCols,
  };
}

module.exports = {
  generateBoard,
  ZONE_DROP,
  ZONE_SLOTS,
  SIDE_MARGIN,
  PEGS_PER_ROW,
  MIN_SLOT_WIDTH,
  pegX,
  pegY,
};
