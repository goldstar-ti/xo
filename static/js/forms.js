// Add and edit dialogs for each kind of item.
import * as store from './store.js';
import { addDays, openForm, toast, today, toDate, uid } from './util.js';

const WEEKDAYS = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday']];

export function editAppointment(item, preset = {}) {
  const values = item ? item.data : { date: today(), travel: 30, prep: 30, ...preset };
  openForm({
    title: item ? 'Edit appointment' : values.court ? 'Add court date' : 'Add appointment',
    values,
    fields: [
      { name: 'title', label: 'What', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'time', label: 'Start time', type: 'time', required: true, half: true },
      { name: 'where', label: 'Where' },
      { name: 'travel', label: 'Travel, minutes', type: 'number', half: true },
      { name: 'prep', label: 'Getting ready, minutes', type: 'number', half: true, hint: 'Be generous. These set your get-ready and leave reminders.' },
      { name: 'notes', label: 'What to bring, who to ask for', type: 'textarea' },
      { name: 'court', label: 'This is a court date', type: 'checkbox', hint: 'Adds a reminder one week before.' },
    ],
    async onSave(v) {
      await store.save('appointment', item?.id || uid(), v, { day: v.date });
      toast('Saved');
    },
    onDelete: item && (async () => { await store.remove(item.id); toast('Deleted'); }),
  });
}

export function editTask(item, preset = {}) {
  const values = item ? item.data : { est: 30, ...preset };
  openForm({
    title: item ? 'Edit task' : 'Add task',
    values,
    fields: [
      { name: 'title', label: 'Task', required: true },
      { name: 'step', label: 'First small step', hint: 'Small enough to start in two minutes.' },
      { name: 'est', label: 'My guess, minutes', type: 'number', half: true, hint: 'The app adds half again.' },
      { name: 'due', label: 'Due', type: 'date', half: true },
      { name: 'project', label: 'Project', placeholder: 'Leave blank, or a name such as Court' },
    ],
    async onSave(v) {
      await store.save('task', item?.id || uid(), { ...values, ...v });
      toast('Saved');
    },
    onDelete: item && (async () => { await store.remove(item.id); toast('Deleted'); }),
  });
}

export async function quickTask(title, extra = {}) {
  title = title.trim();
  if (!title) return;
  await store.save('task', uid(), { title, step: '', est: 30, due: '', project: '', today: '', done: false, ...extra });
}

export async function toggleTask(item) {
  const done = !item.data.done;
  await store.save('task', item.id, { ...item.data, done, doneAt: done ? new Date().toISOString() : '' });
}

export async function pickTask(item) {
  const picked = item.data.today === today();
  if (!picked) {
    const count = store.byKind('task').filter((t) => t.data.today === today() && !t.data.done).length;
    if (count >= 3) { toast('Three is the limit for today. Finish or unpick one first.', 'bad'); return; }
  }
  await store.save('task', item.id, { ...item.data, today: picked ? '' : today() });
}

export function editRoutine(item) {
  openForm({
    title: item ? 'Edit routine item' : 'Add routine item',
    values: item ? item.data : { time: '12:00', type: 'other', active: true },
    fields: [
      { name: 'label', label: 'What', required: true, hint: 'This wording appears in the reminder on your lock screen.' },
      { name: 'time', label: 'Time', type: 'time', required: true, half: true },
      { name: 'type', label: 'Type', type: 'select', half: true, options: [['meal', 'Meal'], ['water', 'Water'], ['meds', 'Medication'], ['sleep', 'Sleep'], ['other', 'Other']] },
      { name: 'active', label: 'Remind me every day', type: 'checkbox' },
    ],
    async onSave(v) { await store.save('routine', item?.id || uid(), v); toast('Saved'); },
    onDelete: item && (async () => { await store.remove(item.id); toast('Deleted'); }),
  });
}

export function editBill(item) {
  openForm({
    title: item ? 'Edit bill' : 'Add bill',
    values: item ? item.data : { due: today(), repeat: 'monthly' },
    fields: [
      { name: 'name', label: 'Bill', required: true },
      { name: 'amount', label: 'Amount, dollars', type: 'number', step: '0.01', half: true },
      { name: 'due', label: 'Next due', type: 'date', required: true, half: true },
      { name: 'repeat', label: 'Repeats', type: 'select', options: [['none', 'Does not repeat'], ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['quarterly', 'Every 3 months'], ['yearly', 'Yearly']] },
      { name: 'autopay', label: 'Paid automatically', type: 'checkbox', hint: 'You get one reminder the day before, to check the money is there.' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ],
    async onSave(v) { await store.save('bill', item?.id || uid(), { ...(item?.data || {}), ...v, finished: false }); toast('Saved'); },
    onDelete: item && (async () => { await store.remove(item.id); toast('Deleted'); }),
  });
}

export function nextDue(due, repeat) {
  const d = toDate(due);
  if (repeat === 'weekly') return addDays(due, 7);
  if (repeat === 'fortnightly') return addDays(due, 14);
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[repeat];
  if (!months) return null;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
}

export async function payBill(item) {
  const d = item.data;
  const next = nextDue(d.due, d.repeat);
  await store.save('bill', item.id, next
    ? { ...d, due: next, lastPaid: today() }
    : { ...d, finished: true, lastPaid: today() });
  toast(next ? 'Paid. Next one is set.' : 'Paid');
}

export function editObligation(item) {
  openForm({
    title: item ? 'Edit condition' : 'Add condition',
    note: 'Write it in your own words. Your bail undertaking and your lawyer are the authority on what applies.',
    values: item ? item.data : { schedule: 'none', weekday: '1', time: '09:00' },
    fields: [
      { name: 'title', label: 'Condition', required: true },
      { name: 'detail', label: 'What it means day to day', type: 'textarea' },
      { name: 'contact', label: 'Who I check with, and their number' },
      { name: 'schedule', label: 'Remind me', type: 'select', options: [['none', 'No reminder'], ['daily', 'Every day'], ['weekly', 'Every week']] },
      { name: 'weekday', label: 'Day, for weekly', type: 'select', half: true, options: WEEKDAYS },
      { name: 'time', label: 'Time', type: 'time', half: true },
    ],
    async onSave(v) { await store.save('obligation', item?.id || uid(), v); toast('Saved'); },
    onDelete: item && (async () => { await store.remove(item.id); toast('Deleted'); }),
  });
}

export function editReport(item) {
  openForm({
    title: item ? 'Edit record' : 'Add to reporting record',
    note: 'Add a line every time you report something. Do not try to rebuild this later from memory.',
    values: item ? item.data : { date: today() },
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'what', label: 'What I reported', type: 'textarea', required: true },
      { name: 'who', label: 'Who I told' },
    ],
    async onSave(v) { await store.save('report', item?.id || uid(), v); toast('Saved'); },
    onDelete: item && (async () => { await store.remove(item.id); toast('Deleted'); }),
  });
}

export function calendarLink(d) {
  const stamp = (date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T` +
    `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
  const start = toDate(d.date, d.time);
  const end = new Date(start.getTime() + 3600000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: d.title || '', dates: `${stamp(start)}/${stamp(end)}`, location: d.where || '' });
  return `https://calendar.google.com/calendar/render?${q}`;
}
