import './style.css';
import { getLanguage, t } from './i18n.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { loadGameStyles } from './gameStyleService.js';
import { SCORE_EVENT_TYPES, recordScoreEvent } from './scoreService.js';
import { buildFeedbackContext, parseFeedbackSession } from './feedbackCore.js';
import {
  ATTEMPTS_STORAGE_KEY,
  buildAttemptScopeKey,
  getStoredAttemptForScope,
  readAttemptStore as readAttemptStoreCore,
  rememberAttemptInStore,
  writeAttemptStore as writeAttemptStoreCore,
} from './finalQuestionCore.js';
import { validateAnswerLocally } from './gameLogic.js';
import {
  addOfflineBeforeUnloadGuard,
  runWithOfflineUnloadBypass,
} from './offlineNavigationGuard.js';

const language = getLanguage();
const tm = (key, params) => t(language, 'main', key, params);

const data = parseFeedbackSession(sessionStorage);
const {
  gameId,
  slug,
  requiresPayment,
  paymentToken,
  playerId,
  playerSessionId,
  offlineMode,
  finalQuestionPrompt,
  finalQuestionAnswer,
  finalScore,
} = buildFeedbackContext(data);

if (!slug || !gameId || !playerSessionId || !finalQuestionPrompt) {
  window.location.replace('/feedback.html');
  throw new Error('final question context missing');
}

if (gameId) {
  loadGameStyles(gameId).catch((err) => {
    console.warn('final-question: error loading game styles', err);
  });
}

if (data?.logoUrl) {
  const logo = document.querySelector('#game-logo');
  if (logo) {
    logo.src = data.logoUrl;
    logo.classList.remove('hidden');
  }
}

const pageTitleEl = document.querySelector('#final-question-page-title');
const pageSubtitleEl = document.querySelector('#final-question-page-subtitle');
const finalQuestionTitleEl = document.querySelector('#final-question-title');
const promptEl = document.querySelector('#final-question-prompt');
const answerLabelEl = document.querySelector('#final-question-answer-label');
const answerInput = document.querySelector('#final-question-answer');
const statusEl = document.querySelector('#final-question-status');
const submitBtn = document.querySelector('#submit-final-question-btn');
const continueBtn = document.querySelector('#continue-to-feedback-btn');
const offlineNoticeEl = document.querySelector('#offline-final-question-notice');
const attemptScopeKey = buildAttemptScopeKey(gameId, playerSessionId);
let answerLocked = false;

if (pageTitleEl) pageTitleEl.textContent = tm('finalQuestionTitle');
if (pageSubtitleEl) pageSubtitleEl.textContent = tm('finalQuestionPrompt');
if (finalQuestionTitleEl) finalQuestionTitleEl.textContent = tm('finalQuestionTitle');
if (promptEl) promptEl.textContent = finalQuestionPrompt;
if (answerLabelEl) answerLabelEl.textContent = tm('finalQuestionAnswerPlaceholder');
if (answerInput) {
  answerInput.placeholder = tm('finalQuestionAnswerPlaceholder');
  answerInput.setAttribute('aria-label', tm('finalQuestionAnswerPlaceholder'));
}
if (submitBtn) submitBtn.textContent = tm('finalQuestionSubmit');
if (continueBtn) continueBtn.textContent = tm('finalQuestionContinue');

if (offlineMode && offlineNoticeEl) {
  offlineNoticeEl.textContent = tm('finalQuestionOfflineNotice');
  offlineNoticeEl.classList.remove('hidden');
}

addOfflineBeforeUnloadGuard({
  windowRef: window,
  navigatorRef: navigator,
  message: tm('offlineNavigationConfirm'),
});

function setContinueEnabled(enabled) {
  if (!continueBtn) return;
  continueBtn.disabled = !enabled;
}

function readAttemptStore() {
  return readAttemptStoreCore(localStorage, ATTEMPTS_STORAGE_KEY);
}

function writeAttemptStore(nextStore) {
  writeAttemptStoreCore(localStorage, nextStore, ATTEMPTS_STORAGE_KEY);
}

function getStoredAttempt() {
  const store = readAttemptStore();
  return getStoredAttemptForScope(store, attemptScopeKey);
}

function rememberAttempt(correct) {
  const store = readAttemptStore();
  const nextStore = rememberAttemptInStore(store, attemptScopeKey, correct);
  writeAttemptStore(nextStore);
}

function lockAnsweredUi(correct, options = {}) {
  const { showAlreadyMessage = true } = options;
  answerLocked = true;
  if (showAlreadyMessage && statusEl) {
    statusEl.textContent = tm('finalQuestionAlreadyAnswered');
    statusEl.classList.remove('hidden');
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = tm('finalQuestionSubmit');
  }
  if (answerInput) answerInput.disabled = true;
  setContinueEnabled(true);
  if (typeof correct === 'boolean') {
    updateStoredFeedbackScore(correct ? Number(finalScore) + 50 : Number(finalScore));
  }
}

