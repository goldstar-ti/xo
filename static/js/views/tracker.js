// The Tracker screen: projects and their items, after NOBBIE's tracker, with due dates, checklists
// and each project's own pick lists. #/tracker opens the last project and tab; #/tracker/XO-12
// opens that item.
//
// Layout: a page head (New item, New project, Project settings), a row of project tabs (All
// projects first), a row of view tabs (List, Board, Needs test, Handover, Pivot, History, Activity),
// then the view beside the open item's details on a wide screen, or instead of them on a phone.
// The project, view, list filters and sort are kept per device in localStorage `xo-tracker`.
//
// Not live: the screen redraws itself when the store changes (waiting while a dialog is open) and
// puts the focus, typed text and caret back in the field that had them.
//
// NOBBIE's tracker shows as one more project, read-only, when the server is set up for it
// (tracker/nobbie.js, app/nobbie.py).
import * as store from '../store.js';
import * as M from '../tracker/model.js';
import { renderBoard } from '../tracker/board.js';
import { renderDetail } from '../tracker/detail.js';
import { installKeys } from '../tracker/keys.js';
import { renderList } from '../tracker/list.js';
import { loadNobbie, nobbieState, NOBBIE_ID, onNobbie } from '../tracker/nobbie.js';
import { editProject, newItem, newProject } from '../tracker/projects.js';
import { renderActivity, renderHandover, renderHistory, renderNeedsTest, renderPivot } from '../tracker/reports.js';
import { tabStrip } from '../tabs.js';
import { t } from '../text.js';
import { button } from '../ui.js';
import { dialogOpen, h } from '../util.js';

export const live = false;

const STATE_KEY = 'xo-tracker';
export const TABS = ['list', 'board', 'needs-test', 'handover', 'pivot', 'history', 'activity'];
const RENDER = {
  list: renderList, board: renderBoard, 'needs-test': renderNeedsTest, handover: renderHandover,
  pivot: renderPivot, history: renderHistory, activity: renderActivity,
};

function readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; }
}

let mounted = null;

export function render(root, refParam) {
  leave();
  mounted = mount(root, refParam);
}

export function leave() {
  mounted?.();
  mounted = null;
}

