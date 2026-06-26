/**
 * results.js — Écran podium et statistiques fin de partie.
 */

window.Results = (function () {
  const overlay = document.getElementById('results-overlay');
  const titleEl = document.querySelector('.results-panel__title');
  const podiumEl = document.getElementById('results-podium');
  const statsEl = document.getElementById('results-stats');

  const MEDALS = ['🥇', '🥈', '🥉'];

  function show(ranking, stats, opts = {}) {
    const isTie = Boolean(opts.isTie);
    const tiedPlayers = opts.tiedPlayers || [];
    const winners = opts.winners || [];

    if (titleEl) titleEl.textContent = isTie ? 'Égalité !' : 'Podium';

    if (isTie) {
      renderTiePodium(ranking, tiedPlayers);
    } else {
      renderPodium(ranking);
    }

    renderStats(ranking, stats);
    overlay.hidden = false;

    if (window.Confetti) {
      const canvas = document.getElementById('confetti-canvas');
      if (canvas && !canvas._confettiInit) {
        Confetti.create(canvas);
        canvas._confettiInit = true;
      }
      setTimeout(() => Confetti.burst(isTie ? 180 : 350), 400);
    }

    if (!isTie && Sounds.victory) Sounds.victory(1);

    if (!isTie && window.PlayerFaces && winners.length) {
      setTimeout(() => PlayerFaces.rainHeads(winners, { count: 16, variant: 'win' }), 500);
    }
  }

  function hide() {
    overlay.hidden = true;
    if (titleEl) titleEl.textContent = 'Podium';
    if (window.Confetti) Confetti.stop();
  }

  function playerLabel(n) {
    return window.PlayerFaces ? PlayerFaces.getPseudo(n) : `Joueur ${n}`;
  }

  function renderTiePodium(ranking, tiedPlayers) {
    podiumEl.innerHTML = '';

    const subtitle = document.createElement('p');
    subtitle.className = 'results-panel__tie-subtitle';
    subtitle.textContent = 'Même score et mêmes pièces récoltées';
    podiumEl.appendChild(subtitle);

    const row = document.createElement('div');
    row.className = 'results-panel__tie-row';

    for (const player of tiedPlayers) {
      const entry = ranking.find((e) => e.player === player);
      if (!entry) continue;

      const place = document.createElement('div');
      place.className = 'podium-place podium-place--tie';

      const medal = document.createElement('div');
      medal.className = 'podium-place__medal';
      medal.textContent = '🤝';

      if (window.PlayerFaces) {
        const face = PlayerFaces.createFace({ slot: entry.player, variant: 'idle', size: 'xl' });
        face.classList.add('podium-place__face');
        place.appendChild(face);
      }

      const bar = document.createElement('div');
      bar.className = 'podium-place__bar podium-place__bar--tie';

      const name = document.createElement('div');
      name.className = 'podium-place__name';
      name.textContent = playerLabel(entry.player);

      const score = document.createElement('div');
      score.className = 'podium-place__score';
      score.textContent = `🪙 ${Math.max(0, entry.score)}`;

      const collected = document.createElement('div');
      collected.className = 'podium-place__collected';
      collected.textContent = `+${entry.coinsWon ?? entry.stats?.coinsWon ?? 0} récoltées`;

      bar.appendChild(name);
      bar.appendChild(score);
      bar.appendChild(collected);
      place.appendChild(medal);
      place.appendChild(bar);
      row.appendChild(place);
    }

    podiumEl.appendChild(row);
  }

  function renderPodium(ranking) {
    podiumEl.innerHTML = '';
    const top3 = ranking.slice(0, 3);
    const order = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const lastPlayer = ranking.length ? ranking[ranking.length - 1].player : null;

    for (let i = 0; i < order.length; i++) {
      const entry = order[i];
      const placeIndex = ranking.indexOf(entry);
      const place = document.createElement('div');
      place.className = `podium-place podium-place--${placeIndex + 1}`;

      const medal = document.createElement('div');
      medal.className = 'podium-place__medal';
      medal.textContent = MEDALS[placeIndex] || '🏅';

      if (window.PlayerFaces) {
        const variant = placeIndex === 0 ? 'win' : (entry.player === lastPlayer ? 'lose' : 'idle');
        const face = PlayerFaces.createFace({ slot: entry.player, variant, size: 'xl' });
        face.classList.add('podium-place__face');
        place.appendChild(face);
      }

      const bar = document.createElement('div');
      bar.className = 'podium-place__bar';

      const name = document.createElement('div');
      name.className = 'podium-place__name';
      name.textContent = playerLabel(entry.player);

      const score = document.createElement('div');
      score.className = 'podium-place__score';
      score.textContent = `🪙 ${Math.max(0, entry.score)}`;

      bar.appendChild(name);
      bar.appendChild(score);
      place.appendChild(medal);
      place.appendChild(bar);
      podiumEl.appendChild(place);
    }
  }

  function renderStats(ranking, stats) {
    statsEl.innerHTML = '';
    for (const entry of ranking) {
      const s = stats[entry.player] || entry.stats || {};
      const card = document.createElement('div');
      card.className = 'stat-card';

      const title = document.createElement('div');
      title.className = 'stat-card__title';
      title.textContent = playerLabel(entry.player);

      card.appendChild(title);
      card.appendChild(statRow('Lancers', s.drops || 0));
      card.appendChild(statRow('Pièces gagnées', s.coinsWon || 0));
      card.appendChild(statRow('Pièces perdues', s.coinsLost || 0));
      card.appendChild(statRow('Bombes', s.bombsHit || 0));
      card.appendChild(statRow('Couteaux', s.knivesHit || 0));
      card.appendChild(statRow('Voleurs', s.thievesHit || 0));
      card.appendChild(statRow('Mini-jeux touchés', s.minigameHits || 0));
      card.appendChild(statRow('Pièces volées (mini)', s.minigameCoinsStolen || 0));
      card.appendChild(statRow('Dégâts mini-jeu', s.minigameCoinsTaken || 0));
      card.appendChild(statRow('Meilleur drop', s.bestDrop > 0 ? `+${s.bestDrop}` : '—'));
      card.appendChild(statRow('Pire drop', s.worstDrop < 0 ? String(s.worstDrop) : '—'));
      card.appendChild(statRow('Total', `🪙 ${Math.max(0, entry.score)}`));

      statsEl.appendChild(card);
    }
  }

  function statRow(label, value) {
    const row = document.createElement('div');
    row.className = 'stat-card__row';
    row.innerHTML = `<span>${label}</span><span>${value}</span>`;
    return row;
  }

  return { show, hide };
})();
