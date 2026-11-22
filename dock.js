'use strict';

/*
 * Dock + drawer.
 * - The dock is a row of chips; each shows live status from its widget (Dock.setStatus).
 * - Clicking a chip (or pressing its letter key) opens that widget in the drawer and focuses its input.
 * - Pinning keeps the drawer open on every new tab (and, on wide screens, beside the content).
 */
(() => {
  const store = window.appStore;
  const dock = document.getElementById('dock');
  const drawer = document.getElementById('drawer');
  const tabsEl = drawer.querySelector('.drawer-tabs');
  const pinBtn = document.getElementById('drawer-pin');
  const closeBtn = document.getElementById('drawer-close');
  const chips = [...dock.querySelectorAll('.dock-chip')];
  const panels = Object.fromEntries([...drawer.querySelectorAll('section[data-panel]')].map(p => [p.dataset.panel, p]));

  // Where focus lands when a widget opens, so you can type straight away.
  const FOCUS = {
    weather: () => (document.getElementById('weather-form').hidden ? null : document.getElementById('weather-city')),
    pomo: () => document.getElementById('pomo-start'),
    calendar: () => document.getElementById('cal-text'),
    todo: () => document.getElementById('todo-input'),
    notes: () => document.getElementById('notes'),
    background: () => null,
  };

  let current = null;
  let prefs = { pinned: false, panel: null };

  /* ---------- chips ---------- */

  const defaultIcons = new Map(chips.map(c => [c.dataset.panel, c.querySelector('.dock-icon').innerHTML]));

  for (const chip of chips) {
    const title = panels[chip.dataset.panel].dataset.title;
    chip.dataset.title = title;
    chip.setAttribute('aria-expanded', 'false');
    chip.title = `${title} (${chip.dataset.key.toUpperCase()})`;
    chip.setAttribute('aria-label', title);
    chip.addEventListener('click', () => (current === chip.dataset.panel ? close() : open(chip.dataset.panel)));

    // matching tab inside the drawer, so you can hop between widgets without closing it
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'drawer-tab';
    tab.dataset.panel = chip.dataset.panel;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-label', title);
    tab.title = `${title} (${chip.dataset.key.toUpperCase()})`;
    tab.innerHTML = defaultIcons.get(chip.dataset.panel);
    tab.addEventListener('click', () => open(chip.dataset.panel));
    tabsEl.append(tab);
  }

  /**
   * Widgets report a short status for their chip.
   * status = { text?: string, title?: string, emoji?: string, tone?: 'active' | 'muted' }
   */
  function setStatus(id, status = {}) {
    const chip = chips.find(c => c.dataset.panel === id);
    if (!chip) return;
    const icon = chip.querySelector('.dock-icon');
    const text = chip.querySelector('.dock-text');
    if (status.emoji) {
      icon.textContent = status.emoji;
      icon.classList.add('emoji');
    } else if (icon.classList.contains('emoji')) {
      icon.innerHTML = defaultIcons.get(id);
      icon.classList.remove('emoji');
    }
    text.textContent = status.text || '';
    chip.classList.toggle('has-text', !!status.text);
    chip.dataset.tone = status.tone || '';
    const label = status.title ? `${chip.dataset.title}: ${status.title}` : chip.dataset.title;
    chip.title = `${label} (${chip.dataset.key.toUpperCase()})`;
    chip.setAttribute('aria-label', label);
  }

  /* ---------- drawer ---------- */

  function open(id, { focus = true } = {}) {
    if (!panels[id]) return;
    current = id;
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
    for (const chip of chips) chip.setAttribute('aria-expanded', String(chip.dataset.panel === id));
    for (const tab of tabsEl.children) tab.setAttribute('aria-selected', String(tab.dataset.panel === id));
    drawer.classList.add('open');
    drawer.removeAttribute('inert');
    document.body.classList.add('drawer-open');
    if (prefs.pinned && prefs.panel !== id) savePrefs({ panel: id });
    if (focus) {
      const target = FOCUS[id]();
      // wait for the slide-in so the browser doesn't scroll the off-screen drawer
      setTimeout(() => (target || panels[id]).focus({ preventScroll: true }), 60);
    }
  }

  function close() {
    if (!current) return;
    const was = current;
    current = null;
    drawer.classList.remove('open');
    drawer.setAttribute('inert', '');
    document.body.classList.remove('drawer-open');
    for (const chip of chips) chip.setAttribute('aria-expanded', 'false');
    if (drawer.contains(document.activeElement)) {
      chips.find(c => c.dataset.panel === was)?.focus({ preventScroll: true });
    }
  }

  async function savePrefs(patch) {
    prefs = { ...prefs, ...patch };
    renderPin();
    await store.set('dockPrefs', prefs);
  }

  function renderPin() {
    pinBtn.setAttribute('aria-pressed', String(prefs.pinned));
    pinBtn.title = prefs.pinned ? 'Unpin (stop opening on every new tab)' : 'Pin open on every new tab';
    pinBtn.setAttribute('aria-label', pinBtn.title);
    document.body.classList.toggle('drawer-pinned', prefs.pinned);
  }

  pinBtn.addEventListener('click', () => savePrefs({ pinned: !prefs.pinned, panel: current }));
  closeBtn.addEventListener('click', close);

  // Click outside closes an unpinned drawer. composedPath() still holds elements
  // a widget removed while handling the click (e.g. a deleted to-do).
  document.addEventListener('click', e => {
    if (!current || prefs.pinned) return;
    const path = e.composedPath();
    if (path.includes(drawer) || path.includes(dock)) return;
    close();
  });

  /* ---------- keyboard ---------- */

  const isTyping = el =>
    el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && current) {
      // first Esc leaves a text field, the next one closes the drawer
      if (isTyping(e.target) && drawer.contains(e.target)) { e.target.blur(); return; }
      if (!drawer.contains(e.target) && isTyping(e.target)) return; // e.g. bookmark search
      close();
      return;
    }
    if (isTyping(e.target)) return;
    const chip = chips.find(c => c.dataset.key === e.key.toLowerCase());
    if (chip) {
      e.preventDefault();
      if (current === chip.dataset.panel) close(); else open(chip.dataset.panel);
    }
  });

  /* ---------- start ---------- */

  drawer.hidden = false; // visibility is driven by .open from here on
  drawer.setAttribute('inert', '');
  for (const panel of Object.values(panels)) panel.tabIndex = -1;

  (async () => {
    prefs = { ...prefs, ...(await store.get('dockPrefs', {})) };
    renderPin();
    if (prefs.pinned && panels[prefs.panel]) open(prefs.panel, { focus: false });
  })();

  window.Dock = { setStatus, open, close };
})();
