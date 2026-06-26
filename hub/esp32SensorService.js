/**
 * esp32SensorService.js — Lecture série ESP32, calibration IR et détection de balle.
 *
 * L'ESP32 envoie des lignes RAW:v1,v2,...,v7 (ADC 12 bits, 7 colonnes).
 * Le hub calibre les baselines, calcule les seuils et déclenche les triggers
 * vers les jeux (même flux que POST /api/trigger).
 */

'use strict';

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { PLATFORM_COLUMNS } = require('../shared/constants');
const {
  DEFAULT_THRESHOLD_RATIO,
  MIN_THRESHOLD_RATIO,
  MAX_THRESHOLD_RATIO,
  clampRatio,
  loadSensorConfig,
  saveSensorConfig,
  getEffectiveRatio,
} = require('./sensorConfig');
const { ImpactDetector, normalizeImpactConfig, MIN_SENSITIVITY, MAX_SENSITIVITY } = require('../shared/modules/impact-detector');
const { SensorStabilityTracker } = require('../shared/modules/sensor-stability');

const NUM_SENSORS = PLATFORM_COLUMNS;
const HISTORY_SIZE = 100;
const BAUD_RATE = 115200;
const CALIBRATION_DURATION_S = 5.0;
const TRIGGER_DEBOUNCE_MS = 500;

const PORT_KEYWORDS = ['CP210', 'CH340', 'UART', 'USB', 'usbserial', 'usbmodem', 'serial'];
const PORT_SKIP = ['debug', 'bluetooth', 'wlan'];

function emptyHistory(fill = 4095) {
  return Array.from({ length: NUM_SENSORS }, () => Array(HISTORY_SIZE).fill(fill));
}

