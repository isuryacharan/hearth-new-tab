'use strict';

/* Month calendar with simple per-day events, stored locally. */
(() => {
  const store = window.appStore;

  const els = {
    prev: document.getElementById('cal-prev'),
    next: document.getElementById('cal-next'),
    month: document.getElementById('cal-month'),
    weekdays: document.getElementById('cal-weekdays'),
    grid: document.getElementById('cal-grid'),
    dayTitle: document.getElementById('cal-day-title'),
    events: document.getElementById('cal-events'),
    form: document.getElementById('cal-form'),
    time: document.getElementById('cal-time'),
    text: document.getElementById('cal-text'),
  };

  // events: { 'YYYY-MM-DD': [{ id, time: 'HH:MM' | '', title }] }
  let events = {};
  let today = startOfDay(new Date());
  let selected = today;
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();

  const firstDayOfWeek = (() => {
    try {
      const loc = new Intl.Locale(navigator.language || 'en-US');
      const info = loc.getWeekInfo ? loc.getWeekInfo() : loc.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7; // Intl: 1 = Mon … 7 = Sun
    } catch { /* ignore */ }
    return /-US$/i.test(navigator.language || '') ? 0 : 1;
  })();

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function keyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const sameDay = (a, b) => a.getTime() === b.getTime();

  function formatTime(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- rendering ---------- */

  function renderWeekdays() {
    const names = [];
    for (let i = 0; i < 7; i++) {
      // 2023-01-01 was a Sunday
      const d = new Date(2023, 0, 1 + ((firstDayOfWeek + i) % 7));
      names.push(d.toLocaleDateString([], { weekday: 'narrow' }));
    }
    els.weekdays.replaceChildren(...names.map(n => {
      const s = document.createElement('span');
      s.textContent = n;
      return s;
    }));
  }

  function render() {
    const first = new Date(viewYear, viewMonth, 1);
    els.month.textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const offset = (first.getDay() - firstDayOfWeek + 7) % 7;
    const start = new Date(viewYear, viewMonth, 1 - offset);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      // drop a trailing week that is entirely next month
      if (i === 35 && d.getMonth() !== viewMonth) break;
      cells.push(dayCell(d));
    }
    els.grid.replaceChildren(...cells);
    renderDay();
    reportToday();
  }

  /* Dock chip: the next event still ahead today, or how many all-day events there are. */
  function reportToday() {
    const list = [...(events[keyOf(today)] || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const next = list.find(e => e.time && e.time >= hhmm);
    const allDay = list.filter(e => !e.time);
    const summary = list.map(e => `${e.time ? formatTime(e.time) : 'All day'} ${e.title}`).join(' · ');
    if (next) {
      window.Dock?.setStatus('calendar', { text: `${formatTime(next.time)} ${next.title}`, title: `Today: ${summary}` });
    } else if (allDay.length) {
      window.Dock?.setStatus('calendar', { text: allDay.length === 1 ? allDay[0].title : `${allDay.length} today`, title: `Today: ${summary}` });
    } else {
      window.Dock?.setStatus('calendar', { title: list.length ? `Today: ${summary}` : 'Nothing today' });
    }
  }

  function dayCell(d) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-cell';
    btn.textContent = d.getDate();
    btn.dataset.key = keyOf(d);
    const count = (events[keyOf(d)] || []).length;
    if (d.getMonth() !== viewMonth) btn.classList.add('other');
    if (sameDay(d, today)) btn.classList.add('today');
    if (sameDay(d, selected)) {
      btn.classList.add('selected');
      btn.setAttribute('aria-selected', 'true');
    }
    btn.tabIndex = sameDay(d, selected) ? 0 : -1;
    if (count) btn.classList.add('has-events');
    btn.setAttribute('aria-label',
      d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) +
      (count ? `, ${count} event${count === 1 ? '' : 's'}` : ''));
    btn.addEventListener('click', () => select(d));
    return btn;
  }

  function renderDay() {
    const label = sameDay(selected, today)
      ? 'Today'
      : selected.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    els.dayTitle.textContent = label;

    const list = [...(events[keyOf(selected)] || [])]
      .sort((a, b) => (a.time || '').localeCompare(b.time || '')); // all-day first, then by time

    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'none';
      li.textContent = 'No events';
      els.events.replaceChildren(li);
      return;
    }
    els.events.replaceChildren(...list.map(ev => {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = ev.time ? formatTime(ev.time) : 'All day';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = ev.title;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'todo-del';
      del.textContent = '×';
      del.setAttribute('aria-label', `Delete "${ev.title}"`);
      del.addEventListener('click', () => removeEvent(ev.id));
      li.append(time, title, del);
      return li;
    }));
  }

  /* ---------- actions ---------- */

  function select(d, { focus = false } = {}) {
    selected = startOfDay(d);
    if (selected.getMonth() !== viewMonth || selected.getFullYear() !== viewYear) {
      viewYear = selected.getFullYear();
      viewMonth = selected.getMonth();
    }
    render();
    if (focus) {
      const cell = els.grid.querySelector(`[data-key="${keyOf(selected)}"]`);
      if (cell) cell.focus();
    }
  }

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    render();
  }

  const save = () => store.set('calendarEvents', events);

  function removeEvent(id) {
    const key = keyOf(selected);
    events[key] = (events[key] || []).filter(e => e.id !== id);
    if (!events[key].length) delete events[key];
    save();
    render();
  }

  els.form.addEventListener('submit', e => {
    e.preventDefault();
    const title = els.text.value.trim();
    if (!title) return;
    const key = keyOf(selected);
    (events[key] = events[key] || []).push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time: els.time.value || '',
      title,
    });
    els.text.value = '';
    els.time.value = '';
    save();
    render();
    els.text.focus();
  });
  // Enter in the time field submits too
  els.time.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); els.form.requestSubmit(); }
  });

  els.prev.addEventListener('click', () => shiftMonth(-1));
  els.next.addEventListener('click', () => shiftMonth(1));
  els.month.addEventListener('click', () => select(today));

  // Arrow keys move the selected day inside the grid.
  els.grid.addEventListener('keydown', e => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in moves) {
      e.preventDefault();
      select(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + moves[e.key]), { focus: true });
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      select(new Date(selected.getFullYear(), selected.getMonth() + (e.key === 'PageUp' ? -1 : 1), selected.getDate()), { focus: true });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      els.text.focus();
    }
  });

  // Roll "today" over at midnight.
  setInterval(() => {
    const now = startOfDay(new Date());
    if (sameDay(now, today)) return reportToday(); // keep "next event" current
    const wasOnToday = sameDay(selected, today);
    today = now;
    if (wasOnToday) select(today); else render();
  }, 60 * 1000);

  // Keep other open tabs in sync.
  if (store.useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.calendarEvents) {
        events = changes.calendarEvents.newValue || {};
        render();
      }
    });
  }

  renderWeekdays();
  render();
  (async () => {
    events = await store.get('calendarEvents', {});
    render();
  })();
})();
