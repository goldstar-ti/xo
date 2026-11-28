// Custom controls for the task form. Each builder returns { node, read }, and redraws its own container.
import { allTasks } from './taskdata.js';
import { wouldCycle } from './tasks.js';
import { t, text } from './text.js';
import { h, uid } from './util.js';
import { button, chip, field, input, select, tickBox } from './ui.js';

/** Choice chips. options: [[value, label]]. A single set reads one value, a multi set reads an array. */
export function chipSet(options, value, { multi = false, onchange } = {}) {
  let chosen = multi ? [...(value || [])] : value ?? '';
  const node = h('div', { class: 'chips' });
  const draw = () => {
    node.replaceChildren(...options.map(([v, label]) => {
      const on = multi ? chosen.includes(v) : chosen === v;
      return chip(label, {
        pressed: on,
        onclick: () => {
          if (multi) chosen = on ? chosen.filter((x) => x !== v) : [...chosen, v];
          else chosen = v;
          onchange?.(multi ? [...chosen] : chosen);
          draw();
        },
      });
    }));
  };
  draw();
  return { node, read: () => (multi ? [...chosen] : chosen) };
}

/** A checklist inside the task. list: [{ id, title, done }]. */
export function subtaskEditor(list) {
  const rows = [];
  const node = h('div', { class: 'subtasks' });
  const rowFor = (s) => {
    const row = { id: s.id || uid() };
    row.cb = tickBox({ checked: !!s.done, label: t('forms.task.labels.subtasks') });
    row.inp = input({ type: 'text', value: s.title || '', placeholder: t('forms.task.subtask_placeholder'), autocomplete: 'off', 'aria-label': t('forms.task.subtask_placeholder') });
    row.remove = button('x', { class: 'small', 'aria-label': t('forms.task.subtask_remove', { title: s.title || '' }), onclick: () => { rows.splice(rows.indexOf(row), 1); draw(); } });
    row.el = h('div', { class: 'tw:flex tw:items-center tw:gap-2 tw:mt-2' }, row.cb, row.inp, row.remove);
    return row;
  };
  const addBtn = button(t('forms.task.subtask_add'), {
    class: 'small tw:mt-2',
    onclick: () => { const row = rowFor({}); rows.push(row); draw(); row.inp.focus(); },
  });
  const draw = () => node.replaceChildren(...rows.map((r) => r.el), addBtn);
  (list || []).forEach((s) => rows.push(rowFor(s)));
  draw();
  return {
    node,
    read: () => rows.map((r) => ({ id: r.id, title: r.inp.value.trim(), done: !!r.cb.checked })).filter((s) => s.title),
  };
}

/** The tasks this one waits on. ids: [taskId]. selfId stops a task waiting on itself or on a loop. */
export function blockedEditor(ids, selfId) {
  let chosen = [...(ids || [])];
  const all = allTasks();
  const byId = new Map(all.map((i) => [i.id, i.data]));
  const node = h('div', { class: 'blocked' });
  const draw = () => {
    const known = chosen.filter((id) => byId.has(id));
    const options = all.filter((i) => i.data.status !== 'done' && !i.data.archived && i.id !== selfId && !chosen.includes(i.id) && !wouldCycle(byId, selfId, i.id));
    const pick = select([['', t('forms.task.blocked_choose')], ...options.map((i) => [i.id, i.data.title])], { value: '', 'aria-label': t('forms.task.labels.blocked_by') });
    node.replaceChildren(
      known.length
        ? h('ul', { class: 'tw:m-0 tw:p-0 tw:list-none' }, known.map((id) => h('li', { class: 'tw:flex tw:items-center tw:gap-2 tw:mt-1' },
          h('span', {}, byId.get(id).title),
          button('x', { class: 'small', 'aria-label': t('forms.task.blocked_remove', { title: byId.get(id).title }), onclick: () => { chosen = chosen.filter((x) => x !== id); draw(); } }))))
        : h('p', { class: 'note' }, t('forms.task.blocked_none')),
      h('div', { class: 'tw:flex tw:items-center tw:gap-2 tw:mt-2' }, pick,
        button(t('forms.task.blocked_add'), { class: 'small', onclick: () => { if (pick.value) { chosen = [...chosen, pick.value]; draw(); } } })),
    );
  };
  draw();
  return { node, read: () => chosen.filter((id) => byId.has(id)) };
}

/** How a task repeats. repeat: { every, n, weekday, nth }. */
export function repeatEditor(repeat) {
  const r = { every: 'none', n: 1, weekday: 1, nth: 1, ...(repeat || {}) };
  const node = h('div', { class: 'repeat' });
  const every = select(Object.entries(text('forms.task.repeats')), { id: 'f-repeat-every', value: r.every, 'aria-label': t('forms.task.labels.repeat') });
  const n = input({ id: 'f-repeat-n', type: 'number', min: 1, value: r.n, inputmode: 'numeric' });
  const weekday = select(Object.entries(text('forms.weekdays')), { id: 'f-repeat-weekday', value: String(r.weekday) });
  const nth = select(Object.entries(text('forms.task.nths')), { id: 'f-repeat-nth', value: String(r.nth) });
  const draw = () => {
    const kind = every.value;
    node.replaceChildren(
      every,
      (kind === 'after' || kind === 'week') && h('div', { class: 'tw:mt-2' }, field(t('forms.task.labels.repeat_n'), n)),
      (kind === 'month_nth' || kind === 'quarter_nth') && h('div', { class: 'fields tw:mt-2' },
        field(t('forms.task.labels.repeat_nth'), nth, null, { half: true }),
        field(t('forms.task.labels.repeat_weekday'), weekday, null, { half: true })),
    );
  };
  every.addEventListener('change', draw);
  draw();
  return {
    node,
    read: () => ({
      every: every.value,
      n: Math.max(1, Math.round(Number(n.value) || 1)),
      weekday: Number(weekday.value),
      nth: Number(nth.value),
    }),
  };
}
