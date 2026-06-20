/**
 * Create section helpers for translations, shared UI utilities, auth UI, and game selector state.
 * @param {object} deps
 * @param {object} deps.els
 * @param {object} deps.state
 * @param {Function} deps.ta
 * @param {string} deps.language
 * @param {number} deps.MAX_ROUTE_LOCATIONS
 * @param {object} deps.DEFAULT_GAME_STYLES
 * @param {Array<{key:string,type:string}>} deps.STYLE_FIELDS
 * @param {boolean} deps.hasSupabaseConfig
 * @param {Function} deps.listGames
 * @returns {object}
 */
export function createCoreSections({
  els,
  state,
  ta,
  language,
  MAX_ROUTE_LOCATIONS,
  DEFAULT_GAME_STYLES,
  STYLE_FIELDS,
  hasSupabaseConfig,
  listGames,
}) {
  /**
   * Apply localized labels and placeholders to the admin form.
   */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = ta(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = ta(el.dataset.i18nPlaceholder);
    });
    document.querySelector('#language-select').value = language;
    document.querySelector('#route-location-count').max = String(MAX_ROUTE_LOCATIONS);
  }

  /**
   * Show a route editor status message and toggle error styling.
   * @param {*} msg
   * @param {*} isError
   */
  function setStatus(msg, isError = false) {
    els.status.textContent = msg;
    els.status.classList.toggle('error', isError);
  }

  /**
   * Show a game management status message and toggle error styling.
   * @param {*} msg
   * @param {*} isError
   */
  function setGameStatus(msg, isError = false) {
    els.gameStatus.textContent = msg;
    els.gameStatus.classList.toggle('error', isError);
  }

  /**
   * Normalize free-form slug input into a URL-safe slug.
   * @param {*} raw
   */
  function sanitizeSlugInput(raw) {
    return raw.trim().toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Convert a euro amount to integer cents.
   * @param {*} value
   */
  function eurosToCents(value) {
    return Math.max(0, Math.round((Number(value) || 0) * 100));
  }

  /**
   * Convert integer cents to a euro string with two decimals.
   * @param {*} cents
   */
  function centsToEuros(cents) {
    return (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
  }

  /**
   * Toggle payment price controls based on the payment checkbox state.
   */
  function syncPaymentControls() {
    const on = Boolean(els.requiresPayment.checked);
    els.priceWrap.classList.toggle('hidden', !on);
  }

  /**
   * Check whether a value is a valid 3- or 6-digit hex color.
   * @param {*} value
   */
  function validHexColor(value) {
    return /^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(String(value || '').trim());
  }

  /**
   * Resolve a style field value with fallback and color validation.
   * @param {*} field
   * @param {*} styles
   */
  function styleInputValue(field, styles) {
    const value = styles[field.key] ?? DEFAULT_GAME_STYLES[field.key];
    if (field.type !== 'color') return String(value ?? '');
    return validHexColor(value) ? value : DEFAULT_GAME_STYLES[field.key];
  }

  /**
   * Apply editable style values to the preview CSS variables.
   * @param {*} styles
   */
  function applyStylesToPreview(styles) {
    if (!els.gameStylePreview) return;

    const previewMap = {
      primary_color: '--preview-primary-color',
      primary_text_color: '--preview-primary-text-color',
      text_color: '--preview-text-color',
      card_bg_color: '--preview-card-bg-color',
      card_border_color: '--preview-card-border-color',
      accent_bg_blue: '--preview-accent-bg-blue',
      accent_border_blue: '--preview-accent-border-blue',
      accent_text_blue: '--preview-accent-text-blue',
      font_family: '--preview-font-family',
      border_radius_sm: '--preview-border-radius-sm',
      border_radius_lg: '--preview-border-radius-lg',
    };

    for (const [key, cssVar] of Object.entries(previewMap)) {
      const value = styles[key] ?? DEFAULT_GAME_STYLES[key];
      if (!value) continue;
      els.gameStylePreview.style.setProperty(cssVar, String(value));
    }
  }

  /**
   * Render style editor inputs from style field definitions.
   * @param {*} styles
   */
  function renderGameStyleEditor(styles = DEFAULT_GAME_STYLES) {
    if (!els.gameStyleFields) return;

    const fields = STYLE_FIELDS.map((field) => {
      const label = document.createElement('label');
      label.textContent = field.label;

      const input = document.createElement('input');
      input.type = field.type;
      input.dataset.styleField = field.key;
      input.value = styleInputValue(field, styles);
      if (field.type !== 'color') input.placeholder = DEFAULT_GAME_STYLES[field.key];

      label.appendChild(input);
      return label;
    });

    els.gameStyleFields.replaceChildren(...fields);
    applyStylesToPreview(styles);
  }

  /**
   * Collect style values from editor inputs into a payload object.
   */
  function collectStylesFromInputs() {
    const payload = {};
    for (const field of STYLE_FIELDS) {
      const input = els.gameStyleFields.querySelector(`[data-style-field="${field.key}"]`);
      if (!input) continue;
      const value = String(input.value || '').trim();
      payload[field.key] = value || DEFAULT_GAME_STYLES[field.key];
    }
    return payload;
  }

  /**
   * Refresh the style preview when style inputs change.
   */
  function handleGameStylesPreviewInput() {
    applyStylesToPreview(collectStylesFromInputs());
  }

  /**
   * Refresh authentication and permission-driven button states.
   */
  function updateAuthUi() {
    els.authUser.textContent = state.user
      ? ta('signedInAs', { email: state.user.email })
      : ta('notSignedIn');
    els.authStatus.textContent = state.authStatusMessage;

    const canEdit = Boolean(state.user && hasSupabaseConfig);
    els.newGameBtn.disabled = !canEdit;
    els.deleteGameBtn.disabled = !canEdit || !state.currentSlug;
    els.saveRouteBtn.disabled = !canEdit;
    els.addRouteBtn.disabled = !canEdit;
    els.resetDefaultsBtn.disabled = !canEdit;
    els.deleteRouteBtn.disabled = !canEdit || state.routes.length <= 1;
    els.saveDisplayName.disabled = !canEdit;
    els.saveGameStylesBtn.disabled = !canEdit || !state.currentGameId;
    els.resetGameStylesBtn.disabled = !canEdit || !state.currentGameId;
  }

  /**
   * Render the game selector options from the loaded game list.
   */
  function populateGameSelect() {
    const cur = els.gameSelect.value;
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = ta('selectGameOption');
    els.gameSelect.replaceChildren(defaultOpt);
    for (const g of state.games) {
      const opt = document.createElement('option');
      opt.value = g.slug;
      opt.textContent = `${g.display_name} (/${g.slug})`;
      if (g.slug === cur || g.slug === state.currentSlug) opt.selected = true;
      els.gameSelect.appendChild(opt);
    }
  }

  /**
   * Load available games and refresh the selector UI.
   */
  async function refreshGameList() {
    try {
      state.games = await listGames();
      populateGameSelect();
    } catch (err) {
      setGameStatus(ta('loadGamesFailed', { message: err.message }), true);
    }
  }

  return {
    applyTranslations,
    setStatus,
    setGameStatus,
    sanitizeSlugInput,
    eurosToCents,
    centsToEuros,
    syncPaymentControls,
    renderGameStyleEditor,
    collectStylesFromInputs,
    handleGameStylesPreviewInput,
    updateAuthUi,
    populateGameSelect,
    refreshGameList,
  };
}


