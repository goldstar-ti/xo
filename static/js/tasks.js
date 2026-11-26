// Pure task logic: no store, no DOM. Everything takes its inputs as arguments so tests can call it directly.
import { addDays, toDate, ymd } from './util.js';

export const PRIORITIES = ['high', 'normal', 'low'];
export const STATUSES = ['todo', 'doing', 'done'];
export const ENERGIES = ['low', 'medium', 'high'];

const DEFAULT_REPEAT = { every: 'none', n: 1, weekday: 1, nth: 1 };

/** Returns a new task payload with every task field defaulted. Unknown keys are kept. */
export function normaliseTask(d = {}) {
  const status = STATUSES.includes(d.status) ? d.status : d.done ? 'done' : 'todo';
  return {
    ...d,
    status,
    done: status === 'done',
    priority: PRIORITIES.includes(d.priority) ? d.priority : 'normal',
    tags: Array.isArray(d.tags) ? [...d.tags] : [],
    subtasks: Array.isArray(d.subtasks) ? d.subtasks.map((s) => ({ ...s })) : [],
    energy: ENERGIES.includes(d.energy) ? d.energy : '',
    places: Array.isArray(d.places) ? [...d.places] : [],
    blockedBy: Array.isArray(d.blockedBy) ? [...d.blockedBy] : [],
    repeat: { ...DEFAULT_REPEAT, ...(d.repeat || {}) },
    spawned: d.spawned || '',
    at: d.at || '',
    actual: Number(d.actual) || 0,
    touched: d.touched || '',
    created: d.created || '',
    archived: d.archived || '',
  };
}

/** Sort order: priority (high first), then due (empty last), then title. Takes normalised payloads. */
export function compareTasks(a, b) {
  const p = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  if (p) return p;
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return String(a.title || '').localeCompare(String(b.title || ''));
}

/** True when any blocker is an existing task that is not done. byId is a Map of id to normalised payload. */
export function isBlocked(d, byId) {
  return (d.blockedBy || []).some((id) => {
    const o = byId.get(id);
    return !!o && o.status !== 'done';
  });
}

/** True when making blockerId block taskId would create a loop. */
export function wouldCycle(byId, taskId, blockerId) {
  if (blockerId === taskId) return true;
  const seen = new Set();
  const stack = [blockerId];
  while (stack.length) {
    const id = stack.pop();
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const o = byId.get(id);
    if (o) stack.push(...(o.blockedBy || []));
  }
  return false;
}

/** The nth (1 to 4, or -1 for last) weekday (0 = Sunday) of a month (0-based), as YYYY-MM-DD. */
function nthWeekday(year, month, weekday, nth) {
  if (nth === -1) {
    const last = new Date(year, month + 1, 0);
    return ymd(new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7)));
  }
  const first = new Date(year, month, 1);
  return ymd(new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7));
}

/** The next due date for a repeat rule, as YYYY-MM-DD, or null when it does not repeat. */
export function nextRepeat(repeat, due, doneDay) {
  const r = { ...DEFAULT_REPEAT, ...(repeat || {}) };
  const n = Math.max(1, Number(r.n) || 1);
  const base = due || doneDay;
  if (r.every === 'after') return addDays(doneDay, n);
  if (r.every === 'week') {
    let d = base;
    while (d <= doneDay) d = addDays(d, 7 * n);
    return d;
  }
  const b = toDate(base);
  if (r.every === 'month') {
    let k = 1;
    for (;;) {
      const t = new Date(b.getFullYear(), b.getMonth() + k, 1);
      const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      const d = ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(b.getDate(), last)));
      if (d > doneDay) return d;
      k += 1;
    }
  }
  if (r.every === 'month_nth' || r.every === 'quarter_nth') {
    const quarter = r.every === 'quarter_nth';
    for (let k = 1; k < 100; k += 1) {
      const t = new Date(b.getFullYear(), b.getMonth() + k, 1);
      if (quarter && t.getMonth() % 3) continue;
      const d = nthWeekday(t.getFullYear(), t.getMonth(), Number(r.weekday), Number(r.nth));
      if (d > doneDay) return d;
    }
  }
  return null;
}

/** True when an open task has sat untouched for staleDays and nothing is pulling it forward. */
export function isStale(d, { today, staleDays }) {
  if (!staleDays || d.status !== 'todo' || d.archived || !d.touched) return false;
  if (d.today === today || d.today === addDays(today, 1)) return false;
  if (d.due && d.due <= addDays(today, 7)) return false;
  return d.touched.slice(0, 10) < addDays(today, -staleDays);
}

