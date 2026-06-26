/**
 * player-stats — Agrégation des statistiques de jeu par profil joueur.
 *
 * Module pur : pas d'I/O. La persistance fichier est gérée par player-profiles.
 */

const STATS_VERSION = 1;
const VALID_RESULTS = new Set(['win', 'loss', 'tie']);

function emptyGameStats() {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    lastPlayedAt: null,
    lastResult: null,
  };
}

function createEmptyStats() {
  return {
    version: STATS_VERSION,
    updatedAt: null,
    totals: {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      ties: 0,
    },
    byGame: {},
  };
}

/**
 * Normalise des données lues depuis disque.
 * @param {object|null|undefined} raw
 */
function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object') return createEmptyStats();

  const stats = createEmptyStats();
  stats.updatedAt = raw.updatedAt || null;

  const totals = raw.totals || {};
  stats.totals.gamesPlayed = Number(totals.gamesPlayed) || 0;
  stats.totals.wins = Number(totals.wins) || 0;
  stats.totals.losses = Number(totals.losses) || 0;
  stats.totals.ties = Number(totals.ties) || 0;

  if (raw.byGame && typeof raw.byGame === 'object') {
    for (const [gameId, entry] of Object.entries(raw.byGame)) {
      if (!entry || typeof entry !== 'object') continue;
      stats.byGame[gameId] = {
        gamesPlayed: Number(entry.gamesPlayed) || 0,
        wins: Number(entry.wins) || 0,
        losses: Number(entry.losses) || 0,
        ties: Number(entry.ties) || 0,
        lastPlayedAt: entry.lastPlayedAt || null,
        lastResult: VALID_RESULTS.has(entry.lastResult) ? entry.lastResult : null,
        ...(entry.meta && typeof entry.meta === 'object' ? { lastMeta: entry.meta } : {}),
      };
    }
  }

  return stats;
}

/**
 * Enregistre un résultat de partie dans un objet stats (mutation).
 * @param {object} stats
 * @param {{ gameId: string, result: 'win'|'loss'|'tie', meta?: object, playedAt?: string }} entry
 */
function recordResult(stats, { gameId, result, meta, playedAt }) {
  if (!gameId || !VALID_RESULTS.has(result)) {
    throw new Error('INVALID_STATS_ENTRY');
  }

  const base = normalizeStats(stats);
  const now = playedAt || new Date().toISOString();

  base.totals.gamesPlayed += 1;
  if (result === 'win') base.totals.wins += 1;
  else if (result === 'loss') base.totals.losses += 1;
  else if (result === 'tie') base.totals.ties += 1;

  if (!base.byGame[gameId]) base.byGame[gameId] = emptyGameStats();
  const game = base.byGame[gameId];
  game.gamesPlayed += 1;
  if (result === 'win') game.wins += 1;
  else if (result === 'loss') game.losses += 1;
  else if (result === 'tie') game.ties += 1;
  game.lastPlayedAt = now;
  game.lastResult = result;
  if (meta && typeof meta === 'object') game.lastMeta = meta;

  base.updatedAt = now;
  return base;
}

module.exports = {
  STATS_VERSION,
  VALID_RESULTS,
  createEmptyStats,
  normalizeStats,
  recordResult,
};
