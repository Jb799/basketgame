/**
 * sensorConfig.js — Persistance locale des seuils IR (data/sensors-config.json).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PLATFORM_COLUMNS } = require('../shared/constants');

const DEFAULT_THRESHOLD_RATIO = 0.55;
const MIN_THRESHOLD_RATIO = 0.1;
const MAX_THRESHOLD_RATIO = 0.9;
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'sensors-config.json');
const NUM_SENSORS = PLATFORM_COLUMNS;

function clampRatio(ratio) {
  const value = Number(ratio);
  if (!Number.isFinite(value)) return null;
  return Math.min(MAX_THRESHOLD_RATIO, Math.max(MIN_THRESHOLD_RATIO, value));
}

function normalizeSensorOverrides(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, val] of Object.entries(raw)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= NUM_SENSORS) continue;
    const ratio = clampRatio(val);
    if (ratio != null) result[String(idx)] = ratio;
  }
  return result;
}

function loadSensorConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const thresholdRatio = clampRatio(data.thresholdRatio) ?? DEFAULT_THRESHOLD_RATIO;
    const sensorOverrides = normalizeSensorOverrides(data.sensorOverrides);
    return { thresholdRatio, sensorOverrides };
  } catch {
    return { thresholdRatio: DEFAULT_THRESHOLD_RATIO, sensorOverrides: {} };
  }
}

function saveSensorConfig(config) {
  const thresholdRatio = clampRatio(config.thresholdRatio) ?? DEFAULT_THRESHOLD_RATIO;
  const sensorOverrides = normalizeSensorOverrides(config.sensorOverrides);
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ thresholdRatio, sensorOverrides }, null, 2) + '\n',
    'utf8'
  );
}

function getEffectiveRatio(index, config) {
  const key = String(index);
  if (config.sensorOverrides?.[key] != null) {
    return config.sensorOverrides[key];
  }
  return config.thresholdRatio;
}

/** @deprecated Utiliser loadSensorConfig */
function loadThresholdRatio() {
  return loadSensorConfig().thresholdRatio;
}

/** @deprecated Utiliser saveSensorConfig */
function saveThresholdRatio(ratio) {
  const config = loadSensorConfig();
  config.thresholdRatio = clampRatio(ratio) ?? DEFAULT_THRESHOLD_RATIO;
  saveSensorConfig(config);
}

module.exports = {
  DEFAULT_THRESHOLD_RATIO,
  MIN_THRESHOLD_RATIO,
  MAX_THRESHOLD_RATIO,
  NUM_SENSORS,
  clampRatio,
  normalizeSensorOverrides,
  loadSensorConfig,
  saveSensorConfig,
  getEffectiveRatio,
  loadThresholdRatio,
  saveThresholdRatio,
};
