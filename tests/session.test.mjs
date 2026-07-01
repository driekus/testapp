import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeOfflineActivationRequest,
  createSessionStore,
  getReusableFreePlayerIdentity,
  markOfflineActivationRequested,
} from '../src/main/session.js';

function createState() {
  return {
    currentRouteIndex: 1,
    currentRouteId: 'route-1',
    currentLocationIndex: 2,
    collectedLetters: ['A', 'B'],
    pendingLetter: 'C',
    route: [{ lat: 1, lng: 2 }],
    gameRoutes: [{ id: 'route-1' }],
    displayName: 'Demo Game',
    routeComplete: false,
    lastLetterGrantedAt: 123,
    playerId: 'player-1',
    playerSessionId: 'session-1',
    scoreSessionToken: 'signed-session-token',
    playerDisplayName: 'Barrie',
    nameConfirmed: true,
    score: 10,
    lastScoreDelta: 2,
    totalAnswerTimeMs: 1000,
    questionStartedAt: 500,
  };
}

function createMemoryStorage() {
  const data = new Map();
  return {
    setItem(key, value) {
      data.set(key, value);
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test('saveSession writes serialized state and loadSavedSession reads it', () => {
  const state = createState();
  const storage = createMemoryStorage();
  const store = createSessionStore({
    sessionKey: 'session-key',
    storage,
    state,
  });

  store.saveSession();

  const saved = store.loadSavedSession();
  assert.equal(saved.v, 1);
  assert.equal(saved.currentRouteId, 'route-1');
  assert.deepEqual(saved.collectedLetters, ['A', 'B']);
  assert.equal(saved.score, 10);
  assert.equal(saved.scoreSessionToken, 'signed-session-token');
  assert.equal(saved.nameConfirmed, true);
});

test('clearSession removes saved payload', () => {
  const state = createState();
  const storage = createMemoryStorage();
  const store = createSessionStore({
    sessionKey: 'session-key',
    storage,
    state,
  });

  store.saveSession();
  assert.notEqual(storage.getItem('session-key'), null);

  store.clearSession();
  assert.equal(storage.getItem('session-key'), null);
});

test('returns early when sessionKey is null', () => {
  const state = createState();
  const storage = createMemoryStorage();
  const store = createSessionStore({
    sessionKey: null,
    storage,
    state,
  });

  store.saveSession();
  store.clearSession();

  assert.equal(store.loadSavedSession(), null);
});

test('handles storage errors gracefully', () => {
  const state = createState();
  const storage = {
    setItem() {
      throw new Error('full');
    },
    getItem() {
      throw new Error('no access');
    },
    removeItem() {
      throw new Error('denied');
    },
  };

  const store = createSessionStore({
    sessionKey: 'session-key',
    storage,
    state,
  });

  assert.doesNotThrow(() => store.saveSession());
  assert.doesNotThrow(() => store.clearSession());
  assert.equal(store.loadSavedSession(), null);
});

test('loadSavedSession returns null when JSON is invalid', () => {
  const state = createState();
  const storage = {
    setItem() {},
    getItem() {
      return '{not json';
    },
    removeItem() {},
  };

  const store = createSessionStore({
    sessionKey: 'session-key',
    storage,
    state,
  });

  assert.equal(store.loadSavedSession(), null);
});

test('getReusableFreePlayerIdentity returns only free-player identity fields', () => {
  const reusable = getReusableFreePlayerIdentity({
    v: 1,
    playerDisplayName: 'Barrie',
    nameConfirmed: true,
    currentRouteIndex: 9,
    collectedLetters: ['X'],
  });

  assert.deepEqual(reusable, {
    playerDisplayName: 'Barrie',
    nameConfirmed: true,
  });
});

test('getReusableFreePlayerIdentity rejects missing or incompatible saved sessions', () => {
  assert.equal(getReusableFreePlayerIdentity(null), null);
  assert.equal(getReusableFreePlayerIdentity({ v: 2, playerDisplayName: 'Barrie' }), null);
});

test('offline activation request is one-time, slug-scoped and time-limited', () => {
  const storage = createMemoryStorage();

  markOfflineActivationRequested(storage, 'demo', 1_000);
  assert.equal(consumeOfflineActivationRequest(storage, 'other', 1_100), false);
  assert.equal(consumeOfflineActivationRequest(storage, 'demo', 1_100), false);

  markOfflineActivationRequested(storage, 'demo', 2_000);
  assert.equal(consumeOfflineActivationRequest(storage, 'demo', 2_100), true);
  assert.equal(consumeOfflineActivationRequest(storage, 'demo', 2_200), false);

  markOfflineActivationRequested(storage, 'demo', 3_000);
  assert.equal(consumeOfflineActivationRequest(storage, 'demo', 3_000 + (5 * 60 * 1000) + 1), false);
});

