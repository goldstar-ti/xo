// The Bridge: a board of widgets, modelled on NOBBIE's canvas. On a wide screen it is a
// GridStack grid (drag by the title bar, resize from the edges, roll up, rename, per-widget
// options); on a phone it is one column you reorder and hide widgets in.
//
// Everything about the board stays on this device, like the look: localStorage xo-board.
// A layout code (XB1-...) copies a board to another device. Never trust what comes out of
// storage or a pasted code: cleanBoard() rebuilds it field by field.
import * as store from './store.js';
import { t } from './text.js';
import { button, checkbox, field, focusControl, select } from './ui.js';
import { h, openDialog, openForm, put, toast } from './util.js';
import { GROUPS, STARTER, WIDGETS, cleanOpts } from './widgets.js';

const KEY = 'xo-board';
const WIDE = window.matchMedia('(min-width: 60rem)');
export const COLS = [12, 16, 24, 32, 48];
const BASE_COLS = 24; // widget sizes in widgets.js are written for 24 columns
const CHOICES = {
  start: ['auto', 'bridge', 'today'],
  chrome: ['card', 'outline', 'flat', 'stripe'],
  head: ['full', 'slim', 'none'],
  titleFont: ['head', 'body', 'num'],
  inner: ['hide', 'show'],
  tint: ['none', 'soft', 'attention'],
};
const DEFAULT_DIALS = {
  start: 'auto', cols: 24, row: 2, gap: 0.5, scale: 100,
  chrome: 'card', head: 'full', titleFont: 'head', inner: 'hide', float: false, animate: true, lock: true,
};
const MAX_WIDGETS = 60;

const clamp = (n, lo, hi, fallback) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const newId = () => `w${Math.random().toString(36).slice(2, 9)}`;

function cleanBoard(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const d = raw.dials && typeof raw.dials === 'object' ? raw.dials : {};
  const dials = {
    start: CHOICES.start.includes(d.start) ? d.start : DEFAULT_DIALS.start,
    cols: COLS.includes(Number(d.cols)) ? Number(d.cols) : DEFAULT_DIALS.cols,
    row: clamp(d.row, 1, 5, DEFAULT_DIALS.row),
    gap: clamp(d.gap, 0, 2, DEFAULT_DIALS.gap),
    scale: clamp(d.scale, 60, 150, DEFAULT_DIALS.scale),
    chrome: CHOICES.chrome.includes(d.chrome) ? d.chrome : DEFAULT_DIALS.chrome,
    head: CHOICES.head.includes(d.head) ? d.head : DEFAULT_DIALS.head,
    titleFont: CHOICES.titleFont.includes(d.titleFont) ? d.titleFont : DEFAULT_DIALS.titleFont,
    inner: CHOICES.inner.includes(d.inner) ? d.inner : DEFAULT_DIALS.inner,
    float: d.float === true,
    animate: d.animate !== false,
    lock: d.lock !== false,
  };
  const seen = new Set();
  const widgets = (Array.isArray(raw.widgets) ? raw.widgets : []).filter((x) => x && WIDGETS[x.type]).slice(0, MAX_WIDGETS).map((x) => {
    let id = str(x.id, 20).replace(/[^a-z0-9]/gi, '');
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    const size = WIDGETS[x.type].size;
    const cols = dials.cols;
    return {
      id, type: x.type,
      title: str(x.title, 40).trim(),
      tint: CHOICES.tint.includes(x.tint) ? x.tint : 'none',
      rolled: x.rolled === true,
      opts: cleanOpts(x.type, x.opts),
      x: Math.round(clamp(x.x, 0, cols - 1, 0)),
      y: Math.round(clamp(x.y, 0, 999, 0)),
      w: Math.round(clamp(x.w, 1, cols, Math.round(size.w * cols / BASE_COLS))),
      h: Math.round(clamp(x.h, 1, 120, size.h)),
    };
  });
  const ids = new Set(widgets.map((x) => x.id));
  const p = raw.phone && typeof raw.phone === 'object' ? raw.phone : {};
  const order = (Array.isArray(p.order) ? p.order : []).filter((id, i, a) => ids.has(id) && a.indexOf(id) === i);
  const hidden = (Array.isArray(p.hidden) ? p.hidden : []).filter((id, i, a) => ids.has(id) && a.indexOf(id) === i);
  return { v: 1, dials, widgets, phone: { order, hidden }, made: raw.made === true };
}