function toClientErrorMessage(err, fallback) {
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message || fallback);
  }
  return fallback;
}

function updateStoredFeedbackScore(score) {
  if (!Number.isFinite(score) || !data) return;
  try {
    const nextData = { ...data, score: Number(score) };
    sessionStorage.setItem('letter-quest-feedback', JSON.stringify(nextData));
  } catch {
    // Ignore unavailable storage; feedback page will still load.
  }
}

async function applyFinalQuestionBonus() {
  if (!gameId || !playerId || !playerSessionId) return false;
  try {
    const json = await recordScoreEvent({
      game_id: gameId,
      player_id: playerId,
      player_session_id: playerSessionId,
      event_type: SCORE_EVENT_TYPES.FINAL_QUESTION_CORRECT,
      event_key: 'final-question',
    });

    if (Number.isFinite(json?.score)) {
      updateStoredFeedbackScore(Number(json.score));
    }
    return true;
  } catch (err) {
    console.warn('final-question: could not apply final question bonus', err);
    return false;
  }
}

function applyOfflineBonusIfNeeded(isCorrect) {
  if (!isCorrect) return;
  const nextScore = Number(finalScore) + 50;
  if (Number.isFinite(nextScore)) {
    updateStoredFeedbackScore(nextScore);
  }
}

async function checkAlreadyAnsweredOnEntry() {
  const localAttempt = getStoredAttempt();
  if (localAttempt?.answered) {
    lockAnsweredUi(localAttempt.correct);
    return;
  }

  if (offlineMode) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-final-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        game_id: gameId,
        player_id: playerId,
        player_session_id: playerSessionId,
        payment_token: requiresPayment ? paymentToken : null,
        check_only: true,
      }),
    });

    if (!response.ok) return;
    const json = await response.json().catch(() => ({}));
    if (Boolean(json?.already_answered)) {
      rememberAttempt(Boolean(json?.correct));
      lockAnsweredUi(Boolean(json?.correct));
    }
  } catch {
    // Ignore startup checks when connectivity is unstable.
  }
}

async function submitFinalQuestion() {
  if (!answerInput || !statusEl || !submitBtn) return;
  if (answerLocked) return;

  const answer = answerInput.value.trim();
  if (!answer) {
    statusEl.textContent = tm('finalQuestionIncorrect');
    statusEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = tm('finalQuestionChecking');
  answerInput.disabled = true;

  try {
    if (offlineMode) {
      const correct = validateAnswerLocally(answer, finalQuestionAnswer);
      applyOfflineBonusIfNeeded(correct);
      rememberAttempt(correct);
      statusEl.textContent = correct ? tm('finalQuestionCorrect') : tm('finalQuestionIncorrect');
      statusEl.classList.remove('hidden');
      lockAnsweredUi(correct, { showAlreadyMessage: false });
      return;
    }

    let response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/submit-final-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          player_id: playerId,
          player_session_id: playerSessionId,
          answer,
          payment_token: requiresPayment ? paymentToken : null,
        }),
      });
    } catch (err) {
      statusEl.textContent = `${tm('serverError')}: ${String(err?.message || err)}`;
      statusEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = tm('finalQuestionSubmit');
      answerInput.disabled = false;
      return;
    }

    const json = await response.json().catch(() => ({}));
    setContinueEnabled(true);

    if (!response.ok) {
      statusEl.textContent = toClientErrorMessage(json?.error, response.statusText || tm('serverError'));
      statusEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = tm('finalQuestionSubmit');
      answerInput.disabled = false;
      return;
    }

    const alreadyAnswered = Boolean(json?.already_answered);
    const correct = Boolean(json?.correct);

    if (alreadyAnswered) {
      rememberAttempt(correct);
      statusEl.textContent = tm('finalQuestionAlreadyAnswered');
      lockAnsweredUi(correct);
    } else if (correct) {
      const bonusApplied = await applyFinalQuestionBonus();
      statusEl.textContent = bonusApplied ? tm('finalQuestionCorrect') : tm('serverError');
      rememberAttempt(correct);
      lockAnsweredUi(correct, { showAlreadyMessage: false });
    } else {
      statusEl.textContent = tm('finalQuestionIncorrect');
      rememberAttempt(correct);
      lockAnsweredUi(correct, { showAlreadyMessage: false });
    }

    statusEl.classList.remove('hidden');
  } catch (err) {
    statusEl.textContent = String(err?.message || tm('serverError'));
    statusEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = tm('finalQuestionSubmit');
    answerInput.disabled = false;
  }
}

submitBtn?.addEventListener('click', () => {
  void submitFinalQuestion();
});

answerInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void submitFinalQuestion();
  }
});

continueBtn?.addEventListener('click', () => {
  if (continueBtn.disabled) return;
  runWithOfflineUnloadBypass({
    windowRef: window,
    navigate: () => {
      window.location.href = '/feedback.html';
    },
  });
});

void checkAlreadyAnsweredOnEntry();




