// The plain list screens: diary, routine, bills, obligations. Tasks has its own screen (views/tasks.js).
import { customMeta } from '../customfields.js';
import * as store from '../store.js';
import { calendarLink, editAppointment, editBill, editObligation, editReport, editRoutine, payBill } from '../forms.js';
import { t, text } from '../text.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import { button, callout, chip, disclosure, linkRow, menu, segmented, tickBox } from '../ui.js';
import { dropFab, fabSheet } from '../sheet.js';
import { quickAdd, taskRow } from './tasks.js';
import { addDays, daysBetween, fmtDay, fmtLong, fmtMoney, fmtTime, h, hm, relDay, toast, today, put } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const cap = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const addBtn = (label, onclick, extra = '') => button([icon('tabler/plus'), label], { variant: 'ghost', class: `small add-btn ${extra}`.trim(), onclick });
// A whole-row link that opens a form: the href keeps it a real link, the click opens the form instead.
const openRow = (props, open) => {
  const row = linkRow(props);
  row.addEventListener('click', (ev) => { ev.preventDefault(); open(); });
  return row;
};
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

// Below 40rem the Diary follows pattern C: a view switch (Agenda or Week), chips for Today, Tomorrow,
// This week and Later, the next appointment as the lead card, and each other day folded up. diaryPart()
// is the same on both; only render() lays it out.
export const PHONE = '(max-width: 39.99rem)';
const folds = {};
let mode = 'agenda';
let watching = null;

export function watchPhone(root, mq, view, marker) {
  if (watching) watching.mq.removeEventListener('change', watching.fn);
  const fn = () => { if (root.isConnected && root.querySelector(marker)) { root.replaceChildren(); view.render(root); } };
  mq.addEventListener('change', fn);
  watching = { mq, fn };
}

export function jump(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.localName === 'details' || el.localName === 'wa-details') el.open = true;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}

/** The next appointment from now: later today (or tomorrow onward), else null. */
function nextAppt(upcoming, day) {
  const now = hm(new Date());
  return upcoming.find((a) => a.data.date > day || a.data.time >= now) || null;
}

function leadCard(a) {
  const d = a.data;
  const tm = store.apptTimes(d);
  const bits = [];
  if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
  if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
  const row = linkRow({
    title: [d.title, d.court && h('span', { class: 'tag' }, t('lists.shared.court'))],
    sub: [d.where, cap(bits.join(', '))].filter(Boolean).join('. '),
    href: '#/diary',
  });
  row.addEventListener('click', (ev) => { ev.preventDefault(); editAppointment(a); });
  return h('section', { class: 'diary-lead', 'aria-label': t('lists.diary.phone.lead') },
    h('p', { class: 'diary-lead-when' }, fmtTime(d.time), ' ', h('span', { class: 'meta' }, `${fmtLong(d.date)}, ${relDay(d.date)}`)),
    h('div', { class: 'diary-lead-row' }, row,
      menu({ label: t('lists.diary.actions'), items: [{ label: t('lists.diary.to_calendar'), icon: 'tabler/calendar-plus', run: () => window.open(calendarLink(d), '_blank', 'noopener,noreferrer') }] })));
}

