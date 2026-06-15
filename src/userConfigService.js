import { sanitizeRoute } from './config.js'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js'

const FETCH_TIMEOUT_MS = 6000

function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Supabase request timed out after ${ms}ms`)), ms),
  )
  return Promise.race([promise, timeout])
}

// ─── Games ────────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<Array<{slug: string, display_name: string}>>}
 */
export async function listGames() {
  if (!supabase) return []

  const { data, error } = await withTimeout(
    supabase.from('games').select('slug, display_name').order('display_name'),
    FETCH_TIMEOUT_MS,
  )
  if (error) throw error
  return data ?? []
}

/**
 * Fetch a game (with all its routes ordered by order_index). No sign-in required.
 * Returns null when the game does not exist.
 * @param {string} slug
 * @returns {Promise<{id: string, slug: string, display_name: string, routes: Array} | null>}
 */
export async function fetchGameWithRoutes(slug) {
  if (!supabase) return null

  const { data, error } = await withTimeout(
    supabase
      .from('games')
      .select('id, slug, display_name, routes(id, order_index, display_name, route)')
      .eq('slug', slug)
      .maybeSingle(),
    FETCH_TIMEOUT_MS,
  )
  if (error) throw error
  if (!data) return null

  const routes = (data.routes ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map((r) => ({ ...r, route: sanitizeRoute(r.route) }))

  return { id: data.id, slug: data.slug, display_name: data.display_name, routes }
}

/**
 * Fetch a game for the play client via Edge Function — only safe fields are returned.
 * Each route contains only its first location (name, lat, lng, question, max_attempts).
 * Subsequent locations are revealed by Edge Functions as the player progresses.
 * The full route (answers, letters, future locations) never reaches the browser.
 * @param {string} slug
 * @returns {Promise<{id: string, slug: string, display_name: string, routes: Array} | null>}
 */
export async function fetchGameForPlay(slug) {
  const res = await withTimeout(
    fetch(`${SUPABASE_URL}/functions/v1/get-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ slug }),
    }),
    FETCH_TIMEOUT_MS,
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json.game ?? null
}

/**
 * Fetch the first (safe) location of a route via Edge Function.
 * Called when the player starts the next route.
 * @param {string} routeId
 * @returns {Promise<{name, lat, lng, question, max_attempts}>}
 */
export async function fetchRouteStart(routeId) {
  const res = await withTimeout(
    fetch(`${SUPABASE_URL}/functions/v1/get-route-start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ route_id: routeId }),
    }),
    FETCH_TIMEOUT_MS,
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json.location
}

/**
 * Create or update a game's metadata (slug + display_name only).
 * @param {string} slug
 * @param {string} displayName
 * @returns {Promise<string>} the game's uuid
 */
export async function saveGame(slug, displayName) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('games')
    .upsert(
      { slug, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/**
 * Delete a game (cascades to its routes).
 * @param {string} slug
 */
export async function deleteGame(slug) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('games').delete().eq('slug', slug)
  if (error) throw error
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Create a new route for a game.
 * @param {string} gameId
 * @param {string} displayName
 * @param {Array} route  5-location array
 * @param {number} orderIndex
 * @returns {Promise<{id: string, order_index: number, display_name: string, route: Array}>}
 */
export async function createRoute(gameId, displayName, route, orderIndex) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase
    .from('routes')
    .insert({
      game_id: gameId,
      order_index: orderIndex,
      display_name: displayName,
      route: sanitizeRoute(route),
      updated_at: new Date().toISOString(),
    })
    .select('id, order_index, display_name, route')
    .single()

  if (error) throw error
  return { ...data, route: sanitizeRoute(data.route) }
}

/**
 * Update an existing route.
 * @param {string} routeId
 * @param {string} displayName
 * @param {Array} route
 */
export async function saveRoute(routeId, displayName, route) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase
    .from('routes')
    .update({
      display_name: displayName,
      route: sanitizeRoute(route),
      updated_at: new Date().toISOString(),
    })
    .eq('id', routeId)

  if (error) throw error
}

/**
 * Delete a route by id.
 * @param {string} routeId
 */
export async function deleteRoute(routeId) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.from('routes').delete().eq('id', routeId)
  if (error) throw error
}

// kept for backwards compat with admin.js delete-game flow
export { deleteGame as deleteGameBySlug }

// ─── Storage ──────────────────────────────────────────────────────────────────

const IMAGE_BUCKET = 'location-images'

/**
 * Upload an image for a specific location and return its public URL.
 * Path: <gameSlug>/<routeId>/<locationIndex>-<timestamp>.<ext>
 * @param {File} file
 * @param {string} gameSlug
 * @param {string} routeId  uuid of the route row (or 'new' before first save)
 * @param {number} locationIndex
 * @returns {Promise<string>} public URL
 */
export async function uploadLocationImage(file, gameSlug, routeId, locationIndex) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
  const path = `${gameSlug}/${routeId}/${locationIndex}-${Date.now()}.${ext}`

  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(data.path)

  return publicUrl
}

/**
 * Delete an image by its public URL (best-effort — does not throw on 404).
 * @param {string} publicUrl
 */
export async function deleteLocationImage(publicUrl) {
  if (!supabase || !publicUrl) return

  // Extract the storage path from the public URL
  const marker = `/object/public/${IMAGE_BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return

  const path = publicUrl.slice(idx + marker.length)
  await supabase.storage.from(IMAGE_BUCKET).remove([path])
}
