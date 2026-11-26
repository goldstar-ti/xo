// The widget registry: every widget a canvas can hold, in the order the Add widget list shows them.
// The canvas (static/js/canvas.js), its Add widget list and the tests all read this one list.
// Adding a widget is one entry here plus its text keys in content/text/canvas.yaml.
//
// An entry:
//   id:     key of WIDGETS, matching ^[a-z0-9-]{1,40}$
//   title:  text key of the widget's title ('canvas.widgets.<id>')
//   w, h:   default size in grid cells (12 columns; a row is 3.5rem)
//   render: (body, ctx) => optional cleanup function. body is the empty widget body to fill;
//           ctx is { id, canvasId }. Called each time the widget is placed or the canvas is redrawn.
//
// No widgets are registered yet: the canvas is built but not on any screen (decision D-9).

export const WIDGETS = {};

// Adds or replaces a widget definition. Used by tests and, later, by screens that bring their own widgets.
export function registerWidget(id, def) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error(`Widget id ${id} is not valid`);
  WIDGETS[id] = { w: 4, h: 4, ...def, id };
  return WIDGETS[id];
}
