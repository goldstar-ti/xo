import * as store from '../store.js';
import { LINES, PLAN, PLAN_FIRST } from '../content.js';
import { editAppointment, editBill, editTask, payBill } from '../forms.js';
import { allTasks, currentPace, toggleTask } from '../taskdata.js';
import { t } from '../text.js';
import { icon } from '../icons.js';
import { button, callout, checkbox, tag } from '../ui.js';
import { enablePush } from './settings.js';
import { addDays, daysBetween, fmtDay, fmtDuration, fmtLong, fmtMoney, fmtTime, h, hm, relDay, toast, today, toDate, put } from '../util.js';

export const live = true;

// An item's reference (XO-12) from its project's key, without loading the tracker modules.
const trackerRef = (it) => `${store.get(it.data.project)?.data?.key || '?'}-${it.data.num}`;

function lineForToday() {
  const own = store.settings().lines.split('\n').map((s) => s.trim()).filter(Boolean);
  const matters = (store.plan().answers.good_matters || '').trim();
  const pool = [...LINES, ...own, ...own]; // your own lines come up twice as often
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((new Date() - start) / 86400000);
  // Every fourth day, show what you wrote about the life you want.
  if (matters && dayOfYear % 4 === 0) return { label: t('today.matters_label'), text: matters };
  return { text: pool[dayOfYear % pool.length] };
}

// True when yesterday had routine ticks left open and the account has been ticking before then.
function missedYesterday() {
  const yesterday = addDays(today(), -1);
  if (!store.byKind('tick').some((i) => i.day <= yesterday)) return false;
  return dayEntries(yesterday).some((e) => e.kind === 'tick' && !e.done);
}

const offline = () => document.documentElement.dataset.offline === '1';
const canAskNotify = () => 'Notification' in window && Notification.permission === 'default';

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
    const tm = store.apptTimes(a.data);
    const bits = [];
    if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
    if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
    out.push({ time: a.data.time, label: a.data.title, kind: 'appt', item: a, times: tm, sub: [bits.join(', ').replace(/^./, (c) => c.toUpperCase()), a.data.where].filter(Boolean).join('. ') });
  }
  const pace = currentPace();
  for (const task of allTasks()) {
    const d = task.data;
    if (d.today !== day || !d.at || d.archived) continue;
    out.push({ time: d.at, label: d.title, kind: 'task', item: task, done: d.done, sub: d.est > 0 ? t('lists.shared.allow', { duration: fmtDuration(d.est * pace) }) : '' });
  }
  out.push({ time: s.morningAt, label: t('today.entries.morning_checkin'), kind: 'checkin', type: 'morning', done: !!store.get(checkinId('morning', day)) });
  out.push({ time: s.eveningAt, label: t('today.entries.evening_checkin'), kind: 'checkin', type: 'evening', done: !!store.get(checkinId('evening', day)) });
  if (weekday === Number(s.weeklyDay))
    out.push({ time: s.weeklyAt, label: t('today.entries.weekly_review'), kind: 'checkin', type: 'weekly', done: !!store.get(checkinId('weekly', day)) });
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function nextUp(entries) {
  const now = new Date();
  // An appointment you should be getting ready for, or leaving for, comes first.
  for (const e of entries.filter((x) => x.kind === 'appt')) {
    const tm = e.times;
    if (now >= tm.start) continue;
    const base = { title: e.label, pin: !!e.item.data.where, sub: `${fmtTime(tm.start)}${e.item.data.where ? `, ${e.item.data.where}` : ''}` };
    const dur = (to) => ({ duration: fmtDuration((to - now) / 60000) });
    if (now >= tm.leave && tm.leave < tm.start) return { ...base, head: t('today.next.leave_now'), urgent: true };
    if (now >= tm.ready) return { ...base, head: tm.leave < tm.start ? t('today.next.leave_in', dur(tm.leave)) : t('today.next.starts_in', dur(tm.start)), urgent: (tm.leave - now) < 20 * 60000 };
    if (tm.ready - now < 3 * 3600000) return { ...base, head: t(tm.ready < tm.leave ? 'today.next.get_ready_in' : 'today.next.leave_in', dur(tm.ready)) };
  }
  const nowHm = hm(now);
  const next = entries.find((e) => e.time > nowHm && !e.done);
  if (next) return { head: next.label, title: t('today.next.at', { time: fmtTime(next.time) }), sub: next.sub || '' };
  const later = store.byKind('appointment')
    .filter((a) => a.data.date > today())
    .sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time))[0];
  if (later) return { head: t('today.next.nothing_timed'), title: t('today.next.next_appt', { title: later.data.title }), sub: `${relDay(later.data.date)}, ${fmtTime(later.data.time)}` };
  return { head: t('today.next.nothing_timed'), title: '', sub: '' };
}

