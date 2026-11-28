// The widget registry: every widget a canvas can hold, in the order the Add widget list shows them.
// The canvas (static/js/canvas.js), its Add widget list and the tests all read this one list.
// Adding a widget is one entry here plus its title under `canvas.widgets` in content/text/canvas.yaml.
//
// An entry:
//   id:     key of WIDGETS, matching ^[a-z0-9-]{1,40}$
//   title:  text key of the widget's title ('canvas.widgets.<id>')
//   w, h:   default size in grid cells (24 columns; a row is 28px)
//   render: (body, ctx) => optional cleanup function. body is the empty widget body to fill. Called each
//           time the widget is placed or the canvas is redrawn. ctx is
//             { id, type, canvasId, opts, state, redraw }
//           id is the placed id (`bills`, or `bills:2` for a second copy), type the registry id, opts the
//           widget's options with defaults filled in (plus `title` when it has been renamed), state a plain
//           object kept in memory for this placed widget while the canvas is open, and redraw() draws it again.
//   opts:   optional [{ k, type: 'bool' | 'choice', def, values, label }]. The title bar's Options tool shows a
//           Name field and one control per option. label is a text key; it defaults to
//           'canvas.opts.<id>.<k>', and a choice value is labelled 'canvas.opts.<id>.<k>_<value>'.
//   group:  optional string key; the Widgets popover groups rows under the heading 'canvas.groups.<group>'.
//   tools:  optional (ctx) => [{ key, ico, label, run }]: extra title bar buttons (label already translated).
//   tick:   optional 'minute' | 'second', a hint for liveWidget (the widget passes it there itself).
//
// A widget can be placed more than once. A copy's placed id is `<type>:<n>` (n from 2); always use typeOf(id)
// to reach the registry entry for a placed id.
//
// Every screen is a widget (viewWidget): the screen draws into the widget body exactly as it
// draws into the page, and a live screen redraws when the store changes, as app.js does for the page.
import * as store from './store.js';
import { dialogOpen } from './util.js';
import * as todayView from './views/today.js';
import * as checkinView from './views/checkin.js';
import * as planView from './views/plan.js';
import * as settingsView from './views/settings.js';
import * as appearanceView from './views/appearance.js';
import { bills, diary, obligations, routine } from './views/lists.js';
import * as tasksView from './views/tasks.js';
import * as trackerView from './views/tracker.js';
import * as notesView from './views/notes.js';
import * as trackerWidgets from './tracker/widgets.js';
import { BRIDGE_WIDGETS } from './bridgewidgets.js';

export const WIDGETS = {};

// Adds or replaces a widget definition. Used below, by tests and by screens that bring their own widgets.
export function registerWidget(id, def) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error(`Widget id ${id} is not valid`);
  WIDGETS[id] = { w: 8, h: 8, ...def, id };
  return WIDGETS[id];
}

/** The registry id of a placed id: `bills:2` is `bills`. */
export const typeOf = (id) => String(id).split(':')[0];

/**
 * The options a stored widget may carry: known keys with valid values only, plus `title` (trimmed, at most 60
 * characters) when it is not empty. Unknown types keep only the title. Missing options are left out; use
 * optsFor() for the values with defaults filled in.
 *
 * @param {string} type The registry id.
 * @param {object} raw Whatever was stored or typed.
 * @returns {object} A new object.
 */
export function cleanOpts(type, raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 60) : '';
  if (title) out.title = title;
  for (const o of WIDGETS[type]?.opts || []) {
    if (!(o.k in raw)) continue;
    if (o.type === 'bool') { if (typeof raw[o.k] === 'boolean') out[o.k] = raw[o.k]; }
    else if (typeof raw[o.k] === 'string' && (o.values || []).includes(raw[o.k])) out[o.k] = raw[o.k];
  }
  return out;
}

/** cleanOpts() with every option's default filled in: what a widget reads as ctx.opts. */
export function optsFor(type, raw) {
  const out = {};
  for (const o of WIDGETS[type]?.opts || []) out[o.k] = o.def;
  return { ...out, ...cleanOpts(type, raw) };
}

const dayKey = () => new Date().toDateString();
const typingIn = (root) => {
  const a = document.activeElement;
  return !!a && root.contains(a) && !!a.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
};

/**
 * Keeps a widget drawn. Calls draw() once now, then again when the store changes, on a minute or second timer
 * (tick), and when the day changes. A redraw waits while a dialog or form popover is open, or (with root) while
 * the keyboard focus is in a field inside root, and runs when that ends. With root, nothing redraws while root
 * is off screen or the tab is hidden; it catches up when it is seen again.
 *
 * @param {Function} draw Redraws the widget. Takes no arguments.
 * @param {object} [options] { tick: 'minute' | 'second' | null, root: the widget body, for the guards above }.
 * @returns {Function} Cleanup: call it when the widget goes. Returning it from render() does that.
 */
