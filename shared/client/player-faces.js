/**
 * player-faces.js — Affichage unifié des visages joueurs (servi sous /shared).
 *
 * Les jeux reçoivent un `roster` dans leur état WebSocket :
 *   [{ slot, profileId, pseudo, photos: { idle, win, lose } }]
 *
 * Ce module centralise le rendu des visages et le choix de la bonne variante
 * (idle / win / lose) partout : cartes, podium, animations de victoire, défaite
 * et de vol. Si aucun roster n'est fourni (lancement sans profils), il retombe
 * sur un placeholder « initiales + couleur de slot » et le label « Joueur N ».
 *
 * Il expose aussi une tête détourée (PNG transparent, `cutoutUrl` du roster) et
 * un effet réutilisable de têtes qui tombent (`dropHead` / `rainHeads`).
 */

window.PlayerFaces = (function () {
  let roster = [];
  let dropLayer = null;

  function setRoster(next) {
    roster = Array.isArray(next) ? next : [];
  }

  function hasRoster() {
    return roster.length > 0;
  }

  function getEntry(slot) {
    return roster.find((e) => Number(e.slot) === Number(slot)) || null;
  }

  function getPseudo(slot) {
    const entry = getEntry(slot);
    return entry?.pseudo || `Joueur ${slot}`;
  }

  function getUrl(slot, variant) {
    const entry = getEntry(slot);
    if (!entry || !entry.photos) return null;
    return entry.photos[variant] || entry.photos.idle || null;
  }

  /** URL de la tête détourée (PNG transparent), ou null si absente. */
  function getCutoutUrl(slot) {
    const entry = getEntry(slot);
    return entry?.cutoutUrl || null;
  }

  function initials(slot) {
    const entry = getEntry(slot);
    const base = entry?.pseudo || String(slot);
    return base.trim().slice(0, 2).toUpperCase();
  }

  /**
   * Construit le HTML d'un visage (image ou placeholder initiales).
   * @param {object} opts
   * @param {number} opts.slot
   * @param {string} [opts.variant='idle'] - idle | win | lose
   * @param {string} [opts.size='md'] - sm | md | lg
   * @param {string} [opts.extraClass='']
   */
  function faceHtml(opts = {}) {
    const slot = opts.slot;
    const variant = opts.variant || 'idle';
    const size = opts.size || 'md';
    const extra = opts.extraClass ? ' ' + opts.extraClass : '';
    const cls = `player-face player-face--${size} player-face--p${slot} player-face--${variant}${extra}`;
    const url = getUrl(slot, variant);
    if (url) {
      return `<span class="${cls}"><img class="player-face__img" src="${url}" alt="" /></span>`;
    }
    return `<span class="${cls} player-face--placeholder"><span class="player-face__initials">${initials(slot)}</span></span>`;
  }

  /** Variante DOM de faceHtml (pour insertion / animations). */
  function createFace(opts = {}) {
    const wrap = document.createElement('span');
    wrap.innerHTML = faceHtml(opts);
    return wrap.firstElementChild;
  }

  /** Remplace le contenu d'un conteneur par le visage demandé. */
  function renderInto(container, opts = {}) {
    if (!container) return;
    container.innerHTML = faceHtml(opts);
  }

  // --- Effet : têtes qui tombent ----------------------------------------

  function ensureDropLayer() {
    if (dropLayer && document.body.contains(dropLayer)) return dropLayer;
    dropLayer = document.createElement('div');
    dropLayer.className = 'player-head-drop-layer';
    document.body.appendChild(dropLayer);
    return dropLayer;
  }

  /**
   * Fait tomber une tête (détourée si dispo, sinon visage circulaire) du haut
   * de l'écran. Utilisable depuis n'importe quel jeu (conteneur auto-injecté).
   * @param {number} slot
   * @param {object} [opts]
   * @param {number} [opts.x] - position horizontale 0–100 (% largeur écran)
   * @param {number} [opts.duration] - durée de chute en secondes
   * @param {number} [opts.delay] - délai avant chute en secondes
   * @param {string} [opts.size] - largeur CSS (ex. '200px'), sinon défaut
   * @param {string} [opts.variant] - variante du repli circulaire (idle/win/lose)
   */
  function dropHead(slot, opts = {}) {
    const variant = opts.variant || 'idle';
    const layer = ensureDropLayer();
    const el = document.createElement('div');
    el.className = 'player-head-drop';

    // win/lose : photo dédiée ; sinon cutout neutre ; repli visage circulaire.
    const url = variant === 'win' || variant === 'lose'
      ? getUrl(slot, variant)
      : (getCutoutUrl(slot) || getUrl(slot, 'idle'));

    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.className = 'player-head-drop__img';
      el.appendChild(img);
    } else {
      const face = createFace({ slot, variant, size: 'xxl' });
      face.classList.add('player-head-drop__face');
      el.appendChild(face);
    }

    const startX = opts.x != null ? opts.x : Math.random() * 100;
    const dur = opts.duration != null ? opts.duration : 2.4 + Math.random() * 1.6;
    el.style.left = startX + '%';
    el.style.setProperty('--drop-duration', dur + 's');
    el.style.setProperty('--drop-rot', (Math.random() * 2 - 1) * 50 + 'deg');
    el.style.setProperty('--drop-sway', (Math.random() * 2 - 1) * 140 + 'px');
    if (opts.size) el.style.setProperty('--drop-size', opts.size);
    if (opts.delay) el.style.animationDelay = opts.delay + 's';

    layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Filet de sécurité si animationend ne se déclenche pas.
    setTimeout(() => el.remove(), (dur + (opts.delay || 0)) * 1000 + 600);
    return el;
  }

  /**
   * Pluie de têtes échelonnée (réparties sur les slots fournis).
   * @param {number|number[]} slots
   * @param {object} [opts]
   * @param {number} [opts.count=14] - nombre de têtes
   * @param {number} [opts.stagger=160] - délai entre deux têtes (ms)
   */
  function rainHeads(slots, opts = {}) {
    const list = Array.isArray(slots) ? slots : [slots];
    if (list.length === 0) return;
    const count = opts.count != null ? opts.count : 14;
    const stagger = opts.stagger != null ? opts.stagger : 160;
    for (let i = 0; i < count; i++) {
      const slot = list[i % list.length];
      setTimeout(() => dropHead(slot, opts), i * stagger);
    }
  }

  return {
    setRoster,
    hasRoster,
    getEntry,
    getPseudo,
    getUrl,
    getCutoutUrl,
    initials,
    faceHtml,
    createFace,
    renderInto,
    dropHead,
    rainHeads,
  };
})();
