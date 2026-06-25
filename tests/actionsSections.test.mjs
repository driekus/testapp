import test from 'node:test';
import assert from 'node:assert/strict';

import { createActionsSections } from '../src/admin/sections/actionsSections.js';

function createDeps(overrides = {}) {
  const calls = {
    setStatus: [],
    setGameStatus: [],
    saveGame: [],
    createRoute: [],
    saveRoute: [],
    deleteRoute: [],
    deleteGame: [],
    signInWithGitHub: [],
    syncFormFromRoute: [],
    renderRouteTabs: 0,
    updateAuthUi: 0,
  };

  const deps = {
    els: {
      authEmail: { value: 'admin@example.com' },
      authPassword: { value: 'secret' },
      newGameSlug: { value: 'demo' },
      newGameDisplayName: { value: 'Demo Game' },
      newGameForm: { classList: { add() {} } },
      gameSelect: { value: '' },
      editorSection: { classList: { add() {} } },
      editDisplayName: { value: 'Updated Game' },
      requiresPayment: { checked: true },
      priceEuros: { value: '2.50' },
      supportsOffline: { checked: true },
      finalQuestion: { value: 'Final question?' },
      finalAnswer: { value: 'Final answer' },
      routeDisplayNameInput: { value: 'Route 1' },
    },
    state: {
      authStatusMessage: '',
      user: { id: 'u1', email: 'admin@example.com' },
      currentSlug: 'demo',
      currentGameId: 'game-1',
      currentRequiresPayment: false,
      currentPriceInCents: 0,
      currentSupportsOffline: false,
      games: [{ slug: 'demo', display_name: 'Demo Game' }],
      routes: [{ id: null, order_index: 0, display_name: 'Route 1', route: [{ name: 'A' }] }],
      currentRouteIndex: 0,
      selectedRowIndex: 0,
    },
    ta: (key, params = {}) => `${key}:${params.message ?? params.name ?? ''}`,
    DEFAULT_ROUTE: [{ name: 'Location 1' }],
    DEFAULT_ROUTE_LENGTH: 1,
    DEFAULT_GAME_STYLES: { primary_color: '#000000' },
    hasSupabaseConfig: true,
    getCurrentUser: async () => ({ email: 'admin@example.com' }),
    signInWithPassword: async () => {},
    signUpWithPassword: async () => {},
    signInWithGitHub: async () => {},
    signOutUser: async () => {},
    saveGame: async (...args) => {
      calls.saveGame.push(args);
      return 'game-1';
    },
    createRoute: async (...args) => {
      calls.createRoute.push(args);
      return { id: 'route-1' };
    },
    deleteGame: async (slug) => { calls.deleteGame.push(slug); },
    saveGameStyles: async () => {},
    saveRoute: async (...args) => { calls.saveRoute.push(args); },
    deleteRoute: async (id) => { calls.deleteRoute.push(id); },
    setStatus: (msg, isError = false) => calls.setStatus.push({ msg, isError }),
    setGameStatus: (msg, isError = false) => calls.setGameStatus.push({ msg, isError }),
    sanitizeSlugInput: (value) => value.trim().toLowerCase(),
    eurosToCents: (value) => Math.round(Number(value) * 100),
    updateAuthUi: () => {
      calls.updateAuthUi += 1;
    },
    renderGameStyleEditor: () => {},
    collectStylesFromInputs: () => ({ primary_color: '#ffffff' }),
    refreshGameList: async () => {},
    populateGameSelect: () => {},
    renderRouteTabs: () => {
      calls.renderRouteTabs += 1;
    },
    flushCurrentRouteToState: () => {},
    syncFormFromRoute: (route) => {
      calls.syncFormFromRoute.push(route);
    },
    collectRouteFromInputs: () => [{ name: 'A' }],
    loadGameIntoEditor: async () => {},
    ...overrides,
  };

  return { deps, calls };
}

