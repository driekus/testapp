import { defaultConfig, sanitizeRoute } from './config.js'
import { supabase } from './supabaseClient.js'

const SHARED_TABLE = 'shared_config'
const SHARED_ROW_ID = 1
const TABLE_NAME = 'user_configs'

const FETCH_TIMEOUT_MS = 6000

function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Supabase request timed out after ${ms}ms`)), ms),
  )
  return Promise.race([promise, timeout])
}

/**
 * Fetch the shared route config — no sign-in required.
 * Falls back to defaults on timeout or error.
 */
export async function fetchSharedConfig() {
  const fallback = defaultConfig()
  if (!supabase) return fallback

  const query = supabase
    .from(SHARED_TABLE)
    .select('route')
    .eq('id', SHARED_ROW_ID)
    .maybeSingle()

  const { data, error } = await withTimeout(query, FETCH_TIMEOUT_MS)

  if (error) throw error
  if (!data) return fallback

  return { route: sanitizeRoute(data.route) }
}

/**
 * Save the shared route config — requires a signed-in admin user.
 */
export async function saveSharedConfig(config) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const nextConfig = { route: sanitizeRoute(config.route) }

  const { error } = await supabase.from(SHARED_TABLE).upsert(
    { id: SHARED_ROW_ID, route: nextConfig.route, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  )

  if (error) throw error
  return nextConfig
}

export async function fetchUserConfig(userId) {
  const fallback = defaultConfig()
  if (!supabase || !userId) {
    return fallback
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('route')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return fallback
  }

  return {
    route: sanitizeRoute(data.route),
  }
}

export async function saveUserConfig(userId, config) {
  if (!supabase || !userId) {
    throw new Error('You must be signed in and Supabase must be configured.')
  }

  const nextConfig = {
    route: sanitizeRoute(config.route),
  }

  const { error } = await supabase.from(TABLE_NAME).upsert(
    {
      user_id: userId,
      route: nextConfig.route,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw error
  }

  return nextConfig
}


