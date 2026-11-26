// The Canvas screen: canvas tabs, the widget board and the side pane (static/js/canvas.js).
// Not live: the widgets redraw themselves when the store changes. leave() is called by app.js
// before another screen draws, so the canvas saves and lets go of its widgets.
import { mountCanvas } from '../canvas.js';
import { t } from '../text.js';
import { h } from '../util.js';

export const live = false;

let mounted = null; // { canvas } once mounted, or a pending mount
let visit = 0;

export function render(root) {
  const mine = ++visit;
  root.append(h('p', { class: 'loading' }, t('common.working')));
  mountCanvas(root).then((canvas) => {
    // The screen was left (or drawn again) while GridStack loaded.
    if (mine !== visit) { canvas.destroy(); return; }
    mounted = canvas;
  }).catch((err) => {
    console.error('canvas failed', err);
    root.replaceChildren(h('p', { class: 'empty' }, t('canvas.failed')));
  });
}

export function leave() {
  visit++;
  mounted?.destroy();
  mounted = null;
}
