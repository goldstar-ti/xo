// Tabs, in two layers.
//
// tabStrip(): a row of tabs only (ARIA tablist). The caller owns the state and redraws it with
// set(). The canvas uses it to switch canvases.
//
// tabSet(): a strip plus one panel per tab, for a pane of open things (the model for NOBBIE's
// record pane). Each tab's content is built once, when it is first shown, and kept while the tab
// stays open, so a half-typed field survives a switch. The caller saves keys() and active()
// through onChange if the open tabs should come back after a reload.
//
// Keyboard: Left and Right move between tabs and show the one reached, Home and End go to the
// ends, Delete closes a closable tab. Tab and close buttons are plain buttons styled in
// static/canvas.css: they are part of the strip's look, not form controls, so ui.js and the
// Kit choice leave them alone.
import { t } from './text.js';
import { h } from './util.js';

let seq = 0;

// The strip's styles live in static/canvas.css; any screen with tabs loads it once.
function styles() {
  if (document.querySelector('link[data-canvas-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/canvas.css';
  link.setAttribute('data-canvas-styles', '');
  document.head.append(link);
}

// items: [{ key, label, closable, controls }] (controls: id of that tab's own panel). active: the selected key.
// onSelect(key), onClose(key): called on a click or key press; the caller updates and calls set().
// label: the strip's accessible name. panelId: id of the panel the tabs control, if one.
export function tabStrip({ items = [], active = null, label, onSelect, onClose, panelId } = {}) {
  styles();
  const base = `xt${++seq}`;
  const list = h('div', { class: 'xo-tablist', role: 'tablist', 'aria-label': label });
  const el = h('div', { class: 'xo-tabs' }, list);
  let current = { items, active };

  const tabId = (key) => `${base}-${key}`.replace(/[^A-Za-z0-9_-]/g, '_');
  const focusKey = (key) => list.querySelector(`#${CSS.escape(tabId(key))}`)?.focus();

  function draw() {
    const hadFocus = list.contains(document.activeElement);
    list.replaceChildren(...current.items.map((item) => {
      const on = item.key === current.active;
      const tab = h('button', {
        type: 'button',
        role: 'tab',
        class: 'xo-tab-btn',
        id: tabId(item.key),
        'data-key': item.key,
        'data-tid': item.key,
        'aria-selected': on ? 'true' : 'false',
        'aria-controls': item.controls ?? panelId,
        tabindex: on ? '0' : '-1',
        onclick: () => onSelect?.(item.key),
      }, item.label);
      const close = item.closable && onClose
        ? h('button', {
          type: 'button',
          class: 'xo-tab-x',
          tabindex: '-1',
          'aria-label': t('canvas.tab_close', { name: item.label }),
          title: t('canvas.tab_close', { name: item.label }),
          onclick: () => onClose(item.key),
        }, '×')
        : null;
      return h('span', { class: on ? 'xo-tab on' : 'xo-tab' }, tab, close);
    }));
    if (hadFocus && current.active != null) focusKey(current.active);
  }

  list.addEventListener('keydown', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    const keys = current.items.map((i) => i.key);
    const at = keys.indexOf(tab.dataset.key);
    let next = null;
    if (e.key === 'ArrowRight') next = keys[(at + 1) % keys.length];
    else if (e.key === 'ArrowLeft') next = keys[(at - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    else if (e.key === 'Delete') {
      const item = current.items[at];
      if (item?.closable && onClose) { e.preventDefault(); onClose(item.key); }
      return;
    } else return;
    e.preventDefault();
    onSelect?.(next);
    focusKey(next);
  });

  draw();
  return {
    el,
    set(items2, active2) { current = { items: items2, active: active2 }; draw(); },
  };
}

// A strip with panels. render(body, key) fills a tab's panel the first time it is shown and may
// return a cleanup function, called when the tab closes.
// onChange({ keys, active }): after any open, close or switch.
export function tabSet(root, { label, closable = true, onChange } = {}) {
  const tabs = new Map(); // key -> { label, render, panel, built, cleanup }
  let active = null;
  const base = `xp${++seq}`;
  const panelId = (key) => `${base}-${key}`.replace(/[^A-Za-z0-9_-]/g, '_');
  const panels = h('div', { class: 'xo-tabpanels' });
  const strip = tabStrip({
    label,
    onSelect: (key) => select(key),
    onClose: (key) => close(key),
  });
  const empty = h('p', { class: 'xo-tabs-empty empty' }, t('canvas.tabs_empty'));
  root.replaceChildren(strip.el, panels, empty);

  function redraw() {
    strip.set([...tabs].map(([key, tab]) => ({ key, label: tab.label, closable, controls: panelId(key) })), active);
    for (const [key, tab] of tabs) {
      const on = key === active;
      tab.panel.hidden = !on;
      if (on && !tab.built) {
        tab.built = true;
        const done = tab.render?.(tab.panel, key);
        if (typeof done === 'function') tab.cleanup = done;
      }
    }
    empty.hidden = tabs.size > 0;
    onChange?.({ keys: [...tabs.keys()], active });
  }

  function open(key, tabLabel, render) {
    if (!tabs.has(key)) {
      const panel = h('div', { class: 'xo-tabpanel', role: 'tabpanel', id: panelId(key), 'data-key': key, tabindex: '0' });
      panels.append(panel);
      tabs.set(key, { label: tabLabel, render, panel, built: false, cleanup: null });
    } else if (tabLabel) {
      tabs.get(key).label = tabLabel;
    }
    active = key;
    redraw();
    const tabEl = strip.el.querySelector(`[data-key="${CSS.escape(key)}"][role="tab"]`);
    if (tabEl) tabs.get(key).panel.setAttribute('aria-labelledby', tabEl.id);
    return tabs.get(key).panel;
  }

  function select(key) {
    if (!tabs.has(key) || key === active) return;
    active = key;
    redraw();
  }

  function close(key) {
    const tab = tabs.get(key);
    if (!tab) return;
    const keys = [...tabs.keys()];
    const at = keys.indexOf(key);
    tab.cleanup?.();
    tab.panel.remove();
    tabs.delete(key);
    if (active === key) active = keys[at + 1] ?? keys[at - 1] ?? null;
    redraw();
  }

  redraw();
  return {
    open,
    close,
    select,
    keys: () => [...tabs.keys()],
    active: () => active,
    has: (key) => tabs.has(key),
  };
}
