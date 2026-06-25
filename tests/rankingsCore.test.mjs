import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRankingsView, renderScoreRow } from '../src/rankingsCore.js';

function createClassList() {
  const set = new Set();
  return {
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
  };
}

function el() {
  return {
    textContent: '',
    href: '',
    src: '',
    className: '',
    classList: createClassList(),
    children: [],
    onclick: null,
    appendChild(child) {
      this.children.push(child);
    },
    replaceChildren(...children) {
      this.children = [...children];
    },
  };
}

function createEls() {
  return {
    closeBtn: el(),
    refreshLink: el(),
    gameLogo: el(),
    title: el(),
    scoreboardTitle: el(),
    scoreboardList: el(),
    myRankingsCard: el(),
    myRankingsTitle: el(),
    myRankingsList: el(),
  };
}

function tm(key, params = {}) {
  return `${key}:${JSON.stringify(params)}`;
}

function createElement(tag) {
  return {
    tag,
    textContent: '',
    className: '',
    classList: createClassList(),
  };
}

test('renderScoreRow formats labels for default, best mine and my run', () => {
  const normal = renderScoreRow({ entry: { rank: 2, display_name: 'Alice', score: 100 }, tm, createElement });
  assert.match(normal.textContent, /Alice/);

  const bestMine = renderScoreRow({
    entry: { rank: 4, display_name: '', score: 90 },
    tm,
    createElement,
    options: { isBestMine: true },
  });
  assert.match(bestMine.textContent, /scoreboardYouBest/);

  const myRun = renderScoreRow({
    entry: { rank: 5, display_name: '', score: 80 },
    tm,
    createElement,
    options: { isMine: true, runIndex: 2 },
  });
  assert.match(myRun.textContent, /scoreboardYouRun/);
});

test('loadRankingsView handles missing slug', async () => {
  const els = createEls();
  await loadRankingsView({
    slug: '',
    playerId: '',
    els,
    tm,
    buildRankingsUrl: () => '/rankings.html',
    fetchGameForPlay: async () => null,
    loadGameStyles: async () => {},
    fetchScoreboard: async () => ({}),
    windowRef: { location: { replace() {} } },
    createElement,
  });

  assert.match(els.title.textContent, /scoreboardTitle/);
  assert.equal(els.myRankingsCard.classList.contains('hidden'), true);
});

test('loadRankingsView renders empty scoreboard and my-rankings fallback', async () => {
  const els = createEls();
  await loadRankingsView({
    slug: 'demo',
    playerId: 'player-1',
    els,
    tm,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    fetchGameForPlay: async () => ({ id: 'g1', logo_url: 'https://logo.png' }),
    loadGameStyles: async () => {},
    fetchScoreboard: async () => ({ top: [], mine: [] }),
    windowRef: { location: { replace() {} } },
    createElement,
  });

  assert.equal(els.refreshLink.href, '/rankings.html?slug=demo');
  assert.equal(els.scoreboardList.children.length, 1);
  assert.match(els.scoreboardList.children[0].textContent, /scoreboardEmpty/);
  assert.equal(els.myRankingsList.children.length, 1);
  assert.match(els.myRankingsList.children[0].textContent, /myRankingsEmpty/);
});

test('loadRankingsView renders top rows and my runs including best mine outside top 3', async () => {
  const els = createEls();
  await loadRankingsView({
    slug: 'demo',
    playerId: 'player-1',
    els,
    tm,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    fetchGameForPlay: async () => ({ id: 'g1', logo_url: '' }),
    loadGameStyles: async () => {
      throw new Error('style failed');
    },
    fetchScoreboard: async () => ({
      top: [
        { rank: 1, display_name: 'Alice', score: 100, player_session_id: 's1' },
        { rank: 2, display_name: 'Bob', score: 90, player_session_id: 's2' },
        { rank: 3, display_name: 'Cara', score: 80, player_session_id: 's3' },
      ],
      mine: [
        { rank: 5, display_name: '', score: 70, player_session_id: 'sx' },
        { rank: 8, display_name: '', score: 60, player_session_id: 'sy' },
      ],
    }),
    windowRef: { location: { replace() {} } },
    createElement,
  });

  assert.equal(els.scoreboardList.children.length, 4);
  assert.equal(els.myRankingsList.children.length, 2);
  assert.match(els.myRankingsList.children[0].textContent, /scoreboardYouRun/);
});

test('loadRankingsView handles game-not-found and fatal errors', async () => {
  const elsNotFound = createEls();
  await loadRankingsView({
    slug: 'demo',
    playerId: 'player-1',
    els: elsNotFound,
    tm,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    fetchGameForPlay: async () => null,
    loadGameStyles: async () => {},
    fetchScoreboard: async () => ({}),
    windowRef: { location: { replace() {} } },
    createElement,
  });
  assert.match(elsNotFound.title.textContent, /gameNotFound/);

  const elsError = createEls();
  await loadRankingsView({
    slug: 'demo',
    playerId: 'player-1',
    els: elsError,
    tm,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    fetchGameForPlay: async () => ({ id: 'g1' }),
    loadGameStyles: async () => {},
    fetchScoreboard: async () => {
      throw new Error('boom');
    },
    windowRef: { location: { replace() {} } },
    createElement,
  });
  assert.match(elsError.title.textContent, /scoreboardTitle/);
  assert.equal(elsError.myRankingsCard.classList.contains('hidden'), true);
});

test('close button redirects to lobby when clicked', async () => {
  const els = createEls();
  let replaced = '';
  await loadRankingsView({
    slug: 'demo',
    playerId: 'player-1',
    els,
    tm,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    fetchGameForPlay: async () => ({ id: 'g1' }),
    loadGameStyles: async () => {},
    fetchScoreboard: async () => ({ top: [], mine: [] }),
    windowRef: {
      location: {
        replace(url) {
          replaced = url;
        },
      },
    },
    createElement,
  });

  els.closeBtn.onclick();
  assert.match(replaced, /^\/\?refresh=/);
});

test('offline rankings actions require confirm before navigating away', async () => {
  const els = createEls();
  let replaced = '';
  let confirmCalls = 0;
  await loadRankingsView({
    slug: 'demo',
    playerId: 'player-1',
    els,
    tm,
    buildRankingsUrl: (slug) => `/rankings.html?slug=${slug}`,
    fetchGameForPlay: async () => ({ id: 'g1' }),
    loadGameStyles: async () => {},
    fetchScoreboard: async () => ({ top: [], mine: [] }),
    windowRef: {
      navigator: { onLine: false },
      confirm() {
        confirmCalls += 1;
        return false;
      },
      location: {
        replace(url) {
          replaced = url;
        },
      },
    },
    createElement,
  });

  els.closeBtn.onclick();
  assert.equal(replaced, '');

  let prevented = false;
  els.refreshLink.onclick({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(confirmCalls, 2);
});

