export const DEFAULT_ROUTE = [
  { name: 'Start Gate', lat: 52.3676, lng: 4.9041, letter: 'S' },
  { name: 'Canal Bridge', lat: 52.3702, lng: 4.8952, letter: 'C' },
  { name: 'Old Square', lat: 52.3731, lng: 4.8922, letter: 'O' },
  { name: 'Museum Point', lat: 52.3584, lng: 4.8811, letter: 'M' },
  { name: 'Finish Park', lat: 52.3549, lng: 4.891, letter: 'F' },
]

function sanitizeLetter(value, index) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

  return normalized.slice(0, 1) || DEFAULT_ROUTE[index].letter
}

function sanitizePoint(point, index) {
  const lat = Number(point?.lat)
  const lng = Number(point?.lng)
  const name = String(point?.name || `Location ${index + 1}`).trim()

  return {
    name: name || `Location ${index + 1}`,
    lat: Number.isFinite(lat) ? lat : DEFAULT_ROUTE[index].lat,
    lng: Number.isFinite(lng) ? lng : DEFAULT_ROUTE[index].lng,
    letter: sanitizeLetter(point?.letter, index),
  }
}

export function sanitizeRoute(candidateRoute) {
  if (!Array.isArray(candidateRoute) || candidateRoute.length !== 5) {
    return DEFAULT_ROUTE.map((point) => ({ ...point }))
  }

  return candidateRoute.map((point, index) => sanitizePoint(point, index))
}

export function defaultConfig() {
  return {
    route: DEFAULT_ROUTE.map((point) => ({ ...point })),
  }
}


