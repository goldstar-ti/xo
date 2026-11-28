// Store-bound task actions. Every task write goes through saveTask(), so touched, created and done stay right.
import { isOn } from './modules.js';
import * as store from './store.js';
import { t, text } from './text.js';
import { fmtDay, toast, today, uid } from './util.js';
import { isBlocked, nextRepeat, normaliseTask, pace, parseQuick } from './tasks.js';

const nowIso = () => new Date().toISOString();

/** The categories and places: the saved `taskmeta` item, or the seed from defaults.yaml until it is first saved. */
export function taskMeta() {
  const saved = store.get('taskmeta')?.data;
  if (saved) return { tags: saved.tags || [], places: saved.places || [] };
  const seed = (key) => text(key).map((name) => ({ id: name.toLowerCase(), name }));
  return { tags: seed('defaults.task_tags'), places: seed('defaults.task_places') };
}

export const saveMeta = (meta) => store.save('taskmeta', 'taskmeta', meta);

export const allTasks = () => store.byKind('task').map((i) => ({ ...i, data: normaliseTask(i.data) }));

/** Saves a task payload, setting touched, created and done. */
export function saveTask(id, data, opts) {
  const now = nowIso();
  const status = normaliseTask(data).status;
  return store.save('task', id, { ...data, status, done: status === 'done', touched: now, created: data.created || now }, opts);
}

/** Moves a task to todo, doing or done. Finishing a repeating task adds the next one. */
export async function setStatus(item, status) {
  const d = normaliseTask(item.data);
  const finishing = status === 'done' && d.status !== 'done';
  const data = { ...d, status, done: status === 'done', doneAt: status === 'done' ? (finishing ? nowIso() : d.doneAt || nowIso()) : '' };
  let next = null;
  if (finishing && isOn('tasks.repeats') && d.repeat.every !== 'none' && !d.spawned) {
    const due = nextRepeat(d.repeat, d.due, today());
    if (due) {
      next = {
        ...normaliseTask({}),
        title: d.title, step: d.step || '', est: d.est, project: d.project || '', priority: d.priority, tags: [...d.tags],
        energy: d.energy, places: [...d.places], repeat: { ...d.repeat },
        subtasks: d.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
        status: 'todo', today: '', at: '', blockedBy: [], actual: 0, due,
      };
      const nextId = uid();
      await saveTask(nextId, next);
      data.spawned = nextId;
    }
  }
  await saveTask(item.id, data);
  if (next) {
    toast(t('forms.task.next_added', { day: fmtDay(next.due) }));
  } else if (finishing && isOn('tasks.dependencies')) {
    const all = allTasks();
    const byId = new Map(all.map((i) => [i.id, i.data]));
    const ready = all.find((i) => i.id !== item.id && i.data.status !== 'done' && !i.data.archived && i.data.blockedBy.includes(item.id) && !isBlocked(i.data, byId));
    if (ready) toast(t('forms.task.now_ready', { title: ready.data.title }));
  }
}

export const toggleTask = (item) => setStatus(item, normaliseTask(item.data).done ? 'todo' : 'done');

/** Picks a task for a day (three at most) or unpicks it. */
export async function pickTask(item, day = today()) {
  const d = normaliseTask(item.data);
  const picked = d.today === day;
  if (!picked) {
    const count = allTasks().filter((i) => i.data.today === day && !i.data.done).length;
    if (count >= 3) { toast(t(day === today() ? 'forms.task.limit' : 'forms.task.limit_tomorrow'), 'bad'); return; }
  }
  await saveTask(item.id, { ...d, today: picked ? '' : day, ...(picked ? { at: '' } : {}) });
}

/** Adds a task from one line of text: dates, priority, categories, places and time are read from it. */
export async function quickTask(raw, extra = {}) {
  const meta = taskMeta();
  const parsed = parseQuick(raw, { today: today(), tags: meta.tags, places: meta.places });
  if (!parsed.title) return;
  const tags = [...parsed.tags];
  const places = [...parsed.places];
  if (parsed.newTags.length || parsed.newPlaces.length) {
    const grow = (list, names, ids) => names.forEach((name) => { const id = uid(); list.push({ id, name }); ids.push(id); });
    const next = { tags: [...meta.tags], places: [...meta.places] };
    grow(next.tags, parsed.newTags, tags);
    grow(next.places, parsed.newPlaces, places);
    await saveMeta(next);
  }
  await saveTask(uid(), {
    ...normaliseTask({}), step: '', project: '', today: '',
    title: parsed.title, est: parsed.est || 30, due: parsed.due, priority: parsed.priority || 'normal', tags, places, ...extra,
  });
}

/** The ratio to allow on top of a guess, learnt from finished tasks. */
export const currentPace = () => pace(allTasks().map((i) => i.data)).ratio;
