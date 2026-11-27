// The Tasks screen: a list, a To do / Doing / Done board or a table, with filters, a review of stale tasks
// and the categories and places dialog. The same module draws the page and the Tasks, Task board and
// Task table widgets. The chosen view and the filters are per browser, in localStorage `xo-tasks`.
import { customMeta, defs, valueText } from '../customfields.js';
import * as store from '../store.js';
import { editTask } from '../forms.js';
import { matchKey } from '../keymap.js';
import { openPalette, setScreenKeys } from '../palette.js';
import { allTasks, pickTask, quickTask, saveMeta, saveTask, setStatus, taskMeta, toggleTask } from '../taskdata.js';
import { ENERGIES, PRIORITIES, STATUSES, compareTasks, isBlocked, isStale, pace, parseQuick } from '../tasks.js';
import { t, text } from '../text.js';
import { micButton } from '../voice.js';
import { button, checkbox, chip, field, focusControl, input } from '../ui.js';
import { addDays, fmtDay, fmtDuration, h, openDialog, put, relDay, toast, today, uid } from '../util.js';

export const live = true;

const KEY = 'xo-tasks';
const VIEWS = ['list', 'board', 'table'];
const DEFAULT_PREFS = { view: 'list', tags: [], focus: '', places: [], readyOnly: false, custom: {} };
const FOCUS_OK = { low: ['', 'low'], medium: ['', 'low', 'medium'] };
const COLUMNS = ['done', 'title', 'priority', 'status', 'due', 'tags', 'energy', 'est', 'subtasks'];
const BOARD_DAYS = 14;
const BOARD_DONE_MAX = 30;
const DONE_MAX = 20;

// The table's sort, kept while the page is open. An empty key is the default order (priority, due, title).
let tableSort = { key: '', dir: 1 };

const fail = (err) => toast(err.message, 'bad');
const nowIso = () => new Date().toISOString();

function prefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* storage blocked or damaged */ }
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    view: VIEWS.includes(saved.view) ? saved.view : DEFAULT_PREFS.view,
    tags: list(saved.tags),
    focus: ['low', 'medium', 'high'].includes(saved.focus) ? saved.focus : '',
    places: list(saved.places),
    readyOnly: !!saved.readyOnly,
    custom: Object.fromEntries(Object.entries(saved.custom && typeof saved.custom === 'object' ? saved.custom : {}).map(([id, v]) => [id, list(v)]).filter(([, v]) => v.length)),
  };
}

function savePrefs(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...prefs(), ...patch })); } catch { /* storage blocked */ }
}

const anyFilter = (p) => p.tags.length > 0 || p.focus !== '' || p.places.length > 0 || p.readyOnly || Object.keys(p.custom).length > 0;

function matches(d, p, byId) {
  if (p.tags.length && !d.tags.some((x) => p.tags.includes(x))) return false;
  const ok = FOCUS_OK[p.focus];
  if (ok && !ok.includes(d.energy)) return false;
  if (p.places.length && d.places.length && !d.places.some((x) => p.places.includes(x))) return false;
  if (p.readyOnly && isBlocked(d, byId)) return false;
  for (const [id, chosen] of Object.entries(p.custom)) {
    const def = defs('task').find((x) => x.id === id);
    if (!def) continue;
    const v = d.custom?.[id];
    if (!chosen.includes(def.type === 'yesno' ? (v === true ? 'yes' : 'no') : v ?? '')) return false;
  }
  return true;
}

// Everything a draw needs, read once: normalised tasks, a lookup by id, categories and places, and the learnt pace.
function gather() {
  const items = allTasks();
  return { items, byId: new Map(items.map((i) => [i.id, i.data])), meta: taskMeta(), pace: pace(items.map((i) => i.data)).ratio };
}

const names = (list, ids) => ids.map((id) => list.find((x) => x.id === id)?.name).filter(Boolean);
const doneOn = (d) => (d.doneAt || '').slice(0, 10);
const recentlyDone = (d, day) => d.status === 'done' && doneOn(d) >= addDays(day, -BOARD_DAYS);
const byDoneDesc = (a, b) => (b.data.doneAt || '').localeCompare(a.data.doneAt || '');
const bySort = (a, b) => compareTasks(a.data, b.data);