let board = load();
function load() { try { return cleanBoard(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return cleanBoard({}); } }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(board)); } catch { /* storage off: the board lasts for this visit */ }
  // Open settings and catalogue tabs redraw, so the layout code and counts there stay current.
  window.dispatchEvent(new Event('xo:board'));
}

// Redraws a dialog body whenever the board changes, keeping keyboard focus where it was.
function followBoard(body, draw, dlg) {
  const onBoard = () => {
    if (!body.isConnected) return;
    const fk = body.contains(document.activeElement) && document.activeElement?.dataset?.fk;
    draw();
    const el = fk && body.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (el) focusControl(el).catch(() => {});
  };
  window.addEventListener('xo:board', onBoard);
  dlg.addEventListener('close', () => window.removeEventListener('xo:board', onBoard));
}

// Which screen opens when the address has none. 'auto': the Bridge on a wide screen, Today on a phone.
export function startScreen() {
  const s = board.dials.start;
  return s === 'auto' ? (WIDE.matches ? 'bridge' : 'today') : s;
}

// ---- starter layout ----
// Places the starter widgets in tracks (columns of widgets) to suit the board's width in rem:
// six tracks on a 5K screen, two on a small laptop. Wide widgets take two tracks.
function starter(widthRem) {
  const tracks = widthRem >= 160 ? 6 : widthRem >= 120 ? 4 : widthRem >= 80 ? 3 : 2;
  const cols = board.dials.cols;
  const tw = Math.floor(cols / tracks);
  const tops = Array(tracks).fill(0);
  const out = [];
  for (const type of STARTER) {
    const def = WIDGETS[type];
    const span = Math.min(def.span, tracks >= 4 ? 2 : 1);
    let best = 0;
    let bestTop = Infinity;
    for (let i = 0; i + span <= tracks; i++) {
      const top = Math.max(...tops.slice(i, i + span));
      if (top < bestTop) { bestTop = top; best = i; }
    }
    out.push({ id: newId(), type, title: '', tint: 'none', rolled: false, opts: cleanOpts(type, {}), x: best * tw, y: bestTop, w: tw * span, h: def.size.h });
    for (let i = best; i < best + span; i++) tops[i] = bestTop + def.size.h;
  }
  return out;
}

// ---- GridStack, loaded on first use from static/vendor/gridstack ----
let gsLoading = null;
function loadGridStack() {
  if (!gsLoading) {
    gsLoading = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-gridstack]')) {
        const link = h('link', { rel: 'stylesheet', href: '/vendor/gridstack/gridstack.min.css', 'data-gridstack': '' });
        document.head.append(link);
      }
      const s = document.createElement('script');
      s.src = '/vendor/gridstack/gridstack-all.js';
      s.onload = () => resolve(window.GridStack?.GridStack || window.GridStack);
      s.onerror = () => { gsLoading = null; reject(new Error(t('bridge.grid_failed'))); };
      document.head.append(s);
    });
  }
  return gsLoading;
}

// ---- runtime ----
let grid = null;
let mounted = null; // { root, nodes: Map(id -> { def, w, el, body, state }) }
let arranging = false;
let timer = 0;
let lastMinute = '';
let lastDay = '';
let unsubscribe = null;

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const titleOf = (x) => x.title || t(`bridge.widgets.${x.type}.name`);
const rolledRows = () => Math.max(1, Math.ceil((board.dials.head === 'slim' ? 2 : 2.6) / board.dials.row));

