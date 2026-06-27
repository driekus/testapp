import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAYMENT_KEY,
  PAYMENT_REQUEST_KEY,
  clearStoredPaymentRequestToken,
  clearStoredPaymentToken,
  formatEuro,
  getStoredPaymentRequestToken,
  getStoredPaymentToken,
  markPlayed,
  pollUntilPaid,
  startPayment,
  storePaymentToken,
  storePaymentRequestToken,
  verifyPaymentToken,
} from '../src/payment.js';

function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('PAYMENT_KEY and formatEuro return expected formats', () => {
  assert.equal(PAYMENT_KEY('demo'), 'letter-quest-payment-demo');
  assert.equal(PAYMENT_REQUEST_KEY('demo'), 'letter-quest-payment-request-demo');
  assert.equal(typeof formatEuro(250), 'string');
  assert.match(formatEuro(250), /2,50|2\.50/);
});

test('get/store/clear payment token use localStorage safely', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    assert.equal(getStoredPaymentToken('demo'), null);
    storePaymentToken('demo', 'token-1');
    assert.equal(getStoredPaymentToken('demo'), 'token-1');
    clearStoredPaymentToken('demo');
    assert.equal(getStoredPaymentToken('demo'), null);

    // Missing values are ignored.
    storePaymentToken('', 'x');
    storePaymentToken('demo', '');
    clearStoredPaymentToken('');
    assert.equal(getStoredPaymentToken(''), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('storage helpers swallow storage exceptions', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
  };

  try {
    assert.equal(getStoredPaymentToken('demo'), null);
    assert.equal(getStoredPaymentRequestToken('demo'), null);
    assert.doesNotThrow(() => storePaymentToken('demo', 'x'));
    assert.doesNotThrow(() => storePaymentRequestToken('demo', 'x'));
    assert.doesNotThrow(() => clearStoredPaymentToken('demo'));
    assert.doesNotThrow(() => clearStoredPaymentRequestToken('demo'));
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('get/store/clear payment request token use localStorage safely', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();

  try {
    assert.equal(getStoredPaymentRequestToken('demo'), null);
    storePaymentRequestToken('demo', 'request-1');
    assert.equal(getStoredPaymentRequestToken('demo'), 'request-1');
    clearStoredPaymentRequestToken('demo');
    assert.equal(getStoredPaymentRequestToken('demo'), null);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test('verifyPaymentToken returns unpaid shape for missing args', async () => {
  assert.deepEqual(await verifyPaymentToken('', ''), { paid: false, payment_token: null, played: false });
});

test('verifyPaymentToken calls check-payment function', async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      async json() {
        return { paid: true, payment_token: 't', played: false };
      },
    };
  };

  try {
    const result = await verifyPaymentToken('demo', 'token-1');
    assert.equal(result.paid, true);
    assert.match(captured.url, /\/functions\/v1\/check-payment$/);
    assert.match(captured.options.body, /"game_slug":"demo"/);
    assert.match(captured.options.body, /"payment_token":"token-1"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startPayment redirects when url is returned', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();
  globalThis.window = { location: { href: '' } };
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { url: 'https://example.com/pay', paymentRequestToken: 'req-token' };
    },
  });

  try {
    await startPayment('demo');
    assert.equal(globalThis.window.location.href, 'https://example.com/pay');
    assert.equal(getStoredPaymentRequestToken('demo'), 'req-token');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  }
});

test('startPayment throws when payment url is missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { location: { href: '' } };
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {};
    },
  });

  try {
    await assert.rejects(() => startPayment('demo'), /No payment URL returned/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('pollUntilPaid returns once payment is confirmed and calls onPaid', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = [];
  globalThis.setTimeout = (fn) => {
    fn();
    return 0;
  };
  globalThis.fetch = async () => {
    calls.push(1);
    if (calls.length === 1) {
      return {
        ok: true,
        async json() {
          return { paid: false };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { paid: true, payment_token: 'paid-token' };
      },
    };
  };

  let paidToken = null;
  try {
    const result = await pollUntilPaid('demo', 'req-token', (token) => {
      paidToken = token;
    });
    assert.equal(result.payment_token, 'paid-token');
    assert.equal(paidToken, 'paid-token');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('pollUntilPaid times out when no paid response arrives', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { paid: false };
    },
  });

  let tick = 0;
  Date.now = () => {
    tick += 130000;
    return tick;
  };

  try {
    await assert.rejects(() => pollUntilPaid('demo', 'req-token'), /timed out/);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('markPlayed sends expected payload and throws when response is not ok', async () => {
  const originalFetch = globalThis.fetch;
  const payloads = [];
  globalThis.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { ok: true };
      },
    };
  };

  try {
    const result = await markPlayed('pt', 'slug', 'Alice', '06123', ['A', 'B']);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(payloads[0], {
      payment_token: 'pt',
      game_slug: 'slug',
      player_name: 'Alice',
      player_phone: '06123',
      letters_collected: ['A', 'B'],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => ({
    ok: false,
    statusText: 'Bad Request',
    async json() {
      return { error: 'boom' };
    },
  });

  try {
    await assert.rejects(() => markPlayed('pt', 'slug', 'Alice', '06123', []), /boom/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

