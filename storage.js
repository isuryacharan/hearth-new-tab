'use strict';

/* Small key/value store: chrome.storage.local in the extension, localStorage when previewed outside it. */
window.appStore = (() => {
  const useChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  return {
    useChrome,
    async get(key, fallback) {
      if (useChrome) {
        const res = await chrome.storage.local.get(key);
        return res[key] ?? fallback;
      }
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    async set(key, value) {
      if (useChrome) return chrome.storage.local.set({ [key]: value });
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };
})();
