# Bookmark Grid New Tab

A Chrome extension (Manifest V3) that replaces the new tab page with a grid of your bookmarks.

## Layout
The new tab has two vertical pages:

1. **Home**: only the clock and a search box. Typing shows matching bookmarks right below it
   (`Enter` opens the first one, `Esc` clears).
2. **Bookmarks**: the full grid with folders. Scroll down, click "Bookmarks ⌄", or press `↓` / `PageDown` /
   `Space` to get there; scroll up from the top, press `↑` / `PageUp`, or `/` to return. Reopening a folder lands here.

The transition is a custom spring (`pages.js`, Apple-style response 0.55 s / damping 0.825) rather than browser
scrolling. A trackpad swipe moves the page with your fingers and hands its speed to the spring when you let go;
a mouse-wheel notch flips the page. As you go down, the clock drifts up, shrinks, blurs and fades, the wallpaper
zooms and dims slightly, and the tiles rise in a staggered diagonal wave. With *reduce motion* turned on in the
OS, pages switch instantly.

Everything else sits in a small **dock** of status chips at the top right, visible on both pages.
Each chip shows live information at a glance:

| Chip | Shows | Key |
|------|-------|-----|
| Weather | condition + temperature | `W` |
| Pomodoro | countdown while a session runs (colored by session type) | `P` |
| Calendar | next event still ahead today, or today's all-day events | `C` |
| To-do | number of open tasks | `T` |
| Notes | first line, on hover | `N` |
| Background | — | `B` |

Click a chip or press its key to open that widget in a **drawer**. Its input is focused, so for example
`T` → type → `Enter` adds a task without touching the mouse. Icons along the top of the drawer switch widgets.
`Esc` leaves a text field, a second `Esc` (or a click outside) closes the drawer.
**Pin** the drawer to have it open on every new tab; on wide screens a pinned drawer sits beside the bookmarks
instead of over them.

## Features
- Bookmarks bar contents shown as icon tiles; "Other bookmarks" / "Mobile bookmarks" appear as folders
- Click a folder to open it; breadcrumb trail to go back (browser Back and `Backspace` also work)
- Site favicons via Chrome's `_favicon` API, with a colored letter fallback
- Search across all bookmarks from the home page (`/` to focus from anywhere, `Enter` opens the first result, `Esc` clears)
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
- **Custom background**: open the Background chip to upload an image or video (up to 500 MB, kept in
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
