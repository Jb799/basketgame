/**
 * camera-capture.js — Capture d'une photo carrée via la webcam, avec effets.
 *
 * Expose window.CameraCapture.open(options) → Promise<Blob|null>.
 * Ouvre un modal plein écran avec un viewport carré (1:1) rendu sur un canvas,
 * un bouton de capture, puis un aperçu avec « Reprendre » / « Valider ».
 * La photo est recadrée au centre en carré et exportée en JPEG (512×512).
 *
 * Effets disponibles (style Snapchat) :
 *   - Filtres couleur (N&B, sépia, chaud, froid, vif, vintage) — sans dépendance.
 *   - Fonds (flou, couleurs, dégradés) — segmentation MediaPipe SelfieSegmentation.
 *   - Lentilles visage (lunettes, couronne, chien, chat…) — accessoires vectoriels
 *     dessinés et calés sur un suivi de visage robuste via Jeeliz FaceFilter
 *     (position, échelle, rotation de la tête, ouverture de la bouche).
 *
 * Les libs (MediaPipe + Jeeliz) sont chargées paresseusement depuis un CDN,
 * uniquement quand un fond ou une lentille est sélectionné. Les filtres couleur
 * restent disponibles hors-ligne.
 *
 * Résout avec un Blob JPEG, ou null si l'utilisateur annule.
 *
 * Prérequis navigateur : getUserMedia exige un contexte sécurisé (HTTPS) ou
 * localhost. En accès réseau local par IP, le navigateur peut bloquer la caméra.
 */

