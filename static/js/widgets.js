// The widget registry: every widget a canvas can hold, in the order the Add widget list shows them.
// The canvas (static/js/canvas.js), its Add widget list and the tests all read this one list.
// Adding a widget is one entry here plus its title under `canvas.widgets` in content/text/canvas.yaml.
//
// An entry:
//   id:     key of WIDGETS, matching ^[a-z0-9-]{1,40}$
//   title:  text key of the widget's title ('canvas.widgets.<id>')
//   w, h:   default size in grid cells (24 columns; a row is 28px)
//   render: (body, ctx) => optional cleanup function. body is the empty widget body to fill;
//           ctx is { id, canvasId }. Called each time the widget is placed or the canvas is redrawn.
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
import * as trackerWidgets from './tracker/widgets.js';

export const WIDGETS = {};

// Adds or replaces a widget definition. Used below, by tests and by screens that bring their own widgets.
export function registerWidget(id, def) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error(`Widget id ${id} is not valid`);
  WIDGETS[id] = { w: 8, h: 8, ...def, id };
  return WIDGETS[id];
}

// A render function that shows a screen (a module with render(root, ...params) and live) in a widget.
// A live screen redraws when the store changes, waiting while a dialog is open; Today also redraws
// each minute so its clock moves. The body keeps its scroll position across a redraw.
export function viewWidget(view, ...params) {
  return (body) => {
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
  registerWidget(id, { title: `canvas.widgets.${id}`, w, h, render: viewWidget(view, ...params) });
}

// The Tracker screen as a widget (it redraws itself), then the tracker's own widgets.
registerWidget('tracker', {
  title: 'canvas.widgets.tracker',
  w: 16,
  h: 28,
  render: (body) => trackerView.mount(body, null, { embedded: true }),
});
registerWidget('tracker-due', { title: 'canvas.widgets.tracker-due', w: 8, h: 12, render: trackerWidgets.due });
registerWidget('tracker-summary', { title: 'canvas.widgets.tracker-summary', w: 8, h: 10, render: trackerWidgets.summary });
registerWidget('tracker-board', { title: 'canvas.widgets.tracker-board', w: 16, h: 20, render: trackerWidgets.board });
