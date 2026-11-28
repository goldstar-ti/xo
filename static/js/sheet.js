// The phone's floating action button and its bottom sheet (pattern C, design handoff section 7).
//
//   fabSheet({ label, icon, tabs: [{ key, label, body: ({ close }) => node }] })
//
// Returns the FAB button. The button is also placed in document.body (one FAB at a time; a new call
// replaces the last), because #view can be mid-animation and a transformed parent breaks position: fixed.
// A screen that uses it exports `leave = dropFab` so the button goes when the screen does.
// The FAB is shown by CSS below 40rem only. The sheet is a modal dialog: Esc and the scrim close it,
// so does the Close button or dragging the handle down; focus moves in, and returns to the FAB.
import { t } from './text.js';
import { h, put } from './util.js';
import { icon, iconButton } from './icons.js';

const FAB = '.fab[data-fab]';

/** Removes the FAB (and any open sheet) from the page. Call it from a screen's `leave`. */
export function dropFab() {
  document.querySelector('dialog.fab-sheet')?.remove();
  document.querySelector(FAB)?.remove();
}

/**
 * Builds the FAB and its sheet.
 *
 * Args:
 *   label: the FAB's accessible name and the sheet's name (from YAML).
 *   icon: an icon value for the FAB (for example 'tabler/plus').
 *   tabs: the sheet's tabs; body({ close }) returns the node for the tab, built each time it is shown.
 *
 * Returns:
 *   The FAB button, already added to document.body.
 */
export function fabSheet({ label, icon: fabIcon = 'tabler/plus', tabs = [] } = {}) {
  dropFab();
  const fab = h('button', { type: 'button', class: 'fab', 'data-fab': '', 'aria-label': label, 'aria-haspopup': 'dialog', title: label }, icon(fabIcon));
  fab.addEventListener('click', () => openSheet({ label, tabs }));
  document.body.append(fab);
  return fab;
}

function openSheet({ label, tabs }) {
  if (document.querySelector('dialog.fab-sheet') || !tabs.length) return;
  let current = 0;
  const dlg = h('dialog', { class: 'fab-sheet', 'aria-label': label });
  const close = () => { if (dlg.open) dlg.close(); };
  const panel = h('div', { class: 'fab-body', role: 'tabpanel' });
  const buttons = tabs.map((tab, i) => h('button', {
    type: 'button', role: 'tab', class: 'fab-tab', id: `fab-tab-${tab.key}`, 'data-tab': tab.key,
    onclick: () => show(i),
    onkeydown: (ev) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
      if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); show(ev.key === 'Home' ? 0 : tabs.length - 1, true); }
      else if (step) { ev.preventDefault(); show((i + step + tabs.length) % tabs.length, true); }
    },
  }, tab.label));
  function show(i, focus = false) {
    current = i;
    buttons.forEach((b, n) => { b.setAttribute('aria-selected', String(n === i)); b.tabIndex = n === i ? 0 : -1; });
    panel.setAttribute('aria-labelledby', buttons[i].id);
    panel.replaceChildren();
    put(panel, tabs[i].body({ close }));
    if (focus) buttons[i].focus();
  }

  const grip = h('div', { class: 'fab-grip', 'aria-hidden': 'true' }, h('span', {}));
  let y0 = null;
  let dy = 0;
  grip.addEventListener('pointerdown', (ev) => { y0 = ev.clientY; dy = 0; grip.setPointerCapture(ev.pointerId); dlg.style.transition = 'none'; });
  grip.addEventListener('pointermove', (ev) => {
    if (y0 === null) return;
    dy = Math.max(0, ev.clientY - y0);
    dlg.style.transform = `translateY(${dy}px)`;
  });
  const release = () => {
    if (y0 === null) return;
    y0 = null;
    dlg.style.transition = '';
    if (dy > 80) close(); else dlg.style.transform = '';
  };
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);

  put(dlg, h('div', { class: 'fab-sheet-in' },
    grip,
    h('div', { class: 'fab-head' },
      h('div', { class: 'fab-tabs', role: 'tablist', 'aria-label': t('common.sheet.tabs') }, buttons),
      iconButton('tabler/x', t('common.close'), { class: 'fab-close', onclick: close })),
    panel));
  // A tap on the scrim lands on the dialog element itself, since the content fills the dialog.
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) close(); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    // A form opened from the sheet already holds focus; otherwise it goes back to the button.
    if (!document.querySelector('dialog:modal')) document.querySelector(FAB)?.focus();
  });
  document.body.append(dlg);
  show(0);
  dlg.showModal();
  buttons[current].focus();
}
