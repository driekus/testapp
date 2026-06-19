import { sanitizeRoute } from './config.js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';

const FETCH_TIMEOUT_MS = 6000;
const GAME_STYLE_FIELDS = [
  'primary_color',
  'primary_text_color',
  'primary_hover_color',
  'bg_color',
  'text_color',
  'text_muted_color',
  'text_hint_color',
  'card_bg_color',
  'card_border_color',
  'accent_color_teal',
  'accent_color_amber',
  'accent_text_amber',
  'accent_bg_blue',
  'accent_border_blue',
  'accent_text_blue',
  'input_border_color',
  'input_bg_color',
  'input_text_color',
  'dark_bg_color',
  'dark_text_color',
  'dark_card_bg_color',
  'dark_card_border_color',
  'dark_input_bg_color',
  'dark_input_border_color',
  'dark_accent_bg_blue',
  'dark_accent_border_blue',
  'dark_accent_text_blue',
  'font_family',
  'border_radius_sm',
  'border_radius_md',
  'border_radius_lg',
];

let runtimeSupabase = supabase;
let runtimeSupabaseUrl = SUPABASE_URL;
let runtimeSupabaseAnonKey = SUPABASE_ANON_KEY;

/**
 * Override runtime dependencies (used by tests).
 * @param {{supabase?: any, supabaseUrl?: string, supabaseAnonKey?: string}} deps
 */
export function setUserConfigServiceRuntimeDeps(deps = {}) {
  if (Object.prototype.hasOwnProperty.call(deps, 'supabase')) {
    runtimeSupabase = deps.supabase;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'supabaseUrl')) {
    runtimeSupabaseUrl = deps.supabaseUrl;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'supabaseAnonKey')) {
    runtimeSupabaseAnonKey = deps.supabaseAnonKey;
  }
}

function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Supabase request timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

// ─── Games ────────────────────────────────────────────────────────────────────

/**
 * @returns {Promise<Array<{slug: string, display_name: string, requires_payment: boolean, price_in_cents: number}>>}
 */
export async function listGames() {
  if (!runtimeSupabaseUrl || !runtimeSupabaseAnonKey) return [];

  const res = await withTimeout(
    fetch(
      `${runtimeSupabaseUrl}/rest/v1/games?select=slug,display_name,requires_payment,price_in_cents&order=display_name.asc`,
      {
        headers: {
          apikey: runtimeSupabaseAnonKey,
          Authorization: `Bearer ${runtimeSupabaseAnonKey}`,
          'Cache-Control': 'no-cache',
        },
      },
    ),
    FETCH_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Fetch a game (with all its routes ordered by order_index). No sign-in required.
 * Returns null when the game does not exist.
 * @param {string} slug
 * @returns {Promise<{id: string, slug: string, display_name: string, routes: Array} | null>}
 */
export async function fetchGameWithRoutes(slug) {
  if (!runtimeSupabase) return null;

  const { data, error } = await withTimeout(
    runtimeSupabase
      .from('games')
      .select('id, slug, display_name, logo_url, requires_payment, price_in_cents, routes(id, order_index, display_name, route)')
      .eq('slug', slug)
      .maybeSingle(),
    FETCH_TIMEOUT_MS,
  );
  if (error) throw error;
  if (!data) return null;

  const routes = (data.routes ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map((r) => ({ ...r, route: sanitizeRoute(r.route) }));

  return {
    id: data.id,
    slug: data.slug,
    display_name: data.display_name,
    logo_url: data.logo_url ?? '',
    requires_payment: data.requires_payment ?? false,
    price_in_cents: data.price_in_cents ?? 0,
    routes,
  };
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
    fetch(`${runtimeSupabaseUrl}/functions/v1/get-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runtimeSupabaseAnonKey}`,
      },
      body: JSON.stringify({ slug }),
    }),
    FETCH_TIMEOUT_MS,
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.game ?? null;
}

/**
 * Fetch the first (safe) location of a route via Edge Function.
 * Called when the player starts the next route.
 * @param {string} routeId
 * @param {string | null} paymentToken
 * @returns {Promise<{name, lat, lng, question, max_attempts}>}
 */
export async function fetchRouteStart(routeId, paymentToken = null) {
  const res = await withTimeout(
    fetch(`${runtimeSupabaseUrl}/functions/v1/get-route-start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runtimeSupabaseAnonKey}`,
      },
      body: JSON.stringify({ route_id: routeId, payment_token: paymentToken }),
    }),
    FETCH_TIMEOUT_MS,
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.location;
}

/**
 * Create or update a game's metadata.
 * @param {string} slug
 * @param {string} displayName
 * @param {boolean} [requiresPayment=false]
 * @param {number} [priceInCents=0]
 * @returns {Promise<string>} the game's uuid
 */