function trimmedMean(samples) {
  if (!samples.length) return 4095;
  const sorted = [...samples].sort((a, b) => a - b);
  const trim = Math.max(1, Math.floor(sorted.length / 10));
  const trimmed = sorted.length > trim * 2 ? sorted.slice(trim, -trim) : sorted;
  return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

class Esp32SensorService {
  constructor() {
    this.broadcast = () => {};
    this.onTrigger = async () => {};
    this.onImpact = async () => {};

    this.simulationMode = false;

    this.sensorValues = Array(NUM_SENSORS).fill(4095);
    this._previousValues = Array(NUM_SENSORS).fill(4095);
    this.sensorStates = Array(NUM_SENSORS).fill(false);
    this.sensorHistory = emptyHistory();
    this.totalDetections = Array(NUM_SENSORS).fill(0);
    this.totalImpacts = 0;
    this.sensorBaselines = Array(NUM_SENSORS).fill(4095);
    this.sensorThresholds = Array(NUM_SENSORS).fill(2000);

    this.serialConnected = false;
    this.serialPortName = 'Non connecté';
    this.calibrationPhase = true;
    this.calibrationStart = null;
    this.calibrationSamples = Array.from({ length: NUM_SENSORS }, () => []);

    this._port = null;
    this._parser = null;
    this._lastTriggerTime = Array(NUM_SENSORS).fill(0);
    this._starting = false;
    this._reconnectTimer = null;
    this.onStateChange = () => {};

    const config = loadSensorConfig();
    this.thresholdRatio = config.thresholdRatio;
    this.sensorOverrides = { ...config.sensorOverrides };
    this.impactDetection = { ...config.impactDetection };
    this._impactDetector = new ImpactDetector(this.impactDetection);
    this._stabilityTracker = new SensorStabilityTracker();
  }

  _stabilitySnapshot() {
    return this._stabilityTracker.getSnapshot();
  }

  setOnStateChange(fn) {
    this.onStateChange = fn;
  }

  _notifyStateChange() {
    this.onStateChange();
  }

  setBroadcast(fn) {
    this.broadcast = fn;
  }

  setOnTrigger(fn) {
    this.onTrigger = fn;
  }

  setOnImpact(fn) {
    this.onImpact = fn;
  }

  _configSnapshot() {
    return {
      thresholdRatio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      impactDetection: { ...this.impactDetection },
    };
  }

  _persistConfig() {
    saveSensorConfig(this._configSnapshot());
  }

  _getEffectiveRatio(sensorIndex) {
    return getEffectiveRatio(sensorIndex, this._configSnapshot());
  }

  _getEffectiveRatios() {
    return Array.from({ length: NUM_SENSORS }, (_, i) => this._getEffectiveRatio(i));
  }

  _recomputeThresholds() {
    for (let i = 0; i < NUM_SENSORS; i++) {
      this.sensorThresholds[i] = Math.round(this.sensorBaselines[i] * this._getEffectiveRatio(i));
    }
    if (!this.calibrationPhase) {
      this._processDetection(this.sensorValues);
    }
  }

  _thresholdMeta() {
    return {
      ratio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      effectiveRatios: this._getEffectiveRatios(),
      thresholds: this.sensorThresholds,
    };
  }

  _emitThresholdChanged(sensorIndex = null) {
    this._emit('SENSOR_THRESHOLD_CHANGED', {
      sensor: sensorIndex,
      ...this._thresholdMeta(),
    });
  }

  /** Prêt pour lancer un jeu (connecté + calibration terminée, ou mode simulation). */
  isReady() {
    if (this.simulationMode) return !this.calibrationPhase;
    return this.serialConnected && !this.calibrationPhase;
  }

  getStatus() {
    return {
      connected: this.simulationMode || this.serialConnected,
      simulated: this.simulationMode,
      port: this.serialPortName,
      values: this.sensorValues,
      states: this.sensorStates,
      baselines: this.sensorBaselines,
      thresholds: this.sensorThresholds,
      calibrating: this.calibrationPhase,
      totalDetections: this.totalDetections,
      total: this.totalDetections.reduce((a, b) => a + b, 0),
      counts: this.totalDetections,
      history: this.sensorHistory,
      ratio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      effectiveRatios: this._getEffectiveRatios(),
      calibrationDuration: CALIBRATION_DURATION_S,
      totalImpacts: this.totalImpacts,
      impactDetection: { ...this.impactDetection },
      impactDrops: this._impactDetector.lastDrops,
      impactActivity: this._impactDetector.lastDrops.filter(
        (d) => d >= (this.impactDetection.minDrop ?? 15)
      ).length,
      sensorStability: this._stabilitySnapshot(),
    };
  }

  /**
   * Met à jour le ratio de seuil global, persiste et recalcule si calibré.
   * @param {number} ratio — entre 0.1 et 0.9
   */
  setThresholdRatio(ratio) {
    const value = clampRatio(ratio);
    if (value == null) {
      return { ok: false, error: 'INVALID_THRESHOLD_RATIO' };
    }

    this.thresholdRatio = value;
    this._persistConfig();

    if (!this.calibrationPhase) {
      this._recomputeThresholds();
      this._emitThresholdChanged(null);
      this._emitSensorUpdate();
    }

    this._notifyStateChange();
    return {
      ok: true,
      sensor: null,
      ...this._thresholdMeta(),
    };
  }

  /**
   * Override absolu pour un capteur (0–6). ratio null = retour au global.
   * @param {number} sensorIndex
   * @param {number|null} ratio
   */
  setSensorOverride(sensorIndex, ratio) {
    const idx = Number(sensorIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= NUM_SENSORS) {
      return { ok: false, error: 'INVALID_SENSOR' };
    }

    const key = String(idx);
    if (ratio == null) {
      delete this.sensorOverrides[key];
    } else {
      const value = clampRatio(ratio);
      if (value == null) {
        return { ok: false, error: 'INVALID_THRESHOLD_RATIO' };
      }
      this.sensorOverrides[key] = value;
    }

    this._persistConfig();

    if (!this.calibrationPhase) {
      this._recomputeThresholds();
      this._emitThresholdChanged(idx);
      this._emitSensorUpdate();
    }

    this._notifyStateChange();
    return {
      ok: true,
      sensor: idx,
      ...this._thresholdMeta(),
    };
  }

  resetAllSensorOverrides() {
    this.sensorOverrides = {};
    this._persistConfig();

    if (!this.calibrationPhase) {
      this._recomputeThresholds();
      this._emitThresholdChanged(null);
      this._emitSensorUpdate();
    }

    this._notifyStateChange();
    return {
      ok: true,
      sensor: null,
      ...this._thresholdMeta(),
    };
  }

  /**
   * Met à jour la sensibilité impact (10 = sensible, 90 = tolérant), persiste et réapplique.
   * @param {number} sensitivity — entre 10 et 90
   */
  setImpactSensitivity(sensitivity) {
    const value = Number(sensitivity);
    if (!Number.isFinite(value) || value < MIN_SENSITIVITY || value > MAX_SENSITIVITY) {
      return { ok: false, error: 'INVALID_IMPACT_SENSITIVITY' };
    }

    this.impactDetection = normalizeImpactConfig({
      enabled: this.impactDetection.enabled,
      sensitivity: Math.round(value),
      peakSamples: this.impactDetection.peakSamples,
    });
    this._impactDetector.setConfig(this.impactDetection);
    this._persistConfig();

    this._emit('SENSOR_IMPACT_CONFIG_CHANGED', {
      impactDetection: { ...this.impactDetection },
    });
    this._emitSensorUpdate();

    return {
      ok: true,
      impactDetection: { ...this.impactDetection },
    };
  }

  _emit(type, data = {}) {
    this.broadcast({ type, ...data });
  }

  _emitSensorUpdate() {
    this._emit('SENSOR_UPDATE', {
      values: this.sensorValues,
      states: this.sensorStates,
      counts: this.totalDetections,
      total: this.totalDetections.reduce((a, b) => a + b, 0),
      history: this.sensorHistory,
      thresholds: this.sensorThresholds,
      baselines: this.sensorBaselines,
      calibrating: this.calibrationPhase,
      port: this.serialPortName,
      ratio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      effectiveRatios: this._getEffectiveRatios(),
      impactDetection: { ...this.impactDetection },
      totalImpacts: this.totalImpacts,
      impactDrops: this._impactDetector.lastDrops,
      impactActivity: this._impactDetector.lastDrops.filter(
        (d) => d >= (this.impactDetection.minDrop ?? 15)
      ).length,
      sensorStability: this._stabilitySnapshot(),
    });
  }

  recalibrate() {
    this.calibrationPhase = true;
    this.calibrationStart = null;
    this.calibrationSamples = Array.from({ length: NUM_SENSORS }, () => []);
    this.sensorStates = Array(NUM_SENSORS).fill(false);
    this._previousValues = Array(NUM_SENSORS).fill(4095);
    this._impactDetector.reset();
    this._stabilityTracker.reset();
    this._emit('SENSOR_CALIBRATION_START', { duration: CALIBRATION_DURATION_S });
    this._notifyStateChange();
    console.log(`[ESP32] Recalibration (${CALIBRATION_DURATION_S}s)…`);

    if (this.simulationMode) {
      for (let i = 0; i < NUM_SENSORS; i++) {
        this.calibrationSamples[i] = Array(20).fill(4095);
      }
      this.calibrationStart = Date.now() - CALIBRATION_DURATION_S * 1000;
      this._processCalibration(Array(NUM_SENSORS).fill(4095));
      this._emitSensorUpdate();
    }
  }

  async findPort() {
    const ports = await SerialPort.list();
    for (const port of ports) {
      const desc = [
        port.path,
        port.manufacturer,
        port.serialNumber,
        port.pnpId,
        port.friendlyName,
      ]
        .filter(Boolean)
        .join(' ');
      if (PORT_KEYWORDS.some((kw) => desc.toLowerCase().includes(kw.toLowerCase()))) {
        return port.path;
      }
    }
    for (const port of ports) {
      if (!PORT_SKIP.some((s) => port.path.toLowerCase().includes(s))) {
        return port.path;
      }
    }
    return null;
  }

  async start(portPath = null) {
    if (this.simulationMode) return;
    if (this._starting) return;
    this._starting = true;

    try {
      const path = portPath || process.env.ESP32_SERIAL_PORT || (await this.findPort());
      if (!path) {
        console.warn('[ESP32] Aucun port série détecté — en attente de connexion USB');
        this._emit('SENSOR_SERIAL_STATUS', {
          connected: false,
          message: 'Aucun port série détecté',
        });
        this._notifyStateChange();
        this._startReconnectLoop();
        return;
      }

      this._stopReconnectLoop();

      await this.stop();

      this._port = new SerialPort({ path, baudRate: BAUD_RATE, autoOpen: false });
      this._parser = this._port.pipe(new ReadlineParser({ delimiter: '\n' }));

      await new Promise((resolve, reject) => {
        this._port.open((err) => (err ? reject(err) : resolve()));
      });

      this.serialConnected = true;
      this.serialPortName = path;
      this.recalibrate();

      console.log(`[ESP32] Connecté sur ${path} @ ${BAUD_RATE} baud`);
      this._emit('SENSOR_SERIAL_STATUS', { connected: true, port: path });
      this._notifyStateChange();

      this._parser.on('data', (line) => this._handleLine(line));
      this._port.on('error', (err) => {
        console.error('[ESP32] Erreur port série :', err.message);
        this._handleDisconnect(err.message);
      });
      this._port.on('close', () => this._handleDisconnect('Port fermé'));
    } catch (err) {
      console.error('[ESP32] Impossible d’ouvrir le port série :', err.message);
      this._emit('SENSOR_SERIAL_STATUS', {
        connected: false,
        message: `Erreur : ${err.message}`,
      });
      this._notifyStateChange();
      this._startReconnectLoop();
    } finally {
      this._starting = false;
    }
  }

  _startReconnectLoop() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setInterval(() => {
      if (this.serialConnected || this._starting) return;
      this.start().catch(() => {});
    }, 3000);
  }

  _stopReconnectLoop() {
    if (!this._reconnectTimer) return;
    clearInterval(this._reconnectTimer);
    this._reconnectTimer = null;
  }

  async stop() {
    this._stopReconnectLoop();
    if (this._parser) {
      this._parser.removeAllListeners();
      this._parser = null;
    }
    if (this._port?.isOpen) {
      await new Promise((resolve) => {
        this._port.close(() => resolve());
      });
    }
    this._port = null;
    this.serialConnected = false;
  }

  _handleDisconnect(message) {
    if (!this.serialConnected) return;
    this.serialConnected = false;
    this.serialPortName = 'Non connecté';
    this.calibrationPhase = true;
    this.calibrationStart = null;
    console.warn('[ESP32] Déconnecté :', message);
    this._emit('SENSOR_SERIAL_STATUS', { connected: false, message });
    this._notifyStateChange();
    this._startReconnectLoop();
  }

  /**
   * Mode développement sans ESP32 : capteurs virtuels, détection et impacts simulables.
   */
  startSimulation() {
    this.simulationMode = true;
    this._stopReconnectLoop();
    this.serialConnected = true;
    this.serialPortName = 'Simulation (dev)';
    this.calibrationPhase = false;
    this.calibrationStart = null;

    for (let i = 0; i < NUM_SENSORS; i++) {
      this.sensorBaselines[i] = 4095;
      this.sensorValues[i] = 4095;
      this._previousValues[i] = 4095;
      this.sensorStates[i] = false;
    }
    this._recomputeThresholds();

    console.log('[ESP32] Mode simulation actif — pas de port série USB');
    this._emit('SENSOR_SERIAL_STATUS', {
      connected: true,
      port: this.serialPortName,
      simulated: true,
    });
    this._emit('SENSOR_CALIBRATION_DONE', {
      baselines: this.sensorBaselines,
      thresholds: this.sensorThresholds,
      ratio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      effectiveRatios: this._getEffectiveRatios(),
      simulated: true,
    });
    this._emitSensorUpdate();
    this._notifyStateChange();
  }

  /**
   * Injecte des valeurs ADC comme une ligne RAW: de l'ESP32.
   * @param {number[]} values
   */
  _feedRawValues(values) {
    if (values.length !== NUM_SENSORS || values.some((v) => Number.isNaN(v))) return;

    if (this.calibrationPhase) {
      this._processCalibration(values);
      this.sensorValues = values;
      for (let i = 0; i < NUM_SENSORS; i++) {
        this.sensorHistory[i].push(values[i]);
        if (this.sensorHistory[i].length > HISTORY_SIZE) {
          this.sensorHistory[i].shift();
        }
      }
      this._previousValues = values.slice();
      return;
    }

    this._processDetection(values);
    this._processImpactDetection(values);

    this.sensorValues = values;
    for (let i = 0; i < NUM_SENSORS; i++) {
      this.sensorHistory[i].push(values[i]);
      if (this.sensorHistory[i].length > HISTORY_SIZE) {
        this.sensorHistory[i].shift();
      }
    }

    this._previousValues = values.slice();
    this._emitSensorUpdate();
  }

  /**
   * Simule le passage d'une balle dans une colonne (dashboard + trigger jeu).
   * @param {number} col — index 0–6
   * @returns {Promise<{ status: number, body: object }>}
   */
  async simulateBallInColumn(col) {
    if (!this.simulationMode) {
      return { status: 400, body: { success: false, error: 'NOT_SIMULATION_MODE' } };
    }
    if (!this.isReady()) {
      return { status: 503, body: { success: false, error: 'ESP32_NOT_READY' } };
    }

    const idx = Number(col);
    if (!Number.isInteger(idx) || idx < 0 || idx >= NUM_SENSORS) {
      return { status: 400, body: { success: false, error: 'INVALID_COLUMN' } };
    }

    const detectedValue = Math.max(0, this.sensorThresholds[idx] - 150);

    if (this.sensorStates[idx]) {
      const clear = this.sensorValues.slice();
      clear[idx] = this.sensorBaselines[idx];
      this.sensorStates[idx] = false;
      this._feedRawValues(clear);
    }

    const values = this.sensorValues.slice();
    values[idx] = detectedValue;

    let capturedPromise;
    const prevOnTrigger = this.onTrigger;
    this.onTrigger = (c) => {
      capturedPromise = prevOnTrigger(c);
      return capturedPromise;
    };

    this._feedRawValues(values);
    this.onTrigger = prevOnTrigger;

    const captured = capturedPromise ? await capturedPromise : null;

    const baseline = this.sensorBaselines[idx];
    setTimeout(() => {
      const release = this.sensorValues.slice();
      release[idx] = baseline;
      this._feedRawValues(release);
    }, 280);

    return captured ?? { status: 200, body: { success: true, column: idx, simulated: true } };
  }

  /**
   * Simule un impact structure (chute simultanée sur plusieurs capteurs).
   * @param {number[]} sensors — index capteurs 0–6
   */
  simulateStructureImpact(sensors) {
    if (!this.simulationMode) {
      return { ok: false, error: 'NOT_SIMULATION_MODE' };
    }
    if (!this.isReady()) {
      return { ok: false, error: 'ESP32_NOT_READY' };
    }

    const indices = (Array.isArray(sensors) ? sensors : [])
      .map((s) => Number(s))
      .filter((s) => Number.isInteger(s) && s >= 0 && s < NUM_SENSORS);

    if (indices.length === 0) {
      return { ok: false, error: 'INVALID_SENSORS' };
    }

    const values = this.sensorValues.slice();
    for (const idx of indices) {
      values[idx] = Math.max(0, this.sensorThresholds[idx] - 200);
    }
    this._feedRawValues(values);

    setTimeout(() => {
      const clear = this.sensorBaselines.slice();
      this._feedRawValues(clear);
    }, 120);

    return { ok: true, sensors: indices };
  }

  _handleLine(line) {
    const trimmed = String(line).trim();
    if (!trimmed.startsWith('RAW:')) return;

    let values;
    try {
      values = trimmed
        .slice(4)
        .split(',')
        .map((v) => Number.parseInt(v, 10));
      if (values.length !== NUM_SENSORS || values.some((v) => Number.isNaN(v))) return;
    } catch {
      return;
    }

    const previousValues = this._previousValues;

    this.sensorValues = values;
    for (let i = 0; i < NUM_SENSORS; i++) {
      this.sensorHistory[i].push(values[i]);
      if (this.sensorHistory[i].length > HISTORY_SIZE) {
        this.sensorHistory[i].shift();
      }
    }

    if (this.calibrationPhase) {
      this._processCalibration(values);
    } else {
      this._processDetection(values);
      this._processImpactDetection(values);
    }

    this._previousValues = values.slice();
    this._emitSensorUpdate();
  }

  _processCalibration(values) {
    if (this.calibrationStart === null) {
      this.calibrationStart = Date.now();
    }

    const elapsed = (Date.now() - this.calibrationStart) / 1000;
    for (let i = 0; i < NUM_SENSORS; i++) {
      this.calibrationSamples[i].push(values[i]);
    }

    const progress = Math.min(elapsed / CALIBRATION_DURATION_S, 1);
    this._emit('SENSOR_CALIBRATION_PROGRESS', {
      progress,
      elapsed: Math.round(elapsed * 10) / 10,
      values,
    });

    if (elapsed < CALIBRATION_DURATION_S) return;

    for (let i = 0; i < NUM_SENSORS; i++) {
      this.sensorBaselines[i] = trimmedMean(this.calibrationSamples[i]);
    }
    this._recomputeThresholds();

    this.calibrationPhase = false;
    console.log('[ESP32] Calibration terminée');
    for (let i = 0; i < NUM_SENSORS; i++) {
      const pct = Math.round(this._getEffectiveRatio(i) * 100);
      const override = this.sensorOverrides[String(i)] != null ? ' (perso)' : '';
      console.log(
        `  Capteur ${i + 1}: baseline=${this.sensorBaselines[i]} → seuil=${this.sensorThresholds[i]} (${pct}%${override})`
      );
    }

    this._emit('SENSOR_CALIBRATION_DONE', {
      baselines: this.sensorBaselines,
      thresholds: this.sensorThresholds,
      ratio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      effectiveRatios: this._getEffectiveRatios(),
    });
    this._notifyStateChange();
  }

  _processDetection(values) {
    const now = Date.now();

    for (let i = 0; i < NUM_SENSORS; i++) {
      const wasDetected = this.sensorStates[i];
      const isDetected = values[i] < this.sensorThresholds[i];

      if (isDetected === wasDetected) continue;

      this.sensorStates[i] = isDetected;

      if (isDetected) {
        this.totalDetections[i] += 1;
        if (now - this._lastTriggerTime[i] >= TRIGGER_DEBOUNCE_MS) {
          this._lastTriggerTime[i] = now;
          this.onTrigger(i).catch((err) => {
            console.error(`[ESP32] Erreur trigger colonne ${i} :`, err.message);
          });
        }
      }

      this._emit('SENSOR_EVENT', { sensor: i, state: isDetected });
      const label = isDetected ? 'BALLE' : 'libre';
      console.log(
        `[ESP32] Capteur ${i + 1}: ${label} (valeur=${values[i]}, seuil=${this.sensorThresholds[i]})`
      );
    }
  }

  _processImpactDetection(values) {
    if (!this.impactDetection.enabled) return;

    const impact = this._impactDetector.tick(values);
    if (!impact) return;

    this.totalImpacts += 1;
    this._stabilityTracker.recordImpact(impact.sensors, impact.timestamp);
    this._emit('SENSOR_IMPACT', { ...impact, totalImpacts: this.totalImpacts });
    console.log(
      `[ESP32] Impact structure — ${impact.sensorCount} capteurs, magnitude=${impact.magnitude}, peak=${impact.peakDrop}`
    );
    this.onImpact(impact).catch((err) => {
      console.error('[ESP32] Erreur callback impact :', err.message);
    });
  }

  /** Envoie l'état courant à un client WS qui vient de se connecter. */
  syncClient(send) {
    send({
      type: 'SENSOR_UPDATE',
      values: this.sensorValues,
      states: this.sensorStates,
      counts: this.totalDetections,
      total: this.totalDetections.reduce((a, b) => a + b, 0),
      history: this.sensorHistory,
      thresholds: this.sensorThresholds,
      baselines: this.sensorBaselines,
      calibrating: this.calibrationPhase,
      port: this.serialPortName,
      ratio: this.thresholdRatio,
      sensorOverrides: { ...this.sensorOverrides },
      effectiveRatios: this._getEffectiveRatios(),
      impactDetection: { ...this.impactDetection },
      totalImpacts: this.totalImpacts,
      impactDrops: this._impactDetector.lastDrops,
      impactActivity: this._impactDetector.lastDrops.filter(
        (d) => d >= (this.impactDetection.minDrop ?? 15)
      ).length,
      sensorStability: this._stabilitySnapshot(),
    });
    if (this.serialConnected) {
      send({ type: 'SENSOR_SERIAL_STATUS', connected: true, port: this.serialPortName });
    } else {
      send({
        type: 'SENSOR_SERIAL_STATUS',
        connected: false,
        message: 'Non connecté',
      });
    }
    if (this.calibrationPhase) {
      send({ type: 'SENSOR_CALIBRATION_START', duration: CALIBRATION_DURATION_S });
      if (this.calibrationStart !== null) {
        const elapsed = (Date.now() - this.calibrationStart) / 1000;
        send({
          type: 'SENSOR_CALIBRATION_PROGRESS',
          progress: Math.min(elapsed / CALIBRATION_DURATION_S, 1),
          elapsed: Math.round(elapsed * 10) / 10,
          values: this.sensorValues,
        });
      }
    } else {
      send({
        type: 'SENSOR_CALIBRATION_DONE',
        baselines: this.sensorBaselines,
        thresholds: this.sensorThresholds,
        ratio: this.thresholdRatio,
        sensorOverrides: { ...this.sensorOverrides },
        effectiveRatios: this._getEffectiveRatios(),
      });
    }
  }
}

module.exports = {
  Esp32SensorService,
  DEFAULT_THRESHOLD_RATIO,
  THRESHOLD_RATIO: DEFAULT_THRESHOLD_RATIO,
  CALIBRATION_DURATION_S,
  HISTORY_SIZE,
  MIN_THRESHOLD_RATIO,
  MAX_THRESHOLD_RATIO,
};
