/**
 * turn-manager — Alternance des joueurs.
 *
 * Module pur, sans dépendance. Gère le joueur courant parmi une liste ordonnée
 * et passe au suivant de façon circulaire. Réutilisable par tout jeu au tour
 * par tour (2 joueurs ou plus).
 */

class TurnManager {
  /**
   * @param {Array<number|string>} [players=[1, 2]] - Identifiants des joueurs.
   */
  constructor(players = [1, 2]) {
    this.players = players;
    this.reset();
  }

  reset() {
    this.index = 0;
  }

  get current() {
    return this.players[this.index];
  }

  /**
   * Passe au joueur suivant et le retourne.
   */
  next() {
    this.index = (this.index + 1) % this.players.length;
    return this.current;
  }

  /**
   * Force le joueur courant (utile pour restaurer un état).
   */
  setCurrent(player) {
    const idx = this.players.indexOf(player);
    if (idx !== -1) this.index = idx;
  }
}

module.exports = { TurnManager };
