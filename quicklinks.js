'use strict';

/*
 * Quick links: a compact row at the top of the bookmarks page.
 * A quick link is either a pinned bookmark (☆ on a bookmark tile) or a link you add with "+ Add".
 *   link = { id, url, title, bookmarkId?, renamed? }
 *   — pinned bookmarks show their bookmark's current name, unless you renamed the quick link
 * Edit with ✎ (same form as "+ Add"), remove with ×, reorder by dragging.
 * Stored in chrome.storage.local and synced across open tabs.
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
    submit: document.getElementById('quick-submit'),
  };

  let links = [];
  let dragId = null;
  let editingId = null; // the link the form is editing (null: adding a new one)

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

  /* Compare addresses in their normalized form ("https://github.com" = "github.com/"). */
  const sameUrl = (a, b) => (normalizeUrl(a) || a) === (normalizeUrl(b) || b);

  /* The current name of a pinned bookmark's bookmark (null if it no longer exists). */
  function bookmarkName(link) {
    if (!link.bookmarkId || !window.BookmarkIndex) return null;
    const bm = BookmarkIndex.links().find(l => l.node.id === link.bookmarkId);
    return bm ? bm.node.title || hostOf(bm.node.url) : null;
  }

  /* A pinned bookmark shows the bookmark's current name, unless you renamed it here. */
  function titleOf(link) {
    if (!link.renamed) {
      const name = bookmarkName(link);
      if (name) return name;
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

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'quick-edit';
      edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.33-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>';
      edit.title = 'Edit';
      edit.setAttribute('aria-label', `Edit “${titleOf(link)}”`);
      edit.addEventListener('click', () => openForm(link));

      if (link.id === editingId) item.classList.add('editing');
      item.append(a, edit, remove);
      return item;
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'quick-add';
    add.style.setProperty('--i', (0.4 + links.length * 0.12).toFixed(2));
    add.innerHTML = '<span aria-hidden="true">+</span> Add';
    add.title = 'Add a link (or pin a bookmark with ☆)';
    add.setAttribute('aria-label', 'Add a quick link');
    add.addEventListener('click', () => openForm());
    add.hidden = !els.form.hidden;

    els.list.replaceChildren(...items, add);
  }

  /* ---------- adding / editing / removing ---------- */

  /* Opens the form: empty to add a link, or filled in to edit `link`. */
  function openForm(link = null) {
    editingId = link ? link.id : null;
    els.form.hidden = false;
    els.error.textContent = '';
    els.url.value = link ? link.url : '';
    els.name.value = link ? titleOf(link) : '';
    els.submit.textContent = link ? 'Save' : 'Add';
    els.form.setAttribute('aria-label', link ? `Edit “${titleOf(link)}”` : 'Add a quick link');
    render();
    els.url.focus({ preventScroll: true });
    if (link) els.url.select();
  }

  function closeForm() {
    const wasEditing = editingId;
    editingId = null;
    els.form.hidden = true;
    render();
    // put the keyboard back where it came from
    (wasEditing && els.list.querySelector(`[data-id="${wasEditing}"] .quick-edit`) || els.list.querySelector('.quick-add'))
      ?.focus({ preventScroll: true });
  }

  async function update(id, { url, title = '' }) {
    const link = links.find(l => l.id === id);
    if (!link) return { error: 'That link no longer exists.' };
    const normalized = normalizeUrl(url);
    if (!normalized) return { error: 'That doesn’t look like a web address.' };
    if (links.some(l => l.id !== id && sameUrl(l.url, normalized))) return { error: 'That link is already in your quick links.' };

    if (!sameUrl(link.url, normalized)) {
      // a new address makes it your own link, no longer tied to the bookmark it was pinned from
      link.url = normalized;
      delete link.bookmarkId;
      delete link.renamed;
    }
    const name = title.trim() || hostOf(normalized);
    const bmName = bookmarkName(link);
    if (bmName && name === bmName) { delete link.renamed; link.title = name; } // follows the bookmark again
    else { link.title = name; if (link.bookmarkId) link.renamed = true; }

    render();
    await save();
    return { ok: true };
  }

  async function add({ url, title = '', bookmarkId }) {
    const normalized = normalizeUrl(url);
    if (!normalized) return { error: 'That doesn’t look like a web address.' };
    if (links.some(l => sameUrl(l.url, normalized) || (bookmarkId && l.bookmarkId === bookmarkId))) {
      return { error: 'That link is already in your quick links.' };
    }
    links.push({ id: newId(), url: normalized, title: title.trim() || hostOf(normalized), ...(bookmarkId ? { bookmarkId } : {}) });
    render();
    await save();
    return { ok: true };
  }

  async function removeLink(id) {
    links = links.filter(l => l.id !== id);
    if (editingId === id) { editingId = null; els.form.hidden = true; }
    render();
    await save();
  }

  els.form.addEventListener('submit', async e => {
    e.preventDefault();
    const fields = { url: els.url.value, title: els.name.value };
    const res = editingId ? await update(editingId, fields) : await add(fields);
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
    isPinned: bm => links.some(l => l.bookmarkId === bm.id || sameUrl(l.url, bm.url)),
    /* Pin a bookmark, or unpin it if it's already there. Returns true if it is now pinned. */
    async toggleBookmark(bm) {
      const existing = links.find(l => l.bookmarkId === bm.id || sameUrl(l.url, bm.url));
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
