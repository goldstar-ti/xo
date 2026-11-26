// An item's details: title, fields, labels, due date, description, test steps, checklist, links,
// close and reopen, comments and history. Every field saves when it changes (text fields when the
// focus leaves them), and each change lands in the item's history.
import * as M from './model.js';
import { loadNobbieItem, nobbieLink } from './nobbie.js';
import { t } from '../text.js';
import { button, checkbox, field, input, select, textarea } from '../ui.js';
import { fmtDay, fmtTime, h, hm, toast } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${fmtDay(iso.slice(0, 10))}, ${fmtTime(hm(d))}`; };
const section = (title, ...kids) => h('section', { class: 'tw:flex tw:flex-col tw:gap-2 tw:border-t tw:border-line tw:pt-3' }, h('h3', { class: 'tw:text-base' }, title), ...kids);

// A text control that saves when it loses focus (or on Enter for one-line fields).
function saving(control, save) {
  let last = control.value;
  const commit = () => { if (control.value !== last) { last = control.value; save(control.value).catch(fail); } };
  control.addEventListener('change', commit);
  control.addEventListener('blur', commit);
  return control;
}

function fields(it, id) {
  const l = M.lists(it.project);
  const pick = (key) => {
    const opts = l[key].map((x) => [x.v, x.v]);
    if (it[key] && !opts.some(([v]) => v === it[key])) opts.unshift([it[key], it[key]]);
    const s = select(opts, { id: `tr-f-${key}`, value: it[key], 'data-field': key });
    s.addEventListener('change', () => M.updateItem(id, { [key]: s.value }).catch(fail));
    return field(t(`tracker.fields.${key}`), s, null, { half: true });
  };
  const due = saving(input({ type: 'date', id: 'tr-f-due', value: it.due || '' }), (v) => M.updateItem(id, { due: v }));
  const labels = saving(input({ id: 'tr-f-labels', value: (it.labels || []).join(', '), placeholder: t('tracker.detail.labels_hint') }),
    (v) => { labels.value = M.normaliseLabels(v).join(', '); return M.updateItem(id, { labels: v }); });
  return h('div', { class: 'fields' }, ...M.FIELDS.map(pick),
    field(t('tracker.fields.due'), due, M.isOverdue(it) ? t('tracker.detail.overdue') : null, { half: true }),
    field(t('tracker.fields.labels'), labels, null, { half: true }));
}

function checklist(it, id) {
  const list = (it.checklist || []).map((c) => ({ ...c }));
  const save = () => M.setChecklist(id, list).catch(fail);
  const rows = list.map((c, i) => {
    const box = checkbox({ checked: !!c.done, 'aria-label': c.t });
    box.addEventListener('change', () => { list[i].done = box.checked; save(); });
    const del = button('×', { class: 'small', 'aria-label': t('tracker.detail.check_remove', { name: c.t }), onclick: () => { list.splice(i, 1); save(); } });
    return h('li', { class: 'tw:flex tw:items-center tw:gap-2' }, box,
      h('span', { class: `tw:flex-1 ${c.done ? 'tw:line-through tw:text-muted' : ''}` }, c.t), del);
  });
  const add = input({ placeholder: t('tracker.detail.check_add'), 'aria-label': t('tracker.detail.check_add'), 'data-focus': 'check' });
  add.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !add.value.trim()) return;
    e.preventDefault();
    list.push({ t: add.value.trim(), done: false });
    add.value = '';
    save();
  });
  const done = list.filter((c) => c.done).length;
  return section(list.length ? t('tracker.detail.checklist_n', { done: String(done), all: String(list.length) }) : t('tracker.detail.checklist'),
    h('ul', { class: 'tw:flex tw:flex-col tw:gap-1' }, rows), add);
}

function links(it, id, ctx) {
  const l = M.lists(it.project);
  const rows = M.linksFor(id).map((x) => h('li', { class: 'tw:flex tw:items-center tw:gap-2' },
    h('span', { class: 'tw:text-muted tw:text-sm tw:w-28' }, x.label),
    h('button', { type: 'button', class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:flex-1 tw:text-left tw:cursor-pointer tw:text-leaf', onclick: () => ctx.select(x.item.id) },
      `${M.ref(x.item)} ${x.item.title}`, M.isClosed(x.item) ? ` (${x.item.status})` : ''),
    button('×', {
      class: 'small',
      'aria-label': t('tracker.detail.link_remove', { ref: M.ref(x.item) }),
      onclick: () => (x.own ? M.removeLink(id, x.item.id, x.type) : M.removeLink(x.item.id, id, x.type)).catch(fail),
    })));
  const type = select(l.link.map((x) => [x.v, x.v]), { 'aria-label': t('tracker.detail.link_type'), class: 'tw:w-auto' });
  const target = input({ placeholder: t('tracker.detail.link_target'), 'aria-label': t('tracker.detail.link_target'), list: 'tr-refs' });
  const options = h('datalist', { id: 'tr-refs' }, M.items().filter((o) => o.id !== id).map((o) => h('option', { value: M.ref(o) }, o.title)));
  const addLink = async () => {
    const other = M.byRef(target.value.trim());
    if (!other) { toast(t('tracker.detail.link_unknown'), 'bad'); return; }
    await M.addLink(id, other.id, type.value).catch(fail);
  };
  target.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });
  return section(t('tracker.detail.links'), rows.length ? h('ul', { class: 'tw:flex tw:flex-col tw:gap-1' }, rows) : null,
    h('div', { class: 'tw:flex tw:flex-wrap tw:gap-2' }, type, target, button(t('tracker.detail.link_add'), { class: 'small', onclick: addLink }), options));
}

function closing(it, id) {
  if (M.isClosed(it)) {
    return h('div', { class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-2' },
      h('span', { class: 'tw:text-muted' }, (it.closed_at ? t('tracker.detail.closed_on', { day: fmtDay(it.closed_at.slice(0, 10)) }) : t('tracker.detail.closed')), it.resolution ? `: ${it.resolution}` : ''),
      button(t('tracker.detail.reopen'), { class: 'small', onclick: () => M.reopenItem(id).catch(fail) }));
  }
  const statuses = M.lists(it.project).status.filter((s) => s.closed);
  const status = select(statuses.map((s) => [s.v, s.v]), { 'aria-label': t('tracker.detail.close_as'), class: 'tw:w-auto' });
  const why = input({ placeholder: t('tracker.detail.resolution'), 'aria-label': t('tracker.detail.resolution') });
  return h('div', { class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-2' }, status, why,
    button(t('tracker.detail.close'), { class: 'small', onclick: () => M.closeItem(id, { status: status.value, resolution: why.value.trim() }).catch(fail) }));
}

function comments(it, id) {
  const box = textarea({ rows: 2, placeholder: t('tracker.detail.comment_add'), 'aria-label': t('tracker.detail.comment_add'), 'data-focus': 'comment' });
  const add = async () => { const v = box.value.trim(); if (!v) return; box.value = ''; await M.addComment(id, v).catch(fail); };
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
  return section(t('tracker.detail.comments'),
    ...(it.comments || []).map((c) => h('div', { class: 'tw:rounded-xo tw:bg-paper tw:p-2' },
      h('p', { class: 'tw:text-muted tw:text-xs' }, when(c.at)), h('p', { class: 'pre' }, c.text))),
    box, h('div', {}, button(t('tracker.detail.comment_save'), { class: 'small', onclick: add })));
}

export function eventText(ev) {
  if (ev.type === 'changed') return t('tracker.events.changed', { field: t(`tracker.fields.${ev.field}`), from: ev.from || t('tracker.events.blank'), to: ev.to || t('tracker.events.blank') });
  if (ev.type === 'edited') return t('tracker.events.edited', { field: t(`tracker.fields.${ev.field}`) });
  if (ev.type === 'closed') return ev.to ? t('tracker.events.closed_why', { why: ev.to }) : t('tracker.events.closed');
  if (ev.type === 'comment') return t('tracker.events.comment', { text: ev.to || '' });
  return t(`tracker.events.${ev.type}`);
}

function historyList(it) {
  const events = [...(it.events || [])].reverse();
  return h('details', { class: 'tw:border-t tw:border-line tw:pt-2' },
    h('summary', {}, t('tracker.detail.history_n', { n: String(events.length) })),
    h('ul', { class: 'tw:flex tw:flex-col tw:gap-1 tw:text-sm' }, events.map((ev) => h('li', {},
      h('span', { class: 'tw:text-muted' }, when(ev.at), ' '), eventText(ev)))));
}

// A NOBBIE item: shown, never changed. Its comments and history load the first time it opens.
const asked = new Set();
function renderReadOnly(root, ctx, it) {
  if (!asked.has(it.num)) {
    asked.add(it.num);
    loadNobbieItem(it.num).catch((err) => toast(err.message, 'bad'));
  }
  const row = (key) => h('div', { class: 'tw:flex tw:gap-2' }, h('dt', { class: 'tw:w-24 tw:flex-none tw:text-muted' }, t(`tracker.fields.${key}`)), h('dd', {}, it[key] || '-'));
  const link = nobbieLink(it.num);
  root.append(h('div', { class: 'tw:flex tw:flex-col tw:gap-3' },
    h('div', { class: 'tw:flex tw:items-center tw:justify-between tw:gap-2' },
      h('span', { class: 'tw:font-figures tw:text-muted' }, M.ref(it), ' \u00b7 NOBBIE'),
      button(t('tracker.detail.back'), { class: 'small', 'data-focus': 'back', onclick: () => ctx.select(null) })),
    h('h2', { class: 'tw:text-lg' }, it.title),
    h('p', { class: 'note' }, t('tracker.nobbie.read_only'), ' ', link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, t('tracker.nobbie.open')) : null),
    h('dl', { class: 'tw:flex tw:flex-col tw:gap-1 tw:text-sm' }, ...M.FIELDS.map(row), it.source ? h('div', { class: 'tw:flex tw:gap-2' }, h('dt', { class: 'tw:w-24 tw:flex-none tw:text-muted' }, t('tracker.nobbie.source')), h('dd', {}, it.source)) : null),
    it.body ? section(t('tracker.fields.body'), h('p', { class: 'pre tw:text-sm' }, it.body)) : null,
    it.test_steps ? section(t('tracker.fields.test_steps'), h('p', { class: 'pre tw:text-sm' }, it.test_steps)) : null,
    section(t('tracker.detail.comments'), (it.comments || []).length
      ? (it.comments || []).map((c) => h('div', { class: 'tw:rounded-xo tw:bg-paper tw:p-2' },
        h('p', { class: 'tw:text-muted tw:text-xs' }, c.at ? when(c.at) : '', c.by ? ` \u00b7 ${c.by}` : ''), h('p', { class: 'pre' }, c.text)))
      : h('p', { class: 'tw:text-muted tw:text-sm' }, t('tracker.nobbie.no_comments'))),
    historyList(it)));
}

export function renderDetail(root, ctx, id) {
  const it = M.item(id);
  if (!it) return;
  if (it.readOnly) { renderReadOnly(root, ctx, it); return; }
  const p = M.project(it.project);
  const title = saving(input({ value: it.title, 'aria-label': t('tracker.fields.title'), 'data-focus': 'title', class: 'tw:text-lg tw:font-semibold' }),
    (v) => M.updateItem(id, { title: v.trim() }));
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });
  const body = saving(textarea({ id: 'tr-f-body', rows: 5, value: it.body || '' }), (v) => M.updateItem(id, { body: v }));
  const steps = saving(textarea({ id: 'tr-f-steps', rows: 3, value: it.test_steps || '' }), (v) => M.updateItem(id, { test_steps: v }));
  let armed = false;
  const del = button(t('tracker.detail.delete'), { variant: 'danger', class: 'small' });
  del.addEventListener('click', async () => {
    if (!armed) { armed = true; del.textContent = t('common.delete_confirm'); return; }
    await M.deleteItem(id).catch(fail);
    ctx.select(null);
  });
  root.append(h('div', { class: 'tw:flex tw:flex-col tw:gap-3' },
    h('div', { class: 'tw:flex tw:items-center tw:justify-between tw:gap-2' },
      h('span', { class: 'tw:font-figures tw:text-muted' }, M.ref(it), ' · ', p?.name || ''),
      button(t('tracker.detail.back'), { class: 'small', 'data-focus': 'back', onclick: () => ctx.select(null) })),
    title,
    fields(it, id),
    field(t('tracker.fields.body'), body),
    field(t('tracker.fields.test_steps'), steps),
    checklist(it, id),
    links(it, id, ctx),
    section(t('tracker.detail.state'), closing(it, id)),
    comments(it, id),
    historyList(it),
    h('div', {}, del)));
}
