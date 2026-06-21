/**
 * effects.js — Flash écran et particules locales.
 */

window.SiegeFx = (function () {
  let flashEl = null;
  let fxLayer = null;

  function init() {
    flashEl = document.getElementById('screen-flash');
    fxLayer = document.getElementById('fx-layer');
  }

  function flash(className, duration) {
    if (!flashEl) return;
    flashEl.hidden = false;
    flashEl.className = 'screen-flash ' + className;
    setTimeout(() => {
      flashEl.className = 'screen-flash';
      flashEl.hidden = true;
    }, duration || 180);
  }

  function flashHit() {
    flash('is-hit', 150);
  }

  function flashBreach(col) {
    flash('is-danger', 220);
    spawnSparksAtCol(col, 10);
  }

  function spawnSparksAtCol(col, count) {
    if (!fxLayer || !window.Building) return;
    const colData = Building.getColEl(col);
    if (!colData?.el) return;

    const rect = colData.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.06;

    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      s.className = 'fx-spark';
      s.textContent = i % 3 === 0 ? '✨' : '🔥';
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      s.style.fontSize = `${10 + Math.random() * 10}px`;
      fxLayer.appendChild(s);

      requestAnimationFrame(() => {
        const dx = (Math.random() - 0.5) * rect.width * 0.9;
        const dy = Math.random() * rect.height * 0.35 + 20;
        s.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
        s.style.opacity = '0';
      });
      setTimeout(() => s.remove(), 700);
    }
  }

  return {
    init,
    flashHit,
    flashBreach,
  };
})();
