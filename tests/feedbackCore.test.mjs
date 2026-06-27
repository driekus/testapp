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
    playerSessionId: 's1',
    scoreSessionToken: 'signed-token',
    winnerName: '  Alice ',
    winnerPhone: ' 06123 ',
    finalQuestionPrompt: 'Final?',
    finalQuestionAnswer: 'Answer',
  });

  assert.equal(ctx.gameId, 'g1');
  assert.equal(ctx.requiresPayment, true);
  assert.equal(ctx.finalScore, 42);
  assert.equal(ctx.totalAnswerTimeMs, 1200);
  assert.equal(ctx.playerSessionId, 's1');
  assert.equal(ctx.scoreSessionToken, 'signed-token');
  assert.equal(ctx.winnerName, 'Alice');
  assert.equal(ctx.winnerPhone, '06123');
  assert.equal(ctx.finalQuestionPrompt, 'Final?');
  assert.equal(ctx.finalQuestionAnswer, 'Answer');

  const empty = buildFeedbackContext(null);
  assert.equal(empty.gameId, '');
  assert.equal(empty.finalScore, 0);
  assert.equal(empty.finalQuestionPrompt, '');
});

test('buildScoreNameOperation returns correct modes and null cases', () => {
  assert.equal(buildScoreNameOperation({ name: '', gameId: 'g', playerSessionId: 's', sessionToken: 'token' }), null);
  assert.equal(buildScoreNameOperation({ name: 'Alice', gameId: '', playerSessionId: 's', sessionToken: 'token' }), null);

  assert.equal(buildScoreNameOperation({ name: 'Alice', gameId: 'g', playerSessionId: '', sessionToken: 'token' }), null);
  assert.equal(buildScoreNameOperation({ name: 'Alice', gameId: 'g', playerSessionId: 's', sessionToken: '' }), null);

  const operation = buildScoreNameOperation({
    name: 'Alice',
    gameId: 'g',
    playerSessionId: 's',
    sessionToken: 'token',
  });
  assert.equal(operation.mode, 'session');
  assert.equal(operation.payload.player_session_id, 's');
  assert.equal(operation.payload.session_token, 'token');
});

