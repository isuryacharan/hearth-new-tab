'use strict';

/*
 * Quick links: a compact row at the top of the bookmarks page.
 * A quick link is either a pinned bookmark (☆ on a bookmark tile) or a link you add with "+ Add".
 *   link = { id, url, title, bookmarkId? }   — pinned bookmarks keep their bookmark's current name
 * Remove with ×, reorder by dragging. Stored in chrome.storage.local and synced across open tabs.
 */
(() => {
  const store = window.appStore;
  const KEY = 'quickLinks';

  const els = {
    list: document.getElementById('quick-list'),
    form: document.getElementById('quick-form'),
    url: document.getElementById('quick-url'),
    name: document.getElementById('quick-name'),
    cancel: document.getElementById('quick-cancel'),
    error: document.getElementById('quick-error'),
  };

  let links = [];
  let dragId = null;

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

  /* "example.com/x" → "https://example.com/x"; null if it isn't an address we can open. */
  function normalizeUrl(raw) {
    let u = (raw || '').trim();
    if (!u || /\s/.test(u)) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;
    try {
      const x = new URL(u);
      if (!['http:', 'https:', 'chrome:', 'file:'].includes(x.protocol)) return null;
      if (/^https?:$/.test(x.protocol) && !x.hostname.includes('.') && x.hostname !== 'localhost') return null;
      return x.href;
    } catch { return null; }
  }

  /* A pinned bookmark shows the bookmark's current name (if it still exists). */
  function titleOf(link) {
    if (link.bookmarkId && window.BookmarkIndex) {
      const bm = BookmarkIndex.links().find(l => l.node.id === link.bookmarkId);
      if (bm) return bm.node.title || hostOf(bm.node.url);
    }
    return link.title || hostOf(link.url);
  }

  async function save() {
    await store.set(KEY, links);
    changed();
  }

  // Bookmark tiles update their ☆ / ★ from this.
  const changed = () => window.dispatchEvent(new Event('quicklinks-change'));

  /* ---------- rendering ---------- */

  function render() {
    const items = links.map((link, n) => {
      const item = document.createElement('div');
      item.className = 'quick-item';
      item.dataset.id = link.id;
      item.style.setProperty('--i', (0.4 + n * 0.12).toFixed(2)); // joins the page's reveal wave

      const a = document.createElement('a');
      a.className = 'quick-tile';
      a.href = link.url;
      a.draggable = true;
      a.title = `${titleOf(link)}\n${link.url}`;
      const icon = window.BookmarkIndex ? BookmarkIndex.icon({ url: link.url, title: titleOf(link) }) : document.createElement('span');
      icon.classList.add('quick-icon');
      const label = document.createElement('span');
      label.className = 'quick-label';
      label.textContent = titleOf(link);
      a.append(icon, label);

      a.addEventListener('dragstart', e => {
        dragId = link.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/uri-list', link.url);
        requestAnimationFrame(() => item.classList.add('dragging'));
      });
      a.addEventListener('dragend', () => { dragId = null; item.classList.remove('dragging'); clearMarker(); });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quick-remove';
      remove.textContent = '×';
      remove.title = 'Remove from quick links';
      remove.setAttribute('aria-label', `Remove “${titleOf(link)}” from quick links`);
      remove.addEventListener('click', () => removeLink(link.id));

      item.append(a, remove);
      return item;
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'quick-add';
    add.style.setProperty('--i', (0.4 + links.length * 0.12).toFixed(2));
    add.innerHTML = '<span aria-hidden="true">+</span> Add';
    add.title = 'Add a link (or pin a bookmark with ☆)';
    add.setAttribute('aria-label', 'Add a quick link');
    add.addEventListener('click', openForm);
    add.hidden = !els.form.hidden;

    els.list.replaceChildren(...items, add);
  }

  /* ---------- adding / removing ---------- */

  function openForm() {
    els.form.hidden = false;
    els.error.textContent = '';
    els.url.value = '';
    els.name.value = '';
    render();
    els.url.focus({ preventScroll: true });
  }

  function closeForm() {
    els.form.hidden = true;
    render();
    els.list.querySelector('.quick-add')?.focus({ preventScroll: true });
  }

  async function add({ url, title = '', bookmarkId }) {
    const normalized = normalizeUrl(url);
    if (!normalized) return { error: 'That doesn’t look like a web address.' };
    if (links.some(l => l.url === normalized || (bookmarkId && l.bookmarkId === bookmarkId))) {
      return { error: 'That link is already in your quick links.' };
    }
    links.push({ id: newId(), url: normalized, title: title.trim() || hostOf(normalized), ...(bookmarkId ? { bookmarkId } : {}) });
    render();
    await save();
    return { ok: true };
  }

  async function removeLink(id) {
    links = links.filter(l => l.id !== id);
    render();
    await save();
  }

  els.form.addEventListener('submit', async e => {
    e.preventDefault();
    const res = await add({ url: els.url.value, title: els.name.value });
    if (res.error) { els.error.textContent = res.error; els.url.focus(); return; }
    closeForm();
  });
  els.cancel.addEventListener('click', closeForm);
  els.form.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeForm(); }
  });

  /* ---------- reordering (drag) ---------- */

  function slot(x, y) {
    const items = [...els.list.querySelectorAll('.quick-item')];
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      const sameRow = y >= r.top && y <= r.bottom;
      if ((sameRow && x < r.left + r.width / 2) || y < r.top) return { index: i, el: items[i], edge: 'before' };
    }
    return { index: items.length, el: items[items.length - 1], edge: 'after' };
  }
  function clearMarker() {
    els.list.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  }
  els.list.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { el, edge } = slot(e.clientX, e.clientY);
    if (el && !el.classList.contains(`drop-${edge}`)) { clearMarker(); el.classList.add(`drop-${edge}`); }
  });
  els.list.addEventListener('dragleave', e => { if (!els.list.contains(e.relatedTarget)) clearMarker(); });
  els.list.addEventListener('drop', async e => {
    if (!dragId) return;
    e.preventDefault();
    let { index } = slot(e.clientX, e.clientY);
    const from = links.findIndex(l => l.id === dragId);
    if (from < index) index -= 1;
    clearMarker();
    if (from < 0 || index === from) return;
    const [link] = links.splice(from, 1);
    links.splice(index, 0, link);
    render();
    await save();
  });

  /* ---------- API for bookmark tiles (☆) and the palette ---------- */

  window.QuickLinks = {
    all: () => links.map(l => ({ ...l, title: titleOf(l) })),
    isPinned: bm => links.some(l => l.bookmarkId === bm.id || l.url === bm.url),
    /* Pin a bookmark, or unpin it if it's already there. Returns true if it is now pinned. */
    async toggleBookmark(bm) {
      const existing = links.find(l => l.bookmarkId === bm.id || l.url === bm.url);
      if (existing) { await removeLink(existing.id); return false; }
      const res = await add({ url: bm.url, title: bm.title, bookmarkId: bm.id });
      return !!res.ok;
    },
    add,
  };

  // Pinned bookmarks show their bookmark's current name: re-render when bookmarks load or change
  // (newtab.js announces it), and follow other open tabs.
  window.addEventListener('bookmarks-change', render);
  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) {
        links = changes[KEY].newValue || [];
        render();
        changed();
      }
    });
  }

  (async () => {
    links = await store.get(KEY, []);
    render();
    changed();
  })();
})();
