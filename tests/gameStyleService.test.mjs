import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultGameStyles,
  loadGameStyles,
  setGameStyleServiceRuntimeDeps,
} from '../src/gameStyleService.js';

function createRoot() {
  const values = new Map();
  return {
    style: {
      setProperty(name, value) {
        values.set(name, value);
      },
      get(name) {
        return values.get(name);
      },
    },
  };
}

test('loadGameStyles returns early when gameId is missing', async () => {
  const fakeSupabase = {
    from() {
      throw new Error('should not be called');
    },
  };
  setGameStyleServiceRuntimeDeps({ supabase: fakeSupabase, documentRef: { documentElement: createRoot() } });
  await assert.doesNotReject(() => loadGameStyles(''));
});

test('loadGameStyles applies mapped CSS vars when style row exists', async () => {
  const root = createRoot();
  const calls = {};
  const fakeSupabase = {
    from(table) {
      calls.table = table;
      return {
        select(value) {
          calls.select = value;
          return this;
        },
        eq(column, val) {
          calls.eq = [column, val];
          return this;
        },
        async maybeSingle() {
          return {
            data: {
              primary_color: '#111111',
              text_color: '#eeeeee',
              border_radius_md: '12px',
            },
            error: null,
          };
        },
      };
    },
  };

  setGameStyleServiceRuntimeDeps({ supabase: fakeSupabase, documentRef: { documentElement: root } });
  await loadGameStyles('game-1');

  assert.equal(calls.table, 'game_styles');
  assert.deepEqual(calls.eq, ['game_id', 'game-1']);
  assert.equal(root.style.get('--primary-color'), '#111111');
  assert.equal(root.style.get('--text-color'), '#eeeeee');
  assert.equal(root.style.get('--border-radius-md'), '12px');
});

test('loadGameStyles handles missing row and fetch errors gracefully', async () => {
  const root = createRoot();

  setGameStyleServiceRuntimeDeps({
    supabase: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: null, error: null };
          },
        };
      },
    },
    documentRef: { documentElement: root },
  });
  await assert.doesNotReject(() => loadGameStyles('game-1'));

  setGameStyleServiceRuntimeDeps({
    supabase: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: null, error: new Error('db') };
          },
        };
      },
    },
    documentRef: { documentElement: root },
  });
  await assert.doesNotReject(() => loadGameStyles('game-1'));
});

test('createDefaultGameStyles inserts row and returns data', async () => {
  const calls = {};
  const fakeSupabase = {
    from(table) {
      calls.table = table;
      return {
        insert(payload) {
          calls.insert = payload;
          return this;
        },
        select() {
          calls.select = true;
          return this;
        },
        async single() {
          return { data: { id: 'style-1' }, error: null };
        },
      };
    },
  };

  setGameStyleServiceRuntimeDeps({ supabase: fakeSupabase, documentRef: { documentElement: createRoot() } });
  const data = await createDefaultGameStyles('game-1');

  assert.equal(calls.table, 'game_styles');
  assert.deepEqual(calls.insert, [{ game_id: 'game-1' }]);
  assert.equal(data.id, 'style-1');
});

test('createDefaultGameStyles throws when supabase is missing or insert fails', async () => {
  setGameStyleServiceRuntimeDeps({ supabase: null, documentRef: { documentElement: createRoot() } });
  await assert.rejects(() => createDefaultGameStyles('game-1'), /Supabase is not configured/);

  setGameStyleServiceRuntimeDeps({
    supabase: {
      from() {
        return {
          insert() { return this; },
          select() { return this; },
          async single() {
            return { data: null, error: new Error('insert failed') };
          },
        };
      },
    },
    documentRef: { documentElement: createRoot() },
  });

  await assert.rejects(() => createDefaultGameStyles('game-1'), /insert failed/);
});

