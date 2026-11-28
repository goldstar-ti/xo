// The widget canvas: a row of canvas tabs over a GridStack board of widgets, with a side pane of
// widget tabs, after NOBBIE's v3 shell. The Canvas screen (views/canvas.js) mounts it with
//
//   const canvas = await mountCanvas(root);   // and canvas.destroy() when the screen leaves
//
// Each canvas is one item of kind `canvas`, id `canvas:<uuid>`, synced like any other item:
//   { title, icon, order, items: { <placedId>: { x, y, w, h } }, closed: { <placedId>: { w, h, opts? } },
//     rolled: { <placedId>: { h } }, opts: { <placedId>: { title?, ...options } } }
// items are the widgets on the board; closed keeps the size (and options) of a widget taken off, so ticking
// it in Widgets puts it back as it was; rolled keeps the height to restore when a rolled-up widget opens.
// A placed id is the registry id (`bills`) for the first copy and `bills:2`, `bills:3` for more; typeOf()
// gives the registry id. opts holds each widget's name and options (cleanOpts() in widgets.js); never put
// options in items, which are overwritten with bare geometry.
// Widgets come from WIDGETS (static/js/widgets.js). An id no longer in the registry is kept in
// the saved canvas and simply not shown.
//
// Widget title bar: icon tools (Refresh, Zoom, Focus, Fit to content, Reset size, Options, the widget's own
// tools, Open in side tab; they show on hover or focus and drop into More when the bar is narrow), then Roll up, More,
// grip (Alt+Arrow moves, Alt+Shift+Arrow resizes) and Take off. The More menu lists the tools the
// bar had no room for, then Move to another canvas. The canvas bar is icon buttons: Widgets (a
// popover of ticks that puts widgets on and takes them off), Fit all, Reset layout, Undo (also
// Ctrl+Z), Redo (Ctrl+Shift+Z or Ctrl+Y), then New canvas and Rename canvas. Zoom shows one widget
// alone until Esc or Leave zoom; Focus rolls up the others and Leave focus rolls them down again.
// Undo and Redo step back and forward through this visit's changes.
//
// Side pane (desktop): widgets opened in a side tab leave the board and show in a tab set beside
// it (static/js/tabs.js). The open side tabs are kept per device in localStorage `xo-canvas-pane`.
//
// Phone (under 40rem): the widgets are a plain list, nothing is dragged, there is no side pane and no
// geometry is saved, so the phone never rewrites the desktop layout. The list follows `phone.order`
// (then reading order) and skips `phone.hidden`; Arrange moves widgets up and down and hides or shows them.
//
// Also per canvas: `float` (widgets do not pack upward), a Starter layout button and a layout code
// (`XC1-` plus the canvas as base64url JSON) that Rename copies and pastes. STARTERS holds the starter
// layouts by name; starter(widthRem, name) places one in tracks to suit the width.
// The look of a widget (frame, title bar, title font, size) is per device: see wChrome and friends in boot.js.
//
// The active canvas is remembered per device in localStorage under `xo-canvas`.
import * as store from './store.js';
import { loadGridStack } from './grid.js';
import { ariaKeys, keyFor, matchKey, setScope } from './keymap.js';
import { DEFAULT_ICONS, VALUE_RE, icon, iconButton, setIcon, setLabel } from './icons.js';
import { openPopover } from './popover.js';
import { tabSet, tabStrip } from './tabs.js';
import { t } from './text.js';
import { button, checkbox, field, searchBox, textarea } from './ui.js';
import { dialogOpen, h, motionStill, openForm, toast, uid } from './util.js';
import { moduleOfWidget, widgetOn } from './modules.js';
import { WIDGETS, cleanOpts, optsFor, typeOf } from './widgets.js';

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

// Starter layouts: widget types in reading order. A new canvas, and the Starter layout button, place one.
export const STARTERS = {
  default: ['clock', 'next', 'line', 'dayline', 'three', 'coming', 'week', 'tasks-list', 'checkins-week',
    'money', 'month', 'diary-list', 'countdown', 'obligations-list', 'routine-list', 'history', 'launcher', 'plancard', 'nudge'],
};

// Places a starter layout in tracks (columns of widgets) to suit the board's width in rem: six tracks on a 5K
// screen, two on a small laptop. Wide widgets take two tracks. Returns [{ id, type, x, y, w, h }].
export function starter(widthRem, name = 'default') {
  const tracks = widthRem >= 160 ? 6 : widthRem >= 120 ? 4 : widthRem >= 80 ? 3 : 2;
  const tw = Math.floor(COLUMNS / tracks);
  const tops = Array(tracks).fill(0);
  const out = [];
  for (const type of STARTERS[name] || STARTERS.default) {
    const def = WIDGETS[type];
    if (!def || !widgetOn(type)) continue;
    const span = Math.min(def.w > 12 ? 2 : 1, tracks >= 4 ? 2 : 1);
    let best = 0;
    let bestTop = Infinity;
    for (let i = 0; i + span <= tracks; i++) {
      const top = Math.max(...tops.slice(i, i + span));
      if (top < bestTop) { bestTop = top; best = i; }
    }
    out.push({ id: type, type, x: best * tw, y: bestTop, w: tw * span, h: def.h });
    for (let i = best; i < best + span; i++) tops[i] = bestTop + def.h;
  }
  return out;
}

const blank = (title, order, icon = '') => ({ title, icon, order, items: {}, closed: {}, rolled: {}, opts: {}, float: false, phone: { order: [], hidden: [] } });
const PLACED_RE = /^[a-z0-9-]{1,40}(:[0-9]{1,3})?$/;
const MAX_COPIES = 99;
const defOf = (id) => WIDGETS[typeOf(id)];

