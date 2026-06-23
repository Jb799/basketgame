/**
 * ui.js — HUD, overlays vague et game over.
 */

window.UI = (function () {
  const els = {};

  function init() {
    els.score = document.getElementById('hud-score');
    els.top = document.getElementById('hud-top');
    els.wave = document.getElementById('hud-wave');
    els.lives = document.getElementById('hud-lives');
    els.status = document.getElementById('hud-status');
    els.waveOverlay = document.getElementById('wave-overlay');
    els.waveBanner = document.getElementById('wave-overlay-banner');
    els.waveSub = document.getElementById('wave-overlay-sub');
    els.gameOverOverlay = document.getElementById('gameover-overlay');
    els.goScore = document.getElementById('go-score');
    els.goTop = document.getElementById('go-top');
    els.goWave = document.getElementById('go-wave');
    els.goRecord = document.getElementById('go-record');
  }

  function setStatus(text, connected) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.classList.toggle('is-connected', connected === true);
    els.status.classList.toggle('is-disconnected', connected === false);
  }

  function updateHud(state) {
    if (!state) return;
    if (els.score) els.score.textContent = String(state.score ?? 0);
    if (els.top) els.top.textContent = String(state.highScore ?? 0);
    if (els.wave) els.wave.textContent = String(state.wave ?? 1);
    renderLives(state.lives ?? 0, state.startLives ?? 3);
  }

  function renderLives(current, max) {
    if (!els.lives) return;
    els.lives.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const heart = document.createElement('span');
      heart.className = 'siege-hud__heart' + (i >= current ? ' is-lost' : '');
      heart.textContent = '♥';
      heart.setAttribute('aria-hidden', 'true');
      els.lives.appendChild(heart);
    }
  }

  function animateLifeLost(livesLeft, maxLives) {
    if (!els.lives) return;
    const hearts = els.lives.querySelectorAll('.siege-hud__heart');
    const lostIndex = livesLeft;
    if (hearts[lostIndex]) {
      hearts[lostIndex].classList.add('is-losing');
      setTimeout(() => renderLives(livesLeft, maxLives), 650);
    } else {
      renderLives(livesLeft, maxLives);
    }
  }

  function showWaveOverlay(wave, config) {
    if (!els.waveOverlay) return Promise.resolve();

    if (els.waveBanner) els.waveBanner.textContent = `VAGUE ${wave}`;
    if (els.waveSub && config) {
      els.waveSub.textContent = `${config.totalZombies} zombies — accélération !`;
    }

    els.waveOverlay.hidden = false;
    els.waveOverlay.classList.add('is-visible');
    if (window.Sounds) Sounds.levelComplete();

    return new Promise((resolve) => {
      setTimeout(() => {
        els.waveOverlay.hidden = true;
        els.waveOverlay.classList.remove('is-visible');
        resolve();
      }, 2200);
    });
  }

  function showGameOver(payload) {
    if (!payload) return;
    if (els.goScore) els.goScore.textContent = String(payload.score ?? 0);
    if (els.goTop) els.goTop.textContent = String(payload.highScore ?? 0);
    if (els.goWave) els.goWave.textContent = String(payload.wave ?? 1);

    if (els.goRecord) {
      els.goRecord.hidden = !payload.isNewRecord;
    }

    if (els.gameOverOverlay) els.gameOverOverlay.hidden = false;

    if (window.Sounds) Sounds.gameOver();

    if (payload.isNewRecord) {
      if (window.Sounds?.victory) Sounds.victory(1);
      const canvas = document.getElementById('confetti-canvas');
      if (canvas && window.Confetti) {
        Confetti.create(canvas);
        Confetti.burst(300);
      }
    }
  }

  function hideGameOver() {
    if (els.gameOverOverlay) els.gameOverOverlay.hidden = true;
    if (els.goRecord) els.goRecord.hidden = true;
    if (window.Confetti) Confetti.stop();
  }

  return {
    init,
    setStatus,
    updateHud,
    renderLives,
    animateLifeLost,
    showWaveOverlay,
    showGameOver,
    hideGameOver,
  };
})();
