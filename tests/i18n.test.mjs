import test from 'node:test';
import assert from 'node:assert/strict';

import { getLanguage, setLanguage, t } from '../src/i18n.js';

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

test('getLanguage defaults to nl and accepts only en/nl', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    assert.equal(getLanguage(), 'nl');

    globalThis.localStorage.setItem('letter-quest-language', 'en');
    assert.equal(getLanguage(), 'en');

    globalThis.localStorage.setItem('letter-quest-language', 'de');
    assert.equal(getLanguage(), 'nl');
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('setLanguage normalizes unknown values to en', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    setLanguage('nl');
    assert.equal(globalThis.localStorage.getItem('letter-quest-language'), 'nl');

    setLanguage('anything-else');
    assert.equal(globalThis.localStorage.getItem('letter-quest-language'), 'en');
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('t interpolates params and falls back to english/key', () => {
  assert.equal(
    t('en', 'main', 'routeBadge', { current: 1, total: 3, name: 'Route 1' }),
    'Route 1 of 3: Route 1',
  );

  // Unknown language falls back to english table
  assert.equal(t('xx', 'main', 'payButton'), 'Pay and play');

  // Unknown key falls back to key literal
  assert.equal(t('en', 'main', 'missingTranslationKey'), 'missingTranslationKey');
});

