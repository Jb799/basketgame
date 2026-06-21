/**
 * sounds.js — Sons Web Audio spécifiques Siège Zombie.
 */

window.SiegeSounds = (function () {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type, gain, when) {
    const ac = getCtx();
    if (!ac) return;
    const t = when ?? ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain ?? 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function noise(duration, gain) {
    const ac = getCtx();
    if (!ac) return;
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buffer;
    const g = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    g.gain.setValueAtTime(gain ?? 0.06, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start();
  }

  return {
    spawn() {
      tone(80, 0.25, 'sawtooth', 0.06);
      tone(55, 0.35, 'square', 0.04, getCtx()?.currentTime + 0.05);
    },
    throwProjectile() {
      tone(400, 0.08, 'sine', 0.05);
      tone(200, 0.15, 'triangle', 0.04, getCtx()?.currentTime + 0.04);
    },
    impact() {
      noise(0.12, 0.1);
      tone(120, 0.2, 'square', 0.07);
    },
    scorePop() {
      tone(880, 0.08, 'sine', 0.05);
      tone(1100, 0.1, 'sine', 0.04, getCtx()?.currentTime + 0.06);
    },
    breach() {
      const ac = getCtx();
      if (!ac) return;
      const t = ac.currentTime;
      for (let i = 0; i < 4; i++) {
        tone(600 - i * 80, 0.15, 'sawtooth', 0.07, t + i * 0.12);
      }
      noise(0.3, 0.08);
    },
    waveStart() {
      const ac = getCtx();
      if (!ac) return;
      const t = ac.currentTime;
      [440, 554, 659, 880].forEach((f, i) => tone(f, 0.2, 'square', 0.05, t + i * 0.1));
    },
    gameOver() {
      const ac = getCtx();
      if (!ac) return;
      const t = ac.currentTime;
      [400, 350, 300, 220].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.06, t + i * 0.2));
    },
    miss() {
      if (window.Sounds?.error) Sounds.error();
    },
    fallMiss() {
      tone(90, 0.15, 'sine', 0.04);
      tone(60, 0.2, 'triangle', 0.03);
    },
  };
})();
