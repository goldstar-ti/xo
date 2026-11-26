// The widget canvas: a row of canvas tabs over a GridStack board of widgets, after NOBBIE's
// v3 shell. Built but not on any screen yet (decision D-9). A screen mounts it with
//
//   const canvas = await mountCanvas(root);   // and canvas.destroy() when the screen leaves
//
// and sets `live = false`, since the canvas redraws its own widgets.
//
// Each canvas is one item of kind `canvas`, id `canvas:<uuid>`, synced like any other item:
//   { title, order, items: { <widgetId>: { x, y, w, h } }, closed: { <widgetId>: { w, h } },
//     rolled: { <widgetId>: { h } } }
// items are the widgets on the board; closed keeps the size of a widget taken off, so Add widget
// puts it back at that size; rolled keeps the height to restore when a rolled-up widget opens.
// Widgets come from WIDGETS (static/js/widgets.js). An id no longer in the registry is kept in
// the saved canvas and simply not shown.
//
// Desktop: 24 columns of 28px rows, drag a widget by its title bar, resize from its edges. With the keyboard,
// the grip button moves a widget with Alt+Arrow and resizes it with Alt+Shift+Arrow.
// Phone (under 40rem): the widgets are a plain list in reading order, nothing is dragged and no
// geometry is saved, so the phone never rewrites the desktop layout.
//
// The active canvas is remembered per device in localStorage under `xo-canvas`.
import * as store from './store.js';
import { loadGridStack } from './grid.js';
import { tabStrip } from './tabs.js';
import { t } from './text.js';
import { button } from './ui.js';
import { h, openDialog, openForm, put, toast, uid } from './util.js';
import { WIDGETS } from './widgets.js';

const COLUMNS = 24;
const CELL_PX = 28; // Two rows hold a 2.5rem title bar once the margins are taken off.
const MARGIN_PX = 3;
const ROLLED_H = 2;
const SAVE_MS = 500;
const ACTIVE_KEY = 'xo-canvas';
const PHONE = '(max-width: 39.99rem)';

const blank = (title, order) => ({ title, order, items: {}, closed: {}, rolled: {} });

function clean(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    title: typeof d.title === 'string' && d.title ? d.title : t('canvas.untitled'),
    order: Number(d.order) || 0,
    items: d.items && typeof d.items === 'object' ? d.items : {},
    closed: d.closed && typeof d.closed === 'object' ? d.closed : {},
    rolled: d.rolled && typeof d.rolled === 'object' ? d.rolled : {},
  };
}

function remembered() {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}
function remember(id) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* storage blocked: the first canvas opens next time */ }
}

