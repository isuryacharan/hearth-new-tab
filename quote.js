'use strict';

/*
 * Quote of the day from https://dummyjson.com/quotes/random.
 * The quote is cached with the local date it was fetched on, so every new tab that day shows
 * the same quote without a network request; the next day gets a new one (also at midnight,
 * if the tab stays open). If fetching fails, the last cached quote is kept.
 */
(() => {
  const store = window.appStore;
  const KEY = 'quoteOfDay';
  const API = 'https://dummyjson.com/quotes/random';

  const ENABLED_KEY = 'quoteEnabled';

  const box = document.getElementById('quote');
  const text = document.getElementById('quote-text');
  const author = document.getElementById('quote-author');
  const hideBtn = document.getElementById('quote-hide');

  let enabled = true; // turned off from the palette ("quote") or the × on the quote; off = no requests

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function show(q) {
    if (!enabled || !q || !q.quote) return;
    text.textContent = q.quote;
    author.textContent = q.author || 'Unknown';
    box.hidden = false;
  }

  async function load() {
    if (!enabled) return;
    const date = todayKey();
    const cached = await store.get(KEY, null);
    if (cached && cached.date === date) return show(cached);

    show(cached); // yesterday's quote meanwhile, rather than an empty space
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { quote, author: who } = await res.json();
      if (!quote) throw new Error('no quote');
      const fresh = { date, quote, author: who };
      await store.set(KEY, fresh);
      show(fresh);
    } catch {
      /* offline or API down: keep whatever is showing */
    }
  }

  // Roll over at midnight for tabs left open.
  let shownFor = todayKey();
  setInterval(() => {
    if (todayKey() !== shownFor) { shownFor = todayKey(); load(); }
  }, 60 * 1000);

  /* ---------- on / off ---------- */

  function apply(on) {
    enabled = on;
    if (on) load();
    else box.hidden = true;
  }

  async function setEnabled(on) {
    apply(on);
    await store.set(ENABLED_KEY, on);
  }

  hideBtn.addEventListener('click', async () => {
    await setEnabled(false);
    window.Palette?.say('Daily quote hidden — type “quote” to bring it back');
  });

  // Other open tabs follow: a new day's quote as soon as one tab fetches it, and the on/off setting.
  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[ENABLED_KEY]) apply(changes[ENABLED_KEY].newValue !== false);
      if (changes[KEY]?.newValue?.date === todayKey()) show(changes[KEY].newValue);
    });
  }

  window.Quote = { enabled: () => enabled, setEnabled };

  (async () => {
    apply((await store.get(ENABLED_KEY, true)) !== false);
  })();
})();
