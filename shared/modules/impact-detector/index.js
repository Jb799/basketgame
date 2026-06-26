/**
 * impact-detector — Détection d'impact structure par corrélation de chutes ADC.
 *
 * Module pur : pas d'I/O réseau. Utilisé par le hub pour détecter les vibrations
 * quand plusieurs capteurs IR chutent sur une fenêtre courte (impact sur la structure).
 *
 * La chute est mesurée par rapport au pic récent (derniers échantillons), pas seulement
 * le tick précédent — les vibrations se propagent sur plusieurs lectures (~10 ms).
 *
 * La sensibilité (10–90 %) pilote minDrop, minSensors, windowMs et debounceMs :
 * plus le % est élevé, plus la détection est tolérante (moins sensible).
 */

'use strict';

const { PLATFORM_COLUMNS } = require('../../constants');

const MIN_SENSITIVITY = 10;
const MAX_SENSITIVITY = 90;
const DEFAULT_SENSITIVITY = 65;

const DEFAULT_CONFIG = {
  enabled: true,
  sensitivity: DEFAULT_SENSITIVITY,
  minSensors: 4,
  minDrop: 50,
  windowMs: 75,
  debounceMs: 400,
  peakSamples: 8,
};

const BOUNDS = {
  minSensors: { min: 2, max: PLATFORM_COLUMNS },
  minDrop: { min: 5, max: 500 },
  windowMs: { min: 30, max: 300 },
  debounceMs: { min: 100, max: 2000 },
  peakSamples: { min: 3, max: 20 },
};

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Convertit le curseur sensibilité (10 = sensible, 90 = tolérant) en paramètres détection.
 * @param {number} sensitivity
 * @returns {{ minDrop: number, minSensors: number, windowMs: number, debounceMs: number }}
 */
function sensitivityToParams(sensitivity) {
  const s = clampInt(sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY, DEFAULT_SENSITIVITY);
  const t = (s - MIN_SENSITIVITY) / (MAX_SENSITIVITY - MIN_SENSITIVITY);

  return {
    minDrop: Math.round(15 + t * 55),
    minSensors: s >= 78 ? 5 : s >= 52 ? 4 : 3,
    windowMs: s >= 50 ? 75 : 95,
    debounceMs: s >= 45 ? 400 : 280,
  };
}

/**
 * Estime une sensibilité depuis minDrop (configs legacy sans champ sensitivity).
 * @param {number} minDrop
 * @returns {number}
 */
function minDropToSensitivity(minDrop) {
  const t = (minDrop - 15) / 55;
  return clampInt(
    Math.round(MIN_SENSITIVITY + t * (MAX_SENSITIVITY - MIN_SENSITIVITY)),
    MIN_SENSITIVITY,
    MAX_SENSITIVITY,
    DEFAULT_SENSITIVITY
  );
}

/**
 * @param {number} sensitivity
 * @param {object} [overrides]
 */
function buildImpactConfig(sensitivity, overrides = {}) {
  const s = clampInt(sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY, DEFAULT_SENSITIVITY);
  const derived = sensitivityToParams(s);
  return {
    enabled: overrides.enabled !== false,
    sensitivity: s,
    minSensors: derived.minSensors,
    minDrop: derived.minDrop,
    windowMs: derived.windowMs,
    debounceMs: derived.debounceMs,
    peakSamples: clampInt(
      overrides.peakSamples,
      BOUNDS.peakSamples.min,
      BOUNDS.peakSamples.max,
      DEFAULT_CONFIG.peakSamples
    ),
  };
}

/**
 * Normalise la configuration impact depuis un objet brut.
 * @param {object} [raw]
 * @returns {typeof DEFAULT_CONFIG}
 */
function normalizeImpactConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return buildImpactConfig(DEFAULT_SENSITIVITY);
  }

  let sensitivity = clampInt(raw.sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY, null);
  if (sensitivity == null && raw.minDrop != null) {
    sensitivity = minDropToSensitivity(raw.minDrop);
  }
  if (sensitivity == null) {
    sensitivity = DEFAULT_SENSITIVITY;
  }

  return buildImpactConfig(sensitivity, {
    enabled: raw.enabled,
    peakSamples: raw.peakSamples,
  });
}

