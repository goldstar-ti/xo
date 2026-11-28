// More content widgets from the Bridge catalogue (docs/design/xo-design-handoff.md section 6): Now, Routine this week,
// Last 28 days, Four weeks, Timer, Reports to the officer, Next court date, Who to call, Next 30 days, By bill,
// Add a bill, In my own words, Yesterday evening, Weekly check-in, Write the next box, Boxes still to write and
// Scratch pad. Workbook, Life story and Outputs are parked: XO has no data for them yet.
//
// Entries follow static/js/bridgewidgets.js: `draw(body, opts, ctx)` fills the emptied body and static/js/widgets.js keeps it
// live. Timer and Scratch pad bring their own `render(body, ctx, { liveWidget })` because they keep state between draws. Wording is under
// `canvas` in content/text/canvas.yaml: names `canvas.widgets.<id>`, descriptions `canvas.about.<id>`, options
// `canvas.opts.<id>.<k>`, widget text `canvas.cw.<id>.*`. Colours come from tokens in static/canvas.css (`.cw-*`).
import * as store from './store.js';
import { PLAN, PLAN_FIRST } from './content.js';
import { editAppointment, editBill, editRoutine, editTask } from './forms.js';
import { renderMarkdown } from './markdown.js';
import { t, text } from './text.js';
import { button, linkRow, playRing, textarea } from './ui.js';
import { addDays, fmtDay, fmtLong, fmtMoney, fmtTime, h, put, relDay, toDate, today, withPhoneLinks } from './util.js';
import { answerLabel, dayItems } from './bridgewidgets.js';
import { obligationParts } from './views/lists.js';
import { checkinId } from './views/today.js';

const cw = (key, vars) => t(`canvas.cw.${key}`, vars);
const pad = (n) => String(n).padStart(2, '0');
const mondayOf = (day) => addDays(day, -((toDate(day).getDay() + 6) % 7));
const weekdayName = (day) => (text('canvas.cw.month.weekdays') || [])[toDate(day).getDay()] || '';
const SCRATCH_ID = 'note:scratch';
const SCRATCH_MS = 600;

// The plan's boxes for the chosen version, with the section each sits in, or null before a version is chosen.
function planBoxes() {
  const p = store.plan();
  if (!p.variant || !PLAN[p.variant]) return null;
  const boxes = PLAN[p.variant].flatMap((s) => s.boxes.map((b) => ({ ...b, section: s })));
  return { answers: p.answers || {}, boxes, filled: (b) => !!String(p.answers?.[b.k] || '').trim() };
}
const planLink = (label) => h('a', { href: '#/plan' }, label);

// One saved check-in day as a read-only list of answers.
function answersList(type, data) {
  const rows = Object.entries(data).filter(([k, v]) => k !== 'type' && k !== 'at' && (Array.isArray(v) ? v.length : String(v ?? '').trim()));
  return h('dl', { class: 'cw-answers-dl' }, rows.map(([k, v]) => [h('dt', {}, answerLabel(type, k)), h('dd', { class: 'own' }, Array.isArray(v) ? v.join(', ') : String(v))]));
}

// The mm:ss reading of a number of seconds.
const clockOf = (secs) => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;