// Per-widget options, kept only for placed ids that are well formed, each cleaned for its widget type.
function cleanOptsMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, o] of Object.entries(raw)) {
    if (!PLACED_RE.test(id)) continue;
    const kept = cleanOpts(typeOf(id), o);
    if (Object.keys(kept).length) out[id] = kept;
  }
  return out;
}

// The first free placed id for a widget type on a canvas: `bills`, then `bills:2`, `bills:3`.
function freeId(c, type) {
  if (!c.items[type]) return type;
  for (let n = 2; n <= MAX_COPIES; n++) if (!c.items[`${type}:${n}`]) return `${type}:${n}`;
  return null;
}
const copy = (v) => JSON.parse(JSON.stringify(v));

// Replaces a canvas's widgets with a starter layout.
function fillStarter(c, widthRem) {
  Object.assign(c, { items: {}, closed: {}, rolled: {}, opts: {}, phone: { order: [], hidden: [] } });
  for (const g of starter(widthRem)) c.items[g.id] = { x: g.x, y: g.y, w: g.w, h: g.h };
}

// Placed ids for the phone's order and hidden lists: well formed and unique.
function cleanIds(list) {
  const out = [];
  for (const id of Array.isArray(list) ? list : []) if (typeof id === 'string' && PLACED_RE.test(id) && !out.includes(id)) out.push(id);
  return out.slice(0, 200);
}
const cleanPhone = (raw) => ({ order: cleanIds(raw?.order), hidden: cleanIds(raw?.hidden) });

function clean(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    title: typeof d.title === 'string' && d.title ? d.title : t('canvas.untitled'),
    icon: typeof d.icon === 'string' && VALUE_RE.test(d.icon) ? d.icon : '',
    order: Number(d.order) || 0,
    items: d.items && typeof d.items === 'object' ? d.items : {},
    closed: d.closed && typeof d.closed === 'object' ? d.closed : {},
    rolled: d.rolled && typeof d.rolled === 'object' ? d.rolled : {},
    opts: cleanOptsMap(d.opts),
    float: d.float === true,
    phone: cleanPhone(d.phone),
  };
}

// ---- layout codes ----
// A layout code is `XC1-` and the canvas item as base64url JSON. Pasting one keeps only widgets in the registry,
// with their geometry clamped, so a code from anywhere cannot put a bad value on the board.
const int = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };
function cleanGeo(g, withPos) {
  g = g && typeof g === 'object' ? g : {};
  const out = {};
  const keep = (k, v) => { if (v !== null) out[k] = v; };
  if (withPos) { keep('x', int(g.x, 0, COLUMNS - 1)); keep('y', int(g.y, 0, 9999)); }
  keep('w', int(g.w, MIN_W, COLUMNS));
  keep('h', int(g.h, ROLLED_H, 200));
  return out;
}

