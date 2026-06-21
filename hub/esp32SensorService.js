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
  loadThresholdRatio,
  saveThresholdRatio,
} = require('./sensorConfig');

const NUM_SENSORS = PLATFORM_COLUMNS;
const HISTORY_SIZE = 100;
const BAUD_RATE = 115200;
const CALIBRATION_DURATION_S = 5.0;
const TRIGGER_DEBOUNCE_MS = 500;
const MIN_THRESHOLD_RATIO = 0.1;
const MAX_THRESHOLD_RATIO = 0.9;

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

    this.sensorValues = Array(NUM_SENSORS).fill(4095);
    this.sensorStates = Array(NUM_SENSORS).fill(false);
    this.sensorHistory = emptyHistory();
    this.totalDetections = Array(NUM_SENSORS).fill(0);
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
    this.thresholdRatio = loadThresholdRatio();
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

  /** Prêt pour lancer un jeu (connecté + calibration terminée). */
  isReady() {
    return this.serialConnected && !this.calibrationPhase;
  }

  getStatus() {
    return {
      connected: this.serialConnected,
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
      calibrationDuration: CALIBRATION_DURATION_S,
    };
  }

  /**
   * Met à jour le ratio de seuil (baseline × ratio), persiste et recalcule si calibré.
   * @param {number} ratio — entre 0.1 et 0.9
   */
  setThresholdRatio(ratio) {
    const value = Number(ratio);
    if (!Number.isFinite(value) || value < MIN_THRESHOLD_RATIO || value > MAX_THRESHOLD_RATIO) {
      return { ok: false, error: 'INVALID_THRESHOLD_RATIO' };
    }

    this.thresholdRatio = value;
    saveThresholdRatio(value);

    if (!this.calibrationPhase) {
      this._applyThresholdRatio();
      this._emit('SENSOR_THRESHOLD_CHANGED', {
        ratio: this.thresholdRatio,
        thresholds: this.sensorThresholds,
      });
      this._emitSensorUpdate();
    }

    this._notifyStateChange();
    return { ok: true, ratio: this.thresholdRatio, thresholds: this.sensorThresholds };
  }

  _applyThresholdRatio() {
    for (let i = 0; i < NUM_SENSORS; i++) {
      this.sensorThresholds[i] = Math.round(this.sensorBaselines[i] * this.thresholdRatio);
    }
    this._processDetection(this.sensorValues);
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
    });
  }

  recalibrate() {
    this.calibrationPhase = true;
    this.calibrationStart = null;
    this.calibrationSamples = Array.from({ length: NUM_SENSORS }, () => []);
    this.sensorStates = Array(NUM_SENSORS).fill(false);
    this._emit('SENSOR_CALIBRATION_START', { duration: CALIBRATION_DURATION_S });
    this._notifyStateChange();
    console.log(`[ESP32] Recalibration (${CALIBRATION_DURATION_S}s)…`);
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
    }

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
      this.sensorThresholds[i] = Math.round(this.sensorBaselines[i] * this.thresholdRatio);
    }

    this.calibrationPhase = false;
    console.log('[ESP32] Calibration terminée');
    for (let i = 0; i < NUM_SENSORS; i++) {
      console.log(
        `  Capteur ${i + 1}: baseline=${this.sensorBaselines[i]} → seuil=${this.sensorThresholds[i]}`
      );
    }

    this._emit('SENSOR_CALIBRATION_DONE', {
      baselines: this.sensorBaselines,
      thresholds: this.sensorThresholds,
      ratio: this.thresholdRatio,
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
