// The command palette (Ctrl+K or /) and the keyboard shortcut list (?). One document keydown listener.
// A screen may register single-key shortcuts with setScreenKeys(fn); fn(event) returns true when it used the key.
import { editTask } from './forms.js';
import { allTasks, quickTask } from './taskdata.js';
import { fuzzyScore } from './tasks.js';
import { t, text } from './text.js';
import { focusControl, input } from './ui.js';
import { dialogOpen, h, openDialog, toast } from './util.js';

const TYPING = 'input, textarea, select, [contenteditable], wa-input, wa-textarea, wa-select';
const MAX = 12;
const TASKS_KEY = 'xo-tasks';

let screenKeys = null;
let installed = false;
let current = null;

/** Registers the current screen's key handler, or clears it with null. */
export function setScreenKeys(fn) { screenKeys = fn || null; }

// The Tracker screen binds its own `/` and `?` keys, so the palette leaves those to it (Ctrl+K still works there).
const onTracker = () => location.hash.startsWith('#/tracker');

function setTasksView(view) {
  try {
    const saved = JSON.parse(localStorage.getItem(TASKS_KEY) || '{}') || {};
    localStorage.setItem(TASKS_KEY, JSON.stringify({ ...saved, view }));
  } catch { /* storage blocked or damaged */ }
  location.hash = `#/tasks/${view}`;
}

// Built each time the palette opens, so new screens and new tasks appear without a second list to keep.
function COMMANDS() {
  const go = Object.entries(text('app.nav')).map(([key, label]) => ({ label: t('palette.go', { screen: label }), run: () => { location.hash = `#/${key}`; } }));
  const checkins = ['morning', 'evening', 'weekly'].map((type) => ({ label: t(`palette.checkin_${type}`), run: () => { location.hash = `#/checkin/${type}`; } }));
  const views = ['list', 'board', 'table'].map((v) => ({ label: t('palette.view', { view: t(`lists.tasks.views.${v}`) }), run: () => setTasksView(v) }));
  const open = allTasks()
    .filter((i) => i.data.status !== 'done' && !i.data.archived)
    .map((i) => ({ label: t('palette.open_task', { title: i.data.title }), run: () => editTask(i) }));
  return [...go, ...checkins, ...views, ...open];
}

const addCommand = (raw) => ({
  label: t('palette.add_task', { title: raw }),
  run: () => quickTask(raw).catch((err) => toast(err.message, 'bad')),
});

/** Opens the command palette. */
export function openPalette() {
  if (current?.isConnected || dialogOpen()) return;
  const all = COMMANDS();
  let shown = [];
  let active = 0;
  const box = input({
    type: 'text', placeholder: t('palette.placeholder'), 'aria-label': t('palette.placeholder'), autocomplete: 'off',
    role: 'combobox', 'aria-controls': 'pal-list', 'aria-expanded': 'true', 'aria-autocomplete': 'list',
  });
  const list = h('ul', { id: 'pal-list', role: 'listbox', class: 'list', 'aria-label': t('palette.list_aria') });
  const run = (cmd) => { current?.close(); cmd.run(); };
  const draw = () => {
    const raw = (box.value || '').trim();
    shown = raw
      ? all.map((c) => ({ c, s: fuzzyScore(raw, c.label) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, MAX).map((x) => x.c)
      : all.slice(0, MAX);
    if (!shown.length && raw) shown = [addCommand(raw)];
    active = Math.min(active, shown.length - 1);
    list.replaceChildren(...shown.map((c, n) => h('li', {
      id: `pal-${n}`, role: 'option', 'aria-selected': String(n === active), class: n === active ? 'on' : '', onclick: () => run(c),
    }, h('span', {}, c.label))));
    box.setAttribute('aria-activedescendant', shown.length ? `pal-${active}` : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  };
  box.addEventListener('input', () => { active = 0; draw(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) active = (active + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) run(shown[active]);
    }
  });
  current = openDialog(t('palette.heading'), h('div', {}, box, list, h('p', { class: 'hint' }, t('palette.hint'))));
  current.addEventListener('close', () => { current = null; });
  draw();
  focusControl(box);
}

/** Opens the list of keyboard shortcuts. */
export function openShortcuts() {
  if (dialogOpen()) return;
  openDialog(t('palette.shortcuts_heading'), h('ul', {}, Object.values(text('palette.shortcuts')).map((line) => h('li', {}, line))));
}

function onKey(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
    return;
  }
  if (ctrl || e.altKey || e.defaultPrevented) return;
  if (e.target.closest?.(TYPING) || dialogOpen() || onTracker()) return;
  if (e.key === '/') { e.preventDefault(); openPalette(); return; }
  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
  if (screenKeys && screenKeys(e)) e.preventDefault();
}

/** Starts listening for keys. Safe to call more than once. */
export function installPalette() {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', onKey);
}
