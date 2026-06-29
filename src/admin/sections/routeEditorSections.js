import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import {
  clampLocationCount,
  normalizeRouteLetter,
  resizeRoutePoints,
  validateCoordinateRange,
} from './routeEditorCore.js';

/**
 * Create route editor, image/logo upload, map, and game loader section handlers.
 * @param {object} deps
 * @param {object} deps.els
 * @param {object} deps.state
 * @param {Function} deps.ta
 * @param {number} deps.MAX_ROUTE_LOCATIONS
 * @param {Function} deps.blankRoute
 * @param {Function} deps.defaultConfig
 * @param {Array} deps.DEFAULT_ROUTE
 * @param {object} deps.DEFAULT_GAME_STYLES
 * @param {Function} deps.uploadLocationImage
 * @param {Function} deps.deleteLocationImage
 * @param {Function} deps.uploadGameLogo
 * @param {Function} deps.saveGameLogo
 * @param {Function} deps.fetchGameWithRoutes
 * @param {Function} deps.fetchGameStyles
 * @param {Function} deps.setStatus
 * @param {Function} deps.setGameStatus
 * @param {Function} deps.updateAuthUi
 * @param {Function} deps.renderGameStyleEditor
 * @param {Function} deps.syncPaymentControls
 * @param {Function} deps.centsToEuros
 * @returns {object}
 */
