const MOBILE_USER_AGENT_RE = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i;

/**
 * Detect whether a user agent should be treated as mobile.
 * @param {string} userAgent
 * @returns {boolean}
 */
export function isMobileUserAgent(userAgent) {
  return MOBILE_USER_AGENT_RE.test(String(userAgent ?? ''));
}

/**
 * Redirect non-mobile browsers to the mobile-only informational page.
 * Returns true when a redirect is triggered.
 * @param {{ userAgent?: string, location?: { replace: (path: string) => void }, mobileOnlyPath?: string }} [options]
 * @returns {boolean}
 */
export function enforceMobileOnly(options = {}) {
  const userAgent = options.userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const locationRef = options.location
    ?? (typeof window !== 'undefined' ? window.location : null);
  const mobileOnlyPath = options.mobileOnlyPath ?? '/mobile-only.html';

  if (isMobileUserAgent(userAgent) || !locationRef?.replace) {
    return false;
  }

  locationRef.replace(mobileOnlyPath);
  return true;
}