function renderPhone(root) {
  const day = today();
  const appts = store.byKind('appointment').sort(sortAppts);
  const upcoming = appts.filter((a) => a.data.date >= day);
  const lead = nextAppt(upcoming, day);
  const weekEnd = addDays(day, 6);
  const rest = upcoming.filter((a) => a !== lead && (mode !== 'week' || a.data.date <= weekEnd));
  const past = mode === 'agenda' ? appts.filter((a) => a.data.date < day).reverse().slice(0, 15) : [];
  const days = [...new Set(rest.map((a) => a.data.date))];
  const buckets = [
    ['today', (d) => d === day],
    ['tomorrow', (d) => d === addDays(day, 1)],
    ['week', (d) => d > addDays(day, 1) && d <= weekEnd],
    ['later', (d) => d > weekEnd],
  ].map(([k, test]) => [k, days.find(test)]);
  put(root,
    h('header', { class: 'page-head', 'data-diary': '' }, h('h1', {}, t('lists.diary.heading')),
      h('div', { class: 'actions' },
        segmented(t('lists.diary.phone.view_aria'), [['agenda', t('lists.diary.phone.agenda')], ['week', t('lists.diary.phone.week')]], {
          value: mode, onchange: (v) => { mode = v; root.replaceChildren(); diary.render(root); },
        })),
      // On its own row so the switch keeps its full width.
      addBtn(t('lists.diary.add'), () => editAppointment(), 'diary-add')),
    h('nav', { class: 'ribbon', 'aria-label': t('lists.diary.phone.ribbon') },
      buckets.map(([k, target]) => {
        const c = chip(t(`lists.diary.phone.chip_${k}`), { onclick: () => jump(`diary-day-${target}`), ...(target ? {} : { disabled: true }) });
        c.removeAttribute('aria-pressed');
        return c;
      })),
    lead ? leadCard(lead) : h('p', { class: 'empty' }, t('lists.diary.empty')),
    days.map((d, n) => {
      const fold = disclosure(fmtLong(d), h('ul', { class: 'list timed' }, rest.filter((a) => a.data.date === d).map(apptRow)), {
        id: `diary-day-${d}`, badge: h('span', { class: 'meta' }, relDay(d)),
        open: d in folds ? folds[d] : n === 0, onToggle: (o) => { folds[d] = o; },
      });
      fold.classList.add('diary-fold');
      return fold;
    }),
    past.length > 0 && Object.assign(disclosure(t('lists.diary.past', { count: past.length }), apptGroups(past), {
      id: 'diary-past', open: !!folds.past, onToggle: (o) => { folds.past = o; },
    }), { className: 'xo-disc diary-fold' }));
  fabSheet({
    label: t('lists.diary.phone.fab'),
    icon: 'tabler/plus',
    tabs: [
      { key: 'new', label: t('lists.diary.phone.new_tab'), body: ({ close }) => h('ul', { class: 'fab-choices' },
        h('li', {}, button([icon('tabler/calendar-event'), t('lists.diary.add')], { variant: 'ghost', class: 'fab-choice', onclick: () => { close(); editAppointment(); } }))) },
      lead && { key: 'copy', label: t('lists.diary.phone.copy_tab'), body: ({ close }) => h('div', { class: 'diary-copy' },
        h('p', {}, `${lead.data.title}, ${fmtLong(lead.data.date)} ${fmtTime(lead.data.time)}`),
        button([icon('tabler/calendar-plus'), t('lists.diary.to_calendar')], { variant: 'ghost', class: 'fab-choice', onclick: () => { close(); window.open(calendarLink(lead.data), '_blank', 'noopener,noreferrer'); } })) },
    ].filter(Boolean),
  });
}

export const diary = {
  live: true,
  leave: dropFab,
  render(root) {
    dropFab();
    const mq = window.matchMedia(PHONE);
    watchPhone(root, mq, diary, '[data-diary]');
    if (mq.matches) return renderPhone(root);
    put(root,
      h('header', { class: 'page-head', 'data-diary': '' }, h('h1', {}, t('lists.diary.heading')), h('div', { class: 'actions' }, addBtn(t('lists.diary.add'), () => editAppointment()))),
      diaryPart(),
    );
  },
};

const byTime = (a, b) => a.data.time.localeCompare(b.data.time);

// One routine row: its time, a whole-row link that opens its editor, and the seven-day dots.
function routineRow(r, days) {
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
}

const routineDays = () => [...Array(7)].map((_, i) => addDays(today(), i - 6));
const routineList = (list) => h('ul', { class: 'list timed' }, list.map((r) => routineRow(r, routineDays())));

/** The routine list with its seven-day dots, or an empty note. Returns one node. */
export function routinePart() {
  const list = store.byKind('routine').sort(byTime);
  if (!list.length) return h('p', { class: 'empty' }, t('lists.routine.empty'));
  return routineList(list);
}

// Below 40rem Routine follows pattern C: no view switch; chips that jump to Morning, Afternoon and
// Evening (before noon, noon to 5 pm, after); the next item still to tick as the lead card, with its tick
// box; the three parts of the day folded up (first open); a sheet with New routine item.
const routineFolds = {};
const PARTS = [['morning', (time) => time < '12:00'], ['afternoon', (time) => time >= '12:00' && time < '17:00'], ['evening', (time) => time >= '17:00']];

