// Keyboard shortcuts: the one registry of actions and their default keys, the owner's overrides from settings, and matching.
// Screens ask matchKey(scope, event) for an action id.
//
// A combo is written Ctrl+Alt+Shift+<key>, with only the modifiers used. Ctrl means Ctrl or Cmd.
// <key> is a letter in lower case (Ctrl+k, Shift+s), a digit or symbol as typed with no Shift (?, /, [),
// or a named key as KeyboardEvent.key gives it (Enter, Escape, ArrowDown, F2), with Shift kept.
// An empty combo means no key.
import * as store from './store.js';
import { t, text } from './text.js';
import { dialogOpen } from './util.js';

export const TYPING = 'input, textarea, select, [contenteditable], wa-input, wa-textarea, wa-select';

// { id, scope, key }: the fixed actions. A new shortcut is one entry here plus its wording in keys.yaml.
const ACTIONS = [
  { id: 'global.palette', scope: 'global', key: 'Ctrl+k' },
  { id: 'global.palette_alt', scope: 'global', key: '/' },
  { id: 'global.shortcuts', scope: 'global', key: '?' },
  { id: 'global.voice', scope: 'global', key: 'Alt+v' },
  { id: 'tasks.new', scope: 'tasks', key: 'n' },
  { id: 'tasks.next', scope: 'tasks', key: 'j' },
  { id: 'tasks.next_alt', scope: 'tasks', key: 'ArrowDown' },
  { id: 'tasks.prev', scope: 'tasks', key: 'k' },
  { id: 'tasks.prev_alt', scope: 'tasks', key: 'ArrowUp' },
  { id: 'tasks.edit', scope: 'tasks', key: 'e' },
  { id: 'tasks.edit_alt', scope: 'tasks', key: 'Enter' },
  { id: 'tasks.done', scope: 'tasks', key: 'x' },
  { id: 'tasks.pick', scope: 'tasks', key: 't' },
  { id: 'tasks.priority', scope: 'tasks', key: 'p' },
  { id: 'tasks.left', scope: 'tasks', key: '[' },
  { id: 'tasks.right', scope: 'tasks', key: ']' },
  { id: 'tasks.view_list', scope: 'tasks', key: '1' },
  { id: 'tasks.view_board', scope: 'tasks', key: '2' },
  { id: 'tasks.view_table', scope: 'tasks', key: '3' },
  { id: 'tracker.new', scope: 'tracker', key: 'n' },
  { id: 'tracker.next', scope: 'tracker', key: 'j' },
  { id: 'tracker.prev', scope: 'tracker', key: 'k' },
  { id: 'tracker.open', scope: 'tracker', key: 'Enter' },
  { id: 'tracker.back', scope: 'tracker', key: 'Escape' },
  { id: 'tracker.edit', scope: 'tracker', key: 'e' },
  { id: 'tracker.comment', scope: 'tracker', key: 'm' },
  { id: 'tracker.check', scope: 'tracker', key: 'c' },
  { id: 'tracker.select', scope: 'tracker', key: 'x' },
  { id: 'tracker.field_status', scope: 'tracker', key: 'Shift+s' },
  { id: 'tracker.field_priority', scope: 'tracker', key: 'Shift+p' },
  { id: 'tracker.field_kind', scope: 'tracker', key: 'Shift+k' },
  { id: 'tracker.field_area', scope: 'tracker', key: 'Shift+a' },
  { id: 'tracker.field_owner', scope: 'tracker', key: 'Shift+o' },
  { id: 'tracker.close', scope: 'tracker', key: 'Shift+d' },
  { id: 'tracker.tab_prev', scope: 'tracker', key: 'h' },
  { id: 'tracker.tab_next', scope: 'tracker', key: 'l' },
  { id: 'tracker.search', scope: 'tracker', key: '/' },
  { id: 'tracker.help', scope: 'tracker', key: '?' },
  { id: 'notes.new', scope: 'notes', key: 'n' },
  { id: 'notes.search', scope: 'notes', key: 's' },
  { id: 'notes.bold', scope: 'notes', key: 'Ctrl+b' },
  { id: 'notes.italic', scope: 'notes', key: 'Ctrl+i' },
  { id: 'notes.preview', scope: 'notes', key: 'Alt+p' },
  { id: 'canvas.undo', scope: 'canvas', key: 'Ctrl+z' },
];

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'OS', 'Fn'];

