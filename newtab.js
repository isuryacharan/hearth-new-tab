'use strict';

const ROOT = 'root';
const hasBookmarksApi = typeof chrome !== 'undefined' && chrome.bookmarks;

const els = {
  grid: document.getElementById('grid'),
  crumbs: document.getElementById('crumbs'),
  search: document.getElementById('search'),
  empty: document.getElementById('empty'),
  hint: document.getElementById('to-bookmarks'),
  bookmarksPage: document.getElementById('page-bookmarks'),
  homePage: document.getElementById('page-home'),
  time: document.getElementById('time'),
  date: document.getElementById('date'),
};

let tree = null;          // virtual root node
let byId = new Map();     // id -> { node, parent }
let allLinks = [];        // flattened { node, path }
let allFolders = [];      // flattened { node, path } (excluding the top level)
let barId = '1';          // Chrome's bookmarks bar: where the top level of the grid really lives
let rootIds = new Set();  // Chrome's own top folders (bar, other, mobile): can't be edited or moved
let sampleRoot = null;    // outside the extension: sample bookmarks, kept so edits stick (see bookmarks-manage.js)

/* ---------- data ---------- */

async function loadTree() {
  const [realRoot] = hasBookmarksApi ? await chrome.bookmarks.getTree() : [sampleRoot ||= indexSample(sampleTree()[0])];
  const top = realRoot.children || [];
  rootIds = new Set(top.map(n => n.id));
  // Chrome ids: "1" bookmarks bar, "2" other bookmarks, "3" mobile bookmarks.
  // Show the bar's contents at the top level, with the other root folders as folder tiles.
  const bar = top.find(n => n.id === '1') || top[0];
  barId = bar ? bar.id : '1';
  const rest = top.filter(n => n !== bar && n.children && n.children.length);
  tree = {
    id: ROOT,
    title: 'Bookmarks',
    children: [...(bar ? bar.children || [] : []), ...rest],
  };

  byId = new Map();
  allLinks = [];
  allFolders = [];
  const walk = (node, parent, path) => {
    byId.set(node.id, { node, parent });
    for (const child of node.children || []) {
      if (child.url) {
        allLinks.push({ node: child, path });
      } else {
        allFolders.push({ node: child, path });
        walk(child, node, [...path, child.title || 'Untitled']);
      }
    }
  };
  walk(tree, null, []);
}

/* ---------- rendering ---------- */

function currentFolderId() {
  const m = location.hash.match(/folder=([^&]+)/);
  const id = m ? decodeURIComponent(m[1]) : ROOT;
  return byId.has(id) ? id : ROOT;
}

function render() {
  renderFolder();
}

/* Page 2: the current folder. */
function renderFolder() {
  const folderId = currentFolderId();
  const folder = byId.get(folderId).node;
  renderCrumbs(folderId);

  const children = folder.children || [];
  const folders = children.filter(c => !c.url);
  const links = children.filter(c => c.url);
  const tiles = [...folders.map(f => folderTile(f)), ...links.map(l => pinnableTile(l))];
  const addTile = window.BookmarkManage?.addTile(); // "+ Add" at the end (bookmarks-manage.js)
  els.grid.replaceChildren(...tiles, ...(addTile ? [addTile] : []));
  els.empty.hidden = tiles.length > 0;
  els.empty.textContent = 'This folder is empty.';
  staggerTiles();
}

