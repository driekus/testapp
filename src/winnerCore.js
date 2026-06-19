/**
 * Resolve game slug from URL search string.
 * @param {string} search
 * @returns {string}
 */
export function getWinnerSlug(search) {
  const params = new URLSearchParams(search);
  return params.get('slug') || '';
}

/**
 * Validate winner form fields.
 * @param {string} name
 * @param {string} phone
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
 * Build request payload for save-winner-details.
 * @param {object} params
 * @param {string} params.paymentToken
 * @param {string} params.slug
 * @param {string} params.name
 * @param {string} params.phone
 */
export function buildWinnerSavePayload({ paymentToken, slug, name, phone }) {
  return {
    payment_token: paymentToken,
    game_slug: slug,
    player_name: String(name || '').trim(),
    player_phone: String(phone || '').trim(),
  };
}

