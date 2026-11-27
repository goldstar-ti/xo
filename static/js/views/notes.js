// The Notes screen: notes written in Markdown, with a search box and pinning. #/notes lists them; #/notes/<id> opens one.
//
// Layout: a page head (New note), then the list beside the open note on a wide screen, or the note instead of the list on a
// phone (the tracker's layout). A note is the item note:<uuid>: { title, body, pinned, custom, created, updated }.
//
// Not live: the screen redraws its list when the store changes, and never rebuilds the open note's editor, so typing is not
// interrupted. The open note saves 600 ms after the last change, silently, and again when you leave.
import * as store from '../store.js';
import { customEditor } from '../customfields.js';
import { mdEditor } from '../mdeditor.js';
import { matchKey } from '../keymap.js';
import { setScreenKeys } from '../palette.js';
import { t } from '../text.js';
import { badge, button, chip, input } from '../ui.js';
import { h, uid } from '../util.js';

export const live = false;

const KIND = 'note';
const SAVE_MS = 600;
const SEARCH_MS = 250;

/** Every note as { id, ...data }, pinned first, then the most recently changed. */
export function allNotes() {
  return store.byKind(KIND)
    .map((i) => ({ id: i.id, title: '', body: '', pinned: false, custom: {}, created: '', updated: '', ...i.data }))
    .sort((a, b) => (b.pinned - a.pinned) || String(b.updated).localeCompare(String(a.updated)));
}

/** Saves a new empty note and returns its id. */
export async function createNote() {
  const id = `${KIND}:${uid()}`;
  const now = new Date().toISOString();
  await store.save(KIND, id, { title: '', body: '', pinned: false, custom: {}, created: now, updated: now });
  return id;
}

const firstLine = (body) => (String(body || '').split('\n').find((l) => l.trim()) || '').trim().slice(0, 120);

let mounted = null;

export function render(root, id) {
  leave();
  mounted = mount(root, id);
  setScreenKeys((e) => mounted?.keys(e) || false, 'notes');
}

export function leave() {
  mounted?.stop();
  mounted = null;
}

// Draws the screen into root. Returns { stop, keys }. embedded: inside a canvas widget, where opening a note must not change the address.
export function mount(root, refParam, { embedded = false } = {}) {
  const ui = { selected: refParam ? decodeURIComponent(refParam) : null, q: '' };
  let editor = null; // { id, flush, stop } for the open note

  const search = input({ type: 'text', role: 'searchbox', placeholder: t('notes.search'), 'aria-label': t('notes.search'), 'data-focus': 'notes-search', autocomplete: 'off' });
  let searchTimer;
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ui.q = search.value.trim().toLowerCase(); drawList(); }, SEARCH_MS); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') search.blur(); });

  const rowsEl = h('div', {});
  const listEl = h('div', { class: 'tw:min-w-0 tw:flex tw:flex-col tw:gap-3' }, search, rowsEl);
  const detailEl = h('section', { class: 'tw:min-w-0', 'aria-label': t('notes.detail_aria') });
  const split = h('div', {}, listEl, detailEl);
  const head = h('header', { class: 'page-head' },
    h('h1', {}, t('notes.heading')),
    h('div', { class: 'actions' }, button(t('notes.new'), { variant: 'primary', onclick: () => newNote() })));
  const wrap = h('div', { class: 'notes tw:flex tw:flex-col tw:gap-4' }, head, split);
  root.replaceChildren(wrap);

  async function newNote() {
    editor?.flush();
    const id = await createNote();
    select(id, { focus: true });
  }

  function select(id, { focus = false } = {}) {
    editor?.flush();
    ui.selected = id;
    const target = id ? `#/notes/${id}` : '#/notes';
    if (!embedded && location.hash !== target) history.replaceState(null, '', target);
    drawList();
    drawDetail();
    if (focus) detailEl.querySelector('[data-focus="note-title"]')?.focus();
  }

  function drawList() {
    const all = allNotes();
    const shown = ui.q ? all.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(ui.q)) : all;
    rowsEl.replaceChildren(shown.length
      ? h('ul', { class: 'list', 'aria-label': t('notes.list_aria') }, shown.map((n) => h('li', { 'aria-current': n.id === ui.selected ? 'true' : null },
        button([
          h('span', {}, n.title || t('notes.untitled')),
          firstLine(n.body) && h('small', {}, firstLine(n.body)),
          n.pinned && h('small', {}, badge(t('notes.pinned'))),
        ], { variant: 'row', class: 'row-main', onclick: () => select(n.id, { focus: false }) }))))
      : h('p', { class: 'empty' }, t(all.length ? 'notes.no_match' : 'notes.empty')));
  }

  function drawDetail() {
    editor?.stop();
    editor = null;
    detailEl.replaceChildren();
    if (ui.selected && !store.get(ui.selected)) ui.selected = null;
    const open = !!ui.selected;
    // Wide screen: the list beside the note. Phone: the note takes the place of the list.
    split.className = open ? 'tw:grid tw:gap-6 tw:items-start tw:lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]' : '';
    listEl.className = open ? 'tw:min-w-0 tw:flex tw:flex-col tw:gap-3 tw:hidden tw:lg:flex' : 'tw:min-w-0 tw:flex tw:flex-col tw:gap-3';
    detailEl.className = open ? 'tw:min-w-0 tw:rounded-xo tw:border-rule tw:border-line tw:bg-surface tw:p-4' : 'tw:hidden';
    if (open) editor = buildEditor(detailEl, ui.selected, { back: () => select(null), after: drawList });
  }

  const off = store.onChange(() => {
    if (ui.selected && !store.get(ui.selected)) { select(null); return; }
    drawList();
  });
  const hide = () => { if (document.visibilityState === 'hidden') editor?.flush(); };
  document.addEventListener('visibilitychange', hide);

  drawList();
  drawDetail();

  return {
    stop() {
      clearTimeout(searchTimer);
      editor?.stop();
      off();
      document.removeEventListener('visibilitychange', hide);
    },
    // The screen's keys. Returns true when one was used.
    keys(e) {
      const id = matchKey('notes', e);
      if (id === 'notes.new') { newNote(); return true; }
      if (id === 'notes.search') { search.focus(); return true; }
      return false;
    },
  };
}

