import './style.css';
import { distanceMeters, isQuickJump, validateAnswerLocally } from './gameLogic.js';
import { defaultConfig } from './config.js';
import { hasSupabaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
import { fetchGameForPlay, fetchRouteStart, listGames } from './userConfigService.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { loadGameStyles } from './gameStyleService.js';
import {
  SCORE_EVENT_TYPES,
  buildScoreEventKey,
  buildRankingsUrl,
  createPlaySessionId,
  getPlayerId,
  recordScoreEvent,
} from './scoreService.js';
import {
  clearStoredPaymentToken,
  formatEuro,
  getStoredPaymentToken,
  pollUntilPaid,
  startPayment,
  storePaymentToken,
  verifyPaymentToken,
} from './payment.js';
import { createUiController } from './main/ui.js';
import { createSessionStore } from './main/session.js';
import { resolvePaymentAccess } from './main/paymentGate.js';
import { createLocationTracking } from './main/locationTracking.js';
import { downloadGameOffline, loadCachedGame } from './main/offlineSync.js';
import {
  appendNextLocation,
  computeRemainingCooldownMs,
  normalizeRoute,
  shouldAutoResumeTracking as shouldAutoResumeTrackingFromState,
} from './main/mainCore.js';

const LOCATION_RADIUS_METERS = 5;
const MAX_ALLOWED_GPS_ACCURACY_METERS = 11;
const LETTER_COOLDOWN_MS = 12000;
const MAX_SPEED_METERS_PER_SECOND = 22;
const MAX_JUMP_DISTANCE_METERS = 250;
const HIGH_ACCURACY_TIMEOUT_MS = 20000;
const BALANCED_TIMEOUT_MS = 30000;

const language = getLanguage();
/** Shortcut for translating keys from the `main` section in gameplay UI. */
const tm = (key, params) => t(language, 'main', key, params);

// Read slug from URL path: "/amsterdam-tour" → "amsterdam-tour"
const slug = window.location.pathname.replace(/^\/+/, '').split('/')[0] || '';

const state = {
  // game / route data
  gameId: null,
  gameRoutes: [],           // [{id, order_index, display_name, route: [...]}]
  currentRouteIndex: 0,
  currentRouteId: null,     // DB id of the active route row — used for Edge Function calls
  route: defaultConfig().route,
  displayName: '',
  requiresPayment: false,
  priceInCents: 0,
  paymentToken: null,
  paymentReady: true,
  supportsOffline: false,   // whether this game supports offline mode
  offlineMode: false,       // true when using cached game data
  offlineCacheExpiry: null, // timestamp when offline cache expires
  // player identity
  winnerName: '',           // paid games: loaded from sessionStorage after winner.html
  winnerPhone: '',          // paid games: loaded from sessionStorage after winner.html
  playerDisplayName: '',    // free games: entered in optional name prompt
  nameConfirmed: true,      // free games: true once name card is dismissed
  // quest progress
  currentLocationIndex: 0,
  collectedLetters: [],     // accumulated across all routes
  pendingLetter: null,
  pendingQuestion: false,   // true while waiting for correct answer
  answerWrong: false,       // true after a wrong answer attempt
  answerAttempts: 0,        // wrong attempts for the current question
  serverError: false,       // true when an Edge Function call fails
  checking: false,          // true while an Edge Function call is in flight
  userPosition: null,
  lastTrustedPosition: null,
  lastLetterGrantedAt: 0,
  geoWatchId: null,
  routeComplete: false,     // true while waiting for player to advance to next route
  statusMessage: tm('tapToBegin'),
  configStatus: tm('configLoading'),
  lastDistanceToTarget: null,
  playerId: '',
  playerSessionId: '',
  score: 0,
  lastScoreDelta: 0,
  totalAnswerTimeMs: 0,
  questionStartedAt: 0,
};

// ─── Translations ───────────────────────────────────────────────────────────

/**
 * Apply translated text/placeholder content for i18n-marked elements within a root node.
 * @param {ParentNode} root
 */
function applyTranslations(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = tm(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = tm(el.dataset.i18nPlaceholder);
  });
}

