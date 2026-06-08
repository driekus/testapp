import './style.css'
import { distanceMeters, isQuickJump } from './gameLogic.js'
import { defaultConfig } from './config.js'
import { hasSupabaseConfig } from './supabaseClient.js'
import { fetchSharedConfig } from './userConfigService.js'
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

const state = {
  route: defaultConfig().route,
  currentLocationIndex: 0,
  collectedLetters: [],
  pendingLetter: null,
  userPosition: null,
  lastTrustedPosition: null,
  lastLetterGrantedAt: 0,
  geoWatchId: null,
  showMapView: false,
  statusMessage: tm('tapToBegin'),
  configStatus: tm('configLoading'),
}

function buildGoogleDirectionsUrl(target) {
  return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=walking`
}

function buildOpenStreetMapUrl(target) {
  if (!state.userPosition) {
    return `https://www.openstreetmap.org/?mlat=${target.lat}&mlon=${target.lng}#map=17/${target.lat}/${target.lng}`
  }
  const { latitude, longitude } = state.userPosition
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${latitude}%2C${longitude}%3B${target.lat}%2C${target.lng}`
}

function buildOpenStreetMapEmbedUrl(target) {
  const delta = 0.008
  const left = target.lng - delta
  const right = target.lng + delta
  const top = target.lat + delta
  const bottom = target.lat - delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${target.lat}%2C${target.lng}`
}

function resetQuestProgress(nextStatus) {
  state.currentLocationIndex = 0
  state.collectedLetters = []
  state.pendingLetter = null
  state.lastLetterGrantedAt = 0
  state.statusMessage = nextStatus
}

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="container">
    <div class="actions" style="justify-content:space-between; margin-bottom: 8px;">
<!--      <a class="admin-link" href="/admin.html">⚙ ${tm('adminSettings')}</a>-->
      <label for="language-select">${tm('languageLabel')}:
        <select id="language-select">
          <option value="en" ${language === 'en' ? 'selected' : ''}>EN</option>
          <option value="nl" ${language === 'nl' ? 'selected' : ''}>NL</option>
        </select>
      </label>
    </div>
    <h1>${tm('title')}</h1>
    <p class="hint">${tm('hint')}</p>
    <p id="config-status" class="muted"></p>

    <section class="card">
      <h2>${tm('currentTarget')}</h2>
      <p id="target-name"></p>
      <p id="target-coords" class="muted" hidden></p>
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
      </div>
    </section>

<!--    <section class="card">-->
<!--      <h2>${tm('optionalMapView')}</h2>-->
<!--      <label class="toggle-row" for="toggle-map-view">-->
<!--        <input id="toggle-map-view" type="checkbox" />-->
<!--        ${tm('showMapTools')}-->
<!--      </label>-->
<!--      <div id="map-panel" class="map-panel hidden">-->
<!--        <div class="actions">-->
<!--          <a id="google-nav-link" class="link-button" target="_blank" rel="noopener noreferrer">${tm('openGoogleMaps')}</a>-->
<!--          <a id="osm-nav-link" class="link-button" target="_blank" rel="noopener noreferrer">${tm('openOpenStreetMap')}</a>-->
<!--        </div>-->
<!--        <iframe id="osm-embed" class="map-embed" title="OpenStreetMap target preview" loading="lazy"></iframe>-->
<!--      </div>-->
<!--    </section>-->
  </main>
