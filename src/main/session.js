const OFFLINE_ACTIVATION_STORAGE_KEY = 'letter-quest-offline-activation';
const OFFLINE_ACTIVATION_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Extract reusable free-player identity from a saved session snapshot.
 * Used only during the immediate reload into offline mode after a successful download.
 *
 * @param {Record<string, unknown> | null} savedSession
 * @returns {{ playerDisplayName: string, nameConfirmed: boolean } | null}
 */
export function getReusableFreePlayerIdentity(savedSession) {
  if (!savedSession || savedSession.v !== 1) return null;

  return {
    playerDisplayName: typeof savedSession.playerDisplayName === 'string'
      ? savedSession.playerDisplayName
      : '',
    nameConfirmed: Boolean(savedSession.nameConfirmed),
  };
}

/**
 * Mark that the current page is about to reload into freshly downloaded offline mode.
 *
 * @param {Storage} storage
 * @param {string} slug
 * @param {number} [now=Date.now()]
 */
export function markOfflineActivationRequested(storage, slug, now = Date.now()) {
  if (!storage || !slug) return;
  try {
    storage.setItem(OFFLINE_ACTIVATION_STORAGE_KEY, JSON.stringify({
      slug,
      requestedAt: now,
    }));
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Consume a one-time offline activation marker for the given slug.
 * Returns true only for a recent, matching request, and clears the marker either way.
 *
 * @param {Storage} storage
 * @param {string} slug
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function consumeOfflineActivationRequest(storage, slug, now = Date.now()) {
  if (!storage || !slug) return false;

  try {
    const raw = storage.getItem(OFFLINE_ACTIVATION_STORAGE_KEY);
    storage.removeItem(OFFLINE_ACTIVATION_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const requestedAt = Number(parsed?.requestedAt);
    if (parsed?.slug !== slug || !Number.isFinite(requestedAt)) {
      return false;
    }

    return requestedAt <= now && (now - requestedAt) <= OFFLINE_ACTIVATION_MAX_AGE_MS;
  } catch {
    try {
      storage.removeItem(OFFLINE_ACTIVATION_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    return false;
  }
}

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
        scoreSessionToken: state.scoreSessionToken,
        playerDisplayName: state.playerDisplayName,
        nameConfirmed: state.nameConfirmed,
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
