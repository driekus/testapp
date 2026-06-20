import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient.js';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120000;

const euro = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Build the localStorage key for a game's payment token.
 * @param {string} slug - Game slug.
 * @returns {string}
 */
export const PAYMENT_KEY = (slug) => `letter-quest-payment-${slug}`;

/**
 * Format an amount in cents as a localized Euro string.
 * @param {number} cents
 * @returns {string} e.g. "€ 2,50"
 */
export function formatEuro(cents) {
  return euro.format((Number(cents) || 0) / 100);
}

/**
 * Retrieve a stored payment token for a game from localStorage.
 * @param {string} slug - Game slug.
 * @returns {string | null} Stored token or null when not found.
 */
export function getStoredPaymentToken(slug) {
  if (!slug) return null;
  try {
    return localStorage.getItem(PAYMENT_KEY(slug));
  } catch {
    return null;
  }
}

/**
 * Persist a payment token for a game in localStorage.
 * @param {string} slug - Game slug.
 * @param {string} token - Payment token to store.
 */
export function storePaymentToken(slug, token) {
  if (!slug || !token) return;
  try {
    localStorage.setItem(PAYMENT_KEY(slug), token);
  } catch {
    // Ignore unavailable storage in private mode.
  }
}

/**
 * Remove a stored payment token for a game from localStorage.
 * @param {string} slug - Game slug.
 */
export function clearStoredPaymentToken(slug) {
  if (!slug) return;
  try {
    localStorage.removeItem(PAYMENT_KEY(slug));
  } catch {
    // Ignore unavailable storage in private mode.
  }
}

/**
 * POST to a Supabase Edge Function and return the parsed JSON body.
 * Throws when the response is not OK.
 * @param {string} name - Edge Function name.
 * @param {object} payload - Request body.
 * @returns {Promise<object>}
 */
async function callFunction(name, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
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
 * Verify whether a stored payment token is still valid and unplayed.
 * @param {string} slug - Game slug.
 * @param {string} token - Payment token to verify.
 * @returns {Promise<{ paid: boolean, payment_token: string | null, played: boolean }>}
 */
export async function verifyPaymentToken(slug, token) {
  if (!slug || !token) return { paid: false, payment_token: null, played: false };
  return callFunction('check-payment', { game_slug: slug, payment_token: token });
}

/**
 * Initiate a payment for a game by redirecting the browser to the payment provider URL.
 * @param {string} slug - Game slug.
 * @returns {Promise<void>}
 */
export async function startPayment(slug) {
  const json = await callFunction('create-payment', { game_slug: slug });
  if (!json?.url) throw new Error('No payment URL returned');
  window.location.href = json.url;
}

/**
 * Poll the payment status at regular intervals until paid or until the timeout expires.
 * @param {string} slug - Game slug.
 * @param {string} paymentRequestToken - Token returned by the payment provider redirect.
 * @param {(token: string) => void} onPaid - Callback invoked with the payment token once paid.
 * @returns {Promise<{ paid: boolean, payment_token: string }>}
 * @throws {Error} When the polling timeout is reached without a confirmed payment.
 */
export async function pollUntilPaid(slug, paymentRequestToken, onPaid) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const json = await callFunction('check-payment', {
      game_slug: slug,
      payment_request_token: paymentRequestToken,
    });

    if (json.paid && json.payment_token) {
      if (onPaid) onPaid(json.payment_token);
      return json;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Payment confirmation timed out');
}

/**
 * Mark a game session as played after the player has finished.
 * @param {string} paymentToken - Verified payment token.
 * @param {string} slug - Game slug.
 * @param {string} name - Player name.
 * @param {string} phone - Player phone number.
 * @param {string[]} letters - Letters collected during the game.
 * @returns {Promise<object>}
 */
export async function markPlayed(paymentToken, slug, name, phone, letters) {
  return callFunction('mark-played', {
    payment_token: paymentToken,
    game_slug: slug,
    player_name: name,
    player_phone: phone,
    letters_collected: letters,
  });
}

