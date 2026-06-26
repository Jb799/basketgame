/**
 * ui.js — Effets visuels : victoire de manche, victoire de série
 */

window.UI = (function () {

  const SERIES_WIN_TARGET = 5;
  const SERIES_WIN_DELAY_MS = 5000;

  const PLAYER_LABELS = { 1: 'Joueur Orange', 2: 'Joueur Bleu' };

  let seriesWinTimer = null;

  function init() {}

  function showVictory(player) {
    const confettiCanvas = document.getElementById('confetti-canvas');
    const flash = document.getElementById('screen-flash');

    if (flash) {
      flash.removeAttribute('hidden');
      flash.className = `screen-flash active p${player}`;

      const onFlashEnd = () => {
        flash.setAttribute('hidden', '');
        flash.classList.remove('active', 'p1', 'p2');
      };
      flash.addEventListener('animationend', onFlashEnd, { once: true });
      setTimeout(() => {
        if (!flash.hasAttribute('hidden')) onFlashEnd();
      }, 950);
    }

    if (confettiCanvas) {
      Confetti.create(confettiCanvas);
      confettiCanvas.width = window.innerWidth;
      confettiCanvas.height = window.innerHeight;
      Confetti.burst(250);
    }

    showWinnerPortrait(player);

    // Pluie de têtes du gagnant de la manche.
    if (window.PlayerFaces) {
      PlayerFaces.rainHeads([Number(player)], { count: 10, variant: 'win' });
    }
  }

  /** Portrait du gagnant (photo ou initiales) au centre brièvement. */
  function showWinnerPortrait(player) {
    if (!window.PlayerFaces) return;
    const face = PlayerFaces.createFace({ slot: Number(player), variant: 'win', size: 'xxl' });
    face.classList.add('victory-portrait');
    document.body.appendChild(face);
    setTimeout(() => face.remove(), 2600);
  }

  function hideVictory() {
    const flash = document.getElementById('screen-flash');
    Confetti.stop();
    if (flash) {
      flash.setAttribute('hidden', '');
      flash.className = 'screen-flash';
    }
  }

  /**
   * Affiche l'écran de victoire de série après un délai (plateau visible entre-temps).
   * @param {number} winner - 1 ou 2
   * @param {{ delay?: number }} options - delay en ms (0 = immédiat, ex. reconnexion)
   */
  function showSeriesWin(winner, options = {}) {
    const winnerNum = Number(winner);
    if (!winnerNum) return;

    const delay = options.delay ?? SERIES_WIN_DELAY_MS;

    hideSeriesWin();

    seriesWinTimer = setTimeout(() => {
      seriesWinTimer = null;
      revealSeriesWin(winnerNum);
    }, delay);
  }

  function revealSeriesWin(winnerNum) {
    const overlay = document.getElementById('series-win-overlay');
    const title = document.getElementById('series-win-title');
    const subtitle = document.getElementById('series-win-subtitle');

    if (!overlay) return;

    overlay.className = `series-win-overlay p${winnerNum}`;

    const winnerNum = Number(winner);
    if (title) {
      title.textContent = window.PlayerFaces
        ? PlayerFaces.getPseudo(winnerNum)
        : (PLAYER_LABELS[winnerNum] || `Joueur ${winnerNum}`);
    }
    if (subtitle) subtitle.textContent = `${SERIES_WIN_TARGET} victoires`;

    const token = document.getElementById('series-win-token');
    if (token && window.PlayerFaces) {
      token.innerHTML = '';
      token.classList.remove('series-win-token--photo');
      token.style.backgroundImage = '';
      const url = PlayerFaces.getUrl(winnerNum, 'win');
      if (url) {
        token.style.backgroundImage = `url("${url}")`;
        token.style.backgroundSize = 'cover';
        token.style.backgroundPosition = 'center';
        token.classList.add('series-win-token--photo');
      } else {
        const face = PlayerFaces.createFace({ slot: winnerNum, variant: 'win', size: 'lg' });
        face.classList.add('series-win-token__face');
        token.appendChild(face);
      }
    }

    overlay.removeAttribute('hidden');

    try { Sounds.victory(); } catch (e) {}

    const confettiCanvas = document.getElementById('confetti-canvas');
    if (confettiCanvas) {
      Confetti.create(confettiCanvas);
      confettiCanvas.width = window.innerWidth;
      confettiCanvas.height = window.innerHeight;
      Confetti.burst(400);
    }

    // Pluie de têtes du grand vainqueur de la série.
    if (hasFace) {
      PlayerFaces.rainHeads([winnerNum], { count: 22, variant: 'win' });
    }
  }

  function hideSeriesWin() {
    if (seriesWinTimer) {
      clearTimeout(seriesWinTimer);
      seriesWinTimer = null;
    }
    const overlay = document.getElementById('series-win-overlay');
    if (overlay) {
      overlay.setAttribute('hidden', '');
      overlay.className = 'series-win-overlay';
    }
  }

  function setConnectionStatus(status) {
    console.log('[UI] Connexion:', status);
  }

  function showToast(message, type = 'info') {
    console.log(`[UI] ${type}: ${message}`);
  }

  return {
    init,
    showVictory,
    hideVictory,
    showSeriesWin,
    hideSeriesWin,
    setConnectionStatus,
    showToast,
  };
})();
