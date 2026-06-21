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
   3. SONS — Web Audio API (synthèse, pas de fichiers)
   ═══════════════════════════════════════════════════════════════ */

window.Sounds = (function () {
  let audioCtx = null;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Reprendre si suspendu (politique autoplay navigateur)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone({ frequency = 440, type = 'sine', duration = 0.15, volume = 0.3, detune = 0, fadeOut = true } = {}) {
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      osc.detune.setValueAtTime(detune, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);

      if (fadeOut) {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      }

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Silently fail si audio non disponible
    }
  }

  function tokenDrop(player) {
    // Son de chute : fréquence grave qui monte légèrement
    const freq = player === 1 ? 180 : 220;
    playTone({ frequency: freq, type: 'sine', duration: 0.2, volume: 0.25 });
    setTimeout(() => playTone({ frequency: freq * 1.5, type: 'triangle', duration: 0.1, volume: 0.1 }), 180);
  }

  function tokenLand() {
    // Clonk de jeton qui tombe
    playTone({ frequency: 120, type: 'square', duration: 0.08, volume: 0.2 });
  }

  function changeTurn() {
    // Petit bip de changement de tour
    playTone({ frequency: 660, type: 'sine', duration: 0.1, volume: 0.15 });
  }

  function victory(player) {
    // Fanfare de victoire
    const notes = player === 1
      ? [523, 659, 784, 1047]
      : [587, 740, 880, 1175];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone({ frequency: freq, type: 'sine', duration: 0.3, volume: 0.25 }), i * 120);
    });
    // Accord final
    setTimeout(() => {
      notes.forEach(freq => playTone({ frequency: freq, type: 'sine', duration: 0.5, volume: 0.15 }));
    }, 520);
  }

  function draw() {
    // Son de match nul — descendant
    [440, 392, 349, 294].forEach((freq, i) => {
      setTimeout(() => playTone({ frequency: freq, type: 'triangle', duration: 0.2, volume: 0.2 }), i * 100);
    });
  }

  function error() {
    playTone({ frequency: 200, type: 'sawtooth', duration: 0.2, volume: 0.3 });
  }

  function reset() {
    playTone({ frequency: 440, type: 'sine', duration: 0.15, volume: 0.2 });
    setTimeout(() => playTone({ frequency: 880, type: 'sine', duration: 0.15, volume: 0.15 }), 150);
  }

  function dropStart() {
    playTone({ frequency: 300, type: 'sine', duration: 0.18, volume: 0.22 });
  }

  function coinWin(amount) {
    const steps = Math.min(5, Math.max(1, Math.ceil(amount / 10)));
    for (let i = 0; i < steps; i++) {
      setTimeout(() => playTone({ frequency: 520 + i * 80, type: 'sine', duration: 0.12, volume: 0.2 }), i * 70);
    }
  }

  function bombHit(size) {
    const base = size === 'large' ? 90 : size === 'medium' ? 110 : 130;
    playTone({ frequency: base, type: 'sawtooth', duration: 0.35, volume: 0.35 });
    setTimeout(() => playTone({ frequency: base * 0.6, type: 'square', duration: 0.25, volume: 0.2 }), 120);
  }

  function multiplierX2() {
    playTone({ frequency: 330, type: 'sine', duration: 0.12, volume: 0.32 });
    setTimeout(() => playTone({ frequency: 495, type: 'sine', duration: 0.12, volume: 0.3 }), 90);
    setTimeout(() => playTone({ frequency: 660, type: 'square', duration: 0.18, volume: 0.28 }), 180);
    setTimeout(() => playTone({ frequency: 880, type: 'sine', duration: 0.22, volume: 0.26 }), 280);
  }

  function scorePop() {
    playTone({ frequency: 520, type: 'sine', duration: 0.1, volume: 0.28 });
    setTimeout(() => playTone({ frequency: 780, type: 'sine', duration: 0.08, volume: 0.22 }), 60);
  }

  function scoreImpactGain() {
    playTone({ frequency: 880, type: 'sine', duration: 0.14, volume: 0.3 });
    setTimeout(() => playTone({ frequency: 1175, type: 'sine', duration: 0.12, volume: 0.24 }), 80);
  }

  function scoreImpactLoss() {
    playTone({ frequency: 180, type: 'sawtooth', duration: 0.2, volume: 0.32 });
    setTimeout(() => playTone({ frequency: 120, type: 'square', duration: 0.18, volume: 0.22 }), 100);
  }

  return {
    tokenDrop, tokenLand, changeTurn, victory, draw, error, reset, dropStart,
    coinWin, bombHit, multiplierX2, scorePop, scoreImpactGain, scoreImpactLoss,
  };
})();
