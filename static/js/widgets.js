// The Bridge widget catalogue: one entry per kind of widget. The Bridge (board.js), the
// catalogue dialog, the starter layout and the tests all read this list, so a new widget is
// one entry here plus its wording in content/text/bridge.yaml (bridge.widgets.<type>).
//
// Each entry:
//   group    catalogue heading (bridge.groups.<group>)
//   size     default and least size, in rows and in columns of a 24-column board
//   span     columns it takes in the starter layout, counted in tracks (1, or 2 for wide widgets)
//   opts     per-widget options: { k, type: 'bool' | 'choice', def, values } (labels in bridge.widgets.<type>.opts)
//   tick     'second' or 'minute' when the widget shows the time and redraws by itself
//   tools    (o, ctx) => extra title-bar buttons
//   render   (el, o, ctx) => fills the widget body. ctx.state survives redraws; ctx.redraw() redraws.
import * as store from './store.js';
import { WEEKLY_QUESTIONS } from './content.js';
import { editAppointment, editBill, editObligation, editReport, editRoutine, editTask } from './forms.js';
import { t, text } from './text.js';
import { button } from './ui.js';
import { addDays, daysBetween, fmtDay, fmtLong, fmtMoney, fmtTime, h, put, relDay, toDate, today } from './util.js';
import { billsPart, diaryPart, obligationParts, routinePart, taskParts } from './views/lists.js';
import { openPlanCard, planCardBody } from './views/plan.js';
import { checkinId, lineForToday, todayBlocks } from './views/today.js';

export const GROUPS = ['today', 'time', 'lists', 'money', 'checkins', 'plan'];

const w = (key, vars) => t(`bridge.widgets.${key}`, vars);
const tool = (label, onclick) => button(label, { class: 'bw-tool', onclick });
const pad = (n) => String(n).padStart(2, '0');
const CHECKINS = ['morning', 'evening', 'weekly'];

