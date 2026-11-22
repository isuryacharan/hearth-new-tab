'use strict';

const ROOT = 'root';
const hasBookmarksApi = typeof chrome !== 'undefined' && chrome.bookmarks;

const els = {
  grid: document.getElementById('grid'),
  crumbs: document.getElementById('crumbs'),
  search: document.getElementById('search'),
  empty: document.getElementById('empty'),
  time: document.getElementById('time'),
  date: document.getElementById('date'),
};

let tree = null;          // virtual root node
let byId = new Map();     // id -> { node, parent }
let allLinks = [];        // flattened { node, path }

/* ---------- data ---------- */

async function loadTree() {
  const [realRoot] = hasBookmarksApi ? await chrome.bookmarks.getTree() : sampleTree();
  const top = realRoot.children || [];
  // Chrome ids: "1" bookmarks bar, "2" other bookmarks, "3" mobile bookmarks.
  // Show the bar's contents at the top level, with the other root folders as folder tiles.
  const bar = top.find(n => n.id === '1') || top[0];
  const rest = top.filter(n => n !== bar && n.children && n.children.length);
  tree = {
    id: ROOT,
    title: 'Bookmarks',
    children: [...(bar ? bar.children || [] : []), ...rest],
  };

  byId = new Map();
  allLinks = [];
  const walk = (node, parent, path) => {
    byId.set(node.id, { node, parent });
    for (const child of node.children || []) {
      if (child.url) {
        allLinks.push({ node: child, path });
      } else {
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
  const q = els.search.value.trim().toLowerCase();
  if (q) return renderSearch(q);

  const folderId = currentFolderId();
  const folder = byId.get(folderId).node;
  renderCrumbs(folderId);

  const children = folder.children || [];
  const folders = children.filter(c => !c.url);
  const links = children.filter(c => c.url);
  renderTiles([
    ...folders.map(f => folderTile(f)),
    ...links.map(l => linkTile(l)),
  ], 'This folder is empty.');
}

function renderSearch(q) {
  els.crumbs.replaceChildren(crumbText('Search results'));
  const matches = allLinks.filter(({ node }) =>
    (node.title || '').toLowerCase().includes(q) || node.url.toLowerCase().includes(q));
  renderTiles(
    matches.map(({ node, path }) => linkTile(node, path.join(' / ') || 'Bookmarks')),
    `No bookmarks match "${els.search.value.trim()}".`
  );
}

function renderTiles(tiles, emptyMsg) {
  els.grid.replaceChildren(...tiles);
  els.empty.hidden = tiles.length > 0;
  els.empty.textContent = emptyMsg;
}

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
    btn.textContent = node.title || 'Untitled';
    if (i === chain.length - 1) btn.setAttribute('aria-current', 'page');
    else btn.addEventListener('click', () => openFolder(node.id));
    parts.push(btn);
  });
  els.crumbs.replaceChildren(...parts);
}

function crumbText(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  btn.setAttribute('aria-current', 'page');
  return btn;
}

function folderTile(folder) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'tile';
  const count = (folder.children || []).length;
  tile.title = `${folder.title || 'Untitled'} (${count})`;
  tile.addEventListener('click', () => openFolder(folder.id));

  const icon = document.createElement('div');
  icon.className = 'icon folder';
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';

  tile.append(icon, label(folder.title || 'Untitled'), sub(`${count} item${count === 1 ? '' : 's'}`));
  return tile;
}

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
    img.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(bm.url)}&size=64`);
    img.addEventListener('error', () => { img.remove(); showLetter(); });
    box.append(img);
  } else {
    showLetter();
  }
  return box;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function colorFor(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

function openFolder(id) {
  els.search.value = '';
  location.hash = id === ROOT ? '' : `folder=${encodeURIComponent(id)}`;
  if (id === ROOT) render(); // empty hash may not fire hashchange
}

/* ---------- clock ---------- */

function tick() {
  const now = new Date();
  els.time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  els.date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ---------- wiring ---------- */

async function refresh() {
  await loadTree();
  render();
}

window.addEventListener('hashchange', render);
els.search.addEventListener('input', render);
els.search.addEventListener('keydown', e => {
  if (e.key === 'Escape') { els.search.value = ''; render(); els.search.blur(); }
  if (e.key === 'Enter') {
    const first = els.grid.querySelector('.tile');
    if (first) first.click();
  }
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
  if (e.key === '/') {
    e.preventDefault();
    els.search.focus();
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

tick();
setInterval(tick, 1000);
refresh();

/* ---------- sample data when opened outside the extension ---------- */

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
