// The report views: Needs test, Handover, Pivot, History and Activity. Each reads the items in
// scope (the chosen project or all of them) and keeps the list's search and filters where they
// make sense.
import * as M from './model.js';
import { card } from './board.js';
import { eventText } from './detail.js';
import { visible } from './list.js';
import { t } from '../text.js';
import { button, select, textarea } from '../ui.js';
import { fmtDay, fmtTime, h, hm, toast } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const scope = (ui) => M.items(ui.project === 'all' ? null : ui.project);
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- Needs test: items waiting for a check, with their test steps and Pass or Fail ----
export function renderNeedsTest(root, ctx) {
  const rows = scope(ctx.ui).filter((it) => it.status === 'needs test' && M.matches(it, { q: ctx.ui.filters.q }));
  ctx.ui.order = rows.map((r) => r.id);
  root.append(h('p', { class: 'note' }, t('tracker.needs_test.intro')));
  if (!rows.length) { root.append(h('p', { class: 'empty' }, t('tracker.needs_test.empty'))); return; }
  for (const it of rows) {
    const note = textarea({ rows: 2, placeholder: t('tracker.needs_test.fail_note'), 'aria-label': t('tracker.needs_test.fail_note') });
    const passTo = M.lists(it.project).status.find((s) => s.v === 'verified') ? 'verified' : M.lists(it.project).status.find((s) => s.closed)?.v;
    const failTo = M.values(it.project, 'status').includes('in progress') ? 'in progress' : M.values(it.project, 'status')[0];
    root.append(h('article', { class: 'tw:flex tw:flex-col tw:gap-2 tw:border-t tw:border-line tw:py-3', 'data-id': it.id },
      h('button', { type: 'button', class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:font-semibold tw:cursor-pointer', onclick: () => ctx.select(it.id) }, `${M.ref(it)} ${it.title}`),
      it.test_steps ? h('p', { class: 'pre tw:text-sm' }, it.test_steps) : h('p', { class: 'tw:text-muted tw:text-sm' }, t('tracker.needs_test.no_steps')),
      it.readOnly ? null : note,
      it.readOnly ? null : h('div', { class: 'tw:flex tw:gap-2' },
        button(t('tracker.needs_test.pass'), { variant: 'primary', class: 'small', onclick: () => M.updateItem(it.id, { status: passTo }).catch(fail) }),
        button(t('tracker.needs_test.fail'), {
          class: 'small',
          onclick: () => M.updateItem(it.id, { status: failTo }).then(() => note.value.trim() && M.addComment(it.id, note.value.trim())).catch(fail),
        }))));
  }
}

// ---- Handover: items of kind "handover", done against open ----
export function renderHandover(root, ctx) {
  const rows = scope(ctx.ui).filter((it) => it.kind === 'handover');
  ctx.ui.order = rows.map((r) => r.id);
  const done = rows.filter(M.isClosed);
  const pct = rows.length ? Math.round((done.length / rows.length) * 100) : 0;
  root.append(h('p', { class: 'note' }, t('tracker.handover.intro')));
  if (!rows.length) { root.append(h('p', { class: 'empty' }, t('tracker.handover.empty'))); return; }
  root.append(
    h('p', { class: 'tw:font-semibold' }, t('tracker.handover.progress', { done: String(done.length), all: String(rows.length), pct: String(pct) })),
    h('div', { class: 'tw:h-3 tw:rounded-pill tw:bg-surface tw:border-rule tw:border-line', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': t('tracker.handover.bar') },
      h('div', { class: 'tw:h-full tw:rounded-pill tw:bg-leaf', style: `width: ${pct}%` })),
    h('div', { class: 'tw:grid tw:gap-2 tw:sm:grid-cols-2' }, rows.filter((r) => !M.isClosed(r)).map((it) => card(it, ctx, { draggable: false }))),
    done.length ? h('details', {}, h('summary', {}, t('tracker.handover.done_n', { n: String(done.length) })),
      h('div', { class: 'tw:grid tw:gap-2 tw:sm:grid-cols-2' }, done.map((it) => card(it, ctx, { draggable: false })))) : null);
}

// ---- Pivot: counts of items by one field down and another across ----
const PIVOT_FIELDS = ['status', 'kind', 'priority', 'area', 'owner', 'project', 'label', 'due'];
function pivotValues(it, key) {
  if (key === 'project') return [M.project(it.project)?.name || '?'];
  if (key === 'label') return (it.labels || []).length ? it.labels : [t('tracker.pivot.none')];
  if (key === 'due') return [!it.due ? t('tracker.pivot.no_due') : M.isOverdue(it) ? t('tracker.pivot.overdue') : t('tracker.pivot.due_later')];
  return [it[key] || t('tracker.pivot.none')];
}

export function renderPivot(root, ctx) {
  const { ui } = ctx;
  ui.pivot = ui.pivot || { rows: 'status', cols: 'priority' };
  const rows = visible({ ...ui, sort: { key: 'ref', dir: 1 } });
  const pickRows = select(PIVOT_FIELDS.map((f) => [f, t(`tracker.fields.${f}`)]), { value: ui.pivot.rows, 'aria-label': t('tracker.pivot.rows'), class: 'tw:w-auto' });
  const pickCols = select(PIVOT_FIELDS.map((f) => [f, t(`tracker.fields.${f}`)]), { value: ui.pivot.cols, 'aria-label': t('tracker.pivot.cols'), class: 'tw:w-auto' });
  pickRows.addEventListener('change', () => { ui.pivot.rows = pickRows.value; ctx.redraw(); });
  pickCols.addEventListener('change', () => { ui.pivot.cols = pickCols.value; ctx.redraw(); });
  const counts = new Map();
  const rowKeys = new Set();
  const colKeys = new Set();
  for (const it of rows) {
    for (const r of pivotValues(it, ui.pivot.rows)) {
      for (const c of pivotValues(it, ui.pivot.cols)) {
        rowKeys.add(r); colKeys.add(c);
        counts.set(`${r}\u0000${c}`, (counts.get(`${r}\u0000${c}`) || 0) + 1);
      }
    }
  }
  const rk = [...rowKeys].sort();
  const ck = [...colKeys].sort();
  const sum = (pred) => [...counts].filter(([k]) => pred(k.split('\u0000'))).reduce((a, [, v]) => a + v, 0);
  // A cell sets the list filters it can express and opens the List.
  const drill = (r, c) => {
    const f = { ...ui.filters, open: false };
    for (const [key, v] of [[ui.pivot.rows, r], [ui.pivot.cols, c]]) {
      if (M.FIELDS.includes(key) && v != null) f[key] = v;
      if (key === 'label' && v != null && v !== t('tracker.pivot.none')) f.label = v;
    }
    ui.filters = f;
    ctx.setTab('list');
  };
  const cell = (n, r, c) => h('td', { class: 'tw:p-2 tw:text-right tw:font-figures' },
    n ? h('button', { type: 'button', class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:cursor-pointer tw:text-leaf', onclick: () => drill(r, c) }, String(n)) : '');
  root.append(
    h('p', { class: 'note' }, t('tracker.pivot.intro')),
    h('div', { class: 'tw:flex tw:flex-wrap tw:gap-2' }, pickRows, pickCols),
    rows.length ? h('div', { class: 'tw:overflow-x-auto' }, h('table', { class: 'tw:border-collapse tw:text-sm', 'aria-label': t('tracker.pivot.table_aria') },
      h('thead', {}, h('tr', {}, h('th', { class: 'tw:p-2' }), ck.map((c) => h('th', { scope: 'col', class: 'tw:p-2 tw:text-right' }, c)), h('th', { scope: 'col', class: 'tw:p-2 tw:text-right' }, t('tracker.pivot.total')))),
      h('tbody', {}, rk.map((r) => h('tr', { class: 'tw:border-t tw:border-line' },
        h('th', { scope: 'row', class: 'tw:p-2 tw:text-left' }, r),
        ck.map((c) => cell(counts.get(`${r}\u0000${c}`) || 0, r, c)),
        cell(sum(([a]) => a === r), r, null))),
      h('tr', { class: 'tw:border-t tw:border-line tw:font-semibold' }, h('th', { scope: 'row', class: 'tw:p-2 tw:text-left' }, t('tracker.pivot.total')),
        ck.map((c) => cell(sum(([, b]) => b === c), null, c)), h('td', { class: 'tw:p-2 tw:text-right tw:font-figures' }, String(rows.length))))))
      : h('p', { class: 'empty' }, t('tracker.list.empty')));
}

// ---- History: every change across the items in scope, newest first ----
export function renderHistory(root, ctx) {
  const rows = scope(ctx.ui).filter((it) => M.matches(it, { q: ctx.ui.filters.q }));
  const all = rows.flatMap((it) => (it.events || []).map((ev) => ({ ev, it }))).sort((a, b) => b.ev.at.localeCompare(a.ev.at)).slice(0, 300);
  root.append(h('p', { class: 'note' }, t('tracker.history.intro')));
  if (!all.length) { root.append(h('p', { class: 'empty' }, t('tracker.history.empty'))); return; }
  let day = '';
  const list = h('ul', { class: 'tw:flex tw:flex-col tw:gap-1 tw:text-sm' });
  for (const { ev, it } of all) {
    const d = ev.at.slice(0, 10);
    if (d !== day) { day = d; list.append(h('li', { class: 'tw:pt-3 tw:font-semibold' }, fmtDay(d))); }
    list.append(h('li', { class: 'tw:flex tw:gap-2' },
      h('span', { class: 'tw:text-muted tw:w-16 tw:flex-none' }, fmtTime(hm(new Date(ev.at)))),
      h('button', { type: 'button', class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:cursor-pointer tw:text-leaf tw:flex-none', onclick: () => ctx.select(it.id) }, M.ref(it)),
      h('span', {}, eventText(ev))));
  }
  root.append(list);
}

// ---- Activity: items opened and closed each week, the last twelve weeks ----
export function renderActivity(root, ctx) {
  const rows = scope(ctx.ui);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const inWeek = (iso) => iso && Date.parse(iso) >= start.getTime() && Date.parse(iso) < end.getTime();
    weeks.push({ start: ymdOf(start), opened: rows.filter((it) => inWeek(it.created)).length, closed: rows.filter((it) => inWeek(it.closed_at)).length });
  }
  const max = Math.max(1, ...weeks.flatMap((w) => [w.opened, w.closed]));
  const bar = (n, cls) => h('div', { class: `tw:h-3 tw:rounded-pill ${cls}`, style: `width: ${(n / max) * 100}%` });
  const open = rows.filter((it) => !M.isClosed(it)).length;
  root.append(
    h('p', { class: 'note' }, t('tracker.activity.intro')),
    h('p', { class: 'tw:font-semibold' }, t('tracker.activity.open_now', { n: String(open), overdue: String(rows.filter(M.isOverdue).length) })),
    h('table', { class: 'tw:w-full tw:max-w-2xl tw:border-collapse tw:text-sm', 'aria-label': t('tracker.activity.table_aria') },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', class: 'tw:p-2 tw:text-left' }, t('tracker.activity.week')),
        h('th', { scope: 'col', class: 'tw:p-2 tw:text-right' }, t('tracker.activity.opened')),
        h('th', { scope: 'col', class: 'tw:p-2 tw:text-right' }, t('tracker.activity.closed')),
        h('th', { scope: 'col', class: 'tw:p-2 tw:w-1/2' }, h('span', { class: 'tw:sr-only' }, t('tracker.activity.bars'))))),
      h('tbody', {}, weeks.map((w) => h('tr', { class: 'tw:border-t tw:border-line' },
        h('td', { class: 'tw:p-2' }, fmtDay(w.start)),
        h('td', { class: 'tw:p-2 tw:text-right tw:font-figures' }, String(w.opened)),
        h('td', { class: 'tw:p-2 tw:text-right tw:font-figures' }, String(w.closed)),
        h('td', { class: 'tw:p-2' }, h('div', { class: 'tw:flex tw:flex-col tw:gap-1' }, bar(w.opened, 'tw:bg-ochre'), bar(w.closed, 'tw:bg-leaf'))))))),
    h('p', { class: 'tw:text-muted tw:text-sm' }, t('tracker.activity.key')));
}
