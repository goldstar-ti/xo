// Custom fields: the owner's own fields on each kind of record. Definitions live in the fields item; values in payload.custom.
// A definition is { id, name, type, options: [string], show }. The `fields` item is { <kind>: [definition] }.
import * as store from './store.js';
import { chipSet } from './taskfields.js';
import { t } from './text.js';
import { checkbox, field, input, select, textarea } from './ui.js';
import { fmtDay, h } from './util.js';

/** The one list of kinds that take custom fields: [kind, text key for its name]. */
export const FIELD_KINDS = [
  ['appointment', 'fields.kinds.appointment'],
  ['task', 'fields.kinds.task'],
  ['routine', 'fields.kinds.routine'],
  ['bill', 'fields.kinds.bill'],
  ['obligation', 'fields.kinds.obligation'],
  ['report', 'fields.kinds.report'],
  ['checkin', 'fields.kinds.checkin'],
  ['pm_item', 'fields.kinds.pm_item'],
];

export const TYPES = ['text', 'long', 'number', 'date', 'choice', 'choices', 'yesno'];

const ITEM = 'fields';

/** Every definition, by kind. */
export const allDefs = () => store.get(ITEM)?.data || {};

/** The definitions for one kind, in the owner's order. */
export function defs(kind) {
  const list = allDefs()[kind];
  return Array.isArray(list) ? list.filter((d) => d && d.id) : [];
}

/** Saves every definition (the whole { kind: [definition] } object). */
export const saveDefs = (all) => store.save(ITEM, ITEM, all);

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** The text for one value, or '' when it has none. A number of 0 counts as not set. */
export function valueText(def, v) {
  if (isEmpty(v) || v === false) return '';
  if (def.type === 'number' && !Number(v)) return '';
  if (def.type === 'choices') return (Array.isArray(v) ? v : []).join(', ');
  if (def.type === 'date') return fmtDay(v);
  if (def.type === 'yesno') return v === true ? def.name : '';
  return String(v);
}

/** Strings for a list row: `Name: value` for each shown field that has a value (a yes shows the name alone). */
export function customMeta(kind, custom) {
  return defs(kind).filter((d) => d.show !== false).map((d) => {
    const text = valueText(d, custom?.[d.id]);
    if (!text) return '';
    return d.type === 'yesno' ? text : `${d.name}: ${text}`;
  }).filter(Boolean);
}

/** The form values for a kind's fields: { cf_<id>: value }. Merge these into the values given to openForm. */
export function customValues(kind, custom) {
  return Object.fromEntries(defs(kind).map((d) => [`cf_${d.id}`, custom?.[d.id]]));
}

/** openForm field specs, named cf_<id>, for every definition of a kind. */
export function formFields(kind, custom = {}) {
  return defs(kind).map((d) => {
    const spec = { name: `cf_${d.id}`, label: d.name };
    const opts = (d.options || []).map((o) => [o, o]);
    if (d.type === 'long') return { ...spec, type: 'textarea', rows: 3 };
    if (d.type === 'number') return { ...spec, type: 'number', half: true };
    if (d.type === 'date') return { ...spec, type: 'date', half: true };
    if (d.type === 'yesno') return { ...spec, type: 'checkbox' };
    if (d.type === 'choice') return { ...spec, type: 'select', options: [['', t('fields.none')], ...opts] };
    if (d.type === 'choices') return { ...spec, type: 'custom', build: () => chipSet(opts, custom?.[d.id], { multi: true }) };
    return { ...spec, type: 'text' };
  });
}

/** Takes the cf_ keys out of the form values `out` and returns them as { id: value }. */
export function readCustom(out) {
  const custom = {};
  for (const key of Object.keys(out)) {
    if (!key.startsWith('cf_')) continue;
    custom[key.slice(3)] = out[key];
    delete out[key];
  }
  return custom;
}

/**
 * Inline controls for a screen that is not a form: null when the kind has no fields, else a div.fields.
 * Each control has id cf-<id>. A change calls onChange with the whole custom object, { ...custom, [id]: value }.
 */
export function customEditor(kind, custom, onChange) {
  const list = defs(kind);
  if (!list.length) return null;
  let now = { ...(custom || {}) };
  const report = (id, value) => { now = { ...now, [id]: value }; onChange(now); };
  return h('div', { class: 'fields' }, list.map((d) => {
    const id = `cf-${d.id}`;
    const v = now[d.id];
    if (d.type === 'choices') {
      const set = chipSet((d.options || []).map((o) => [o, o]), v, { multi: true });
      // The chip redraws itself on its own click; this runs as the click bubbles up, so read() is already new.
      set.node.addEventListener('click', () => report(d.id, set.read()));
      return h('fieldset', { class: 'field' }, h('legend', {}, d.name), set.node);
    }
    if (d.type === 'yesno') return field(d.name, checkbox({ id, checked: !!v, onchange: (e) => report(d.id, e.target.checked) }));
    if (d.type === 'choice') {
      const opts = [['', t('fields.none')], ...(d.options || []).map((o) => [o, o])];
      return field(d.name, select(opts, { id, value: v ?? '', onchange: (e) => report(d.id, e.target.value) }));
    }
    if (d.type === 'long') return field(d.name, textarea({ id, rows: 3, value: v ?? '', onchange: (e) => report(d.id, e.target.value.trim()) }));
    if (d.type === 'number') {
      return field(d.name, input({ id, type: 'number', min: 0, inputmode: 'decimal', autocomplete: 'off', value: v ?? '', onchange: (e) => report(d.id, e.target.value === '' ? 0 : Number(e.target.value)) }), null, { half: true });
    }
    return field(d.name, input({ id, type: d.type === 'date' ? 'date' : 'text', autocomplete: 'off', value: v ?? '', onchange: (e) => report(d.id, e.target.value.trim()) }), null, { half: d.type === 'date' });
  }));
}
