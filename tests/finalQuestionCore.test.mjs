import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTEMPTS_STORAGE_KEY,
  buildAttemptScopeKey,
  getStoredAttemptForScope,
  readAttemptStore,
  rememberAttemptInStore,
  writeAttemptStore,
} from '../src/finalQuestionCore.js';

test('buildAttemptScopeKey scopes by game and session', () => {
  assert.equal(buildAttemptScopeKey('g1', 's1'), 'g1::s1');
  assert.equal(buildAttemptScopeKey('g1', 's2'), 'g1::s2');
  assert.notEqual(buildAttemptScopeKey('g1', 's1'), buildAttemptScopeKey('g2', 's1'));
});

test('read/write attempt store handles valid and invalid storage payloads', () => {
  const storage = {
    value: '',
    getItem() {
      return this.value;
    },
    setItem(_key, next) {
      this.value = next;
    },
  };

  assert.deepEqual(readAttemptStore(storage, ATTEMPTS_STORAGE_KEY), {});

  writeAttemptStore(storage, { a: 1 }, ATTEMPTS_STORAGE_KEY);
  assert.deepEqual(readAttemptStore(storage, ATTEMPTS_STORAGE_KEY), { a: 1 });

  storage.value = '{broken';
  assert.deepEqual(readAttemptStore(storage, ATTEMPTS_STORAGE_KEY), {});
});

test('getStoredAttemptForScope returns only normalized scoped attempt values', () => {
  const store = {
    'g1::s1': { answered: 1, correct: 0 },
    'g1::s2': { answered: true, correct: true },
  };

  assert.deepEqual(getStoredAttemptForScope(store, 'g1::s1'), { answered: true, correct: false });
  assert.deepEqual(getStoredAttemptForScope(store, 'g1::s2'), { answered: true, correct: true });
  assert.equal(getStoredAttemptForScope(store, 'g2::s1'), null);
});

test('rememberAttemptInStore writes scoped attempts without affecting other runs', () => {
  const existing = {
    'g1::s1': { answered: true, correct: false, updatedAt: 100 },
  };

  const next = rememberAttemptInStore(existing, 'g1::s2', true, 999);
  assert.equal(next['g1::s1'].correct, false);
  assert.equal(next['g1::s2'].answered, true);
  assert.equal(next['g1::s2'].correct, true);
  assert.equal(next['g1::s2'].updatedAt, 999);
});

