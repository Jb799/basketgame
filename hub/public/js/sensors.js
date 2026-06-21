/**
 * sensors.js — Dashboard capteurs IR (WebSocket hub BasketGame).
 */

(function () {
  const NUM_CAPTEURS = 7;
  const HISTORY_SIZE = 100;
  const CALIB_DURATION = 5;
  const DEFAULT_THRESHOLD_PERCENT = 55;
  const MIN_THRESHOLD_PERCENT = 10;
  const MAX_THRESHOLD_PERCENT = 90;

  const SENSOR_COLORS = [
    '#ff6b00',
    '#ff8533',
    '#e55d00',
    '#ffb347',
    '#22d3ee',
    '#67e8f9',
    '#0891b2',
  ];

  const GPIO_PINS = [33, 32, 34, 35, 36, 39, 25].reverse();

  let sensorValues = new Array(NUM_CAPTEURS).fill(4095);
  let sensorStates = new Array(NUM_CAPTEURS).fill(false);
  let sensorCounts = new Array(NUM_CAPTEURS).fill(0);
  let sensorBaselines = new Array(NUM_CAPTEURS).fill(4095);
  let sensorThresholds = new Array(NUM_CAPTEURS).fill(2000);
  let totalDetections = 0;
  let historyData = Array.from({ length: NUM_CAPTEURS }, () => new Array(HISTORY_SIZE).fill(4095));
  let chart = null;
  let serialConnected = false;
  let thresholdPercent = DEFAULT_THRESHOLD_PERCENT;
  let lastSavedPercent = DEFAULT_THRESHOLD_PERCENT;
  let thresholdEditing = false;
  let thresholdSaveTimer = null;
  let thresholdSavedTimer = null;
  let sensorOverrides = {};
  let effectiveRatios = new Array(NUM_CAPTEURS).fill(DEFAULT_THRESHOLD_PERCENT / 100);
  let sensorEditing = new Array(NUM_CAPTEURS).fill(false);
  let lastSavedSensorPercent = new Array(NUM_CAPTEURS).fill(DEFAULT_THRESHOLD_PERCENT);
  const sensorSaveTimers = new Array(NUM_CAPTEURS).fill(null);

  const btnRecalib = document.getElementById('btn-recalib');
  const btnResetAllOverrides = document.getElementById('btn-reset-all-overrides');
  const thresholdPanel = document.getElementById('thresholdPanel');
  const thresholdInput = document.getElementById('thresholdPercent');
  const thresholdSlider = document.getElementById('thresholdSlider');
  const thresholdValueDisplay = document.getElementById('thresholdValueDisplay');
  const thresholdStatus = document.getElementById('thresholdStatus');

  function initUI() {
    const grid = document.getElementById('sensorGrid');
    const gauges = document.getElementById('miniGauges');

    for (let i = 0; i < NUM_CAPTEURS; i++) {
      const card = document.createElement('div');
      card.className = 'sensor-card';
      card.id = `card-${i}`;
      card.style.setProperty('--card-color', SENSOR_COLORS[i]);
      card.innerHTML = `
        <div class="ball-icon">🎱</div>
        <div class="sensor-header">
          <div class="sensor-num">${i + 1}</div>
          <div class="sensor-status-badge free" id="badge-${i}">Libre</div>
        </div>
        <div class="sensor-value" id="val-${i}">4095</div>
        <div class="sensor-label">Valeur ADC (0 – 4095)</div>
        <div class="bar-track">
          <div class="bar-fill" id="bar-${i}" style="width: 100%;"></div>
          <div class="bar-threshold-marker" id="bar-marker-${i}" hidden></div>
        </div>
        <div class="sensor-stats">
          <span>Détections : <span class="count" id="cnt-${i}">0</span></span>
          <span style="color: ${SENSOR_COLORS[i]};">GPIO ${GPIO_PINS[i]}</span>
        </div>
        <div id="thresh-${i}" class="sensor-thresh">Calibration…</div>
        <div class="sensor-threshold" id="sensor-threshold-${i}">
          <div class="sensor-threshold__head">
            <span class="sensor-threshold__mode" id="thresh-mode-${i}">Global ${DEFAULT_THRESHOLD_PERCENT} %</span>
            <span class="sensor-threshold__badge" id="thresh-badge-${i}" hidden>Perso</span>
          </div>
          <div class="sensor-threshold__row">
            <input
              type="range"
              class="sensor-threshold__slider"
              id="thresh-slider-${i}"
              min="${MIN_THRESHOLD_PERCENT}"
              max="${MAX_THRESHOLD_PERCENT}"
              step="1"
              value="${DEFAULT_THRESHOLD_PERCENT}"
              aria-label="Seuil capteur ${i + 1}"
            />
            <label class="sensor-threshold__input-wrap" for="thresh-input-${i}">
              <input
                type="number"
                class="sensor-threshold__input"
                id="thresh-input-${i}"
                min="${MIN_THRESHOLD_PERCENT}"
                max="${MAX_THRESHOLD_PERCENT}"
                step="1"
                value="${DEFAULT_THRESHOLD_PERCENT}"
              />
              <span>%</span>
            </label>
          </div>
          <button type="button" class="sensor-threshold__reset" id="thresh-reset-${i}" hidden>
            Réinitialiser
          </button>
        </div>
      `;
      grid.appendChild(card);

      const mg = document.createElement('div');
      mg.className = 'mini-gauge';
      mg.innerHTML = `
        <div class="mg-num" style="color: ${SENSOR_COLORS[i]};">${i + 1}</div>
        <div class="mg-track">
          <div class="mg-fill" id="mg-${i}" style="width: 100%; background: ${SENSOR_COLORS[i]};"></div>
        </div>
        <div class="mg-val" id="mgval-${i}">4095</div>
      `;
      gauges.appendChild(mg);
      initSensorThresholdControls(i);
    }
  }

  function hasOverride(idx) {
    return sensorOverrides[String(idx)] != null;
  }

  function getEffectivePercent(idx) {
    const ratio = effectiveRatios[idx] ?? thresholdPercent / 100;
    return Math.round(ratio * 100);
  }

  function sensorSliderFill(pct) {
    const span = MAX_THRESHOLD_PERCENT - MIN_THRESHOLD_PERCENT;
    return `${((pct - MIN_THRESHOLD_PERCENT) / span) * 100}%`;
  }

  function formatThreshLine(idx) {
    const base = sensorBaselines[idx];
    const thresh = sensorThresholds[idx];
    if (!base || base >= 4095) return 'Calibration…';
    const pct = getEffectivePercent(idx);
    const label = hasOverride(idx) ? `${pct} % perso` : `${pct} % global`;
    return `Seuil: ${thresh}  Base: ${base}  (${label})`;
  }

  function updateSensorThreshLine(idx) {
    const el = document.getElementById(`thresh-${idx}`);
    if (el) el.textContent = formatThreshLine(idx);
    updateSensorThresholdMode(idx);
  }

  function updateSensorThresholdMode(idx) {
    const modeEl = document.getElementById(`thresh-mode-${idx}`);
    const badgeEl = document.getElementById(`thresh-badge-${idx}`);
    const resetBtn = document.getElementById(`thresh-reset-${idx}`);
    const card = document.getElementById(`card-${idx}`);
    const pct = getEffectivePercent(idx);

    if (modeEl) {
      modeEl.textContent = hasOverride(idx)
        ? `Perso ${pct} %`
        : `Global ${thresholdPercent} %`;
    }
    if (badgeEl) badgeEl.hidden = !hasOverride(idx);
    if (resetBtn) resetBtn.hidden = !hasOverride(idx);
    if (card) card.classList.toggle('has-override', hasOverride(idx));
  }

  function updateSensorThresholdInputs(idx, pct) {
    const value = clampThresholdPercent(pct);
    const slider = document.getElementById(`thresh-slider-${idx}`);
    const input = document.getElementById(`thresh-input-${idx}`);
    if (slider) {
      slider.value = String(value);
      slider.style.setProperty('--threshold-fill', sensorSliderFill(value));
    }
    if (input) input.value = String(value);
  }

  function previewSensorThreshold(idx, pct) {
    const ratio = clampThresholdPercent(pct) / 100;
    if (!sensorBaselines[idx]) return;
    sensorThresholds[idx] = Math.round(sensorBaselines[idx] * ratio);
    updateSensorThreshLine(idx);
    updateBarMarker(idx);
    if (chart) chart.update('none');
  }

  function previewGlobalThresholds(pct) {
    const ratio = clampThresholdPercent(pct) / 100;
    for (let i = 0; i < NUM_CAPTEURS; i++) {
      if (hasOverride(i)) continue;
      if (!sensorBaselines[i] || sensorBaselines[i] >= 4095) continue;
      sensorThresholds[i] = Math.round(sensorBaselines[i] * ratio);
      effectiveRatios[i] = ratio;
      updateSensorThreshLine(i);
      updateBarMarker(i);
    }
    if (chart) chart.update('none');
  }

  function updateResetAllButtonVisibility() {
    if (!btnResetAllOverrides) return;
    btnResetAllOverrides.hidden = Object.keys(sensorOverrides).length === 0;
  }

  function applyThresholdPayload(data) {
    if (data.baselines) sensorBaselines = data.baselines;
    if (data.thresholds) sensorThresholds = data.thresholds;
    if (data.sensorOverrides) sensorOverrides = { ...data.sensorOverrides };
    if (data.effectiveRatios) effectiveRatios = data.effectiveRatios.slice();

    for (let i = 0; i < NUM_CAPTEURS; i++) {
      if (!sensorEditing[i]) {
        const pct = getEffectivePercent(i);
        lastSavedSensorPercent[i] = pct;
        updateSensorThresholdInputs(i, pct);
      }
      updateSensorThreshLine(i);
      updateBarMarker(i);
    }
    updateResetAllButtonVisibility();
    if (chart) chart.update('none');
  }

  async function postThresholdBody(body) {
    const res = await fetch('/api/sensors/threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function saveSensorOverride(idx, percent) {
    const pct = clampThresholdPercent(percent);
    if (pct === lastSavedSensorPercent[idx] && hasOverride(idx)) return;

    previewSensorThreshold(idx, pct);

    try {
      const { res, data } = await postThresholdBody({ sensor: idx, percent: pct });
      if (!res.ok) {
        updateSensorThresholdInputs(idx, lastSavedSensorPercent[idx]);
        previewSensorThreshold(idx, lastSavedSensorPercent[idx]);
        return;
      }

      lastSavedSensorPercent[idx] = data.percent ?? pct;
      applyThresholdPayload({
        baselines: sensorBaselines,
        thresholds: data.thresholds,
        sensorOverrides: data.sensorOverrides,
        effectiveRatios: data.effectiveRatios,
      });
      if (data.ratio != null) syncThresholdRatioFromServer(data.ratio);
    } catch {
      updateSensorThresholdInputs(idx, lastSavedSensorPercent[idx]);
      previewSensorThreshold(idx, lastSavedSensorPercent[idx]);
    }
  }

  async function resetSensorOverride(idx) {
    try {
      const { res, data } = await postThresholdBody({ sensor: idx, reset: true });
      if (!res.ok) return;

      lastSavedSensorPercent[idx] = Math.round((data.effectiveRatios?.[idx] ?? thresholdPercent / 100) * 100);
      applyThresholdPayload({
        baselines: sensorBaselines,
        thresholds: data.thresholds,
        sensorOverrides: data.sensorOverrides,
        effectiveRatios: data.effectiveRatios,
      });
      if (data.ratio != null) syncThresholdRatioFromServer(data.ratio);
    } catch {
      // silencieux
    }
  }

  async function resetAllOverrides() {
    try {
      const { res, data } = await postThresholdBody({ resetAll: true });
      if (!res.ok) return;

      applyThresholdPayload({
        baselines: sensorBaselines,
        thresholds: data.thresholds,
        sensorOverrides: data.sensorOverrides || {},
        effectiveRatios: data.effectiveRatios,
      });
      if (data.ratio != null) syncThresholdRatioFromServer(data.ratio);
      setThresholdStatus('Tous les capteurs suivent le seuil global', true);
      setTimeout(() => setThresholdStatus(''), 1400);
    } catch {
      setThresholdStatus('Erreur réseau');
    }
  }

  function scheduleSensorSave(idx, percent, delayMs = 300) {
    clearTimeout(sensorSaveTimers[idx]);
    sensorSaveTimers[idx] = setTimeout(() => {
      saveSensorOverride(idx, percent);
    }, delayMs);
  }

  function initSensorThresholdControls(idx) {
    const slider = document.getElementById(`thresh-slider-${idx}`);
    const input = document.getElementById(`thresh-input-${idx}`);
    const resetBtn = document.getElementById(`thresh-reset-${idx}`);
    if (!slider || !input) return;

    const beginEdit = () => {
      sensorEditing[idx] = true;
      clearTimeout(sensorSaveTimers[idx]);
    };
    const endEdit = () => {
      sensorEditing[idx] = false;
    };

    slider.addEventListener('pointerdown', beginEdit);
    slider.addEventListener('pointerup', endEdit);
    slider.addEventListener('input', () => {
      const pct = clampThresholdPercent(slider.value);
      updateSensorThresholdInputs(idx, pct);
      previewSensorThreshold(idx, pct);
      scheduleSensorSave(idx, pct, 320);
    });
    slider.addEventListener('change', () => {
      endEdit();
      clearTimeout(sensorSaveTimers[idx]);
      saveSensorOverride(idx, slider.value);
    });

    input.addEventListener('focus', beginEdit);
    input.addEventListener('blur', () => {
      endEdit();
      saveSensorOverride(idx, input.value);
    });
    input.addEventListener('input', () => {
      const pct = clampThresholdPercent(input.value);
      slider.value = String(pct);
      slider.style.setProperty('--threshold-fill', sensorSliderFill(pct));
      previewSensorThreshold(idx, pct);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });

    resetBtn?.addEventListener('click', () => resetSensorOverride(idx));
  }

  function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    const labels = Array.from({ length: HISTORY_SIZE }, (_, i) => i);

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: Array.from({ length: NUM_CAPTEURS }, (_, i) => ({
          label: `Capteur ${i + 1}`,
          data: historyData[i].slice(),
          borderColor: SENSOR_COLORS[i],
          backgroundColor: SENSOR_COLORS[i] + '18',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
              labels: {
                color: '#a3a3a3',
                font: { size: 10, family: 'Inter' },
                boxWidth: 12,
                padding: 10,
              },
            },
            tooltip: {
              backgroundColor: '#1a1a1a',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              borderWidth: 1,
              titleColor: '#f5f5f5',
              bodyColor: '#a3a3a3',
            },
        },
        scales: {
          x: { display: false, grid: { display: false } },
          y: {
            min: 0,
            max: 4096,
            grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: '#a3a3a3',
                font: { size: 10, family: 'JetBrains Mono' },
                maxTicksLimit: 6,
              },
            border: { display: false },
          },
        },
      },
      plugins: [{
        id: 'threshold-lines',
        beforeDraw(c) {
          const { ctx: cctx, chartArea, scales } = c;
          if (!chartArea) return;
          cctx.save();
          for (let i = 0; i < NUM_CAPTEURS; i++) {
            const thresh = sensorThresholds[i];
            if (!thresh) continue;
            const y = scales.y.getPixelForValue(thresh);
            cctx.strokeStyle = SENSOR_COLORS[i] + '60';
            cctx.lineWidth = 1;
            cctx.setLineDash([4, 6]);
            cctx.beginPath();
            cctx.moveTo(chartArea.left, y);
            cctx.lineTo(chartArea.right, y);
            cctx.stroke();
          }
          cctx.restore();
        },
      }],
    });
  }

  function updateBarMarker(idx) {
    const marker = document.getElementById(`bar-marker-${idx}`);
    if (!marker) return;
    const thresh = sensorThresholds[idx];
    if (!thresh || thresh >= 4095) {
      marker.hidden = true;
      return;
    }
    marker.hidden = false;
    marker.style.left = `${(thresh / 4095) * 100}%`;
  }

  function updateSensor(idx, value, state) {
    const pct = (value / 4095) * 100;
    document.getElementById(`val-${idx}`).textContent = value.toLocaleString('fr-FR');
    document.getElementById(`mgval-${idx}`).textContent = value.toLocaleString('fr-FR');
    document.getElementById(`bar-${idx}`).style.width = `${pct}%`;
    document.getElementById(`mg-${idx}`).style.width = `${pct}%`;

    const mgFill = document.getElementById(`mg-${idx}`);
    mgFill.style.background = state ? 'var(--danger)' : SENSOR_COLORS[idx];

    const card = document.getElementById(`card-${idx}`);
    const badge = document.getElementById(`badge-${idx}`);
    if (state) {
      card.classList.add('triggered');
      badge.textContent = '⚡ Balle';
      badge.className = 'sensor-status-badge detected';
    } else {
      card.classList.remove('triggered');
      badge.textContent = 'Libre';
      badge.className = 'sensor-status-badge free';
    }
    updateBarMarker(idx);
  }

  function updateChart() {
    if (!chart) return;
    for (let i = 0; i < NUM_CAPTEURS; i++) {
      chart.data.datasets[i].data = historyData[i].slice();
    }
    chart.update('none');
  }

  function addLogEntry(sensorIdx, isEnter, customMsg) {
    const logList = document.getElementById('logList');
    const emptyEl = logList.querySelector('.empty-log');
    if (emptyEl) emptyEl.remove();

    const now = new Date();
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');

    if (sensorIdx === -1) {
      entry.className = 'log-entry exit';
      entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-msg log-msg--system">${customMsg || 'Système'}</span>
        <span class="log-badge exit">Système</span>
      `;
    } else {
      entry.className = `log-entry ${isEnter ? 'enter' : 'exit'}`;
      entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-msg">Capteur <strong>#${sensorIdx + 1}</strong> — GPIO ${GPIO_PINS[sensorIdx]}</span>
        <span class="log-badge ${isEnter ? 'enter' : 'exit'}">${isEnter ? 'Entrée' : 'Libre'}</span>
      `;
    }
    logList.insertBefore(entry, logList.firstChild);
    while (logList.children.length > 50) {
      logList.removeChild(logList.lastChild);
    }
  }

  function updateStats() {
    const active = sensorStates.filter(Boolean).length;
    document.getElementById('statTotal').textContent = totalDetections.toLocaleString('fr-FR');
    document.getElementById('statActive').textContent = String(active);
  }

  const serialConnection = document.getElementById('serial-connection');
  const serialConnectionLabel = document.getElementById('serial-connection-label');

  function setSerialConnection(online, text) {
    serialConnection.classList.toggle('is-online', online);
    serialConnection.classList.toggle('is-offline', !online);
    serialConnectionLabel.textContent = text;
  }

  function showCalibOverlay() {
    const ov = document.getElementById('calibOverlay');
    ov.classList.remove('hidden');
    ov.style.opacity = '1';
    ov.style.transition = '';
    document.getElementById('calibProgressFill').style.width = '0%';
    document.getElementById('calibTimer').textContent = `0.0s / ${CALIB_DURATION}s`;
  }

  function hideCalibOverlay() {
    const ov = document.getElementById('calibOverlay');
    ov.style.transition = 'opacity 0.5s';
    ov.style.opacity = '0';
    setTimeout(() => ov.classList.add('hidden'), 500);
  }

  function clampThresholdPercent(percent) {
    const pct = Math.round(Number(percent));
    if (!Number.isFinite(pct)) return thresholdPercent;
    return Math.min(MAX_THRESHOLD_PERCENT, Math.max(MIN_THRESHOLD_PERCENT, pct));
  }

  function sliderFillPercent(pct) {
    const span = MAX_THRESHOLD_PERCENT - MIN_THRESHOLD_PERCENT;
    return `${((pct - MIN_THRESHOLD_PERCENT) / span) * 100}%`;
  }

  function updateThresholdControls(pct, { updateInputs = true } = {}) {
    const value = clampThresholdPercent(pct);
    thresholdPercent = value;

    if (updateInputs) {
      if (thresholdInput) thresholdInput.value = String(value);
      if (thresholdSlider) {
        thresholdSlider.value = String(value);
        thresholdSlider.style.setProperty('--threshold-fill', sliderFillPercent(value));
      }
    }

    if (thresholdValueDisplay) {
      thresholdValueDisplay.innerHTML = `${value}<span>%</span>`;
    }

    const badge = document.getElementById('thresholdBadge');
    if (badge) badge.textContent = `Seuils — ${value}% baseline`;
  }

  function previewThresholdsFromPercent(pct) {
    previewGlobalThresholds(pct);
  }

  function applySensorThresholds(baselines, thresholds, extra = {}) {
    applyThresholdPayload({
      baselines,
      thresholds,
      sensorOverrides: extra.sensorOverrides ?? sensorOverrides,
      effectiveRatios: extra.effectiveRatios ?? effectiveRatios,
    });
  }

  function syncSensorOverridesFromServer(data) {
    if (!data) return;
    let changed = false;

    if (data.sensorOverrides) {
      sensorOverrides = { ...data.sensorOverrides };
      changed = true;
    }
    if (data.effectiveRatios) {
      effectiveRatios = data.effectiveRatios.slice();
      changed = true;
    }

    if (!changed) return;

    for (let i = 0; i < NUM_CAPTEURS; i++) {
      if (sensorEditing[i]) continue;
      const pct = getEffectivePercent(i);
      lastSavedSensorPercent[i] = pct;
      updateSensorThresholdInputs(i, pct);
      updateSensorThreshLine(i);
    }
    updateResetAllButtonVisibility();
  }

  function syncThresholdRatioFromServer(ratio) {
    if (thresholdEditing || ratio == null) return;
    const pct = Math.round(ratio * 100);
    if (pct === thresholdPercent && pct === lastSavedPercent) return;
    lastSavedPercent = pct;
    thresholdPercent = pct;
    updateThresholdControls(pct);
    for (let i = 0; i < NUM_CAPTEURS; i++) {
      if (!hasOverride(i) && !sensorEditing[i]) {
        effectiveRatios[i] = ratio;
        lastSavedSensorPercent[i] = pct;
        updateSensorThresholdInputs(i, pct);
      }
      updateSensorThresholdMode(i);
    }
  }

  function setThresholdStatus(message, ok = false) {
    if (!thresholdStatus) return;
    if (!message) {
      thresholdStatus.hidden = true;
      thresholdStatus.textContent = '';
      thresholdStatus.classList.remove('is-ok');
      return;
    }
    thresholdStatus.hidden = false;
    thresholdStatus.textContent = message;
    thresholdStatus.classList.toggle('is-ok', ok);
  }

  function markThresholdSaved() {
    if (!thresholdPanel) return;
    thresholdPanel.classList.remove('is-saving');
    thresholdPanel.classList.add('is-saved');
    clearTimeout(thresholdSavedTimer);
    thresholdSavedTimer = setTimeout(() => thresholdPanel.classList.remove('is-saved'), 900);
    setThresholdStatus('Seuil enregistré', true);
    setTimeout(() => setThresholdStatus(''), 1400);
  }

  async function saveThresholdPercent(percent) {
    const pct = clampThresholdPercent(percent);
    if (pct === lastSavedPercent) return;

    updateThresholdControls(pct);
    previewThresholdsFromPercent(pct);

    clearTimeout(thresholdSaveTimer);
    thresholdPanel?.classList.add('is-saving');
    setThresholdStatus('');

    try {
      const res = await fetch('/api/sensors/threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percent: pct }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        updateThresholdControls(lastSavedPercent);
        previewThresholdsFromPercent(lastSavedPercent);
        setThresholdStatus('Impossible d’enregistrer le seuil');
        return;
      }

      const saved = data.percent ?? pct;
      lastSavedPercent = saved;
      thresholdPercent = saved;
      updateThresholdControls(saved);
      if (data.thresholds) {
        applySensorThresholds(sensorBaselines, data.thresholds, data);
      } else {
        previewGlobalThresholds(saved);
      }
      markThresholdSaved();
    } catch {
      updateThresholdControls(lastSavedPercent);
      previewThresholdsFromPercent(lastSavedPercent);
      setThresholdStatus('Erreur réseau — seuil non enregistré');
    } finally {
      thresholdPanel?.classList.remove('is-saving');
    }
  }

  function scheduleThresholdSave(percent, delayMs = 280) {
    clearTimeout(thresholdSaveTimer);
    thresholdSaveTimer = setTimeout(() => {
      saveThresholdPercent(percent);
    }, delayMs);
  }

  function initThresholdControls() {
    if (!thresholdSlider || !thresholdInput) return;

    updateThresholdControls(DEFAULT_THRESHOLD_PERCENT);

    const beginEdit = () => {
      thresholdEditing = true;
      clearTimeout(thresholdSaveTimer);
    };
    const endEdit = () => {
      thresholdEditing = false;
    };

    thresholdSlider.addEventListener('pointerdown', beginEdit);
    thresholdSlider.addEventListener('pointerup', endEdit);
    thresholdSlider.addEventListener('input', () => {
      const pct = clampThresholdPercent(thresholdSlider.value);
      updateThresholdControls(pct, { updateInputs: true });
      previewThresholdsFromPercent(pct);
      scheduleThresholdSave(pct, 320);
    });
    thresholdSlider.addEventListener('change', () => {
      endEdit();
      clearTimeout(thresholdSaveTimer);
      saveThresholdPercent(thresholdSlider.value);
    });

    thresholdInput.addEventListener('focus', beginEdit);
    thresholdInput.addEventListener('blur', () => {
      endEdit();
      saveThresholdPercent(thresholdInput.value);
    });
    thresholdInput.addEventListener('input', () => {
      const pct = clampThresholdPercent(thresholdInput.value);
      if (thresholdSlider) {
        thresholdSlider.value = String(pct);
        thresholdSlider.style.setProperty('--threshold-fill', sliderFillPercent(pct));
      }
      if (thresholdValueDisplay) {
        thresholdValueDisplay.innerHTML = `${pct}<span>%</span>`;
      }
      previewThresholdsFromPercent(pct);
    });
    thresholdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        thresholdInput.blur();
      }
    });
  }

  function handleSensorUpdate(data) {
    sensorValues = data.values;
    sensorStates = data.states;
    sensorCounts = data.counts;
    totalDetections = data.total;
    if (data.thresholds) sensorThresholds = data.thresholds;
    if (data.baselines) sensorBaselines = data.baselines;
    syncThresholdRatioFromServer(data.ratio);
    syncSensorOverridesFromServer(data);

    for (let i = 0; i < NUM_CAPTEURS; i++) {
      updateSensor(i, data.values[i], data.states[i]);
      document.getElementById(`cnt-${i}`).textContent = data.counts[i];
      if (data.history && data.history[i]) {
        historyData[i] = data.history[i];
      }
      if (data.thresholds && data.baselines && !sensorEditing[i]) {
        updateSensorThreshLine(i);
      }
    }
    updateChart();
    updateStats();

    if (data.port) {
      document.getElementById('statPort').textContent = data.port;
      if (serialConnected) setSerialConnection(true, data.port);
    }

    if (!data.calibrating && data.thresholds && data.baselines) {
      hideCalibOverlay();
    } else if (data.calibrating) {
      showCalibOverlay();
    }
  }

  function handleHubMessage(msg) {
    switch (msg.type) {
      case 'SENSOR_UPDATE':
        handleSensorUpdate(msg);
        break;
      case 'SENSOR_EVENT':
        addLogEntry(msg.sensor, msg.state);
        break;
      case 'SENSOR_CALIBRATION_START':
        showCalibOverlay();
        break;
      case 'SENSOR_CALIBRATION_PROGRESS':
        document.getElementById('calibProgressFill').style.width = `${Math.round(msg.progress * 100)}%`;
        document.getElementById('calibTimer').textContent =
          `${msg.elapsed}s / ${CALIB_DURATION}s  —  ${Math.round(msg.progress * 100)}%`;
        document.getElementById('calibLiveVals').innerHTML = (msg.values || [])
          .map((v, i) => `<div class="clv">C${i + 1} <span>${v}</span></div>`)
          .join('');
        break;
      case 'SENSOR_CALIBRATION_DONE':
        applySensorThresholds(msg.baselines, msg.thresholds, msg);
        syncThresholdRatioFromServer(msg.ratio);
        hideCalibOverlay();
        addLogEntry(-1, false, 'Calibration OK — seuils calculés');
        break;
      case 'SENSOR_THRESHOLD_CHANGED':
        applySensorThresholds(sensorBaselines, msg.thresholds, msg);
        syncThresholdRatioFromServer(msg.ratio);
        break;
      case 'SENSOR_SERIAL_STATUS':
        serialConnected = msg.connected;
        btnRecalib.hidden = !msg.connected;
        if (msg.connected) {
          setSerialConnection(true, msg.port);
          document.getElementById('statPort').textContent = msg.port;
        } else {
          setSerialConnection(false, msg.message || 'Déconnecté');
        }
        break;
      default:
        break;
    }
  }

  btnRecalib.addEventListener('click', async () => {
    btnRecalib.disabled = true;
    showCalibOverlay();
    try {
      const res = await fetch('/api/sensors/recalibrate', { method: 'POST' });
      if (!res.ok) hideCalibOverlay();
    } catch {
      hideCalibOverlay();
    } finally {
      btnRecalib.disabled = false;
    }
  });

  btnResetAllOverrides?.addEventListener('click', () => resetAllOverrides());

  if (thresholdInput) {
    initThresholdControls();
  }

  initUI();
  initChart();

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  WSClient.connect(`${wsProto}://${location.host}`, {
    onMessage: handleHubMessage,
  });

  fetch('/api/sensors/status')
    .then((r) => r.json())
    .then((data) => {
      if (data.ratio != null) {
        const pct = Math.round(data.ratio * 100);
        lastSavedPercent = pct;
        updateThresholdControls(pct);
      }
      if (data.sensorOverrides) sensorOverrides = { ...data.sensorOverrides };
      if (data.effectiveRatios) effectiveRatios = data.effectiveRatios.slice();
      if (data.values) {
        handleSensorUpdate({
          values: data.values,
          states: data.states,
          counts: data.totalDetections,
          total: data.total,
          history: data.history,
          thresholds: data.thresholds,
          baselines: data.baselines,
          calibrating: data.calibrating,
          port: data.port,
          ratio: data.ratio,
          sensorOverrides: data.sensorOverrides,
          effectiveRatios: data.effectiveRatios,
        });
      } else {
        syncSensorOverridesFromServer(data);
        updateResetAllButtonVisibility();
      }
      serialConnected = data.connected;
      btnRecalib.hidden = !data.connected;
      if (data.connected) {
        setSerialConnection(true, data.port);
        document.getElementById('statPort').textContent = data.port;
      } else {
        setSerialConnection(false, 'Non connecté');
      }
      if (data.calibrating) showCalibOverlay();
    })
    .catch(() => {});
})();
