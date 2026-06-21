/**
 * scoring — Gestion des scores avec persistance fichier optionnelle.
 *
 * Module réutilisable par tout jeu compétitif. La persistance est isolée dans
 * ce module : si `file` est fourni, les scores sont chargés au démarrage et
 * sauvegardés à chaque modification.
 */

const fs = require('fs');

class Scoring {
  /**
   * @param {object} options
   * @param {Array<number|string>} [options.players=[1, 2]] - Identifiants des joueurs.
   * @param {string} [options.file] - Chemin du fichier de persistance JSON.
   */
  constructor({ players = [1, 2], file = null } = {}) {
    this.players = players;
    this.file = file;
    this.scores = this._emptyScores();
    if (this.file) this.load();
  }

  _emptyScores() {
    const scores = {};
    for (const p of this.players) scores[p] = 0;
    return scores;
  }

  /**
   * Incrémente le score d'un joueur et persiste si un fichier est configuré.
   */
  addWin(player) {
    this.scores[player] = (this.scores[player] || 0) + 1;
    this.save();
    return this.scores[player];
  }

  /**
   * Ajoute ou retire des points (pièces, etc.) et persiste.
   */
  addPoints(player, delta) {
    const p = Number(player);
    this.scores[p] = (this.scores[p] || 0) + delta;
    this.save();
    return this.scores[p];
  }

  /**
   * Retourne le score d'un joueur.
   */
  get(player) {
    return this.scores[Number(player)] || 0;
  }

  /**
   * Remet tous les scores à zéro et persiste.
   */
  reset() {
    this.scores = this._emptyScores();
    this.save();
  }

  load() {
    if (!this.file) return;
    try {
      if (fs.existsSync(this.file)) {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        for (const p of this.players) {
          this.scores[p] = Number(data[p]) || 0;
        }
      }
    } catch (e) {
      console.error('[Scoring] Échec du chargement des scores :', e.message);
    }
  }

  save() {
    if (!this.file) return;
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.scores, null, 2), 'utf8');
    } catch (e) {
      console.error('[Scoring] Échec de la sauvegarde des scores :', e.message);
    }
  }
}

module.exports = { Scoring };