function teardown() {
  if (grid) { try { grid.destroy(false); } catch { /* already gone */ } grid = null; }
  clearInterval(timer);
  timer = 0;
  unsubscribe?.();
  unsubscribe = null;
  mounted = null;
}

function drawBody(node) {
  const { def, w, body } = node;
  // Leave a widget alone while you are typing in it; it catches up when you leave the field.
  const typing = body.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && document.activeElement.value;
  if (typing) { node.stale = true; return; }
  node.stale = false;
  const y = body.scrollTop;
  body.replaceChildren();
  try {
    def.render(body, w.opts, node.ctx);
  } catch (err) {
    console.error('widget failed', w.type, err);
    put(body, h('p', { class: 'form-error' }, t('bridge.widget_failed')));
  }
  body.scrollTop = y;
  const refocus = sessionStorage.getItem('refocus');
  const target = refocus && body.querySelector(`[data-focus="${refocus}"]`);
  if (target) { sessionStorage.removeItem('refocus'); focusControl(target).catch(() => {}); }
}

function drawTools(node) {
  const { def, w, tools } = node;
  const iconBtn = (label, glyph, onclick, extra = {}) => button(glyph, { class: 'bw-icon', 'aria-label': label, title: label, onclick, ...extra });
  tools.replaceChildren();
  put(tools,
    !w.rolled && def.tools?.(w.opts, node.ctx),
    !WIDE.matches && arranging && [
      iconBtn(t('bridge.tool.move_up'), '↑', () => movePhone(w.id, -1)),
      iconBtn(t('bridge.tool.move_down'), '↓', () => movePhone(w.id, 1)),
      iconBtn(t(board.phone.hidden.includes(w.id) ? 'bridge.tool.show' : 'bridge.tool.hide'), board.phone.hidden.includes(w.id) ? '+' : '−', () => togglePhoneHidden(w.id)),
    ],
    iconBtn(t(w.rolled ? 'bridge.tool.unroll' : 'bridge.tool.roll'), w.rolled ? '▾' : '▴', () => roll(w.id), { 'aria-expanded': String(!w.rolled) }),
    iconBtn(t('bridge.tool.options', { title: titleOf(w) }), '⋯', () => widgetOptions(w.id)),
  );
}

function widgetEl(w) {
  const def = WIDGETS[w.type];
  const body = h('div', { class: 'bw-body' });
  const tools = h('div', { class: 'bw-tools' });
  const title = h('h2', { class: 'bw-title' }, titleOf(w));
  const el = h('section', {
    class: 'bw', 'data-type': w.type, 'data-id': w.id, 'data-tint': w.tint, 'aria-label': titleOf(w),
  }, h('header', { class: 'bw-head' }, title, tools), body);
  el.toggleAttribute('data-rolled', w.rolled);
  const node = { def, w, el, body, tools, title, state: {}, stale: false };
  node.ctx = { state: node.state, redraw: () => drawBody(node) };
  body.addEventListener('focusout', () => { if (node.stale) setTimeout(() => drawBody(node), 0); });
  drawTools(node);
  if (!w.rolled) drawBody(node);
  return node;
}

function applyDials(root) {
  const d = board.dials;
  root.style.setProperty('--bw-gap', `${d.gap}rem`);
  root.style.setProperty('--bw-scale', String(d.scale / 100));
  root.dataset.chrome = d.chrome;
  root.dataset.head = d.head;
  root.dataset.titleFont = d.titleFont;
  root.dataset.inner = d.inner;
  root.toggleAttribute('data-arranging', arranging);
}

