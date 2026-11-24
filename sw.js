'use strict';

/*
 * Service worker:
 * - finishes pomodoro sessions on time and shows a notification, even when no new tab page is
 *   open. Tabs only write state; this worker keeps an alarm in step with it and is the only
 *   place a session is completed.
 * - adds "Add page / link to Read Later" to the right-click menu.
 * - "refresh icons": reloads Chrome's icon cache for every bookmark.
 */
importScripts('pomodoro-core.js');

const ALARM = 'pomodoro';

async function readState() {
  const res = await chrome.storage.local.get(Pomo.KEY);
  return Pomo.normalize(res[Pomo.KEY]);
}

async function schedule(state) {
  await chrome.alarms.clear(ALARM);
  if (state.running && state.endsAt) {
    // Chrome may delay alarms under 30 s; open tabs also ask us to check when they hit zero.
    await chrome.alarms.create(ALARM, { when: Math.max(state.endsAt, Date.now() + 1000) });
  }
}

// Run completions one at a time so an alarm and a tab's request can't both advance the timer.
let queue = Promise.resolve();
function checkDone() {
  queue = queue.then(async () => {
    const state = await readState();
    if (!state.running || state.endsAt > Date.now() + 250) return;
    const next = Pomo.advance(state, { finished: true });
    await chrome.storage.local.set({ [Pomo.KEY]: next });
    const { title, message } = Pomo.notificationText(state, next);
    chrome.notifications.create(`pomodoro-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message: next.running ? `${message} Started automatically.` : message,
      priority: 2,
      requireInteraction: !next.running,
    });
  }).catch(err => console.error('pomodoro', err));
  return queue;
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) checkDone();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'pomodoro-check') {
    checkDone().then(() => sendResponse(true));
    return true; // async response
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[Pomo.KEY]) schedule(Pomo.normalize(changes[Pomo.KEY].newValue));
});

chrome.notifications.onClicked.addListener(id => chrome.notifications.clear(id));

// After a browser restart or update, catch up on a session that ended while Chrome was closed.
async function resync() {
  await checkDone();
  await schedule(await readState());
}
chrome.runtime.onStartup.addListener(resync);
chrome.runtime.onInstalled.addListener(resync);

/* ---------- read later (right-click menu) ---------- */

const READ_LATER = 'readLater'; // [{ id, url, title, addedAt }], newest first

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'read-later-page', title: 'Add page to Read Later', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'read-later-link', title: 'Add link to Read Later', contexts: ['link'] });
  });
}
chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup.addListener(setupMenus);

function readableTitle(url) {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
    const words = path.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    return words ? `${words} — ${u.hostname.replace(/^www\./, '')}` : u.hostname.replace(/^www\./, '');
  } catch { return url; }
}

function confirm(title, message) {
  const id = `read-later-${Date.now()}`;
  chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', title, message, silent: true, priority: 0 });
  setTimeout(() => chrome.notifications.clear(id), 4000);
}

// Saves one at a time so two quick right-clicks can't overwrite each other.
let saveQueue = Promise.resolve();
function saveForLater(url, title) {
  saveQueue = saveQueue.then(async () => {
    if (!/^https?:\/\//i.test(url || '')) {
      confirm('Can’t save this page', 'Only web pages (http or https) can be added to Read Later.');
      return;
    }
    const list = (await chrome.storage.local.get(READ_LATER))[READ_LATER] || [];
    const name = (title || '').trim() || readableTitle(url);
    if (list.some(item => item.url === url)) {
      confirm('Already in Read Later', name);
      return;
    }
    list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url, title: name, addedAt: Date.now() });
    await chrome.storage.local.set({ [READ_LATER]: list });
    confirm('Saved to Read Later', name);
  }).catch(err => console.error('read later', err));
  return saveQueue;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'read-later-page') {
    // activeTab grants the page's title for this click; the page URL comes with the click itself
    saveForLater(tab?.url || info.pageUrl, tab?.title);
  } else if (info.menuItemId === 'read-later-link') {
    // a selected link text makes a good title; otherwise one is derived from the address
    saveForLater(info.linkUrl, info.selectionText);
  }
});

/* ---------- "refresh icons": reload Chrome's icon cache for every bookmark ---------- */

// Chrome only stores a site's icon when the page is loaded in a tab, and gives extensions no way to
// ask for it directly. So each bookmark is opened in a minimized background window (muted, a few at
// a time), left until it has loaded and its icon is stored, then closed. Runs here, not in the page,
// so closing the new tab doesn't leave the window behind. Pages follow along with 'icons-progress'.
const ICON_TABS = 4;        // pages loading at once
const ICON_TIMEOUT = 20000; // give up on a page after this long
const ICON_SETTLE = 1500;   // after a page loads, time for its icon to be fetched and stored

let iconRun = null; // { done, total, windowId, stopped }
const iconStatus = () => (iconRun ? { running: true, done: iconRun.done, total: iconRun.total } : { running: false });
const tell = msg => chrome.runtime.sendMessage({ type: 'icons-progress', ...msg }).catch(() => {}); // no tab open: fine

async function bookmarkUrls() {
  const urls = new Set();
  const walk = n => { if (n.url && /^https?:/i.test(n.url)) urls.add(n.url); (n.children || []).forEach(walk); };
  (await chrome.bookmarks.getTree()).forEach(walk);
  return [...urls];
}

/* Open `url` in the window, wait until it has loaded (or timed out), give its icon a moment, close it. */
function visit(windowId, url) {
  return new Promise(resolve => {
    let tabId = null;
    let settle = null;
    const finish = () => {
      clearTimeout(timeout);
      clearTimeout(settle);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
      resolve();
    };
    const onUpdated = (id, change) => {
      if (id === tabId && change.status === 'complete') { clearTimeout(settle); settle = setTimeout(finish, ICON_SETTLE); }
    };
    const timeout = setTimeout(finish, ICON_TIMEOUT);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.create({ windowId, url, active: false })
      .then(tab => { tabId = tab.id; return chrome.tabs.update(tab.id, { muted: true }); })
      .catch(finish); // the window was closed
  });
}

async function refreshIcons() {
  if (iconRun) return;
  try {
    await runIconRefresh();
  } catch (err) {
    if (iconRun) chrome.windows.remove(iconRun.windowId).catch(() => {});
    iconRun = null;
    tell({ running: false, finished: true, error: String(err?.message || err) });
  }
}

async function runIconRefresh() {
  const urls = await bookmarkUrls();
  if (!urls.length) { tell({ running: false, done: 0, total: 0, finished: true }); return; }
  const win = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'minimized' });
  const run = iconRun = { done: 0, total: urls.length, windowId: win.id, stopped: false };
  tell(iconStatus());

  const queue = [...urls];
  await Promise.all(Array.from({ length: ICON_TABS }, async () => {
    while (queue.length && !run.stopped) {
      await visit(win.id, queue.shift());
      if (run.stopped) break; // that page was cut short
      run.done += 1;
      tell(iconStatus());
    }
  }));

  chrome.windows.remove(win.id).catch(() => {});
  iconRun = null;
  tell({ running: false, done: run.done, total: run.total, finished: true, stopped: run.stopped });
}

// Closing the window by hand stops the run.
chrome.windows.onRemoved.addListener(id => { if (iconRun && iconRun.windowId === id) iconRun.stopped = true; });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'icons-refresh') { refreshIcons(); sendResponse({ started: true, ...iconStatus() }); }
  else if (msg.type === 'icons-status') sendResponse(iconStatus());
  else if (msg.type === 'icons-stop') {
    if (iconRun) { iconRun.stopped = true; chrome.windows.remove(iconRun.windowId).catch(() => {}); }
    sendResponse(true);
  }
});