// The open note: title, Markdown body, pin, custom fields, status and delete. Saves itself. Returns { flush, stop }.
function buildEditor(root, id, { back, after }) {
  const note = { title: '', body: '', pinned: false, custom: {}, created: '', updated: '', ...store.get(id).data };
  let timer = null;
  let dirty = false;
  let gone = false;
  const status = h('p', { class: 'hint', role: 'status' });

  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (!dirty || gone) return;
    dirty = false;
    note.updated = new Date().toISOString();
    try {
      await store.save(KIND, id, { ...note }, { silent: true });
      status.textContent = t('notes.saved');
      after();
    } catch (err) {
      dirty = true;
      status.textContent = err.message;
    }
  }
  const changed = () => {
    dirty = true;
    status.textContent = t('notes.saving');
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_MS);
  };

  const title = input({ type: 'text', value: note.title, placeholder: t('notes.untitled'), 'aria-label': t('notes.title_aria'), 'data-focus': 'note-title', autocomplete: 'off', class: 'tw:text-lg tw:font-semibold' });
  title.addEventListener('input', () => { note.title = title.value; changed(); });
  const body = mdEditor({ value: note.body, label: t('notes.body_aria'), rows: 14, onInput: (v) => { note.body = v; changed(); } });

  const pin = () => chip(t(note.pinned ? 'notes.unpin' : 'notes.pin'), {
    pressed: note.pinned,
    onclick: () => { note.pinned = !note.pinned; pinSlot.replaceChildren(pin()); changed(); },
  });
  const pinSlot = h('div', {}, pin());

  let armed = false;
  const del = button(t('notes.delete'), { variant: 'danger', class: 'small' });
  del.addEventListener('click', async () => {
    if (!armed) { armed = true; del.textContent = t('notes.delete_confirm'); return; }
    gone = true;
    clearTimeout(timer);
    try {
      await store.remove(id);
    } catch (err) {
      gone = false;
      status.textContent = err.message;
    }
  });

  const custom = customEditor(KIND, note.custom, (next) => { note.custom = next; changed(); });
  root.append(h('div', { class: 'tw:flex tw:flex-col tw:gap-3' },
    h('div', { class: 'tw:flex tw:items-center tw:justify-between tw:gap-2' },
      button(t('notes.back'), { class: 'small tw:lg:hidden', onclick: () => { flush().then(back); } }),
      pinSlot),
    title,
    body.node,
    custom,
    status,
    h('div', {}, del)));

  return {
    flush,
    stop() { flush(); },
  };
}
