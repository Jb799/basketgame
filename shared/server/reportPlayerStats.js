/**
 * reportPlayerStats — Envoie les résultats de partie au hub (stats persistantes).
 *
 * Appelé par les serveurs de jeu à la fin d'une session. Fire-and-forget :
 * n'interrompt pas la partie si le hub est injoignable.
 */

const http = require('http');

const HUB_PORT = Number(process.env.HUB_PORT) || 3000;
const VALID_RESULTS = new Set(['win', 'loss', 'tie']);

/**
 * @param {string} gameId
 * @param {Array<{ profileId?: string, slot?: number, result: string, meta?: object }>} results
 */
function reportGameResults(gameId, results) {
  if (!gameId || !Array.isArray(results) || results.length === 0) return;

  const payload = {
    gameId,
    results: results
      .filter((r) => r?.profileId && VALID_RESULTS.has(r.result))
      .map((r) => ({
        profileId: r.profileId,
        result: r.result,
        ...(r.meta ? { meta: r.meta } : {}),
      })),
  };

  if (payload.results.length === 0) return;

  const body = JSON.stringify(payload);
  const req = http.request(
    {
      host: '127.0.0.1',
      port: HUB_PORT,
      path: '/api/players/record-game',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 3000,
    },
    (res) => {
      res.resume();
      if (res.statusCode >= 400) {
        console.warn(`[reportPlayerStats] Hub a répondu ${res.statusCode} pour ${gameId}`);
      }
    }
  );

  req.on('error', (e) => {
    console.warn(`[reportPlayerStats] Échec envoi stats (${gameId}) :`, e.message);
  });
  req.on('timeout', () => {
    req.destroy();
    console.warn(`[reportPlayerStats] Timeout envoi stats (${gameId})`);
  });

  req.write(body);
  req.end();
}

/**
 * Construit les résultats à partir du roster enrichi et d'une map slot → result.
 * @param {Array<{ slot: number, profileId: string }>} roster
 * @param {Record<number, { result: string, meta?: object }>} resultsBySlot
 */
function resultsFromRoster(roster, resultsBySlot) {
  if (!Array.isArray(roster) || !resultsBySlot) return [];

  const out = [];
  for (const entry of roster) {
    const slot = Number(entry.slot);
    const row = resultsBySlot[slot];
    if (!entry.profileId || !row?.result) continue;
    if (!VALID_RESULTS.has(row.result)) continue;
    out.push({
      profileId: entry.profileId,
      result: row.result,
      meta: row.meta,
    });
  }
  return out;
}

/**
 * @param {string} gameId
 * @param {Array} roster
 * @param {Record<number, { result: string, meta?: object }>} resultsBySlot
 */
function reportFromRoster(gameId, roster, resultsBySlot) {
  const results = resultsFromRoster(roster, resultsBySlot);
  reportGameResults(gameId, results);
}

module.exports = {
  reportGameResults,
  reportFromRoster,
  resultsFromRoster,
};
