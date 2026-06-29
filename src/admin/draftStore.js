const DRAFT_KEY_PREFIX = 'letter-quest-admin-draft';

function resolveDraftKey({ slug, userId }) {
  if (!slug) return null;
  const normalizedUser = String(userId ?? '').trim() || 'anonymous';
  return `${DRAFT_KEY_PREFIX}:${normalizedUser}:${slug}`;
}

function cloneRoutes(routes) {
  return (routes ?? []).map((route) => ({
    ...route,
    route: (route?.route ?? []).map((point) => ({ ...point })),
  }));
}

/**
 * Build a serializable admin editor draft payload.
 * @param {object} params
 * @returns {object}
 */
export function buildAdminDraftPayload(params) {
  return {
    v: 1,
    slug: String(params.slug ?? ''),
    updatedAt: Number(params.updatedAt ?? Date.now()),
    currentRouteIndex: Number(params.currentRouteIndex ?? 0),
    selectedRowIndex: Number(params.selectedRowIndex ?? 0),
    editDisplayName: String(params.editDisplayName ?? ''),
    requiresPayment: Boolean(params.requiresPayment),
    priceEuros: String(params.priceEuros ?? ''),
    supportsOffline: Boolean(params.supportsOffline),
    finalQuestion: String(params.finalQuestion ?? ''),
    finalAnswer: String(params.finalAnswer ?? ''),
    currentGameStyles: { ...(params.currentGameStyles ?? {}) },
    routes: cloneRoutes(params.routes),
  };
}

/**
 * Save admin draft data for a specific user+slug.
 * @param {object} deps
 * @returns {boolean}
 */
export function saveAdminDraft({ storage = localStorage, slug, userId, draft }) {
  const key = resolveDraftKey({ slug, userId });
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load admin draft data for a specific user+slug.
 * @param {object} deps
 * @returns {object | null}
 */
export function loadAdminDraft({ storage = localStorage, slug, userId }) {
  const key = resolveDraftKey({ slug, userId });
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || parsed.slug !== slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Delete admin draft data for a specific user+slug.
 * @param {object} deps
 */
export function clearAdminDraft({ storage = localStorage, slug, userId }) {
  const key = resolveDraftKey({ slug, userId });
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