// ─── Lobby ─────────────────────────────────────────────────────────────────

/**
 * Render the game lobby list with free/paid badges.
 * @param {Array<{slug: string, display_name: string, requires_payment?: boolean, price_in_cents?: number}>} games
 */
function renderLobby(games) {
  const gameList = document.querySelector('#game-list');
  gameList.replaceChildren();
  if (games.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = tm('noGamesAvailable');
    gameList.appendChild(p);
  } else {
    for (const g of games) {
      const a = document.createElement('a');
      a.className = 'game-link';
      a.href = `/${g.slug}`;
      const title = document.createElement('span');
      title.textContent = g.display_name;
      a.appendChild(title);

      if (g.requires_payment) {
        const badge = document.createElement('span');
        badge.className = 'paid-badge';
        badge.textContent = `\uD83D\uDD12 ${formatEuro(g.price_in_cents ?? 0)}`;
        a.appendChild(badge);
      }
      gameList.appendChild(a);
    }
  }
}

/**
 * Show the lobby view and load available games.
 * @returns {Promise<void>}
 */
async function showLobby() {
  const lobby = document.querySelector('#lobby');
  applyTranslations(lobby);
  document.querySelector('#language-select-lobby').value = language;
  lobby.classList.remove('hidden');

  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = tm('configLoading');
  document.querySelector('#game-list').replaceChildren(loading);

  try {
    renderLobby(await listGames());
  } catch {
    renderLobby([]);
  }
}


const uiController = createUiController({
  state,
  tm,
  formatEuro,
  buildRankingsUrl,
  slug,
  distanceMeters,
  constants: {
    LOCATION_RADIUS_METERS,
    MAX_ALLOWED_GPS_ACCURACY_METERS,
  },
});

let els = {};
const {
  getEls,
  setElements,
  showScoreToast,
  showPaymentCard,
  updateUi,
} = uiController;

/**
 * Append the next location when it is not a duplicate of the current tail.
 * @param {{lat: number, lng: number} | null | undefined} next
 */
function pushNextLocation(next) {
  appendNextLocation(state.route, next);
}

// ─── Session persistence ─────────────────────────────────────────────────────

const SESSION_KEY = slug ? `letter-quest-session-${slug}` : null;
const {
  saveSession,
  clearSession,
  loadSavedSession,
} = createSessionStore({
  sessionKey: SESSION_KEY,
  storage: window.localStorage,
  state,
});

// ─── Audio feedback ─────────────────────────────────────────────────────────

let audioCtx = null;

/** Play a short positive three-note sound cue. */
function playHappySound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  const noteDuration = 0.12;
  const gap = 0.05;

  notes.forEach((freq, i) => {
    const start = audioCtx.currentTime + i * (noteDuration + gap);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.35, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);
    osc.start(start);
    osc.stop(start + noteDuration);
  });
}

/** Play a double-beep warning cue. */
function playDoubleBeep() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const beepDuration = 0.25;
  const pauseBetween = 0.4;

  /**
   * Play a single beep at a scheduled AudioContext time.
   * @param {number} startTime
   */
  function beep(startTime) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + beepDuration);
    osc.start(startTime);
    osc.stop(startTime + beepDuration);
  }

  const now = audioCtx.currentTime;
  beep(now);
  beep(now + beepDuration + pauseBetween);
}

// ─── Game logic ─────────────────────────────────────────────────────────────

/**
 * Compute remaining anti-duplicate cooldown before a new letter can be granted.
 * @returns {number}
 */
function remainingCooldownMs() {
  return computeRemainingCooldownMs(state.lastLetterGrantedAt, Date.now(), LETTER_COOLDOWN_MS);
}

