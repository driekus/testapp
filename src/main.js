import './style.css'
import { distanceMeters, isQuickJump } from './gameLogic.js'
import { defaultConfig } from './config.js'
import { hasSupabaseConfig } from './supabaseClient.js'
import { fetchGameWithRoutes, listGames } from './userConfigService.js'
import { getLanguage, setLanguage, t } from './i18n.js'

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
  gameRoutes: [],           // [{id, order_index, display_name, route: [...]}]
  currentRouteIndex: 0,
  route: defaultConfig().route,
  displayName: '',
  // quest progress
  currentLocationIndex: 0,
  collectedLetters: [],     // accumulated across all routes
  pendingLetter: null,
  userPosition: null,
  lastTrustedPosition: null,
  lastLetterGrantedAt: 0,
  geoWatchId: null,
  routeComplete: false,     // true while waiting for player to advance to next route
  statusMessage: tm('tapToBegin'),
  configStatus: tm('configLoading'),
}

// ─── Lobby ─────────────────────────────────────────────────────────────────

function renderLobby(games) {
  const app = document.querySelector('#app')
  const listHtml = games.length
    ? games.map((g) => `<a class="game-link" href="/${g.slug}">${g.display_name}</a>`).join('')
    : `<p class="muted">${tm('noGamesAvailable')}</p>`

  app.innerHTML = `
    <main class="container">
      <div class="actions" style="justify-content:flex-end; margin-bottom: 8px;">
        <label for="language-select">${tm('languageLabel')}:
          <select id="language-select">
            <option value="en" ${language === 'en' ? 'selected' : ''}>EN</option>
            <option value="nl" ${language === 'nl' ? 'selected' : ''}>NL</option>
          </select>
        </label>
      </div>
      <h1>${tm('lobbyTitle')}</h1>
      <p class="hint">${tm('lobbyHint')}</p>
      <section class="card game-list">${listHtml}</section>
    </main>
  `
  document.querySelector('#language-select').addEventListener('change', (e) => {
    setLanguage(e.target.value)
    window.location.reload()
  })
}

async function showLobby() {
  const app = document.querySelector('#app')
  app.innerHTML = `<main class="container"><p class="muted">${tm('configLoading')}</p></main>`
  try {
    renderLobby(await listGames())
  } catch {
    renderLobby([])
  }
}

// ─── Game UI ────────────────────────────────────────────────────────────────

function buildGameUi() {
  document.querySelector('#app').innerHTML = `
    <main class="container">
      <div class="actions" style="justify-content:space-between; margin-bottom: 8px;">
        <a class="muted" href="/">← ${tm('allGames')}</a>
        <label for="language-select">${tm('languageLabel')}:
          <select id="language-select">
            <option value="en" ${language === 'en' ? 'selected' : ''}>EN</option>
            <option value="nl" ${language === 'nl' ? 'selected' : ''}>NL</option>
          </select>
        </label>
      </div>
      <h1 id="game-title">${tm('title')}</h1>
      <p class="hint">${tm('hint')}</p>
      <p id="config-status" class="muted"></p>

      <section class="card">
        <h2>${tm('currentTarget')}</h2>
        <p id="route-badge" class="route-badge"></p>
        <p id="target-name"></p>
        <img id="location-image" class="location-image hidden" alt="" />
        <p id="distance" class="distance"></p>
      </section>

      <section class="card">
        <h2>${tm('progress')}</h2>
        <p id="progress"></p>
        <p id="letters" class="letters"></p>
      </section>

      <section class="card">
        <h2>${tm('status')}</h2>
        <p id="status"></p>
        <p id="pending-letter" class="pending"></p>
        <div class="actions">
          <button id="enable-location" type="button">${tm('enableLocation')}</button>
          <button id="confirm-letter" type="button" disabled>${tm('confirmAndNext')}</button>
          <button id="next-route" type="button" class="hidden">${tm('startNextRoute')}</button>
        </div>
      </section>
    </main>
  `
}

function getEls() {
  return {
    languageSelect: document.querySelector('#language-select'),
    gameTitle: document.querySelector('#game-title'),
    configStatus: document.querySelector('#config-status'),
    routeBadge: document.querySelector('#route-badge'),
    targetName: document.querySelector('#target-name'),
    locationImage: document.querySelector('#location-image'),
    distance: document.querySelector('#distance'),
    progress: document.querySelector('#progress'),
    letters: document.querySelector('#letters'),
    status: document.querySelector('#status'),
    pendingLetter: document.querySelector('#pending-letter'),
    enableLocation: document.querySelector('#enable-location'),
    confirmLetter: document.querySelector('#confirm-letter'),
    nextRoute: document.querySelector('#next-route'),
  }
}

