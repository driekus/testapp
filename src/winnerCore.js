/**
 * Resolve game slug from the URL search string.
 * @param {string} search - `window.location.search` string.
 * @returns {string} Slug value, or an empty string when absent.
 */
export function getWinnerSlug(search) {
  const params = new URLSearchParams(search);
  return params.get('slug') || '';
}

/**
 * Validate winner form fields.
 * @param {string} name - Player name entered in the form.
 * @param {string} phone - Phone number entered in the form.
 * @returns {{ valid: boolean, firstMissing: 'name' | 'phone' | null }}
 */
export function validateWinnerFields(name, phone) {
  const trimmedName = String(name || '').trim();
  const trimmedPhone = String(phone || '').trim();
  if (!trimmedName) return { valid: false, firstMissing: 'name' };
  if (!trimmedPhone) return { valid: false, firstMissing: 'phone' };
  return { valid: true, firstMissing: null };
}

/**
 * Build the request payload for the `save-winner-details` Edge Function.
 * @param {object} params
 * @param {string} params.paymentToken - Verified payment token for the game session.
 * @param {string} params.slug - Game slug.
 * @param {string} params.name - Player name.
 * @param {string} params.phone - Player phone number.
 * @returns {{ payment_token: string, game_slug: string, player_name: string, player_phone: string }}
 */
export function buildWinnerSavePayload({ paymentToken, slug, name, phone }) {
  return {
    payment_token: paymentToken,
    game_slug: slug,
    player_name: String(name || '').trim(),
    player_phone: String(phone || '').trim(),
  };
}

