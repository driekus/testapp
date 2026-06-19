import './style.css'
import { distanceMeters, isQuickJump } from './gameLogic.js'
import { defaultConfig } from './config.js'
import { hasSupabaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js'
import { fetchGameForPlay, fetchRouteStart, listGames } from './userConfigService.js'
import { getLanguage, setLanguage, t } from './i18n.js'
import { loadGameStyles } from './gameStyleService.js'
import {
  SCORE_EVENT_TYPES,
  buildScoreEventKey,
  buildRankingsUrl,
  createPlaySessionId,
  getPlayerId,
  recordScoreEvent,
} from './scoreService.js'
import {
  clearStoredPaymentToken,
  formatEuro,
  getStoredPaymentToken,
  pollUntilPaid,
  startPayment,
  storePaymentToken,
  verifyPaymentToken,
} from './payment.js'

const LOCATION_RADIUS_METERS = 5
const MAX_ALLOWED_GPS_ACCURACY_METERS = 11
const LETTER_COOLDOWN_MS = 12000
const MAX_SPEED_METERS_PER_SECOND = 22
const MAX_JUMP_DISTANCE_METERS = 250
const HIGH_ACCURACY_TIMEOUT_MS = 20000
const BALANCED_TIMEOUT_MS = 30000

const language = getLanguage()
const tm = (key, params) => t(language, 'main', key, params)

// Read slug from URL path: "/amsterdam-tour" → "amsterdam-tour"
const slug = window.location.pathname.replace(/^\/+/, '').split('/')[0] || ''

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
}

// ─── Translations ───────────────────────────────────────────────────────────

function applyTranslations(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = tm(el.dataset.i18n)
  })
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = tm(el.dataset.i18nPlaceholder)
  })
}

// ─── Lobby ─────────────────────────────────────────────────────────────────

function renderLobby(games) {
  const gameList = document.querySelector('#game-list')
  gameList.replaceChildren()
  if (games.length === 0) {
    const p = document.createElement('p')
    p.className = 'muted'
    p.textContent = tm('noGamesAvailable')
    gameList.appendChild(p)
  } else {
    for (const g of games) {
      const a = document.createElement('a')
      a.className = 'game-link'
      a.href = `/${g.slug}`
      const title = document.createElement('span')
      title.textContent = g.display_name
      a.appendChild(title)

      if (g.requires_payment) {
        const badge = document.createElement('span')
        badge.className = 'paid-badge'
        badge.textContent = `\uD83D\uDD12 ${formatEuro(g.price_in_cents ?? 0)}`
        a.appendChild(badge)
      }
      gameList.appendChild(a)
    }
  }
}

async function showLobby() {
  const lobby = document.querySelector('#lobby')
  applyTranslations(lobby)
  document.querySelector('#language-select-lobby').value = language
  lobby.classList.remove('hidden')

  const loading = document.createElement('p')
  loading.className = 'muted'
  loading.textContent = tm('configLoading')
  document.querySelector('#game-list').replaceChildren(loading)

  try {
    renderLobby(await listGames())
  } catch {
    renderLobby([])
  }
}


function getEls() {
  return {
    gameTitle: document.querySelector('#game-title'),
    paidBadge: document.querySelector('#paid-badge'),
    configStatus: document.querySelector('#config-status'),
    cardPayment: document.querySelector('#card-payment'),
    paymentMessage: document.querySelector('#payment-message'),
    payAndPlay: document.querySelector('#pay-and-play'),
    cardName: document.querySelector('#card-name'),
    playerNameInput: document.querySelector('#player-name-input'),
    startWithName: document.querySelector('#start-with-name'),
    cardTarget: document.querySelector('#card-target'),
    cardProgress: document.querySelector('#card-progress'),
    cardLocation: document.querySelector('#card-location'),
    cardStatus: document.querySelector('#card-status'),
    cardQuestion: document.querySelector('#card-question'),
    questionText: document.querySelector('#question-text'),
    answerInput: document.querySelector('#answer-input'),
    answerFeedback: document.querySelector('#answer-feedback'),
    submitAnswer: document.querySelector('#submit-answer'),
    skipQuestion: document.querySelector('#skip-question'),
    routeBadge: document.querySelector('#route-badge'),
    targetName: document.querySelector('#target-name'),
    gameLogo: document.querySelector('#game-logo'),
    locationImage: document.querySelector('#location-image'),
    locationDescription: document.querySelector('#location-description'),
    distance: document.querySelector('#distance'),
    progress: document.querySelector('#progress'),
    letters: document.querySelector('#letters'),
    scoreTotal: document.querySelector('#score-total'),
    scoreToast: document.querySelector('#score-toast'),
    status: document.querySelector('#status'),
    pendingLetter: document.querySelector('#pending-letter'),
    rankingsLink: document.querySelector('#rankings-link'),
    enableLocation: document.querySelector('#enable-location'),
    confirmLetter: document.querySelector('#confirm-letter'),
    nextRoute: document.querySelector('#next-route'),
  }
}

