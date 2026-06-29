/**
 * Create auth handler and game/route CRUD action section handlers.
 * @param {object} deps
 * @param {object} deps.els
 * @param {object} deps.state
 * @param {Function} deps.ta
 * @param {Array} deps.DEFAULT_ROUTE
 * @param {number} deps.DEFAULT_ROUTE_LENGTH
 * @param {object} deps.DEFAULT_GAME_STYLES
 * @param {boolean} deps.hasSupabaseConfig
 * @param {Function} deps.getCurrentUser
 * @param {Function} deps.signInWithPassword
 * @param {Function} deps.signInWithGitHub
 * @param {Function} deps.signOutUser
 * @param {Function} deps.saveGame
 * @param {Function} deps.createRoute
 * @param {Function} deps.deleteGame
 * @param {Function} deps.saveGameStyles
 * @param {Function} deps.saveRoute
 * @param {Function} deps.deleteRoute
 * @param {Function} deps.setStatus
 * @param {Function} deps.setGameStatus
 * @param {Function} deps.sanitizeSlugInput
 * @param {Function} deps.eurosToCents
 * @param {Function} deps.updateAuthUi
 * @param {Function} deps.renderGameStyleEditor
 * @param {Function} deps.collectStylesFromInputs
 * @param {Function} deps.refreshGameList
 * @param {Function} deps.populateGameSelect
 * @param {Function} deps.renderRouteTabs
 * @param {Function} deps.flushCurrentRouteToState
 * @param {Function} deps.syncFormFromRoute
 * @param {Function} deps.collectRouteFromInputs
 * @param {Function} deps.loadGameIntoEditor
 * @returns {object}
 */
