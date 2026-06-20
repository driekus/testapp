import { createClient } from '@supabase/supabase-js';

const env = import.meta.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

/** `true` when both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars are present. */
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
/** Supabase project URL read from `VITE_SUPABASE_URL`. Empty string when not configured. */
export const SUPABASE_URL = supabaseUrl ?? '';
/** Supabase anonymous API key read from `VITE_SUPABASE_ANON_KEY`. Empty string when not configured. */
export const SUPABASE_ANON_KEY = supabaseAnonKey ?? '';

/**
 * Supabase JS client instance, or `null` when Supabase is not configured.
 * Use the auth and database helpers exported below instead of accessing this directly.
 * @type {import('@supabase/supabase-js').SupabaseClient | null}
 */
export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;
let runtimeSupabase = supabase;

/**
 * Override Supabase client for tests.
 * @param {{ supabase?: any }} deps
 */
export function setSupabaseClientRuntimeDeps(deps = {}) {
  if (Object.prototype.hasOwnProperty.call(deps, 'supabase')) {
    runtimeSupabase = deps.supabase;
  }
}

/**
 * Return the currently authenticated Supabase user, or `null` when there is no
 * active session or Supabase is not configured.
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function getCurrentUser() {
  if (!runtimeSupabase) {
    return null;
  }

  // getSession() never throws when there is no session — it simply returns null.
  const { data, error } = await runtimeSupabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session?.user ?? null;
}

/**
 * Sign in an existing user with email and password.
 * Throws when Supabase is not configured or authentication fails.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function signInWithPassword(email, password) {
  if (!runtimeSupabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await runtimeSupabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
}

/**
 * Register a new user with email and password.
 * Throws when Supabase is not configured or sign-up fails.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function signUpWithPassword(email, password) {
  if (!runtimeSupabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await runtimeSupabase.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
}

/**
 * Sign out the currently authenticated user.
 * No-op when Supabase is not configured; throws on Supabase errors.
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  if (!runtimeSupabase) {
    return;
  }

  const { error } = await runtimeSupabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/**
 * Initiate a GitHub OAuth sign-in flow.  The browser is redirected to GitHub
 * and back to `redirectTo` on completion.
 * Throws when Supabase is not configured or the OAuth call fails.
 * @param {string} [redirectTo] - Optional URL to redirect back to after auth.
 * @returns {Promise<void>}
 */
export async function signInWithGitHub(redirectTo) {
  if (!runtimeSupabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await runtimeSupabase.auth.signInWithOAuth({
    provider: 'github',
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (error) {
    throw error;
  }
}
