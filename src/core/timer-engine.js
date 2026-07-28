const minuteMs = 60_000;
const maxTimerMinutes = 180;
const minTimerMinutes = 1;

export const presets = {
  classic: {
    id: 'classic',
    label: '25/5',
    focusMinutes: 25,
    breakMinutes: 5,
  },
  deep: {
    id: 'deep',
    label: '50/10',
    focusMinutes: 50,
    breakMinutes: 10,
  },
};

export function createDefaultState(now = Date.now()) {
  return {
    version: 1,
    status: 'idle',
    phase: 'focus',
    preset: 'classic',
    config: {
      focusMinutes: presets.classic.focusMinutes,
      breakMinutes: presets.classic.breakMinutes,
    },
    cycle: 1,
    remainingMs: presets.classic.focusMinutes * minuteMs,
    startedAt: null,
    endsAt: null,
    updatedAt: now,
    today: {
      date: getLocalDateKey(now),
      completedFocusSessions: 0,
    },
  };
}

export function normalizeState(candidate, now = Date.now()) {
  const base = createDefaultState(now);
  const merged = {
    ...base,
    ...(candidate && typeof candidate === 'object' ? candidate : {}),
    config: {
      ...base.config,
      ...(candidate?.config && typeof candidate.config === 'object' ? candidate.config : {}),
    },
    today: {
      ...base.today,
      ...(candidate?.today && typeof candidate.today === 'object' ? candidate.today : {}),
    },
  };

  merged.status = ['idle', 'running', 'paused'].includes(merged.status) ? merged.status : 'idle';
  merged.phase = ['focus', 'break'].includes(merged.phase) ? merged.phase : 'focus';
  merged.preset = ['classic', 'deep', 'custom'].includes(merged.preset) ? merged.preset : 'classic';
  merged.config.focusMinutes = clampMinutes(merged.config.focusMinutes);
  merged.config.breakMinutes = clampMinutes(merged.config.breakMinutes);
  merged.cycle = Number.isFinite(merged.cycle) && merged.cycle > 0 ? Math.floor(merged.cycle) : 1;
  merged.remainingMs = clampRemainingMs(merged.remainingMs, getPhaseDurationMs(merged));
  merged.startedAt = Number.isFinite(merged.startedAt) ? merged.startedAt : null;
  merged.endsAt = Number.isFinite(merged.endsAt) ? merged.endsAt : null;
  merged.updatedAt = Number.isFinite(merged.updatedAt) ? merged.updatedAt : now;
  merged.today.completedFocusSessions = Number.isFinite(merged.today.completedFocusSessions)
    ? Math.max(0, Math.floor(merged.today.completedFocusSessions))
    : 0;

  return rollToday(merged, now);
}

export function startTimer(state, now = Date.now()) {
  const normalized = normalizeState(state, now);
  const remainingMs = getRemainingMs(normalized, now) || getPhaseDurationMs(normalized);

  return {
    ...normalized,
    status: 'running',
    startedAt: now,
    endsAt: now + remainingMs,
    remainingMs,
    updatedAt: now,
  };
}

export function pauseTimer(state, now = Date.now()) {
  const normalized = normalizeState(state, now);

  if (normalized.status !== 'running') {
    return normalized;
  }

  return {
    ...normalized,
    status: 'paused',
    remainingMs: getRemainingMs(normalized, now),
    startedAt: null,
    endsAt: null,
    updatedAt: now,
  };
}

export function resetTimer(state, now = Date.now()) {
  const normalized = normalizeState(state, now);

  return {
    ...normalized,
    status: 'idle',
    phase: 'focus',
    cycle: Math.max(1, normalized.cycle),
    remainingMs: normalized.config.focusMinutes * minuteMs,
    startedAt: null,
    endsAt: null,
    updatedAt: now,
  };
}

export function skipPhase(state, now = Date.now()) {
  return advancePhase(normalizeState(state, now), now, false);
}

export function completeDuePhase(state, now = Date.now()) {
  const normalized = normalizeState(state, now);

  if (normalized.status === 'running' && getRemainingMs(normalized, now) > 0) {
    return normalized;
  }

  return advancePhase(normalized, now, normalized.phase === 'focus');
}

export function setPreset(state, presetId, now = Date.now(), customConfig = {}) {
  const normalized = normalizeState(state, now);
  const preset = presets[presetId];
  const config = preset
    ? {
        focusMinutes: preset.focusMinutes,
        breakMinutes: preset.breakMinutes,
      }
    : {
        focusMinutes: clampMinutes(customConfig.focusMinutes ?? normalized.config.focusMinutes),
        breakMinutes: clampMinutes(customConfig.breakMinutes ?? normalized.config.breakMinutes),
      };

  return {
    ...normalized,
    status: 'idle',
    phase: 'focus',
    preset: preset ? preset.id : 'custom',
    config,
    remainingMs: config.focusMinutes * minuteMs,
    startedAt: null,
    endsAt: null,
    updatedAt: now,
  };
}

export function getRemainingMs(state, now = Date.now()) {
  const normalized = normalizeState(state, now);

  if (normalized.status === 'running' && normalized.endsAt) {
    return Math.max(0, normalized.endsAt - now);
  }

  return Math.max(0, normalized.remainingMs);
}

export function getPhaseDurationMs(state, phase = state.phase) {
  const config = state?.config ?? createDefaultState().config;
  return (phase === 'break' ? config.breakMinutes : config.focusMinutes) * minuteMs;
}

export function getProgress(state, now = Date.now()) {
  const normalized = normalizeState(state, now);
  const durationMs = getPhaseDurationMs(normalized);

  if (!durationMs) {
    return 0;
  }

  return Math.min(1, Math.max(0, 1 - getRemainingMs(normalized, now) / durationMs));
}

export function getBadgeText(state, now = Date.now()) {
  const normalized = normalizeState(state, now);
  const remainingMs = getRemainingMs(normalized, now);

  if (!remainingMs) {
    return '0m';
  }

  return `${Math.max(1, Math.ceil(remainingMs / minuteMs))}m`.slice(0, 4);
}

export function formatTime(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getLocalDateKey(now = Date.now()) {
  const localDate = new Date(now);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function advancePhase(state, now, countCompletedFocus) {
  const today = rollToday(state, now).today;
  const completedFocusSessions = countCompletedFocus
    ? today.completedFocusSessions + 1
    : today.completedFocusSessions;
  const nextPhase = state.phase === 'focus' ? 'break' : 'focus';
  const nextCycle = state.phase === 'break' ? state.cycle + 1 : state.cycle;
  const nextState = {
    ...state,
    today: {
      ...today,
      completedFocusSessions,
    },
    phase: nextPhase,
    cycle: nextCycle,
    status: 'idle',
    startedAt: null,
    endsAt: null,
    updatedAt: now,
  };

  return {
    ...nextState,
    remainingMs: getPhaseDurationMs(nextState, nextPhase),
  };
}

function rollToday(state, now) {
  const date = getLocalDateKey(now);

  if (state.today?.date === date) {
    return state;
  }

  return {
    ...state,
    today: {
      date,
      completedFocusSessions: 0,
    },
  };
}

function clampMinutes(value) {
  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return minTimerMinutes;
  }

  return Math.min(maxTimerMinutes, Math.max(minTimerMinutes, Math.round(minutes)));
}

function clampRemainingMs(value, fallback) {
  const remainingMs = Number(value);

  if (!Number.isFinite(remainingMs) || remainingMs < 0) {
    return fallback;
  }

  return Math.min(maxTimerMinutes * minuteMs, remainingMs);
}
