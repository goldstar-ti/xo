// The command palette and the keyboard shortcut list. One document keydown listener; the keys come from keymap.js.
// A screen may register shortcuts with setScreenKeys(fn, scope); fn(event) returns true when it used the key.
import { editTask } from './forms.js';
import { allTasks, quickTask } from './taskdata.js';
import { actionLabel, activeScopes, actions, boundInActive, comboOf, keyFor, keyLabel, matchKey, setScope } from './keymap.js';
import { fuzzyScore } from './tasks.js';
import { t, text } from './text.js';
import { focusControl, input } from './ui.js';
import { dialogOpen, h, openDialog, toast } from './util.js';
import { dictateInto, micButton, voiceEnabled } from './voice.js';
import { allNotes, createNote } from './views/notes.js';

const MAX = 12;
// Text boxes dictation can type into (a checkbox or a button cannot take text).
const DICTATE_FIELD = 'textarea, wa-textarea, wa-input, input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="file"], [type="color"], [type="date"], [type="time"], [type="number"])';
const TASKS_KEY = 'xo-tasks';

let screenKeys = null;
let screenScope = null;
let installed = false;
let current = null;

/** Registers the current screen's key handler and its keymap scope, or clears both with null. */
export function setScreenKeys(fn, scope) {
  if (screenScope) setScope(screenScope, false);
  screenKeys = fn || null;
  screenScope = fn && scope ? scope : null;
  if (screenScope) setScope(screenScope, true);
}

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
  const newNote = { label: t('palette.new_note'), run: () => createNote().then((id) => { location.hash = `#/notes/${id}`; }).catch((err) => toast(err.message, 'bad')) };
  const notes = allNotes().map((n) => ({ label: t('palette.open_note', { title: n.title || t('notes.untitled') }), run: () => { location.hash = `#/notes/${n.id}`; } }));
  return [...go, newNote, ...checkins, ...views, ...open, ...notes];
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
    role: 'combobox', 'aria-controls': 'pal-list', 'aria-expanded': 'true', 'aria-autocomplete': 'list', class: 'tw:flex-1 tw:min-w-0',
  });
  const mic = micButton(box);
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
  current = openDialog(t('palette.heading'), h('div', {}, mic ? h('div', { class: 'tw:flex tw:gap-2 tw:items-center' }, box, mic) : box, list, h('p', { class: 'hint' }, t('palette.hint', { palette: keyLabel(keyFor('global.palette')), alt: keyLabel(keyFor('global.palette_alt')) }))));
  current.addEventListener('close', () => { current = null; });
  draw();
  focusControl(box);
}

/** Opens the list of keyboard shortcuts: the global keys, then the keys of the screen showing. */
export function openShortcuts() {
  if (dialogOpen()) return;
  const shown = new Set(['global', ...activeScopes()]);
  const rows = actions().filter((a) => shown.has(a.scope) && keyFor(a.id));
  const dlg = openDialog(t('palette.shortcuts_heading'), h('div', {},
    h('table', { class: 'tw:text-sm' },
      h('thead', {}, h('tr', {}, h('th', { class: 'tw:p-1 tw:pr-4 tw:text-left' }, t('keys.table.action')), h('th', { class: 'tw:p-1 tw:text-left' }, t('keys.table.key')))),
      h('tbody', {}, rows.map((a) => h('tr', {},
        h('td', { class: 'tw:p-1 tw:pr-4' }, actionLabel(a.id)),
        h('td', { class: 'tw:p-1' }, h('kbd', {}, keyLabel(keyFor(a.id)))))))),
    h('p', { class: 'hint' }, h('a', { href: '#/settings', onclick: () => dlg.close() }, t('keys.change_link')))));
}

function onKey(e) {
  if (e.defaultPrevented) return;
  if (screenKeys && screenKeys(e)) { e.preventDefault(); return; }
  let id = matchKey('global', e);
  // matchKey is silent while a dialog is open; dictation still works in the dialog's own text boxes.
  if (!id && dialogOpen() && comboOf(e) && comboOf(e) === keyFor('global.voice')) id = 'global.voice';
  if (!id || boundInActive(comboOf(e))) return;
  if (id === 'global.palette' || id === 'global.palette_alt') openPalette();
  else if (id === 'global.shortcuts') openShortcuts();
  else if (id === 'global.voice') {
    if (!voiceEnabled()) return;
    const el = document.activeElement;
    if (el?.matches?.(DICTATE_FIELD)) dictateInto(el); else toast(t('voice.no_field'));
  } else if (id.startsWith('global.zoom_')) {
    const L = window.XOLook;
    const now = L.active().look.zoom;
    const next = id === 'global.zoom_reset' ? L.DEFAULT_LOOK.zoom : now + (id === 'global.zoom_in' ? 10 : -10);
    L.change((s, look) => { look.zoom = next; });
    toast(t('palette.zoom_now', { zoom: L.active().look.zoom }));
  } else if (id.startsWith('global.go_')) location.hash = `#/${id.slice('global.go_'.length)}`;
  else return;
  e.preventDefault();
}

/** Starts listening for keys. Safe to call more than once. */
export function installPalette() {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', onKey);
}
