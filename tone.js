'use strict';

/*
 * Picks a readable text colour for overlays on top of the wallpaper (currently the to-dos at a
 * glance): it samples the wallpaper pixels right behind the element, accounts for the dim
 * slider, and sets data-tone="dark" (dark text) or "light" — whichever has more contrast (WCAG).
 *
 * Re-checks when the wallpaper or dim level changes, when the element changes size or the window
 * resizes, and every 2 s while a video plays. A remote image whose site doesn't allow reading its
 * pixels can't be sampled; the element then keeps the default light text with a shadow.
 */
(() => {
  const targets = [document.getElementById('todo-glance')].filter(Boolean);
  const dimEl = document.getElementById('bg-dim');

  const W = 24, H = 12; // tiny sample: averaging only
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const media = () => document.querySelector('#bg img, #bg video');

  /* Average relative luminance (WCAG, 0–1) of the wallpaper under `rect`, as seen through the dim
     overlay; null if it can't be measured. */
  function brightnessUnder(rect) {
    const m = media();
    if (!m || !document.body.classList.contains('has-bg')) return null;
    const mw = m.videoWidth || m.naturalWidth;
    const mh = m.videoHeight || m.naturalHeight;
    if (!mw || !mh || !rect.width || !rect.height) return null;

    // The wallpaper is drawn with object-fit: cover — map the on-screen box back to media pixels.
    const scale = Math.max(innerWidth / mw, innerHeight / mh);
    const ox = (innerWidth - mw * scale) / 2;
    const oy = (innerHeight - mh * scale) / 2;
    const sx = Math.max(0, (rect.left - ox) / scale);
    const sy = Math.max(0, (rect.top - oy) / scale);
    const sw = Math.min(mw - sx, rect.width / scale);
    const sh = Math.min(mh - sy, rect.height / scale);
    if (sw <= 0 || sh <= 0) return null;

    let data;
    try {
      ctx.drawImage(m, sx, sy, sw, sh, 0, 0, W, H);
      data = ctx.getImageData(0, 0, W, H).data;
    } catch {
      return null; // cross-origin media without CORS: pixels can't be read
    }
    // The dim overlay is black at opacity `dim`, blended in sRGB: it scales the colour values.
    const keep = 1 - (parseFloat(dimEl.style.opacity) || 0);
    const lin = c => { c = (c / 255) * keep; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
    return sum / (W * H);
  }

  // Pick whichever text colour contrasts more (WCAG). White vs. the dark text (luminance ≈ 0.006)
  // cross over at a background luminance of ≈ 0.19; a band around it avoids flicker on video.
  const CROSSOVER = 0.19;
  const BAND = 0.025;

  function update() {
    for (const el of targets) {
      const y = brightnessUnder(el.getBoundingClientRect());
      if (y === null) { delete el.dataset.tone; continue; }
      const now = el.dataset.tone;
      if (y > CROSSOVER + BAND) el.dataset.tone = 'dark';
      else if (y < CROSSOVER - BAND) el.dataset.tone = 'light';
      else el.dataset.tone = now || (y > CROSSOVER ? 'dark' : 'light'); // in the band: keep what it was
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; update(); });
  };

  window.addEventListener('backdrop-change', () => {
    schedule();
    const m = media();
    if (m && !(m.naturalWidth || m.videoWidth)) m.addEventListener('load', schedule, { once: true }); // not decoded yet
  });
  window.addEventListener('resize', schedule);
  const ro = new ResizeObserver(schedule);
  targets.forEach(el => ro.observe(el));

  // Videos change under the text: re-check now and then (cheap: a 24×12 sample), only when visible.
  setInterval(() => {
    const m = media();
    if (m && m.tagName === 'VIDEO' && !m.paused && !document.hidden) update();
  }, 2000);

  window.Tone = { update };
})();