let els = {}
let scoreToastTimer = null

function showScoreToast(points) {
  if (!els.scoreToast || !Number.isFinite(points) || points === 0) return

  els.scoreToast.textContent = points > 0
    ? tm('scoreLastGain', { points })
    : tm('scoreLastPenalty', { points: Math.abs(points) })
  els.scoreToast.classList.remove('hidden')
  if (scoreToastTimer) clearTimeout(scoreToastTimer)
  scoreToastTimer = setTimeout(() => {
    els.scoreToast.classList.add('hidden')
  }, 2200)
}

function updatePaidBadge() {
  if (!els.paidBadge) return
  if (!state.requiresPayment) {
    els.paidBadge.classList.add('hidden')
    return
  }
  els.paidBadge.textContent = `\uD83D\uDD12 ${tm('paidGame')} - ${formatEuro(state.priceInCents)}`
  els.paidBadge.classList.remove('hidden')
}

function showPaymentCard(messageKey, buttonKey = 'payButton', hideButton = false) {
  if (!els.cardPayment) return
  els.cardPayment.classList.remove('hidden')
  els.paymentMessage.textContent = tm(messageKey)
  els.payAndPlay.textContent = tm(buttonKey)
  els.payAndPlay.disabled = false
  els.payAndPlay.classList.toggle('hidden', hideButton)
}

