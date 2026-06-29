export const PENDING_SCORE_NAME_UPDATE_KEY = 'letter-quest-pending-score-name-update';

/**
 * Read a pending scoreboard display-name update from storage.
 * @param {{ getItem?: (key: string) => string | null }} [storage=localStorage]
 * @returns {Record<string, unknown> | null}
 */
export function readPendingScoreNameUpdate(storage = localStorage) {
  try {
    const raw = storage.getItem(PENDING_SCORE_NAME_UPDATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist or clear the pending scoreboard display-name update.
 * @param {Record<string, unknown> | null} payload
 * @param {{ setItem?: (key: string, value: string) => void, removeItem?: (key: string) => void }} [storage=localStorage]
 */
export function writePendingScoreNameUpdate(payload, storage = localStorage) {
  try {
    if (!payload) {
      storage.removeItem?.(PENDING_SCORE_NAME_UPDATE_KEY);
      return;
    }
    storage.setItem?.(PENDING_SCORE_NAME_UPDATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore unavailable storage.
  }
}

/**
 * Compare two scoreboard display-name update payloads for equivalence.
 * @param {Record<string, unknown> | null | undefined} a
 * @param {Record<string, unknown> | null | undefined} b
 * @returns {boolean}
 */
export function isSameScoreNameUpdate(a, b) {
  return Boolean(a && b)
    && String(a.game_id ?? '') === String(b.game_id ?? '')
    && String(a.player_session_id ?? '') === String(b.player_session_id ?? '')
    && String(a.session_token ?? '') === String(b.session_token ?? '')
    && String(a.display_name ?? '') === String(b.display_name ?? '');
}

/**
 * Retry a pending scoreboard display-name update from storage.
 * @param {object} deps
 * @param {(payload: Record<string, unknown>) => Promise<unknown>} deps.sendUpdate
 * @param {{ getItem?: (key: string) => string | null, setItem?: (key: string, value: string) => void, removeItem?: (key: string) => void }} [deps.storage=localStorage]
 * @returns {Promise<boolean>} True when a pending update existed and was flushed successfully.
 */
export async function flushPendingScoreNameUpdate({ sendUpdate, storage = localStorage }) {
  const pending = readPendingScoreNameUpdate(storage);
  if (!pending) return false;

  try {
    await sendUpdate(pending);
    writePendingScoreNameUpdate(null, storage);
    return true;
  } catch {
    return false;
  }
}