// Appointments, bills and tasks that fall on one day, for the week strip and month calendar.
function dayItems(day) {
  const out = [];
  for (const a of store.byKind('appointment'))
    if (a.data.date === day) out.push({ kind: a.data.court ? 'court' : 'appt', time: a.data.time, text: a.data.title, open: () => editAppointment(a) });
  for (const b of store.byKind('bill'))
    if (!b.data.finished && b.data.due === day) out.push({ kind: 'bill', time: '', text: `${b.data.name}${b.data.amount ? `, ${fmtMoney(b.data.amount)}` : ''}`, open: () => editBill(b) });
  for (const task of store.byKind('task'))
    if (!task.data.done && task.data.due === day) out.push({ kind: 'task', time: '', text: task.data.title, open: () => editTask(task) });
  return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
const itemRow = (it) => h('li', { class: `bw-ev k-${it.kind}` },
  button([it.time && h('span', { class: 'bw-ev-t' }, fmtTime(it.time)), h('span', {}, it.text)], { variant: 'row', class: 'row-main', onclick: it.open }));

// A label for one answer in a saved check-in.
function answerLabel(type, k) {
  if (type === 'weekly') return WEEKLY_QUESTIONS.find((q) => q.k === k)?.q || k;
  const known = text('bridge.widgets.history.fields') || {};
  return known[k] || k;
}

export const WIDGETS = {
  clock: {
    group: 'time', size: { w: 4, h: 5, minW: 2, minH: 3 }, span: 1, tick: 'second',
    opts: [
      { k: 'seconds', type: 'bool', def: false },
      { k: 'date', type: 'bool', def: true },
      { k: 'greet', type: 'bool', def: true },
      { k: 'scale', type: 'choice', def: 'm', values: ['s', 'm', 'l', 'xl'] },
    ],
    render(el, o) {
      const now = new Date();
      const prefs = window.XOLook.prefs;
      const hour = now.getHours();
      const greet = o.greet && prefs.callMe && t(`today.greeting.${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`, { name: prefs.callMe });
      put(el, h('div', { class: `bw-clock s-${o.scale}` },
        h('p', { class: 'bw-time' }, fmtTime(`${pad(hour)}:${pad(now.getMinutes())}`), o.seconds && h('span', { class: 'bw-sec' }, pad(now.getSeconds()))),
        o.date && h('p', { class: 'bw-date' }, fmtLong(today())),
        greet && h('p', { class: 'bw-greet' }, greet)));
    },
  },

  next: {
    group: 'today', size: { w: 6, h: 5, minW: 3, minH: 3 }, span: 1, tick: 'minute', opts: [],
    render(el) { put(el, todayBlocks().blocks.next); },
  },

  dayline: {
    group: 'today', size: { w: 6, h: 18, minW: 3, minH: 4 }, span: 1, tick: 'minute',
    opts: [{ k: 'past', type: 'choice', def: 'show', values: ['show', 'fade', 'hide'] }],
    render(el, o) { el.dataset.past = o.past; put(el, todayBlocks().blocks.day); },
  },

  three: {
    group: 'today', size: { w: 6, h: 7, minW: 3, minH: 3 }, span: 1, opts: [],
    render(el) { put(el, todayBlocks().blocks.three); },
  },

  coming: {
    group: 'today', size: { w: 6, h: 9, minW: 3, minH: 3 }, span: 1,
    opts: [{ k: 'ahead', type: 'choice', def: '7', values: ['7', '14', '30', '60'] }],
    render(el, o) { put(el, todayBlocks({ horizon: Number(o.ahead) }).blocks.coming); },
  },

  line: {
    group: 'today', size: { w: 6, h: 4, minW: 2, minH: 2 }, span: 1, opts: [],
    render(el) {
      const line = lineForToday();
      put(el, h('p', { class: 'line bw-line' }, line.label && h('span', { class: 'line-label' }, `${line.label}: `), line.text));
    },
  },

  nudge: {
    group: 'plan', size: { w: 6, h: 4, minW: 2, minH: 2 }, span: 1, opts: [],
    render(el) { put(el, todayBlocks().blocks.plan || h('p', { class: 'note' }, w('nudge.complete'))); },
  },

  week: {
    group: 'time', size: { w: 12, h: 8, minW: 4, minH: 4 }, span: 2, tick: 'minute',
    opts: [
      { k: 'from', type: 'choice', def: 'today', values: ['today', 'monday'] },
      { k: 'days', type: 'choice', def: '7', values: ['5', '7', '14'] },
    ],
    render(el, o) {
      const now = today();
      let first = now;
      if (o.from === 'monday') first = addDays(now, -((toDate(now).getDay() + 6) % 7));
      const days = [...Array(Number(o.days))].map((_, i) => addDays(first, i));
      put(el, h('ol', { class: 'bw-week', style: `--n: ${Math.min(days.length, 7)}` }, days.map((d) => {
        const items = dayItems(d);
        return h('li', { class: `bw-day${d === now ? ' is-today' : ''}${d < now ? ' is-past' : ''}` },
          h('p', { class: 'bw-day-head' }, h('strong', {}, fmtDay(d)), h('small', {}, relDay(d))),
          items.length ? h('ul', {}, items.map(itemRow)) : h('p', { class: 'bw-quiet' }, w('week.free')));
      })));
    },
  },

  month: {
    group: 'time', size: { w: 12, h: 14, minW: 5, minH: 7 }, span: 2, tick: 'minute',
    opts: [
      { k: 'weekStart', type: 'choice', def: 'monday', values: ['monday', 'sunday'] },
      { k: 'detail', type: 'choice', def: 'titles', values: ['dots', 'titles'] },
    ],
    tools(o, ctx) {
      const shift = (n) => { ctx.state.offset = (ctx.state.offset || 0) + n; ctx.redraw(); };
      return [
        tool(w('month.previous'), () => shift(-1)),
        tool(w('month.this_month'), () => { ctx.state.offset = 0; ctx.redraw(); }),
        tool(w('month.next'), () => shift(1)),
      ];
    },
    render(el, o, ctx) {
      const now = today();
      const base = toDate(now);
      const shown = new Date(base.getFullYear(), base.getMonth() + (ctx.state.offset || 0), 1);
      const firstDay = `${shown.getFullYear()}-${pad(shown.getMonth() + 1)}-01`;
      const lead = o.weekStart === 'monday' ? (shown.getDay() + 6) % 7 : shown.getDay();
      const start = addDays(firstDay, -lead);
      const names = text('bridge.widgets.month.weekdays') || [];
      const order = o.weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
      const title = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(shown);
      const cells = [...Array(42)].map((_, i) => {
        const d = addDays(start, i);
        const items = dayItems(d);
        const inMonth = toDate(d).getMonth() === shown.getMonth();
        return h('li', { class: `bw-cell${inMonth ? '' : ' out'}${d === now ? ' is-today' : ''}${d < now ? ' is-past' : ''}` },
          h('span', { class: 'bw-cell-n' }, String(toDate(d).getDate())),
          items.length > 0 && (o.detail === 'dots'
            ? h('span', { class: 'bw-dots', 'aria-label': w('month.count', { n: items.length }) }, items.slice(0, 6).map((it) => h('i', { class: `k-${it.kind}` })))
            : h('ul', {}, items.slice(0, 4).map(itemRow), items.length > 4 && h('li', { class: 'bw-more' }, w('month.more', { n: items.length - 4 })))));
      });
      put(el,
        h('p', { class: 'bw-month-title' }, title),
        h('ol', { class: 'bw-month' }, order.map((n) => h('li', { class: 'bw-wd', 'aria-hidden': 'true' }, names[n] || '')), cells));
    },
  },

  tasks: {
    group: 'lists', size: { w: 6, h: 12, minW: 3, minH: 4 }, span: 1,
    opts: [
      { k: 'quick', type: 'bool', def: true },
      { k: 'picked', type: 'bool', def: false },
      { k: 'soon', type: 'bool', def: true },
      { k: 'rest', type: 'bool', def: true },
      { k: 'done', type: 'bool', def: false },
    ],
    render(el, o) {
      const p = taskParts();
      put(el, o.quick && p.quick, o.picked && p.picked, o.soon && p.soon, o.rest && p.rest, o.done && p.done);
    },
  },

  quick: {
    group: 'lists', size: { w: 6, h: 3, minW: 3, minH: 2 }, span: 1, opts: [],
    render(el) { put(el, taskParts().quick); },
  },

  diary: {
    group: 'lists', size: { w: 6, h: 10, minW: 3, minH: 4 }, span: 1,
    opts: [{ k: 'ahead', type: 'choice', def: '30', values: ['7', '14', '30', '90', '0'] }],
    tools: () => [tool(w('diary.add'), () => editAppointment())],
    render(el, o) { put(el, diaryPart({ ahead: Number(o.ahead) })); },
  },

  routine: {
    group: 'lists', size: { w: 6, h: 9, minW: 3, minH: 3 }, span: 1, opts: [],
    tools: () => [tool(w('routine.add'), () => editRoutine())],
    render(el) { put(el, routinePart()); },
  },

  bills: {
    group: 'money', size: { w: 6, h: 8, minW: 3, minH: 3 }, span: 1,
    opts: [{ k: 'ahead', type: 'choice', def: '0', values: ['14', '30', '60', '0'] }],
    tools: () => [tool(w('bills.add'), () => editBill())],
    render(el, o) { put(el, billsPart({ ahead: Number(o.ahead) })); },
  },

  money: {
    group: 'money', size: { w: 6, h: 9, minW: 3, minH: 4 }, span: 1,
    opts: [{ k: 'count', type: 'choice', def: '5', values: ['3', '5', '10', '20'] }],
    render(el, o) {
      const day = today();
      const open = store.byKind('bill').filter((b) => !b.data.finished).sort((a, b) => a.data.due.localeCompare(b.data.due));
      const sum = (list) => list.reduce((s, b) => s + (Number(b.data.amount) || 0), 0);
      const late = open.filter((b) => b.data.due < day);
      const week = open.filter((b) => b.data.due >= day && b.data.due <= addDays(day, 7));
      const month = open.filter((b) => b.data.due >= day && b.data.due <= addDays(day, 30));
      const fig = (label, list, cls = '') => h('div', { class: `bw-fig ${cls}` },
        h('strong', {}, fmtMoney(sum(list))), h('span', {}, label), h('small', {}, w(list.length === 1 ? 'money.bills_one' : 'money.bills', { n: list.length })));
      put(el,
        h('div', { class: 'bw-figs' },
          late.length > 0 && fig(w('money.overdue'), late, 'late'),
          fig(w('money.week'), week),
          fig(w('money.month'), month),
          fig(w('money.manual'), month.filter((b) => !b.data.autopay)),
          fig(w('money.autopay'), month.filter((b) => b.data.autopay))),
        open.length
          ? h('ul', { class: 'list bw-compact' }, open.slice(0, Number(o.count)).map((b) => h('li', { class: b.data.due < day ? 'late' : '' },
              button([h('span', {}, b.data.name, b.data.amount > 0 && h('span', { class: 'meta' }, fmtMoney(b.data.amount))),
                h('small', {}, [b.data.due < day ? t('lists.shared.overdue_since', { day: fmtDay(b.data.due) }) : relDay(b.data.due), b.data.autopay && t('lists.bills.paid_automatically')].filter(Boolean).join(', '))],
              { variant: 'row', class: 'row-main', onclick: () => editBill(b) }))))
          : h('p', { class: 'empty' }, t('lists.bills.empty')));
    },
  },

  obligations: {
    group: 'lists', size: { w: 6, h: 10, minW: 3, minH: 3 }, span: 1,
    opts: [{ k: 'part', type: 'choice', def: 'all', values: ['all', 'court', 'courtTasks', 'conditions', 'reports'] }],
    render(el, o) {
      const p = obligationParts();
      put(el, o.part === 'all' ? [p.court, p.courtTasks, p.conditions, p.reports] : p[o.part]);
    },
  },

  checkins: {
    group: 'checkins', size: { w: 6, h: 7, minW: 3, minH: 3 }, span: 1, tick: 'minute',
    opts: [{ k: 'days', type: 'choice', def: '7', values: ['3', '7', '14', '28'] }],
    render(el, o) {
      const day = today();
      const days = [...Array(Number(o.days))].map((_, i) => addDays(day, -i));
      put(el,
        h('div', { class: 'row bw-launch' }, CHECKINS.map((type) => {
          const done = !!store.get(checkinId(type, day));
          return h('a', { class: done ? 'ghost' : 'primary', href: `#/checkin/${type}` }, done ? w('checkins.done_today', { title: t(`checkin.title.${type}`) }) : t(`checkin.title.${type}`));
        })),
        h('table', { class: 'history bw-history' },
          h('thead', {}, h('tr', {}, h('th', {}, t('checkin.landing.day')), h('th', {}, t('checkin.landing.col_morning')), h('th', {}, t('checkin.landing.col_evening')))),
          h('tbody', {}, days.map((d) => h('tr', {}, h('td', {}, fmtDay(d)),
            ['morning', 'evening'].map((type) => h('td', {}, h('a', { href: `#/checkin/${type}/${d}`, class: store.get(checkinId(type, d)) ? 'yes' : 'no' },
              t(store.get(checkinId(type, d)) ? 'checkin.landing.done' : 'checkin.landing.open')))))))));
    },
  },

  history: {
    group: 'checkins', size: { w: 6, h: 12, minW: 3, minH: 4 }, span: 1,
    opts: [
      { k: 'type', type: 'choice', def: 'all', values: ['all', 'morning', 'evening', 'weekly'] },
      { k: 'days', type: 'choice', def: '7', values: ['3', '7', '14', '35'] },
    ],
    render(el, o) {
      const from = addDays(today(), -Number(o.days));
      const list = store.byKind('checkin')
        .map((c) => { const [, type, d] = c.id.split(':'); return { c, type, d }; })
        .filter((x) => (o.type === 'all' || x.type === o.type) && x.d > from)
        .sort((a, b) => b.d.localeCompare(a.d) || CHECKINS.indexOf(a.type) - CHECKINS.indexOf(b.type));
      if (!list.length) { put(el, h('p', { class: 'empty' }, w('history.empty'))); return; }
      put(el, list.map(({ c, type, d }) => h('article', { class: 'bw-answers' },
        h('h3', {}, h('a', { href: `#/checkin/${type}/${d}` }, `${t(`checkin.title.${type}`)}, ${fmtDay(d)}`)),
        h('dl', {}, Object.entries(c.data).filter(([k, v]) => k !== 'type' && k !== 'at' && (Array.isArray(v) ? v.length : String(v ?? '').trim()))
          .map(([k, v]) => [h('dt', {}, answerLabel(type, k)), h('dd', { class: 'own' }, Array.isArray(v) ? v.join(', ') : String(v))])))));
    },
  },

  plancard: {
    group: 'plan', size: { w: 6, h: 14, minW: 3, minH: 4 }, span: 1, opts: [],
    tools: () => [tool(w('plancard.open'), openPlanCard)],
    render(el) { put(el, planCardBody()); },
  },

  launcher: {
    group: 'plan', size: { w: 6, h: 6, minW: 2, minH: 3 }, span: 1, opts: [],
    render(el) {
      const go = (label, fn) => button(label, { onclick: fn });
      put(el, h('div', { class: 'bw-launch' },
        go(w('launcher.appointment'), () => editAppointment()),
        go(w('launcher.court'), () => editAppointment(null, { court: true, prep: 45, travel: 45 })),
        go(w('launcher.task'), () => editTask()),
        go(w('launcher.routine'), () => editRoutine()),
        go(w('launcher.bill'), () => editBill()),
        go(w('launcher.condition'), () => editObligation()),
        go(w('launcher.report'), () => editReport()),
        go(w('launcher.plan_card'), openPlanCard),
        CHECKINS.map((type) => h('a', { class: 'ghost', href: `#/checkin/${type}` }, t(`checkin.title.${type}`)))));
    },
  },

  body: {
    group: 'checkins', size: { w: 6, h: 6, minW: 3, minH: 3 }, span: 1,
    opts: [{ k: 'days', type: 'choice', def: '7', values: ['3', '7', '14'] }],
    render(el, o) {
      // What you picked for "What is your body doing", day by day, as you picked it. No totals.
      const days = [...Array(Number(o.days))].map((_, i) => addDays(today(), -i));
      const rows = days.flatMap((d) => ['morning', 'evening'].map((type) => ({ d, type, picked: store.get(checkinId(type, d))?.data.body || [] })))
        .filter((r) => r.picked.length);
      if (!rows.length) { put(el, h('p', { class: 'empty' }, w('body.empty'))); return; }
      put(el, h('ul', { class: 'bw-body-log' }, rows.map((r) => h('li', {},
        h('span', { class: 'bw-ev-t' }, `${fmtDay(r.d)}, ${t(`checkin.landing.col_${r.type}`)}`),
        h('span', { class: 'chips' }, r.picked.map((p) => h('span', { class: 'chip on' }, p)))))));
    },
  },

  countdown: {
    group: 'time', size: { w: 6, h: 6, minW: 3, minH: 3 }, span: 1, tick: 'minute',
    opts: [{ k: 'what', type: 'choice', def: 'court', values: ['court', 'appointments', 'bills', 'all'] }],
    render(el, o) {
      // Days until each coming date, in order. Sequence is information.
      const day = today();
      const list = [];
      for (const a of store.byKind('appointment'))
        if (a.data.date >= day && (o.what === 'all' || o.what === 'appointments' || (o.what === 'court' && a.data.court)))
          list.push({ d: a.data.date, text: a.data.title, open: () => editAppointment(a) });
      if (o.what === 'bills' || o.what === 'all')
        for (const b of store.byKind('bill')) if (!b.data.finished && b.data.due >= day) list.push({ d: b.data.due, text: b.data.name, open: () => editBill(b) });
      list.sort((a, b) => a.d.localeCompare(b.d));
      if (!list.length) { put(el, h('p', { class: 'empty' }, w('countdown.empty'))); return; }
      put(el, h('ul', { class: 'bw-count' }, list.slice(0, 12).map((x) => {
        const n = daysBetween(day, x.d);
        return h('li', {}, h('strong', { class: 'num' }, String(n)), h('span', {}, w(n === 1 ? 'countdown.day' : 'countdown.days')),
          button(h('span', {}, `${x.text}, ${fmtDay(x.d)}`), { variant: 'row', class: 'row-main', onclick: x.open }));
      })));
    },
  },
};

// The starter set, in reading order. The Bridge places these in tracks to suit the screen.
export const STARTER = ['clock', 'next', 'line', 'dayline', 'three', 'coming', 'week', 'tasks', 'checkins',
  'money', 'month', 'diary', 'countdown', 'obligations', 'routine', 'history', 'launcher', 'plancard', 'nudge'];

// The options of a widget with defaults filled in and anything unknown dropped.
export function cleanOpts(type, raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const o of WIDGETS[type].opts) {
    if (o.type === 'bool') out[o.k] = typeof raw[o.k] === 'boolean' ? raw[o.k] : o.def;
    else out[o.k] = o.values.includes(String(raw[o.k])) ? String(raw[o.k]) : o.def;
  }
  return out;
}
