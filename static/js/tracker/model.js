// Tracker data: projects and their items, kept as ordinary XO items (decision D-10).
//
//   project   id project:<uuid>  { name, key, order, archived, next, lists }
//   pm_item   id pm:<uuid>       { project, num, title, body, test_steps, kind, status, priority, area,
//                                  owner, labels: [], due, checklist: [{ t, done }], links: [{ to, type }],
//                                  comments: [{ at, text }], events: [{ at, type, field, from, to }],
//                                  resolution, created, updated, closed_at }
//   tracker   id tracker         { views: [{ id, name, filters }] }   saved list views
//
// lists is the project's own pick lists: { status, kind, priority, area, owner, link }, each a list
// of { v } (status adds closed: true for statuses that close an item; link adds inverse). New
// projects start from `tracker.default_lists` in content/text/tracker.yaml.
//
// An item's reference is <project key>-<num> (XO-12). Links are stored on the item that made them;
// linksFor() also finds the links other items made to it and shows them with the inverse label.
// Every change appends to events, the item's history (newest last, the oldest dropped past 300).
import * as store from '../store.js';
import { NOBBIE_ID, nobbieState } from './nobbie.js';
import { text } from '../text.js';
import { today, uid } from '../util.js';

export const PROJECT = 'project';
export const ITEM = 'pm_item';
export const FIELDS = ['status', 'kind', 'priority', 'area', 'owner'];
export const LIST_KEYS = [...FIELDS, 'link'];
const MAX_EVENTS = 300;
const MAX_LABELS = 10;
const nowIso = () => new Date().toISOString();

// ---- reading ----
const sortProjects = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
// NOBBIE's tracker joins XO's own projects as one read-only project (tracker/nobbie.js).
const external = () => (nobbieState().project ? [nobbieState().project] : []);
export const projects = ({ archived = false } = {}) => [
  ...store.byKind(PROJECT).map((i) => ({ id: i.id, ...i.data })).filter((p) => archived || !p.archived).sort(sortProjects),
  ...external(),
];
export function project(id) {
  if (id === NOBBIE_ID) return nobbieState().project;
  const i = store.get(id);
  return i?.kind === PROJECT ? { id, ...i.data } : null;
}
export function items(projectId = null) {
  if (projectId === NOBBIE_ID) return nobbieState().items;
  const own = store.byKind(ITEM).map((i) => ({ id: i.id, ...i.data })).filter((i) => !projectId || i.project === projectId);
  return projectId ? own : [...own, ...nobbieState().items];
}
export function item(id) {
  if (String(id).startsWith('nob:')) return nobbieState().items.find((i) => i.id === id) || null;
  const i = store.get(id);
  return i?.kind === ITEM ? { id, ...i.data } : null;
}
export const readOnly = (it) => !!it?.readOnly;
export const ref = (it) => `${project(it.project)?.key || '?'}-${it.num}`;
export function byRef(r) {
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(r || '');
  if (!m) return null;
  const p = projects({ archived: true }).find((x) => x.key.toLowerCase() === m[1].toLowerCase());
  return p ? items(p.id).find((i) => i.num === Number(m[2])) || null : null;
}

export function lists(projectId) {
  const fallback = defaultLists();
  const own = project(projectId)?.lists || {};
  const out = {};
  for (const k of LIST_KEYS) out[k] = Array.isArray(own[k]) && own[k].length ? own[k] : fallback[k];
  return out;
}
export const values = (projectId, key) => lists(projectId)[key].map((x) => x.v);
export const isClosed = (it) => !!lists(it.project).status.find((s) => s.v === it.status)?.closed;
export const isOverdue = (it) => !!it.due && it.due < today() && !isClosed(it);

export function defaultLists() {
  const raw = text('tracker.default_lists');
  const out = {};
  for (const k of LIST_KEYS) {
    const list = Array.isArray(raw?.[k]) ? raw[k] : [];
    out[k] = list.map((x) => (typeof x === 'string' ? { v: x } : { ...x }));
  }
  if (!out.status.some((s) => s.closed)) out.status.push({ v: 'done', closed: true });
  return out;
}

