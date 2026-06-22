import test from 'node:test';
import assert from 'node:assert/strict';

import { createRankingsContext, startRankingsPage } from '../src/rankingsEntry.js';

test('createRankingsContext derives slug/playerId and queries elements', () => {
  const selectors = [];
  const windowRef = { location: { search: '?slug=amsterdam-tour' } };
  const documentRef = {
    querySelector(selector) {
      selectors.push(selector);
      return { selector };
    },
  };

  const ctx = createRankingsContext({
    windowRef,
    documentRef,
    getLanguage: () => 'en',
    t: (lang, section, key) => `${lang}:${section}:${key}`,
    getPlayerId: (slug) => `player:${slug}`,
  });

  assert.equal(ctx.language, 'en');
  assert.equal(ctx.slug, 'amsterdam-tour');
  assert.equal(ctx.playerId, 'player:amsterdam-tour');
  assert.equal(ctx.tm('viewRankings'), 'en:main:viewRankings');
  assert.ok(selectors.includes('#rankings-title'));
});

test('startRankingsPage delegates to loadRankingsView with computed context', () => {
  let calledWith = null;
  const deps = {
    windowRef: { location: { search: '?slug=demo' } },
    documentRef: {
      querySelector() {
        return {};
      },
      createElement(tag) {
        return { tag };
      },
    },
    getLanguage: () => 'nl',
    t: (_lang, _section, key) => key,
    getPlayerId: () => 'player-1',
    loadRankingsView(payload) {
      calledWith = payload;
      return Promise.resolve();
    },
    buildRankingsUrl: () => '/rankings.html?slug=demo',
    fetchGameForPlay: async () => ({}),
    loadGameStyles: async () => {},
    fetchScoreboard: async () => ({}),
  };

  startRankingsPage(deps);
  assert.equal(calledWith.slug, 'demo');
  assert.equal(calledWith.playerId, 'player-1');
  assert.equal(typeof calledWith.createElement, 'function');
  assert.equal(calledWith.tm('scoreboardTitle'), 'scoreboardTitle');
});

