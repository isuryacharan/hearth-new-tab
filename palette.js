'use strict';

/*
 * Command palette on the home page's search box.
 *
 * One input, mixed results:
 *   - commands that take text, run straight away:  todo buy milk · note … · event 14:30 dentist
 *   - commands:      focus, break, pause, weather, city, units, calendar, notes, background, bookmarks…
 *   - quick maths:   12*4.5   or   =2^10
 *   - addresses:     github.com   localhost:3000
 *   - bookmarks and bookmark folders
 *   - search the web (always last)
 *
 * Keys: ↑/↓ choose · Enter run · Ctrl/⌘+Enter open in a new tab · Tab complete a command ·
 * Esc clear, then leave · "?" lists every command · Ctrl/⌘+K or "/" focuses it from anywhere.
 */
(() => {
  const input = document.getElementById('search');
  const list = document.getElementById('palette-list');
  const footer = document.getElementById('palette-footer');
  const toast = document.getElementById('palette-toast');
  const home = document.getElementById('page-home');

  const MAX_COMMANDS = 5;
  const MAX_BOOKMARKS = 8;

  let items = [];
  let active = 0;

  /* ---------- icons ---------- */

  const dockIcon = panel => document.querySelector(`.dock-chip[data-panel="${panel}"] .dock-icon svg`)?.outerHTML || '';
  const SVG = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8 8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.3-3.6C8.8 5.5 8.3 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8 8 0 0 1 0 4z"/></svg>',
    calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v4h10V4zm1 7v2h2v-2zm4 0v2h2v-2zm4 0v6h2v-6h-2zm-8 4v2h2v-2zm4 0v2h2v-2z" transform="translate(-1 0)"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    later: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2zm2.1-7.8-.9.9c-.7.7-1.2 1.3-1.2 2.9h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3a2 2 0 1 0-3.4-1.4H8a4 4 0 1 1 7.1 2.2z"/></svg>',
  };

  /* ---------- matching ---------- */

  /* How well `q` matches `text` (0 = not at all). Prefix > word start > anywhere > initials. */
  function score(text, q) {
    text = (text || '').toLowerCase();
    if (!text || !q) return 0;
    if (text === q) return 100;
    if (text.startsWith(q)) return 90 - Math.min(20, text.length - q.length) * 0.5;
    const i = text.indexOf(q);
    if (i > 0 && /[\s\-_./:]/.test(text[i - 1])) return 72;
    if (i > 0) return 55;
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every(w => text.includes(w))) return 48;
    if (q.length >= 3) { // letters in order, e.g. "gthb" → GitHub (short queries would match everything)
      let k = 0;
      for (const ch of text) if (ch === q[k]) k++;
      if (k === q.length) return 22;
    }
    return 0;
  }

  /* ---------- quick maths (small parser; extension pages can't use eval) ---------- */

  function calculate(src) {
    const s = src.replace(/^=/, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '');
    if (!s || !/\d/.test(s)) return null;
    let i = 0;
    const peek = () => s[i];
    const number = () => {
      const m = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i);
      if (!m) throw 0;
      i += m[0].length;
      return parseFloat(m[0]);
    };
    const primary = () => {
      if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw 0; return v; }
      return number();
    };
    const unary = () => (peek() === '-' ? (i++, -unary()) : peek() === '+' ? (i++, unary()) : primary());
    const power = () => { const b = unary(); if (peek() === '^') { i++; return b ** power(); } return b; };
    const term = () => {
      let v = power();
      while ('*/%'.includes(peek()) && peek()) {
        const op = s[i++]; const r = power();
        v = op === '*' ? v * r : op === '/' ? v / r : v % r;
      }
      return v;
    };
    const expr = () => {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    };
    try {
      const v = expr();
      return i === s.length && Number.isFinite(v) ? v : null;
    } catch { return null; }
  }

  const formatNumber = n => (Number.isInteger(n) ? n.toLocaleString() : (+n.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 10 }));

  /* ---------- addresses ---------- */

  function asUrl(q) {
    if (/\s/.test(q)) return null;
    if (/^(https?|chrome|file|edge):\/\//i.test(q)) return q;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i.test(q)) return `http://${q}`;
    if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q)) return `https://${q}`;
    return null;
  }

  /* ---------- "event" text: [today|tomorrow|mon…sun] [14:30 | 2pm | 2:30pm] title ---------- */

  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function parseEvent(text) {
    const today = new Date();
    let date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let time = '';
    let rest = text.trim();
    for (let pass = 0; pass < 2; pass++) {
      const d = rest.match(/^(today|tomorrow|tmrw?|mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+/i);
      if (d) {
        const w = d[1].toLowerCase();
        if (w.startsWith('tom') || w.startsWith('tmr')) date.setDate(date.getDate() + 1);
        else if (w !== 'today') date.setDate(date.getDate() + ((DAYS.indexOf(w) - date.getDay() + 7) % 7));
        rest = rest.slice(d[0].length);
      }
      const t = rest.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+/i);
      if (t && (t[2] || t[3])) {
        let h = +t[1];
        const m = +(t[2] || 0);
        if (t[3]) h = (h % 12) + (t[3].toLowerCase() === 'pm' ? 12 : 0);
        if (h < 24 && m < 60) {
          time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          rest = rest.slice(t[0].length);
        }
      }
    }
    return { date, time, title: rest.trim() };
  }

  const dayLabel = date => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((date - t) / 86400000);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  /* ---------- commands ---------- */

  const openWidget = id => () => { Dock.open(id); };
  const quote = s => `“${s.length > 40 ? s.slice(0, 40) + '…' : s}”`;

  const COMMANDS = [
    // commands that take text
    {
      keywords: ['todo', 'task', 't'], title: 'Add to-do', icon: () => dockIcon('todo'), arg: 'buy milk',
      preview: arg => ({ title: `Add to-do: ${arg}`, subtitle: 'To-do list' }),
      run: arg => { Todos.add(arg); return `Added ${quote(arg)} to your to-do list`; },
    },
    {
      keywords: ['note', 'n'], title: 'Add to notes', icon: () => dockIcon('notes'), arg: 'call the bank',
      preview: arg => ({ title: `Add to notes: ${arg}`, subtitle: 'Appended as a new line' }),
      run: async arg => { await Notes.append(arg); return `Added ${quote(arg)} to your notes`; },
    },
    {
      keywords: ['event', 'ev', 'remind'], title: 'Add calendar event', icon: () => dockIcon('calendar'), arg: 'tomorrow 9am standup',
      preview: arg => {
        const e = parseEvent(arg);
        return e.title
          ? { title: `Add event: ${e.title}`, subtitle: `${dayLabel(e.date)} · ${e.time ? Calendar.formatTime(e.time) : 'All day'}` }
          : { title: 'Add event…', subtitle: 'Type a title, e.g. "event fri 2pm dentist"' };
      },
      run: arg => {
        const e = parseEvent(arg);
        if (!e.title) return null;
        Calendar.add(e.date, e.time, e.title);
        return `Added ${quote(e.title)} — ${dayLabel(e.date)}${e.time ? ', ' + Calendar.formatTime(e.time) : ''}`;
      },
    },
    // timer
    { keywords: ['focus', 'pomodoro', 'work'], title: 'Start focus session', icon: () => dockIcon('pomo'),
      run: async () => { await Pomodoro.start('focus'); return `Focus started — ${Pomodoro.status().left}`; } },
    { keywords: ['break', 'short break', 'rest'], title: 'Start short break', icon: () => dockIcon('pomo'),
      run: async () => { await Pomodoro.start('short'); return `Short break — ${Pomodoro.status().left}`; } },
    { keywords: ['long break'], title: 'Start long break', icon: () => dockIcon('pomo'),
      run: async () => { await Pomodoro.start('long'); return `Long break — ${Pomodoro.status().left}`; } },
    { keywords: ['pause', 'resume', 'timer'], title: 'Pause / resume timer', icon: () => dockIcon('pomo'),
      run: async () => ((await Pomodoro.toggle()) ? `${Pomodoro.status().label} running — ${Pomodoro.status().left}` : `Timer paused at ${Pomodoro.status().left}`) },
    { keywords: ['reset timer', 'reset'], title: 'Reset timer', icon: () => dockIcon('pomo'),
      run: async () => { await Pomodoro.reset(); return 'Timer reset'; } },
    { keywords: ['skip', 'next session'], title: 'Skip to next session', icon: () => dockIcon('pomo'),
      run: async () => { await Pomodoro.skip(); return `Next up: ${Pomodoro.status().label}`; } },
    // widgets
    { keywords: ['weather', 'forecast'], title: 'Open weather', icon: () => dockIcon('weather'), run: openWidget('weather') },
    { keywords: ['city', 'location', 'change city'], title: 'Change weather city', icon: () => dockIcon('weather'),
      run: () => {
        Dock.open('weather', { focus: false });
        if (document.getElementById('weather-form').hidden) document.getElementById('weather-settings').click();
        setTimeout(() => document.getElementById('weather-city').focus({ preventScroll: true }), 80);
      } },
    { keywords: ['units', 'celsius', 'fahrenheit'], title: 'Switch °C / °F', icon: () => dockIcon('weather'),
      run: () => { document.getElementById('weather-unit').click(); return `Units: ${document.getElementById('weather-unit').textContent}`; } },
    { keywords: ['calendar', 'agenda'], title: 'Open calendar', icon: () => dockIcon('calendar'), run: openWidget('calendar') },
    { keywords: ['todos', 'tasks', 'to-do list'], title: 'Open to-do list', icon: () => dockIcon('todo'), run: openWidget('todo') },
    { keywords: ['notes'], title: 'Open notes', icon: () => dockIcon('notes'), run: openWidget('notes') },
    { keywords: ['background', 'wallpaper', 'bg'], title: 'Change background', icon: () => dockIcon('background'), run: openWidget('background') },
    { keywords: ['later', 'read later', 'reading list', 'saved'], title: 'Show read later list', icon: () => SVG.later, run: () => { ReadLater.show(); } },
    {
      keywords: ['quote', 'daily quote', 'quotes'], icon: () => SVG.quote,
      get title() { return window.Quote?.enabled() === false ? 'Show daily quote' : 'Hide daily quote'; },
      run: async () => {
        const on = !Quote.enabled();
        await Quote.setEnabled(on);
        return on ? 'Daily quote on' : 'Daily quote off';
      },
    },
    { keywords: ['bookmarks', 'grid', 'all bookmarks'], title: 'Show all bookmarks', icon: () => SVG.grid,
      run: () => { input.blur(); Pages.go('bookmarks'); } },
    { keywords: ['help', 'commands', '?'], title: 'Show all commands', icon: () => SVG.help, run: () => { setQuery('?'); return undefined; }, keepOpen: true },
  ];

  /* ---------- search engines & AI chats ---------- */

  // Type a keyword, a space, then your text: "yt lofi beats", "gpt explain closures".
  const ENGINES = [
    { name: 'Google', keywords: ['g', 'google'], url: 'https://www.google.com/search?q=%s' },
    { name: 'DuckDuckGo', keywords: ['ddg', 'duck', 'd'], url: 'https://duckduckgo.com/?q=%s' },
    { name: 'Bing', keywords: ['b', 'bing'], url: 'https://www.bing.com/search?q=%s' },
    { name: 'Brave Search', keywords: ['br', 'brave'], url: 'https://search.brave.com/search?q=%s' },
    { name: 'YouTube', keywords: ['yt', 'youtube'], url: 'https://www.youtube.com/results?search_query=%s' },
    { name: 'Wikipedia', keywords: ['w', 'wiki', 'wikipedia'], url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s' },
    { name: 'GitHub', keywords: ['gh', 'github'], url: 'https://github.com/search?q=%s' },
    { name: 'Reddit', keywords: ['r', 'reddit'], url: 'https://www.reddit.com/search/?q=%s' },
    { name: 'Stack Overflow', keywords: ['so', 'stackoverflow'], url: 'https://stackoverflow.com/search?q=%s' },
    { name: 'MDN', keywords: ['mdn'], url: 'https://developer.mozilla.org/search?q=%s' },
    { name: 'npm', keywords: ['npm'], url: 'https://www.npmjs.com/search?q=%s' },
    { name: 'Google Maps', keywords: ['maps', 'map'], url: 'https://www.google.com/maps/search/%s' },
    // AI chats: the prompt goes in the link; whether it's sent automatically is up to each site.
    { name: 'ChatGPT', keywords: ['gpt', 'chatgpt', 'chat'], url: 'https://chatgpt.com/?q=%s', ai: true },
    { name: 'Claude', keywords: ['claude', 'cl'], url: 'https://claude.ai/new?q=%s', ai: true },
  ];
  const AI_ENGINES = ENGINES.filter(e => e.ai);
  const engineHome = e => new URL(e.url.replace('%s', '')).origin;

  function engineIcon(e) {
    // the site's own favicon via Chrome's favicon cache (letter fallback outside the extension)
    return window.BookmarkIndex ? BookmarkIndex.icon({ url: engineHome(e), title: e.name }) : null;
  }

  function engineItem(e, text, section = '') {
    return {
      section, iconNode: engineIcon(e), icon: SVG.search,
      title: e.ai ? `Ask ${e.name}: ${text}` : `Search ${e.name} for “${text}”`,
      subtitle: `${e.keywords[0]} · ${new URL(engineHome(e)).hostname.replace(/^www\./, '')}`,
      action: e.ai ? 'Ask' : 'Search',
      url: e.url.replace('%s', encodeURIComponent(text)),
    };
  }

  // Only a keyword typed: Tab / Enter fill it in so you can type the query.
  function engineCompleteItem(e, section = '') {
    return {
      section, iconNode: engineIcon(e), icon: SVG.search,
      title: e.ai ? `Ask ${e.name}…` : `Search ${e.name}…`, subtitle: `${e.keywords[0]} <your text>`,
      action: 'Complete', complete: `${e.keywords[0]} `, keepOpen: true,
      run: () => { setQuery(`${e.keywords[0]} `); },
    };
  }

  /* ---------- building results ---------- */

  /* Both return a promise that rejects if Chrome refuses the navigation. */
  async function open(url, newTab) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.update) {
      return newTab ? chrome.tabs.create({ url }) : chrome.tabs.update({ url });
    }
    if (newTab) window.open(url, '_blank', 'noopener');
    else location.href = url;
  }

  async function webSearch(text, newTab) {
    if (typeof chrome !== 'undefined' && chrome.search?.query) {
      return chrome.search.query({ text, disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB' }); // the user's default engine
    }
    return open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, newTab);
  }

  function commandItem(cmd, { arg = '', section = 'Commands' } = {}) {
    if (cmd.preview && arg) {
      const p = cmd.preview(arg);
      return { section: '', icon: cmd.icon(), ...p, action: 'Add', run: () => cmd.run(arg) };
    }
    if (cmd.preview) {
      // needs text: Enter / Tab fill in the keyword so you can keep typing
      return {
        section, icon: cmd.icon(), title: `${cmd.title}…`, subtitle: `${cmd.keywords[0]} ${cmd.arg}`,
        action: 'Complete', complete: `${cmd.keywords[0]} `, run: () => { setQuery(`${cmd.keywords[0]} `); },
        keepOpen: true,
      };
    }
    return { section, icon: cmd.icon(), title: cmd.title, subtitle: cmd.keywords[0], action: 'Run', run: cmd.run, keepOpen: cmd.keepOpen };
  }

  function build(raw) {
    const q = raw.trim().toLowerCase();
    if (!q) return [];
    if (q === '?') {
      return [
        ...COMMANDS.filter(c => c.keywords[0] !== 'help').map(c => commandItem(c)),
        ...ENGINES.map(e => engineCompleteItem(e, 'Search engines & AI')),
      ];
    }

    const out = [];
    const first = q.split(/\s+/)[0];
    const afterFirst = raw.trim().slice(first.length).trim();

    // 0. a search engine / AI chat keyword: "yt lofi", "gpt explain closures"
    const engine = ENGINES.find(e => e.keywords.includes(first));
    if (engine && afterFirst) out.push(engineItem(engine, afterFirst));
    else if (engine && !afterFirst) out.push(engineCompleteItem(engine));
    const rest = raw.trim().slice(first.length).trim();

    // 1. a command with its text, e.g. "todo buy milk"
    const withArg = rest && COMMANDS.find(c => c.preview && c.keywords.includes(first));
    if (withArg) out.push(commandItem(withArg, { arg: rest }));

    // 2. maths
    const value = /[-+*/×÷%^()]/.test(q) || q.startsWith('=') ? calculate(q) : null;
    if (value !== null) {
      const text = formatNumber(value);
      out.push({ section: '', icon: SVG.calc, title: `= ${text}`, subtitle: raw.trim().replace(/^=/, ''), action: 'Copy',
        run: async () => { await navigator.clipboard?.writeText(String(+value.toPrecision(15))).catch(() => {}); return `Copied ${text}`; } });
    }

    // 3. an address
    const url = asUrl(raw.trim());
    if (url) out.push({ section: '', icon: SVG.globe, title: `Open ${raw.trim()}`, subtitle: url, action: 'Open', url });

    // 4. commands by name / keyword (no loose letters-in-order matches for commands)
    const commands = withArg ? [] : COMMANDS
      .map(c => ({ c, s: Math.max(score(c.title, q), ...c.keywords.map(k => score(k, q) + (k === q ? 5 : 0))) }))
      .filter(x => x.s >= 40)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_COMMANDS);

    // 5. bookmarks and folders
    const index = window.BookmarkIndex;
    const marks = [];
    if (index) {
      for (const { node, path } of index.links()) {
        let host = '';
        try { host = new URL(node.url).hostname.replace(/^www\./, ''); } catch { /* not a web URL */ }
        const s = Math.max(score(node.title, q), score(host, q) * 0.85);
        if (s > 0) marks.push({ s, item: {
          section: 'Bookmarks', iconNode: index.icon(node), title: node.title || host || node.url,
          subtitle: [path.join(' / '), host].filter(Boolean).join(' · '), action: 'Open', url: node.url } });
      }
      for (const { node, path } of index.folders()) {
        const s = score(node.title, q) * 0.95;
        if (s > 0) marks.push({ s, item: {
          section: 'Bookmarks', icon: SVG.folder, folder: true, title: node.title || 'Untitled',
          subtitle: `Folder · ${(node.children || []).length} items${path.length ? ' · ' + path.join(' / ') : ''}`,
          action: 'Open folder', run: () => { input.blur(); index.openFolder(node.id); } } });
      }
      marks.sort((a, b) => b.s - a.s).splice(MAX_BOOKMARKS);
    }

    // whichever section matches better comes first
    const commandItems = commands.map(({ c }) => commandItem(c));
    const markItems = marks.map(m => m.item);
    const bookmarksFirst = (marks[0]?.s || 0) > (commands[0]?.s || 0);
    out.push(...(bookmarksFirst ? [...markItems, ...commandItems] : [...commandItems, ...markItems]));

    // saved for later
    if (window.ReadLater) {
      ReadLater.items()
        .map(item => {
          let host = '';
          try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
          return { item, host, s: Math.max(score(item.title, q), score(host, q) * 0.85) };
        })
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 5)
        .forEach(({ item, host }) => out.push({
          section: 'Read later', iconNode: window.BookmarkIndex?.icon({ url: item.url, title: item.title }),
          title: item.title, subtitle: host, action: 'Open', url: item.url,
        }));
    }

    // 6. search the web with the default engine, or ask an AI chat — always offered, even when a
    //    command or keyword matched ("event horizon", "g string")
    out.push({ section: 'Web', icon: SVG.search, title: `Search the web for “${raw.trim()}”`, subtitle: 'Default search engine', action: 'Search',
      search: raw.trim() });
    if (!engine) for (const e of AI_ENGINES) out.push(engineItem(e, raw.trim(), 'Web'));
    return out;
  }

  /* ---------- rendering ---------- */

  function render() {
    items = build(input.value);
    active = Math.min(active, Math.max(0, items.length - 1));
    const rows = [];
    let section = null;
    items.forEach((item, n) => {
      if (item.section && item.section !== section) {
        const h = document.createElement('div');
        h.className = 'pal-section';
        h.setAttribute('role', 'presentation');
        h.textContent = item.section;
        rows.push(h);
      }
      section = item.section;

      const row = document.createElement('div');
      row.className = 'pal-row';
      row.id = `pal-opt-${n}`;
      row.setAttribute('role', 'option');
      row.dataset.n = n;

      const icon = document.createElement('span');
      icon.className = 'pal-icon' + (item.folder ? ' folder' : '');
      if (item.iconNode) icon.append(item.iconNode); else icon.innerHTML = item.icon || '';

      const text = document.createElement('span');
      text.className = 'pal-text';
      const title = document.createElement('span');
      title.className = 'pal-title';
      title.textContent = item.title;
      const sub = document.createElement('span');
      sub.className = 'pal-sub';
      sub.textContent = item.subtitle || '';
      text.append(title, sub);

      const hint = document.createElement('span');
      hint.className = 'pal-hint';
      hint.textContent = item.complete ? `Tab ${item.action}` : `↵ ${item.action}`;

      row.append(icon, text, hint);
      rows.push(row);
    });
    list.replaceChildren(...rows);

    const shown = items.length > 0;
    list.hidden = !shown;
    footer.hidden = !shown;
    input.setAttribute('aria-expanded', String(shown));
    home.classList.toggle('searching', !!input.value.trim());
    highlight();
  }

  function highlight() {
    for (const row of list.querySelectorAll('.pal-row')) {
      const on = +row.dataset.n === active;
      row.classList.toggle('active', on);
      row.setAttribute('aria-selected', String(on));
      if (on) row.scrollIntoView({ block: 'nearest' });
    }
    if (items.length) input.setAttribute('aria-activedescendant', `pal-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function setQuery(text) {
    input.value = text;
    active = 0;
    render();
    input.focus({ preventScroll: true });
    input.setSelectionRange(text.length, text.length);
  }

  let toastTimer = null;
  function say(message) {
    if (!message) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  /* ---------- "opening…" state: instant feedback while the next site loads ---------- */

  const palette = input.closest('.palette');
  let navigating = false;
  let navTimer = null;

  function startNavigating() {
    navigating = true;
    palette.classList.add('navigating');
    input.readOnly = true;
    input.setAttribute('aria-busy', 'true');
    const row = list.querySelector('.pal-row.active');
    if (row) {
      row.classList.add('loading');
      row.querySelector('.pal-hint').textContent = 'Opening…';
    }
    clearTimeout(navTimer);
    navTimer = setTimeout(stopNavigating, 15000); // the site never committed: let the user retry
  }

  function stopNavigating() {
    if (!navigating) return;
    navigating = false;
    clearTimeout(navTimer);
    palette.classList.remove('navigating');
    input.readOnly = false;
    input.removeAttribute('aria-busy');
    render();
  }

  // Coming back with the Back button can restore this page from cache mid-"opening".
  window.addEventListener('pageshow', e => { if (e.persisted) stopNavigating(); });

  const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, '') || url; } catch { return url; } };

  async function navigate(item, newTab) {
    const go = () => (item.url ? open(item.url, newTab) : webSearch(item.search, newTab));
    if (newTab) {
      await go().catch(() => {});
      say(`Opened ${item.url ? hostOf(item.url) : 'search'} in a new tab`);
      return;
    }
    startNavigating();
    try {
      await go();
    } catch {
      stopNavigating();
      say('Couldn’t open that');
    }
  }

  async function runItem(item, { newTab = false } = {}) {
    if (!item || navigating) return; // one Enter is enough
    if (item.url || item.search) return navigate(item, newTab);
    const message = await item.run();
    if (!item.keepOpen) {
      input.value = '';
      active = 0;
      render();
    }
    say(message);
  }

  /* ---------- keyboard & mouse ---------- */

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'palette-list');
  input.setAttribute('aria-expanded', 'false');

  input.addEventListener('input', () => { active = 0; render(); });

  input.addEventListener('keydown', e => {
    if (navigating) {
      // While a site is opening: Esc gives the box back, everything else waits.
      if (e.key === 'Escape') { e.stopPropagation(); stopNavigating(); }
      if (e.key !== 'Tab') e.preventDefault();
      return;
    }
    const n = items.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!n && !input.value) { input.blur(); Pages.go('bookmarks'); return; } // empty box: next page
        if (n) { active = (active + 1) % n; highlight(); }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) { active = (active - 1 + n) % n; highlight(); }
        break;
      case 'Enter':
        e.preventDefault();
        runItem(items[active], { newTab: e.ctrlKey || e.metaKey });
        break;
      case 'Tab':
        if (items[active]?.complete) { e.preventDefault(); setQuery(items[active].complete); }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (input.value) setQuery('');
        else input.blur();
        break;
    }
  });

  list.addEventListener('mousemove', e => {
    const row = e.target.closest('.pal-row');
    if (row && +row.dataset.n !== active) { active = +row.dataset.n; highlight(); }
  });
  list.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', e => {
    const row = e.target.closest('.pal-row');
    if (row) runItem(items[+row.dataset.n], { newTab: e.ctrlKey || e.metaKey || e.button === 1 });
  });

  // Ctrl/⌘+K focuses the palette from anywhere ("/" is handled in newtab.js).
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      Pages.go('home');
      Dock.close();
      input.focus({ preventScroll: true });
      input.select();
    }
  });

  window.Palette = { focus: () => input.focus({ preventScroll: true }), setQuery, say };

  // Start with the cursor in the palette (see focus.js for how it gets past the address bar).
  // Not when the page opens straight onto the bookmarks page, or when a pinned drawer took focus.
  requestAnimationFrame(() => {
    if (Pages.current() === 'home' && !document.getElementById('drawer').contains(document.activeElement)) {
      input.focus({ preventScroll: true });
    }
  });
})();
