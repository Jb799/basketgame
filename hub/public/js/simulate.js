/**
 * simulate.js — Simulateur de balle (7 colonnes) depuis le contrôleur.
 * Envoie POST /api/trigger comme l'ESP32.
 */

(function () {
  const PLATFORM_COLUMNS = 7;

  const tab = document.getElementById('simulate-tab');
  const panel = document.getElementById('simulate-panel');
  const backdrop = document.getElementById('simulate-backdrop');
  const closeBtn = document.getElementById('simulate-close');
  const grid = document.getElementById('simulate-grid');

  let triggerBusy = false;

  function openPanel() {
    panel.hidden = false;
    backdrop.hidden = false;
    tab.setAttribute('aria-expanded', 'true');
    document.body.classList.add('simulate-open');
  }

  function closePanel() {
    panel.hidden = true;
    backdrop.hidden = true;
    tab.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('simulate-open');
  }

  async function triggerColumn(col) {
    if (triggerBusy) return;
    triggerBusy = true;
    renderButtons();

    try {
      await fetch(`/api/trigger?col=${col}`, { method: 'POST' });
    } catch (e) {
      // silencieux — même comportement qu'un trigger ESP32
    } finally {
      triggerBusy = false;
      renderButtons();
    }
  }

  function renderButtons() {
    grid.innerHTML = '';

    for (let col = 0; col < PLATFORM_COLUMNS; col++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'simulate-col';
      btn.disabled = triggerBusy;
      btn.setAttribute('aria-label', `Colonne ${col + 1}`);
      btn.innerHTML = `
        <span class="simulate-col__ball" aria-hidden="true">🏀</span>
        <span class="simulate-col__num">${col + 1}</span>
      `;
      btn.addEventListener('click', () => triggerColumn(col));
      grid.appendChild(btn);
    }
  }

  tab.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  renderButtons();
})();
