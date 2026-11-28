// Shell: sign-in, navigation, routing.
import * as store from './store.js';
import { DEFAULT_ROUTINES, DEFAULT_SETTINGS } from './content.js';
import { loadWebAwesome } from './kit.js';
import { loadText, t, text } from './text.js';
import { button, callout, field, focusControl, input, linkRow } from './ui.js';
import { dialogOpen, h, kvClear, kvSet, put, toast, uid } from './util.js';
import * as todayView from './views/today.js';
import * as checkinView from './views/checkin.js';
import * as planView from './views/plan.js';
import * as settingsView from './views/settings.js';
import * as appearanceView from './views/appearance.js';
import * as canvasView from './views/canvas.js';
import * as trackerView from './views/tracker.js';
import { bills, diary, obligations, routine } from './views/lists.js';
import * as tasksView from './views/tasks.js';
import * as notesView from './views/notes.js';
import { installPalette, setScreenKeys } from './palette.js';
import { CHROME, DEFAULT_ICONS, icon, paintIcon } from './icons.js';
import { pickScreenIcon } from './iconpicker.js';

const NAV = Object.entries(text('app.nav')); // [key, label] in the order the sidebar lists them
const L = window.XOLook;
const tabs = () => L.prefs.tabs; // the four sections on the phone's bottom bar: chosen in Appearance

const iconOf = (k) => L.prefs.icons[k] || DEFAULT_ICONS[k];
const labelOf = (k) => (k === 'more' ? t('app.more') : text('app.nav')[k]);

// A screen's link: its icon and its name. Right-click changes the icon (Shift+right-click
// keeps the browser's own menu).
function navLink(k) {
  const a = h('a', { href: `#/${k}`, 'data-nav': k }, icon(iconOf(k)), h('span', { class: 'nav-label' }, labelOf(k)));
  a.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) return;
    e.preventDefault();
    // Where the menu opens while the button is still down (Linux, macOS), wait for its release,
    // or that release would dismiss the popover at once.
    const open = () => pickScreenIcon(a, k);
    if (e.buttons & 2) window.addEventListener('pointerup', () => setTimeout(open), { once: true }); else open();
  });
  return a;
}

// The side bar's state: collapsed to icons or open, its button's wording, and tooltips on icon-only links.
function refreshSide() {
  const collapsed = L.prefs.side === 'icons';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const ico = a.querySelector('.ico');
    if (ico && ico.dataset.icon !== iconOf(a.dataset.nav)) paintIcon(ico, iconOf(a.dataset.nav));
    if (a.closest('.side') && collapsed) a.title = labelOf(a.dataset.nav); else a.removeAttribute('title');
  });
  const btn = document.querySelector('.side-toggle');
  if (btn) {
    const label = collapsed ? t('app.side.expand') : t('app.side.collapse');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.setAttribute('aria-expanded', String(!collapsed));
    paintIcon(btn.querySelector('.ico'), collapsed ? CHROME.expand : CHROME.collapse);
  }
  const grip = document.querySelector('.side-grip');
  if (grip) grip.setAttribute('aria-valuenow', String(L.prefs.sideW));
}

// The handle on the side bar's right edge: drag, or focus it and use the arrow keys. Double-click resets.
function sideGrip() {
  const root = document.documentElement;
  const clampW = (w) => Math.round(Math.min(420, Math.max(180, w)));
  const commit = (w) => L.change((s) => { s.prefs.sideW = clampW(w); }, { quiet: true });
  const grip = h('div', {
    class: 'side-grip', role: 'separator', tabindex: '0', 'aria-orientation': 'vertical',
    'aria-label': t('app.side.resize'), title: t('app.side.resize'), 'aria-valuemin': '180', 'aria-valuemax': '420', 'aria-valuenow': String(L.prefs.sideW),
  });
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const left = grip.parentElement.getBoundingClientRect().left;
    const zoom = parseFloat(getComputedStyle(root).getPropertyValue('--zoom')) || 1;
    let w = L.prefs.sideW;
    root.classList.add('side-dragging');
    const move = (ev) => { w = clampW((ev.clientX - left) / zoom); root.style.setProperty('--side-w', `${w}px`); grip.setAttribute('aria-valuenow', String(w)); };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      root.classList.remove('side-dragging');
      commit(w);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });
  grip.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -16, ArrowRight: 16, Home: -999, End: 999 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    commit(L.prefs.sideW + step);
  });
  grip.addEventListener('dblclick', () => commit(240));
  return grip;
}

