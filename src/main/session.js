/**
 * Create local session persistence helpers.
 *
 * @param {object} deps
 * @param {string | null} deps.sessionKey - localStorage key for the session payload, or `null` to disable persistence.
 * @param {Storage} deps.storage - Storage implementation (typically `window.localStorage`).
 * @param {object} deps.state - Shared mutable game state.
 * @returns {{
 *   saveSession: () => void,
 *   clearSession: () => void,
 *   loadSavedSession: () => Record<string, unknown> | null,
 * }}
 */
export function createSessionStore({ sessionKey, storage, state }) {
  /** Persist the active game session snapshot to storage. */
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
        offlineMode: state.offlineMode,
        finalQuestionPrompt: state.finalQuestionPrompt,
        finalQuestionAnswer: state.finalQuestionAnswer,
      }));
    } catch {
      // Ignore storage failures (full/unavailable).
    }
  }

  /** Remove the persisted session snapshot from storage. */
  function clearSession() {
    if (!sessionKey) return;
    try {
      storage.removeItem(sessionKey);
    } catch {
      // Ignore storage failures.
    }
  }

  /**
   * Read and parse the persisted session snapshot.
   * @returns {Record<string, unknown> | null} Parsed session object, or `null` when absent or unreadable.
   */
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