/** Evaluate current position and update state when a target is reached. */
function checkArrival() {
  if (state.pendingLetter || state.pendingQuestion || state.checking || !state.userPosition || state.routeComplete) return;

  const currentTarget = state.route[state.currentLocationIndex];
  if (!currentTarget) return;

  const effectiveRadius = Math.min(
    MAX_ALLOWED_GPS_ACCURACY_METERS,
    Math.max(LOCATION_RADIUS_METERS, state.userPosition.accuracy),
  );
  const meters = distanceMeters(
    state.userPosition.latitude,
    state.userPosition.longitude,
    currentTarget.lat,
    currentTarget.lng,
  );

  if (meters <= effectiveRadius) {
    const cooldownLeft = remainingCooldownMs();
    if (cooldownLeft > 0) {
      state.statusMessage = tm('cooldown', {
        seconds: Math.ceil(cooldownLeft / 1000),
        name: currentTarget.name,
      });
      updateUi();
      return;
    }
    state.lastLetterGrantedAt = Date.now();
    state.statusMessage = tm('reached', { name: currentTarget.name });
    playHappySound();
    void recordProgressEvent(SCORE_EVENT_TYPES.LOCATION_FOUND);
    if (currentTarget.question) {
      state.pendingQuestion = true;
      state.answerWrong = false;
      state.answerAttempts = 0;
      state.questionStartedAt = Date.now();
    } else {
      confirmArrival();
    }
  } else {
    state.statusMessage = tm('moveCloser', { name: currentTarget.name });
  }
  updateUi();
}
const { startLocationTracking } = createLocationTracking({
  state,
  tm,
  updateUi,
  checkArrival,
  playDoubleBeep,
  geolocation: navigator.geolocation,
  isQuickJump,
  distanceMeters,
  constants: {
    MAX_ALLOWED_GPS_ACCURACY_METERS,
    MAX_SPEED_METERS_PER_SECOND,
    MAX_JUMP_DISTANCE_METERS,
    BALANCED_TIMEOUT_MS,
    HIGH_ACCURACY_TIMEOUT_MS,
  },
});

/**
 * Build an absolute Edge Function URL.
 * @param {string} name
 * @returns {Promise<string>}
 */
async function edgeFunctionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

/**
 * Record a score/progress event and reconcile returned score/time values.
 * @param {string} eventType
 * @param {object} [extra={}]
 * @returns {Promise<void>}
 */
async function recordProgressEvent(eventType, extra = {}) {
  if (!state.gameId || !state.playerSessionId || !state.currentRouteId) return;

  try {
    const previousScore = state.score;
    const payload = {
      game_id: state.gameId,
      player_id: state.playerId,
      player_session_id: state.playerSessionId,
      event_type: eventType,
      event_key: buildScoreEventKey(state.currentRouteId, state.currentLocationIndex, eventType),
      ...extra,
    };
    const json = await recordScoreEvent(payload);
    if (Number.isFinite(json?.score)) {
      const nextScore = Number(json.score);
      const delta = nextScore - previousScore;
      state.score = nextScore;
      if (delta !== 0) {
        state.lastScoreDelta = delta;
        showScoreToast(delta);
      }
    }
    if (Number.isFinite(json?.total_answer_time_ms)) {
      state.totalAnswerTimeMs = Number(json.total_answer_time_ms);
    }
  } catch (err) {
    console.warn('main: could not record score event', err);
  }
}

/**
 * Confirm location arrival with the backend and stage the pending letter.
 * @returns {Promise<void>}
 */
async function confirmArrival() {
  state.checking = true;
  state.statusMessage = tm('checking');
  state.serverError = false;
  updateUi();

  try {
    // Offline mode: confirm locally
    if (state.offlineMode) {
      const currentTarget = state.route[state.currentLocationIndex];
      if (currentTarget) {
        state.pendingLetter = currentTarget.letter;
        // Next location is already in state.route
        await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED);
        state.statusMessage = tm('reached', { name: currentTarget.name });
        saveSession();
      }
    } else {
      // Online mode: confirm via Edge Function
      const res = await fetch(await edgeFunctionUrl('confirm-arrival'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          route_id: state.currentRouteId,
          location_index: state.currentLocationIndex,
          payment_token: state.requiresPayment ? state.paymentToken : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        state.serverError = true;
        state.statusMessage = tm('serverError');
        state.lastLetterGrantedAt = 0;  // allow retry on next GPS tick
      } else {
        state.pendingLetter = json.letter;
        pushNextLocation(json.next_location);
        await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED);
        state.statusMessage = tm('reached', { name: state.route[state.currentLocationIndex].name });
        saveSession();
      }
    }
  } catch {
    state.serverError = true;
    state.statusMessage = tm('serverError');
    state.lastLetterGrantedAt = 0;  // allow retry on next GPS tick
  } finally {
    state.checking = false;
  }
  updateUi();
}

