// The plain list screens: diary, tasks, routine, bills, obligations.
import * as store from '../store.js';
import {
  calendarLink, editAppointment, editBill, editObligation, editReport, editRoutine, editTask,
  payBill, pickTask, quickTask, toggleTask,
} from '../forms.js';
import { t, text } from '../text.js';
import { button, checkbox, chip, input } from '../ui.js';
import { addDays, daysBetween, fmtDay, fmtDuration, fmtLong, fmtMoney, fmtTime, h, relDay, toast, today, put } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const cap = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const head = (title, ...actions) => h('header', { class: 'page-head' }, h('h1', {}, title), h('div', { class: 'actions' }, actions));
const addBtn = (label, onclick) => button(label, { variant: 'primary', onclick });
const rowMain = (kids, onclick) => button(kids, { variant: 'row', class: 'row-main', onclick });
const sortAppts = (a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time);

function apptRow(a) {
  const d = a.data;
  const tm = store.apptTimes(d);
  const bits = [];
  if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
  if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
  return h('li', {},
    h('span', { class: 't' }, fmtTime(d.time)),
    rowMain([
      h('span', {}, d.title, d.court && h('span', { class: 'tag' }, t('lists.shared.court'))),
      h('small', {}, [d.where, cap(bits.join(', '))].filter(Boolean).join('. ')),
      d.notes && h('small', { class: 'pre' }, d.notes),
    ], () => editAppointment(a)),
    h('a', { class: 'ghost small', href: calendarLink(d), target: '_blank', rel: 'noopener noreferrer', title: t('lists.diary.calendar_tip') }, t('lists.diary.to_calendar')));
}

function apptGroups(list) {
  const days = [...new Set(list.map((a) => a.data.date))];
  return days.map((day) => h('div', { class: 'group' },
    h('h2', {}, fmtLong(day), h('span', { class: 'meta' }, relDay(day))),
    h('ul', { class: 'list timed' }, list.filter((a) => a.data.date === day).map(apptRow))));
}

export const diary = {
  live: true,
  render(root) {
    const day = today();
    const appts = store.byKind('appointment').sort(sortAppts);
    const upcoming = appts.filter((a) => a.data.date >= day);
    const past = appts.filter((a) => a.data.date < day).reverse().slice(0, 15);
    put(root,
      head(t('lists.diary.heading'), addBtn(t('lists.diary.add'), () => editAppointment())),
      upcoming.length ? apptGroups(upcoming) : h('p', { class: 'empty' }, t('lists.diary.empty')),
      past.length > 0 && h('details', {}, h('summary', {}, t('lists.diary.past', { count: past.length })), apptGroups(past)),
    );
  },
};

function taskRow(task, { showPick = true } = {}) {
  const d = task.data;
  const picked = d.today === today();
  const late = !d.done && d.due && d.due < today();
  const meta = [];
  if (d.project) meta.push(d.project);
  if (d.due && !d.done) meta.push(late ? t('lists.shared.overdue_since', { day: fmtDay(d.due) }) : t('lists.tasks.due', { when: relDay(d.due) }));
  if (d.est > 0 && !d.done) meta.push(t('lists.shared.allow', { duration: fmtDuration(d.est * 1.5) }));
  return h('li', { class: `${d.done ? 'done' : ''}${late ? ' late' : ''}` },
    checkbox({ checked: d.done, 'aria-label': t('lists.shared.done_aria', { title: d.title }), onchange: () => toggleTask(task).catch(fail) }),
    rowMain([
      h('span', {}, d.title),
      !d.done && d.step && h('small', {}, t('lists.shared.start_with', { step: d.step })),
      meta.length > 0 && h('small', {}, meta.join(', ')),
    ], () => editTask(task)),
    showPick && !d.done && chip(t(picked ? 'lists.tasks.today' : 'lists.tasks.pick'), { pressed: picked, class: 'small', onclick: () => pickTask(task).catch(fail) }));
}

function quickAdd(placeholder, extra, focusKey) {
  const field = input({ type: 'text', placeholder, 'aria-label': placeholder, autocomplete: 'off', 'data-focus': focusKey });
  return h('form', {
    class: 'quick',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        sessionStorage.setItem('refocus', focusKey);
        await quickTask(field.value, extra);
      } catch (err) { fail(err); }
    },
  }, field, button(t('lists.shared.add'), { variant: 'primary', type: 'submit' }));
}

export const tasks = {
  live: true,
  render(root) {
    const day = today();
    const allTasks = store.byKind('task');
    const open = allTasks.filter((task) => !task.data.done);
    const picked = allTasks.filter((task) => task.data.today === day);
    const soon = open.filter((task) => task.data.today !== day && task.data.due && task.data.due <= addDays(day, 7)).sort((a, b) => a.data.due.localeCompare(b.data.due));
    const rest = open.filter((task) => task.data.today !== day && !soon.includes(task)).sort((a, b) => (a.data.project || '').localeCompare(b.data.project || '') || a.data.title.localeCompare(b.data.title));
    const done = allTasks.filter((task) => task.data.done && task.data.today !== day).sort((a, b) => (b.data.doneAt || '').localeCompare(a.data.doneAt || '')).slice(0, 20);
    const section = (title, list, empty) => h('section', {}, h('h2', {}, title),
      list.length ? h('ul', { class: 'list' }, list.map((task) => taskRow(task))) : empty && h('p', { class: 'empty' }, empty));
    put(root,
      head(t('lists.tasks.heading')),
      quickAdd(t('lists.tasks.add_placeholder'), {}, 'task'),
      section(t('lists.tasks.todays_three'), picked, t('lists.tasks.pick_empty')),
      soon.length > 0 && section(t('lists.tasks.due_week'), soon),
      section(t('lists.tasks.everything_else'), rest, open.length ? null : t('lists.tasks.none_open')),
      done.length > 0 && h('details', {}, h('summary', {}, t('lists.tasks.done', { count: done.length })), h('ul', { class: 'list' }, done.map((task) => taskRow(task)))),
    );
  },
};

