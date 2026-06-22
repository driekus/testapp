import test from 'node:test';
import assert from 'node:assert/strict';

import { createCoreSections } from '../src/admin/sections/coreSections.js';

function createDeps() {
  return {
    els: {
      requiresPayment: { checked: false },
      priceWrap: {
        classList: {
          toggle(_name, value) {
            this.lastToggle = value;
          },
          lastToggle: null,
        },
      },
      status: { textContent: '', classList: { toggle() {} } },
      gameStatus: { textContent: '', classList: { toggle() {} } },
      gameStyleFields: null,
      gameStylePreview: null,
      authUser: { textContent: '' },
      authStatus: { textContent: '' },
      newGameBtn: { disabled: false },
      deleteGameBtn: { disabled: false },
      saveRouteBtn: { disabled: false },
      addRouteBtn: { disabled: false },
      resetDefaultsBtn: { disabled: false },
      deleteRouteBtn: { disabled: false },
      saveDisplayName: { disabled: false },
      saveGameStylesBtn: { disabled: false },
      resetGameStylesBtn: { disabled: false },
      gameSelect: { value: '', replaceChildren() {}, appendChild() {} },
    },
    state: {
      user: null,
      authStatusMessage: '',
      currentSlug: null,
      currentGameId: null,
      routes: [],
      games: [],
    },
    ta: (key) => key,
    language: 'en',
    MAX_ROUTE_LOCATIONS: 100,
    DEFAULT_GAME_STYLES: {},
    STYLE_FIELDS: [],
    hasSupabaseConfig: true,
    listGames: async () => [],
  };
}

test('core section utility converters normalize values', () => {
  const core = createCoreSections(createDeps());

  assert.equal(core.sanitizeSlugInput('  My Fun__Game  '), 'my-fun-game');
  assert.equal(core.eurosToCents('12.34'), 1234);
  assert.equal(core.eurosToCents('-5'), 0);
  assert.equal(core.centsToEuros(505), '5.05');
  assert.equal(core.centsToEuros(-10), '0.00');
});

test('syncPaymentControls toggles price visibility based on checkbox', () => {
  const deps = createDeps();
  const core = createCoreSections(deps);

  deps.els.requiresPayment.checked = false;
  core.syncPaymentControls();
  assert.equal(deps.els.priceWrap.classList.lastToggle, true);

  deps.els.requiresPayment.checked = true;
  core.syncPaymentControls();
  assert.equal(deps.els.priceWrap.classList.lastToggle, false);
});

