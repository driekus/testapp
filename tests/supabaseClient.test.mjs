import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurrentUser,
  hasSupabaseConfig,
  supabase,
  setSupabaseClientRuntimeDeps,
  signInWithGitHub,
  signInWithPassword,
  signOutUser,
  signUpWithPassword,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '../src/supabaseClient.js';

test('exports safe defaults in non-vite test runtime', () => {
  assert.equal(typeof hasSupabaseConfig, 'boolean');
  assert.equal(typeof SUPABASE_URL, 'string');
  assert.equal(typeof SUPABASE_ANON_KEY, 'string');
});

test('getCurrentUser returns null when runtime supabase is missing', async () => {
  setSupabaseClientRuntimeDeps({ supabase: null });
  assert.equal(await getCurrentUser(), null);
});

test('auth helpers throw clear config errors when runtime supabase is missing', async () => {
  setSupabaseClientRuntimeDeps({ supabase: null });
  await assert.rejects(() => signInWithPassword('a@b.com', 'x'), /env vars are missing/i);
  await assert.rejects(() => signUpWithPassword('a@b.com', 'x'), /env vars are missing/i);
  await assert.rejects(() => signInWithGitHub('https://example.com/callback'), /env vars are missing/i);
  await assert.doesNotReject(() => signOutUser());
});

test('getCurrentUser returns user and throws when session query fails', async () => {
  setSupabaseClientRuntimeDeps({
    supabase: {
      auth: {
        async getSession() {
          return { data: { session: { user: { id: 'u1' } } }, error: null };
        },
      },
    },
  });
  assert.deepEqual(await getCurrentUser(), { id: 'u1' });

  setSupabaseClientRuntimeDeps({
    supabase: {
      auth: {
        async getSession() {
          return { data: { session: null }, error: new Error('session failed') };
        },
      },
    },
  });
  await assert.rejects(() => getCurrentUser(), /session failed/);
});

test('signIn/signUp/signOut/signInWithGitHub call auth API and propagate errors', async () => {
  const calls = [];
  const auth = {
    async signInWithPassword(payload) {
      calls.push(['signInWithPassword', payload]);
      return { error: null };
    },
    async signUp(payload) {
      calls.push(['signUp', payload]);
      return { error: null };
    },
    async signOut() {
      calls.push(['signOut']);
      return { error: null };
    },
    async signInWithOAuth(payload) {
      calls.push(['signInWithOAuth', payload]);
      return { error: null };
    },
  };

  setSupabaseClientRuntimeDeps({ supabase: { auth } });

  await signInWithPassword('a@b.com', 'x');
  await signUpWithPassword('a@b.com', 'x');
  await signOutUser();
  await signInWithGitHub('https://example.com/callback');
  await signInWithGitHub();

  assert.equal(calls[0][0], 'signInWithPassword');
  assert.deepEqual(calls[0][1], { email: 'a@b.com', password: 'x' });
  assert.equal(calls[1][0], 'signUp');
  assert.equal(calls[2][0], 'signOut');
  assert.equal(calls[3][0], 'signInWithOAuth');
  assert.deepEqual(calls[3][1], {
    provider: 'github',
    options: { redirectTo: 'https://example.com/callback' },
  });
  assert.deepEqual(calls[4][1], { provider: 'github', options: undefined });

  setSupabaseClientRuntimeDeps({
    supabase: {
      auth: {
        async signInWithPassword() { return { error: new Error('signin failed') }; },
        async signUp() { return { error: new Error('signup failed') }; },
        async signOut() { return { error: new Error('signout failed') }; },
        async signInWithOAuth() { return { error: new Error('oauth failed') }; },
      },
    },
  });

  await assert.rejects(() => signInWithPassword('a@b.com', 'x'), /signin failed/);
  await assert.rejects(() => signUpWithPassword('a@b.com', 'x'), /signup failed/);
  await assert.rejects(() => signOutUser(), /signout failed/);
  await assert.rejects(() => signInWithGitHub('https://example.com/callback'), /oauth failed/);
});

test('restore runtime client after tests', () => {
  setSupabaseClientRuntimeDeps({ supabase });
});

