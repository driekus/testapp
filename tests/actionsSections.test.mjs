import test from 'node:test';
import assert from 'node:assert/strict';

import { createActionsSections } from '../src/admin/sections/actionsSections.js';

function createDeps(overrides = {}) {
  const calls = {
    setStatus: [],
    setGameStatus: [],
    saveGame: [],
    createRoute: [],
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
    deleteGame: async () => {},
    saveGameStyles: async () => {},
    saveRoute: async () => {},
    deleteRoute: async () => {},
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

test('handleSaveDisplayName saves payment + offline flags', async () => {
  const { deps, calls } = createDeps();
  const actions = createActionsSections(deps);

  await actions.handleSaveDisplayName();

  assert.equal(calls.saveGame.length, 1);
  assert.deepEqual(calls.saveGame[0], ['demo', 'Updated Game', true, 250, true]);
  assert.equal(deps.state.currentRequiresPayment, true);
  assert.equal(deps.state.currentPriceInCents, 250);
  assert.equal(deps.state.currentSupportsOffline, true);
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

