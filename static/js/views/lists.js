// The plain list screens: diary, tasks, routine, bills, obligations.
import * as store from '../store.js';
import {
  calendarLink, editAppointment, editBill, editObligation, editReport, editRoutine, editTask,
  payBill, pickTask, quickTask, toggleTask,
} from '../forms.js';
import { addDays, daysBetween, fmtDay, fmtDuration, fmtLong, fmtMoney, fmtTime, h, relDay, toast, today, put } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const head = (title, ...actions) => h('header', { class: 'page-head' }, h('h1', {}, title), h('div', { class: 'actions' }, actions));
const addBtn = (label, onclick) => h('button', { class: 'primary', type: 'button', onclick }, label);
const sortAppts = (a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time);

function apptRow(a) {
  const d = a.data;
  const t = store.apptTimes(d);
  const bits = [];
  if (t.ready < t.leave) bits.push(`get ready ${fmtTime(t.ready)}`);
  if (t.leave < t.start) bits.push(`leave ${fmtTime(t.leave)}`);
  return h('li', {},
    h('span', { class: 't' }, fmtTime(d.time)),
    h('button', { class: 'row-main', type: 'button', onclick: () => editAppointment(a) },
      h('span', {}, d.title, d.court && h('span', { class: 'tag' }, 'Court')),
      h('small', {}, [d.where, cap(bits.join(', '))].filter(Boolean).join('. ')),
      d.notes && h('small', { class: 'pre' }, d.notes)),
    h('a', { class: 'ghost small', href: calendarLink(d), target: '_blank', rel: 'noopener noreferrer', title: 'Opens Google Calendar with this entry filled in' }, 'To calendar'));
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
      head('Diary', addBtn('Add appointment', () => editAppointment())),
      upcoming.length ? apptGroups(upcoming) : h('p', { class: 'empty' }, 'No appointments ahead. Add the next one as soon as it is booked, while you still have the details in front of you.'),
      past.length > 0 && h('details', {}, h('summary', {}, `Past appointments (${past.length})`), apptGroups(past)),
    );
  },
};

function taskRow(t, { showPick = true } = {}) {
  const d = t.data;
  const picked = d.today === today();
  const late = !d.done && d.due && d.due < today();
  const meta = [];
  if (d.project) meta.push(d.project);
  if (d.due && !d.done) meta.push(late ? `overdue since ${fmtDay(d.due)}` : `due ${relDay(d.due)}`);
  if (d.est > 0 && !d.done) meta.push(`allow ${fmtDuration(d.est * 1.5)}`);
  return h('li', { class: `${d.done ? 'done' : ''}${late ? ' late' : ''}` },
    h('input', { type: 'checkbox', checked: d.done, 'aria-label': `Done: ${d.title}`, onchange: () => toggleTask(t).catch(fail) }),
    h('button', { class: 'row-main', type: 'button', onclick: () => editTask(t) },
      h('span', {}, d.title),
      !d.done && d.step && h('small', {}, `Start with: ${d.step}`),
      meta.length > 0 && h('small', {}, meta.join(', '))),
    showPick && !d.done && h('button', { class: `ghost small${picked ? ' on' : ''}`, type: 'button', 'aria-pressed': String(picked), onclick: () => pickTask(t).catch(fail) }, picked ? 'Today' : 'Pick'));
}

function quickAdd(placeholder, extra, focusKey) {
  const input = h('input', { type: 'text', placeholder, 'aria-label': placeholder, autocomplete: 'off', 'data-focus': focusKey });
  return h('form', {
    class: 'quick',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        sessionStorage.setItem('refocus', focusKey);
        await quickTask(input.value, extra);
      } catch (err) { fail(err); }
    },
  }, input, h('button', { class: 'primary', type: 'submit' }, 'Add'));
}

export const tasks = {
  live: true,
  render(root) {
    const day = today();
    const allTasks = store.byKind('task');
    const open = allTasks.filter((t) => !t.data.done);
    const picked = allTasks.filter((t) => t.data.today === day);
    const soon = open.filter((t) => t.data.today !== day && t.data.due && t.data.due <= addDays(day, 7)).sort((a, b) => a.data.due.localeCompare(b.data.due));
    const rest = open.filter((t) => t.data.today !== day && !soon.includes(t)).sort((a, b) => (a.data.project || '').localeCompare(b.data.project || '') || a.data.title.localeCompare(b.data.title));
    const done = allTasks.filter((t) => t.data.done && t.data.today !== day).sort((a, b) => (b.data.doneAt || '').localeCompare(a.data.doneAt || '')).slice(0, 20);
    const section = (title, list, empty) => h('section', {}, h('h2', {}, title),
      list.length ? h('ul', { class: 'list' }, list.map((t) => taskRow(t))) : empty && h('p', { class: 'empty' }, empty));
    put(root, 
      head('Tasks'),
      quickAdd('Add a task', {}, 'task'),
      section('Today’s three', picked, 'Pick up to three. Three finished beats ten started.'),
      soon.length > 0 && section('Due this week', soon),
      section('Everything else', rest, open.length ? null : 'No open tasks.'),
      done.length > 0 && h('details', {}, h('summary', {}, `Done (${done.length})`), h('ul', { class: 'list' }, done.map((t) => taskRow(t)))),
    );
  },
};

