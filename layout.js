'use strict';

/*
 * Position of the clock + command bar on the home page (8 spots; top-right belongs to the dock).
 * Set from the Appearance panel's picker or the palette ("position top left"). Moving glides the
 * clock and the bar to their new place (FLIP: measure, switch, animate the difference back to 0)
 * instead of jumping. Remembered in storage and followed by other open tabs.
 */
(() => {
  const store = window.appStore;
  const KEY = 'homeLayout';
  const POSITIONS = ['top-left', 'top-center', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const LABELS = {
    'top-left': 'Top left', 'top-center': 'Top', 'middle-left': 'Left', center: 'Center',
    'middle-right': 'Right', 'bottom-left': 'Bottom left', 'bottom-center': 'Bottom', 'bottom-right': 'Bottom right',
  };

  const home = document.getElementById('page-home');
  const movers = [home.querySelector('.clock'), home.querySelector('.palette')];
  const picker = document.getElementById('pos-grid');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let current = 'center';

  function apply(pos, { animate = true } = {}) {
    if (!POSITIONS.includes(pos)) pos = 'center';
    const glide = animate && pos !== current && !reducedMotion.matches && Pages.current() === 'home';
    const before = glide ? movers.map(el => el.getBoundingClientRect()) : null;

    current = pos;
    home.dataset.pos = pos;
    for (const b of picker.querySelectorAll('[data-pos]')) b.setAttribute('aria-pressed', String(b.dataset.pos === pos));

    if (glide) {
      movers.forEach((el, n) => {
        const after = el.getBoundingClientRect();
        const dx = before[n].left - after.left;
        const dy = before[n].top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 560 + n * 40, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, // the bar trails the clock a touch
        );
      });
    }
    window.dispatchEvent(new Event('backdrop-change')); // text over a wallpaper re-checks its colour
  }

  async function set(pos) {
    apply(pos);
    await store.set(KEY, { pos: current });
  }

  picker.addEventListener('click', e => {
    const b = e.target.closest('[data-pos]');
    if (b) set(b.dataset.pos);
  });

  /* "top left", "left", "bottom", "centre", "top right"… → a position key (null if unclear) */
  function parse(text) {
    const t = ` ${text.toLowerCase().replace(/centre/g, 'center').replace(/[-_]/g, ' ')} `;
    const has = w => t.includes(` ${w} `);
    const row = has('top') || has('up') ? 'top' : has('bottom') || has('down') ? 'bottom' : 'middle';
    const col = has('left') ? 'left' : has('right') ? 'right' : 'center';
    if (!has('top') && !has('up') && !has('bottom') && !has('down') && !has('left') && !has('right') && !has('center') && !has('middle')) return null;
    if (row === 'top' && col === 'right') return 'top-right'; // taken: caller explains
    if (row === 'middle' && col === 'center') return 'center';
    return row === 'middle' ? `middle-${col}` : `${row}-${col}`;
  }

  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue?.pos, { animate: false });
    });
  }

  window.Layout = { set, parse, current: () => current, label: pos => LABELS[pos] || pos, POSITIONS };

  apply('center', { animate: false });
  (async () => {
    apply((await store.get(KEY, {})).pos || 'center', { animate: false });
  })();
})();