class ImpactDetector {
  /**
   * @param {object} [config] — voir normalizeImpactConfig
   */
  constructor(config) {
    this._config = normalizeImpactConfig(config);
    /** @type {{ sensor: number, drop: number, ts: number }[]} */
    this._recentDrops = [];
    this._lastImpactTime = 0;
    this._peakBuffers = Array.from({ length: PLATFORM_COLUMNS }, () => []);
    /** @type {number[]} dernières chutes calculées (debug / UI) */
    this._lastDrops = Array(PLATFORM_COLUMNS).fill(0);
  }

  get config() {
    return { ...this._config };
  }

  /** @returns {number[]} chutes ADC par capteur (dernier tick) */
  get lastDrops() {
    return this._lastDrops.slice();
  }

  /**
   * Met à jour la configuration (ex. rechargement fichier).
   * @param {object} config
   */
  setConfig(config) {
    this._config = normalizeImpactConfig(config);
  }

  reset() {
    this._recentDrops = [];
    this._lastImpactTime = 0;
    this._peakBuffers = Array.from({ length: PLATFORM_COLUMNS }, () => []);
    this._lastDrops = Array(PLATFORM_COLUMNS).fill(0);
  }

  /**
   * Met à jour les buffers et calcule la chute par capteur vs pic récent.
   * @param {number[]} values
   * @returns {number[]}
   */
  _updateDrops(values) {
    const peakSamples = this._config.peakSamples;
    const drops = [];

    for (let i = 0; i < values.length; i++) {
      const buf = this._peakBuffers[i];
      buf.push(values[i]);
      while (buf.length > peakSamples) buf.shift();

      let drop = 0;
      if (buf.length >= 2) {
        const ref = Math.max(...buf.slice(0, -1));
        drop = Math.max(0, ref - values[i]);
      }
      drops.push(drop);
    }

    this._lastDrops = drops;
    return drops;
  }

  /**
   * Analyse un tick de valeurs capteurs.
   * @param {number[]} values — valeurs ADC courantes
   * @param {number} [now] — timestamp ms
   * @returns {object|null} événement impact ou null
   */
  tick(values, now = Date.now()) {
    if (!this._config.enabled) return null;
    if (!Array.isArray(values) || values.length === 0) return null;

    const { minDrop, windowMs, minSensors, debounceMs } = this._config;
    const cutoff = now - windowMs;
    const drops = this._updateDrops(values);

    for (let i = 0; i < values.length; i++) {
      if (drops[i] < minDrop) continue;

      const existing = this._recentDrops.findIndex((e) => e.sensor === i);
      const entry = { sensor: i, drop: drops[i], ts: now };
      if (existing >= 0) {
        if (drops[i] > this._recentDrops[existing].drop) {
          this._recentDrops[existing] = entry;
        } else {
          this._recentDrops[existing].ts = now;
        }
      } else {
        this._recentDrops.push(entry);
      }
    }

    this._recentDrops = this._recentDrops.filter((e) => e.ts >= cutoff);

    if (this._recentDrops.length < minSensors) return null;
    if (now - this._lastImpactTime < debounceMs) return null;

    const sorted = [...this._recentDrops].sort((a, b) => a.sensor - b.sensor);
    const sensors = sorted.map((e) => e.sensor);
    const sensorDrops = sorted.map((e) => e.drop);
    const magnitude = Math.round(sensorDrops.reduce((a, b) => a + b, 0) / sensorDrops.length);
    const peakDrop = Math.max(...sensorDrops);

    this._lastImpactTime = now;
    this._recentDrops = [];

    return {
      sensors,
      drops: sensorDrops,
      magnitude,
      peakDrop,
      sensorCount: sensors.length,
      timestamp: now,
    };
  }
}

module.exports = {
  ImpactDetector,
  normalizeImpactConfig,
  sensitivityToParams,
  buildImpactConfig,
  minDropToSensitivity,
  DEFAULT_SENSITIVITY,
  MIN_SENSITIVITY,
  MAX_SENSITIVITY,
  DEFAULT_IMPACT_CONFIG: DEFAULT_CONFIG,
  IMPACT_BOUNDS: BOUNDS,
};
