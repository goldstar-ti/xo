// The widget canvas: a row of canvas tabs over a GridStack board of widgets, with a side pane of
// widget tabs, after NOBBIE's v3 shell. The Canvas screen (views/canvas.js) mounts it with
//
//   const canvas = await mountCanvas(root);   // and canvas.destroy() when the screen leaves
//
// Each canvas is one item of kind `canvas`, id `canvas:<uuid>`, synced like any other item:
//   { title, order, items: { <widgetId>: { x, y, w, h } }, closed: { <widgetId>: { w, h } },
//     rolled: { <widgetId>: { h } } }
// items are the widgets on the board; closed keeps the size of a widget taken off, so Add widget
// puts it back at that size; rolled keeps the height to restore when a rolled-up widget opens.
// Widgets come from WIDGETS (static/js/widgets.js). An id no longer in the registry is kept in
// the saved canvas and simply not shown.
//
// Widget title bar: grip (Alt+Arrow moves, Alt+Shift+Arrow resizes), Roll up, More, Take off.
// The More menu: Refresh, Zoom, Focus, Fit to content, Reset size, Open in side tab, Move to
// another canvas. The canvas bar: Add widget, Fit all, Reset layout, Undo (also Ctrl+Z), New
// canvas, Rename canvas. Zoom shows one widget alone until Esc or Leave zoom; Focus rolls up the
// others and Leave focus rolls them down again. Undo steps back through this visit's changes.
//
// Side pane (desktop): widgets opened in a side tab leave the board and show in a tab set beside
// it (static/js/tabs.js). The open side tabs are kept per device in localStorage `xo-canvas-pane`.
//
// Phone (under 40rem): the widgets are a plain list in reading order, nothing is dragged, there is
// no side pane and no geometry is saved, so the phone never rewrites the desktop layout.
//
// The active canvas is remembered per device in localStorage under `xo-canvas`.
import * as store from './store.js';
import { loadGridStack } from './grid.js';
import { ariaKeys, keyFor, matchKey, setScope } from './keymap.js';
import { tabSet, tabStrip } from './tabs.js';
import { t } from './text.js';
import { button } from './ui.js';
import { dialogOpen, h, openDialog, openForm, toast, uid } from './util.js';
import { WIDGETS } from './widgets.js';

const COLUMNS = 24;
const CELL_PX = 28; // Two rows hold a 2.5rem title bar once the margins are taken off.
const MARGIN_PX = 3;
const ROLLED_H = 2;
const MIN_W = 4;
const FIT_MAX_ROWS = 60;
const UNDO_MAX = 30;
const SAVE_MS = 500;
const ACTIVE_KEY = 'xo-canvas';
const PANE_KEY = 'xo-canvas-pane';
const PHONE = '(max-width: 39.99rem)';

const blank = (title, order) => ({ title, order, items: {}, closed: {}, rolled: {} });
const copy = (v) => JSON.parse(JSON.stringify(v));

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

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: the default shows next time */ }
}

// Fills body with widget id and returns its cleanup function (or null).
function renderWidget(id, body, ctx) {
  body.replaceChildren();
  try {
    const done = WIDGETS[id].render?.(body, ctx);
    return typeof done === 'function' ? done : null;
  } catch (err) {
    console.error(`widget ${id} failed`, err);
    body.replaceChildren(h('p', { class: 'empty' }, t('canvas.w_failed')));
    return null;
  }
}

