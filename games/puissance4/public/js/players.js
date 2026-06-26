/**
 * players.js — HUD minimal : badges joueurs, scores, indicateur de tour
 */

window.Players = (function () {
  const state = {
    wins: { 1: 0, 2: 0 },
    currentPlayer: 1,
  };

  const els = {};

  const PLAYER_LABELS = { 1: 'Joueur Orange', 2: 'Joueur Bleu' };

  function init() {
    els.p1Badge = document.getElementById('player1-badge');
    els.p2Badge = document.getElementById('player2-badge');
    els.p1Wins = document.getElementById('p1-wins');
    els.p2Wins = document.getElementById('p2-wins');
    els.p1Token = els.p1Badge.querySelector('.player-badge__token');
    els.p2Token = els.p2Badge.querySelector('.player-badge__token');
    els.boardSection = document.getElementById('board-section');
    els.turnIndicator = document.getElementById('turn-indicator');
    els.turnIndicatorName = document.getElementById('turn-indicator-name');

    els.p1Name = document.createElement('span');
    els.p1Name.className = 'player-badge__name';
    els.p1Badge.insertBefore(els.p1Name, els.p1Wins);

    els.p2Name = document.createElement('span');
    els.p2Name.className = 'player-badge__name';
    els.p2Badge.insertBefore(els.p2Name, els.p2Token);

    setActiveTurn(1);
    applyRoster();
  }

  /** Visages des profils (ou initiales par défaut). */
  function applyRoster() {
    if (!window.PlayerFaces) return;
    els.p1Name.textContent = PlayerFaces.getPseudo(1);
    els.p2Name.textContent = PlayerFaces.getPseudo(2);
    setTokenFace(1, 'idle');
    setTokenFace(2, 'idle');
    updateTurnChrome(state.currentPlayer);
  }

  function setTokenFace(slot, variant) {
    const tokenEl = slot === 1 ? els.p1Token : els.p2Token;
    if (!tokenEl || !window.PlayerFaces) return;

    tokenEl.innerHTML = '';
    tokenEl.classList.remove('player-badge__token--photo', 'player-badge__token--face');
    tokenEl.style.backgroundImage = '';

    const url = PlayerFaces.getUrl(slot, variant);
    if (url) {
      tokenEl.style.backgroundImage = `url("${url}")`;
      tokenEl.style.backgroundSize = 'cover';
      tokenEl.style.backgroundPosition = 'center';
      tokenEl.classList.add('player-badge__token--photo');
    } else {
      const face = PlayerFaces.createFace({ slot, variant, size: 'sm' });
      face.classList.add('player-badge__token-face');
      tokenEl.appendChild(face);
      tokenEl.classList.add('player-badge__token--face');
    }
    tokenEl.classList.toggle('player-badge__token--lose', variant === 'lose' && Boolean(url));
  }

  /** Fin de manche : visage de fierté pour le gagnant, de défaite pour l'autre. */
  function setOutcome(winner) {
    const w = Number(winner);
    if (!w) return;
    setTokenFace(1, w === 1 ? 'win' : 'lose');
    setTokenFace(2, w === 2 ? 'win' : 'lose');
  }

  function playerDisplayName(player) {
    if (window.PlayerFaces) return PlayerFaces.getPseudo(player);
    return PLAYER_LABELS[player] || `Joueur ${player}`;
  }

  function updateTurnChrome(player) {
    const p = Number(player);
    if (!p) return;

    if (els.boardSection) {
      els.boardSection.classList.remove('turn-p1', 'turn-p2');
      els.boardSection.classList.add(`turn-p${p}`);
    }

    if (els.turnIndicator) {
      els.turnIndicator.classList.remove('turn-indicator--p1', 'turn-indicator--p2');
      els.turnIndicator.classList.add(`turn-indicator--p${p}`);
    }

    if (els.turnIndicatorName) {
      els.turnIndicatorName.textContent = playerDisplayName(p);
    }
  }

  /**
   * Met à jour le joueur actif (animation sur le badge).
   * @param {number} player - 1 ou 2
   */
  function setActiveTurn(player) {
    state.currentPlayer = player;

    if (player === 1) {
      els.p1Badge.classList.add('active');
      els.p2Badge.classList.remove('active');
    } else {
      els.p2Badge.classList.add('active');
      els.p1Badge.classList.remove('active');
    }

    updateTurnChrome(player);
  }

  /**
   * Met à jour les scores affichés.
   * @param {{ 1: number, 2: number }} scores
   */
  function updateScores(scores) {
    if (!scores) return;

    state.wins[1] = scores[1] ?? scores['1'] ?? 0;
    state.wins[2] = scores[2] ?? scores['2'] ?? 0;

    if (els.p1Wins) els.p1Wins.textContent = state.wins[1];
    if (els.p2Wins) els.p2Wins.textContent = state.wins[2];
  }

  /**
   * Réinitialise l'état d'une manche (scores conservés).
   */
  function resetRound() {
    if (els.turnIndicator) {
      els.turnIndicator.classList.remove('turn-indicator--hidden');
    }
    setActiveTurn(1);
    setTokenFace(1, 'idle');
    setTokenFace(2, 'idle');
  }

  /**
   * Réinitialise complètement (scores inclus).
   */
  function resetAll() {
    state.wins = { 1: 0, 2: 0 };
    resetRound();
    updateScores({ 1: 0, 2: 0 });
  }

  /**
   * Fin de manche : retire la mise en évidence des badges.
   */
  function setGameOver() {
    els.p1Badge.classList.remove('active');
    els.p2Badge.classList.remove('active');
    if (els.boardSection) {
      els.boardSection.classList.remove('turn-p1', 'turn-p2');
    }
    if (els.turnIndicator) {
      els.turnIndicator.classList.add('turn-indicator--hidden');
    }
  }

  /**
   * Anime un "+1" géant qui s'envole du centre vers le compteur du vainqueur.
   */
  function animateScoreAddition(winner, scores) {
    const winnerNum = Number(winner);
    if (!winnerNum) {
      updateScores(scores);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const targetEl = winnerNum === 1 ? els.p1Wins : els.p2Wins;
      const badgeEl = winnerNum === 1 ? els.p1Badge : els.p2Badge;

      const pop = document.createElement('div');
      pop.className = `score-popup p${winnerNum}`;
      pop.textContent = '+1';
      pop.style.position = 'fixed';
      pop.style.zIndex = '2000';
      pop.style.pointerEvents = 'none';
      document.body.appendChild(pop);

      const startX = window.innerWidth / 2;
      const startY = window.innerHeight / 2;

      const targetRect = targetEl ? targetEl.getBoundingClientRect() : null;
      const endX = targetRect ? targetRect.left + targetRect.width / 2 : startX;
      const endY = targetRect ? targetRect.top + targetRect.height / 2 : startY - 200;

      const PHASE1_MS = 400;
      const PHASE2_MS = 600;
      let startTime = null;

      function easeOutBack(t) {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      }
      function easeInCubic(t) { return t * t * t; }

      function phase1(ts) {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;
        const t = Math.min(elapsed / PHASE1_MS, 1);
        const scale = easeOutBack(t) * 1.6;
        const opacity = Math.min(t * 3, 1);

        pop.style.left = `${startX}px`;
        pop.style.top = `${startY}px`;
        pop.style.transform = `translate(-50%, -50%) scale(${scale})`;
        pop.style.opacity = opacity;

        if (t < 1) {
          requestAnimationFrame(phase1);
        } else {
          setTimeout(() => {
            startTime = null;
            requestAnimationFrame(phase2);
          }, 500);
        }
      }

      function phase2(ts) {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;
        const t = Math.min(elapsed / PHASE2_MS, 1);
        const te = easeInCubic(t);

        const cx = startX + (endX - startX) * te;
        const cy = startY + (endY - startY) * te;
        const scale = 1.6 - te * 1.2;
        const opacity = 1 - te * 0.3;

        pop.style.left = `${cx}px`;
        pop.style.top = `${cy}px`;
        pop.style.transform = `translate(-50%, -50%) scale(${Math.max(scale, 0.2)})`;
        pop.style.opacity = opacity;

        if (t < 1) {
          requestAnimationFrame(phase2);
        } else {
          pop.remove();
          onImpact();
        }
      }

      function onImpact() {
        updateScores(scores);

        if (badgeEl) {
          badgeEl.classList.remove('impact');
          void badgeEl.offsetWidth;
          badgeEl.classList.add('impact');
          setTimeout(() => badgeEl.classList.remove('impact'), 500);
        }

        if (targetEl) {
          targetEl.classList.remove('bump');
          void targetEl.offsetWidth;
          targetEl.classList.add('bump');
        }

        createImpactParticles(endX, endY, winnerNum);
        resolve();
      }

      requestAnimationFrame(phase1);
    });
  }

  function createImpactParticles(x, y, player) {
    const color = player === 1 ? 'var(--p1-color)' : 'var(--p2-color)';
    const shadowColor = player === 1 ? 'var(--p1-glow)' : 'var(--p2-glow)';

    for (let i = 0; i < 16; i++) {
      const part = document.createElement('div');
      part.className = 'impact-particle';
      part.style.backgroundColor = color;
      part.style.boxShadow = `0 0 10px ${shadowColor}`;
      part.style.left = `${x}px`;
      part.style.top = `${y}px`;

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 1.5;

      document.body.appendChild(part);

      let px = x;
      let py = y;
      let opacity = 1;
      let scale = 1;

      const animate = () => {
        px += vx;
        py += vy;
        opacity -= 0.035;
        scale -= 0.025;

        part.style.left = `${px}px`;
        part.style.top = `${py}px`;
        part.style.opacity = opacity;
        part.style.transform = `translate(-50%, -50%) scale(${Math.max(0, scale)})`;

        if (opacity > 0) {
          requestAnimationFrame(animate);
        } else {
          part.remove();
        }
      };

      requestAnimationFrame(animate);
    }
  }

  return {
    init,
    applyRoster,
    setOutcome,
    setActiveTurn,
    updateScores,
    animateScoreAddition,
    resetRound,
    resetAll,
    setGameOver,
  };
})();
