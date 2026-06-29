import '../admin.css';

import { DEFAULT_ROUTE, DEFAULT_ROUTE_LENGTH, MAX_ROUTE_LOCATIONS, blankRoute, defaultConfig } from '../config.js';
import {
  getCurrentUser,
  hasSupabaseConfig,
  signInWithGitHub,
  signInWithPassword,
  signOutUser,
  supabase,
} from '../supabaseClient.js';
import {
  createRoute,
  deleteGame,
  deleteLocationImage,
  deleteRoute,
  fetchGameStyles,
  fetchGameWithRoutes,
  listGames,
  saveGame,
  saveGameLogo,
  saveGameStyles,
  saveRoute,
  uploadGameLogo,
  uploadLocationImage,
} from '../userConfigService.js';
import { setLanguage } from '../i18n.js';
import { createInitialState, DEFAULT_GAME_STYLES, language, STYLE_FIELDS, ta } from './constants.js';
import {
  buildAdminDraftPayload,
  clearAdminDraft,
  loadAdminDraft,
  saveAdminDraft,
} from './draftStore.js';
import { getEls } from './dom.js';
import { createCoreSections } from './sections/coreSections.js';
import { createRouteEditorSections } from './sections/routeEditorSections.js';
import { createActionsSections } from './sections/actionsSections.js';

// --- Boot setup ---

const state = createInitialState(hasSupabaseConfig);
const els = getEls();

// --- Core sections (utilities, auth UI, game selector) ---

const {
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
} = createCoreSections({
  els, state, ta, language,
  MAX_ROUTE_LOCATIONS, DEFAULT_GAME_STYLES, STYLE_FIELDS,
  hasSupabaseConfig, listGames,
});

applyTranslations();

// --- Route editor sections (tabs, location editor, uploads, map, game loader) ---

const {
  renderRouteTabs,
  flushCurrentRouteToState,
  syncFormFromRoute,
  collectRouteFromInputs,
  handleLogoUpload,
  handleLogoRemove,
  bindRowsDelegate,
  handleLocationCountChange,
  setupMap,
  loadGameIntoEditor,
} = createRouteEditorSections({
  els, state, ta,
  MAX_ROUTE_LOCATIONS, blankRoute, defaultConfig,
  DEFAULT_ROUTE, DEFAULT_GAME_STYLES,
  uploadLocationImage, deleteLocationImage, uploadGameLogo, saveGameLogo,
  fetchGameWithRoutes, fetchGameStyles,
  setStatus, setGameStatus, updateAuthUi,
  renderGameStyleEditor, syncPaymentControls, centsToEuros,
});

function currentAdminUserId() {
  return state.user?.id ?? 'anonymous';
}

function cloneRoutes(routes) {
  return (routes ?? []).map((route) => ({
    ...route,
    route: (route?.route ?? []).map((point) => ({ ...point })),
  }));
}

function persistCurrentDraft() {
  if (!state.currentSlug || !state.editorDirty) return;

  try {
    flushCurrentRouteToState();
  } catch {
    // Keep previous draft when in-progress row values are temporarily invalid.
  }

  const draft = buildAdminDraftPayload({
    slug: state.currentSlug,
    updatedAt: Date.now(),
    currentRouteIndex: state.currentRouteIndex,
    selectedRowIndex: state.selectedRowIndex,
    editDisplayName: els.editDisplayName?.value ?? '',
    requiresPayment: Boolean(els.requiresPayment?.checked),
    priceEuros: els.priceEuros?.value ?? '',
    supportsOffline: Boolean(els.supportsOffline?.checked),
    finalQuestion: els.finalQuestion?.value ?? '',
    finalAnswer: els.finalAnswer?.value ?? '',
    currentGameStyles: collectStylesFromInputs(),
    routes: cloneRoutes(state.routes),
  });

  saveAdminDraft({
    slug: state.currentSlug,
    userId: currentAdminUserId(),
    draft,
  });
}

function clearDraftForSlug(slug = state.currentSlug) {
  if (!slug) return;
  clearAdminDraft({
    slug,
    userId: currentAdminUserId(),
  });
}

function applyDraftToEditor(draft) {
  if (!draft || !state.currentSlug || draft.slug !== state.currentSlug) return;

  if (els.editDisplayName) els.editDisplayName.value = draft.editDisplayName ?? '';
  if (els.requiresPayment) els.requiresPayment.checked = Boolean(draft.requiresPayment);
  if (els.priceEuros) els.priceEuros.value = String(draft.priceEuros ?? '0.00');
  if (els.supportsOffline) els.supportsOffline.checked = Boolean(draft.supportsOffline);
  if (els.finalQuestion) els.finalQuestion.value = String(draft.finalQuestion ?? '');
  if (els.finalAnswer) els.finalAnswer.value = String(draft.finalAnswer ?? '');

  state.currentRequiresPayment = Boolean(draft.requiresPayment);
  state.currentPriceInCents = eurosToCents(String(draft.priceEuros ?? '0'));
  state.currentSupportsOffline = Boolean(draft.supportsOffline);
  state.currentFinalQuestion = String(draft.finalQuestion ?? '');
  state.currentFinalAnswer = String(draft.finalAnswer ?? '');
  state.currentGameStyles = {
    ...DEFAULT_GAME_STYLES,
    ...(draft.currentGameStyles ?? {}),
  };
  renderGameStyleEditor(state.currentGameStyles);
  syncPaymentControls();

  const nextRoutes = cloneRoutes(draft.routes);
  if (nextRoutes.length > 0) {
    state.routes = nextRoutes;
    state.currentRouteIndex = Math.max(0, Math.min(
      Number(draft.currentRouteIndex ?? 0),
      state.routes.length - 1,
    ));
    const activeRoute = state.routes[state.currentRouteIndex];
    state.selectedRowIndex = Math.max(0, Math.min(
      Number(draft.selectedRowIndex ?? 0),
      Math.max(0, activeRoute.route.length - 1),
    ));
    if (els.routeDisplayNameInput) {
      els.routeDisplayNameInput.value = activeRoute.display_name ?? '';
    }
    syncFormFromRoute(activeRoute.route);
    renderRouteTabs();
  }

  state.editorDirty = true;
}

