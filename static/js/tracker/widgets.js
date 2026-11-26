// Tracker widgets for the Canvas screen: Tracker due, Tracker summary and Tracker board. Each
// redraws when the store changes; choosing an item opens it on the Tracker screen.
import * as store from '../store.js';
import * as M from './model.js';
import { renderBoard } from './board.js';
import { loadNobbie, nobbieState, onNobbie } from './nobbie.js';
import { t } from '../text.js';
import { dialogOpen, fmtDay, h } from '../util.js';

const go = (it) => { location.hash = `#/tracker/${M.ref(it)}`; };

// A render function that redraws `draw(body)` on store changes, waiting while a dialog is open.
function liveWidget(draw) {
  return (body) => {
    const paint = () => { body.replaceChildren(); draw(body); };
    paint();
    let pending = false;
    const changed = () => { if (dialogOpen()) pending = true; else paint(); };
    const off = store.onChange(changed);
    const offNobbie = onNobbie(changed);
    if (nobbieState().enabled === null) loadNobbie();
    const onClose = () => { if (pending && !dialogOpen()) { pending = false; paint(); } };
    document.addEventListener('close', onClose, true);
    return () => { off(); offNobbie(); document.removeEventListener('close', onClose, true); };
  };
}

// Open items with a due date, soonest first; overdue ones first of all.
export const due = liveWidget((body) => {
  const rows = M.items().filter((it) => it.due && !M.isClosed(it)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 30);
  if (!rows.length) { body.append(h('p', { class: 'empty' }, t('tracker.widgets.due_empty'))); return; }
  body.append(h('ul', { class: 'tw:flex tw:flex-col tw:gap-1 tw:text-sm' }, rows.map((it) => h('li', {},
    h('button', { type: 'button', class: 'tw:border-0 tw:bg-transparent tw:p-0 tw:flex tw:w-full tw:gap-2 tw:text-left tw:cursor-pointer', onclick: () => go(it) },
      h('span', { class: `tw:w-24 tw:flex-none ${M.isOverdue(it) ? 'tw:text-danger tw:font-semibold' : 'tw:text-muted'}` }, fmtDay(it.due)),
      h('span', { class: 'tw:font-figures tw:text-muted tw:flex-none' }, M.ref(it)),
      h('span', { class: 'tw:text-ink' }, it.title))))));
});

// Per project: open, overdue, needs test and closed in the last seven days.
export const summary = liveWidget((body) => {
  const all = M.projects();
  if (!all.length) { body.append(h('p', { class: 'empty' }, t('tracker.no_projects'))); return; }
  const week = Date.now() - 7 * 86400000;
  const cols = ['open', 'overdue', 'needs_test', 'closed_week'];
  body.append(h('table', { class: 'tw:w-full tw:border-collapse tw:text-sm', 'aria-label': t('tracker.widgets.summary_aria') },
    h('thead', {}, h('tr', {}, h('th', { class: 'tw:p-1 tw:text-left' }, t('tracker.fields.project')),
      cols.map((c) => h('th', { scope: 'col', class: 'tw:p-1 tw:text-right' }, t(`tracker.widgets.${c}`))))),
    h('tbody', {}, all.map((p) => {
      const its = M.items(p.id);
      const n = {
        open: its.filter((i) => !M.isClosed(i)).length,
        overdue: its.filter(M.isOverdue).length,
        needs_test: its.filter((i) => i.status === 'needs test').length,
        closed_week: its.filter((i) => i.closed_at && Date.parse(i.closed_at) >= week).length,
      };
      return h('tr', { class: 'tw:border-t tw:border-line' },
        h('th', { scope: 'row', class: 'tw:p-1 tw:text-left' }, h('a', { href: '#/tracker' }, p.name)),
        cols.map((c) => h('td', { class: `tw:p-1 tw:text-right tw:font-figures ${c === 'overdue' && n[c] ? 'tw:text-danger tw:font-semibold' : ''}` }, String(n[c]))));
    }))));
});

// The board of the project last chosen on the Tracker screen (or all projects), open items only.
export const board = liveWidget((body) => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('xo-tracker')) || {}; } catch { /* default to all projects */ }
  const project = saved.project && M.project(saved.project) ? saved.project : 'all';
  if (!M.projects().length) { body.append(h('p', { class: 'empty' }, t('tracker.no_projects'))); return; }
  const ctx = {
    ui: { project, filters: {}, sort: { key: 'priority', dir: 1 }, selected: null, checked: new Set(), order: [] },
    select: (id) => { const it = M.item(id); if (it) go(it); },
    redraw: () => {},
    save: () => {},
  };
  renderBoard(body, ctx);
});
