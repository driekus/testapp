import './admin.css'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import { DEFAULT_ROUTE, defaultConfig } from './config.js'
import {
  getCurrentUser,
  hasSupabaseConfig,
  signInWithGitHub,
  signInWithPassword,
  signOutUser,
  signUpWithPassword,
  supabase,
} from './supabaseClient.js'
import { fetchSharedConfig, saveSharedConfig } from './userConfigService.js'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const state = {
  config: defaultConfig(),
  selectedRowIndex: 0,
  map: null,
  marker: null,
  user: null,
  authStatusMessage: hasSupabaseConfig
    ? 'Sign in to edit shared route settings.'
    : 'Supabase env vars missing. Admin save is disabled.',
}

const app = document.querySelector('#admin-app')

app.innerHTML = `
  <main class="admin-container">
    <div class="top-row">
      <h1>Letter Quest Admin</h1>
      <a class="link" href="/">Back to game</a>
    </div>

    <section class="card">
      <h2>Account</h2>
      <p id="auth-user" class="small"></p>
      <p id="auth-status" class="small"></p>
      <div class="auth-grid">
        <input id="auth-email" type="email" placeholder="Email" />
        <input id="auth-password" type="password" placeholder="Password" />
      </div>
      <div class="actions-row">
        <button id="sign-in" type="button">Sign in</button>
        <button id="sign-up" type="button">Sign up</button>
        <button id="sign-in-github" type="button">Sign in with GitHub</button>
        <button id="sign-out" type="button">Sign out</button>
        <button id="reload-config" type="button">Reload cloud config</button>
      </div>
    </section>

    <p class="hint">Set names, fixed letters, and coordinates manually or click the map.</p>

    <section class="card">
      <h2>5 Locations</h2>
      <div id="rows" class="rows"></div>
    </section>

    <section class="card">
      <h2>Pick Coordinates on Map (OpenStreetMap)</h2>
      <p class="small">Select a location row first, then click on the map.</p>
      <div id="map" class="map"></div>
    </section>

    <section class="card actions">
      <button id="save-config" type="button">Save Settings</button>
      <button id="reset-defaults" type="button" class="ghost">Reset Defaults</button>
      <p id="status" class="status"></p>
    </section>
  </main>
`

const els = {
  authUser: document.querySelector('#auth-user'),
  authStatus: document.querySelector('#auth-status'),
  authEmail: document.querySelector('#auth-email'),
  authPassword: document.querySelector('#auth-password'),
  signIn: document.querySelector('#sign-in'),
  signUp: document.querySelector('#sign-up'),
  signInGitHub: document.querySelector('#sign-in-github'),
  signOut: document.querySelector('#sign-out'),
  reloadConfig: document.querySelector('#reload-config'),
  rows: document.querySelector('#rows'),
  saveConfig: document.querySelector('#save-config'),
  resetDefaults: document.querySelector('#reset-defaults'),
  status: document.querySelector('#status'),
}

function rowTemplate(point, index) {
  return `
    <div class="row" data-row-index="${index}">
      <div class="row-title">${index + 1}. Location</div>
      <label>Name
        <input type="text" data-field="name" data-row-index="${index}" value="${point.name}" />
      </label>
      <label>Letter (A-Z)
        <input type="text" maxlength="1" data-field="letter" data-row-index="${index}" value="${point.letter}" />
      </label>
      <label>Latitude
        <input type="number" step="any" data-field="lat" data-row-index="${index}" value="${point.lat}" />
      </label>
      <label>Longitude
        <input type="number" step="any" data-field="lng" data-row-index="${index}" value="${point.lng}" />
      </label>
      <button type="button" data-pick-row="${index}" class="pick-button">Pick from map</button>
    </div>
  `
}

function getRowInputs(index) {
  return {
    name: document.querySelector(`input[data-field="name"][data-row-index="${index}"]`),
    letter: document.querySelector(`input[data-field="letter"][data-row-index="${index}"]`),
    lat: document.querySelector(`input[data-field="lat"][data-row-index="${index}"]`),
    lng: document.querySelector(`input[data-field="lng"][data-row-index="${index}"]`),
  }
}