export const routine = {
  live: true,
  render(root) {
    const list = store.byKind('routine').sort((a, b) => a.data.time.localeCompare(b.data.time));
    const days = [...Array(7)].map((_, i) => addDays(today(), i - 6));
    put(root, 
      head('Routine', addBtn('Add item', () => editRoutine())),
      h('p', { class: 'note' }, 'Each item reminds you at its time and waits on the Today screen for a tick. The dots show the last seven days.'),
      list.length ? h('ul', { class: 'list timed' }, list.map((r) => h('li', { class: r.data.active === false ? 'off' : '' },
        h('span', { class: 't' }, fmtTime(r.data.time)),
        h('button', { class: 'row-main', type: 'button', onclick: () => editRoutine(r) },
          h('span', {}, r.data.label), r.data.active === false && h('small', {}, 'Reminder off')),
        h('span', { class: 'dots', 'aria-label': `Ticked ${days.filter((d) => store.isTicked(r.id, d)).length} of the last 7 days` },
          days.map((d) => h('i', { class: store.isTicked(r.id, d) ? 'on' : '' }))))))
        : h('p', { class: 'empty' }, 'No routine yet. Add meals first.'),
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
      head('Bills', addBtn('Add bill', () => editBill())),
      open.length > 0 && h('p', { class: 'figure' }, h('strong', {}, fmtMoney(total)), ' due in the next 30 days'),
      open.length ? h('ul', { class: 'list' }, open.map((b) => {
        const d = b.data;
        const late = d.due < day;
        return h('li', { class: late ? 'late' : '' },
          h('button', { class: 'row-main', type: 'button', onclick: () => editBill(b) },
            h('span', {}, d.name, d.amount > 0 && h('span', { class: 'meta' }, fmtMoney(d.amount))),
            h('small', {}, [late ? `Overdue since ${fmtDay(d.due)}` : `Due ${relDay(d.due)}${daysBetween(day, d.due) > 6 ? '' : `, ${fmtDay(d.due)}`}`,
              d.autopay && 'paid automatically', d.repeat !== 'none' && d.repeat].filter(Boolean).join(', '))),
          h('button', { class: 'ghost small', type: 'button', onclick: () => payBill(b).catch(fail) }, 'Paid'));
      })) : h('p', { class: 'empty' }, 'No bills yet. Add the next one that arrives, with its due date.'),
    );
  },
};

export const obligations = {
  live: true,
  render(root) {
    const day = today();
    const court = store.byKind('appointment').filter((a) => a.data.court && a.data.date >= day).sort(sortAppts);
    const courtTasks = store.byKind('task').filter((t) => (t.data.project || '').toLowerCase() === 'court' && !t.data.done);
    const conditions = store.byKind('obligation').sort((a, b) => a.data.title.localeCompare(b.data.title));
    const reports = store.byKind('report').sort((a, b) => b.data.date.localeCompare(a.data.date));
    const when = (d) => d.schedule === 'daily' ? `Every day, ${fmtTime(d.time)}`
      : d.schedule === 'weekly' ? `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(d.weekday)]}, ${fmtTime(d.time)}` : '';
    put(root, 
      head('Obligations'),
      h('p', { class: 'note' }, 'These are your own notes. Your bail undertaking, your reporting contact and your lawyer are the authority on what applies. When unsure, ask before you act.'),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'Court dates'), addBtn('Add court date', () => editAppointment(null, { court: true, prep: 45, travel: 45 }))),
        court.length ? apptGroups(court) : h('p', { class: 'empty' }, 'No court dates entered. Add the next one with the court, the time and what to bring.')),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'To do for court')),
        quickAdd('Add a court task', { project: 'Court' }, 'court'),
        courtTasks.length ? h('ul', { class: 'list' }, courtTasks.map((t) => taskRow(t))) : h('p', { class: 'empty' }, 'Nothing outstanding. Add anything your lawyer asks you for the moment they ask.')),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'My conditions'), addBtn('Add condition', () => editObligation())),
        conditions.length ? h('ul', { class: 'list' }, conditions.map((o) => h('li', {},
          h('button', { class: 'row-main', type: 'button', onclick: () => editObligation(o) },
            h('span', {}, o.data.title),
            o.data.detail && h('small', { class: 'pre' }, o.data.detail),
            [when(o.data), o.data.contact].filter(Boolean).length > 0 && h('small', {}, [when(o.data), o.data.contact].filter(Boolean).join('. '))))))
          : h('p', { class: 'empty' }, 'Copy each condition from your paperwork, one per entry, in words you would use yourself.')),
      h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'Reporting record'), addBtn('Add record', () => editReport())),
        reports.length ? h('ul', { class: 'list timed' }, reports.map((r) => h('li', {},
          h('span', { class: 't' }, fmtDay(r.data.date)),
          h('button', { class: 'row-main', type: 'button', onclick: () => editReport(r) },
            h('span', { class: 'pre' }, r.data.what), r.data.who && h('small', {}, `Told: ${r.data.who}`)))))
          : h('p', { class: 'empty' }, 'A line for every time you report something: the date, what you reported, who you told.')),
    );
  },
};