const more = {
  live: false,
  render(root) {
    put(root, h('header', { class: 'page-head' }, h('h1', {}, t('app.more'))),
      h('ul', { class: 'list links' }, NAV.filter(([k]) => !tabs().includes(k)).map(([k, label]) => h('li', {},
      linkRow({ icon: iconOf(k), title: label, sub: text('app.more_sub')[k], href: `#/${k}` })))));
  },
};
const VIEWS = { today: todayView, diary, tasks: tasksView, notes: notesView, obligations, routine, bills, checkin: checkinView, plan: planView, settings: settingsView, appearance: appearanceView, canvas: canvasView, tracker: trackerView, more };

// Web Awesome is fetched only when the Kit choice is Web Awesome. Wait for it before any redraw.
const ensureKit = () => (document.documentElement.dataset.kit === 'wa' ? loadWebAwesome().catch(() => {}) : Promise.resolve());

const app = document.getElementById('app');
let view = null;
let pending = false;
let loadedAt = 0;

function route() {
  const [name = 'today', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: VIEWS[name] ? name : 'today', params };
}

function draw({ keepScroll = false, keepFocus = false } = {}) {
  const root = document.getElementById('view');
  if (!root) return;
  const focusKey = keepFocus && document.activeElement?.dataset?.fk;
  const { name, params } = route();
  document.body.dataset.view = name;
  view?.leave?.(); // A screen that holds resources (the canvas) lets them go.
  view = VIEWS[name];
  const y = window.scrollY;
  root.replaceChildren();
  setScreenKeys(null);
  view.render(root, ...params);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === name || (a.dataset.nav === 'more' && !tabs().includes(name));
    a.classList.toggle('on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  const refocus = sessionStorage.getItem('refocus');
  if (refocus) {
    sessionStorage.removeItem('refocus');
    const target = document.querySelector(`[data-focus="${refocus}"]`);
    if (target) focusControl(target);
  }
  if (focusKey) document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  pending = false;
}

function shell() {
  installPalette();
  const withIcon = (key, label) => [icon(CHROME[key]), h('span', { class: 'btn-label' }, label)];
  const actions = () => h('div', { class: 'head-actions' },
    button(withIcon('look', t('app.look')), { class: 'look-btn', onclick: appearanceView.openLookPanel }),
    button(withIcon('plan_card', t('app.plan_card')), { class: 'plan-btn', onclick: planView.openPlanCard }));
  const brand = () => h('p', { class: 'brand' }, L.prefs.title);
  const toggleSide = h('button', { type: 'button', class: 'side-toggle', onclick: () => L.change((s) => { s.prefs.side = s.prefs.side === 'icons' ? 'open' : 'icons'; }, { quiet: true }) }, icon(CHROME.collapse));
  app.replaceChildren(
    h('aside', { class: 'side' }, h('div', { class: 'side-head' }, brand()), h('nav', { 'aria-label': t('app.sections_aria') }, NAV.map(([k]) => navLink(k))), actions(), toggleSide, sideGrip()),
    h('div', { class: 'main' },
      h('header', { class: 'top' }, brand(), actions()),
      h('main', { id: 'view', tabindex: '-1' })),
    h('nav', { class: 'tabs', 'aria-label': t('app.sections_aria'), 'data-tabs': tabs().join(',') }, tabs().map(navLink), navLink('more')),
  );
  refreshSide();
  draw();
}

// Appearance changed: update the frame, then the screen (unless a slider is mid-drag).
window.addEventListener('xo:look', async (e) => {
  if (!document.getElementById('view')) return;
  document.querySelectorAll('.brand').forEach((el) => { el.textContent = L.prefs.title; });
  const bar = document.querySelector('.tabs');
  if (bar && bar.dataset.tabs !== tabs().join(',')) {
    bar.dataset.tabs = tabs().join(',');
    bar.replaceChildren(...tabs().map(navLink), navLink('more'));
  }
  refreshSide();
  if (e.detail.quiet) return;
  await ensureKit();
  if (dialogOpen()) pending = true; else draw({ keepScroll: true, keepFocus: true });
});

// ---- sign-in ----
function authScreen(hasUser, message = '') {
  view?.leave?.();
  view = null;
  const isNew = !hasUser;
  const name = input({ id: 'a-name', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, pattern: '[A-Za-z0-9._\\-]{2,40}' });
  const pass = input({ id: 'a-pass', type: 'password', autocomplete: isNew ? 'new-password' : 'current-password', required: true, minlength: 8 });
  const again = isNew && input({ id: 'a-again', type: 'password', autocomplete: 'new-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const label = isNew ? t('common.create_and_open') : t('common.sign_in');
  const btn = button(label, { variant: 'primary', type: 'submit', class: 'big' });
  const form = h('form', { class: 'form auth' },
    h('h1', {}, t('app.name')),
    message && callout(message, { kind: 'neutral', icon: 'tabler/info-circle' }),
    h('p', { class: 'note' }, isNew ? t('app.auth.intro_new') : t('app.auth.intro_existing')),
    field(t('app.auth.name'), name),
    field(t('app.auth.password'), pass, isNew ? t('app.auth.password_hint') : null),
    isNew && field(t('app.auth.password_again'), again),
    isNew && callout(t('app.auth.no_reset'), { kind: 'warning', icon: 'tabler/alert-triangle' }),
    error, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const username = name.value.trim().toLowerCase();
    if (isNew && pass.value !== again.value) { error.textContent = t('common.passwords_differ'); return; }
    btn.disabled = true;
    btn.textContent = t('common.working');
    try {
      if (isNew) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Perth';
        await store.api('POST', '/api/auth/register', { username, password: pass.value, tz });
      } else {
        await store.api('POST', '/api/auth/login', { username, password: pass.value });
      }
      await kvSet('details', false);
      if (isNew) await seed();
      history.replaceState(null, '', '#/today');
      await start();
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = false;
      btn.textContent = label;
    }
  });
  app.replaceChildren(form);
  focusControl(name);
}

async function seed() {
  for (const r of DEFAULT_ROUTINES) await store.save('routine', uid(), { ...r, active: true }, { silent: true });
  await store.save('settings', 'settings', { ...DEFAULT_SETTINGS }, { silent: true });
}

async function start() {
  await store.load();
  loadedAt = Date.now();
  await kvSet('details', !!store.settings().details);
  await kvSet('clock24', L.prefs.clock24);
  shell();
}

async function boot() {
  await loadText(); // the wording comes first: every screen, the sign-in form included, reads it
  await ensureKit();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    const status = await store.api('GET', '/api/auth/status');
    if (status.signed_in) {
      try { await start(); return; } catch (err) { toast(err.message, 'bad'); }
    }
    authScreen(status.has_user);
  } catch {
    app.replaceChildren(h('div', { class: 'form auth' }, h('h1', {}, t('app.name')), h('p', { class: 'note' }, t('common.no_connection')),
      button(t('common.reload'), { variant: 'primary', onclick: () => location.reload() })));
  }
}

