/**
 * players-manager.js — Gestion des profils joueurs (pseudo + 3 photos).
 *
 * CRUD via l'API hub /api/players. Chaque photo est capturée par la webcam
 * (CameraCapture) au format carré, puis envoyée en JPEG brut.
 */

(function () {
  const PHOTO_VARIANTS = [
    { id: 'idle', label: 'Profil', icon: '🙂', title: 'Photo de profil', hint: 'Visage neutre, regard caméra' },
    { id: 'win', label: 'Victoire', icon: '🏆', title: 'Photo de victoire', hint: 'Montrez votre plus belle fierté !' },
    { id: 'lose', label: 'Défaite', icon: '😩', title: 'Photo de défaite', hint: 'Une bonne tête de perdant…' },
  ];

  const grid = document.getElementById('players-grid');
  const emptyState = document.getElementById('empty-state');
  const btnNew = document.getElementById('btn-new');

  const editor = document.getElementById('editor');
  const editorBackdrop = document.getElementById('editor-backdrop');
  const editorTitle = document.getElementById('editor-title');
  const editorClose = document.getElementById('editor-close');
  const editorCancel = document.getElementById('editor-cancel');
  const editorSave = document.getElementById('editor-save');
  const editorFeedback = document.getElementById('editor-feedback');
  const fieldPseudo = document.getElementById('field-pseudo');
  const photoSlots = document.getElementById('photo-slots');

  let players = [];
  let editing = null; // { id, pseudo, photos: {idle,win,lose}, isNew }

  async function fetchPlayers() {
    try {
      const res = await fetch('/api/players');
      const data = await res.json();
      players = data.players || [];
    } catch {
      players = [];
    }
    renderGrid();
  }

  function initials(pseudo) {
    return (pseudo || '?').trim().slice(0, 2).toUpperCase();
  }

  const GAME_LABELS = {
    plinko: 'Plinko',
    puissance4: 'P4',
  };

  function formatStatsSummary(stats) {
    if (!stats?.totals) return 'Aucune partie jouée';
    const { wins = 0, gamesPlayed = 0 } = stats.totals;
    if (!gamesPlayed) return 'Aucune partie jouée';

    const parts = [`${wins} victoire${wins !== 1 ? 's' : ''}`];
    const byGame = stats.byGame || {};
    for (const [id, entry] of Object.entries(byGame)) {
      if (!entry?.wins) continue;
      const label = GAME_LABELS[id] || id;
      parts.push(`${label} ${entry.wins}`);
    }
    return parts.join(' · ');
  }

  function renderGrid() {
    emptyState.hidden = players.length > 0;
    grid.innerHTML = '';

    for (const p of players) {
      const card = document.createElement('article');
      card.className = 'player-card';

      const avatar = p.photoUrls?.idle
        ? `<img class="player-card__avatar" src="${p.photoUrls.idle}" alt="${escapeHtml(p.pseudo)}" />`
        : `<div class="player-card__avatar player-card__avatar--placeholder">${escapeHtml(initials(p.pseudo))}</div>`;

      const statusClass = p.hasAllPhotos ? '' : ' is-incomplete';
      const statusText = p.hasAllPhotos ? '3 photos ✓' : 'Photos incomplètes';
      const statsText = formatStatsSummary(p.statistics);

      card.innerHTML = `
        ${avatar}
        <div class="player-card__name">${escapeHtml(p.pseudo)}</div>
        <div class="player-card__status${statusClass}">${statusText}</div>
        <div class="player-card__stats">${escapeHtml(statsText)}</div>
        <div class="player-card__actions">
          <button class="btn btn--ghost" data-act="edit">Éditer</button>
          <button class="btn btn--danger" data-act="delete">Suppr.</button>
        </div>
      `;
      card.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(p));
      card.querySelector('[data-act="delete"]').addEventListener('click', () => deletePlayer(p));
      grid.appendChild(card);
    }
  }

  function openEditor(player) {
    editing = player
      ? { id: player.id, pseudo: player.pseudo, photos: { ...player.photos }, isNew: false }
      : { id: null, pseudo: '', photos: { idle: false, win: false, lose: false }, isNew: true };

    editorTitle.textContent = editing.isNew ? 'Nouveau joueur' : 'Éditer le joueur';
    fieldPseudo.value = editing.pseudo;
    hideFeedback();
    renderPhotoSlots();
    editor.hidden = false;
    editorBackdrop.hidden = false;
    fieldPseudo.focus();
  }

  function closeEditor() {
    editor.hidden = true;
    editorBackdrop.hidden = true;
    editing = null;
  }

  function renderPhotoSlots() {
    photoSlots.innerHTML = '';
    for (const variant of PHOTO_VARIANTS) {
      const slot = document.createElement('div');
      slot.className = 'photo-slot';

      const hasPhoto = editing.photos[variant.id];
      const thumb = document.createElement('div');
      thumb.className = 'photo-slot__thumb' + (hasPhoto ? '' : ' is-empty');
      if (hasPhoto && editing.id) {
        thumb.innerHTML = `<img src="/api/players/${editing.id}/photos/${variant.id}?t=${Date.now()}" alt="${variant.label}" />`;
      } else {
        thumb.innerHTML = `<span class="photo-slot__icon">${variant.icon}</span>`;
      }
      thumb.addEventListener('click', () => capturePhoto(variant));

      const caption = document.createElement('div');
      caption.className = 'photo-slot__caption';
      caption.textContent = variant.label;

      slot.appendChild(thumb);
      slot.appendChild(caption);
      photoSlots.appendChild(slot);
    }
  }

  async function ensureProfile() {
    if (editing.id) {
      // Synchronise le pseudo s'il a changé avant la capture.
      const pseudo = fieldPseudo.value.trim();
      if (pseudo && pseudo !== editing.pseudo) {
        await fetch(`/api/players/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pseudo }),
        });
        editing.pseudo = pseudo;
      }
      return editing.id;
    }

    const pseudo = fieldPseudo.value.trim();
    if (!pseudo) {
      showFeedback('Saisissez un pseudo avant d\'ajouter une photo.', 'error');
      return null;
    }
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo }),
    });
    const data = await res.json();
    if (!res.ok) {
      showFeedback('Création impossible.', 'error');
      return null;
    }
    editing.id = data.player.id;
    editing.pseudo = data.player.pseudo;
    editing.isNew = false;
    editorTitle.textContent = 'Éditer le joueur';
    return editing.id;
  }

  async function capturePhoto(variant) {
    const id = await ensureProfile();
    if (!id) return;

    // La photo de profil génère aussi une tête détourée (PNG transparent)
    // réutilisée pour les animations dans les jeux.
    const withCutout = variant.id === 'idle';
    const result = await CameraCapture.open({ title: variant.title, hint: variant.hint, withCutout });
    if (!result) return;
    const photo = withCutout ? result.photo : result;
    const cutout = withCutout ? result.cutout : null;
    if (!photo) return;

    try {
      const res = await fetch(`/api/players/${id}/photos/${variant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: photo,
      });
      if (!res.ok) throw new Error('upload failed');
      editing.photos[variant.id] = true;

      if (cutout) {
        try {
          await fetch(`/api/players/${id}/cutout`, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: cutout,
          });
        } catch {
          /* le détourage est optionnel : on n'échoue pas la capture */
        }
      }

      renderPhotoSlots();
      showFeedback('Photo enregistrée.', 'success');
    } catch {
      showFeedback('Échec de l\'envoi de la photo.', 'error');
    }
  }

  async function save() {
    const pseudo = fieldPseudo.value.trim();
    if (!pseudo) {
      showFeedback('Le pseudo est obligatoire.', 'error');
      return;
    }
    editorSave.disabled = true;
    try {
      if (editing.id) {
        if (pseudo !== editing.pseudo) {
          await fetch(`/api/players/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pseudo }),
          });
        }
      } else {
        await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pseudo }),
        });
      }
      closeEditor();
      await fetchPlayers();
    } catch {
      showFeedback('Enregistrement impossible.', 'error');
    } finally {
      editorSave.disabled = false;
    }
  }

  async function deletePlayer(player) {
    if (!window.confirm(`Supprimer le joueur « ${player.pseudo} » ?`)) return;
    try {
      await fetch(`/api/players/${player.id}`, { method: 'DELETE' });
      await fetchPlayers();
    } catch {
      /* ignore */
    }
  }

  function showFeedback(text, type) {
    editorFeedback.textContent = text;
    editorFeedback.hidden = false;
    editorFeedback.className = 'editor__feedback is-' + type;
  }

  function hideFeedback() {
    editorFeedback.hidden = true;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  btnNew.addEventListener('click', () => openEditor(null));
  editorClose.addEventListener('click', closeEditor);
  editorCancel.addEventListener('click', closeEditor);
  editorBackdrop.addEventListener('click', closeEditor);
  editorSave.addEventListener('click', save);

  fetchPlayers();
})();
