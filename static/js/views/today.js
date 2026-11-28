import * as store from '../store.js';
import { LINES, PLAN, PLAN_FIRST } from '../content.js';
import { editAppointment, editBill, editRoutine, editTask, payBill } from '../forms.js';
import { allTasks, currentPace, toggleTask } from '../taskdata.js';
import { t } from '../text.js';
import { icon } from '../icons.js';
import { plainText } from '../markdown.js';
import { isOn } from '../modules.js';
import { button, callout, chip, disclosure, linkRow, playRing, plainLink, tag, tickBox } from '../ui.js';
import { dropFab, fabSheet } from '../sheet.js';
import { enablePush } from './settings.js';
import { addDays, daysBetween, fmtDay, fmtDuration, fmtLong, fmtMoney, fmtTime, h, hm, relDay, toast, today, toDate, put } from '../util.js';

export const live = true;

// An item's reference (XO-12) from its project's key, without loading the tracker modules.
const trackerRef = (it) => `${store.get(it.data.project)?.data?.key || '?'}-${it.data.num}`;

export function lineForToday() {
  const own = store.settings().lines.split('\n').map((s) => s.trim()).filter(Boolean);
  const matters = plainText(store.plan().answers.good_matters).trim();
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
  for (const r of isOn('routine') ? store.byKind('routine') : []) {
    if (r.data.active === false) continue;
    out.push({ time: r.data.time, label: r.data.label, kind: 'tick', mod: 'routine', ref: r.id, done: store.isTicked(r.id, day) });
  }
  for (const o of isOn('obligations') ? store.byKind('obligation') : []) {
    const d = o.data;
    if (d.schedule === 'daily' || (d.schedule === 'weekly' && Number(d.weekday) === weekday))
      out.push({ time: d.time, label: d.title, kind: 'tick', mod: 'obligations', ref: o.id, done: store.isTicked(o.id, day), href: '#/obligations' });
  }
  for (const a of isOn('diary') ? store.byKind('appointment') : []) {
    if (a.data.date !== day) continue;
    const tm = store.apptTimes(a.data);
    const bits = [];
    if (tm.ready < tm.leave) bits.push(t('lists.shared.get_ready', { time: fmtTime(tm.ready) }));
    if (tm.leave < tm.start) bits.push(t('lists.shared.leave', { time: fmtTime(tm.leave) }));
    out.push({ time: a.data.time, label: a.data.title, kind: 'appt', mod: 'diary', item: a, times: tm, sub: [bits.join(', ').replace(/^./, (c) => c.toUpperCase()), a.data.where].filter(Boolean).join('. ') });
  }
  const pace = currentPace();
  for (const task of isOn('tasks.timeblocks') ? allTasks() : []) {
    const d = task.data;
    if (d.today !== day || !d.at || d.archived) continue;
    out.push({ time: d.at, label: d.title, kind: 'task', mod: 'tasks', item: task, done: d.done, sub: d.est > 0 ? t('lists.shared.allow', { duration: fmtDuration(d.est * pace) }) : '' });
  }
  if (isOn('checkin')) {
    out.push({ time: s.morningAt, label: t('today.entries.morning_checkin'), kind: 'checkin', mod: 'checkin', type: 'morning', done: !!store.get(checkinId('morning', day)) });
    out.push({ time: s.eveningAt, label: t('today.entries.evening_checkin'), kind: 'checkin', mod: 'checkin', type: 'evening', done: !!store.get(checkinId('evening', day)) });
  }
  if (isOn('checkin') && weekday === Number(s.weeklyDay))
    out.push({ time: s.weeklyAt, label: t('today.entries.weekly_review'), kind: 'checkin', mod: 'checkin', type: 'weekly', done: !!store.get(checkinId('weekly', day)) });
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
  const later = (isOn('diary') ? store.byKind('appointment') : [])
    .filter((a) => a.data.date > today())
    .sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time))[0];
  if (later) return { head: t('today.next.nothing_timed'), title: t('today.next.next_appt', { title: later.data.title }), sub: `${relDay(later.data.date)}, ${fmtTime(later.data.time)}` };
  return { head: t('today.next.nothing_timed'), title: '', sub: '' };
}

