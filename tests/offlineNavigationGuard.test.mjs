import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addOfflineBeforeUnloadGuard,
  confirmOfflineNavigation,
  isOffline,
  runWithOfflineUnloadBypass,
} from '../src/offlineNavigationGuard.js';

test('isOffline matches navigator.onLine state', () => {
  assert.equal(isOffline({ onLine: false }), true);
  assert.equal(isOffline({ onLine: true }), false);
  assert.equal(isOffline(undefined), false);
});

test('confirmOfflineNavigation skips confirm online and confirms offline', () => {
  let called = 0;
  const allowOnline = confirmOfflineNavigation({
    navigatorRef: { onLine: true },
    confirmRef: () => {
      called += 1;
      return false;
    },
    message: 'offline?',
  });
  assert.equal(allowOnline, true);
  assert.equal(called, 0);

  const allowOffline = confirmOfflineNavigation({
    navigatorRef: { onLine: false },
    confirmRef: () => {
      called += 1;
      return true;
    },
    message: 'offline?',
  });
  assert.equal(allowOffline, true);
  assert.equal(called, 1);
});

test('addOfflineBeforeUnloadGuard sets returnValue only while offline', () => {
  let handler = null;
  const windowRef = {
    addEventListener(name, fn) {
      if (name === 'beforeunload') handler = fn;
    },
    removeEventListener() {},
  };

  const cleanup = addOfflineBeforeUnloadGuard({
    windowRef,
    navigatorRef: { onLine: false },
    message: 'offline warning',
  });

  assert.equal(typeof handler, 'function');

  const event = {
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  handler(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, 'offline warning');

  cleanup();
});

test('runWithOfflineUnloadBypass suppresses one unload prompt', () => {
  let handler = null;
  let scheduled = null;
  const windowRef = {
    addEventListener(name, fn) {
      if (name === 'beforeunload') handler = fn;
    },
    removeEventListener() {},
    setTimeout(fn) {
      scheduled = fn;
      return 0;
    },
  };

  addOfflineBeforeUnloadGuard({
    windowRef,
    navigatorRef: { onLine: false },
    message: 'offline warning',
  });

  runWithOfflineUnloadBypass({
    windowRef,
    navigate: () => {
      const eventDuringNav = {
        returnValue: undefined,
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
      };
      handler(eventDuringNav);
      assert.equal(eventDuringNav.prevented, false);
      assert.equal(eventDuringNav.returnValue, undefined);
    },
  });

  scheduled?.();
  const eventAfterBypass = {
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  handler(eventAfterBypass);
  assert.equal(eventAfterBypass.prevented, true);
  assert.equal(eventAfterBypass.returnValue, 'offline warning');
});


