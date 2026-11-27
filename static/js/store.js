// Talks to the server and works out reminder times for each kind of item.
import { DEFAULT_SETTINGS } from './content.js';
import { addDays, addMinutes, toDate, today } from './util.js';

const items = new Map(); // id -> { id, kind, day, data }
const listeners = new Set();

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XO': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No connection. Nothing was saved.');
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event('xo:signed-out'));
    throw new Error('Signed out. Sign in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong on the server.');
  return data;
}

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export async function load() {
  items.clear();
  // Ticks and check-ins older than five weeks are left on the server.
  const rows = await api('GET', `/api/items?from_day=${addDays(today(), -35)}`);
  for (const row of rows) items.set(row.id, { id: row.id, kind: row.kind, day: row.day, data: row.payload || {} });
}

export const get = (id) => items.get(id);
export const byKind = (kind) => [...items.values()].filter((i) => i.kind === kind);
export const all = () => [...items.values()];

export async function save(kind, id, data, { day = null, silent = false } = {}) {
  const builder = REMINDERS[kind];
  const body = { kind, day, payload: data };
  if (builder) body.reminders = builder(data).filter((r) => r.repeat !== 'none' || new Date(r.fire_at) > new Date());
  await api('PUT', `/api/items/${encodeURIComponent(id)}`, body);
  items.set(id, { id, kind, day, data });
  if (!silent) emit();
}

export async function remove(id) {
  await api('DELETE', `/api/items/${encodeURIComponent(id)}`);
  items.delete(id);
  emit();
}

// Deletes many items at once, in batches the server accepts. Returns how many were deleted.
export async function removeMany(ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    deleted += (await api('POST', '/api/items/bulk-delete', { ids: part })).deleted;
    part.forEach((id) => items.delete(id));
  }
  emit();
  return deleted;
}

// ---- ticks: "did it today" marks for routines and daily conditions ----
export const tickId = (ref, day) => `tick:${ref}:${day}`;
export const isTicked = (ref, day = today()) => items.has(tickId(ref, day));
export async function setTick(ref, on, day = today()) {
  const id = tickId(ref, day);
  if (on) {
    await api('PUT', `/api/items/${id}`, { kind: 'tick', day, payload: null });
    items.set(id, { id, kind: 'tick', day, data: {} });
  } else {
    await api('DELETE', `/api/items/${id}`);
    items.delete(id);
  }
  emit();
}

// ---- single documents ----
export const settings = () => ({ ...DEFAULT_SETTINGS, ...(items.get('settings')?.data || {}) });
export const plan = () => ({ variant: '', answers: {}, ...(items.get('plan')?.data || {}) });

// ---- reminder times ----
const at = (date, kind, repeat = 'none') => ({ fire_at: date.toISOString(), kind, repeat });

function nextDaily(time) {
  let d = toDate(today(), time);
  if (d <= new Date()) d = toDate(addDays(today(), 1), time);
  return d;
}
function nextWeekly(weekday, time) {
  let day = today();
  for (let i = 0; i < 8; i++) {
    const d = toDate(day, time);
    if (d.getDay() === Number(weekday) && d > new Date()) return d;
    day = addDays(day, 1);
  }
  return toDate(day, time);
}

export function apptTimes(d) {
  const start = toDate(d.date, d.time);
  const leave = addMinutes(start, -(Number(d.travel) || 0));
  const ready = addMinutes(leave, -(Number(d.prep) || 0));
  return { start, leave, ready };
}

const REMINDERS = {
  appointment(d) {
    if (!d.date || !d.time) return [];
    const { start, leave, ready } = apptTimes(d);
    const out = [at(toDate(addDays(d.date, -1), '20:00'), 'appt_eve')];
    if (d.court) out.push(at(toDate(addDays(d.date, -7), '18:00'), 'appt_week'));
    if (ready < leave) out.push(at(ready, 'appt_ready'));
    if (leave < start) out.push(at(leave, 'appt_leave'));
    else out.push(at(addMinutes(start, -15), 'appt_soon'));
    return out;
  },
  task(d) {
    if (d.done || d.status === 'done' || d.archived) return [];
    const out = [];
    if (d.due) out.push(at(toDate(addDays(d.due, -1), '17:00'), 'task_soon'), at(toDate(d.due, '10:00'), 'task_due'));
    if (d.today && d.at) out.push(at(toDate(d.today, d.at), 'task_block'));
    return out;
  },
  routine(d) {
    return d.active === false || !d.time ? [] : [at(nextDaily(d.time), 'routine', 'daily')];
  },
  // Tracker items: the day before at 17:00 and on the day at 09:00, until the item is closed.
  pm_item(d) {
    if (!d.due || d.closed_at) return [];
    return [at(toDate(addDays(d.due, -1), '17:00'), 'pm_soon'), at(toDate(d.due, '09:00'), 'pm_due')];
  },
  bill(d) {
    if (d.finished || !d.due) return [];
    if (d.autopay) return [at(toDate(addDays(d.due, -1), '10:00'), 'bill_auto')];
    return [at(toDate(addDays(d.due, -3), '10:00'), 'bill_soon'), at(toDate(d.due, '10:00'), 'bill_due')];
  },
  obligation(d) {
    if (!d.time) return [];
    if (d.schedule === 'daily') return [at(nextDaily(d.time), 'obligation', 'daily')];
    if (d.schedule === 'weekly') return [at(nextWeekly(d.weekday, d.time), 'obligation', 'weekly')];
    return [];
  },
  settings(d) {
    const s = { ...DEFAULT_SETTINGS, ...d };
    return [
      at(nextDaily(s.morningAt), 'checkin_morning', 'daily'),
      at(nextDaily(s.eveningAt), 'checkin_evening', 'daily'),
      at(nextWeekly(s.weeklyDay, s.weeklyAt), 'checkin_weekly', 'weekly'),
    ];
  },
};
