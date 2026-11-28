// The module registry and the one gate: is a module (or one of its functions) switched on?
//
// A module is a screen with its own items, reminders and canvas widgets. Its id is its route key
// (`#/tasks`), so the nav, the palette and the shortcuts need no second list. State is one item,
// kind `modules` id `modules`, payload `{ off: [ids] }`, so a switch applies on every device.
// A module that is off is hidden everywhere and stops its reminders; its data stays, and switching
// it on again brings everything back (D-36). Core modules cannot be switched off.
//
// An entry:
//   id:      the route key, matching VIEWS in app.js
//   core:    true for modules that cannot be switched off
//   kinds:   item kinds whose reminders are recomputed when the module is switched
//   remind:  reminder kind prefixes that belong to the module (see REMINDERS in store.js)
//   widgets: canvas widget ids the module owns (static/js/widgets.js)
import * as store from './store.js';

export const MODULES = [
  { id: 'today', widgets: ['today'] },
  { id: 'diary', kinds: ['appointment'], remind: ['appt_'], widgets: ['diary'] },
  { id: 'tasks', kinds: ['task'], remind: ['task_'], widgets: ['tasks', 'tasks-board', 'tasks-table'] },
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
const BY_WIDGET = Object.fromEntries(MODULES.flatMap((m) => (m.widgets || []).map((w) => [w, m.id])));

const offList = () => {
  const off = store.get('modules')?.data?.off;
  return Array.isArray(off) ? off : [];
};

/** True when the module is switched on. An id that is not a module (More, an unknown route) counts as on. */
export const isOn = (id) => !BY_ID[id] || BY_ID[id].core === true || !offList().includes(id);

/** True when the canvas widget's module is on. A widget with no module is always on. */
export const widgetOn = (id) => isOn(BY_WIDGET[id]);

/** True when the module that owns this reminder kind is on. */
export const reminderOn = (kind) => {
  const m = MODULES.find((x) => (x.remind || []).some((p) => kind.startsWith(p)));
  return !m || isOn(m.id);
};

/** The ids of the modules that are on, in registry order. */
export const enabled = () => MODULES.filter((m) => isOn(m.id)).map((m) => m.id);

/**
 * Switches a module on or off for every device, then recomputes its reminders.
 *
 * @param {string} id The module id.
 * @param {boolean} on True to switch it on.
 */
export async function setModule(id, on) {
  const m = BY_ID[id];
  if (!m || m.core) throw new Error(`Module ${id} cannot be switched`);
  const off = new Set(offList());
  if (on) off.delete(id); else off.add(id);
  await store.save('modules', 'modules', { off: MODULES.filter((x) => off.has(x.id)).map((x) => x.id) }, { silent: true });
  await store.resyncReminders(m.kinds || []);
}

store.setReminderGate(reminderOn);
