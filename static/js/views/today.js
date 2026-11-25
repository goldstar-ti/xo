import * as store from '../store.js';
import { LINES, PLAN, PLAN_FIRST } from '../content.js';
import { editAppointment, editBill, editTask, payBill, toggleTask } from '../forms.js';
import { addDays, daysBetween, fmtDay, fmtDuration, fmtLong, fmtMoney, fmtTime, h, hm, relDay, toast, today, toDate, put } from '../util.js';

export const live = true;

function lineForToday() {
  const own = store.settings().lines.split('\n').map((s) => s.trim()).filter(Boolean);
  const matters = (store.plan().answers.good_matters || '').trim();
  const pool = [...LINES, ...own, ...own]; // your own lines come up twice as often
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((new Date() - start) / 86400000);
  // Every fourth day, show what you wrote about the life you want.
  if (matters && dayOfYear % 4 === 0) return { label: 'What matters most to me', text: matters };
  return { text: pool[dayOfYear % pool.length] };
}

export function checkinId(type, day = today()) { return `checkin:${type}:${day}`; }

export function dayEntries(day = today()) {
  const s = store.settings();
  const weekday = toDate(day).getDay();
  const out = [];
  for (const r of store.byKind('routine')) {
    if (r.data.active === false) continue;
    out.push({ time: r.data.time, label: r.data.label, kind: 'tick', ref: r.id, done: store.isTicked(r.id, day) });
  }
  for (const o of store.byKind('obligation')) {
    const d = o.data;
    if (d.schedule === 'daily' || (d.schedule === 'weekly' && Number(d.weekday) === weekday))
      out.push({ time: d.time, label: d.title, kind: 'tick', ref: o.id, done: store.isTicked(o.id, day), href: '#/obligations' });
  }
  for (const a of store.byKind('appointment')) {
    if (a.data.date !== day) continue;
    const t = store.apptTimes(a.data);
    const bits = [];
    if (t.ready < t.leave) bits.push(`get ready ${fmtTime(t.ready)}`);
    if (t.leave < t.start) bits.push(`leave ${fmtTime(t.leave)}`);
    out.push({ time: a.data.time, label: a.data.title, kind: 'appt', item: a, times: t, sub: [bits.join(', ').replace(/^./, (c) => c.toUpperCase()), a.data.where].filter(Boolean).join('. ') });
  }
  out.push({ time: s.morningAt, label: 'Morning check-in', kind: 'checkin', type: 'morning', done: !!store.get(checkinId('morning', day)) });
  out.push({ time: s.eveningAt, label: 'Evening check-in', kind: 'checkin', type: 'evening', done: !!store.get(checkinId('evening', day)) });
  if (weekday === Number(s.weeklyDay))
    out.push({ time: s.weeklyAt, label: 'Weekly review', kind: 'checkin', type: 'weekly', done: !!store.get(checkinId('weekly', day)) });
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function nextUp(entries) {
  const now = new Date();
  // An appointment you should be getting ready for, or leaving for, comes first.
  for (const e of entries.filter((x) => x.kind === 'appt')) {
    const t = e.times;
    if (now >= t.start) continue;
    const base = { title: e.label, sub: `${fmtTime(t.start)}${e.item.data.where ? `, ${e.item.data.where}` : ''}` };
    if (now >= t.leave && t.leave < t.start) return { ...base, head: 'Leave now', urgent: true };
    if (now >= t.ready) return { ...base, head: t.leave < t.start ? `Leave in ${fmtDuration((t.leave - now) / 60000)}` : `Starts in ${fmtDuration((t.start - now) / 60000)}`, urgent: (t.leave - now) < 20 * 60000 };
    if (t.ready - now < 3 * 3600000) return { ...base, head: `${t.ready < t.leave ? 'Get ready' : 'Leave'} in ${fmtDuration((t.ready - now) / 60000)}` };
  }
  const nowHm = hm(now);
  const next = entries.find((e) => e.time > nowHm && !e.done);
  if (next) return { head: next.label, title: `at ${fmtTime(next.time)}`, sub: next.sub || '' };
  const later = store.byKind('appointment')
    .filter((a) => a.data.date > today())
    .sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time))[0];
  if (later) return { head: 'Nothing else timed today', title: `Next: ${later.data.title}`, sub: `${relDay(later.data.date)}, ${fmtTime(later.data.time)}` };
  return { head: 'Nothing else timed today', title: '', sub: '' };
}

function planNudge() {
  const p = store.plan();
  if (!p.variant) return { text: 'Your plan is not started yet. Begin with one box.', done: false };
  const boxes = PLAN[p.variant].flatMap((s) => s.boxes);
  const filled = boxes.filter((b) => (p.answers[b.k] || '').trim());
  if (filled.length === boxes.length) return null;
  const order = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes];
  const next = order.find((b) => !(p.answers[b.k] || '').trim());
  return { text: `My plan: ${filled.length} of ${boxes.length} boxes written. Next box: “${next.q}”` };
}