// Links in both directions: { item, type, label, own }; own is true for links this item made.
export function linksFor(id) {
  const me = item(id);
  if (!me) return [];
  const out = [];
  for (const l of me.links || []) {
    const other = item(l.to);
    if (other) out.push({ item: other, type: l.type, label: l.type, own: true });
  }
  for (const other of items()) {
    for (const l of other.links || []) {
      if (l.to !== id) continue;
      const inverse = lists(other.project).link.find((x) => x.v === l.type)?.inverse || l.type;
      out.push({ item: other, type: l.type, label: inverse, own: false });
    }
  }
  return out;
}

export const labelsIn = (projectId) => [...new Set(items(projectId).flatMap((i) => i.labels || []))].sort();

// ---- writing ----
const strip = ({ id, ...data }) => data; // The id lives in the row, not the payload.

export async function saveProject(id, data) {
  await store.save(PROJECT, id, data);
}

export async function createProject({ name, key }) {
  const id = `project:${uid()}`;
  const order = Math.max(-1, ...projects({ archived: true }).map((p) => p.order ?? 0)) + 1;
  await saveProject(id, { name, key: key.toUpperCase(), order, archived: false, next: 1, lists: defaultLists() });
  return id;
}

// Takes the next item number in a project and saves the counter.
async function nextNum(projectId) {
  const p = project(projectId);
  const used = Math.max(0, ...items(projectId).map((i) => i.num || 0));
  const num = Math.max(p.next || 1, used + 1);
  await saveProject(projectId, { ...strip(p), next: num + 1 });
  return num;
}

const event = (type, extra = {}) => ({ at: nowIso(), type, ...extra });
const trim = (events) => events.slice(-MAX_EVENTS);

export async function createItem(projectId, fields = {}) {
  const l = lists(projectId);
  const id = `pm:${uid()}`;
  const num = await nextNum(projectId);
  const pick = (k, wanted) => (wanted && l[k].some((x) => x.v === wanted) ? wanted : l[k][Math.min(k === 'priority' ? 1 : 0, l[k].length - 1)]?.v || '');
  const data = {
    project: projectId,
    num,
    title: fields.title || '',
    body: fields.body || '',
    test_steps: fields.test_steps || '',
    kind: pick('kind', fields.kind),
    status: pick('status', fields.status),
    priority: pick('priority', fields.priority),
    area: pick('area', fields.area),
    owner: pick('owner', fields.owner),
    labels: normaliseLabels(fields.labels),
    due: fields.due || '',
    checklist: [],
    links: [],
    comments: [],
    events: [event('created')],
    resolution: '',
    created: nowIso(),
    updated: nowIso(),
    closed_at: '',
  };
  await store.save(ITEM, id, data);
  return id;
}

export function normaliseLabels(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const out = [];
  for (const l of list) {
    const v = String(l).trim().toLowerCase().slice(0, 30);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, MAX_LABELS);
}

// Applies field changes, recording one event per changed field. Moving into a closing status
// sets closed_at; moving out of one clears it and the resolution.
export async function updateItem(id, changes, { note = '' } = {}) {
  const it = item(id);
  if (!it || it.readOnly) return;
  const next = { ...strip(it) };
  const events = [...(it.events || [])];
  for (const [field, value] of Object.entries(changes)) {
    const before = JSON.stringify(it[field] ?? '');
    const v = field === 'labels' ? normaliseLabels(value) : value;
    if (JSON.stringify(v ?? '') === before) continue;
    next[field] = v;
    if (['body', 'test_steps', 'checklist', 'links'].includes(field)) events.push(event('edited', { field }));
    else events.push(event('changed', { field, from: fieldText(it[field]), to: fieldText(v) }));
  }
  if (events.length === (it.events || []).length) return;
  const wasClosed = isClosed(it);
  const nowClosed = isClosed(next);
  if (!wasClosed && nowClosed) { next.closed_at = nowIso(); events.push(event('closed', { to: next.resolution || '' })); }
  if (wasClosed && !nowClosed) { next.closed_at = ''; next.resolution = ''; events.push(event('reopened')); }
  if (note) events.push(event('comment', { to: note }));
  next.events = trim(events);
  next.updated = nowIso();
  await store.save(ITEM, id, next);
}

const fieldText = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));