function planNudge() {
  if (!isOn('plan') || !isOn('today.plan')) return null;
  const p = store.plan();
  if (!p.variant) return { text: t('today.nudge.not_started'), done: false };
  const boxes = PLAN[p.variant].flatMap((s) => s.boxes);
  const filled = boxes.filter((b) => (p.answers[b.k] || '').trim());
  if (filled.length === boxes.length) return null;
  const order = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes];
  const next = order.find((b) => !(p.answers[b.k] || '').trim());
  return { text: t('today.nudge.progress', { filled: filled.length, total: boxes.length, question: next.q }) };
}

/** The Today blocks as nodes, keyed as in the Appearance block order. Returns { blocks, greeting, day }; a block is false when its switch is off. horizon is how many days ahead Coming up looks. */
export function todayBlocks({ day = today(), horizon = 7 } = {}) {
  const entries = dayEntries(day);
  const line = lineForToday();
  const missed = missedYesterday();
  const up = nextUp(entries);
  const nowHm = hm(new Date());

  const off = offline();
  const lock = off ? { disabled: true } : {};
  // A tick box carries the entry's name as its label; the pop animation hangs on the entry, not the box.
  const tickFor = (e, onchange) => tickBox({ checked: e.done, label: e.label, ...lock, onchange });
  const tick = (e) => tickFor(e, (on) => {
    if (on) sessionStorage.setItem('pop', e.ref);
    store.setTick(e.ref, on).catch((err) => toast(err.message, 'bad'));
  });

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
    else if (e.kind === 'task') action = tickFor(e, () => toggleTask(e.item).catch((err) => toast(err.message, 'bad')));
    else if (e.kind === 'checkin') action = e.done
      ? h('a', { class: 'tick on', href: `#/checkin/${e.type}` }, tag(t('today.done'), 'accent'))
      : playRing({ label: t(`today.tick.start_${e.type}`), ...lock, onclick: () => { location.hash = `#/checkin/${e.type}`; } });
    else action = plainLink(t('today.tick.edit'), { 'aria-label': t('today.tick.edit_aria', { label: e.label }), onclick: () => editAppointment(e.item) });
    rows.push(h('li', { 'data-module': e.mod, class: `entry k-${e.kind}${e.done ? ' done' : ''}${past ? ' past' : ''}${missed ? ' missed' : ''}${e.ref && e.ref === popped ? ' pop' : ''}` },
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
          tickBox({ checked: task.data.done, label: t('lists.shared.done_aria', { title: task.data.title }), onchange: () => toggleTask(task).catch((err) => toast(err.message, 'bad')) }),
          button(h('span', {}, task.data.title), { variant: 'row', class: 'row-main', onclick: () => editTask(task) }),
          (task.data.done || task.data.est > 0) && h('span', { class: 'meta' }, task.data.done ? t('today.three.done') : t('lists.shared.allow', { duration: fmtDuration(task.data.est * pace) }))))),
        needs > 0 && h('p', { class: 'note' }, t('today.three.needs', { duration: fmtDuration(needs) })),
        needs > 0 && left > 0 && needs > left && h('p', { class: 'note late' }, t('today.three.over', { duration: fmtDuration(left) })))
    : h('p', { class: 'empty' }, t('today.three.empty_lead'), ' ', plainLink(t('today.three.choose'), { href: '#/tasks' }), ' ', t('today.three.empty_tail'));

  const payBox = (c) => {
    const box = tickBox({ checked: false, label: t('today.coming.mark_paid', { name: c.name }), ...lock, onchange: () => c.pay().catch((err) => { box.checked = false; toast(err.message, 'bad'); }) });
    return box;
  };

  const limit = addDays(day, horizon);
  const coming = [];
  for (const a of isOn('diary') ? store.byKind('appointment') : [])
    if (a.data.date > day && a.data.date <= addDays(day, a.data.court ? horizon * 2 : horizon))
      coming.push({ day: a.data.date, text: `${a.data.title}, ${fmtTime(a.data.time)}`, tag: t(a.data.court ? 'today.coming.court' : 'today.coming.appointment'), href: '#/diary', open: () => editAppointment(a) });
  for (const task of isOn('tasks') ? store.byKind('task') : [])
    if (!task.data.done && task.data.due && task.data.due <= limit)
      coming.push({ day: task.data.due, text: task.data.title, tag: t('today.coming.task_due'), href: '#/tasks', open: () => editTask(task) });
  for (const b of isOn('bills') ? store.byKind('bill') : [])
    if (!b.data.finished && b.data.due <= limit)
      coming.push({ day: b.data.due, text: `${b.data.name}${b.data.amount ? `, ${fmtMoney(b.data.amount)}` : ''}`, tag: t(b.data.autopay ? 'today.coming.bill_auto' : 'today.coming.bill'), name: b.data.name, href: '#/bills', open: () => editBill(b), pay: b.data.autopay ? null : () => payBill(b) });
  for (const it of isOn('tracker') ? store.byKind('pm_item') : [])
    if (it.data.due && !it.data.closed_at && it.data.due <= limit)
      coming.push({ day: it.data.due, text: it.data.title, tag: t('today.coming.tracker', { ref: trackerRef(it) }), href: `#/tracker/${trackerRef(it)}` });
  coming.sort((a, b) => a.day.localeCompare(b.day));

  const nudge = planNudge();

  const prefs = window.XOLook.prefs;
  const hour = new Date().getHours();
  const greeting = prefs.callMe && t(`today.greeting.${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`, { name: prefs.callMe });
  // Blocks can be hidden and reordered in Appearance.
  const blocks = {
    line: isOn('today.line') && window.XOLook.active().look.line !== 'hidden' && h('p', { class: 'line' }, !missed && line.label && h('span', { class: 'line-label' }, `${line.label}: `), missed ? t('today.missed_line') : line.text),
    next: isOn('today.next') && h('section', { class: `next${up.urgent ? ' urgent' : ''}`, 'aria-label': t('today.next_up') },
      h('p', { class: 'next-head' }, up.head),
      up.title && h('p', { class: 'next-title' }, up.title),
      up.sub && h('p', { class: 'next-sub' }, up.pin && [icon('tabler/map-pin'), ' '], up.sub)),
    three: isOn('today.three') && isOn('tasks.three') && h('section', { class: 'col-side' }, h('div', { class: 'sec-head' }, h('h2', {}, t('today.three.heading')), plainLink(t('today.three.all_tasks'), { href: '#/tasks' })), three),
    day: isOn('today.day') && h('section', { class: 'col-day' }, h('div', { class: 'sec-head' }, h('h2', {}, t('today.day.heading')), isOn('routine') && plainLink(t('today.day.edit_routine'), { href: '#/routine' })),
      h('ol', { class: 'dayline' }, rows)),
    coming: isOn('today.coming') && h('section', { class: 'col-side' }, h('div', { class: 'sec-head' }, h('h2', {}, t('today.coming.heading'))),
      coming.length
        ? h('ul', { class: 'list coming' }, coming.map((c) => {
            const late = daysBetween(day, c.day) < 0;
            // The row opens its item in a form (or the tracker); the href keeps it a real link.
            const row = linkRow({ title: c.text, sub: `${c.tag}, ${late ? t('lists.shared.overdue_since', { day: fmtDay(c.day) }) : relDay(c.day)}`, href: c.href });
            if (c.open) row.addEventListener('click', (ev) => { ev.preventDefault(); c.open(); });
            // Paying is the row's done state, so it is a tick box beside the row, not a worded button.
            return h('li', { class: late ? 'late' : '' },
              row,
              c.pay && payBox(c));
          }))
        : h('p', { class: 'empty' }, t('today.coming.empty'))),
    plan: nudge && h('section', { class: 'col-side' }, h('p', { class: 'nudge' }, nudge.text, ' ', plainLink(t('today.nudge.open'), { href: '#/plan' }))),
  };
  return { blocks, greeting, day };
}

