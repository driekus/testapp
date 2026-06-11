import './admin.css'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import { DEFAULT_ROUTE, DEFAULT_ROUTE_LENGTH, MAX_ROUTE_LOCATIONS, blankRoute, defaultConfig } from './config.js'
import {
  getCurrentUser,
  hasSupabaseConfig,
  signInWithGitHub,
  signInWithPassword,
  signOutUser,
  signUpWithPassword,
  supabase,
} from './supabaseClient.js'
import {
  createRoute,
  deleteGame,
  deleteLocationImage,
  deleteRoute,
  fetchGameWithRoutes,
  listGames,
  saveGame,
  saveRoute,
  uploadLocationImage,
} from './userConfigService.js'
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
  // game management
  games: [],
  currentGameId: null,
  currentSlug: null,
  // route management — array of {id, order_index, display_name, route, _dirty}
  routes: [],
  currentRouteIndex: 0,
  // location editor
  selectedRowIndex: 0,
  // map
  map: null,
  marker: null,
  // auth
  user: null,
  authStatusMessage: hasSupabaseConfig ? ta('signInToLoad') : ta('envMissing'),
}

// ─── Shell HTML ──────────────────────────────────────────────────────────────

document.querySelector('#admin-app').innerHTML = `
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

    <!-- Auth -->
    <section class="card">
      <h2>${ta('account')}</h2>
      <p id="auth-user" class="small"></p>
      <p id="auth-status" class="small"></p>
      <div class="auth-grid">
        <input id="auth-email" type="email" placeholder="${ta('emailPlaceholder')}" />
        <input id="auth-password" type="password" placeholder="${ta('passwordPlaceholder')}" />
      </div>
      <div class="actions-row">
        <button id="sign-in">${ta('signIn')}</button>
        <button id="sign-up">${ta('signUp')}</button>
        <button id="sign-in-github">${ta('signInGitHub')}</button>
        <button id="sign-out">${ta('signOut')}</button>
      </div>
    </section>

    <!-- Game picker -->
    <section class="card">
      <h2>${ta('gamesHeader')}</h2>
      <div class="game-select-row">
        <select id="game-select"><option value="">${ta('selectGameOption')}</option></select>
        <button id="new-game-btn" disabled>${ta('newGame')}</button>
        <button id="delete-game-btn" class="ghost danger" disabled>${ta('deleteGame')}</button>
      </div>
      <div id="new-game-form" class="new-game-form hidden">
        <label>${ta('gameSlug')}
          <input id="new-game-slug" type="text" placeholder="my-game" />
          <span class="field-hint">${ta('gameSlugHint')}</span>
        </label>
        <label>${ta('gameDisplayName')}
          <input id="new-game-display-name" type="text" placeholder="My Game" />
        </label>
        <div class="actions-row">
          <button id="create-game-btn">${ta('createGame')}</button>
          <button id="cancel-new-game-btn" class="ghost">${ta('cancel')}</button>
        </div>
      </div>
      <p id="game-status" class="small"></p>
    </section>

    <!-- Editor (hidden until a game is selected) -->
    <section id="editor-section" class="hidden">
      <!-- Game display name -->
      <section class="card">
        <h2>${ta('gameDisplayNameLabel')}</h2>
        <div class="actions-row">
          <input id="edit-display-name" type="text" style="flex:1" />
          <button id="save-display-name">${ta('saveName')}</button>
        </div>
      </section>

      <!-- Route tabs -->
      <section class="card">
        <div class="route-tab-bar" id="route-tab-bar"></div>
        <div class="route-meta-row">
          <label style="flex:1">${ta('routeDisplayName')}
            <input id="route-display-name-input" type="text" />
          </label>
          <label>${ta('locationCount')}
            <input id="route-location-count" type="number" min="1" max="${MAX_ROUTE_LOCATIONS}" style="width:72px" />
          </label>
          <button id="delete-route-btn" class="ghost danger">${ta('deleteRoute')}</button>
        </div>
        <p class="hint small">${ta('hint')}</p>
        <div id="rows" class="rows"></div>
      </section>

      <!-- Map -->
      <section class="card">
        <h2>${ta('mapHeader')}</h2>
        <p class="small">${ta('mapHint')}</p>
        <div id="map" class="map"></div>
      </section>

      <!-- Actions -->
      <section class="card actions-row">
        <button id="save-route-btn">${ta('saveRoute')}</button>
        <button id="add-route-btn" class="ghost">${ta('addRoute')}</button>
        <button id="reset-defaults-btn" class="ghost">${ta('resetDefaults')}</button>
        <p id="status" class="status" style="flex:1;text-align:right"></p>
      </section>
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
  gameSelect: document.querySelector('#game-select'),
  newGameBtn: document.querySelector('#new-game-btn'),
  deleteGameBtn: document.querySelector('#delete-game-btn'),
  newGameForm: document.querySelector('#new-game-form'),
  newGameSlug: document.querySelector('#new-game-slug'),
  newGameDisplayName: document.querySelector('#new-game-display-name'),
  createGameBtn: document.querySelector('#create-game-btn'),
  cancelNewGameBtn: document.querySelector('#cancel-new-game-btn'),
  gameStatus: document.querySelector('#game-status'),
  editorSection: document.querySelector('#editor-section'),
  editDisplayName: document.querySelector('#edit-display-name'),
  saveDisplayName: document.querySelector('#save-display-name'),
  routeTabBar: document.querySelector('#route-tab-bar'),
  routeDisplayNameInput: document.querySelector('#route-display-name-input'),
  routeLocationCount: document.querySelector('#route-location-count'),
  deleteRouteBtn: document.querySelector('#delete-route-btn'),
  rows: document.querySelector('#rows'),
  saveRouteBtn: document.querySelector('#save-route-btn'),
  addRouteBtn: document.querySelector('#add-route-btn'),
  resetDefaultsBtn: document.querySelector('#reset-defaults-btn'),
  status: document.querySelector('#status'),
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function setStatus(msg, isError = false) {
  els.status.textContent = msg
  els.status.classList.toggle('error', isError)
}

function setGameStatus(msg, isError = false) {
  els.gameStatus.textContent = msg
  els.gameStatus.classList.toggle('error', isError)
}

function sanitizeSlugInput(raw) {
  return raw.trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Auth UI ─────────────────────────────────────────────────────────────────

function updateAuthUi() {
  els.authUser.textContent = state.user
    ? ta('signedInAs', { email: state.user.email })
    : ta('notSignedIn')
  els.authStatus.textContent = state.authStatusMessage

  const canEdit = Boolean(state.user && hasSupabaseConfig)
  els.newGameBtn.disabled = !canEdit
  els.deleteGameBtn.disabled = !canEdit || !state.currentSlug
  els.saveRouteBtn.disabled = !canEdit
  els.addRouteBtn.disabled = !canEdit
  els.resetDefaultsBtn.disabled = !canEdit
  els.deleteRouteBtn.disabled = !canEdit || state.routes.length <= 1
  els.saveDisplayName.disabled = !canEdit
}

// ─── Game selector ───────────────────────────────────────────────────────────

function populateGameSelect() {
  const cur = els.gameSelect.value
  els.gameSelect.innerHTML = `<option value="">${ta('selectGameOption')}</option>`
  for (const g of state.games) {
    const opt = document.createElement('option')
    opt.value = g.slug
    opt.textContent = `${g.display_name} (/${g.slug})`
    if (g.slug === cur || g.slug === state.currentSlug) opt.selected = true
    els.gameSelect.appendChild(opt)
  }
}

async function refreshGameList() {
  try {
    state.games = await listGames()
    populateGameSelect()
  } catch (err) {
    setGameStatus(ta('loadGamesFailed', { message: err.message }), true)
  }
}

// ─── Route tabs ──────────────────────────────────────────────────────────────

function renderRouteTabs() {
  els.routeTabBar.innerHTML = state.routes
    .map(
      (r, i) => `
      <button type="button"
        class="route-tab${i === state.currentRouteIndex ? ' active' : ''}"
        data-route-idx="${i}">
        ${r.display_name}
      </button>`,
    )
    .join('')

  els.routeTabBar.querySelectorAll('.route-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchToRoute(Number(btn.dataset.routeIdx)))
  })
}

/** Read current form values back into state.routes[state.currentRouteIndex]. */
function flushCurrentRouteToState() {
  if (!state.routes.length) return
  const r = state.routes[state.currentRouteIndex]
  r.display_name = els.routeDisplayNameInput.value.trim() || r.display_name
  r.route = collectRouteFromInputs()
}

function switchToRoute(index) {
  flushCurrentRouteToState()
  state.currentRouteIndex = index
  state.selectedRowIndex = 0
  const r = state.routes[index]
  els.routeDisplayNameInput.value = r.display_name
  syncFormFromRoute(r.route)
  renderRouteTabs()
  updateAuthUi()
}

// ─── Location editor ─────────────────────────────────────────────────────────

function rowTemplate(point, index) {
  const hasImage = Boolean(point.image_url)
  return `
    <div class="row" data-row-index="${index}">
      <div class="row-title">${index + 1}. ${ta('rowLocation')}</div>
      <div class="row-fields">
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
        <input type="hidden" data-field="image_url" data-row-index="${index}" value="${point.image_url ?? ''}" />
        <button type="button" data-pick-row="${index}" class="pick-button">${ta('pickFromMap')}</button>
      </div>
      <div class="row-image-area">
        <div class="image-preview-wrap ${hasImage ? '' : 'hidden'}" data-preview="${index}">
          <img class="location-image-preview" src="${point.image_url ?? ''}" alt="" />
          <button type="button" class="ghost danger remove-image-btn" data-remove-image="${index}">${ta('removeImage')}</button>
        </div>
        <label class="upload-label ${hasImage ? 'hidden' : ''}" data-upload-label="${index}">
          <span class="upload-btn-face">${ta('uploadImage')}</span>
          <input type="file" accept="image/*" class="image-file-input" data-upload-row="${index}" style="display:none" />
        </label>
        <p class="upload-status small" data-upload-status="${index}"></p>
      </div>
    </div>`
}

function getRowInputs(index) {
  return {
    name: document.querySelector(`input[data-field="name"][data-row-index="${index}"]`),
    letter: document.querySelector(`input[data-field="letter"][data-row-index="${index}"]`),
    lat: document.querySelector(`input[data-field="lat"][data-row-index="${index}"]`),
    lng: document.querySelector(`input[data-field="lng"][data-row-index="${index}"]`),
    image_url: document.querySelector(`input[data-field="image_url"][data-row-index="${index}"]`),
  }
}

function validateCoordinate(lat, lng, index) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(ta('rowLatLngNumbers', { row: index + 1 }))
  if (lat < -90 || lat > 90) throw new Error(ta('rowLatRange', { row: index + 1 }))
  if (lng < -180 || lng > 180) throw new Error(ta('rowLngRange', { row: index + 1 }))
}

function validateLetter(letter, index) {
  const n = String(letter || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (!n) throw new Error(ta('rowLetterRange', { row: index + 1 }))
  return n.slice(0, 1)
}

function currentLocationCount() {
  return els.rows.querySelectorAll('.row').length
}

function collectRouteFromInputs() {
  return Array.from({ length: currentLocationCount() }).map((_, index) => {
    const ri = getRowInputs(index)
    const name = ri.name.value.trim() || `${ta('rowLocation')} ${index + 1}`
    const letter = validateLetter(ri.letter.value, index)
    const lat = Number(ri.lat.value)
    const lng = Number(ri.lng.value)
    validateCoordinate(lat, lng, index)
    return { name, lat, lng, letter, image_url: ri.image_url?.value ?? '' }
  })
}

function setSelectedRow(index) {
  state.selectedRowIndex = index
  document.querySelectorAll('.row').forEach((row) => {
    row.classList.toggle('active', Number(row.dataset.rowIndex) === index)
  })
  const ri = getRowInputs(index)
  const lat = Number(ri.lat.value)
  const lng = Number(ri.lng.value)
  if (Number.isFinite(lat) && Number.isFinite(lng) && state.map) {
    state.map.setView([lat, lng], 16)
    if (!state.marker) state.marker = L.marker([lat, lng]).addTo(state.map)
    else state.marker.setLatLng([lat, lng])
  }
}

function syncFormFromRoute(route) {
  els.rows.innerHTML = route.map((point, i) => rowTemplate(point, i)).join('')
  els.routeLocationCount.value = route.length
  document.querySelectorAll('[data-pick-row]').forEach((btn) => {
    btn.addEventListener('click', () => setSelectedRow(Number(btn.dataset.pickRow)))
  })
  document.querySelectorAll('.row input:not([type=file])').forEach((input) => {
    input.addEventListener('focus', () => {
      if (input.dataset.rowIndex !== undefined) setSelectedRow(Number(input.dataset.rowIndex))
    })
  })
  setSelectedRow(Math.min(state.selectedRowIndex, route.length - 1))
}

// ─── Image upload (event delegation on els.rows) ──────────────────────────────

function setUploadStatus(index, msg, isError = false) {
  const el = document.querySelector(`[data-upload-status="${index}"]`)
  if (!el) return
  el.textContent = msg
  el.classList.toggle('error', isError)
}

async function handleImageUpload(fileInput, rowIndex) {
  const file = fileInput.files[0]
  if (!file) return

  setUploadStatus(rowIndex, ta('uploading'))
  try {
    const r = state.routes[state.currentRouteIndex]
    const url = await uploadLocationImage(file, state.currentSlug, r.id ?? 'new', rowIndex)

    // Write URL into hidden input
    const hiddenInput = document.querySelector(`input[data-field="image_url"][data-row-index="${rowIndex}"]`)
    if (hiddenInput) hiddenInput.value = url

    // Show preview, hide upload label
    const preview = document.querySelector(`[data-preview="${rowIndex}"]`)
    const label = document.querySelector(`[data-upload-label="${rowIndex}"]`)
    if (preview) {
      preview.querySelector('img').src = url
      preview.classList.remove('hidden')
    }
    if (label) label.classList.add('hidden')
    setUploadStatus(rowIndex, ta('uploadDone'))
  } catch (err) {
    setUploadStatus(rowIndex, ta('uploadFailed', { message: err.message }), true)
  }
  fileInput.value = ''
}

async function handleImageRemove(rowIndex) {
  const hiddenInput = document.querySelector(`input[data-field="image_url"][data-row-index="${rowIndex}"]`)
  const oldUrl = hiddenInput?.value ?? ''

  if (oldUrl) {
    try { await deleteLocationImage(oldUrl) } catch { /* best-effort */ }
  }

  if (hiddenInput) hiddenInput.value = ''
  const preview = document.querySelector(`[data-preview="${rowIndex}"]`)
  const label = document.querySelector(`[data-upload-label="${rowIndex}"]`)
  if (preview) { preview.querySelector('img').src = ''; preview.classList.add('hidden') }
  if (label) label.classList.remove('hidden')
  setUploadStatus(rowIndex, '')
}

// Single delegated listener set up once
function bindRowsDelegate() {
  els.rows.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-image]')
    if (removeBtn) {
      handleImageRemove(Number(removeBtn.dataset.removeImage))
    }
  })
  els.rows.addEventListener('change', (e) => {
    const fileInput = e.target.closest('.image-file-input')
    if (fileInput) {
      handleImageUpload(fileInput, Number(fileInput.dataset.uploadRow))
    }
  })
}

function handleLocationCountChange() {
  const raw = Number(els.routeLocationCount.value)
  const newCount = Math.max(1, Math.min(MAX_ROUTE_LOCATIONS, Math.floor(raw) || 1))
  els.routeLocationCount.value = newCount

  // Read current form values so we don't lose edits
  let current
  try { current = collectRouteFromInputs() } catch { current = state.routes[state.currentRouteIndex]?.route ?? [] }

  if (newCount === current.length) return

  let next
  if (newCount > current.length) {
    const extra = blankRoute(newCount - current.length).map((p, i) => ({
      ...p,
      letter: String.fromCharCode(65 + ((current.length + i) % 26)),
    }))
    next = [...current, ...extra]
  } else {
    next = current.slice(0, newCount)
  }

  syncFormFromRoute(next)
}

// ─── Map ─────────────────────────────────────────────────────────────────────

function setupMap() {
  const first = defaultConfig().route[0]
  state.map = L.map('map').setView([first.lat, first.lng], 14)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map)

  state.map.on('click', ({ latlng: { lat, lng } }) => {
    const ri = getRowInputs(state.selectedRowIndex)
    ri.lat.value = lat.toFixed(6)
    ri.lng.value = lng.toFixed(6)
    if (!state.marker) state.marker = L.marker([lat, lng]).addTo(state.map)
    else state.marker.setLatLng([lat, lng])
    setStatus(ta('pickMapUpdated', { row: state.selectedRowIndex + 1 }))
  })
}

// ─── Load game into editor ────────────────────────────────────────────────────

async function loadGameIntoEditor(slug) {
  if (!slug) {
    state.currentSlug = null
    state.currentGameId = null
    state.routes = []
    els.editorSection.classList.add('hidden')
    updateAuthUi()
    return
  }

  setGameStatus(ta('loadingGame'))
  try {
    const game = await fetchGameWithRoutes(slug)
    if (!game) {
      setGameStatus(ta('gameNotFoundAdmin', { slug }), true)
      return
    }
    state.currentSlug = slug
    state.currentGameId = game.id
    state.routes = game.routes.length
      ? game.routes
      : [{ id: null, order_index: 0, display_name: 'Route 1', route: [...DEFAULT_ROUTE] }]
    state.currentRouteIndex = 0

    els.editDisplayName.value = game.display_name
    els.routeDisplayNameInput.value = state.routes[0].display_name
    syncFormFromRoute(state.routes[0].route)
    renderRouteTabs()

    if (state.map && state.routes[0].route[0]) {
      state.map.setView([state.routes[0].route[0].lat, state.routes[0].route[0].lng], 14)
    }

    els.editorSection.classList.remove('hidden')
    setGameStatus('')
  } catch (err) {
    setGameStatus(ta('loadGamesFailed', { message: err.message }), true)
  }
  updateAuthUi()
}

// ─── Auth handlers ────────────────────────────────────────────────────────────

function getCredentials() {
  const email = els.authEmail.value.trim()
  const password = els.authPassword.value
  if (!email || !password) throw new Error(ta('emailPasswordRequired'))
  return { email, password }
}

async function refreshUserState() {
  if (!hasSupabaseConfig) { updateAuthUi(); return }
  state.user = await getCurrentUser()
  updateAuthUi()
  await refreshGameList()
  if (state.currentSlug) await loadGameIntoEditor(state.currentSlug)
}

async function handleSignIn() {
  try {
    const { email, password } = getCredentials()
    await signInWithPassword(email, password)
    state.authStatusMessage = ta('signInSuccess')
    await refreshUserState()
  } catch (err) {
    state.authStatusMessage = ta('signInFailed', { message: err.message })
    updateAuthUi()
  }
}

async function handleSignUp() {
  try {
    const { email, password } = getCredentials()
    await signUpWithPassword(email, password)
    state.authStatusMessage = ta('signUpSuccess')
    await refreshUserState()
  } catch (err) {
    state.authStatusMessage = ta('signUpFailed', { message: err.message })
    updateAuthUi()
  }
}

async function handleSignInGitHub() {
  try {
    await signInWithGitHub(`${window.location.origin}/admin.html`)
    state.authStatusMessage = ta('redirectingGitHub')
    updateAuthUi()
  } catch (err) {
    state.authStatusMessage = ta('githubFailed', { message: err.message })
    updateAuthUi()
  }
}

async function handleSignOut() {
  try {
    await signOutUser()
    state.authStatusMessage = ta('signOutSuccess')
    await refreshUserState()
  } catch (err) {
    state.authStatusMessage = ta('signOutFailed', { message: err.message })
    updateAuthUi()
  }
}

// ─── Game CRUD ────────────────────────────────────────────────────────────────

async function handleCreateGame() {
  const slug = sanitizeSlugInput(els.newGameSlug.value)
  const displayName = els.newGameDisplayName.value.trim()
  if (!slug) { setGameStatus(ta('slugRequired'), true); return }
  if (!displayName) { setGameStatus(ta('displayNameRequired'), true); return }

  try {
    const gameId = await saveGame(slug, displayName)
    // seed first route
    await createRoute(gameId, 'Route 1', DEFAULT_ROUTE, 0)
    setGameStatus(ta('gameCreated', { name: displayName }))
    els.newGameForm.classList.add('hidden')
    els.newGameSlug.value = ''
    els.newGameDisplayName.value = ''
    await refreshGameList()
    els.gameSelect.value = slug
    state.currentSlug = slug
    await loadGameIntoEditor(slug)
  } catch (err) {
    setGameStatus(err.message, true)
  }
}

async function handleDeleteGame() {
  if (!state.currentSlug) return
  const game = state.games.find((g) => g.slug === state.currentSlug)
  if (!confirm(ta('gameDeleteConfirm', { name: game?.display_name ?? state.currentSlug }))) return
  try {
    await deleteGame(state.currentSlug)
    setGameStatus(ta('gameDeleted', { name: game?.display_name ?? state.currentSlug }))
    state.currentSlug = null
    state.currentGameId = null
    state.routes = []
    els.editorSection.classList.add('hidden')
    await refreshGameList()
    updateAuthUi()
  } catch (err) {
    setGameStatus(err.message, true)
  }
}

async function handleSaveDisplayName() {
  const name = els.editDisplayName.value.trim()
  if (!name) { setStatus(ta('displayNameRequired'), true); return }
  try {
    await saveGame(state.currentSlug, name)
    const g = state.games.find((x) => x.slug === state.currentSlug)
    if (g) g.display_name = name
    populateGameSelect()
    els.gameSelect.value = state.currentSlug
    setStatus(ta('nameSaved'))
  } catch (err) {
    setStatus(err.message, true)
  }
}

// ─── Route CRUD ──────────────────────────────────────────────────────────────

async function handleSaveRoute() {
  if (!state.user) { setStatus(ta('saveSignInFirst'), true); return }
  if (!state.currentSlug) { setStatus(ta('noGameSelected'), true); return }

  try {
    flushCurrentRouteToState()
    const r = state.routes[state.currentRouteIndex]
    const displayName = els.routeDisplayNameInput.value.trim() || r.display_name
    const route = collectRouteFromInputs()

    if (r.id) {
      await saveRoute(r.id, displayName, route)
    } else {
      const created = await createRoute(state.currentGameId, displayName, route, r.order_index)
      r.id = created.id
    }

    r.display_name = displayName
    r.route = route
    renderRouteTabs()
    setStatus(ta('routeSaved'))
  } catch (err) {
    setStatus(err.message, true)
  }
}

async function handleAddRoute() {
  if (!state.user) { setStatus(ta('saveSignInFirst'), true); return }

  flushCurrentRouteToState()

  const nextIndex = state.routes.length
  const newRoute = {
    id: null,
    order_index: nextIndex,
    display_name: `${ta('routeLabel')} ${nextIndex + 1}`,
    route: [...DEFAULT_ROUTE],
  }
  state.routes.push(newRoute)
  state.currentRouteIndex = nextIndex
  state.selectedRowIndex = 0

  els.routeDisplayNameInput.value = newRoute.display_name
  syncFormFromRoute(newRoute.route)
  renderRouteTabs()
  updateAuthUi()
  setStatus(ta('routeAddedSaveToKeep'))
}

async function handleDeleteRoute() {
  if (state.routes.length <= 1) { setStatus(ta('cannotDeleteLastRoute'), true); return }

  const r = state.routes[state.currentRouteIndex]
  if (!confirm(ta('routeDeleteConfirm', { name: r.display_name }))) return

  try {
    if (r.id) await deleteRoute(r.id)
    state.routes.splice(state.currentRouteIndex, 1)
    // re-index order_index client-side
    state.routes.forEach((x, i) => { x.order_index = i })
    state.currentRouteIndex = Math.min(state.currentRouteIndex, state.routes.length - 1)
    state.selectedRowIndex = 0
    const cur = state.routes[state.currentRouteIndex]
    els.routeDisplayNameInput.value = cur.display_name
    syncFormFromRoute(cur.route)
    renderRouteTabs()
    updateAuthUi()
    setStatus(ta('routeDeleted', { name: r.display_name }))
  } catch (err) {
    setStatus(err.message, true)
  }
}

async function handleResetDefaults() {
  if (!state.user) { setStatus(ta('resetSignInFirst'), true); return }
  const r = state.routes[state.currentRouteIndex]
  r.route = DEFAULT_ROUTE.slice(0, DEFAULT_ROUTE_LENGTH).map((p) => ({ ...p }))
  syncFormFromRoute(r.route)
  setStatus(ta('defaultsRestored'))
}

// ─── Event bindings ──────────────────────────────────────────────────────────

els.languageSelect.addEventListener('change', (e) => { setLanguage(e.target.value); window.location.reload() })
els.signIn.addEventListener('click', handleSignIn)
els.signUp.addEventListener('click', handleSignUp)
els.signInGitHub.addEventListener('click', handleSignInGitHub)
els.signOut.addEventListener('click', handleSignOut)

els.gameSelect.addEventListener('change', () => {
  state.currentSlug = els.gameSelect.value || null
  loadGameIntoEditor(els.gameSelect.value)
})
els.newGameBtn.addEventListener('click', () => els.newGameForm.classList.toggle('hidden'))
els.cancelNewGameBtn.addEventListener('click', () => els.newGameForm.classList.add('hidden'))
els.createGameBtn.addEventListener('click', handleCreateGame)
els.deleteGameBtn.addEventListener('click', handleDeleteGame)
els.saveDisplayName.addEventListener('click', handleSaveDisplayName)

els.routeLocationCount.addEventListener('change', handleLocationCountChange)
els.saveRouteBtn.addEventListener('click', handleSaveRoute)
els.addRouteBtn.addEventListener('click', handleAddRoute)
els.deleteRouteBtn.addEventListener('click', handleDeleteRoute)
els.resetDefaultsBtn.addEventListener('click', handleResetDefaults)

// ─── Boot ─────────────────────────────────────────────────────────────────────

setupMap()
bindRowsDelegate()
syncFormFromRoute(defaultConfig().route)
updateAuthUi()

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshUserState().catch((err) => {
      state.authStatusMessage = ta('authSyncFailed', { message: err.message })
      updateAuthUi()
    })
  })
}

refreshUserState().catch((err) => {
  state.authStatusMessage = ta('startupError', { message: err.message })
  updateAuthUi()
})