/* Each tile's place in the reveal wave: top-left first, rippling diagonally (see --i in CSS). */
function staggerTiles() {
  const cols = getComputedStyle(els.grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  [...els.grid.children].forEach((tile, n) => {
    const row = Math.floor(n / cols);
    const col = n % cols;
    tile.style.setProperty('--i', Math.min(1 + row + col * 0.55, 13).toFixed(2));
  });
}
window.addEventListener('resize', () => requestAnimationFrame(staggerTiles));

function renderCrumbs(folderId) {
  const chain = [];
  for (let id = folderId; id; ) {
    const entry = byId.get(id);
    chain.unshift(entry.node);
    id = entry.parent ? entry.parent.id : null;
  }
  const parts = [];
  chain.forEach((node, i) => {
    if (i) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '›';
      parts.push(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = node.id === ROOT ? barId : node.id; // a drop target for moving bookmarks up
    btn.textContent = node.title || 'Untitled';
    if (i === chain.length - 1) btn.setAttribute('aria-current', 'page');
    else btn.addEventListener('click', () => openFolder(node.id));
    parts.push(btn);
  });
  els.crumbs.replaceChildren(...parts);
}

function folderTile(folder) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'tile';
  const count = (folder.children || []).length;
  tile.setAttribute('aria-label', `${folder.title || 'Untitled'}, ${count} item${count === 1 ? '' : 's'} (Space to peek inside)`); // hover shows a peek (peek.js), not a tooltip
  tile.addEventListener('click', () => openFolder(folder.id));

  const icon = document.createElement('div');
  icon.className = 'icon folder';
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';

  tile.append(icon, label(folder.title || 'Untitled'), sub(`${count} item${count === 1 ? '' : 's'}`));

  // wrapped like bookmark tiles, so it can carry the ⋯ menu button and be dragged / dropped onto
  const wrap = document.createElement('div');
  wrap.className = 'tile-wrap folder-wrap';
  wrap.dataset.id = folder.id;
  wrap.append(tile);
  window.BookmarkManage?.decorate(wrap, folder);
  return wrap;
}

/* A bookmark tile with a ☆ in its corner to pin it to (or unpin it from) the quick links row. */
function pinnableTile(bm) {
  const wrap = document.createElement('div');
  wrap.className = 'tile-wrap';
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'tile-pin';
  pin.dataset.bookmarkId = bm.id;
  pin.addEventListener('click', async () => {
    const pinned = await window.QuickLinks?.toggleBookmark({ id: bm.id, url: bm.url, title: bm.title });
    setPinState(pin, bm, pinned);
  });
  setPinState(pin, bm, window.QuickLinks?.isPinned(bm));
  wrap.dataset.id = bm.id;
  wrap.append(linkTile(bm), pin);
  window.BookmarkManage?.decorate(wrap, bm);
  return wrap;
}

function setPinState(pin, bm, pinned) {
  pin.classList.toggle('pinned', !!pinned);
  pin.textContent = pinned ? '★' : '☆';
  const name = bm.title || hostOf(bm.url);
  pin.title = pinned ? 'Remove from quick links' : 'Add to quick links';
  pin.setAttribute('aria-label', pinned ? `Remove “${name}” from quick links` : `Add “${name}” to quick links`);
  pin.setAttribute('aria-pressed', String(!!pinned));
}

// Quick links changed (here or in another tab): refresh the ☆ / ★ on visible tiles.
window.addEventListener('quicklinks-change', () => {
  for (const pin of els.grid.querySelectorAll('.tile-pin')) {
    const entry = allLinks.find(l => l.node.id === pin.dataset.bookmarkId);
    if (entry) setPinState(pin, entry.node, window.QuickLinks?.isPinned(entry.node));
  }
});

function linkTile(bm, subtitle) {
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = bm.url;
  a.title = `${bm.title || bm.url}\n${bm.url}`;

  a.append(faviconEl(bm), label(bm.title || hostOf(bm.url) || bm.url));
  if (subtitle) a.append(sub(subtitle));
  return a;
}

function label(text) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  return el;
}

function sub(text) {
  const el = document.createElement('div');
  el.className = 'sub';
  el.textContent = text;
  return el;
}

