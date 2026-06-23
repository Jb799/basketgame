/**
 * effects.js — Effets visuels : confettis canvas, particules de fond, sons Web Audio
 * Chargé en premier pour être disponible aux autres modules.
 */

/* ═══════════════════════════════════════════════════════════════
   1. PARTICULES DE FOND (canvas bg-canvas)
   ═══════════════════════════════════════════════════════════════ */

(function initBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let particles = [];
  const PARTICLE_COUNT = 60;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticle() {
    const colors = ['#ff6b00', '#ff8533', '#22d3ee', '#67e8f9', '#1a1a1a'];
    return {
      x: Math.random() * canvas.width,
      y: canvas.height + 10,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.8 + 0.3,
      opacity: Math.random() * 0.5 + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
      drift: (Math.random() - 0.5) * 0.5,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    };
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = createParticle();
      p.y = Math.random() * canvas.height; // Dispersion initiale
      particles.push(p);
    }
  }

  function animateBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Gradient de fond radial subtil
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.7
    );
    grad.addColorStop(0, 'rgba(255, 107, 0, 0.08)');
    grad.addColorStop(1, 'rgba(10, 10, 10, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, i) => {
      p.y -= p.speed;
      p.x += p.drift;
      p.rotation += p.rotationSpeed;

      if (p.y < -20) {
        particles[i] = createParticle();
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    });

    requestAnimationFrame(animateBackground);
  }

  resize();
  initParticles();
  animateBackground();
  window.addEventListener('resize', () => { resize(); initParticles(); });
})();


/* ═══════════════════════════════════════════════════════════════
   2. CONFETTIS (canvas confetti-canvas dans l'overlay victoire)
   ═══════════════════════════════════════════════════════════════ */

window.Confetti = (function () {
  let canvas, ctx, confettiParticles = [], animFrame;

  const COLORS = [
    '#ff6b00', '#ff8533', '#22d3ee', '#67e8f9',
    '#e55d00', '#0891b2', '#1a1a1a', '#f5f5f5',
    '#ff9500', '#06b6d4',
  ];

  function create(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function makeParticle() {
    return {
      x: canvas.width * 0.5 + (Math.random() - 0.5) * canvas.width * 0.4,
      y: canvas.height * 0.3,
      w: Math.random() * 12 + 6,
      h: Math.random() * 6 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -18 - 5,
      vr: (Math.random() - 0.5) * 0.4,
      gravity: 0.45,
      opacity: 1,
      spin: Math.random() < 0.5 ? 1 : -1,
    };
  }

  function burst(count = 120) {
    confettiParticles = [];
    for (let i = 0; i < count; i++) {
      confettiParticles.push(makeParticle());
    }
    animate();
  }

  function animate() {
    if (animFrame) cancelAnimationFrame(animFrame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    confettiParticles = confettiParticles.filter(p => p.opacity > 0.01);

    confettiParticles.forEach(p => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.vr * p.spin;
      p.opacity -= 0.007;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (confettiParticles.length > 0) {
      animFrame = requestAnimationFrame(animate);
    }
  }

  function stop() {
    if (animFrame) cancelAnimationFrame(animFrame);
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles = [];
  }

  return { create, burst, stop };
})();


/* ═══════════════════════════════════════════════════════════════
   3. SONS — Samples via SoundEngine (voir docs/SOUNDS.md)
   ═══════════════════════════════════════════════════════════════ */

window.Sounds = (function () {
  const SE = () => window.SoundEngine;

  function play(id, opts) {
    const engine = SE();
    if (!engine) return;
    engine.playSync(id, opts);
  }

  function tokenDrop() {
    play('ballTap');
  }

  function tokenLand() {
    play('smallHit');
  }

  function changeTurn() {
    play('click');
  }

  /** Victoire de manche (court) — utiliser roundWin pour la série / podium. */
  function roundWin() {
    play('achievement');
  }

  /** Victoire finale, podium, gagnant de série (~4 s). */
  function victory() {
    play('piglevelwin');
  }

  function draw() {
    play('achievement', { volume: 0.4 });
  }

  function error() {
    play('smallHit', { playbackRate: 0.75, volume: 0.9 });
  }

  function reset() {
    play('click');
  }

  function dropStart() {
    play('swoosh');
  }

  function coinWin(amount) {
    const steps = Math.min(5, Math.max(1, Math.ceil((amount || 1) / 10)));
    for (let i = 0; i < steps; i++) {
      setTimeout(() => play('coin', { volume: 0.85 + i * 0.03 }), i * 70);
    }
  }

  function bombHit(size) {
    const vol = size === 'large' ? 1.1 : size === 'medium' ? 1.0 : 0.9;
    play('bomb', { volume: vol });
  }

  function multiplierX2() {
    play('boostRecharge');
  }

  function scorePop() {
    play('achievement');
  }

  function scoreImpactGain() {
    play('boostRecharge');
  }

  function scoreImpactLoss() {
    play('smallHit', { playbackRate: 0.75, volume: 0.95 });
  }

  function meleeHit() {
    play('meleeHit');
  }

  function gameOver() {
    play('gameover');
  }

  function levelComplete() {
    play('levelComplete');
  }

  function throwProjectile() {
    play('swoosh');
  }

  function spawn() {
    play('swoosh', { playbackRate: 0.7 });
  }

  function breach() {
    play('bomb', { volume: 1.05 });
  }

  function miss() {
    error();
  }

  function fallMiss() {
    play('ballTap', { volume: 0.7 });
  }

  function thiefSwoosh() {
    play('swoosh', { volume: 0.85 });
  }

  return {
    tokenDrop, tokenLand, changeTurn, roundWin, victory, draw, error, reset, dropStart,
    coinWin, bombHit, multiplierX2, scorePop, scoreImpactGain, scoreImpactLoss,
    meleeHit, gameOver, levelComplete, throwProjectile, spawn, breach, miss, fallMiss,
    thiefSwoosh,
  };
})();