// The small facts under a task title, shared by list rows and board cards.
function metaParts(d, ctx) {
  const day = today();
  const open = d.status !== 'done';
  const late = open && d.due && d.due < day;
  const parts = [];
  if (d.project) parts.push(d.project);
  if (d.due && open) parts.push(late ? t('lists.shared.overdue_since', { day: fmtDay(d.due) }) : t('lists.tasks.due', { when: relDay(d.due) }));
  if (d.est > 0 && open) parts.push(t('lists.shared.allow', { duration: fmtDuration(d.est * ctx.pace) }));
  if (d.priority === 'high' || d.priority === 'low') parts.push(t(`lists.tasks.priority.${d.priority}`));
  parts.push(...names(ctx.meta.tags, d.tags));
  if (d.notes) parts.push(t('lists.tasks.has_notes'));
  if (d.subtasks.length) parts.push(t('lists.tasks.subtasks', { done: d.subtasks.filter((s) => s.done).length, total: d.subtasks.length }));
  const waiting = d.blockedBy.map((id) => ctx.byId.get(id)).filter((o) => o && o.status !== 'done').map((o) => o.title);
  if (waiting.length) parts.push(t('lists.tasks.waiting', { titles: waiting.join(', ') }));
  parts.push(...customMeta('task', d.custom));
  return parts;
}

// The pick chip: Pick, Today or Tomorrow. A task picked for another day is still picked by a tap on Pick.
function pickChip(item, d) {
  const day = today();
  const tomorrow = addDays(day, 1);
  const label = d.today === day ? t('lists.tasks.today') : d.today === tomorrow ? t('lists.tasks.tomorrow') : t('lists.tasks.pick');
  const pressed = d.today === day || d.today === tomorrow;
  return button(label, { variant: pressed ? 'primary' : 'ghost', class: 'small pill', 'aria-pressed': String(pressed), onclick: () => pickTask(item, d.today === tomorrow ? tomorrow : day).catch(fail) });
}

/**
 * One list row for a task item (raw or normalised). opts: showPick (default true), actions (extra nodes at the end),
 * ctx (the shared lookups from a draw; read here when not given).
 */
export function taskRow(task, { showPick = true, actions = [], ctx = null } = {}) {
  const c = ctx || gather();
  const d = c.byId.get(task.id) || task.data;
  const item = { ...task, data: d };
  const late = d.status !== 'done' && d.due && d.due < today();
  const meta = metaParts(d, c);
  return h('li', { class: `${d.done ? 'done' : ''}${late ? ' late' : ''}`, 'data-task-id': task.id, tabindex: '-1' },
    checkbox({ checked: d.done, 'aria-label': t('lists.shared.done_aria', { title: d.title }), onchange: () => toggleTask(item).catch(fail) }),
    button([
      h('span', {}, d.title),
      !d.done && d.step && h('small', {}, t('lists.shared.start_with', { step: d.step })),
      meta.length > 0 && h('small', {}, meta.join(', ')),
    ], { variant: 'row', class: 'row-main', onclick: () => editTask(item) }),
    showPick && !d.done && pickChip(item, d),
    actions);
}

function previewText(raw, meta) {
  const r = parseQuick(raw, { today: today(), tags: meta.tags, places: meta.places });
  const parts = [];
  if (r.due) parts.push(relDay(r.due));
  if (r.priority) parts.push(text('forms.task.priorities')[r.priority]);
  parts.push(...names(meta.tags, r.tags), ...r.newTags, ...names(meta.places, r.places), ...r.newPlaces);
  if (r.est > 0) parts.push(fmtDuration(r.est));
  return parts.length ? t('lists.tasks.preview', { parts: parts.join(', ') }) : '';
}

// Text typed into a quick-add box and not yet sent, by box: { text, screen }. It comes back only on the same screen.
const typed = new Map();
const screenNow = () => location.hash.split('/')[1] || '';

/**
 * The quick add form: one line of text, read by parseQuick. extra is merged into the new task and focusKey is its
 * data-focus value (the screen refocuses it after the redraw). With preview: true a line under the field shows what was read.
 */