window.CameraCapture = (function () {
  const OUTPUT_SIZE = 512;
  const PROC_SIZE = 512;
  const JPEG_QUALITY = 0.85;

  const SEG_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';
  const JEE_LIB = 'https://appstatic.jeeliz.com/faceFilter/jeelizFaceFilter.js';
  const JEE_NN = 'https://appstatic.jeeliz.com/faceFilter/'; // dossier contenant NN_DEFAULT.json

  // --- Catalogues d'effets -------------------------------------------------

  const FILTERS = [
    { id: 'none', label: 'Aucun', css: '' },
    { id: 'bw', label: 'N&B', css: 'grayscale(1) contrast(1.05)' },
    { id: 'sepia', label: 'Sépia', css: 'sepia(0.7)' },
    { id: 'warm', label: 'Chaud', css: 'sepia(0.4) saturate(1.5) hue-rotate(-12deg)' },
    { id: 'cool', label: 'Froid', css: 'saturate(1.15) brightness(1.05) contrast(1.05) hue-rotate(-18deg)' },
    { id: 'vivid', label: 'Vif', css: 'saturate(1.7) contrast(1.12)' },
    { id: 'vintage', label: 'Vintage', css: 'sepia(0.45) contrast(1.1) brightness(0.95) saturate(1.3)' },
  ];

  const BACKGROUNDS = [
    { id: 'none', label: 'Aucun', type: 'none' },
    { id: 'blur', label: 'Flou', type: 'blur', swatch: 'blur' },
    { id: 'orange', label: '', type: 'color', value: '#ff7a18', swatch: '#ff7a18' },
    { id: 'court', label: '', type: 'color', gradient: ['#ff9a00', '#ff3d00'], swatch: 'linear-gradient(160deg,#ff9a00,#ff3d00)' },
    { id: 'blue', label: '', type: 'color', value: '#1e90ff', swatch: '#1e90ff' },
    { id: 'green', label: '', type: 'color', value: '#22c55e', swatch: '#22c55e' },
    { id: 'pink', label: '', type: 'color', value: '#ec4899', swatch: '#ec4899' },
    { id: 'purple', label: '', type: 'color', gradient: ['#8b5cf6', '#3b0764'], swatch: 'linear-gradient(160deg,#8b5cf6,#3b0764)' },
    { id: 'dark', label: '', type: 'color', value: '#111111', swatch: '#111111' },
  ];

  // L'icône (emoji) sert uniquement de vignette dans le sélecteur ; la lentille
  // réellement appliquée sur le visage est un dessin vectoriel (cf. LENS_RENDER).
  const LENSES = [
    { id: 'none', label: 'Aucun', icon: '🚫' },
    { id: 'sunglasses', label: 'Soleil', icon: '🕶️' },
    { id: 'glasses', label: 'Lunettes', icon: '👓' },
    { id: 'crown', label: 'Couronne', icon: '👑' },
    { id: 'party', label: 'Fête', icon: '🥳' },
    { id: 'mustache', label: 'Moustache', icon: '👨' },
    { id: 'dog', label: 'Chien', icon: '🐶' },
    { id: 'cat', label: 'Chat', icon: '🐱' },
    { id: 'hearts', label: 'Amoureux', icon: '😍' },
  ];

  // --- Helpers de dessin vectoriel (purs) ----------------------------------

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function heart(ctx, cx, cy, s) {
    const t = s * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, t * 0.3);
    ctx.bezierCurveTo(0, -t * 0.35, -t, -t * 0.35, -t, t * 0.2);
    ctx.bezierCurveTo(-t, t * 0.6, 0, t * 0.9, 0, t * 1.1);
    ctx.bezierCurveTo(0, t * 0.9, t, t * 0.6, t, t * 0.2);
    ctx.bezierCurveTo(t, -t * 0.35, 0, -t * 0.35, 0, t * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Rendu des lentilles. Le contexte est déjà translaté au centre du visage et
   * tourné selon le roll de la tête. `w` ≈ largeur du visage (px). Repère local :
   * x → droite du visage, y → bas (front ≈ -0.5·w, menton ≈ +0.5·w, yeux ≈ -0.14·w).
   */
  const LENS_RENDER = {
    sunglasses(ctx, w) {
      const eyeY = -0.17 * w;
      const lensW = 0.34 * w;
      const lensH = 0.24 * w;
      const off = 0.23 * w;
      const r = 0.1 * w;
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 0.03 * w;
      ctx.beginPath();
      ctx.moveTo(-off - lensW / 2, eyeY);
      ctx.lineTo(-0.52 * w, eyeY - 0.05 * w);
      ctx.moveTo(off + lensW / 2, eyeY);
      ctx.lineTo(0.52 * w, eyeY - 0.05 * w);
      ctx.moveTo(-off + lensW / 2 - 0.02 * w, eyeY);
      ctx.lineTo(off - lensW / 2 + 0.02 * w, eyeY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(14,18,28,0.92)';
      [-off, off].forEach((c) => {
        roundRect(ctx, c - lensW / 2, eyeY - lensH / 2, lensW, lensH, r);
        ctx.fill();
        ctx.stroke();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      [-off, off].forEach((c) => {
        roundRect(ctx, c - lensW / 2 + 0.04 * w, eyeY - lensH / 2 + 0.04 * w, lensW * 0.38, lensH * 0.3, r * 0.5);
        ctx.fill();
      });
    },

    glasses(ctx, w) {
      const eyeY = -0.17 * w;
      const rad = 0.16 * w;
      const off = 0.23 * w;
      ctx.strokeStyle = '#23262e';
      ctx.lineWidth = 0.035 * w;
      ctx.beginPath();
      ctx.arc(-off, eyeY, rad, 0, Math.PI * 2);
      ctx.arc(off, eyeY, rad, 0, Math.PI * 2);
      ctx.moveTo(-off + rad, eyeY);
      ctx.lineTo(off - rad, eyeY);
      ctx.moveTo(-off - rad, eyeY);
      ctx.lineTo(-0.52 * w, eyeY - 0.05 * w);
      ctx.moveTo(off + rad, eyeY);
      ctx.lineTo(0.52 * w, eyeY - 0.05 * w);
      ctx.stroke();
      ctx.fillStyle = 'rgba(180,210,255,0.12)';
      [-off, off].forEach((c) => {
        ctx.beginPath();
        ctx.arc(c, eyeY, rad - 0.02 * w, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    crown(ctx, w) {
      const baseY = -0.62 * w;
      const h = 0.3 * w;
      const hw = 0.4 * w;
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#e0a400';
      ctx.lineWidth = 0.02 * w;
      ctx.beginPath();
      ctx.moveTo(-hw, baseY);
      ctx.lineTo(-hw, baseY - h * 0.45);
      ctx.lineTo(-hw * 0.5, baseY - h * 0.15);
      ctx.lineTo(0, baseY - h);
      ctx.lineTo(hw * 0.5, baseY - h * 0.15);
      ctx.lineTo(hw, baseY - h * 0.45);
      ctx.lineTo(hw, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff3d6e';
      [-hw * 0.5, 0, hw * 0.5].forEach((jx) => {
        ctx.beginPath();
        ctx.arc(jx, baseY - h * 0.12, 0.03 * w, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    party(ctx, w) {
      const baseY = -0.6 * w;
      const apexY = baseY - 0.6 * w;
      const hw = 0.3 * w;
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath();
      ctx.moveTo(0, apexY);
      ctx.lineTo(-hw, baseY);
      ctx.lineTo(hw, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.03 * w;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        ctx.beginPath();
        ctx.moveTo(-hw * t, baseY - 0.6 * w * t);
        ctx.lineTo(hw * t * 0.6, baseY - 0.6 * w * t + 0.05 * w);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffe34d';
      ctx.beginPath();
      ctx.arc(0, apexY, 0.055 * w, 0, Math.PI * 2);
      ctx.fill();
    },

    mustache(ctx, w) {
      const y = 0.15 * w;
      const hw = 0.28 * w;
      ctx.fillStyle = '#2a1a0f';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(-0.1 * w, y - 0.06 * w, -0.22 * w, y - 0.05 * w, -hw, y + 0.02 * w);
      ctx.bezierCurveTo(-0.22 * w, y + 0.1 * w, -0.08 * w, y + 0.06 * w, 0, y + 0.04 * w);
      ctx.bezierCurveTo(0.08 * w, y + 0.06 * w, 0.22 * w, y + 0.1 * w, hw, y + 0.02 * w);
      ctx.bezierCurveTo(0.22 * w, y - 0.05 * w, 0.1 * w, y - 0.06 * w, 0, y);
      ctx.closePath();
      ctx.fill();
    },

    dog(ctx, w, mouth) {
      const earO = 0.44 * w;
      const earY = -0.52 * w;
      [-1, 1].forEach((side) => {
        ctx.save();
        ctx.translate(side * earO, earY);
        ctx.rotate(side * 0.3);
        ctx.fillStyle = '#7a4a22';
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.13 * w, 0.3 * w, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#caa07a';
        ctx.beginPath();
        ctx.ellipse(0, 0.05 * w, 0.07 * w, 0.18 * w, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(0, 0.02 * w, 0.1 * w, 0.075 * w, 0, 0, Math.PI * 2);
      ctx.fill();
      if (mouth > 0.28) {
        const len = 0.16 * w + 0.16 * w * Math.min(1, mouth);
        ctx.fillStyle = '#ff5a7a';
        roundRect(ctx, -0.07 * w, 0.16 * w, 0.14 * w, len, 0.06 * w);
        ctx.fill();
        ctx.strokeStyle = '#e23a5a';
        ctx.lineWidth = 0.012 * w;
        ctx.beginPath();
        ctx.moveTo(0, 0.18 * w);
        ctx.lineTo(0, 0.16 * w + len);
        ctx.stroke();
      }
    },

    cat(ctx, w) {
      [-1, 1].forEach((side) => {
        const bx = side * 0.3 * w;
        ctx.fillStyle = '#5a5a5a';
        ctx.beginPath();
        ctx.moveTo(bx - 0.12 * w, -0.54 * w);
        ctx.lineTo(bx + 0.12 * w, -0.54 * w);
        ctx.lineTo(bx, -0.8 * w);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff9bb3';
        ctx.beginPath();
        ctx.moveTo(bx - 0.05 * w, -0.56 * w);
        ctx.lineTo(bx + 0.05 * w, -0.56 * w);
        ctx.lineTo(bx, -0.72 * w);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = '#ff9bb3';
      ctx.beginPath();
      ctx.moveTo(-0.04 * w, 0);
      ctx.lineTo(0.04 * w, 0);
      ctx.lineTo(0, 0.05 * w);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.012 * w;
      [-1, 1].forEach((side) => {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(side * 0.06 * w, 0.05 * w + i * 0.03 * w);
          ctx.lineTo(side * 0.34 * w, 0.02 * w + i * 0.07 * w);
          ctx.stroke();
        }
      });
    },

    hearts(ctx, w) {
      ctx.fillStyle = '#ff3d6e';
      heart(ctx, -0.23 * w, -0.17 * w, 0.2 * w);
      heart(ctx, 0.23 * w, -0.17 * w, 0.2 * w);
    },
  };

  // --- État partagé (caché entre ouvertures) -------------------------------

  let seg = null;
  let segPromise = null;
  let jeelizScriptPromise = null;
  let jeelizDestroyChain = Promise.resolve();

  let stream = null;
  let overlay = null;

  // --- Chargement paresseux des scripts ------------------------------------

  const scriptCache = {};
  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Échec du chargement : ' + src));
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  function ensureSegmentation() {
    if (segPromise) return segPromise;
    segPromise = loadScript(`${SEG_BASE}/selfie_segmentation.js`).then(() => {
      seg = new SelfieSegmentation({ locateFile: (f) => `${SEG_BASE}/${f}` });
      seg.setOptions({ modelSelection: 1, selfieMode: false });
      return seg;
    });
    return segPromise;
  }

  function loadJeeliz() {
    if (!jeelizScriptPromise) jeelizScriptPromise = loadScript(JEE_LIB);
    return jeelizScriptPromise;
  }

  // --- Helpers de cadrage --------------------------------------------------

  function srcDims(src) {
    return { w: src.videoWidth || src.width || 0, h: src.videoHeight || src.height || 0 };
  }

  function drawCropped(ctx, src, size) {
    const { w, h } = srcDims(src);
    if (!w || !h) return;
    const side = Math.min(w, h);
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;
    ctx.drawImage(src, sx, sy, side, side, 0, 0, size, size);
  }

  function buildOverlay(title, hint) {
    const el = document.createElement('div');
    el.className = 'camera-modal';
    el.innerHTML = `
      <div class="camera-modal__panel" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="camera-modal__header">
          <div>
            <h2 class="camera-modal__title">${title}</h2>
            <p class="camera-modal__hint">${hint}</p>
          </div>
          <button type="button" class="camera-modal__close" data-act="cancel" aria-label="Fermer">✕</button>
        </header>
        <div class="camera-modal__stage">
          <video class="camera-modal__video" playsinline autoplay muted hidden></video>
          <canvas class="camera-modal__jee" aria-hidden="true"></canvas>
          <canvas class="camera-modal__live"></canvas>
          <canvas class="camera-modal__preview" hidden></canvas>
          <div class="camera-modal__frame" aria-hidden="true"></div>
          <div class="camera-modal__badge" hidden>⏳ Chargement des effets…</div>
          <p class="camera-modal__error" hidden></p>
        </div>
        <div class="camera-fx">
          <div class="camera-fx__tabs" role="tablist">
            <button type="button" class="camera-fx__tab is-active" data-fxtab="filter">🎨 Filtre</button>
            <button type="button" class="camera-fx__tab" data-fxtab="bg">🖼️ Fond</button>
            <button type="button" class="camera-fx__tab" data-fxtab="lens">😎 Lentille</button>
          </div>
          <div class="camera-fx__options" data-fxoptions></div>
        </div>
        <div class="camera-modal__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">Annuler</button>
          <button type="button" class="btn btn--primary" data-act="shoot">Capturer</button>
          <button type="button" class="btn btn--ghost" data-act="retake" hidden>Reprendre</button>
          <button type="button" class="btn btn--primary" data-act="accept" hidden>Valider</button>
        </div>
      </div>
    `;
    return el;
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  function destroy() {
    stopStream();
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.body.classList.remove('camera-open');
  }

  /**
   * @param {object} [options]
   * @param {string} [options.title]
   * @param {string} [options.hint]
   * @param {boolean} [options.withCutout] - Génère aussi un PNG détouré (fond
   *   transparent) de la personne. Change la valeur de résolution.
   * @returns {Promise<Blob|null>} si !withCutout — JPEG (ou null si annulé).
   * @returns {Promise<{photo: Blob, cutout: Blob|null}|null>} si withCutout.
   */
  function open(options = {}) {
    const title = options.title || 'Prendre une photo';
    const hint = options.hint || 'Cadrez votre visage dans le carré';

    return new Promise((resolve) => {
      overlay = buildOverlay(title, hint);
      document.body.appendChild(overlay);
      document.body.classList.add('camera-open');

      const video = overlay.querySelector('.camera-modal__video');
      const live = overlay.querySelector('.camera-modal__live');
      const jee = overlay.querySelector('.camera-modal__jee');
      const preview = overlay.querySelector('.camera-modal__preview');
      const errorEl = overlay.querySelector('.camera-modal__error');
      const badge = overlay.querySelector('.camera-modal__badge');
      const optionsEl = overlay.querySelector('[data-fxoptions]');
      const btnShoot = overlay.querySelector('[data-act="shoot"]');
      const btnRetake = overlay.querySelector('[data-act="retake"]');
      const btnAccept = overlay.querySelector('[data-act="accept"]');

      live.width = PROC_SIZE;
      live.height = PROC_SIZE;
      const frameCtx = live.getContext('2d');

      const jeeId = 'jee-' + Math.random().toString(36).slice(2);
      jee.id = jeeId;
      jee.width = PROC_SIZE;
      jee.height = PROC_SIZE;

      // Sélections courantes.
      let filter = FILTERS[0];
      let bg = BACKGROUNDS[0];
      let lens = LENSES[0];
      let activeTab = 'filter';

      // Données de suivi.
      let lastSeg = null;
      let lastDetect = null;

      // Jeeliz (suivi du visage) — singleton global, géré par ouverture.
      let jeelizInitPromise = null;
      let jeelizReady = false;

      let running = false;
      let raf = 0;
      let segBusy = false;
      let captured = null;
      let cutoutPromise = null; // Promise<Blob|null> du PNG détouré (si withCutout)

      function finish(blob) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        if (jeelizInitPromise) {
          jeelizReady = false;
          jeelizDestroyChain = jeelizInitPromise
            .then(() => {
              try {
                return window.JEELIZFACEFILTER && JEELIZFACEFILTER.destroy();
              } catch (e) {
                /* ignore */
              }
            })
            .catch(() => {});
        }
        destroy();
        resolve(blob);
      }

      function showError(message) {
        errorEl.textContent = message;
        errorEl.hidden = false;
        btnShoot.disabled = true;
      }

      function refreshBadge() {
        const loadingSeg = bg.type !== 'none' && !seg;
        const loadingLens = lens.id !== 'none' && !jeelizReady;
        badge.hidden = !(loadingSeg || loadingLens);
      }

      function applyColorFilter() {
        live.style.filter = filter.css || 'none';
      }

      // --- Jeeliz : initialisation paresseuse ------------------------------

      function initJeeliz() {
        if (jeelizInitPromise) return;
        jeelizInitPromise = loadJeeliz()
          .then(() => jeelizDestroyChain) // attendre un éventuel destroy d'une ouverture précédente
          .then(
            () =>
              new Promise((res) => {
                if (!overlay) {
                  res(true);
                  return;
                }
                JEELIZFACEFILTER.init({
                  canvasId: jeeId,
                  NNCPath: JEE_NN,
                  followZRot: true,
                  videoSettings: { videoElement: video },
                  callbackReady: (err) => {
                    if (!err) {
                      jeelizReady = true;
                      refreshBadge();
                    }
                    res(err);
                  },
                  callbackTrack: (d) => {
                    lastDetect = d;
                  },
                });
              })
          )
          .catch(() => {});
      }

      // --- Construction d'une frame ----------------------------------------

      function paintBackground(ctx, size) {
        if (bg.type === 'blur') {
          ctx.filter = 'blur(14px)';
          drawCropped(ctx, lastSeg.image, size);
          ctx.filter = 'none';
        } else if (bg.type === 'color') {
          if (bg.gradient) {
            const g = ctx.createLinearGradient(0, 0, 0, size);
            g.addColorStop(0, bg.gradient[0]);
            g.addColorStop(1, bg.gradient[1]);
            ctx.fillStyle = g;
          } else {
            ctx.fillStyle = bg.value;
          }
          ctx.fillRect(0, 0, size, size);
        }
      }

      function drawLens(ctx, size, d) {
        const cx = (0.5 + 0.5 * d.x) * size;
        const cy = (0.5 - 0.5 * d.y) * size; // y Jeeliz : bas → haut, on inverse
        const w = d.s * size;
        if (!w || !isFinite(w)) return;
        const rot = -d.rz;
        const mouth = (d.expressions && d.expressions[0]) || 0;
        const render = LENS_RENDER[lens.id];
        if (!render) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        render(ctx, w, mouth);
        ctx.restore();
      }

      function buildFrame(size) {
        const ctx = frameCtx;
        ctx.save();
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, size, size);

        if (bg.type === 'none' || !lastSeg) {
          drawCropped(ctx, video, size);
        } else {
          drawCropped(ctx, lastSeg.segmentationMask, size);
          ctx.globalCompositeOperation = 'source-in';
          drawCropped(ctx, lastSeg.image, size);
          ctx.globalCompositeOperation = 'destination-over';
          paintBackground(ctx, size);
          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
        }
        ctx.restore();

        if (lens.id !== 'none' && lastDetect && lastDetect.detected > 0.6) {
          drawLens(ctx, size, lastDetect);
        }
      }

      // --- Boucle de rendu -------------------------------------------------

      async function loop() {
        if (!running) return;
        const ready = video.readyState >= 2;
        if (ready) {
          if (bg.type !== 'none' && seg && !segBusy) {
            segBusy = true;
            try {
              await seg.send({ image: video });
            } catch (e) {
              /* ignore */
            }
            segBusy = false;
          }
          buildFrame(PROC_SIZE);
        }
        raf = requestAnimationFrame(loop);
      }

      // MediaPipe pousse ses résultats via onResults. L'instance est mise en
      // cache entre ouvertures : on (re)branche le callback sur CETTE ouverture.
      function wireSeg() {
        if (seg) seg.onResults((r) => { lastSeg = r; });
      }

      // --- Tête détourée (PNG transparent) ---------------------------------

      function canvasToBlob(canvas, type, quality) {
        return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
      }

      // Frame brute figée (carré centré, sans miroir, sans effet) servant
      // d'entrée à la segmentation pour le détourage.
      function rawFrameCanvas() {
        const c = document.createElement('canvas');
        c.width = OUTPUT_SIZE;
        c.height = OUTPUT_SIZE;
        drawCropped(c.getContext('2d'), video, OUTPUT_SIZE);
        return c;
      }

      // Compose un PNG transparent (personne seule) à partir d'une frame brute.
      async function buildCutoutBlob(rawCanvas) {
        try {
          await ensureSegmentation();
          if (!seg) return null;
          wireSeg();
          lastSeg = null;
          await seg.send({ image: rawCanvas });
          if (!lastSeg) return null;
          const c = document.createElement('canvas');
          c.width = OUTPUT_SIZE;
          c.height = OUTPUT_SIZE;
          const cx = c.getContext('2d');
          cx.save();
          cx.translate(OUTPUT_SIZE, 0);
          cx.scale(-1, 1); // miroir cohérent avec la photo
          cx.drawImage(lastSeg.segmentationMask, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
          cx.globalCompositeOperation = 'source-in';
          cx.drawImage(lastSeg.image, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
          cx.restore();
          return await canvasToBlob(c, 'image/png');
        } catch (e) {
          return null;
        }
      }

      // --- Capture / aperçu -------------------------------------------------

      function captureCanvas() {
        const out = document.createElement('canvas');
        out.width = OUTPUT_SIZE;
        out.height = OUTPUT_SIZE;
        const o = out.getContext('2d');
        o.save();
        o.translate(OUTPUT_SIZE, 0);
        o.scale(-1, 1); // miroir (cohérent avec l'aperçu)
        o.filter = filter.css || 'none';
        o.drawImage(live, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        o.restore();
        return out;
      }

      function showCaptureMode() {
        // Fige la frame brute AVANT d'arrêter la boucle, pour que le détourage
        // corresponde exactement à la photo capturée.
        const raw = options.withCutout ? rawFrameCanvas() : null;
        running = false;
        if (raf) cancelAnimationFrame(raf);
        captured = captureCanvas();
        if (raw) cutoutPromise = buildCutoutBlob(raw);
        preview.width = captured.width;
        preview.height = captured.height;
        preview.getContext('2d').drawImage(captured, 0, 0);
        preview.hidden = false;
        live.hidden = true;
        badge.hidden = true;
        btnShoot.hidden = true;
        btnRetake.hidden = false;
        btnAccept.hidden = false;
      }

      function showLiveMode() {
        cutoutPromise = null;
        preview.hidden = true;
        live.hidden = false;
        btnShoot.hidden = false;
        btnRetake.hidden = true;
        btnAccept.hidden = true;
        if (!running) {
          running = true;
          loop();
        }
      }

      // --- UI des effets ----------------------------------------------------

      function renderOptions() {
        const groups = { filter: FILTERS, bg: BACKGROUNDS, lens: LENSES };
        const selected = { filter: filter.id, bg: bg.id, lens: lens.id };
        const list = groups[activeTab];
        const curId = selected[activeTab];
        optionsEl.innerHTML = '';
        list.forEach((opt) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'camera-fx__opt' + (opt.id === curId ? ' is-active' : '');
          btn.dataset.fxid = opt.id;

          if (activeTab === 'bg' && opt.swatch && opt.swatch !== 'blur') {
            const sw = document.createElement('span');
            sw.className = 'camera-fx__swatch';
            sw.style.background = opt.swatch;
            btn.appendChild(sw);
          } else if (activeTab === 'bg' && opt.swatch === 'blur') {
            const sw = document.createElement('span');
            sw.className = 'camera-fx__swatch camera-fx__swatch--blur';
            btn.appendChild(sw);
          } else if (activeTab === 'lens') {
            const ic = document.createElement('span');
            ic.className = 'camera-fx__emoji';
            ic.textContent = opt.icon;
            btn.appendChild(ic);
          }

          if (opt.label) {
            const lab = document.createElement('span');
            lab.className = 'camera-fx__label';
            lab.textContent = opt.label;
            btn.appendChild(lab);
          }
          optionsEl.appendChild(btn);
        });
      }

      function selectOption(id) {
        if (activeTab === 'filter') {
          filter = FILTERS.find((f) => f.id === id) || filter;
          applyColorFilter();
        } else if (activeTab === 'bg') {
          bg = BACKGROUNDS.find((b) => b.id === id) || bg;
          lastSeg = null;
          if (bg.type !== 'none') {
            ensureSegmentation().then(() => { wireSeg(); refreshBadge(); }).catch(() => {});
          }
          refreshBadge();
        } else if (activeTab === 'lens') {
          lens = LENSES.find((l) => l.id === id) || lens;
          if (lens.id !== 'none') initJeeliz();
          refreshBadge();
        }
        renderOptions();
      }

      // --- Délégation d'événements -----------------------------------------

      overlay.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-fxtab]');
        if (tab) {
          activeTab = tab.dataset.fxtab;
          overlay.querySelectorAll('[data-fxtab]').forEach((t) => {
            t.classList.toggle('is-active', t.dataset.fxtab === activeTab);
          });
          renderOptions();
          return;
        }
        const opt = e.target.closest('[data-fxid]');
        if (opt) {
          selectOption(opt.dataset.fxid);
          return;
        }
        const act = e.target.getAttribute('data-act');
        if (!act) return;
        if (act === 'cancel') finish(null);
        else if (act === 'shoot') showCaptureMode();
        else if (act === 'retake') showLiveMode();
        else if (act === 'accept') {
          if (!captured) return;
          if (!options.withCutout) {
            captured.toBlob((blob) => finish(blob), 'image/jpeg', JPEG_QUALITY);
            return;
          }
          btnAccept.disabled = true;
          badge.hidden = false;
          Promise.all([
            canvasToBlob(captured, 'image/jpeg', JPEG_QUALITY),
            cutoutPromise || Promise.resolve(null),
          ]).then(([photo, cutout]) => finish({ photo, cutout }));
        }
      });

      renderOptions();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Caméra indisponible. Utilisez localhost ou HTTPS.');
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
        .then((s) => {
          stream = s;
          video.srcObject = s;
          return video.play().catch(() => {});
        })
        .then(() => {
          running = true;
          loop();
        })
        .catch(() => {
          showError('Accès caméra refusé ou indisponible.');
        });
    });
  }

  return { open };
})();
