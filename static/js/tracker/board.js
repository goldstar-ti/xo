// The Board view: one column per status, a card per item. Drag a card to another column to change
// its status, or focus a card and press Alt+Left or Alt+Right. On All projects, a column holds every
// project's items with that status (statuses are matched by name).
import * as M from './model.js';
import { visible } from './list.js';
import { t } from '../text.js';
import { h, fmtDay, toast } from '../util.js';

const fail = (err) => toast(err.message, 'bad');

function statuses(ui) {
  const ids = ui.project === 'all' ? M.projects().map((p) => p.id) : [ui.project];
  return [...new Set(ids.flatMap((id) => M.values(id, 'status')))];
}

// A card shows the reference, title, priority, due date, labels and checklist progress.
export function card(it, ctx, { draggable = true } = {}) {
  const done = (it.checklist || []).filter((c) => c.done).length;
  const el = h('button', {
    type: 'button',
    class: `tw:flex tw:w-full tw:flex-col tw:gap-1 tw:rounded-xo tw:border-rule tw:border-line tw:bg-paper tw:p-2 tw:text-left tw:cursor-pointer ${ctx.ui.selected === it.id ? 'tw:bg-leaf-soft' : ''}`,
    draggable: draggable && !it.readOnly ? 'true' : null,
    'data-id': it.id,
    onclick: () => ctx.select(it.id),
  },
  h('span', { class: 'tw:flex tw:justify-between tw:gap-2 tw:text-xs tw:text-muted' },
    h('span', { class: 'tw:font-figures' }, M.ref(it)), h('span', {}, it.priority)),
  h('span', { class: 'tw:font-semibold tw:text-ink' }, it.title || t('tracker.untitled')),
  h('span', { class: 'tw:flex tw:flex-wrap tw:gap-2 tw:text-xs tw:text-muted' },
    it.due ? h('span', { class: M.isOverdue(it) ? 'tw:text-danger tw:font-semibold' : '' }, t('tracker.board.due', { day: fmtDay(it.due) })) : null,
    (it.checklist || []).length ? h('span', {}, t('tracker.checklist_progress', { done: String(done), all: String(it.checklist.length) })) : null,
    (it.labels || []).length ? h('span', {}, it.labels.join(', ')) : null));
  return el;
}

export function renderBoard(root, ctx) {
  const { ui } = ctx;
  // The board shows open and closed items alike, but keeps the other list filters.
  const rows = visible({ ...ui, filters: { ...ui.filters, open: false }, sort: { key: 'priority', dir: 1 } });
  ui.order = rows.map((r) => r.id);
  const cols = statuses(ui);
  const move = (id, status) => {
    const it = M.item(id);
    if (!it || it.status === status) return;
    if (!M.values(it.project, 'status').includes(status)) { toast(t('tracker.board.no_status', { status }), 'bad'); return; }
    M.updateItem(id, { status }).catch(fail);
  };
  const board = h('div', { class: 'tw:flex tw:gap-3 tw:overflow-x-auto tw:pb-2', role: 'list', 'aria-label': t('tracker.board.aria') },
    cols.map((status) => {
      const mine = rows.filter((r) => r.status === status);
      const col = h('section', {
        class: 'tw:flex tw:w-64 tw:flex-none tw:flex-col tw:gap-2 tw:rounded-xo tw:bg-surface tw:p-2',
        role: 'listitem',
        'aria-label': t('tracker.board.column', { status, n: String(mine.length) }),
        'data-status': status,
      },
      h('h3', { class: 'tw:flex tw:justify-between tw:text-sm' }, h('span', {}, status), h('span', { class: 'tw:text-muted' }, String(mine.length))),
      mine.map((it) => card(it, ctx)));
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('tw:outline-2', 'tw:outline-leaf'); });
      col.addEventListener('dragleave', () => col.classList.remove('tw:outline-2', 'tw:outline-leaf'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('tw:outline-2', 'tw:outline-leaf');
        move(e.dataTransfer.getData('text/plain'), status);
      });
      return col;
    }));
  board.addEventListener('dragstart', (e) => {
    const id = e.target.closest?.('[data-id]')?.dataset.id;
    if (id) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }
  });
  board.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const id = e.target.closest?.('[data-id]')?.dataset.id;
    const it = id && M.item(id);
    if (!it) return;
    e.preventDefault();
    const at = cols.indexOf(it.status);
    const next = cols[at + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) move(id, next);
  });
  root.append(h('p', { class: 'tw:text-muted tw:text-sm' }, t('tracker.board.hint')), board);
}
