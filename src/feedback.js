import './style.css';
import { getLanguage, t } from './i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { loadGameStyles } from './gameStyleService.js';
import { markPlayed } from './payment.js';
import { buildRankingsUrl, setScoreDisplayName, setScoreDisplayNameBySession } from './scoreService.js';
import { buildFeedbackContext, buildScoreNameOperation, parseFeedbackSession } from './feedbackCore.js';

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
  winnerName,
  winnerPhone,
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

document.querySelector('#feedback-title').textContent = data?.displayName
  ? `🎉 ${data.displayName}`
  : tm('feedbackTitle');
document.querySelector('#feedback-subtitle').textContent = tm('feedbackSubtitle');
document.querySelector('#letters-label').textContent = tm('feedbackLetters');
document.querySelector('#collected-letters').textContent =
  data?.letters?.length ? data.letters.join('  ') : '—';
document.querySelector('#feedback-prompt').textContent = tm('feedbackPrompt');
document.querySelector('#feedback-text').placeholder = tm('feedbackPlaceholder');
document.querySelector('#submit-feedback-btn').textContent = tm('feedbackSubmit');
document.querySelector('#skip-feedback-btn').textContent = tm('feedbackSkip');
document.querySelector('#score-summary-title').textContent = tm('scoreSummaryTitle');
document.querySelector('#score-summary-points').textContent = tm('scoreSummaryPoints', { score: finalScore });
document.querySelector('#score-summary-time').textContent = tm('scoreSummaryTime', {
  seconds: (totalAnswerTimeMs / 1000).toFixed(2),
});
document.querySelector('#score-summary-time').classList.toggle('hidden', totalAnswerTimeMs <= 0);

// ─── Navigation ───────────────────────────────────────────────────────────────

/** Navigate to the rankings page for the current game slug. */
function goToRankings() {
  window.location.href = buildRankingsUrl(slug);
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
      body: JSON.stringify({ slug, message }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? res.statusText);

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