function toolbar() {
  const d = board.dials;
  const arrange = button(t(arranging ? 'bridge.done_arranging' : 'bridge.arrange'), {
    variant: arranging ? 'primary' : 'ghost', 'aria-pressed': String(arranging), 'data-fk': 'bridge-arrange',
    onclick: () => { arranging = !arranging; rerender(); },
  });
  return h('header', { class: 'page-head bw-bar' },
    h('h1', {}, t('bridge.title')),
    h('div', { class: 'actions' },
      button(t('bridge.add'), { variant: 'primary', 'data-fk': 'bridge-add', onclick: openCatalogue }),
      arrange,
      WIDE.matches && !arranging && d.lock && h('span', { class: 'bw-hint' }, t('bridge.locked_hint')),
      button(t('bridge.board_settings'), { 'data-fk': 'bridge-settings', onclick: openBoardSettings })));
}

// fresh: drawn by the router (a visit to the Bridge), so Arrange starts off.
export async function renderBridge(root, { fresh = false } = {}) {
  teardown();
  if (fresh) arranging = false;
  board = load();
  const mine = { root, nodes: new Map() };
  mounted = mine;
  root.classList.add('bridge-view');
  applyDials(root);
  const host = h('div', { class: 'bw-host' });
  put(root, toolbar(), host);
  if (!board.made) {
    // First visit on this device: the starter set, sized for this screen.
    const width = (host.getBoundingClientRect().width || window.innerWidth) / rem();
    board.widgets = starter(width);
    board.phone = { order: board.widgets.map((x) => x.id), hidden: [] };
    board.made = true;
    persist();
  }
  if (!board.widgets.length) put(host, h('p', { class: 'empty' }, t('bridge.empty')));
  if (WIDE.matches) await renderGrid(host, mine);
  else renderPhone(host, mine);
  if (mounted !== mine) return;
  lastMinute = new Date().toISOString().slice(0, 16);
  lastDay = new Date().toDateString();
  timer = setInterval(tick, 1000);
  unsubscribe = store.onChange(refresh);
}

function phoneOrder() {
  const byReading = board.widgets.slice().sort((a, b) => a.y - b.y || a.x - b.x).map((x) => x.id);
  return [...board.phone.order, ...byReading.filter((id) => !board.phone.order.includes(id))];
}

function renderPhone(host, mine) {
  host.classList.add('bw-stack');
  for (const id of phoneOrder()) {
    const w = board.widgets.find((x) => x.id === id);
    const hidden = board.phone.hidden.includes(id);
    if (!w || (hidden && !arranging)) continue;
    const node = widgetEl(w);
    node.el.toggleAttribute('data-hidden', hidden);
    mine.nodes.set(id, node);
    host.append(node.el);
  }
}

async function renderGrid(host, mine) {
  let GS;
  try { GS = await loadGridStack(); } catch (err) { put(host, h('p', { class: 'form-error' }, err.message)); return; }
  if (mounted !== mine) return;
  const d = board.dials;
  host.classList.add('grid-stack');
  for (const w of board.widgets) {
    const node = widgetEl(w);
    mine.nodes.set(w.id, node);
    const size = WIDGETS[w.type].size;
    const item = h('div', {
      class: 'grid-stack-item', 'gs-id': w.id, 'gs-x': w.x, 'gs-y': w.y, 'gs-w': w.w,
      'gs-h': w.rolled ? rolledRows() : w.h,
      'gs-min-w': Math.max(1, Math.round(size.minW * d.cols / BASE_COLS)),
      'gs-min-h': w.rolled ? 1 : size.minH,
    }, h('div', { class: 'grid-stack-item-content' }, node.el));
    if (w.rolled) item.setAttribute('gs-no-resize', 'true');
    node.item = item;
    host.append(item);
  }
  const editable = arranging || !d.lock;
  grid = GS.init({
    column: d.cols,
    cellHeight: `${d.row}rem`,
    margin: `${d.gap / 2}rem`,
    float: d.float,
    animate: d.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    handle: '.bw-head',
    staticGrid: !editable,
    resizable: { handles: 'e, se, s, sw, w' },
    // A board squeezed narrow (a small window with the side pane open) shows one column for
    // the moment; the saved layout is untouched. columnMax: once columnOpts is set GridStack
    // caps the board at 12 columns unless told otherwise.
    columnOpts: { columnMax: d.cols, breakpointForWindow: false, breakpoints: [{ w: Math.round(30 * rem()), c: 1, layout: 'list' }] },
  }, host);
  grid.on('change', (_e, items) => {
    if (!items || grid.getColumn() !== d.cols) return;
    for (const it of items) {
      const w = board.widgets.find((x) => x.id === it.id);
      if (!w) continue;
      w.x = it.x; w.y = it.y; w.w = it.w;
      if (!w.rolled) w.h = it.h;
    }
    persist();
  });
}

