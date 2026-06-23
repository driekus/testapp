import test from 'node:test';
import assert from 'node:assert/strict';

import { enforceMobileOnly, isMobileUserAgent } from '../src/mobileGuard.js';

test('isMobileUserAgent returns true for known mobile user agents', () => {
  assert.equal(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 8)'), true);
  assert.equal(isMobileUserAgent('Opera Mini/90.0.2254/191.249'), true);
});

test('isMobileUserAgent returns false for non-mobile user agents', () => {
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (X11; Linux x86_64)'), false);
  assert.equal(isMobileUserAgent(''), false);
});

test('enforceMobileOnly redirects non-mobile clients', () => {
  const calls = [];
  const locationRef = { replace: (path) => calls.push(path) };

  const redirected = enforceMobileOnly({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    location: locationRef,
    mobileOnlyPath: '/custom-mobile-only.html',
  });

  assert.equal(redirected, true);
  assert.deepEqual(calls, ['/custom-mobile-only.html']);
});

test('enforceMobileOnly does not redirect mobile clients', () => {
  const calls = [];
  const redirected = enforceMobileOnly({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
    location: { replace: (path) => calls.push(path) },
  });

  assert.equal(redirected, false);
  assert.deepEqual(calls, []);
});

test('enforceMobileOnly safely no-ops when no location object is available', () => {
  const redirected = enforceMobileOnly({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', location: null });
  assert.equal(redirected, false);
});

