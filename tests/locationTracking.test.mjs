import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocationTracking } from '../src/main/locationTracking.js';

function createDeps(overrides = {}) {
  const state = {
    statusMessage: '',
    lastTrustedPosition: null,
    userPosition: null,
    currentLocationIndex: 0,
    route: [{ lat: 52.37, lng: 4.89 }],
    pendingLetter: null,
    pendingQuestion: false,
    routeComplete: false,
    lastDistanceToTarget: null,
    geoWatchId: null,
    ...overrides.state,
  };

  let updateCalls = 0;
  let arrivalCalls = 0;
  let beepCalls = 0;

  const geolocation = {
    success: null,
    failure: null,
    options: null,
    clearCalls: [],
    watchPosition(success, failure, options) {
      this.success = success;
      this.failure = failure;
      this.options = options;
      return 77;
    },
    clearWatch(id) {
      this.clearCalls.push(id);
    },
  };

  const tracker = createLocationTracking({
    state,
    tm: (key, params = {}) => `${key}:${JSON.stringify(params)}`,
    updateUi() {
      updateCalls += 1;
    },
    checkArrival() {
      arrivalCalls += 1;
    },
    playDoubleBeep() {
      beepCalls += 1;
    },
    geolocation,
    isQuickJump: overrides.isQuickJump || (() => false),
    distanceMeters: overrides.distanceMeters || (() => 5),
    constants: {
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
      MAX_SPEED_METERS_PER_SECOND: 22,
      MAX_JUMP_DISTANCE_METERS: 250,
      BALANCED_TIMEOUT_MS: 30000,
      HIGH_ACCURACY_TIMEOUT_MS: 20000,
    },
  });

  return {
    state,
    geolocation,
    tracker,
    get updateCalls() {
      return updateCalls;
    },
    get arrivalCalls() {
      return arrivalCalls;
    },
    get beepCalls() {
      return beepCalls;
    },
  };
}

function createPosition({ lat = 52.37, lng = 4.89, accuracy = 5, timestamp = 1000 } = {}) {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
    },
    timestamp,
  };
}

test('startLocationTracking handles unsupported geolocation', () => {
  const deps = createDeps();
  const tracker = createLocationTracking({
    state: deps.state,
    tm: (key) => key,
    updateUi() {},
    checkArrival() {},
    playDoubleBeep() {},
    geolocation: null,
    isQuickJump: () => false,
    distanceMeters: () => 0,
    constants: {
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
      MAX_SPEED_METERS_PER_SECOND: 22,
      MAX_JUMP_DISTANCE_METERS: 250,
      BALANCED_TIMEOUT_MS: 30000,
      HIGH_ACCURACY_TIMEOUT_MS: 20000,
    },
  });

  tracker.startLocationTracking();
  assert.equal(deps.state.statusMessage, 'geolocationUnsupported');
});

test('startLocationTracking reports already active tracking', () => {
  const deps = createDeps({ state: { geoWatchId: 99 } });

  deps.tracker.startLocationTracking();

  assert.match(deps.state.statusMessage, /^trackingActive/);
  assert.equal(deps.geolocation.success, null);
});

test('startLocationTracking requests permission and starts high-accuracy watch', () => {
  const deps = createDeps();

  deps.tracker.startLocationTracking();

  assert.match(deps.state.statusMessage, /^requestingPermission/);
  assert.equal(deps.state.geoWatchId, 77);
  assert.equal(deps.geolocation.options.enableHighAccuracy, true);
  assert.equal(deps.geolocation.options.timeout, 20000);
});

test('low-accuracy positions are rejected', () => {
  const deps = createDeps();

  deps.tracker.handleLocationSuccess(createPosition({ accuracy: 50 }));

  assert.match(deps.state.statusMessage, /^gpsTooLow/);
  assert.equal(deps.arrivalCalls, 0);
});

test('quick jumps are rejected', () => {
  const deps = createDeps({
    state: {
      lastTrustedPosition: {
        latitude: 1,
        longitude: 1,
        accuracy: 5,
        timestamp: 1000,
      },
    },
    isQuickJump: () => true,
  });

  deps.tracker.handleLocationSuccess(createPosition({ lat: 5, lng: 5, timestamp: 2000 }));

  assert.match(deps.state.statusMessage, /^quickJump/);
  assert.equal(deps.arrivalCalls, 0);
});

test('valid positions update state and trigger arrival check', () => {
  const deps = createDeps();

  deps.tracker.handleLocationSuccess(createPosition({ lat: 52.371, lng: 4.891, accuracy: 4, timestamp: 2000 }));

  assert.equal(deps.state.userPosition.latitude, 52.371);
  assert.equal(deps.state.lastTrustedPosition.longitude, 4.891);
  assert.equal(deps.arrivalCalls, 1);
});

test('plays double beep when user moves farther away from target', () => {
  const deps = createDeps({
    state: {
      lastDistanceToTarget: 50,
    },
    distanceMeters: () => 80,
  });

  deps.tracker.handleLocationSuccess(createPosition());

  assert.equal(deps.beepCalls, 1);
  assert.equal(deps.state.lastDistanceToTarget, 80);
});

test('watch timeout falls back to balanced mode', () => {
  const deps = createDeps();

  deps.tracker.startWatch({ enableHighAccuracy: true, timeout: 1 }, true);

  deps.geolocation.failure({ code: 3, TIMEOUT: 3, message: 'timeout' });

  assert.deepEqual(deps.geolocation.clearCalls, [77]);
  assert.equal(deps.state.geoWatchId, 77);
  assert.equal(deps.geolocation.options.enableHighAccuracy, false);
  assert.equal(deps.geolocation.options.timeout, 30000);
});

test('watch error sets locationError status', () => {
  const deps = createDeps();

  deps.tracker.startWatch({ enableHighAccuracy: true }, false);
  deps.geolocation.failure({ code: 1, TIMEOUT: 3, message: 'denied' });

  assert.match(deps.state.statusMessage, /^locationError/);
});

