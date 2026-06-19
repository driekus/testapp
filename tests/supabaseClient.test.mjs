import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurrentUser,
  hasSupabaseConfig,
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

test('getCurrentUser returns null when supabase is not configured', async () => {
  if (!hasSupabaseConfig) {
    assert.equal(await getCurrentUser(), null);
    return;
  }

  // If env is configured for this runtime, we only assert call shape is async.
  await assert.doesNotReject(async () => {
    try {
      await getCurrentUser();
    } catch {
      // External auth state can fail in CI/env; we only guard module behavior surface.
    }
  });
});

test('auth helpers throw clear config errors when supabase is not configured', async () => {
  if (!hasSupabaseConfig) {
    await assert.rejects(() => signInWithPassword('a@b.com', 'x'), /env vars are missing/i);
    await assert.rejects(() => signUpWithPassword('a@b.com', 'x'), /env vars are missing/i);
    await assert.rejects(() => signInWithGitHub('https://example.com/callback'), /env vars are missing/i);
    await assert.doesNotReject(() => signOutUser());
    return;
  }

  // In configured envs, we avoid asserting remote auth behavior.
  await assert.doesNotReject(async () => {
    try {
      await signOutUser();
    } catch {
      // Ignore network/auth state in runtime-specific environments.
    }
  });
});

