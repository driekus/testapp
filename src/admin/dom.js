/**
 * Query and return all cached admin page DOM elements.
 * @returns {{ languageSelect: HTMLSelectElement | null, authUser: HTMLElement | null, authStatus: HTMLElement | null, authEmail: HTMLInputElement | null, authPassword: HTMLInputElement | null, signIn: HTMLButtonElement | null, signUp: HTMLButtonElement | null, signInGitHub: HTMLButtonElement | null, signOut: HTMLButtonElement | null, gameSelect: HTMLSelectElement | null, newGameBtn: HTMLButtonElement | null, deleteGameBtn: HTMLButtonElement | null, newGameForm: HTMLElement | null, newGameSlug: HTMLInputElement | null, newGameDisplayName: HTMLInputElement | null, createGameBtn: HTMLButtonElement | null, cancelNewGameBtn: HTMLButtonElement | null, gameStatus: HTMLElement | null, editorSection: HTMLElement | null, editDisplayName: HTMLInputElement | null, saveDisplayName: HTMLButtonElement | null, requiresPayment: HTMLInputElement | null, priceWrap: HTMLElement | null, priceEuros: HTMLInputElement | null, supportsOffline: HTMLInputElement | null, logoPreviewWrap: HTMLElement | null, logoPreviewImg: HTMLImageElement | null, removeLogoBtn: HTMLButtonElement | null, logoUploadLabel: HTMLElement | null, logoFileInput: HTMLInputElement | null, logoUploadStatus: HTMLElement | null, gameStyleFields: HTMLElement | null, gameStylePreview: HTMLElement | null, saveGameStylesBtn: HTMLButtonElement | null, resetGameStylesBtn: HTMLButtonElement | null, routeTabBar: HTMLElement | null, routeDisplayNameInput: HTMLInputElement | null, routeLocationCount: HTMLInputElement | null, deleteRouteBtn: HTMLButtonElement | null, rows: HTMLElement | null, saveRouteBtn: HTMLButtonElement | null, addRouteBtn: HTMLButtonElement | null, resetDefaultsBtn: HTMLButtonElement | null, status: HTMLElement | null }}
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
     supportsOffline: document.querySelector('#supports-offline'),
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


