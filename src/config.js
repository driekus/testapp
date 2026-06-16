/** Default number of locations per route when creating a new one. Change freely. */
export const DEFAULT_ROUTE_LENGTH = 5

/** Hard upper limit accepted from the database / admin form. */
export const MAX_ROUTE_LOCATIONS = 100

export const DEFAULT_ROUTE = [
  { name: 'Start Gate',   lat: 52.3676, lng: 4.9041, letter: 'S' },
  { name: 'Canal Bridge', lat: 52.3702, lng: 4.8952, letter: 'C' },
  { name: 'Old Square',   lat: 52.3731, lng: 4.8922, letter: 'O' },
  { name: 'Museum Point', lat: 52.3584, lng: 4.8811, letter: 'M' },
  { name: 'Finish Park',  lat: 52.3549, lng: 4.891,  letter: 'F' },
]

// Fallback values for locations beyond DEFAULT_ROUTE's length
const FALLBACK_POINT = { lat: 52.3676, lng: 4.9041, letter: 'A' }

function sanitizeLetter(value, index) {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (normalized) return normalized.slice(0, 1)
  const fallback = DEFAULT_ROUTE[index] ?? FALLBACK_POINT
  return fallback.letter
}

function sanitizePoint(point, index) {
  const fallback = DEFAULT_ROUTE[index] ?? FALLBACK_POINT
  const lat = Number(point?.lat)
  const lng = Number(point?.lng)
  const name = String(point?.name || `Location ${index + 1}`).trim()
  return {
    name: name || `Location ${index + 1}`,
    lat: Number.isFinite(lat) ? lat : fallback.lat,
    lng: Number.isFinite(lng) ? lng : fallback.lng,
    letter: sanitizeLetter(point?.letter, index),
    image_url: typeof point?.image_url === 'string' ? point.image_url : '',
    description: typeof point?.description === 'string' ? point.description.trim() : '',
    question: typeof point?.question === 'string' ? point.question.trim() : '',
    answer: typeof point?.answer === 'string' ? point.answer.trim() : '',
    max_attempts: Number.isFinite(Number(point?.max_attempts)) && Number(point?.max_attempts) > 0
      ? Math.floor(Number(point.max_attempts))
      : 0,
  }
}

/**
 * Sanitize a route array coming from the database or form.
 * Accepts any length from 1 to MAX_ROUTE_LOCATIONS; falls back to DEFAULT_ROUTE
 * only when the input is not a non-empty array.
 */
export function sanitizeRoute(candidateRoute) {
  if (!Array.isArray(candidateRoute) || candidateRoute.length < 1) {
    return DEFAULT_ROUTE.map((p) => ({ ...p }))
  }
  return candidateRoute
    .slice(0, MAX_ROUTE_LOCATIONS)
    .map((point, index) => sanitizePoint(point, index))
}

export function defaultConfig() {
  return {
    route: DEFAULT_ROUTE.slice(0, DEFAULT_ROUTE_LENGTH).map((p) => ({ ...p })),
  }
}

/** Build a blank route of `length` items, cycling through A-Z for letters. */
export function blankRoute(length) {
  return Array.from({ length }, (_, i) => ({
    name: `Location ${i + 1}`,
    lat: FALLBACK_POINT.lat,
    lng: FALLBACK_POINT.lng,
    letter: String.fromCharCode(65 + (i % 26)),
  }))
}
