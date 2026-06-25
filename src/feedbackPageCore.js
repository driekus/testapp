/**
 * Build static feedback page copy derived from session and translation helpers.
 * @param {(key:string, params?:Record<string, unknown>) => string} tm
 * @param {{displayName?:string,letters?:string[]}} data
 * @param {number} finalScore
 * @param {number} totalAnswerTimeMs
 */
export function buildFeedbackPageCopy(tm, data, finalScore, totalAnswerTimeMs) {
  return {
    title: data?.displayName ? `🎉 ${data.displayName}` : tm('feedbackTitle'),
    subtitle: tm('feedbackSubtitle'),
    lettersLabel: tm('feedbackLetters'),
    lettersValue: data?.letters?.length ? data.letters.join('  ') : '—',
    prompt: tm('feedbackPrompt'),
    placeholder: tm('feedbackPlaceholder'),
    submitLabel: tm('feedbackSubmit'),
    skipLabel: tm('feedbackSkip'),
    scoreTitle: tm('scoreSummaryTitle'),
    scorePoints: tm('scoreSummaryPoints', { score: finalScore }),
    scoreTime: tm('scoreSummaryTime', { seconds: (Number(totalAnswerTimeMs) / 1000).toFixed(2) }),
    hideScoreTime: Number(totalAnswerTimeMs) <= 0,
  };
}

/**
 * Determine whether navigating to rankings should be blocked while offline.
 * Rankings depend on live network data, so navigation should confirm first when
 * there is no connectivity.
 * @param {boolean} _offlineMode
 * @param {{ onLine?: boolean } | undefined | null} navigatorRef
 * @returns {boolean}
 */
export function shouldBlockRankingsNavigation(_offlineMode, navigatorRef) {
  return navigatorRef?.onLine === false;
}

/**
 * Build payload for feedback submit endpoint.
 * @param {string} slug
 * @param {string} message
 */
export function buildFeedbackSubmitPayload(slug, message) {
  return { slug, message };
}

/**
 * Pick the best error message for feedback submit failures.
 * @param {any} json
 * @param {string} statusText
 * @param {string} fallback
 * @returns {string}
 */
export function resolveFeedbackError(json, statusText, fallback) {
  return String(json?.error || statusText || fallback);
}

