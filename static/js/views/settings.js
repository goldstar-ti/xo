import * as store from '../store.js';
import { h, kvSet, toast, today, put, uid } from '../util.js';
import { button, checkbox, field, focusControl, input, select, textarea } from '../ui.js';
import { t, text } from '../text.js';
import * as lookups from '../lookups.js';
import { allTasks } from '../taskdata.js';
import { pace } from '../tasks.js';
import { actionLabel, actions, clashFor, comboOf, keyFor, keyLabel, resetKeys, saveKey, scopes } from '../keymap.js';
import { FIELD_KINDS, TYPES, allDefs, defs, saveDefs } from '../customfields.js';

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

// The keyboard shortcuts table: pick where, then change, clear or reset each key. Every change saves to settings.keys.
function keysEditor(s) {
  let scope = 'global';
  let recording = null;
  const note = h('p', { class: 'note late', role: 'status' });
  const body = h('tbody');
  const own = (id) => Object.prototype.hasOwnProperty.call(store.settings().keys || {}, id);
  const done = async (fn, focusId) => {
    try {
      await fn();
      s.keys = store.settings().keys || {};
      note.textContent = '';
      toast(t('forms.saved'));
    } catch (err) { toast(err.message, 'bad'); }
    draw(focusId);
  };
  const onDown = (id) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Tab') return;
    if (e.key === 'Escape') { recording = null; note.textContent = ''; draw(id); return; }
    const combo = comboOf(e);
    if (!combo) return;
    const other = clashFor(id, combo);
    if (other) { note.textContent = t('settings.keys.clash', { key: keyLabel(combo), action: actionLabel(other) }); return; }
    recording = null;
    done(() => saveKey(id, combo), id);
  };
  const row = (a) => {
    const name = actionLabel(a.id);
    const change = button(recording === a.id ? t('settings.keys.press') : t('settings.keys.change'), {
      variant: 'row', class: 'kb-change', 'data-action': a.id, 'aria-label': t('settings.keys.change_aria', { action: name }),
      onclick: () => { recording = a.id; note.textContent = ''; draw(a.id); },
    });
    if (recording === a.id) change.addEventListener('keydown', onDown(a.id), { capture: true });
    return h('tr', {},
      h('td', { class: 'text' }, name),
      h('td', {}, h('kbd', {}, keyLabel(keyFor(a.id)))),
      h('td', { class: 'tools' }, change,
        button(t('settings.keys.clear'), { variant: 'row', 'aria-label': t('settings.keys.clear_aria', { action: name }), disabled: !keyFor(a.id), onclick: () => done(() => saveKey(a.id, ''), a.id) }),
        button(t('settings.keys.reset'), { variant: 'row', 'aria-label': t('settings.keys.reset_aria', { action: name }), disabled: !own(a.id), onclick: () => done(() => resetKeys([a.id]), a.id) })));
  };
  function draw(focusId) {
    body.replaceChildren(...actions().filter((a) => a.scope === scope).map(row));
    if (focusId) focusControl(body.querySelector(`[data-action="${focusId}"]`));
  }
  const picker = select(scopes().map((sc) => [sc, t(`settings.keys.scopes.${sc}`)]), { id: 's-key-scope', value: scope, onchange: (e) => { scope = e.target.value; recording = null; note.textContent = ''; draw(); } });
  const reset = button(t('settings.keys.reset_all'), { variant: 'danger' });
  let armed = false;
  reset.addEventListener('click', () => {
    if (!armed) { armed = true; reset.textContent = t('settings.keys.reset_all_confirm'); return; }
    armed = false;
    reset.textContent = t('settings.keys.reset_all');
    done(() => resetKeys(actions().filter((a) => a.scope === scope).map((a) => a.id)));
  });
  draw();
  return h('section', {}, h('h2', {}, t('settings.keys.heading')),
    h('p', { class: 'hint' }, t('settings.keys.hint')),
    field(t('settings.keys.scope'), picker, null, { half: true }),
    note,
    h('table', { class: 'keys-table' }, body),
    h('div', { class: 'row' }, reset));
}