export function quickAdd(placeholder, extra, focusKey, { preview = false } = {}) {
  const box = input({ type: 'text', placeholder, 'aria-label': placeholder, autocomplete: 'off', 'data-focus': focusKey });
  const form = h('form', {
    class: 'quick',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        typed.delete(focusKey);
        sessionStorage.setItem('refocus', focusKey);
        await quickTask(box.value, extra);
      } catch (err) { fail(err); }
    },
  }, box, micButton(box), button(t('lists.shared.add'), { variant: 'primary', type: 'submit' }));
  // A redraw (a save finishing, a dialog closing) replaces this box. Keep what was typed and the focus, so the next key is not lost.
  box.addEventListener('input', () => { if (box.value) typed.set(focusKey, { text: box.value, screen: screenNow() }); else typed.delete(focusKey); });
  box.addEventListener('focusout', (e) => { if (e.relatedTarget) typed.delete(focusKey); });
  const kept = typed.get(focusKey)?.screen === screenNow() ? typed.get(focusKey).text : '';
  if (kept) {
    box.value = kept;
    // The screen refocuses the box straight after drawing, so a key pressed a moment later still lands in it.
    if (document.activeElement === document.body) { try { sessionStorage.setItem('refocus', focusKey); } catch { /* storage blocked */ } }
    setTimeout(() => { if (box.isConnected && document.activeElement === document.body) box.focus({ preventScroll: true }); }, 0);
  }
  if (!preview) return form;
  const note = h('p', { class: 'hint', hidden: true });
  const showNote = () => {
    note.textContent = previewText(box.value, taskMeta());
    note.hidden = !note.textContent;
  };
  box.addEventListener('input', showNote);
  if (kept) showNote();
  return h('div', {}, form, note);
}

// ---- list ----

function listView(visible, ctx, day) {
  const staleDays = Number(store.settings().staleDays) || 0;
  const open = visible.filter((i) => i.data.status !== 'done');
  const picked = visible.filter((i) => i.data.today === day).sort(bySort);
  const afterPicked = open.filter((i) => i.data.today !== day);
  const stale = afterPicked.filter((i) => isStale(i.data, { today: day, staleDays }));
  const doing = afterPicked.filter((i) => i.data.status === 'doing' && !stale.includes(i)).sort(bySort);
  const todo = afterPicked.filter((i) => i.data.status === 'todo' && !stale.includes(i));
  const waiting = todo.filter((i) => isBlocked(i.data, ctx.byId)).sort(bySort);
  const ready = todo.filter((i) => !waiting.includes(i));
  const soon = ready.filter((i) => i.data.due && i.data.due <= addDays(day, 7)).sort(bySort);
  const other = ready.filter((i) => !soon.includes(i)).sort(bySort);
  const rows = (list, opts) => h('ul', { class: 'list' }, list.map((i) => taskRow(i, { ctx, ...(typeof opts === 'function' ? opts(i) : opts) })));
  const section = (title, list, empty) => h('section', {}, h('h2', {}, title),
    list.length ? rows(list) : empty && h('p', { class: 'empty' }, empty));
  // Done and Archived ignore the filters.
  const all = ctx.items;
  const done = all.filter((i) => i.data.status === 'done' && !i.data.archived && i.data.today !== day).sort(byDoneDesc).slice(0, DONE_MAX);
  const archived = all.filter((i) => i.data.archived).sort((a, b) => b.data.archived.localeCompare(a.data.archived));
  const reviewActions = (i) => ({
    actions: [
      button(t('lists.tasks.keep'), { class: 'small', onclick: () => saveTask(i.id, i.data).catch(fail) }),
      button(t('lists.tasks.archive'), { class: 'small', onclick: () => saveTask(i.id, { ...i.data, archived: nowIso(), today: '' }).catch(fail) }),
    ],
  });
  const restore = (i) => ({ showPick: false, actions: [button(t('lists.tasks.restore'), { class: 'small', onclick: () => saveTask(i.id, { ...i.data, archived: '' }).catch(fail) })] });
  return [
    section(t('lists.tasks.todays_three'), picked, t('lists.tasks.pick_empty')),
    doing.length > 0 && section(t('lists.tasks.doing_heading'), doing),
    soon.length > 0 && section(t('lists.tasks.due_week'), soon),
    section(t('lists.tasks.ready'), other, open.length || picked.length ? null : t('lists.tasks.none_open')),
    waiting.length > 0 && section(t('lists.tasks.waiting_heading'), waiting),
    stale.length > 0 && h('details', {}, h('summary', {}, t('lists.tasks.review', { count: stale.length })),
      h('p', { class: 'note' }, t('lists.tasks.review_note', { days: staleDays })), rows(stale.sort(bySort), reviewActions)),
    done.length > 0 && h('details', {}, h('summary', {}, t('lists.tasks.done', { count: done.length })), rows(done, {})),
    archived.length > 0 && h('details', {}, h('summary', {}, t('lists.tasks.archived', { count: archived.length })), rows(archived, restore)),
  ];
}