/**
 * Submit the current answer for a question-gated location.
 * @returns {Promise<void>}
 */
async function submitAnswer() {
  const currentTarget = state.route[state.currentLocationIndex];
  if (!state.pendingQuestion || !currentTarget || state.checking) return;

  const given = els.answerInput.value.trim();
  els.answerInput.value = '';
  state.answerWrong = false;
  state.serverError = false;
  state.checking = true;
  state.statusMessage = tm('checking');
  updateUi();

  try {
    const attemptNumber = state.answerAttempts + 1;
    const answerTimeMs = state.questionStartedAt > 0
      ? Math.max(0, Date.now() - state.questionStartedAt)
      : 0;

    // Offline mode: validate answer locally
    if (state.offlineMode) {
      const isCorrect = validateAnswerLocally(given, currentTarget.answer);
      if (isCorrect) {
        state.pendingQuestion = false;
        state.answerAttempts = 0;
        state.questionStartedAt = 0;
        state.pendingLetter = currentTarget.letter;
        // In offline mode, next location is already available in state.route
        await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED);
        await recordProgressEvent(SCORE_EVENT_TYPES.ANSWER_CORRECT, {
          attempt_number: attemptNumber,
          answer_time_ms: answerTimeMs,
        });
        saveSession();
      } else {
        state.answerAttempts += 1;
        state.answerWrong = true;
      }
    } else {
      // Online mode: validate via Edge Function
      const res = await fetch(await edgeFunctionUrl('check-answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          route_id: state.currentRouteId,
          location_index: state.currentLocationIndex,
          answer: given,
          payment_token: state.requiresPayment ? state.paymentToken : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        state.serverError = true;
        state.statusMessage = tm('serverError');
      } else if (json.correct) {
        state.pendingQuestion = false;
        state.answerAttempts = 0;
        state.questionStartedAt = 0;
        state.pendingLetter = json.letter;
        pushNextLocation(json.next_location);
        await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED);
        await recordProgressEvent(SCORE_EVENT_TYPES.ANSWER_CORRECT, {
          attempt_number: attemptNumber,
          answer_time_ms: answerTimeMs,
        });
        saveSession();
      } else {
        state.answerAttempts += 1;
        state.answerWrong = true;
      }
    }
  } catch {
    state.serverError = true;
    state.statusMessage = tm('serverError');
  } finally {
    state.checking = false;
  }
  checkArrival();
  updateUi();
}

/**
 * Finalize the current location and transition to next location/route/end state.
 * @param {string | null} [letter=null]
 */
function completeCurrentLocation(letter = null) {
  if (letter) state.collectedLetters.push(letter);
  state.pendingLetter = null;
  state.questionStartedAt = 0;
  state.currentLocationIndex += 1;
  state.lastDistanceToTarget = null;

  if (state.currentLocationIndex >= state.route.length) {
    // Finished all locations in the current route
    const moreRoutes = state.currentRouteIndex + 1 < state.gameRoutes.length;
    if (moreRoutes) {
      state.routeComplete = true;
      const nextRoute = state.gameRoutes[state.currentRouteIndex + 1];
      state.statusMessage = tm('routeComplete', { name: nextRoute.display_name });
      saveSession();
    } else {
       clearSession();
       try {
         // Clear winner details from session so next play requires fresh winner.html form
         sessionStorage.removeItem('letter-quest-winner-details');

         const feedbackData = {
           gameId: state.gameId,
           slug,
           displayName: state.displayName,
           letters: state.collectedLetters,
           playerId: state.playerId,
           score: state.score,
           totalAnswerTimeMs: state.totalAnswerTimeMs,
           playerSessionId: state.playerSessionId,
           logoUrl: els.gameLogo?.src || '',
           requiresPayment: state.requiresPayment,
           paymentToken: state.paymentToken,
           // Winner/player name passed through to feedback for DB save
           winnerName: state.requiresPayment ? state.winnerName : state.playerDisplayName,
           winnerPhone: state.requiresPayment ? state.winnerPhone : '',
         };
         sessionStorage.setItem('letter-quest-feedback', JSON.stringify(feedbackData));
      } catch { /* ignore */ }
      window.location.href = '/feedback.html';
      return;
    }
  } else {
    state.statusMessage = tm('nextTarget', { name: state.route[state.currentLocationIndex].name });
    saveSession();
  }
  updateUi();
}

