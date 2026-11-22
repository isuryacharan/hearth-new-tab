'use strict';

/*
 * Service worker:
 * - finishes pomodoro sessions on time and shows a notification, even when no new tab page is
 *   open. Tabs only write state; this worker keeps an alarm in step with it and is the only
 *   place a session is completed.
 * - adds "Add page / link to Read Later" to the right-click menu.
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
