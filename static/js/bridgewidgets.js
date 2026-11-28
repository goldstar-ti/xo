// The content widgets that came from the Bridge branch: clock, the Today blocks, the week strip, the month
// calendar, list parts, money totals, check-in views, the plan card, shortcuts and a countdown. They are
// registered on the canvas by static/js/widgets.js, which passes in liveWidget.
//
// Each entry is a registry entry (see widgets.js) with `draw(body, opts, ctx)` in place of `render`: draw fills the
// emptied body, and the wrapper in widgets.js keeps it live. Every list or block is drawn by the screen's own part
// (todayBlocks, diaryPart, billsPart, taskSections ...), so a change to a screen shows in its widget too.
// Wording is under `canvas` in content/text/canvas.yaml: names `canvas.widgets.<id>`, descriptions `canvas.about.<id>`,
// option labels `canvas.opts.<id>.<k>`, widget text `canvas.cw.<id>.*`.
import * as store from './store.js';
import { WEEKLY_QUESTIONS } from './content.js';
import { editAppointment, editBill, editObligation, editReport, editRoutine, editTask } from './forms.js';
import { t, text } from './text.js';
import { button } from './ui.js';
import { addDays, daysBetween, fmtDay, fmtLong, fmtMoney, fmtTime, h, put, relDay, toDate, today } from './util.js';
import { billsPart, diaryPart, obligationParts, routinePart } from './views/lists.js';
import { openPlanCard, planCardBody } from './views/plan.js';
import { quickAdd, taskSections } from './views/tasks.js';
import { checkinId, lineForToday, todayBlocks } from './views/today.js';

const cw = (key, vars) => t(`canvas.cw.${key}`, vars);
const pad = (n) => String(n).padStart(2, '0');
const CHECKINS = ['morning', 'evening', 'weekly'];
const tool = (key, ico, label, run) => ({ key, ico, label, run });

