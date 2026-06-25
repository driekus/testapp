export const ATTEMPTS_STORAGE_KEY = 'letter-quest-final-question-attempts';

export function buildAttemptScopeKey(gameId, playerSessionId) {
  return `${String(gameId ?? '')}::${String(playerSessionId ?? '')}`;
}

export function readAttemptStore(storageRef, key = ATTEMPTS_STORAGE_KEY) {
  try {
    const raw = storageRef?.getItem?.(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeAttemptStore(storageRef, nextStore, key = ATTEMPTS_STORAGE_KEY) {
  try {
    storageRef?.setItem?.(key, JSON.stringify(nextStore));
  } catch {
    // Ignore unavailable storage.
  }
}

export function getStoredAttemptForScope(store, scopeKey) {
  const scoped = store?.[scopeKey];
  if (!scoped || typeof scoped !== 'object') return null;
  return {
    answered: Boolean(scoped.answered),
    correct: Boolean(scoped.correct),
  };
}

export function rememberAttemptInStore(store, scopeKey, correct, nowMs = Date.now()) {
  const nextStore = { ...(store ?? {}) };
  nextStore[scopeKey] = {
    answered: true,
    correct: Boolean(correct),
    updatedAt: nowMs,
  };
  return nextStore;
}

