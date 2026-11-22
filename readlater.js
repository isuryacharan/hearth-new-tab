'use strict';

/*
 * Read later list. Pages and links are added from the right-click menu (see sw.js); this shows
 * them beside the bookmarks on the second page, newest first. Click to open (Ctrl/⌘-click: new
 * tab), ✓ to mark as read. The R key and the palette's "later" command jump to it.
 */
(() => {
  const store = window.appStore;
  const KEY = 'readLater';

  const els = {
    list: document.getElementById('later-list'),
    empty: document.getElementById('later-empty'),
    count: document.getElementById('later-count'),
  };

  let items = [];

  const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    const steps = [['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['month', 2629800], ['year', 31557600]];
    let unit = 'minute', size = 60;
    for (const [u, n] of steps) if (s >= n) { unit = u; size = n; }
    return rtf.format(-Math.floor(s / size), unit);
  }

  function render() {
    els.list.replaceChildren(...items.map(item => {
      const li = document.createElement('li');
      li.className = 'later-item';

      const a = document.createElement('a');
      a.className = 'later-link';
      a.href = item.url;
      a.title = `${item.title}\n${item.url}`;

      const icon = window.BookmarkIndex ? BookmarkIndex.icon({ url: item.url, title: item.title }) : document.createElement('span');
      icon.classList.add('later-icon');

      const text = document.createElement('span');
      text.className = 'later-text';
      const title = document.createElement('span');
      title.className = 'later-title';
      title.textContent = item.title;
      const meta = document.createElement('span');
      meta.className = 'later-meta';
      meta.textContent = `${hostOf(item.url)} · ${ago(item.addedAt)}`;
      text.append(title, meta);
      a.append(icon, text);

      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'later-done';
      done.textContent = '✓';
      done.title = 'Mark as read (removes it)';
      done.setAttribute('aria-label', `Mark “${item.title}” as read`);
      done.addEventListener('click', () => remove(item.id));

      li.append(a, done);
      return li;
    }));

    els.empty.hidden = items.length > 0;
    els.count.textContent = items.length ? `${items.length} saved` : '';
  }

  async function remove(id) {
    items = items.filter(i => i.id !== id);
    render();
    await store.set(KEY, items);
  }

  // Keep the "2 hours ago" labels fresh while the page stays open.
  setInterval(() => { if (items.length) render(); }, 60 * 1000);

  // Pages saved from the right-click menu appear immediately in open tabs.
  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) {
        items = changes[KEY].newValue || [];
        render();
      }
    });
  }

  /* Go to the bookmarks page and put the keyboard on the first saved item. */
  function show() {
    Dock.close();
    document.activeElement?.blur();
    Pages.go('bookmarks');
    const first = els.list.querySelector('.later-link');
    if (first) first.focus({ preventScroll: true });
    els.list.closest('.later-col').scrollIntoView({ block: 'nearest' }); // stacked layout: bring it into view
  }
  // R jumps to the list (when you're not typing somewhere).
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const t = e.target;
    if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    e.preventDefault();
    show();
  });

  window.ReadLater = { items: () => items, remove, show };

  (async () => {
    items = await store.get(KEY, []);
    render();
  })();
})();
