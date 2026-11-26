// Kit-aware controls. Every screen builds its buttons, fields and chips here, so the Kit
// choice in Appearance (xo, daisy or wa) changes them all at once. Whichever kit is active,
// each control has the usual .value / .checked and fires the usual input / change / click
// events, so callers never need to know which one they got.
//
// Tailwind compiles only the classes it finds written out in full under static/, so every
// daisyUI class below is a complete literal string. Never build one from pieces.
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
      ghost: 'tw:btn tw:btn-ghost',
      danger: 'tw:btn tw:btn-ghost tw:text-danger',
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
export function select(options, attrs = {}) {
  const k = kit();
  if (k === 'wa') return h('wa-select', attrs, options.map(([value, label]) => h('wa-option', { value }, label)));
  const opts = options.map(([value, label]) => h('option', { value }, label));
  if (k === 'daisy') return h('select', { ...attrs, class: join('tw:select tw:w-full', attrs.class) }, opts);
  return h('select', attrs, opts);
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

// The message inside the toast. kind is '' or 'bad'. XO keeps plain text in its own box.
export function notice(text, kind = '') {
  const k = kit();
  if (k === 'wa') return h('wa-callout', { variant: kind === 'bad' ? 'danger' : 'brand' }, text);
  if (k === 'daisy') return h('div', { role: 'alert', class: kind === 'bad' ? 'tw:alert tw:alert-error' : 'tw:alert tw:alert-info' }, text);
  return document.createTextNode(text);
}

// Focuses a control. A Web Awesome one is loaded lazily and draws its inner field a moment
// later, so wait for that first.
export async function focusControl(el) {
  if (el.localName.startsWith('wa-')) {
    await customElements.whenDefined(el.localName);
    await el.updateComplete;
  }
  el.focus();
}
