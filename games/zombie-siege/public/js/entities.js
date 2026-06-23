/**
 * entities.js — Rendu et animation des zombies (positionnement pixel).
 *
 * Chaque zombie est un sprite positionné via `transform: translate(x, y)` dans
 * la couche de sa colonne. La montée est un unique tween RAF du slot courant
 * vers le slot cible, sur la durée `climbIntervalMs` de la vague. Aucune
 * transition CSS concurrente : une seule source d'animation par entité.
 */

window.Entities = (function () {
  const entities = new Map(); // id -> entity
  let rafId = null;

  function setCenter(el, x, y) {
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  function ensureRaf() {
    if (rafId == null) rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    let animating = false;
    for (const e of entities.values()) {
      if (!e.animating) continue;
      const t = Math.min(1, (now - e.startTime) / e.duration);
      e.y = e.fromY + (e.toY - e.fromY) * t;
      setCenter(e.el, e.x, e.y);
      if (t >= 1) {
        e.animating = false;
        e.y = e.toY;
      } else {
        animating = true;
      }
    }
    rafId = animating ? requestAnimationFrame(tick) : null;
  }

  function spawn(id, col, row) {
    const layer = Building.getZombieLayer(col);
    if (!layer) return null;

    const slot = Layout.getSlot(col, row);
    const el = document.createElement('div');
    el.className = 'zombie zombie--spawn';
    el.dataset.id = String(id);
    el.innerHTML =
      '<div class="zombie__sprite"><span class="zombie__emoji" aria-hidden="true">🧟</span></div>';
    setCenter(el, slot.x, slot.y);
    layer.appendChild(el);

    const e = {
      id,
      col,
      row,
      el,
      x: slot.x,
      y: slot.y,
      fromY: slot.y,
      toY: slot.y,
      startTime: 0,
      duration: 0,
      animating: false,
      frozen: false,
    };
    entities.set(id, e);
    return e;
  }

  function moveTo(e, row, duration) {
    const slot = Layout.getSlot(e.col, row);
    e.row = row;
    e.x = slot.x;
    e.fromY = e.y;
    e.toY = slot.y;
    e.startTime = performance.now();
    e.duration = Math.max(80, duration);
    e.animating = true;
    setCenter(e.el, e.x, e.y);
    ensureRaf();
  }

  function syncFromState(list, climbMs) {
    const duration = Math.max(120, Math.round((climbMs || 1500) * 0.9));
    const seen = new Set();

    for (const z of list) {
      seen.add(z.id);
      let e = entities.get(z.id);

      if (!e) {
        spawn(z.id, z.col, z.row);
        if (window.Sounds) Sounds.spawn();
        continue;
      }

      if (e.frozen) continue;

      if (e.col !== z.col) {
        const layer = Building.getZombieLayer(z.col);
        if (layer) layer.appendChild(e.el);
        e.col = z.col;
        e.x = Layout.getSlot(z.col, e.row).x;
      }

      if (z.row !== e.row) {
        moveTo(e, z.row, duration);
      }
    }

    for (const [id, e] of entities) {
      if (!seen.has(id) && !e.frozen) remove(id);
    }
  }

  /** Gèle un zombie condamné : il s'arrête net, ignoré par les syncs suivants. */
  function freeze(id) {
    const e = entities.get(id);
    if (!e) return;
    e.frozen = true;
    e.animating = false;
  }

  /** Position centrale actuelle du sprite (pixels, repère couche colonne). */
  function getCenter(id) {
    const e = entities.get(id);
    return e ? { x: e.x, y: e.y } : null;
  }

  /** Zombie le plus haut (row min) d'une colonne, hors zombies gelés. */
  function getTopmost(col) {
    let best = null;
    for (const e of entities.values()) {
      if (e.col !== col || e.frozen) continue;
      if (!best || e.row < best.row) best = e;
    }
    return best;
  }

  function playDeath(id, onDone) {
    const e = entities.get(id);
    if (!e) {
      if (onDone) onDone();
      return;
    }

    e.frozen = true;
    e.animating = false;

    const size = Layout.getLayerSize(e.col);
    const targetY = (size.height || 600) + 90;
    const from = `translate(${e.x}px, ${e.y}px) translate(-50%, -50%)`;
    const to = `translate(${e.x}px, ${targetY}px) translate(-50%, -50%) rotate(170deg)`;

    e.el.classList.add('zombie--falling');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      remove(id);
      if (onDone) onDone();
    };

    if (typeof e.el.animate === 'function') {
      const anim = e.el.animate(
        [
          { transform: from, opacity: 1 },
          { transform: to, opacity: 0 },
        ],
        { duration: 650, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
      );
      anim.onfinish = finish;
      setTimeout(finish, 720);
    } else {
      setCenter(e.el, e.x, targetY);
      e.el.style.opacity = '0';
      setTimeout(finish, 650);
    }
  }

  function remove(id) {
    const e = entities.get(id);
    if (e?.el?.parentNode) e.el.parentNode.removeChild(e.el);
    entities.delete(id);
  }

  function clearAll() {
    for (const id of [...entities.keys()]) remove(id);
  }

  return {
    syncFromState,
    spawn,
    freeze,
    getCenter,
    getTopmost,
    playDeath,
    remove,
    clearAll,
  };
})();
