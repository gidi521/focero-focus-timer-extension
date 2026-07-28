import { formatTime, getProgress, getRemainingMs, normalizeState } from '../core/timer-engine.js';

const elements = {
  phaseChip: document.querySelector('#phaseChip'),
  timeReadout: document.querySelector('#timeReadout'),
  progressRing: document.querySelector('#progressRing'),
  sessionLabel: document.querySelector('#sessionLabel'),
  presetButtons: Array.from(document.querySelectorAll('.preset-button')),
  customPanel: document.querySelector('#customPanel'),
  focusMinutes: document.querySelector('#focusMinutes'),
  breakMinutes: document.querySelector('#breakMinutes'),
  saveCustomButton: document.querySelector('#saveCustomButton'),
  startPauseButton: document.querySelector('#startPauseButton'),
  resetButton: document.querySelector('#resetButton'),
  skipButton: document.querySelector('#skipButton'),
  todayCount: document.querySelector('#todayCount'),
};

let timerState = null;
let renderInterval = null;

boot();

function boot() {
  bindEvents();
  refreshState();
  renderInterval = window.setInterval(renderCurrentState, 1000);
  window.addEventListener('unload', () => {
    window.clearInterval(renderInterval);
  });
}

function bindEvents() {
  elements.startPauseButton.addEventListener('click', async () => {
    await sendTimerMessage(timerState?.status === 'running' ? 'PAUSE' : 'START');
  });

  elements.resetButton.addEventListener('click', async () => {
    await sendTimerMessage('RESET');
  });

  elements.skipButton.addEventListener('click', async () => {
    await sendTimerMessage('SKIP');
  });

  elements.saveCustomButton.addEventListener('click', async () => {
    await setPreset('custom');
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      await setPreset(button.dataset.preset);
    });
  });
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

  if (!response?.ok) {
    renderError(response?.error ?? 'Timer could not load.');
    return;
  }

  timerState = normalizeState(response.state);
  renderCurrentState();
}

async function sendTimerMessage(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });

  if (!response?.ok) {
    renderError(response?.error ?? 'Timer action failed.');
    return;
  }

  timerState = normalizeState(response.state);
  renderCurrentState();
}

async function setPreset(preset) {
  const custom = preset === 'custom'
    ? {
        focusMinutes: elements.focusMinutes.value,
        breakMinutes: elements.breakMinutes.value,
      }
    : undefined;

  await sendTimerMessage('SET_PRESET', { preset, custom });
}

function renderCurrentState() {
  if (!timerState) {
    return;
  }

  const state = normalizeState(timerState);
  const remainingMs = getRemainingMs(state);
  const progress = getProgress(state);
  const isBreak = state.phase === 'break';
  const presetLabel = getPresetLabel(state);

  elements.timeReadout.textContent = formatTime(remainingMs);
  elements.phaseChip.textContent = isBreak ? 'Break' : 'Focus';
  elements.phaseChip.style.color = isBreak ? '#047857' : '#9a5a25';
  elements.sessionLabel.textContent = `${presetLabel} · Session ${state.cycle}`;
  elements.progressRing.style.setProperty('--progress', `${Math.round(progress * 360)}deg`);
  elements.progressRing.style.setProperty('--ring-color', isBreak ? '#059669' : '#d97706');
  elements.startPauseButton.textContent = state.status === 'running'
    ? 'Pause'
    : state.status === 'paused'
      ? 'Continue'
      : 'Start';
  elements.customPanel.hidden = state.preset !== 'custom';
  elements.focusMinutes.value = state.config.focusMinutes;
  elements.breakMinutes.value = state.config.breakMinutes;
  elements.todayCount.textContent = `Today · ${state.today.completedFocusSessions} focus ${state.today.completedFocusSessions === 1 ? 'session' : 'sessions'}`;
  document.body.classList.toggle('break-mode', isBreak);

  elements.presetButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.preset === state.preset);
  });
}

function renderError(message) {
  elements.sessionLabel.textContent = message;
}

function getPresetLabel(state) {
  if (state.preset === 'deep') {
    return 'Deep 50/10';
  }

  if (state.preset === 'custom') {
    return `${state.config.focusMinutes}/${state.config.breakMinutes} custom`;
  }

  return 'Classic 25/5';
}
