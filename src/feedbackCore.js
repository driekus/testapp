/**
 * Parse feedback session payload from sessionStorage-like API.
 * @param {{ getItem: (key: string) => string | null }} storage
 * @param {string} key
 * @returns {any | null}
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
 * Derive normalized feedback context values from session payload.
 * @param {any} data
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
 * Build scoreboard name-update operation.
 * @param {object} params
 * @param {boolean} params.requiresPayment
 * @param {string} params.name
 * @param {string} params.gameId
 * @param {string} params.playerId
 * @param {string} params.playerSessionId
 * @param {string | null} params.paymentToken
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

