// NOBBIE's tracker, read-only, beside XO's own projects (decision D-10). The server signs in to
// NOBBIE and fetches it (app/nobbie.py); this module keeps the last copy in memory and maps it to
// XO's item shape so every tracker view can show it. Nothing here can change NOBBIE.
//
// The project's id is `nobbie`, its key NOB; an item's id is `nob:<NOBBIE id>` and its number is
// NOBBIE's id, so NOB-412 is NOBBIE item 412. Comments and history load when an item is opened.
import { api } from '../store.js';

export const NOBBIE_ID = 'nobbie';
const listeners = new Set();
let state = { enabled: null, error: '', project: null, items: [], fetchedAt: 0, url: '' };
let loading = null;
const details = new Map(); // NOBBIE id -> { comments, events }
// NOBBIE fields XO has a name for; other changes show as a note in the history.
const KNOWN = ['title', 'status', 'kind', 'priority', 'area', 'owner', 'labels', 'body', 'test_steps', 'due', 'resolution'];

export const nobbieState = () => state;
export const onNobbie = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

// NOBBIE's pick lists as XO lists: { status: [{ v, closed }], ... }.
function mapLists(vocab) {
  const list = (cat) => (Array.isArray(vocab?.[cat]) ? vocab[cat] : []).map((x) => {
    const v = typeof x === 'string' ? x : x.value ?? x.label ?? '';
    const meta = (typeof x === 'object' && x.meta) || {};
    return { v, closed: !!(x.closed || meta.closed), inverse: meta.inverse || x.inverse || undefined };
  }).filter((x) => x.v);
  const out = { status: list('status'), kind: list('kind'), priority: list('priority'), area: list('area'), owner: list('owner'), link: list('link') };
  if (!out.status.some((s) => s.closed)) out.status.push({ v: 'closed', closed: true });
  for (const k of Object.keys(out)) if (!out[k].length) out[k] = [{ v: '' }];
  return out;
}

function mapItem(n) {
  const extra = details.get(n.id) || {};
  return {
    id: `nob:${n.id}`,
    project: NOBBIE_ID,
    num: n.id,
    title: n.title || '',
    body: n.body || '',
    test_steps: n.test_steps || '',
    kind: n.kind || '',
    status: n.status || '',
    priority: n.priority || '',
    area: n.area || '',
    owner: n.owner || '',
    labels: Array.isArray(n.labels) ? n.labels : [],
    due: '',
    checklist: [],
    links: [],
    comments: extra.comments || [],
    events: extra.events || [{ at: n.created_at || '', type: 'created' }],
    resolution: n.resolution || '',
    created: n.created_at || '',
    updated: n.updated_at || n.created_at || '',
    closed_at: n.closed_at || '',
    readOnly: true,
    source: n.source_ref || '',
  };
}

// Fetches NOBBIE's tracker (the server caches it for a couple of minutes). refresh asks the server
// to fetch again now. Never throws: a failure is kept in state.error for the screen to show.
export function loadNobbie({ refresh = false } = {}) {
  if (loading && !refresh) return loading;
  loading = api('GET', `/api/tracker/nobbie${refresh ? '?refresh=true' : ''}`)
    .then((doc) => {
      if (!doc.enabled) { state = { ...state, enabled: false, error: '' }; return; }
      const lists = mapLists(doc.vocab);
      state = {
        enabled: true,
        error: '',
        url: doc.url || '',
        fetchedAt: doc.fetched_at || 0,
        project: { id: NOBBIE_ID, name: 'NOBBIE', key: 'NOB', order: 9999, archived: false, readOnly: true, lists },
        items: (doc.items || []).map(mapItem),
      };
    })
    .catch((err) => { state = { ...state, enabled: state.enabled ?? true, error: err.message }; })
    .finally(() => { loading = null; emit(); });
  return loading;
}

// Loads one item's comments and history from NOBBIE.
export async function loadNobbieItem(num) {
  const doc = await api('GET', `/api/tracker/nobbie/items/${num}`);
  const comments = [];
  const events = [];
  for (const ev of doc.events || []) {
    if (ev.event_type === 'comment' && ev.note) comments.push({ at: ev.created_at || '', text: ev.note, by: ev.actor || '' });
    else if (ev.event_type === 'created') events.push({ at: ev.created_at || '', type: 'created' });
    else if (KNOWN.includes(ev.field || ev.event_type)) events.push({ at: ev.created_at || '', type: 'changed', field: ev.field || ev.event_type, from: ev.from_value || '', to: ev.to_value || '' });
    else events.push({ at: ev.created_at || '', type: 'comment', to: [ev.event_type, ev.from_value && `${ev.from_value} to ${ev.to_value || ''}`, ev.note].filter(Boolean).join(': ') });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  details.set(num, { comments, events });
  state = { ...state, items: state.items.map((it) => (it.num === num ? { ...it, comments, events } : it)) };
  emit();
}

export const nobbieLink = (num) => (state.url ? `${state.url}/pm?item=${num}` : '');
