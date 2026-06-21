/**
 * simulator — Simulation discrète Plinko alignée sur le rendu client.
 *
 * Déflexion réaliste (pas 50/50 pur) :
 * - angle d'approche par rapport au centre du clou
 * - élan latéral (tendance à continuer dans la même direction)
 * - légère attraction vers le centre
 * - bruit aléatoire
 */

const { createRng } = require('./rng');
const { SIDE_MARGIN, PEGS_PER_ROW, ZONE_DROP, ZONE_SLOTS } = require('./board-generator');

const FIRE_STREAK_MIN = 3;

function indexToNormalizedX(index) {
  const usable = 1 - 2 * SIDE_MARGIN;
  return SIDE_MARGIN + (index / PEGS_PER_ROW) * usable;
}

function entryColToIndex(entryCol, platformCols) {
  const entryX = (entryCol + 0.5) / platformCols;
  return entryX * PEGS_PER_ROW;
}

function getPegsInRow(pegs, row) {
  return pegs.filter((p) => p.row === row);
}

/** Index grille du centre du clou — aligné sur pegX() du board-generator. */
function pegCenterIndex(peg, row) {
  const isOddRow = row % 2 === 1;
  return peg.index + 0.5 + (isOddRow ? 0.5 : 0);
}

function findNearestPeg(pegs, row, ballIndex, lateralVel = 0) {
  const rowPegs = getPegsInRow(pegs, row);
  if (!rowPegs.length) return null;

  const ballX = indexToNormalizedX(ballIndex);
  let nearest = rowPegs[0];
  let minDist = Math.abs(nearest.x - ballX);

  for (const peg of rowPegs) {
    const dist = Math.abs(peg.x - ballX);
    if (dist < minDist - 1e-9) {
      minDist = dist;
      nearest = peg;
    } else if (Math.abs(dist - minDist) <= 1e-9) {
      if (lateralVel > 0.05 && peg.index > nearest.index) nearest = peg;
      else if (lateralVel < -0.05 && peg.index < nearest.index) nearest = peg;
    }
  }
  return nearest;
}

/**
 * Probabilité de dévier vers la droite après contact avec un clou.
 * @param {number} ballIndex
 * @param {object} peg
 * @param {number} row
 * @param {number} lateralVel - élan latéral accumulé (-1.5..1.5)
 * @param {() => number} random
 */
function probabilityGoRight(ballIndex, peg, row, lateralVel, random) {
  const pegCenter = pegCenterIndex(peg, row);
  const approachOffset = ballIndex - pegCenter;

  const impactBias = -approachOffset * 0.38;
  const momentumBias = lateralVel * 0.28;
  const centerPull = ((PEGS_PER_ROW / 2) - ballIndex) * 0.035;
  const noise = (random() - 0.5) * 0.2;

  const pRight = 0.5 + impactBias + momentumBias + centerPull + noise;
  return Math.max(0.15, Math.min(0.85, pRight));
}

function resolveSlot(slots, normalizedX) {
  const xPercent = normalizedX * 100;
  let cumulative = 0;
  for (const slot of slots) {
    cumulative += slot.width;
    if (xPercent <= cumulative + 0.001) {
      return slot;
    }
  }
  return slots[slots.length - 1];
}

function slotLandY() {
  return 1 - ZONE_SLOTS / 2;
}

/**
 * Marque chaque point du path avec onFire ; retourne l'état au moment de l'atterrissage.
 * @param {object[]} path
 * @returns {boolean}
 */
function applyFireToPath(path) {
  let lastDir = 0;
  let streak = 0;
  let onFire = false;

  for (const point of path) {
    const outDir = point.bounce === 'left' ? -1 : point.bounce === 'right' ? 1 : 0;

    if (outDir === 0) {
      point.onFire = onFire;
      continue;
    }

    const directionChanged = lastDir !== 0 && outDir !== lastDir;

    if (directionChanged) {
      onFire = false;
      streak = 1;
    } else if (lastDir !== 0 && outDir === lastDir) {
      streak += 1;
    } else {
      streak = 1;
    }

    if (streak >= FIRE_STREAK_MIN) onFire = true;
    point.onFire = onFire;
    lastDir = outDir;
  }

  return onFire;
}

/**
 * @param {number} entryCol
 * @param {object} board
 * @param {() => number} [rng]
 */
function simulateDrop(entryCol, board, rng) {
  const random = rng || Math.random;
  const { pegs, pegRows, slots, entryXs, platformCols = 7 } = board;

  if (entryCol < 0 || entryCol >= entryXs.length) {
    throw new Error('INVALID_COLUMN');
  }

  let ballIndex = entryColToIndex(entryCol, platformCols);
  let lateralVel = 0;
  const path = [];

  path.push({
    x: entryXs[entryCol],
    y: ZONE_DROP / 2,
    bounce: null,
  });

  for (let row = 0; row < pegRows; row++) {
    const peg = findNearestPeg(pegs, row, ballIndex, lateralVel);
    if (!peg) continue;

    const pRight = probabilityGoRight(ballIndex, peg, row, lateralVel, random);
    const goRight = random() < pRight;

    ballIndex += goRight ? 0.5 : -0.5;
    ballIndex = Math.max(0.25, Math.min(PEGS_PER_ROW - 0.25, ballIndex));

    lateralVel = lateralVel * 0.35 + (goRight ? 0.65 : -0.65);
    lateralVel = Math.max(-1.5, Math.min(1.5, lateralVel));

    path.push({
      x: peg.x,
      y: peg.y,
      bounce: goRight ? 'right' : 'left',
      pegId: peg.id,
      pegRow: row,
    });
  }

  const finalX = indexToNormalizedX(ballIndex);
  path.push({
    x: finalX,
    y: slotLandY(),
    bounce: null,
  });

  const slot = resolveSlot(slots, finalX);
  const delta = slot.type === 'neutral' || slot.type === 'knife' || slot.type === 'thief'
    ? 0
    : slot.value;
  const onFireAtLand = applyFireToPath(path);

  return {
    path,
    slotIndex: slot.index,
    slot,
    delta,
    finalX,
    onFireAtLand,
  };
}

function simulateDropSeeded(entryCol, board, seed) {
  const rng = createRng(seed);
  return simulateDrop(entryCol, board, rng);
}

module.exports = {
  simulateDrop,
  simulateDropSeeded,
  resolveSlot,
  indexToNormalizedX,
  probabilityGoRight,
  pegCenterIndex,
  applyFireToPath,
  FIRE_STREAK_MIN,
};
