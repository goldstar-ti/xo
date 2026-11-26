// Shell: sign-in, navigation, routing.
import * as store from './store.js';
import { DEFAULT_ROUTINES, DEFAULT_SETTINGS } from './content.js';
import { loadWebAwesome } from './kit.js';
import { loadText, t, text } from './text.js';
import { button, field, focusControl, input } from './ui.js';
import { dialogOpen, h, kvClear, kvSet, put, toast, uid } from './util.js';
import * as todayView from './views/today.js';
import * as checkinView from './views/checkin.js';
import * as planView from './views/plan.js';
import * as settingsView from './views/settings.js';
import * as appearanceView from './views/appearance.js';
import * as canvasView from './views/canvas.js';
import { bills, diary, obligations, routine, tasks } from './views/lists.js';

const NAV = Object.entries(text('app.nav')); // [key, label] in the order the sidebar lists them
const L = window.XOLook;
const tabs = () => L.prefs.tabs; // the four sections on the phone's bottom bar: chosen in Appearance

const more = {
  live: false,
  render(root) {
    put(root, h('header', { class: 'page-head' }, h('h1', {}, t('app.more'))),
      h('ul', { class: 'list links' }, NAV.filter(([k]) => !tabs().includes(k)).map(([k, label]) => h('li', {}, h('a', { class: 'row-main', href: `#/${k}` }, label)))));
  },
};
const VIEWS = { today: todayView, diary, tasks, obligations, routine, bills, checkin: checkinView, plan: planView, settings: settingsView, appearance: appearanceView, canvas: canvasView, more };

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
  view?.leave?.(); // A screen that holds resources (the canvas) lets them go.
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
    const target = document.querySelector(`[data-focus="${refocus}"]`);
    if (target) focusControl(target);
  }
  if (focusKey) document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  pending = false;
}

function shell() {
  const link = ([k, label]) => h('a', { href: `#/${k}`, 'data-nav': k }, label);
  const actions = () => h('div', { class: 'head-actions' },
    button(t('app.look'), { class: 'look-btn', onclick: appearanceView.openLookPanel }),
    button(t('app.plan_card'), { class: 'plan-btn', onclick: planView.openPlanCard }));
  const brand = () => h('p', { class: 'brand' }, L.prefs.title);
  app.replaceChildren(
    h('aside', { class: 'side' }, brand(), h('nav', { 'aria-label': t('app.sections_aria') }, NAV.map(link)), actions()),
    h('div', { class: 'main' },
      h('header', { class: 'top' }, brand(), actions()),
      h('main', { id: 'view', tabindex: '-1' })),
    h('nav', { class: 'tabs', 'aria-label': t('app.sections_aria'), 'data-tabs': tabs().join(',') }, tabs().map((k) => link(NAV.find(([n]) => n === k))), h('a', { href: '#/more', 'data-nav': 'more' }, t('app.more'))),
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
    bar.replaceChildren(...tabs().map(link), h('a', { href: '#/more', 'data-nav': 'more' }, t('app.more')));
  }
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
  const error = h('p', { class: 'form-error', role: 'alert' }, message);
  const label = isNew ? t('common.create_and_open') : t('common.sign_in');
  const btn = button(label, { variant: 'primary', type: 'submit', class: 'big' });
  const form = h('form', { class: 'form auth' },
    h('h1', {}, t('app.name')),
    h('p', { class: 'note' }, isNew ? t('app.auth.intro_new') : t('app.auth.intro_existing')),
    field(t('app.auth.name'), name),
    field(t('app.auth.password'), pass, isNew ? t('app.auth.password_hint') : null),
    isNew && field(t('app.auth.password_again'), again),
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