// ---- board ----

function card(item, ctx) {
  const d = item.data;
  const moves = {
    todo: [['start', 'doing']],
    doing: [['finish', 'done'], ['back', 'todo']],
    done: [['reopen', 'todo']],
  }[d.status];
  const meta = metaParts(d, ctx);
  return h('article', { class: 'tw:border tw:border-line tw:rounded-xo tw:bg-surface tw:p-2', draggable: 'true', 'data-task-id': item.id, tabindex: '-1' },
    button(d.title, { variant: 'row', class: 'row-main', onclick: () => editTask(item) }),
    meta.length > 0 && h('small', {}, meta.join(', ')),
    h('div', { class: 'tw:flex tw:flex-wrap tw:gap-2 tw:mt-2' },
      d.status !== 'done' && pickChip(item, d),
      moves.map(([key, to]) => button(t(`lists.tasks.move.${key}`), { class: 'small', onclick: () => setStatus(item, to).catch(fail) }))));
}

function boardView(visible, ctx) {
  const day = today();
  const board = h('div', { class: 'tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3' }, STATUSES.map((status) => {
    let mine = visible.filter((i) => i.data.status === status && (status !== 'done' || recentlyDone(i.data, day)));
    mine = status === 'done' ? mine.sort(byDoneDesc).slice(0, BOARD_DONE_MAX) : mine.sort(bySort);
    const col = h('section', { class: 'tw:border tw:border-line tw:rounded-xo tw:p-2', 'data-status': status },
      h('h2', {}, t(`lists.tasks.columns.${status}`), ' ', h('span', { class: 'meta' }, String(mine.length))),
      mine.length
        ? h('div', { class: 'tw:grid tw:gap-2' }, mine.map((i) => card(i, ctx)))
        : h('p', { class: 'empty' }, t('lists.tasks.column_empty')));
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('tw:bg-leaf-soft'); });
    col.addEventListener('dragleave', () => col.classList.remove('tw:bg-leaf-soft'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('tw:bg-leaf-soft');
      const item = store.get(e.dataTransfer.getData('text/plain'));
      if (item && item.kind === 'task') setStatus(item, status).catch(fail);
    });
    return col;
  }));
  board.addEventListener('dragstart', (e) => {
    const id = e.target.closest?.('[data-task-id]')?.dataset.taskId;
    if (id) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }
  });
  return board;
}

// ---- table ----

const SORTS = {
  done: (d) => (d.status === 'done' ? 1 : 0),
  title: (d) => d.title.toLowerCase(),
  priority: (d) => PRIORITIES.indexOf(d.priority),
  status: (d) => STATUSES.indexOf(d.status),
  due: (d) => d.due || '9999-99-99',
  tags: (d, ctx) => names(ctx.meta.tags, d.tags).join(' ').toLowerCase(),
  energy: (d) => ENERGIES.indexOf(d.energy),
  est: (d) => d.est || 0,
  subtasks: (d) => d.subtasks.length,
};

