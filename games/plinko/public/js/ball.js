/**
 * ball.js — Chute Plinko avec élan directionnel + mode feu (×2 à l'atterrissage).
 */

window.Ball = (function () {
  const ballEl = document.getElementById('ball');
  const flameWrap = document.getElementById('ball-flame-wrap');

  const FIRE_STREAK_MIN = 3;
  const MOMENTUM_START = 1.05;
  const MOMENTUM_MIN = 0.6;
  const MOMENTUM_MAX = 1.75;
  const MOMENTUM_GAIN_SAME = 0.2;
  const MOMENTUM_LOSS_COLLISION = 0.68;

  /** Plafond de vitesse effectif (1 = vitesse de base, plus haut = plus rapide). */
  const SPEED_CAP = 1.65;
  const FIRE_SPEED_BONUS = 1.08;
  const SEGMENT_MIN_MS = 42;
  const SEGMENT_MAX_MS = 480;

  let animating = false;
  let rafId = null;
  let onFire = false;

  function show() {
    ballEl.hidden = false;
    ballEl.classList.add('is-falling');
  }

  function hideFlameWrap() {
    if (!flameWrap) return;
    flameWrap.hidden = true;
    flameWrap.classList.remove('is-active');
  }

  function hide() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    ballEl.hidden = true;
    ballEl.classList.remove('is-falling', 'is-squash', 'is-stretch', 'is-fast', 'is-on-fire', 'is-extinguishing');
    ballEl.style.transform = '';
    hideFlameWrap();
    onFire = false;
    animating = false;
  }

  function setPosition(x, y) {
    ballEl.style.left = `${x}px`;
    ballEl.style.top = `${y}px`;
    if (flameWrap && !flameWrap.hidden) {
      flameWrap.style.left = `${x}px`;
      flameWrap.style.top = `${y}px`;
    }
  }

  function setBallStyle(className) {
    if (onFire) return;
    ballEl.classList.remove('is-squash', 'is-stretch', 'is-fast');
    if (className) ballEl.classList.add(className);
  }

  function setFire(active) {
    onFire = active;
    ballEl.classList.toggle('is-on-fire', active);
    ballEl.classList.remove('is-squash', 'is-stretch', 'is-fast', 'is-extinguishing');

    if (!flameWrap) return;

    if (active) {
      flameWrap.hidden = false;
      flameWrap.classList.add('is-active');
      const x = parseFloat(ballEl.style.left) || 0;
      const y = parseFloat(ballEl.style.top) || 0;
      flameWrap.style.left = `${x}px`;
      flameWrap.style.top = `${y}px`;
    } else {
      hideFlameWrap();
    }
  }

  function extinguishFire() {
    if (!onFire) return;
    onFire = false;
    ballEl.classList.remove('is-on-fire');
    hideFlameWrap();
    ballEl.classList.add('is-extinguishing');
    setTimeout(() => ballEl.classList.remove('is-extinguishing'), 320);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function bounceToDir(bounce) {
    if (bounce === 'left') return -1;
    if (bounce === 'right') return 1;
    return 0;
  }

  /** Recalcule onFire côté client (sync visuelle même si le path WS est incomplet). */
  function enrichPathWithFire(pixelPath) {
    let lastDir = 0;
    let streak = 0;
    let fire = false;

    return pixelPath.map((pt) => {
      const outDir = bounceToDir(pt.bounce);
      if (outDir === 0) {
        return { ...pt, onFire: fire };
      }

      const directionChanged = lastDir !== 0 && outDir !== lastDir;
      if (directionChanged) {
        fire = false;
        streak = 1;
      } else if (lastDir !== 0 && outDir === lastDir) {
        streak += 1;
      } else {
        streak = 1;
      }

      if (streak >= FIRE_STREAK_MIN) fire = true;
      lastDir = outDir;
      return { ...pt, onFire: fire };
    });
  }

  function buildSegments(pixelPath) {
    const segments = [];
    let momentum = MOMENTUM_START;
    let lastDir = 0;

    for (let i = 0; i < pixelPath.length - 1; i++) {
      const from = pixelPath[i];
      const to = pixelPath[i + 1];
      const outDir = bounceToDir(to.bounce);
      const directionChanged = outDir !== 0 && lastDir !== 0 && outDir !== lastDir;

      segments.push({
        from,
        to,
        momentum,
        directionChanged,
        isPeg: to.pegId !== undefined,
        isLanding: !to.bounce && to.pegId === undefined,
        depth: (i + 1) / (pixelPath.length - 1),
        onFireAfter: Boolean(to.onFire),
      });

      if (outDir !== 0) {
        if (directionChanged) {
          momentum = Math.max(MOMENTUM_MIN, momentum * MOMENTUM_LOSS_COLLISION);
        } else if (lastDir !== 0 && outDir === lastDir) {
          momentum = Math.min(MOMENTUM_MAX, momentum + MOMENTUM_GAIN_SAME);
        }
        lastDir = outDir;
      }
    }

    return segments;
  }

  function effectiveSpeed(momentum, isFire) {
    const boosted = isFire ? momentum * FIRE_SPEED_BONUS : momentum;
    return Math.min(SPEED_CAP, boosted);
  }

  function segmentDuration(seg) {
    const { from, to, momentum, directionChanged, depth, onFireAfter } = seg;
    const dy = Math.abs(to.y - from.y);
    const dx = Math.abs(to.x - from.x);
    const isFire = onFire || onFireAfter;
    const speed = effectiveSpeed(momentum, isFire);
    const depthBoost = 0.94 + depth * 0.18;

    let ms = ((dy * 3.9 + dx * 2.6) / speed) / depthBoost;

    if (directionChanged) ms *= 1.12;

    return Math.min(SEGMENT_MAX_MS, Math.max(SEGMENT_MIN_MS, ms));
  }

  function easeAccelerate(t) {
    return t * t;
  }

  function easeGravity(t) {
    return t * t * t;
  }

  function easeDecelerate(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function interpolate(from, to, raw, seg) {
    const { momentum, directionChanged, isPeg } = seg;
    let tX;
    let tY;

    if (isPeg) {
      tX = Math.min(1, easeAccelerate(raw) * 1.25);
      tY = easeGravity(raw);
    } else if (directionChanged) {
      const blend = easeDecelerate(raw) * 0.3 + easeGravity(raw) * 0.7;
      tX = blend;
      tY = easeGravity(raw) * 0.85 + easeDecelerate(raw) * 0.15;
    } else if (momentum >= 1.45 || onFire) {
      tX = easeAccelerate(raw) * 0.75 + raw * 0.25;
      tY = easeGravity(raw) * 0.9 + raw * 0.1;
    } else if (momentum >= 1.2) {
      tX = easeAccelerate(raw) * 0.85 + raw * 0.15;
      tY = easeGravity(raw);
    } else {
      tX = raw < 0.4 ? easeAccelerate(raw / 0.4) * 0.4 : 0.4 + easeGravity((raw - 0.4) / 0.6) * 0.6;
      tY = easeGravity(raw);
    }

    return {
      x: from.x + (to.x - from.x) * Math.min(1, tX),
      y: from.y + (to.y - from.y) * Math.min(1, tY),
    };
  }

  function updateBallLook(raw, seg) {
    if (onFire) return;
    if (seg.directionChanged && raw > 0.55) {
      setBallStyle('is-squash');
    } else if (seg.momentum >= 1.55) {
      setBallStyle('is-fast');
    } else if (seg.momentum >= 1.25) {
      setBallStyle('is-stretch');
    } else {
      setBallStyle(null);
    }
  }

  function animateSegment(seg) {
    return new Promise((resolve) => {
      const duration = segmentDuration(seg);
      const start = performance.now();

      function frame(now) {
        const raw = Math.min(1, (now - start) / duration);
        const pos = interpolate(seg.from, seg.to, raw, seg);
        setPosition(pos.x, pos.y);
        Board.tryHitPegAt(pos.x, pos.y);
        updateBallLook(raw, seg);

        if (raw < 1) {
          rafId = requestAnimationFrame(frame);
        } else {
          setPosition(seg.to.x, seg.to.y);
          resolve();
        }
      }

      rafId = requestAnimationFrame(frame);
    });
  }

  async function onPegArrival(seg) {
    if (!seg.isPeg) return;

    if (seg.directionChanged) {
      extinguishFire();
      setBallStyle('is-squash');
      Sounds.tokenLand();
      await sleep(22);
      setBallStyle(null);
    }

    if (seg.onFireAfter) {
      setFire(true);
    }
  }

  async function animatePath(pixelPath) {
    if (!pixelPath.length) return false;

    animating = true;
    onFire = false;
    Board.resetPegHits();
    hideFlameWrap();
    show();
    ballEl.classList.remove('is-on-fire', 'is-extinguishing');

    const path = enrichPathWithFire(pixelPath);
    const first = path[0];
    setPosition(first.x, first.y);
    Sounds.dropStart();

    const segments = buildSegments(path);

    for (const seg of segments) {
      await animateSegment(seg);
      await onPegArrival(seg);
    }

    if (!onFire) setBallStyle('is-squash');
    await sleep(70);
    animating = false;

    return onFire;
  }

  function isAnimating() {
    return animating;
  }

  function isOnFire() {
    return onFire;
  }

  return { animatePath, hide, show, isAnimating, isOnFire };
})();