/** Confirm the currently pending letter and advance progress. */
function confirmLetter() {
  if (!state.pendingLetter) return;
  completeCurrentLocation(state.pendingLetter);
}

/**
 * Skip the current question, apply the score penalty server-side, and continue.
 * @returns {Promise<void>}
 */
async function skipQuestion() {
  const currentTarget = state.route[state.currentLocationIndex];
  if (!state.pendingQuestion || !currentTarget || state.checking) return;

  state.answerWrong = false;
  state.serverError = false;
  state.checking = true;
  state.statusMessage = tm('checking');
  updateUi();

  try {
    const res = await fetch(await edgeFunctionUrl('confirm-arrival'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        route_id: state.currentRouteId,
        location_index: state.currentLocationIndex,
        payment_token: state.requiresPayment ? state.paymentToken : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      state.serverError = true;
      state.statusMessage = tm('serverError');
    } else {
      state.pendingQuestion = false;
      state.answerAttempts = 0;
      state.questionStartedAt = 0;
      pushNextLocation(json.next_location);
      await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED);
      await recordProgressEvent(SCORE_EVENT_TYPES.QUESTION_SKIPPED);
      state.statusMessage = tm('questionSkippedPenalty');
      completeCurrentLocation(null);
    }
  } catch {
    state.serverError = true;
    state.statusMessage = tm('serverError');
  } finally {
    state.checking = false;
  }
  updateUi();
}

/**
 * Initialize and start the next route in a multi-route game.
 * @returns {Promise<void>}
 */
async function startNextRoute() {
  state.currentRouteIndex += 1;
  const nextRoute = state.gameRoutes[state.currentRouteIndex];
  state.currentRouteId = nextRoute.id;
  state.currentLocationIndex = 0;
  state.pendingLetter = null;
  state.lastLetterGrantedAt = 0;
  state.routeComplete = false;
  state.lastDistanceToTarget = null;
  state.questionStartedAt = 0;
  state.checking = true;
  state.statusMessage = tm('checking');
  updateUi();

  try {
    const firstLocation = await fetchRouteStart(nextRoute.id, state.requiresPayment ? state.paymentToken : null);
    state.route = [firstLocation];
    state.statusMessage = tm('nextRouteStarted', { name: nextRoute.display_name });
    saveSession();
  } catch {
    state.serverError = true;
    state.statusMessage = tm('serverError');
  } finally {
    state.checking = false;
  }
  updateUi();
}

// ─── Config loading ─────────────────────────────────────────────────────────

/**
 * Load game config, payment state, saved progress, and initial UI state.
 * @returns {Promise<void>}
 */