// Mounts the canvas tabs, board and side pane into root.
// Resolves to { destroy(), activeId(), canvases(), undo() }.
export async function mountCanvas(root) {
  const GridStack = await loadGridStack();
  const phone = window.matchMedia(PHONE);

  // id -> state. A canvas that was never saved has no item yet; the first change saves it.
  const canvases = new Map(store.byKind('canvas')
    .map((i) => [i.id, clean(i.data)])
    .sort((a, b) => a[1].order - b[1].order));
  if (!canvases.size) canvases.set(`canvas:${uid()}`, blank(t('canvas.first_title'), 0));
  const saved = readLocal(ACTIVE_KEY, null);
  let activeId = canvases.has(saved) ? saved : canvases.keys().next().value;

  let grid = null;
  const cleanups = new Map(); // widgetId -> cleanup function from its render()
  const dirty = new Set(); // canvas ids waiting to be saved
  let saveTimer = 0;
  const undoStack = []; // [{ label, states: { canvasId: state } }]
  let zoomedId = null;
  let focusRolled = null; // ids rolled up by Focus, or null when Focus is off
  let focusId = null;

  // ---- layout ----
  const strip = tabStrip({ label: t('canvas.tabs_aria'), onSelect: (id) => switchTo(id) });
  const tool = (label, onclick, extra = {}) => button(label, { class: 'small', onclick, ...extra });
  const addBtn = tool(t('canvas.add_widget'), () => openAdd());
  const fitAllBtn = tool(t('canvas.fit_all'), () => fitAll());
  const resetBtn = tool(t('canvas.reset_layout'), () => resetLayout());
  const undoBtn = tool(t('canvas.undo'), () => undo(), { 'aria-keyshortcuts': ariaKeys(keyFor('canvas.undo')) });
  const leaveBtn = tool('', () => (zoomedId ? unzoom() : unfocus()));
  const deskOnly = [addBtn, fitAllBtn, resetBtn, undoBtn];
  const toolbar = h('div', { class: 'xo-canvas-tools' },
    leaveBtn, addBtn, fitAllBtn, resetBtn, undoBtn,
    tool(t('canvas.new'), () => openNew()),
    tool(t('canvas.rename'), () => openRename()));
  const empty = h('p', { class: 'xo-canvas-empty empty' }, t('canvas.empty'));
  const board = h('div', { class: 'xo-board', 'aria-label': t('canvas.board_aria'), role: 'region' });
  const bar = h('div', { class: 'xo-canvas-bar' }, strip.el, toolbar);
  const main = h('div', { class: 'xo-canvas-main' }, bar, empty, board);
  const paneEl = h('aside', { class: 'xo-pane', 'aria-label': t('canvas.pane_aria') });
  const wrap = h('div', { class: 'xo-canvas' }, main, paneEl);
  root.replaceChildren(wrap);

  const current = () => canvases.get(activeId);
  const itemEl = (id) => board.querySelector(`.grid-stack-item[data-widget="${CSS.escape(id)}"], .xo-board-list > [data-widget="${CSS.escape(id)}"]`);
  const placed = (c = current()) => Object.keys(c.items).filter((id) => WIDGETS[id]);

  function drawTabs() {
    strip.set([...canvases].map(([key, c]) => ({ key, label: c.title })), activeId);
  }

  function syncBar() {
    const mode = zoomedId ? 'zoom' : focusRolled ? 'focus' : '';
    leaveBtn.hidden = !mode;
    if (mode) leaveBtn.textContent = mode === 'zoom' ? t('canvas.leave_zoom') : t('canvas.leave_focus');
    for (const b of deskOnly) b.hidden = phone.matches;
    undoBtn.disabled = !undoStack.length;
    empty.hidden = placed().length > 0;
  }

  // ---- saving ----
  function persist(id = activeId) {
    dirty.add(id);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_MS);
  }
  async function flush() {
    clearTimeout(saveTimer);
    const ids = [...dirty];
    dirty.clear();
    for (const id of ids) {
      if (!canvases.has(id)) continue;
      try {
        await store.save('canvas', id, canvases.get(id), { silent: true });
      } catch (err) {
        toast(err.message || t('common.not_saved'), 'bad');
      }
    }
  }

  // ---- undo ----
  // Records the canvases a change is about to touch. Call before the change.
  function checkpoint(label, ids = [activeId]) {
    const states = {};
    for (const id of ids) if (canvases.has(id)) states[id] = copy(canvases.get(id));
    undoStack.push({ label, states });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    syncBar();
  }
  function undo() {
    const step = undoStack.pop();
    if (!step) return;
    for (const [id, state] of Object.entries(step.states)) {
      canvases.set(id, state);
      persist(id);
    }
    focusRolled = null;
    focusId = null;
    zoomedId = null;
    show();
    toast(t('canvas.undone', { what: t(`canvas.change.${step.label}`) }));
  }

  // Reads the board's geometry back into the active canvas. Never on a phone.
  function readGeometry() {
    if (!grid || phone.matches) return;
    const c = current();
    for (const node of grid.engine.nodes) {
      c.items[String(node.id)] = { x: node.x, y: node.y, w: node.w, h: node.h };
    }
    persist();
  }

  // ---- widgets on the board ----
  function widgetEl(id) {
    const title = t(WIDGETS[id].title);
    const rolled = !!current().rolled[id];
    const btn = (cls, label, glyph, onclick, attrs = {}) =>
      h('button', { type: 'button', class: `xo-w-btn ${cls}`, 'aria-label': label, title: label, onclick, ...attrs }, glyph);
    const head = h('div', { class: 'xo-w-head' },
      h('h2', { class: 'xo-w-title' }, title),
      phone.matches ? null : h('span', { class: 'xo-w-actions' },
        btn('xo-w-grip', t('canvas.w_move', { name: title }), '✥', null),
        btn('xo-w-roll', rolled ? t('canvas.w_unroll') : t('canvas.w_roll'), rolled ? '▾' : '▴', () => toggleRoll(id)),
        btn('xo-w-more', t('canvas.w_more', { name: title }), '⋯', (e) => openMenu(id, e.currentTarget), { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }),
        btn('xo-w-close', t('canvas.w_close', { name: title }), '×', () => closeWidget(id))));
    const body = h('div', { class: 'xo-w-body' });
    const content = h('section', { class: 'grid-stack-item-content xo-w', 'aria-label': title }, head, body);
    const item = h('div', { class: rolled ? 'grid-stack-item xo-w-rolled' : 'grid-stack-item', 'gs-id': id, 'data-widget': id }, content);
    const done = renderWidget(id, body, { id, canvasId: activeId });
    if (done) cleanups.set(id, done);
    return item;
  }

  function dropCleanup(id) {
    try { cleanups.get(id)?.(); } catch (err) { console.error(err); }
    cleanups.delete(id);
  }

  function teardown() {
    for (const id of [...cleanups.keys()]) dropCleanup(id);
    if (grid) { grid.destroy(false); grid = null; }
    board.replaceChildren();
  }

  function place(id, g) {
    const def = WIDGETS[id];
    const el = widgetEl(id);
    board.append(el);
    grid.makeWidget(el, {
      id, x: g.x, y: g.y, w: g.w || def.w, h: g.h || def.h, minH: ROLLED_H, minW: MIN_W, autoPosition: g.x == null,
    });
    return el;
  }

  function show() {
    teardown();
    drawTabs();
    wrap.classList.remove('xo-zoom');
    board.classList.toggle('xo-board-list', phone.matches);
    board.classList.toggle('grid-stack', !phone.matches);
    // A widget never shows on the board and in a side tab at once.
    for (const id of placed()) if (pane?.has(id)) pane.close(id);
    const ids = placed().sort((a, b) => {
      const ga = current().items[a];
      const gb = current().items[b];
      return (ga.y ?? 0) - (gb.y ?? 0) || (ga.x ?? 0) - (gb.x ?? 0);
    });
    if (phone.matches) {
      board.append(...ids.map((id) => widgetEl(id)));
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
      for (const id of ids) place(id, current().items[id]);
      grid.batchUpdate(false);
      grid.on('change', readGeometry);
      grid.on('dragstart', () => checkpoint('move'));
      grid.on('resizestart', () => checkpoint('resize'));
    }
    syncBar();
  }

  async function switchTo(id) {
    if (!canvases.has(id) || id === activeId) return;
    if (dirty.size) await flush();
    focusRolled = null;
    focusId = null;
    zoomedId = null;
    activeId = id;
    writeLocal(ACTIVE_KEY, id);
    show();
  }

  function addWidget(id) {
    const def = WIDGETS[id];
    const c = current();
    checkpoint('add');
    if (pane?.has(id)) pane.close(id);
    const size = c.closed[id] || { w: def.w, h: def.h };
    delete c.closed[id];
    c.items[id] = { w: size.w, h: size.h };
    if (grid) {
      const el = place(id, c.items[id]);
      readGeometry();
      el.querySelector('.xo-w-btn')?.focus();
      syncBar();
    } else {
      persist();
      show();
    }
  }

  // Takes a widget off the board, keeping its size in `closed`. Returns its size.
  function takeOff(id) {
    const c = current();
    const g = c.items[id];
    if (!g) return null;
    const size = { w: g.w, h: c.rolled[id]?.h || g.h };
    c.closed[id] = size;
    delete c.items[id];
    delete c.rolled[id];
    focusRolled?.delete(id);
    if (zoomedId === id) unzoom();
    dropCleanup(id);
    const el = itemEl(id);
    if (grid && el) grid.removeWidget(el, true, false);
    else el?.remove();
    persist();
    syncBar();
    return size;
  }

  function closeWidget(id) {
    checkpoint('close');
    takeOff(id);
    toast(t('canvas.w_closed', { name: t(WIDGETS[id].title) }));
    board.querySelector('.xo-w-btn')?.focus();
  }

  function setRolled(id, rolled) {
    const c = current();
    const el = itemEl(id);
    const node = el?.gridstackNode;
    if (!grid || !node || rolled === !!c.rolled[id]) return;
    const btn = el.querySelector('.xo-w-roll');
    if (rolled) {
      c.rolled[id] = { h: node.h };
      grid.update(el, { h: ROLLED_H });
    } else {
      const restore = c.rolled[id].h;
      delete c.rolled[id];
      grid.update(el, { h: restore });
    }
    el.classList.toggle('xo-w-rolled', rolled);
    const label = rolled ? t('canvas.w_unroll') : t('canvas.w_roll');
    btn.textContent = rolled ? '▾' : '▴';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  function toggleRoll(id) {
    checkpoint(current().rolled[id] ? 'unroll' : 'roll');
    setRolled(id, !current().rolled[id]);
    readGeometry();
  }

  function refresh(id) {
    const body = itemEl(id)?.querySelector('.xo-w-body');
    if (!body) return;
    dropCleanup(id);
    const done = renderWidget(id, body, { id, canvasId: activeId });
    if (done) cleanups.set(id, done);
  }

  // Rows that show the whole widget without a scroll bar, at its current width.
  function contentRows(id) {
    const el = itemEl(id);
    const head = el?.querySelector('.xo-w-head');
    const body = el?.querySelector('.xo-w-body');
    if (!head || !body) return null;
    const px = head.offsetHeight + body.scrollHeight + 2 * MARGIN_PX + 2;
    return Math.min(FIT_MAX_ROWS, Math.max(ROLLED_H + 1, Math.ceil(px / CELL_PX)));
  }

  function fitWidget(id) {
    const el = itemEl(id);
    if (!grid || !el || current().rolled[id]) return;
    const rows = contentRows(id);
    if (rows) grid.update(el, { h: rows });
  }

  function fitAll() {
    checkpoint('fit_all');
    grid?.batchUpdate();
    for (const id of placed()) fitWidget(id);
    grid?.batchUpdate(false);
    readGeometry();
  }

  function resetSize(id) {
    const el = itemEl(id);
    if (!grid || !el) return;
    checkpoint('reset_size');
    setRolled(id, false);
    grid.update(el, { w: WIDGETS[id].w, h: WIDGETS[id].h });
    readGeometry();
  }

  // Every widget back to its default size, unrolled, packed in reading order.
  function resetLayout() {
    if (!grid) return;
    checkpoint('reset_layout');
    const c = current();
    for (const id of placed()) {
      delete c.rolled[id];
      c.items[id] = { w: WIDGETS[id].w, h: WIDGETS[id].h };
    }
    focusRolled = null;
    focusId = null;
    show();
    readGeometry();
  }

  function zoom(id) {
    if (!grid) return;
    if (focusRolled) unfocus();
    zoomedId = id;
    wrap.classList.add('xo-zoom');
    board.querySelectorAll('.grid-stack-item').forEach((el) => el.classList.toggle('xo-w-zoomed', el.dataset.widget === id));
    syncBar();
    itemEl(id)?.querySelector('.xo-w-more')?.focus();
  }
  function unzoom() {
    const was = zoomedId;
    zoomedId = null;
    wrap.classList.remove('xo-zoom');
    board.querySelectorAll('.xo-w-zoomed').forEach((el) => el.classList.remove('xo-w-zoomed'));
    syncBar();
    if (was) itemEl(was)?.querySelector('.xo-w-more')?.focus();
  }

  function focusOn(id) {
    if (!grid) return;
    if (zoomedId) unzoom();
    if (focusRolled) unfocus(false);
    checkpoint('focus');
    focusId = id;
    focusRolled = new Set();
    grid.batchUpdate();
    setRolled(id, false);
    for (const other of placed()) {
      if (other !== id && !current().rolled[other]) {
        setRolled(other, true);
        focusRolled.add(other);
      }
    }
    grid.batchUpdate(false);
    readGeometry();
    syncBar();
  }
  function unfocus(save = true) {
    if (!focusRolled) return;
    grid?.batchUpdate();
    for (const id of focusRolled) setRolled(id, false);
    grid?.batchUpdate(false);
    focusRolled = null;
    const was = focusId;
    focusId = null;
    if (save) readGeometry();
    syncBar();
    if (was) itemEl(was)?.querySelector('.xo-w-more')?.focus();
  }

  function moveTo(id, targetId) {
    const target = canvases.get(targetId);
    if (!target) return;
    checkpoint('move_canvas', [activeId, targetId]);
    const size = takeOff(id);
    delete current().closed[id];
    delete target.closed[id];
    target.items[id] = { w: size.w, h: size.h };
    persist(targetId);
    toast(t('canvas.w_moved', { name: t(WIDGETS[id].title), canvas: target.title }));
  }

  function toPane(id) {
    checkpoint('to_pane');
    takeOff(id);
    openInPane(id);
  }

  // ---- the More menu ----
  let menu = null;
  function closeMenu() {
    if (!menu) return;
    menu.opener.setAttribute('aria-expanded', 'false');
    menu.el.remove();
    const { opener } = menu;
    menu = null;
    document.removeEventListener('pointerdown', outside, true);
    return opener;
  }
  function outside(e) {
    if (menu && !menu.el.contains(e.target) && e.target !== menu.opener) closeMenu();
  }
  function openMenu(id, opener) {
    if (menu) { const was = closeMenu(); if (was === opener) return; }
    const name = t(WIDGETS[id].title);
    const entry = (label, run) => h('button', {
      type: 'button',
      role: 'menuitem',
      class: 'xo-menu-item',
      tabindex: '-1',
      onclick: () => { closeMenu(); run(); },
    }, label);
    const others = [...canvases].filter(([cid]) => cid !== activeId);
    const el = h('div', { class: 'xo-menu', role: 'menu', 'aria-label': t('canvas.w_more', { name }) },
      entry(t('canvas.m_refresh'), () => refresh(id)),
      zoomedId === id ? entry(t('canvas.leave_zoom'), unzoom) : entry(t('canvas.m_zoom'), () => zoom(id)),
      focusId === id ? entry(t('canvas.leave_focus'), () => unfocus()) : entry(t('canvas.m_focus'), () => focusOn(id)),
      entry(t('canvas.m_fit'), () => { checkpoint('fit'); fitWidget(id); readGeometry(); }),
      entry(t('canvas.m_reset_size'), () => resetSize(id)),
      entry(t('canvas.m_to_pane'), () => toPane(id)),
      others.length ? h('p', { class: 'xo-menu-label', role: 'presentation' }, t('canvas.m_move_to')) : null,
      others.map(([cid, c]) => entry(c.title, () => moveTo(id, cid))));
    el.addEventListener('keydown', (e) => {
      const items = [...el.querySelectorAll('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeMenu()?.focus(); }
    });
    document.body.append(el);
    const r = opener.getBoundingClientRect();
    const w = el.offsetWidth;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    el.style.top = `${Math.min(window.innerHeight - el.offsetHeight - 8, r.bottom + 4)}px`;
    opener.setAttribute('aria-expanded', 'true');
    menu = { el, opener };
    document.addEventListener('pointerdown', outside, true);
    el.querySelector('[role="menuitem"]').focus();
  }

  // ---- side pane ----
  let pane = null;
  function syncPane() {
    paneEl.hidden = phone.matches || !pane || !pane.keys().length;
    wrap.classList.toggle('xo-has-pane', !paneEl.hidden);
  }
  function openInPane(id) {
    if (!pane || !WIDGETS[id]) return;
    pane.open(id, t(WIDGETS[id].title), (body) => {
      const content = h('div', { class: 'xo-pane-body' });
      body.append(
        h('div', { class: 'xo-pane-tools' }, button(t('canvas.p_to_canvas'), { class: 'small', onclick: () => backToCanvas(id) })),
        content);
      return renderWidget(id, content, { id, canvasId: null });
    });
    syncPane();
  }
  function backToCanvas(id) {
    pane.close(id);
    if (!current().items[id]) addWidget(id);
  }
  if (!phone.matches) {
    // Read before tabSet() runs: its first onChange saves its empty list.
    const reopen = readLocal(PANE_KEY, []);
    pane = tabSet(paneEl, {
      label: t('canvas.pane_aria'),
      onChange: ({ keys }) => { writeLocal(PANE_KEY, keys); syncPane(); },
    });
    for (const id of Array.isArray(reopen) ? reopen : []) if (WIDGETS[id] && !current().items[id]) openInPane(id);
  }
  syncPane();

  // ---- keys ----
  // Alt+Arrow moves the widget whose grip has focus; Alt+Shift+Arrow resizes it.
  function onBoardKey(e) {
    if (!grid || !e.altKey || !e.key.startsWith('Arrow')) return;
    const grip = e.target.closest?.('.xo-w-grip');
    const el = grip?.closest('.grid-stack-item');
    const node = el?.gridstackNode;
    if (!node) return;
    e.preventDefault();
    checkpoint(e.shiftKey ? 'resize' : 'move');
    const dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0;
    const dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
    if (e.shiftKey) grid.update(el, { w: Math.max(MIN_W, node.w + dx), h: Math.max(ROLLED_H, node.h + dy) });
    else grid.update(el, { x: Math.max(0, node.x + dx), y: Math.max(0, node.y + dy) });
    grip.focus();
    readGeometry();
  }
  board.addEventListener('keydown', onBoardKey);

  // Esc leaves Zoom; Ctrl+Z undoes, unless the focus is in a field or a dialog is open.
  function onDocKey(e) {
    if (dialogOpen() || menu) return;
    if (e.key === 'Escape' && zoomedId) { e.preventDefault(); unzoom(); return; }
    const typing = e.target.closest?.('input, textarea, select, [contenteditable], wa-input, wa-textarea');
    if (matchKey('canvas', e) === 'canvas.undo' && !typing && undoStack.length) {
      e.preventDefault();
      undo();
    }
  }
  document.addEventListener('keydown', onDocKey);
  setScope('canvas', true);

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
        await switchTo(id);
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
        dirty.delete(gone);
        await store.remove(gone);
        canvases.delete(gone);
        // Undo steps that would bring the deleted canvas back are dropped.
        for (let i = undoStack.length - 1; i >= 0; i--) if (undoStack[i].states[gone]) undoStack.splice(i, 1);
        activeId = canvases.keys().next().value;
        writeLocal(ACTIVE_KEY, activeId);
        show();
      } : null,
    });
  }

  // ---- phone width ----
  const onPhone = () => {
    if (dirty.size) flush();
    closeMenu();
    focusRolled = null;
    focusId = null;
    zoomedId = null;
    syncPane();
    show();
  };
  phone.addEventListener('change', onPhone);

  show();

  return {
    activeId: () => activeId,
    canvases: () => [...canvases].map(([id, c]) => ({ id, ...c })),
    undo,
    async destroy() {
      phone.removeEventListener('change', onPhone);
      board.removeEventListener('keydown', onBoardKey);
      document.removeEventListener('keydown', onDocKey);
      setScope('canvas', false);
      closeMenu();
      if (dirty.size) await flush();
      teardown();
      // Closing the side tabs runs their cleanups; their onChange empties the saved list, so put it back.
      const open = pane?.keys() || [];
      for (const id of open) pane.close(id);
      if (pane) writeLocal(PANE_KEY, open);
      wrap.remove();
    },
  };
}
