import test from 'node:test';
import assert from 'node:assert/strict';

import { createUiController } from '../src/main/ui.js';

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    toggle(name, force) {
      if (typeof force === 'boolean') {
        if (force) set.add(name);
        else set.delete(name);
        return force;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    },
    contains(name) {
      return set.has(name);
    },
  };
}

function createElement() {
  return {
    textContent: '',
    href: '',
    src: '',
    disabled: false,
    classList: createClassList(),
  };
}

function createFixture() {
  const ids = [
    '#game-title', '#paid-badge', '#config-status', '#card-payment', '#payment-message', '#pay-and-play',
    '#card-offline', '#offline-message', '#download-offline', '#offline-status',
    '#card-name', '#player-name-input', '#start-with-name', '#card-target', '#card-progress', '#card-location',
    '#card-status', '#card-question', '#question-text', '#answer-input', '#answer-feedback', '#submit-answer',
    '#skip-question', '#route-badge', '#target-name', '#game-logo', '#location-image', '#location-description',
    '#distance', '#progress', '#letters', '#score-total', '#score-toast', '#status', '#pending-letter',
    '#rankings-link', '#enable-location', '#confirm-letter', '#next-route',
  ];

  const map = new Map(ids.map((id) => [id, createElement()]));

  const originalDocument = globalThis.document;
  globalThis.document = {
    querySelector(selector) {
      return map.get(selector) ?? null;
    },
  };

  return {
    map,
    restore() {
      globalThis.document = originalDocument;
    },
  };
}

function baseState() {
  return {
    gameId: null,
    gameRoutes: [],
    currentRouteIndex: 0,
    route: [],
    currentLocationIndex: 0,
    requiresPayment: false,
    paymentReady: true,
    geoWatchId: null,
    pendingQuestion: false,
    pendingLetter: null,
    routeComplete: false,
    checking: false,
    answerWrong: false,
    answerAttempts: 0,
    displayName: 'Game',
    configStatus: 'Loaded',
    score: 0,
    statusMessage: 'Ready',
    collectedLetters: [],
    nameConfirmed: true,
    sessionRestored: false,
    supportsOffline: false,
    offlineMode: false,
    userPosition: null,
    priceInCents: 250,
  };
}

test('getEls resolves elements from document and updateUi hides cards before game loads', () => {
  const fixture = createFixture();
  const state = baseState();

  const ui = createUiController({
    state,
    tm: (key) => key,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 42,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);
  ui.updateUi();

  assert.equal(els.cardPayment.classList.contains('hidden'), true);
  assert.equal(els.cardTarget.classList.contains('hidden'), true);
  assert.equal(els.cardQuestion.classList.contains('hidden'), true);

  fixture.restore();
});

test('showPaymentCard and updatePaidBadge update payment UI text and visibility', () => {
  const fixture = createFixture();
  const state = {
    ...baseState(),
    requiresPayment: true,
    priceInCents: 350,
    gameId: 'game-1',
  };

  const ui = createUiController({
    state,
    tm: (key) => key,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 42,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);

  ui.showPaymentCard('payToPlay', 'payButton', true);
  assert.equal(els.paymentMessage.textContent, 'payToPlay');
  assert.equal(els.payAndPlay.textContent, 'payButton');
  assert.equal(els.payAndPlay.classList.contains('hidden'), true);

  ui.updatePaidBadge();
  assert.match(els.paidBadge.textContent, /paidGame/);
  assert.equal(els.paidBadge.classList.contains('hidden'), false);

  fixture.restore();
});

test('updateUi renders distance and pending question state correctly', () => {
  const fixture = createFixture();
  const state = {
    ...baseState(),
    gameId: 'game-1',
    nameConfirmed: true,
    geoWatchId: 1,
    gameRoutes: [{ id: 'r1', display_name: 'Route 1' }],
    route: [{ name: 'Target 1', lat: 52.37, lng: 4.89, question: 'Q?', max_attempts: 2 }],
    userPosition: { latitude: 52.3701, longitude: 4.8901, accuracy: 6 },
    answerWrong: true,
    answerAttempts: 2,
    pendingQuestion: true,
  };

  const ui = createUiController({
    state,
    tm: (key, params = {}) => `${key}:${JSON.stringify(params)}`,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 17,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);

  ui.updateUi();
  assert.equal(els.cardQuestion.classList.contains('hidden'), false);
  assert.match(els.answerFeedback.textContent, /^maxAttemptsReached/);

  state.pendingQuestion = false;
  ui.updateUi();
  assert.match(els.distance.textContent, /^distanceLine/);

  fixture.restore();
});

test('showScoreToast handles positive, negative and zero values', () => {
  const fixture = createFixture();
  const state = {
    ...baseState(),
    gameId: 'game-1',
  };

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const ui = createUiController({
    state,
    tm: (key, params = {}) => `${key}:${JSON.stringify(params)}`,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 10,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);

  ui.showScoreToast(12);
  assert.match(els.scoreToast.textContent, /^scoreLastGain/);

  ui.showScoreToast(-4);
  assert.match(els.scoreToast.textContent, /^scoreLastPenalty/);

  const previous = els.scoreToast.textContent;
  ui.showScoreToast(0);
  assert.equal(els.scoreToast.textContent, previous);

  globalThis.setTimeout = originalSetTimeout;
  fixture.restore();
});

test('updateUi shows payment card when paid game is not ready', () => {
  const fixture = createFixture();
  const state = {
    ...baseState(),
    gameId: 'game-1',
    requiresPayment: true,
    paymentReady: false,
  };

  const ui = createUiController({
    state,
    tm: (key) => key,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 10,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);
  ui.updateUi();

  assert.equal(els.cardPayment.classList.contains('hidden'), false);
  assert.equal(els.cardTarget.classList.contains('hidden'), true);

  fixture.restore();
});

test('updateUi shows optional name gate for free games before start', () => {
  const fixture = createFixture();
  const state = {
    ...baseState(),
    gameId: 'game-1',
    requiresPayment: false,
    nameConfirmed: false,
  };

  const ui = createUiController({
    state,
    tm: (key) => key,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 10,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);
  ui.updateUi();

  assert.equal(els.cardName.classList.contains('hidden'), false);
  assert.equal(els.cardLocation.classList.contains('hidden'), true);

  fixture.restore();
});

test('updateUi keeps offline download card hidden for restored sessions', () => {
  const fixture = createFixture();
  const state = {
    ...baseState(),
    gameId: 'game-1',
    supportsOffline: true,
    offlineMode: false,
    nameConfirmed: true,
    sessionRestored: true,
    geoWatchId: null,
  };

  const ui = createUiController({
    state,
    tm: (key) => key,
    formatEuro: (cents) => `EUR ${cents}`,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    slug: 'demo',
    distanceMeters: () => 10,
    constants: {
      LOCATION_RADIUS_METERS: 5,
      MAX_ALLOWED_GPS_ACCURACY_METERS: 11,
    },
  });

  const els = ui.getEls();
  ui.setElements(els);
  ui.updateUi();

  assert.equal(els.cardOffline.classList.contains('hidden'), true);
  assert.equal(els.cardLocation.classList.contains('hidden'), false);

  fixture.restore();
});