export function layoutCode(c) {
  const bytes = new TextEncoder().encode(JSON.stringify(clean(c)));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `XC1-${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

// The canvas a layout code holds, cleaned, or null when it is not a layout code.
export function readLayoutCode(code) {
  const text = String(code || '').trim();
  if (!/^XC1-[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const b64 = text.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const c = clean(raw);
    const known = (id) => PLACED_RE.test(id) && !!defOf(id);
    const items = {};
    for (const [id, g] of Object.entries(c.items).slice(0, 200)) if (known(id)) items[id] = cleanGeo(g, true);
    const closed = {};
    for (const [id, g] of Object.entries(c.closed).slice(0, 200)) {
      if (!known(id)) continue;
      const size = cleanGeo(g, false);
      const opts = cleanOpts(typeOf(id), g?.opts);
      closed[id] = Object.keys(opts).length ? { ...size, opts } : size;
    }
    const rolled = {};
    for (const [id, g] of Object.entries(c.rolled)) {
      const h = int(g?.h, ROLLED_H, 200);
      if (items[id] && h !== null) rolled[id] = { h };
    }
    const opts = {};
    for (const [id, o] of Object.entries(c.opts)) if (known(id)) opts[id] = o;
    const phone = { order: c.phone.order.filter((id) => items[id]), hidden: c.phone.hidden.filter((id) => items[id]) };
    return { ...c, items, closed, rolled, opts, phone };
  } catch {
    return null;
  }
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
    const done = defOf(id).render?.(body, ctx);
    return typeof done === 'function' ? done : null;
  } catch (err) {
    console.error(`widget ${id} failed`, err);
    body.replaceChildren(h('p', { class: 'empty' }, t('canvas.w_failed')));
    return null;
  }
}

// Mounts the canvas tabs, board and side pane into root.
// Resolves to { destroy(), activeId(), canvases(), undo(), redo() }.
export async function mountCanvas(root) {
  const GridStack = await loadGridStack();
  const phone = window.matchMedia(PHONE);

  // id -> state. A canvas that was never saved has no item yet; the first change saves it.
  const canvases = new Map(store.byKind('canvas')
    .map((i) => [i.id, clean(i.data)])
    .sort((a, b) => a[1].order - b[1].order));
  if (!canvases.size) {
    const first = blank(t('canvas.first_title'), 0);
    fillStarter(first, window.innerWidth / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
    canvases.set(`canvas:${uid()}`, first);
  }
  const saved = readLocal(ACTIVE_KEY, null);
  let activeId = canvases.has(saved) ? saved : canvases.keys().next().value;

  let grid = null;
  const cleanups = new Map(); // widgetId -> cleanup function from its render()
  const dirty = new Set(); // canvas ids waiting to be saved
  let saveTimer = 0;
  const undoStack = []; // [{ label, states: { canvasId: state } }]
  const redoStack = []; // steps Undo took back, newest last; any new change clears it
  const observers = new Map(); // widgetId -> ResizeObserver that fits its title bar tools
  let widgetsPop = null; // the open Widgets popover, or null
  let zoomedId = null;
  let focusRolled = null; // ids rolled up by Focus, or null when Focus is off
  let focusId = null;
  let arranging = false; // phone only: the Arrange mode that moves and hides widgets
  const dupObs = new Map(); // widgetId -> MutationObserver that hides a screen heading repeating the title

  // ---- layout ----
  const strip = tabStrip({ label: t('canvas.tabs_aria'), onSelect: (id) => switchTo(id) });
  const tool = (label, onclick, extra = {}) => button(label, { class: 'small', onclick, ...extra });
  const bar1 = (ico, label, onclick, extra = {}) => iconButton(ico, label, { onclick, ...extra });
  const widgetsBtn = bar1('squares-four', t('canvas.widgets_btn'), () => openWidgets(widgetsBtn),
    { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  const fitAllBtn = bar1('frame-corners', t('canvas.fit_all'), () => fitAll());
  const resetBtn = bar1('arrows-counter-clockwise', t('canvas.reset_layout'), () => resetLayout());
  const starterBtn = bar1('layout', t('canvas.starter'), () => applyStarter());
  const arrangeBtn = bar1('arrows-down-up', t('canvas.arrange'), () => toggleArrange(), { 'aria-pressed': 'false' });
  const undoBtn = bar1('arrow-u-up-left', t('canvas.undo'), () => undo(), { 'aria-keyshortcuts': ariaKeys(keyFor('canvas.undo')) });
  const redoBtn = bar1('arrow-u-up-right', t('canvas.redo'), () => redo(),
    { 'aria-keyshortcuts': `${ariaKeys(keyFor('canvas.redo'))} ${ariaKeys(keyFor('canvas.redo_alt'))}`.trim() });
  const newBtn = bar1('plus', t('canvas.new'), () => openNew());
  const renameBtn = bar1('pencil-simple', t('canvas.rename'), () => openRename());
  const leaveBtn = tool('', () => (zoomedId ? unzoom() : unfocus()));
  const divider = h('span', { class: 'xo-bar-div', 'aria-hidden': 'true' });
  const deskOnly = [widgetsBtn, fitAllBtn, resetBtn, starterBtn, undoBtn, redoBtn, divider];
  const toolbar = h('div', { class: 'xo-canvas-tools' },
    leaveBtn, widgetsBtn, fitAllBtn, resetBtn, starterBtn, undoBtn, redoBtn, divider, arrangeBtn, newBtn, renameBtn);
  const empty = h('p', { class: 'xo-canvas-empty empty' }, t('canvas.empty'));
  const board = h('div', { class: 'xo-board', 'aria-label': t('canvas.board_aria'), role: 'region' });
  const bar = h('div', { class: 'xo-canvas-bar' }, strip.el, toolbar);
  const main = h('div', { class: 'xo-canvas-main' }, bar, empty, board);
  const paneEl = h('aside', { class: 'xo-pane', 'aria-label': t('canvas.pane_aria') });
  const wrap = h('div', { class: 'xo-canvas' }, main, paneEl);
  root.replaceChildren(wrap);

  const current = () => canvases.get(activeId);
  const itemEl = (id) => board.querySelector(`.grid-stack-item[data-widget="${CSS.escape(id)}"], .xo-board-list > [data-widget="${CSS.escape(id)}"]`);
  const placed = (c = current()) => Object.keys(c.items).filter((id) => defOf(id) && widgetOn(id));
  // The name a widget shows: the owner's own, or the registry's.
  const nameOf = (id, c = current()) => c.opts[id]?.title || t(defOf(id).title);
  const states = new Map(); // `${canvasId}|${placedId}` -> the widget's in-memory state
  // What a widget's render() and tools() receive. canvasId is null for a widget in a side tab.
  function ctxFor(id, canvasId = activeId) {
    const c = canvasId ? canvases.get(canvasId) : current();
    const key = `${canvasId}|${id}`;
    if (!states.has(key)) states.set(key, {});
    return {
      id, type: typeOf(id), canvasId, opts: optsFor(typeOf(id), c?.opts[id] || c?.closed[id]?.opts), state: states.get(key),
      redraw: () => refresh(id),
    };
  }

  function drawTabs() {
    strip.set([...canvases].map(([key, c]) => ({ key, label: c.title, icon: c.icon })), activeId);
  }

  function syncBar() {
    const mode = zoomedId ? 'zoom' : focusRolled ? 'focus' : '';
    leaveBtn.hidden = !mode;
    if (mode) leaveBtn.textContent = mode === 'zoom' ? t('canvas.leave_zoom') : t('canvas.leave_focus');
    for (const b of deskOnly) b.hidden = phone.matches;
    arrangeBtn.hidden = !phone.matches;
    arrangeBtn.setAttribute('aria-pressed', String(arranging));
    setLabel(arrangeBtn, arranging ? t('canvas.arrange_done') : t('canvas.arrange'));
    undoBtn.disabled = !undoStack.length;
    redoBtn.disabled = !redoStack.length;
    empty.hidden = placed().length > 0;
    syncTools();
    syncWidgetsPop();
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
  const snap = (ids) => {
    const states = {};
    for (const id of ids) if (canvases.has(id)) states[id] = copy(canvases.get(id));
    return states;
  };
  function checkpoint(label, ids = [activeId]) {
    undoStack.push({ label, states: snap(ids) });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
    syncBar();
  }
  // Puts a step's canvases back, keeping what they were on the other stack so the step can be reversed.
  function travel(from, to, message) {
    const step = from.pop();
    if (!step) return;
    to.push({ label: step.label, states: snap(Object.keys(step.states)) });
    for (const [id, state] of Object.entries(step.states)) {
      canvases.set(id, state);
      persist(id);
    }
    focusRolled = null;
    focusId = null;
    zoomedId = null;
    show();
    toast(t(message, { what: t(`canvas.change.${step.label}`) }));
  }
  const undo = () => travel(undoStack, redoStack, 'canvas.undone');
  const redo = () => travel(redoStack, undoStack, 'canvas.redone');

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
  // The tools a title bar can hold, in order. The More menu lists the ones the bar has no room for.
  function toolList(id) {
    return [
      { key: 'refresh', ico: 'arrow-clockwise', label: t('canvas.m_refresh'), run: () => refresh(id) },
      zoomedId === id
        ? { key: 'zoom', ico: 'magnifying-glass-plus', label: t('canvas.leave_zoom'), run: unzoom }
        : { key: 'zoom', ico: 'magnifying-glass-plus', label: t('canvas.m_zoom'), run: () => zoom(id) },
      focusId === id
        ? { key: 'focus', ico: 'eye-closed', label: t('canvas.leave_focus'), run: () => unfocus(), pressed: true }
        : { key: 'focus', ico: 'eye-closed', label: t('canvas.m_focus'), run: () => focusOn(id) },
      { key: 'fit', ico: 'arrows-out-line-vertical', label: t('canvas.m_fit'), run: () => { checkpoint('fit'); fitWidget(id); readGeometry(); } },
      { key: 'reset', ico: 'arrow-counter-clockwise', label: t('canvas.m_reset_size'), run: () => resetSize(id) },
      { key: 'options', ico: 'adjustments', label: t('canvas.m_options'), run: (e) => openOptions(id, e?.currentTarget) },
      ...extraTools(id),
      { key: 'pane', ico: 'sidebar-simple', label: t('canvas.m_to_pane'), run: () => toPane(id) },
    ];
  }

  // The widget's own title bar buttons, from its registry entry's tools(ctx). A broken one is skipped.
  function extraTools(id) {
    try {
      const list = defOf(id).tools?.(ctxFor(id)) || [];
      return list.filter((d) => d && /^[a-z0-9-]{1,30}$/.test(d.key) && d.label).map((d) => ({ ...d, ico: d.ico || 'dots-three' }));
    } catch (err) {
      console.error(`widget ${id} tools failed`, err);
      return [];
    }
  }

  // Relabels the Zoom and Focus tools (they read Leave ... while on) on every title bar.
  function syncTools() {
    for (const el of board.querySelectorAll('[data-widget]')) {
      const id = el.dataset.widget;
      if (!defOf(id)) continue;
      for (const def of toolList(id)) {
        const btn = el.querySelector(`.xo-w-tools [data-tool="${def.key}"]`);
        if (!btn) continue;
        setLabel(btn, def.label);
        if (def.pressed) btn.setAttribute('aria-pressed', 'true'); else btn.removeAttribute('aria-pressed');
      }
    }
  }

  // Hides tools from the right (Open in side tab first) until the title bar no longer overflows.
  function fitTools(head) {
    const tools = [...head.querySelectorAll('.xo-w-tools > button')];
    if (!tools.length) return;
    for (const b of tools) b.hidden = false;
    const widths = tools.map((b) => b.offsetWidth);
    let excess = head.scrollWidth - head.clientWidth;
    for (let i = tools.length - 1; i >= 0 && excess > 0; i--) {
      tools[i].hidden = true;
      excess -= widths[i];
    }
  }

  function widgetEl(id) {
    const title = nameOf(id);
    const rolled = !!current().rolled[id];
    const btn = (cls, label, ico, onclick, attrs = {}) =>
      iconButton(ico, label, { class: `xo-w-btn ${cls}`, ...(onclick ? { onclick } : {}), ...attrs });
    const tools = h('span', { class: 'xo-w-tools' }, toolList(id).map((def) => {
      const b = btn('xo-w-tool', def.label, def.ico, def.run, { 'data-tool': def.key });
      if (def.pressed) b.setAttribute('aria-pressed', 'true');
      return b;
    }));
    const mod = moduleOfWidget(id);
    const head = h('div', { class: 'xo-w-head' },
      mod && DEFAULT_ICONS[mod] && h('span', { class: 'xo-w-ico', 'aria-hidden': 'true' }, icon(DEFAULT_ICONS[mod])),
      h('h2', { class: 'xo-w-title' }, title),
      phone.matches ? null : tools,
      phone.matches ? null : h('span', { class: 'xo-w-actions' },
        btn('xo-w-roll', rolled ? t('canvas.w_unroll') : t('canvas.w_roll'), rolled ? 'caret-down' : 'caret-up', () => toggleRoll(id)),
        btn('xo-w-more', t('canvas.w_more', { name: title }), 'dots-three', (e) => openMenu(id, e.currentTarget), { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }),
        btn('xo-w-grip', t('canvas.w_move', { name: title }), 'dots-six-vertical', null),
        btn('xo-w-close', t('canvas.w_close', { name: title }), 'x', () => closeWidget(id))));
    if (!phone.matches && typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => fitTools(head));
      ro.observe(head);
      observers.set(id, ro);
    }
    const body = h('div', { class: 'xo-w-body' });
    const content = h('section', { class: 'grid-stack-item-content xo-w', 'aria-label': title }, head, body);
    const item = h('div', { class: rolled ? 'grid-stack-item xo-w-rolled' : 'grid-stack-item', 'gs-id': id, 'data-widget': id, ...(mod ? { 'data-module': mod } : {}) }, content);
    const done = renderWidget(id, body, ctxFor(id));
    if (done) cleanups.set(id, done);
    watchHeadings(id, body);
    return item;
  }

  // A screen drawn in a widget often opens with its own heading ("The day" in the day widget). Mark any that repeats
  // the widget's name so the Appearance option can hide it; the screen may redraw, so watch the body.
  function watchHeadings(id, body) {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const mark = () => {
      const names = new Set([norm(nameOf(id)), norm(t(defOf(id).title))]);
      for (const el of body.querySelectorAll('h1, h2')) el.classList.toggle('xo-dup-head', names.has(norm(el.textContent)));
    };
    mark();
    if (typeof MutationObserver !== 'function') return;
    dupObs.get(id)?.disconnect();
    const mo = new MutationObserver(mark);
    mo.observe(body, { childList: true, subtree: true, characterData: true });
    dupObs.set(id, mo);
  }

  function dropCleanup(id) {
    try { cleanups.get(id)?.(); } catch (err) { console.error(err); }
    cleanups.delete(id);
    observers.get(id)?.disconnect();
    observers.delete(id);
    dupObs.get(id)?.disconnect();
    dupObs.delete(id);
  }

  function teardown() {
    for (const id of new Set([...cleanups.keys(), ...observers.keys(), ...dupObs.keys()])) dropCleanup(id);
    if (grid) { grid.destroy(false); grid = null; }
    board.replaceChildren();
  }

  // Widgets fade in one after another when a canvas loads: 40 ms apart, the ninth and later together with the eighth.
  function enterIn(el, i) {
    el.classList.add('xo-w-in');
    el.style.setProperty('--i', String(Math.min(i, 7)));
    return el;
  }

  function place(id, g) {
    const def = defOf(id);
    const el = widgetEl(id);
    board.append(el);
    grid.makeWidget(el, {
      id, x: g.x, y: g.y, w: g.w || def.w, h: g.h || def.h, minH: ROLLED_H, minW: MIN_W, autoPosition: g.x == null,
    });
    return el;
  }

  // Reading order: top to bottom, then left to right.
  const readingOrder = (a, b) => {
    const ga = current().items[a];
    const gb = current().items[b];
    return (ga.y ?? 0) - (gb.y ?? 0) || (ga.x ?? 0) - (gb.x ?? 0);
  };

  // ---- phone order and hide ----
  // Every placed widget in the phone's order: the owner's `phone.order` first, then the rest in reading order.
  function phoneOrder(ids = placed().sort(readingOrder)) {
    const ord = current().phone.order.filter((id) => ids.includes(id));
    return [...ord, ...ids.filter((id) => !ord.includes(id))];
  }
  // One Arrange bar over a widget: its name with Up, Down and Hide.
  function arrangeBar(id, i, n) {
    const name = nameOf(id);
    const b = (key, ico, label, run, off) => iconButton(ico, label, { class: 'xo-w-btn', 'data-arr': key, disabled: off, onclick: run });
    return h('div', { class: 'xo-arr' }, h('span', { class: 'xo-arr-name' }, name),
      b('up', 'arrow-up', t('canvas.arr_up', { name }), () => phoneMove(id, -1), i === 0),
      b('down', 'arrow-down', t('canvas.arr_down', { name }), () => phoneMove(id, 1), i === n - 1),
      b('hide', 'eye-slash', t('canvas.arr_hide', { name }), () => phoneHide(id), false));
  }
  function phoneMove(id, delta) {
    const c = current();
    const all = phoneOrder();
    const hid = new Set(c.phone.hidden);
    const shown = all.filter((x) => !hid.has(x));
    const i = shown.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= shown.length) return;
    [shown[i], shown[j]] = [shown[j], shown[i]];
    c.phone.order = [...shown, ...all.filter((x) => hid.has(x))];
    persist();
    show();
    const again = itemEl(id)?.querySelector(`[data-arr="${delta < 0 ? 'up' : 'down'}"]:not([disabled])`) || itemEl(id)?.querySelector('[data-arr="hide"]');
    again?.focus();
  }
  function phoneHide(id) {
    const c = current();
    c.phone.order = phoneOrder();
    if (!c.phone.hidden.includes(id)) c.phone.hidden.push(id);
    persist();
    show();
    board.querySelector('[data-arr="hide"]')?.focus();
  }
  function phoneShow(id) {
    const c = current();
    c.phone.hidden = c.phone.hidden.filter((x) => x !== id);
    persist();
    show();
    itemEl(id)?.querySelector('[data-arr="hide"]')?.focus();
  }
  function toggleArrange() {
    arranging = !arranging;
    show();
    arrangeBtn.focus();
  }

  // The Starter layout button: the current canvas's widgets are replaced by the starter set. Undo puts them back.
  function applyStarter() {
    if (!grid) return;
    checkpoint('reset_layout');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    fillStarter(current(), (board.clientWidth || window.innerWidth) / rem);
    for (const k of [...states.keys()]) if (k.startsWith(`${activeId}|`)) states.delete(k);
    focusRolled = null;
    focusId = null;
    zoomedId = null;
    show();
    readGeometry();
  }

  function show() {
    teardown();
    drawTabs();
    wrap.classList.remove('xo-zoom');
    board.classList.toggle('xo-board-list', phone.matches);
    board.classList.toggle('grid-stack', !phone.matches);
    // A widget never shows on the board and in a side tab at once.
    for (const id of placed()) if (pane?.has(id)) pane.close(id);
    const ids = placed().sort(readingOrder);
    if (phone.matches) {
      const all = phoneOrder(ids);
      const hid = new Set(current().phone.hidden);
      const shown = all.filter((id) => !hid.has(id));
      const els = shown.map((id, i) => {
        const el = enterIn(widgetEl(id), i);
        if (arranging) el.prepend(arrangeBar(id, i, shown.length));
        return el;
      });
      board.append(...els);
      if (!shown.length && !arranging && all.length) board.append(h('p', { class: 'empty' }, t('canvas.phone_all_hidden')));
      if (arranging) {
        const hiddenIds = all.filter((id) => hid.has(id));
        if (hiddenIds.length) {
          board.append(h('section', { class: 'xo-arr-hidden' }, h('h3', {}, t('canvas.arr_hidden')),
            hiddenIds.map((id) => h('div', { class: 'xo-arr-row', 'data-hidden-widget': id },
              h('span', {}, nameOf(id)),
              button(t('canvas.arr_show'), { class: 'small', 'aria-label': t('canvas.arr_show_for', { name: nameOf(id) }), onclick: () => phoneShow(id) })))));
        }
      }
    } else {
      grid = GridStack.init({
        column: COLUMNS,
        cellHeight: CELL_PX,
        margin: MARGIN_PX,
        float: current().float === true,
        animate: !motionStill(),
        handle: '.xo-w-head',
        resizable: { handles: 'e, se, s, sw, w' },
      }, board);
      grid.batchUpdate();
      ids.forEach((id, i) => enterIn(place(id, current().items[id]), i));
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
    arranging = false;
    activeId = id;
    writeLocal(ACTIVE_KEY, id);
    show();
  }

  function addWidget(id, { focus = true } = {}) {
    const def = defOf(id);
    const c = current();
    checkpoint('add');
    if (pane?.has(id)) pane.close(id);
    const size = c.closed[id] || { w: def.w, h: def.h };
    delete c.closed[id];
    if (size.opts) c.opts[id] = copy(size.opts);
    c.items[id] = { w: size.w, h: size.h };
    if (grid) {
      const el = place(id, c.items[id]);
      readGeometry();
      if (focus) el.querySelector('.xo-w-btn')?.focus();
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
    const opts = c.opts[id] ? copy(c.opts[id]) : null;
    c.closed[id] = opts ? { ...size, opts } : size;
    delete c.items[id];
    delete c.rolled[id];
    delete c.opts[id];
    states.delete(`${activeId}|${id}`);
    focusRolled?.delete(id);
    if (zoomedId === id) unzoom();
    dropCleanup(id);
    const el = itemEl(id);
    if (grid && el) grid.removeWidget(el, true, false);
    else el?.remove();
    persist();
    syncBar();
    return { ...size, opts };
  }

  function closeWidget(id, { focus = true } = {}) {
    const name = nameOf(id);
    checkpoint('close');
    takeOff(id);
    toast(t('canvas.w_closed', { name }));
    if (focus) board.querySelector('.xo-w-btn')?.focus();
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
    setIcon(btn, rolled ? 'caret-down' : 'caret-up');
    setLabel(btn, label);
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
    const done = renderWidget(id, body, ctxFor(id));
    if (done) cleanups.set(id, done);
    watchHeadings(id, body);
    syncTools();
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
    grid.update(el, { w: defOf(id).w, h: defOf(id).h });
    readGeometry();
  }

  // Every widget back to its default size, unrolled, packed in reading order.
  function resetLayout() {
    if (!grid) return;
    checkpoint('reset_layout');
    const c = current();
    for (const id of placed()) {
      delete c.rolled[id];
      c.items[id] = { w: defOf(id).w, h: defOf(id).h };
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
    const to = freeId(target, typeOf(id));
    if (!to) return;
    const name = nameOf(id);
    checkpoint('move_canvas', [activeId, targetId]);
    const size = takeOff(id);
    delete current().closed[id];
    delete target.closed[to];
    target.items[to] = { w: size.w, h: size.h };
    if (size.opts) target.opts[to] = size.opts;
    persist(targetId);
    toast(t('canvas.w_moved', { name, canvas: target.title }));
  }

  function toPane(id) {
    checkpoint('to_pane');
    takeOff(id);
    openInPane(id);
  }

  // ---- options and names ----
  // Updates a widget's title bar after it was renamed.
  function retitle(id) {
    const el = itemEl(id);
    if (!el) return;
    const name = nameOf(id);
    const set = (sel, label) => { const b = el.querySelector(sel); if (b) setLabel(b, label); };
    const h2 = el.querySelector('.xo-w-title');
    if (h2) h2.textContent = name;
    const body = el.querySelector('.xo-w-body');
    if (body) watchHeadings(id, body);
    el.querySelector('section')?.setAttribute('aria-label', name);
    set('.xo-w-more', t('canvas.w_more', { name }));
    set('.xo-w-grip', t('canvas.w_move', { name }));
    set('.xo-w-close', t('canvas.w_close', { name }));
  }

  // The Options tool: a form (anchored to its button) with a Name field and one control per option.
  function openOptions(id, opener) {
    const cid = activeId;
    const c = current();
    const def = defOf(id);
    const type = typeOf(id);
    const anchor = opener?.isConnected && !opener.hidden ? opener : itemEl(id)?.querySelector('.xo-w-more');
    const label = (o) => t(o.label || `canvas.opts.${type}.${o.k}`);
    openForm({
      title: t('canvas.opt_title', { name: nameOf(id) }),
      fields: [
        { name: 'title', label: t('canvas.opt_name'), placeholder: t(def.title), hint: t('canvas.opt_name_hint') },
        ...(def.opts || []).map((o) => (o.type === 'bool'
          ? { name: o.k, label: label(o), type: 'checkbox' }
          : { name: o.k, label: label(o), type: 'select', options: o.values.map((v) => [v, t(`canvas.opts.${type}.${o.k}_${v}`)]) })),
      ],
      values: { title: c.opts[id]?.title || '', ...optsFor(type, c.opts[id]) },
      saveLabel: t('canvas.opt_save'),
      anchor,
      onSave: (out) => {
        if (cid !== activeId || !c.items[id]) return;
        const kept = cleanOpts(type, out);
        checkpoint('options');
        if (Object.keys(kept).length) c.opts[id] = kept; else delete c.opts[id];
        persist();
        retitle(id);
        refresh(id);
      },
    });
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
    const name = nameOf(id);
    const entry = (label, run, ico = null) => h('button', {
      type: 'button',
      role: 'menuitem',
      class: 'xo-menu-item',
      tabindex: '-1',
      onclick: () => { closeMenu(); run(); },
    }, ico ? icon(ico) : null, label);
    const others = [...canvases].filter(([cid]) => cid !== activeId);
    // Only the tools the title bar had no room for; a tool that shows there is never repeated here.
    const hidden = new Set([...itemEl(id)?.querySelectorAll('.xo-w-tools > [hidden]') || []].map((b) => b.dataset.tool));
    const x = iconButton('x', t('common.close'), { class: 'xo-menu-x' });
    x.addEventListener('click', () => closeMenu()?.focus());
    const el = h('div', { class: 'xo-menu', role: 'menu', 'aria-label': t('canvas.w_more', { name }) },
      h('div', { class: 'xo-menu-bar' }, x),
      toolList(id).filter((def) => hidden.has(def.key)).map((def) => entry(def.label, def.run, def.ico)),
      others.length ? h('p', { class: 'xo-menu-label', role: 'presentation' }, t('canvas.m_move_to')) : null,
      others.map(([cid, c]) => entry(c.title, () => moveTo(id, cid))));
    el.addEventListener('keydown', (e) => {
      const items = [...el.querySelectorAll('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement);
      if (!items.length && e.key.startsWith('Arrow')) return;
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
    (el.querySelector('[role="menuitem"]') || x).focus();
  }

  // ---- side pane ----
  let pane = null;
  function syncPane() {
    paneEl.hidden = phone.matches || !pane || !pane.keys().length;
    wrap.classList.toggle('xo-has-pane', !paneEl.hidden);
  }
  function openInPane(id) {
    if (!pane || !defOf(id)) return;
    pane.open(id, current().closed[id]?.opts?.title || nameOf(id), (body) => {
      const content = h('div', { class: 'xo-pane-body' });
      body.append(
        h('div', { class: 'xo-pane-tools' }, button(t('canvas.p_to_canvas'), { class: 'small', onclick: () => backToCanvas(id) })),
        content);
      return renderWidget(id, content, ctxFor(id, null));
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
    for (const id of Array.isArray(reopen) ? reopen : []) if (typeof id === 'string' && PLACED_RE.test(id) && defOf(id) && !current().items[id]) openInPane(id);
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

  // Esc leaves Zoom; Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes, unless the focus is in a field or a dialog is open.
  function onDocKey(e) {
    if (dialogOpen() || menu) return;
    if (e.key === 'Escape' && zoomedId) { e.preventDefault(); unzoom(); return; }
    const typing = e.target.closest?.('input, textarea, select, [contenteditable], wa-input, wa-textarea');
    const act = matchKey('canvas', e);
    if (act === 'canvas.undo' && !typing && undoStack.length) {
      e.preventDefault();
      undo();
    } else if ((act === 'canvas.redo' || act === 'canvas.redo_alt') && !typing && redoStack.length) {
      e.preventDefault();
      redo();
    }
  }
  document.addEventListener('keydown', onDocKey);
  setScope('canvas', true);

  // ---- dialogs ----
  // The Widgets popover: one tick per widget in the registry. Ticking puts a widget on this canvas; unticking takes it off.
  let popRows = []; // [{ type, cb, count, add }] for the open Widgets popover
  const copiesOf = (type, c = current()) => Object.keys(c.items).filter((id) => typeOf(id) === type);
  function syncWidgetsPop() {
    if (!widgetsPop) return;
    for (const r of popRows) {
      const n = copiesOf(r.type).length;
      r.cb.checked = n > 0;
      r.count.textContent = n > 1 ? t('canvas.copies', { n }) : '';
      r.count.hidden = n < 2;
      r.add.hidden = n < 1;
    }
  }
  // Unticking takes every copy of the widget off, as one undo step.
  function closeCopies(type) {
    const ids = copiesOf(type);
    if (ids.length < 2) { for (const id of ids) closeWidget(id, { focus: false }); return; }
    checkpoint('close');
    for (const id of ids) takeOff(id);
    toast(t('canvas.w_closed', { name: t(WIDGETS[type].title) }));
  }
  function openWidgets(anchor) {
    if (widgetsPop) { widgetsPop.close(); return; }
    const none = h('p', { class: 'empty', hidden: true }, t('canvas.widgets_none'));
    const adding = (type) => { const id = freeId(current(), type); if (id) addWidget(id, { focus: false }); };
    popRows = [];
    const groups = new Map(); // group key ('' for none) -> { el, rows: [li] }
    for (const w of Object.values(WIDGETS).filter((x) => widgetOn(x.id))) {
      const name = t(w.title);
      const cb = checkbox({
        'data-widget': w.id,
        checked: copiesOf(w.id).length > 0,
        onchange: (e) => (e.target.checked ? adding(w.id) : closeCopies(w.id)),
      });
      const count = h('span', { class: 'xo-wcount', hidden: true });
      const add = button(t('canvas.add_another'), {
        class: 'small', 'aria-label': t('canvas.add_another_for', { name }), hidden: true, onclick: () => adding(w.id),
      });
      const li = h('li', { 'data-title': name.toLowerCase() }, field(name, cb), count, add);
      popRows.push({ type: w.id, cb, count, add });
      const key = typeof w.group === 'string' ? w.group : '';
      if (!groups.has(key)) {
        const ul = h('ul', { class: 'xo-wlist' });
        groups.set(key, { el: h('section', { class: 'xo-wgroup' }, key ? h('h3', {}, t(`canvas.groups.${key}`)) : null, ul), ul, rows: [] });
      }
      const g = groups.get(key);
      g.ul.append(li);
      g.rows.push(li);
    }
    const ordered = [...groups].sort((a, b) => (a[0] === '' ? -1 : 0) - (b[0] === '' ? -1 : 0));
    const filter = (text) => {
      const q = (text || '').trim().toLowerCase();
      let shown = 0;
      for (const [, g] of ordered) {
        let n = 0;
        for (const li of g.rows) {
          li.hidden = !li.dataset.title.includes(q);
          if (!li.hidden) n++;
        }
        g.el.hidden = n === 0;
        shown += n;
      }
      none.hidden = shown > 0;
    };
    const find = searchBox({ 'aria-label': t('canvas.widgets_search'), placeholder: t('canvas.widgets_search'), oninput: filter });
    const body = h('div', { class: 'xo-widgets' }, h('p', { class: 'note' }, t('canvas.widgets_note')), find, none,
      h('div', { class: 'xo-wgroups' }, ordered.map(([, g]) => g.el)));
    anchor.setAttribute('aria-expanded', 'true');
    widgetsPop = openPopover({
      title: t('canvas.widgets_title'), body, anchor, form: false, pinKey: 'xo-canvas-widgets-pinned',
      onClose: () => { widgetsPop = null; popRows = []; anchor.setAttribute('aria-expanded', 'false'); },
    });
    syncWidgetsPop();
  }

  function openNew() {
    openForm({
      title: t('canvas.new_title'),
      fields: [{ name: 'title', label: t('canvas.name_label'), required: true },
        { name: 'icon', label: t('canvas.icon_label'), type: 'icon' }],
      saveLabel: t('canvas.new_save'),
      anchor: newBtn,
      onSave: async ({ title, icon: pickedIcon }) => {
        if (!title) return t('canvas.name_needed');
        const id = `canvas:${uid()}`;
        const order = Math.max(-1, ...[...canvases.values()].map((c) => c.order)) + 1;
        canvases.set(id, blank(title, order, pickedIcon));
        await store.save('canvas', id, canvases.get(id), { silent: true });
        await switchTo(id);
      },
    });
  }

  // The layout code box in Rename: the canvas's code to copy, and a Paste layout code button that replaces the canvas.
  function codeField(c) {
    const area = textarea({ rows: 3, id: 'f-code', 'aria-label': t('canvas.code_label'), 'data-fk': 'layout-code', spellcheck: 'false' });
    area.value = layoutCode(c);
    const copyBtn = button(t('canvas.code_copy'), {
      class: 'small', 'data-fk': 'layout-copy',
      onclick: async () => {
        area.value = layoutCode(c);
        try { await navigator.clipboard.writeText(area.value); toast(t('canvas.code_copied')); } catch { area.select(); toast(t('canvas.code_select')); }
      },
    });
    const pasteBtn = button(t('canvas.code_paste'), { class: 'small', 'data-fk': 'layout-paste', onclick: () => pasteLayout(c, area.value) });
    return { node: h('div', { class: 'xo-code' }, area, h('div', { class: 'xo-code-btns' }, copyBtn, pasteBtn)), read: () => area.value };
  }
  // Replaces canvas c's widgets with those of a layout code. Its name, icon and place in the tabs stay.
  function pasteLayout(c, code) {
    const next = readLayoutCode(code);
    if (!next) { toast(t('canvas.code_bad'), 'bad'); return; }
    checkpoint('paste_layout', [activeId]);
    Object.assign(c, { items: next.items, closed: next.closed, rolled: next.rolled, opts: next.opts, float: next.float, phone: next.phone });
    for (const k of [...states.keys()]) if (k.startsWith(`${activeId}|`)) states.delete(k);
    focusRolled = null;
    focusId = null;
    zoomedId = null;
    show();
    readGeometry();
    persist();
    toast(t('canvas.code_pasted'));
  }

  function openRename() {
    const c = current();
    openForm({
      title: t('canvas.rename_title'),
      fields: [{ name: 'title', label: t('canvas.name_label'), required: true },
        { name: 'icon', label: t('canvas.icon_label'), type: 'icon' },
        { name: 'float', label: t('canvas.float_label'), type: 'checkbox', hint: t('canvas.float_hint') },
        { name: 'code', label: t('canvas.code_label'), type: 'custom', hint: t('canvas.code_hint'), build: () => codeField(c) }],
      values: { title: c.title, icon: c.icon, float: c.float === true },
      anchor: renameBtn,
      onSave: async ({ title, icon: pickedIcon, float }) => {
        if (!title) return t('canvas.name_needed');
        c.title = title;
        c.icon = pickedIcon;
        c.float = float === true;
        grid?.mode(c.float ? 'float' : 'top');
        await store.save('canvas', activeId, c, { silent: true });
        drawTabs();
      },
      onDelete: canvases.size > 1 ? async () => {
        const gone = activeId;
        dirty.delete(gone);
        await store.remove(gone);
        canvases.delete(gone);
        // Undo steps that would bring the deleted canvas back are dropped.
        for (const stack of [undoStack, redoStack]) {
          for (let i = stack.length - 1; i >= 0; i--) if (stack[i].states[gone]) stack.splice(i, 1);
        }
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
    widgetsPop?.close();
    arranging = false;
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
    redo,
    async destroy() {
      phone.removeEventListener('change', onPhone);
      board.removeEventListener('keydown', onBoardKey);
      document.removeEventListener('keydown', onDocKey);
      setScope('canvas', false);
      closeMenu();
      widgetsPop?.close();
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
