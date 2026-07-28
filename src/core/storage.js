import { createDefaultState, normalizeState } from './timer-engine.js';

export const timerStateKey = 'foceroTimerState';

export async function getStoredState(now = Date.now()) {
  const stored = await chrome.storage.local.get(timerStateKey);
  return normalizeState(stored[timerStateKey] ?? createDefaultState(now), now);
}

export async function saveStoredState(state, now = Date.now()) {
  const normalized = normalizeState(state, now);
  await chrome.storage.local.set({
    [timerStateKey]: normalized,
  });
  return normalized;
}
