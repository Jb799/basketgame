/**
 * series — Détection du gagnant d'une série de manches.
 *
 * Module pur. Détermine si un joueur a atteint le nombre de victoires requis
 * pour remporter la série (ex: premier à 5 victoires). Réutilisable par tout
 * jeu joué en plusieurs manches.
 */

/**
 * @param {Object<string|number, number>} scores - Scores par joueur.
 * @param {number} target - Nombre de victoires pour remporter la série.
 * @returns {number|string|null} Identifiant du gagnant de la série, ou null.
 */
function getSeriesWinner(scores, target) {
  for (const player of Object.keys(scores)) {
    if (scores[player] >= target) {
      const n = Number(player);
      return Number.isNaN(n) ? player : n;
    }
  }
  return null;
}

module.exports = { getSeriesWinner };
