// The module registry and the one gate: is a module (or one of its functions) switched on?
//
// A module is a screen with its own items, reminders and canvas widgets. Its id is its route key
// (`#/tasks`), so the nav, the palette and the shortcuts need no second list. State is one item,
// kind `modules` id `modules`, payload `{ off: [ids] }`, so a switch applies on every device.
// A module that is off is hidden everywhere and stops its reminders; its data stays, and switching
// it on again brings everything back (D-36). Core modules cannot be switched off.
//
// A module can list functions: parts of it that can be switched on their own. A function's id is
// `<module>.<function>` (`tasks.board`), and it is off when its module is off. The `off` list holds
// both kinds of id.
//
// An entry:
//   id:      the route key, matching VIEWS in app.js
//   core:    true for modules that cannot be switched off
//   kinds:   item kinds whose reminders are recomputed when the module is switched
//   remind:  reminder kind prefixes that belong to the module (see REMINDERS in store.js)
//   widgets: canvas widget ids the module owns (static/js/widgets.js)
//   functions: [{ id, remind?, widgets? }]: remind is reminder kind prefixes, widgets as for a module
import * as store from './store.js';

export const MODULES = [
  {
    id: 'today',
    widgets: ['today'],
    // One function for each block on Today (BLOCKS in boot.js). The three block also needs tasks.three.
    functions: [{ id: 'line' }, { id: 'next' }, { id: 'three' }, { id: 'day' }, { id: 'coming' }, { id: 'plan' }],
  },
  { id: 'diary', kinds: ['appointment'], remind: ['appt_'], widgets: ['diary'] },
  {
    id: 'tasks',
    kinds: ['task'],
    remind: ['task_'],
    widgets: ['tasks'],
    functions: [
      { id: 'three', },
      { id: 'board', widgets: ['tasks-board'] },
      { id: 'table', widgets: ['tasks-table'] },
      { id: 'subtasks' },
      { id: 'repeats' },
      { id: 'dependencies' },
      { id: 'timeblocks', remind: ['task_block'] },
      { id: 'stale' },
      { id: 'closeday' },
    ],
  },
  { id: 'notes', widgets: ['notes'] },
  { id: 'obligations', kinds: ['obligation'], remind: ['obligation'], widgets: ['obligations'] },
  { id: 'routine', kinds: ['routine'], remind: ['routine'], widgets: ['routine'] },
  { id: 'bills', kinds: ['bill'], remind: ['bill_'], widgets: ['bills'] },
  // The check-in reminders are computed from the settings item.
  { id: 'checkin', kinds: ['settings'], remind: ['checkin_'], widgets: ['checkin', 'checkin-morning', 'checkin-evening', 'checkin-weekly'] },
  { id: 'plan', widgets: ['plan'] },
  { id: 'tracker', kinds: ['pm_item'], remind: ['pm_'], widgets: ['tracker', 'tracker-due', 'tracker-summary', 'tracker-board'] },
  { id: 'canvas' },
  { id: 'appearance', core: true, widgets: ['appearance'] },
  { id: 'settings', core: true, widgets: ['settings'] },
];

const BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const FUNCTIONS = MODULES.flatMap((m) => (m.functions || []).map((f) => ({ ...f, id: `${m.id}.${f.id}`, module: m.id })));
const BY_FUNCTION = Object.fromEntries(FUNCTIONS.map((f) => [f.id, f]));
const KNOWN = new Set([...MODULES.map((m) => m.id), ...FUNCTIONS.map((f) => f.id)]);
const BY_WIDGET = Object.fromEntries([
  ...MODULES.flatMap((m) => (m.widgets || []).map((w) => [w, m.id])),
  ...FUNCTIONS.flatMap((f) => (f.widgets || []).map((w) => [w, f.id])),
]);

/** The functions of a module, as full ids (`tasks.board`), in registry order. */
export const functionsOf = (id) => FUNCTIONS.filter((f) => f.module === id).map((f) => f.id);

const offList = () => {
  const off = store.get('modules')?.data?.off;
  return Array.isArray(off) ? off : [];
};

/**
 * True when the module, or the function `module.function`, is switched on. A function is off when its
 * module is off. An id that is not known (More, an unknown route) counts as on.
 */
export const isOn = (id) => {
  const fn = BY_FUNCTION[id];
  if (fn) return isOn(fn.module) && !offList().includes(id);
  return !BY_ID[id] || BY_ID[id].core === true || !offList().includes(id);
};

/** True when the canvas widget's module is on. Takes a placed id (`bills:2` counts as `bills`). A widget with no module is always on. */
export const widgetOn = (id) => isOn(BY_WIDGET[String(id).split(':')[0]]);

/** True when the module that owns this reminder kind is on. */
export const reminderOn = (kind) => {
  const f = FUNCTIONS.find((x) => (x.remind || []).some((p) => kind.startsWith(p)));
  if (f) return isOn(f.id);
  const m = MODULES.find((x) => (x.remind || []).some((p) => kind.startsWith(p)));
  return !m || isOn(m.id);
};

/** The ids of the modules that are on, in registry order. */
export const enabled = () => MODULES.filter((m) => isOn(m.id)).map((m) => m.id);

/**
 * Switches a module, or one of its functions, on or off for every device, then recomputes its reminders.
 *
 * @param {string} id The module id or the function id (`tasks.board`).
 * @param {boolean} on True to switch it on.
 */
export async function setSwitch(id, on) {
  const m = BY_ID[id] || BY_ID[BY_FUNCTION[id]?.module];
  if (!m || m.core) throw new Error(`Module ${id} cannot be switched`);
  const off = new Set(offList());
  if (on) off.delete(id); else off.add(id);
  const order = [...KNOWN];
  await store.save('modules', 'modules', { off: order.filter((x) => off.has(x)) }, { silent: true });
  await store.resyncReminders(m.kinds || []);
}

store.setReminderGate(reminderOn);