export const routine = {
  live: true,
  render(root) {
    const list = store.byKind('routine').sort((a, b) => a.data.time.localeCompare(b.data.time));
    const days = [...Array(7)].map((_, i) => addDays(today(), i - 6));
    put(root,
      head(t('lists.routine.heading'), addBtn(t('lists.routine.add'), () => editRoutine())),
      h('p', { class: 'note' }, t('lists.routine.note')),
      list.length ? h('ul', { class: 'list timed' }, list.map((r) => h('li', { class: r.data.active === false ? 'off' : '' },
        h('span', { class: 't' }, fmtTime(r.data.time)),
        rowMain([h('span', {}, r.data.label), r.data.active === false && h('small', {}, t('lists.routine.reminder_off'))], () => editRoutine(r)),
        h('span', { class: 'dots', 'aria-label': t('lists.routine.ticked', { count: days.filter((d) => store.isTicked(r.id, d)).length }) },
          days.map((d) => h('i', { class: store.isTicked(r.id, d) ? 'on' : '' }))))))
        : h('p', { class: 'empty' }, t('lists.routine.empty')),
    );
  },
};

export const bills = {
  live: true,
  render(root) {
    const day = today();
    const open = store.byKind('bill').filter((b) => !b.data.finished).sort((a, b) => a.data.due.localeCompare(b.data.due));
    const total = open.filter((b) => b.data.due <= addDays(day, 30)).reduce((sum, b) => sum + (Number(b.data.amount) || 0), 0);
    put(root,
      head(t('lists.bills.heading'), addBtn(t('lists.bills.add'), () => editBill())),
      open.length > 0 && h('p', { class: 'figure' }, h('strong', {}, fmtMoney(total)), ' ', t('lists.bills.due_next_30')),
      open.length ? h('ul', { class: 'list' }, open.map((b) => {
        const d = b.data;
        const late = d.due < day;
        const due = t('lists.bills.due', { when: relDay(d.due) }) + (daysBetween(day, d.due) > 6 ? '' : `, ${fmtDay(d.due)}`);
        return h('li', { class: late ? 'late' : '' },
          rowMain([
            h('span', {}, d.name, d.amount > 0 && h('span', { class: 'meta' }, fmtMoney(d.amount))),
            h('small', {}, [late ? t('lists.bills.overdue_since', { day: fmtDay(d.due) }) : due,
              d.autopay && t('lists.bills.paid_automatically'), d.repeat !== 'none' && d.repeat].filter(Boolean).join(', ')),
          ], () => editBill(b)),
          button(t('lists.shared.paid'), { class: 'small', onclick: () => payBill(b).catch(fail) }));
      })) : h('p', { class: 'empty' }, t('lists.bills.empty')),
    );
  },
};

export const obligations = {
  live: true,
  render(root) {
    const day = today();
    const court = store.byKind('appointment').filter((a) => a.data.court && a.data.date >= day).sort(sortAppts);
    const courtTasks = store.byKind('task').filter((task) => (task.data.project || '').toLowerCase() === 'court' && !task.data.done);
    const conditions = store.byKind('obligation').sort((a, b) => a.data.title.localeCompare(b.data.title));
    const reports = store.byKind('report').sort((a, b) => b.data.date.localeCompare(a.data.date));
    const when = (d) => d.schedule === 'daily' ? t('lists.obligations.every_day', { time: fmtTime(d.time) })
      : d.schedule === 'weekly' ? t('lists.obligations.every_weekday', { weekday: text('forms.weekdays')[String(Number(d.weekday))], time: fmtTime(d.time) }) : '';
    put(root,
      head(t('lists.obligations.heading')),
      h('p', { class: 'note' }, t('lists.obligations.note')),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.court_heading')), addBtn(t('lists.obligations.court_add'), () => editAppointment(null, { court: true, prep: 45, travel: 45 }))),
        court.length ? apptGroups(court) : h('p', { class: 'empty' }, t('lists.obligations.court_empty'))),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.tasks_heading'))),
        quickAdd(t('lists.obligations.tasks_placeholder'), { project: 'Court' }, 'court'),
        courtTasks.length ? h('ul', { class: 'list' }, courtTasks.map((task) => taskRow(task))) : h('p', { class: 'empty' }, t('lists.obligations.tasks_empty'))),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.conditions_heading')), addBtn(t('lists.obligations.conditions_add'), () => editObligation())),
        conditions.length ? h('ul', { class: 'list' }, conditions.map((o) => h('li', {},
          rowMain([
            h('span', {}, o.data.title),
            o.data.detail && h('small', { class: 'pre' }, o.data.detail),
            [when(o.data), o.data.contact].filter(Boolean).length > 0 && h('small', {}, [when(o.data), o.data.contact].filter(Boolean).join('. ')),
          ], () => editObligation(o)))))
          : h('p', { class: 'empty' }, t('lists.obligations.conditions_empty'))),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.reports_heading')), addBtn(t('lists.obligations.reports_add'), () => editReport())),
        reports.length ? h('ul', { class: 'list timed' }, reports.map((r) => h('li', {},
          h('span', { class: 't' }, fmtDay(r.data.date)),
          rowMain([h('span', { class: 'pre' }, r.data.what), r.data.who && h('small', {}, t('lists.obligations.told', { who: r.data.who }))], () => editReport(r)))))
          : h('p', { class: 'empty' }, t('lists.obligations.reports_empty'))),
    );
  },
};
