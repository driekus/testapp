/**
 * Render one score row as a paragraph element.
 * @param {object} deps
 * @param {{ rank: number, display_name?: string, score: number }} deps.entry - Scoreboard entry data.
 * @param {(key: string, params?: Record<string, unknown>) => string} deps.tm - Translation helper.
 * @param {(tag: string) => HTMLElement} deps.createElement - DOM element factory.
 * @param {{ isBestMine?: boolean, isMine?: boolean, runIndex?: number }} [deps.options] - Rendering flags for the current player's rows.
 * @returns {HTMLElement}
 */
export function renderScoreRow({ entry, tm, createElement, options = {} }) {
  const row = createElement('p');
  row.className = 'score-row';

  const trophy = entry.rank === 1 ? ' 🏆' : '';
  const label = options.isBestMine
    ? tm('scoreboardYouBest')
    : options.isMine
    ? tm('scoreboardYouRun', { run: options.runIndex ?? 1 })
    : (String(entry.display_name || '').trim() || tm('scoreboardPlayer'));
  row.textContent = tm('scoreboardLine', {
    rank: entry.rank,
    name: `${label}${trophy}`,
    score: entry.score,
  });
  return row;
}

/**
 * Load rankings data and render it into DOM elements.
 * @param {object} deps
 * @param {string} deps.slug - Game slug to load rankings for.
 * @param {string} deps.playerId - Persistent player ID for identifying the current player's rows.
 * @param {object} deps.els - Cached DOM element references for the rankings view.
 * @param {(key: string, params?: Record<string, unknown>) => string} deps.tm - Translation helper.
 * @param {(slug: string) => string} deps.buildRankingsUrl - Rankings URL builder.
 * @param {(slug: string) => Promise<object | null>} deps.fetchGameForPlay - Fetches game config.
 * @param {(gameId: string) => Promise<void>} deps.loadGameStyles - Applies custom CSS styles.
 * @param {(payload: object) => Promise<object>} deps.fetchScoreboard - Fetches scoreboard data.
 * @param {Window} deps.windowRef - Browser window reference (used for navigation).
 * @param {(tag: string) => HTMLElement} deps.createElement - DOM element factory.
 * @returns {Promise<void>}
 */
export async function loadRankingsView({
  slug,
  playerId,
  els,
  tm,
  buildRankingsUrl,
  fetchGameForPlay,
  loadGameStyles,
  fetchScoreboard,
  windowRef,
  createElement,
}) {
  if (!slug) {
    els.title.textContent = tm('scoreboardTitle');
    els.myRankingsCard.classList.add('hidden');
    return;
  }

  els.closeBtn.textContent = tm('closeRankings');
  els.closeBtn.onclick = () => {
    windowRef.location.replace(`/?refresh=${Date.now()}`);
  };
  els.refreshLink.textContent = tm('refreshRankings');
  els.refreshLink.href = buildRankingsUrl(slug);
  els.title.textContent = tm('scoreboardTitle');
  els.scoreboardTitle.textContent = tm('scoreboardTitle');
  els.myRankingsTitle.textContent = tm('myRankingsTitle');

  try {
    const game = await fetchGameForPlay(slug);
    if (!game) {
      els.title.textContent = tm('gameNotFound', { slug });
      els.myRankingsCard.classList.add('hidden');
      return;
    }

    if (game.logo_url) {
      els.gameLogo.src = game.logo_url;
      els.gameLogo.classList.remove('hidden');
    }

    try {
      await loadGameStyles(game.id);
    } catch {
      // Keep rankings usable even when style loading fails.
    }

    const json = await fetchScoreboard({
      game_id: game.id,
      player_id: playerId,
    });

    els.scoreboardList.replaceChildren();
    if ((json.top ?? []).length === 0) {
      const empty = createElement('p');
      empty.className = 'muted';
      empty.textContent = tm('scoreboardEmpty');
      els.scoreboardList.appendChild(empty);
    } else {
      for (const entry of (json.top ?? []).slice(0, 3)) {
        els.scoreboardList.appendChild(renderScoreRow({ entry, tm, createElement }));
      }

      const topThree = (json.top ?? []).slice(0, 3);
      const mine = json.mine ?? [];
      const bestMine = mine[0] ?? null;
      const inTopThree = Boolean(bestMine && topThree.some((row) => row.player_session_id === bestMine.player_session_id));
      if (bestMine && !inTopThree) {
        els.scoreboardList.appendChild(renderScoreRow({ entry: bestMine, tm, createElement, options: { isBestMine: true } }));
      }
    }

    els.myRankingsList.replaceChildren();
    const mine = (json.mine ?? []).slice(0, 3);
    if (mine.length === 0) {
      const row = createElement('p');
      row.className = 'muted';
      row.textContent = tm('myRankingsEmpty');
      els.myRankingsList.appendChild(row);
    } else {
      mine.forEach((entry, index) => {
        els.myRankingsList.appendChild(renderScoreRow({
          entry,
          tm,
          createElement,
          options: { isMine: true, runIndex: index + 1 },
        }));
      });
    }
  } catch (err) {
    console.warn('rankings: failed to load rankings', err);
    els.title.textContent = tm('scoreboardTitle');
    els.myRankingsCard.classList.add('hidden');
  }
}