// Below 40rem Today follows pattern C: Next up as the lead card, a ribbon of jump chips, The day open,
// and the other sections folded up. todayBlocks() is the same on both; only render() lays it out.
const PHONE = '(max-width: 39.99rem)';
const folds = {};
let watching = null;

export const leave = dropFab;

function watchPhone(root, mq) {
  if (watching) watching.mq.removeEventListener('change', watching.fn);
  const fn = () => { if (root.isConnected && root.querySelector('[data-today]')) { root.replaceChildren(); render(root); } };
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

function addTab({ close }) {
  const go = (fn) => () => { close(); fn(null); };
  const choices = [
    isOn('tasks') && ['add_task', 'tabler/checkbox', editTask],
    isOn('diary') && ['add_appointment', 'tabler/calendar-event', editAppointment],
    isOn('bills') && ['add_bill', 'tabler/receipt', editBill],
    isOn('routine') && ['add_routine', 'tabler/repeat', editRoutine],
  ].filter(Boolean);
  return h('ul', { class: 'fab-choices' }, choices.map(([key, ic, fn]) =>
    h('li', {}, button([icon(ic), t(`today.sheet.${key}`)], { variant: 'ghost', class: 'fab-choice', onclick: go(fn) }))));
}

function checkinTab({ close }) {
  const off = offline();
  return h('ul', { class: 'fab-choices' }, ['morning', 'evening', 'weekly'].map((type) =>
    h('li', { class: 'fab-checkin' },
      playRing({ label: t(`today.tick.start_${type}`), ...(off ? { disabled: true } : {}), onclick: () => { close(); location.hash = `#/checkin/${type}`; } }),
      h('span', {}, t(`today.entries.${type === 'weekly' ? 'weekly_review' : `${type}_checkin`}`)))));
}

function renderPhone(root, { blocks, greeting, day }, extras) {
  const prefs = window.XOLook.prefs;
  const hidden = (k) => prefs.hidden.includes(k) || !blocks[k];
  const lead = !hidden('next') && blocks.next;
  const folded = [['three', 'today.three.heading'], ['coming', 'today.coming.heading'], ['plan', 'today.phone.plan_heading']].filter(([k]) => !hidden(k));
  const showDay = !hidden('day');
  const targets = [
    showDay && ['today-day', t('today.phone.ribbon_day')],
    ...folded.map(([k]) => [`today-${k}`, t(`today.phone.ribbon_${k}`)]),
  ].filter(Boolean);
  if (showDay) blocks.day.id = 'today-day';
  put(root,
    greeting && h('p', { class: 'greet' }, greeting),
    h('header', { class: 'page-head', 'data-today': '' }, h('h1', {}, fmtLong(day))),
    ...extras,
    !hidden('line') && blocks.line,
    lead,
    targets.length > 1 && h('nav', { class: 'ribbon', 'aria-label': t('today.phone.ribbon') },
      targets.map(([id, label]) => { const c = chip(label, { onclick: () => jump(id) }); c.removeAttribute('aria-pressed'); return c; })),
    showDay && blocks.day,
    folded.map(([k, title], n) => {
      const d = disclosure(t(title), blocks[k], { id: `today-${k}`, open: k in folds ? folds[k] : n === 0, onToggle: (o) => { folds[k] = o; } });
      d.classList.add('today-fold');
      return d;
    }));
  const tabs = [
    (isOn('tasks') || isOn('diary') || isOn('bills') || isOn('routine')) && { key: 'add', label: t('today.sheet.add_tab'), body: addTab },
    isOn('checkin') && { key: 'checkin', label: t('today.sheet.checkin_tab'), body: checkinTab },
  ].filter(Boolean);
  if (tabs.length) fabSheet({ label: t('today.sheet.fab'), icon: 'tabler/plus', tabs });
}

export function render(root) {
  dropFab();
  const { blocks, greeting, day } = todayBlocks();
  const off = offline();
  const prefs = window.XOLook.prefs;
  const firstRun = store.byKind('tick').length === 0 && canAskNotify();
  const notify = firstRun && h('section', { class: 'callout-slot' }, callout([
    h('p', {}, t('today.notify_body')),
    button(t('today.notify_on'), { class: 'small', onclick: (ev) => enablePush().then(() => ev.target.closest('.callout-slot')?.remove()).catch((err) => toast(err.message, 'bad')) }),
  ], { kind: 'neutral', icon: 'tabler/bell' }));
  const offlineNote = off && h('section', { class: 'callout-slot' }, callout(t('today.offline'), { kind: 'warning', icon: 'tabler/wifi-off' }));
  const mq = window.matchMedia(PHONE);
  watchPhone(root, mq);
  if (mq.matches) return renderPhone(root, { blocks, greeting, day }, [offlineNote, notify]);
  put(root,
    greeting && h('p', { class: 'greet' }, greeting),
    h('header', { class: 'page-head', 'data-today': '' }, h('h1', {}, fmtLong(day))),
    offlineNote,
    notify,
    prefs.blocks.filter((k) => !prefs.hidden.includes(k)).map((k) => blocks[k]),
  );
}