export function liveWidget(draw, { tick = null, root = null } = {}) {
  let pending = false;
  let visible = true;
  let day = dayKey();
  const hidden = () => document.visibilityState !== 'visible' || !visible;
  const go = () => {
    if (root && !root.isConnected) return;
    if (dialogOpen() || hidden() || (root && typingIn(root))) { pending = true; return; }
    pending = false;
    draw();
  };
  const flush = () => { if (pending) go(); };
  draw();
  const off = store.onChange(go);
  const timer = setInterval(() => {
    const today = dayKey();
    if (today !== day) { day = today; go(); } else if (tick) go();
  }, tick === 'second' ? 1000 : 60000);
  const io = root && typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; flush(); })
    : null;
  io?.observe(root);
  document.addEventListener('close', flush, true);
  document.addEventListener('visibilitychange', flush);
  root?.addEventListener('focusout', flush);
  return () => {
    off();
    clearInterval(timer);
    io?.disconnect();
    document.removeEventListener('close', flush, true);
    document.removeEventListener('visibilitychange', flush);
    root?.removeEventListener('focusout', flush);
  };
}

// A render function that shows a screen (a module with render(root, ...params) and live) in a widget.
// A live screen redraws when the store changes, waiting while a dialog is open; Today also redraws
// each minute so its clock moves. The body keeps its scroll position across a redraw.
export function viewWidget(view, ...params) {
  return (body, ctx) => {
    // The Show heading option hides the screen's own page heading (the widget title bar already names it).
    body.classList.toggle('xo-hide-head', ctx?.opts?.heading === false);
    const draw = () => {
      const y = body.scrollTop;
      body.replaceChildren();
      view.render(body, ...params);
      body.scrollTop = y;
    };
    draw();
    if (!view.live) return null;
    let pending = false;
    const off = store.onChange(() => { if (dialogOpen()) pending = true; else draw(); });
    const onClose = () => { if (pending && !dialogOpen()) { pending = false; draw(); } };
    document.addEventListener('close', onClose, true);
    const clock = view === todayView
      ? setInterval(() => { if (!dialogOpen() && document.visibilityState === 'visible') draw(); }, 60000)
      : 0;
    return () => {
      off();
      document.removeEventListener('close', onClose, true);
      clearInterval(clock);
    };
  };
}

// [id, screen, params, w, h]: every screen in the app, in the sidebar's order, then the check-ins one by one.
const SCREENS = [
  ['today', todayView, [], 12, 24],
  ['diary', diary, [], 8, 16],
  ['tasks', tasksView, [], 8, 16],
  ['tasks-board', tasksView, ['board'], 16, 16],
  ['tasks-table', tasksView, ['table'], 16, 16],
  ['obligations', obligations, [], 8, 16],
  ['routine', routine, [], 8, 16],
  ['bills', bills, [], 8, 16],
  ['checkin', checkinView, [], 8, 16],
  ['checkin-morning', checkinView, ['morning'], 10, 22],
  ['checkin-evening', checkinView, ['evening'], 10, 22],
  ['checkin-weekly', checkinView, ['weekly'], 10, 22],
  ['plan', planView, [], 12, 24],
  ['settings', settingsView, [], 12, 20],
  ['appearance', appearanceView, [], 12, 24],
];
for (const [id, view, params, w, h] of SCREENS) {
  registerWidget(id, {
    title: `canvas.widgets.${id}`,
    w,
    h,
    opts: [{ k: 'heading', type: 'bool', def: true, label: 'canvas.opts.heading' }],
    render: viewWidget(view, ...params),
  });
}

// The Tracker screen as a widget (it redraws itself), then the tracker's own widgets.
registerWidget('tracker', {
  title: 'canvas.widgets.tracker',
  w: 16,
  h: 28,
  render: (body) => trackerView.mount(body, null, { embedded: true }),
});
registerWidget('notes', {
  title: 'canvas.widgets.notes',
  w: 16,
  h: 24,
  render: (body) => notesView.mount(body, null, { embedded: true }).stop,
});
registerWidget('tracker-due', { title: 'canvas.widgets.tracker-due', w: 8, h: 12, render: trackerWidgets.due });
registerWidget('tracker-summary', { title: 'canvas.widgets.tracker-summary', w: 8, h: 10, render: trackerWidgets.summary });
registerWidget('tracker-board', { title: 'canvas.widgets.tracker-board', w: 16, h: 20, render: trackerWidgets.board });

// The content widgets from the Bridge (static/js/bridgewidgets.js): each draws from a screen's own part and stays live.
// The body gets the cw-body class (their styles) and is drawn again on a store change, a timer and a new day.
for (const [id, def] of BRIDGE_WIDGETS) {
  const { draw, tick, ...rest } = def;
  registerWidget(id, {
    ...rest,
    title: `canvas.widgets.${id}`,
    tick,
    render: (body, ctx) => {
      body.classList.add('cw-body');
      const every = tick === 'second' && !ctx.opts.seconds ? 'minute' : tick || null;
      return liveWidget(() => {
        body.replaceChildren();
        draw(body, ctx.opts, ctx);
      }, { tick: every, root: body });
    },
  });
}
