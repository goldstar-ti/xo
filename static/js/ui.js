// Kit-aware controls. Every screen builds its buttons, fields and chips here, so the Kit
// choice in Appearance (xo, daisy or wa) changes them all at once. Whichever kit is active,
// each control has the usual .value / .checked and fires the usual input / change / click
// events, so callers never need to know which one they got.
//
// Tailwind compiles only the classes it finds written out in full under static/, so every
// daisyUI class below is a complete literal string. Never build one from pieces.
import { t } from './text.js';
import { icon } from './icons.js';
import { h } from './util.js';

export const kit = () => document.documentElement.dataset.kit || 'xo';

const join = (...parts) => parts.filter(Boolean).join(' ');

// variant: 'primary' | 'ghost' (default) | 'danger' | 'row'. attrs: type (default 'button'), onclick, class, anything else.
// 'row' is a whole list row that acts as a button: no button look in XO or daisyUI (app.css styles .row-main),
// a plain Web Awesome button in wa. label may be a node or a list of nodes.
export function button(label, { variant = 'ghost', type = 'button', ...attrs } = {}) {
  const k = kit();
  if (variant === 'row') {
    if (k === 'wa') return h('wa-button', { ...attrs, type, variant: 'neutral', appearance: 'plain' }, label);
    return h('button', { ...attrs, type }, label);
  }
  if (k === 'wa') {
    const wa = { primary: ['brand', 'accent'], ghost: ['neutral', 'outlined'], danger: ['danger', 'outlined'] }[variant];
    return h('wa-button', { ...attrs, type, variant: wa[0], appearance: wa[1] }, label);
  }
  if (k === 'daisy') {
    const cls = {
      primary: 'tw:btn tw:btn-primary',
      ghost: 'tw:btn tw:btn-outline',
      danger: 'tw:btn tw:btn-outline tw:btn-error',
    }[variant];
    return h('button', { ...attrs, type, class: join(cls, attrs.class) }, label);
  }
  const cls = { primary: 'primary', ghost: 'ghost', danger: 'ghost danger' }[variant];
  return h('button', { ...attrs, type, class: join(cls, attrs.class) }, label);
}

// A one-line text, number, date, time or password input.
export function input(attrs = {}) {
  const k = kit();
  if (k === 'wa') return h('wa-input', attrs);
  if (k === 'daisy') return h('input', { ...attrs, class: join('tw:input tw:w-full', attrs.class) });
  return h('input', attrs);
}

export function textarea(attrs = {}) {
  const k = kit();
  if (k === 'wa') return h('wa-textarea', attrs);
  if (k === 'daisy') return h('textarea', { ...attrs, class: join('tw:textarea tw:w-full', attrs.class) });
  return h('textarea', attrs);
}

// options: [[value, label], ...]. Set the starting choice with attrs.value.
// An entry may also be a group: [groupLabel, [[value, label], ...]]. A native or daisyUI select
// draws a real group; Web Awesome's select cannot, so there each option reads "Label (Group)".
export function select(options, attrs = {}) {
  const k = kit();
  const isGroup = (o) => Array.isArray(o[1]);
  if (k === 'wa') {
    const flat = options.flatMap((o) => (isGroup(o) ? o[1].map(([value, label]) => [value, `${label} (${o[0]})`]) : [o]));
    return h('wa-select', attrs, flat.map(([value, label]) => h('wa-option', { value }, label)));
  }
  const one = ([value, label]) => h('option', { value }, label);
  const opts = options.map((o) => (isGroup(o) ? h('optgroup', { label: o[0] }, o[1].map(one)) : one(o)));
  if (k === 'daisy') return h('select', { ...attrs, class: join('tw:select tw:w-full', attrs.class) }, opts);
  return h('select', attrs, opts);
}

// A colour picker. Always the browser's own: Web Awesome's text input cannot pick a colour.
export function colour(attrs = {}) {
  return h('input', { ...attrs, type: 'color', class: join('colour-input', attrs.class) });
}

// A tick box with no label of its own: wrap it in field() or pass aria-label.
export function checkbox(attrs = {}) {
  const k = kit();
  if (k === 'wa') return h('wa-checkbox', attrs);
  if (k === 'daisy') return h('input', { ...attrs, type: 'checkbox', class: join('tw:checkbox', attrs.class) });
  return h('input', { ...attrs, type: 'checkbox' });
}

