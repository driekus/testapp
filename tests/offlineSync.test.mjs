import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearGameCache,
  downloadGameOffline,
  getCacheExpiryString,
  isGameCached,
  loadCachedGame,
} from '../src/main/offlineSync.js';

function createStorage(seed = {}) {
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

test('downloadGameOffline validates slug and handles function errors', async () => {
  const missing = await downloadGameOffline('');
  assert.equal(missing.success, false);
  assert.match(missing.error, /Missing game slug/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    statusText: 'Forbidden',
    async json() {
      return { error: 'blocked' };
    },
  });

  try {
    const result = await downloadGameOffline('demo');
    assert.equal(result.success, false);
    assert.equal(result.error, 'blocked');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('downloadGameOffline handles missing game payload, storage failures and thrown fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;

  globalThis.localStorage = {
    setItem() {
      throw new Error('quota');
    },
    getItem() {
      return null;
    },
    removeItem() {},
  };

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {};
    },
  });

  try {
    const missingGame = await downloadGameOffline('demo');
    assert.equal(missingGame.success, false);
    assert.match(missingGame.error, /No game data returned/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }

  globalThis.localStorage = {
    setItem() {
      throw new Error('quota');
    },
    getItem() {
      return null;
    },
    removeItem() {},
  };
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { game: { slug: 'demo' } };
    },
  });

  try {
    const storageFail = await downloadGameOffline('demo');
    assert.equal(storageFail.success, false);
    assert.match(storageFail.error, /Failed to store cache/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }

  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  try {
    const thrown = await downloadGameOffline('demo');
    assert.equal(thrown.success, false);
    assert.match(thrown.error, /network down/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('downloadGameOffline stores cache and cache helpers read it', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const storage = createStorage();
  globalThis.localStorage = storage;

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        game: {
          id: 'g1',
          slug: 'demo',
          routes: [],
        },
      };
    },
  });

  try {
    const result = await downloadGameOffline('demo', 'pay-token');
    assert.equal(result.success, true);
    assert.equal(typeof result.expiresAt, 'number');

    assert.equal(isGameCached('demo'), true);

    const cached = loadCachedGame('demo');
    assert.equal(cached?.game?.slug, 'demo');
    assert.equal(cached?.expiresAt, result.expiresAt);

    const expiryString = getCacheExpiryString('demo');
    assert.equal(typeof expiryString, 'string');
    assert.notEqual(expiryString.length, 0);

    clearGameCache('demo');
    assert.equal(isGameCached('demo'), false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('loadCachedGame removes expired entries', () => {
  const originalStorage = globalThis.localStorage;
  const key = 'letter-quest-offline-cache-demo';
  const expired = {
    game: { slug: 'demo' },
    timestamp: Date.now() - 1000,
    expiresAt: Date.now() - 1,
  };
  const storage = createStorage({ [key]: JSON.stringify(expired) });
  globalThis.localStorage = storage;

  try {
    assert.equal(loadCachedGame('demo'), null);
    assert.equal(storage.getItem(key), null);
    assert.equal(isGameCached('demo'), false);
    assert.equal(getCacheExpiryString('demo'), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('cache helpers safely handle invalid json and storage errors', () => {
  const originalStorage = globalThis.localStorage;

  globalThis.localStorage = {
    getItem() {
      return '{broken';
    },
    setItem() {},
    removeItem() {
      throw new Error('readonly');
    },
  };

  try {
    assert.equal(isGameCached('demo'), false);
    assert.equal(loadCachedGame('demo'), null);
    assert.equal(getCacheExpiryString('demo'), null);
    assert.doesNotThrow(() => clearGameCache('demo'));
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

