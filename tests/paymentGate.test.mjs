import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePaymentAccess } from '../src/main/paymentGate.js';

function createWindowRef(search = '') {
  const calls = [];
  return {
    location: { search },
    history: {
      replaceState(...args) {
        calls.push(args);
      },
    },
    replaceCalls: calls,
  };
}

function basePaymentApi() {
  return {
    getStoredPaymentToken() {
      return null;
    },
    clearStoredPaymentToken() {},
    async verifyPaymentToken() {
      return {};
    },
    async pollUntilPaid() {
      return {};
    },
    storePaymentToken() {},
  };
}

test('returns true when stored paid token is valid and unplayed', async () => {
  const state = { paymentReady: true, paymentToken: null };
  let updateCount = 0;
  const cards = [];
  const paymentApi = {
    ...basePaymentApi(),
    getStoredPaymentToken() {
      return 'stored-token';
    },
    async verifyPaymentToken() {
      return { paid: true, payment_token: 'live-token', played: false };
    },
  };

  const allowed = await resolvePaymentAccess({
    state,
    slug: 'slug',
    windowRef: createWindowRef(''),
    updateUi() {
      updateCount += 1;
    },
    showPaymentCard(...args) {
      cards.push(args);
    },
    paymentApi,
  });

  assert.equal(allowed, true);
  assert.equal(state.paymentReady, true);
  assert.equal(state.paymentToken, 'live-token');
  assert.equal(updateCount, 1);
  assert.equal(cards.length, 0);
});

test('clears invalid stored token and falls back to pay card', async () => {
  const state = { paymentReady: true, paymentToken: 'old-token' };
  const clearCalls = [];
  const cards = [];
  const paymentApi = {
    ...basePaymentApi(),
    getStoredPaymentToken() {
      return 'stored-token';
    },
    async verifyPaymentToken() {
      return { paid: false, payment_token: null, played: true };
    },
    clearStoredPaymentToken(slug) {
      clearCalls.push(slug);
    },
  };

  const allowed = await resolvePaymentAccess({
    state,
    slug: 'slug',
    windowRef: createWindowRef(''),
    updateUi() {},
    showPaymentCard(...args) {
      cards.push(args);
    },
    paymentApi,
  });

  assert.equal(allowed, false);
  assert.equal(state.paymentToken, null);
  assert.deepEqual(clearCalls, ['slug']);
  assert.deepEqual(cards, [['alreadyPlayed', 'payAgain']]);
});

test('starts payment polling flow and stores token from callback', async () => {
  const state = { paymentReady: true, paymentToken: null };
  const stored = [];
  const cards = [];
  const win = createWindowRef('?payment_request_token=req-123');

  const paymentApi = {
    ...basePaymentApi(),
    async pollUntilPaid(slug, requestToken, onPaid) {
      assert.equal(slug, 'slug');
      assert.equal(requestToken, 'req-123');
      onPaid('cached-token');
      return { payment_token: 'payment-token' };
    },
    storePaymentToken(slug, token) {
      stored.push({ slug, token });
    },
  };

  const allowed = await resolvePaymentAccess({
    state,
    slug: 'slug',
    windowRef: win,
    updateUi() {},
    showPaymentCard(...args) {
      cards.push(args);
    },
    paymentApi,
  });

  assert.equal(allowed, true);
  assert.equal(state.paymentToken, 'payment-token');
  assert.equal(state.paymentReady, true);
  assert.deepEqual(stored, [{ slug: 'slug', token: 'cached-token' }]);
  assert.equal(cards[0][0], 'paymentPending');
  assert.equal(win.replaceCalls.length, 1);
});

test('shows pay card when polling fails', async () => {
  const state = { paymentReady: true, paymentToken: null };
  const cards = [];

  const paymentApi = {
    ...basePaymentApi(),
    async pollUntilPaid() {
      throw new Error('timeout');
    },
  };

  const allowed = await resolvePaymentAccess({
    state,
    slug: 'slug',
    windowRef: createWindowRef('?payment_request_token=req-123'),
    updateUi() {},
    showPaymentCard(...args) {
      cards.push(args);
    },
    paymentApi,
  });

  assert.equal(allowed, false);
  assert.deepEqual(cards, [
    ['paymentPending', 'payButton', true],
    ['payToPlay'],
  ]);
});

test('clears stored token when verification throws and shows default pay card', async () => {
  const state = { paymentReady: true, paymentToken: 'old-token' };
  const clearCalls = [];
  const cards = [];

  const paymentApi = {
    ...basePaymentApi(),
    getStoredPaymentToken() {
      return 'stored-token';
    },
    async verifyPaymentToken() {
      throw new Error('network');
    },
    clearStoredPaymentToken(slug) {
      clearCalls.push(slug);
    },
  };

  const allowed = await resolvePaymentAccess({
    state,
    slug: 'slug',
    windowRef: createWindowRef(''),
    updateUi() {},
    showPaymentCard(...args) {
      cards.push(args);
    },
    paymentApi,
  });

  assert.equal(allowed, false);
  assert.deepEqual(clearCalls, ['slug']);
  assert.deepEqual(cards, [['payToPlay', 'payButton']]);
});

