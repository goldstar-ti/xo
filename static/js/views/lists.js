// The plain list screens: diary, routine, bills, obligations. Tasks has its own screen (views/tasks.js).
import { customMeta } from '../customfields.js';
import * as store from '../store.js';
import { calendarLink, editAppointment, editBill, editObligation, editReport, editRoutine, payBill } from '../forms.js';
import { t, text } from '../text.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import { button, callout, disclosure, linkRow, menu } from '../ui.js';
import { quickAdd, taskRow } from './tasks.js';
import { addDays, daysBetween, fmtDay, fmtLong, fmtMoney, fmtTime, h, relDay, toast, today, put } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const cap = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const head = (title, ...actions) => h('header', { class: 'page-head' }, h('h1', {}, title), h('div', { class: 'actions' }, actions));
const addBtn = (label, onclick) => button([icon('tabler/plus'), label], { variant: 'ghost', class: 'small add-btn', onclick });
const rowMain = (kids, onclick) => button(kids, { variant: 'row', class: 'row-main', onclick });
const sortAppts = (a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time);

function apptRow(a) {
  const d = a.data;
  const tm = store.apptTimes(d);
  const bits = [];
  if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
  if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
  const sub = [d.where, cap(bits.join(', ')), ...customMeta('appointment', d.custom)].filter(Boolean).join('. ');
  // The row opens the edit form; the href keeps it a real link. Copy to calendar sits in the row's menu.
  const row = linkRow({
    title: [d.title, d.court && h('span', { class: 'tag' }, t('lists.shared.court'))],
    sub: [sub, d.notes && h('small', { class: 'md compact' }, renderMarkdown(d.notes))],
    href: '#/diary',
  });
  row.addEventListener('click', (ev) => { ev.preventDefault(); editAppointment(a); });
  return h('li', {},
    h('span', { class: 't' }, fmtTime(d.time)),
    row,
    menu({ label: t('lists.diary.actions'), items: [{ label: t('lists.diary.to_calendar'), icon: 'tabler/calendar-plus', run: () => window.open(calendarLink(d), '_blank', 'noopener,noreferrer') }] }));
}

function apptGroups(list) {
  const days = [...new Set(list.map((a) => a.data.date))];
  return days.map((day) => h('div', { class: 'group' },
    h('h2', {}, fmtLong(day), h('span', { class: 'meta' }, relDay(day))),
    h('ul', { class: 'list timed' }, list.filter((a) => a.data.date === day).map(apptRow))));
}

/** The diary list: upcoming days, then a Past disclosure. ahead is a number of days; 0 shows every upcoming appointment. Returns an array of nodes. */
export function diaryPart({ ahead = 0 } = {}) {
  const day = today();
  const last = ahead > 0 ? addDays(day, ahead) : '';
  const appts = store.byKind('appointment').sort(sortAppts);
  const upcoming = appts.filter((a) => a.data.date >= day && (!last || a.data.date <= last));
  const past = appts.filter((a) => a.data.date < day).reverse().slice(0, 15);
  return [
    upcoming.length ? apptGroups(upcoming) : h('p', { class: 'empty' }, t('lists.diary.empty')),
    past.length > 0 && !ahead && disclosure(t('lists.diary.past', { count: past.length }), apptGroups(past)),
  ];
}

export const diary = {
  live: true,
  render(root) {
    put(root,
      head(t('lists.diary.heading'), addBtn(t('lists.diary.add'), () => editAppointment())),
      diaryPart(),
    );
  },
};

/** The routine list with its seven-day dots, or an empty note. Returns one node. */
export function routinePart() {
  const list = store.byKind('routine').sort((a, b) => a.data.time.localeCompare(b.data.time));
  const days = [...Array(7)].map((_, i) => addDays(today(), i - 6));
  if (!list.length) return h('p', { class: 'empty' }, t('lists.routine.empty'));
  return h('ul', { class: 'list timed' }, list.map((r) => {
    const meta = customMeta('routine', r.data.custom);
    const sub = [r.data.active === false && t('lists.routine.reminder_off'), ...meta].filter(Boolean).join(', ');
    // The row opens its editor; the href keeps it a real link.
    const row = linkRow({ title: r.data.label, sub, href: '#/routine' });
    row.addEventListener('click', (ev) => { ev.preventDefault(); editRoutine(r); });
    return h('li', { class: r.data.active === false ? 'off' : '' },
      h('span', { class: 't' }, fmtTime(r.data.time)),
      row,
      h('span', { class: 'dots', 'aria-label': t('lists.routine.ticked', { count: days.filter((d) => store.isTicked(r.id, d)).length }) },
        days.map((d) => h('i', { class: store.isTicked(r.id, d) ? 'on' : '' }))));
  }));
}

export const routine = {
  live: true,
  render(root) {
    put(root,
      head(t('lists.routine.heading'), addBtn(t('lists.routine.add'), () => editRoutine())),
      h('p', { class: 'note' }, t('lists.routine.note')),
      routinePart(),
    );
  },
};

