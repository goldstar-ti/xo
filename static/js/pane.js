// The right split pane on desktop: a strip of tabs beside the main screen. Settings,
// Appearance, check-ins, the Look panel and the plan card open here instead of taking
// over the screen or a dialog. Phones (and narrow windows) keep dialogs and screens.
// The pane's width is kept on this device (localStorage xo-pane), like the look.
import { t } from './text.js';
import { focusControl } from './ui.js';
import { icon } from './icons.js';
import { h } from './util.js';

const WIDE = window.matchMedia('(min-width: 60rem)');
const MAX_TABS = 12;
const KEY = 'xo-pane';

let pane = null;
let strip = null;
let bodies = null;
const tabs = []; // { key, title, body, kind: 'page' | 'form', redraw?, events }
let active = null;

const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const store = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...saved(), ...v })); } catch { /* storage off: width is not kept */ } };

// True when the pane is in use: a wide window and the shell has drawn the pane.
// A device that sets { off: true } in xo-pane keeps full screens and dialogs (the older browser tests use this).
export const paneOn = () => WIDE.matches && !!pane?.isConnected && !saved().off;

// The pane element for the shell to place. Built once and reused when the shell redraws.
export function paneElement() {
  if (pane) return pane;
  strip = h('div', { class: 'pane-tabs', role: 'tablist', 'aria-label': t('pane.label') });
  bodies = h('div', { class: 'pane-bodies' });
  const grip = h('div', { class: 'pane-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': t('pane.resize'), tabindex: '0' });
  pane = h('aside', { class: 'pane', hidden: true, 'aria-label': t('pane.label') }, grip, strip, bodies);
  const w = Number(saved().width);
  if (w >= 18 && w <= 90) pane.style.setProperty('--pane-w', `${w}rem`);
  dragToResize(grip);
  pane.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !active || active.kind !== 'form') return;
    e.preventDefault();
    closeTab(active);
  });
  return pane;
}

function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }

// Pointer positions and rectangles are in screen pixels; the page is zoomed by --zoom (the Zoom dial), so lengths divide by it.
const zoom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1;

function dragToResize(grip) {
  const setWidth = (r) => {
    const v = Math.min(90, Math.max(18, r));
    pane.style.setProperty('--pane-w', `${v.toFixed(2)}rem`);
    return v;
  };
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = pane.getBoundingClientRect().width / zoom() / rem();
    const z = zoom();
    let last = startW;
    const move = (ev) => { last = setWidth(startW + (startX - ev.clientX) / z / rem()); };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      store({ width: last });
      window.dispatchEvent(new Event('resize'));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const now = pane.getBoundingClientRect().width / zoom() / rem();
    store({ width: setWidth(now + (e.key === 'ArrowLeft' ? 2 : -2)) });
    window.dispatchEvent(new Event('resize'));
  });
}

function show(tab) {
  active = tab;
  for (const x of tabs) {
    const on = x === tab;
    x.button.setAttribute('aria-selected', String(on));
    x.button.tabIndex = on ? 0 : -1;
    x.body.hidden = !on;
  }
  pane.hidden = tabs.length === 0;
  document.documentElement.toggleAttribute('data-pane', tabs.length > 0);
}

export function closeTab(tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  tab.wrap.remove();
  tab.body.remove();
  tab.events.dispatchEvent(new Event('close'));
  if (active === tab) {
    const next = tabs[Math.min(i, tabs.length - 1)];
    if (next) { show(next); next.button.focus(); } else { active = null; show(null); }
  }
  window.dispatchEvent(new Event('resize'));
}

/**
 * Opens (or brings forward) a tab.
 * key: a tab with the same key is reused and redrawn. title: the tab label.
 * fill(body): draws the tab's content; called again by redraw().
 * kind: 'page' for a screen (Settings, Appearance, a check-in), 'form' for an add/edit form.
 * Returns a handle with close(), redraw() and addEventListener('close', fn), so callers can treat it like a dialog.
 */
export function openTab({ key, title, fill, kind = 'form' }) {
  let tab = key && tabs.find((x) => x.key === key);
  if (!tab) {
    const events = new EventTarget();
    const body = h('div', { class: 'pane-body', role: 'tabpanel' });
    const label = h('span', { class: 'pane-tab-label' }, title);
    const button = h('button', { class: 'pane-tab', type: 'button', role: 'tab' }, label);
    const close = h('button', { class: 'pane-tab-close', type: 'button', 'aria-label': t('pane.close_tab', { title }), title: t('pane.close_tab', { title }) }, icon('tabler/x'));
    tab = { key: key || `form-${Math.random().toString(36).slice(2)}`, title, kind, body, button, label, events };
    button.addEventListener('click', () => show(tab));
    button.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        show(next); next.button.focus(); e.preventDefault();
      } else if (e.key === 'Delete') { closeTab(tab); e.preventDefault(); }
    });
    close.addEventListener('click', () => closeTab(tab));
    tab.close = () => closeTab(tab);
    tab.addEventListener = (type, fn) => events.addEventListener(type, fn);
    tab.removeEventListener = (type, fn) => events.removeEventListener(type, fn);
    tab.wrap = h('div', { class: 'pane-tab-wrap' }, button, close);
    strip.append(tab.wrap);
    tab.button = button;
    bodies.append(body);
    tabs.push(tab);
    while (tabs.length > MAX_TABS) closeTab(tabs.find((x) => x.kind === 'form' && x !== tab) || tabs[0]);
  }
  tab.fill = fill;
  tab.redraw = () => {
    const y = tab.body.scrollTop;
    const focusKey = tab.body.contains(document.activeElement) && document.activeElement?.dataset?.fk;
    tab.body.replaceChildren();
    tab.fill(tab.body);
    tab.body.scrollTop = y;
    const el = focusKey && tab.body.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (el) focusControl(el).catch(() => {});
  };
  tab.label.textContent = title;
  tab.title = title;
  tab.redraw();
  show(tab);
  window.dispatchEvent(new Event('resize'));
  return tab;
}

// Redraws every page tab (after a look change or new data), leaving forms alone so typing is never lost.
export function redrawPages(filter = () => true) {
  for (const x of tabs) if (x.kind === 'page' && filter(x)) x.redraw();
}

export const openTabs = () => tabs.slice();

// A narrow window has no pane: close it and leave the tabs for when the window widens again.
WIDE.addEventListener('change', () => { if (pane) pane.hidden = !WIDE.matches || tabs.length === 0; });

// Closes the tab that holds el. Returns false when el is not in the pane (a full screen), so the
// caller can do what it does on a phone instead.
export function closeTabOf(el) {
  const tab = tabs.find((x) => x.body.contains(el));
  if (!tab) return false;
  closeTab(tab);
  return true;
}
