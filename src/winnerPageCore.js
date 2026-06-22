/**
 * Validate winner page access preconditions and return redirect info when missing.
 * @param {{slug:string,paymentToken:string|null}} params
 * @returns {{ok:true}|{ok:false,redirectTo:string,error:string}}
 */
export function resolveWinnerAccess(params) {
  const slug = String(params?.slug ?? '').trim();
  const paymentToken = params?.paymentToken ? String(params.paymentToken) : '';

  if (!slug) {
    return { ok: false, redirectTo: '/', error: 'no slug' };
  }
  if (!paymentToken) {
    return { ok: false, redirectTo: `/${slug}`, error: 'no token' };
  }
  return { ok: true };
}

/**
 * Pick the best error message for winner-save failures.
 * @param {any} json
 * @param {string} statusText
 * @param {string} fallback
 * @returns {string}
 */
export function resolveWinnerSaveError(json, statusText, fallback) {
  return String(json?.error || statusText || fallback);
}

/**
 * Best-effort persist winner details in sessionStorage.
 * @param {Storage} storage
 * @param {{name:string,phone:string}} details
 */
export function storeWinnerDetails(storage, details) {
  try {
    storage.setItem('letter-quest-winner-details', JSON.stringify(details));
  } catch {
    // Ignore unavailable storage.
  }
}