export function createActionsSections({
  els,
  state,
  ta,
  DEFAULT_ROUTE,
  DEFAULT_ROUTE_LENGTH,
  DEFAULT_GAME_STYLES,
  hasSupabaseConfig,
  getCurrentUser,
  signInWithPassword,
  signInWithGitHub,
  signOutUser,
  saveGame,
  createRoute,
  deleteGame,
  saveGameStyles,
  saveRoute,
  deleteRoute,
  setStatus,
  setGameStatus,
  sanitizeSlugInput,
  eurosToCents,
  updateAuthUi,
  renderGameStyleEditor,
  collectStylesFromInputs,
  refreshGameList,
  populateGameSelect,
  renderRouteTabs,
  flushCurrentRouteToState,
  syncFormFromRoute,
  collectRouteFromInputs,
  loadGameIntoEditor,
}) {
  // --- Auth Handlers ---

  /**
   * Read and validate auth credentials from the sign-in form.
   */
  function getCredentials() {
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;
    if (!email || !password) throw new Error(ta('emailPasswordRequired'));
    return { email, password };
  }

  /**
   * Refresh user session state and reload editable game data.
   */
  async function refreshUserState(options = {}) {
    const { reloadEditor = true } = options;
    if (!hasSupabaseConfig) { updateAuthUi(); return; }
    state.user = await getCurrentUser();
    updateAuthUi();
    await refreshGameList();
    if (reloadEditor && state.currentSlug && !state.editorDirty) {
      await loadGameIntoEditor(state.currentSlug);
    }
  }

  /**
   * Handle password sign-in and refresh admin state.
   */
  async function handleSignIn() {
    try {
      const { email, password } = getCredentials();
      await signInWithPassword(email, password);
      state.authStatusMessage = ta('signInSuccess');
      await refreshUserState();
    } catch (err) {
      state.authStatusMessage = ta('signInFailed', { message: err.message });
      updateAuthUi();
    }
  }

  /**
   * Handle password sign-up and refresh admin state.
   */
  async function handleSignUp() {
    state.authStatusMessage = ta('signUpFailed', {
      message: 'Sign-up is disabled. Ask an administrator to add your account.',
    });
    updateAuthUi();
  }

  /**
   * Start GitHub OAuth sign-in for the admin page.
   */
  async function handleSignInGitHub() {
    try {
      await signInWithGitHub(`${window.location.origin}/admin.html`);
      state.authStatusMessage = ta('redirectingGitHub');
      updateAuthUi();
    } catch (err) {
      state.authStatusMessage = ta('githubFailed', { message: err.message });
      updateAuthUi();
    }
  }

  /**
   * Handle sign-out and clear admin session-dependent state.
   */
  async function handleSignOut() {
    try {
      await signOutUser();
      state.authStatusMessage = ta('signOutSuccess');
      await refreshUserState();
    } catch (err) {
      state.authStatusMessage = ta('signOutFailed', { message: err.message });
      updateAuthUi();
    }
  }

  // --- Game CRUD ---

  /**
   * Create a new game, seed an initial route, and open it.
   */
  async function handleCreateGame() {
    const slug = sanitizeSlugInput(els.newGameSlug.value);
    const displayName = els.newGameDisplayName.value.trim();
    if (!slug) { setGameStatus(ta('slugRequired'), true); return; }
    if (!displayName) { setGameStatus(ta('displayNameRequired'), true); return; }
    try {
      const gameId = await saveGame(slug, displayName);
      await createRoute(gameId, 'Route 1', DEFAULT_ROUTE, 0);
      setGameStatus(ta('gameCreated', { name: displayName }));
      els.newGameForm.classList.add('hidden');
      els.newGameSlug.value = '';
      els.newGameDisplayName.value = '';
      await refreshGameList();
      els.gameSelect.value = slug;
      state.currentSlug = slug;
      await loadGameIntoEditor(slug);
    } catch (err) {
      setGameStatus(err.message, true);
    }
  }

  /**
   * Delete the selected game after confirmation.
   */
  async function handleDeleteGame() {
    if (!state.currentSlug) return;
    const game = state.games.find((g) => g.slug === state.currentSlug);
    if (!confirm(ta('gameDeleteConfirm', { name: game?.display_name ?? state.currentSlug }))) return;
    try {
      await deleteGame(state.currentSlug);
      setGameStatus(ta('gameDeleted', { name: game?.display_name ?? state.currentSlug }));
      state.currentSlug = null;
      state.currentGameId = null;
      state.routes = [];
      els.editorSection.classList.add('hidden');
      await refreshGameList();
      updateAuthUi();
    } catch (err) {
      setGameStatus(err.message, true);
    }
  }

   /**
    * Save game display name and payment settings changes.
    */
   async function handleSaveDisplayName() {
     const name = els.editDisplayName.value.trim();
     if (!name) { setStatus(ta('displayNameRequired'), true); return; }
     try {
       const requiresPayment = els.requiresPayment.checked;
       const priceInCents = requiresPayment ? eurosToCents(els.priceEuros.value) : 0;
       const supportsOffline = els.supportsOffline.checked;
       const finalQuestion = els.finalQuestion?.value.trim() ?? '';
       const finalAnswer = els.finalAnswer?.value.trim() ?? '';
       await saveGame(state.currentSlug, name, requiresPayment, priceInCents, supportsOffline, finalQuestion, finalAnswer);
       state.currentRequiresPayment = requiresPayment;
       state.currentPriceInCents = priceInCents;
       state.currentSupportsOffline = supportsOffline;
       state.currentFinalQuestion = finalQuestion;
       state.currentFinalAnswer = finalAnswer;
       const g = state.games.find((x) => x.slug === state.currentSlug);
       if (g) g.display_name = name;
       populateGameSelect();
       els.gameSelect.value = state.currentSlug;
        state.editorDirty = false;
       setStatus(ta('nameSaved'));
     } catch (err) {
       setStatus(err.message, true);
     }
   }

  /**
   * Save edited game style values for the selected game.
   */
  async function handleSaveGameStyles() {
    if (!state.user) { setStatus(ta('saveSignInFirst'), true); return; }
    if (!state.currentGameId) { setStatus(ta('noGameSelected'), true); return; }
    try {
      const styles = collectStylesFromInputs();
      await saveGameStyles(state.currentGameId, styles);
      state.currentGameStyles = { ...styles };
      state.editorDirty = false;
      setStatus(ta('gameStylesSaved'));
    } catch (err) {
      setStatus(ta('gameStylesSaveFailed', { message: err.message }), true);
    }
  }

  /**
   * Reset game styles to defaults and persist the reset.
   */
  async function handleResetGameStyles() {
    if (!state.user) { setStatus(ta('saveSignInFirst'), true); return; }
    if (!state.currentGameId) { setStatus(ta('noGameSelected'), true); return; }
    try {
      renderGameStyleEditor(DEFAULT_GAME_STYLES);
      await saveGameStyles(state.currentGameId, DEFAULT_GAME_STYLES);
      state.currentGameStyles = { ...DEFAULT_GAME_STYLES };
      state.editorDirty = false;
      setStatus(ta('gameStylesReset'));
    } catch (err) {
      setStatus(ta('gameStylesSaveFailed', { message: err.message }), true);
    }
  }

  // --- Route CRUD ---

  /**
   * Save the active route changes to persistent storage.
   */
  async function handleSaveRoute() {
    if (!state.user) { setStatus(ta('saveSignInFirst'), true); return; }
    if (!state.currentSlug) { setStatus(ta('noGameSelected'), true); return; }
    try {
      flushCurrentRouteToState();
      const r = state.routes[state.currentRouteIndex];
      const displayName = els.routeDisplayNameInput.value.trim() || r.display_name;
      const route = collectRouteFromInputs();
      if (r.id) {
        await saveRoute(r.id, displayName, route);
      } else {
        const created = await createRoute(state.currentGameId, displayName, route, r.order_index);
        r.id = created.id;
      }
      r.display_name = displayName;
      r.route = route;
      renderRouteTabs();
      state.editorDirty = false;
      setStatus(ta('routeSaved'));
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  /**
   * Add a new route tab and initialize default route values.
   */
  async function handleAddRoute() {
    if (!state.user) { setStatus(ta('saveSignInFirst'), true); return; }
    flushCurrentRouteToState();
    const nextIndex = state.routes.length;
    const newRoute = {
      id: null,
      order_index: nextIndex,
      display_name: `${ta('routeLabel')} ${nextIndex + 1}`,
      route: [...DEFAULT_ROUTE],
    };
    state.routes.push(newRoute);
    state.currentRouteIndex = nextIndex;
    state.selectedRowIndex = 0;
    els.routeDisplayNameInput.value = newRoute.display_name;
    syncFormFromRoute(newRoute.route);
    renderRouteTabs();
    updateAuthUi();
    state.editorDirty = true;
    setStatus(ta('routeAddedSaveToKeep'));
  }

  /**
   * Delete the active route after confirmation and reindex tabs.
   */
  async function handleDeleteRoute() {
    if (state.routes.length <= 1) { setStatus(ta('cannotDeleteLastRoute'), true); return; }
    const r = state.routes[state.currentRouteIndex];
    if (!confirm(ta('routeDeleteConfirm', { name: r.display_name }))) return;
    try {
      if (r.id) await deleteRoute(r.id);
      state.routes.splice(state.currentRouteIndex, 1);
      state.routes.forEach((x, i) => { x.order_index = i; });
      state.currentRouteIndex = Math.min(state.currentRouteIndex, state.routes.length - 1);
      state.selectedRowIndex = 0;
      const cur = state.routes[state.currentRouteIndex];
      els.routeDisplayNameInput.value = cur.display_name;
      syncFormFromRoute(cur.route);
      renderRouteTabs();
      updateAuthUi();
      state.editorDirty = true;
      setStatus(ta('routeDeleted', { name: r.display_name }));
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  /**
   * Reset the active route to configured default locations.
   */
  async function handleResetDefaults() {
    if (!state.user) { setStatus(ta('resetSignInFirst'), true); return; }
    const r = state.routes[state.currentRouteIndex];
    r.route = DEFAULT_ROUTE.slice(0, DEFAULT_ROUTE_LENGTH).map((p) => ({ ...p }));
    syncFormFromRoute(r.route);
    state.editorDirty = true;
    setStatus(ta('defaultsRestored'));
  }

  return {
    refreshUserState,
    handleSignIn,
    handleSignUp,
    handleSignInGitHub,
    handleSignOut,
    handleCreateGame,
    handleDeleteGame,
    handleSaveDisplayName,
    handleSaveGameStyles,
    handleResetGameStyles,
    handleSaveRoute,
    handleAddRoute,
    handleDeleteRoute,
    handleResetDefaults,
  };
}
