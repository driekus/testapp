import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRoute,
  deleteGame,
  deleteGameBySlug,
  deleteLocationImage,
  deleteRoute,
  fetchGameForPlay,
  fetchGameStyles,
  fetchGameWithRoutes,
  fetchRouteStart,
  listGames,
  saveGame,
  saveGameLogo,
  saveGameStyles,
  saveRoute,
  setUserConfigServiceRuntimeDeps,
  uploadGameLogo,
  uploadLocationImage,
} from '../src/userConfigService.js';

function createFromBuilder(result, calls) {
  return {
    select(value) {
      calls.select = value;
      return this;
    },
    eq(column, value) {
      calls.eq = calls.eq || [];
      calls.eq.push([column, value]);
      return this;
    },
    maybeSingle() {
      calls.terminal = 'maybeSingle';
      return result;
    },
    single() {
      calls.terminal = 'single';
      return result;
    },
    upsert(payload, opts) {
      calls.upsert = { payload, opts };
      return this;
    },
    update(payload) {
      calls.update = payload;
      return this;
    },
    delete() {
      calls.delete = true;
      return this;
    },
    insert(payload) {
      calls.insert = payload;
      return this;
    },
  };
}

function createStorage(calls) {
  return {
    from(bucket) {
      calls.bucket = bucket;
      return {
        async upload(path, file, options) {
          calls.upload = { path, file, options };
          return { data: { path }, error: null };
        },
        getPublicUrl(path) {
          calls.publicPath = path;
          return { data: { publicUrl: `https://cdn.test/${path}` } };
        },
        async remove(paths) {
          calls.remove = paths;
          return { error: null };
        },
      };
    },
  };
}

test('listGames returns empty when api credentials are absent', async () => {
  setUserConfigServiceRuntimeDeps({ supabaseUrl: '', supabaseAnonKey: '' });
  assert.deepEqual(await listGames(), []);
});

test('listGames hits REST endpoint and returns JSON', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    async json() {
      return [{ slug: 'a' }];
    },
    url,
  });

  setUserConfigServiceRuntimeDeps({ supabaseUrl: 'https://db.test', supabaseAnonKey: 'anon' });

  try {
    const games = await listGames();
    assert.equal(games[0].slug, 'a');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchGameForPlay and fetchRouteStart call edge functions', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return {
      ok: true,
      async json() {
        if (url.includes('get-game')) return { game: { id: 'g1' } };
        return { location: { name: 'Start' } };
      },
    };
  };

  setUserConfigServiceRuntimeDeps({ supabaseUrl: 'https://db.test', supabaseAnonKey: 'anon' });

  try {
    const game = await fetchGameForPlay('slug');
    const start = await fetchRouteStart('route-1', 'token');
    assert.equal(game.id, 'g1');
    assert.equal(start.name, 'Start');
    assert.match(urls[0], /get-game$/);
    assert.match(urls[1], /get-route-start$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchGameForPlay throws on non-ok response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    statusText: 'Bad Request',
    async json() {
      return { error: 'broken' };
    },
  });

  setUserConfigServiceRuntimeDeps({ supabaseUrl: 'https://db.test', supabaseAnonKey: 'anon' });

  try {
    await assert.rejects(() => fetchGameForPlay('slug'), /broken/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchGameWithRoutes sorts routes and sanitizes route points', async () => {
  const calls = [];
  const gameResult = {
    data: {
      id: 'g1',
      slug: 'demo',
      display_name: 'Demo',
      logo_url: null,
      requires_payment: true,
      price_in_cents: 250,
      routes: [
        { id: 'r2', order_index: 2, display_name: 'R2', route: [{ name: 'A', lat: 1, lng: 2, letter: 'a' }] },
        { id: 'r1', order_index: 1, display_name: 'R1', route: [{ name: '', lat: null, lng: null, letter: '9' }] },
      ],
    },
    error: null,
  };

  const fakeSupabase = {
    from(table) {
      const call = { table };
      calls.push(call);
      if (table === 'games') return createFromBuilder(gameResult, call);
      if (table === 'game_final_answers') {
        return createFromBuilder({ data: { final_answer: 'SECRET' }, error: null }, call);
      }
      return createFromBuilder({ data: null, error: null }, call);
    },
  };

  setUserConfigServiceRuntimeDeps({ supabase: fakeSupabase });

  const game = await fetchGameWithRoutes('demo');
  assert.equal(calls[0].table, 'games');
  assert.equal(calls[1].table, 'game_final_answers');
  assert.equal(game.routes[0].id, 'r1');
  assert.equal(game.routes[0].route[0].letter.length, 1);
  assert.equal(game.final_answer, 'SECRET');
});

