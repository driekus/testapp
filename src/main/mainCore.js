/**
 * Return remaining cooldown in milliseconds before another letter can be granted.
 * @param {number} lastLetterGrantedAt
 * @param {number} now
 * @param {number} cooldownMs
 * @returns {number}
 */
export function computeRemainingCooldownMs(lastLetterGrantedAt, now, cooldownMs) {
  return Math.max(0, Number(cooldownMs) - (Number(now) - Number(lastLetterGrantedAt)));
}

/**
 * Normalize a route by removing consecutive duplicate coordinates.
 * @param {Array<{lat:number,lng:number}>} route
 * @returns {Array}
 */
export function normalizeRoute(route) {
  if (!Array.isArray(route)) return [];
  return route.filter((loc, i, arr) => i === 0 || !(arr[i - 1].lat === loc.lat && arr[i - 1].lng === loc.lng));
}

/**
 * Append next location only when it is not a duplicate of the current tail.
 * Returns true when appended.
 * @param {Array<{lat:number,lng:number}>} route
 * @param {{lat:number,lng:number}|null|undefined} next
 * @returns {boolean}
 */
export function appendNextLocation(route, next) {
  if (!Array.isArray(route) || !next) return false;
  const last = route[route.length - 1];
  if (last?.lat === next.lat && last?.lng === next.lng) return false;
  route.push(next);
  return true;
}

/**
 * Decide whether location tracking should auto-resume for restored sessions.
 * @param {{currentLocationIndex:number,collectedLetters:Array,routeComplete:boolean}} state
 * @returns {boolean}
 */
export function shouldAutoResumeTracking(state) {
  return (
    Number(state?.currentLocationIndex) > 0 ||
    Array.isArray(state?.collectedLetters) && state.collectedLetters.length > 0 ||
    Boolean(state?.routeComplete)
  );
}