/** Every action: the fixed ones plus one "go to" action per screen, built on call because the text loads at boot. */
export function actions() {
  const go = Object.keys(text('app.nav') || {}).map((screen) => ({ id: `global.go_${screen}`, scope: 'global', key: '' }));
  return [...ACTIONS, ...go];
}

/** The scopes that have actions, global first. */
export function scopes() {
  return [...new Set(actions().map((a) => a.scope))];
}

/** The combo for a keyboard event, or '' for a bare modifier key. */
export function comboOf(e) {
  const k = e.key;
  if (!k || MODIFIER_KEYS.includes(k)) return '';
  let key = k;
  let shift = e.shiftKey;
  if (k.length === 1) {
    const letter = k.toLowerCase() !== k.toUpperCase();
    // With Alt held some layouts change the character, so read the physical key instead.
    const altCode = e.altKey && /^(Key[A-Z]|Digit\d)$/.test(e.code || '');
    if (altCode) key = e.code.slice(-1).toLowerCase();
    else if (letter) key = k.toLowerCase();
    if (!letter && !altCode) shift = false;
  }
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (shift) parts.push('Shift');
  return [...parts, key].join('+');
}

const defaultFor = (id) => actions().find((a) => a.id === id)?.key ?? '';

/** The key for an action: the owner's own choice when there is one, else the default. */
export function keyFor(id) {
  const own = store.settings().keys;
  if (own && Object.prototype.hasOwnProperty.call(own, id)) return own[id];
  return defaultFor(id);
}

/** The action id in this scope that the event triggers, or null. Nothing matches while a dialog is open. */
export function matchKey(scope, e) {
  if (dialogOpen()) return null;
  const combo = comboOf(e);
  if (!combo) return null;
  const typing = e.target?.closest?.(TYPING);
  if (typing && !(e.ctrlKey || e.metaKey || e.altKey)) return null;
  return actions().find((a) => a.scope === scope && keyFor(a.id) === combo)?.id ?? null;
}

const active = new Set();

/** Marks a screen scope as showing (or not). */
export function setScope(scope, on) {
  if (on) active.add(scope); else active.delete(scope);
}

/** The screen scopes showing now. */
export const activeScopes = () => [...active];

/** True when a showing screen scope has an action on this combo. */
export function boundInActive(combo) {
  return !!combo && actions().some((a) => active.has(a.scope) && keyFor(a.id) === combo);
}

/** The combo as the reader sees it: letters upper-cased, named keys spelled out. */
export function keyLabel(combo) {
  if (!combo) return t('keys.none');
  const names = text('keys.names') || {};
  return combo.split(/\+(?=.)/).map((part) => names[part] || (part.length === 1 ? part.toUpperCase() : part)).join('+');
}

/** The combo in the form aria-keyshortcuts wants (Ctrl+z becomes Control+Z), or null when there is no key. */
export function ariaKeys(combo) {
  if (!combo) return null;
  return combo.replace(/^Ctrl\+/, 'Control+').replace(/\+Ctrl\+/, '+Control+').split('+').map((p, i, all) => (i === all.length - 1 && p.length === 1 ? p.toUpperCase() : p)).join('+');
}

/** The wording for an action. */
export function actionLabel(id) {
  if (id.startsWith('global.go_')) {
    const screen = id.slice('global.go_'.length);
    return t('keys.actions.global_go', { screen: text('app.nav')[screen] || screen });
  }
  return t(`keys.actions.${id.replace('.', '_')}`);
}

/** The other action that already uses this combo where it would collide, or null. */
export function clashFor(id, combo) {
  if (!combo) return null;
  const me = actions().find((a) => a.id === id);
  if (!me) return null;
  return actions().find((a) => a.id !== id && keyFor(a.id) === combo && (a.scope === me.scope || a.scope === 'global' || me.scope === 'global'))?.id ?? null;
}

async function saveKeys(keys) {
  await store.save('settings', 'settings', { ...store.settings(), keys }, { silent: true });
}

/** Saves the owner's key for one action. A key equal to the default removes the override. */
export async function saveKey(id, combo) {
  const keys = { ...(store.settings().keys || {}) };
  if (combo === defaultFor(id)) delete keys[id]; else keys[id] = combo;
  await saveKeys(keys);
}

/** Puts the original key back on these actions. */
export async function resetKeys(ids) {
  const keys = { ...(store.settings().keys || {}) };
  ids.forEach((id) => delete keys[id]);
  await saveKeys(keys);
}