function updateUi() {
  const totalRoutes = state.gameRoutes.length
  const currentRouteData = state.gameRoutes[state.currentRouteIndex]
  const currentTarget = state.route[state.currentLocationIndex]

  updatePaidBadge()
  if (els.scoreTotal) {
    els.scoreTotal.textContent = tm('scoreTotal', { score: state.score })
  }

  // Avoid card flicker before game type is resolved (free vs paid).
  if (!state.gameId) {
    els.cardPayment.classList.add('hidden')
    els.cardName?.classList.add('hidden')
    els.cardTarget.classList.add('hidden')
    els.cardProgress.classList.add('hidden')
    els.cardLocation.classList.add('hidden')
    els.cardStatus.classList.add('hidden')
    els.cardQuestion.classList.add('hidden')
    return
  }

  if (state.requiresPayment && !state.paymentReady) {
    els.cardPayment.classList.remove('hidden')
    els.cardTarget.classList.add('hidden')
    els.cardProgress.classList.add('hidden')
    els.cardLocation.classList.add('hidden')
    els.cardStatus.classList.add('hidden')
    els.cardQuestion.classList.add('hidden')
    return
  }

  els.cardPayment.classList.add('hidden')

  // For free games: show the optional name prompt before enabling location
  if (state.gameId && !state.requiresPayment && !state.nameConfirmed) {
    els.cardName?.classList.remove('hidden')
    els.cardLocation.classList.add('hidden')
    els.cardTarget.classList.add('hidden')
    els.cardProgress.classList.add('hidden')
    els.cardStatus.classList.add('hidden')
    els.cardQuestion.classList.add('hidden')
    return
  }
  els.cardName?.classList.add('hidden')

  // When location is not yet enabled, show only the location card
  const locationActive = state.geoWatchId !== null
  els.cardLocation.classList.toggle('hidden', locationActive)
  els.cardTarget.classList.toggle('hidden', !locationActive)
  els.cardProgress.classList.toggle('hidden', !locationActive)
  els.cardStatus.classList.toggle('hidden', !locationActive)

  if (!locationActive) return

  // While a question must be answered, show only the question card
  if (state.pendingQuestion) {
    const currentTarget = state.route[state.currentLocationIndex]
    els.cardQuestion.classList.remove('hidden')
    els.cardTarget.classList.add('hidden')
    els.cardProgress.classList.add('hidden')
    els.cardStatus.classList.add('hidden')
    els.questionText.textContent = currentTarget?.question ?? ''
    els.skipQuestion.textContent = tm('continueWithoutAnswer')
    els.skipQuestion.disabled = state.checking
    els.answerFeedback.classList.toggle('hidden', !state.answerWrong)
    if (state.answerWrong) {
      const limit = currentTarget?.max_attempts || 0
      if (limit > 0 && state.answerAttempts >= limit) {
        els.answerFeedback.textContent = tm('maxAttemptsReached', { max: limit })
      } else {
        els.answerFeedback.textContent = limit > 0
          ? tm('answerWrongWithLimit', { attempts: state.answerAttempts, max: limit })
          : tm('answerWrong')
      }
    }
    return
  }

  els.cardQuestion.classList.add('hidden')

  // Show only the status card when a letter is pending confirmation
  const focusStatus = !!state.pendingLetter && !state.routeComplete
  els.cardTarget.classList.toggle('hidden', focusStatus)
  els.cardProgress.classList.toggle('hidden', focusStatus)

  if (els.gameTitle) els.gameTitle.textContent = state.displayName || tm('title')
  els.configStatus.textContent = state.configStatus
  if (els.rankingsLink) {
    const showRankings = Boolean(state.gameId)
    els.rankingsLink.href = buildRankingsUrl(slug)
    els.rankingsLink.textContent = tm('viewRankings')
    els.rankingsLink.classList.toggle('hidden', !showRankings)
  }

  // Route badge: "Route 2 of 3"
  if (totalRoutes > 1 && currentRouteData) {
    els.routeBadge.textContent = tm('routeBadge', {
      current: state.currentRouteIndex + 1,
      total: totalRoutes,
      name: currentRouteData.display_name,
    })
    els.routeBadge.classList.remove('hidden')
  } else {
    els.routeBadge.classList.add('hidden')
  }

  // All routes complete
  if (state.currentRouteIndex >= totalRoutes && totalRoutes > 0) {
    els.targetName.textContent = tm('allCompleted')
    els.distance.textContent = ''
    els.locationImage.classList.add('hidden')
    els.progress.textContent = tm('greatJob')
    els.pendingLetter.textContent = ''
    els.confirmLetter.disabled = true
    els.nextRoute.classList.add('hidden')
    els.status.textContent = state.statusMessage
    els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`
    return
  }

  // Between routes — waiting for player to tap "start next route"
  if (state.routeComplete) {
    els.targetName.textContent = ''
    els.distance.textContent = ''
    els.confirmLetter.disabled = true
    els.nextRoute.classList.remove('hidden')
    els.nextRoute.textContent = currentRouteData
      ? tm('startNextRouteNamed', { name: currentRouteData.display_name })
      : tm('startNextRoute')
    els.status.textContent = state.statusMessage
    els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`
    els.progress.textContent = tm('routeCompletedProgress', {
      done: state.currentRouteIndex,
      total: totalRoutes,
    })
    return
  }

  els.nextRoute.classList.add('hidden')

  if (!currentTarget) {
    els.targetName.textContent = tm('allCompleted')
    els.distance.textContent = ''
    els.progress.textContent = tm('greatJob')
    els.pendingLetter.textContent = ''
    els.confirmLetter.disabled = true
    els.status.textContent = state.statusMessage
    els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`
    return
  }

  els.targetName.textContent = `${state.currentLocationIndex + 1}. ${currentTarget.name}`
  els.progress.textContent = tm('completed', {
    count: state.currentLocationIndex,
    routeTotal: state.route.length,
    route: state.currentRouteIndex + 1,
    total: totalRoutes,
  })
  els.letters.textContent = state.collectedLetters.length
    ? `${tm('letters')}: ${state.collectedLetters.join(' ')}`
    : tm('lettersEmpty')
  els.status.textContent = state.statusMessage
  els.pendingLetter.textContent = state.pendingLetter
    ? tm('pendingLetter', { letter: state.pendingLetter })
    : ''
  els.confirmLetter.disabled = !state.pendingLetter

  // Show image and/or description as hint, or distance — hints suppress distance
  if (currentTarget.image_url) {
    els.locationImage.src = currentTarget.image_url
    els.locationImage.classList.remove('hidden')
  } else {
    els.locationImage.classList.add('hidden')
    els.locationImage.src = ''
  }

  if (currentTarget.description) {
    els.locationDescription.textContent = currentTarget.description
    els.locationDescription.classList.remove('hidden')
  } else {
    els.locationDescription.classList.add('hidden')
    els.locationDescription.textContent = ''
  }

  if (currentTarget.image_url || currentTarget.description) {
    els.distance.textContent = ''
  } else if (state.userPosition) {
    const effectiveRadius = Math.min(
      MAX_ALLOWED_GPS_ACCURACY_METERS,
      Math.max(LOCATION_RADIUS_METERS, state.userPosition.accuracy),
    )
    const meters = Math.round(
      distanceMeters(
        state.userPosition.latitude,
        state.userPosition.longitude,
        currentTarget.lat,
        currentTarget.lng,
      ),
    )
    els.distance.textContent = tm('distanceLine', {
      meters,
      target: Math.round(effectiveRadius),
      base: LOCATION_RADIUS_METERS,
      accuracy: Math.round(state.userPosition.accuracy),
    })
  } else {
    els.distance.textContent = tm('distanceUnknown')
  }
}

function pushNextLocation(next) {
  if (!next) return
  const last = state.route[state.route.length - 1]
  if (last?.lat === next.lat && last?.lng === next.lng) return
  state.route.push(next)
}

// ─── Session persistence ─────────────────────────────────────────────────────

const SESSION_KEY = slug ? `letter-quest-session-${slug}` : null

function saveSession() {
  if (!SESSION_KEY) return
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 1,
      currentRouteIndex: state.currentRouteIndex,
      currentRouteId: state.currentRouteId,
      currentLocationIndex: state.currentLocationIndex,
      collectedLetters: state.collectedLetters,
      pendingLetter: state.pendingLetter,
      route: state.route,
      gameRoutes: state.gameRoutes,
      displayName: state.displayName,
      routeComplete: state.routeComplete,
      lastLetterGrantedAt: state.lastLetterGrantedAt,
      playerId: state.playerId,
      playerSessionId: state.playerSessionId,
      playerDisplayName: state.playerDisplayName,
      score: state.score,
      lastScoreDelta: state.lastScoreDelta,
      totalAnswerTimeMs: state.totalAnswerTimeMs,
      questionStartedAt: state.questionStartedAt,
    }))
  } catch { /* storage full or unavailable */ }
}

function clearSession() {
  if (!SESSION_KEY) return
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

function loadSavedSession() {
  if (!SESSION_KEY) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ─── Audio feedback ─────────────────────────────────────────────────────────

let audioCtx = null

function playHappySound() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()

  const notes = [523.25, 659.25, 783.99] // C5, E5, G5
  const noteDuration = 0.12
  const gap = 0.05

  notes.forEach((freq, i) => {
    const start = audioCtx.currentTime + i * (noteDuration + gap)
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.35, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration)
    osc.start(start)
    osc.stop(start + noteDuration)
  })
}

function playDoubleBeep() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()

  const beepDuration = 0.25
  const pauseBetween = 0.4

  function beep(startTime) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 440
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.4, startTime)
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + beepDuration)
    osc.start(startTime)
    osc.stop(startTime + beepDuration)
  }

  const now = audioCtx.currentTime
  beep(now)
  beep(now + beepDuration + pauseBetween)
}

// ─── Game logic ─────────────────────────────────────────────────────────────

function remainingCooldownMs() {
  return Math.max(0, LETTER_COOLDOWN_MS - (Date.now() - state.lastLetterGrantedAt))
}

function checkArrival() {
  if (state.pendingLetter || state.pendingQuestion || state.checking || !state.userPosition || state.routeComplete) return

  const currentTarget = state.route[state.currentLocationIndex]
  if (!currentTarget) return

  const effectiveRadius = Math.min(
    MAX_ALLOWED_GPS_ACCURACY_METERS,
    Math.max(LOCATION_RADIUS_METERS, state.userPosition.accuracy),
  )
  const meters = distanceMeters(
    state.userPosition.latitude,
    state.userPosition.longitude,
    currentTarget.lat,
    currentTarget.lng,
  )

  if (meters <= effectiveRadius) {
    const cooldownLeft = remainingCooldownMs()
    if (cooldownLeft > 0) {
      state.statusMessage = tm('cooldown', {
        seconds: Math.ceil(cooldownLeft / 1000),
        name: currentTarget.name,
      })
      updateUi()
      return
    }
    state.lastLetterGrantedAt = Date.now()
    state.statusMessage = tm('reached', { name: currentTarget.name })
    playHappySound()
    void recordProgressEvent(SCORE_EVENT_TYPES.LOCATION_FOUND)
    if (currentTarget.question) {
      state.pendingQuestion = true
      state.answerWrong = false
      state.answerAttempts = 0
      state.questionStartedAt = Date.now()
    } else {
      confirmArrival()
    }
  } else {
    state.statusMessage = tm('moveCloser', { name: currentTarget.name })
  }
  updateUi()
}

function handleLocationSuccess(position) {
  const candidate = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  }

  if (candidate.accuracy > MAX_ALLOWED_GPS_ACCURACY_METERS) {
    state.statusMessage = tm('gpsTooLow', {
      accuracy: Math.round(candidate.accuracy),
      need: MAX_ALLOWED_GPS_ACCURACY_METERS,
    })
    updateUi()
    return
  }

  if (
    state.lastTrustedPosition &&
    isQuickJump(state.lastTrustedPosition, candidate, {
      maxSpeedMetersPerSecond: MAX_SPEED_METERS_PER_SECOND,
      maxJumpDistanceMeters: MAX_JUMP_DISTANCE_METERS,
    })
  ) {
    state.statusMessage = tm('quickJump')
    updateUi()
    return
  }

  state.userPosition = candidate
  state.lastTrustedPosition = candidate

  const currentTarget = state.route[state.currentLocationIndex]
  if (currentTarget && !state.pendingLetter && !state.pendingQuestion && !state.routeComplete && !currentTarget.image_url && !currentTarget.description) {
    const newDistance = distanceMeters(
      candidate.latitude,
      candidate.longitude,
      currentTarget.lat,
      currentTarget.lng,
    )
    if (state.lastDistanceToTarget !== null && newDistance > state.lastDistanceToTarget + 10) {
      playDoubleBeep()
    }
    state.lastDistanceToTarget = newDistance
  }

  checkArrival()
  updateUi()
}

function startWatch(options, fallbackToBalanced) {
  state.geoWatchId = navigator.geolocation.watchPosition(
    handleLocationSuccess,
    (error) => {
      if (error.code === error.TIMEOUT && fallbackToBalanced) {
        navigator.geolocation.clearWatch(state.geoWatchId)
        state.geoWatchId = null
        state.statusMessage = tm('highAccTimeout')
        updateUi()
        startWatch({ enableHighAccuracy: false, maximumAge: 15000, timeout: BALANCED_TIMEOUT_MS }, false)
        return
      }
      state.statusMessage = tm('locationError', { message: error.message })
      updateUi()
    },
    options,
  )
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    state.statusMessage = tm('geolocationUnsupported')
    updateUi()
    return
  }
  if (state.geoWatchId !== null) {
    state.statusMessage = tm('trackingActive')
    updateUi()
    return
  }
  state.statusMessage = tm('requestingPermission')
  updateUi()
  startWatch({ enableHighAccuracy: true, maximumAge: 5000, timeout: HIGH_ACCURACY_TIMEOUT_MS }, true)
}

async function edgeFunctionUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`
}

async function recordProgressEvent(eventType, extra = {}) {
  if (!state.gameId || !state.playerSessionId || !state.currentRouteId) return

  try {
    const previousScore = state.score
    const payload = {
      game_id: state.gameId,
      player_id: state.playerId,
      player_session_id: state.playerSessionId,
      event_type: eventType,
      event_key: buildScoreEventKey(state.currentRouteId, state.currentLocationIndex, eventType),
      ...extra,
    }
    const json = await recordScoreEvent(payload)
    if (Number.isFinite(json?.score)) {
      const nextScore = Number(json.score)
      const delta = nextScore - previousScore
      state.score = nextScore
      if (delta !== 0) {
        state.lastScoreDelta = delta
        showScoreToast(delta)
      }
    }
    if (Number.isFinite(json?.total_answer_time_ms)) {
      state.totalAnswerTimeMs = Number(json.total_answer_time_ms)
    }
  } catch (err) {
    console.warn('main: could not record score event', err)
  }
}

async function confirmArrival() {
  state.checking = true
  state.statusMessage = tm('checking')
  state.serverError = false
  updateUi()

  try {
    const res = await fetch(await edgeFunctionUrl('confirm-arrival'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        route_id: state.currentRouteId,
        location_index: state.currentLocationIndex,
        payment_token: state.requiresPayment ? state.paymentToken : null,
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? res.statusText)

    state.pendingLetter = json.letter
    pushNextLocation(json.next_location)
    await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED)
    state.statusMessage = tm('reached', { name: state.route[state.currentLocationIndex].name })
    saveSession()
  } catch {
    state.serverError = true
    state.statusMessage = tm('serverError')
    state.lastLetterGrantedAt = 0  // allow retry on next GPS tick
  } finally {
    state.checking = false
  }
  updateUi()
}

async function submitAnswer() {
  const currentTarget = state.route[state.currentLocationIndex]
  if (!state.pendingQuestion || !currentTarget || state.checking) return

  const given = els.answerInput.value.trim()
  els.answerInput.value = ''
  state.answerWrong = false
  state.serverError = false
  state.checking = true
  state.statusMessage = tm('checking')
  updateUi()

  try {
    const res = await fetch(await edgeFunctionUrl('check-answer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        route_id: state.currentRouteId,
        location_index: state.currentLocationIndex,
        answer: given,
        payment_token: state.requiresPayment ? state.paymentToken : null,
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? res.statusText)

    if (json.correct) {
      const attemptNumber = state.answerAttempts + 1
      const answerTimeMs = state.questionStartedAt > 0
        ? Math.max(0, Date.now() - state.questionStartedAt)
        : 0
      state.pendingQuestion = false
      state.answerAttempts = 0
      state.questionStartedAt = 0
      state.pendingLetter = json.letter
      pushNextLocation(json.next_location)
      await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED)
      await recordProgressEvent(SCORE_EVENT_TYPES.ANSWER_CORRECT, {
        attempt_number: attemptNumber,
        answer_time_ms: answerTimeMs,
      })
      saveSession()
    } else {
      state.answerAttempts += 1
      state.answerWrong = true
    }
  } catch {
    state.serverError = true
    state.statusMessage = tm('serverError')
  } finally {
    state.checking = false
  }
  checkArrival()
  updateUi()
}

function completeCurrentLocation(letter = null) {
  if (letter) state.collectedLetters.push(letter)
  state.pendingLetter = null
  state.questionStartedAt = 0
  state.currentLocationIndex += 1
  state.lastDistanceToTarget = null

  if (state.currentLocationIndex >= state.route.length) {
    // Finished all locations in the current route
    const moreRoutes = state.currentRouteIndex + 1 < state.gameRoutes.length
    if (moreRoutes) {
      state.routeComplete = true
      const nextRoute = state.gameRoutes[state.currentRouteIndex + 1]
      state.statusMessage = tm('routeComplete', { name: nextRoute.display_name })
      saveSession()
    } else {
       clearSession()
       try {
         // Clear winner details from session so next play requires fresh winner.html form
         sessionStorage.removeItem('letter-quest-winner-details')

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
         }
         sessionStorage.setItem('letter-quest-feedback', JSON.stringify(feedbackData))
      } catch { /* ignore */ }
      window.location.href = '/feedback.html'
      return
    }
  } else {
    state.statusMessage = tm('nextTarget', { name: state.route[state.currentLocationIndex].name })
    saveSession()
  }
  updateUi()
}