function renderRoutinePhone(root) {
  const list = store.byKind('routine').sort(byTime);
  const now = hm(new Date());
  const todo = list.filter((r) => r.data.active !== false && !store.isTicked(r.id));
  const lead = todo.find((r) => r.data.time >= now) || todo[0] || null;
  const parts = PARTS.map(([k, test]) => [k, list.filter((r) => test(r.data.time))]).filter(([, items]) => items.length);
  let leadNode = h('p', { class: 'empty' }, t('lists.routine.empty'));
  if (lead) {
    const box = tickBox({ checked: false, label: t('lists.routine.phone.mark_done', { name: lead.data.label }), onchange: () => store.setTick(lead.id, true).catch((err) => { box.checked = false; fail(err); }) });
    const row = linkRow({ title: lead.data.label, sub: fmtTime(lead.data.time), href: '#/routine' });
    row.addEventListener('click', (ev) => { ev.preventDefault(); editRoutine(lead); });
    leadNode = h('section', { class: 'routine-lead', 'aria-label': t('lists.routine.phone.lead') },
      h('p', { class: 'tasks-lead-label' }, t('lists.routine.phone.next')),
      h('div', { class: 'tasks-lead-row' }, box, row));
  } else if (list.length) leadNode = h('section', { class: 'routine-lead', 'aria-label': t('lists.routine.phone.lead') }, h('p', { class: 'note' }, t('lists.routine.phone.all_done')));
  put(root,
    h('header', { class: 'page-head', 'data-routine': '' }, h('h1', {}, t('lists.routine.heading'))),
    h('nav', { class: 'ribbon', 'aria-label': t('lists.routine.phone.ribbon') },
      PARTS.map(([k]) => {
        const c = chip(t(`lists.routine.phone.chip_${k}`), { onclick: () => jump(`routine-${k}`), ...(parts.some(([p]) => p === k) ? {} : { disabled: true }) });
        c.removeAttribute('aria-pressed');
        return c;
      })),
    leadNode,
    parts.map(([k, items], n) => {
      const fold = disclosure(t(`lists.routine.phone.fold_${k}`), routineList(items), {
        id: `routine-${k}`, badge: h('span', { class: 'meta' }, String(items.length)),
        open: k in routineFolds ? routineFolds[k] : n === 0, onToggle: (o) => { if (o === (n === 0)) delete routineFolds[k]; else routineFolds[k] = o; },
      });
      fold.classList.add('routine-fold');
      return fold;
    }));
  fabSheet({
    label: t('lists.routine.phone.fab'),
    icon: 'tabler/plus',
    tabs: [
      { key: 'new', label: t('lists.routine.phone.new_tab'), body: ({ close }) => h('ul', { class: 'fab-choices' },
        h('li', {}, button([icon('tabler/clock-plus'), t('lists.routine.add')], { variant: 'ghost', class: 'fab-choice', onclick: () => { close(); editRoutine(); } }))) },
    ],
  });
}

export const routine = {
  live: true,
  leave: dropFab,
  render(root) {
    dropFab();
    const mq = window.matchMedia(PHONE);
    if (document.body.dataset.view === 'routine') {
      watchPhone(root, mq, routine, '[data-routine]');
      if (mq.matches) return renderRoutinePhone(root);
    }
    put(root,
      h('header', { class: 'page-head', 'data-routine': '' }, h('h1', {}, t('lists.routine.heading')), h('div', { class: 'actions' }, addBtn(t('lists.routine.add'), () => editRoutine()))),
      h('p', { class: 'note' }, t('lists.routine.note')),
      routinePart(),
    );
  },
};

const openBills = (day, ahead = 0) => store.byKind('bill').filter((b) => !b.data.finished && (!ahead || b.data.due <= addDays(day, ahead))).sort((a, b) => a.data.due.localeCompare(b.data.due));
const sumOf = (list) => list.reduce((sum, b) => sum + (Number(b.data.amount) || 0), 0);

function billRow(b, day) {
  const d = b.data;
  const late = d.due < day;
  const due = t('lists.bills.due', { when: relDay(d.due) }) + (daysBetween(day, d.due) > 6 ? '' : `, ${fmtDay(d.due)}`);
  const sub = [late ? t('lists.bills.overdue_since', { day: fmtDay(d.due) }) : due,
    d.autopay && t('lists.bills.paid_automatically'), d.repeat !== 'none' && d.repeat, ...customMeta('bill', d.custom)].filter(Boolean).join(', ');
  const box = tickBox({ checked: false, label: t('lists.bills.mark_paid', { name: d.name }), onchange: () => payBill(b).catch((err) => { box.checked = false; fail(err); }) });
  return h('li', { class: late ? 'late' : '' },
    box,
    openRow({ title: d.name, sub, href: '#/bills' }, () => editBill(b)),
    h('span', { class: 'amount' }, d.amount > 0 ? fmtMoney(d.amount) : ''));
}

