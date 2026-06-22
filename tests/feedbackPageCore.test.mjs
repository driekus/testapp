import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFeedbackPageCopy,
  buildFeedbackSubmitPayload,
  resolveFeedbackError,
} from '../src/feedbackPageCore.js';

function tm(key, params = {}) {
  if (key === 'scoreSummaryPoints') return `points:${params.score}`;
  if (key === 'scoreSummaryTime') return `time:${params.seconds}`;
  return key;
}

test('buildFeedbackPageCopy derives text and score visibility', () => {
  const withData = buildFeedbackPageCopy(tm, { displayName: 'Quest', letters: ['A', 'B'] }, 42, 1234);
  assert.equal(withData.title, '🎉 Quest');
  assert.equal(withData.lettersValue, 'A  B');
  assert.equal(withData.scorePoints, 'points:42');
  assert.equal(withData.scoreTime, 'time:1.23');
  assert.equal(withData.hideScoreTime, false);

  const withoutData = buildFeedbackPageCopy(tm, null, 0, 0);
  assert.equal(withoutData.title, 'feedbackTitle');
  assert.equal(withoutData.lettersValue, '—');
  assert.equal(withoutData.hideScoreTime, true);
});

test('buildFeedbackSubmitPayload returns API payload shape', () => {
  assert.deepEqual(buildFeedbackSubmitPayload('demo', 'Great game'), {
    slug: 'demo',
    message: 'Great game',
  });
});

test('resolveFeedbackError prefers API error then status text then fallback', () => {
  assert.equal(resolveFeedbackError({ error: 'blocked' }, 'Forbidden', 'fallback'), 'blocked');
  assert.equal(resolveFeedbackError({}, 'Forbidden', 'fallback'), 'Forbidden');
  assert.equal(resolveFeedbackError({}, '', 'fallback'), 'fallback');
});

