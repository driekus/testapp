import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRankingsUrl,
  buildScoreEventKey,
  createPlaySessionId,
  fetchScoreboard,
  getPlayerId,
  initScoreSession,
  recordScoreEvent,
  setScoreDisplayName,
  setScoreDisplayNameBySession,
} from '../src/scoreService.js';

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

test('buildRankingsUrl builds slug and non-slug URLs', () => {
  assert.equal(buildRankingsUrl('amsterdam-tour'), '/rankings.html?slug=amsterdam-tour');
  assert.equal(buildRankingsUrl(''), '/rankings.html');
});

test('buildScoreEventKey creates stable key format', () => {
  assert.equal(buildScoreEventKey('route-1', 2, 'arrival_confirmed'), 'route-1:2:arrival_confirmed');
});

test('createPlaySessionId prefers crypto.randomUUID', () => {
  const originalRandomUuid = globalThis.crypto.randomUUID;
  globalThis.crypto.randomUUID = () => 'uuid-123';
  try {
    assert.equal(createPlaySessionId(), 'uuid-123');
  } finally {
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});

test('getPlayerId returns empty string for missing slug', () => {
  assert.equal(getPlayerId(''), '');
});

test('getPlayerId returns existing player id from localStorage', () => {
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage({ 'letter-quest-player-demo': 'existing-player' });
  try {
    assert.equal(getPlayerId('demo'), 'existing-player');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('getPlayerId creates and stores a new id when absent', () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalRandomUuid = globalThis.crypto.randomUUID;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  globalThis.crypto.randomUUID = () => 'new-player-id';

  try {
    const id = getPlayerId('demo');
    assert.equal(id, 'new-player-id');
    assert.equal(storage.getItem('letter-quest-player-demo'), 'new-player-id');
  } finally {
    globalThis.localStorage = originalLocalStorage;
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});

test('getPlayerId falls back gracefully when storage throws', () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalRandomUuid = globalThis.crypto.randomUUID;
  globalThis.localStorage = {
    getItem() {
      throw new Error('storage denied');
    },
    setItem() {
      throw new Error('storage denied');
    },
  };
  globalThis.crypto.randomUUID = () => 'fallback-player-id';

  try {
    assert.equal(getPlayerId('demo'), 'fallback-player-id');
  } finally {
    globalThis.localStorage = originalLocalStorage;
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});

test('score service calls use fetch with expected function names', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { ok: true, url };
      },
    };
  };

  try {
    await initScoreSession({ game_id: 'g1', player_id: 'p1' });
    await recordScoreEvent({ a: 1 });
    await fetchScoreboard({ b: 2 });
    await setScoreDisplayName({ c: 3 });
    await setScoreDisplayNameBySession({ d: 4 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 5);
  assert.match(calls[0].url, /\/functions\/v1\/init-score-session$/);
  assert.match(calls[1].url, /\/functions\/v1\/record-score-event$/);
  assert.match(calls[2].url, /\/functions\/v1\/get-scoreboard$/);
  assert.match(calls[3].url, /\/functions\/v1\/set-score-display-name$/);
  assert.match(calls[4].url, /\/functions\/v1\/set-score-display-name-by-session$/);
  assert.equal(calls[0].options.method, 'POST');
});

test('score service throws with function error payload when response is not ok', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    statusText: 'Bad Request',
    async json() {
      return { error: 'boom' };
    },
  });

  try {
    await assert.rejects(() => fetchScoreboard({}), /boom/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


