'use strict';

/* Custom background: uploaded image/video (kept in IndexedDB) or a remote image/video URL. */
(() => {
  const store = window.appStore;
  const MAX_FILE_BYTES = 500 * 1024 * 1024;
  const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:[?#]|$)/i;

  const els = {
    bg: document.getElementById('bg'),
    dim: document.getElementById('bg-dim'),
    file: document.getElementById('bg-file'),
    urlForm: document.getElementById('bg-url-form'),
    url: document.getElementById('bg-url'),
    dimRange: document.getElementById('bg-dim-range'),
    dimValue: document.getElementById('bg-dim-value'),
    status: document.getElementById('bg-status'),
    reset: document.getElementById('bg-reset'),
  };

  // settings: { source: 'none' | 'file' | 'url', kind: 'image' | 'video', url?, fileName?, dim: 0-80, rev }
  const DEFAULTS = { source: 'none', kind: 'image', dim: 25, rev: 0 };
  let settings = { ...DEFAULTS };
  let shownBlobUrl = null; // blob: URL currently on screen, released once replaced

  /* ---------- IndexedDB for uploaded files (too big for chrome.storage) ---------- */

  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('newtab-background', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idb(mode, fn) {
    const conn = await db();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => { conn.close(); resolve(req && req.result); };
      tx.onerror = tx.onabort = () => { conn.close(); reject(tx.error); };
    });
  }
  const putFile = blob => idb('readwrite', s => s.put(blob, 'background'));
  const getFile = () => idb('readonly', s => s.get('background'));
  const deleteFile = () => idb('readwrite', s => s.delete('background'));

  /* ---------- applying ---------- */

  async function apply() {
    els.dimRange.value = settings.dim;
    els.dimValue.textContent = `${settings.dim}%`;

    let src = null;
    if (settings.source === 'url') {
      src = settings.url;
    } else if (settings.source === 'file') {
      try {
        const blob = await getFile();
        if (blob) src = URL.createObjectURL(blob);
      } catch { /* fall through to default */ }
    }

    if (!src) {
      showNothing();
      setStatus(settings.source === 'file' ? 'The uploaded file could not be loaded.' : 'Using the default background.');
      return;
    }
    showMedia(src, settings.kind, true);
  }

  function showMedia(src, kind, allowFallback) {
    const el = kind === 'video' ? document.createElement('video') : document.createElement('img');
    if (kind === 'video') {
      Object.assign(el, { autoplay: true, muted: true, loop: true, playsInline: true });
      el.setAttribute('muted', '');
      el.addEventListener('loadeddata', () => { if (document.hidden) el.pause(); });
    } else {
      el.alt = '';
      el.decoding = 'async';
    }

    el.addEventListener(kind === 'video' ? 'loadeddata' : 'load', () => {
      els.bg.replaceChildren(el);
      releaseShown(src);
      setActive(true);
      setStatus(describe());
    }, { once: true });

    el.addEventListener('error', () => {
      // A URL without a telling extension might be the other kind.
      if (allowFallback && settings.source === 'url') {
        return showMedia(src, kind === 'video' ? 'image' : 'video', false);
      }
      if (src.startsWith('blob:')) URL.revokeObjectURL(src);
      showNothing();
      setStatus('Couldn’t load that background. Check the link or file.');
    }, { once: true });

    el.src = src;
  }

  function showNothing() {
    els.bg.replaceChildren();
    releaseShown(null);
    setActive(false);
  }

  function releaseShown(next) {
    if (shownBlobUrl && shownBlobUrl !== next) URL.revokeObjectURL(shownBlobUrl);
    shownBlobUrl = next && next.startsWith('blob:') ? next : null;
  }

  function setActive(on) {
    document.body.classList.toggle('has-bg', on);
    els.dim.style.opacity = on ? settings.dim / 100 : 0;
    changed();
  }

  // Tell tone.js the wallpaper or its dimming changed, so text over it can re-pick its colour.
  const changed = () => window.dispatchEvent(new Event('backdrop-change'));

  function describe() {
    const what = settings.kind === 'video' ? 'video' : 'image';
    if (settings.source === 'file') return `Using uploaded ${what}: ${settings.fileName || 'file'}`;
    return `Using ${what} from URL.`;
  }

  function setStatus(text) { els.status.textContent = text; }

  async function save(patch) {
    settings = { ...settings, ...patch, rev: Date.now() };
    await store.set('bgSettings', settings);
    await apply();
  }

  /* ---------- controls (the panel itself opens in the dock drawer) ---------- */

  els.file.addEventListener('change', async () => {
    const file = els.file.files[0];
    els.file.value = '';
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
    if (!kind) return setStatus('Please choose an image or video file.');
    if (file.size > MAX_FILE_BYTES) return setStatus('That file is larger than 500 MB.');

    setStatus('Saving…');
    try {
      await putFile(file);
    } catch {
      return setStatus('Couldn’t save the file (not enough storage space?).');
    }
    await save({ source: 'file', kind, fileName: file.name, url: undefined });
  });

  els.urlForm.addEventListener('submit', async e => {
    e.preventDefault();
    const url = els.url.value.trim();
    if (!/^https?:\/\//i.test(url)) return setStatus('Enter a link starting with http:// or https://');
    els.url.value = '';
    setStatus('Loading…');
    await deleteFile().catch(() => {});
    await save({ source: 'url', url, kind: VIDEO_EXT.test(url) ? 'video' : 'image', fileName: undefined });
  });

  els.dimRange.addEventListener('input', () => {
    settings.dim = +els.dimRange.value;
    els.dimValue.textContent = `${settings.dim}%`;
    if (document.body.classList.contains('has-bg')) { els.dim.style.opacity = settings.dim / 100; changed(); }
  });
  els.dimRange.addEventListener('change', () => store.set('bgSettings', settings));

  els.reset.addEventListener('click', async () => {
    await deleteFile().catch(() => {});
    settings = { ...DEFAULTS };
    await save({});
  });

  // Don't burn CPU playing video in background tabs.
  document.addEventListener('visibilitychange', () => {
    const video = els.bg.querySelector('video');
    if (!video) return;
    if (document.hidden) video.pause(); else video.play().catch(() => {});
  });

  // Keep other open new tabs in sync.
  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.bgSettings) return;
      const next = changes.bgSettings.newValue || { ...DEFAULTS };
      const mediaChanged = next.rev !== settings.rev;
      settings = next;
      if (mediaChanged) apply();
      else {
        els.dimRange.value = settings.dim;
        els.dimValue.textContent = `${settings.dim}%`;
        if (document.body.classList.contains('has-bg')) { els.dim.style.opacity = settings.dim / 100; changed(); }
      }
    });
  }

  (async () => {
    settings = { ...DEFAULTS, ...(await store.get('bgSettings', {})) };
    apply();
  })();
})();
