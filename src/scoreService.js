import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient.js';

/**
 * Enum-like map of score event type string constants.
 * @type {{ LOCATION_FOUND: string, ARRIVAL_CONFIRMED: string, ANSWER_CORRECT: string, QUESTION_SKIPPED: string, FINAL_QUESTION_CORRECT: string }}
 */
export const SCORE_EVENT_TYPES = {
  LOCATION_FOUND: 'location_found',
  ARRIVAL_CONFIRMED: 'arrival_confirmed',
  ANSWER_CORRECT: 'answer_correct',
  QUESTION_SKIPPED: 'question_skipped',
  FINAL_QUESTION_CORRECT: 'final_question_correct',
};

/**
 * Generate a unique ID using `crypto.randomUUID` when available,
 * otherwise a timestamp-based fallback.
 * @returns {string}
 */
function createId() {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Get or create a persistent player ID for a game, stored in localStorage.
 * @param {string} slug - Game slug used to namespace the storage key.
 * @returns {string} Stable player ID for this slug.
 */
export function getPlayerId(slug) {
  if (!slug) return '';

  const key = `letter-quest-player-${slug}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    const created = createId();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return createId();
  }
}

/**
 * Create a fresh play session ID (unique per game play).
 * @returns {string}
 */
export function createPlaySessionId() {
  return createId();
}

/**
 * Build a URL to the rankings page, optionally scoped to a game slug.
 * @param {string} [slug] - Game slug to include as a query parameter.
 * @returns {string} Relative URL, e.g. `/rankings.html?slug=my-game`.
 */
export function buildRankingsUrl(slug) {
  const params = new URLSearchParams();
  if (slug) params.set('slug', slug);
  const query = params.toString();
  return query ? `/rankings.html?${query}` : '/rankings.html';
}

/**
 * Build the absolute Supabase Edge Function URL for score-related endpoints.
 * @param {string} name - Edge Function name.
 * @returns {string}
 */
function scoreFunctionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

/**
 * Invoke a score-related Supabase Edge Function with a JSON payload.
 * @param {string} name - Edge Function name.
 * @param {object} payload - Request payload.
 * @returns {Promise<object>} Parsed JSON response body.
 */
async function callScoreFunction(name, payload) {
  const res = await fetch(scoreFunctionUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

/**
 * Build a deduplication key for a score event, used to prevent double-recording
 * the same event for the same location in the same route.
 * @param {string} routeId - UUID of the route row.
 * @param {number} locationIndex - Zero-based index of the location.
 * @param {string} eventType - One of the {@link SCORE_EVENT_TYPES} values.
 * @returns {string} Colon-separated composite key.
 */
export function buildScoreEventKey(routeId, locationIndex, eventType) {
  return `${routeId}:${locationIndex}:${eventType}`;
}

/**
 * Send a score event to the `record-score-event` Supabase Edge Function.
 * @param {object} payload - Event payload (player_id, session_id, event_type, points, …).
 * @returns {Promise<object>} Parsed JSON response from the function.
 */
export async function recordScoreEvent(payload) {
  return callScoreFunction('record-score-event', payload);
}

/**
 * Fetch scoreboard data from the `get-scoreboard` Supabase Edge Function.
 * @param {object} payload - Query payload (slug, player_id, session_id, …).
 * @returns {Promise<object>} Scoreboard data including top entries and player standing.
 */
export async function fetchScoreboard(payload) {
  return callScoreFunction('get-scoreboard', payload);
}

/**
 * Set or update the display name for a player's score row via the
 * `set-score-display-name` Supabase Edge Function.
 * @param {object} payload - Payload containing player_id and display_name.
 * @returns {Promise<object>} Parsed JSON response from the function.
 */
export async function setScoreDisplayName(payload) {
  return callScoreFunction('set-score-display-name', payload);
}

/**
 * Set the display name for all score rows belonging to a play session via the
 * `set-score-display-name-by-session` Supabase Edge Function.
 * @param {object} payload - Payload containing session_id and display_name.
 * @returns {Promise<object>} Parsed JSON response from the function.
 */
export async function setScoreDisplayNameBySession(payload) {
  return callScoreFunction('set-score-display-name-by-session', payload);
}