// Closes with the first closing status (or the one given) and a resolution note.
export async function closeItem(id, { status, resolution = '' } = {}) {
  const it = item(id);
  if (!it) return;
  const closing = status || lists(it.project).status.find((s) => s.closed)?.v;
  await updateItem(id, { status: closing, resolution });
}

export async function reopenItem(id) {
  const it = item(id);
  if (!it) return;
  await updateItem(id, { status: lists(it.project).status.find((s) => !s.closed)?.v });
}

export async function addComment(id, note) {
  const it = item(id);
  const text2 = String(note || '').trim();
  if (!it || it.readOnly || !text2) return;
  const comments = [...(it.comments || []), { at: nowIso(), text: text2 }];
  const events = trim([...(it.events || []), event('comment', { to: text2.slice(0, 120) })]);
  await store.save(ITEM, id, { ...strip(it), comments, events, updated: nowIso() });
}

export async function setChecklist(id, checklist) {
  await updateItem(id, { checklist: checklist.filter((c) => String(c.t || '').trim()) });
}

export async function addLink(id, toId, type) {
  const it = item(id);
  if (!it || !item(toId) || toId === id) return;
  if ((it.links || []).some((l) => l.to === toId && l.type === type)) return;
  await updateItem(id, { links: [...(it.links || []), { to: toId, type }] });
}

// Removes a link whichever item made it.
export async function removeLink(fromId, toId, type) {
  const it = item(fromId);
  if (!it) return;
  await updateItem(fromId, { links: (it.links || []).filter((l) => !(l.to === toId && l.type === type)) });
}

export async function deleteItem(id) {
  if (item(id)?.readOnly) return;
  for (const other of items()) {
    if (!other.readOnly && (other.links || []).some((l) => l.to === id)) {
      await updateItem(other.id, { links: other.links.filter((l) => l.to !== id) });
    }
  }
  await store.remove(id);
}

// One change to many items, one save each. Returns how many changed.
export async function bulkUpdate(ids, changes) {
  let n = 0;
  for (const id of ids) {
    const before = store.get(id)?.data?.updated;
    if (changes.addLabel) {
      const it = item(id);
      await updateItem(id, { labels: [...(it?.labels || []), changes.addLabel] });
    } else if (changes.close) {
      await closeItem(id);
    } else {
      await updateItem(id, changes);
    }
    if (store.get(id)?.data?.updated !== before) n++;
  }
  return n;
}

// Renames a pick-list value in a project and in every item of it that uses the old value.
export async function renameValue(projectId, key, from, to) {
  if (!to || from === to) return;
  if (FIELDS.includes(key)) {
    for (const it of items(projectId)) if (it[key] === from) await updateItem(it.id, { [key]: to });
  } else if (key === 'link') {
    for (const it of items(projectId)) {
      if ((it.links || []).some((l) => l.type === from)) {
        await updateItem(it.id, { links: it.links.map((l) => (l.type === from ? { ...l, type: to } : l)) });
      }
    }
  }
}

// ---- saved views ----
export const savedViews = () => store.get('tracker')?.data?.views || [];
export async function saveViews(views) {
  await store.save('tracker', 'tracker', { ...(store.get('tracker')?.data || {}), views }, { silent: true });
}

// ---- filtering ----
// filters: { q, open, status, kind, priority, area, owner, label, due: 'overdue'|'week'|'set', closedDays }
export function matches(it, f = {}) {
  if (f.open && isClosed(it)) return false;
  for (const k of FIELDS) if (f[k] && it[k] !== f[k]) return false;
  if (f.label && !(it.labels || []).includes(f.label)) return false;
  if (f.due === 'overdue' && !isOverdue(it)) return false;
  if (f.due === 'set' && !it.due) return false;
  if (f.due === 'week') {
    const end = new Date(); end.setDate(end.getDate() + 7);
    const lim = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    if (!it.due || it.due > lim || isClosed(it)) return false;
  }
  if (f.closedDays) {
    if (!it.closed_at || Date.now() - Date.parse(it.closed_at) > f.closedDays * 86400000) return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${ref(it)} ${it.title} ${it.body} ${(it.labels || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Rank of a value in its pick list, for sorting by status or priority in list order.
export const rank = (it, key) => {
  const i = values(it.project, key).indexOf(it[key]);
  return i < 0 ? 999 : i;
};
