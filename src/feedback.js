import './style.css';
import { getLanguage, t } from './i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { loadGameStyles } from './gameStyleService.js';
import { markPlayed } from './payment.js';
import {
  buildRankingsUrl,
  setScoreDisplayName,
  setScoreDisplayNameBySession,
} from './scoreService.js';
import { buildFeedbackContext, buildScoreNameOperation, parseFeedbackSession } from './feedbackCore.js';
import {
  buildFeedbackPageCopy,
  buildFeedbackSubmitPayload,
  resolveFeedbackError,
  shouldBlockRankingsNavigation,
} from './feedbackPageCore.js';
import {
  addOfflineBeforeUnloadGuard,
  confirmOfflineNavigation,
  runWithOfflineUnloadBypass,
} from './offlineNavigationGuard.js';

const language = getLanguage();
/** Shortcut for translating keys from the `main` section in feedback view. */
const tm = (key, params) => t(language, 'main', key, params);

// ─── Session data ─────────────────────────────────────────────────────────────

const data = parseFeedbackSession(sessionStorage);

const {
  gameId,
  slug,
  requiresPayment,
  paymentToken,
  finalScore,
  totalAnswerTimeMs,
  playerId,
  playerSessionId,
  winnerName,
  winnerPhone,
  offlineMode,
} = buildFeedbackContext(data);

// ─── Load game styles ─────────────────────────────────────────────────────────

if (gameId) {
  loadGameStyles(gameId).catch((err) => {
    console.warn('feedback: error loading game styles', err);
  });
}

// ─── Populate page ────────────────────────────────────────────────────────────

if (data?.logoUrl) {
  const logo = document.querySelector('#game-logo');
  logo.src = data.logoUrl;
  logo.classList.remove('hidden');
}

const copy = buildFeedbackPageCopy(tm, data, finalScore, totalAnswerTimeMs);
document.querySelector('#feedback-title').textContent = copy.title;
document.querySelector('#feedback-subtitle').textContent = copy.subtitle;
document.querySelector('#letters-label').textContent = copy.lettersLabel;
document.querySelector('#collected-letters').textContent = copy.lettersValue;
document.querySelector('#feedback-prompt').textContent = copy.prompt;
document.querySelector('#feedback-text').placeholder = copy.placeholder;
document.querySelector('#submit-feedback-btn').textContent = copy.submitLabel;
document.querySelector('#skip-feedback-btn').textContent = copy.skipLabel;
document.querySelector('#score-summary-title').textContent = copy.scoreTitle;
const scoreSummaryPointsEl = document.querySelector('#score-summary-points');
scoreSummaryPointsEl.textContent = copy.scorePoints;
document.querySelector('#score-summary-time').textContent = copy.scoreTime;
document.querySelector('#score-summary-time').classList.toggle('hidden', copy.hideScoreTime);

const offlineNoticeEl = document.querySelector('#offline-score-notice');
if (offlineNoticeEl && offlineMode) {
  offlineNoticeEl.textContent = tm('offlineScoreNotice');
  offlineNoticeEl.classList.remove('hidden');
}

const offlineNavigationMessage = tm('offlineNavigationConfirm');
addOfflineBeforeUnloadGuard({
  windowRef: window,
  navigatorRef: navigator,
  message: offlineNavigationMessage,
});

// ─── Navigation ───────────────────────────────────────────────────────────────

/** Navigate to the rankings page for the current game slug. */
function goToRankings() {
  if (shouldBlockRankingsNavigation(offlineMode, navigator)) {
    const allowed = confirmOfflineNavigation({
      navigatorRef: navigator,
      confirmRef: window.confirm?.bind(window),
      message: offlineNavigationMessage,
    });
    if (!allowed) {
      statusEl.textContent = tm('offlineNavigationCancelled');
      statusEl.classList.remove('hidden');
      submitBtn.disabled = false;
      skipBtn.disabled = false;
      submitBtn.textContent = tm('feedbackSubmit');
      skipBtn.textContent = tm('feedbackSkip');
      return;
    }
  }
  runWithOfflineUnloadBypass({
    windowRef: window,
    navigate: () => {
      window.location.href = buildRankingsUrl(slug);
    },
  });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Mark a paid token as played once feedback flow is complete.
 * @returns {Promise<void>}
 */
async function doMarkPlayed() {
  if (!requiresPayment || !paymentToken || !slug) return;
  try {
    await markPlayed(paymentToken, slug, winnerName, winnerPhone, data?.letters ?? []);
  } catch (err) {
    console.warn('feedback: could not mark played', err);
  }
}

/**
 * Persist the winner/player display name to scoreboard rows.
 * Uses session-scoped updates for paid games and player-scoped updates for free games.
 * @returns {Promise<void>}
 */
async function doSetScoreDisplayName() {
  // Set display name for ALL games (both paid and free).
  // For paid games: use player_session_id (unique per play session) to avoid overwriting other plays
  // For free games: use player_id (one name per player per game)
  const name = winnerName;
  const op = buildScoreNameOperation({
    requiresPayment,
    name,
    gameId,
    playerId,
    playerSessionId: data?.playerSessionId,
    paymentToken,
  });
  if (!op) return;

  try {
    if (op.mode === 'session') await setScoreDisplayNameBySession(op.payload);
    else await setScoreDisplayName(op.payload);
  } catch (err) {
    console.warn('feedback: could not set display name', err);
  }
}

// ─── Submit handler ───────────────────────────────────────────────────────────

const submitBtn = document.querySelector('#submit-feedback-btn');
const skipBtn   = document.querySelector('#skip-feedback-btn');
const textarea  = document.querySelector('#feedback-text');
const statusEl  = document.querySelector('#feedback-status');

submitBtn.addEventListener('click', async () => {
  const message = textarea.value.trim();
  if (!message) {
    // Treat empty submit as skip
    skipBtn.click();
    return;
  }

  submitBtn.disabled = true;
  skipBtn.disabled = true;
  submitBtn.textContent = tm('feedbackSending');
  statusEl.classList.add('hidden');

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(buildFeedbackSubmitPayload(slug, message)),
    });
    const json = await res.json();
    if (!res.ok) {
      submitBtn.disabled = false;
      skipBtn.disabled = false;
      submitBtn.textContent = tm('feedbackSubmit');
      statusEl.textContent = resolveFeedbackError(json, res.statusText, tm('feedbackError'));
      statusEl.classList.remove('hidden');
      return;
    }

    await Promise.allSettled([doMarkPlayed(), doSetScoreDisplayName()]);
    goToRankings();
  } catch {
    submitBtn.disabled = false;
    skipBtn.disabled = false;
    submitBtn.textContent = tm('feedbackSubmit');
    statusEl.textContent = tm('feedbackError');
    statusEl.classList.remove('hidden');
  }
});

// ─── Skip handler ─────────────────────────────────────────────────────────────

skipBtn.addEventListener('click', async () => {
  skipBtn.disabled = true;
  submitBtn.disabled = true;
  try {
    await Promise.allSettled([doMarkPlayed(), doSetScoreDisplayName()]);
  } catch { /* non-fatal */ }
  goToRankings();
});


