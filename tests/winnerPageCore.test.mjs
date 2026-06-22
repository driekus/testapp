import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveWinnerAccess, resolveWinnerSaveError, storeWinnerDetails } from '../src/winnerPageCore.js';

test('resolveWinnerAccess enforces slug and payment token', () => {
  assert.deepEqual(resolveWinnerAccess({ slug: '', paymentToken: 'x' }), {
    ok: false,
    redirectTo: '/',
    error: 'no slug',
  });

  assert.deepEqual(resolveWinnerAccess({ slug: 'demo', paymentToken: null }), {
    ok: false,
    redirectTo: '/demo',
    error: 'no token',
  });

  assert.deepEqual(resolveWinnerAccess({ slug: 'demo', paymentToken: 't' }), { ok: true });
});

test('resolveWinnerSaveError prefers api error, then status text, then fallback', () => {
  assert.equal(resolveWinnerSaveError({ error: 'bad request' }, 'Forbidden', 'fallback'), 'bad request');
  assert.equal(resolveWinnerSaveError({}, 'Forbidden', 'fallback'), 'Forbidden');
  assert.equal(resolveWinnerSaveError({}, '', 'fallback'), 'fallback');
});

test('storeWinnerDetails writes JSON and swallows storage errors', () => {
  let written = null;
  const okStorage = {
    setItem(key, value) {
      written = { key, value };
    },
  };

  storeWinnerDetails(okStorage, { name: 'Ann', phone: '123' });
  assert.equal(written.key, 'letter-quest-winner-details');
  assert.match(written.value, /"name":"Ann"/);

  const throwingStorage = {
    setItem() {
      throw new Error('storage unavailable');
    },
  };
  assert.doesNotThrow(() => storeWinnerDetails(throwingStorage, { name: 'Ann', phone: '123' }));
});

