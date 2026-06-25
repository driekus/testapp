const OFFLINE_UNLOAD_BYPASS_KEY = '__letterQuestOfflineUnloadBypass';

/**
 * True when browser reports no internet connectivity.
 * @param {{ onLine?: boolean } | undefined | null} navigatorRef
 * @returns {boolean}
 */
export function isOffline(navigatorRef) {
  return navigatorRef?.onLine === false;
}

/**
 * Ask for confirmation before navigating away while offline.
 * @param {object} deps
 * @param {{ onLine?: boolean } | undefined | null} deps.navigatorRef
 * @param {((message: string) => boolean) | undefined | null} deps.confirmRef
 * @param {string} deps.message
 * @returns {boolean}
 */
export function confirmOfflineNavigation({ navigatorRef, confirmRef, message }) {
  if (!isOffline(navigatorRef)) return true;
  if (typeof confirmRef !== 'function') return false;
  return confirmRef(message);
}

/**
 * Execute a navigation callback while temporarily bypassing the offline
 * `beforeunload` prompt to avoid double-confirm flows.
 * @param {object} deps
 * @param {{ setTimeout?: Function } | undefined | null} deps.windowRef
 * @param {() => void} deps.navigate
 */
export function runWithOfflineUnloadBypass({ windowRef, navigate }) {
  if (!windowRef) {
    navigate();
    return;
  }

  windowRef[OFFLINE_UNLOAD_BYPASS_KEY] = true;
  try {
    navigate();
  } finally {
    const clearFlag = () => {
      windowRef[OFFLINE_UNLOAD_BYPASS_KEY] = false;
    };
    if (typeof windowRef.setTimeout === 'function') {
      windowRef.setTimeout(clearFlag, 0);
    } else {
      clearFlag();
    }
  }
}

/**
 * Register a `beforeunload` warning that only triggers while offline.
 * @param {object} deps
 * @param {{ addEventListener?: Function, removeEventListener?: Function } | undefined | null} deps.windowRef
 * @param {{ onLine?: boolean } | undefined | null} deps.navigatorRef
 * @param {string} deps.message
 * @param {() => boolean} [deps.shouldGuard]
 * @returns {() => void} cleanup callback
 */
export function addOfflineBeforeUnloadGuard({
  windowRef,
  navigatorRef,
  message,
  shouldGuard = () => true,
}) {
  if (!windowRef?.addEventListener) return () => {};

  const onBeforeUnload = (event) => {
    if (windowRef[OFFLINE_UNLOAD_BYPASS_KEY]) return;
    if (!shouldGuard() || !isOffline(navigatorRef)) return;
    event.preventDefault();
    event.returnValue = message;
    return message;
  };

  windowRef.addEventListener('beforeunload', onBeforeUnload);
  return () => windowRef.removeEventListener?.('beforeunload', onBeforeUnload);
}