// Mounts the canvas tabs and board into root. Resolves to { destroy(), activeId(), canvases() }.
export async function mountCanvas(root) {
  const GridStack = await loadGridStack();
  const phone = window.matchMedia(PHONE);

  // id -> state. A canvas that was never saved has no item yet; the first change saves it.
  const canvases = new Map(store.byKind('canvas')
    .map((i) => [i.id, clean(i.data)])
    .sort((a, b) => a[1].order - b[1].order));
  if (!canvases.size) canvases.set(`canvas:${uid()}`, blank(t('canvas.first_title'), 0));
  let activeId = canvases.has(remembered()) ? remembered() : canvases.keys().next().value;

  let grid = null;
  const cleanups = new Map(); // widgetId -> cleanup function from its render()
  let saveTimer = 0;
  let dirty = null;

  const strip = tabStrip({
    label: t('canvas.tabs_aria'),
    onSelect: (id) => switchTo(id),
  });
  const addBtn = button(t('canvas.add_widget'), { class: 'small', onclick: () => openAdd() });
  const toolbar = h('div', { class: 'xo-canvas-tools' },
    addBtn,
    button(t('canvas.new'), { class: 'small', onclick: () => openNew() }),
    button(t('canvas.rename'), { class: 'small', onclick: () => openRename() }));
  const empty = h('p', { class: 'xo-canvas-empty empty' }, t('canvas.empty'));
  const board = h('div', { class: 'xo-board', 'aria-label': t('canvas.board_aria'), role: 'region' });
  const bar = h('div', { class: 'xo-canvas-bar' }, strip.el, toolbar);
  const wrap = h('div', { class: 'xo-canvas' }, bar, empty, board);
  root.replaceChildren(wrap);

  const current = () => canvases.get(activeId);

  function drawTabs() {
    strip.set([...canvases].map(([key, c]) => ({ key, label: c.title })), activeId);
  }

  // ---- saving ----
  function persist(id = activeId) {
    dirty = id;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_MS);
  }
  async function flush() {
    clearTimeout(saveTimer);
    const id = dirty;
    dirty = null;
    if (!id || !canvases.has(id)) return;
    try {
      await store.save('canvas', id, canvases.get(id), { silent: true });
    } catch (err) {
      toast(err.message || t('common.not_saved'), 'bad');
    }
  }

  // Reads the board's geometry back into the active canvas. Never on a phone.
  function readGeometry() {
    if (!grid || phone.matches) return;
    const c = current();
    for (const node of grid.engine.nodes) {
      const id = String(node.id);
      c.items[id] = { x: node.x, y: node.y, w: node.w, h: node.h };
    }
    persist();
  }

  // ---- widgets ----
  function widgetEl(id) {
    const def = WIDGETS[id];
    const title = t(def.title);
    const c = current();
    const rolled = !!c.rolled[id];
    const tool = (cls, label, glyph, onclick) =>
      h('button', { type: 'button', class: `xo-w-btn ${cls}`, 'aria-label': label, title: label, onclick }, glyph);
    const head = h('div', { class: 'xo-w-head' },
      h('h2', { class: 'xo-w-title' }, title),
      phone.matches ? null : h('span', { class: 'xo-w-actions' },
        tool('xo-w-grip', t('canvas.w_move', { name: title }), '✥', null),
        tool('xo-w-roll', rolled ? t('canvas.w_unroll') : t('canvas.w_roll'), rolled ? '▾' : '▴', () => toggleRoll(id)),
        tool('xo-w-close', t('canvas.w_close', { name: title }), '×', () => closeWidget(id))));
    const body = h('div', { class: 'xo-w-body' });
    const content = h('section', { class: 'grid-stack-item-content xo-w', 'aria-label': title }, head, body);
    const item = h('div', { class: rolled ? 'grid-stack-item xo-w-rolled' : 'grid-stack-item', 'gs-id': id, 'data-widget': id }, content);
    try {
      const done = def.render?.(body, { id, canvasId: activeId });
      if (typeof done === 'function') cleanups.set(id, done);
    } catch (err) {
      console.error(`widget ${id} failed`, err);
      body.replaceChildren(h('p', { class: 'empty' }, t('canvas.w_failed')));
    }
    return item;
  }

  function placed() {
    return Object.entries(current().items).filter(([id]) => WIDGETS[id]);
  }

  function syncEmpty() {
    empty.hidden = placed().length > 0;
  }

  function teardown() {
    for (const fn of cleanups.values()) { try { fn(); } catch (err) { console.error(err); } }
    cleanups.clear();
    if (grid) { grid.destroy(false); grid = null; }
    board.replaceChildren();
  }

  function show() {
    teardown();
    drawTabs();
    addBtn.hidden = phone.matches;
    board.classList.toggle('xo-board-list', phone.matches);
    board.classList.toggle('grid-stack', !phone.matches);
    const items = placed().sort(([, a], [, b]) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    if (phone.matches) {
      put(board, items.map(([id]) => widgetEl(id)));
    } else {
      grid = GridStack.init({
        column: COLUMNS,
        cellHeight: CELL_PX,
        margin: MARGIN_PX,
        float: false,
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        handle: '.xo-w-head',
        resizable: { handles: 'e, se, s, sw, w' },
      }, board);
      grid.batchUpdate();
      for (const [id, g] of items) {
        const el = widgetEl(id);
        board.append(el);
        grid.makeWidget(el, { id, x: g.x, y: g.y, w: g.w || WIDGETS[id].w, h: g.h || WIDGETS[id].h, minH: ROLLED_H, autoPosition: g.x == null });
      }
      grid.batchUpdate(false);
      grid.on('change', readGeometry);
    }
    syncEmpty();
  }

  async function switchTo(id) {
    if (!canvases.has(id) || id === activeId) return;
    if (dirty) await flush();
    activeId = id;
    remember(id);
    show();
  }

  function addWidget(id) {
    const def = WIDGETS[id];
    const c = current();
    const size = c.closed[id] || { w: def.w, h: def.h };
    delete c.closed[id];
    c.items[id] = { w: size.w, h: size.h };
    if (grid) {
      const el = widgetEl(id);
      board.append(el);
      grid.makeWidget(el, { id, w: size.w, h: size.h, minH: ROLLED_H, autoPosition: true });
      readGeometry();
      el.querySelector('.xo-w-btn')?.focus();
    } else {
      persist();
      show();
    }
    syncEmpty();
  }

  function closeWidget(id) {
    const c = current();
    const g = c.items[id];
    if (!g) return;
    const rolledH = c.rolled[id]?.h;
    c.closed[id] = { w: g.w, h: rolledH || g.h };
    delete c.items[id];
    delete c.rolled[id];
    cleanups.get(id)?.();
    cleanups.delete(id);
    const el = board.querySelector(`[data-widget="${CSS.escape(id)}"]`);
    if (grid && el) grid.removeWidget(el, true, false);
    else el?.remove();
    persist();
    syncEmpty();
    toast(t('canvas.w_closed', { name: t(WIDGETS[id].title) }));
  }

  function toggleRoll(id) {
    if (!grid) return;
    const c = current();
    const el = board.querySelector(`[data-widget="${CSS.escape(id)}"]`);
    const node = el?.gridstackNode;
    if (!node) return;
    const btn = el.querySelector('.xo-w-roll');
    if (c.rolled[id]) {
      const restore = c.rolled[id].h;
      delete c.rolled[id];
      el.classList.remove('xo-w-rolled');
      grid.update(el, { h: restore });
      btn.textContent = '▴';
      btn.setAttribute('aria-label', t('canvas.w_roll'));
      btn.title = t('canvas.w_roll');
    } else {
      c.rolled[id] = { h: node.h };
      el.classList.add('xo-w-rolled');
      grid.update(el, { h: ROLLED_H });
      btn.textContent = '▾';
      btn.setAttribute('aria-label', t('canvas.w_unroll'));
      btn.title = t('canvas.w_unroll');
    }
    readGeometry();
  }

  // Alt+Arrow moves the widget whose grip has focus; Alt+Shift+Arrow resizes it.
  function onKey(e) {
    if (!grid || !e.altKey || !e.key.startsWith('Arrow')) return;
    const grip = e.target.closest?.('.xo-w-grip');
    const el = grip?.closest('.grid-stack-item');
    const node = el?.gridstackNode;
    if (!node) return;
    e.preventDefault();
    const dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0;
    const dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
    if (e.shiftKey) grid.update(el, { w: Math.max(1, node.w + dx), h: Math.max(ROLLED_H, node.h + dy) });
    else grid.update(el, { x: Math.max(0, node.x + dx), y: Math.max(0, node.y + dy) });
    grip.focus();
    readGeometry();
  }
  board.addEventListener('keydown', onKey);

  // ---- dialogs ----
  function openAdd() {
    const c = current();
    const free = Object.values(WIDGETS).filter((w) => !c.items[w.id]);
    const body = free.length
      ? h('ul', { class: 'list xo-add-list' }, free.map((w) => h('li', {},
        button(t(w.title), { variant: 'row', class: 'row-main', 'data-widget': w.id, onclick: () => { dlg.close(); addWidget(w.id); } }))))
      : h('p', { class: 'empty' }, t('canvas.add_none'));
    const dlg = openDialog(t('canvas.add_title'), body);
  }

  function openNew() {
    openForm({
      title: t('canvas.new_title'),
      fields: [{ name: 'title', label: t('canvas.name_label'), required: true }],
      saveLabel: t('canvas.new_save'),
      onSave: async ({ title }) => {
        if (!title) return t('canvas.name_needed');
        const id = `canvas:${uid()}`;
        const order = Math.max(-1, ...[...canvases.values()].map((c) => c.order)) + 1;
        canvases.set(id, blank(title, order));
        await store.save('canvas', id, canvases.get(id), { silent: true });
        if (dirty) await flush();
        activeId = id;
        remember(id);
        show();
      },
    });
  }

  function openRename() {
    const c = current();
    openForm({
      title: t('canvas.rename_title'),
      fields: [{ name: 'title', label: t('canvas.name_label'), required: true }],
      values: { title: c.title },
      onSave: async ({ title }) => {
        if (!title) return t('canvas.name_needed');
        c.title = title;
        await store.save('canvas', activeId, c, { silent: true });
        drawTabs();
      },
      onDelete: canvases.size > 1 ? async () => {
        const gone = activeId;
        clearTimeout(saveTimer);
        dirty = null;
        await store.remove(gone);
        canvases.delete(gone);
        activeId = canvases.keys().next().value;
        remember(activeId);
        show();
      } : null,
    });
  }

  // ---- phone width ----
  const onPhone = () => { if (dirty) flush(); show(); };
  phone.addEventListener('change', onPhone);

  show();

  return {
    activeId: () => activeId,
    canvases: () => [...canvases].map(([id, c]) => ({ id, ...c })),
    async destroy() {
      phone.removeEventListener('change', onPhone);
      board.removeEventListener('keydown', onKey);
      if (dirty) await flush();
      teardown();
      wrap.remove();
    },
  };
}
