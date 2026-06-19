import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeedbackContext, buildScoreNameOperation, parseFeedbackSession } from '../src/feedbackCore.js';

test('parseFeedbackSession returns parsed payload and null on invalid JSON', () => {
  const storage = {
    getItem(key) {
      if (key === 'ok') return '{"gameId":"g1"}';
      if (key === 'bad') return '{broken';
      return null;
    },
  };

  assert.deepEqual(parseFeedbackSession(storage, 'ok'), { gameId: 'g1' });
  assert.equal(parseFeedbackSession(storage, 'bad'), null);
  assert.equal(parseFeedbackSession(storage, 'missing'), null);
});

test('buildFeedbackContext normalizes defaults and trims winner fields', () => {
  const ctx = buildFeedbackContext({
    gameId: 'g1',
    slug: 'demo',
    requiresPayment: 1,
    paymentToken: 'pt',
    score: '42',
    totalAnswerTimeMs: '1200',
    playerId: 'p1',
    winnerName: '  Alice ',
    winnerPhone: ' 06123 ',
  });

  assert.equal(ctx.gameId, 'g1');
  assert.equal(ctx.requiresPayment, true);
  assert.equal(ctx.finalScore, 42);
  assert.equal(ctx.totalAnswerTimeMs, 1200);
  assert.equal(ctx.winnerName, 'Alice');
  assert.equal(ctx.winnerPhone, '06123');

  const empty = buildFeedbackContext(null);
  assert.equal(empty.gameId, '');
  assert.equal(empty.finalScore, 0);
});

test('buildScoreNameOperation returns correct modes and null cases', () => {
  assert.equal(buildScoreNameOperation({ requiresPayment: true, name: '', gameId: 'g', playerId: 'p', playerSessionId: 's', paymentToken: 't' }), null);
  assert.equal(buildScoreNameOperation({ requiresPayment: true, name: 'Alice', gameId: '', playerId: 'p', playerSessionId: 's', paymentToken: 't' }), null);

  assert.equal(buildScoreNameOperation({ requiresPayment: true, name: 'Alice', gameId: 'g', playerId: 'p', playerSessionId: '', paymentToken: 't' }), null);

  const paid = buildScoreNameOperation({
    requiresPayment: true,
    name: 'Alice',
    gameId: 'g',
    playerId: 'p',
    playerSessionId: 's',
    paymentToken: 't',
  });
  assert.equal(paid.mode, 'session');
  assert.equal(paid.payload.player_session_id, 's');

  assert.equal(buildScoreNameOperation({ requiresPayment: false, name: 'Bob', gameId: 'g', playerId: '', playerSessionId: 's', paymentToken: null }), null);

  const free = buildScoreNameOperation({
    requiresPayment: false,
    name: 'Bob',
    gameId: 'g',
    playerId: 'p',
    playerSessionId: 's',
    paymentToken: null,
  });
  assert.equal(free.mode, 'player');
  assert.equal(free.payload.player_id, 'p');
});

