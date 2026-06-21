/**
 * results.js — Écran podium et statistiques fin de partie.
 */

window.Results = (function () {
  const overlay = document.getElementById('results-overlay');
  const podiumEl = document.getElementById('results-podium');
  const statsEl = document.getElementById('results-stats');

  const MEDALS = ['🥇', '🥈', '🥉'];

  function show(ranking, stats) {
    renderPodium(ranking);
    renderStats(ranking, stats);
    overlay.hidden = false;

    if (window.Confetti) {
      const canvas = document.getElementById('confetti-canvas');
      if (canvas && !canvas._confettiInit) {
        Confetti.create(canvas);
        canvas._confettiInit = true;
      }
      setTimeout(() => Confetti.burst(350), 400);
    }
    if (Sounds.victory) Sounds.victory(1);

    // Pluie de têtes du vainqueur sur le podium.
    if (window.PlayerFaces && PlayerFaces.hasRoster() && ranking.length) {
      const winner = ranking[0].player;
      setTimeout(() => PlayerFaces.rainHeads([winner], { count: 16, variant: 'win' }), 500);
    }
  }

  function hide() {
    overlay.hidden = true;
    if (window.Confetti) Confetti.stop();
  }

  function playerLabel(n) {
    return window.PlayerFaces ? PlayerFaces.getPseudo(n) : `Joueur ${n}`;
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

      if (window.PlayerFaces && PlayerFaces.hasRoster()) {
        // 1er = fierté ; dernier = défaite ; autres = neutre.
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
      const s = stats[entry.player] || {};
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
