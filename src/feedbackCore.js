/**
 * Parse feedback session payload from a sessionStorage-like storage API.
 * @param {{ getItem: (key: string) => string | null }} storage - Storage object to read from.
 * @param {string} [key='letter-quest-feedback'] - Storage key to look up.
 * @returns {Record<string, unknown> | null} Parsed payload, or `null` on missing/invalid data.
 */
export function parseFeedbackSession(storage, key = 'letter-quest-feedback') {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Derive normalized feedback context values from a session payload.
 * @param {Record<string, unknown> | null} data - Parsed feedback session payload.
 * @returns {{ gameId: string, slug: string, requiresPayment: boolean, paymentToken: string | null, finalScore: number, totalAnswerTimeMs: number, playerId: string, playerSessionId: string, scoreSessionToken: string, winnerName: string, winnerPhone: string, offlineMode: boolean, finalQuestionPrompt: string, finalQuestionAnswer: string }}
 */
export function buildFeedbackContext(data) {
  return {
    gameId: data?.gameId || '',
    slug: data?.slug || '',
    requiresPayment: Boolean(data?.requiresPayment),
    paymentToken: data?.paymentToken || null,
    finalScore: Number(data?.score) || 0,
    totalAnswerTimeMs: Number(data?.totalAnswerTimeMs) || 0,
    playerId: data?.playerId || '',
    playerSessionId: data?.playerSessionId || '',
    scoreSessionToken: String(data?.scoreSessionToken ?? '').trim(),
    winnerName: String(data?.winnerName ?? '').trim(),
    winnerPhone: String(data?.winnerPhone ?? '').trim(),
    offlineMode: Boolean(data?.offlineMode),
    finalQuestionPrompt: String(data?.finalQuestionPrompt ?? '').trim(),
    finalQuestionAnswer: String(data?.finalQuestionAnswer ?? '').trim(),
  };
}

/**
 * Build the scoreboard display-name update operation for the current play session.
 * Returns `null` when essential identifiers are missing.
 * @param {object} params
 * @param {string} params.name - Display name to save.
 * @param {string} params.gameId - UUID of the game.
 * @param {string} params.playerSessionId - Per-session identifier.
 * @param {string} params.sessionToken - Signed session token returned by init-score-session.
 * @returns {{ mode: 'session', payload: object } | null}
 */
export function buildScoreNameOperation({
  name,
  gameId,
  playerSessionId,
  sessionToken,
}) {
  if (!name || !gameId || !playerSessionId || !sessionToken) return null;
  return {
    mode: 'session',
    payload: {
      game_id: gameId,
      player_session_id: playerSessionId,
      display_name: name,
      session_token: sessionToken,
    },
  };
}
