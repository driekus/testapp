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
 * @returns {{ gameId: string, slug: string, requiresPayment: boolean, paymentToken: string | null, finalScore: number, totalAnswerTimeMs: number, playerId: string, winnerName: string, winnerPhone: string }}
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
    winnerName: String(data?.winnerName ?? '').trim(),
    winnerPhone: String(data?.winnerPhone ?? '').trim(),
  };
}

/**
 * Build the scoreboard display-name update operation for the current play session.
 * Returns `null` when essential identifiers are missing.
 * @param {object} params
 * @param {boolean} params.requiresPayment - Whether the game is a paid game.
 * @param {string} params.name - Display name to save.
 * @param {string} params.gameId - UUID of the game.
 * @param {string} params.playerId - Persistent player identifier.
 * @param {string} params.playerSessionId - Per-session identifier.
 * @param {string | null} params.paymentToken - Payment token (paid games only).
 * @returns {{ mode: 'session' | 'player', payload: object } | null}
 */
export function buildScoreNameOperation({
  requiresPayment,
  name,
  gameId,
  playerId,
  playerSessionId,
  paymentToken,
}) {
  if (!name || !gameId) return null;

  if (requiresPayment) {
    if (!playerSessionId) return null;
    return {
      mode: 'session',
      payload: {
        game_id: gameId,
        player_session_id: playerSessionId,
        display_name: name,
        payment_token: paymentToken,
      },
    };
  }

  if (!playerId) return null;
  return {
    mode: 'player',
    payload: {
      game_id: gameId,
      player_id: playerId,
      display_name: name,
    },
  };
}