/* Icons come from Chrome's own icon cache ("refresh icons" reloads it, see sw.js), else a coloured letter. */
let iconVersion = 0; // bumped after a refresh, so this page doesn't reuse icons it already loaded
function faviconEl(bm) {
  const box = document.createElement('div');
  box.className = 'icon';
  const host = hostOf(bm.url);

  const showLetter = () => {
    box.className = 'icon letter';
    box.style.background = colorFor(host || bm.url);
    box.textContent = (bm.title || host || '?').trim().charAt(0).toUpperCase() || '?';
  };

  if (hasBookmarksApi && chrome.runtime && chrome.runtime.getURL) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(bm.url)}&size=64${iconVersion ? `&v=${iconVersion}` : ''}`);
    img.addEventListener('error', () => { img.remove(); showLetter(); });
    box.append(img);
  } else {
    showLetter();
  }
  return box;
}

/* ---------- "refresh icons": progress while sw.js reloads Chrome's icon cache ---------- */

const iconProgress = (() => {
  const el = document.createElement('div');
  el.className = 'icons-progress';
  el.setAttribute('role', 'status');
  el.hidden = true;
  el.innerHTML = '<span class="icons-progress-text"></span><button type="button" class="icons-progress-stop">Stop</button><span class="icons-progress-bar" aria-hidden="true"><i></i></span>';
  document.body.append(el);
  const text = el.querySelector('.icons-progress-text');
  const stop = el.querySelector('.icons-progress-stop');
  const bar = el.querySelector('.icons-progress-bar i');
  let hideTimer = null;
  stop.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'icons-stop' }).catch(() => {}));

  function show(s) {
    clearTimeout(hideTimer);
    el.hidden = false;
    if (s.finished) {
      text.textContent = s.error ? `Couldn’t refresh icons: ${s.error}`
        : !s.total ? 'No bookmarked sites to refresh'
        : s.stopped ? `Stopped · refreshed ${s.done} of ${s.total}` : `Icons refreshed for ${s.total} bookmark${s.total === 1 ? '' : 's'}`;
      stop.hidden = true;
      bar.style.width = '100%';
      iconVersion = Date.now(); // draw the icons again, from the refreshed cache
      render();
      window.dispatchEvent(new Event('bookmarks-change'));
      hideTimer = setTimeout(() => { el.hidden = true; }, s.error ? 9000 : 4000);
    } else {
      text.textContent = s.total ? `Refreshing icons · ${s.done} of ${s.total}` : 'Refreshing icons…';
      stop.hidden = false;
      bar.style.width = s.total ? `${(s.done / s.total) * 100}%` : '0%';
    }
  }

  if (hasBookmarksApi && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'icons-progress') show(msg); });
    // a refresh started from another tab is already running
    chrome.runtime.sendMessage({ type: 'icons-status' }).then(s => { if (s?.running) show(s); }).catch(() => {});
  }

  return {
    start() {
      if (!hasBookmarksApi) return 'Refreshing icons works in the extension only';
      show({ done: 0, total: 0 });
      // No answer means the service worker is an older copy: Chrome keeps it until the extension is reloaded.
      const outdated = { finished: true, error: 'reload Hearth in chrome://extensions, then try again' };
      chrome.runtime.sendMessage({ type: 'icons-refresh' })
        .then(s => { if (!s?.started) show(outdated); else if (s.running) show(s); })
        .catch(() => show(outdated));
      return undefined;
    },
  };
})();

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function colorFor(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

function openFolder(id) {
  location.hash = id === ROOT ? '' : `folder=${encodeURIComponent(id)}`;
  if (id === ROOT) renderFolder(); // empty hash may not fire hashchange
}

/* ---------- clock ---------- */

const timeGhost = document.getElementById('time-ghost');
const dateGhost = document.getElementById('date-ghost');

function tick() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  // only touch the DOM when the text changes, so the clock layers aren't repainted every second
  if (els.time.textContent !== time) els.time.textContent = timeGhost.textContent = time;
  if (els.date.textContent !== date) els.date.textContent = dateGhost.textContent = date;
}

/* ---------- wiring ---------- */

async function refresh() {
  await loadTree();
  render();
  window.dispatchEvent(new Event('bookmarks-change')); // e.g. quick links show bookmarks' current names
}

window.addEventListener('hashchange', () => {
  renderFolder();
  document.getElementById('grid-scroll').scrollTop = 0; // a new folder starts at the top
  if (currentFolderId() !== ROOT) Pages.go('bookmarks'); // e.g. browser Back into a folder
});
els.hint.addEventListener('click', () => Pages.go('bookmarks'));

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
  if (t.closest && t.closest('#drawer, #dock')) return;
  if (e.key === '/') {
    e.preventDefault();
    Pages.go('home');
    els.search.focus({ preventScroll: true });
  }
  if (e.key === 'Backspace' && currentFolderId() !== ROOT) {
    const parent = byId.get(currentFolderId()).parent;
    openFolder(parent ? parent.id : ROOT);
  }
});

if (hasBookmarksApi) {
  for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
    chrome.bookmarks[ev] && chrome.bookmarks[ev].addListener(refresh);
  }
}

/* Bookmark data for the command palette (palette.js). */
window.BookmarkIndex = {
  links: () => allLinks,
  folders: () => allFolders,
  icon: bm => faviconEl(bm),
  refreshIcons: () => iconProgress.start(),
  openFolder(id) {
    openFolder(id);
    Pages.go('bookmarks');
  },
};

/* What bookmark management (bookmarks-manage.js) needs from the grid. */
window.BookmarkGrid = {
  node: id => byId.get(id)?.node || allLinks.find(l => l.node.id === id)?.node || null,
  /* Chrome folder the grid is showing (the top level is really the bookmarks bar). */
  currentFolder: () => (currentFolderId() === ROOT ? barId : currentFolderId()),
  isRoot: id => rootIds.has(id) || id === ROOT,
  /* every folder you can put things in, with its path, for the "Folder" picker */
  folders: () => [
    { id: barId, path: 'Bookmarks bar' },
    ...allFolders.map(({ node, path }) => ({ id: node.id, path: [...path, node.title || 'Untitled'].join(' › ') })),
  ],
  barId: () => barId,
  refresh,
  sampleRoot: () => sampleRoot,
  usingChrome: !!hasBookmarksApi,
};

tick();
setInterval(tick, 1000);
refresh().then(() => {
  // Coming back into a folder (reload) lands on the bookmarks page.
  if (currentFolderId() !== ROOT) Pages.go('bookmarks', { animate: false });
});

/* ---------- sample data when opened outside the extension ---------- */

/* Give sample nodes the parentId / index fields Chrome's real nodes have. */
function indexSample(node, parentId) {
  if (parentId !== undefined) node.parentId = parentId;
  (node.children || []).forEach((child, i) => { child.index = i; indexSample(child, node.id); });
  return node;
}

function sampleTree() {
  let n = 100;
  const bm = (title, url) => ({ id: String(n++), title, url });
  const folder = (title, children) => ({ id: String(n++), title, children });
  return [{
    id: '0', title: '', children: [
      { id: '1', title: 'Bookmarks bar', children: [
        folder('Work', [bm('GitHub', 'https://github.com'), bm('Jira', 'https://atlassian.com'),
          folder('Docs', [bm('MDN', 'https://developer.mozilla.org'), bm('Node.js', 'https://nodejs.org')])]),
        folder('News', [bm('Hacker News', 'https://news.ycombinator.com'), bm('BBC', 'https://bbc.com')]),
        bm('Gmail', 'https://mail.google.com'), bm('YouTube', 'https://youtube.com'),
        bm('Wikipedia', 'https://wikipedia.org'), bm('Reddit', 'https://reddit.com'),
        bm('Stack Overflow', 'https://stackoverflow.com'), bm('Amazon', 'https://amazon.com'),
        bm('Netflix', 'https://netflix.com'), bm('Maps', 'https://maps.google.com'),
      ] },
      { id: '2', title: 'Other bookmarks', children: [bm('Figma', 'https://figma.com')] },
      { id: '3', title: 'Mobile bookmarks', children: [] },
    ],
  }];
}
