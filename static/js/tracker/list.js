// The List view: search, filters, saved views, a sortable table and bulk changes to ticked rows.
import * as M from './model.js';
import { t } from '../text.js';
import { button, checkbox, input, select } from '../ui.js';
import { fmtDay, h, openForm, toast, uid } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const COLUMNS = ['ref', 'title', 'status', 'priority', 'kind', 'area', 'owner', 'due', 'updated'];

// Built-in views, after NOBBIE's. filters as in M.matches().
export const BUILT_IN_VIEWS = [
  { id: 'open', filters: { open: true } },
  { id: 'all', filters: {} },
  { id: 'open-high', filters: { open: true, priority: 'high' } },
  { id: 'overdue', filters: { due: 'overdue' } },
  { id: 'due-week', filters: { due: 'week' } },
  { id: 'needs-test', filters: { status: 'needs test' } },
  { id: 'recent-closed', filters: { closedDays: 14 } },
  { id: 'parked', filters: { status: 'parked' } },
  { id: 'handover', filters: { kind: 'handover' } },
  { id: 'knowledge', filters: { kind: 'knowledge' } },
];

const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const sorted = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v != null && v !== false).sort());

// Items in scope (the chosen project, or every project), filtered and sorted.
export function visible(ui) {
  const list = M.items(ui.project === 'all' ? null : ui.project).filter((it) => M.matches(it, ui.filters));
  const { key, dir } = ui.sort;
  const val = (it) => {
    if (key === 'ref') return [M.ref(it).replace(/-\d+$/, ''), it.num];
    if (key === 'status' || key === 'priority') return [M.rank(it, key)];
    if (key === 'due') return [it.due || '9999'];
    return [String(it[key] ?? '').toLowerCase()];
  };
  return list.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return (va[i] < vb[i] ? -1 : 1) * dir;
    return 0;
  });
}

// Every value a filter can take in scope: the project's list, or all projects' lists together.
function choices(ui, key) {
  const ids = ui.project === 'all' ? M.projects().map((p) => p.id) : [ui.project];
  return [...new Set(ids.flatMap((id) => M.values(id, key)))];
}

