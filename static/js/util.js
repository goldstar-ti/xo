// Small helpers: DOM building, dates, toasts, dialogs.
import { button, checkbox, field, focusControl, input, notice, select, textarea } from './ui.js';
import { t } from './text.js';

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
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return `in ${n} days`;
  if (n < 0) return `${-n} days ago`;
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
export function openDialog(title, body, { wide = false } = {}) {
  const dlg = h('dialog', { class: wide ? 'sheet wide' : 'sheet' });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'sheet-head' }, h('h2', {}, title), button(t('common.close'), { onclick: close })),
    body,
  );
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
export const dialogOpen = () => !!document.querySelector('dialog[open]');

/**
 * A form in a dialog.
 * fields: [{ name, label, type: text|textarea|date|time|number|select|checkbox, options, hint, required, placeholder }]
 */
export function openForm({ title, fields, values = {}, saveLabel = t('common.save'), onSave, onDelete, note }) {
  const inputs = {};
  const rows = fields.map((f) => {
    const id = `f-${f.name}`;
    const v = values[f.name];
    let control;
    if (f.type === 'textarea') control = textarea({ id, rows: f.rows || 3, placeholder: f.placeholder, value: v ?? '' });
    else if (f.type === 'select') control = select(f.options, { id, value: v ?? f.options[0][0] });
    else if (f.type === 'checkbox') control = checkbox({ id, checked: !!v });
    else
      control = input({
        id, type: f.type || 'text', value: v ?? '', placeholder: f.placeholder, required: f.required,
        min: f.type === 'number' ? 0 : null, step: f.step, inputmode: f.type === 'number' ? 'decimal' : null,
        autocomplete: 'off',
      });
    inputs[f.name] = control;
    return field(f.label, control, f.hint, { half: f.half });
  });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const del = onDelete && button(t('common.delete'), { variant: 'danger' });
  const save = button(saveLabel, { variant: 'primary', type: 'submit', class: 'tw:ml-auto' });
  const form = h('form', { class: 'form' }, note && h('p', { class: 'note' }, note), h('div', { class: 'fields' }, rows), error,
    h('div', { class: 'form-actions' }, del, save));
  const dlg = openDialog(title, form);
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
      if (f.type === 'checkbox') out[f.name] = el.checked;
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
  const firstField = fields.find((f) => f.type !== 'checkbox' && f.type !== 'select');
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
