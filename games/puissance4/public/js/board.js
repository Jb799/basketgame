/**
 * board.js — Rendu et animation de la grille Puissance 4
 */

window.Board = (function () {
  const ROWS = 6;
  const COLS = 7;

  let boardEl;
  let cells = [];

  function init() {
    boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    cells = [];

    for (let r = 0; r < ROWS; r++) {
      cells[r] = [];
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Colonne ${c + 1}, Rangée ${ROWS - r}`);

        const token = document.createElement('div');
        token.className = 'cell__token';
        cell.appendChild(token);

        boardEl.appendChild(cell);
        cells[r][c] = cell;
      }
    }
  }

  function clearColumnHit(col) {
    for (let r = 0; r < ROWS; r++) {
      const cell = cells[r][col];
      cell.classList.remove(
        'col-hit', 'col-hit-p1', 'col-hit-p2', 'col-hit-head', 'col-hit-trail', 'col-hit-land'
      );
      cell.style.removeProperty('--trail-strength');
    }
  }

  function reset() {
    boardEl.className = 'board';

    document.querySelectorAll('.falling-token').forEach(el => el.remove());

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = cells[r][c];
        cell.className = 'cell';
        cell.style.removeProperty('--trail-strength');
        cell.style.removeProperty('--drop-from');
        cell.style.removeProperty('--drop-duration');
        const token = cell.querySelector('.cell__token');
        token.style.transform = '';
        token.style.opacity = '0';
        token.style.animation = '';
      }
    }
  }

  function renderFromState(board) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = board[r][c];
        const cell = cells[r][c];
        if (val) {
          cell.classList.add('placed', `p${val}`);
          const token = cell.querySelector('.cell__token');
          token.style.opacity = '1';
          token.style.transform = 'translateY(0) scale(1)';
        }
      }
    }
  }

  function getTokenSize(cellEl) {
    const r = cellEl.getBoundingClientRect();
    return Math.min(r.width, r.height);
  }

  function getTokenTop(cellEl, tokenSize) {
    const r = cellEl.getBoundingClientRect();
    return r.top + (r.height - tokenSize) / 2;
  }

  /**
   * Trainée lumineuse : éclaire les rangées déjà traversées, tête sur la rangée courante.
   * La lumière ne dépasse jamais le centre de la balle.
   */
  function updateColumnTrail(col, player, ballCenterY) {
    let headRow = -1;

    for (let r = 0; r < ROWS; r++) {
      const cellRect = cells[r][col].getBoundingClientRect();
      const cellMid = cellRect.top + cellRect.height / 2;
      if (ballCenterY >= cellMid) {
        headRow = r;
      }
    }

    for (let r = 0; r < ROWS; r++) {
      const cell = cells[r][col];
      cell.classList.remove(
        'col-hit', 'col-hit-p1', 'col-hit-p2', 'col-hit-head', 'col-hit-trail', 'col-hit-land'
      );
      cell.style.removeProperty('--trail-strength');
    }

    if (headRow < 0) return;

    for (let r = 0; r <= headRow; r++) {
      const cell = cells[r][col];
      cell.classList.add('col-hit', `col-hit-p${player}`);

      if (r === headRow) {
        cell.classList.add('col-hit-head');
      } else {
        cell.classList.add('col-hit-trail');
        const dist = headRow - r;
        const strength = Math.max(0.12, 1 - dist * 0.26);
        cell.style.setProperty('--trail-strength', strength.toFixed(2));
      }
    }
  }

  function flashLandingCell(col, row, player) {
    clearColumnHit(col);
    const cell = cells[row][col];
    cell.classList.add('col-hit', `col-hit-p${player}`, 'col-hit-land');
    setTimeout(() => clearColumnHit(col), 320);
  }

  /**
   * Balayage manuel (API conservée) — délègue à la trainée synchronisée si besoin.
   */
  function highlightColumn(col, player) {
    const boardRect = boardEl.getBoundingClientRect();
    updateColumnTrail(col, player, boardRect.top);
  }

  /**
   * Anime la chute d'un jeton le long de la colonne (CSS + trainée lumineuse sync).
   */
  function animateDrop(row, col, player) {
    clearColumnHit(col);

    return new Promise((resolve) => {
      const cell = cells[row][col];
      const boardRect = boardEl.getBoundingClientRect();
      const colRect = cells[0][col].getBoundingClientRect();
      const tokenSize = getTokenSize(cell);

      const xCol = colRect.left + colRect.width / 2 - tokenSize / 2;
      const y0 = boardRect.top - tokenSize * 0.4;
      const y2 = getTokenTop(cell, tokenSize);
      const dropPx = Math.max(tokenSize, y2 - y0);

      const durationMs = Math.round(
        Math.min(680, Math.max(380, dropPx * 0.52))
      );

      const fallingToken = document.createElement('div');
      fallingToken.className = `falling-token p${player}`;
      fallingToken.style.cssText = [
        'position:fixed',
        `left:${xCol}px`,
        `top:${y0}px`,
        `width:${tokenSize}px`,
        `height:${tokenSize}px`,
        'z-index:100',
        'pointer-events:none',
      ].join(';');
      fallingToken.style.setProperty('--drop-to', `${Math.round(dropPx)}px`);
      fallingToken.style.setProperty('--drop-duration', `${durationMs}ms`);
      document.body.appendChild(fallingToken);

      let finished = false;
      let rafId = null;

      function syncTrail() {
        if (!fallingToken.parentNode) return;
        const rect = fallingToken.getBoundingClientRect();
        const ballCenterY = rect.top + rect.height / 2;
        updateColumnTrail(col, player, ballCenterY);
        rafId = requestAnimationFrame(syncTrail);
      }

      rafId = requestAnimationFrame(syncTrail);

      const onDone = () => {
        if (finished) return;
        finished = true;

        if (rafId) cancelAnimationFrame(rafId);

        fallingToken.remove();
        flashLandingCell(col, row, player);

        cell.classList.add('placed', `p${player}`);
        const token = cell.querySelector('.cell__token');
        if (token) {
          token.style.opacity = '1';
          token.style.transform = 'translateY(0) scale(1)';
        }

        Sounds.tokenLand();
        resolve();
      };

      fallingToken.addEventListener('animationend', onDone, { once: true });

      setTimeout(() => {
        if (fallingToken.parentNode) onDone();
      }, durationMs + 500);
    });
  }

  function highlightWinners(winningCells) {
    boardEl.classList.add('game-over', 'victory-flash');
    winningCells.forEach(([r, c]) => {
      cells[r][c].classList.add('winning');
    });
    setTimeout(() => boardEl.classList.remove('victory-flash'), 1000);
  }

  function shakeColumn(col) {
    for (let i = 0; i < COLS; i++) {
      boardEl.classList.remove(`shake-col-${i}`);
    }
    void boardEl.offsetWidth;
    boardEl.classList.add(`shake-col-${col}`);
    setTimeout(() => boardEl.classList.remove(`shake-col-${col}`), 500);
  }

  function setGameOver() {
    boardEl.classList.add('game-over');
  }

  function placeDirect(row, col, player) {
    if (!cells[row] || !cells[row][col]) return;
    const cell = cells[row][col];
    cell.classList.add('placed', `p${player}`);
    const token = cell.querySelector('.cell__token');
    if (token) {
      token.style.opacity = '1';
      token.style.transform = 'translateY(0) scale(1)';
      token.style.animation = 'none';
    }
  }

  return {
    init,
    reset,
    renderFromState,
    animateDrop,
    placeDirect,
    highlightColumn,
    highlightWinners,
    shakeColumn,
    setGameOver,
  };
})();
