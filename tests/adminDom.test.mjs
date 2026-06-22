import test from 'node:test';
import assert from 'node:assert/strict';

import { getEls } from '../src/admin/dom.js';

test('getEls queries expected admin selectors', () => {
  const originalDocument = globalThis.document;
  const seen = [];

  globalThis.document = {
    querySelector(selector) {
      seen.push(selector);
      return { selector };
    },
  };

  try {
    const els = getEls();
    assert.equal(els.languageSelect.selector, '#language-select');
    assert.equal(els.requiresPayment.selector, '#requires-payment');
    assert.equal(els.supportsOffline.selector, '#supports-offline');
    assert.ok(seen.includes('#save-route-btn'));
    assert.ok(seen.includes('#status'));
  } finally {
    globalThis.document = originalDocument;
  }
});

