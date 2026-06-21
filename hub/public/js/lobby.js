/**
 * lobby.js — Contrôleur BasketGame.
 *
 * Affiche la liste des jeux, permet d'en lancer un ou de l'arrêter, et affiche
 * les actions de contrôle définies dans game.config.json du jeu actif
 * (ex. nouvelle partie, reset scores pour Puissance 4).
 */

(function () {
  const grid = document.getElementById('games-grid');
  const emptyState = document.getElementById('empty-state');
  const banner = document.getElementById('active-banner');
  const activeIcon = document.getElementById('active-icon');
  const activeName = document.getElementById('active-name');
  const btnStop = document.getElementById('btn-stop');
  const gameControls = document.getElementById('game-controls');
  const gameControlsGrid = document.getElementById('game-controls-grid');
  const gameControlsFeedback = document.getElementById('game-controls-feedback');
  const connection = document.getElementById('connection');
  const connectionLabel = document.getElementById('connection-label');
  const espBanner = document.getElementById('esp-banner');
  const espBannerIcon = document.getElementById('esp-banner-icon');
  const espBannerLabel = document.getElementById('esp-banner-label');
  const espBannerText = document.getElementById('esp-banner-text');
  const espGamesHint = document.getElementById('esp-games-hint');
  const simulateTab = document.getElementById('simulate-tab');

  let state = { status: 'idle', activeGameId: null, games: [], esp32: { ready: false } };
  let busy = false;
  let actionBusy = false;
  let configuringGameId = null;
  let startOptionValues = {};
  let availablePlayers = [];
  let rosterSlots = []; // ids de profils choisis par slot (index 0 = slot 1)

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  WSClient.connect(`${wsProto}://${location.host}`, {
    onOpen: () => setConnection(true),
    onClose: () => setConnection(false),
    onMessage: (msg) => {
      if (msg.type === 'HUB_STATE') {
        state = msg;
        busy = false;
        if (!isEspReady() && configuringGameId) closeStartConfig();
        render();
      }
    },
  });

  function isEspReady() {
    return state.esp32?.ready === true;
  }

  function renderEspBanner() {
    const esp = state.esp32 || {};
    const ready = isEspReady();

    espBanner.hidden = ready;
    espGamesHint.hidden = ready;
    grid.classList.toggle('is-locked', !ready);
    if (simulateTab) simulateTab.hidden = !ready;

    if (ready) return;

    if (esp.calibrating && esp.connected) {
      espBanner.classList.add('is-calibrating');
      espBannerIcon.textContent = '⏳';
      espBannerLabel.textContent = 'Calibration en cours…';
      espBannerText.innerHTML =
        'Ne placez pas de balle devant les capteurs. Les jeux seront disponibles à la fin de la calibration. ' +
        'Suivez la progression sur le <a href="/sensors">dashboard capteurs</a>.';
    } else {
      espBanner.classList.remove('is-calibrating');
      espBannerIcon.textContent = '📡';
      espBannerLabel.textContent = 'ESP32 non détecté';
      espBannerText.innerHTML =
        'Branchez l\'ESP32 en USB pour démarrer. En attendant, consultez le ' +
        '<a href="/sensors">dashboard capteurs</a> ou gérez les ' +
        '<a href="/players">joueurs</a>.';
    }
  }

  function setConnection(online) {
    connection.classList.toggle('is-online', online);
    connection.classList.toggle('is-offline', !online);
    connectionLabel.textContent = online ? 'Hub connecté' : 'Hub déconnecté';
  }

  function showFeedback(text, type) {
    gameControlsFeedback.textContent = text;
    gameControlsFeedback.hidden = false;
    gameControlsFeedback.className = 'game-controls__feedback is-' + type;
    clearTimeout(showFeedback._timer);
    showFeedback._timer = setTimeout(() => {
      gameControlsFeedback.hidden = true;
    }, 4000);
  }

  function getStartOptions(game) {
    return game?.controller?.startOptions || [];
  }

  function requiresRoster(game) {
    return game?.controller?.requiresPlayerRoster === true;
  }

  function needsConfig(game) {
    return getStartOptions(game).length > 0 || requiresRoster(game);
  }

  function getRequiredCount(game) {
    if (Number.isInteger(startOptionValues.playerCount)) return startOptionValues.playerCount;
    return game?.players?.min || 2;
  }

  function initStartOptionValues(game) {
    const values = {};
    for (const opt of getStartOptions(game)) {
      values[opt.id] = opt.default;
    }
    return values;
  }

  function syncRosterSlots(game) {
    const count = getRequiredCount(game);
    const next = [];
    for (let i = 0; i < count; i++) next.push(rosterSlots[i] || '');
    rosterSlots = next;
  }

  async function fetchPlayers() {
    try {
      const res = await fetch('/api/players');
      const data = await res.json();
      availablePlayers = (data.players || []).filter((p) => p.hasAllPhotos);
    } catch {
      availablePlayers = [];
    }
  }

  function rosterIsValid(game) {
    if (!requiresRoster(game)) return true;
    const count = getRequiredCount(game);
    if (rosterSlots.length !== count) return false;
    if (rosterSlots.some((id) => !id)) return false;
    return new Set(rosterSlots).size === rosterSlots.length;
  }

  async function openStartConfig(game) {
    configuringGameId = game.id;
    startOptionValues = initStartOptionValues(game);
    rosterSlots = [];
    if (requiresRoster(game)) {
      syncRosterSlots(game);
      await fetchPlayers();
    }
    render();
  }

  function closeStartConfig() {
    configuringGameId = null;
    startOptionValues = {};
    rosterSlots = [];
    render();
  }

  async function startGame(id, params = {}) {
    if (busy || !isEspReady()) return;
    busy = true;
    configuringGameId = null;
    render();
    try {
      const hasParams = params && Object.keys(params).length > 0;
      const res = await fetch(`/api/games/${id}/start`, {
        method: 'POST',
        headers: hasParams ? { 'Content-Type': 'application/json' } : undefined,
        body: hasParams ? JSON.stringify(params) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'ESP32_NOT_CONNECTED') {
          alert('ESP32 non connecté. Branchez l\'appareil en USB avant de lancer un jeu.');
        } else if (data.error === 'ESP32_CALIBRATING') {
          alert('Calibration en cours. Attendez la fin avant de lancer un jeu.');
        } else {
          throw new Error('start failed');
        }
        return;
      }
    } catch (e) {
      if (e.message !== 'start failed') throw e;
      busy = false;
      render();
      alert("Impossible de lancer le jeu. Vérifiez les logs du hub.");
    }
  }

  function renderRosterPicker(game) {
    const count = getRequiredCount(game);
    const wrap = document.createElement('div');
    wrap.className = 'roster-picker';

    const heading = document.createElement('p');
    heading.className = 'roster-picker__title';
    heading.textContent = 'Joueurs';
    wrap.appendChild(heading);

    if (availablePlayers.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'roster-picker__empty';
      empty.innerHTML = 'Aucun joueur avec 3 photos. <a href="/players">Créer un joueur</a>';
      wrap.appendChild(empty);
      return wrap;
    }

    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'roster-slot';

      const selectedId = rosterSlots[i] || '';
      const selected = availablePlayers.find((p) => p.id === selectedId);

      const avatar = document.createElement('span');
      avatar.className = 'roster-slot__avatar';
      if (selected?.photoUrls?.idle) {
        avatar.innerHTML = `<img src="${selected.photoUrls.idle}" alt="" />`;
      } else {
        avatar.textContent = String(i + 1);
        avatar.classList.add('is-placeholder');
      }

      const select = document.createElement('select');
      select.className = 'roster-slot__select';

      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = `Joueur ${i + 1} — choisir…`;
      select.appendChild(blank);

      for (const p of availablePlayers) {
        const usedElsewhere = rosterSlots.includes(p.id) && rosterSlots[i] !== p.id;
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.pseudo + (usedElsewhere ? ' (déjà choisi)' : '');
        opt.disabled = usedElsewhere;
        if (p.id === selectedId) opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener('change', () => {
        rosterSlots[i] = select.value;
        render();
      });

      row.appendChild(avatar);
      row.appendChild(select);
      wrap.appendChild(row);
    }

    return wrap;
  }

  function confirmStartConfig(game) {
    const params = { ...startOptionValues };
    if (requiresRoster(game)) {
      params.roster = [...rosterSlots];
    }
    startGame(game.id, params);
  }

  async function stopGame() {
    if (busy) return;
    busy = true;
    render();
    try {
      await fetch('/api/games/stop', { method: 'POST' });
    } catch (e) {
      busy = false;
      render();
    }
  }

  async function runGameAction(action) {
    if (actionBusy || busy) return;
    if (action.confirm && !window.confirm(action.confirm)) return;

    actionBusy = true;
    renderGameControls(getActiveGame());

    try {
      const res = await fetch(`/api/games/action/${encodeURIComponent(action.id)}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = errorMessage(data.error) || `Erreur (${res.status})`;
        showFeedback(msg, 'error');
        return;
      }

      showFeedback(`✓ ${action.label}`, 'success');
    } catch (e) {
      showFeedback('Jeu injoignable', 'error');
    } finally {
      actionBusy = false;
      renderGameControls(getActiveGame());
    }
  }

  function errorMessage(code) {
    const messages = {
      SERIES_OVER: 'La série est terminée — réinitialisez les scores.',
      GAME_OVER: 'La partie est déjà terminée.',
      NO_ACTIVE_GAME: 'Aucun jeu actif.',
      ACTION_NOT_FOUND: 'Action inconnue.',
    };
    return messages[code] || null;
  }

  btnStop.addEventListener('click', stopGame);

  function getActiveGame() {
    const { activeGameId, games } = state;
    if (!activeGameId) return null;
    return games.find((g) => g.id === activeGameId) || null;
  }

  function renderGameControls(active) {
    const isRunning = state.status === 'running' && active;
    const actions = active?.controller?.actions || [];

    if (!isRunning || actions.length === 0) {
      gameControls.hidden = true;
      gameControlsGrid.innerHTML = '';
      return;
    }

    gameControls.hidden = false;
    gameControlsGrid.innerHTML = '';

    for (const action of actions) {
      const btn = document.createElement('button');
      const styleClass = action.style === 'danger' ? 'btn--danger'
        : action.style === 'ghost' ? 'btn--ghost'
        : 'btn--primary';
      btn.className = 'btn ' + styleClass;
      btn.disabled = actionBusy || busy;
      btn.textContent = (action.icon ? action.icon + ' ' : '') + action.label;
      btn.addEventListener('click', () => runGameAction(action));
      gameControlsGrid.appendChild(btn);
    }
  }

  function render() {
    const { games, activeGameId, status } = state;
    const active = getActiveGame();
    const espReady = isEspReady();

    renderEspBanner();

    if (activeGameId) {
      banner.hidden = false;
      activeIcon.textContent = active?.icon || '🎮';
      activeName.textContent = active?.name || activeGameId;
      btnStop.disabled = busy || status === 'stopping';
      btnStop.textContent = status === 'stopping' ? 'Arrêt…' : 'Arrêter';
    } else {
      banner.hidden = true;
      gameControls.hidden = true;
    }

    renderGameControls(active);

    emptyState.hidden = games.length > 0;
    grid.innerHTML = '';

    for (const game of games) {
      const isActive = game.id === activeGameId;
      const isStarting = busy && status === 'starting' && activeGameId === game.id;

      const card = document.createElement('article');
      card.className = 'game-card' + (isActive ? ' is-active' : '');

      const players = game.players
        ? `${game.players.min}${game.players.max !== game.players.min ? '–' + game.players.max : ''} joueur(s)`
        : '';

      card.innerHTML = `
        <div class="game-card__icon">${game.icon || '🎮'}</div>
        <div class="game-card__name">${escapeHtml(game.name)}</div>
        <p class="game-card__desc">${escapeHtml(game.description || '')}</p>
        <div class="game-card__meta">
          <span class="tag">${game.columns || 7} colonnes</span>
          ${players ? `<span class="tag">${players}</span>` : ''}
        </div>
      `;

      const startOptions = getStartOptions(game);
      const isConfiguring = configuringGameId === game.id;

      if (isConfiguring && needsConfig(game)) {
        const panel = document.createElement('div');
        panel.className = 'start-options';

        for (const opt of startOptions) {
          const row = document.createElement('div');
          row.className = 'start-options__row';

          const label = document.createElement('label');
          label.className = 'start-options__label';
          label.textContent = opt.label;

          const controls = document.createElement('div');
          controls.className = 'start-options__controls';

          const btnMinus = document.createElement('button');
          btnMinus.type = 'button';
          btnMinus.className = 'start-options__step';
          btnMinus.textContent = '−';
          btnMinus.disabled = startOptionValues[opt.id] <= opt.min;
          btnMinus.addEventListener('click', () => {
            if (startOptionValues[opt.id] > opt.min) {
              startOptionValues[opt.id]--;
              if (requiresRoster(game)) syncRosterSlots(game);
              render();
            }
          });

          const value = document.createElement('span');
          value.className = 'start-options__value';
          value.textContent = String(startOptionValues[opt.id]);

          const btnPlus = document.createElement('button');
          btnPlus.type = 'button';
          btnPlus.className = 'start-options__step';
          btnPlus.textContent = '+';
          btnPlus.disabled = startOptionValues[opt.id] >= opt.max;
          btnPlus.addEventListener('click', () => {
            if (startOptionValues[opt.id] < opt.max) {
              startOptionValues[opt.id]++;
              if (requiresRoster(game)) syncRosterSlots(game);
              render();
            }
          });

          controls.appendChild(btnMinus);
          controls.appendChild(value);
          controls.appendChild(btnPlus);
          row.appendChild(label);
          row.appendChild(controls);
          panel.appendChild(row);
        }

        if (requiresRoster(game)) {
          panel.appendChild(renderRosterPicker(game));
        }

        const actions = document.createElement('div');
        actions.className = 'start-options__actions';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn btn--ghost';
        btnCancel.textContent = 'Annuler';
        btnCancel.addEventListener('click', closeStartConfig);

        const btnConfirm = document.createElement('button');
        btnConfirm.type = 'button';
        btnConfirm.className = 'btn btn--primary';
        btnConfirm.textContent = 'Lancer la partie';
        btnConfirm.disabled = !rosterIsValid(game) || !espReady;
        btnConfirm.addEventListener('click', () => confirmStartConfig(game));

        actions.appendChild(btnCancel);
        actions.appendChild(btnConfirm);
        panel.appendChild(actions);
        card.appendChild(panel);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (isActive ? 'btn--ghost' : 'btn--primary');
        btn.disabled = busy || !espReady || (activeGameId && !isActive);
        btn.textContent = !espReady
          ? (state.esp32?.calibrating ? 'Calibration…' : 'ESP32 requis')
          : isActive
          ? 'En cours sur la télé'
          : isStarting
          ? 'Lancement…'
          : 'Lancer';
        if (!isActive && espReady) {
          btn.addEventListener('click', () => {
            if (needsConfig(game)) openStartConfig(game);
            else startGame(game.id);
          });
        }
        card.appendChild(btn);
      }

      grid.appendChild(card);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  render();
})();