function confirmLetter() {
  if (!state.pendingLetter) return
  completeCurrentLocation(state.pendingLetter)
}

async function skipQuestion() {
  const currentTarget = state.route[state.currentLocationIndex]
  if (!state.pendingQuestion || !currentTarget || state.checking) return

  state.answerWrong = false
  state.serverError = false
  state.checking = true
  state.statusMessage = tm('checking')
  updateUi()

  try {
    const res = await fetch(await edgeFunctionUrl('confirm-arrival'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        route_id: state.currentRouteId,
        location_index: state.currentLocationIndex,
        payment_token: state.requiresPayment ? state.paymentToken : null,
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? res.statusText)

    state.pendingQuestion = false
    state.answerAttempts = 0
    state.questionStartedAt = 0
    pushNextLocation(json.next_location)
    await recordProgressEvent(SCORE_EVENT_TYPES.ARRIVAL_CONFIRMED)
    await recordProgressEvent(SCORE_EVENT_TYPES.QUESTION_SKIPPED)
    state.statusMessage = tm('questionSkippedPenalty')
    completeCurrentLocation(null)
  } catch {
    state.serverError = true
    state.statusMessage = tm('serverError')
  } finally {
    state.checking = false
  }
  updateUi()
}

async function startNextRoute() {
  state.currentRouteIndex += 1
  const nextRoute = state.gameRoutes[state.currentRouteIndex]
  state.currentRouteId = nextRoute.id
  state.currentLocationIndex = 0
  state.pendingLetter = null
  state.lastLetterGrantedAt = 0
  state.routeComplete = false
  state.lastDistanceToTarget = null
  state.questionStartedAt = 0
  state.checking = true
  state.statusMessage = tm('checking')
  updateUi()

  try {
    const firstLocation = await fetchRouteStart(nextRoute.id, state.requiresPayment ? state.paymentToken : null)
    state.route = [firstLocation]
    state.statusMessage = tm('nextRouteStarted', { name: nextRoute.display_name })
    saveSession()
  } catch {
    state.serverError = true
    state.statusMessage = tm('serverError')
  } finally {
    state.checking = false
  }
  updateUi()
}

async function resolvePaymentAccess() {
  state.paymentReady = false
  const params = new URLSearchParams(window.location.search)
  const paymentRequestToken = params.get('payment_request_token')
  const storedToken = getStoredPaymentToken(slug)
  let alreadyPlayed = false

  updateUi()

  if (storedToken) {
    try {
      const payment = await verifyPaymentToken(slug, storedToken)
      if (payment.paid && payment.payment_token && !payment.played) {
        state.paymentToken = payment.payment_token
        state.paymentReady = true
        return true
      }
      alreadyPlayed = Boolean(payment.played)
      clearStoredPaymentToken(slug)
      state.paymentToken = null
    } catch {
      clearStoredPaymentToken(slug)
    }
  }

  if (paymentRequestToken) {
    showPaymentCard('paymentPending', 'payButton', true)
    try {
      const payment = await pollUntilPaid(slug, paymentRequestToken, (token) => {
        storePaymentToken(slug, token)
      })
      state.paymentToken = payment.payment_token
      state.paymentReady = true
      window.history.replaceState({}, '', `/${slug}`)
      return true
    } catch {
      showPaymentCard('payToPlay')
      return false
    }
  }

  showPaymentCard(alreadyPlayed ? 'alreadyPlayed' : 'payToPlay', alreadyPlayed ? 'payAgain' : 'payButton')
  return false
}

// ─── Config loading ─────────────────────────────────────────────────────────

async function loadGame() {
  state.configStatus = tm('configLoading')
  let shouldAutoResumeTracking = false
  updateUi()

  try {
    const game = await fetchGameForPlay(slug);

    if (!game || game.routes.length === 0) {
      state.configStatus = tm('gameNotFound', { slug });
      state.statusMessage = tm('tapToBegin');
    } else {
      // Load custom game styles from database
      await loadGameStyles(game.id);
      state.gameId = game.id;
      state.playerId = getPlayerId(slug)
      const freshPlaySessionId = createPlaySessionId()
      state.playerSessionId = freshPlaySessionId

      state.requiresPayment = Boolean(game.requires_payment)
      state.priceInCents = Number(game.price_in_cents) || 0
      state.paymentReady = !state.requiresPayment
      if (!state.requiresPayment) state.paymentToken = null

      if (game.logo_url && els.gameLogo) {
        els.gameLogo.src = game.logo_url
        els.gameLogo.classList.remove('hidden')
      }

      if (state.requiresPayment) {
        const canPlay = await resolvePaymentAccess()
        if (!canPlay) {
          state.configStatus = tm('configLoaded')
          updateUi()
          return
        }

        // Read winner details saved by winner.js (via sessionStorage)
        let savedWinner = null
        try {
          const raw = sessionStorage.getItem('letter-quest-winner-details')
          savedWinner = raw ? JSON.parse(raw) : null
        } catch (err) {
          console.warn('main: failed to parse winner details', err)
        }

        if (!savedWinner?.name || !savedWinner?.phone) {
          // Redirect to the winner details page — returns here after saving
          window.location.href = `/winner.html?slug=${encodeURIComponent(slug)}`
          return
        }

        state.winnerName = savedWinner.name
        state.winnerPhone = savedWinner.phone
      } else {
        // Free game: name prompt will be shown by updateUi before location is enabled
        state.nameConfirmed = false
      }

      const saved = loadSavedSession()
      const liveIds = game.routes.map((r) => r.id).join(',')
      const savedIds = saved?.gameRoutes?.map((r) => r.id).join(',')
      const compatible = saved?.v === 1 && liveIds === savedIds && saved.route?.length > 0

      if (compatible) {
        state.gameRoutes = saved.gameRoutes
        state.displayName = saved.displayName || game.display_name
        state.currentRouteIndex = saved.currentRouteIndex
        state.currentRouteId = saved.currentRouteId
        state.currentLocationIndex = saved.currentLocationIndex
        state.collectedLetters = saved.collectedLetters ?? []
        state.pendingLetter = saved.pendingLetter ?? null
        state.route = saved.route.filter((loc, i, arr) =>
          i === 0 || !(arr[i - 1].lat === loc.lat && arr[i - 1].lng === loc.lng),
        )
        state.routeComplete = saved.routeComplete ?? false
        state.lastLetterGrantedAt = saved.lastLetterGrantedAt ?? 0
        state.playerId = saved.playerId || state.playerId
        state.playerSessionId = saved.playerSessionId || freshPlaySessionId
        state.playerDisplayName = saved.playerDisplayName || ''
        state.score = Number(saved.score) || 0
        state.lastScoreDelta = Number(saved.lastScoreDelta) || 0
        state.totalAnswerTimeMs = Number(saved.totalAnswerTimeMs) || 0
        state.questionStartedAt = saved.questionStartedAt ?? 0
        state.statusMessage = tm('sessionRestored')
        // Restored sessions should not re-show the free-name gate.
        state.nameConfirmed = true

        const hasProgress =
          state.currentLocationIndex > 0 ||
          state.collectedLetters.length > 0 ||
          state.routeComplete
        shouldAutoResumeTracking = hasProgress
      } else {
        state.gameRoutes = game.routes
        state.displayName = game.display_name
        state.route = game.start_location ? [game.start_location] : []
        state.currentRouteIndex = 0
        state.currentRouteId = game.routes[0].id
        state.currentLocationIndex = 0
        state.collectedLetters = []
        state.pendingLetter = null
        state.lastLetterGrantedAt = 0
        state.routeComplete = false
        state.playerSessionId = freshPlaySessionId
        state.score = 0
        state.lastScoreDelta = 0
        state.totalAnswerTimeMs = 0
        state.questionStartedAt = 0
        state.statusMessage = tm('tapToBegin')
      }

      state.configStatus = hasSupabaseConfig ? tm('configLoaded') : tm('configDefault')
    }
  } catch (error) {
    state.configStatus = tm('configFailed', { message: error.message })
    state.statusMessage = tm('tapToBegin')
  }
  updateUi()

  if (
    shouldAutoResumeTracking &&
    state.geoWatchId === null &&
    navigator.geolocation &&
    navigator.permissions?.query
  ) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' })
      if (permission.state === 'granted') {
        // Resume GPS watch silently only when permission was already granted.
        startLocationTracking()
      }
    } catch {
      // Ignore permission-query failures and keep manual location-start flow.
    }
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try { await navigator.serviceWorker.register('/sw.js') } catch { /* ignore */ }
  })
}