// A choice chip that is either pressed or not. The caller redraws when it changes.
export function chip(label, { pressed = false, onclick, ...attrs } = {}) {
  const k = kit();
  const state = { 'aria-pressed': String(!!pressed), onclick };
  if (k === 'wa') {
    const el = h('wa-tag', { ...attrs, ...state, role: 'button', tabindex: '0', variant: pressed ? 'brand' : 'neutral', appearance: pressed ? 'filled' : 'outlined' }, label);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    return el;
  }
  if (k === 'daisy') {
    const cls = pressed ? 'tw:badge tw:badge-lg tw:badge-primary tw:min-h-10 tw:cursor-pointer' : 'tw:badge tw:badge-lg tw:badge-outline tw:min-h-10 tw:cursor-pointer';
    return h('button', { ...attrs, ...state, type: 'button', class: join(cls, attrs.class) }, label);
  }
  return h('button', { ...attrs, ...state, type: 'button', class: join('chip', pressed && 'on', attrs.class) }, label);
}

// A labelled control with an optional hint. opts.half puts it in half a row of a .fields grid.
// The control's own id (set it in its attrs) ties the label to it.
export function field(label, control, hint, { half = false } = {}) {
  const k = kit();
  const isCheck = control.type === 'checkbox' || control.localName === 'wa-checkbox';
  const cls = join('field', half && 'half', isCheck && 'check', k === 'daisy' && 'tw:fieldset');
  if (k === 'wa') {
    if (isCheck) control.append(label);
    else control.setAttribute('label', label);
    if (hint) control.setAttribute('hint', hint);
    return h('div', { class: cls }, control);
  }
  const small = hint && h('small', { class: k === 'daisy' ? 'tw:label' : null }, hint);
  if (isCheck) return h('label', { class: cls }, control, h('span', {}, label), small);
  return h('div', { class: cls }, h('label', { for: control.id || null, class: k === 'daisy' ? 'tw:label' : null }, label), control, small);
}

// A highlighted note with an optional icon. kind: 'brand' (default) | 'warning' | 'neutral' | 'danger'.
// body is a string or nodes; ic is an icon value for icon(), e.g. 'tabler/info-circle'.
const CALLOUT = {
  brand: { wa: 'brand', daisy: 'tw:alert tw:alert-info' },
  warning: { wa: 'warning', daisy: 'tw:alert tw:alert-warning' },
  neutral: { wa: 'neutral', daisy: 'tw:alert' },
  danger: { wa: 'danger', daisy: 'tw:alert tw:alert-error' },
};
export function callout(body, { kind = 'brand', icon: ic = null } = {}) {
  const k = kit();
  const m = CALLOUT[kind] || CALLOUT.brand;
  const nodes = Array.isArray(body) ? body : [body];
  if (k === 'wa') return h('wa-callout', { variant: m.wa }, ic ? h('span', { slot: 'icon' }, icon(ic)) : null, ...nodes);
  const text = h('div', { class: 'callout-body' }, ...nodes);
  if (k === 'daisy') return h('div', { role: 'alert', class: join('callout', kind, m.daisy) }, ic ? icon(ic) : null, text);
  return h('div', { class: join('callout', kind) }, ic ? icon(ic) : null, text);
}

// The message inside the toast. kind is '' or 'bad'. XO keeps plain text in its own box, so
// only Web Awesome and daisyUI wrap it in a callout.
export function notice(text, kind = '') {
  if (kit() === 'xo') return document.createTextNode(text);
  return callout(text, { kind: kind === 'bad' ? 'danger' : 'brand' });
}

// A status pill. kind: 'accent' (default) | 'neutral' | 'warning' | 'danger' | 'success'.
const TAG = {
  accent: { wa: 'brand', daisy: 'tw:badge tw:badge-soft tw:badge-primary' },
  neutral: { wa: 'neutral', daisy: 'tw:badge tw:badge-soft' },
  warning: { wa: 'warning', daisy: 'tw:badge tw:badge-soft tw:badge-warning' },
  danger: { wa: 'danger', daisy: 'tw:badge tw:badge-soft tw:badge-error' },
  success: { wa: 'success', daisy: 'tw:badge tw:badge-soft tw:badge-success' },
};
export function tag(text, kind = 'accent') {
  const k = kit();
  const m = TAG[kind] || TAG.accent;
  if (k === 'wa') return h('wa-tag', { pill: true, size: 'small', variant: m.wa }, text);
  if (k === 'daisy') return h('span', { class: join('tag', kind, m.daisy) }, text);
  return h('span', { class: join('tag', kind) }, text);
}

