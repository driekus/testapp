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
import { getLanguage, setLanguage, t } from './i18n.js'

const language = getLanguage()
const ta = (key, params) => t(language, 'admin', key, params)

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
    ? ta('signInToLoad')
    : ta('envMissing'),
}

const app = document.querySelector('#admin-app')

app.innerHTML = `
  <main class="admin-container">
    <div class="top-row">
      <h1>${ta('pageTitle')}</h1>
      <div>
        <label for="language-select">${ta('languageLabel')}:
          <select id="language-select">
            <option value="en" ${language === 'en' ? 'selected' : ''}>EN</option>
            <option value="nl" ${language === 'nl' ? 'selected' : ''}>NL</option>
          </select>
        </label>
        <a class="link" href="/">${ta('backToGame')}</a>
      </div>
    </div>

    <section class="card">
      <h2>${ta('account')}</h2>
      <p id="auth-user" class="small"></p>
      <p id="auth-status" class="small"></p>
      <div class="auth-grid">
        <input id="auth-email" type="email" placeholder="${ta('emailPlaceholder')}" />
        <input id="auth-password" type="password" placeholder="${ta('passwordPlaceholder')}" />
      </div>
      <div class="actions-row">
        <button id="sign-in" type="button">${ta('signIn')}</button>
        <button id="sign-up" type="button">${ta('signUp')}</button>
        <button id="sign-in-github" type="button">${ta('signInGitHub')}</button>
        <button id="sign-out" type="button">${ta('signOut')}</button>
        <button id="reload-config" type="button">${ta('reloadCloudConfig')}</button>
      </div>
    </section>

    <p class="hint">${ta('hint')}</p>

    <section class="card">
      <h2>${ta('locationsHeader')}</h2>
      <div id="rows" class="rows"></div>
    </section>

    <section class="card">
      <h2>${ta('mapHeader')}</h2>
      <p class="small">${ta('mapHint')}</p>
      <div id="map" class="map"></div>
    </section>

    <section class="card actions">
      <button id="save-config" type="button">${ta('saveSettings')}</button>
      <button id="reset-defaults" type="button" class="ghost">${ta('resetDefaults')}</button>
      <p id="status" class="status"></p>
    </section>
  </main>
`

const els = {
  languageSelect: document.querySelector('#language-select'),
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
      <div class="row-title">${index + 1}. ${ta('rowLocation')}</div>
      <label>${ta('name')}
        <input type="text" data-field="name" data-row-index="${index}" value="${point.name}" />
      </label>
      <label>${ta('letterAZ')}
        <input type="text" maxlength="1" data-field="letter" data-row-index="${index}" value="${point.letter}" />
      </label>
      <label>${ta('latitude')}
        <input type="number" step="any" data-field="lat" data-row-index="${index}" value="${point.lat}" />
      </label>
      <label>${ta('longitude')}
        <input type="number" step="any" data-field="lng" data-row-index="${index}" value="${point.lng}" />
      </label>
      <button type="button" data-pick-row="${index}" class="pick-button">${ta('pickFromMap')}</button>
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
    ? ta('signedInAs', { email: state.user.email })
    : ta('notSignedIn')
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
    throw new Error(ta('rowLatLngNumbers', { row: index + 1 }))
  }

  if (lat < -90 || lat > 90) {
    throw new Error(ta('rowLatRange', { row: index + 1 }))
  }

  if (lng < -180 || lng > 180) {
    throw new Error(ta('rowLngRange', { row: index + 1 }))
  }
}

function validateLetter(letter, index) {
  const normalized = String(letter || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

  if (!normalized) {
    throw new Error(ta('rowLetterRange', { row: index + 1 }))
  }

  return normalized.slice(0, 1)
}

function collectRouteFromInputs() {
  return Array.from({ length: 5 }).map((_, index) => {
    const rowInputs = getRowInputs(index)
    const name = rowInputs.name.value.trim() || `${ta('rowLocation')} ${index + 1}`
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
    throw new Error(ta('emailPasswordRequired'))
  }

  return { email, password }
}

async function loadConfigForCurrentUser() {
  if (!state.user) {
    state.config = defaultConfig()
    state.selectedRowIndex = 0
    syncFormFromConfig(state.config)
    setStatus(ta('signInToLoad'))
    updateAuthUi()
    return
  }

  state.config = await fetchSharedConfig()
  state.selectedRowIndex = 0
  syncFormFromConfig(state.config)
  setStatus(ta('loadedConfig'))
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
      throw new Error(ta('saveSignInFirst'))
    }

    const route = collectRouteFromInputs()
    const savedConfig = await saveSharedConfig({ route })
    state.config = savedConfig
    syncFormFromConfig(savedConfig)
    setStatus(ta('saveSuccess'))
  } catch (error) {
    setStatus(error.message, true)
  }
}

async function resetDefaults() {
  try {
    if (!state.user) {
      throw new Error(ta('resetSignInFirst'))
    }

    const savedConfig = await saveSharedConfig({ route: DEFAULT_ROUTE })
    state.config = savedConfig
    state.selectedRowIndex = 0
    syncFormFromConfig(savedConfig)
    setStatus(ta('defaultsSaved'))
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

    setStatus(ta('pickMapUpdated', { row: state.selectedRowIndex + 1 }))
  })
}

async function handleSignIn() {
  try {
    const { email, password } = getCredentials()
    await signInWithPassword(email, password)
    state.authStatusMessage = ta('signInSuccess')
    await refreshUserState()
  } catch (error) {
    state.authStatusMessage = ta('signInFailed', { message: error.message })
    updateAuthUi()
  }
}

async function handleSignUp() {
  try {
    const { email, password } = getCredentials()
    await signUpWithPassword(email, password)
    state.authStatusMessage = ta('signUpSuccess')
    await refreshUserState()
  } catch (error) {
    state.authStatusMessage = ta('signUpFailed', { message: error.message })
    updateAuthUi()
  }
}

async function handleSignInGitHub() {
  try {
    const redirectTo = `${window.location.origin}/admin.html`
    await signInWithGitHub(redirectTo)
    state.authStatusMessage = ta('redirectingGitHub')
    updateAuthUi()
  } catch (error) {
    state.authStatusMessage = ta('githubFailed', { message: error.message })
    updateAuthUi()
  }
}

async function handleSignOut() {
  try {
    await signOutUser()
    state.authStatusMessage = ta('signOutSuccess')
    await refreshUserState()
  } catch (error) {
    state.authStatusMessage = ta('signOutFailed', { message: error.message })
    updateAuthUi()
  }
}

async function handleReloadConfig() {
  try {
    await refreshUserState()
    state.authStatusMessage = state.user
      ? ta('cloudReloaded')
      : ta('notSignedIn')
    updateAuthUi()
  } catch (error) {
    state.authStatusMessage = ta('reloadFailed', { message: error.message })
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
els.languageSelect.addEventListener('change', (event) => {
  setLanguage(event.target.value)
  window.location.reload()
})

setupMap()
syncFormFromConfig(state.config)
updateAuthUi()

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshUserState().catch((error) => {
      state.authStatusMessage = ta('authSyncFailed', { message: error.message })
      updateAuthUi()
      setStatus(error.message, true)
    })
  })
}

refreshUserState().catch((error) => {
  state.authStatusMessage = ta('startupError', { message: error.message })
  updateAuthUi()
  setStatus(error.message, true)
})