/** The open bills: a due-in-30-days figure, then the list. ahead is a number of days; 0 shows every open bill. Returns an array of nodes. */
export function billsPart({ ahead = 0 } = {}) {
  const day = today();
  const open = openBills(day, ahead);
  const total = sumOf(open.filter((b) => b.data.due <= addDays(day, 30)));
  return [
    open.length > 0 && h('p', { class: 'figure' }, h('strong', {}, fmtMoney(total)), ' ', t('lists.bills.due_next_30')),
    open.length ? h('ul', { class: 'list bills' }, open.map((b) => billRow(b, day))) : h('p', { class: 'empty' }, t('lists.bills.empty')),
  ];
}

// Below 40rem Bills follows pattern C: no view switch; filter chips (Due this week, Due this month,
// Paid by hand, Automatic; one at a time, each narrows the fold-ups); the next bill and the 30 day
// total as the lead card; Due soon, Later and Paid recently folded up; a sheet with New bill and Totals.
const billFolds = {};
let billFilter = '';
const BILL_FILTERS = {
  week: (b, day) => b.data.due <= addDays(day, 6),
  month: (b, day) => b.data.due.slice(0, 7) <= day.slice(0, 7),
  hand: (b) => !b.data.autopay,
  auto: (b) => !!b.data.autopay,
};

function renderBillsPhone(root) {
  const day = today();
  const open = openBills(day);
  const lead = open[0] || null;
  const keep = (b) => !billFilter || BILL_FILTERS[billFilter](b, day);
  const rest = open.filter((b) => b !== lead && keep(b));
  const soon = rest.filter((b) => b.data.due <= addDays(day, 6));
  const later = rest.filter((b) => b.data.due > addDays(day, 6));
  const since = addDays(day, -30);
  const paid = !billFilter || billFilter === 'hand' || billFilter === 'auto'
    ? store.byKind('bill').filter((b) => b.data.lastPaid && b.data.lastPaid >= since && keep(b)).sort((a, b) => b.data.lastPaid.localeCompare(a.data.lastPaid)) : [];
  const total30 = sumOf(open.filter((b) => b.data.due <= addDays(day, 30)));
  const total7 = sumOf(open.filter((b) => b.data.due <= addDays(day, 6)));
  const totalHand = sumOf(open.filter((b) => b.data.due <= addDays(day, 30) && !b.data.autopay));
  const sections = [
    ['soon', soon, (list) => h('ul', { class: 'list bills' }, list.map((b) => billRow(b, day)))],
    ['later', later, (list) => h('ul', { class: 'list bills' }, list.map((b) => billRow(b, day)))],
    ['paid', paid, (list) => h('ul', { class: 'list bills paid' }, list.map((b) => h('li', {},
      openRow({ title: b.data.name, sub: t('lists.bills.phone.paid_on', { day: fmtDay(b.data.lastPaid) }), href: '#/bills' }, () => editBill(b)),
      h('span', { class: 'amount' }, b.data.amount > 0 ? fmtMoney(b.data.amount) : ''))))],
  ].filter(([, list]) => list.length);
  put(root,
    h('header', { class: 'page-head', 'data-bills': '' }, h('h1', {}, t('lists.bills.heading'))),
    h('nav', { class: 'ribbon', 'aria-label': t('lists.bills.phone.ribbon') },
      Object.keys(BILL_FILTERS).map((k) => chip(t(`lists.bills.phone.chip_${k}`), {
        pressed: billFilter === k, onclick: () => { billFilter = billFilter === k ? '' : k; root.replaceChildren(); bills.render(root); },
      }))),
    lead ? h('section', { class: 'bills-lead', 'aria-label': t('lists.bills.phone.lead') },
      h('p', { class: 'figure' }, h('strong', {}, fmtMoney(total30)), ' ', t('lists.bills.due_next_30')),
      h('p', { class: 'tasks-lead-label' }, t('lists.bills.phone.next')),
      h('ul', { class: 'list bills' }, billRow(lead, day))) : h('p', { class: 'empty' }, t('lists.bills.empty')),
    billFilter && !sections.length && h('p', { class: 'empty' }, t('lists.bills.phone.filter_empty')),
    sections.map(([k, list, body], n) => {
      const fold = disclosure(t(`lists.bills.phone.fold_${k}`), body(list), {
        id: `bills-${k}`, badge: h('span', { class: 'meta' }, String(list.length)),
        open: k in billFolds ? billFolds[k] : n === 0, onToggle: (o) => { if (o === (n === 0)) delete billFolds[k]; else billFolds[k] = o; },
      });
      fold.classList.add('bills-fold');
      return fold;
    }));
  const choice = (iconName, label, run) => h('li', {}, button([icon(iconName), label], { variant: 'ghost', class: 'fab-choice', onclick: run }));
  fabSheet({
    label: t('lists.bills.phone.fab'),
    icon: 'tabler/plus',
    tabs: [
      { key: 'new', label: t('lists.bills.phone.new_tab'), body: ({ close }) => h('ul', { class: 'fab-choices' },
        choice('tabler/receipt', t('lists.bills.add'), () => { close(); editBill(); })) },
      { key: 'totals', label: t('lists.bills.phone.totals_tab'), body: () => h('ul', { class: 'bills-totals' },
        [[t('lists.bills.phone.total_7'), total7], [t('lists.bills.phone.total_30'), total30], [t('lists.bills.phone.total_hand'), totalHand]]
          .map(([label, sum]) => h('li', {}, h('span', {}, label), h('strong', {}, fmtMoney(sum))))) },
    ],
  });
}

