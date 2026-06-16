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
  saveGameLogo,
  saveRoute,
  uploadGameLogo,
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
  currentRequiresPayment: false,
  currentPriceInCents: 0,
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

// ─── Translations ────────────────────────────────────────────────────────────

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = ta(el.dataset.i18n)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = ta(el.dataset.i18nPlaceholder)
  })
  document.querySelector('#language-select').value = language
  document.querySelector('#route-location-count').max = String(MAX_ROUTE_LOCATIONS)
}

applyTranslations()

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
  requiresPayment: document.querySelector('#requires-payment'),
  priceWrap: document.querySelector('#price-wrap'),
  priceEuros: document.querySelector('#price-euros'),
  logoPreviewWrap: document.querySelector('#logo-preview-wrap'),
  logoPreviewImg: document.querySelector('#logo-preview-img'),
  removeLogoBtn: document.querySelector('#remove-logo-btn'),
  logoUploadLabel: document.querySelector('#logo-upload-label'),
  logoFileInput: document.querySelector('#logo-file-input'),
  logoUploadStatus: document.querySelector('#logo-upload-status'),
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

const backToGameLink = document.querySelector('#back-to-game')
if (backToGameLink) {
  backToGameLink.addEventListener('click', (e) => {
    e.preventDefault()
    window.location.replace(`/?refresh=${Date.now()}`)
  })
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

function eurosToCents(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100))
}

function centsToEuros(cents) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2)
}

