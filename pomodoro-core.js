'use strict';

/*
 * Pomodoro state shared by the new tab page and the service worker.
 * The timer is stored as an end timestamp, so every open tab (and the
 * service worker) agrees on the time left without anyone ticking it.
 *
 * state = {
 *   mode: 'focus' | 'short' | 'long',
 *   running: boolean,
 *   endsAt: number | null,      // ms timestamp while running
 *   remaining: number,          // ms left while paused
 *   completed: number,          // focus sessions finished (long break after every 4)
 *   durations: { focus, short, long },  // minutes
 *   autoStart: boolean,         // start the next session automatically
 * }
 */
(function (root) {
  const MIN = 60 * 1000;
  const DEFAULT_DURATIONS = { focus: 25, short: 5, long: 15 };
  const LONG_EVERY = 4;
  const LABELS = { focus: 'Focus', short: 'Short break', long: 'Long break' };

  const full = (state, mode = state.mode) => state.durations[mode] * MIN;

  function normalize(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const durations = { ...DEFAULT_DURATIONS };
    for (const k of Object.keys(DEFAULT_DURATIONS)) {
      const v = Number(s.durations && s.durations[k]);
      if (v >= 1 && v <= 180) durations[k] = Math.round(v);
    }
    const mode = LABELS[s.mode] ? s.mode : 'focus';
    const state = {
      mode,
      running: !!s.running && Number.isFinite(s.endsAt),
      endsAt: Number.isFinite(s.endsAt) ? s.endsAt : null,
      remaining: Number.isFinite(s.remaining) ? s.remaining : durations[mode] * MIN,
      completed: Number.isInteger(s.completed) && s.completed >= 0 ? s.completed : 0,
      durations,
      autoStart: !!s.autoStart,
    };
    if (!state.running) state.endsAt = null;
    return state;
  }

  function remaining(state, now = Date.now()) {
    return state.running ? Math.max(0, state.endsAt - now) : state.remaining;
  }

  function start(state, now = Date.now()) {
    if (state.running) return state;
    return { ...state, running: true, endsAt: now + state.remaining };
  }

  function pause(state, now = Date.now()) {
    if (!state.running) return state;
    return { ...state, running: false, endsAt: null, remaining: remaining(state, now) };
  }

  function setMode(state, mode) {
    return { ...state, mode, running: false, endsAt: null, remaining: full(state, mode) };
  }

  const reset = state => setMode(state, state.mode);

  /* Move to the next session. `finished` = the session ran to zero (counts toward the long break). */
  function advance(state, { finished = true, now = Date.now() } = {}) {
    let completed = state.completed;
    let next;
    if (state.mode === 'focus') {
      if (finished) completed += 1;
      next = finished && completed % LONG_EVERY === 0 ? 'long' : 'short';
    } else {
      next = 'focus';
    }
    let s = setMode({ ...state, completed }, next);
    if (finished && state.autoStart) s = start(s, now);
    return s;
  }

  function format(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function notificationText(prev, next) {
    if (prev.mode === 'focus') {
      return {
        title: 'Focus session done',
        message: `Time for a ${next.durations[next.mode]}-minute ${next.mode === 'long' ? 'long ' : ''}break.`,
      };
    }
    return { title: 'Break’s over', message: `Ready for ${next.durations.focus} minutes of focus?` };
  }

  root.Pomo = {
    KEY: 'pomodoro', LABELS, LONG_EVERY, DEFAULT_DURATIONS,
    normalize, remaining, start, pause, setMode, reset, advance, format, full, notificationText,
  };
})(typeof self !== 'undefined' ? self : window);