function tableView(visible, ctx, redraw) {
  const day = today();
  const rows = visible.filter((i) => i.data.status !== 'done' || recentlyDone(i.data, day));
  const shown = defs('task').filter((d) => d.show !== false);
  const custom = shown.find((d) => `cf_${d.id}` === tableSort.key);
  const key = custom
    ? (d) => (custom.type === 'number' ? Number(d.custom?.[custom.id]) || 0 : valueText(custom, d.custom?.[custom.id]).toLowerCase())
    : SORTS[tableSort.key];
  rows.sort((a, b) => {
    if (key) {
      const x = key(a.data, ctx);
      const y = key(b.data, ctx);
      if (x !== y) return (x < y ? -1 : 1) * tableSort.dir;
    }
    return bySort(a, b);
  });
  const priorities = text('forms.task.priorities');
  const energies = text('forms.task.energies');
  const columns = [...COLUMNS.map((c) => [c, t(`lists.tasks.table.${c}`)]), ...shown.map((d) => [`cf_${d.id}`, d.name])];
  const head = columns.map(([c, label]) => h('th', { scope: 'col', class: 'tw:text-left', 'aria-sort': tableSort.key === c ? (tableSort.dir > 0 ? 'ascending' : 'descending') : null },
    button(label, {
      variant: 'row',
      'aria-label': t('lists.tasks.table.sort', { column: label }),
      onclick: () => { tableSort = { key: c, dir: tableSort.key === c ? -tableSort.dir : 1 }; redraw(); },
    })));
  const body = rows.map((item) => {
    const d = item.data;
    return h('tr', { 'data-task-id': item.id, tabindex: '-1' },
      h('td', {}, checkbox({ checked: d.done, 'aria-label': t('lists.shared.done_aria', { title: d.title }), onchange: () => toggleTask(item).catch(fail) })),
      h('td', {}, button(d.title, { variant: 'row', class: 'row-main', onclick: () => editTask(item) })),
      h('td', {}, priorities[d.priority]),
      h('td', {}, t(`lists.tasks.columns.${d.status}`)),
      h('td', {}, d.due ? relDay(d.due) : ''),
      h('td', {}, names(ctx.meta.tags, d.tags).join(', ')),
      h('td', {}, energies[d.energy] && d.energy ? energies[d.energy] : ''),
      h('td', {}, d.est > 0 ? fmtDuration(d.est) : ''),
      h('td', {}, d.subtasks.length ? `${d.subtasks.filter((s) => s.done).length}/${d.subtasks.length}` : ''),
      shown.map((def) => h('td', {}, valueText(def, d.custom?.[def.id]))));
  });
  return h('div', { class: 'tw:overflow-x-auto' },
    h('table', { class: 'tw:w-full tw:text-sm' }, h('thead', {}, h('tr', {}, head)), h('tbody', {}, body)));
}

// ---- filters ----

