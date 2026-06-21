/**
 * parseRoster — Lit le roster enrichi passé par le hub au lancement.
 *
 * Le hub résout les profils joueurs choisis sur le contrôleur et injecte un
 * roster enrichi (slot, pseudo, URLs des photos) dans GAME_START_PARAMS.
 * Si aucun roster n'est fourni (lancement direct, jeu sans profils), retourne
 * un tableau vide : les jeux retombent alors sur l'affichage générique.
 */

const { parseStartParams } = require('./parseStartParams');

/**
 * @returns {Array<{ slot: number, profileId: string, pseudo: string,
 *   photos: { idle: string, win: string, lose: string } }>}
 */
function parseRoster() {
  const params = parseStartParams();
  return Array.isArray(params.roster) ? params.roster : [];
}

module.exports = { parseRoster };
