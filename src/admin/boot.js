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
  loadGameIntoEditor,
});

// --- Event Bindings ---

els.languageSelect.addEventListener('change', (e) => { setLanguage(e.target.value); window.location.reload(); });
els.signIn.addEventListener('click', handleSignIn);
els.signUp.addEventListener('click', handleSignUp);
els.signInGitHub.addEventListener('click', handleSignInGitHub);
els.signOut.addEventListener('click', handleSignOut);

els.gameSelect.addEventListener('change', () => {
  state.currentSlug = els.gameSelect.value || null;
  loadGameIntoEditor(els.gameSelect.value);
});
els.newGameBtn.addEventListener('click', () => els.newGameForm.classList.toggle('hidden'));
els.cancelNewGameBtn.addEventListener('click', () => els.newGameForm.classList.add('hidden'));
els.createGameBtn.addEventListener('click', handleCreateGame);
els.deleteGameBtn.addEventListener('click', handleDeleteGame);
els.saveDisplayName.addEventListener('click', handleSaveDisplayName);
els.saveGameStylesBtn.addEventListener('click', handleSaveGameStyles);
els.resetGameStylesBtn.addEventListener('click', handleResetGameStyles);
els.gameStyleFields.addEventListener('input', handleGameStylesPreviewInput);
els.gameStyleFields.addEventListener('change', handleGameStylesPreviewInput);
els.requiresPayment.addEventListener('change', () => {
  syncPaymentControls();
  if (!els.requiresPayment.checked) els.priceEuros.value = '0.00';
});

els.routeLocationCount.addEventListener('change', handleLocationCountChange);
els.saveRouteBtn.addEventListener('click', handleSaveRoute);
els.addRouteBtn.addEventListener('click', handleAddRoute);
els.deleteRouteBtn.addEventListener('click', handleDeleteRoute);
els.resetDefaultsBtn.addEventListener('click', handleResetDefaults);

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
    refreshUserState().catch((err) => {
      state.authStatusMessage = ta('authSyncFailed', { message: err.message });
      updateAuthUi();
    });
  });
}

refreshUserState().catch((err) => {
  state.authStatusMessage = ta('startupError', { message: err.message });
  updateAuthUi();
});

