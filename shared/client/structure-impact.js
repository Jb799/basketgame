/**
 * structure-impact.js — Affichage cosmétique des impacts structure physique.
 * Shake écran, flash orange, surbrillance des colonnes capteurs, son léger.
 * Aucun effet sur la logique de jeu.
 */

window.StructureImpact = (function () {
  const PLATFORM_COLUMNS = 7;
  const DEBOUNCE_MS = 350;

  let root = null;
  let lanesRoot = null;
  let showBanner = false;
  let flashEl = null;
  let stripEl = null;
  let bannerEl = null;
  let stripCols = [];
  let lastPlayAt = 0;
  let hitClearTimer = null;

  function init(opts) {
    root = opts?.root || document.body;
    lanesRoot = opts?.lanesRoot || null;
    showBanner = Boolean(opts?.showBanner);
    ensureDom();
  }

  function ensureDom() {
    if (!root) return;
    root.classList.add('structure-impact-host');

    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.className = 'structure-impact__flash';
      flashEl.setAttribute('aria-hidden', 'true');
      root.appendChild(flashEl);
    }

    if (showBanner && !bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.className = 'structure-impact__banner';
      bannerEl.textContent = 'Impact structure';
      bannerEl.setAttribute('role', 'status');
      bannerEl.setAttribute('aria-live', 'polite');
      root.appendChild(bannerEl);
    }

    if (!lanesRoot && !stripEl) {
      stripEl = document.createElement('div');
      stripEl.className = 'structure-impact__strip platform-grid';
      stripEl.setAttribute('aria-hidden', 'true');
      stripCols = [];
      for (let i = 0; i < PLATFORM_COLUMNS; i++) {
        const col = document.createElement('div');
        col.className = 'structure-impact__col platform-column';
        col.dataset.col = String(i);
        stripEl.appendChild(col);
        stripCols.push(col);
      }
      root.appendChild(stripEl);
    }
  }

  function intensityFromPayload(payload) {
    const count = Number(payload?.sensorCount) || (payload?.sensors?.length ?? 0);
    const magnitude = Number(payload?.magnitude) || 0;
    const countFactor = Math.min(1, Math.max(0, (count - 3) / 4));
    const magFactor = Math.min(1, magnitude / 80);
    return 0.35 + Math.max(countFactor, magFactor) * 0.65;
  }

  function playFlash(intensity) {
    if (!flashEl) return;
    flashEl.style.setProperty('--si-flash-peak', String(0.25 + intensity * 0.35));
    flashEl.style.setProperty('--si-flash-dur', `${0.32 + intensity * 0.18}s`);
    flashEl.classList.remove('structure-impact__flash--play');
    void flashEl.offsetWidth;
    flashEl.classList.add('structure-impact__flash--play');
  }

  function playShake(intensity) {
    if (!root) return;
    const px = Math.round(4 + intensity * 6);
    root.style.setProperty('--si-shake-x', `${px}px`);
    root.style.setProperty('--si-shake-dur', `${0.35 + intensity * 0.2}s`);
    root.classList.remove('structure-impact--shake');
    void root.offsetWidth;
    root.classList.add('structure-impact--shake');
    root.addEventListener(
      'animationend',
      () => root.classList.remove('structure-impact--shake'),
      { once: true }
    );
  }

  function clearHits() {
    if (stripCols.length) {
      for (const col of stripCols) col.classList.remove('structure-impact__col--hit');
    }
    if (lanesRoot) {
      for (const lane of lanesRoot.querySelectorAll('.structure-impact-lane--hit')) {
        lane.classList.remove('structure-impact-lane--hit');
      }
    }
  }

  function highlightColumns(sensors) {
    const indices = Array.isArray(sensors) ? sensors : [];
    clearHits();
    if (hitClearTimer) clearTimeout(hitClearTimer);

    for (const idx of indices) {
      const col = Number(idx);
      if (!Number.isInteger(col) || col < 0 || col >= PLATFORM_COLUMNS) continue;

      if (lanesRoot) {
        const lane = lanesRoot.querySelector(`[data-col="${col}"]`);
        if (lane) lane.classList.add('structure-impact-lane--hit');
      } else if (stripCols[col]) {
        stripCols[col].classList.add('structure-impact__col--hit');
      }
    }

    hitClearTimer = setTimeout(clearHits, 900);
  }

  function playBanner() {
    if (!bannerEl) return;
    bannerEl.classList.remove('structure-impact__banner--play');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('structure-impact__banner--play');
  }

  function playSound(intensity) {
    if (window.Sounds?.structureImpact) {
      window.Sounds.structureImpact(intensity);
    }
  }

  function play(payload) {
    if (!root) return;
    const now = Date.now();
    if (now - lastPlayAt < DEBOUNCE_MS) return;
    lastPlayAt = now;

    const intensity = intensityFromPayload(payload);
    playShake(intensity);
    playFlash(intensity);
    highlightColumns(payload?.sensors);
    playSound(intensity);
    if (showBanner) playBanner();
  }

  return { init, play };
})();
