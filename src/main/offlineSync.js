import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../supabaseClient.js';

const OFFLINE_CACHE_KEY_PREFIX = 'letter-quest-offline-cache-';
const OFFLINE_CACHE_KEY_MATERIAL_PREFIX = 'letter-quest-offline-cache-key-';
const CACHE_EXPIRY_DAYS = 7;
const CACHE_EXPIRY_MS = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const OFFLINE_CACHE_VERSION = 2;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Get the local storage key for a game's offline cache.
 * @param {string} slug - Game slug.
 * @returns {string}
 */
function getCacheKey(slug) {
  return `${OFFLINE_CACHE_KEY_PREFIX}${slug}`;
}

/**
 * Get the local storage key for per-game encryption key material.
 * @param {string} slug
 * @returns {string}
 */
function getCacheKeyMaterialStorageKey(slug) {
  return `${OFFLINE_CACHE_KEY_MATERIAL_PREFIX}${slug}`;
}

/**
 * Encode bytes to Base64 in both browser and Node test runtimes.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Decode Base64 into bytes in both browser and Node test runtimes.
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64ToBytes(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Return true when Web Crypto AES-GCM is available.
 * @returns {boolean}
 */
function hasWebCryptoAes() {
  return Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues);
}

/**
 * Load or create per-game AES key material and import it for crypto operations.
 * @param {string} slug
 * @param {boolean} createIfMissing
 * @returns {Promise<CryptoKey | null>}
 */
async function getOfflineCacheCryptoKey(slug, createIfMissing) {
  if (!hasWebCryptoAes()) return null;

  const keyStorageKey = getCacheKeyMaterialStorageKey(slug);
  let keyMaterialBase64 = null;

  try {
    keyMaterialBase64 = localStorage.getItem(keyStorageKey);
  } catch {
    return null;
  }

  if (!keyMaterialBase64) {
    if (!createIfMissing) return null;
    const rawKey = new Uint8Array(32);
    crypto.getRandomValues(rawKey);
    keyMaterialBase64 = bytesToBase64(rawKey);
    try {
      localStorage.setItem(keyStorageKey, keyMaterialBase64);
    } catch {
      return null;
    }
  }

  try {
    const rawKey = base64ToBytes(keyMaterialBase64);
    return await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } catch {
    return null;
  }
}

/**
 * Encrypt cache payload before persisting to localStorage.
 * @param {string} slug
 * @param {{ game: object, timestamp: number, expiresAt: number }} payload
 * @returns {Promise<object>}
 */
async function encryptCachePayload(slug, payload) {
  const cryptoKey = await getOfflineCacheCryptoKey(slug, true);
  if (!cryptoKey) {
    throw new Error('Offline encryption is unavailable in this browser');
  }

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    textEncoder.encode(JSON.stringify(payload)),
  );

  return {
    version: OFFLINE_CACHE_VERSION,
    encrypted: true,
    timestamp: payload.timestamp,
    expiresAt: payload.expiresAt,
    iv: bytesToBase64(iv),
    payload: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
}

/**
 * Decrypt previously encrypted cache payload.
 * @param {string} slug
 * @param {object} envelope
 * @returns {Promise<{ game: object, timestamp: number, expiresAt: number } | null>}
 */
async function decryptCachePayload(slug, envelope) {
  if (!envelope || envelope.encrypted !== true) {
    // Backward compatibility for old plain-text cache values.
    if (envelope && envelope.game && envelope.expiresAt) {
      return {
        game: envelope.game,
        timestamp: Number(envelope.timestamp) || Date.now(),
        expiresAt: Number(envelope.expiresAt),
      };
    }
    return null;
  }

  const cryptoKey = await getOfflineCacheCryptoKey(slug, false);
  if (!cryptoKey) return null;

  try {
    const iv = base64ToBytes(String(envelope.iv || ''));
    const ciphertext = base64ToBytes(String(envelope.payload || ''));
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext,
    );
    const decoded = JSON.parse(textDecoder.decode(plainBuffer));
    if (!decoded?.game || !decoded?.expiresAt) return null;
    return {
      game: decoded.game,
      timestamp: Number(decoded.timestamp) || Date.now(),
      expiresAt: Number(decoded.expiresAt),
    };
  } catch {
    return null;
  }
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

    const encryptedPayload = await encryptCachePayload(slug, cacheData);

    // Store encrypted payload in localStorage.
    try {
      localStorage.setItem(getCacheKey(slug), JSON.stringify(encryptedPayload));
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
export async function isGameCached(slug) {
  if (!slug) return false;

  try {
    const raw = localStorage.getItem(getCacheKey(slug));
    if (!raw) return false;

    const envelope = JSON.parse(raw);
    const cache = await decryptCachePayload(slug, envelope);
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
export async function loadCachedGame(slug) {
  if (!slug) return null;

  try {
    const raw = localStorage.getItem(getCacheKey(slug));
    if (!raw) return null;

    const envelope = JSON.parse(raw);
    const cache = await decryptCachePayload(slug, envelope);
    if (!isCacheValid(cache)) {
      // Clean up expired cache
      localStorage.removeItem(getCacheKey(slug));
      localStorage.removeItem(getCacheKeyMaterialStorageKey(slug));
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
export async function getCacheExpiryString(slug) {
  if (!slug) return null;

  try {
    const raw = localStorage.getItem(getCacheKey(slug));
    if (!raw) return null;

    const envelope = JSON.parse(raw);
    const cache = await decryptCachePayload(slug, envelope);
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
    localStorage.removeItem(getCacheKeyMaterialStorageKey(slug));
  } catch {
    // Ignore errors
  }
}

