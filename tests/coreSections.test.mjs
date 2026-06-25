import test from 'node:test';
import assert from 'node:assert/strict';

import { createCoreSections } from '../src/admin/sections/coreSections.js';

function createDeps() {
  const statusToggles = [];
  const gameStatusToggles = [];
  const gameSelect = {
    value: '',
    children: [],
    replaceChildren(...children) {
      this.children = [...children];
    },
    appendChild(child) {
      this.children.push(child);
    },
  };

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
      status: { textContent: '', classList: { toggle(name, value) { statusToggles.push([name, value]); } } },
      gameStatus: { textContent: '', classList: { toggle(name, value) { gameStatusToggles.push([name, value]); } } },
      gameStyleFields: {
        children: [],
        replaceChildren(...children) {
          this.children = [...children];
        },
        querySelector(selector) {
          const m = selector.match(/\[data-style-field="([^"]+)"\]/);
          if (!m) return null;
          const key = m[1];
          for (const label of this.children) {
            const input = label.children?.[0];
            if (input?.dataset?.styleField === key) return input;
          }
          return null;
        },
      },
      gameStylePreview: {
        style: {
          values: {},
          setProperty(name, value) {
            this.values[name] = value;
          },
        },
      },
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
      gameSelect,
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
    statusToggles,
    gameStatusToggles,
  };
}

function installDocumentMock() {
  const originalDocument = globalThis.document;
  const languageSelect = { value: '' };
  const routeLocationCount = { max: '' };
  const i18nEls = [{ dataset: { i18n: 'title' }, textContent: '' }];
  const placeholderEls = [{ dataset: { i18nPlaceholder: 'placeholder' }, placeholder: '' }];

  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return i18nEls;
      if (selector === '[data-i18n-placeholder]') return placeholderEls;
      return [];
    },
    querySelector(selector) {
      if (selector === '#language-select') return languageSelect;
      if (selector === '#route-location-count') return routeLocationCount;
      return null;
    },
    createElement(tag) {
      return {
        tag,
        children: [],
        dataset: {},
        style: {},
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
  };

  return {
    restore() {
      globalThis.document = originalDocument;
    },
    languageSelect,
    routeLocationCount,
    i18nEls,
    placeholderEls,
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

test('applyTranslations, style editor and style collection work with defaults/fallbacks', () => {
  const doc = installDocumentMock();
  try {
    const deps = createDeps();
    deps.ta = (key) => `t:${key}`;
    deps.language = 'nl';
    deps.MAX_ROUTE_LOCATIONS = 7;
    deps.DEFAULT_GAME_STYLES = {
      primary_color: '#123456',
      font_family: 'Inter',
      card_bg_color: '#ffffff',
    };
    deps.STYLE_FIELDS = [
      { key: 'primary_color', type: 'color', label: 'Primary' },
      { key: 'font_family', type: 'text', label: 'Font' },
      { key: 'card_bg_color', type: 'color', label: 'Card' },
    ];

    const core = createCoreSections(deps);
    core.applyTranslations();
    assert.equal(doc.languageSelect.value, 'nl');
    assert.equal(doc.routeLocationCount.max, '7');
    assert.equal(doc.i18nEls[0].textContent, 't:title');
    assert.equal(doc.placeholderEls[0].placeholder, 't:placeholder');

    core.renderGameStyleEditor({ primary_color: 'invalid', font_family: 'Roboto' });
    assert.equal(deps.els.gameStyleFields.children.length, 3);
    assert.equal(deps.els.gameStylePreview.style.values['--preview-primary-color'], 'invalid');
    assert.equal(deps.els.gameStylePreview.style.values['--preview-font-family'], 'Roboto');

    const fontInput = deps.els.gameStyleFields.querySelector('[data-style-field="font_family"]');
    const cardInput = deps.els.gameStyleFields.querySelector('[data-style-field="card_bg_color"]');
    fontInput.value = '';
    cardInput.value = '';
    const payload = core.collectStylesFromInputs();
    assert.equal(payload.font_family, 'Inter');
    assert.equal(payload.card_bg_color, '#ffffff');

    core.handleGameStylesPreviewInput();
    assert.equal(deps.els.gameStylePreview.style.values['--preview-card-bg-color'], '#ffffff');
  } finally {
    doc.restore();
  }
});

test('updateAuthUi, populateGameSelect and refreshGameList handle state and failures', async () => {
  const doc = installDocumentMock();
  try {
    const deps = createDeps();
    deps.state.user = { email: 'admin@example.com' };
    deps.state.authStatusMessage = 'ok';
    deps.state.currentSlug = 'demo';
    deps.state.currentGameId = 'g1';
    deps.state.routes = [{ id: 'r1' }, { id: 'r2' }];
    deps.state.games = [{ slug: 'demo', display_name: 'Demo' }, { slug: 'city', display_name: 'City' }];
    deps.ta = (key, params = {}) => {
      if (key === 'signedInAs') return `signed:${params.email}`;
      if (key === 'selectGameOption') return 'Select';
      if (key === 'loadGamesFailed') return `loadGamesFailed:${params.message}`;
      return key;
    };

    const core = createCoreSections(deps);
    core.updateAuthUi();
    assert.equal(deps.els.authUser.textContent, 'signed:admin@example.com');
    assert.equal(deps.els.newGameBtn.disabled, false);
    assert.equal(deps.els.deleteRouteBtn.disabled, false);

    deps.state.user = null;
    core.updateAuthUi();
    assert.equal(deps.els.newGameBtn.disabled, true);
    assert.equal(deps.els.saveRouteBtn.disabled, true);

    deps.els.gameSelect.value = 'city';
    core.populateGameSelect();
    assert.equal(deps.els.gameSelect.children.length, 3);
    assert.equal(deps.els.gameSelect.children[2].value, 'city');
    assert.equal(deps.els.gameSelect.children[2].selected, true);

    const depsSuccess = createDeps();
    depsSuccess.ta = deps.ta;
    depsSuccess.listGames = async () => [{ slug: 'new', display_name: 'New' }];
    const coreSuccess = createCoreSections(depsSuccess);
    await coreSuccess.refreshGameList();
    assert.equal(depsSuccess.state.games[0].slug, 'new');

    const depsFailure = createDeps();
    depsFailure.ta = deps.ta;
    depsFailure.listGames = async () => { throw new Error('boom'); };
    const coreFailure = createCoreSections(depsFailure);
    await coreFailure.refreshGameList();
    assert.match(depsFailure.els.gameStatus.textContent, /loadGamesFailed:boom/);
  } finally {
    doc.restore();
  }
});

