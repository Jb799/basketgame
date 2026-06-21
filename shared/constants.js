/**
 * constants.js — Constantes de la plateforme BasketGame.
 *
 * Le plateau physique est horizontal et fait la largeur exacte de la télé.
 * Il est divisé en 7 colonnes égales sur toute sa longueur. L'ESP32 envoie un
 * signal `col` (0 = gauche → 6 = droite) à chaque passage de balle.
 *
 * Tous les jeux partagent cette contrainte matérielle : ils reçoivent toujours
 * une colonne dans l'intervalle [0, PLATFORM_COLUMNS - 1]. Le nombre de rangées
 * ou la disposition verticale reste libre pour chaque jeu.
 */

const PLATFORM_COLUMNS = 7;

/**
 * Variantes de photo d'un profil joueur :
 *   - idle : photo de profil neutre (cartes, tour actif, podium neutre)
 *   - win  : photo de fierté (victoire, série gagnée, podium 1er)
 *   - lose : photo de défaite (perte de points, défaite)
 */
const PLAYER_PHOTO_VARIANTS = ['idle', 'win', 'lose'];

module.exports = { PLATFORM_COLUMNS, PLAYER_PHOTO_VARIANTS };
