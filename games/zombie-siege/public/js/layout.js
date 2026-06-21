/**
 * layout.js — Moteur de positionnement en pixels.
 *
 * Source de vérité visuelle unique : les centres des slots (col × row) sont
 * mesurés directement depuis les cellules DOM réelles, exprimés en pixels
 * relatifs à la couche zombie de chaque colonne. Zombies, bombes et FX
 * partagent ainsi exactement le même repère, ce qui élimine les décalages.
 */

window.Layout = (function () {
  const COLS = 7;
  const ROWS = 10;

  const slots = []; // slots[col][row] = { x, y }
  const layerSize = []; // layerSize[col] = { width, height }
  let measured = false;
  let resizeTimer = null;

  function measure() {
    slots.length = 0;
    layerSize.length = 0;

    for (let c = 0; c < COLS; c++) {
      const layer = Building.getZombieLayer(c);
      slots[c] = [];

      if (!layer) {
        layerSize[c] = { width: 0, height: 0 };
        continue;
      }

      const lr = layer.getBoundingClientRect();
      layerSize[c] = { width: lr.width, height: lr.height };

      for (let r = 0; r < ROWS; r++) {
        const cell = Building.getCell(c, r);
        if (!cell) {
          slots[c][r] = { x: lr.width / 2, y: ((r + 0.5) / ROWS) * lr.height };
          continue;
        }
        const cr = cell.getBoundingClientRect();
        slots[c][r] = {
          x: cr.left + cr.width / 2 - lr.left,
          y: cr.top + cr.height / 2 - lr.top,
        };
      }
    }

    measured = true;
  }

  function init() {
    measure();
    window.addEventListener('resize', onResize);
    // Re-mesure après chargement complet : polices et images peuvent décaler
    // les hauteurs après la première mesure.
    window.addEventListener('load', measure);
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  }

  function refresh() {
    measure();
  }

  function getSlot(col, row) {
    if (!measured) measure();
    const r = Math.max(0, Math.min(ROWS - 1, Math.round(row)));
    const colSlots = slots[col];
    return (colSlots && colSlots[r]) || { x: 0, y: 0 };
  }

  /** Point de lancer du défenseur — fenêtre du haut (rangée 0). */
  function getLaunchPoint(col) {
    return getSlot(col, 0);
  }

  /** Bas de colonne — où finit une bombe ratée. */
  function getGroundPoint(col) {
    if (!measured) measure();
    const size = layerSize[col] || { width: 0, height: 0 };
    return { x: size.width / 2, y: size.height + 28 };
  }

  function getLayerSize(col) {
    if (!measured) measure();
    return layerSize[col] || { width: 0, height: 0 };
  }

  return {
    init,
    refresh,
    getSlot,
    getLaunchPoint,
    getGroundPoint,
    getLayerSize,
    COLS,
    ROWS,
  };
})();
