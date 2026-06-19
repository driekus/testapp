import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWinnerSavePayload, getWinnerSlug, validateWinnerFields } from '../src/winnerCore.js';

test('getWinnerSlug extracts slug from search params', () => {
  assert.equal(getWinnerSlug('?slug=amsterdam-tour'), 'amsterdam-tour');
  assert.equal(getWinnerSlug('?x=1'), '');
  assert.equal(getWinnerSlug(''), '');
});

test('validateWinnerFields reports first missing field and valid state', () => {
  assert.deepEqual(validateWinnerFields('', '06123'), { valid: false, firstMissing: 'name' });
  assert.deepEqual(validateWinnerFields('Alice', ''), { valid: false, firstMissing: 'phone' });
  assert.deepEqual(validateWinnerFields(' Alice ', ' 06123 '), { valid: true, firstMissing: null });
});

test('buildWinnerSavePayload returns trimmed request payload', () => {
  const payload = buildWinnerSavePayload({
    paymentToken: 'pt',
    slug: 'demo',
    name: ' Alice ',
    phone: ' 06123 ',
  });

  assert.deepEqual(payload, {
    payment_token: 'pt',
    game_slug: 'demo',
    player_name: 'Alice',
    player_phone: '06123',
  });
});

