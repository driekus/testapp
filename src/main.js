import './style.css'
import { distanceMeters, isQuickJump } from './gameLogic.js'
import { defaultConfig } from './config.js'
import { hasSupabaseConfig } from './supabaseClient.js'
import { fetchSharedConfig } from './userConfigService.js'

const LOCATION_RADIUS_METERS = 5
const MAX_ALLOWED_GPS_ACCURACY_METERS = 11
const LETTER_COOLDOWN_MS = 12000
const MAX_SPEED_METERS_PER_SECOND = 22
const MAX_JUMP_DISTANCE_METERS = 250
const HIGH_ACCURACY_TIMEOUT_MS = 20000
const BALANCED_TIMEOUT_MS = 30000

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
  statusMessage: 'Tap "Enable location" to begin.',
  configStatus: 'Loading route…',
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
<!--    <a class="admin-link" href="/admin.html">⚙ Admin settings</a>-->
    <h1>5-Location Letter Quest</h1>
    <p class="hint">Visit each location in order. Each location gives its configured letter.</p>
    <p id="config-status" class="muted"></p>

    <section class="card">
      <h2>Current Target</h2>
      <p id="target-name"></p>
      <p id="target-coords" class="muted"></p>
      <p id="distance" class="distance"></p>
    </section>

    <section class="card">
      <h2>Progress</h2>
      <p id="progress"></p>
      <p id="letters" class="letters"></p>
    </section>

    <section class="card">
      <h2>Status</h2>
      <p id="status"></p>
      <p id="pending-letter" class="pending"></p>
      <div class="actions">
        <button id="enable-location" type="button">Enable location</button>
        <button id="confirm-letter" type="button" disabled>Confirm letter and next location</button>
      </div>
    </section>

    <section class="card">
      <h2>Optional Map View</h2>
      <label class="toggle-row" for="toggle-map-view">
        <input id="toggle-map-view" type="checkbox" />
        Show map tools (Google Maps/OpenStreetMap)
      </label>
      <div id="map-panel" class="map-panel hidden">
        <div class="actions">
          <a id="google-nav-link" class="link-button" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
          <a id="osm-nav-link" class="link-button" target="_blank" rel="noopener noreferrer">Open in OpenStreetMap</a>
        </div>
        <iframe id="osm-embed" class="map-embed" title="OpenStreetMap target preview" loading="lazy"></iframe>
      </div>
    </section>
  </main>
`

const els = {
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
    els.targetName.textContent = 'All 5 locations completed!'
    els.targetCoords.textContent = ''
    els.distance.textContent = ''
    els.progress.textContent = 'Great job! You completed the route.'
    els.pendingLetter.textContent = ''
    els.confirmLetter.disabled = true
    els.status.textContent = state.statusMessage
    els.letters.textContent = `Letters: ${state.collectedLetters.join(' ')}`
    els.mapPanel.classList.add('hidden')
    return
  }

  els.targetName.textContent = `${state.currentLocationIndex + 1}. ${currentTarget.name}`
  els.targetCoords.textContent = `Lat ${currentTarget.lat.toFixed(4)}, Lng ${currentTarget.lng.toFixed(4)}`
  els.progress.textContent = `Completed: ${completedCount}/5`
  els.letters.textContent = state.collectedLetters.length
    ? `Letters: ${state.collectedLetters.join(' ')}`
    : 'Letters: -'
  els.status.textContent = state.statusMessage
  els.pendingLetter.textContent = state.pendingLetter
    ? `Your letter: ${state.pendingLetter}. Confirm to continue.`
    : ''
  els.confirmLetter.disabled = !state.pendingLetter

  els.googleNavLink.href = buildGoogleDirectionsUrl(currentTarget)
  els.osmNavLink.href = buildOpenStreetMapUrl(currentTarget)
  els.osmEmbed.src = buildOpenStreetMapEmbedUrl(currentTarget)
  els.mapPanel.classList.toggle('hidden', !state.showMapView)

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
    els.distance.textContent = `Distance: ${meters}m (target ${Math.round(effectiveRadius)}m, base ${LOCATION_RADIUS_METERS}m, accuracy ${Math.round(state.userPosition.accuracy)}m)`
  } else {
    els.distance.textContent = 'Distance: unknown until location is enabled.'
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
      state.statusMessage = `Cooldown active (${Math.ceil(cooldownLeft / 1000)}s). Stay near ${currentTarget.name}.`
      updateUi()
      return
    }
    state.pendingLetter = currentTarget.letter
    state.lastLetterGrantedAt = Date.now()
    state.statusMessage = `You reached ${currentTarget.name}!`
  } else {
    state.statusMessage = `Move closer to ${currentTarget.name}.`
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
    state.statusMessage = `GPS accuracy too low (${Math.round(candidate.accuracy)}m). The game is not possible right now. Need ${MAX_ALLOWED_GPS_ACCURACY_METERS}m or better.`
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
    state.statusMessage = 'Unrealistic location jump detected. Waiting for stable GPS.'
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
        state.statusMessage = 'High-accuracy GPS timed out. Retrying with balanced accuracy...'
        updateUi()
        startWatch({ enableHighAccuracy: false, maximumAge: 15000, timeout: BALANCED_TIMEOUT_MS }, false)
        return
      }

      state.statusMessage = `Location error: ${error.message}`
      updateUi()
    },
    options,
  )
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    state.statusMessage = 'Geolocation is not supported on this device.'
    updateUi()
    return
  }

  if (state.geoWatchId !== null) {
    state.statusMessage = 'Location tracking is already active.'
    updateUi()
    return
  }

  state.statusMessage = 'Requesting permission…'
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
    state.statusMessage = 'Quest complete. All letters collected!'
  } else {
    state.statusMessage = `Next target unlocked: ${state.route[state.currentLocationIndex].name}`
  }

  updateUi()
}

els.enableLocation.addEventListener('click', startLocationTracking)
els.confirmLetter.addEventListener('click', confirmLetter)
els.toggleMapView.addEventListener('change', (e) => {
  state.showMapView = e.target.checked
  updateUi()
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try { await navigator.serviceWorker.register('/sw.js') } catch { /* ignore */ }
  })
}

// Load shared route config (no sign-in needed)
async function loadConfig() {
  try {
    const config = await fetchSharedConfig()
    state.route = config.route
    resetQuestProgress('Tap "Enable location" to begin.')
    state.configStatus = hasSupabaseConfig
      ? 'Route loaded from Supabase.'
      : 'Using default route (Supabase not configured).'
  } catch (error) {
    state.configStatus = `Could not load route from Supabase: ${error.message}. Using defaults.`
  }
  updateUi()
}

loadConfig()
updateUi()
