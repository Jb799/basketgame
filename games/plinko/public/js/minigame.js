/**
 * minigame.js — Overlay mini-jeux Couteau / Voleur / Panier d'Or.
 */

window.Minigame = (function () {
  const overlay = document.getElementById('minigame-overlay');
  const boardEl = document.getElementById('plinko-board');
  const iconEl = document.getElementById('minigame-icon');
  const titleEl = document.getElementById('minigame-title');
  const subtitleEl = document.getElementById('minigame-subtitle');
  const dropRowEl = document.getElementById('minigame-drop-row');
  const columnsEl = document.getElementById('minigame-columns');
  const slotWrapEl = document.getElementById('minigame-slot-wrap');
  const slotEl = document.getElementById('minigame-slot');
  const slotLabelEl = document.getElementById('minigame-slot-label');

  const BALL_DROP_MS = 650;
  const SLOT_ROLL_MS = 1400;
  const SLOT_PERCENTS = [5, 10, 15, 20, 25];
  const COLUMN_COUNT = 7;
  const GOLDEN_BASKET_PERIOD_MS = 9000;

  let currentKind = null;
  let currentColumns = [];
  let goldenMovementRaf = null;
  let goldenState = null;
  let goldenBasketEl = null;
  let goldenRailEl = null;
  let goldenActiveCol = null;

  /** Position continue 0 … colCount-1 (ping-pong) — affichage fluide pleine largeur */
  function getGoldenPosAt(elapsedMs, periodMs = GOLDEN_BASKET_PERIOD_MS, colCount = COLUMN_COUNT) {
    const maxCol = colCount - 1;
    if (maxCol <= 0) return 0;
    const cycle = ((elapsedMs % periodMs) + periodMs) % periodMs;
    const half = periodMs / 2;
    const t = cycle / half;
    return t <= 1 ? t * maxCol : (2 - t) * maxCol;
  }

  /** Colonne discrète — alignée serveur pour le tir */
  function getGoldenColAt(elapsedMs, periodMs = GOLDEN_BASKET_PERIOD_MS, colCount = COLUMN_COUNT) {
    return Math.round(getGoldenPosAt(elapsedMs, periodMs, colCount));
  }

  function playerLabelText(n) {
    return window.PlayerFaces ? PlayerFaces.getPseudo(n) : `Joueur ${n}`;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clearGoldenRail() {
    const board = columnsEl?.closest('.minigame-board');
    board?.querySelector('.golden-basket-rail')?.remove();
    board?.classList.remove('minigame-board--golden');
    columnsEl?.classList.remove('minigame-columns--golden');
    goldenRailEl = null;
    goldenBasketEl = null;
    goldenActiveCol = null;
  }

  function clearBoardDom() {
    if (dropRowEl) dropRowEl.innerHTML = '';
    if (columnsEl) columnsEl.innerHTML = '';
    clearGoldenRail();
  }

  function updateGoldenBasketVisual(posFloat) {
    if (!goldenBasketEl || !goldenRailEl || !columnsEl) return;

    const colCount = goldenState?.columnCount || COLUMN_COUNT;
    const railWidth = goldenRailEl.clientWidth;
    if (railWidth <= 0) return;

    const clamped = Math.max(0, Math.min(colCount - 1, posFloat));
    const centerX = ((clamped + 0.5) / colCount) * railWidth;
    goldenBasketEl.style.left = `${centerX}px`;

    const col = Math.round(clamped);
    if (col !== goldenActiveCol) {
      goldenActiveCol = col;
      columnsEl.querySelectorAll('.minigame-col--golden-empty').forEach((el) => {
        el.classList.toggle('is-golden-active', Number(el.dataset.col) === col);
      });
    }
  }

  function renderGoldenColumns() {
    if (!columnsEl) return;
    clearGoldenRail();

    const board = columnsEl.closest('.minigame-board');
    if (board) board.classList.add('minigame-board--golden');

    columnsEl.classList.add('minigame-columns--golden');

    for (let c = 0; c < COLUMN_COUNT; c++) {
      const col = document.createElement('div');
      col.className = 'minigame-col minigame-col--golden-empty';
      col.dataset.col = String(c);

      const label = document.createElement('span');
      label.className = 'minigame-col__col-label';
      label.textContent = `Col ${c + 1}`;

      const slot = document.createElement('div');
      slot.className = 'minigame-col__slot';
      slot.appendChild(label);
      col.appendChild(slot);
      columnsEl.appendChild(col);
    }

    if (!board) return;

    const rail = document.createElement('div');
    rail.className = 'golden-basket-rail';
    rail.id = 'golden-basket-rail';
    goldenRailEl = rail;

    goldenBasketEl = document.createElement('div');
    goldenBasketEl.className = 'golden-basket';
    goldenBasketEl.id = 'golden-basket';
    goldenBasketEl.innerHTML = '<span class="golden-basket__icon">🏆</span><span class="golden-basket__value"></span>';
    rail.appendChild(goldenBasketEl);
    board.appendChild(rail);

    updateGoldenBasketVisual(0);
  }

  function normalizeColumns(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const normalized = raw.map((cell, i) => {
      const col = cell.col != null ? Number(cell.col) : i;
      const isPlayer = cell.type === 'player' && cell.player != null;
      return {
        col,
        type: isPlayer ? 'player' : 'hole',
        ...(isPlayer ? { player: Number(cell.player) } : {}),
      };
    });

    normalized.sort((a, b) => a.col - b.col);
    return normalized;
  }

  /**
   * Secours si les colonnes n'arrivent pas du serveur (tous les adversaires + trous).
   */
  function buildFallbackColumns(activePlayer, playerCount) {
    const active = Number(activePlayer);
    const count = Number(playerCount) || 2;
    const others = [];
    for (let p = 1; p <= count; p += 1) {
      if (p !== active) others.push(p);
    }

    const cells = others.map((player) => ({ type: 'player', player }));
    while (cells.length < COLUMN_COUNT) {
      cells.push({ type: 'hole' });
    }

    return cells.map((cell, col) => ({
      col,
      type: cell.type,
      ...(cell.type === 'player' ? { player: cell.player } : {}),
    }));
  }

  function resolveColumns(msg) {
    const fromMsg = normalizeColumns(msg.columns);
    if (fromMsg) return fromMsg;

    const appState = window.App?.getState?.();
    const activePlayer = msg.activePlayer ?? appState?.minigame?.activePlayer ?? appState?.currentPlayer;
    const playerCount = appState?.playerCount ?? appState?.players?.length;

    if (activePlayer != null && playerCount) {
      return buildFallbackColumns(activePlayer, playerCount);
    }

    return Array.from({ length: COLUMN_COUNT }, (_, col) => ({ col, type: 'hole' }));
  }

  function renderDropRow(withLeds = false) {
    if (!dropRowEl) return;
    dropRowEl.innerHTML = '';
    for (let c = 0; c < COLUMN_COUNT; c++) {
      const cell = document.createElement('div');
      cell.className = 'minigame-board__drop-cell';
      cell.dataset.col = String(c);
      cell.textContent = String(c + 1);
      if (withLeds) {
        cell.classList.add('minigame-board__drop-cell--led');
      }
      dropRowEl.appendChild(cell);
    }
  }

  function setDropRowLed(col, mode) {
    dropRowEl?.querySelectorAll('.minigame-board__drop-cell').forEach((el) => {
      const match = Number(el.dataset.col) === col;
      el.classList.remove('is-active', 'is-led-blink', 'is-led-confirm');
      if (!match || mode === 'off') return;
      if (mode === 'blink') {
        el.classList.add('is-active', 'is-led-blink');
      } else {
        el.classList.add('is-active');
      }
    });
  }

  function startGoldenMovement(msg) {
    stopGoldenMovement();
    goldenState = {
      movementStartedAt: msg.movementStartedAt || Date.now(),
      periodMs: msg.periodMs || GOLDEN_BASKET_PERIOD_MS,
      columnCount: msg.columnCount || COLUMN_COUNT,
      coinReward: msg.coinReward,
    };

    const valueEl = goldenBasketEl?.querySelector('.golden-basket__value');
    if (valueEl && goldenState.coinReward != null) {
      valueEl.textContent = `+${goldenState.coinReward}`;
    }

    function tick() {
      if (!goldenBasketEl || !goldenState) return;
      const elapsed = Date.now() - goldenState.movementStartedAt;
      const pos = getGoldenPosAt(elapsed, goldenState.periodMs, goldenState.columnCount);
      updateGoldenBasketVisual(pos);
      goldenMovementRaf = requestAnimationFrame(tick);
    }
    tick();
  }

  function updateGoldenMovement(msg) {
    if (!goldenBasketEl || msg.kind !== 'golden') return;
    if (msg.coinReward != null && goldenState) goldenState.coinReward = msg.coinReward;
    if (msg.movementStartedAt != null) {
      startGoldenMovement(msg);
    }
  }

  function stopGoldenMovement() {
    if (goldenMovementRaf) {
      cancelAnimationFrame(goldenMovementRaf);
      goldenMovementRaf = null;
    }
  }

  function buildColumn(cell) {
    const col = document.createElement('div');
    col.className = 'minigame-col';
    col.dataset.col = String(cell.col);

    const isPlayer = cell.type === 'player' && cell.player != null;

    if (isPlayer) {
      col.classList.add('minigame-col--player', `minigame-col--p${cell.player}`);
    } else {
      col.classList.add('minigame-col--hole');
    }

    const slot = document.createElement('div');
    slot.className = 'minigame-col__slot';

    const label = document.createElement('span');
    label.className = 'minigame-col__col-label';
    label.textContent = `Col ${cell.col + 1}`;
    slot.appendChild(label);

    if (!isPlayer) {
      const vide = document.createElement('span');
      vide.className = 'minigame-col__vide';
      vide.textContent = 'VIDE';
      const holeIcon = document.createElement('span');
      holeIcon.className = 'minigame-col__hole-icon';
      holeIcon.textContent = '🕳️';
      slot.appendChild(vide);
      slot.appendChild(holeIcon);
    } else {
      const num = document.createElement('span');
      num.className = 'minigame-col__player-num';
      num.textContent = String(cell.player);
      const playerLabel = document.createElement('span');
      playerLabel.className = 'minigame-col__player-label';
      playerLabel.textContent = playerLabelText(cell.player);
      slot.appendChild(num);
      slot.appendChild(playerLabel);
    }

    col.appendChild(slot);
    return col;
  }

  function renderColumns(columns) {
    if (!columnsEl) return;
    columnsEl.innerHTML = '';
    const sorted = [...columns].sort((a, b) => a.col - b.col);
    for (const cell of sorted) {
      columnsEl.appendChild(buildColumn(cell));
    }
  }

  function getColumnCenter(col) {
    const colEl = columnsEl?.querySelector(`[data-col="${col}"]`);
    if (!colEl) {
      return { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
    }
    const slot = colEl.querySelector('.minigame-col__slot') || colEl;
    const rect = slot.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function highlightColumn(col) {
    setDropRowLed(col, 'blink');
    columnsEl?.querySelectorAll('.minigame-col').forEach((el) => {
      el.classList.toggle('is-active', Number(el.dataset.col) === col);
    });
  }

  function clearHighlight() {
    dropRowEl?.querySelectorAll('.minigame-board__drop-cell').forEach((el) => {
      el.classList.remove('is-active', 'is-led-blink', 'is-led-confirm');
    });
    columnsEl?.querySelectorAll('.minigame-col').forEach((el) => {
      el.classList.remove('is-active', 'is-hit', 'is-targeted', 'is-missed');
    });
  }

  async function dropBallOnColumn(col) {
    const colEl = columnsEl?.querySelector(`[data-col="${col}"]`);
    if (!colEl) return;

    const slot = colEl.querySelector('.minigame-col__slot') || colEl;
    const ball = document.createElement('div');
    ball.className = 'minigame-ball';
    slot.appendChild(ball);
    void ball.offsetWidth;
    ball.classList.add('is-falling');

    await sleep(BALL_DROP_MS);
    colEl.classList.add('is-hit');
    ball.remove();
  }

  async function animateSlotRoll(finalAmount, rolledPercent) {
    slotWrapEl.classList.add('is-visible');
    slotEl.classList.add('is-rolling');

    const start = Date.now();
    while (Date.now() - start < SLOT_ROLL_MS) {
      const fake = SLOT_PERCENTS[Math.floor(Math.random() * SLOT_PERCENTS.length)];
      slotEl.textContent = `${fake}%`;
      await sleep(55 + Math.floor(((Date.now() - start) / SLOT_ROLL_MS) * 70));
    }

    slotEl.classList.remove('is-rolling');
    slotEl.textContent = String(finalAmount);
    if (slotLabelEl && rolledPercent) {
      slotLabelEl.textContent = `${rolledPercent}% → ${finalAmount} pièces`;
    }
    slotEl.classList.add('is-final');
    if (Sounds.scorePop) Sounds.scorePop();

    await sleep(400);
    slotEl.classList.remove('is-final');
  }

  function resetSlot() {
    slotWrapEl.classList.remove('is-visible');
    slotEl.textContent = '—';
    slotEl.classList.remove('is-rolling', 'is-final');
  }

  function setBoardHidden(hidden) {
    if (boardEl) boardEl.classList.toggle('is-minigame-hidden', hidden);
  }

  async function showStart(msg) {
    if (!overlay || !columnsEl) return;

    currentKind = msg.kind;
    overlay.className = `minigame-overlay minigame-overlay--${msg.kind}`;
    overlay.hidden = false;
    resetSlot();
    clearBoardDom();
    stopGoldenMovement();
    goldenBasketEl = null;
    goldenState = null;
    columnsEl.classList.remove('minigame-columns--golden');

    if (msg.kind === 'golden') {
      renderDropRow(true);
      renderGoldenColumns();
      iconEl.textContent = '🏆';
      titleEl.textContent = 'PANIER D\'OR';
      subtitleEl.textContent = 'Visez le panier en mouvement — gagnez ses pièces !';
      slotLabelEl.textContent = 'Récompense';
      if (msg.coinReward != null) {
        const valueEl = goldenBasketEl?.querySelector('.golden-basket__value');
        if (valueEl) valueEl.textContent = `+${msg.coinReward}`;
      }
      if (msg.movementStartedAt != null) {
        startGoldenMovement(msg);
      } else {
        updateGoldenBasketVisual(0);
      }
    } else {
      currentColumns = resolveColumns(msg);
      renderDropRow(false);
      renderColumns(currentColumns);

      if (msg.kind === 'knife') {
        iconEl.textContent = '🔪';
        titleEl.textContent = 'COUTEAU';
        subtitleEl.textContent = 'Touchez un adversaire ou tombez dans le vide';
        slotLabelEl.textContent = 'Dégâts infligés';
      } else {
        iconEl.textContent = '🦹';
        titleEl.textContent = 'VOLEUR';
        subtitleEl.textContent = 'Volez un adversaire ou ratez dans le vide';
        slotLabelEl.textContent = 'Pièces volées';
      }
    }

    setBoardHidden(true);

    void overlay.offsetWidth;
    overlay.classList.add('is-visible');

    if (msg.round != null && msg.activePlayer != null) {
      const hudLabels = {
        knife: 'Mini-jeu Couteau — visez !',
        thief: 'Mini-jeu Voleur — visez !',
        golden: 'Panier d\'Or — visez !',
      };
      UI.setHud(
        msg.round,
        null,
        playerLabelText(msg.activePlayer),
        hudLabels[msg.kind] || 'Mini-jeu — visez !'
      );
    }
  }

  async function playGoldenResult(msg) {
    stopGoldenMovement();
    clearHighlight();
    highlightColumn(msg.targetCol);
    UI.setHud(msg.round, null, playerLabelText(msg.activePlayer), 'Tir…');

    await dropBallOnColumn(msg.targetCol);

    const colEl = columnsEl?.querySelector(`[data-col="${msg.targetCol}"]`);
    const goldenColEl = msg.goldenCol != null
      ? columnsEl?.querySelector(`[data-col="${msg.goldenCol}"]`)
      : null;

    if (goldenColEl) {
      goldenColEl.classList.add('is-golden-here');
      if (msg.goldenCol != null) updateGoldenBasketVisual(msg.goldenCol);
      await sleep(300);
    }

    if (msg.hit) {
      if (colEl) colEl.classList.add('is-targeted');
      if (goldenBasketEl) goldenBasketEl.classList.add('is-hit');

      slotWrapEl.classList.add('is-visible');
      slotEl.textContent = `+${msg.resolvedAmount || msg.coinReward || 0}`;
      slotEl.classList.add('is-final');
      if (Sounds.achievement) Sounds.achievement();

      const origin = getColumnCenter(msg.targetCol);
      await Fx.flyScoreToPlayer(msg.activePlayer, msg.appliedToAttacker || msg.resolvedAmount, {
        startX: origin.x,
        startY: origin.y,
      });
      Players.updateScore(msg.activePlayer, msg.scores[msg.activePlayer], msg.appliedToAttacker);
      Fx.flash('gold');
      UI.setHud(
        msg.round,
        null,
        playerLabelText(msg.activePlayer),
        `+${msg.resolvedAmount || msg.coinReward} pièces !`
      );
    } else {
      if (colEl) colEl.classList.add('is-missed');
      const fx = document.createElement('div');
      fx.className = 'minigame-hole-fx';
      fx.textContent = 'RATÉ';
      colEl?.querySelector('.minigame-col__slot')?.appendChild(fx);
      setTimeout(() => fx.remove(), 900);
      UI.setHud(msg.round, null, playerLabelText(msg.activePlayer), 'Raté — le panier était ailleurs !');
    }

    await sleep(700);
    resetSlot();
    clearHighlight();
    if (goldenBasketEl) goldenBasketEl.classList.remove('is-hit');
    columnsEl?.querySelectorAll('.is-golden-here').forEach((el) => el.classList.remove('is-golden-here'));
  }

  async function playResult(msg) {
    if (msg.kind === 'golden') {
      await playGoldenResult(msg);
      return;
    }

    clearHighlight();
    highlightColumn(msg.targetCol);
    UI.setHud(msg.round, null, playerLabelText(msg.activePlayer), 'Tir…');

    await dropBallOnColumn(msg.targetCol);

    const colEl = columnsEl?.querySelector(`[data-col="${msg.targetCol}"]`);

    if (msg.targetType === 'hole') {
      if (colEl) {
        colEl.classList.add('is-missed');
        const fx = document.createElement('div');
        fx.className = 'minigame-hole-fx';
        fx.textContent = 'PERDU';
        colEl.querySelector('.minigame-col__slot')?.appendChild(fx);
        setTimeout(() => fx.remove(), 900);
      }
      UI.setHud(msg.round, null, playerLabelText(msg.activePlayer), 'VIDE — raté !');
      await sleep(700);
      return;
    }

    if (colEl) colEl.classList.add('is-targeted');
    if (msg.targetPlayer && window.Players?.highlightTarget) {
      Players.highlightTarget(msg.targetPlayer);
    }

    const resolvedAmount = msg.resolvedAmount != null
      ? msg.resolvedAmount
      : (msg.kind === 'thief'
        ? (msg.appliedToAttacker || 0)
        : Math.abs(msg.appliedToVictim || 0));

    await animateSlotRoll(resolvedAmount, msg.rolledPercent);

    const origin = getColumnCenter(msg.targetCol);

    if (msg.kind === 'knife' && msg.appliedToVictim < 0) {
      await Fx.flyScoreToPlayer(msg.targetPlayer, msg.appliedToVictim, {
        startX: origin.x,
        startY: origin.y,
      });
      Players.updateScore(msg.targetPlayer, msg.scores[msg.targetPlayer], msg.appliedToVictim);
      Fx.flash('danger');
      UI.setHud(msg.round, null, playerLabelText(msg.activePlayer), `−${resolvedAmount} (${msg.rolledPercent}%) sur J${msg.targetPlayer} !`);
    } else if (msg.kind === 'thief') {
      if (resolvedAmount > 0) {
        await Fx.flyScoreToPlayer(msg.targetPlayer, -resolvedAmount, {
          startX: origin.x,
          startY: origin.y,
        });
        Players.updateScore(msg.targetPlayer, msg.scores[msg.targetPlayer], -resolvedAmount);
        await Fx.flyCoinsBetween(msg.targetPlayer, msg.activePlayer, resolvedAmount);
        Players.updateScore(msg.activePlayer, msg.scores[msg.activePlayer], resolvedAmount);
        Fx.flash('purple');
        UI.setHud(
          msg.round,
          null,
          playerLabelText(msg.activePlayer),
          `Vol ${resolvedAmount} (${msg.rolledPercent}%) depuis J${msg.targetPlayer} !`
        );
      } else {
        UI.setHud(msg.round, null, playerLabelText(msg.activePlayer), `J${msg.targetPlayer} n'a rien à voler`);
      }
    }

    if (msg.targetPlayer && window.Players?.clearTarget) {
      Players.clearTarget(msg.targetPlayer);
    }

    await sleep(700);
    resetSlot();
    clearHighlight();
  }

  async function hide() {
    if (!overlay) return;
    stopGoldenMovement();
    goldenState = null;
    overlay.classList.add('is-exiting');
    overlay.classList.remove('is-visible');
    await sleep(250);
    overlay.hidden = true;
    overlay.classList.remove('is-exiting');
    clearBoardDom();
    resetSlot();
    setBoardHidden(false);
    currentKind = null;
    currentColumns = [];
  }

  function restoreFromState(minigame) {
    if (!minigame) return Promise.resolve();
    const base = {
      type: 'MINIGAME_START',
      kind: minigame.kind,
      activePlayer: minigame.activePlayer,
      round: null,
    };
    if (minigame.kind === 'golden') {
      return showStart({
        ...base,
        seed: minigame.seed,
        coinReward: minigame.coinReward,
        periodMs: minigame.periodMs,
        columnCount: minigame.columnCount,
        movementStartedAt: minigame.movementStartedAt,
      });
    }
    return showStart({
      ...base,
      columns: minigame.columns,
      seed: minigame.seed,
    });
  }

  return {
    showStart,
    playResult,
    hide,
    restoreFromState,
    updateGoldenMovement,
    highlightColumn,
    clearHighlight,
    getColumnCenter,
  };
})();
