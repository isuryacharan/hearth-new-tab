'use strict';

/*
 * Service worker: finishes pomodoro sessions on time and shows a notification,
 * even when no new tab page is open. Tabs only write state; this worker keeps
 * an alarm in step with it and is the only place a session is completed.
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
