'use strict';

/*
 * Folder peek: see what's in a folder without opening it.
 *   - hover a folder tile for a moment, or focus it and press Space
 *   - click an item to open it (Ctrl/⌘-click or middle-click: new tab); a subfolder opens in the grid
 *   - ↑ ↓ move through the items, Esc closes and returns to the tile
 */
(() => {
  const grid = document.getElementById('grid');
  const scroller = document.getElementById('grid-scroll');
  const HOVER_DELAY = 450;
  const MAX_ITEMS = 12;

  const pop = document.createElement('div');
  pop.className = 'peek';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  document.body.append(pop);

  let current = null;   // { id, wrap }
  let showTimer = null;
  let hideTimer = null;
  let dragging = false;

  const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const folderSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';

  function build(folder) {
    const kids = folder.children || [];
    const items = [...kids.filter(c => !c.url), ...kids.filter(c => c.url)]; // as in the grid: folders first
    const head = document.createElement('div');
    head.className = 'peek-head';
    head.innerHTML = `<span class="peek-title"></span><span class="peek-count"></span>`;
    head.querySelector('.peek-title').textContent = folder.title || 'Untitled';
    head.querySelector('.peek-count').textContent = `${kids.length} item${kids.length === 1 ? '' : 's'}`;

    const list = document.createElement('div');
    list.className = 'peek-list';
    list.setAttribute('role', 'menu');
    for (const node of items.slice(0, MAX_ITEMS)) {
      const el = document.createElement(node.url ? 'a' : 'button');
      el.className = 'peek-item';
      el.setAttribute('role', 'menuitem');
      el.tabIndex = -1;
      let icon;
      if (node.url) {
        el.href = node.url;
        el.title = node.url;
        icon = window.BookmarkIndex.icon(node);
      } else {
        el.type = 'button';
        icon = document.createElement('span');
        icon.className = 'icon folder';
        icon.innerHTML = folderSvg;
        el.addEventListener('click', () => { hide(); window.BookmarkIndex.openFolder(node.id); });
      }
      icon.classList.add('peek-icon');
      const name = document.createElement('span');
      name.className = 'peek-name';
      name.textContent = node.title || (node.url ? hostOf(node.url) : 'Untitled');
      el.append(icon, name);
      if (!node.url) el.append(Object.assign(document.createElement('span'), { className: 'peek-sub', textContent: `${(node.children || []).length}` }));
      list.append(el);
    }
    if (!items.length) list.append(Object.assign(document.createElement('p'), { className: 'peek-empty', textContent: 'Empty folder' }));

    const foot = document.createElement('button');
    foot.type = 'button';
    foot.className = 'peek-open';
    foot.tabIndex = -1;
    foot.textContent = items.length > MAX_ITEMS ? `Open folder · ${items.length - MAX_ITEMS} more` : 'Open folder';
    foot.addEventListener('click', () => { hide(); window.BookmarkIndex.openFolder(folder.id); });

    pop.replaceChildren(head, list, foot);
    pop.setAttribute('aria-label', `Inside ${folder.title || 'Untitled'}`);
  }

  function place(wrap) {
    const r = wrap.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const gap = 8;
    // below the tile if it fits, else above; never off screen
    let top = r.bottom + gap;
    if (top + p.height > innerHeight - gap && r.top - gap - p.height > gap) top = r.top - gap - p.height;
    top = Math.max(gap, Math.min(top, innerHeight - p.height - gap));
    const left = Math.max(gap, Math.min(r.left + r.width / 2 - p.width / 2, innerWidth - p.width - gap));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function show(wrap, { focus = false } = {}) {
    const folder = window.BookmarkGrid?.node(wrap.dataset.id);
    if (!folder || folder.url) return;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    current = { id: folder.id, wrap };
    build(folder);
    pop.hidden = false;
    place(wrap);
    pop.classList.remove('show');
    requestAnimationFrame(() => pop.classList.add('show'));
    if (focus) pop.querySelector('.peek-item, .peek-open')?.focus({ preventScroll: true });
  }

  function hide({ restoreFocus = false } = {}) {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (pop.hidden) return;
    const wrap = current?.wrap;
    pop.hidden = true;
    pop.classList.remove('show');
    current = null;
    if (restoreFocus && wrap?.isConnected) wrap.querySelector('.tile')?.focus({ preventScroll: true });
  }
  const hideSoon = () => { clearTimeout(showTimer); clearTimeout(hideTimer); hideTimer = setTimeout(hide, 220); };

  /* ---------- hover ---------- */

  grid.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch' || dragging) return;
    const wrap = e.target.closest('.folder-wrap');
    if (!wrap) return;
    if (e.target.closest('.tile-more')) return; // the ⋯ menu is about to open: stay out of its way
    if (current?.wrap === wrap) { clearTimeout(hideTimer); return; }
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    // already peeking at another folder: switch straight away
    showTimer = setTimeout(() => show(wrap), current ? 0 : HOVER_DELAY);
  });
  grid.addEventListener('pointerout', e => {
    const wrap = e.target.closest('.folder-wrap');
    if (!wrap || wrap.contains(e.relatedTarget) || pop.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    if (current) hideSoon();
  });
  pop.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  pop.addEventListener('pointerleave', e => { if (!current?.wrap.contains(e.relatedTarget)) hideSoon(); });

  /* ---------- keyboard ---------- */

  grid.addEventListener('keydown', e => {
    if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
    const wrap = e.target.closest('.folder-wrap');
    if (!wrap || !e.target.classList.contains('tile')) return;
    e.preventDefault(); // Space peeks; Enter still opens
    if (current?.wrap === wrap) hide();
    else show(wrap, { focus: true });
  });
  pop.addEventListener('keydown', e => {
    const items = [...pop.querySelectorAll('.peek-item, .peek-open')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items.at(-1)?.focus(); }
    else if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); hide({ restoreFocus: true }); }
    else if (e.key === 'Tab') hide({ restoreFocus: true });
  });

  /* ---------- out of the way ---------- */

  pop.addEventListener('click', e => { if (e.target.closest('a.peek-item') && !e.ctrlKey && !e.metaKey && !e.shiftKey) hide(); });
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !current?.wrap.contains(e.target)) hide();
  }, true);
  document.addEventListener('dragstart', () => { dragging = true; hide(); });
  document.addEventListener('dragend', () => { dragging = false; });
  document.addEventListener('contextmenu', () => hide());
  scroller?.addEventListener('scroll', () => hide(), { passive: true });
  window.addEventListener('hashchange', () => hide());
  document.addEventListener('wheel', e => { if (!pop.contains(e.target)) hide(); }, { passive: true }); // e.g. back to the home page
  window.addEventListener('blur', () => hide());
  window.addEventListener('resize', () => hide());
  window.addEventListener('bookmarks-change', () => {
    // the folder changed (or the grid was redrawn): follow it, or close if it's gone
    if (!current) return;
    const wrap = grid.querySelector(`.folder-wrap[data-id="${CSS.escape(current.id)}"]`);
    if (wrap) show(wrap); else hide();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) hide(); });
})();
