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
const head = (title, ...actions) => h('header', { class: 'page-head' }, h('h1', {}, title), h('div', { class: 'actions' }, actions));
const addBtn = (label, onclick) => button([icon('tabler/plus'), label], { variant: 'ghost', class: 'small add-btn', onclick });
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
const PHONE = '(max-width: 39.99rem)';
const folds = {};
let mode = 'agenda';
let watching = null;

function watchPhone(root, mq) {
  if (watching) watching.mq.removeEventListener('change', watching.fn);
  const fn = () => { if (root.isConnected && root.querySelector('[data-diary]')) { root.replaceChildren(); diary.render(root); } };
  mq.addEventListener('change', fn);
  watching = { mq, fn };
}

function jump(id) {
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
        }),
        addBtn(t('lists.diary.add'), () => editAppointment()))),
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
    watchPhone(root, mq);
    if (mq.matches) return renderPhone(root);
    put(root,
      h('header', { class: 'page-head', 'data-diary': '' }, h('h1', {}, t('lists.diary.heading')), h('div', { class: 'actions' }, addBtn(t('lists.diary.add'), () => editAppointment()))),
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
      const sub = [late ? t('lists.bills.overdue_since', { day: fmtDay(d.due) }) : due,
        d.autopay && t('lists.bills.paid_automatically'), d.repeat !== 'none' && d.repeat, ...customMeta('bill', d.custom)].filter(Boolean).join(', ');
      const box = tickBox({ checked: false, label: t('lists.bills.mark_paid', { name: d.name }), onchange: () => payBill(b).catch((err) => { box.checked = false; fail(err); }) });
      return h('li', { class: late ? 'late' : '' },
        box,
        openRow({ title: d.name, sub, href: '#/bills' }, () => editBill(b)),
        h('span', { class: 'amount' }, d.amount > 0 ? fmtMoney(d.amount) : ''));
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
