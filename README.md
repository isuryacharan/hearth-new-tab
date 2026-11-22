# Bookmark Grid New Tab

A Chrome extension (Manifest V3) that replaces the new tab page with a grid of your bookmarks.

## Features
- Bookmarks bar contents shown as icon tiles; "Other bookmarks" / "Mobile bookmarks" appear as folders
- Click a folder to open it; breadcrumb trail to go back (browser Back and `Backspace` also work)
- Site favicons via Chrome's `_favicon` API, with a colored letter fallback
- Search across all bookmarks (`/` to focus, `Enter` opens the first result, `Esc` clears)
- Updates live when bookmarks change; light and dark themes follow the system
- **To-do list**: add with `Enter`, tick to complete, double-click to edit, `×` to delete, "Clear completed"
- **Notes**: a single notepad that autosaves as you type
- To-dos and notes are stored locally in `chrome.storage.local` and stay in sync across open tabs
- **Weather**: current conditions and a 5-day forecast from [Open-Meteo](https://open-meteo.com) (free, no API key).
  Pick your city from the search box (no location permission is requested); click the pin icon to change it later, and `°C`/`°F` to switch units.
  Results are cached for 30 minutes.
- **Pomodoro**: 25 / 5 / 15-minute focus and break timer with a long break after every 4 focus sessions.
  Keeps running when you close the tab; a background service worker (`sw.js`) shows a desktop notification
  when a session ends. Gear icon: change lengths, auto-start the next session, reset the session count.
  The tab title shows the countdown while it runs.
- **Calendar**: month view with today highlighted; click a day (or use arrow keys / PageUp / PageDown) to see and
  add events with an optional time. Days with events get a dot. Click the month name to jump back to today.
  Events are stored locally.
- **Custom background**: click the picture icon (top right) to upload an image or video (up to 500 MB, kept in
  the extension's IndexedDB) or paste an image/video URL. Videos play muted on a loop and pause in background tabs.
  A dim slider keeps text readable; "Reset to default" removes it.

## Credits
The clock uses [Space Grotesk](https://github.com/floriankarsten/space-grotesk) Bold, bundled in `fonts/`
under the SIL Open Font License (`fonts/OFL.txt`).

## Install
1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select this folder
4. Open a new tab

Opening `newtab.html` outside the extension shows sample bookmarks for previewing.
