import './style.css'
import { distanceMeters, randomLetter } from './gameLogic.js'

const LOCATION_RADIUS_METERS = 50

const route = [
  { name: 'Start Gate', lat: 52.3676, lng: 4.9041 },
  { name: 'Canal Bridge', lat: 52.3702, lng: 4.8952 },
  { name: 'Old Square', lat: 52.3731, lng: 4.8922 },
  { name: 'Museum Point', lat: 52.3584, lng: 4.8811 },
  { name: 'Finish Park', lat: 52.3549, lng: 4.8910 },
]

const state = {
  currentLocationIndex: 0,
  collectedLetters: [],
  pendingLetter: null,
  userPosition: null,
  geoWatchId: null,
  showMapView: false,
  statusMessage: 'Tap "Enable location" to begin.',
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

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="container">
    <h1>5-Location Letter Quest</h1>
    <p class="hint">Visit each location in order. When you arrive, you get a random letter.</p>

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
  const currentTarget = route[state.currentLocationIndex]
  const completedCount = state.collectedLetters.length

  if (!currentTarget) {
    els.targetName.textContent = 'All 5 locations completed'
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
    const meters = Math.round(
      distanceMeters(
        state.userPosition.latitude,
        state.userPosition.longitude,
        currentTarget.lat,
        currentTarget.lng,
      ),
    )
    els.distance.textContent = `Distance: ${meters}m (target radius ${LOCATION_RADIUS_METERS}m)`
  } else {
    els.distance.textContent = 'Distance: unknown until location is enabled.'
  }
}

function checkArrival() {
  if (state.pendingLetter || !state.userPosition) {
    return
  }

  const currentTarget = route[state.currentLocationIndex]
  if (!currentTarget) {
    return
  }

  const meters = distanceMeters(
    state.userPosition.latitude,
    state.userPosition.longitude,
    currentTarget.lat,
    currentTarget.lng,
  )

  if (meters <= LOCATION_RADIUS_METERS) {
    state.pendingLetter = randomLetter()
    state.statusMessage = `You reached ${currentTarget.name}!`
  } else {
    state.statusMessage = `Move closer to ${currentTarget.name}.`
  }

  updateUi()
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

  state.statusMessage = 'Requesting permission...'
  updateUi()

  state.geoWatchId = navigator.geolocation.watchPosition(
    (position) => {
      state.userPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      checkArrival()
      updateUi()
    },
    (error) => {
      state.statusMessage = `Location error: ${error.message}`
      updateUi()
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000,
    },
  )
}

function confirmLetter() {
  if (!state.pendingLetter) {
    return
  }

  state.collectedLetters.push(state.pendingLetter)
  state.pendingLetter = null
  state.currentLocationIndex += 1

  if (state.currentLocationIndex >= route.length) {
    state.statusMessage = 'Quest complete. All letters collected!'
  } else {
    state.statusMessage = `Next target unlocked: ${route[state.currentLocationIndex].name}`
  }

  updateUi()
}

function setMapViewVisibility(isVisible) {
  state.showMapView = isVisible
  updateUi()
}

els.enableLocation.addEventListener('click', startLocationTracking)
els.confirmLetter.addEventListener('click', confirmLetter)
els.toggleMapView.addEventListener('change', (event) => {
  setMapViewVisibility(event.target.checked)
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js')
    } catch {
      // Ignore service worker failures in local/dev contexts.
    }
  })
}

updateUi()
