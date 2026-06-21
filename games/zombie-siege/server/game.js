/**
 * game.js — Logique Siège Zombie (coop tower defense).
 *
 * Zombies escaladent 7 colonnes ; les triggers ESP32 éliminent le zombie le plus
 * haut de la colonne visée. Vagues progressives, vies, score + TOP persistant.
 */

const fs = require('fs');
const path = require('path');
const { PLATFORM_COLUMNS } = require('../../../shared/constants');

const COLS = PLATFORM_COLUMNS;
const ROWS = 10;
const START_LIVES = 3;
const WAVE_BREAK_MS = 3000;
const TICK_MS = 200;
/**
 * Timeline d'un tir — ces constantes sont la source de vérité partagée avec le
 * client (`shots.js`). Le serveur résout l'impact à `PROJECTILE_IMPACT_MS` après
 * le lancer ; le client anime lancer (THROW) puis chute (FALL) sur la même durée.
 */
const THROW_MS = 140;
const FALL_MS = 480;
const PROJECTILE_IMPACT_MS = THROW_MS + FALL_MS;

const SCORES_FILE = path.join(__dirname, 'scores.json');

function getWaveConfig(wave) {
  const w = Math.max(1, wave);
  return {
    totalZombies: 4 + w * 2,
    spawnIntervalMs: Math.max(600, 4500 - w * 350),
    climbIntervalMs: Math.max(350, 2800 - w * 180),
    scorePerKill: 100 + w * 25,
    waveClearBonus: w * 200,
  };
}

class Game {
  constructor() {
    this.persistent = this._loadPersistent();
    this._nextZombieId = 1;
    this.reset();
  }

  _loadPersistent() {
    try {
      if (fs.existsSync(SCORES_FILE)) {
        const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
        return {
          highScore: Number(data.highScore) || 0,
          bestWave: Number(data.bestWave) || 0,
        };
      }
    } catch (e) {
      console.error('[ZombieSiege] Échec chargement scores :', e.message);
    }
    return { highScore: 0, bestWave: 0 };
  }

  _savePersistent() {
    try {
      fs.writeFileSync(
        SCORES_FILE,
        JSON.stringify(this.persistent, null, 2),
        'utf8'
      );
    } catch (e) {
      console.error('[ZombieSiege] Échec sauvegarde scores :', e.message);
    }
  }

  _maybeUpdateHighScore() {
    let isNewRecord = false;
    let changed = false;
    if (this.score > this.persistent.highScore) {
      this.persistent.highScore = this.score;
      isNewRecord = true;
      changed = true;
    }
    if (this.wave > this.persistent.bestWave) {
      this.persistent.bestWave = this.wave;
      changed = true;
    }
    if (changed) this._savePersistent();
    return isNewRecord;
  }

  reset() {
    this.phase = 'playing';
    this.wave = 1;
    this.score = 0;
    this.lives = START_LIVES;
    this.zombies = [];
    this.spawnQueue = [];
    this.spawnedThisWave = 0;
    this.waveConfig = getWaveConfig(1);
    this.lastSpawnAt = 0;
    this.lastClimbAt = Date.now();
    this.waveBreakUntil = 0;
    this.pendingEvents = [];
    this._nextShotId = 0;
    this._initWaveQueue();
  }

  resetHighScore() {
    this.persistent = { highScore: 0, bestWave: 0 };
    this._savePersistent();
  }

  _initWaveQueue() {
    this.spawnQueue = [];
    this.spawnedThisWave = 0;
    const cfg = this.waveConfig;
    for (let i = 0; i < cfg.totalZombies; i++) {
      this.spawnQueue.push(this._randomCol());
    }
  }

  _randomCol() {
    return Math.floor(Math.random() * COLS);
  }

  _pickSpawnCol() {
    if (this.spawnQueue.length === 0) return this._randomCol();
    return this.spawnQueue.shift();
  }

  startWave(wave) {
    this.wave = wave;
    this.waveConfig = getWaveConfig(wave);
    this.phase = 'playing';
    this.lastSpawnAt = Date.now();
    this.lastClimbAt = Date.now();
    this._initWaveQueue();
    return {
      type: 'WAVE_START',
      wave: this.wave,
      config: this.waveConfig,
      state: this.getState(),
    };
  }

