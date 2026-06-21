/**
 * shots.js — Séquenceur de tir (timeline THROW → FALL → IMPACT).
 *
 * Une machine à états par tir, identifiée par `shotId`. La bombe est animée en
 * pixels via le moteur `Layout`. Le résultat serveur (`SHOT_RESULT`) est
 * bufferisé à réception et n'est appliqué qu'à la frame d'impact, ce qui
 * garantit que l'explosion et la tache verte tombent exactement sur le zombie.
 *
 * Constantes alignées sur `server/game.js` (THROW_MS + FALL_MS = impactMs).
 */

window.Shots = (function () {
  const THROW_MS = 140;
  const FALL_MS = 480;
  const SPLAT_MS = 1600;
  const MAX_EXTRA_WAIT = 450; // attente max du résultat après l'impact théorique

  const shots = new Map(); // shotId -> ctrl
  const pendingResults = new Map(); // résultat arrivé avant le SHOOT_FIRE

  function setCenter(el, x, y) {
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  function start(msg) {
    const { col, shotId } = msg;
    const layer = Building.getZombieLayer(col);
    if (!layer) return;

    const launch = Layout.getLaunchPoint(col);
    const ground = Layout.getGroundPoint(col);
    const defender = Building.getDefender(col);

    const bomb = document.createElement('div');
    bomb.className = 'projectile';
    bomb.innerHTML = '<span class="projectile__emoji" aria-hidden="true">💣</span>';
    setCenter(bomb, launch.x, launch.y);
    layer.appendChild(bomb);

    const ctrl = {
      col,
      shotId,
      layer,
      defender,
      bomb,
      launch,
      ground,
      impactMs: msg.impactMs || THROW_MS + FALL_MS,
      startTime: performance.now(),
      result: pendingResults.get(shotId) || null,
      finished: false,
    };
    pendingResults.delete(shotId);
    shots.set(shotId, ctrl);

    if (defender) defender.classList.add('is-throwing');
    if (window.SiegeSounds) SiegeSounds.throwProjectile();

    // Verdict déjà connu (arrivé avant le SHOOT_FIRE) → on conclut tout de suite.
    if (ctrl.result && ctrl.result.hit) {
      if (typeof ctrl.result.zombieId === 'number') Entities.freeze(ctrl.result.zombieId);
      resolve(ctrl);
      return;
    }

    requestAnimationFrame((t) => frame(ctrl, t));
  }

  /** Réception du verdict serveur. */
  function setResult(msg) {
    if (msg.hit && typeof msg.zombieId === 'number') {
      Entities.freeze(msg.zombieId);
    }
    const ctrl = shots.get(msg.shotId);
    if (!ctrl) {
      pendingResults.set(msg.shotId, msg);
      setTimeout(() => pendingResults.delete(msg.shotId), 2000);
      return;
    }
    ctrl.result = msg;
    // Kill : la bombe explose et DISPARAÎT immédiatement, sans attendre une
    // frame d'animation supplémentaire — elle ne continue jamais sa chute.
    if (msg.hit) resolve(ctrl);
  }

  function impactPoint(ctrl, result) {
    if (typeof result.zombieId === 'number') {
      const c = Entities.getCenter(result.zombieId);
      if (c) return c;
    }
    if (typeof result.row === 'number') return Layout.getSlot(ctrl.col, result.row);
    return ctrl.ground;
  }

  function frame(ctrl, now) {
    if (ctrl.finished) return;
    const elapsed = now - ctrl.startTime;

    // Phase THROW : la bombe reste au point de lancer.
    if (elapsed < THROW_MS) {
      requestAnimationFrame((t) => frame(ctrl, t));
      return;
    }

    // Un kill est résolu immédiatement dans setResult ; ici on ne gère que le
    // raté (laisser la bombe finir sa chute) et la sécurité anti-blocage.
    const reachedImpact = elapsed >= ctrl.impactMs;

    if (ctrl.result && ctrl.result.hit) {
      // Filet de sécurité si jamais setResult n'a pas conclu.
      resolve(ctrl);
      return;
    }

    if (ctrl.result && !ctrl.result.hit && reachedImpact) {
      resolve(ctrl);
      return;
    }

    if (!ctrl.result && elapsed >= ctrl.impactMs + MAX_EXTRA_WAIT) {
      ctrl.result = { hit: false, col: ctrl.col };
      resolve(ctrl);
      return;
    }

    // Rendu de la chute : la bombe descend à vitesse constante vers le sol,
    // mais s'arrête net sur le zombie le plus haut (collision par le haut).
    // Elle ne peut donc jamais le dépasser et tomber dans le vide. Une fois le
    // temps d'impact atteint sans verdict, on la fige sur place.
    if (!reachedImpact) {
      const fallT = Math.min(1, (elapsed - THROW_MS) / FALL_MS);
      let y = ctrl.launch.y + (ctrl.ground.y - ctrl.launch.y) * fallT;
      const top = Entities.getTopmost(ctrl.col);
      if (top) {
        const c = Entities.getCenter(top.id);
        if (c) y = Math.min(y, c.y);
      }
      setCenter(ctrl.bomb, ctrl.ground.x, y);
    }

    requestAnimationFrame((t) => frame(ctrl, t));
  }

  function resolve(ctrl) {
    if (ctrl.finished) return;
    ctrl.finished = true;
    shots.delete(ctrl.shotId);

    if (ctrl.defender) ctrl.defender.classList.remove('is-throwing');

    const result = ctrl.result || { hit: false };

    if (result.hit) {
      const point = impactPoint(ctrl, result);
      setCenter(ctrl.bomb, point.x, point.y);
      ctrl.bomb.remove();

      showExplosion(ctrl.layer, point.x, point.y);
      showSplat(ctrl.layer, point.x, point.y);
      if (result.points > 0) showScorePop(ctrl.layer, point.x, point.y, result.points);

      if (window.SiegeSounds) {
        SiegeSounds.impact();
        SiegeSounds.scorePop();
      }
      if (window.SiegeFx) SiegeFx.flashHit();
      if (window.Sounds?.bombHit) Sounds.bombHit('small');

      if (typeof result.zombieId === 'number') Entities.playDeath(result.zombieId);
    } else {
      setCenter(ctrl.bomb, ctrl.ground.x, ctrl.ground.y);
      ctrl.bomb.remove();
      showPoof(ctrl.layer, ctrl.ground.x, ctrl.ground.y);
      if (window.SiegeSounds) SiegeSounds.fallMiss();
    }
  }

  function showExplosion(layer, x, y) {
    const el = document.createElement('div');
    el.className = 'fx-impact';
    el.innerHTML = '<span class="fx-impact__boom" aria-hidden="true">💥</span>';
    setCenter(el, x, y);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 480);
  }

  function showPoof(layer, x, y) {
    const el = document.createElement('div');
    el.className = 'fx-impact fx-impact--miss';
    el.innerHTML = '<span class="fx-impact__boom" aria-hidden="true">💨</span>';
    setCenter(el, x, y);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 480);
  }

  function showSplat(layer, x, y) {
    const el = document.createElement('div');
    el.className = 'fx-splat';
    el.innerHTML = '<span class="fx-splat__mark" aria-hidden="true"></span>';
    setCenter(el, x, y);
    layer.appendChild(el);
    setTimeout(() => el.remove(), SPLAT_MS);
  }

  function showScorePop(layer, x, y, points) {
    const el = document.createElement('div');
    el.className = 'fx-score';
    el.innerHTML = `<span class="fx-score__txt">+${points}</span>`;
    setCenter(el, x, y);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function clearAll() {
    for (const ctrl of shots.values()) {
      ctrl.finished = true;
      if (ctrl.bomb?.parentNode) ctrl.bomb.remove();
      if (ctrl.defender) ctrl.defender.classList.remove('is-throwing');
    }
    shots.clear();
    pendingResults.clear();
  }

  /** Animation de brèche (zombie au sommet) — sur la colonne touchée. */
  function breach(col) {
    Building.breakWindow(col);
    Building.playColHit(col);
    if (window.SiegeFx) SiegeFx.flashBreach(col);
    if (window.SiegeSounds) SiegeSounds.breach();
  }

  return {
    start,
    setResult,
    clearAll,
    breach,
  };
})();
