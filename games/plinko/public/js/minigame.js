/**
 * minigame.js — Overlay mini-jeux Couteau / Voleur.
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

  let currentKind = null;
  let currentColumns = [];

  function playerLabelText(n) {
    return window.PlayerFaces ? PlayerFaces.getPseudo(n) : `Joueur ${n}`;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clearBoardDom() {
    if (dropRowEl) dropRowEl.innerHTML = '';
    if (columnsEl) columnsEl.innerHTML = '';
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

  function renderDropRow() {
    if (!dropRowEl) return;
    dropRowEl.innerHTML = '';
    for (let c = 0; c < COLUMN_COUNT; c++) {
      const cell = document.createElement('div');
      cell.className = 'minigame-board__drop-cell';
      cell.dataset.col = String(c);
      cell.textContent = String(c + 1);
      dropRowEl.appendChild(cell);
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
    dropRowEl?.querySelectorAll('.minigame-board__drop-cell').forEach((el) => {
      el.classList.toggle('is-active', Number(el.dataset.col) === col);
    });
    columnsEl?.querySelectorAll('.minigame-col').forEach((el) => {
      el.classList.toggle('is-active', Number(el.dataset.col) === col);
    });
  }

  function clearHighlight() {
    dropRowEl?.querySelectorAll('.minigame-board__drop-cell').forEach((el) => {
      el.classList.remove('is-active');
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

    currentColumns = resolveColumns(msg);
    renderDropRow();
    renderColumns(currentColumns);
    setBoardHidden(true);

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

    void overlay.offsetWidth;
    overlay.classList.add('is-visible');

    if (msg.round != null && msg.activePlayer != null) {
      UI.setHud(
        msg.round,
        null,
        playerLabelText(msg.activePlayer),
        msg.kind === 'knife' ? 'Mini-jeu Couteau — visez !' : 'Mini-jeu Voleur — visez !'
      );
    }
  }

  async function playResult(msg) {
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
    return showStart({
      type: 'MINIGAME_START',
      kind: minigame.kind,
      activePlayer: minigame.activePlayer,
      columns: minigame.columns,
      round: null,
    });
  }

  return {
    showStart,
    playResult,
    hide,
    restoreFromState,
    highlightColumn,
    clearHighlight,
    getColumnCenter,
  };
})();