async function loadGameIntoEditorWithDraft(slug) {
  await loadGameIntoEditor(slug);
  if (!slug || !state.currentSlug || state.currentSlug !== slug) return;

  const draft = loadAdminDraft({
    slug,
    userId: currentAdminUserId(),
  });
  if (!draft) return;
  applyDraftToEditor(draft);
}

// --- Action sections (auth handlers, game CRUD, route CRUD) ---

const {
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
} = createActionsSections({
  els, state, ta,
  DEFAULT_ROUTE, DEFAULT_ROUTE_LENGTH, DEFAULT_GAME_STYLES,
  hasSupabaseConfig,
  getCurrentUser, signInWithPassword, signInWithGitHub, signOutUser,
  saveGame, createRoute, deleteGame, saveGameStyles, saveRoute, deleteRoute,
  setStatus, setGameStatus, sanitizeSlugInput, eurosToCents,
  updateAuthUi, renderGameStyleEditor, collectStylesFromInputs,
  refreshGameList, populateGameSelect,
  renderRouteTabs, flushCurrentRouteToState, syncFormFromRoute, collectRouteFromInputs,
  loadGameIntoEditor: loadGameIntoEditorWithDraft,
});

function runActionWithDraftSync(action) {
  return async () => {
    const previousSlug = state.currentSlug;
    await action();
    const draftSlug = state.currentSlug || previousSlug;
    if (!draftSlug) return;

    if (state.currentSlug && state.editorDirty) {
      persistCurrentDraft();
      return;
    }

    clearDraftForSlug(draftSlug);
  };
}

// --- Event Bindings ---

els.languageSelect.addEventListener('change', (e) => { setLanguage(e.target.value); window.location.reload(); });
els.signIn.addEventListener('click', handleSignIn);
els.signUp.addEventListener('click', handleSignUp);
els.signInGitHub.addEventListener('click', handleSignInGitHub);
els.signOut.addEventListener('click', handleSignOut);

els.gameSelect.addEventListener('change', () => {
  if (state.currentSlug && state.editorDirty) {
    persistCurrentDraft();
  }
  state.currentSlug = els.gameSelect.value || null;
  loadGameIntoEditorWithDraft(els.gameSelect.value);
});
els.newGameBtn.addEventListener('click', () => els.newGameForm.classList.toggle('hidden'));
els.cancelNewGameBtn.addEventListener('click', () => els.newGameForm.classList.add('hidden'));
els.createGameBtn.addEventListener('click', handleCreateGame);
els.deleteGameBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleDeleteGame)();
});
els.saveDisplayName.addEventListener('click', () => {
  void runActionWithDraftSync(handleSaveDisplayName)();
});
els.saveGameStylesBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleSaveGameStyles)();
});
els.resetGameStylesBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleResetGameStyles)();
});
els.gameStyleFields.addEventListener('input', handleGameStylesPreviewInput);
els.gameStyleFields.addEventListener('change', handleGameStylesPreviewInput);
els.requiresPayment.addEventListener('change', () => {
  syncPaymentControls();
  if (!els.requiresPayment.checked) els.priceEuros.value = '0.00';
});

els.routeLocationCount.addEventListener('change', handleLocationCountChange);
els.saveRouteBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleSaveRoute)();
});
els.addRouteBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleAddRoute)();
});
els.deleteRouteBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleDeleteRoute)();
});
els.resetDefaultsBtn.addEventListener('click', () => {
  void runActionWithDraftSync(handleResetDefaults)();
});

let draftSaveTimer = null;

function scheduleDraftSave() {
  if (!state.currentSlug || !state.editorDirty) return;
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    persistCurrentDraft();
  }, 350);
}

els.editorSection?.addEventListener('input', () => {
  if (!state.currentSlug) return;
  state.editorDirty = true;
  scheduleDraftSave();
});
els.editorSection?.addEventListener('change', () => {
  if (!state.currentSlug) return;
  state.editorDirty = true;
  scheduleDraftSave();
});

window.addEventListener('beforeunload', () => {
  if (!state.currentSlug || !state.editorDirty) return;
  persistCurrentDraft();
});

// --- Boot ---

setupMap();
bindRowsDelegate();
els.logoFileInput.addEventListener('change', handleLogoUpload);
els.removeLogoBtn.addEventListener('click', handleLogoRemove);
syncFormFromRoute(defaultConfig().route);
renderGameStyleEditor(DEFAULT_GAME_STYLES);
syncPaymentControls();
updateAuthUi();

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshUserState({ reloadEditor: false }).catch((err) => {
      state.authStatusMessage = ta('authSyncFailed', { message: err.message });
      updateAuthUi();
    });
  });
}

refreshUserState().catch((err) => {
  state.authStatusMessage = ta('startupError', { message: err.message });
  updateAuthUi();
});