async function loadGame() {
  state.configStatus = tm('configLoading');
  let shouldAutoResumeTracking = false;
  updateUi();

  try {
    const game = await fetchGameForPlay(slug);

    if (!game || game.routes.length === 0) {
      state.configStatus = tm('gameNotFound', { slug });
      state.statusMessage = tm('tapToBegin');
    } else {
      // Load custom game styles from database
      await loadGameStyles(game.id);
      state.gameId = game.id;
      state.playerId = getPlayerId(slug);
      const freshPlaySessionId = createPlaySessionId();
      state.playerSessionId = freshPlaySessionId;

      state.requiresPayment = Boolean(game.requires_payment);
      state.priceInCents = Number(game.price_in_cents) || 0;
      state.supportsOffline = Boolean(game.supports_offline);
      state.paymentReady = !state.requiresPayment;
      if (!state.requiresPayment) state.paymentToken = null;

      if (game.logo_url && els.gameLogo) {
        els.gameLogo.src = game.logo_url;
        els.gameLogo.classList.remove('hidden');
      }

      // Check if offline cache exists for this game
      const cachedData = loadCachedGame(slug);
      const useOfflineCache = cachedData && state.supportsOffline;

      if (state.requiresPayment && !useOfflineCache) {
        const canPlay = await resolvePaymentAccess({
          state,
          slug,
          windowRef: window,
          updateUi,
          showPaymentCard,
          paymentApi: {
            getStoredPaymentToken,
            clearStoredPaymentToken,
            verifyPaymentToken,
            pollUntilPaid,
            storePaymentToken,
          },
        });
        if (!canPlay) {
          state.configStatus = tm('configLoaded');
          updateUi();
          return;
        }

        // Read winner details saved by winner.js (via sessionStorage)
        let winnerName = '';
        let winnerPhone = '';
        try {
          const raw = sessionStorage.getItem('letter-quest-winner-details');
          const parsed = raw ? JSON.parse(raw) : null;
          winnerName = String(parsed?.name ?? '').trim();
          winnerPhone = String(parsed?.phone ?? '').trim();
        } catch (err) {
          console.warn('main: failed to parse winner details', err);
        }

        if (!winnerName || !winnerPhone) {
          // Redirect to the winner details page — returns here after saving
          window.location.href = `/winner.html?slug=${encodeURIComponent(slug)}`;
          return;
        }

        state.winnerName = winnerName;
        state.winnerPhone = winnerPhone;
      } else {
        // Free game: name prompt will be shown by updateUi before location is enabled
        state.nameConfirmed = false;
      }

      // Load game data from cache if available, otherwise from server
      if (useOfflineCache) {
        state.offlineMode = true;
        state.offlineCacheExpiry = cachedData.expiresAt;
        const cachedGame = cachedData.game;
        state.gameRoutes = cachedGame.routes.map((r) => ({
          id: r.id,
          order_index: r.order_index,
          display_name: r.display_name,
          route: r.route,
        }));
        state.displayName = cachedGame.display_name;
        state.route = state.gameRoutes[0]?.route ?? [];
        state.currentRouteIndex = 0;
        state.currentRouteId = state.gameRoutes[0]?.id ?? null;
        state.currentLocationIndex = 0;
        state.collectedLetters = [];
        state.pendingLetter = null;
        state.lastLetterGrantedAt = 0;
        state.routeComplete = false;
        state.playerSessionId = freshPlaySessionId;
        state.score = 0;
        state.lastScoreDelta = 0;
        state.totalAnswerTimeMs = 0;
        state.questionStartedAt = 0;
        state.statusMessage = tm('tapToBegin');
      } else {
        const saved = loadSavedSession();
        const liveIds = game.routes.map((r) => r.id).join(',');
        const savedIds = saved?.gameRoutes?.map((r) => r.id).join(',');
        const compatible = saved?.v === 1 && liveIds === savedIds && saved.route?.length > 0;

        if (compatible) {
          state.gameRoutes = saved.gameRoutes;
          state.displayName = saved.displayName || game.display_name;
          state.currentRouteIndex = saved.currentRouteIndex;
          state.currentRouteId = saved.currentRouteId;
          state.currentLocationIndex = saved.currentLocationIndex;
          state.collectedLetters = saved.collectedLetters ?? [];
          state.pendingLetter = saved.pendingLetter ?? null;
          state.route = normalizeRoute(saved.route);
          state.routeComplete = saved.routeComplete ?? false;
          state.lastLetterGrantedAt = saved.lastLetterGrantedAt ?? 0;
          state.playerId = saved.playerId || state.playerId;
          state.playerSessionId = saved.playerSessionId || freshPlaySessionId;
          state.playerDisplayName = saved.playerDisplayName || '';
          state.score = Number(saved.score) || 0;
          state.lastScoreDelta = Number(saved.lastScoreDelta) || 0;
          state.totalAnswerTimeMs = Number(saved.totalAnswerTimeMs) || 0;
          state.questionStartedAt = saved.questionStartedAt ?? 0;
          state.statusMessage = tm('sessionRestored');
          // Restored sessions should not re-show the free-name gate.
          state.nameConfirmed = true;

          shouldAutoResumeTracking = shouldAutoResumeTrackingFromState(state);
        } else {
          state.gameRoutes = game.routes;
          state.displayName = game.display_name;
          state.route = game.start_location ? [game.start_location] : [];
          state.currentRouteIndex = 0;
          state.currentRouteId = game.routes[0].id;
          state.currentLocationIndex = 0;
          state.collectedLetters = [];
          state.pendingLetter = null;
          state.lastLetterGrantedAt = 0;
          state.routeComplete = false;
          state.playerSessionId = freshPlaySessionId;
          state.score = 0;
          state.lastScoreDelta = 0;
          state.totalAnswerTimeMs = 0;
          state.questionStartedAt = 0;
          state.statusMessage = tm('tapToBegin');
        }
      }

      state.configStatus = hasSupabaseConfig ? tm('configLoaded') : tm('configDefault');
    }
  } catch (error) {
    state.configStatus = tm('configFailed', { message: error.message });
    state.statusMessage = tm('tapToBegin');
  }
  updateUi();

  if (
    shouldAutoResumeTracking &&
    state.geoWatchId === null &&
    navigator.geolocation &&
    navigator.permissions?.query
  ) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state === 'granted') {
        // Resume GPS watch silently only when permission was already granted.
        startLocationTracking();
      }
    } catch {
      // Ignore permission-query failures and keep manual location-start flow.
    }
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try { await navigator.serviceWorker.register('/sw.js'); } catch { /* ignore */ }
  });
}