// The custom fields table: pick a kind of record, then edit its fields in place. Every change saves all the definitions.
function fieldsEditor() {
  let kind = FIELD_KINDS[0][0];
  let rows = [];
  let armed = '';
  const body = h('tbody');
  const empty = h('p', { class: 'empty' }, t('settings.fields.empty'));
  const persist = async () => {
    const clean = rows.map((r) => ({ id: r.id, name: r.name.trim() || t('settings.fields.new_name'), type: r.type, options: r.options, show: r.show }));
    try { await saveDefs({ ...allDefs(), [kind]: clean }); toast(t('forms.saved')); } catch (err) { toast(err.message, 'bad'); }
  };
  const move = (i, by, focus) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    draw(focus);
    persist();
  };
  const cell = (...kids) => h('td', { class: 'tw:p-1 tw:align-middle' }, kids);
  const aria = (key, r) => t(`settings.fields.${key}`, { name: r.name });
  function draw(focus) {
    empty.hidden = rows.length > 0;
    body.replaceChildren(...rows.map((r, i) => {
      const isChoice = r.type === 'choice' || r.type === 'choices';
      const removeBtn = button(armed === r.id ? t('settings.fields.remove_confirm') : t('settings.lookups.cross'), {
        variant: 'row', 'data-f': `remove-${r.id}`, 'aria-label': aria('remove_aria', r), title: aria('remove_aria', r),
        onclick: () => {
          if (armed !== r.id) { armed = r.id; draw(`remove-${r.id}`); return; }
          armed = '';
          rows.splice(i, 1);
          draw();
          persist();
        },
      });
      return h('tr', {},
        cell(input({ value: r.name, 'data-f': `name-${r.id}`, 'aria-label': t('settings.fields.name_aria'), onchange: (e) => { r.name = e.target.value; persist(); } })),
        cell(select(TYPES.map((ty) => [ty, t(`fields.types.${ty}`)]), {
          value: r.type, 'data-f': `type-${r.id}`, 'aria-label': t('settings.fields.type'),
          onchange: (e) => { r.type = e.target.value; draw(`type-${r.id}`); persist(); },
        })),
        cell(isChoice && input({
          value: r.options.join(', '), placeholder: t('settings.fields.options_placeholder'), 'aria-label': t('settings.fields.options'),
          onchange: (e) => { r.options = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); persist(); },
        })),
        cell(checkbox({ checked: r.show !== false, 'aria-label': t('settings.fields.show'), onchange: (e) => { r.show = e.target.checked; persist(); } })),
        cell(
          button(t('settings.lookups.up'), { variant: 'row', 'data-f': `up-${r.id}`, 'aria-label': aria('up_aria', r), title: aria('up_aria', r), disabled: i === 0, onclick: () => move(i, -1, `up-${r.id}`) }),
          button(t('settings.lookups.down'), { variant: 'row', 'data-f': `down-${r.id}`, 'aria-label': aria('down_aria', r), title: aria('down_aria', r), disabled: i === rows.length - 1, onclick: () => move(i, 1, `down-${r.id}`) }),
          removeBtn));
    }));
    if (focus) focusControl(body.querySelector(`[data-f="${focus}"]`));
  }
  const load = () => {
    armed = '';
    rows = defs(kind).map((d) => ({ ...d, options: [...(d.options || [])] }));
    draw();
  };
  const picker = select(FIELD_KINDS.map(([k, key]) => [k, t(key)]), { id: 's-field-kind', value: kind, onchange: (e) => { kind = e.target.value; load(); } });
  const add = button(t('settings.fields.add'), { onclick: () => {
    const row = { id: uid(), name: t('settings.fields.new_name'), type: 'text', options: [], show: true };
    rows.push(row);
    armed = '';
    draw(`name-${row.id}`);
    persist();
  } });
  load();
  return h('section', {}, h('h2', {}, t('settings.fields.heading')),
    h('p', { class: 'hint' }, t('settings.fields.hint')),
    field(t('settings.fields.kind'), picker, null, { half: true }),
    h('div', { class: 'tw:overflow-x-auto' }, h('table', { class: 'fields-table tw:w-full' },
      h('thead', {}, h('tr', {}, ['name', 'type', 'options', 'show'].map((c) => h('th', { class: 'tw:text-left tw:p-1' }, t(`settings.fields.${c}`))), h('th', {}))), body)),
    empty,
    h('div', { class: 'row' }, add),
    h('p', { class: 'hint' }, t('settings.fields.removed_note')));
}

function paceLine() {
  const p = pace(allTasks().map((i) => i.data));
  return p.samples >= 5 ? t('settings.tasks.pace', { ratio: p.ratio, n: p.samples }) : t('settings.tasks.pace_none', { n: 5 });
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
    h('section', {}, h('h2', {}, t('settings.tasks.heading')),
      field(t('settings.tasks.stale_days'), input({ id: 's-staleDays', type: 'number', min: '0', value: String(s.staleDays ?? 30), onchange: (e) => saveSettings({ staleDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) }) }), t('settings.tasks.stale_hint'), { half: true }),
      toggle('shutdown', t('settings.tasks.shutdown'), t('settings.tasks.shutdown_hint')),
      h('p', { class: 'note' }, paceLine())),
    keysEditor(s),
    fieldsEditor(),
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
