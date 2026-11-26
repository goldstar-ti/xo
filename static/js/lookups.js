// The check-in choice lists (lookups). The original lists live in content/text/checkin.yaml. Once
// the owner edits a list in Settings, their copy is kept in the settings item under
// lookups[<key>] as [{ text, group }] rows, syncs like any other item, and replaces the original.
import * as store from './store.js';
import { text } from './text.js';

// One entry per editable list. Adding a list is one entry here plus its defaults in checkin.yaml:
// a YAML list for a flat list, or a map of group key to list for a grouped one.
export const LOOKUPS = [
  { key: 'did', source: 'checkin.day_chips' },
  { key: 'body', source: 'checkin.body_chips' },
  { key: 'sleep', source: 'checkin.sleep_chips' },
];

/** Group key to group name, in screen order, from checkin.groups. */
export const groupNames = () => text('checkin.groups') || {};

const find = (key) => LOOKUPS.find((l) => l.key === key);

/** True when the list's original version is split into groups. */
export const grouped = (key) => !Array.isArray(text(find(key).source));

/** The original rows for a list, from the YAML. */
export function defaults(key) {
  const raw = text(find(key).source);
  if (Array.isArray(raw)) return raw.map((v) => ({ text: String(v), group: '' }));
  return Object.entries(raw || {}).flatMap(([group, list]) => (list || []).map((v) => ({ text: String(v), group })));
}

/** True when the owner has their own version of the list. */
export const isOwn = (key) => Array.isArray(store.settings().lookups?.[key]);

/** The rows in use: the owner's version if there is one, otherwise the original. */
export const rows = (key) => (isOwn(key) ? store.settings().lookups[key] : defaults(key));
