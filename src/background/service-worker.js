import {
  completeDuePhase,
  createDefaultState,
  formatTime,
  getBadgeText,
  getRemainingMs,
  normalizeState,
  pauseTimer,
  resetTimer,
  setPreset,
  skipPhase,
  startTimer,
} from '../core/timer-engine.js';
import { getStoredState, saveStoredState } from '../core/storage.js';

const timerAlarmName = 'focero:timer-complete';
const badgeAlarmName = 'focero:badge-refresh';
const offscreenUrl = 'src/offscreen/offscreen.html';

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === timerAlarmName) {
    await handleTimerAlarm();
    return;
  }

  if (alarm.name === badgeAlarmName) {
    const state = await getStoredState();
    await updateBadge(state);
    await scheduleAlarms(state);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => {
      console.error(error);
      sendResponse({ ok: false, error: error.message || 'Unexpected extension error' });
    });

  return true;
});

async function initializeExtension() {
  const state = await getStoredState();
  const resolved = state.status === 'running' && getRemainingMs(state) <= 0
    ? completeDuePhase(state)
    : state;

  await saveStoredState(resolved);
  await updateBadge(resolved);
  await scheduleAlarms(resolved);
}

async function handleMessage(message) {
  const type = message?.type;

  if (type === 'GET_STATE') {
    const state = await resolveCurrentState();
    return { state };
  }

  if (type === 'START') {
    return mutateTimer((state) => startTimer(state));
  }

  if (type === 'PAUSE') {
    return mutateTimer((state) => pauseTimer(state));
  }

  if (type === 'RESET') {
    return mutateTimer((state) => resetTimer(state));
  }

  if (type === 'SKIP') {
    return mutateTimer((state) => skipPhase(state));
  }

  if (type === 'SET_PRESET') {
    return mutateTimer((state) => setPreset(state, message.preset, Date.now(), message.custom));
  }

  if (type === 'PLAY_CHIME') {
    return {};
  }

  throw new Error(`Unsupported message type: ${type}`);
}

async function mutateTimer(mutator) {
  const previous = await getStoredState();
  const state = await saveStoredState(mutator(previous));

  await updateBadge(state);
  await scheduleAlarms(state);

  return { state };
}

async function resolveCurrentState() {
  const state = await getStoredState();

  if (state.status !== 'running' || getRemainingMs(state) > 0) {
    await updateBadge(state);
    return state;
  }

  return handleCompletedState(state);
}

async function handleTimerAlarm() {
  const state = await getStoredState();

  if (state.status !== 'running' || getRemainingMs(state) > 0) {
    await updateBadge(state);
    await scheduleAlarms(state);
    return;
  }

  await handleCompletedState(state);
}

async function handleCompletedState(state) {
  const completedPhase = state.phase;
  const completedState = await saveStoredState(completeDuePhase(state));

  await updateBadge(completedState);
  await scheduleAlarms(completedState);
  await showCompletionNotification(completedPhase, completedState);
  await playCompletionChime();

  return completedState;
}

async function scheduleAlarms(state) {
  await chrome.alarms.clear(timerAlarmName);
  await chrome.alarms.clear(badgeAlarmName);

  if (state.status !== 'running' || !state.endsAt) {
    return;
  }

  await chrome.alarms.create(timerAlarmName, {
    when: state.endsAt,
  });

  await chrome.alarms.create(badgeAlarmName, {
    periodInMinutes: 1,
  });
}

async function updateBadge(state) {
  const normalized = normalizeState(state);
  const badgeText = normalized.status === 'idle' ? '' : getBadgeText(normalized);
  const colorByPhase = {
    focus: '#d97706',
    break: '#059669',
  };

  await chrome.action.setBadgeText({ text: badgeText });
  await chrome.action.setBadgeBackgroundColor({
    color: normalized.status === 'paused' ? '#6b7280' : colorByPhase[normalized.phase],
  });
}

async function showCompletionNotification(completedPhase, nextState) {
  const isFocus = completedPhase === 'focus';
  const title = isFocus ? 'Focus session complete' : 'Break complete';
  const message = isFocus
    ? `Nice work. Your ${formatTime(nextState.remainingMs)} break is ready.`
    : `Ready for your next ${formatTime(nextState.remainingMs)} focus session.`;

  await chrome.notifications.create(`focero-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'assets/icons/icon128.png',
    title,
    message,
    priority: 1,
  });
}

async function playCompletionChime() {
  if (!chrome.offscreen?.createDocument) {
    return;
  }

  const hasDocument = await hasOffscreenDocument();

  if (!hasDocument) {
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play a short local completion chime when a focus timer ends.',
    });
  }

  await chrome.runtime.sendMessage({ type: 'PLAY_CHIME' });
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) {
    return false;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)],
  });

  return contexts.length > 0;
}
