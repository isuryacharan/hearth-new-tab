'use strict';

/* Pomodoro panel. State lives in storage (see pomodoro-core.js); the service worker finishes sessions. */
(() => {
  const store = window.appStore;
  const Pomo = window.Pomo;
  const hasWorker = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage;

  const panel = document.querySelector('.pomo');
  const els = {
    time: document.getElementById('pomo-time'),
    progress: document.getElementById('pomo-progress'),
    start: document.getElementById('pomo-start'),
    reset: document.getElementById('pomo-reset'),
    skip: document.getElementById('pomo-skip'),
    dots: document.getElementById('pomo-dots'),
    modes: [...document.querySelectorAll('.pomo-modes [data-mode]')],
    settingsBtn: document.getElementById('pomo-settings'),
    form: document.getElementById('pomo-form'),
    focus: document.getElementById('pomo-focus'),
    short: document.getElementById('pomo-short'),
    long: document.getElementById('pomo-long'),
    auto: document.getElementById('pomo-auto'),
    resetCount: document.getElementById('pomo-reset-count'),
  };

  const baseTitle = document.title;
  let state = Pomo.normalize(null);
  let timer = null;
  let askedFor = null; // endsAt we already asked the worker to finish

  async function save(next) {
    state = next;
    render();
    await store.set(Pomo.KEY, state);
  }

  /* ---------- rendering ---------- */

  function render() {
    panel.dataset.mode = state.mode;
    els.modes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    els.start.textContent = state.running ? 'Pause' : state.remaining < Pomo.full(state) ? 'Resume' : 'Start';

    const cycle = state.completed % Pomo.LONG_EVERY;
    const dots = [];
    for (let i = 0; i < Pomo.LONG_EVERY; i++) {
      const d = document.createElement('i');
      if (i < cycle) d.className = 'on';
      dots.push(d);
    }
    els.dots.replaceChildren(...dots);
    els.dots.title = `${state.completed} focus session${state.completed === 1 ? '' : 's'} completed · long break after ${Pomo.LONG_EVERY}`;

    if (els.form.hidden) {
      els.focus.value = state.durations.focus;
      els.short.value = state.durations.short;
      els.long.value = state.durations.long;
      els.auto.checked = state.autoStart;
    }

    tick();
    clearInterval(timer);
    timer = state.running ? setInterval(tick, 250) : null;
  }

  function tick() {
    const left = Pomo.remaining(state);
    const text = Pomo.format(left);
    els.time.textContent = text;
    els.progress.style.width = `${(1 - left / Pomo.full(state)) * 100}%`;
    document.title = state.running ? `${text} · ${Pomo.LABELS[state.mode]}` : baseTitle;

    const started = state.running || state.remaining < Pomo.full(state);
    window.Dock?.setStatus('pomo', started
      ? { text, tone: state.running ? state.mode : 'paused', title: `${Pomo.LABELS[state.mode]} ${state.running ? 'running' : 'paused'} · ${text} left` }
      : { title: `Ready for ${Pomo.LABELS[state.mode].toLowerCase()} (${Pomo.format(Pomo.full(state))})` });

    if (state.running && left <= 0) finish();
  }

  function finish() {
    if (hasWorker) {
      // The worker completes the session and notifies; storage.onChanged brings the new state here.
      if (askedFor === state.endsAt) return;
      askedFor = state.endsAt;
      chrome.runtime.sendMessage({ type: 'pomodoro-check' }).catch(() => {});
    } else {
      save(Pomo.advance(state, { finished: true })); // preview outside the extension
    }
  }

  /* ---------- controls ---------- */

  els.start.addEventListener('click', () => save(state.running ? Pomo.pause(state) : Pomo.start(state)));
  els.reset.addEventListener('click', () => save(Pomo.reset(state)));
  els.skip.addEventListener('click', () => save(Pomo.advance(state, { finished: false })));

  // Actions for the command palette.
  window.Pomodoro = {
    /** Start a fresh session of the given type ('focus' | 'short' | 'long'). */
    start: mode => save(Pomo.start(Pomo.setMode(state, mode))),
    /** Pause if running, otherwise start/resume. Returns true if it is now running. */
    toggle: async () => { await save(state.running ? Pomo.pause(state) : Pomo.start(state)); return state.running; },
    reset: () => save(Pomo.reset(state)),
    skip: () => save(Pomo.advance(state, { finished: false })),
    status: () => ({ ...state, left: Pomo.format(Pomo.remaining(state)), label: Pomo.LABELS[state.mode] }),
    durations: () => state.durations,
  };
  els.modes.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode !== state.mode) save(Pomo.setMode(state, b.dataset.mode));
  }));

  els.settingsBtn.addEventListener('click', () => {
    const open = els.form.hidden;
    if (open) render(); // refresh values before showing
    els.form.hidden = !open;
    els.settingsBtn.setAttribute('aria-expanded', String(open));
  });

  els.form.addEventListener('submit', e => e.preventDefault());
  els.form.addEventListener('change', e => {
    if (e.target === els.auto) return save({ ...state, autoStart: els.auto.checked });
    const durations = { ...state.durations };
    for (const k of ['focus', 'short', 'long']) {
      const v = Math.round(Number(els[k].value));
      if (v >= 1 && v <= 180) durations[k] = v;
      else els[k].value = durations[k];
    }
    let next = { ...state, durations };
    // An untouched timer follows the new length; a started one keeps its time left.
    if (!state.running && state.remaining === Pomo.full(state)) next = Pomo.reset(next);
    save(next);
  });

  els.resetCount.addEventListener('click', () => save({ ...state, completed: 0 }));

  /* ---------- sync ---------- */

  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[Pomo.KEY]) {
        state = Pomo.normalize(changes[Pomo.KEY].newValue);
        render();
      }
    });
  }

  (async () => {
    state = Pomo.normalize(await store.get(Pomo.KEY, null));
    render();
  })();
})();
