/**
 * building.js — Immeuble 7 colonnes, fenêtres et défenseurs.
 */

window.Building = (function () {
  const COLS = 7;
  const ROWS = 10;
  const DEFENDER_EMOJIS = ['🧑', '👨', '👩', '🧔', '👱', '🧑‍🦱', '🧑‍🦰'];
  let buildingEl = null;
  let colEls = [];

  function init() {
    buildingEl = document.getElementById('siege-building');
    if (!buildingEl) return;
    buildingEl.innerHTML = '';
    colEls = [];

    for (let c = 0; c < COLS; c++) {
      const col = document.createElement('div');
      col.className = 'siege-col platform-column';
      col.dataset.col = String(c);

      const cells = document.createElement('div');
      cells.className = 'siege-col__cells';
      const cellEls = [];

      for (let r = 0; r < ROWS; r++) {
        const cell = document.createElement('div');
        cell.className = 'siege-cell';
        cell.dataset.col = String(c);
        cell.dataset.row = String(r);
        cellEls.push(cell);

        if (r === 0) {
          cell.classList.add('siege-cell--window');
          const win = document.createElement('div');
          win.className = 'siege-window' + (Math.random() > 0.4 ? ' is-lit' : '');
          win.id = `window-${c}`;

          const defender = document.createElement('div');
          defender.className = 'siege-defender is-visible';
          defender.id = `defender-${c}`;
          const emoji = DEFENDER_EMOJIS[c % DEFENDER_EMOJIS.length];
          defender.innerHTML = `<span class="siege-defender__emoji" aria-hidden="true">${emoji}</span>`;

          win.appendChild(defender);
          cell.appendChild(win);
        }

        cells.appendChild(cell);
      }

      const breachFx = document.createElement('div');
      breachFx.className = 'siege-col__breach-fx';
      breachFx.id = `breach-fx-${c}`;
      breachFx.setAttribute('aria-hidden', 'true');

      const zombieLayer = document.createElement('div');
      zombieLayer.className = 'siege-col__zombies';
      zombieLayer.id = `zombies-col-${c}`;

      col.appendChild(cells);
      col.appendChild(breachFx);
      col.appendChild(zombieLayer);
      buildingEl.appendChild(col);
      colEls.push({
        col,
        el: col,
        zombieLayer,
        cells: cellEls,
        defender: col.querySelector('.siege-defender'),
      });
    }
  }

  function getColEl(col) {
    return colEls[col] || null;
  }

  function getCell(col, row) {
    const c = getColEl(col);
    if (!c) return null;
    return c.cells[row] || null;
  }

  function getZombieLayer(col) {
    const c = getColEl(col);
    return c ? c.zombieLayer : null;
  }

  function getDefender(col) {
    const c = getColEl(col);
    return c ? c.defender : null;
  }

  function breakWindow(col) {
    const win = document.getElementById(`window-${col}`);
    if (win) {
      win.classList.remove('is-lit');
      win.classList.add('is-broken');
    }
  }

  function playColHit(col) {
    const data = getColEl(col);
    if (!data?.el) return;

    data.el.classList.remove('siege-col--breach');
    void data.el.offsetWidth;
    data.el.classList.add('siege-col--breach');

    const fx = document.getElementById(`breach-fx-${col}`);
    if (fx) {
      fx.innerHTML = '<span class="col-breach-hit__emoji">💥</span><span class="col-breach-hit__zombie">🧟</span>';
      fx.classList.add('is-active');
      setTimeout(() => {
        fx.classList.remove('is-active');
        fx.innerHTML = '';
      }, 1100);
    }

    setTimeout(() => data.el.classList.remove('siege-col--breach'), 1000);
  }

  function getRowTopPercent(row, rows) {
    const total = rows || ROWS;
    return ((row + 0.5) / total) * 100;
  }

  return {
    init,
    getColEl,
    getCell,
    getZombieLayer,
    getDefender,
    breakWindow,
    playColHit,
    getRowTopPercent,
    COLS,
    ROWS,
  };
})();