// Draws the tracker into root and returns the function that stops it. embedded: inside a canvas
// widget, where opening an item must not change the page's address.
export function mount(root, refParam, { embedded = false } = {}) {
  const saved = readState();
  const ui = {
    project: saved.project || 'all',
    tab: TABS.includes(saved.tab) ? saved.tab : 'list',
    filters: saved.filters || { open: true },
    sort: saved.sort || { key: 'updated', dir: -1 },
    selected: null,
    checked: new Set(),
    order: [], // ids in the list's current order, for j and k
  };
  if (ui.project !== 'all' && !M.project(ui.project)) ui.project = 'all';
  const opened = refParam && M.byRef(decodeURIComponent(refParam));
  if (opened) {
    ui.selected = opened.id;
    if (ui.project !== 'all' && ui.project !== opened.project) ui.project = opened.project;
  }

  const save = () => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ project: ui.project, tab: ui.tab, filters: ui.filters, sort: ui.sort })); } catch { /* per-device convenience only */ }
  };

  const projectStrip = tabStrip({ label: t('tracker.projects_aria'), onSelect: (id) => { ui.project = id; ui.checked.clear(); save(); draw(); } });
  const tabRow = tabStrip({ label: t('tracker.views_aria'), onSelect: (tab) => { ui.tab = tab; save(); draw(); } });
  const settingsBtn = button(t('tracker.project_settings'), { onclick: () => ui.project !== 'all' && editProject(ui.project) });
  const head = h('header', { class: 'page-head' },
    h('h1', {}, t('tracker.heading')),
    h('div', { class: 'actions' },
      button(t('tracker.new_item'), { variant: 'primary', onclick: () => ctx.newItem() }),
      button(t('tracker.new_project'), { onclick: () => newProject((id) => { ui.project = id; save(); draw(); }) }),
      settingsBtn));
  const viewEl = h('div', { class: 'tw:min-w-0' });
  const detailEl = h('aside', { class: 'tw:min-w-0', 'aria-label': t('tracker.detail_aria') });
  const split = h('div', {}, viewEl, detailEl);
  const wrap = h('div', { class: 'tr tw:flex tw:flex-col tw:gap-4' }, head, projectStrip.el, tabRow.el, split);
  root.replaceChildren(wrap);

  const ctx = {
    ui,
    save,
    redraw: () => draw(),
    select(id, { focus = false } = {}) {
      ui.selected = id;
      const it = id && M.item(id);
      const target = it ? `#/tracker/${M.ref(it)}` : '#/tracker';
      if (!embedded && location.hash !== target) history.replaceState(null, '', target);
      draw();
      if (focus) detailEl.querySelector('[data-focus="title"]')?.focus();
    },
    newItem() {
      const own = M.projects().filter((p) => !p.readOnly);
      const projectId = own.some((p) => p.id === ui.project) ? ui.project : own[0]?.id;
      if (!projectId) { newProject((id) => { ui.project = id; save(); draw(); }); return; }
      newItem(projectId, (id) => ctx.select(id, { focus: true }));
    },
    focusSearch: () => viewEl.querySelector('[data-focus="search"]')?.focus(),
    setTab(tab) { ui.tab = tab; save(); draw(); },
    detailEl,
  };

  function draw() {
    const all = M.projects();
    projectStrip.set([{ key: 'all', label: t('tracker.all_projects') }, ...all.map((p) => ({ key: p.id, label: p.name }))], ui.project);
    tabRow.set(TABS.map((k) => ({ key: k, label: t(`tracker.tabs.${k}`) })), ui.tab);
    settingsBtn.hidden = ui.project === 'all' || ui.project === NOBBIE_ID;
    if (ui.selected && !M.item(ui.selected)) ui.selected = null;
    // Wide screen: the view beside the details. Phone: the details take the place of the view.
    const open = !!ui.selected;
    split.className = open ? 'tw:grid tw:gap-6 tw:items-start tw:lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]' : '';
    viewEl.className = open ? 'tw:min-w-0 tw:hidden tw:lg:block' : 'tw:min-w-0';
    detailEl.className = open ? 'tw:min-w-0 tw:lg:sticky tw:lg:top-4 tw:lg:max-h-[calc(100dvh-2rem)] tw:lg:overflow-auto tw:rounded-xo tw:border-rule tw:border-line tw:bg-surface tw:p-4' : 'tw:hidden';
    viewEl.replaceChildren();
    const nb = nobbieState();
    if (nb.error && (ui.project === NOBBIE_ID || ui.project === 'all')) {
      viewEl.append(h('p', { class: 'guard' }, t('tracker.nobbie.failed', { why: nb.error }), ' ',
        button(t('tracker.nobbie.retry'), { class: 'small', onclick: () => loadNobbie({ refresh: true }) })));
    }
    if (ui.project === NOBBIE_ID && nb.fetchedAt) {
      viewEl.append(h('p', { class: 'tw:text-muted tw:text-sm tw:flex tw:items-center tw:gap-2' },
        t('tracker.nobbie.fetched', { time: new Date(nb.fetchedAt * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) }),
        button(t('tracker.nobbie.refresh'), { class: 'small', onclick: () => loadNobbie({ refresh: true }) })));
    }
    if (!all.length) {
      viewEl.append(h('p', { class: 'empty' }, t('tracker.no_projects')));
    } else {
      RENDER[ui.tab](viewEl, ctx);
    }
    detailEl.replaceChildren();
    if (ui.selected) renderDetail(detailEl, ctx, ui.selected);
  }

  // Redraw on any change, waiting while a dialog is open. The field that had the focus gets it
  // back after the redraw, with what was typed in it and the caret where it was.
  let pending = false;
  const fieldKey = (el) => el.id || el.dataset.focus || el.dataset.field || el.getAttribute('aria-label');
  const redrawKeepingFocus = () => {
    const a = document.activeElement;
    const keep = a && wrap.contains(a) && a.matches('input, textarea, select') && fieldKey(a)
      ? { key: fieldKey(a), value: a.value, start: a.selectionStart, end: a.selectionEnd } : null;
    draw();
    if (!keep) return;
    const again = [...wrap.querySelectorAll('input, textarea, select')].find((el) => fieldKey(el) === keep.key);
    if (!again) return;
    if (again.value !== keep.value && again.localName !== 'select') again.value = keep.value;
    again.focus({ preventScroll: true });
    try { if (keep.start != null) again.setSelectionRange(keep.start, keep.end); } catch { /* not a text field */ }
  };
  const later = () => { if (pending && !dialogOpen()) { pending = false; redrawKeepingFocus(); } };
  const off = store.onChange(() => { if (dialogOpen()) pending = true; else redrawKeepingFocus(); });
  document.addEventListener('close', later, true);
  const keysOff = installKeys(ctx, wrap);
  const nobbieOff = onNobbie(() => { if (!dialogOpen()) redrawKeepingFocus(); else pending = true; });
  if (nobbieState().enabled !== false) loadNobbie();

  draw();
  return () => { off(); keysOff(); nobbieOff(); document.removeEventListener('close', later, true); };
}
