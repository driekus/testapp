/**
 * Build all runtime context needed by the rankings page.
 * @param {object} deps
 * @param {Window} deps.windowRef
 * @param {Document} deps.documentRef
 * @param {() => string} deps.getLanguage
 * @param {(language:string, section:'main'|'admin', key:string, params?:Record<string, unknown>) => string} deps.t
 * @param {(slug:string) => string} deps.getPlayerId
 */
export function createRankingsContext({ windowRef, documentRef, getLanguage, t, getPlayerId }) {
  const language = getLanguage();
  const tm = (key, params) => t(language, 'main', key, params);

  const params = new URLSearchParams(windowRef.location.search);
  const slug = params.get('slug') || '';
  const playerId = slug ? getPlayerId(slug) : '';

  const els = {
    closeBtn: documentRef.querySelector('#rankings-close-btn'),
    refreshLink: documentRef.querySelector('#rankings-refresh-link'),
    gameLogo: documentRef.querySelector('#game-logo'),
    title: documentRef.querySelector('#rankings-title'),
    scoreboardTitle: documentRef.querySelector('#scoreboard-title'),
    scoreboardList: documentRef.querySelector('#scoreboard-list'),
    myRankingsCard: documentRef.querySelector('#my-rankings-card'),
    myRankingsTitle: documentRef.querySelector('#my-rankings-title'),
    myRankingsList: documentRef.querySelector('#my-rankings-list'),
  };

  return { language, tm, slug, playerId, els };
}

/**
 * Start rankings page rendering with resolved runtime dependencies.
 * @param {object} deps
 * @param {Window} deps.windowRef
 * @param {Document} deps.documentRef
 * @param {() => string} deps.getLanguage
 * @param {Function} deps.t
 * @param {(slug:string) => string} deps.getPlayerId
 * @param {Function} deps.loadRankingsView
 * @param {Function} deps.buildRankingsUrl
 * @param {Function} deps.fetchGameForPlay
 * @param {Function} deps.loadGameStyles
 * @param {Function} deps.fetchScoreboard
 */
export function startRankingsPage(deps) {
  const { windowRef, documentRef, loadRankingsView, buildRankingsUrl, fetchGameForPlay, loadGameStyles, fetchScoreboard } = deps;
  const { tm, slug, playerId, els } = createRankingsContext(deps);

  return loadRankingsView({
    slug,
    playerId,
    els,
    tm,
    buildRankingsUrl,
    fetchGameForPlay,
    loadGameStyles,
    fetchScoreboard,
    windowRef,
    createElement: (tag) => documentRef.createElement(tag),
  });
}

