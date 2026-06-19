import test from 'node:test';
import assert from 'node:assert/strict';

import { distanceMeters, isQuickJump, randomLetter, travelMetrics } from '../src/gameLogic.js';

test('distanceMeters returns 0 for the same point', () => {
  const meters = distanceMeters(52.3676, 4.9041, 52.3676, 4.9041);
  assert.equal(Math.round(meters), 0);
});

test('distanceMeters gives expected order of magnitude', () => {
  const meters = distanceMeters(52.3676, 4.9041, 52.3702, 4.8952);
  assert.ok(meters > 500);
  assert.ok(meters < 1000);
});

test('randomLetter always returns an uppercase letter', () => {
  for (let i = 0; i < 100; i += 1) {
    const letter = randomLetter();
    assert.match(letter, /^[A-Z]$/);
  }
});

test('randomLetter falls back to A for empty pools', () => {
  assert.equal(randomLetter(''), 'A');
  assert.equal(randomLetter(null), 'A');
});

test('randomLetter respects a custom letter pool', () => {
  const pool = 'XYZ';
  for (let i = 0; i < 100; i += 1) {
    const letter = randomLetter(pool);
    assert.match(letter, /^[XYZ]$/);
  }
});

test('travelMetrics calculates positive distance and speed', () => {
  const previousPosition = {
    latitude: 52.3676,
    longitude: 4.9041,
    timestamp: 1_000,
  };

  const nextPosition = {
    latitude: 52.3679,
    longitude: 4.9042,
    timestamp: 11_000,
  };

  const metrics = travelMetrics(previousPosition, nextPosition);
  assert.ok(metrics.distance > 0);
  assert.ok(metrics.elapsedSeconds > 0);
  assert.ok(metrics.speedMetersPerSecond > 0);
});

test('travelMetrics returns infinite speed when elapsed time is zero', () => {
  const from = { latitude: 52.37, longitude: 4.89, timestamp: 1000 };
  const to = { latitude: 52.38, longitude: 4.9, timestamp: 1000 };
  const metrics = travelMetrics(from, to);

  assert.equal(metrics.elapsedSeconds, 0);
  assert.equal(metrics.speedMetersPerSecond, Number.POSITIVE_INFINITY);
});

test('isQuickJump returns true for unrealistic movement', () => {
  const previousPosition = {
    latitude: 52.3676,
    longitude: 4.9041,
    timestamp: 1_000,
  };

  const nextPosition = {
    latitude: 52.3731,
    longitude: 4.8922,
    timestamp: 4_000,
  };

  const flagged = isQuickJump(previousPosition, nextPosition, {
    maxSpeedMetersPerSecond: 22,
    maxJumpDistanceMeters: 250,
  });

  assert.equal(flagged, true);
});

test('isQuickJump returns false for normal movement', () => {
  const previousPosition = {
    latitude: 52.3676,
    longitude: 4.9041,
    timestamp: 1_000,
  };

  const nextPosition = {
    latitude: 52.3677,
    longitude: 4.9042,
    timestamp: 11_000,
  };

  const flagged = isQuickJump(previousPosition, nextPosition, {
    maxSpeedMetersPerSecond: 22,
    maxJumpDistanceMeters: 250,
  });

  assert.equal(flagged, false);
});