// A progress bar. value is a fraction from 0 to 1 (not a percentage); label is its accessible name.
export function progress(value, label) {
  const k = kit();
  const pct = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
  if (k === 'wa') return h('wa-progress-bar', { value: pct, label });
  return h('progress', { max: 100, value: pct, 'aria-label': label, class: join('xo-progress', k === 'daisy' && 'tw:progress tw:progress-primary tw:w-full') });
}

// A list row that is a link: leaf icon, title, one muted line, and a chevron at the end.
export function linkRow({ icon: ic, title, sub, href } = {}) {
  return h('a', { class: 'link-row', href },
    ic ? icon(ic, 'link-row-ico') : null,
    h('span', { class: 'link-row-text' }, h('span', { class: 'link-row-title' }, title), sub ? h('span', { class: 'link-row-sub' }, sub) : null),
    icon('tabler/chevron-right', 'link-row-go'));
}

// The real text field inside a control. Web Awesome keeps it in an open shadow root; the other kits' controls are the field.
export const nativeField = (el) => el.shadowRoot?.querySelector('textarea, input') || el;

// Focuses a control. A Web Awesome one is loaded lazily and draws its inner field a moment
// later, so wait for that first.
export async function focusControl(el) {
  if (el.localName.startsWith('wa-')) {
    await customElements.whenDefined(el.localName);
    await el.updateComplete;
  }
  el.focus();
}

// ---- Appearance components -------------------------------------------------------------
// Each is drawn three ways. A value-holding one has .value (or .checked / .open) and calls its
// callback with the new value, whichever kit is active.

const uid = (() => { let n = 0; return (p) => `${p}${++n}`; })();

// A labelled wrapper for the kits that have no label of their own (xo, daisy).
const labelled = (label, control) => h('div', { class: 'xo-ctl' }, label ? h('span', { class: 'xo-ctl-label' }, label) : null, control);

