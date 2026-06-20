import test from 'node:test';
import assert from 'node:assert/strict';

import { createUiController } from '../src/main/ui.js';
import { resolvePaymentAccess } from '../src/main/paymentGate.js';

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

function createWindowRef(search = '') {
  return {
    location: { search },
    history: {
      replaceState() {},
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
    displayName: 'Demo',
    configStatus: 'Loading',
    score: 0,
    statusMessage: 'Ready',
    collectedLetters: [],
    nameConfirmed: true,
    userPosition: null,
    priceInCents: 350,
    paymentToken: null,
  };
}

function createUiHarness(state) {
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
  return { ui, els };
}

test('refresh flow: valid stored token never shows pay card before access is granted', async () => {
  const fixture = createFixture();
  const state = baseState();
  const { ui, els } = createUiHarness(state);

  // Step 1 (mirrors loadGame start): before game is loaded, payment card is hidden.
  ui.updateUi();
  assert.equal(els.cardPayment.classList.contains('hidden'), true);

  // Step 2 (mirrors loadGame after fetchGameForPlay): paid game requires verification.
  state.gameId = 'game-1';
  state.requiresPayment = true;
  state.paymentReady = false;

  let releaseVerification;
  const verifyPromise = new Promise((resolve) => {
    releaseVerification = resolve;
  });

  const flow = resolvePaymentAccess({
    state,
    slug: 'demo',
    windowRef: createWindowRef(''),
    updateUi: () => ui.updateUi(),
    showPaymentCard: (...args) => ui.showPaymentCard(...args),
    paymentApi: {
      getStoredPaymentToken() {
        return 'stored-token';
      },
      clearStoredPaymentToken() {},
      verifyPaymentToken() {
        return verifyPromise;
      },
      async pollUntilPaid() {
        throw new Error('not used');
      },
      storePaymentToken() {},
    },
  });

  // Step 3: while verification is pending, no payment UI flash should appear.
  assert.equal(els.cardPayment.classList.contains('hidden'), true);

  releaseVerification({ paid: true, payment_token: 'live-token', played: false });
  const allowed = await flow;

  // Step 4: after verification, gameplay continues without pay wall.
  assert.equal(allowed, true);
  assert.equal(state.paymentReady, true);
  assert.equal(state.paymentToken, 'live-token');
  assert.equal(els.cardPayment.classList.contains('hidden'), true);

  fixture.restore();
});

test('refresh flow: invalid stored token shows pay card only after verification finishes', async () => {
  const fixture = createFixture();
  const state = baseState();
  const { ui, els } = createUiHarness(state);

  ui.updateUi();
  assert.equal(els.cardPayment.classList.contains('hidden'), true);

  state.gameId = 'game-1';
  state.requiresPayment = true;
  state.paymentReady = false;

  let releaseVerification;
  const verifyPromise = new Promise((resolve) => {
    releaseVerification = resolve;
  });

  const flow = resolvePaymentAccess({
    state,
    slug: 'demo',
    windowRef: createWindowRef(''),
    updateUi: () => ui.updateUi(),
    showPaymentCard: (...args) => ui.showPaymentCard(...args),
    paymentApi: {
      getStoredPaymentToken() {
        return 'stored-token';
      },
      clearStoredPaymentToken() {},
      verifyPaymentToken() {
        return verifyPromise;
      },
      async pollUntilPaid() {
        throw new Error('not used');
      },
      storePaymentToken() {},
    },
  });

  // Still verifying => still hidden.
  assert.equal(els.cardPayment.classList.contains('hidden'), true);

  releaseVerification({ paid: false, payment_token: null, played: false });
  const allowed = await flow;

  assert.equal(allowed, false);
  assert.equal(els.cardPayment.classList.contains('hidden'), false);
  assert.equal(els.paymentMessage.textContent, 'payToPlay');

  fixture.restore();
});