// Appointments, bills and tasks that fall on one day, for the week strip and the month calendar.
export function dayItems(day) {
  const out = [];
  for (const a of store.byKind('appointment'))
    if (a.data.date === day) out.push({ kind: a.data.court ? 'court' : 'appt', time: a.data.time, text: a.data.title, open: () => editAppointment(a) });
  for (const b of store.byKind('bill'))
    if (!b.data.finished && b.data.due === day) out.push({ kind: 'bill', time: '', text: `${b.data.name}${b.data.amount ? `, ${fmtMoney(b.data.amount)}` : ''}`, open: () => editBill(b) });
  for (const task of store.byKind('task'))
    if (!task.data.done && task.data.due === day) out.push({ kind: 'task', time: '', text: task.data.title, open: () => editTask(task) });
  return out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
const itemRow = (it) => h('li', { class: `cw-ev k-${it.kind}` },
  button([it.time && h('span', { class: 'cw-ev-t' }, fmtTime(it.time)), h('span', {}, it.text)], { variant: 'row', class: 'row-main', onclick: it.open }));

// A label for one answer in a saved check-in.
export function answerLabel(type, k) {
  if (type === 'weekly') return WEEKLY_QUESTIONS.find((q) => q.k === k)?.q || k;
  return (text('canvas.cw.history.fields') || {})[k] || k;
}

const blocksFor = (opts) => todayBlocks(opts).blocks;

// [id, entry]: the 22 widgets, in the order the Widgets list shows them inside each group.
export const BRIDGE_WIDGETS = [
  ['clock', {
    group: 'time', w: 6, h: 8, tick: 'second',
    opts: [
      { k: 'seconds', type: 'bool', def: false },
      { k: 'date', type: 'bool', def: true },
      { k: 'greet', type: 'bool', def: true },
      { k: 'scale', type: 'choice', def: 'm', values: ['s', 'm', 'l', 'xl'] },
    ],
    draw(el, o) {
      const now = new Date();
      const prefs = window.XOLook.prefs;
      const hour = now.getHours();
      const greet = o.greet && prefs.callMe && t(`today.greeting.${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`, { name: prefs.callMe });
      put(el, h('div', { class: `cw-clock s-${o.scale}` },
        h('p', { class: 'cw-time' }, fmtTime(`${pad(hour)}:${pad(now.getMinutes())}`), o.seconds && h('span', { class: 'cw-sec' }, pad(now.getSeconds()))),
        o.date && h('p', { class: 'cw-date' }, fmtLong(today())),
        greet && h('p', { class: 'cw-greet' }, greet)));
    },
  }],
  ['week', {
    group: 'time', w: 16, h: 12, tick: 'minute',
    opts: [
      { k: 'from', type: 'choice', def: 'today', values: ['today', 'monday'] },
      { k: 'days', type: 'choice', def: '7', values: ['5', '7', '14'] },
    ],
    draw(el, o) {
      const now = today();
      let first = now;
      if (o.from === 'monday') first = addDays(now, -((toDate(now).getDay() + 6) % 7));
      const days = [...Array(Number(o.days))].map((_, i) => addDays(first, i));
      put(el, h('ol', { class: 'cw-week', style: `--n: ${Math.min(days.length, 7)}` }, days.map((d) => {
        const items = dayItems(d);
        return h('li', { class: `cw-day${d === now ? ' is-today' : ''}${d < now ? ' is-past' : ''}` },
          h('p', { class: 'cw-day-head' }, h('strong', {}, fmtDay(d)), h('small', {}, relDay(d))),
          items.length ? h('ul', {}, items.map(itemRow)) : h('p', { class: 'cw-quiet' }, cw('week.free')));
      })));
    },
  }],
  ['month', {
    group: 'time', w: 16, h: 22, tick: 'minute',
    opts: [
      { k: 'weekStart', type: 'choice', def: 'monday', values: ['monday', 'sunday'] },
      { k: 'detail', type: 'choice', def: 'titles', values: ['dots', 'titles'] },
    ],
    tools(ctx) {
      const shift = (n) => { ctx.state.offset = (ctx.state.offset || 0) + n; ctx.redraw(); };
      return [
        tool('prev', 'caret-left', cw('month.previous'), () => shift(-1)),
        tool('this', 'calendar-blank', cw('month.this_month'), () => { ctx.state.offset = 0; ctx.redraw(); }),
        tool('next', 'caret-right', cw('month.next'), () => shift(1)),
      ];
    },
    draw(el, o, ctx) {
      const now = today();
      const base = toDate(now);
      const shown = new Date(base.getFullYear(), base.getMonth() + (ctx.state.offset || 0), 1);
      const firstDay = `${shown.getFullYear()}-${pad(shown.getMonth() + 1)}-01`;
      const lead = o.weekStart === 'monday' ? (shown.getDay() + 6) % 7 : shown.getDay();
      const start = addDays(firstDay, -lead);
      const names = text('canvas.cw.month.weekdays') || [];
      const order = o.weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
      const title = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(shown);
      const cells = [...Array(42)].map((_, i) => {
        const d = addDays(start, i);
        const items = dayItems(d);
        const inMonth = toDate(d).getMonth() === shown.getMonth();
        return h('li', { class: `cw-cell${inMonth ? '' : ' out'}${d === now ? ' is-today' : ''}${d < now ? ' is-past' : ''}` },
          h('span', { class: 'cw-cell-n' }, String(toDate(d).getDate())),
          items.length > 0 && (o.detail === 'dots'
            ? h('span', { class: 'cw-dots', 'aria-label': cw('month.count', { n: items.length }) }, items.slice(0, 6).map((it) => h('i', { class: `k-${it.kind}` })))
            : h('ul', {}, items.slice(0, 4).map(itemRow), items.length > 4 && h('li', { class: 'cw-more' }, cw('month.more', { n: items.length - 4 })))));
      });
      put(el,
        h('p', { class: 'cw-month-title' }, title),
        h('ol', { class: 'cw-month' }, order.map((n) => h('li', { class: 'cw-wd', 'aria-hidden': 'true' }, names[n] || '')), cells));
    },
  }],
  ['countdown', {
    group: 'time', w: 8, h: 9, tick: 'minute',
    opts: [{ k: 'what', type: 'choice', def: 'court', values: ['court', 'appointments', 'bills', 'all'] }],
    draw(el, o) {
      // Days until each coming date, in order. Sequence is information.
      const day = today();
      const list = [];
      for (const a of store.byKind('appointment'))
        if (a.data.date >= day && (o.what === 'all' || o.what === 'appointments' || (o.what === 'court' && a.data.court)))
          list.push({ d: a.data.date, text: a.data.title, open: () => editAppointment(a) });
      if (o.what === 'bills' || o.what === 'all')
        for (const b of store.byKind('bill')) if (!b.data.finished && b.data.due >= day) list.push({ d: b.data.due, text: b.data.name, open: () => editBill(b) });
      list.sort((a, b) => a.d.localeCompare(b.d));
      if (!list.length) { put(el, h('p', { class: 'empty' }, cw('countdown.empty'))); return; }
      put(el, h('ul', { class: 'cw-count' }, list.slice(0, 12).map((x) => {
        const n = daysBetween(day, x.d);
        return h('li', {}, h('strong', { class: 'num' }, String(n)), h('span', {}, cw(n === 1 ? 'countdown.day' : 'countdown.days')),
          button(h('span', {}, `${x.text}, ${fmtDay(x.d)}`), { variant: 'row', class: 'row-main', onclick: x.open }));
      })));
    },
  }],

  ['next', {
    group: 'today', w: 8, h: 10, tick: 'minute', opts: [],
    draw(el) { put(el, blocksFor().next); },
  }],
  ['dayline', {
    group: 'today', w: 8, h: 27, tick: 'minute',
    opts: [{ k: 'past', type: 'choice', def: 'show', values: ['show', 'fade', 'hide'] }],
    draw(el, o) { el.dataset.past = o.past; put(el, blocksFor().day); },
  }],
  ['three', {
    group: 'today', w: 8, h: 11, opts: [],
    draw(el) { put(el, blocksFor().three); },
  }],
  ['coming', {
    group: 'today', w: 8, h: 14,
    opts: [{ k: 'ahead', type: 'choice', def: '7', values: ['7', '14', '30', '60'] }],
    draw(el, o) { put(el, blocksFor({ horizon: Number(o.ahead) }).coming); },
  }],
  ['line', {
    group: 'today', w: 8, h: 6, opts: [],
    draw(el) {
      const line = lineForToday();
      put(el, h('p', { class: 'line cw-line' }, line.label && h('span', { class: 'line-label' }, `${line.label}: `), line.text));
    },
  }],

  ['tasks-list', {
    group: 'lists', w: 8, h: 18,
    opts: [
      { k: 'quick', type: 'bool', def: true },
      { k: 'review', type: 'bool', def: true },
    ],
    draw(el, o) {
      // The review, Done and Archived sections are the closed details at the end of the list.
      const sections = taskSections().filter((s) => o.review || !s?.matches?.('details'));
      put(el, o.quick && quickAdd(t('lists.tasks.add_placeholder'), {}, 'task-widget', { preview: true }), sections);
    },
  }],
  ['quick', {
    group: 'lists', w: 8, h: 5, opts: [],
    draw(el) { put(el, quickAdd(t('lists.tasks.add_placeholder'), {}, 'task-quick', { preview: true })); },
  }],
  ['diary-list', {
    group: 'lists', w: 8, h: 15,
    opts: [{ k: 'ahead', type: 'choice', def: '30', values: ['7', '14', '30', '90', '0'] }],
    tools: () => [tool('add', 'plus', cw('diary.add'), () => editAppointment())],
    draw(el, o) { put(el, diaryPart({ ahead: Number(o.ahead) })); },
  }],
  ['routine-list', {
    group: 'lists', w: 8, h: 14, opts: [],
    tools: () => [tool('add', 'plus', cw('routine.add'), () => editRoutine())],
    draw(el) { put(el, routinePart()); },
  }],
  ['obligations-list', {
    group: 'lists', w: 8, h: 15,
    opts: [{ k: 'part', type: 'choice', def: 'all', values: ['all', 'court', 'courtTasks', 'conditions', 'reports'] }],
    draw(el, o) {
      const p = obligationParts();
      put(el, o.part === 'all' ? [p.court, p.courtTasks, p.conditions, p.reports] : p[o.part]);
    },
  }],

  ['bills-list', {
    group: 'money', w: 8, h: 12,
    opts: [{ k: 'ahead', type: 'choice', def: '0', values: ['14', '30', '60', '0'] }],
    tools: () => [tool('add', 'plus', cw('bills.add'), () => editBill())],
    draw(el, o) { put(el, billsPart({ ahead: Number(o.ahead) })); },
  }],
  ['money', {
    group: 'money', w: 8, h: 14,
    opts: [{ k: 'count', type: 'choice', def: '5', values: ['3', '5', '10', '20'] }],
    draw(el, o) {
      const day = today();
      const open = store.byKind('bill').filter((b) => !b.data.finished).sort((a, b) => a.data.due.localeCompare(b.data.due));
      const sum = (list) => list.reduce((s, b) => s + (Number(b.data.amount) || 0), 0);
      const late = open.filter((b) => b.data.due < day);
      const week = open.filter((b) => b.data.due >= day && b.data.due <= addDays(day, 7));
      const month = open.filter((b) => b.data.due >= day && b.data.due <= addDays(day, 30));
      const fig = (label, list, cls = '') => h('div', { class: `cw-fig ${cls}` },
        h('strong', {}, fmtMoney(sum(list))), h('span', {}, label), h('small', {}, cw(list.length === 1 ? 'money.bills_one' : 'money.bills', { n: list.length })));
      put(el,
        h('div', { class: 'cw-figs' },
          late.length > 0 && fig(cw('money.overdue'), late, 'late'),
          fig(cw('money.week'), week),
          fig(cw('money.month'), month),
          fig(cw('money.manual'), month.filter((b) => !b.data.autopay)),
          fig(cw('money.autopay'), month.filter((b) => b.data.autopay))),
        open.length
          ? h('ul', { class: 'list cw-compact' }, open.slice(0, Number(o.count)).map((b) => h('li', { class: b.data.due < day ? 'late' : '' },
              button([h('span', {}, b.data.name, b.data.amount > 0 && h('span', { class: 'meta' }, fmtMoney(b.data.amount))),
                h('small', {}, [b.data.due < day ? t('lists.shared.overdue_since', { day: fmtDay(b.data.due) }) : relDay(b.data.due), b.data.autopay && t('lists.bills.paid_automatically')].filter(Boolean).join(', '))],
              { variant: 'row', class: 'row-main', onclick: () => editBill(b) }))))
          : h('p', { class: 'empty' }, t('lists.bills.empty')));
    },
  }],

  ['checkins-week', {
    group: 'checkins', w: 8, h: 11, tick: 'minute',
    opts: [{ k: 'days', type: 'choice', def: '7', values: ['3', '7', '14', '28'] }],
    draw(el, o) {
      const day = today();
      const days = [...Array(Number(o.days))].map((_, i) => addDays(day, -i));
      put(el,
        h('div', { class: 'row cw-launch' }, CHECKINS.map((type) => {
          const done = !!store.get(checkinId(type, day));
          return h('a', { class: done ? 'ghost' : 'primary', href: `#/checkin/${type}` }, done ? cw('checkins.done_today', { title: t(`checkin.title.${type}`) }) : t(`checkin.title.${type}`));
        })),
        h('table', { class: 'history cw-history' },
          h('thead', {}, h('tr', {}, h('th', {}, t('checkin.landing.day')), h('th', {}, t('checkin.landing.col_morning')), h('th', {}, t('checkin.landing.col_evening')))),
          h('tbody', {}, days.map((d) => h('tr', {}, h('td', {}, fmtDay(d)),
            ['morning', 'evening'].map((type) => h('td', {}, h('a', { href: `#/checkin/${type}/${d}`, class: store.get(checkinId(type, d)) ? 'yes' : 'no' },
              t(store.get(checkinId(type, d)) ? 'checkin.landing.done' : 'checkin.landing.open')))))))));
    },
  }],
  ['history', {
    group: 'checkins', w: 8, h: 18,
    opts: [
      { k: 'type', type: 'choice', def: 'all', values: ['all', 'morning', 'evening', 'weekly'] },
      { k: 'days', type: 'choice', def: '7', values: ['3', '7', '14', '35'] },
    ],
    draw(el, o) {
      const from = addDays(today(), -Number(o.days));
      const list = store.byKind('checkin')
        .map((c) => { const [, type, d] = c.id.split(':'); return { c, type, d }; })
        .filter((x) => (o.type === 'all' || x.type === o.type) && x.d > from)
        .sort((a, b) => b.d.localeCompare(a.d) || CHECKINS.indexOf(a.type) - CHECKINS.indexOf(b.type));
      if (!list.length) { put(el, h('p', { class: 'empty' }, cw('history.empty'))); return; }
      put(el, list.map(({ c, type, d }) => h('article', { class: 'cw-answers' },
        h('h3', {}, h('a', { href: `#/checkin/${type}/${d}` }, `${t(`checkin.title.${type}`)}, ${fmtDay(d)}`)),
        h('dl', {}, Object.entries(c.data).filter(([k, v]) => k !== 'type' && k !== 'at' && (Array.isArray(v) ? v.length : String(v ?? '').trim()))
          .map(([k, v]) => [h('dt', {}, answerLabel(type, k)), h('dd', { class: 'own' }, Array.isArray(v) ? v.join(', ') : String(v))])))));
    },
  }],
  ['body', {
    group: 'checkins', w: 8, h: 9,
    opts: [{ k: 'days', type: 'choice', def: '7', values: ['3', '7', '14'] }],
    draw(el, o) {
      // What you picked for "What is your body doing", day by day, as you picked it. No totals.
      const days = [...Array(Number(o.days))].map((_, i) => addDays(today(), -i));
      const rows = days.flatMap((d) => ['morning', 'evening'].map((type) => ({ d, type, picked: store.get(checkinId(type, d))?.data.body || [] })))
        .filter((r) => r.picked.length);
      if (!rows.length) { put(el, h('p', { class: 'empty' }, cw('body.empty'))); return; }
      put(el, h('ul', { class: 'cw-body-log' }, rows.map((r) => h('li', {},
        h('span', { class: 'cw-ev-t' }, `${fmtDay(r.d)}, ${t(`checkin.landing.col_${r.type}`)}`),
        h('span', { class: 'chips' }, r.picked.map((p) => h('span', { class: 'chip on' }, p)))))));
    },
  }],

  ['plancard', {
    group: 'plan', w: 8, h: 21, opts: [],
    tools: () => [tool('open', 'arrow-square-out', cw('plancard.open'), openPlanCard)],
    draw(el) { put(el, planCardBody()); },
  }],
  ['nudge', {
    group: 'plan', w: 8, h: 6, opts: [],
    draw(el) { put(el, blocksFor().plan || h('p', { class: 'note' }, cw('nudge.complete'))); },
  }],
  ['launcher', {
    group: 'plan', w: 8, h: 9, opts: [],
    draw(el) {
      const go = (label, fn) => button(label, { onclick: fn });
      put(el, h('div', { class: 'cw-launch' },
        go(cw('launcher.appointment'), () => editAppointment()),
        go(cw('launcher.court'), () => editAppointment(null, { court: true, prep: 45, travel: 45 })),
        go(cw('launcher.task'), () => editTask()),
        go(cw('launcher.routine'), () => editRoutine()),
        go(cw('launcher.bill'), () => editBill()),
        go(cw('launcher.condition'), () => editObligation()),
        go(cw('launcher.report'), () => editReport()),
        go(cw('launcher.plan_card'), openPlanCard),
        CHECKINS.map((type) => h('a', { class: 'ghost', href: `#/checkin/${type}` }, t(`checkin.title.${type}`)))));
    },
  }],
];
