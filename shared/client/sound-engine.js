/**
 * sound-engine.js — Moteur audio partagé (samples + manifest).
 * Expose window.SoundEngine ; chargé avant effects.js.
 */

window.SoundEngine = (function () {
  const MANIFEST_URL = '/shared/sounds/sounds-manifest.json';

  let manifest = null;
  let audioCtx = null;
  const buffers = new Map();
  const lastPlayed = new Map();
  const activeCounts = new Map();
  let loadPromise = null;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function resolveBasePath() {
    if (!manifest) return '/shared/sounds/';
    const base = manifest.basePath || '/shared/sounds/';
    return base.endsWith('/') ? base : `${base}/`;
  }

  function getSample(id) {
    return manifest?.samples?.[id] || null;
  }

  async function loadManifest() {
    if (manifest) return manifest;
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`Manifest introuvable: ${MANIFEST_URL}`);
    manifest = await res.json();
    return manifest;
  }

  async function loadBuffer(file) {
    if (buffers.has(file)) return buffers.get(file);
    const url = `${resolveBasePath()}${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Son introuvable: ${url}`);
    const data = await res.arrayBuffer();
    const ctx = getCtx();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    buffers.set(file, buffer);
    return buffer;
  }

  async function preload(ids) {
    await loadManifest();
    const files = new Set();
    for (const id of ids) {
      const sample = getSample(id);
      if (sample?.file) files.add(sample.file);
    }
    await Promise.all([...files].map((file) => loadBuffer(file).catch(() => null)));
  }

  async function preloadAll() {
    await loadManifest();
    const files = Object.values(manifest.samples || {})
      .map((s) => s.file)
      .filter(Boolean);
    await Promise.all([...new Set(files)].map((file) => loadBuffer(file).catch(() => null)));
  }

  function canPlay(id, sample) {
    const now = Date.now();
    const debounce = sample.debounceMs ?? 0;
    if (debounce > 0) {
      const last = lastPlayed.get(id) || 0;
      if (now - last < debounce) return false;
    }
    const maxPoly = sample.maxPolyphony ?? 8;
    const active = activeCounts.get(id) || 0;
    if (active >= maxPoly) return false;
    return true;
  }

  /**
   * @param {string} id — clé dans sounds-manifest.json (samples)
   * @param {{ volume?: number, playbackRate?: number, delay?: number }} opts
   */
  async function play(id, opts = {}) {
    try {
      await loadManifest();
      const sample = getSample(id);
      if (!sample) return;

      if (!canPlay(id, sample)) return;

      const buffer = await loadBuffer(sample.file);
      if (!buffer) return;

      const ctx = getCtx();
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();

      source.buffer = buffer;
      source.playbackRate.value = opts.playbackRate ?? sample.playbackRate ?? 1;

      const master = manifest.masterGain ?? 1;
      const vol = (opts.volume ?? 1) * (sample.gain ?? 1) * master;
      const when = ctx.currentTime + (opts.delay ?? 0);

      gainNode.gain.setValueAtTime(vol, when);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      lastPlayed.set(id, Date.now());
      activeCounts.set(id, (activeCounts.get(id) || 0) + 1);

      source.onended = () => {
        const n = (activeCounts.get(id) || 1) - 1;
        if (n <= 0) activeCounts.delete(id);
        else activeCounts.set(id, n);
      };

      source.start(when);
    } catch {
      // Audio indisponible ou fichier manquant — silencieux
    }
  }

  function playSync(id, opts) {
    play(id, opts).catch(() => {});
  }

  return {
    play,
    playSync,
    preload,
    preloadAll,
    getCtx,
    loadManifest,
  };
})();

// Préchargement en arrière-plan après première interaction.
(function bindUnlock() {
  const unlock = () => {
    try {
      window.SoundEngine.getCtx();
      window.SoundEngine.preloadAll().catch(() => {});
    } catch { /* ignore */ }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
})();
