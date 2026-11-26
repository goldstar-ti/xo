// The Bridge screen: the widget board. board.js does the work; this module is the screen
// the router knows about. It redraws its own widgets when entries change (refresh), so the
// router never rebuilds the whole grid for a tick or a saved form.
import { renderBridge, startScreen } from '../board.js';
import { h } from '../util.js';

export const live = false;
export { startScreen };

export function render(root) {
  const wrap = h('div', { class: 'bridge-view' });
  root.append(wrap);
  renderBridge(wrap, { fresh: true });
}