/** Time-guess ratio from the newest 20 done tasks with both a guess and an actual time. */
export function pace(payloads) {
  const rows = payloads
    .filter((d) => d.status === 'done' && d.est > 0 && d.actual > 0)
    .sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')))
    .slice(0, 20);
  if (rows.length < 5) return { ratio: 1.5, samples: rows.length };
  const r = rows.map((d) => d.actual / d.est).sort((a, b) => a - b);
  const mid = Math.floor(r.length / 2);
  const median = r.length % 2 ? r[mid] : (r[mid - 1] + r[mid]) / 2;
  return { ratio: Math.round(Math.min(4, Math.max(0.5, median)) * 10) / 10, samples: rows.length };
}

const WEEKDAYS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const PRIORITY_KEYS = { h: 'high', high: 'high', 1: 'high', n: 'normal', normal: 'normal', 2: 'normal', l: 'low', low: 'low', 3: 'low' };
const squash = (s) => String(s).toLowerCase().replace(/\s+/g, '');

/** A date phrase starting at tokens[i]: { day, len } or null. */
function dateAt(tokens, i, today) {
  const w = tokens[i].toLowerCase();
  if (w === 'today' || w === 'tod') return { day: today, len: 1 };
  if (['tomorrow', 'tmr', 'tmrw'].includes(w)) return { day: addDays(today, 1), len: 1 };
  if (w in WEEKDAYS) {
    const diff = ((WEEKDAYS[w] - toDate(today).getDay() + 6) % 7) + 1;
    return { day: addDays(today, diff), len: 1 };
  }
  if (w === 'next' && (tokens[i + 1] || '').toLowerCase() === 'week') {
    return { day: addDays(today, ((8 - toDate(today).getDay()) % 7) || 7), len: 2 };
  }
  if (w === 'in' && /^\d+$/.test(tokens[i + 1] || '')) {
    const unit = (tokens[i + 2] || '').toLowerCase();
    const n = Number(tokens[i + 1]);
    if (/^days?$/.test(unit)) return { day: addDays(today, n), len: 3 };
    if (/^weeks?$/.test(unit)) return { day: addDays(today, 7 * n), len: 3 };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return { day: w, len: 1 };
  const m = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const pad = (x) => String(x).padStart(2, '0');
    const year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    let day = `${year}-${pad(m[2])}-${pad(m[1])}`;
    if (!m[3] && day < today) day = `${year + 1}-${pad(m[2])}-${pad(m[1])}`;
    return { day, len: 1 };
  }
  return null;
}

/** Parses a quick-add line into a title plus the fields it names. */
export function parseQuick(text, { today, tags = [], places = [] }) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  const out = { title: '', due: '', priority: '', est: 0, tags: [], places: [], newTags: [], newPlaces: [] };
  const words = [];
  const find = (list, word) => list.find((x) => squash(x.name) === word.toLowerCase());
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const low = tok.toLowerCase();
    let m;
    if ((m = low.match(/^!(h|high|1|n|normal|2|l|low|3)$/))) {
      out.priority = PRIORITY_KEYS[m[1]];
    } else if (/^#\S+/.test(tok)) {
      const word = tok.slice(1);
      const hit = find(tags, word);
      if (hit) {
        if (!out.tags.includes(hit.id)) out.tags.push(hit.id);
      } else if (!out.newTags.some((x) => x.toLowerCase() === word.toLowerCase())) out.newTags.push(word);
    } else if (/^@\S+/.test(tok)) {
      const word = tok.slice(1);
      const hit = find(places, word);
      if (hit) {
        if (!out.places.includes(hit.id)) out.places.push(hit.id);
      } else if (!out.newPlaces.some((x) => x.toLowerCase() === word.toLowerCase())) out.newPlaces.push(word);
    } else if ((m = low.match(/^(?:(\d+(?:\.\d+)?)h(?:(\d+)m?)?|(\d+)h?(?:in)?m(?:in)?|(\d+)m(?:in)?)$/)) && /\d/.test(low) && /[hm]/.test(low)) {
      out.est = m[1] ? Math.round(Number(m[1]) * 60 + Number(m[2] || 0)) : Number(m[3] || m[4]);
    } else if (['due', 'on', 'by'].includes(low) && i + 1 < tokens.length && dateAt(tokens, i + 1, today)) {
      const hit = dateAt(tokens, i + 1, today);
      out.due = hit.day;
      i += hit.len;
    } else if (dateAt(tokens, i, today)) {
      const hit = dateAt(tokens, i, today);
      out.due = hit.day;
      i += hit.len - 1;
    } else {
      words.push(tok);
    }
  }
  out.title = words.join(' ');
  return out;
}

/** Fuzzy match score: 0 when the query is not a subsequence of the text, higher for tighter matches. */
export function fuzzyScore(query, text) {
  const q = String(query || '').toLowerCase();
  const s = String(text || '').toLowerCase();
  if (!q) return 1;
  let score = 1;
  let at = -1;
  for (const ch of q) {
    const next = s.indexOf(ch, at + 1);
    if (next < 0) return 0;
    if (next === at + 1 && at >= 0) score += 2;
    at = next;
  }
  if (s[0] === q[0]) score += 3;
  return score;
}
