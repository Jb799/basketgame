/**
 * ui.js — Bannières de transition tour / round / mini-jeu.
 */

window.UI = (function () {
  const turnOverlay = document.getElementById('turn-overlay');
  const turnBanner = document.getElementById('turn-overlay-banner');
  const roundOverlay = document.getElementById('round-overlay');
  const roundBanner = document.getElementById('round-overlay-banner');
  const minigameIntroOverlay = document.getElementById('minigame-intro-overlay');
  const minigameIntroBanner = document.getElementById('minigame-intro-banner');

  const hudRound = document.getElementById('hud-round');
  const hudTurn = document.getElementById('hud-turn');
  const hudStatus = document.getElementById('hud-status');
  const multiplierOverlay = document.getElementById('multiplier-overlay');

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function setHud(round, totalRounds, player, status) {
    if (round != null && totalRounds != null) hudRound.textContent = `Tour ${round} / ${totalRounds}`;
    if (player != null) hudTurn.textContent = player;
    if (status != null) hudStatus.textContent = status;
  }

  function playerLabel(n) {
    return window.PlayerFaces ? PlayerFaces.getPseudo(n) : `Joueur ${n}`;
  }

  function showTurnBanner(player, durationMs = 1000) {
    turnBanner.textContent = `À vous — ${playerLabel(player)}`;
    turnOverlay.hidden = false;

    return sleep(durationMs).then(() => {
      turnOverlay.hidden = true;
    });
  }

  function showRoundBanner(round, totalRounds, durationMs = 3000) {
    roundBanner.textContent = `Fin du tour ${round} / ${totalRounds}`;
    roundOverlay.hidden = false;

    return sleep(durationMs).then(() => {
      roundOverlay.hidden = true;
    });
  }

  function showMultiplierX2(durationMs = 1200) {
    if (!multiplierOverlay) return sleep(0);

    multiplierOverlay.removeAttribute('hidden');
    multiplierOverlay.classList.remove('is-play');
    void multiplierOverlay.offsetWidth;
    multiplierOverlay.classList.add('is-play');

    if (Sounds.multiplierX2) Sounds.multiplierX2();

    return sleep(durationMs).then(() => {
      multiplierOverlay.setAttribute('hidden', '');
      multiplierOverlay.classList.remove('is-play');
    });
  }

  function showMinigameLandPause(kind, player, durationMs = 400) {
    const labels = {
      knife: '🔪 Couteau !',
      thief: '🦹 Voleur !',
      golden: '🏆 Panier d\'Or !',
    };
    setHud(null, null, playerLabel(player), labels[kind] || 'Mini-jeu !');
    return sleep(durationMs);
  }

  function showMinigameIntro(kind, player, durationMs = 650) {
    if (!minigameIntroOverlay || !minigameIntroBanner) return sleep(0);

    const icons = { knife: '🔪', thief: '🦹', golden: '🏆' };
    const titles = {
      knife: 'MINI-JEU COUTEAU',
      thief: 'MINI-JEU VOLEUR',
      golden: 'PANIER D\'OR',
    };
    const icon = icons[kind] || '🎯';
    const title = titles[kind] || 'MINI-JEU';
    const hint = kind === 'golden'
      ? 'Visez le panier d\'or en mouvement !'
      : 'Visez une colonne !';
    minigameIntroBanner.textContent = `${icon} ${title} — ${hint}`;
    minigameIntroBanner.className = `minigame-intro-overlay__banner minigame-intro-overlay__banner--${kind}`;
    minigameIntroOverlay.hidden = false;

    return sleep(durationMs).then(() => {
      minigameIntroOverlay.hidden = true;
      minigameIntroBanner.className = 'minigame-intro-overlay__banner';
    });
  }

  function showResultPause(appliedDelta, slotDelta, opts = {}) {
    const onFire = opts.onFireAtLand;
    const slotType = opts.slotType;
    let text = 'Case neutre';
    if (slotType === 'knife') {
      text = '🔪 Mini-jeu Couteau !';
    } else if (slotType === 'thief') {
      text = '🦹 Mini-jeu Voleur !';
    } else if (slotType === 'golden') {
      text = '🏆 Panier d\'Or !';
    } else if (appliedDelta > 0) {
      text = `+${appliedDelta} pièce${appliedDelta > 1 ? 's' : ''} !`;
      if (onFire) text += ' 🔥 ×2';
    } else if (appliedDelta < 0) {
      text = `${appliedDelta} pièce${appliedDelta < -1 ? 's' : ''}`;
      if (onFire) text += ' 🔥 ×2';
    } else if (slotDelta < 0) {
      text = 'Pas assez de pièces !';
    } else if (onFire && slotDelta > 0) {
      text = `🔥 ×2 — +${slotDelta * 2} pièces !`;
    }
    hudStatus.textContent = text;
    return sleep(onFire ? 500 : 350);
  }

  return {
    setHud,
    showTurnBanner,
    showRoundBanner,
    showResultPause,
    showMultiplierX2,
    showMinigameLandPause,
    showMinigameIntro,
    sleep,
  };
})();