// ---- live updates ----
function refresh() {
  if (!mounted?.root.isConnected) { teardown(); return; }
  for (const node of mounted.nodes.values()) if (!node.w.rolled) drawBody(node);
}

function tick() {
  if (!mounted?.root.isConnected) { teardown(); return; }
  if (document.visibilityState !== 'visible') return;
  const now = new Date();
  const minute = now.toISOString().slice(0, 16);
  const day = now.toDateString();
  const newMinute = minute !== lastMinute;
  const newDay = day !== lastDay;
  lastMinute = minute;
  lastDay = day;
  for (const node of mounted.nodes.values()) {
    if (node.w.rolled) continue;
    const tk = node.def.tick;
    if (newDay || (tk === 'minute' && newMinute) || (tk === 'second' && (node.w.opts.seconds || newMinute))) drawBody(node);
  }
}

// ---- changes ----
export function rerender() {
  const root = mounted?.root || document.querySelector('.bridge-view');
  if (!root?.isConnected) return;
  const y = window.scrollY;
  const focusKey = document.activeElement?.dataset?.fk;
  root.replaceChildren();
  renderBridge(root).then(() => {
    window.scrollTo(0, y);
    const el = focusKey && root.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (el) focusControl(el).catch(() => {});
  });
}

function change(fn, { redraw = true } = {}) {
  fn(board);
  board = cleanBoard(board);
  persist();
  if (redraw) rerender();
}

function roll(id) {
  const w = board.widgets.find((x) => x.id === id);
  if (!w) return;
  w.rolled = !w.rolled;
  persist();
  const node = mounted?.nodes.get(id);
  if (!node) return;
  node.el.toggleAttribute('data-rolled', w.rolled);
  if (!w.rolled) drawBody(node); else node.body.replaceChildren();
  drawTools(node);
  if (grid && node.item) {
    grid.update(node.item, { h: w.rolled ? rolledRows() : w.h, minH: w.rolled ? 1 : WIDGETS[w.type].size.minH, noResize: w.rolled });
  }
}

