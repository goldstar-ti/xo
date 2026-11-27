// Tracker keys, after NOBBIE's. Active on the Tracker screen while the focus is not in a field
// and no dialog is open. The keys are the `tracker` scope in keymap.js; the Keys dialog reads them from there.
import * as M from './model.js';
import { actionLabel, actions, keyFor, keyLabel, matchKey, setScope } from '../keymap.js';
import { t } from '../text.js';
import { h, openDialog } from '../util.js';

function showHelp() {
  const rows = actions().filter((a) => a.scope === 'tracker' && keyFor(a.id));
  openDialog(t('tracker.keys.title'), h('table', { class: 'tw:text-sm' }, h('tbody', {}, rows.map((a) => h('tr', {},
    h('td', { class: 'tw:p-1 tw:pr-4' }, h('kbd', { class: 'tw:font-figures tw:font-semibold' }, keyLabel(keyFor(a.id)))),
    h('td', { class: 'tw:p-1' }, actionLabel(a.id)))))));
}

// Installs the keys; returns the function that removes them.
export function installKeys(ctx, wrap) {
  const { ui } = ctx;
  const tabsOrder = ['list', 'board', 'needs-test', 'handover', 'pivot', 'history', 'activity'];
  const step = (d) => {
    const order = ui.order || [];
    if (!order.length) return;
    const at = order.indexOf(ui.selected);
    const next = order[Math.max(0, Math.min(order.length - 1, at < 0 ? 0 : at + d))];
    ctx.select(next);
    wrap.querySelector(`[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const focusIn = (sel) => { const el = ctx.detailEl.querySelector(sel); el?.focus(); return !!el; };
  const run = {
    new: () => ctx.newItem(),
    next: () => step(1),
    prev: () => step(-1),
    open: () => { if (!ui.selected && ui.order?.length) ctx.select(ui.order[0]); },
    back: () => ui.selected && ctx.select(null),
    edit: () => focusIn('[data-focus="title"]'),
    comment: () => focusIn('[data-focus="comment"]'),
    check: () => focusIn('[data-focus="check"]'),
    select: () => {
      if (!ui.selected) return;
      if (ui.checked.has(ui.selected)) ui.checked.delete(ui.selected); else ui.checked.add(ui.selected);
      ctx.redraw();
    },
    close: () => ui.selected && M.closeItem(ui.selected),
    'tab-prev': () => ctx.setTab(tabsOrder[(tabsOrder.indexOf(ui.tab) + tabsOrder.length - 1) % tabsOrder.length]),
    'tab-next': () => ctx.setTab(tabsOrder[(tabsOrder.indexOf(ui.tab) + 1) % tabsOrder.length]),
    search: () => { if (ui.tab !== 'list') ctx.setTab('list'); ctx.focusSearch(); },
    help: showHelp,
  };
  const onKey = (e) => {
    if (!wrap.isConnected) return;
    const id = matchKey('tracker', e);
    if (!id) return;
    if (e.target.closest?.('button[role="tab"]') && id !== 'tracker.back') return;
    const action = id.slice('tracker.'.length).replace(/^field_/, 'field:').replace(/^tab_/, 'tab-');
    if (action.startsWith('field:')) {
      if (!ui.selected) return;
      e.preventDefault();
      focusIn(`[data-field="${action.slice(6)}"]`);
      return;
    }
    e.preventDefault();
    run[action]?.();
  };
  setScope('tracker', true);
  document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('keydown', onKey); setScope('tracker', false); };
}
