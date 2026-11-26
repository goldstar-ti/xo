// Shell: sign-in, navigation, routing.
import * as store from './store.js';
import { DEFAULT_ROUTINES, DEFAULT_SETTINGS } from './content.js';
import { loadWebAwesome } from './kit.js';
import { loadText } from './text.js';
import { dialogOpen, h, kvClear, kvSet, put, toast, uid } from './util.js';
import * as todayView from './views/today.js';
import * as checkinView from './views/checkin.js';
import * as planView from './views/plan.js';
import * as settingsView from './views/settings.js';
import * as appearanceView from './views/appearance.js';
import { bills, diary, obligations, routine, tasks } from './views/lists.js';

const NAV = [
  ['today', 'Today'], ['diary', 'Diary'], ['tasks', 'Tasks'], ['obligations', 'Obligations'],
  ['routine', 'Routine'], ['bills', 'Bills'], ['checkin', 'Check-ins'], ['plan', 'My plan'], ['appearance', 'Appearance'], ['settings', 'Settings'],
];
const L = window.XOLook;
const tabs = () => L.prefs.tabs; // the four sections on the phone's bottom bar: chosen in Appearance

const more = {
  live: false,
  render(root) {
    put(root, h('header', { class: 'page-head' }, h('h1', {}, 'More')),
      h('ul', { class: 'list links' }, NAV.filter(([k]) => !tabs().includes(k)).map(([k, label]) => h('li', {}, h('a', { class: 'row-main', href: `#/${k}` }, label)))));
  },
};
const VIEWS = { today: todayView, diary, tasks, obligations, routine, bills, checkin: checkinView, plan: planView, settings: settingsView, appearance: appearanceView, more };

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
  view = VIEWS[name];
  const y = window.scrollY;
  root.replaceChildren();
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
    document.querySelector(`[data-focus="${refocus}"]`)?.focus();
  }
  if (focusKey) document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  pending = false;
}

function shell() {
  const link = ([k, label]) => h('a', { href: `#/${k}`, 'data-nav': k }, label);
  const actions = () => h('div', { class: 'head-actions' },
    h('button', { class: 'look-btn', type: 'button', onclick: appearanceView.openLookPanel }, 'Look'),
    h('button', { class: 'plan-btn', type: 'button', onclick: planView.openPlanCard }, 'My plan card'));
  const brand = () => h('p', { class: 'brand' }, L.prefs.title);
  app.replaceChildren(
    h('aside', { class: 'side' }, brand(), h('nav', { 'aria-label': 'Sections' }, NAV.map(link)), actions()),
    h('div', { class: 'main' },
      h('header', { class: 'top' }, brand(), actions()),
      h('main', { id: 'view', tabindex: '-1' })),
    h('nav', { class: 'tabs', 'aria-label': 'Sections', 'data-tabs': tabs().join(',') }, tabs().map((k) => link(NAV.find(([n]) => n === k))), h('a', { href: '#/more', 'data-nav': 'more' }, 'More')),
  );
  draw();
}

// Appearance changed: update the frame, then the screen (unless a slider is mid-drag).
window.addEventListener('xo:look', async (e) => {
  if (!document.getElementById('view')) return;
  document.querySelectorAll('.brand').forEach((el) => { el.textContent = L.prefs.title; });
  const bar = document.querySelector('.tabs');
  if (bar && bar.dataset.tabs !== tabs().join(',')) {
    const link = (k) => { const [, label] = NAV.find(([n]) => n === k); return h('a', { href: `#/${k}`, 'data-nav': k }, label); };
    bar.dataset.tabs = tabs().join(',');
    bar.replaceChildren(...tabs().map(link), h('a', { href: '#/more', 'data-nav': 'more' }, 'More'));
  }
  if (e.detail.quiet) return;
  await ensureKit();
  if (dialogOpen()) pending = true; else draw({ keepScroll: true, keepFocus: true });
});

// ---- sign-in ----
function authScreen(hasUser, message = '') {
  const isNew = !hasUser;
  const name = h('input', { id: 'a-name', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, pattern: '[A-Za-z0-9._\\-]{2,40}' });
  const pass = h('input', { id: 'a-pass', type: 'password', autocomplete: isNew ? 'new-password' : 'current-password', required: true, minlength: 8 });
  const again = isNew && h('input', { id: 'a-again', type: 'password', autocomplete: 'new-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert' }, message);
  const btn = h('button', { class: 'primary big', type: 'submit' }, isNew ? 'Create and open' : 'Sign in');
  const form = h('form', { class: 'form auth' },
    h('h1', {}, 'XO'),
    h('p', { class: 'note' }, isNew
      ? 'Set a name and a password.'
      : 'Sign in on this device.'),
    h('div', { class: 'field' }, h('label', { for: 'a-name' }, 'Name'), name),
    h('div', { class: 'field' }, h('label', { for: 'a-pass' }, 'Password'), pass, isNew && h('small', {}, 'At least 8 characters.')),
    isNew && h('div', { class: 'field' }, h('label', { for: 'a-again' }, 'Password again'), again),
    error, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const username = name.value.trim().toLowerCase();
    if (isNew && pass.value !== again.value) { error.textContent = 'The two passwords do not match.'; return; }
    btn.disabled = true;
    btn.textContent = 'Working…';
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
      btn.textContent = isNew ? 'Create and open' : 'Sign in';
    }
  });
  app.replaceChildren(form);
  name.focus();
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
    app.replaceChildren(h('div', { class: 'form auth' }, h('h1', {}, 'XO'), h('p', { class: 'note' }, 'No connection to the server. Check your connection and reload.'),
      h('button', { class: 'primary', type: 'button', onclick: () => location.reload() }, 'Reload')));
  }
}

async function signOut() {
  try { await store.api('POST', '/api/auth/logout'); } catch { /* still clear this device */ }
  await kvClear().catch(() => {});
  authScreen(true);
}

window.addEventListener('hashchange', () => { if (document.getElementById('view')) draw(); });
window.addEventListener('xo:sign-out', signOut);
window.addEventListener('xo:signed-out', () => { if (document.getElementById('view')) authScreen(true, 'Your sign-in ran out. Sign in again.'); });

// Redraw list screens when something changes; wait if a dialog is open.
store.onChange(() => {
  if (!view?.live) return;
  if (dialogOpen()) pending = true; else draw({ keepScroll: true });
});
document.addEventListener('close', () => { if (pending && !dialogOpen()) draw({ keepScroll: true }); }, true);

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
