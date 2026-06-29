import test from 'node:test';
import assert from 'node:assert/strict';

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

test('createInitialState sets expected defaults and auth status message', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage({ 'letter-quest-language': 'en' });

  try {
    const mod = await import(`../src/admin/constants.js?case=${Date.now()}`);

    const withConfig = mod.createInitialState(true);
    assert.equal(withConfig.currentRequiresPayment, false);
    assert.equal(withConfig.currentPriceInCents, 0);
    assert.equal(withConfig.lastPickedMapLocation, null);
    assert.equal(withConfig.editorDirty, false);
    assert.equal(withConfig.authStatusMessage, mod.ta('signInToLoad'));

    const withoutConfig = mod.createInitialState(false);
    assert.equal(withoutConfig.authStatusMessage, mod.ta('envMissing'));

    assert.ok(Array.isArray(mod.STYLE_FIELDS));
    assert.equal(mod.STYLE_FIELDS.length > 0, true);
    assert.equal(mod.DEFAULT_GAME_STYLES.primary_color, '#2f7dff');
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