if (!slug) {
  document.querySelector('#language-select-lobby').addEventListener('change', (e) => {
    setLanguage(e.target.value);
    window.location.reload();
  });
  showLobby();
  window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });
} else {
  const gameUi = document.querySelector('#game-ui');
  applyTranslations(gameUi);
  const backLink = document.querySelector('#back-link');
  backLink.textContent = `← ${tm('allGames')}`;
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.replace(`/?refresh=${Date.now()}`);
  });
  gameUi.classList.remove('hidden');

   els = getEls();
   setElements(els);

   els.enableLocation.addEventListener('click', startLocationTracking);
   els.payAndPlay.addEventListener('click', async () => {
     els.payAndPlay.disabled = true;
     try {
       await startPayment(slug);
     } catch {
       els.payAndPlay.disabled = false;
       showPaymentCard('payToPlay');
     }
   });
   els.downloadOffline?.addEventListener('click', async () => {
     if (els.downloadOffline) els.downloadOffline.disabled = true;
     if (els.offlineStatus) els.offlineStatus.textContent = tm('downloadingOffline');
     try {
       const result = await downloadGameOffline(slug, state.paymentToken);
       if (result.success) {
         state.offlineMode = true;
         state.offlineCacheExpiry = result.expiresAt;
        // Reload the game with cached data
         updateUi();
       } else {
         if (els.offlineStatus) els.offlineStatus.textContent = `Error: ${result.error}`;
         if (els.downloadOffline) els.downloadOffline.disabled = false;
       }
     } catch (err) {
       if (els.offlineStatus) els.offlineStatus.textContent = `Error: ${String(err)}`;
       if (els.downloadOffline) els.downloadOffline.disabled = false;
     }
   });
   // ...existing code...
  els.startWithName?.addEventListener('click', () => {
    state.playerDisplayName = els.playerNameInput?.value.trim() || '';
    state.nameConfirmed = true;
    updateUi();
  });
  els.playerNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.playerDisplayName = els.playerNameInput.value.trim() || '';
      state.nameConfirmed = true;
      updateUi();
    }
  });
  els.confirmLetter.addEventListener('click', confirmLetter);
  els.nextRoute.addEventListener('click', startNextRoute);
  els.submitAnswer.addEventListener('click', submitAnswer);
  els.skipQuestion.addEventListener('click', skipQuestion);
  els.answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(); });


  updateUi();
  loadGame();
}
