/**
 * board.js — Rendu du plateau Plinko (clous, cases, zone de chute).
 */

window.Board = (function () {
  const boardEl = document.getElementById('plinko-board');
  const dropZoneEl = document.getElementById('drop-zone');
  const pegsLayerEl = document.getElementById('pegs-layer');
  const slotsLayerEl = document.getElementById('slots-layer');

  const BAND_ANIM_MS = 900;

  let boardRect = null;
  const pegById = new Map();
  const hitPegIds = new Set();
  let currentBoard = null;
  let transitioning = false;

  function pegIdKey(id) {
    return Number(id);
  }

  function elementCenterInBoard(el) {
    const board = getBoardRect();
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - board.left,
      y: r.top + r.height / 2 - board.top,
    };
  }

  function getHitRadiusPx() {
    const first = pegById.values().next().value;
    if (!first) return 22;
    const r = first.getBoundingClientRect();
    return Math.max(r.width, r.height) * 1.15;
  }

  function flashPeg(el) {
    el.classList.remove('is-hit');
    void el.offsetWidth;
    el.classList.add('is-hit');
  }

  function init() {
    window.addEventListener('resize', updateRects);
  }

  function getZonePercents() {
    const style = getComputedStyle(document.documentElement);
    return {
      drop: parseFloat(style.getPropertyValue('--zone-drop')) / 100 || 0.06,
      slots: parseFloat(style.getPropertyValue('--zone-slots')) / 100 || 0.14,
    };
  }

  function updateRects() {
    boardRect = boardEl.getBoundingClientRect();
  }

  function getBoardRect() {
    if (!boardRect) updateRects();
    return boardRect;
  }

  function normalizedToPixel(x, y) {
    const rect = getBoardRect();
    return { x: x * rect.width, y: y * rect.height };
  }

  function renderDropZone() {
    dropZoneEl.innerHTML = '';
    for (let c = 0; c < 7; c++) {
      const col = document.createElement('div');
      col.className = 'drop-col';
      col.dataset.col = String(c);
      const led = document.createElement('span');
      led.className = 'drop-col__led';
      led.setAttribute('aria-hidden', 'true');
      col.appendChild(led);
      dropZoneEl.appendChild(col);
    }
  }

  function setColumnLed(col, mode) {
    dropZoneEl.querySelectorAll('.drop-col').forEach((el) => {
      const match = Number(el.dataset.col) === col;
      el.classList.remove('is-active', 'is-led-on', 'is-led-blink', 'is-led-confirm');
      if (!match) return;
      if (mode === 'off') return;
      el.classList.add('is-active');
      if (mode === 'blink') el.classList.add('is-led-blink');
      else if (mode === 'on') el.classList.add('is-led-on');
      else if (mode === 'confirm') el.classList.add('is-led-confirm');
    });
  }

  function highlightColumn(col) {
    setColumnLed(col, 'blink');
  }

  function clearColumnHighlight() {
    clearColumnLed();
  }

  function clearColumnLed() {
    dropZoneEl.querySelectorAll('.drop-col').forEach((el) => {
      el.classList.remove('is-active', 'is-led-on', 'is-led-blink', 'is-led-confirm');
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function confirmColumnLed(col) {
    setColumnLed(col, 'confirm');
    await sleep(650);
    clearColumnLed();
  }

  function buildSlotElement(slot) {
    const el = document.createElement('div');
    el.className = `slot slot--${slot.type}`;
    if (slot.type === 'bomb' && slot.size) el.classList.add(`slot--${slot.size}`);
    el.style.width = `${slot.width}%`;
    el.dataset.index = String(slot.index);

    const icons = document.createElement('div');
    icons.className = 'slot__icons';
    if (slot.type === 'coin') icons.textContent = '🪙'.repeat(slot.iconCount || 1);
    else if (slot.type === 'bomb') icons.textContent = '💣';
    else if (slot.type === 'knife') icons.textContent = '🔪';
    else if (slot.type === 'thief') icons.textContent = '🦹';
    else if (slot.type === 'golden') icons.textContent = '🏆';
    else icons.textContent = '—';

    const value = document.createElement('div');
    value.className = 'slot__value';
    if (slot.type === 'coin') value.textContent = `+${slot.value}`;
    else if (slot.type === 'bomb') value.textContent = String(slot.value);
    else if (slot.type === 'knife') value.textContent = 'COUTEAU';
    else if (slot.type === 'thief') value.textContent = 'VOLEUR';
    else if (slot.type === 'golden') value.textContent = 'OR';
    else value.textContent = '0';

    el.appendChild(icons);
    el.appendChild(value);
    return el;
  }

  function buildPegElement(peg) {
    const el = document.createElement('div');
    el.className = 'peg';
    el.style.left = `${peg.x * 100}%`;
    el.style.top = `${peg.y * 100}%`;
    el.dataset.pegId = String(peg.id);
    return el;
  }

  function createSlotsBand(slots) {
    const band = document.createElement('div');
    band.className = 'board-band board-band--slots';
    for (const slot of slots) band.appendChild(buildSlotElement(slot));
    return band;
  }

  function createPegsBand(pegs) {
    const band = document.createElement('div');
    band.className = 'board-band board-band--pegs';
    pegById.clear();
    for (const peg of pegs) {
      const el = buildPegElement(peg);
      band.appendChild(el);
      pegById.set(pegIdKey(peg.id), el);
    }
    return band;
  }

  function waitAnimation(el) {
    return new Promise((resolve) => {
      const onEnd = () => {
        el.removeEventListener('animationend', onEnd);
        resolve();
      };
      el.addEventListener('animationend', onEnd);
      setTimeout(resolve, BAND_ANIM_MS + 80);
    });
  }

  function renderBoard(board) {
    if (!board) return;
    currentBoard = board;
    updateRects();
    renderDropZone();
    pegsLayerEl.innerHTML = '';
    slotsLayerEl.innerHTML = '';
    pegsLayerEl.appendChild(createPegsBand(board.pegs));
    slotsLayerEl.appendChild(createSlotsBand(board.slots));
  }

  async function transitionBoard(board) {
    if (!board) return;
    if (currentBoard?.seed != null && board.seed != null && currentBoard.seed === board.seed) {
      currentBoard = board;
      return;
    }
    if (transitioning) return;

    const oldSlotsBand = slotsLayerEl.querySelector('.board-band');
    if (!oldSlotsBand) {
      renderBoard(board);
      return;
    }

    transitioning = true;
    currentBoard = board;
    updateRects();
    renderDropZone();

    const oldPegsBand = pegsLayerEl.querySelector('.board-band');

    const newSlotsBand = createSlotsBand(board.slots);
    newSlotsBand.classList.add('is-enter-left');
    const newPegsBand = createPegsBand(board.pegs);
    newPegsBand.classList.add('is-enter-left');

    if (oldSlotsBand) oldSlotsBand.classList.add('is-exit-right');
    if (oldPegsBand) oldPegsBand.classList.add('is-exit-right');

    slotsLayerEl.appendChild(newSlotsBand);
    pegsLayerEl.appendChild(newPegsBand);

    const waits = [];
    if (oldSlotsBand) waits.push(waitAnimation(oldSlotsBand));
    if (oldPegsBand) waits.push(waitAnimation(oldPegsBand));
    waits.push(waitAnimation(newSlotsBand));
    waits.push(waitAnimation(newPegsBand));
    await Promise.all(waits);

    if (oldSlotsBand) oldSlotsBand.remove();
    if (oldPegsBand) oldPegsBand.remove();
    newSlotsBand.classList.remove('is-enter-left');
    newPegsBand.classList.remove('is-enter-left');

    transitioning = false;
  }

  function resetPegHits() {
    hitPegIds.clear();
  }

  function tryHitPegAt(ballX, ballY) {
    if (pegById.size === 0) return;

    updateRects();
    const threshold = getHitRadiusPx();
    let best = null;
    let bestDist = Infinity;

    for (const [id, el] of pegById) {
      if (hitPegIds.has(id)) continue;
      const center = elementCenterInBoard(el);
      const dist = Math.hypot(center.x - ballX, center.y - ballY);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        best = { id, el };
      }
    }

    if (best) {
      hitPegIds.add(best.id);
      flashPeg(best.el);
    }
  }

  function hitPeg(pegId) {
    const el = pegById.get(pegIdKey(pegId));
    if (!el) return;
    flashPeg(el);
    hitPegIds.add(pegIdKey(pegId));
  }

  function highlightSlot(index) {
    const slot = slotsLayerEl.querySelector(`[data-index="${index}"]`);
    if (slot) slot.classList.add('is-landed');
  }

  function pathToPixels(path) {
    updateRects();
    return path.map((point) => {
      if (point.pegId != null) {
        const el = pegById.get(pegIdKey(point.pegId));
        if (el) {
          const center = elementCenterInBoard(el);
          return {
            x: center.x,
            y: center.y,
            bounce: point.bounce,
            pegId: point.pegId,
            onFire: point.onFire,
          };
        }
      }

      const px = normalizedToPixel(point.x, point.y);
      return {
        x: px.x,
        y: px.y,
        bounce: point.bounce,
        pegId: point.pegId,
        onFire: point.onFire,
      };
    });
  }

  return {
    init,
    renderBoard,
    transitionBoard,
    highlightColumn,
    clearColumnHighlight,
    setColumnLed,
    clearColumnLed,
    confirmColumnLed,
    hitPeg,
    tryHitPegAt,
    resetPegHits,
    highlightSlot,
    pathToPixels,
    getBoardRect,
    boardEl,
    getZonePercents,
  };
})();