export const bills = {
  live: true,
  leave: dropFab,
  render(root) {
    dropFab();
    const mq = window.matchMedia(PHONE);
    watchPhone(root, mq, bills, '[data-bills]');
    if (mq.matches) return renderBillsPhone(root);
    put(root,
      h('header', { class: 'page-head', 'data-bills': '' }, h('h1', {}, t('lists.bills.heading')), h('div', { class: 'actions' }, addBtn(t('lists.bills.add'), () => editBill()))),
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
  const meta = (o) => [when(o.data), o.data.contact, ...customMeta('obligation', o.data.custom)].filter(Boolean).join('. ');
  return {
    court: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.court_heading')), addBtn(t('lists.obligations.court_add'), () => editAppointment(null, { court: true, prep: 45, travel: 45 }))),
      court.length ? apptGroups(court) : h('p', { class: 'empty' }, t('lists.obligations.court_empty'))),
    courtTasks: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.tasks_heading'))),
      quickAdd(t('lists.obligations.tasks_placeholder'), { project: 'Court' }, 'court'),
      courtTasks.length ? h('ul', { class: 'list' }, courtTasks.map((task) => taskRow(task))) : h('p', { class: 'empty' }, t('lists.obligations.tasks_empty'))),
    conditions: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.conditions_heading')), addBtn(t('lists.obligations.conditions_add'), () => editObligation())),
      conditions.length ? h('ul', { class: 'list' }, conditions.map((o) => h('li', {},
        openRow({
          title: o.data.title,
          sub: [o.data.detail && h('small', { class: 'md compact' }, renderMarkdown(o.data.detail)),
            meta(o) && h('small', {}, meta(o))],
          href: '#/obligations',
        }, () => editObligation(o)))))
        : h('p', { class: 'empty' }, t('lists.obligations.conditions_empty'))),
    reports: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, t('lists.obligations.reports_heading')), addBtn(t('lists.obligations.reports_add'), () => editReport())),
      reports.length ? h('ul', { class: 'list timed' }, reports.map((r) => h('li', {},
        h('span', { class: 't' }, fmtDay(r.data.date)),
        openRow({
          title: h('span', { class: 'md compact' }, renderMarkdown(r.data.what)),
          sub: [r.data.who && h('small', {}, t('lists.obligations.told', { who: r.data.who })),
            customMeta('report', r.data.custom).length > 0 && h('small', {}, customMeta('report', r.data.custom).join(', '))],
          href: '#/obligations',
        }, () => editReport(r)))))
        : h('p', { class: 'empty' }, t('lists.obligations.reports_empty'))),
  };
}

// Below 40rem Duties follows pattern C: no view switch; chips that jump to Court dates, To do for court,
// Conditions and Reporting record; the next court date as the lead card (later ones listed under it);
// the other three sections folded up with the first open; a sheet with Court date, Condition and Record.
const dutyFolds = {};