function setStatus(message, isError = false) {
  els.status.textContent = message
  els.status.classList.toggle('error', isError)
}

function updateAuthUi() {
  els.authUser.textContent = state.user
    ? `Signed in as ${state.user.email}`
    : 'Not signed in.'
  els.authStatus.textContent = state.authStatusMessage

  const canSave = Boolean(state.user && hasSupabaseConfig)
  els.saveConfig.disabled = !canSave
  els.resetDefaults.disabled = !canSave
}

function setSelectedRow(index) {
  state.selectedRowIndex = index

  document.querySelectorAll('.row').forEach((row) => {
    const rowIndex = Number(row.dataset.rowIndex)
    row.classList.toggle('active', rowIndex === index)
  })

  const rowInputs = getRowInputs(index)
  const lat = Number(rowInputs.lat.value)
  const lng = Number(rowInputs.lng.value)
  if (Number.isFinite(lat) && Number.isFinite(lng) && state.map) {
    state.map.setView([lat, lng], 16)
    if (!state.marker) {
      state.marker = L.marker([lat, lng]).addTo(state.map)
    } else {
      state.marker.setLatLng([lat, lng])
    }
  }
}

function validateCoordinate(lat, lng, index) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Row ${index + 1}: latitude/longitude must be numbers.`)
  }

  if (lat < -90 || lat > 90) {
    throw new Error(`Row ${index + 1}: latitude must be between -90 and 90.`)
  }

  if (lng < -180 || lng > 180) {
    throw new Error(`Row ${index + 1}: longitude must be between -180 and 180.`)
  }
}

function validateLetter(letter, index) {
  const normalized = String(letter || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

  if (!normalized) {
    throw new Error(`Row ${index + 1}: letter must contain A-Z.`)
  }

  return normalized.slice(0, 1)
}

function collectRouteFromInputs() {
  return Array.from({ length: 5 }).map((_, index) => {
    const rowInputs = getRowInputs(index)
    const name = rowInputs.name.value.trim() || `Location ${index + 1}`
    const letter = validateLetter(rowInputs.letter.value, index)
    const lat = Number(rowInputs.lat.value)
    const lng = Number(rowInputs.lng.value)

    validateCoordinate(lat, lng, index)

    return { name, lat, lng, letter }
  })
}

function syncFormFromConfig(config) {
  els.rows.innerHTML = config.route.map((point, index) => rowTemplate(point, index)).join('')

  document.querySelectorAll('[data-pick-row]').forEach((button) => {
    button.addEventListener('click', () => {
      setSelectedRow(Number(button.dataset.pickRow))
    })
  })

  document.querySelectorAll('.row input').forEach((input) => {
    input.addEventListener('focus', () => {
      setSelectedRow(Number(input.dataset.rowIndex))
    })
  })

  setSelectedRow(state.selectedRowIndex)
}

function getCredentials() {
  const email = els.authEmail.value.trim()
  const password = els.authPassword.value
  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  return { email, password }
}

async function loadConfigForCurrentUser() {
  if (!state.user) {
    state.config = defaultConfig()
    state.selectedRowIndex = 0
    syncFormFromConfig(state.config)
    setStatus('Sign in to load and save the shared route config.')
    updateAuthUi()
    return
  }

  state.config = await fetchSharedConfig()
  state.selectedRowIndex = 0
  syncFormFromConfig(state.config)
  setStatus('Loaded shared route config from Supabase.')
  updateAuthUi()
}

async function refreshUserState() {
  if (!hasSupabaseConfig) {
    updateAuthUi()
    return
  }

  state.user = await getCurrentUser()
  await loadConfigForCurrentUser()
}

async function saveConfigFromForm() {
  try {
    if (!state.user) {
      throw new Error('Sign in first to save config.')
    }

    const route = collectRouteFromInputs()
    const savedConfig = await saveSharedConfig({ route })
    state.config = savedConfig
    syncFormFromConfig(savedConfig)
    setStatus('Saved to Supabase. All players will now see this route.')
  } catch (error) {
    setStatus(error.message, true)
  }
}

async function resetDefaults() {
  try {
    if (!state.user) {
      throw new Error('Sign in first to reset config.')
    }

    const savedConfig = await saveSharedConfig({ route: DEFAULT_ROUTE })
    state.config = savedConfig
    state.selectedRowIndex = 0
    syncFormFromConfig(savedConfig)
    setStatus('Defaults restored and saved to Supabase.')
  } catch (error) {
    setStatus(error.message, true)
  }
}

function setupMap() {
  const first = state.config.route[0]
  state.map = L.map('map').setView([first.lat, first.lng], 14)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map)

  state.map.on('click', (event) => {
    const { lat, lng } = event.latlng
    const rowInputs = getRowInputs(state.selectedRowIndex)

    rowInputs.lat.value = lat.toFixed(6)
    rowInputs.lng.value = lng.toFixed(6)

    if (!state.marker) {
      state.marker = L.marker([lat, lng]).addTo(state.map)
    } else {
      state.marker.setLatLng([lat, lng])
    }

    setStatus(`Row ${state.selectedRowIndex + 1} updated from map click.`)
  })
}

async function handleSignIn() {
  try {
    const { email, password } = getCredentials()
    await signInWithPassword(email, password)
    state.authStatusMessage = 'Signed in successfully.'
    await refreshUserState()
  } catch (error) {
    state.authStatusMessage = `Sign-in failed: ${error.message}`
    updateAuthUi()
  }
}

async function handleSignUp() {
  try {
    const { email, password } = getCredentials()
    await signUpWithPassword(email, password)
    state.authStatusMessage = 'Account created. If email confirmation is enabled, confirm first.'
    await refreshUserState()
  } catch (error) {
    state.authStatusMessage = `Sign-up failed: ${error.message}`
    updateAuthUi()
  }
}

async function handleSignInGitHub() {
  try {
    const redirectTo = `${window.location.origin}/admin.html`
    await signInWithGitHub(redirectTo)
    state.authStatusMessage = 'Redirecting to GitHub...'
    updateAuthUi()
  } catch (error) {
    state.authStatusMessage = `GitHub sign-in failed: ${error.message}`
    updateAuthUi()
  }
}

async function handleSignOut() {
  try {
    await signOutUser()
    state.authStatusMessage = 'Signed out.'
    await refreshUserState()
  } catch (error) {
    state.authStatusMessage = `Sign-out failed: ${error.message}`
    updateAuthUi()
  }
}

async function handleReloadConfig() {
  try {
    await refreshUserState()
    state.authStatusMessage = state.user
      ? 'Cloud config reloaded.'
      : 'Not signed in.'
    updateAuthUi()
  } catch (error) {
    state.authStatusMessage = `Reload failed: ${error.message}`
    updateAuthUi()
  }
}

els.saveConfig.addEventListener('click', saveConfigFromForm)
els.resetDefaults.addEventListener('click', resetDefaults)
els.signIn.addEventListener('click', handleSignIn)
els.signUp.addEventListener('click', handleSignUp)
els.signInGitHub.addEventListener('click', handleSignInGitHub)
els.signOut.addEventListener('click', handleSignOut)
els.reloadConfig.addEventListener('click', handleReloadConfig)

setupMap()
syncFormFromConfig(state.config)
updateAuthUi()

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshUserState().catch((error) => {
      state.authStatusMessage = `Auth sync failed: ${error.message}`
      updateAuthUi()
      setStatus(error.message, true)
    })
  })
}

refreshUserState().catch((error) => {
  state.authStatusMessage = `Startup error: ${error.message}`
  updateAuthUi()
  setStatus(error.message, true)
})