  /**
   * Tick serveur — spawn, montée, brèches, fin de vague.
   * @returns {Array<object>} événements à broadcaster
   */
  tick(now = Date.now()) {
    const events = [];

    if (this.phase === 'game_over') return events;

    if (this.phase === 'wave_break') {
      if (now >= this.waveBreakUntil) {
        const msg = this.startWave(this.wave + 1);
        events.push(msg);
      }
      return events;
    }

    const cfg = this.waveConfig;

    // Spawn depuis la queue
    if (
      this.spawnQueue.length > 0 &&
      now - this.lastSpawnAt >= cfg.spawnIntervalMs
    ) {
      const col = this._pickSpawnCol();
      const zombie = this._spawnZombie(col);
      this.lastSpawnAt = now;
      this.spawnedThisWave += 1;
      events.push({
        type: 'ZOMBIE_SPAWN',
        id: zombie.id,
        col: zombie.col,
        row: zombie.row,
        state: this.getState(),
      });
    }

    // Montée des zombies
    if (this.zombies.length > 0 && now - this.lastClimbAt >= cfg.climbIntervalMs) {
      this.lastClimbAt = now;
      const breaches = [];

      for (const z of this.zombies) {
        z.row -= 1;
        if (z.row <= 0) {
          breaches.push(z);
        }
      }

      for (const z of breaches) {
        const breachEvent = this._handleBreach(z);
        events.push(breachEvent);
        if (this.phase === 'game_over') {
          return events;
        }
      }

      if (breaches.length === 0) {
        events.push({ type: 'STATE', state: this.getState() });
      }
    }

    // Fin de vague : tous spawnés et plus de zombies
    if (
      this.spawnQueue.length === 0 &&
      this.zombies.length === 0 &&
      this.phase === 'playing'
    ) {
      const bonus = cfg.waveClearBonus;
      this.score += bonus;
      this.phase = 'wave_break';
      this.waveBreakUntil = now + WAVE_BREAK_MS;
      events.push({
        type: 'WAVE_COMPLETE',
        wave: this.wave,
        bonus,
        score: this.score,
        state: this.getState(),
      });
    }

    return events;
  }

  _spawnZombie(col) {
    const zombie = {
      id: this._nextZombieId++,
      col,
      row: ROWS - 1,
    };
    this.zombies.push(zombie);
    return zombie;
  }

  _handleBreach(zombie) {
    this.zombies = this.zombies.filter((z) => z.id !== zombie.id);
    this.lives -= 1;

    const event = {
      type: 'BREACH',
      id: zombie.id,
      col: zombie.col,
      livesLeft: this.lives,
      state: this.getState(),
    };

    if (this.lives <= 0) {
      this.phase = 'game_over';
      const isNewRecord = this._maybeUpdateHighScore();
      event.gameOver = this.buildGameOverPayload(isNewRecord);
    }

    return event;
  }

  buildGameOverPayload(isNewRecord) {
    return {
      score: this.score,
      highScore: this.persistent.highScore,
      wave: this.wave,
      isNewRecord,
      state: this.getState(),
    };
  }

  /**
   * Déclenche un tir — la bombe tombe toujours ; le kill est résolu à l'impact.
   */
  fire(col) {
    if (this.phase === 'game_over') {
      return { success: false, error: 'Partie terminée' };
    }
    if (this.phase === 'wave_break') {
      return { success: false, error: 'Pause entre les vagues' };
    }
    if (!Number.isInteger(col) || col < 0 || col >= COLS) {
      return { success: false, error: `Colonne invalide (0-${COLS - 1})` };
    }

    this._nextShotId += 1;
    return {
      success: true,
      col,
      shotId: this._nextShotId,
      impactMs: PROJECTILE_IMPACT_MS,
    };
  }

  /**
   * Résout un tir à l'impact — tue le zombie le plus haut présent dans la colonne.
   */
  resolveImpact(col) {
    const inCol = this.zombies.filter((z) => z.col === col);
    if (inCol.length === 0) {
      return { hit: false, col };
    }

    inCol.sort((a, b) => a.row - b.row);
    const target = inCol[0];
    this.zombies = this.zombies.filter((z) => z.id !== target.id);

    const points = this.waveConfig.scorePerKill;
    this.score += points;

    return {
      hit: true,
      col,
      zombie: { id: target.id, col: target.col, row: target.row },
      points,
      score: this.score,
    };
  }

  /** @deprecated Alias interne — utiliser fire + resolveImpact */
  shoot(col) {
    const fired = this.fire(col);
    if (!fired.success) return { success: false, error: fired.error, miss: fired.miss };
    const impact = this.resolveImpact(col);
    if (!impact.hit) return { success: false, error: 'Colonne vide', miss: true };
    return {
      success: true,
      zombie: impact.zombie,
      points: impact.points,
      score: impact.score,
    };
  }

  getState() {
    return {
      phase: this.phase,
      wave: this.wave,
      score: this.score,
      lives: this.lives,
      highScore: this.persistent.highScore,
      bestWave: this.persistent.bestWave,
      waveConfig: this.waveConfig,
      zombies: this.zombies.map((z) => ({ id: z.id, col: z.col, row: z.row })),
      spawnRemaining: this.spawnQueue.length,
      rows: ROWS,
      cols: COLS,
      startLives: START_LIVES,
    };
  }
}

module.exports = {
  Game,
  getWaveConfig,
  START_LIVES,
  ROWS,
  COLS,
  WAVE_BREAK_MS,
  TICK_MS,
  THROW_MS,
  FALL_MS,
  PROJECTILE_IMPACT_MS,
};
