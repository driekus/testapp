/**
 * Validate latitude/longitude values for a route row.
 * Throws translated errors when invalid.
 * @param {number} lat
 * @param {number} lng
 * @param {number} index
 * @param {(key:string, params?:Record<string, unknown>) => string} ta
 */
export function validateCoordinateRange(lat, lng, index, ta) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(ta('rowLatLngNumbers', { row: index + 1 }));
  if (lat < -90 || lat > 90) throw new Error(ta('rowLatRange', { row: index + 1 }));
  if (lng < -180 || lng > 180) throw new Error(ta('rowLngRange', { row: index + 1 }));
}

/**
 * Normalize and validate the route letter value for a row.
 * @param {string} letter
 * @param {number} index
 * @param {(key:string, params?:Record<string, unknown>) => string} ta
 * @returns {string}
 */
export function normalizeRouteLetter(letter, index, ta) {
  const n = String(letter || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!n) throw new Error(ta('rowLetterRange', { row: index + 1 }));
  return n.slice(0, 1);
}

/**
 * Clamp editable location count between 1 and configured max.
 * @param {number} raw
 * @param {number} maxRouteLocations
 * @returns {number}
 */
export function clampLocationCount(raw, maxRouteLocations) {
  return Math.max(1, Math.min(maxRouteLocations, Math.floor(raw) || 1));
}

/**
 * Resize route point array while preserving existing values.
 * New points are created from blankRoute and letter-cycled from current length.
 * @param {Array} current
 * @param {number} newCount
 * @param {(length:number)=>Array<{letter:string}>} blankRoute
 * @returns {Array}
 */
export function resizeRoutePoints(current, newCount, blankRoute) {
  const currentList = Array.isArray(current) ? current : [];
  if (newCount === currentList.length) return currentList;

  if (newCount > currentList.length) {
    const extra = blankRoute(newCount - currentList.length).map((p, i) => ({
      ...p,
      letter: String.fromCharCode(65 + ((currentList.length + i) % 26)),
    }));
    return [...currentList, ...extra];
  }

  return currentList.slice(0, newCount);
}

