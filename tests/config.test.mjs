import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ROUTE,
  MAX_ROUTE_LOCATIONS,
  blankRoute,
  defaultConfig,
  sanitizeRoute,
} from '../src/config.js';

test('sanitizeRoute falls back to default route when input is invalid', () => {
  const route = sanitizeRoute(null);
  assert.deepEqual(route, DEFAULT_ROUTE);
  assert.notEqual(route, DEFAULT_ROUTE);
});

test('sanitizeRoute sanitizes malformed point fields', () => {
  const route = sanitizeRoute([
    {
      name: '  ',
      lat: 'NaN',
      lng: undefined,
      letter: '9',
      image_url: 123,
      description: ' desc ',
      question: ' q ',
      answer: ' a ',
      max_attempts: '3.9',
    },
  ]);

  assert.equal(route.length, 1);
  assert.equal(route[0].name, 'Location 1');
  assert.equal(typeof route[0].lat, 'number');
  assert.equal(typeof route[0].lng, 'number');
  assert.equal(route[0].letter.length, 1);
  assert.equal(route[0].image_url, '');
  assert.equal(route[0].description, 'desc');
  assert.equal(route[0].question, 'q');
  assert.equal(route[0].answer, 'a');
  assert.equal(route[0].max_attempts, 3);
});

test('sanitizeRoute caps route length to MAX_ROUTE_LOCATIONS', () => {
  const tooLong = Array.from({ length: MAX_ROUTE_LOCATIONS + 50 }, (_, i) => ({ name: `L${i + 1}` }));
  const route = sanitizeRoute(tooLong);
  assert.equal(route.length, MAX_ROUTE_LOCATIONS);
});

test('defaultConfig returns cloned default route with configured length', () => {
  const cfg = defaultConfig();
  assert.equal(cfg.route.length > 0, true);

  // Ensure it is a clone, not a shared object reference.
  cfg.route[0].name = 'Changed';
  assert.notEqual(DEFAULT_ROUTE[0].name, 'Changed');
});

test('blankRoute generates fallback coordinates and A-Z cycling letters', () => {
  const route = blankRoute(28);
  assert.equal(route.length, 28);
  assert.equal(route[0].letter, 'A');
  assert.equal(route[25].letter, 'Z');
  assert.equal(route[26].letter, 'A');
  assert.equal(route[27].letter, 'B');
  assert.equal(route[0].name, 'Location 1');
});

