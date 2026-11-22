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
  };
  let todos = [];

  const saveTodos = () => store.set('todos', todos);

  function renderTodos() {
    const items = todos.map(todoItem);
    todoEls.list.replaceChildren(...items);
    const open = todos.filter(t => !t.done).length;
    todoEls.count.textContent = todos.length ? `${open} left` : '';
    todoEls.clear.hidden = !todos.some(t => t.done);
    window.Dock?.setStatus('todo', open
      ? { text: String(open), title: `${open} open task${open === 1 ? '' : 's'}` + (todos.find(t => !t.done) ? ` · next: ${todos.find(t => !t.done).text}` : '') }
      : { title: todos.length ? 'All done' : 'No tasks' });
  }

  function todoItem(todo) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.done ? ' done' : '');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = todo.done;
    box.setAttribute('aria-label', `Mark "${todo.text}" ${todo.done ? 'not done' : 'done'}`);
    box.addEventListener('change', () => {
      todo.done = box.checked;
      saveTodos();
      renderTodos();
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

    li.append(box, text, del);
    return li;
  }

  function startEdit(todo, el) {
    el.contentEditable = 'true';
    el.focus();
    document.getSelection().selectAllChildren(el);
    let cancelled = false;

    const finish = () => {
      el.removeEventListener('keydown', onKey);
      el.contentEditable = 'false';
      const value = el.textContent.trim();
      if (cancelled) { el.textContent = todo.text; return; }
      if (!value) return removeTodo(todo.id);
      todo.text = value;
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

  todoEls.form.addEventListener('submit', e => {
    e.preventDefault();
    const text = todoEls.input.value.trim();
    if (!text) return;
    todos.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false });
    todoEls.input.value = '';
    saveTodos();
    renderTodos();
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