test('save/update/delete game and route operations send expected query-builder calls', async () => {
  const callLog = [];
  const fakeSupabase = {
    from(table) {
      const calls = { table };
      callLog.push(calls);

      if (table === 'games' && !calls._used) {
        calls._used = true;
        return createFromBuilder({ data: { id: 'g1' }, error: null }, calls);
      }
      if (table === 'routes') {
        return createFromBuilder({ data: { id: 'r1', order_index: 1, display_name: 'Route', route: [{ letter: 'a' }] }, error: null }, calls);
      }
      return createFromBuilder({ error: null }, calls);
    },
    storage: createStorage({}),
  };

  setUserConfigServiceRuntimeDeps({ supabase: fakeSupabase });

  const gameId = await saveGame('demo', 'Demo', true, 299.6);
  await saveGameLogo('demo', 'https://logo');
  await deleteGame('demo');
  const route = await createRoute('g1', 'Route', [{ name: 'A', lat: 1, lng: 2, letter: 'a' }], 1);
  await saveRoute('r1', 'Route 1', [{ name: 'B', lat: 1, lng: 2, letter: 'b' }]);
  await deleteRoute('r1');

  assert.equal(gameId, 'g1');
  assert.equal(route.id, 'r1');
  assert.equal(callLog[0].upsert.payload.price_in_cents, 300);
  const gamesUpsert = callLog.find((c) => c.table === 'games' && c.upsert);
  const finalAnswerUpsert = callLog.find((c) => c.table === 'game_final_answers' && c.upsert);
  const gamesLogoUpdate = callLog.find((c) => c.table === 'games' && c.update?.logo_url === 'https://logo');
  const gamesDelete = callLog.find((c) => c.table === 'games' && c.delete);
  const routeUpdate = callLog.find((c) => c.table === 'routes' && c.update?.display_name === 'Route 1');
  const routeDelete = callLog.find((c) => c.table === 'routes' && c.delete);

  assert.equal(Boolean(gamesUpsert), true);
  assert.equal(Boolean(finalAnswerUpsert), true);
  assert.equal(Boolean(gamesLogoUpdate), true);
  assert.equal(Boolean(gamesDelete), true);
  assert.equal(Boolean(routeUpdate), true);
  assert.equal(Boolean(routeDelete), true);
});

test('deleteGameBySlug re-export works', async () => {
  const calls = {};
  const fakeSupabase = {
    from() {
      return createFromBuilder({ error: null }, calls);
    },
  };
  setUserConfigServiceRuntimeDeps({ supabase: fakeSupabase });
  await assert.doesNotReject(() => deleteGameBySlug('demo'));
});

test('fetchGameStyles and saveGameStyles use game_styles table and field filtering', async () => {
  const calls = [];
  const fakeSupabase = {
    from(table) {
      const c = { table };
      calls.push(c);
      if (calls.length === 1) {
        return createFromBuilder({ data: { game_id: 'g1' }, error: null }, c);
      }
      return createFromBuilder({ error: null }, c);
    },
    storage: createStorage({}),
  };

  setUserConfigServiceRuntimeDeps({ supabase: fakeSupabase });

  const styles = await fetchGameStyles('g1');
  await saveGameStyles('g1', { primary_color: '#fff', unknown_key: 'x' });

  assert.equal(styles.game_id, 'g1');
  assert.equal(calls[0].table, 'game_styles');
  assert.equal(calls[1].upsert.payload.primary_color, '#fff');
  assert.equal(calls[1].upsert.payload.unknown_key, undefined);
});

test('upload logo/image and delete image path parsing work', async () => {
  const storageCalls = {};
  const fakeSupabase = {
    from() {
      return createFromBuilder({ error: null }, {});
    },
    storage: createStorage(storageCalls),
  };

  setUserConfigServiceRuntimeDeps({ supabase: fakeSupabase });

  const file = { name: 'pic.png', type: 'image/png' };
  const logoUrl = await uploadGameLogo(file, 'demo');
  const imageUrl = await uploadLocationImage(file, 'demo', 'route-1', 2);
  await deleteLocationImage('https://host/storage/v1/object/public/location-images/demo/route-1/file.png');
  await deleteLocationImage('https://host/invalid');

  assert.match(logoUrl, /https:\/\/cdn\.test\/logos\/demo\/logo-/);
  assert.match(imageUrl, /https:\/\/cdn\.test\/demo\/route-1\/2-/);
  assert.deepEqual(storageCalls.remove, ['demo/route-1/file.png']);
});

test('supabase-required methods throw when supabase is missing', async () => {
  setUserConfigServiceRuntimeDeps({ supabase: null });

  await assert.rejects(() => saveGame('s', 'n'), /Supabase is not configured/);
  await assert.rejects(() => saveGameLogo('s', 'u'), /Supabase is not configured/);
  await assert.rejects(() => deleteGame('s'), /Supabase is not configured/);
  await assert.rejects(() => fetchGameStyles('g'), /Supabase is not configured/);
  await assert.rejects(() => saveGameStyles('g', {}), /Supabase is not configured/);
  await assert.rejects(() => createRoute('g', 'r', [], 1), /Supabase is not configured/);
  await assert.rejects(() => saveRoute('r', 'n', []), /Supabase is not configured/);
  await assert.rejects(() => deleteRoute('r'), /Supabase is not configured/);
  await assert.rejects(() => uploadGameLogo({ name: 'a.jpg', type: 'image/jpeg' }, 's'), /Supabase is not configured/);
  await assert.rejects(() => uploadLocationImage({ name: 'a.jpg', type: 'image/jpeg' }, 's', 'r', 1), /Supabase is not configured/);

  await assert.doesNotReject(() => deleteLocationImage(''));
  await assert.equal(await fetchGameWithRoutes('demo'), null);
});

