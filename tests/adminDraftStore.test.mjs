import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdminDraftPayload,
  clearAdminDraft,
  loadAdminDraft,
  saveAdminDraft,
} from '../src/admin/draftStore.js';

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('buildAdminDraftPayload normalizes fields and clones routes', () => {
  const sourceRoutes = [{ id: 'r1', route: [{ name: 'A' }] }];
  const payload = buildAdminDraftPayload({
    slug: 'demo',
    currentRouteIndex: 1,
    selectedRowIndex: 2,
    editDisplayName: 'Demo',
    requiresPayment: 1,
    priceEuros: 2.5,
    supportsOffline: true,
    finalQuestion: 'Q?',
    finalAnswer: 'A',
    currentGameStyles: { primary_color: '#fff' },
    routes: sourceRoutes,
    updatedAt: 123,
  });

  assert.equal(payload.v, 1);
  assert.equal(payload.slug, 'demo');
  assert.equal(payload.currentRouteIndex, 1);
  assert.equal(payload.selectedRowIndex, 2);
  assert.equal(payload.requiresPayment, true);
  assert.equal(payload.priceEuros, '2.5');
  assert.equal(payload.updatedAt, 123);
  assert.notEqual(payload.routes, sourceRoutes);
  assert.notEqual(payload.routes[0].route[0], sourceRoutes[0].route[0]);
});

test('save/load/clear admin draft lifecycle', () => {
  const storage = createMemoryStorage();
  const draft = buildAdminDraftPayload({ slug: 'demo', routes: [] });

  assert.equal(loadAdminDraft({ storage, slug: 'demo', userId: 'u1' }), null);

  const saved = saveAdminDraft({
    storage,
    slug: 'demo',
    userId: 'u1',
    draft,
  });
  assert.equal(saved, true);

  const loaded = loadAdminDraft({ storage, slug: 'demo', userId: 'u1' });
  assert.equal(loaded.slug, 'demo');

  clearAdminDraft({ storage, slug: 'demo', userId: 'u1' });
  assert.equal(loadAdminDraft({ storage, slug: 'demo', userId: 'u1' }), null);
});

test('loadAdminDraft rejects invalid payloads and isolates users', () => {
  const storage = createMemoryStorage({
    'letter-quest-admin-draft:anonymous:demo': '{broken',
    'letter-quest-admin-draft:u2:demo': JSON.stringify(buildAdminDraftPayload({ slug: 'demo', routes: [] })),
  });

  assert.equal(loadAdminDraft({ storage, slug: 'demo', userId: 'anonymous' }), null);
  assert.equal(loadAdminDraft({ storage, slug: 'demo', userId: 'u1' }), null);
  assert.equal(loadAdminDraft({ storage, slug: 'demo', userId: 'u2' })?.slug, 'demo');
});

