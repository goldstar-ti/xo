// Small helpers: DOM building, dates, toasts, dialogs.
import { button, checkbox, field, focusControl, input, notice, select } from './ui.js';
import { t } from './text.js';
import { openPopover } from './popover.js';
import { icon, paintIcon, parseIcon } from './icons.js';
import { openIconPicker } from './iconpicker.js';
import { mdEditor, mdField } from './mdeditor.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked') el.checked = true;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (value !== undefined) el.value = value; // after children, so <select> works
  return el;
}

// Like element.append, but takes nested arrays and skips null/false/''.
export function put(parent, ...kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    parent.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return parent;
}

// ---- dates (all local time) ----
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const today = () => ymd(new Date());
export function toDate(day, time = '00:00') {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}
export function addDays(day, n) {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
export const addMinutes = (date, n) => new Date(date.getTime() + n * 60000);

const DAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const LONG = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDay = (day) => DAY.format(toDate(day)).replace(',', '');
export const fmtLong = (day) => LONG.format(toDate(day)).replace(',', '');
export function fmtTime(time) {
  if (!time) return '';
  const d = typeof time === 'string' ? toDate('2000-01-01', time) : time;
  if (window.XOLook?.prefs.clock24) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const hr = d.getHours() % 12 || 12;
  return `${hr}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}
export function relDay(day) {
  const n = daysBetween(today(), day);
  if (n === 0) return t('common.rel.today');
  if (n === 1) return t('common.rel.tomorrow');
  if (n === -1) return t('common.rel.yesterday');
  if (n > 1 && n < 7) return t('common.rel.in_days', { n });
  if (n < 0) return t('common.rel.days_ago', { n: -n });
  return fmtDay(day);
}
export function fmtDuration(mins) {
  mins = Math.max(0, Math.round(mins));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60), rest = mins % 60;
  if (hrs >= 24) return `${Math.floor(hrs / 24)} d ${hrs % 24} h`;
  return rest ? `${hrs} h ${rest} min` : `${hrs} h`;
}
export const fmtMoney = (n) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n) || 0);

export const uid = () => crypto.randomUUID();

// ---- toast ----
let toastTimer;
export function toast(text, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.replaceChildren(notice(text, kind));
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), kind === 'bad' ? 6000 : 2600);
}

// ---- dialogs ----
export function openDialog(title, body, { wide = false, form = false } = {}) {
  const dlg = h('dialog', { class: ['sheet', wide && 'wide', form && 'form-sheet'].filter(Boolean).join(' ') });
  const close = () => dlg.close();
  // A form sheet has Cancel on the left, the title in the middle and a spacer on the right; the others keep Close on the right.
  const head = form
    ? h('div', { class: 'sheet-head' },
      h('button', { type: 'button', class: 'sheet-cancel', onclick: close }, icon('tabler/x'), t('common.cancel')),
      h('h2', {}, title), h('span', { class: 'sheet-gap', 'aria-hidden': 'true' }))
    : h('div', { class: 'sheet-head' }, h('h2', {}, title), button(t('common.close'), { onclick: close }));
  dlg.append(head, form ? h('div', { class: 'sheet-body' }, body) : body);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
// A modal dialog or an open form popover counts; a non-form popover (Widgets) does not.
export const dialogOpen = () => !!document.querySelector('dialog[open]:modal, dialog.xo-pop[open][data-form]');

// The button that was last pressed, so a form opened from it can sit beside it.
let lastPress = null;
document.addEventListener('pointerdown', (e) => { lastPress = e.target.closest?.('button, a, summary, [role="button"]') || null; }, true);
const formAnchor = () => {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected && a.closest('button, a, summary, [role="button"]')) return a;
  return lastPress?.isConnected ? lastPress : null;
};

/**
 * A form in a popover beside `anchor` (the button that opened it when none is given; centred when there is none).
 * A dialog sheet is used only on a phone, or when a modal dialog is already open.
 * fields: [{ name, label, type: text|textarea|date|time|number|select|checkbox|icon|custom, options, hint, required, placeholder, half, more }]
 * A custom field has build(value) returning { node, read }; read() gives its value on save, and filled(value) may say
 * whether the value counts as set. A field with more: true sits under "More options", which opens when one is set.
 */
export function openForm({ title, fields, values = {}, saveLabel = t('common.save'), onSave, onDelete, note, anchor }) {
  const modalOpen = !!document.querySelector('dialog:modal');
  // A phone keeps the full-screen form sheet; a desktop form is a popover.
  const usePop = !modalOpen && !window.matchMedia('(max-width: 39.99rem)').matches;
  if (anchor === undefined) anchor = usePop ? formAnchor() : null;
  const inputs = {};
  const rowOf = (f) => {
    const id = `f-${f.name}`;
    const v = values[f.name];
    let control;
    if (f.type === 'icon') {
      let value = v || '';
      const ico = icon(value || 'squares-four');
      const nameEl = h('span', {});
      const btn = h('button', { type: 'button', class: 'xo-iconfield-btn', 'aria-haspopup': 'dialog' }, ico, nameEl);
      const clear = button(t('canvas.icon_clear'), { variant: 'ghost', type: 'button' });
      const sync = () => {
        const shown = value ? parseIcon(value).name.replace(/-/g, ' ') : t('canvas.icon_none');
        nameEl.textContent = shown;
        btn.setAttribute('aria-label', t('canvas.icon_button', { label: f.label, name: shown }));
        ico.hidden = !value;
        if (value) paintIcon(ico, value);
        clear.hidden = !value;
      };
      btn.addEventListener('click', () => openIconPicker(btn, {
        value, def: 'squares-four', title: inputs.title?.value?.trim() || f.label,
        onpick: (picked) => { value = picked || ''; sync(); },
      }));
      sync();
      clear.addEventListener('click', () => { value = ''; sync(); });
      inputs[f.name] = { read: () => value };
      return h('fieldset', { class: 'field' }, h('legend', {}, f.label), h('div', { class: 'xo-iconfield' }, btn, clear));
    }
    if (f.type === 'custom') {
      const built = f.build(v);
      inputs[f.name] = built;
      return h('fieldset', { class: ['field', f.half && 'half'].filter(Boolean).join(' ') }, h('legend', {}, f.label), built.node, f.hint && h('small', {}, f.hint));
    }
    if (f.type === 'textarea') {
      // A long text box is the Markdown editor: it has its own Dictate button, and its node reads like a textarea.
      const ed = mdEditor({ id, rows: f.rows || 3, value: v ?? '', label: f.label });
      inputs[f.name] = ed.node;
      return mdField(f.label, ed, f.hint, { half: f.half });
    }
    if (f.type === 'select') control = select(f.options, { id, value: v ?? f.options[0][0] });
    else if (f.type === 'checkbox') control = checkbox({ id, checked: !!v });
    else
      control = input({
        id, type: f.type || 'text', value: v ?? '', placeholder: f.placeholder, required: f.required,
        min: f.type === 'number' ? 0 : null, step: f.step, inputmode: f.type === 'number' ? 'decimal' : null,
        autocomplete: 'off',
      });
    inputs[f.name] = control;
    const row = field(f.label, control, f.hint, { half: f.half });
    return row;
  };
  const mainRows = fields.filter((f) => !f.more).map(rowOf);
  const moreFields = fields.filter((f) => f.more);
  const isSet = (f) => {
    const v = values[f.name];
    if (f.filled) return !!f.filled(v);
    return Array.isArray(v) ? v.length > 0 : !!v;
  };
  const moreBlock = moreFields.length > 0 && h('details', { class: 'tw:mt-3', open: moreFields.some(isSet) },
    h('summary', {}, t('forms.more')), h('div', { class: 'fields' }, moreFields.map(rowOf)));
  const error = h('p', { class: 'form-error', role: 'alert' });
  const del = onDelete && button(t('common.delete'), { variant: 'danger' });
  const save = button(saveLabel, { variant: 'primary', type: 'submit', class: 'tw:ml-auto' });
  const cancel = usePop && button(t('common.cancel'), { variant: 'ghost', onclick: () => dlg.close() });
  const form = h('form', { class: 'form' }, note && h('p', { class: 'note' }, note), h('div', { class: 'fields' }, mainRows), moreBlock, error,
    h('div', { class: 'form-actions' }, del, cancel, save));
  const dlg = usePop ? openPopover({ title, body: form, anchor, form: true }) : openDialog(title, form, { form: true });
  if (del) {
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) { armed = true; del.textContent = t('common.delete_confirm'); return; }
      await onDelete();
      dlg.close();
    });
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const el = inputs[f.name];
      if (f.type === 'custom' || f.type === 'icon') out[f.name] = el.read();
      else if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? 0 : Number(el.value);
      else out[f.name] = el.value.trim();
    }
    save.disabled = true;
    try {
      const problem = await onSave(out);
      if (typeof problem === 'string') { error.textContent = problem; return; }
      dlg.close();
    } catch (err) {
      error.textContent = err.message || t('common.not_saved');
    } finally {
      save.disabled = false;
    }
  });
  const firstField = fields.find((f) => !f.more && !['checkbox', 'select', 'custom', 'icon'].includes(f.type));
  if (firstField && !values[fields[0].name]) focusControl(inputs[firstField.name]);
  return dlg;
}

// Turns phone numbers inside free text into tap-to-call links.
export function withPhoneLinks(text) {
  const out = [];
  const re = /(\+?\d[\d ]{6,}\d)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h('a', { href: `tel:${m[1].replace(/\s+/g, '')}` }, m[1]));
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---- a tiny key-value store in IndexedDB: two flags the service worker reads (`details`, `clock24`) ----
function kvDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('xo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function kvTx(mode, fn) {
  const d = await kvDb();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction('kv', mode).objectStore('kv'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export const kvSet = (k, v) => kvTx('readwrite', (s) => s.put(v, k));
export const kvClear = () => kvTx('readwrite', (s) => s.clear());
