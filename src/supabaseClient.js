import { createClient } from '@supabase/supabase-js';

const env = import.meta.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
export const SUPABASE_URL = supabaseUrl ?? '';
export const SUPABASE_ANON_KEY = supabaseAnonKey ?? '';

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

export async function signInWithPassword(email, password) {
  if (!runtimeSupabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await runtimeSupabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
}

export async function signUpWithPassword(email, password) {
  if (!runtimeSupabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await runtimeSupabase.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
}

export async function signOutUser() {
  if (!runtimeSupabase) {
    return;
  }

  const { error } = await runtimeSupabase.auth.signOut();
  if (error) {
    throw error;
  }
}

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
