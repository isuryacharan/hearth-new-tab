'use strict';

/*
 * Managing bookmarks from the grid (changes go to Chrome's real bookmarks):
 *   - "+ Add" tile: new bookmark or folder in the folder you're viewing
 *   - ⋯ on a tile, or right-click: open in new tab · edit (name, address, folder) · delete
 *   - delete asks first, then offers Undo (a deleted folder comes back with everything in it)
 *   - drag a tile to reorder it, onto a folder to move it in, or onto the folder path to move it up
 * Chrome's own top folders (bookmarks bar, other, mobile) can't be changed.
 * Outside the extension it edits the sample bookmarks instead, so it can be tried in a preview.
 */
(() => {
  const grid = document.getElementById('grid');
  const crumbs = document.getElementById('crumbs');
  const G = () => window.BookmarkGrid;

  /* ---------- Chrome's bookmarks API, or a stand-in working on the sample bookmarks ---------- */

  const sample = {
    find(id, node = G().sampleRoot()) {
      if (node.id === id) return node;
      for (const c of node.children || []) { const hit = sample.find(id, c); if (hit) return hit; }
      return null;
    },
    reindex(parent) { (parent.children || []).forEach((c, i) => { c.index = i; c.parentId = parent.id; }); },
    detach(node) {
      const parent = sample.find(node.parentId);
      parent.children.splice(parent.children.indexOf(node), 1);
      sample.reindex(parent);
    },
    async create({ parentId, index, title, url }) {
      const parent = sample.find(parentId);
      const node = { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: title || '', ...(url ? { url } : { children: [] }) };
      parent.children.splice(index ?? parent.children.length, 0, node);
      sample.reindex(parent);
      return node;
    },
    async update(id, changes) { Object.assign(sample.find(id), changes); },
    async move(id, { parentId, index }) {
      const node = sample.find(id);
      const sameParent = node.parentId === parentId;
      const from = node.index;
      sample.detach(node);
      const parent = sample.find(parentId);
      let at = index ?? parent.children.length;
      if (sameParent && index !== undefined && index > from) at -= 1; // as Chrome does
      parent.children.splice(at, 0, node);
      sample.reindex(parent);
    },
    async remove(id) { sample.detach(sample.find(id)); },
    async removeTree(id) { sample.detach(sample.find(id)); },
    async getSubTree(id) { return [structuredClone(sample.find(id))]; },
  };
  const api = () => (G().usingChrome ? chrome.bookmarks : sample);
  // Chrome's bookmark events already refresh the grid; the stand-in has to do it itself.
  const after = async () => { if (!G().usingChrome) await G().refresh(); };

  /* ---------- helpers ---------- */

  function normalizeUrl(raw) {
    let u = (raw || '').trim();
    if (!u || /\s/.test(u)) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;
    try {
      const x = new URL(u);
      if (!['http:', 'https:', 'chrome:', 'file:', 'ftp:'].includes(x.protocol)) return null;
      if (/^https?:$/.test(x.protocol) && !x.hostname.includes('.') && x.hostname !== 'localhost') return null;
      return x.href;
    } catch { return null; }
  }
  const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const nameOf = node => node.title || (node.url ? hostOf(node.url) : 'Untitled');
  const editable = node => node && !G().isRoot(node.id);

  /* folder ids inside `id` (to keep a folder from being moved into itself) */
  function descendants(id) {
    const out = new Set([id]);
    const walk = n => (n.children || []).forEach(c => { if (!c.url) { out.add(c.id); walk(c); } });
    const node = G().node(id);
    if (node) walk(node);
    return out;
  }

  /* ---------- toast with Undo ---------- */

  const toast = document.createElement('div');
  toast.className = 'bm-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  document.body.append(toast);
  let toastTimer = null;

  function say(text, undo) {
    toast.replaceChildren(Object.assign(document.createElement('span'), { textContent: text }));
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Undo';
      b.addEventListener('click', async () => { hideToast(); await undo(); });
      toast.append(b);
    }
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 7000 : 3000);
  }
  function hideToast() {
    toast.classList.remove('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 200);
  }

  /* ---------- delete (with undo) ---------- */

  async function restore(snap, parentId, index) {
    const made = await api().create({ parentId, index, title: snap.title, ...(snap.url ? { url: snap.url } : {}) });
    for (const [i, child] of (snap.children || []).entries()) await restore(child, made.id, i);
    return made;
  }

  async function remove(node) {
    if (!editable(node)) return;
    const [snap] = await api().getSubTree(node.id);
    const { parentId, index } = node;
    if (node.url) await api().remove(node.id); else await api().removeTree(node.id);
    await after();
    const count = node.url ? 0 : countLinks(snap);
    say(node.url ? `Deleted “${nameOf(node)}”` : `Deleted folder “${nameOf(node)}”${count ? ` and ${count} bookmark${count === 1 ? '' : 's'}` : ''}`,
      async () => { await restore(snap, parentId, index); await after(); say('Restored'); });
  }
  const countLinks = n => (n.children || []).reduce((s, c) => s + (c.url ? 1 : countLinks(c)), 0);

  /* Ask first: "Delete “Work”? 3 folders and 12 bookmarks inside will be deleted too." */
  const confirmBox = document.createElement('dialog');
  confirmBox.className = 'bm-dialog bm-confirm';
  confirmBox.innerHTML = `
    <form method="dialog" class="bm-form">
      <h2 class="bm-title"></h2>
      <p class="bm-confirm-text"></p>
      <div class="bm-actions">
        <button type="button" class="link-btn bm-cancel">Cancel</button>
        <button type="submit" class="chip bm-delete">Delete</button>
      </div>
    </form>`;
  document.body.append(confirmBox);
  let confirming = null; // { node, returnFocus }

  function confirmDelete(node, returnFocus = document.activeElement) {
    if (!editable(node)) return;
    confirming = { node, returnFocus };
    const live = G().node(node.id) || node;
    const links = live.url ? 0 : countLinks(live);
    const folders = live.url ? 0 : countFolders(live);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    confirmBox.querySelector('.bm-title').textContent = `Delete ${live.url ? '' : 'folder '}“${nameOf(live)}”?`;
    const inside = [folders && plural(folders, 'folder'), links && plural(links, 'bookmark')].filter(Boolean).join(' and ');
    confirmBox.querySelector('.bm-confirm-text').textContent = live.url
      ? 'It will be removed from your Chrome bookmarks.'
      : inside ? `The ${inside} inside will be deleted too.` : 'The folder is empty.';
    confirmBox.showModal();
    confirmBox.querySelector('.bm-cancel').focus(); // Enter on its own doesn't delete
  }
  const countFolders = n => (n.children || []).reduce((s, c) => s + (c.url ? 0 : 1 + countFolders(c)), 0);
  function closeConfirm() {
    confirmBox.close();
    confirming?.returnFocus?.focus?.({ preventScroll: true });
    confirming = null;
  }
  confirmBox.querySelector('.bm-cancel').addEventListener('click', closeConfirm);
  confirmBox.addEventListener('cancel', e => { e.preventDefault(); closeConfirm(); }); // Esc
  confirmBox.addEventListener('click', e => { if (e.target === confirmBox) closeConfirm(); });
  confirmBox.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const { node } = confirming;
    confirmBox.close();
    confirming = null;
    await remove(node);
    grid.querySelector('.add-tile')?.focus({ preventScroll: true }); // the tile it came from is gone
  });

  /* ---------- the add / edit dialog ---------- */

  const dialog = document.createElement('dialog');
  dialog.className = 'bm-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="bm-form" novalidate>
      <h2 class="bm-title"></h2>
      <div class="bm-kind" role="radiogroup" aria-label="Type">
        <button type="button" role="radio" data-kind="bookmark">Bookmark</button>
        <button type="button" role="radio" data-kind="folder">Folder</button>
      </div>
      <label class="bm-field"><span>Name</span><input name="title" autocomplete="off" maxlength="300"></label>
      <label class="bm-field bm-url"><span>Address</span><input name="url" autocomplete="off" spellcheck="false" inputmode="url" placeholder="example.com or https://…"></label>
      <label class="bm-field"><span>Folder</span><select name="folder"></select></label>
      <p class="bm-error" role="alert"></p>
      <div class="bm-actions">
        <button type="button" class="link-btn bm-cancel">Cancel</button>
        <button type="submit" class="chip bm-save">Save</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const f = {
    form: dialog.querySelector('form'), title: dialog.querySelector('.bm-title'), kind: dialog.querySelector('.bm-kind'),
    name: dialog.querySelector('[name=title]'), url: dialog.querySelector('[name=url]'), urlRow: dialog.querySelector('.bm-url'),
    folder: dialog.querySelector('[name=folder]'), error: dialog.querySelector('.bm-error'), save: dialog.querySelector('.bm-save'),
  };
  let state = null; // { mode: 'add' | 'edit', kind: 'bookmark' | 'folder', node?, returnFocus }

  function setKind(kind) {
    state.kind = kind;
    for (const b of f.kind.children) b.setAttribute('aria-checked', String(b.dataset.kind === kind));
    f.urlRow.hidden = kind === 'folder';
    if (state.mode === 'add') f.title.textContent = kind === 'folder' ? 'New folder' : 'Add bookmark';
  }
  f.kind.addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) { setKind(b.dataset.kind); (b.dataset.kind === 'folder' ? f.name : f.url).focus(); } });

  function fillFolders(selected, exclude = new Set()) {
    f.folder.replaceChildren(...G().folders()
      .filter(x => !exclude.has(x.id))
      .map(x => Object.assign(document.createElement('option'), { value: x.id, textContent: x.path, selected: x.id === selected })));
  }

  function openDialog({ mode, kind = 'bookmark', node = null, returnFocus = document.activeElement }) {
    state = { mode, kind, node, returnFocus };
    f.error.textContent = '';
    f.kind.hidden = mode !== 'add';
    if (mode === 'add') {
      f.name.value = '';
      f.url.value = '';
      fillFolders(G().currentFolder());
    } else {
      f.title.textContent = node.url ? 'Edit bookmark' : 'Rename folder';
      f.name.value = node.title || '';
      f.url.value = node.url || '';
      fillFolders(node.parentId, node.url ? new Set() : descendants(node.id));
    }
    setKind(mode === 'add' ? kind : (node.url ? 'bookmark' : 'folder'));
    f.save.textContent = mode === 'add' ? 'Add' : 'Save';
    dialog.showModal();
    (mode === 'add' && state.kind === 'bookmark' ? f.url : f.name).focus();
    if (mode === 'edit') f.name.select();
  }

  function closeDialog() {
    dialog.close();
    state?.returnFocus?.focus?.({ preventScroll: true });
    state = null;
  }
  dialog.querySelector('.bm-cancel').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); }); // Esc
  dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); }); // click outside the card

  f.form.addEventListener('submit', async e => {
    e.preventDefault();
    const { mode, kind, node } = state;
    const title = f.name.value.trim();
    const parentId = f.folder.value;
    const moved = mode === 'edit' && parentId !== node.parentId;
    let url = null;
    if (kind === 'bookmark') {
      url = normalizeUrl(f.url.value);
      if (!url) { f.error.textContent = 'That doesn’t look like a web address.'; f.url.focus(); return; }
    }
    try {
      if (mode === 'add') {
        await api().create({ parentId, title: title || (url ? hostOf(url) : 'New folder'), ...(url ? { url } : {}) });
        await after();
        closeDialog();
        say(kind === 'folder' ? `Created folder “${title || 'New folder'}”` : `Added “${title || hostOf(url)}”`);
      } else {
        const changes = {};
        if (title !== (node.title || '')) changes.title = title;
        if (node.url && url !== node.url) changes.url = url;
        if (Object.keys(changes).length) await api().update(node.id, changes);
        if (moved) await api().move(node.id, { parentId });
        await after();
        closeDialog();
        say(moved ? `Moved to ${f.folder.selectedOptions[0]?.textContent}` : 'Saved');
      }
    } catch (err) {
      f.error.textContent = `Couldn’t save: ${err.message || err}`;
    }
  });

  /* ---------- the ⋯ / right-click menu ---------- */

  const menu = document.createElement('div');
  menu.className = 'bm-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  document.body.append(menu);
  let menuFor = null;

  function openMenu(node, { x, y, trigger }) {
    closeMenu(false);
    menuFor = { node, trigger };
    trigger?.setAttribute('aria-expanded', 'true');
    const entries = [];
    if (node.url) {
      entries.push(['Open in new tab', () => { window.open(node.url, '_blank', 'noopener'); }]);
    } else {
      entries.push(['Open', () => { window.BookmarkIndex.openFolder(node.id); }]);
    }
    if (editable(node)) {
      entries.push([node.url ? 'Edit…' : 'Rename…', () => openDialog({ mode: 'edit', node, returnFocus: trigger })]);
      entries.push([node.url ? 'Delete' : 'Delete folder', () => confirmDelete(node, trigger), 'danger']);
    }
    menu.replaceChildren(...entries.map(([text, run, cls]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.textContent = text;
      if (cls) b.className = cls;
      b.addEventListener('click', () => { closeMenu(false); run(); });
      return b;
    }));
    menu.hidden = false;
    // keep it on screen
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
    menu.querySelector('button')?.focus();
  }
  function closeMenu(restoreFocus = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    menuFor?.trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) menuFor?.trigger?.focus?.({ preventScroll: true });
    menuFor = null;
  }
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    else if (e.key === 'Tab') closeMenu(false);
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(false); }, true);
  window.addEventListener('blur', () => closeMenu(false));
  document.getElementById('grid-scroll')?.addEventListener('scroll', () => closeMenu(false), { passive: true });

  /* ---------- tiles: ⋯ button, right-click, dragging ---------- */

  let dragId = null;

  function decorate(wrap, node) {
    if (!editable(node)) return; // Chrome's own folders: open only
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tile-more';
    more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    more.title = 'More';
    more.setAttribute('aria-label', `More for “${nameOf(node)}”`);
    more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', e => {
      e.stopPropagation();
      const r = more.getBoundingClientRect();
      openMenu(G().node(node.id) || node, { x: r.left, y: r.bottom + 4, trigger: more });
    });
    wrap.append(more);

    wrap.addEventListener('contextmenu', e => {
      e.preventDefault();
      openMenu(G().node(node.id) || node, { x: e.clientX, y: e.clientY, trigger: more });
    });

    const tile = wrap.querySelector('.tile');
    tile.draggable = true;
    tile.addEventListener('dragstart', e => {
      dragId = node.id;
      e.dataTransfer.effectAllowed = 'move';
      if (node.url) e.dataTransfer.setData('text/uri-list', node.url);
      e.dataTransfer.setData('text/plain', node.url || nameOf(node));
      requestAnimationFrame(() => wrap.classList.add('dragging'));
    });
    tile.addEventListener('dragend', () => { dragId = null; wrap.classList.remove('dragging'); clearMarks(); });
  }

  function addTile() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile add-tile';
    b.innerHTML = '<div class="icon add-icon" aria-hidden="true">+</div><div class="label">Add</div>';
    b.title = 'Add a bookmark or folder here';
    b.setAttribute('aria-label', 'Add a bookmark or folder here');
    b.addEventListener('click', () => openDialog({ mode: 'add', returnFocus: b }));
    return b;
  }

  /* where a drop at (x, y) goes: into a folder tile, before/after a tile, or to the end */
  function dropTarget(e) {
    const wrap = e.target.closest?.('#grid .tile-wrap');
    const dragged = G().node(dragId);
    if (!wrap || !dragged || wrap.dataset.id === dragId) return { kind: 'end' };
    const target = G().node(wrap.dataset.id);
    if (!target) return { kind: 'end' };
    const r = wrap.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    if (!target.url && fx > 0.22 && fx < 0.78 && !(dragged.url ? false : descendants(dragged.id).has(target.id))) {
      return { kind: 'into', wrap, target };
    }
    if (G().isRoot(target.id)) return { kind: 'end' }; // can't sit beside Chrome's own folders
    return { kind: fx < 0.5 ? 'before' : 'after', wrap, target };
  }
  function clearMarks() {
    grid.querySelectorAll('.drop-into, .drop-before, .drop-after').forEach(el => el.classList.remove('drop-into', 'drop-before', 'drop-after'));
    crumbs.querySelectorAll('.drop-into').forEach(el => el.classList.remove('drop-into'));
  }

  grid.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const t = dropTarget(e);
    clearMarks();
    if (t.wrap) t.wrap.classList.add(`drop-${t.kind}`);
  });
  grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) clearMarks(); });
  grid.addEventListener('drop', async e => {
    if (!dragId) return;
    e.preventDefault();
    const id = dragId;
    const t = dropTarget(e);
    clearMarks();
    const node = G().node(id);
    try {
      if (t.kind === 'into') {
        await api().move(id, { parentId: t.target.id });
        await after();
        say(`Moved “${nameOf(node)}” to ${nameOf(t.target)}`);
      } else if (t.kind === 'before' || t.kind === 'after') {
        await api().move(id, { parentId: t.target.parentId, index: t.target.index + (t.kind === 'after' ? 1 : 0) });
        await after();
      } else {
        await api().move(id, { parentId: G().currentFolder() }); // to the end
        await after();
      }
    } catch (err) {
      say(`Couldn’t move it: ${err.message || err}`);
    }
  });

  // drop on a folder in the path ("Bookmarks › Work") to move it up
  crumbs.addEventListener('dragover', e => {
    const btn = e.target.closest?.('button[data-id]');
    if (!dragId || !btn || btn.getAttribute('aria-current') === 'page') return;
    e.preventDefault();
    clearMarks();
    btn.classList.add('drop-into');
  });
  crumbs.addEventListener('dragleave', e => { if (!crumbs.contains(e.relatedTarget)) clearMarks(); });
  crumbs.addEventListener('drop', async e => {
    const btn = e.target.closest?.('button[data-id]');
    if (!dragId || !btn) return;
    e.preventDefault();
    const node = G().node(dragId);
    clearMarks();
    await api().move(dragId, { parentId: btn.dataset.id });
    await after();
    say(`Moved “${nameOf(node)}” to ${btn.textContent}`);
  });

  window.BookmarkManage = {
    decorate,
    addTile,
    openAdd: (kind = 'bookmark') => openDialog({ mode: 'add', kind }),
  };
  // the grid was drawn before this script loaded: redraw it with the new controls
  if (G()?.refresh) G().refresh();
})();
