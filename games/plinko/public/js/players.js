/**
 * players.js — Tabs joueurs en bas de l'écran.
 */

window.Players = (function () {
  const tabsEl = document.getElementById('player-tabs');
  const PLAYER_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5'];

  let players = [];
  let scores = {};
  let currentPlayer = null;
  let droppingPlayer = null;
  let initialized = false;

  function init() {}

  function setup(playerList, initialScores, activePlayer) {
    players = playerList || [];
    scores = { ...initialScores };
    if (activePlayer != null) {
      currentPlayer = activePlayer;
    } else if (!initialized || currentPlayer == null) {
      currentPlayer = players[0] || 1;
    }
    initialized = true;
    render();
    updateActiveStates();
  }

  function render() {
    tabsEl.innerHTML = '';
    for (const p of players) {
      const tab = document.createElement('div');
      tab.className = `player-tab player-tab--${PLAYER_COLORS[p - 1] || 'p1'}`;
      tab.dataset.player = String(p);

      const badge = document.createElement('span');
      badge.className = 'player-tab__badge';
      badge.textContent = 'À vous';

      if (window.PlayerFaces) {
        const face = PlayerFaces.createFace({ slot: p, variant: 'idle', size: 'sm' });
        face.classList.add('player-tab__face');
        face.id = `face-p${p}`;
        tab.appendChild(face);
      }

      const label = document.createElement('span');
      label.className = 'player-tab__label';
      label.textContent = window.PlayerFaces ? PlayerFaces.getPseudo(p) : `Joueur ${p}`;

      const scoreRow = document.createElement('div');
      scoreRow.className = 'player-tab__score-row';

      const coinIcon = document.createElement('span');
      coinIcon.className = 'player-tab__coin';
      coinIcon.textContent = '🪙';
      coinIcon.setAttribute('aria-hidden', 'true');

      const score = document.createElement('span');
      score.className = 'player-tab__score';
      score.id = `score-p${p}`;
      const val = Math.max(0, scores[p] || 0);
      score.textContent = formatScore(val);
      score.classList.toggle('is-positive', val > 0);

      scoreRow.appendChild(coinIcon);
      scoreRow.appendChild(score);

      tab.appendChild(badge);
      tab.appendChild(label);
      tab.appendChild(scoreRow);
      tabsEl.appendChild(tab);
    }
    updateActiveStates();
  }

  function formatScore(val) {
    return String(Math.max(0, val));
  }

  function updateActiveStates() {
    tabsEl.querySelectorAll('.player-tab').forEach((el) => {
      const p = Number(el.dataset.player);
      el.classList.toggle('is-active', p === currentPlayer && droppingPlayer == null);
      el.classList.toggle('is-dropping', p === droppingPlayer);
    });
  }

  function setDropping(player) {
    droppingPlayer = player;
    updateActiveStates();
  }

  function clearDropping() {
    droppingPlayer = null;
    updateActiveStates();
  }

  function setCurrent(player) {
    currentPlayer = player;
    droppingPlayer = null;
    updateActiveStates();
  }

  function highlightTurn(player) {
    currentPlayer = player;
    droppingPlayer = null;
    updateActiveStates();
    const tab = tabsEl.querySelector(`[data-player="${player}"]`);
    if (tab) {
      tab.classList.remove('is-active');
      void tab.offsetWidth;
      tab.classList.add('is-active');
    }
  }

  function updateScore(player, newScore, delta, opts = {}) {
    scores[player] = Math.max(0, newScore);
    const el = document.getElementById(`score-p${player}`);
    if (!el) return;

    if (opts.animate === false) {
      el.textContent = formatScore(scores[player]);
      el.classList.toggle('is-positive', scores[player] > 0);
      return;
    }

    el.textContent = formatScore(scores[player]);
    el.classList.toggle('is-positive', scores[player] > 0);

    el.classList.remove('is-bump-up', 'is-bump-down');
    void el.offsetWidth;
    if (delta > 0) el.classList.add('is-bump-up');
    else if (delta < 0) el.classList.add('is-bump-down');

    if (delta > 0) setFaceVariant(player, 'win', 1500);
    else if (delta < 0) setFaceVariant(player, 'lose', 1500);
  }

  /** Change la variante du visage d'un onglet (win/lose), retour à idle après revertMs. */
  function setFaceVariant(player, variant, revertMs) {
    if (!window.PlayerFaces) return;
    const el = document.getElementById(`face-p${player}`);
    if (!el) return;
    const url = PlayerFaces.getUrl(player, variant);
    const img = el.querySelector('.player-face__img');
    if (url && img) {
      img.src = url;
    } else if (!url) {
      const initialsEl = el.querySelector('.player-face__initials');
      if (initialsEl) initialsEl.textContent = PlayerFaces.initials(player);
    }
    el.classList.toggle('player-face--win', variant === 'win');
    el.classList.toggle('player-face--lose', variant === 'lose');
    if (revertMs) {
      clearTimeout(el._revert);
      el._revert = setTimeout(() => setFaceVariant(player, 'idle'), revertMs);
    }
  }

  function updateScores(newScores) {
    scores = { ...newScores };
    for (const p of players) {
      const el = document.getElementById(`score-p${p}`);
      if (!el) continue;
      const val = Math.max(0, scores[p] || 0);
      el.textContent = formatScore(val);
      el.classList.toggle('is-positive', val > 0);
    }
  }

  function highlightTarget(player) {
    const tab = tabsEl.querySelector(`[data-player="${player}"]`);
    if (tab) tab.classList.add('is-targeted');
  }

  function clearTarget(player) {
    const tab = tabsEl.querySelector(`[data-player="${player}"]`);
    if (tab) tab.classList.remove('is-targeted');
  }

  return {
    init,
    setup,
    setCurrent,
    setDropping,
    clearDropping,
    highlightTurn,
    highlightTarget,
    clearTarget,
    updateScore,
    updateScores,
    setFaceVariant,
    getCurrent: () => currentPlayer,
  };
})();