async function signOut() {
  try { await store.api('POST', '/api/auth/logout'); } catch { /* still clear this device */ }
  await kvClear().catch(() => {});
  authScreen(true);
}

window.addEventListener('hashchange', () => { if (document.getElementById('view')) draw(); });
window.addEventListener('xo:sign-out', signOut);
window.addEventListener('xo:signed-out', () => { if (document.getElementById('view')) authScreen(true, t('common.signed_out')); });

// Redraw list screens when something changes; wait if a dialog is open.
store.onChange(() => {
  if (!view?.live) return;
  if (dialogOpen()) pending = true; else draw({ keepScroll: true });
});
document.addEventListener('close', () => { if (pending && !dialogOpen()) draw({ keepScroll: true }); }, true);

// Offline: Today says so and stops taking ticks. The flag is on the root so any screen can read it.
const syncOffline = () => { if (navigator.onLine) delete document.documentElement.dataset.offline; else document.documentElement.dataset.offline = '1'; };
syncOffline();
for (const ev of ['offline', 'online']) window.addEventListener(ev, () => {
  syncOffline();
  if (view?.live && document.getElementById('view') && !dialogOpen()) draw({ keepScroll: true });
});

// Keep the Today screen's clock moving, and pick up changes made on another device.
setInterval(() => {
  if (view === todayView && !dialogOpen() && document.visibilityState === 'visible') draw({ keepScroll: true });
}, 60000);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !document.getElementById('view') || Date.now() - loadedAt < 60000) return;
  if (dialogOpen() || !view?.live) return;
  try { await store.load(); loadedAt = Date.now(); draw({ keepScroll: true }); } catch { /* offline: keep what is on screen */ }
});
navigator.serviceWorker?.addEventListener('message', async (e) => {
  if (e.data?.type === 'go' && /^#\/[a-z/0-9-]*$/.test(e.data.hash || '')) { location.hash = e.data.hash; return; }
  if (e.data?.type === 'changed' && document.getElementById('view')) {
    try { await store.load(); if (view?.live && !dialogOpen()) draw({ keepScroll: true }); } catch { /* ignore */ }
  }
});

boot();