function movePhone(id, step) {
  change((b) => {
    const order = phoneOrder();
    const i = order.indexOf(id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    b.phone.order = order;
  });
}

function togglePhoneHidden(id) {
  change((b) => {
    b.phone.hidden = b.phone.hidden.includes(id) ? b.phone.hidden.filter((x) => x !== id) : [...b.phone.hidden, id];
  });
}

function addWidget(type) {
  const def = WIDGETS[type];
  const cols = board.dials.cols;
  const w = Math.min(cols, Math.max(1, Math.round(def.size.w * cols / BASE_COLS)));
  const bottom = board.widgets.reduce((m, x) => Math.max(m, x.y + (x.rolled ? rolledRows() : x.h)), 0);
  const id = newId();
  change((b) => {
    b.widgets.push({ id, type, title: '', tint: 'none', rolled: false, opts: cleanOpts(type, {}), x: 0, y: bottom, w, h: def.size.h });
    b.phone.order = [id, ...phoneOrder()];
  });
  toast(t('bridge.added', { title: t(`bridge.widgets.${type}.name`) }));
  setTimeout(() => document.querySelector(`.bw[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }), 300);
}

function removeWidget(id) {
  change((b) => {
    b.widgets = b.widgets.filter((x) => x.id !== id);
    b.phone.order = b.phone.order.filter((x) => x !== id);
    b.phone.hidden = b.phone.hidden.filter((x) => x !== id);
  });
}

// ---- dialogs (tabs in the side pane on a wide screen) ----
function openCatalogue() {
  const counts = (type) => board.widgets.filter((x) => x.type === type).length;
  const body = h('div', { class: 'bw-catalogue' });
  const draw = () => { body.replaceChildren(); put(body,
    h('p', { class: 'note' }, t('bridge.catalogue.intro')),
    GROUPS.map((g) => h('section', {},
      h('h3', {}, t(`bridge.groups.${g}`)),
      h('ul', { class: 'list' }, Object.entries(WIDGETS).filter(([, def]) => def.group === g).map(([type]) => h('li', {},
        h('div', { class: 'row-main bw-cat-text' },
          h('span', {}, t(`bridge.widgets.${type}.name`), counts(type) > 0 && h('span', { class: 'meta' }, t('bridge.catalogue.on_board', { n: counts(type) }))),
          h('small', {}, t(`bridge.widgets.${type}.about`))),
        button(t('bridge.catalogue.add'), { class: 'small', 'data-fk': `add-${type}`, 'aria-label': t('bridge.catalogue.add_named', { title: t(`bridge.widgets.${type}.name`) }), onclick: () => addWidget(type) }))))))); };
  const dlg = openDialog(t('bridge.catalogue.title'), body, { key: 'bridge-catalogue', wide: true });
  followBoard(body, draw, dlg);
  draw();
}

function widgetOptions(id) {
  const w = board.widgets.find((x) => x.id === id);
  if (!w) return;
  const def = WIDGETS[w.type];
  const label = (k) => t(`bridge.widgets.${w.type}.opts.${k}`);
  const choice = (k, v) => t(`bridge.choice.${k}.${v}`);
  openForm({
    title: t('bridge.options.title', { title: titleOf(w) }),
    note: t(`bridge.widgets.${w.type}.about`),
    values: { title: w.title, tint: w.tint, ...w.opts },
    fields: [
      { name: 'title', label: t('bridge.options.name'), placeholder: t(`bridge.widgets.${w.type}.name`), hint: t('bridge.options.name_hint') },
      { name: 'tint', label: t('bridge.options.tint'), type: 'select', options: CHOICES.tint.map((v) => [v, choice('tint', v)]) },
      ...def.opts.map((o) => (o.type === 'bool'
        ? { name: o.k, label: label(o.k), type: 'checkbox' }
        : { name: o.k, label: label(o.k), type: 'select', options: o.values.map((v) => [v, choice(o.k, v)]) })),
    ],
    saveLabel: t('bridge.options.save'),
    onSave: (out) => {
      change((b) => {
        const x = b.widgets.find((y) => y.id === id);
        if (!x) return;
        x.title = out.title;
        x.tint = out.tint;
        x.opts = cleanOpts(x.type, out);
      });
    },
    onDelete: () => removeWidget(id),
  });
}

function boardCode() {
  const json = JSON.stringify({ dials: board.dials, widgets: board.widgets, phone: board.phone });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `XB1-${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function decodeBoard(code) {
  const m = /^XB1-([A-Za-z0-9_-]+)$/.exec(String(code || '').trim());
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const raw = JSON.parse(json);
    return raw && Array.isArray(raw.widgets) ? cleanBoard({ ...raw, made: true }) : null;
  } catch { return null; }
}

function openBoardSettings() {
  const body = h('div', { class: 'panel bw-settings' });
  const draw = () => {
    const d = board.dials;
    const set = (k, v) => change((b) => { b.dials[k] = v; }, { redraw: true });
    const pick = (k, values, labelKey = k) => {
      const id = `bs-${k}`;
      return field(t(`bridge.settings.${labelKey}`), select(values.map((v) => [String(v), t(`bridge.choice.${k}.${v}`)]), {
        id, 'data-fk': id, value: String(d[k]), onchange: (e) => set(k, k === 'cols' ? Number(e.target.value) : e.target.value),
      }), t(`bridge.settings.${labelKey}_hint`), { half: true });
    };
    const dial = (k, min, max, step, fmt) => {
      const id = `bs-${k}`;
      const out = h('output', { for: id }, fmt(d[k]));
      const input = h('input', { type: 'range', id, 'data-fk': id, min, max, step, value: d[k] });
      input.addEventListener('input', () => { out.textContent = fmt(Number(input.value)); });
      input.addEventListener('change', () => set(k, Number(input.value)));
      return h('div', { class: 'dial' }, h('label', { for: id }, t(`bridge.settings.${k}`)), input, out);
    };
    const toggle = (k) => {
      const id = `bs-${k}`;
      return field(t(`bridge.settings.${k}`), checkbox({ id, 'data-fk': id, checked: d[k], onchange: (e) => set(k, e.target.checked) }), t(`bridge.settings.${k}_hint`));
    };
    const code = boardCode();
    const paste = h('input', { type: 'text', class: 'code', 'aria-label': t('bridge.settings.paste_label'), placeholder: 'XB1-…', autocomplete: 'off', spellcheck: 'false' });
    let armed = false;
    const reset = button(t('bridge.settings.reset'), { variant: 'danger' });
    reset.addEventListener('click', () => {
      if (!armed) { armed = true; reset.textContent = t('bridge.settings.reset_confirm'); return; }
      change((b) => { b.made = false; b.widgets = []; b.phone = { order: [], hidden: [] }; });
      toast(t('bridge.settings.reset_done'));
    });
    body.replaceChildren();
    put(body,
      h('section', {}, h('h3', {}, t('bridge.settings.screen')),
        h('div', { class: 'fields' }, pick('start', CHOICES.start), pick('cols', COLS))),
      h('section', {}, h('h3', {}, t('bridge.settings.space')),
        dial('row', 1, 5, 0.25, (v) => `${v} rem`),
        dial('gap', 0, 2, 0.125, (v) => `${v} rem`),
        dial('scale', 60, 150, 5, (v) => `${v}%`)),
      h('section', {}, h('h3', {}, t('bridge.settings.look')),
        h('div', { class: 'fields' }, pick('chrome', CHOICES.chrome), pick('head', CHOICES.head), pick('titleFont', CHOICES.titleFont), pick('inner', CHOICES.inner))),
      h('section', {}, h('h3', {}, t('bridge.settings.behaviour')),
        toggle('lock'), toggle('float'), toggle('animate')),
      h('section', {}, h('h3', {}, t('bridge.settings.code')),
        h('p', { class: 'hint' }, t('bridge.settings.code_hint')),
        h('textarea', { class: 'code', readonly: true, rows: 3, 'aria-label': t('bridge.settings.code_label'), value: code }),
        h('div', { class: 'row' },
          button(t('bridge.settings.copy'), { onclick: () => navigator.clipboard.writeText(code).then(() => toast(t('bridge.settings.copied')), () => toast(t('bridge.settings.copy_failed'), 'bad')) })),
        h('form', {
          class: 'quick',
          onsubmit: (e) => {
            e.preventDefault();
            const next = decodeBoard(paste.value);
            if (!next) { toast(t('bridge.settings.bad_code'), 'bad'); return; }
            board = next;
            persist();
            rerender();
            toast(t('bridge.settings.applied'));
          },
        }, paste, button(t('bridge.settings.apply'), { type: 'submit' }))),
      h('section', {}, h('h3', {}, t('bridge.settings.start_again')), h('p', { class: 'hint' }, t('bridge.settings.reset_hint')), h('div', { class: 'row' }, reset)));
  };
  const dlg = openDialog(t('bridge.board_settings'), body, { key: 'bridge-settings', wide: true });
  followBoard(body, draw, dlg);
  draw();
}

// Re-place the board when the window crosses the phone width.
WIDE.addEventListener('change', () => { if (mounted?.root.isConnected) rerender(); });
