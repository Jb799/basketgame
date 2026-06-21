/**
 * sensorConfig.js — Persistance locale du ratio de seuil IR (data/sensors-config.json).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_THRESHOLD_RATIO = 0.55;
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'sensors-config.json');

function loadThresholdRatio() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const ratio = Number(data.thresholdRatio);
    if (ratio > 0 && ratio < 1) return ratio;
  } catch {
    // Fichier absent ou invalide — valeur par défaut
  }
  return DEFAULT_THRESHOLD_RATIO;
}

function saveThresholdRatio(ratio) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ thresholdRatio: ratio }, null, 2) + '\n',
    'utf8'
  );
}

module.exports = {
  DEFAULT_THRESHOLD_RATIO,
  loadThresholdRatio,
  saveThresholdRatio,
};
