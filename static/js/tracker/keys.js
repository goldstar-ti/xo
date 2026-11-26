// Tracker keys, after NOBBIE's. Active on the Tracker screen while the focus is not in a field
// and no dialog is open. KEYS is the one list: the handler reads `action`, the Keys dialog reads
// the text keys under tracker.keys.
import * as M from './model.js';
import { t } from '../text.js';
import { dialogOpen, h, openDialog } from '../util.js';

export const KEYS = [
  { key: 'n', action: 'new' },
  { key: 'j', action: 'next' },
  { key: 'k', action: 'prev' },
  { key: 'Enter', action: 'open' },
  { key: 'Escape', action: 'back' },
  { key: 'e', action: 'edit' },
  { key: 'm', action: 'comment' },
  { key: 'c', action: 'check' },
  { key: 'x', action: 'select' },
  { key: 'S', action: 'field:status' },
  { key: 'P', action: 'field:priority' },
  { key: 'K', action: 'field:kind' },
  { key: 'A', action: 'field:area' },
  { key: 'O', action: 'field:owner' },
  { key: 'D', action: 'close' },
  { key: 'h', action: 'tab-prev' },
  { key: 'l', action: 'tab-next' },
  { key: '/', action: 'search' },
  { key: '?', action: 'help' },
];

const label = (k) => ({ Enter: 'Enter', Escape: 'Esc' }[k.key] || (k.key.length === 1 && k.key !== k.key.toLowerCase() ? `Shift+${k.key.toLowerCase()}` : k.key));

function showHelp() {
  openDialog(t('tracker.keys.title'), h('table', { class: 'tw:text-sm' }, h('tbody', {}, KEYS.map((k) => h('tr', {},
    h('td', { class: 'tw:p-1 tw:pr-4' }, h('kbd', { class: 'tw:font-figures tw:font-semibold' }, label(k))),
    h('td', { class: 'tw:p-1' }, t(`tracker.keys.${k.action.replace(':', '_')}`)))))));
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
    if (e.ctrlKey || e.metaKey || e.altKey || dialogOpen() || !wrap.isConnected) return;
    if (e.target.closest?.('input, textarea, select, button[role="tab"], wa-input, wa-textarea, wa-select, [contenteditable]') && e.key !== 'Escape') return;
    if (e.key === 'Escape' && e.target.closest?.('input, textarea')) return;
    const k = KEYS.find((x) => x.key === e.key);
    if (!k) return;
    if (k.action.startsWith('field:')) {
      if (!ui.selected) return;
      e.preventDefault();
      focusIn(`[data-field="${k.action.slice(6)}"]`);
      return;
    }
    e.preventDefault();
    run[k.action]?.();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
