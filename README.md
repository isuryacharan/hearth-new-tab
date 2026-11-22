# Bookmark Grid New Tab

A Chrome extension (Manifest V3) that replaces the new tab page with a grid of your bookmarks.

## Layout
The new tab has two vertical pages:

1. **Home**: only the clock, the command palette (see below) and a quote of the day from
   [DummyJSON](https://dummyjson.com/quotes/random). The quote is fetched once per day and cached with the date
   (`quote.js`), so every new tab that day shows it without a network request. Turn it off with the × that
   appears on hover, or toggle it with the `quote` command; while it's off, nothing is fetched.
2. **Bookmarks**: the full grid with folders. Scroll down, click "Bookmarks ⌄", or press `↓` / `PageDown` /
   `Space` to get there; scroll up from the top, press `↑` / `PageUp`, or `/` to return. Reopening a folder lands here.

The transition is a custom spring (`pages.js`, Apple-style response 0.55 s / damping 0.825) rather than browser
scrolling. A trackpad swipe moves the page with your fingers and hands its speed to the spring when you let go;
a mouse-wheel notch flips the page. As you go down, the clock drifts up, shrinks, blurs and fades, the wallpaper
zooms and dims slightly, and the tiles rise in a staggered diagonal wave. With *reduce motion* turned on in the
OS, pages switch instantly.

## Command palette
The box on the home page does more than search bookmarks. It has the cursor when a new tab opens, so you can
start typing right away; `/` or `Ctrl+K` brings you back to it from anywhere.

Chrome normally keeps the cursor in the address bar on new tabs, so the page reloads itself once with `?focus`
(see `focus.js`) to take it. The trade-off: the address bar shows the extension's address instead of being empty.

| Type | Does |
|------|------|
| `todo buy milk` (or `t …`) | adds a to-do |
| `note call the bank` (or `n …`) | appends a line to your notes |
| `event fri 2pm dentist` | adds a calendar event — `today`/`tomorrow`/weekday and `14:30`/`2pm` are optional |
| `focus`, `break`, `long break`, `pause`, `reset`, `skip` | controls the pomodoro timer |
| `weather`, `city`, `units`, `calendar`, `todos`, `notes`, `background` | opens that widget (or changes the city / °C–°F) |
| `bookmarks` | goes to the bookmarks page |
| `quote` | shows / hides the daily quote |
| `12*4.5`, `=2^10` | calculates; `Enter` copies the result |
| `github.com`, `localhost:3000` | opens the address |
| `yt lofi beats`, `g …`, `ddg …` | searches a specific engine (keywords below) |
| `gpt explain closures`, `claude …` | opens ChatGPT / Claude with your text as the prompt |
| anything | matching bookmarks and folders, then search the web (default engine), Ask ChatGPT, Ask Claude |
| `?` | lists every command |

**Search engines & AI** — type the keyword, a space, then your text (the keyword alone + `Tab` fills it in):

| Engine | Keyword | | Engine | Keyword |
|---|---|---|---|---|
| Google | `g` | | GitHub | `gh` |
| DuckDuckGo | `ddg`, `d` | | Reddit | `r` |
| Bing | `b` | | Stack Overflow | `so` |
| Brave Search | `br` | | MDN | `mdn` |
| YouTube | `yt` | | npm | `npm` |
| Wikipedia | `w`, `wiki` | | Google Maps | `maps` |
| **ChatGPT** | `gpt`, `chat` | | **Claude** | `claude`, `cl` |

ChatGPT and Claude receive the prompt through the link (`chatgpt.com/?q=…`, `claude.ai/new?q=…`); whether it is
sent automatically or just filled in is decided by each site. Engines are listed in `ENGINES` in `palette.js`.

`↑`/`↓` choose · `Enter` run · `Ctrl+Enter` open in a new tab · `Tab` complete a command · `Esc` clears, then leaves.
`↓` in the empty box goes to the bookmarks page.

## Dock
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
- Search across all bookmarks and folders from the command palette
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
