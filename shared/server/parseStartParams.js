/**
 * parseStartParams — Lit les paramètres de lancement passés par le hub au spawn.
 *
 * Le hub sérialise le body validé de POST /api/games/:id/start dans
 * process.env.GAME_START_PARAMS (JSON).
 */

function parseStartParams() {
  const raw = process.env.GAME_START_PARAMS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

module.exports = { parseStartParams };