export function createRouteEditorSections({
  els,
  state,
  ta,
  MAX_ROUTE_LOCATIONS,
  blankRoute,
  defaultConfig,
  DEFAULT_ROUTE,
  DEFAULT_GAME_STYLES,
  uploadLocationImage,
  deleteLocationImage,
  uploadGameLogo,
  saveGameLogo,
  fetchGameWithRoutes,
  fetchGameStyles,
  setStatus,
  setGameStatus,
  updateAuthUi,
  renderGameStyleEditor,
  syncPaymentControls,
  centsToEuros,
}) {
  let loadRequestId = 0;

  // --- Route Tabs ---

  /**
   * Render route tab buttons for the current game routes.
   */
  function renderRouteTabs() {
    els.routeTabBar.replaceChildren();
    state.routes.forEach((r, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'route-tab' + (i === state.currentRouteIndex ? ' active' : '');
      btn.dataset.routeIdx = String(i);
      btn.textContent = r.display_name;
      btn.addEventListener('click', () => switchToRoute(i));
      els.routeTabBar.appendChild(btn);
    });
  }

  /**
   * Persist current route form inputs back into route state.
   */
  function flushCurrentRouteToState() {
    if (!state.routes.length) return;
    const r = state.routes[state.currentRouteIndex];
    r.display_name = els.routeDisplayNameInput.value.trim() || r.display_name;
    r.route = collectRouteFromInputs();
  }

  /**
   * Switch active route tab and sync form values for that route.
   * @param {number} index
   */
  function switchToRoute(index) {
    flushCurrentRouteToState();
    state.currentRouteIndex = index;
    state.selectedRowIndex = 0;
    const r = state.routes[index];
    els.routeDisplayNameInput.value = r.display_name;
    syncFormFromRoute(r.route);
    renderRouteTabs();
    updateAuthUi();
  }

  // --- Location Editor ---

  /**
   * Create the DOM for a single location row in the route editor.
   * @param {object} point
   * @param {number} index
   */
  function createRowElement(point, index) {
    const hasImage = Boolean(point.image_url);

    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.rowIndex = String(index);

    const rowTitle = document.createElement('div');
    rowTitle.className = 'row-title';
    rowTitle.textContent = `${index + 1}. ${ta('rowLocation')}`;
    row.appendChild(rowTitle);

    const rowFields = document.createElement('div');
    rowFields.className = 'row-fields';

    /**
     * Append a labeled input to a row field group.
     * @param {string} labelText
     * @param {string} type
     * @param {string} fieldName
     * @param {*} value
     * @param {object} extra
     */
    function addLabeledInput(labelText, type, fieldName, value, extra = {}) {
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = type;
      input.dataset.field = fieldName;
      input.dataset.rowIndex = String(index);
      input.value = String(value);
      if (extra.placeholder !== undefined) input.placeholder = extra.placeholder;
      if (extra.maxLength !== undefined) input.maxLength = extra.maxLength;
      if (extra.step !== undefined) input.step = extra.step;
      if (extra.min !== undefined) input.min = String(extra.min);
      label.appendChild(input);
      rowFields.appendChild(label);
    }

    addLabeledInput(ta('name'), 'text', 'name', point.name);
    addLabeledInput(ta('letterAZ'), 'text', 'letter', point.letter, { maxLength: 1 });
    addLabeledInput(ta('latitude'), 'number', 'lat', point.lat, { step: 'any' });
    addLabeledInput(ta('longitude'), 'number', 'lng', point.lng, { step: 'any' });
    addLabeledInput(ta('description'), 'text', 'description', point.description ?? '', { placeholder: ta('descriptionPlaceholder') });
    addLabeledInput(ta('question'), 'text', 'question', point.question ?? '', { placeholder: ta('questionPlaceholder') });
    addLabeledInput(ta('answer'), 'text', 'answer', point.answer ?? '', { placeholder: ta('answerPlaceholder') });
    addLabeledInput(ta('maxAttempts'), 'number', 'max_attempts', point.max_attempts ?? 0, { min: 0, step: '1' });

    const imageUrlInput = document.createElement('input');
    imageUrlInput.type = 'hidden';
    imageUrlInput.dataset.field = 'image_url';
    imageUrlInput.dataset.rowIndex = String(index);
    imageUrlInput.value = point.image_url ?? '';
    rowFields.appendChild(imageUrlInput);

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.dataset.pickRow = String(index);
    pickBtn.className = 'pick-button';
    pickBtn.textContent = ta('pickFromMap');
    rowFields.appendChild(pickBtn);

    row.appendChild(rowFields);

    const imageArea = document.createElement('div');
    imageArea.className = 'row-image-area';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'image-preview-wrap' + (hasImage ? '' : ' hidden');
    previewWrap.dataset.preview = String(index);

    const previewImg = document.createElement('img');
    previewImg.className = 'location-image-preview';
    previewImg.src = point.image_url ?? '';
    previewImg.alt = '';
    previewWrap.appendChild(previewImg);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ghost danger remove-image-btn';
    removeBtn.dataset.removeImage = String(index);
    removeBtn.textContent = ta('removeImage');
    previewWrap.appendChild(removeBtn);

    imageArea.appendChild(previewWrap);

    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'upload-label' + (hasImage ? ' hidden' : '');
    uploadLabel.dataset.uploadLabel = String(index);

    const uploadBtnFace = document.createElement('span');
    uploadBtnFace.className = 'upload-btn-face';
    uploadBtnFace.textContent = ta('uploadImage');
    uploadLabel.appendChild(uploadBtnFace);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'image-file-input';
    fileInput.dataset.uploadRow = String(index);
    fileInput.style.display = 'none';
    uploadLabel.appendChild(fileInput);

    imageArea.appendChild(uploadLabel);

    const uploadStatus = document.createElement('p');
    uploadStatus.className = 'upload-status small';
    uploadStatus.dataset.uploadStatus = String(index);
    imageArea.appendChild(uploadStatus);

    row.appendChild(imageArea);
    return row;
  }

  /**
   * Resolve all input elements for a specific route row index.
   * @param {number} index
   */
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
    };
  }

  /**
   * Validate latitude and longitude ranges for a route row.
   * @param {number} lat
   * @param {number} lng
   * @param {number} index
   */
  function validateCoordinate(lat, lng, index) {
    validateCoordinateRange(lat, lng, index, ta);
  }

  /**
   * Normalize and validate the location letter for a route row.
   * @param {string} letter
   * @param {number} index
   */
  function validateLetter(letter, index) {
    return normalizeRouteLetter(letter, index, ta);
  }

  /**
   * Return the number of editable location rows currently rendered.
   */
  function currentLocationCount() {
    return els.rows.querySelectorAll('.row').length;
  }

  /**
   * Build a route payload from all location row input values.
   */
  function collectRouteFromInputs() {
    return Array.from({ length: currentLocationCount() }).map((_, index) => {
      const ri = getRowInputs(index);
      const name = ri.name.value.trim() || `${ta('rowLocation')} ${index + 1}`;
      const letter = validateLetter(ri.letter.value, index);
      const lat = Number(ri.lat.value);
      const lng = Number(ri.lng.value);
      validateCoordinate(lat, lng, index);
      return {
        name, lat, lng, letter,
        image_url: ri.image_url?.value ?? '',
        description: ri.description?.value.trim() ?? '',
        question: ri.question?.value.trim() ?? '',
        answer: ri.answer?.value.trim() ?? '',
        max_attempts: Math.max(0, Math.floor(Number(ri.max_attempts?.value) || 0)),
      };
    });
  }

  /**
   * Convert latitude and longitude to the map projection coordinate.
   * @param {number} lat
   * @param {number} lng
   */
  function toMapCoordinate(lat, lng) {
    return fromLonLat([lng, lat]);
  }

  /**
   * Create or move the map marker to the provided coordinates.
   * @param {number} lat
   * @param {number} lng
   */
  function ensureMarker(lat, lng) {
    if (!state.map || !state.markerLayer) return;
    const coordinate = toMapCoordinate(lat, lng);
    if (!state.marker) {
      state.marker = new Feature({ geometry: new Point(coordinate) });
      state.markerLayer.getSource().addFeature(state.marker);
      return;
    }
    state.marker.getGeometry().setCoordinates(coordinate);
  }

  /**
   * Set the active route row and center the map on its coordinates.
   * @param {number} index
   */
  function setSelectedRow(index) {
    state.selectedRowIndex = index;
    document.querySelectorAll('.row').forEach((row) => {
      row.classList.toggle('active', Number(row.dataset.rowIndex) === index);
    });
    if (state.map && state.lastPickedMapLocation) {
      const { lat, lng, zoom } = state.lastPickedMapLocation;
      state.map.getView().setCenter(toMapCoordinate(lat, lng));
      if (Number.isFinite(zoom)) {
        state.map.getView().setZoom(zoom);
      }
      ensureMarker(lat, lng);
      return;
    }

    const ri = getRowInputs(index);
    const lat = Number(ri.lat.value);
    const lng = Number(ri.lng.value);
    if (Number.isFinite(lat) && Number.isFinite(lng) && state.map) {
      state.map.getView().setCenter(toMapCoordinate(lat, lng));
      state.map.getView().setZoom(16);
      ensureMarker(lat, lng);
    }
  }

  /**
   * Render route points into the form and wire row interactions.
   * @param {Array} route
   */
  function syncFormFromRoute(route) {
    els.rows.replaceChildren(...route.map((point, i) => createRowElement(point, i)));
    els.routeLocationCount.value = route.length;
    document.querySelectorAll('[data-pick-row]').forEach((btn) => {
      btn.addEventListener('click', () => setSelectedRow(Number(btn.dataset.pickRow)));
    });
    document.querySelectorAll('.row input:not([type=file])').forEach((input) => {
      input.addEventListener('focus', () => {
        if (input.dataset.rowIndex !== undefined) setSelectedRow(Number(input.dataset.rowIndex));
      });
    });
    setSelectedRow(Math.min(state.selectedRowIndex, route.length - 1));
  }

  // --- Image Upload ---

  /**
   * Show upload progress or error text for a location image row.
   * @param {number} index
   * @param {string} msg
   * @param {boolean} isError
   */
  function setUploadStatus(index, msg, isError = false) {
    const el = document.querySelector(`[data-upload-status="${index}"]`);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('error', isError);
  }

  /**
   * Upload a location image and update row preview state.
   * @param {HTMLInputElement} fileInput
   * @param {number} rowIndex
   */
  async function handleImageUpload(fileInput, rowIndex) {
    const file = fileInput.files[0];
    if (!file) return;

    setUploadStatus(rowIndex, ta('uploading'));
    try {
      const r = state.routes[state.currentRouteIndex];
      const url = await uploadLocationImage(file, state.currentSlug, r.id ?? 'new', rowIndex);

      const hiddenInput = document.querySelector(`input[data-field="image_url"][data-row-index="${rowIndex}"]`);
      if (hiddenInput) hiddenInput.value = url;

      const preview = document.querySelector(`[data-preview="${rowIndex}"]`);
      const label = document.querySelector(`[data-upload-label="${rowIndex}"]`);
      if (preview) { preview.querySelector('img').src = url; preview.classList.remove('hidden'); }
      if (label) label.classList.add('hidden');
      setUploadStatus(rowIndex, ta('uploadDone'));
    } catch (err) {
      setUploadStatus(rowIndex, ta('uploadFailed', { message: err.message }), true);
    }
    fileInput.value = '';
  }

  /**
   * Remove a location image and reset its row preview state.
   * @param {number} rowIndex
   */
  async function handleImageRemove(rowIndex) {
    const hiddenInput = document.querySelector(`input[data-field="image_url"][data-row-index="${rowIndex}"]`);
    const oldUrl = hiddenInput?.value ?? '';
    if (oldUrl) { try { await deleteLocationImage(oldUrl); } catch { /* best-effort */ } }
    if (hiddenInput) hiddenInput.value = '';
    const preview = document.querySelector(`[data-preview="${rowIndex}"]`);
    const label = document.querySelector(`[data-upload-label="${rowIndex}"]`);
    if (preview) { preview.querySelector('img').src = ''; preview.classList.add('hidden'); }
    if (label) label.classList.remove('hidden');
    setUploadStatus(rowIndex, '');
  }

  /**
   * Attach delegated row listeners for image upload and remove actions.
   */
  function bindRowsDelegate() {
    els.rows.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-image]');
      if (removeBtn) handleImageRemove(Number(removeBtn.dataset.removeImage));
    });
    els.rows.addEventListener('change', (e) => {
      const fileInput = e.target.closest('.image-file-input');
      if (fileInput) handleImageUpload(fileInput, Number(fileInput.dataset.uploadRow));
    });
  }

  // --- Logo Upload ---

  /**
   * Toggle game logo preview and upload controls for the current logo.
   * @param {string} url
   */
  function setLogoPreview(url) {
    if (url) {
      els.logoPreviewImg.src = url;
      els.logoPreviewWrap.classList.remove('hidden');
      els.logoUploadLabel.classList.add('hidden');
    } else {
      els.logoPreviewImg.src = '';
      els.logoPreviewWrap.classList.add('hidden');
      els.logoUploadLabel.classList.remove('hidden');
    }
  }

  /**
   * Upload a game logo and persist the saved logo URL.
   */
  async function handleLogoUpload() {
    const file = els.logoFileInput.files[0];
    if (!file || !state.currentSlug) return;
    els.logoUploadStatus.textContent = ta('uploading');
    els.logoUploadStatus.classList.remove('error');
    try {
      const url = await uploadGameLogo(file, state.currentSlug);
      await saveGameLogo(state.currentSlug, url);
      setLogoPreview(url);
      els.logoUploadStatus.textContent = ta('uploadDone');
    } catch (err) {
      els.logoUploadStatus.textContent = ta('uploadFailed', { message: err.message });
      els.logoUploadStatus.classList.add('error');
    }
    els.logoFileInput.value = '';
  }

  /**
   * Clear the game logo for the current game.
   */
  async function handleLogoRemove() {
    if (!state.currentSlug) return;
    try {
      await saveGameLogo(state.currentSlug, '');
      setLogoPreview('');
      els.logoUploadStatus.textContent = '';
    } catch (err) {
      els.logoUploadStatus.textContent = ta('uploadFailed', { message: err.message });
      els.logoUploadStatus.classList.add('error');
    }
  }

  /**
   * Resize the route location list while preserving current edits.
   */
  function handleLocationCountChange() {
    const raw = Number(els.routeLocationCount.value);
    const newCount = clampLocationCount(raw, MAX_ROUTE_LOCATIONS);
    els.routeLocationCount.value = newCount;

    let current;
    try { current = collectRouteFromInputs(); } catch { current = state.routes[state.currentRouteIndex]?.route ?? []; }

    const next = resizeRoutePoints(current, newCount, blankRoute);
    if (next === current) return;
    syncFormFromRoute(next);
  }

  // --- Map ---

  /**
   * Initialize the OpenLayers map and click-to-pick behavior.
   */
  function setupMap() {
    if (!document.querySelector('#map')) return;
    const first = defaultConfig().route[0];
    state.markerLayer = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: '#2f7dff' }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        }),
      }),
    });

    state.map = new Map({
      target: 'map',
      layers: [new TileLayer({ source: new OSM() }), state.markerLayer],
      view: new View({ center: toMapCoordinate(first.lat, first.lng), zoom: 14 }),
    });

    state.map.on('click', (event) => {
      const [lng, lat] = toLonLat(event.coordinate);
      const ri = getRowInputs(state.selectedRowIndex);
      ri.lat.value = lat.toFixed(6);
      ri.lng.value = lng.toFixed(6);
      state.lastPickedMapLocation = {
        lat,
        lng,
        zoom: Number(state.map.getView().getZoom()) || null,
      };
      ensureMarker(lat, lng);
      setStatus(ta('pickMapUpdated', { row: state.selectedRowIndex + 1 }));
    });
  }

  // --- Load Game Into Editor ---

  /**
   * Load a game and its routes into the editor state and UI.
   * @param {string|null} slug
   */
  async function loadGameIntoEditor(slug) {
    const requestId = ++loadRequestId;

    if (!slug) {
      state.currentSlug = null;
      state.currentGameId = null;
      state.currentRequiresPayment = false;
      state.currentPriceInCents = 0;
      state.currentSupportsOffline = false;
      state.currentFinalQuestion = '';
      state.currentFinalAnswer = '';
      state.currentGameStyles = { ...DEFAULT_GAME_STYLES };
      state.routes = [];
      state.lastPickedMapLocation = null;
      state.editorDirty = false;
      els.editorSection.classList.add('hidden');
      renderGameStyleEditor(DEFAULT_GAME_STYLES);
      if (els.finalQuestion) els.finalQuestion.value = '';
      if (els.finalAnswer) els.finalAnswer.value = '';
      updateAuthUi();
      return;
    }

    setGameStatus(ta('loadingGame'));
    if (els.finalQuestion) els.finalQuestion.value = '';
    if (els.finalAnswer) els.finalAnswer.value = '';
    try {
      const game = await fetchGameWithRoutes(slug);
      if (requestId !== loadRequestId || state.currentSlug !== slug) return;
      if (!game) { setGameStatus(ta('gameNotFoundAdmin', { slug }), true); return; }

      state.currentSlug = slug;
      state.currentGameId = game.id;
      state.routes = game.routes.length
        ? game.routes
        : [{ id: null, order_index: 0, display_name: 'Route 1', route: [...DEFAULT_ROUTE] }];
       state.currentRouteIndex = 0;
       state.currentRequiresPayment = Boolean(game.requires_payment);
       state.currentPriceInCents = Number(game.price_in_cents) || 0;
       state.currentSupportsOffline = Boolean(game.supports_offline);
       state.currentFinalQuestion = String(game.final_question ?? '');
       state.currentFinalAnswer = String(game.final_answer ?? '');
        state.lastPickedMapLocation = null;
       const savedStyles = await fetchGameStyles(game.id);
       state.currentGameStyles = { ...DEFAULT_GAME_STYLES, ...(savedStyles ?? {}) };

       els.editDisplayName.value = game.display_name;
       els.requiresPayment.checked = state.currentRequiresPayment;
       els.priceEuros.value = centsToEuros(state.currentPriceInCents);
       els.supportsOffline.checked = state.currentSupportsOffline;
       if (els.finalQuestion) els.finalQuestion.value = state.currentFinalQuestion;
       if (els.finalAnswer) els.finalAnswer.value = state.currentFinalAnswer;
      syncPaymentControls();
      setLogoPreview(game.logo_url ?? '');
      renderGameStyleEditor(state.currentGameStyles);
      els.logoUploadStatus.textContent = '';
      els.routeDisplayNameInput.value = state.routes[0].display_name;
      syncFormFromRoute(state.routes[0].route);
      renderRouteTabs();

      if (state.map && state.routes[0].route[0]) {
        const firstPoint = state.routes[0].route[0];
        state.map.getView().setCenter(toMapCoordinate(firstPoint.lat, firstPoint.lng));
        state.map.getView().setZoom(14);
      }

      state.editorDirty = false;
      els.editorSection.classList.remove('hidden');
      setGameStatus('');
    } catch (err) {
      setGameStatus(ta('loadGamesFailed', { message: err.message }), true);
    }
    updateAuthUi();
  }

  return {
    renderRouteTabs,
    flushCurrentRouteToState,
    switchToRoute,
    collectRouteFromInputs,
    syncFormFromRoute,
    setSelectedRow,
    setLogoPreview,
    handleLogoUpload,
    handleLogoRemove,
    bindRowsDelegate,
    handleLocationCountChange,
    setupMap,
    loadGameIntoEditor,
  };
}

