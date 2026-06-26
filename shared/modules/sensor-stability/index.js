/**
 * sensor-stability — Suivi de stabilité / santé par capteur (fenêtre glissante).
 *
 * Compte les participations aux impacts structure par capteur sur une fenêtre
 * temporelle. Un capteur qui participe peu aux impacts globaux par rapport aux
 * autres suggère un problème d'alignement.
 *
 * Module pur : pas d'I/O réseau.
 */

'use strict';

const { PLATFORM_COLUMNS } = require('../../constants');

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const LOW_HEALTH_THRESHOLD = 60;
const MIN_IMPACTS_FOR_ALERT = 3;

class SensorStabilityTracker {
  /**
   * @param {number} [numSensors]
   * @param {number} [windowMs] — fenêtre glissante (défaut 10 min)
   */
  constructor(numSensors = PLATFORM_COLUMNS, windowMs = DEFAULT_WINDOW_MS) {
    this.numSensors = numSensors;
    this.windowMs = windowMs;
    /** @type {number[]} timestamps des impacts structure */
    this._impactEvents = [];
    /** @type {number[][]} participations par capteur */
    this._impactHits = Array.from({ length: numSensors }, () => []);
  }

  get windowMinutes() {
    return Math.round(this.windowMs / 60000);
  }

  reset() {
    this._impactEvents = [];
    this._impactHits = Array.from({ length: this.numSensors }, () => []);
  }

  /**
   * @param {number[]} sensors — index capteurs ayant participé à l'impact
   * @param {number} [now]
   */
  recordImpact(sensors, now = Date.now()) {
    if (!Array.isArray(sensors) || !sensors.length) return;

    this._pruneAll(now);
    this._impactEvents.push(now);
    for (const s of sensors) {
      const idx = Number(s);
      if (Number.isInteger(idx) && idx >= 0 && idx < this.numSensors) {
        this._impactHits[idx].push(now);
      }
    }
  }

  _pruneAll(now) {
    const cutoff = now - this.windowMs;
    this._impactEvents = this._impactEvents.filter((ts) => ts >= cutoff);
    for (let i = 0; i < this.numSensors; i++) {
      this._impactHits[i] = this._impactHits[i].filter((ts) => ts >= cutoff);
    }
  }

  /**
   * @param {number} [now]
   * @returns {{
   *   windowMs: number,
   *   windowMinutes: number,
   *   totalImpacts: number,
   *   impactCounts: number[],
   *   health: number[],
   *   status: string[]
   * }}
   */
  getSnapshot(now = Date.now()) {
    this._pruneAll(now);

    const impactCounts = this._impactHits.map((arr) => arr.length);
    const totalImpacts = this._impactEvents.length;
    const maxCount = Math.max(...impactCounts, 0);

    const health = impactCounts.map((count) => {
      if (totalImpacts === 0) return 100;
      if (maxCount === 0) return 100;
      return Math.round((count / maxCount) * 100);
    });

    const status = health.map((h) => {
      if (totalImpacts < MIN_IMPACTS_FOR_ALERT) return 'idle';
      if (h < LOW_HEALTH_THRESHOLD) return 'low';
      return 'ok';
    });

    return {
      windowMs: this.windowMs,
      windowMinutes: this.windowMinutes,
      totalImpacts,
      impactCounts,
      health,
      status,
    };
  }
}

module.exports = {
  SensorStabilityTracker,
  DEFAULT_STABILITY_WINDOW_MS: DEFAULT_WINDOW_MS,
  LOW_HEALTH_THRESHOLD,
  MIN_IMPACTS_FOR_ALERT,
};