let els = {}

function updateUi() {
  const totalRoutes = state.gameRoutes.length
  const currentRouteData = state.gameRoutes[state.currentRouteIndex]
  const currentTarget = state.route[state.currentLocationIndex]
  const completedInRoute = state.collectedLetters.length - (state.currentRouteIndex * 0)

  if (els.gameTitle) els.gameTitle.textContent = state.displayName || tm('title')
  els.configStatus.textContent = state.configStatus

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

  // Show location image OR distance — never both
  if (currentTarget.image_url) {
    els.locationImage.src = currentTarget.image_url
    els.locationImage.classList.remove('hidden')
    els.distance.textContent = ''
  } else {
    els.locationImage.classList.add('hidden')
    els.locationImage.src = ''
    if (state.userPosition) {
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
}

// ─── Game logic ─────────────────────────────────────────────────────────────

function remainingCooldownMs() {
  return Math.max(0, LETTER_COOLDOWN_MS - (Date.now() - state.lastLetterGrantedAt))
}

function checkArrival() {
  if (state.pendingLetter || !state.userPosition || state.routeComplete) return

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
    state.pendingLetter = currentTarget.letter
    state.lastLetterGrantedAt = Date.now()
    state.statusMessage = tm('reached', { name: currentTarget.name })
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

function confirmLetter() {
  if (!state.pendingLetter) return

  state.collectedLetters.push(state.pendingLetter)
  state.pendingLetter = null
  state.currentLocationIndex += 1

  if (state.currentLocationIndex >= state.route.length) {
    // Finished all locations in the current route
    const moreRoutes = state.currentRouteIndex + 1 < state.gameRoutes.length
    if (moreRoutes) {
      state.routeComplete = true
      const nextRoute = state.gameRoutes[state.currentRouteIndex + 1]
      state.statusMessage = tm('routeComplete', { name: nextRoute.display_name })
    } else {
      state.statusMessage = tm('questComplete')
    }
  } else {
    state.statusMessage = tm('nextTarget', { name: state.route[state.currentLocationIndex].name })
  }
  updateUi()
}

function startNextRoute() {
  state.currentRouteIndex += 1
  const nextRoute = state.gameRoutes[state.currentRouteIndex]
  state.route = nextRoute.route
  state.currentLocationIndex = 0
  state.pendingLetter = null
  state.lastLetterGrantedAt = 0
  state.routeComplete = false
  state.statusMessage = tm('nextRouteStarted', { name: nextRoute.display_name })
  updateUi()
}

// ─── Config loading ─────────────────────────────────────────────────────────

async function loadGame() {
  state.configStatus = tm('configLoading')
  updateUi()

  try {
    const game = await fetchGameWithRoutes(slug)
    if (!game || game.routes.length === 0) {
      state.configStatus = tm('gameNotFound', { slug })
      state.statusMessage = tm('tapToBegin')
    } else {
      state.gameRoutes = game.routes
      state.displayName = game.display_name
      state.route = game.routes[0].route
      state.currentRouteIndex = 0
      state.currentLocationIndex = 0
      state.collectedLetters = []
      state.pendingLetter = null
      state.lastLetterGrantedAt = 0
      state.routeComplete = false
      state.statusMessage = tm('tapToBegin')
      state.configStatus = hasSupabaseConfig ? tm('configLoaded') : tm('configDefault')
    }
  } catch (error) {
    state.configStatus = tm('configFailed', { message: error.message })
    state.statusMessage = tm('tapToBegin')
  }
  updateUi()
}

// ─── Boot ───────────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try { await navigator.serviceWorker.register('/sw.js') } catch { /* ignore */ }
  })
}

if (!slug) {
  showLobby()
} else {
  buildGameUi()
  els = getEls()

  els.enableLocation.addEventListener('click', startLocationTracking)
  els.confirmLetter.addEventListener('click', confirmLetter)
  els.nextRoute.addEventListener('click', startNextRoute)
  els.languageSelect.addEventListener('change', (e) => {
    setLanguage(e.target.value)
    window.location.reload()
  })

  updateUi()
  loadGame()
}
