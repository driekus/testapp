import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendNextLocation,
  computeRemainingCooldownMs,
  normalizeRoute,
  shouldAutoResumeTracking,
} from '../src/main/mainCore.js';

test('computeRemainingCooldownMs clamps to zero', () => {
  assert.equal(computeRemainingCooldownMs(1000, 5000, 10000), 6000);
  assert.equal(computeRemainingCooldownMs(1000, 12000, 10000), 0);
});

test('normalizeRoute removes only consecutive duplicate coordinates', () => {
  const route = [
    { lat: 1, lng: 2, name: 'A' },
    { lat: 1, lng: 2, name: 'A duplicate' },
    { lat: 3, lng: 4, name: 'B' },
    { lat: 1, lng: 2, name: 'A later' },
  ];

  const normalized = normalizeRoute(route);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].name, 'A');
  assert.equal(normalized[1].name, 'B');
  assert.equal(normalized[2].name, 'A later');
});

test('appendNextLocation appends only non-duplicate tail', () => {
  const route = [{ lat: 1, lng: 2 }];

  assert.equal(appendNextLocation(route, { lat: 1, lng: 2 }), false);
  assert.equal(route.length, 1);

  assert.equal(appendNextLocation(route, { lat: 3, lng: 4 }), true);
  assert.equal(route.length, 2);
});

test('shouldAutoResumeTracking checks progress markers', () => {
  assert.equal(shouldAutoResumeTracking({ currentLocationIndex: 1, collectedLetters: [], routeComplete: false }), true);
  assert.equal(shouldAutoResumeTracking({ currentLocationIndex: 0, collectedLetters: ['A'], routeComplete: false }), true);
  assert.equal(shouldAutoResumeTracking({ currentLocationIndex: 0, collectedLetters: [], routeComplete: true }), true);
  assert.equal(shouldAutoResumeTracking({ currentLocationIndex: 0, collectedLetters: [], routeComplete: false }), false);
});

