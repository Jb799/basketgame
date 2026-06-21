/**
 * gameRegistry.js — Découverte automatique des jeux.
 *
 * Scanne le dossier `games/` à la recherche de sous-dossiers contenant un
 * fichier `game.config.json`. Ajouter un jeu = créer un dossier avec sa config,
 * sans toucher au hub.
 */

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, '..', 'games');

const REQUIRED_FIELDS = ['id', 'name', 'server'];

/**
 * Lit et valide la config d'un jeu dans un dossier donné.
 * @returns {object|null} La config enrichie (avec `dir` et `entryPath`), ou null.
 */
function loadGameConfig(dirName) {
  const dir = path.join(GAMES_DIR, dirName);
  const configPath = path.join(dir, 'game.config.json');

  if (!fs.existsSync(configPath)) return null;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(`[Registry] Config invalide pour "${dirName}" :`, e.message);
    return null;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!config[field]) {
      console.error(`[Registry] Config "${dirName}" : champ obligatoire manquant "${field}"`);
      return null;
    }
  }

  const entry = config.server?.entry;
  if (!entry) {
    console.error(`[Registry] Config "${dirName}" : "server.entry" manquant`);
    return null;
  }

  return {
    ...config,
    dir,
    entryPath: path.join(dir, entry),
    controller: normalizeController(config.controller),
  };
}

const ALLOWED_OPTION_TYPES = new Set(['number']);

/**
 * Valide et normalise controller.startOptions d'un jeu.
 */
function normalizeStartOptions(startOptions) {
  if (!startOptions?.length) return [];

  const options = [];
  for (const raw of startOptions) {
    if (!raw?.id || !raw?.label || !raw?.type) {
      console.warn('[Registry] startOption ignorée (id, label ou type manquant) :', raw);
      continue;
    }
    if (!ALLOWED_OPTION_TYPES.has(raw.type)) {
      console.warn(`[Registry] startOption "${raw.id}" ignorée : type "${raw.type}" non supporté`);
      continue;
    }
    if (raw.type === 'number') {
      const min = Number.isFinite(raw.min) ? raw.min : 0;
      const max = Number.isFinite(raw.max) ? raw.max : 100;
      const def = Number.isFinite(raw.default) ? raw.default : min;
      options.push({
        id: raw.id,
        type: 'number',
        label: String(raw.label),
        min,
        max,
        default: Math.min(max, Math.max(min, def)),
      });
    }
  }
  return options;
}

const ALLOWED_METHODS = new Set(['GET', 'POST']);
const ALLOWED_STYLES = new Set(['primary', 'danger', 'ghost']);

/**
 * Valide et normalise la section controller.actions d'un jeu.
 */
function normalizeController(controller) {
  const startOptions = normalizeStartOptions(controller?.startOptions);
  const requiresPlayerRoster = controller?.requiresPlayerRoster === true;
  if (!controller?.actions?.length) return { startOptions, actions: [], requiresPlayerRoster };

  const actions = [];
  for (const raw of controller.actions) {
    if (!raw?.id || !raw?.label || !raw?.path) {
      console.warn(`[Registry] Action ignorée (id, label ou path manquant) :`, raw);
      continue;
    }
    if (!raw.path.startsWith('/api/')) {
      console.warn(`[Registry] Action "${raw.id}" ignorée : path doit commencer par /api/`);
      continue;
    }
    const method = (raw.method || 'POST').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      console.warn(`[Registry] Action "${raw.id}" ignorée : method "${method}" non autorisée`);
      continue;
    }
    const style = raw.style || 'primary';
    actions.push({
      id: raw.id,
      label: raw.label,
      method,
      path: raw.path,
      style: ALLOWED_STYLES.has(style) ? style : 'primary',
      ...(raw.confirm ? { confirm: String(raw.confirm) } : {}),
      ...(raw.icon ? { icon: String(raw.icon) } : {}),
    });
  }
  return { startOptions, actions, requiresPlayerRoster };
}

/**
 * Valide les paramètres de lancement envoyés par le contrôleur.
 * @returns {{ valid: boolean, params?: object, error?: string }}
 */
function validateStartParams(game, body = {}) {
  const options = game.controller?.startOptions || [];
  const params = {};

  for (const opt of options) {
    let value = body[opt.id];
    if (value === undefined || value === null || value === '') {
      value = opt.default;
    }
    if (opt.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return { valid: false, error: `INVALID_${opt.id.toUpperCase()}` };
      }
      if (num < opt.min || num > opt.max) {
        return { valid: false, error: `OUT_OF_RANGE_${opt.id.toUpperCase()}` };
      }
      params[opt.id] = num;
    }
  }

  // Jeux à roster : valide la forme de la liste d'ids (longueur, unicité).
  if (game.controller?.requiresPlayerRoster) {
    const expected = Number.isInteger(params.playerCount)
      ? params.playerCount
      : game.players?.min || 2;
    const roster = body.roster;
    if (!Array.isArray(roster) || roster.length !== expected) {
      return { valid: false, error: 'INVALID_ROSTER' };
    }
    if (roster.some((id) => typeof id !== 'string' || !id)) {
      return { valid: false, error: 'INVALID_ROSTER' };
    }
    if (new Set(roster).size !== roster.length) {
      return { valid: false, error: 'DUPLICATE_ROSTER' };
    }
    params.roster = roster;
  }

  return { valid: true, params };
}

/**
 * Retourne la liste de tous les jeux découverts.
 */
function listGames() {
  if (!fs.existsSync(GAMES_DIR)) return [];

  return fs
    .readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadGameConfig(d.name))
    .filter(Boolean);
}

/**
 * Retourne la config d'un jeu par son id, ou null.
 */
function getGame(id) {
  return listGames().find((g) => g.id === id) || null;
}

/**
 * Version "publique" d'un jeu (sans chemins internes) pour les clients.
 */
function toPublic(game) {
  if (!game) return null;
  const { dir, entryPath, server, ...rest } = game;
  return rest;
}

module.exports = { listGames, getGame, toPublic, validateStartParams, GAMES_DIR };
