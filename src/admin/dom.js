/**
 * Resolve and cache admin page DOM elements.
 * @returns {Record<string, HTMLElement | HTMLInputElement | HTMLSelectElement | null>}
 */
export function getEls() {
  return {
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
    gameStyleFields: document.querySelector('#game-style-fields'),
    gameStylePreview: document.querySelector('#game-style-preview'),
    saveGameStylesBtn: document.querySelector('#save-game-styles-btn'),
    resetGameStylesBtn: document.querySelector('#reset-game-styles-btn'),
    routeTabBar: document.querySelector('#route-tab-bar'),
    routeDisplayNameInput: document.querySelector('#route-display-name-input'),
    routeLocationCount: document.querySelector('#route-location-count'),
    deleteRouteBtn: document.querySelector('#delete-route-btn'),
    rows: document.querySelector('#rows'),
    saveRouteBtn: document.querySelector('#save-route-btn'),
    addRouteBtn: document.querySelector('#add-route-btn'),
    resetDefaultsBtn: document.querySelector('#reset-defaults-btn'),
    status: document.querySelector('#status'),
  };
}