test('auth handlers update status for missing credentials and github redirect success', async () => {
  const { deps, calls } = createDeps({
    signInWithGitHub: async (...args) => {
      calls.signInWithGitHub.push(args);
    },
  });
  const actions = createActionsSections(deps);

  const originalWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://example.test' } };

  try {
    deps.els.authEmail.value = '';
    deps.els.authPassword.value = '';
    await actions.handleSignIn();
    assert.match(deps.state.authStatusMessage, /signInFailed/);

    await actions.handleSignInGitHub();
    assert.equal(calls.signInWithGitHub.length, 1);
    assert.equal(calls.signInWithGitHub[0][0], 'https://example.test/admin.html');
    assert.match(deps.state.authStatusMessage, /redirectingGitHub/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('handleSaveDisplayName saves payment + offline flags', async () => {
  const { deps, calls } = createDeps();
  const actions = createActionsSections(deps);

  await actions.handleSaveDisplayName();

  assert.equal(calls.saveGame.length, 1);
  assert.deepEqual(calls.saveGame[0], ['demo', 'Updated Game', true, 250, true, 'Final question?', 'Final answer']);
  assert.equal(deps.state.currentRequiresPayment, true);
  assert.equal(deps.state.currentPriceInCents, 250);
  assert.equal(deps.state.currentSupportsOffline, true);
  assert.equal(deps.state.currentFinalQuestion, 'Final question?');
  assert.equal(deps.state.currentFinalAnswer, 'Final answer');
  assert.equal(deps.els.gameSelect.value, 'demo');
  assert.equal(calls.setStatus.at(-1).isError, false);
});

test('handleCreateGame validates slug/display name and creates route on success', async () => {
  const { deps, calls } = createDeps();
  const actions = createActionsSections(deps);

  deps.els.newGameSlug.value = '   ';
  await actions.handleCreateGame();
  assert.equal(calls.setGameStatus.at(-1).isError, true);

  deps.els.newGameSlug.value = 'new-game';
  deps.els.newGameDisplayName.value = 'New Game';
  await actions.handleCreateGame();

  assert.equal(calls.saveGame.length, 1);
  assert.equal(calls.createRoute.length, 1);
  assert.deepEqual(calls.createRoute[0], ['game-1', 'Route 1', deps.DEFAULT_ROUTE, 0]);
});

test('handleAddRoute appends route and updates UI state', async () => {
  const { deps, calls } = createDeps();
  const actions = createActionsSections(deps);

  await actions.handleAddRoute();

  assert.equal(deps.state.routes.length, 2);
  assert.equal(deps.state.currentRouteIndex, 1);
  assert.equal(deps.state.selectedRowIndex, 0);
  assert.equal(calls.renderRouteTabs, 1);
  assert.equal(calls.updateAuthUi, 1);
  assert.equal(calls.syncFormFromRoute.length, 1);
});

test('handleDeleteRoute blocks deleting the last route', async () => {
  const { deps, calls } = createDeps();
  deps.state.routes = [{ id: 'r1', order_index: 0, display_name: 'Route 1', route: [] }];
  const actions = createActionsSections(deps);

  await actions.handleDeleteRoute();

  assert.equal(calls.setStatus.at(-1).isError, true);
  assert.match(calls.setStatus.at(-1).msg, /cannotDeleteLastRoute/);
});

test('handleSaveRoute updates existing route and creates id for unsaved route', async () => {
  const { deps, calls } = createDeps({
    collectRouteFromInputs: () => [{ name: 'Updated' }],
    createRoute: async (...args) => {
      calls.createRoute.push(args);
      return { id: 'created-route' };
    },
  });
  deps.state.routes = [
    { id: 'r-1', order_index: 0, display_name: 'Route 1', route: [{ name: 'A' }] },
    { id: null, order_index: 1, display_name: 'Route 2', route: [{ name: 'B' }] },
  ];
  deps.state.currentRouteIndex = 0;
  deps.els.routeDisplayNameInput.value = 'Existing Route';
  const actions = createActionsSections(deps);

  await actions.handleSaveRoute();
  assert.equal(calls.saveRoute.length, 1);
  assert.deepEqual(calls.saveRoute[0], ['r-1', 'Existing Route', [{ name: 'Updated' }]]);

  deps.state.currentRouteIndex = 1;
  deps.els.routeDisplayNameInput.value = 'New Route';
  await actions.handleSaveRoute();
  assert.equal(calls.createRoute.length, 1);
  assert.equal(deps.state.routes[1].id, 'created-route');
});

test('handleDeleteGame and handleDeleteRoute honor confirm and mutate state on success', async () => {
  const { deps, calls } = createDeps();
  deps.state.routes = [
    { id: 'r1', order_index: 0, display_name: 'Route 1', route: [{ name: 'A' }] },
    { id: 'r2', order_index: 1, display_name: 'Route 2', route: [{ name: 'B' }] },
  ];
  deps.state.currentRouteIndex = 1;
  const actions = createActionsSections(deps);

  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => false;
  try {
    await actions.handleDeleteGame();
    await actions.handleDeleteRoute();
    assert.equal(calls.deleteGame.length, 0);
    assert.equal(calls.deleteRoute.length, 0);
  } finally {
    globalThis.confirm = originalConfirm;
  }

  globalThis.confirm = () => true;
  try {
    await actions.handleDeleteRoute();
    assert.equal(calls.deleteRoute.length, 1);
    assert.equal(deps.state.routes.length, 1);
    assert.equal(deps.state.currentRouteIndex, 0);

    await actions.handleDeleteGame();
    assert.deepEqual(calls.deleteGame, ['demo']);
    assert.equal(deps.state.currentSlug, null);
    assert.equal(deps.state.routes.length, 0);
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test('handleResetDefaults restores cloned default route values', async () => {
  const defaultRoute = [{ name: 'Location 1', lat: 1 }, { name: 'Location 2', lat: 2 }];
  const { deps } = createDeps({
    DEFAULT_ROUTE: defaultRoute,
    DEFAULT_ROUTE_LENGTH: 2,
  });
  deps.state.routes = [
    { id: 'r1', order_index: 0, display_name: 'Route 1', route: [{ name: 'Old', lat: 9 }] },
  ];
  deps.state.currentRouteIndex = 0;
  const actions = createActionsSections(deps);

  await actions.handleResetDefaults();

  assert.equal(deps.state.routes[0].route.length, 2);
  assert.equal(deps.state.routes[0].route[0].name, 'Location 1');
  assert.notEqual(deps.state.routes[0].route[0], defaultRoute[0]);
});