function toolbar(root, ui, ctx) {
  const set = (k, v) => { ui.filters = { ...ui.filters, [k]: v }; ctx.save(); ctx.redraw(); };
  const search = input({ type: 'text', role: 'searchbox', placeholder: t('tracker.list.search'), 'aria-label': t('tracker.list.search'), value: ui.filters.q || '', 'data-focus': 'search', class: 'tw:w-auto tw:min-w-[14rem]' });
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => set('q', search.value.trim()), 250); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.blur(); } });

  const user = M.savedViews();
  const current = BUILT_IN_VIEWS.find((v) => same(v.filters, { ...ui.filters, q: '' }))?.id
    || user.find((v) => same(v.filters, { ...ui.filters, q: '' }))?.id || '';
  const viewSel = select([
    ['', t('tracker.list.custom_view')],
    ...BUILT_IN_VIEWS.map((v) => [v.id, t(`tracker.views.${v.id}`)]),
    ...user.map((v) => [v.id, v.name]),
  ], { value: current, 'aria-label': t('tracker.list.view'), class: 'tw:w-auto tw:max-w-[16rem]' });
  viewSel.addEventListener('change', () => {
    const v = [...BUILT_IN_VIEWS, ...user].find((x) => x.id === viewSel.value);
    if (v) { ui.filters = { ...v.filters, q: ui.filters.q || '' }; ctx.save(); ctx.redraw(); }
  });

  const filterSel = (key) => {
    const s = select([['', t(`tracker.list.any.${key}`)], ...choices(ui, key).map((v) => [v, v])], { value: ui.filters[key] || '', 'aria-label': t(`tracker.fields.${key}`), class: 'tw:w-auto' });
    s.addEventListener('change', () => set(key, s.value));
    return s;
  };
  const labels = [...new Set((ui.project === 'all' ? M.projects() : [{ id: ui.project }]).flatMap((p) => M.labelsIn(p.id)))].sort();
  const labelSel = select([['', t('tracker.list.any.label')], ...labels.map((l) => [l, l])], { value: ui.filters.label || '', 'aria-label': t('tracker.fields.labels'), class: 'tw:w-auto' });
  labelSel.addEventListener('change', () => set('label', labelSel.value));
  const dueSel = select([['', t('tracker.list.any.due')], ...['overdue', 'week', 'set'].map((v) => [v, t(`tracker.list.due.${v}`)])], { value: ui.filters.due || '', 'aria-label': t('tracker.fields.due'), class: 'tw:w-auto' });
  dueSel.addEventListener('change', () => set('due', dueSel.value));
  const openBox = checkbox({ checked: !!ui.filters.open, id: 'tr-open-only' });
  openBox.addEventListener('change', () => set('open', openBox.checked));

  const saveView = button(t('tracker.list.save_view'), {
    class: 'small',
    onclick: () => openForm({
      title: t('tracker.list.save_view'),
      fields: [{ name: 'name', label: t('tracker.list.view_name'), required: true }],
      onSave: async ({ name }) => {
        if (!name) return t('tracker.list.view_name_needed');
        const filters = { ...ui.filters };
        delete filters.q; // A view keeps the filters, not the search words.
        await M.saveViews([...M.savedViews(), { id: `v-${uid().slice(0, 8)}`, name, filters }]);
        ctx.redraw();
      },
    }),
  });
  const userView = user.find((v) => v.id === current);
  const dropView = userView && button(t('tracker.list.delete_view'), {
    class: 'small',
    onclick: async () => { await M.saveViews(user.filter((v) => v.id !== userView.id)).catch(fail); ctx.redraw(); },
  });
  const clear = button(t('tracker.list.clear'), { class: 'small', onclick: () => { ui.filters = {}; ctx.save(); ctx.redraw(); } });

  root.append(h('div', { class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-2' },
    search, viewSel, saveView, dropView, clear),
  h('div', { class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-2' },
    ...M.FIELDS.map(filterSel), labelSel, dueSel,
    h('label', { class: 'tw:inline-flex tw:items-center tw:gap-2', for: 'tr-open-only' }, openBox, t('tracker.list.open_only'))));
}

function bulkBar(root, ui, ctx, rows) {
  if (!ui.checked.size) return;
  const ids = [...ui.checked];
  const projectIds = [...new Set(ids.map((id) => M.item(id)?.project).filter(Boolean))];
  // A pick-list change is offered only for values every ticked item's project has.
  const common = (key) => projectIds.map((p) => M.values(p, key)).reduce((a, b) => a.filter((v) => b.includes(v)));
  const run = async (changes) => {
    try {
      const n = await M.bulkUpdate(ids, changes);
      toast(t('tracker.bulk.done', { n: String(n) }));
      ui.checked.clear();
      ctx.redraw();
    } catch (err) { fail(err); }
  };
  const bulkSel = (key) => {
    const s = select([['', t(`tracker.bulk.set.${key}`)], ...common(key).map((v) => [v, v])], { 'aria-label': t(`tracker.bulk.set.${key}`), class: 'tw:w-auto' });
    s.addEventListener('change', () => s.value && run({ [key]: s.value }));
    return s;
  };
  const label = input({ placeholder: t('tracker.bulk.add_label'), 'aria-label': t('tracker.bulk.add_label'), class: 'tw:max-w-[12rem]' });
  label.addEventListener('keydown', (e) => { if (e.key === 'Enter' && label.value.trim()) run({ addLabel: label.value.trim() }); });
  root.append(h('div', { class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-xo tw:bg-leaf-soft tw:p-2', role: 'region', 'aria-label': t('tracker.bulk.aria') },
    h('strong', {}, t('tracker.bulk.count', { n: String(ids.length) })),
    ...M.FIELDS.map(bulkSel), label,
    button(t('tracker.bulk.close'), { class: 'small', onclick: () => run({ close: true }) }),
    button(t('tracker.bulk.select_all'), { class: 'small', onclick: () => { rows.filter((r) => !r.readOnly).forEach((r) => ui.checked.add(r.id)); ctx.redraw(); } }),
    button(t('tracker.bulk.clear'), { class: 'small', onclick: () => { ui.checked.clear(); ctx.redraw(); } })));
}

export function cellText(it, key) {
  if (key === 'ref') return M.ref(it);
  if (key === 'due') return it.due ? fmtDay(it.due) : '';
  if (key === 'updated') return it.updated ? fmtDay(it.updated.slice(0, 10)) : '';
  return it[key] || '';
}

export function renderList(root, ctx) {
  const { ui } = ctx;
  const rows = visible(ui);
  ui.order = rows.map((r) => r.id);
  toolbar(root, ui, ctx);
  bulkBar(root, ui, ctx, rows);
  if (!rows.length) {
    root.append(h('p', { class: 'empty' }, t('tracker.list.empty')));
    return;
  }
  const head = (key) => {
    const on = ui.sort.key === key;
    return h('th', { scope: 'col', 'aria-sort': on ? (ui.sort.dir > 0 ? 'ascending' : 'descending') : 'none', class: 'tw:text-left tw:p-2 tw:whitespace-nowrap' },
      h('button', {
        type: 'button',
        class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:font-semibold tw:text-muted tw:cursor-pointer',
        onclick: () => { ui.sort = { key, dir: on ? -ui.sort.dir : 1 }; ctx.save(); ctx.redraw(); },
      }, t(`tracker.fields.${key}`), on ? (ui.sort.dir > 0 ? ' ▴' : ' ▾') : ''));
  };
  const row = (it) => {
    // NOBBIE's items are read-only, so they have no tick for bulk changes.
    const tick = it.readOnly ? null : checkbox({ checked: ui.checked.has(it.id), 'aria-label': t('tracker.list.tick', { ref: M.ref(it) }) });
    tick?.addEventListener('change', () => { if (tick.checked) ui.checked.add(it.id); else ui.checked.delete(it.id); ctx.redraw(); });
    const sel = ui.selected === it.id;
    const closed = M.isClosed(it);
    return h('tr', { class: `tw:border-t tw:border-line ${sel ? 'tw:bg-leaf-soft' : ''} ${closed ? 'tw:text-muted' : ''}`, 'data-id': it.id, 'aria-selected': sel ? 'true' : 'false' },
      h('td', { class: 'tw:p-2' }, tick),
      ...COLUMNS.map((key) => {
        if (key === 'title') {
          return h('td', { class: 'tw:p-2 tw:w-full' },
            h('button', { type: 'button', class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:font-semibold tw:cursor-pointer tw:text-ink', 'data-open': it.id, onclick: () => ctx.select(it.id) },
              it.title || t('tracker.untitled')),
            (it.labels || []).length ? h('span', { class: 'tw:ml-2 tw:text-muted tw:text-sm' }, it.labels.join(', ')) : null,
            (it.checklist || []).length ? h('span', { class: 'tw:ml-2 tw:text-muted tw:text-sm' }, t('tracker.checklist_progress', { done: String(it.checklist.filter((c) => c.done).length), all: String(it.checklist.length) })) : null);
        }
        const overdue = key === 'due' && M.isOverdue(it);
        return h('td', { class: `tw:p-2 tw:whitespace-nowrap ${overdue ? 'tw:text-danger tw:font-semibold' : ''}` }, cellText(it, key));
      }));
  };
  root.append(h('p', { class: 'tw:text-muted tw:text-sm' }, t('tracker.list.count', { n: String(rows.length) })),
    h('div', { class: 'tw:overflow-x-auto' },
      h('table', { class: 'tw:w-full tw:border-collapse tw:text-sm', 'aria-label': t('tracker.list.table_aria') },
        h('thead', {}, h('tr', {}, h('th', { class: 'tw:p-2' }, h('span', { class: 'tw:sr-only' }, t('tracker.list.tick_head'))), ...COLUMNS.map(head))),
        h('tbody', {}, rows.map(row)))));
}