/** The open bills: a due-in-30-days figure, then the list. ahead is a number of days; 0 shows every open bill. Returns an array of nodes. */
export function billsPart({ ahead = 0 } = {}) {
  const day = today();
  const open = store.byKind('bill').filter((b) => !b.data.finished && (!ahead || b.data.due <= addDays(day, ahead))).sort((a, b) => a.data.due.localeCompare(b.data.due));
  const total = open.filter((b) => b.data.due <= addDays(day, 30)).reduce((sum, b) => sum + (Number(b.data.amount) || 0), 0);
  return [
    open.length > 0 && h('p', { class: 'figure' }, h('strong', {}, fmtMoney(total)), ' ', t('lists.bills.due_next_30')),
    open.length ? h('ul', { class: 'list bills' }, open.map((b) => {
      const d = b.data;
      const late = d.due < day;
      const due = t('lists.bills.due', { when: relDay(d.due) }) + (daysBetween(day, d.due) > 6 ? '' : `, ${fmtDay(d.due)}`);
      return h('li', { class: late ? 'late' : '' },
        rowMain([
          h('span', {}, d.name),
          h('small', {}, [late ? t('lists.bills.overdue_since', { day: fmtDay(d.due) }) : due,
            d.autopay && t('lists.bills.paid_automatically'), d.repeat !== 'none' && d.repeat, ...customMeta('bill', d.custom)].filter(Boolean).join(', ')),
        ], () => editBill(b)),
        h('span', { class: 'amount' }, d.amount > 0 ? fmtMoney(d.amount) : ''),
        button(t('lists.shared.paid'), { class: 'small', onclick: () => payBill(b).catch(fail) }));
    })) : h('p', { class: 'empty' }, t('lists.bills.empty')),
  ];
}

export const bills = {
  live: true,
  render(root) {
    put(root,
      head(t('lists.bills.heading'), addBtn(t('lists.bills.add'), () => editBill())),
      billsPart(),
    );
  },
};

/** The four Duties sections as nodes: { court, courtTasks, conditions, reports }. Each is a section element with its own heading and add button. */
export function obligationParts() {
  const day = today();
  const court = store.byKind('appointment').filter((a) => a.data.court && a.data.date >= day).sort(sortAppts);
  const courtTasks = store.byKind('task').filter((task) => (task.data.project || '').toLowerCase() === 'court' && !task.data.done && !task.data.archived);
  const conditions = store.byKind('obligation').sort((a, b) => a.data.title.localeCompare(b.data.title));
  const reports = store.byKind('report').sort((a, b) => b.data.date.localeCompare(a.data.date));
  const when = (d) => d.schedule === 'daily' ? t('lists.obligations.every_day', { time: fmtTime(d.time) })
    : d.schedule === 'weekly' ? t('lists.obligations.every_weekday', { weekday: text('forms.weekdays')[String(Number(d.weekday))], time: fmtTime(d.time) }) : '';
  return {
    court: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.court_heading')), addBtn(t('lists.obligations.court_add'), () => editAppointment(null, { court: true, prep: 45, travel: 45 }))),
      court.length ? apptGroups(court) : h('p', { class: 'empty' }, t('lists.obligations.court_empty'))),
    courtTasks: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.tasks_heading'))),
      quickAdd(t('lists.obligations.tasks_placeholder'), { project: 'Court' }, 'court'),
      courtTasks.length ? h('ul', { class: 'list' }, courtTasks.map((task) => taskRow(task))) : h('p', { class: 'empty' }, t('lists.obligations.tasks_empty'))),
    conditions: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.conditions_heading')), addBtn(t('lists.obligations.conditions_add'), () => editObligation())),
      conditions.length ? h('ul', { class: 'list' }, conditions.map((o) => h('li', {},
        rowMain([
          h('span', {}, o.data.title),
          o.data.detail && h('small', { class: 'md compact' }, renderMarkdown(o.data.detail)),
          [when(o.data), o.data.contact, ...customMeta('obligation', o.data.custom)].filter(Boolean).length > 0 && h('small', {}, [when(o.data), o.data.contact, ...customMeta('obligation', o.data.custom)].filter(Boolean).join('. ')),
        ], () => editObligation(o)))))
        : h('p', { class: 'empty' }, t('lists.obligations.conditions_empty'))),
    reports: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.reports_heading')), addBtn(t('lists.obligations.reports_add'), () => editReport())),
      reports.length ? h('ul', { class: 'list timed' }, reports.map((r) => h('li', {},
        h('span', { class: 't' }, fmtDay(r.data.date)),
        rowMain([h('span', { class: 'md compact' }, renderMarkdown(r.data.what)), r.data.who && h('small', {}, t('lists.obligations.told', { who: r.data.who })),
          customMeta('report', r.data.custom).length > 0 && h('small', {}, customMeta('report', r.data.custom).join(', '))], () => editReport(r)))))
        : h('p', { class: 'empty' }, t('lists.obligations.reports_empty'))),
  };
}

export const obligations = {
  live: true,
  render(root) {
    const parts = obligationParts();
    put(root,
      head(t('lists.obligations.heading')),
      callout(t('lists.obligations.note'), { kind: 'neutral', icon: 'tabler/info-circle' }),
      parts.court, parts.courtTasks, parts.conditions, parts.reports,
    );
  },
};
