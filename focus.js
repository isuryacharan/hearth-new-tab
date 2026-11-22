'use strict';

/*
 * Chrome keeps keyboard focus in the address bar on a new tab page, even when an extension
 * replaces it, so the palette can't take focus by itself. A page that *navigated itself* is
 * allowed to take focus, so the first time it opens, the page immediately reloads itself
 * once with "?focus" added (replace, so Back isn't affected). This runs in <head>, before
 * anything is drawn. Trade-off: the address bar shows the extension's URL instead of being empty.
 */
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && !/[?&]focus\b/.test(location.search)) {
  location.replace(`${location.pathname}?focus${location.hash}`);
}