`

const els = {
  languageSelect: document.querySelector('#language-select'),
  configStatus: document.querySelector('#config-status'),
  targetName: document.querySelector('#target-name'),
  targetCoords: document.querySelector('#target-coords'),
  distance: document.querySelector('#distance'),
  progress: document.querySelector('#progress'),
  letters: document.querySelector('#letters'),
  status: document.querySelector('#status'),
  pendingLetter: document.querySelector('#pending-letter'),
  enableLocation: document.querySelector('#enable-location'),
  confirmLetter: document.querySelector('#confirm-letter'),
  toggleMapView: document.querySelector('#toggle-map-view'),
  mapPanel: document.querySelector('#map-panel'),
  googleNavLink: document.querySelector('#google-nav-link'),
  osmNavLink: document.querySelector('#osm-nav-link'),
  osmEmbed: document.querySelector('#osm-embed'),
}

function updateUi() {
  const currentTarget = state.route[state.currentLocationIndex]
  const completedCount = state.collectedLetters.length

  els.configStatus.textContent = state.configStatus

  if (!currentTarget) {
    els.targetName.textContent = tm('allCompleted')
    els.targetCoords.textContent = ''
    els.distance.textContent = ''
    els.progress.textContent = tm('greatJob')
    els.pendingLetter.textContent = ''
    els.confirmLetter.disabled = true
    els.status.textContent = state.statusMessage
    els.letters.textContent = `${tm('letters')}: ${state.collectedLetters.join(' ')}`
    els.mapPanel.classList.add('hidden')
    return
  }

  els.targetName.textContent = `${state.currentLocationIndex + 1}. ${currentTarget.name}`
  els.targetCoords.textContent = tm('targetLine', {
    lat: currentTarget.lat.toFixed(4),
    lng: currentTarget.lng.toFixed(4),
  })
  els.progress.textContent = tm('completed', { count: completedCount })
  els.letters.textContent = state.collectedLetters.length
    ? `${tm('letters')}: ${state.collectedLetters.join(' ')}`
    : tm('lettersEmpty')
  els.status.textContent = state.statusMessage
  els.pendingLetter.textContent = state.pendingLetter
    ? tm('pendingLetter', { letter: state.pendingLetter })
    : ''
  els.confirmLetter.disabled = !state.pendingLetter

  // els.googleNavLink.href = buildGoogleDirectionsUrl(currentTarget)
  // els.osmNavLink.href = buildOpenStreetMapUrl(currentTarget)
  // els.osmEmbed.src = buildOpenStreetMapEmbedUrl(currentTarget)
  // els.mapPanel.classList.toggle('hidden', !state.showMapView)

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

function remainingCooldownMs() {
  return Math.max(0, LETTER_COOLDOWN_MS - (Date.now() - state.lastLetterGrantedAt))
}

function checkArrival() {
  if (state.pendingLetter || !state.userPosition) return

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

  startWatch(
    { enableHighAccuracy: true, maximumAge: 5000, timeout: HIGH_ACCURACY_TIMEOUT_MS },
    true,
  )
}

function confirmLetter() {
  if (!state.pendingLetter) return

  state.collectedLetters.push(state.pendingLetter)
  state.pendingLetter = null
  state.currentLocationIndex += 1

  if (state.currentLocationIndex >= state.route.length) {
    state.statusMessage = tm('questComplete')
  } else {
    state.statusMessage = tm('nextTarget', { name: state.route[state.currentLocationIndex].name })
  }

  updateUi()
}

els.enableLocation.addEventListener('click', startLocationTracking)
els.confirmLetter.addEventListener('click', confirmLetter)
// els.toggleMapView.addEventListener('change', (e) => {
//   state.showMapView = e.target.checked
//   updateUi()
// })
els.languageSelect.addEventListener('change', (event) => {
  setLanguage(event.target.value)
  window.location.reload()
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try { await navigator.serviceWorker.register('/sw.js') } catch { /* ignore */ }
  })
}

// Load shared route config (no sign-in needed)
async function loadConfig() {
  // Show defaults immediately so UI is never blank while waiting
  state.configStatus = tm('configLoading')
  updateUi()

  try {
    const config = await fetchSharedConfig()
    state.route = config.route
    resetQuestProgress(tm('tapToBegin'))
    state.configStatus = hasSupabaseConfig
      ? tm('configLoaded')
      : tm('configDefault')
  } catch (error) {
    // Timeout or network error — fall back to defaults, show warning
    state.configStatus = tm('configFailed', { message: error.message })
    resetQuestProgress(tm('tapToBegin'))
  }
  updateUi()
}

loadConfig()
updateUi()