function filterBar(p, ctx, redraw) {
  const set = (patch) => { savePrefs(patch); redraw(); };
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const group = (label, chips) => h('div', { role: 'group', 'aria-label': label, class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-2' },
    h('small', { class: 'tw:text-muted' }, label), h('div', { class: 'chips' }, chips));
  const focusOptions = [['', 'any'], ['low', 'low'], ['medium', 'medium'], ['high', 'high']];
  const customFilters = defs('task').filter((d) => d.show !== false && (d.type === 'choice' || d.type === 'yesno'));
  const ready = checkbox({ id: 'tf-ready', checked: p.readyOnly, onchange: (e) => set({ readyOnly: !!e.target.checked }) });
  return h('div', { class: 'tw:grid tw:gap-2 tw:my-3' },
    ctx.meta.tags.length > 0 && group(t('lists.tasks.filter.tags'), ctx.meta.tags.map((x) =>
      chip(x.name, { pressed: p.tags.includes(x.id), onclick: () => set({ tags: toggle(p.tags, x.id) }) }))),
    group(t('lists.tasks.filter.focus'), focusOptions.map(([value, key]) =>
      chip(t(`lists.tasks.filter.focus_${key}`), { pressed: p.focus === value, onclick: () => set({ focus: value }) }))),
    ctx.meta.places.length > 0 && group(t('lists.tasks.filter.places'), ctx.meta.places.map((x) =>
      chip(x.name, { pressed: p.places.includes(x.id), onclick: () => set({ places: toggle(p.places, x.id) }) }))),
    customFilters.map((def) => group(def.name, (def.type === 'yesno' ? [['yes', t('fields.yes')], ['no', t('fields.no')]] : (def.options || []).map((o) => [o, o])).map(([value, label]) => {
      const chosen = p.custom[def.id] || [];
      return chip(label, { pressed: chosen.includes(value), onclick: () => set({ custom: { ...p.custom, [def.id]: toggle(chosen, value) } }) });
    }))),
    field(t('lists.tasks.filter.ready_only'), ready),
    anyFilter(p) && h('div', {}, button(t('lists.tasks.filter.clear'), { class: 'small', onclick: () => set({ tags: [], focus: '', places: [], readyOnly: false, custom: {} }) })));
}

// ---- categories and places ----

// Takes a removed category or place off every task that carries it.
async function stripLabel(key, id) {
  for (const i of allTasks()) {
    if (i.data[key].includes(id)) await store.save('task', i.id, { ...i.data, [key]: i.data[key].filter((x) => x !== id) });
  }
}

function manage() {
  let meta = taskMeta();
  const body = h('div', { class: 'tw:grid tw:gap-4' });
  const commit = async (next) => {
    meta = next;
    await saveMeta(meta);
    draw();
  };
  const block = (key, heading, addLabel) => {
    const rows = meta[key].map((x, i) => {
      const box = input({ type: 'text', value: x.name, 'aria-label': x.name, autocomplete: 'off' });
      box.addEventListener('change', () => {
        const name = box.value.trim();
        commit({ ...meta, [key]: meta[key].map((y) => (y.id === x.id ? { ...y, name: name || y.name } : y)) }).catch(fail);
      });
      const swap = (to) => {
        const list = [...meta[key]];
        [list[i], list[to]] = [list[to], list[i]];
        commit({ ...meta, [key]: list }).catch(fail);
      };
      return h('li', { class: 'tw:flex tw:items-center tw:gap-2 tw:mt-2' }, box,
        button('^', { class: 'small', 'aria-label': t('lists.tasks.manage_up', { name: x.name }), disabled: i === 0, onclick: () => swap(i - 1) }),
        button('v', { class: 'small', 'aria-label': t('lists.tasks.manage_down', { name: x.name }), disabled: i === meta[key].length - 1, onclick: () => swap(i + 1) }),
        button('x', {
          class: 'small',
          'aria-label': t('lists.tasks.manage_remove', { name: x.name }),
          onclick: async () => {
            try {
              await stripLabel(key, x.id);
              await commit({ ...meta, [key]: meta[key].filter((y) => y.id !== x.id) });
            } catch (err) { fail(err); }
          },
        }));
    });
    const add = input({ type: 'text', placeholder: t('lists.tasks.manage_new'), 'aria-label': addLabel, autocomplete: 'off' });
    const form = h('form', {
      class: 'tw:flex tw:items-center tw:gap-2 tw:mt-2',
      onsubmit: (e) => {
        e.preventDefault();
        const name = add.value.trim();
        if (name) commit({ ...meta, [key]: [...meta[key], { id: uid(), name }] }).catch(fail);
      },
    }, add, button(addLabel, { type: 'submit', class: 'small' }));
    return h('section', {}, h('h3', {}, heading), h('ul', { class: 'tw:m-0 tw:p-0 tw:list-none' }, rows), form);
  };
  const draw = () => body.replaceChildren(
    h('p', { class: 'note' }, t('lists.tasks.manage_note')),
    block('tags', t('lists.tasks.manage_tags'), t('lists.tasks.manage_add_tag')),
    block('places', t('lists.tasks.manage_places'), t('lists.tasks.manage_add_place')));
  draw();
  openDialog(t('lists.tasks.manage'), body);
}


// ---- keys ----

// The task the keys act on, and the address it was chosen at: a redraw refocuses it, a change of screen forgets it.
let focused = null;

const rowEls = (root) => [...root.querySelectorAll('[data-task-id]')];
const rowById = (root, id) => rowEls(root).find((el) => el.dataset.taskId === id);

function currentId(root) {
  const el = document.activeElement?.closest?.('[data-task-id]');
  return el && root.contains(el) ? el.dataset.taskId : focused?.id || '';
}

function focusRow(el) {
  if (!el) return;
  focused = { id: el.dataset.taskId, hash: location.hash };
  el.focus();
  el.scrollIntoView?.({ block: 'nearest' });
}

function stepFocus(root, dir) {
  const els = rowEls(root).filter((el) => el.offsetParent !== null);
  if (!els.length) return;
  const at = els.findIndex((el) => el.dataset.taskId === currentId(root));
  focusRow(els[at < 0 ? (dir > 0 ? 0 : els.length - 1) : Math.min(els.length - 1, Math.max(0, at + dir))]);
}

// Shortcuts for the Tasks page: the keys come from keymap.js. Returns true when the key was used.
function taskKeys(root, e) {
  const action = matchKey('tasks', e);
  if (!action) return false;
  if (action === 'tasks.new') { focusControl(root.querySelector('[data-focus="task"]')); return true; }
  if (action === 'tasks.next' || action === 'tasks.next_alt') { stepFocus(root, 1); return true; }
  if (action === 'tasks.prev' || action === 'tasks.prev_alt') { stepFocus(root, -1); return true; }
  const view = { 'tasks.view_list': 'list', 'tasks.view_board': 'board', 'tasks.view_table': 'table' }[action];
  if (view) { savePrefs({ view }); location.hash = `#/tasks/${view}`; return true; }
  if (action === 'tasks.edit_alt' && e.target.closest?.('button, a, summary, [role="button"]')) return false;
  const id = currentId(root);
  const item = id && allTasks().find((i) => i.id === id);
  if (!item) return false;
  const d = item.data;
  if (action === 'tasks.edit' || action === 'tasks.edit_alt') editTask(item);
  else if (action === 'tasks.done') toggleTask(item).catch(fail);
  else if (action === 'tasks.pick') pickTask(item).catch(fail);
  else if (action === 'tasks.priority') saveTask(item.id, { ...d, priority: PRIORITIES[(PRIORITIES.indexOf(d.priority) + 1) % PRIORITIES.length] }).catch(fail);
  else if (action === 'tasks.left' || action === 'tasks.right') {
    const to = STATUSES[STATUSES.indexOf(d.status) + (action === 'tasks.right' ? 1 : -1)];
    if (to) setStatus(item, to).catch(fail);
  } else return false;
  return true;
}

// ---- screen ----

function redrawIn(root, param) {
  const page = root.id === 'view';
  const y = page ? window.scrollY : root.scrollTop;
  root.replaceChildren();
  render(root, param);
  if (page) window.scrollTo(0, y); else root.scrollTop = y;
}

/** Draws the Tasks screen. param is the view from the address (#/tasks/board); a widget keeps its own choice in root.dataset.tasksView. */
export function render(root, param) {
  const p = prefs();
  const page = root.id === 'view';
  const asked = (!page && root.dataset.tasksView) || param;
  const mode = VIEWS.includes(asked) ? asked : p.view;
  const day = today();
  const ctx = gather();
  const redraw = () => redrawIn(root, param);
  const setView = (v) => {
    savePrefs({ view: v });
    if (page) { location.hash = `#/tasks/${v}`; return; }
    root.dataset.tasksView = v;
    redrawIn(root, param);
  };
  // What the view would show with no filters, then what the filters leave.
  const base = ctx.items.filter((i) => {
    if (i.data.archived) return false;
    if (mode === 'list') return i.data.status !== 'done' || i.data.today === day;
    return i.data.status !== 'done' || recentlyDone(i.data, day);
  });
  const visible = base.filter((i) => matches(i.data, p, ctx.byId));
  const hidden = base.length - visible.length;
  const body = mode === 'board' ? boardView(visible, ctx) : mode === 'table' ? tableView(visible, ctx, redraw) : listView(visible, ctx, day);
  put(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('lists.tasks.heading')),
      h('div', { class: 'actions' },
        h('div', { role: 'group', 'aria-label': t('lists.tasks.view_aria'), class: 'chips' },
          VIEWS.map((v) => chip(t(`lists.tasks.views.${v}`), { pressed: v === mode, onclick: () => setView(v) }))),
        page && button(t('palette.open'), { onclick: openPalette }),
        button(t('lists.tasks.manage'), { onclick: manage }))),
    quickAdd(t('lists.tasks.add_placeholder'), {}, 'task', { preview: true }),
    filterBar(p, ctx, redraw),
    hidden > 0 && h('p', { class: 'note' }, t('lists.tasks.filter.hidden', { count: hidden })),
    body);
  if (page) {
    setScreenKeys((e) => taskKeys(root, e), 'tasks');
    if (focused && focused.hash !== location.hash) focused = null;
    const el = focused && document.activeElement === document.body && rowById(root, focused.id);
    if (el) el.focus({ preventScroll: true });
  }
}
