import test from 'node:test';
import assert from 'node:assert/strict';

import { loadAdminBoot, startAdminEntry } from '../src/admin/entry.js';

test('loadAdminBoot uses default or custom importer', async () => {
  const marker = { ok: true };
  const loaded = await loadAdminBoot(() => Promise.resolve(marker));
  assert.equal(loaded, marker);
});

test('startAdminEntry forwards custom importer', async () => {
  const marker = { booted: true };
  const loaded = await startAdminEntry({ importer: () => Promise.resolve(marker) });
  assert.equal(loaded, marker);
});

