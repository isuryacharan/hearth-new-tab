'use strict';

/*
 * Two-page stage (home ↔ bookmarks) driven by one progress value, --p (0 = home, 1 = bookmarks).
 *
 * - A spring (Apple-style: response 0.55 s, damping 0.825) animates --p, so motion eases in,
 *   carries momentum and settles with a hint of overshoot.
 * - Trackpad swipes move --p 1:1 with your fingers; on release the spring takes over with the
 *   gesture's velocity. A mouse-wheel notch is a short, fast gesture, so it flips the page too.
 * - Everything visual (parallax, scale, blur, fade, staggered tiles, wallpaper zoom) is CSS
 *   computed from --p, so it all moves in lockstep with the spring.
 */
(() => {
  const stage = document.getElementById('stage');
  const home = document.getElementById('page-home');
  const marks = document.getElementById('page-bookmarks');
  const drawer = document.getElementById('drawer');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Spring constants from Apple's (response, dampingFraction) parameterisation.
  const RESPONSE = 0.55;
  const DAMPING = 0.825;
  const OMEGA = (2 * Math.PI) / RESPONSE;
  const STIFFNESS = OMEGA * OMEGA;
  const FRICTION = 2 * DAMPING * OMEGA;

  const state = {
    p: 0,          // displayed progress
    raw: 0,        // progress before rubber-banding (while dragging)
    v: 0,          // velocity, progress per second
    target: 0,
    mode: 'idle',  // 'idle' | 'drag' | 'spring'
    raf: 0,
  };
  const listeners = new Set();

  // --p is set only on the elements that use it, not on <html>, so each frame restyles just the
  // moving parts instead of the whole page (dock, drawer, widgets…).
  const consumers = [stage, document.getElementById('bg'), document.getElementById('bg-depth')];

  function setP(p) {
    state.p = p;
    const value = p.toFixed(4);
    for (const el of consumers) el.style.setProperty('--p', value);
  }

  function setMoving(on) {
    stage.classList.toggle('moving', on);
    document.body.classList.toggle('page-moving', on); // pauses frosted-glass blur (see CSS)
  }

  function settled(target) {
    // Only the page you're on takes focus / clicks.
    home.inert = target === 1;
    marks.inert = target === 0;
    setMoving(false);
    stage.dataset.page = target === 1 ? 'bookmarks' : 'home';
    listeners.forEach(fn => fn(stage.dataset.page));
  }

  /* ---------- spring ---------- */

  function animateTo(target, velocity = state.v) {
    state.target = target;
    state.v = velocity;
    home.inert = false;
    marks.inert = false;
    cancelAnimationFrame(state.raf);

    if (reducedMotion.matches) {
      setP(target);
      state.v = 0;
      state.mode = 'idle';
      settled(target);
      return;
    }

    state.mode = 'spring';
    setMoving(true);
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      // integrate in small fixed steps for stability regardless of frame rate
      const steps = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / steps;
      let x = state.p;
      let v = state.v;
      for (let i = 0; i < steps; i++) {
        const a = -STIFFNESS * (x - target) - FRICTION * v;
        v += a * h;
        x += v * h;
      }
      state.v = v;
      if (Math.abs(x - target) < 0.0004 && Math.abs(v) < 0.004) {
        setP(target);
        state.v = 0;
        state.mode = 'idle';
        settled(target);
        return;
      }
      setP(x);
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);

    // Safety net: if frames are throttled (background tab, odd environments), still arrive.
    clearTimeout(state.safety);
    state.safety = setTimeout(() => {
      if (state.mode === 'spring' && state.target === target) {
        cancelAnimationFrame(state.raf);
        setP(target);
        state.v = 0;
        state.mode = 'idle';
        settled(target);
      }
    }, 1600);
  }

  /* ---------- wheel / trackpad ---------- */

  const DISTANCE = () => Math.max(420, innerHeight * 0.75); // px of scrolling for a full page
  const rubber = x => (x < 0 ? -rubberDist(-x) : x > 1 ? 1 + rubberDist(x - 1) : x);
  const rubberDist = d => (1 - 1 / (d * 2.2 + 1)) * 0.12; // resists, tops out at ~12 %

  let lastWheel = 0;
  let gesture = 0;
  let lockedGesture = -1;
  let fromPage = 0;
  let samples = [];
  let releaseTimer = null;

  function normalizeDelta(e) {
    if (e.deltaMode === 1) return e.deltaY * 16;          // lines
    if (e.deltaMode === 2) return e.deltaY * innerHeight; // pages
    return e.deltaY;
  }

  function release() {
    const now = performance.now();
    const recent = samples.filter(s => now - s.t < 120);
    const span = recent.length > 1 ? Math.max(0.03, (recent[recent.length - 1].t - recent[0].t) / 1000) : 0.05;
    const velocity = recent.reduce((sum, s) => sum + s.d, 0) / DISTANCE() / span; // progress / s

    // A flick needs both speed and a little distance, so an accidental nudge springs back.
    const moved = Math.abs(state.raw - fromPage);
    let target;
    if (Math.abs(velocity) > 0.7 && moved > 0.06) target = velocity > 0 ? 1 : 0;
    else target = state.p > 0.5 ? 1 : 0;

    // A flip swallows the rest of that gesture (trackpad momentum), so it can't overshoot into scrolling.
    if (target !== fromPage) lockedGesture = gesture;
    animateTo(target, Math.max(-6, Math.min(6, velocity)));
  }

  window.addEventListener('wheel', e => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch-zoom / sideways
    if (e.composedPath().includes(drawer)) return;                    // the drawer scrolls itself

    const now = e.timeStamp || performance.now();
    if (now - lastWheel > 220) gesture++; // a pause starts a new gesture
    lastWheel = now;
    if (gesture === lockedGesture) { e.preventDefault(); return; }

    const delta = normalizeDelta(e);
    const onBookmarks = state.mode === 'drag' ? fromPage === 1 : state.target === 1;

    if (state.mode !== 'drag') {
      if (!onBookmarks) {
        // Searching on home: let long result lists scroll normally.
        if (home.classList.contains('searching') && home.scrollHeight > home.clientHeight) return;
        if (delta < 0) return; // nothing above home
      } else {
        // On the bookmarks page, scroll the grid unless we're at its top pulling down.
        if (marks.scrollTop > 0 || delta > 0) return;
      }
      // start a drag
      cancelAnimationFrame(state.raf);
      state.mode = 'drag';
      state.raw = state.p;
      fromPage = onBookmarks ? 1 : 0;
      samples = [];
      home.inert = false;
      marks.inert = false;
      setMoving(true);
    }

    e.preventDefault();
    state.raw += delta / DISTANCE();
    state.raw = Math.max(-0.5, Math.min(1.5, state.raw));
    setP(rubber(state.raw));
    samples.push({ t: performance.now(), d: delta });
    if (samples.length > 20) samples.shift();

    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(release, 90);
  }, { passive: false });

  /* ---------- keyboard ---------- */

  const isTyping = el => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (e.target.closest && e.target.closest('#drawer, #dock')) return;
    const down = ['PageDown', 'ArrowDown', ' '].includes(e.key) && !e.shiftKey;
    const up = ['PageUp', 'ArrowUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (state.target === 0 && down) { e.preventDefault(); go('bookmarks'); }
    else if (state.target === 1 && up && marks.scrollTop <= 0) { e.preventDefault(); go('home'); }
  });

  /* ---------- API ---------- */

  function go(page, { animate = true } = {}) {
    const target = page === 'bookmarks' ? 1 : 0;
    if (!animate) {
      cancelAnimationFrame(state.raf);
      state.mode = 'idle';
      state.target = target;
      state.v = 0;
      setP(target);
      settled(target);
      return;
    }
    if (state.target === target && state.mode === 'idle') return;
    if (target === 1) marks.scrollTop = 0;
    animateTo(target, state.mode === 'spring' ? state.v : 0);
  }

  setP(0);
  settled(0);

  window.Pages = {
    go,
    current: () => (state.target === 1 ? 'bookmarks' : 'home'),
    onChange: fn => listeners.add(fn),
  };
})();
