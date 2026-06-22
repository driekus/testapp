import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../supabaseClient.js';

const OFFLINE_CACHE_KEY_PREFIX = 'letter-quest-offline-cache-';
const CACHE_EXPIRY_DAYS = 7;
const CACHE_EXPIRY_MS = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Get the local storage key for a game's offline cache.
 * @param {string} slug - Game slug.
 * @returns {string}
 */
function getCacheKey(slug) {
  return `${OFFLINE_CACHE_KEY_PREFIX}${slug}`;
}

/**
 * Check if a cached game is still valid (not expired).
 * @param {object} cache - Cached game object.
 * @returns {boolean}
 */
function isCacheValid(cache) {
  if (!cache || !cache.expiresAt) return false;
  return Date.now() < cache.expiresAt;
}

/**
 * Download a game for offline play and store it in localStorage.
 * Fetches full game data via get-game-full Edge Function.
 * @param {string} slug - Game slug.
 * @param {string | null} [paymentToken] - Payment token if game requires payment.
 * @returns {Promise<{ success: boolean, expiresAt: number, error?: string }>}
 */
export async function downloadGameOffline(slug, paymentToken = null) {
  if (!slug) {
    return { success: false, error: 'Missing game slug' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-game-full`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        slug,
        offline_download: true,
        payment_token: paymentToken,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      return { success: false, error: json.error ?? res.statusText };
    }

    if (!json.game) {
      return { success: false, error: 'No game data returned' };
    }

    const expiresAt = Date.now() + CACHE_EXPIRY_MS;
    const cacheData = {
      game: json.game,
      timestamp: Date.now(),
      expiresAt,
    };

    // Store in localStorage
    try {
      localStorage.setItem(getCacheKey(slug), JSON.stringify(cacheData));
    } catch (err) {
      return { success: false, error: 'Failed to store cache: ' + String(err) };
    }

    return { success: true, expiresAt };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Check if a game is cached and still valid.
 * @param {string} slug - Game slug.
 * @returns {boolean}
 */
export function isGameCached(slug) {
  if (!slug) return false;

  try {
    const raw = localStorage.getItem(getCacheKey(slug));
    if (!raw) return false;

    const cache = JSON.parse(raw);
    return isCacheValid(cache);
  } catch {
    return false;
  }
}

/**
 * Load a cached game from localStorage.
 * Returns null if not cached or expired.
 * @param {string} slug - Game slug.
 * @returns {{ game: object, expiresAt: number } | null}
 */
export function loadCachedGame(slug) {
  if (!slug) return null;

  try {
    const raw = localStorage.getItem(getCacheKey(slug));
    if (!raw) return null;

    const cache = JSON.parse(raw);
    if (!isCacheValid(cache)) {
      // Clean up expired cache
      localStorage.removeItem(getCacheKey(slug));
      return null;
    }

    return {
      game: cache.game,
      expiresAt: cache.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Get the formatted expiry date/time string for a cached game.
 * @param {string} slug - Game slug.
 * @returns {string | null} Human-readable expiry date or null if not cached.
 */
export function getCacheExpiryString(slug) {
  if (!slug) return null;

  try {
    const raw = localStorage.getItem(getCacheKey(slug));
    if (!raw) return null;

    const cache = JSON.parse(raw);
    if (!isCacheValid(cache)) return null;

    const expiryDate = new Date(cache.expiresAt);
    return expiryDate.toLocaleDateString() + ' ' + expiryDate.toLocaleTimeString();
  } catch {
    return null;
  }
}

/**
 * Clear cached offline game data.
 * @param {string} slug - Game slug.
 */
export function clearGameCache(slug) {
  if (!slug) return;

  try {
    localStorage.removeItem(getCacheKey(slug));
  } catch {
    // Ignore errors
  }
}

