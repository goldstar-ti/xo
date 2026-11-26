// Add and edit dialogs for each kind of item.
import * as store from './store.js';
import { saveTask, taskMeta } from './taskdata.js';
import { blockedEditor, chipSet, repeatEditor, subtaskEditor } from './taskfields.js';
import { normaliseTask } from './tasks.js';
import { t, text } from './text.js';
import { addDays, openForm, toast, today, toDate, uid } from './util.js';

// A field spec whose label (and, with hint: true, its hint) comes from forms.<form>.labels / .hints.
const fld = (form, name, { hint, ...props } = {}) => ({
  name,
  label: t(`forms.${form}.labels.${name}`),
  ...(hint ? { hint: t(`forms.${form}.hints.${name}`) } : {}),
  ...props,
});
const choices = (key) => Object.entries(text(key));
const saved = () => toast(t('forms.saved'));
const deleted = () => toast(t('forms.deleted'));

export function editAppointment(item, preset = {}) {
  const values = item ? item.data : { date: today(), travel: 30, prep: 30, ...preset };
  openForm({
    title: t(item ? 'forms.appointment.heading_edit' : values.court ? 'forms.appointment.heading_court' : 'forms.appointment.heading_add'),
    values,
    fields: [
      fld('appointment', 'title', { required: true }),
      fld('appointment', 'date', { type: 'date', required: true, half: true }),
      fld('appointment', 'time', { type: 'time', required: true, half: true }),
      fld('appointment', 'where'),
      fld('appointment', 'travel', { type: 'number', half: true }),
      fld('appointment', 'prep', { type: 'number', half: true, hint: true }),
      fld('appointment', 'notes', { type: 'textarea' }),
      fld('appointment', 'court', { type: 'checkbox', hint: true }),
    ],
    async onSave(v) {
      await store.save('appointment', item?.id || uid(), v, { day: v.date });
      saved();
    },
    onDelete: item && (async () => { await store.remove(item.id); deleted(); }),
  });
}

export function editTask(item, preset = {}) {
  const values = item ? normaliseTask(item.data) : normaliseTask({ est: 30, ...preset });
  const meta = taskMeta();
  const labelled = (list) => list.map((x) => [x.id, x.name]);
  openForm({
    title: t(item ? 'forms.task.heading_edit' : 'forms.task.heading_add'),
    values,
    fields: [
      fld('task', 'title', { required: true }),
      fld('task', 'step', { hint: true }),
      fld('task', 'priority', { type: 'custom', build: (v) => chipSet(Object.entries(text('forms.task.priorities')), v) }),
      fld('task', 'est', { type: 'number', half: true, hint: true }),
      fld('task', 'due', { type: 'date', half: true }),
      fld('task', 'tags', { type: 'custom', build: (v) => chipSet(labelled(meta.tags), v, { multi: true }) }),
      fld('task', 'subtasks', { type: 'custom', hint: true, build: (v) => subtaskEditor(v) }),
      fld('task', 'energy', { type: 'custom', more: true, build: (v) => chipSet(Object.entries(text('forms.task.energies')), v) }),
      fld('task', 'places', { type: 'custom', more: true, build: (v) => chipSet(labelled(meta.places), v, { multi: true }) }),
      fld('task', 'repeat', { type: 'custom', more: true, hint: true, filled: (v) => v.every !== 'none', build: (v) => repeatEditor(v) }),
      { name: 'blockedBy', label: t('forms.task.labels.blocked_by'), hint: t('forms.task.hints.blocked_by'), type: 'custom', more: true, build: (v) => blockedEditor(v, item?.id) },
      fld('task', 'project', { more: true, placeholder: t('forms.task.placeholders.project') }),
      fld('task', 'actual', { type: 'number', more: true, half: true, hint: true }),
    ],
    async onSave(v) {
      const data = { ...values, ...v };
      if (data.repeat.every !== 'none' && !data.due) data.due = today();
      await saveTask(item?.id || uid(), data);
      saved();
    },
    onDelete: item && (async () => { await store.remove(item.id); deleted(); }),
  });
}

export { pickTask, quickTask, toggleTask } from './taskdata.js';

export function editRoutine(item) {
  openForm({
    title: t(item ? 'forms.routine.heading_edit' : 'forms.routine.heading_add'),
    values: item ? item.data : { time: '12:00', type: 'other', active: true },
    fields: [
      fld('routine', 'label', { required: true, hint: true }),
      fld('routine', 'time', { type: 'time', required: true, half: true }),
      fld('routine', 'type', { type: 'select', half: true, options: choices('forms.routine.types') }),
      fld('routine', 'active', { type: 'checkbox' }),
    ],
    async onSave(v) { await store.save('routine', item?.id || uid(), v); saved(); },
    onDelete: item && (async () => { await store.remove(item.id); deleted(); }),
  });
}

export function editBill(item) {
  openForm({
    title: t(item ? 'forms.bill.heading_edit' : 'forms.bill.heading_add'),
    values: item ? item.data : { due: today(), repeat: 'monthly' },
    fields: [
      fld('bill', 'name', { required: true }),
      fld('bill', 'amount', { type: 'number', step: '0.01', half: true }),
      fld('bill', 'due', { type: 'date', required: true, half: true }),
      fld('bill', 'repeat', { type: 'select', options: choices('forms.bill.repeats') }),
      fld('bill', 'autopay', { type: 'checkbox', hint: true }),
      fld('bill', 'notes', { type: 'textarea', rows: 2 }),
    ],
    async onSave(v) { await store.save('bill', item?.id || uid(), { ...(item?.data || {}), ...v, finished: false }); saved(); },
    onDelete: item && (async () => { await store.remove(item.id); deleted(); }),
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
  toast(t(next ? 'forms.bill.paid_next' : 'forms.bill.paid'));
}

export function editObligation(item) {
  openForm({
    title: t(item ? 'forms.obligation.heading_edit' : 'forms.obligation.heading_add'),
    note: t('forms.obligation.note'),
    values: item ? item.data : { schedule: 'none', weekday: '1', time: '09:00' },
    fields: [
      fld('obligation', 'title', { required: true }),
      fld('obligation', 'detail', { type: 'textarea' }),
      fld('obligation', 'contact'),
      fld('obligation', 'schedule', { type: 'select', options: choices('forms.obligation.schedules') }),
      fld('obligation', 'weekday', { type: 'select', half: true, options: choices('forms.weekdays') }),
      fld('obligation', 'time', { type: 'time', half: true }),
    ],
    async onSave(v) { await store.save('obligation', item?.id || uid(), v); saved(); },
    onDelete: item && (async () => { await store.remove(item.id); deleted(); }),
  });
}

export function editReport(item) {
  openForm({
    title: t(item ? 'forms.report.heading_edit' : 'forms.report.heading_add'),
    note: t('forms.report.note'),
    values: item ? item.data : { date: today() },
    fields: [
      fld('report', 'date', { type: 'date', required: true }),
      fld('report', 'what', { type: 'textarea', required: true }),
      fld('report', 'who'),
    ],
    async onSave(v) { await store.save('report', item?.id || uid(), v); saved(); },
    onDelete: item && (async () => { await store.remove(item.id); deleted(); }),
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