export function render(root) {
  const day = today();
  const entries = dayEntries(day);
  const line = lineForToday();
  const up = nextUp(entries);
  const nowHm = hm(new Date());

  const tick = (e) => h('button', {
    class: `tick${e.done ? ' on' : ''}`, type: 'button', 'aria-pressed': String(e.done),
    'aria-label': `${e.label}: ${e.done ? 'done' : 'not done'}`,
    onclick: () => { if (!e.done) sessionStorage.setItem('pop', e.ref); store.setTick(e.ref, !e.done).catch((err) => toast(err.message, 'bad')); },
  }, e.done ? 'Done' : 'Tick');

  const popped = sessionStorage.getItem('pop');
  sessionStorage.removeItem('pop');
  const rows = [];
  let nowPlaced = false;
  const nowRow = () => h('li', { class: 'now' }, h('span', { class: 't' }, fmtTime(nowHm)), h('span', { class: 'now-rule' }, 'Now'));
  for (const e of entries) {
    if (!nowPlaced && e.time > nowHm) { rows.push(nowRow()); nowPlaced = true; }
    const past = e.time <= nowHm;
    const missed = past && !e.done && e.kind !== 'appt';
    let action = null;
    if (e.kind === 'tick') action = tick(e);
    else if (e.kind === 'checkin') action = h('a', { class: `tick${e.done ? ' on' : ''}`, href: `#/checkin/${e.type}` }, e.done ? 'Done' : 'Start');
    else action = h('button', { class: 'ghost small', type: 'button', onclick: () => editAppointment(e.item) }, 'Edit');
    rows.push(h('li', { class: `entry k-${e.kind}${e.done ? ' done' : ''}${past ? ' past' : ''}${missed ? ' missed' : ''}${e.ref && e.ref === popped ? ' pop' : ''}` },
      h('span', { class: 't' }, fmtTime(e.time)),
      h('span', { class: 'what' }, e.href ? h('a', { href: e.href }, e.label) : e.label, e.sub && h('small', {}, e.sub)),
      action));
  }
  if (!nowPlaced) rows.push(nowRow());

  const picked = store.byKind('task').filter((t) => t.data.today === day);
  const three = picked.length
    ? h('ul', { class: 'list' }, picked.map((t) => h('li', { class: t.data.done ? 'done' : '' },
        h('input', { type: 'checkbox', checked: t.data.done, 'aria-label': `Done: ${t.data.title}`, onchange: () => toggleTask(t).catch((err) => toast(err.message, 'bad')) }),
        h('button', { class: 'row-main', type: 'button', onclick: () => editTask(t) },
          h('span', {}, t.data.title),
          !t.data.done && t.data.step && h('small', {}, `Start with: ${t.data.step}`)),
        t.data.est > 0 && !t.data.done && h('span', { class: 'meta' }, `allow ${fmtDuration(t.data.est * 1.5)}`))))
    : h('p', { class: 'empty' }, 'Nothing chosen yet. ', h('a', { href: '#/tasks' }, 'Choose up to three tasks'), ' so today has an edge.');

  const horizon = addDays(day, 7);
  const coming = [];
  for (const a of store.byKind('appointment'))
    if (a.data.date > day && a.data.date <= addDays(day, a.data.court ? 14 : 7))
      coming.push({ day: a.data.date, text: `${a.data.title}, ${fmtTime(a.data.time)}`, tag: a.data.court ? 'Court' : 'Appointment', open: () => editAppointment(a) });
  for (const t of store.byKind('task'))
    if (!t.data.done && t.data.due && t.data.due <= horizon)
      coming.push({ day: t.data.due, text: t.data.title, tag: 'Task due', open: () => editTask(t) });
  for (const b of store.byKind('bill'))
    if (!b.data.finished && b.data.due <= horizon)
      coming.push({ day: b.data.due, text: `${b.data.name}${b.data.amount ? `, ${fmtMoney(b.data.amount)}` : ''}`, tag: b.data.autopay ? 'Bill, automatic' : 'Bill', open: () => editBill(b), pay: b.data.autopay ? null : () => payBill(b) });
  coming.sort((a, b) => a.day.localeCompare(b.day));

  const nudge = planNudge();

  const prefs = window.XOLook.prefs;
  const hour = new Date().getHours();
  const greeting = prefs.callMe && `${hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'}, ${prefs.callMe}.`;
  // Blocks can be hidden and reordered in Appearance.
  const blocks = {
    line: window.XOLook.active().look.line !== 'hidden' && h('p', { class: 'line' }, line.label && h('span', { class: 'line-label' }, `${line.label}: `), line.text),
    next: h('section', { class: `next${up.urgent ? ' urgent' : ''}`, 'aria-label': 'Next up' },
      h('p', { class: 'next-head' }, up.head),
      up.title && h('p', { class: 'next-title' }, up.title),
      up.sub && h('p', { class: 'next-sub' }, up.sub)),
    three: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'Today\u2019s three'), h('a', { href: '#/tasks' }, 'All tasks')), three),
    day: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'The day'), h('a', { href: '#/routine' }, 'Edit routine')),
      h('ol', { class: 'dayline' }, rows)),
    coming: h('section', {}, h('div', { class: 'sec-head' }, h('h2', {}, 'Coming up')),
      coming.length
        ? h('ul', { class: 'list' }, coming.map((c) => {
            const late = daysBetween(day, c.day) < 0;
            return h('li', { class: late ? 'late' : '' },
              h('button', { class: 'row-main', type: 'button', onclick: c.open },
                h('span', {}, c.text), h('small', {}, `${c.tag}, ${late ? `overdue since ${fmtDay(c.day)}` : relDay(c.day)}`)),
              c.pay && h('button', { class: 'ghost small', type: 'button', onclick: () => c.pay().catch((err) => toast(err.message, 'bad')) }, 'Paid'));
          }))
        : h('p', { class: 'empty' }, 'Nothing due in the next week.')),
    plan: nudge && h('section', {}, h('p', { class: 'nudge' }, nudge.text, ' ', h('a', { href: '#/plan' }, 'Open my plan'))),
  };
  put(root,
    greeting && h('p', { class: 'greet' }, greeting),
    h('header', { class: 'page-head' }, h('h1', {}, fmtLong(day))),
    prefs.blocks.filter((k) => !prefs.hidden.includes(k)).map((k) => blocks[k]),
  );
}
