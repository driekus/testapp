import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PENDING_SCORE_NAME_UPDATE_KEY,
  flushPendingScoreNameUpdate,
  isSameScoreNameUpdate,
  readPendingScoreNameUpdate,
  writePendingScoreNameUpdate,
} from '../src/scoreNameSync.js';

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('read/write pending score name update persists payloads and clears them', () => {
  const storage = createMemoryStorage();
  const payload = {
    game_id: 'g1',
    player_session_id: 's1',
    session_token: 'token',
    display_name: 'Kees',
  };

  assert.equal(readPendingScoreNameUpdate(storage), null);
  writePendingScoreNameUpdate(payload, storage);
  assert.deepEqual(readPendingScoreNameUpdate(storage), payload);

  writePendingScoreNameUpdate(null, storage);
  assert.equal(storage.getItem(PENDING_SCORE_NAME_UPDATE_KEY), null);
  assert.equal(readPendingScoreNameUpdate(storage), null);
});

test('isSameScoreNameUpdate compares the meaningful payload fields', () => {
  const base = {
    game_id: 'g1',
    player_session_id: 's1',
    session_token: 'token',
    display_name: 'Kees',
  };

  assert.equal(isSameScoreNameUpdate(base, { ...base }), true);
  assert.equal(isSameScoreNameUpdate(base, { ...base, display_name: 'Alice' }), false);
  assert.equal(isSameScoreNameUpdate(base, null), false);
});

test('flushPendingScoreNameUpdate retries and clears successful pending updates', async () => {
  const payload = {
    game_id: 'g1',
    player_session_id: 's1',
    session_token: 'token',
    display_name: 'Kees',
  };
  const storage = createMemoryStorage({
    [PENDING_SCORE_NAME_UPDATE_KEY]: JSON.stringify(payload),
  });
  const calls = [];

  const flushed = await flushPendingScoreNameUpdate({
    storage,
    async sendUpdate(nextPayload) {
      calls.push(nextPayload);
    },
  });

  assert.equal(flushed, true);
  assert.deepEqual(calls, [payload]);
  assert.equal(readPendingScoreNameUpdate(storage), null);
});

test('flushPendingScoreNameUpdate leaves pending payload untouched on failure', async () => {
  const payload = {
    game_id: 'g1',
    player_session_id: 's1',
    session_token: 'token',
    display_name: 'Kees',
  };
  const storage = createMemoryStorage({
    [PENDING_SCORE_NAME_UPDATE_KEY]: JSON.stringify(payload),
  });

  const flushed = await flushPendingScoreNameUpdate({
    storage,
    async sendUpdate() {
      throw new Error('offline');
    },
  });

  assert.equal(flushed, false);
  assert.deepEqual(readPendingScoreNameUpdate(storage), payload);
});