if (!slug) {
  document.querySelector('#language-select-lobby').addEventListener('change', (e) => {
    setLanguage(e.target.value)
    window.location.reload()
  })
  showLobby()
  window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload() })
} else {
  const gameUi = document.querySelector('#game-ui')
  applyTranslations(gameUi)
  const backLink = document.querySelector('#back-link')
  backLink.textContent = `← ${tm('allGames')}`
  backLink.addEventListener('click', (e) => {
    e.preventDefault()
    window.location.replace(`/?refresh=${Date.now()}`)
  })
  gameUi.classList.remove('hidden')

  els = getEls()

  els.enableLocation.addEventListener('click', startLocationTracking)
  els.payAndPlay.addEventListener('click', async () => {
    els.payAndPlay.disabled = true
    try {
      await startPayment(slug)
    } catch {
      els.payAndPlay.disabled = false
      showPaymentCard('payToPlay')
    }
  })
  // Free-game optional name card
  els.startWithName?.addEventListener('click', () => {
    state.playerDisplayName = els.playerNameInput?.value.trim() || ''
    state.nameConfirmed = true
    updateUi()
  })
  els.playerNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.playerDisplayName = els.playerNameInput.value.trim() || ''
      state.nameConfirmed = true
      updateUi()
    }
  })
  els.confirmLetter.addEventListener('click', confirmLetter)
  els.nextRoute.addEventListener('click', startNextRoute)
  els.submitAnswer.addEventListener('click', submitAnswer)
  els.skipQuestion.addEventListener('click', skipQuestion)
  els.answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer() })


  updateUi()
  loadGame()
}
