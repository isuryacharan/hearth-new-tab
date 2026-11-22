'use strict';

/* To-do list and notes, saved in chrome.storage.local (localStorage when previewed outside the extension). */
(() => {
  const store = window.appStore;
  const useChrome = store.useChrome;

  /* ---------- to-do ---------- */

  const todoEls = {
    form: document.getElementById('todo-form'),
    input: document.getElementById('todo-input'),
    list: document.getElementById('todo-list'),
    count: document.getElementById('todo-count'),
    clear: document.getElementById('todo-clear'),
    sort: document.getElementById('todo-sort'),
    live: document.getElementById('todo-live'),
  };
  // todo = { id, text, done, priority }   priority: 0 none · 1 high · 2 medium · 3 low
  let todos = [];

  const saveTodos = () => store.set('todos', todos);

  /* ---------- priority ---------- */

  const PRIORITY = { 1: 'High', 2: 'Medium', 3: 'Low' };
  const prioOf = t => (t.priority >= 1 && t.priority <= 3 ? t.priority : 0);
  const rank = t => prioOf(t) || 4; // high first, no priority last
  const NEXT_PRIORITY = { 0: 1, 1: 2, 2: 3, 3: 0 }; // what a click on the dot cycles to

  /* "pay rent !1" / "!high" / "!med" / "!low" → { text: "pay rent", priority: 1 } */
  function parsePriority(raw) {
    let priority = 0;
    const text = raw
      .replace(/(^|\s)!(1|2|3|high|hi|h|medium|med|m|low|lo|l)(?=\s|$)/gi, (_, pre, tok) => {
        const t = tok.toLowerCase();
        priority = t === '1' || t[0] === 'h' ? 1 : t === '2' || t[0] === 'm' ? 2 : 3;
        return pre;
      })
      .replace(/\s+/g, ' ')
      .trim();
    return { text, priority };
  }

  /*
   * At a glance: up to 3 open to-dos, quietly, right under the dock — always in view so they
   * aren't forgotten, but faint until you hover. Highest priority first (then your own order),
   * so urgent ones never hide behind "+N more". Tick one off with its circle; click a task (or
   * "+N more") to open the full list. Nothing is shown when there's nothing to do.
   */
  const GLANCE_MAX = 3;
  const glance = document.getElementById('todo-glance');

  function renderGlance() {
    const open = todos
      .map((t, i) => ({ t, i }))
      .filter(x => !x.t.done)
      .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
      .map(x => x.t);
    glance.hidden = open.length === 0;
    const rows = open.slice(0, GLANCE_MAX).map(todo => {
      const li = document.createElement('li');
      li.className = 'glance-item';
      const p = prioOf(todo);

      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = `glance-tick p${p}`; // the circle takes the priority colour
      tick.setAttribute('aria-label', `Mark “${todo.text}” done` + (p ? ` (${PRIORITY[p]} priority)` : ''));
      tick.title = p ? `${PRIORITY[p]} priority · mark done` : 'Mark done';
      tick.addEventListener('click', () => {
        li.classList.add('completing'); // brief strike-through + fade, then it's gone
        setTimeout(() => {
          const t = todos.find(x => x.id === todo.id);
          if (t) { t.done = true; saveTodos(); renderTodos(); }
        }, 380);
      });

      const text = document.createElement('button');
      text.type = 'button';
      text.className = 'glance-text';
      text.textContent = todo.text;
      text.title = 'Open to-do list';
      text.addEventListener('click', () => Dock.open('todo'));

      li.append(tick, text);
      return li;
    });
    if (open.length > GLANCE_MAX) {
      const li = document.createElement('li');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'glance-more';
      more.textContent = `+${open.length - GLANCE_MAX} more`;
      more.addEventListener('click', () => Dock.open('todo'));
      li.append(more);
      rows.push(li);
    }
    glance.replaceChildren(...rows);
  }

  /* ---------- the full list (drawer) ---------- */

  const sortedByPriority = () =>
    todos.map((t, i) => ({ t, i }))
      .sort((a, b) => (a.t.done - b.t.done) || rank(a.t) - rank(b.t) || a.i - b.i)
      .map(x => x.t);

  function renderTodos({ focus } = {}) {
    todoEls.list.replaceChildren(...todos.map(todoItem));
    renderGlance();
    const open = todos.filter(t => !t.done).length;
    todoEls.count.textContent = todos.length ? `${open} left` : '';
    todoEls.clear.hidden = !todos.some(t => t.done);
    // offer sorting only when it would change something
    const sorted = sortedByPriority();
    todoEls.sort.hidden = !todos.some(t => prioOf(t)) || sorted.every((t, i) => t === todos[i]);
    window.Dock?.setStatus('todo', open
      ? { text: String(open), title: `${open} open task${open === 1 ? '' : 's'}` + (todos.find(t => !t.done) ? ` · next: ${todos.find(t => !t.done).text}` : '') }
      : { title: todos.length ? 'All done' : 'No tasks' });
    // keep the keyboard where it was after a re-render (moving, changing priority)
    if (focus) todoEls.list.querySelector(`[data-id="${focus.id}"] .${focus.part}`)?.focus();
  }

  function todoItem(todo) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');
    li.dataset.id = todo.id;

    // grip: drag to reorder, or focus it and press ↑ / ↓
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'todo-grip';
    grip.draggable = true;
    grip.setAttribute('aria-label', `Move “${todo.text}”: press up or down arrow`);
    grip.title = 'Drag to reorder (or focus and press ↑ / ↓)';
    grip.innerHTML = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="3" cy="3" r="1.4"/><circle cx="7" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="7" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="7" cy="13" r="1.4"/></svg>';
    grip.addEventListener('dragstart', e => {
      dragId = todo.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', todo.text);
      e.dataTransfer.setDragImage(li, 14, li.offsetHeight / 2);
      requestAnimationFrame(() => li.classList.add('dragging'));
    });
    grip.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); clearDropMarker(); });
    grip.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveBy(todo.id, e.key === 'ArrowUp' ? -1 : 1);
      }
    });

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = todo.done;
    box.setAttribute('aria-label', `Mark "${todo.text}" ${todo.done ? 'not done' : 'done'}`);
    box.addEventListener('change', () => {
      todo.done = box.checked;
      saveTodos();
      renderTodos();
    });

    // priority dot: click cycles none → High → Medium → Low → none
    const p = prioOf(todo);
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `todo-prio p${p}`;
    dot.title = p ? `${PRIORITY[p]} priority (click to change)` : 'Set priority';
    dot.setAttribute('aria-label', `Priority of “${todo.text}”: ${p ? PRIORITY[p] : 'none'}. Change`);
    dot.addEventListener('click', () => {
      todo.priority = NEXT_PRIORITY[p];
      saveTodos();
      renderTodos({ focus: { id: todo.id, part: 'todo-prio' } });
      announce(`Priority: ${todo.priority ? PRIORITY[todo.priority] : 'none'}`);
    });

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = todo.text;
    text.title = 'Double-click to edit';
    text.addEventListener('dblclick', () => startEdit(todo, text));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'todo-del';
    del.textContent = '×';
    del.setAttribute('aria-label', `Delete "${todo.text}"`);
    del.addEventListener('click', () => removeTodo(todo.id));

    li.append(grip, box, dot, text, del);
    return li;
  }

  /* ---------- reordering ---------- */

  let dragId = null;

  function announce(message) { todoEls.live.textContent = message; }

  function moveTo(id, index) {
    const from = todos.findIndex(t => t.id === id);
    if (from < 0) return;
    const [item] = todos.splice(from, 1);
    const to = Math.max(0, Math.min(todos.length, index));
    todos.splice(to, 0, item);
    saveTodos();
    renderTodos({ focus: { id, part: 'todo-grip' } });
    announce(`Moved to position ${to + 1} of ${todos.length}`);
  }

  function moveBy(id, delta) {
    const from = todos.findIndex(t => t.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= todos.length) return;
    moveTo(id, to);
  }

  /* Where a drop at clientY would land: the index to insert at, and which row shows the marker. */
  function dropSlot(y) {
    const rows = [...todoEls.list.children];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return { index: i, row: rows[i], edge: 'before' };
    }
    return { index: rows.length, row: rows[rows.length - 1], edge: 'after' };
  }

  function clearDropMarker() {
    todoEls.list.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  }

  todoEls.list.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { row, edge } = dropSlot(e.clientY);
    if (row && !row.classList.contains(`drop-${edge}`)) {
      clearDropMarker();
      row.classList.add(`drop-${edge}`);
    }
  });
  todoEls.list.addEventListener('dragleave', e => {
    if (!todoEls.list.contains(e.relatedTarget)) clearDropMarker();
  });
  todoEls.list.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    let { index } = dropSlot(e.clientY);
    const from = todos.findIndex(t => t.id === dragId);
    if (from < index) index -= 1; // taking it out first shifts everything after it up by one
    clearDropMarker();
    if (index !== from) moveTo(dragId, index);
  });

  todoEls.sort.addEventListener('click', () => {
    todos = sortedByPriority();
    saveTodos();
    renderTodos();
    announce('Sorted by priority');
  });

  /* ---------- editing, adding, removing ---------- */

  function startEdit(todo, el) {
    el.contentEditable = 'true';
    el.focus();
    document.getSelection().selectAllChildren(el);
    let cancelled = false;

    const finish = () => {
      el.removeEventListener('keydown', onKey);
      el.contentEditable = 'false';
      if (cancelled) { el.textContent = todo.text; return; }
      const { text, priority } = parsePriority(el.textContent);
      if (!text) return removeTodo(todo.id);
      todo.text = text;
      if (priority) todo.priority = priority; // typing "!1" etc. while editing changes priority too
      saveTodos();
      renderTodos();
    };
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { cancelled = true; el.blur(); }
    };
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', finish, { once: true });
  }

  function removeTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    renderTodos();
  }

  /* Adds a to-do; "!1"/"!2"/"!3" (or !high/!med/!low) in the text set its priority. Returns it. */
  function addTodo(raw) {
    const { text, priority } = parsePriority(raw);
    if (!text) return null;
    const todo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false, priority };
    todos.unshift(todo);
    saveTodos();
    renderTodos();
    return todo;
  }

  todoEls.form.addEventListener('submit', e => {
    e.preventDefault();
    const raw = todoEls.input.value.trim();
    if (!raw) return;
    todoEls.input.value = '';
    addTodo(raw);
  });

  todoEls.clear.addEventListener('click', () => {
    todos = todos.filter(t => !t.done);
    saveTodos();
    renderTodos();
  });

  /* ---------- notes ---------- */

  const notesEl = document.getElementById('notes');
  const notesStatus = document.getElementById('notes-status');
  let saveTimer = null;

  function reportNotes() {
    const first = notesEl.value.split('\n').map(s => s.trim()).find(Boolean);
    window.Dock?.setStatus('notes', { title: first ? (first.length > 60 ? first.slice(0, 60) + '…' : first) : 'Empty' });
  }

  async function appendNote(text) {
    notesEl.value = notesEl.value.replace(/\s*$/, '') ? `${notesEl.value.replace(/\s*$/, '')}\n${text}` : text;
    await store.set('notes', notesEl.value);
    reportNotes();
  }

  // Actions for the command palette.
  window.Todos = { add: addTodo, parse: parsePriority, priorityLabel: p => PRIORITY[p] || '', openCount: () => todos.filter(t => !t.done).length };
  window.Notes = { append: appendNote };

  notesEl.addEventListener('input', () => {
    notesStatus.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await store.set('notes', notesEl.value);
      notesStatus.textContent = 'Saved';
      reportNotes();
    }, 400);
  });

  /* ---------- load + keep other open tabs in sync ---------- */

  (async () => {
    todos = await store.get('todos', []);
    notesEl.value = await store.get('notes', '');
    renderTodos();
    reportNotes();
  })();

  if (useChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.todos && !todoEls.list.querySelector('[contenteditable="true"]')) {
        todos = changes.todos.newValue || [];
        renderTodos();
      }
      if (changes.notes && document.activeElement !== notesEl) {
        notesEl.value = changes.notes.newValue || '';
        reportNotes();
      }
    });
  }
})();
