import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
export const SUPABASE_URL = supabaseUrl ?? '';
export const SUPABASE_ANON_KEY = supabaseAnonKey ?? '';

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function getCurrentUser() {
  if (!supabase) {
    return null;
  }

  // getSession() never throws when there is no session — it simply returns null.
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session?.user ?? null;
}

export async function signInWithPassword(email, password) {
  if (!supabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
}

export async function signUpWithPassword(email, password) {
  if (!supabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
}

export async function signOutUser() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function signInWithGitHub(redirectTo) {
  if (!supabase) {
    throw new Error('Supabase env vars are missing.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (error) {
    throw error;
  }
}
