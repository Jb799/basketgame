/**
 * effects.js — Effets locaux Plinko (pièces, bombes, score volant).
 */

window.Fx = (function () {
  const fxLayer = document.getElementById('fx-layer');
  const flashEl = document.getElementById('screen-flash');
  const layoutEl = document.getElementById('plinko-layout');

  const SCORE_POP_MS = 350;
  const SCORE_FLY_MS = 450;

  function flash(type) {
    flashEl.hidden = false;
    const cls = {
      gold: 'is-gold',
      danger: 'is-danger',
      steel: 'is-steel',
      purple: 'is-purple',
    };
    flashEl.className = 'screen-flash ' + (cls[type] || cls.gold);
    setTimeout(() => {
      flashEl.hidden = true;
      flashEl.className = 'screen-flash';
    }, 300);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function coinBurst(x, y, count, amount) {
    const n = Math.min(12, Math.max(3, count || 3));
    for (let i = 0; i < n; i++) {
      const coin = document.createElement('span');
      coin.className = 'fx-coin';
      coin.textContent = '🪙';
      coin.style.left = `${x}px`;
      coin.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i) / n;
      const dist = 40 + Math.random() * 60;
      coin.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      coin.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
      fxLayer.appendChild(coin);
      setTimeout(() => coin.remove(), 900);
    }
    flash('gold');
  }

  function bombExplosion(x, y, size) {
    const el = document.createElement('div');
    el.className = `fx-bomb fx-bomb--${size || 'medium'}`;
    el.style.left = `${x - 50}px`;
    el.style.top = `${y - 50}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 700);

    layoutEl.classList.remove('is-shaking');
    void layoutEl.offsetWidth;
    layoutEl.classList.add('is-shaking');
    flash('danger');
    if (Sounds.bombHit) Sounds.bombHit(size);
  }

  function onLand(slot, slotEl, opts = {}) {
    if (!slotEl) return;
    const rect = slotEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const onFire = opts.onFire && (opts.multiplier || 1) > 1;

    if (slot.type === 'coin') {
      coinBurst(cx, cy, (slot.iconCount || 3) + (onFire ? 2 : 0), slot.value);
    } else if (slot.type === 'bomb') {
      bombExplosion(cx, cy, onFire ? 'large' : (slot.size || 'medium'));
    } else if (slot.type === 'knife') {
      knifeFlash(cx, cy);
    } else if (slot.type === 'thief') {
      thiefFlash(cx, cy);
    } else if (slot.type === 'golden') {
      goldenFlash(cx, cy);
    }
  }

  function goldenFlash(x, y) {
    const el = document.createElement('div');
    el.className = 'fx-golden';
    el.textContent = '🏆';
    el.style.left = `${x - 24}px`;
    el.style.top = `${y - 24}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
    coinBurst(x, y, 6, 0);
    if (Sounds.achievement) Sounds.achievement();
  }

  function knifeFlash(x, y) {
    const el = document.createElement('div');
    el.className = 'fx-knife';
    el.textContent = '🔪';
    el.style.left = `${x - 24}px`;
    el.style.top = `${y - 24}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 800);
    flash('steel');
    if (Sounds.meleeHit) Sounds.meleeHit();
  }

  function thiefFlash(x, y) {
    const el = document.createElement('div');
    el.className = 'fx-thief';
    el.textContent = '🦹';
    el.style.left = `${x - 24}px`;
    el.style.top = `${y - 24}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 800);
    flash('purple');
  }

  function getScoreTarget(player) {
    const scoreEl = document.getElementById(`score-p${player}`);
    const tabEl = document.querySelector(`[data-player="${player}"]`);
    if (!scoreEl) return null;
    const rect = scoreEl.getBoundingClientRect();
    return {
      scoreEl,
      tabEl,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function flyScoreToPlayer(player, delta, opts = {}) {
    if (!delta || !fxLayer) return sleep(0);

    const target = getScoreTarget(player);
    const isGain = delta > 0;
    const label = isGain ? `+${delta}` : String(delta);

    const startX = opts.startX != null ? opts.startX : window.innerWidth / 2;
    const startY = opts.startY != null ? opts.startY : window.innerHeight * 0.38;

    const el = document.createElement('div');
    el.className = `fx-score-fly ${isGain ? 'fx-score-fly--gain' : 'fx-score-fly--loss'}`;
    if (window.PlayerFaces) {
      const face = PlayerFaces.createFace({ slot: player, variant: isGain ? 'win' : 'lose', size: 'lg' });
      face.classList.add('fx-score-fly__face');
      el.appendChild(face);
    }
    const text = document.createElement('span');
    text.textContent = label;
    el.appendChild(text);
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    fxLayer.appendChild(el);

    if (Sounds.scorePop) Sounds.scorePop();

    return sleep(SCORE_POP_MS).then(() => {
      if (target) {
        el.style.setProperty('--dx', `${target.x - startX}px`);
        el.style.setProperty('--dy', `${target.y - startY}px`);
      } else {
        el.style.setProperty('--dx', '0px');
        el.style.setProperty('--dy', '120px');
      }

      el.classList.add('is-flying');

      return new Promise((resolve) => {
        const onEnd = () => {
          el.removeEventListener('animationend', onEnd);
          el.remove();
          if (target?.tabEl) {
            target.tabEl.classList.remove('is-score-hit');
            void target.tabEl.offsetWidth;
            target.tabEl.classList.add('is-score-hit');
          }
          if (isGain && Sounds.scoreImpactGain) Sounds.scoreImpactGain();
          else if (!isGain && Sounds.scoreImpactLoss) Sounds.scoreImpactLoss();
          if (isGain && Sounds.coinWin) Sounds.coinWin(Math.abs(delta));
          resolve();
        };
        el.addEventListener('animationend', onEnd);
        setTimeout(onEnd, SCORE_FLY_MS + 80);
      });
    });
  }

  function flyCoinsBetween(fromPlayer, toPlayer, amount) {
    if (!amount || !fxLayer) return sleep(0);

    if (Sounds.thiefSwoosh) Sounds.thiefSwoosh();

    const from = getScoreTarget(fromPlayer);
    const to = getScoreTarget(toPlayer);
    if (!from || !to) return sleep(0);

    const startX = from.x;
    const startY = from.y;
    const n = Math.min(8, Math.max(3, Math.ceil(amount / 3)));

    const promises = [];
    for (let i = 0; i < n; i++) {
      promises.push(new Promise((resolve) => {
        setTimeout(() => {
          const coin = document.createElement('span');
          coin.className = 'fx-coin fx-coin--steal';
          coin.textContent = '🪙';
          coin.style.left = `${startX}px`;
          coin.style.top = `${startY}px`;
          coin.style.setProperty('--dx', `${to.x - startX + (Math.random() - 0.5) * 20}px`);
          coin.style.setProperty('--dy', `${to.y - startY + (Math.random() - 0.5) * 20}px`);
          fxLayer.appendChild(coin);
          setTimeout(() => {
            coin.remove();
            resolve();
          }, 900);
        }, i * 80);
      }));
    }

    return Promise.all(promises).then(() => {
      if (Sounds.coinWin) Sounds.coinWin(amount);
    });
  }

  return { coinBurst, bombExplosion, onLand, flash, flyScoreToPlayer, flyCoinsBetween, knifeFlash, thiefFlash, goldenFlash };
})();