function syncPaymentControls() {
  const on = Boolean(els.requiresPayment.checked)
  els.priceWrap.classList.toggle('hidden', !on)
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
  const defaultOpt = document.createElement('option')
  defaultOpt.value = ''
  defaultOpt.textContent = ta('selectGameOption')
  els.gameSelect.replaceChildren(defaultOpt)
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
  els.routeTabBar.replaceChildren()
  state.routes.forEach((r, i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'route-tab' + (i === state.currentRouteIndex ? ' active' : '')
    btn.dataset.routeIdx = String(i)
    btn.textContent = r.display_name
    btn.addEventListener('click', () => switchToRoute(i))
    els.routeTabBar.appendChild(btn)
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

function createRowElement(point, index) {
  const hasImage = Boolean(point.image_url)

  const row = document.createElement('div')
  row.className = 'row'
  row.dataset.rowIndex = String(index)

  const rowTitle = document.createElement('div')
  rowTitle.className = 'row-title'
  rowTitle.textContent = `${index + 1}. ${ta('rowLocation')}`
  row.appendChild(rowTitle)

  const rowFields = document.createElement('div')
  rowFields.className = 'row-fields'

  function addLabeledInput(labelText, type, fieldName, value, extra = {}) {
    const label = document.createElement('label')
    label.textContent = labelText
    const input = document.createElement('input')
    input.type = type
    input.dataset.field = fieldName
    input.dataset.rowIndex = String(index)
    input.value = String(value)
    if (extra.placeholder !== undefined) input.placeholder = extra.placeholder
    if (extra.maxLength !== undefined) input.maxLength = extra.maxLength
    if (extra.step !== undefined) input.step = extra.step
    if (extra.min !== undefined) input.min = String(extra.min)
    label.appendChild(input)
    rowFields.appendChild(label)
  }

  addLabeledInput(ta('name'), 'text', 'name', point.name)
  addLabeledInput(ta('letterAZ'), 'text', 'letter', point.letter, { maxLength: 1 })
  addLabeledInput(ta('latitude'), 'number', 'lat', point.lat, { step: 'any' })
  addLabeledInput(ta('longitude'), 'number', 'lng', point.lng, { step: 'any' })
  addLabeledInput(ta('description'), 'text', 'description', point.description ?? '', { placeholder: ta('descriptionPlaceholder') })
  addLabeledInput(ta('question'), 'text', 'question', point.question ?? '', { placeholder: ta('questionPlaceholder') })
  addLabeledInput(ta('answer'), 'text', 'answer', point.answer ?? '', { placeholder: ta('answerPlaceholder') })
  addLabeledInput(ta('maxAttempts'), 'number', 'max_attempts', point.max_attempts ?? 0, { min: 0, step: '1' })

  const imageUrlInput = document.createElement('input')
  imageUrlInput.type = 'hidden'
  imageUrlInput.dataset.field = 'image_url'
  imageUrlInput.dataset.rowIndex = String(index)
  imageUrlInput.value = point.image_url ?? ''
  rowFields.appendChild(imageUrlInput)

  const pickBtn = document.createElement('button')
  pickBtn.type = 'button'
  pickBtn.dataset.pickRow = String(index)
  pickBtn.className = 'pick-button'
  pickBtn.textContent = ta('pickFromMap')
  rowFields.appendChild(pickBtn)

  row.appendChild(rowFields)

  // Image area
  const imageArea = document.createElement('div')
  imageArea.className = 'row-image-area'

  const previewWrap = document.createElement('div')
  previewWrap.className = 'image-preview-wrap' + (hasImage ? '' : ' hidden')
  previewWrap.dataset.preview = String(index)

  const previewImg = document.createElement('img')
  previewImg.className = 'location-image-preview'
  previewImg.src = point.image_url ?? ''
  previewImg.alt = ''
  previewWrap.appendChild(previewImg)

  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'ghost danger remove-image-btn'
  removeBtn.dataset.removeImage = String(index)
  removeBtn.textContent = ta('removeImage')
  previewWrap.appendChild(removeBtn)

  imageArea.appendChild(previewWrap)

  const uploadLabel = document.createElement('label')
  uploadLabel.className = 'upload-label' + (hasImage ? ' hidden' : '')
  uploadLabel.dataset.uploadLabel = String(index)

  const uploadBtnFace = document.createElement('span')
  uploadBtnFace.className = 'upload-btn-face'
  uploadBtnFace.textContent = ta('uploadImage')
  uploadLabel.appendChild(uploadBtnFace)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.className = 'image-file-input'
  fileInput.dataset.uploadRow = String(index)
  fileInput.style.display = 'none'
  uploadLabel.appendChild(fileInput)

  imageArea.appendChild(uploadLabel)

  const uploadStatus = document.createElement('p')
  uploadStatus.className = 'upload-status small'
  uploadStatus.dataset.uploadStatus = String(index)
  imageArea.appendChild(uploadStatus)

  row.appendChild(imageArea)

  return row
}

function getRowInputs(index) {
  return {
    name: document.querySelector(`input[data-field="name"][data-row-index="${index}"]`),
    letter: document.querySelector(`input[data-field="letter"][data-row-index="${index}"]`),
    lat: document.querySelector(`input[data-field="lat"][data-row-index="${index}"]`),
    lng: document.querySelector(`input[data-field="lng"][data-row-index="${index}"]`),
    image_url: document.querySelector(`input[data-field="image_url"][data-row-index="${index}"]`),
    description: document.querySelector(`input[data-field="description"][data-row-index="${index}"]`),
    question: document.querySelector(`input[data-field="question"][data-row-index="${index}"]`),
    answer: document.querySelector(`input[data-field="answer"][data-row-index="${index}"]`),
    max_attempts: document.querySelector(`input[data-field="max_attempts"][data-row-index="${index}"]`),
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
    return {
      name, lat, lng, letter,
      image_url: ri.image_url?.value ?? '',
      description: ri.description?.value.trim() ?? '',
      question: ri.question?.value.trim() ?? '',
      answer: ri.answer?.value.trim() ?? '',
      max_attempts: Math.max(0, Math.floor(Number(ri.max_attempts?.value) || 0)),
    }
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
  els.rows.replaceChildren(...route.map((point, i) => createRowElement(point, i)))
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

// ─── Logo upload ──────────────────────────────────────────────────────────────

function setLogoPreview(url) {
  if (url) {
    els.logoPreviewImg.src = url
    els.logoPreviewWrap.classList.remove('hidden')
    els.logoUploadLabel.classList.add('hidden')
  } else {
    els.logoPreviewImg.src = ''
    els.logoPreviewWrap.classList.add('hidden')
    els.logoUploadLabel.classList.remove('hidden')
  }
}

async function handleLogoUpload() {
  const file = els.logoFileInput.files[0]
  if (!file || !state.currentSlug) return

  els.logoUploadStatus.textContent = ta('uploading')
  els.logoUploadStatus.classList.remove('error')
  try {
    const url = await uploadGameLogo(file, state.currentSlug)
    await saveGameLogo(state.currentSlug, url)
    setLogoPreview(url)
    els.logoUploadStatus.textContent = ta('uploadDone')
  } catch (err) {
    els.logoUploadStatus.textContent = ta('uploadFailed', { message: err.message })
    els.logoUploadStatus.classList.add('error')
  }
  els.logoFileInput.value = ''
}

async function handleLogoRemove() {
  if (!state.currentSlug) return
  try {
    await saveGameLogo(state.currentSlug, '')
    setLogoPreview('')
    els.logoUploadStatus.textContent = ''
  } catch (err) {
    els.logoUploadStatus.textContent = ta('uploadFailed', { message: err.message })
    els.logoUploadStatus.classList.add('error')
  }
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
    state.currentRequiresPayment = false
    state.currentPriceInCents = 0
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
    state.currentRequiresPayment = Boolean(game.requires_payment)
    state.currentPriceInCents = Number(game.price_in_cents) || 0

    els.editDisplayName.value = game.display_name
    els.requiresPayment.checked = state.currentRequiresPayment
    els.priceEuros.value = centsToEuros(state.currentPriceInCents)
    syncPaymentControls()
    setLogoPreview(game.logo_url ?? '')
    els.logoUploadStatus.textContent = ''
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
    const requiresPayment = els.requiresPayment.checked
    const priceInCents = requiresPayment ? eurosToCents(els.priceEuros.value) : 0
    await saveGame(state.currentSlug, name, requiresPayment, priceInCents)
    state.currentRequiresPayment = requiresPayment
    state.currentPriceInCents = priceInCents
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
els.requiresPayment.addEventListener('change', () => {
  syncPaymentControls()
  if (!els.requiresPayment.checked) {
    els.priceEuros.value = '0.00'
  }
})

els.routeLocationCount.addEventListener('change', handleLocationCountChange)
els.saveRouteBtn.addEventListener('click', handleSaveRoute)
els.addRouteBtn.addEventListener('click', handleAddRoute)
els.deleteRouteBtn.addEventListener('click', handleDeleteRoute)
els.resetDefaultsBtn.addEventListener('click', handleResetDefaults)

// ─── Boot ─────────────────────────────────────────────────────────────────────

setupMap()
bindRowsDelegate()
els.logoFileInput.addEventListener('change', handleLogoUpload)
els.removeLogoBtn.addEventListener('click', handleLogoRemove)
syncFormFromRoute(defaultConfig().route)
syncPaymentControls()
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
