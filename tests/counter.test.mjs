import test from 'node:test';
import assert from 'node:assert/strict';

import { setupCounter } from '../src/counter.js';

test('setupCounter initializes and increments on click', () => {
  const listeners = {};
  const el = {
    textContent: '',
    addEventListener(event, cb) {
      listeners[event] = cb;
    },
  };

  setupCounter(el);
  assert.equal(el.textContent, 'Count is 0');

  listeners.click();
  assert.equal(el.textContent, 'Count is 1');

  listeners.click();
  assert.equal(el.textContent, 'Count is 2');
});