function courtLead(court, day) {
  const lead = nextAppt(court, day) || court[0];
  const later = court.filter((a) => a !== lead);
  const d = lead.data;
  const tm = store.apptTimes(d);
  const bits = [];
  if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
  if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
  const row = linkRow({ title: d.title, sub: [d.where, cap(bits.join(', '))].filter(Boolean).join('. '), href: '#/obligations' });
  row.addEventListener('click', (ev) => { ev.preventDefault(); editAppointment(lead); });
  return h('section', { class: 'diary-lead duties-lead', id: 'duties-court', 'aria-label': t('lists.obligations.phone.lead') },
    h('p', { class: 'diary-lead-when' }, fmtTime(d.time), ' ', h('span', { class: 'meta' }, `${fmtLong(d.date)}, ${relDay(d.date)}`)),
    row,
    d.notes && h('div', { class: 'md compact' }, renderMarkdown(d.notes)),
    later.length > 0 && h('p', { class: 'tasks-lead-label' }, t('lists.obligations.phone.later')),
    later.length > 0 && h('ul', { class: 'list timed' }, later.map(apptRow)));
}

function renderDutiesPhone(root) {
  const day = today();
  const parts = obligationParts();
  const court = store.byKind('appointment').filter((a) => a.data.court && a.data.date >= day).sort(sortAppts);
  const folds = [['tasks', 'courtTasks', 'tasks_heading'], ['conditions', 'conditions', 'conditions_heading'], ['reports', 'reports', 'reports_heading']];
  put(root,
    h('header', { class: 'page-head', 'data-duties': '' }, h('h1', {}, t('lists.obligations.heading'))),
    h('nav', { class: 'ribbon', 'aria-label': t('lists.obligations.phone.ribbon') },
      [['court', 'duties-court', 'court_heading'], ...folds.map(([k, , head]) => [k, `duties-${k}`, head])].map(([k, id]) => {
        const c = chip(t(`lists.obligations.phone.chip_${k}`), { onclick: () => jump(id) });
        c.removeAttribute('aria-pressed');
        return c;
      })),
    callout(t('lists.obligations.note'), { kind: 'neutral', icon: 'tabler/info-circle' }),
    court.length ? courtLead(court, day) : h('p', { class: 'empty', id: 'duties-court' }, t('lists.obligations.court_empty')),
    folds.map(([k, part, heading], n) => {
      const fold = disclosure(t(`lists.obligations.${heading}`), parts[part], {
        id: `duties-${k}`, open: k in dutyFolds ? dutyFolds[k] : n === 0, onToggle: (o) => { if (o === (n === 0)) delete dutyFolds[k]; else dutyFolds[k] = o; },
      });
      fold.classList.add('duties-fold');
      return fold;
    }));
  const choice = (iconName, label, run) => h('li', {}, button([icon(iconName), label], { variant: 'ghost', class: 'fab-choice', onclick: run }));
  fabSheet({
    label: t('lists.obligations.phone.fab'),
    icon: 'tabler/plus',
    tabs: [
      { key: 'court', label: t('lists.obligations.phone.court_tab'), body: ({ close }) => h('ul', { class: 'fab-choices' },
        choice('tabler/gavel', t('lists.obligations.court_add'), () => { close(); editAppointment(null, { court: true, prep: 45, travel: 45 }); })) },
      { key: 'condition', label: t('lists.obligations.phone.condition_tab'), body: ({ close }) => h('ul', { class: 'fab-choices' },
        choice('tabler/list-check', t('lists.obligations.conditions_add'), () => { close(); editObligation(); })) },
      { key: 'record', label: t('lists.obligations.phone.record_tab'), body: ({ close }) => h('ul', { class: 'fab-choices' },
        choice('tabler/notebook', t('lists.obligations.reports_add'), () => { close(); editReport(); })) },
    ],
  });
}

export const obligations = {
  live: true,
  leave: dropFab,
  render(root) {
    dropFab();
    const mq = window.matchMedia(PHONE);
    watchPhone(root, mq, obligations, '[data-duties]');
    if (mq.matches) return renderDutiesPhone(root);
    const parts = obligationParts();
    put(root,
      h('header', { class: 'page-head', 'data-duties': '' }, h('h1', {}, t('lists.obligations.heading')), h('div', { class: 'actions' })),
      callout(t('lists.obligations.note'), { kind: 'neutral', icon: 'tabler/info-circle' }),
      parts.court, parts.courtTasks, parts.conditions, parts.reports,
    );
  },
};
