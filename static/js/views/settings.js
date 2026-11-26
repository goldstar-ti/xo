import * as store from '../store.js';
import { h, kvSet, toast, today, put } from '../util.js';
import { button, checkbox, field, input, select, textarea } from '../ui.js';
import { t, text } from '../text.js';
import * as lookups from '../lookups.js';

export const live = false;

function urlB64ToBytes(text) {
  const padded = (text + '='.repeat((4 - (text.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'on' : 'off';
}

async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(t('settings.push.not_allowed'));
  const { key } = await store.api('GET', '/api/push/key');
  if (!key) throw new Error(t('settings.push.no_keys'));
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) });
  await store.api('POST', '/api/push/subscribe', sub.toJSON());
}

async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await store.api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}

async function exportAll() {
  const rows = await store.api('GET', '/api/items');
  const out = rows.map((row) => ({ id: row.id, kind: row.kind, day: row.day, updated_at: row.updated_at, data: row.payload }));
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), items: out }, null, 2)], { type: 'application/json' });
  const link = h('a', { href: URL.createObjectURL(blob), download: `xo-export-${today()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

// The lookup table: pick a list, then edit its rows in place. Every change saves the whole list
// as the owner's own version; "Go back to the original list" removes it.
function lookupEditor(s, saveSettings) {
  let key = lookups.LOOKUPS[0].key;
  let rows = [];
  const status = h('p', { class: 'note' });
  const body = h('tbody');
  const head = h('thead');
  const table = h('table', { class: 'lookup-table' }, head, body);
  const persist = async () => {
    const clean = rows.map((r) => ({ text: r.text.trim(), group: r.group })).filter((r) => r.text);
    await saveSettings({ lookups: { ...(s.lookups || {}), [key]: clean } });
    status.textContent = t('settings.lookups.own');
  };
  const move = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    draw();
    persist();
  };
  const draw = () => {
    const isGrouped = lookups.grouped(key);
    const groups = Object.entries(lookups.groupNames());
    head.replaceChildren(h('tr', {}, h('th', {}, t('settings.lookups.choice')), isGrouped && h('th', {}, t('settings.lookups.group')), h('th', {})));
    body.replaceChildren(...rows.map((row, i) => h('tr', {},
      h('td', { class: 'text' }, input({ value: row.text, 'aria-label': t('settings.lookups.choice'), onchange: (e) => { row.text = e.target.value; persist(); } })),
      isGrouped && h('td', {}, select(groups, { value: row.group, 'aria-label': t('settings.lookups.group'), onchange: (e) => { row.group = e.target.value; persist(); } })),
      h('td', { class: 'tools' },
        button(t('settings.lookups.up'), { variant: 'row', class: 'lk-up', 'aria-label': t('settings.lookups.move_up'), title: t('settings.lookups.move_up'), disabled: i === 0, onclick: () => move(i, -1) }),
        button(t('settings.lookups.down'), { variant: 'row', class: 'lk-down', 'aria-label': t('settings.lookups.move_down'), title: t('settings.lookups.move_down'), disabled: i === rows.length - 1, onclick: () => move(i, 1) }),
        button(t('settings.lookups.cross'), { variant: 'row', class: 'lk-remove', 'aria-label': t('settings.lookups.remove'), title: t('settings.lookups.remove'), onclick: () => { rows.splice(i, 1); draw(); persist(); } })))));
  };
  const load = () => {
    rows = structuredClone(lookups.rows(key));
    status.textContent = lookups.isOwn(key) ? t('settings.lookups.own') : t('settings.lookups.original');
    draw();
  };
  const picker = select(lookups.LOOKUPS.map((l) => [l.key, t(`settings.lookups.lists.${l.key}`)]), { id: 's-lookup', value: key, onchange: (e) => { key = e.target.value; load(); } });
  const add = button(t('settings.lookups.add'), { onclick: () => {
    const groups = Object.keys(lookups.groupNames());
    rows.push({ text: '', group: lookups.grouped(key) ? (rows.at(-1)?.group || groups[0] || '') : '' });
    draw();
    const last = body.lastElementChild?.querySelector('input, wa-input');
    last?.setAttribute('placeholder', t('settings.lookups.new_choice'));
    // A Web Awesome input renders its inner box a moment later; focus once it has.
    if (last?.updateComplete) last.updateComplete.then(() => last.focus());
    else last?.focus();
  } });
  const reset = button(t('settings.lookups.reset'), { variant: 'danger' });
  let armed = false;
  reset.addEventListener('click', async () => {
    if (!armed) { armed = true; reset.textContent = t('settings.lookups.reset_confirm'); return; }
    armed = false;
    reset.textContent = t('settings.lookups.reset');
    const next = { ...(s.lookups || {}) };
    delete next[key];
    await saveSettings({ lookups: next });
    load();
    toast(t('settings.lookups.reset_done'));
  });
  load();
  return h('section', {}, h('h2', {}, t('settings.lookups.heading')),
    h('p', { class: 'hint' }, t('settings.lookups.hint')),
    field(t('settings.lookups.list'), picker, null, { half: true }),
    status, table,
    h('div', { class: 'row' }, add, reset),
    field(t('settings.lookups.headings'), checkbox({ id: 's-groupHeadings', checked: !!s.groupHeadings, onchange: (e) => saveSettings({ groupHeadings: e.target.checked }) }), t('settings.lookups.headings_hint')));
}

export function render(root) {
  root.replaceChildren();
  const s = store.settings();
  const saveSettings = async (patch) => {
    Object.assign(s, patch);
    try {
      await store.save('settings', 'settings', s, { silent: true });
      await kvSet('details', !!s.details);
      toast(t('forms.saved'));
    } catch (err) { toast(err.message, 'bad'); }
  };

  const pushLine = h('p', { class: 'note' }, t('settings.checking'));
  const pushBtn = button(t('settings.push.turn_on'), { variant: 'primary' });
  const testBtn = button(t('settings.push.test'));
  const drawPush = async () => {
    const state = await pushState().catch(() => 'unsupported');
    pushLine.textContent = t(`settings.push.${state}`);
    pushBtn.textContent = state === 'on' ? t('settings.push.turn_off') : t('settings.push.turn_on');
    pushBtn.hidden = state === 'denied' || state === 'unsupported';
    testBtn.hidden = state !== 'on';
    pushBtn.onclick = async () => {
      pushBtn.disabled = true;
      try { state === 'on' ? await disablePush() : await enablePush(); } catch (err) { toast(err.message, 'bad'); }
      pushBtn.disabled = false;
      drawPush();
    };
  };
  testBtn.onclick = async () => {
    try {
      const r = await store.api('POST', '/api/push/test');
      toast(r.devices ? (r.devices === 1 ? t('settings.push.sent_one') : t('settings.push.sent_many', { n: r.devices })) : t('settings.push.unreachable'), r.devices ? '' : 'bad');
    } catch (err) { toast(err.message, 'bad'); }
  };
  drawPush();

  const time = (name, label) => field(label, input({ id: `s-${name}`, type: 'time', value: s[name], onchange: (e) => e.target.value && saveSettings({ [name]: e.target.value }) }), null, { half: true });
  const toggle = (name, label, hint) => field(label, checkbox({ id: `s-${name}`, checked: !!s[name], onchange: (e) => saveSettings({ [name]: e.target.checked }) }), hint);
  const weekdays = Object.entries(text('forms.weekdays'));

  put(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('settings.heading')), h('div', { class: 'actions' }, h('a', { class: 'ghost', href: '#/appearance' }, t('settings.appearance_link')))),
    h('section', {}, h('h2', {}, t('settings.notifications.heading')), pushLine, h('div', { class: 'row' }, pushBtn, testBtn),
      toggle('details', t('settings.notifications.details'), t('settings.notifications.details_hint'))),
    h('section', {}, h('h2', {}, t('settings.times.heading')),
      h('div', { class: 'fields' }, time('morningAt', t('settings.times.morning')), time('eveningAt', t('settings.times.evening')),
        field(t('settings.times.weekly_day'), select(weekdays, { id: 's-weeklyDay', value: String(s.weeklyDay), onchange: (e) => saveSettings({ weeklyDay: Number(e.target.value) }) }), null, { half: true }),
        time('weeklyAt', t('settings.times.weekly_time')))),
    h('section', {}, h('h2', {}, t('settings.evening.heading')),
      toggle('logSigns', t('settings.evening.log_signs'), t('settings.evening.log_signs_hint'))),
    lookupEditor(s, saveSettings),
    h('section', {}, h('h2', {}, t('settings.guard.heading')),
      toggle('showGuard', t('settings.guard.show'), t('settings.guard.show_hint'))),
    h('section', {}, h('h2', {}, t('settings.lines.heading')),
      h('p', { class: 'hint' }, t('settings.lines.hint')),
      textarea({ rows: 4, value: s.lines, 'aria-label': t('settings.lines.heading'), onchange: (e) => saveSettings({ lines: e.target.value }) })),
    h('section', {}, h('h2', {}, t('settings.data.heading')),
      h('p', { class: 'note' }, t('settings.data.note')),
      h('div', { class: 'row' },
        button(t('settings.data.download'), { onclick: () => exportAll().catch((err) => toast(err.message, 'bad')) }),
        button(t('settings.data.sign_out'), { onclick: () => window.dispatchEvent(new Event('xo:sign-out')) })),
      h('p', { class: 'hint' }, t('settings.data.hint'))),
  );
}