function planNudge() {
  const p = store.plan();
  if (!p.variant) return { text: t('today.nudge.not_started'), done: false };
  const boxes = PLAN[p.variant].flatMap((s) => s.boxes);
  const filled = boxes.filter((b) => (p.answers[b.k] || '').trim());
  if (filled.length === boxes.length) return null;
  const order = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes];
  const next = order.find((b) => !(p.answers[b.k] || '').trim());
  return { text: t('today.nudge.progress', { filled: filled.length, total: boxes.length, question: next.q }) };
}

export function render(root) {
  const day = today();
  const entries = dayEntries(day);
  const line = lineForToday();
  const missed = missedYesterday();
  const up = nextUp(entries);
  const nowHm = hm(new Date());

  const off = offline();
  const lock = off ? { disabled: true } : {};
  const doneBtn = (e, onclick) => button(tag(t('today.done'), 'accent'), {
    variant: 'row', class: 'tick on', 'aria-pressed': 'true', ...lock,
    'aria-label': t('today.tick.state_done', { label: e.label }), onclick,
  });
  const openBtn = (e, label, onclick) => button(label, {
    variant: 'ghost', class: 'tick', 'aria-pressed': 'false', ...lock,
    'aria-label': t('today.tick.state_open', { label: e.label }), onclick,
  });
  const tick = (e) => (e.done
    ? doneBtn(e, () => store.setTick(e.ref, false).catch((err) => toast(err.message, 'bad')))
    : openBtn(e, t('today.tick.tick'), () => { sessionStorage.setItem('pop', e.ref); store.setTick(e.ref, true).catch((err) => toast(err.message, 'bad')); }));

  const popped = sessionStorage.getItem('pop');
  sessionStorage.removeItem('pop');
  const rows = [];
  let nowPlaced = false;
  const nowRow = () => h('li', { class: 'now' }, h('span', { class: 't' }, fmtTime(nowHm)), h('span', { class: 'now-rule' }, t('today.day.now')));
  for (const e of entries) {
    if (!nowPlaced && e.time > nowHm) { rows.push(nowRow()); nowPlaced = true; }
    const past = e.time <= nowHm;
    const missed = past && !e.done && e.kind !== 'appt';
    let action = null;
    if (e.kind === 'tick') action = tick(e);
    else if (e.kind === 'task') action = e.done
      ? doneBtn(e, () => toggleTask(e.item).catch((err) => toast(err.message, 'bad')))
      : openBtn(e, t('today.tick.tick'), () => toggleTask(e.item).catch((err) => toast(err.message, 'bad')));
    else if (e.kind === 'checkin') action = e.done
      ? h('a', { class: 'tick on', href: `#/checkin/${e.type}` }, tag(t('today.done'), 'accent'))
      : off ? button(t('today.tick.start'), { class: 'tick', disabled: true }) : h('a', { class: 'tick', href: `#/checkin/${e.type}` }, t('today.tick.start'));
    else action = button(t('today.tick.edit'), { class: 'small', onclick: () => editAppointment(e.item) });
    rows.push(h('li', { class: `entry k-${e.kind}${e.done ? ' done' : ''}${past ? ' past' : ''}${missed ? ' missed' : ''}${e.ref && e.ref === popped ? ' pop' : ''}` },
      h('span', { class: 't' }, fmtTime(e.time)),
      h('span', { class: 'what' }, e.href ? h('a', { href: e.href }, e.label) : e.label, e.sub && h('small', {}, e.sub)),
      action));
  }
  if (!nowPlaced) rows.push(nowRow());

  const pace = currentPace();
  const picked = allTasks().filter((i) => i.data.today === day);
  const needs = picked.filter((i) => !i.data.done && i.data.est > 0).reduce((sum, i) => sum + i.data.est * pace, 0);
  const evening = store.settings().eveningAt || '';
  const left = evening ? (Number(evening.slice(0, 2)) * 60 + Number(evening.slice(3, 5))) - (new Date().getHours() * 60 + new Date().getMinutes()) : 0;
  const three = picked.length
    ? h('div', {},
        h('ul', { class: 'list three' }, picked.map((task) => h('li', { class: task.data.done ? 'done' : '' },
          checkbox({ checked: task.data.done, 'aria-label': t('lists.shared.done_aria', { title: task.data.title }), onchange: () => toggleTask(task).catch((err) => toast(err.message, 'bad')) }),
          button(h('span', {}, task.data.title), { variant: 'row', class: 'row-main', onclick: () => editTask(task) }),
          (task.data.done || task.data.est > 0) && h('span', { class: 'meta' }, task.data.done ? t('today.three.done') : t('lists.shared.allow', { duration: fmtDuration(task.data.est * pace) }))))),
        needs > 0 && h('p', { class: 'note' }, t('today.three.needs', { duration: fmtDuration(needs) })),
        needs > 0 && left > 0 && needs > left && h('p', { class: 'note late' }, t('today.three.over', { duration: fmtDuration(left) })))
    : h('p', { class: 'empty' }, t('today.three.empty_lead'), ' ', button(t('today.three.choose'), { class: 'small', onclick: () => { location.hash = '#/tasks'; } }), ' ', t('today.three.empty_tail'));

  const horizon = addDays(day, 7);
  const coming = [];
  for (const a of store.byKind('appointment'))
    if (a.data.date > day && a.data.date <= addDays(day, a.data.court ? 14 : 7))
      coming.push({ day: a.data.date, text: `${a.data.title}, ${fmtTime(a.data.time)}`, tag: t(a.data.court ? 'today.coming.court' : 'today.coming.appointment'), open: () => editAppointment(a) });
  for (const task of store.byKind('task'))
    if (!task.data.done && task.data.due && task.data.due <= horizon)
      coming.push({ day: task.data.due, text: task.data.title, tag: t('today.coming.task_due'), open: () => editTask(task) });
  for (const b of store.byKind('bill'))
    if (!b.data.finished && b.data.due <= horizon)
      coming.push({ day: b.data.due, text: `${b.data.name}${b.data.amount ? `, ${fmtMoney(b.data.amount)}` : ''}`, tag: t(b.data.autopay ? 'today.coming.bill_auto' : 'today.coming.bill'), open: () => editBill(b), pay: b.data.autopay ? null : () => payBill(b) });
  for (const it of store.byKind('pm_item'))
    if (it.data.due && !it.data.closed_at && it.data.due <= horizon)
      coming.push({ day: it.data.due, text: it.data.title, tag: t('today.coming.tracker', { ref: trackerRef(it) }), open: () => { location.hash = `#/tracker/${trackerRef(it)}`; } });
  coming.sort((a, b) => a.day.localeCompare(b.day));

  const nudge = planNudge();

  const prefs = window.XOLook.prefs;
  const hour = new Date().getHours();
  const greeting = prefs.callMe && t(`today.greeting.${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`, { name: prefs.callMe });
  // Blocks can be hidden and reordered in Appearance.
  const blocks = {
    line: window.XOLook.active().look.line !== 'hidden' && h('p', { class: 'line' }, !missed && line.label && h('span', { class: 'line-label' }, `${line.label}: `), missed ? t('today.missed_line') : line.text),
    next: h('section', { class: `next${up.urgent ? ' urgent' : ''}`, 'aria-label': t('today.next_up') },
      h('p', { class: 'next-head' }, up.head),
      up.title && h('p', { class: 'next-title' }, up.title),
      up.sub && h('p', { class: 'next-sub' }, up.pin && [icon('tabler/map-pin'), ' '], up.sub)),
    three: h('section', { class: 'col-side' }, h('div', { class: 'sec-head' }, h('h2', {}, t('today.three.heading')), h('a', { href: '#/tasks' }, t('today.three.all_tasks'))), three),
    day: h('section', { class: 'col-day' }, h('div', { class: 'sec-head' }, h('h2', {}, t('today.day.heading')), h('a', { href: '#/routine' }, t('today.day.edit_routine'))),
      h('ol', { class: 'dayline' }, rows)),
    coming: h('section', { class: 'col-side' }, h('div', { class: 'sec-head' }, h('h2', {}, t('today.coming.heading'))),
      coming.length
        ? h('ul', { class: 'list' }, coming.map((c) => {
            const late = daysBetween(day, c.day) < 0;
            return h('li', { class: late ? 'late' : '' },
              button([h('span', {}, c.text), h('small', {}, `${c.tag}, ${late ? t('lists.shared.overdue_since', { day: fmtDay(c.day) }) : relDay(c.day)}`)],
                { variant: 'row', class: 'row-main', onclick: c.open }),
              c.pay && button(t('lists.shared.paid'), { class: 'small', onclick: () => c.pay().catch((err) => toast(err.message, 'bad')) }));
          }))
        : h('p', { class: 'empty' }, t('today.coming.empty'))),
    plan: nudge && h('section', { class: 'col-side' }, h('p', { class: 'nudge' }, nudge.text, ' ', button(t('today.nudge.open'), { class: 'small', onclick: () => { location.hash = '#/plan'; } }))),
  };
  const firstRun = store.byKind('tick').length === 0 && canAskNotify();
  const notify = firstRun && h('section', { class: 'callout-slot' }, callout([
    h('p', {}, t('today.notify_body')),
    button(t('today.notify_on'), { class: 'small', onclick: (ev) => enablePush().then(() => ev.target.closest('.callout-slot')?.remove()).catch((err) => toast(err.message, 'bad')) }),
  ], { kind: 'neutral', icon: 'tabler/bell' }));
  put(root,
    greeting && h('p', { class: 'greet' }, greeting),
    h('header', { class: 'page-head' }, h('h1', {}, fmtLong(day))),
    off && h('section', { class: 'callout-slot' }, callout(t('today.offline'), { kind: 'warning', icon: 'tabler/wifi-off' })),
    notify,
    prefs.blocks.filter((k) => !prefs.hidden.includes(k)).map((k) => blocks[k]),
  );
}