// A radio group built from buttons: one tab stop, arrow keys move and choose.
// make(item, on) returns the button's content and extra attrs. Returns { group, set, get }.
function radioButtons({ label, items, value, onchange, groupClass, btnClass }) {
  let cur = value;
  const group = h('div', { class: groupClass, role: 'radiogroup', 'aria-label': label });
  const btns = items.map((it) => {
    const b = h('button', { type: 'button', role: 'radio', 'data-value': it.value, onclick: () => pick(it.value) }, it.content);
    group.append(b);
    return b;
  });
  const paint = () => items.forEach((it, i) => {
    const on = it.value === cur;
    btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
    btns[i].tabIndex = on || (cur == null && i === 0) ? 0 : -1;
    btns[i].className = btnClass(on);
  });
  function pick(v, fire = true) {
    const changed = v !== cur;
    cur = v;
    paint();
    if (changed && fire) onchange?.(v);
  }
  group.addEventListener('keydown', (e) => {
    const at = btns.indexOf(e.target.closest('button'));
    if (at < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (at + step + items.length) % items.length;
    pick(items[next].value);
    btns[next].focus();
  });
  paint();
  return { group, set: (v) => pick(v, false), get: () => cur };
}

// Gives the wrapper a .value that reads and writes the control's state.
function withValue(el, api) {
  Object.defineProperty(el, 'value', { get: api.get, set: api.set, configurable: true });
  return el;
}

// A short choice drawn as one joined row of buttons. options: [[value, label], ...].
export function segmented(label, options, { value, onchange, ...attrs } = {}) {
  const k = kit();
  if (k === 'wa') {
    const g = h('wa-radio-group', { ...attrs, label, orientation: 'horizontal', class: join('xo-seg-wa', attrs.class) },
      options.map(([v, l]) => h('wa-radio', { value: v, appearance: 'button' }, l)));
    if (value != null) g.setAttribute('value', value);
    g.addEventListener('change', () => onchange?.(g.value));
    return g;
  }
  const daisy = k === 'daisy';
  const r = radioButtons({
    label,
    items: options.map(([v, l]) => ({ value: v, content: l })),
    value,
    onchange,
    groupClass: daisy ? 'xo-seg tw:join' : 'xo-seg',
    btnClass: (on) => (daisy ? (on ? 'tw:btn tw:join-item tw:btn-primary' : 'tw:btn tw:join-item tw:btn-outline') : on ? 'on' : ''),
  });
  return withValue(labelled(label, r.group), r);
}

// An on/off switch with its own label.
export function toggle(label, { checked = false, onchange, ...attrs } = {}) {
  const k = kit();
  if (k === 'wa') {
    const el = h('wa-switch', { ...attrs, checked: checked || null }, label);
    el.addEventListener('change', () => onchange?.(el.checked));
    return el;
  }
  const box = h('input', {
    ...attrs, type: 'checkbox', role: 'switch', checked: checked || null, 'aria-checked': String(!!checked),
    class: join(k === 'daisy' ? 'tw:toggle' : 'xo-switch', attrs.class),
  });
  box.addEventListener('change', () => { box.setAttribute('aria-checked', String(box.checked)); onchange?.(box.checked); });
  const el = h('label', { class: 'xo-toggle' }, box, h('span', {}, label));
  Object.defineProperty(el, 'checked', { get: () => box.checked, set: (v) => { box.checked = !!v; box.setAttribute('aria-checked', String(!!v)); }, configurable: true });
  el.input = box;
  return el;
}

// A small count or tag. kind: '' | 'accent' | 'bad'.
export function badge(text, kind = '') {
  const k = kit();
  if (k === 'wa') return h('wa-badge', { variant: { accent: 'brand', bad: 'danger' }[kind] || 'neutral' }, text);
  if (k === 'daisy') {
    const cls = { accent: 'tw:badge tw:badge-sm tw:badge-primary', bad: 'tw:badge tw:badge-sm tw:badge-error' }[kind] || 'tw:badge tw:badge-sm';
    return h('span', { class: cls }, text);
  }
  return h('span', { class: join('badge', kind) }, text);
}

// A section that opens and closes. body: a node or a list. badge: a node shown beside the title.
export function disclosure(title, body, { open = false, badge: tag = null, id, onToggle } = {}) {
  const k = kit();
  if (k === 'wa') {
    const el = h('wa-details', { id, open: open || null, class: 'xo-disc' },
      h('span', { slot: 'summary', class: 'xo-disc-title' }, title, tag), body);
    el.addEventListener('wa-show', (e) => { if (e.target === el) onToggle?.(true); });
    el.addEventListener('wa-hide', (e) => { if (e.target === el) onToggle?.(false); });
    return el;
  }
  const daisy = k === 'daisy';
  const el = h('details', { id, open: open || null, class: daisy ? 'xo-disc tw:collapse tw:border tw:border-base-300' : 'xo-disc' },
    h('summary', { class: daisy ? 'tw:collapse-title' : null }, h('span', { class: 'xo-disc-title' }, title, tag)),
    h('div', { class: daisy ? 'tw:collapse-content xo-disc-body' : 'xo-disc-body' }, body));
  el.addEventListener('toggle', () => onToggle?.(el.open));
  return el;
}

// A row of big choices, each with a title, one line of help and a small drawn sample.
// cards: [{ value, title, hint, sample }] (sample: a node, optional).
export function optionCards(label, cards, { value, onchange, ...attrs } = {}) {
  const k = kit();
  const daisy = k === 'daisy';
  const inner = (c) => {
    const body = [c.sample ? h('span', { class: 'xo-opt-sample', 'aria-hidden': 'true' }, c.sample) : null,
      h('span', { class: 'xo-opt-title' }, c.title), c.hint ? h('span', { class: 'xo-opt-hint' }, c.hint) : null];
    return k === 'wa' ? h('wa-card', { class: 'xo-opt-card' }, body) : body;
  };
  const r = radioButtons({
    label,
    items: cards.map((c) => ({ value: c.value, content: inner(c) })),
    value,
    onchange,
    groupClass: join('xo-opts', attrs.class),
    btnClass: (on) => join('xo-opt', on && 'on', daisy && 'tw:card tw:border', daisy && (on ? 'tw:border-primary' : 'tw:border-base-300')),
  });
  return withValue(labelled(label, r.group), r);
}

// A one-line search field with a clear button. oninput(text) runs on every change.
export function searchBox({ placeholder = '', oninput, value = '', label, ...attrs } = {}) {
  const k = kit();
  if (k === 'wa') {
    const el = h('wa-input', { ...attrs, type: 'search', 'with-clear': true, placeholder, label: label || null, value });
    el.addEventListener('input', () => oninput?.(el.value));
    return el;
  }
  const box = h('input', {
    ...attrs, type: 'search', placeholder, 'aria-label': label || placeholder, value,
    class: join(k === 'daisy' && 'tw:input tw:w-full', attrs.class),
  });
  const clear = h('button', { type: 'button', class: 'xo-search-x', 'aria-label': t('common.clear'), title: t('common.clear'), hidden: !value || null,
    onclick: () => { box.value = ''; fire(); box.focus(); } }, '×');
  const fire = () => { clear.hidden = !box.value; oninput?.(box.value); };
  box.addEventListener('input', fire);
  const el = h('div', { class: 'xo-search' }, box, clear);
  Object.defineProperty(el, 'value', { get: () => box.value, set: (v) => { box.value = v; clear.hidden = !v; }, configurable: true });
  el.input = box;
  return el;
}

// A font chooser. fonts: the same list select() takes, groups of [value, label]. A font value
// "g:<slug>|<Family>" is a catalogue font: it loads (through XOLook.ensureFont) only when it is
// chosen or highlighted. mono: the fallback for the sample is a monospace face.
export function fontPicker({ value, fonts = [], onchange, mono = false, label, id } = {}) {
  const k = kit();
  const L = window.XOLook;
  const flat = fonts.flatMap((o) => (Array.isArray(o[1]) ? o[1].map(([v, l]) => [v, l, o[0]]) : [[o[0], o[1], '']]));
  const nameOf = (v) => (flat.find((f) => f[0] === v) || [v, String(v).split('|').pop()])[1];
  const listId = uid('xo-fl');
  let cur = value;
  let active = -1;
  let shown = [];
  const box = k === 'wa'
    ? h('wa-input', { id, label: label || null, value: nameOf(value), autocomplete: 'off' })
    : h('input', { id, type: 'text', 'aria-label': label || null, value: nameOf(value), autocomplete: 'off', class: join(k === 'daisy' && 'tw:input tw:w-full') });
  for (const [a, v] of Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId })) box.setAttribute(a, v);
  const list = h('ul', { class: 'xo-fl-list', role: 'listbox', id: listId, hidden: true });
  const sample = h('p', { class: 'xo-fl-sample' }, t('common.font_sample'));
  const wrap = h('div', { class: 'xo-fl' }, box, list, sample);

  function paintSample(v) {
    L?.ensureFont?.(v);
    sample.style.fontFamily = L?.stackOf ? L.stackOf(v, mono) : '';
  }
  function draw(query) {
    const q = query.trim().toLowerCase();
    shown = flat.filter((f) => !q || f[1].toLowerCase().includes(q) || f[2].toLowerCase().includes(q));
    let lastGroup = null;
    list.replaceChildren(...shown.flatMap((f, i) => {
      const row = h('li', { role: 'option', id: `${listId}-${i}`, 'data-value': f[0], 'aria-selected': f[0] === cur ? 'true' : 'false', onmousedown: (e) => { e.preventDefault(); choose(i); } }, f[1]);
      const head = f[2] && f[2] !== lastGroup ? h('li', { role: 'presentation', class: 'xo-fl-group' }, f[2]) : null;
      lastGroup = f[2];
      return head ? [head, row] : [row];
    }));
    if (!shown.length) list.append(h('li', { role: 'presentation', class: 'xo-fl-none' }, t('common.no_match')));
    mark(shown.length ? 0 : -1);
  }
  function mark(i) {
    active = i;
    list.querySelectorAll('[role=option]').forEach((o, n) => o.classList.toggle('active', n === i));
    if (i >= 0) {
      const row = list.querySelector(`#${listId}-${i}`);
      box.setAttribute('aria-activedescendant', row.id);
      row.scrollIntoView({ block: 'nearest' });
      paintSample(shown[i][0]);
    } else box.removeAttribute('aria-activedescendant');
  }
  function open(query = '') {
    draw(query);
    list.hidden = false;
    box.setAttribute('aria-expanded', 'true');
  }
  function close(restore = true) {
    list.hidden = true;
    box.setAttribute('aria-expanded', 'false');
    if (restore) { box.value = nameOf(cur); paintSample(cur); }
  }
  function choose(i) {
    if (i < 0 || !shown[i]) return;
    cur = shown[i][0];
    box.value = shown[i][1];
    close(false);
    paintSample(cur);
    onchange?.(cur);
  }
  box.addEventListener('focus', () => { if (list.hidden) open(''); });
  box.addEventListener('input', () => open(box.value));
  box.addEventListener('blur', () => close());
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open('');
      if (shown.length) mark((active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
      if (!list.hidden) { e.preventDefault(); choose(active); }
    } else if (e.key === 'Escape') {
      if (!list.hidden) { e.preventDefault(); close(); }
    }
  });
  paintSample(cur);
  return withValue(wrap, { get: () => cur, set: (v) => { cur = v; box.value = nameOf(v); paintSample(v); } });
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const hexOf = (v) => {
  const m = HEX.exec(String(v || '').trim());
  if (!m) return null;
  const d = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${d.toLowerCase()}`;
};

// A colour: a swatch you can click plus a hex box. value is "#rrggbb". onchange(hex) on a valid change.
export function colourField({ value = '#000000', onchange, label, ...attrs } = {}) {
  const k = kit();
  if (k === 'wa') {
    const el = h('wa-color-picker', { ...attrs, format: 'hex', label: label || null, value: hexOf(value) || '#000000', size: 'small' });
    el.addEventListener('change', () => { const v = hexOf(el.value); if (v) onchange?.(v); });
    return el;
  }
  let cur = hexOf(value) || '#000000';
  const pick = colour({ value: cur, 'aria-label': label || null });
  const text = h('input', { type: 'text', value: cur, maxlength: '7', spellcheck: 'false', 'aria-label': label ? `${label} (hex)` : null, class: join('xo-hex', k === 'daisy' && 'tw:input') });
  pick.addEventListener('change', () => { cur = pick.value; text.value = cur; onchange?.(cur); });
  text.addEventListener('change', () => {
    const v = hexOf(text.value);
    if (!v) { text.value = cur; return; }
    cur = v; pick.value = v; text.value = v; onchange?.(v);
  });
  const el = h('div', { class: 'xo-colour-field' }, pick, text);
  return withValue(el, { get: () => cur, set: (v) => { cur = hexOf(v) || cur; pick.value = cur; text.value = cur; } });
}

// A list the reader can reorder by dragging the handle or with the Up and Down buttons.
// render(item, index) returns the row's content. onmove(from, to, items) runs after each move.
export function sortList(items, { onmove, render, label } = {}) {
  let list = items.slice();
  const ul = h('ul', { class: 'xo-sort', 'aria-label': label || null });
  const btn = (cls, text, name, fn, off) => h('button', { type: 'button', class: `xo-sort-btn ${cls}`, 'aria-label': name, title: name, disabled: off || null, onclick: fn }, text);
  function move(from, to, focus) {
    if (to < 0 || to >= list.length || from === to) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    draw();
    onmove?.(from, to, list.slice());
    if (focus) ul.children[to]?.querySelector(`.${focus}:not(:disabled)`)?.focus();
  }
  function draw() {
    ul.replaceChildren(...list.map((item, i) => {
      const grip = btn('xo-sort-grip', '⋮⋮', t('common.drag'), null);
      const li = h('li', { class: 'xo-sort-row' }, grip, h('div', { class: 'xo-sort-body' }, render ? render(item, i) : String(item)),
        btn('xo-sort-up', '↑', t('common.up'), () => move(i, i - 1, 'xo-sort-up'), i === 0),
        btn('xo-sort-down', '↓', t('common.down'), () => move(i, i + 1, 'xo-sort-down'), i === list.length - 1));
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        li.classList.add('dragging');
        const from = i;
        const over = (ev) => {
          const rows = [...ul.children];
          const hit = rows.find((r) => r !== li && ev.clientY >= r.getBoundingClientRect().top && ev.clientY <= r.getBoundingClientRect().bottom);
          if (!hit) return;
          const after = rows.indexOf(hit) > rows.indexOf(li);
          hit[after ? 'after' : 'before'](li);
        };
        const done = () => {
          grip.removeEventListener('pointermove', over);
          grip.removeEventListener('pointerup', done);
          grip.removeEventListener('pointercancel', done);
          li.classList.remove('dragging');
          const to = [...ul.children].indexOf(li);
          if (to === from) return;
          move(from, to);
        };
        grip.addEventListener('pointermove', over);
        grip.addEventListener('pointerup', done);
        grip.addEventListener('pointercancel', done);
      });
      return li;
    }));
  }
  draw();
  ul.set = (next) => { list = next.slice(); draw(); };
  ul.items = () => list.slice();
  return ul;
}

// A figure: a label and a big value. The Figure style choice in Appearance restyles .figure.
export function stat(label, value) {
  const k = kit();
  if (k === 'daisy') return h('div', { class: 'figure tw:stat tw:p-0' }, h('div', { class: 'tw:stat-title' }, label), h('div', { class: 'tw:stat-value' }, h('strong', {}, value)));
  return h('div', { class: 'figure' }, h('span', { class: 'figure-label' }, label), h('strong', {}, value));
}