export const MORE_WIDGETS = [
  ['now', {
    group: 'time', w: 8, h: 9, tick: 'second',
    opts: [{ k: 'seconds', type: 'bool', def: false }],
    draw(el, o) {
      const now = new Date();
      const day = today();
      const days = [...Array(7)].map((_, i) => addDays(day, i));
      put(el, h('div', { class: 'cw-now' },
        h('p', { class: 'cw-time' }, fmtTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`), o.seconds && h('span', { class: 'cw-sec' }, pad(now.getSeconds()))),
        h('p', { class: 'cw-date' }, fmtLong(day)),
        h('ol', { class: 'cw-strip7' }, days.map((d) => {
          const n = dayItems(d).length;
          return h('li', { class: d === day ? 'is-today' : '', 'aria-label': `${fmtDay(d)}, ${cw('now.entries', { n })}` },
            h('span', { class: 'cw-s7-wd', 'aria-hidden': 'true' }, weekdayName(d)),
            h('span', { class: 'cw-s7-n', 'aria-hidden': 'true' }, String(toDate(d).getDate())),
            h('span', { class: 'cw-s7-dots', 'aria-hidden': 'true' }, [...Array(Math.min(n, 4))].map(() => h('i', {}))));
        }))));
    },
  }],

  ['routine-week', {
    group: 'lists', w: 8, h: 12, tick: 'minute', opts: [],
    tools: () => [{ key: 'add', ico: 'plus', label: t('canvas.cw.routine.add'), run: () => editRoutine() }],
    draw(el) {
      const day = today();
      const days = [...Array(7)].map((_, i) => addDays(mondayOf(day), i));
      const list = store.byKind('routine').filter((r) => r.data.active !== false).sort((a, b) => a.data.time.localeCompare(b.data.time));
      if (!list.length) { put(el, h('p', { class: 'empty' }, t('lists.routine.empty'))); return; }
      put(el, h('ul', { class: 'cw-rw' },
        h('li', { class: 'cw-rw-head', 'aria-hidden': 'true' }, h('span', {}), h('span', { class: 'cw-rw-days' }, days.map((d) => h('span', {}, weekdayName(d).slice(0, 1))))),
        list.map((r) => {
          const n = days.filter((d) => store.isTicked(r.id, d)).length;
          return h('li', {},
            button([h('span', { class: 'cw-ev-t' }, fmtTime(r.data.time)), h('span', {}, r.data.label)], { variant: 'row', class: 'row-main', onclick: () => editRoutine(r) }),
            h('span', { class: 'cw-rw-days', role: 'img', 'aria-label': cw('routine-week.ticked', { n }) },
              days.map((d) => h('i', { class: `${store.isTicked(r.id, d) ? 'on' : ''}${d > day ? ' later' : ''}` }))));
        })));
    },
  }],

  ['last-28', {
    group: 'checkins', w: 8, h: 8, tick: 'minute', opts: [],
    draw(el) {
      const day = today();
      const days = [...Array(28)].map((_, i) => addDays(day, i - 27));
      put(el, h('div', { class: 'cw-l28' }, ['morning', 'evening'].map((type) => {
        const done = days.filter((d) => store.get(checkinId(type, d))).length;
        return h('div', { class: 'cw-l28-row' },
          h('p', { class: 'cw-l28-name' }, t(`checkin.title.${type}`), h('small', {}, cw('last-28.count', { n: done }))),
          h('span', { class: 'cw-strip28', role: 'img', 'aria-label': cw('last-28.row', { title: t(`checkin.title.${type}`), n: done }) },
            days.map((d) => h('i', { class: store.get(checkinId(type, d)) ? 'done' : d === day ? 'open' : 'miss', title: fmtDay(d) }))));
      }), h('p', { class: 'cw-quiet' }, cw('last-28.key'))));
    },
  }],

  ['four-weeks', {
    group: 'checkins', w: 8, h: 11, tick: 'minute', opts: [],
    draw(el) {
      const day = today();
      const first = addDays(mondayOf(day), -21);
      const weeks = [0, 1, 2, 3].map((w) => [...Array(7)].map((_, i) => addDays(first, w * 7 + i)));
      put(el, h('ol', { class: 'cw-4w' },
        h('li', { class: 'cw-4w-head', 'aria-hidden': 'true' }, h('span', {}), weeks[0].map((d) => h('span', {}, weekdayName(d).slice(0, 1)))),
        weeks.map((days) => {
          const done = days.reduce((s, d) => s + (store.get(checkinId('morning', d)) ? 1 : 0) + (store.get(checkinId('evening', d)) ? 1 : 0), 0);
          return h('li', { 'aria-label': cw('four-weeks.week', { day: fmtDay(days[0]), n: done }) },
            h('span', { class: 'cw-4w-name', 'aria-hidden': 'true' }, fmtDay(days[0])),
            days.map((d) => h('span', { class: `cw-4w-day${d > day ? ' later' : ''}`, 'aria-hidden': 'true' },
              ['morning', 'evening'].map((type) => h('i', { class: store.get(checkinId(type, d)) ? 'done' : d < day ? 'miss' : 'open' })))));
        }),
        h('li', { class: 'cw-quiet cw-4w-key' }, cw('four-weeks.key'))));
    },
  }],

  ['timer', {
    group: 'time', w: 8, h: 7,
    opts: [{ k: 'minutes', type: 'choice', def: '10', values: ['5', '10', '15', '25', '45', '60'] }],
    // The timer keeps its time in ctx.state, so a redraw of the canvas does not lose it. It ticks each second only while
    // it runs and never sends a notification.
    render(body, ctx) {
      body.classList.add('cw-body');
      const st = ctx.state;
      const total = Number(ctx.opts.minutes) * 60;
      if (st.total !== total) Object.assign(st, { total, left: total, endAt: 0, over: false });
      let timer = 0;
      const left = () => (st.endAt ? Math.max(0, Math.ceil((st.endAt - Date.now()) / 1000)) : st.left);
      const reading = h('p', { class: 'cw-timer-time', role: 'timer' });
      const note = h('p', { class: 'cw-quiet', role: 'status' });
      const toggle = button('', { variant: 'primary', onclick: () => (st.endAt ? pause() : start()) });
      const reset = button(cw('timer.reset'), { onclick: () => { stop(); Object.assign(st, { left: st.total, endAt: 0, over: false }); paint(); } });
      function stop() { clearInterval(timer); timer = 0; }
      function pause() { st.left = left(); st.endAt = 0; stop(); paint(); }
      function start() {
        if (st.over || st.left <= 0) Object.assign(st, { left: st.total, over: false });
        st.endAt = Date.now() + st.left * 1000;
        stop();
        timer = setInterval(paint, 1000);
        paint();
      }
      function paint() {
        const s = left();
        if (st.endAt && s <= 0) { stop(); Object.assign(st, { endAt: 0, left: 0, over: true }); }
        reading.textContent = clockOf(st.endAt ? s : st.left);
        toggle.textContent = st.endAt ? cw('timer.pause') : st.left > 0 && st.left < st.total ? cw('timer.resume') : cw('timer.start');
        note.textContent = st.over ? cw('timer.over') : st.endAt ? cw('timer.running') : st.left < st.total ? cw('timer.paused') : '';
      }
      put(body, h('div', { class: 'cw-timer' }, reading, h('div', { class: 'cw-launch' }, toggle, reset), note));
      paint();
      if (st.endAt) timer = setInterval(paint, 1000);
      return stop;
    },
  }],

  ['reports', {
    group: 'lists', w: 8, h: 12, opts: [],
    draw(el) {
      const part = obligationParts().reports;
      part.querySelector('h2')?.remove();
      put(el, part);
    },
  }],

  ['next-court', {
    group: 'lists', w: 8, h: 13, tick: 'minute', opts: [],
    draw(el) {
      const day = today();
      const next = store.byKind('appointment').filter((a) => a.data.court && a.data.date >= day)
        .sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time))[0];
      const addCourt = () => editAppointment(null, { court: true, prep: 45, travel: 45 });
      if (!next) { put(el, h('p', { class: 'empty' }, cw('next-court.empty')), button(cw('next-court.add'), { onclick: addCourt })); return; }
      const d = next.data;
      const tm = store.apptTimes(d);
      const bits = [];
      if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
      if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
      const tasks = store.byKind('task').filter((k) => (k.data.project || '').toLowerCase() === 'court' && !k.data.done && !k.data.archived);
      put(el,
        h('p', { class: 'cw-court-when' }, h('strong', {}, relDay(d.date)), h('span', {}, `${fmtLong(d.date)}, ${fmtTime(d.time)}`)),
        button([h('span', {}, d.title), d.where && h('small', {}, d.where), bits.length > 0 && h('small', {}, bits.join(', '))],
          { variant: 'row', class: 'row-main cw-court-row', onclick: () => editAppointment(next) }),
        h('h3', { class: 'cw-sub' }, cw('next-court.todo')),
        tasks.length
          ? h('ul', { class: 'cw-todo' }, tasks.map((k) => h('li', {}, button(h('span', {}, k.data.title), { variant: 'row', class: 'row-main', onclick: () => editTask(k) }))))
          : h('p', { class: 'empty' }, cw('next-court.todo_empty')));
    },
  }],

  ['who-to-call', {
    group: 'plan', w: 8, h: 9, opts: [],
    draw(el) {
      const lines = String(store.plan().answers?.team || '').split('\n').map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim()).filter(Boolean);
      if (!lines.length) { put(el, h('p', { class: 'empty' }, cw('who-to-call.empty'), ' ', planLink(cw('who-to-call.open')))); return; }
      put(el, h('ul', { class: 'cw-calls' }, lines.map((l) => h('li', { class: 'own' }, withPhoneLinks(l)))));
    },
  }],

  ['next-30', {
    group: 'money', w: 8, h: 14, tick: 'minute', opts: [],
    draw(el) {
      const day = today();
      const list = store.byKind('bill').filter((b) => !b.data.finished && b.data.due >= day && b.data.due <= addDays(day, 30))
        .sort((a, b) => a.data.due.localeCompare(b.data.due));
      if (!list.length) { put(el, h('p', { class: 'empty' }, cw('next-30.empty'))); return; }
      const top = Math.max(...list.map((b) => Number(b.data.amount) || 0), 1);
      const sum = list.reduce((s, b) => s + (Number(b.data.amount) || 0), 0);
      put(el,
        h('p', { class: 'figure' }, h('strong', {}, fmtMoney(sum)), ' ', cw('next-30.total', { n: list.length })),
        h('ul', { class: 'cw-bars' }, list.map((b) => {
          const pct = Math.max(2, Math.round(((Number(b.data.amount) || 0) / top) * 100));
          return h('li', {},
            button([h('span', { class: 'cw-bar-head' }, h('span', {}, b.data.name), h('small', {}, `${fmtDay(b.data.due)}, ${relDay(b.data.due)}`)),
              h('span', { class: 'cw-bar-row' },
                h('span', { class: 'cw-bar', 'aria-hidden': 'true' }, h('span', { class: 'cw-bar-fill', style: `width: ${pct}%` })),
                h('span', { class: 'cw-bar-amt' }, b.data.amount > 0 ? fmtMoney(b.data.amount) : ''))],
            { variant: 'row', class: 'row-main', onclick: () => editBill(b) }));
        })));
    },
  }],

  ['by-bill', {
    group: 'money', w: 8, h: 14, opts: [],
    tools: () => [{ key: 'add', ico: 'plus', label: t('canvas.cw.bills.add'), run: () => editBill() }],
    draw(el) {
      const list = store.byKind('bill').filter((b) => !b.data.finished).sort((a, b) => a.data.name.localeCompare(b.data.name));
      if (!list.length) { put(el, h('p', { class: 'empty' }, t('lists.bills.empty'))); return; }
      put(el, h('table', { class: 'cw-bybill' },
        h('colgroup', {}, h('col', { class: 'n' }), h('col', { class: 'd' }), h('col', { class: 'a' })),
        h('thead', {}, h('tr', {}, h('th', {}, cw('by-bill.bill')), h('th', {}, cw('by-bill.due')), h('th', { class: 'amt' }, cw('by-bill.amount')))),
        h('tbody', {}, list.map((b) => h('tr', { class: b.data.due < today() ? 'late' : '' },
          h('td', {}, button(b.data.name, { variant: 'row', class: 'row-main', onclick: () => editBill(b) })),
          h('td', {}, fmtDay(b.data.due)),
          h('td', { class: 'amt' }, b.data.amount > 0 ? fmtMoney(b.data.amount) : ''))))));
    },
  }],

  ['add-bill', {
    group: 'money', w: 8, h: 6, opts: [],
    draw(el) { put(el, h('div', { class: 'cw-launch' }, button(cw('add-bill.button'), { variant: 'primary', onclick: () => editBill() }))); },
  }],

  ['in-my-own-words', {
    group: 'plan', w: 8, h: 12, opts: [],
    draw(el) {
      const plan = planBoxes();
      if (!plan) { put(el, h('p', { class: 'empty' }, cw('own.not_started'), ' ', planLink(cw('own.open')))); return; }
      const pick = plan.boxes.find((b) => b.k === 'good_matters' && plan.filled(b)) || plan.boxes.find((b) => plan.filled(b));
      if (!pick) { put(el, h('p', { class: 'empty' }, cw('own.empty'), ' ', planLink(cw('own.open')))); return; }
      put(el, h('p', { class: 'cw-quiet' }, pick.q), h('div', { class: 'own' }, renderMarkdown(plan.answers[pick.k])));
    },
  }],

  ['yesterday-evening', {
    group: 'checkins', w: 8, h: 11, tick: 'minute', opts: [],
    draw(el) {
      const day = addDays(today(), -1);
      const c = store.get(checkinId('evening', day));
      if (!c) { put(el, h('p', { class: 'empty' }, cw('yesterday-evening.empty'), ' ', h('a', { href: `#/checkin/evening/${day}` }, cw('yesterday-evening.open')))); return; }
      put(el, h('p', { class: 'cw-quiet' }, fmtLong(day)), answersList('evening', c.data));
    },
  }],

  ['weekly-checkin', {
    group: 'checkins', w: 8, h: 7, tick: 'minute', opts: [],
    draw(el) {
      const last = store.byKind('checkin').map((c) => c.id.split(':')).filter((p) => p[1] === 'weekly').map((p) => p[2]).sort().pop();
      put(el, h('div', { class: 'cw-start' },
        playRing({ label: t('today.tick.start_weekly'), onclick: () => { location.hash = '#/checkin/weekly'; } }),
        h('p', {}, h('strong', {}, t('checkin.title.weekly')), h('small', {}, last ? cw('weekly-checkin.last', { day: fmtLong(last) }) : cw('weekly-checkin.never')))));
    },
  }],

  ['write-next-box', {
    group: 'plan', w: 8, h: 8, opts: [],
    draw(el) {
      const plan = planBoxes();
      if (!plan) { put(el, h('p', { class: 'empty' }, cw('own.not_started'), ' ', planLink(cw('own.open')))); return; }
      const order = [...PLAN_FIRST.map((k) => plan.boxes.find((b) => b.k === k)).filter(Boolean), ...plan.boxes];
      const next = order.find((b) => !plan.filled(b));
      if (!next) { put(el, h('p', { class: 'note' }, cw('boxes.complete'))); return; }
      put(el, h('div', { class: 'cw-start' },
        playRing({ label: cw('write-next-box.open'), onclick: () => { location.hash = '#/plan'; } }),
        h('p', {}, h('small', {}, cw('write-next-box.next')), h('strong', {}, next.q))));
    },
  }],

  ['boxes-to-write', {
    group: 'plan', w: 8, h: 14,
    opts: [{ k: 'count', type: 'choice', def: '5', values: ['5', '10', '0'] }],
    draw(el, o) {
      const plan = planBoxes();
      if (!plan) { put(el, h('p', { class: 'empty' }, cw('own.not_started'), ' ', planLink(cw('own.open')))); return; }
      const empty = plan.boxes.filter((b) => !plan.filled(b));
      if (!empty.length) { put(el, h('p', { class: 'note' }, cw('boxes.complete'))); return; }
      const shown = Number(o.count) ? empty.slice(0, Number(o.count)) : empty;
      put(el,
        h('p', { class: 'figure' }, h('strong', {}, String(empty.length)), ' ', cw(empty.length === 1 ? 'boxes-to-write.one' : 'boxes-to-write.many', { total: plan.boxes.length })),
        h('ul', { class: 'list' }, shown.map((b) => h('li', {}, linkRow({ title: b.q, sub: t('plan.section_heading', { n: b.section.n, title: b.section.title }), href: '#/plan' })))),
        shown.length < empty.length && h('p', { class: 'cw-quiet' }, cw('boxes-to-write.more', { n: empty.length - shown.length })));
    },
  }],

  ['scratch', {
    group: 'lists', w: 8, h: 12, opts: [],
    // A text area on a note of its own (`note:scratch`, kind note), saved as you type. liveWidget never redraws while you
    // are typing in it; ctx.state.draft holds text that is typed but not yet saved, so a redraw cannot show older text.
    render(body, ctx, { liveWidget }) {
      body.classList.add('cw-body');
      const st = ctx.state;
      let timer = 0;
      async function save() {
        clearTimeout(timer);
        timer = 0;
        const sent = st.draft;
        if (sent === undefined) return;
        const was = store.get(SCRATCH_ID)?.data;
        const now = new Date().toISOString();
        try {
          await store.save('note', SCRATCH_ID, { title: cw('scratch.title'), pinned: false, custom: {}, created: now, ...was, body: sent, updated: now }, { silent: true });
          if (st.draft === sent) delete st.draft;
        } catch (err) { console.error('scratch pad not saved', err.message); }
      }
      const draw = () => {
        const area = textarea({ rows: 8, class: 'cw-scratch', 'aria-label': cw('scratch.label'), placeholder: cw('scratch.placeholder') });
        area.value = st.draft ?? store.get(SCRATCH_ID)?.data?.body ?? '';
        area.addEventListener('input', () => { st.draft = area.value; clearTimeout(timer); timer = setTimeout(save, SCRATCH_MS); });
        area.addEventListener('blur', save);
        body.replaceChildren(area, h('p', { class: 'cw-quiet' }, cw('scratch.saved')));
      };
      const stop = liveWidget(draw, { root: body });
      return () => { stop(); save(); };
    },
  }],
];