export async function saveGame(slug, displayName, requiresPayment = false, priceInCents = 0) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const { data, error } = await runtimeSupabase
    .from('games')
    .upsert(
      {
        slug,
        display_name: displayName,
        requires_payment: Boolean(requiresPayment),
        price_in_cents: Math.max(0, Math.round(Number(priceInCents) || 0)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Save only the logo_url for a game.
 * @param {string} slug
 * @param {string} logoUrl
 */
export async function saveGameLogo(slug, logoUrl) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const { error } = await runtimeSupabase
    .from('games')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('slug', slug);

  if (error) throw error;
}

/**
 * Delete a game (cascades to its routes).
 * @param {string} slug
 */
export async function deleteGame(slug) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const { error } = await runtimeSupabase.from('games').delete().eq('slug', slug);
  if (error) throw error;
}

/**
 * Fetch per-game CSS variable settings from game_styles.
 * Returns null when no row exists yet.
 * @param {string} gameId
 */
export async function fetchGameStyles(gameId) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const selectFields = `game_id, ${GAME_STYLE_FIELDS.join(',')}`;
  const { data, error } = await runtimeSupabase
    .from('game_styles')
    .select(selectFields)
    .eq('game_id', gameId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Create or update per-game CSS variable settings.
 * @param {string} gameId
 * @param {Record<string, string>} styles
 */
export async function saveGameStyles(gameId, styles) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const payload = {
    game_id: gameId,
    updated_at: new Date().toISOString(),
  };

  for (const key of GAME_STYLE_FIELDS) {
    if (styles[key] !== undefined) {
      payload[key] = styles[key];
    }
  }

  const { error } = await runtimeSupabase
    .from('game_styles')
    .upsert(payload, { onConflict: 'game_id' });

  if (error) throw error;
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
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const { data, error } = await runtimeSupabase
    .from('routes')
    .insert({
      game_id: gameId,
      order_index: orderIndex,
      display_name: displayName,
      route: sanitizeRoute(route),
      updated_at: new Date().toISOString(),
    })
    .select('id, order_index, display_name, route')
    .single();

  if (error) throw error;
  return { ...data, route: sanitizeRoute(data.route) };
}

/**
 * Update an existing route.
 * @param {string} routeId
 * @param {string} displayName
 * @param {Array} route
 */
export async function saveRoute(routeId, displayName, route) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const { error } = await runtimeSupabase
    .from('routes')
    .update({
      display_name: displayName,
      route: sanitizeRoute(route),
      updated_at: new Date().toISOString(),
    })
    .eq('id', routeId);

  if (error) throw error;
}

/**
 * Delete a route by id.
 * @param {string} routeId
 */
export async function deleteRoute(routeId) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const { error } = await runtimeSupabase.from('routes').delete().eq('id', routeId);
  if (error) throw error;
}

// kept for backwards compat with admin.js delete-game flow
export { deleteGame as deleteGameBySlug };

// ─── Storage ──────────────────────────────────────────────────────────────────

const IMAGE_BUCKET = 'location-images';

/**
 * Upload an image for a specific location and return its public URL.
 * Path: <gameSlug>/<routeId>/<locationIndex>-<timestamp>.<ext>
 * @param {File} file
 * @param {string} gameSlug
 * @param {string} routeId  uuid of the route row (or 'new' before first save)
 * @param {number} locationIndex
 * @returns {Promise<string>} public URL
 */
/**
 * Upload a game logo and return its public URL.
 * Path: logos/<gameSlug>/logo-<timestamp>.<ext>
 * @param {File} file
 * @param {string} gameSlug
 * @returns {Promise<string>} public URL
 */
export async function uploadGameLogo(file, gameSlug) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `logos/${gameSlug}/logo-${Date.now()}.${ext}`;

  const { data, error } = await runtimeSupabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data: { publicUrl } } = runtimeSupabase.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(data.path);

  return publicUrl;
}

export async function uploadLocationImage(file, gameSlug, routeId, locationIndex) {
  if (!runtimeSupabase) throw new Error('Supabase is not configured.');

  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${gameSlug}/${routeId}/${locationIndex}-${Date.now()}.${ext}`;

  const { data, error } = await runtimeSupabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data: { publicUrl } } = runtimeSupabase.storage
    .from(IMAGE_BUCKET)
    .getPublicUrl(data.path);

  return publicUrl;
}

/**
 * Delete an image by its public URL (best-effort — does not throw on 404).
 * @param {string} publicUrl
 */
export async function deleteLocationImage(publicUrl) {
  if (!runtimeSupabase || !publicUrl) return;

  // Extract the storage path from the public URL
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;

  const path = publicUrl.slice(idx + marker.length);
  await runtimeSupabase.storage.from(IMAGE_BUCKET).remove([path]);
}
