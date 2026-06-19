/**
 * Creates local session persistence helpers.
 *
 * @param {object} deps
 * @param {string | null} deps.sessionKey Storage key for session payload.
 * @param {Storage} deps.storage Storage implementation (usually window.localStorage).
 * @param {object} deps.state Shared mutable game state.
 * @returns {{
 *   saveSession: () => void,
 *   clearSession: () => void,
 *   loadSavedSession: () => any,
 * }}
 */
export function createSessionStore({ sessionKey, storage, state }) {
  function saveSession() {
    if (!sessionKey) return;
    try {
      storage.setItem(sessionKey, JSON.stringify({
        v: 1,
        currentRouteIndex: state.currentRouteIndex,
        currentRouteId: state.currentRouteId,
        currentLocationIndex: state.currentLocationIndex,
        collectedLetters: state.collectedLetters,
        pendingLetter: state.pendingLetter,
        route: state.route,
        gameRoutes: state.gameRoutes,
        displayName: state.displayName,
        routeComplete: state.routeComplete,
        lastLetterGrantedAt: state.lastLetterGrantedAt,
        playerId: state.playerId,
        playerSessionId: state.playerSessionId,
        playerDisplayName: state.playerDisplayName,
        score: state.score,
        lastScoreDelta: state.lastScoreDelta,
        totalAnswerTimeMs: state.totalAnswerTimeMs,
        questionStartedAt: state.questionStartedAt,
      }));
    } catch {
      // Ignore storage failures (full/unavailable).
    }
  }

  function clearSession() {
    if (!sessionKey) return;
    try {
      storage.removeItem(sessionKey);
    } catch {
      // Ignore storage failures.
    }
  }

  function loadSavedSession() {
    if (!sessionKey) return null;
    try {
      const raw = storage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  return {
    saveSession,
    clearSession,
    loadSavedSession,
  };
}

