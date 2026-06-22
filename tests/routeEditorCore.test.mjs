import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampLocationCount,
  normalizeRouteLetter,
  resizeRoutePoints,
  validateCoordinateRange,
} from '../src/admin/sections/routeEditorCore.js';

const ta = (key, params = {}) => `${key}:${params.row ?? ''}`;

test('validateCoordinateRange enforces numeric and lat/lng boundaries', () => {
  assert.doesNotThrow(() => validateCoordinateRange(52.1, 4.9, 0, ta));
  assert.throws(() => validateCoordinateRange(Number.NaN, 4.9, 0, ta), /rowLatLngNumbers:1/);
  assert.throws(() => validateCoordinateRange(120, 4.9, 1, ta), /rowLatRange:2/);
  assert.throws(() => validateCoordinateRange(52.1, 200, 2, ta), /rowLngRange:3/);
});

test('normalizeRouteLetter strips invalid chars and keeps one uppercase letter', () => {
  assert.equal(normalizeRouteLetter('ab', 0, ta), 'A');
  assert.equal(normalizeRouteLetter(' 9-z ', 1, ta), 'Z');
  assert.throws(() => normalizeRouteLetter('123', 2, ta), /rowLetterRange:3/);
});

test('clampLocationCount limits range and normalizes raw values', () => {
  assert.equal(clampLocationCount(5.9, 10), 5);
  assert.equal(clampLocationCount(-1, 10), 1);
  assert.equal(clampLocationCount(99, 10), 10);
  assert.equal(clampLocationCount(Number.NaN, 10), 1);
});

test('resizeRoutePoints grows with generated letters and shrinks by slicing', () => {
  const current = [{ letter: 'A' }, { letter: 'B' }];
  const blankRoute = (length) => Array.from({ length }, () => ({ name: 'X', letter: 'A' }));

  const grown = resizeRoutePoints(current, 5, blankRoute);
  assert.equal(grown.length, 5);
  assert.equal(grown[2].letter, 'C');
  assert.equal(grown[4].letter, 'E');

  const shrunk = resizeRoutePoints(grown, 3, blankRoute);
  assert.equal(shrunk.length, 3);

  const unchanged = resizeRoutePoints(shrunk, 3, blankRoute);
  assert.equal(unchanged, shrunk);
});

