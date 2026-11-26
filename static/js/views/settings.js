import * as store from '../store.js';
import { h, kvSet, toast, today, put } from '../util.js';

export const live = false;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function urlB64ToBytes(text) {
  const padded = (text + '='.repeat((4 - (text.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'on' : 'off';
}

async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. Change this in your browser’s site settings.');
  const { key } = await store.api('GET', '/api/push/key');
  if (!key) throw new Error('The server has no notification keys yet. See the README, step 3.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) });
  await store.api('POST', '/api/push/subscribe', sub.toJSON());
}

async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await store.api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}

async function exportAll() {
  const rows = await store.api('GET', '/api/items');
  const out = rows.map((row) => ({ id: row.id, kind: row.kind, day: row.day, updated_at: row.updated_at, data: row.payload }));
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), items: out }, null, 2)], { type: 'application/json' });
  const link = h('a', { href: URL.createObjectURL(blob), download: `xo-export-${today()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

export function render(root) {
  root.replaceChildren();
  const s = store.settings();
  const saveSettings = async (patch) => {
    Object.assign(s, patch);
    try {
      await store.save('settings', 'settings', s, { silent: true });
      await kvSet('details', !!s.details);
      toast('Saved');
    } catch (err) { toast(err.message, 'bad'); }
  };

  const pushLine = h('p', { class: 'note' }, 'Checking…');
  const pushBtn = h('button', { class: 'primary', type: 'button' }, 'Turn on notifications on this device');
  const testBtn = h('button', { class: 'ghost', type: 'button' }, 'Send a test');
  const drawPush = async () => {
    const state = await pushState().catch(() => 'unsupported');
    pushLine.textContent = {
      on: 'Notifications are on for this device.',
      off: 'Notifications are off for this device. Reminders only reach devices where you turn them on.',
      denied: 'This browser has blocked notifications for the app. Allow them in the browser’s site settings, then come back.',
      unsupported: 'This browser cannot receive notifications. On Android use Chrome and install the app to your home screen. On desktop use Chrome or Edge.',
    }[state];
    pushBtn.textContent = state === 'on' ? 'Turn off on this device' : 'Turn on notifications on this device';
    pushBtn.hidden = state === 'denied' || state === 'unsupported';
    testBtn.hidden = state !== 'on';
    pushBtn.onclick = async () => {
      pushBtn.disabled = true;
      try { state === 'on' ? await disablePush() : await enablePush(); } catch (err) { toast(err.message, 'bad'); }
      pushBtn.disabled = false;
      drawPush();
    };
  };
  testBtn.onclick = async () => {
    try {
      const r = await store.api('POST', '/api/push/test');
      toast(r.devices ? `Sent to ${r.devices} ${r.devices === 1 ? 'device' : 'devices'}` : 'The server could not reach any device.', r.devices ? '' : 'bad');
    } catch (err) { toast(err.message, 'bad'); }
  };
  drawPush();

  const time = (name, label) => h('div', { class: 'field half' }, h('label', { for: `s-${name}` }, label),
    h('input', { id: `s-${name}`, type: 'time', value: s[name], onchange: (e) => e.target.value && saveSettings({ [name]: e.target.value }) }));
  const toggle = (name, label, hint) => h('label', { class: 'field check' },
    h('input', { type: 'checkbox', checked: !!s[name], onchange: (e) => saveSettings({ [name]: e.target.checked }) }),
    h('span', {}, label), hint && h('small', {}, hint));

  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, 'Settings'), h('div', { class: 'actions' }, h('a', { class: 'ghost', href: '#/appearance' }, 'Appearance'))),
    h('section', {}, h('h2', {}, 'Notifications'), pushLine, h('div', { class: 'row' }, pushBtn, testBtn),
      toggle('details', 'Show titles in notifications', 'Off: appointment, task, bill and condition reminders use neutral wording on the lock screen. Routine reminders always show their own label. Check-in reminders are always neutral.')),
    h('section', {}, h('h2', {}, 'Check-in times'),
      h('div', { class: 'fields' }, time('morningAt', 'Morning check-in'), time('eveningAt', 'Evening check-in'),
        h('div', { class: 'field half' }, h('label', { for: 's-weeklyDay' }, 'Weekly review day'),
          h('select', { id: 's-weeklyDay', value: String(s.weeklyDay), onchange: (e) => saveSettings({ weeklyDay: Number(e.target.value) }) },
            WEEKDAYS.map((d, i) => h('option', { value: String(i) }, d)))),
        time('weeklyAt', 'Weekly review time'))),
    h('section', {}, h('h2', {}, 'Evening check-in'),
      toggle('logSigns', 'Ask about my early warning signs', 'Your answers are stored with your other entries. If you have a matter before a court, ask your lawyer what is safe to record before you leave this on.')),
    h('section', {}, h('h2', {}, 'Writing reminder'),
      toggle('showGuard', 'Show the reminder about what not to write', 'The line that appears beside free-text boxes in the plan and check-ins. Switch it off once you no longer need it.')),
    h('section', {}, h('h2', {}, 'My own daily lines'),
      h('p', { class: 'hint' }, 'One per line. They are mixed in with the built-in ones on the Today screen and come up twice as often.'),
      h('textarea', { rows: 4, value: s.lines, 'aria-label': 'My own daily lines', onchange: (e) => saveSettings({ lines: e.target.value }) })),
    h('section', {}, h('h2', {}, 'My data'),
      h('p', { class: 'note' }, 'Your entries are stored on the server and you sign in with your password.'),
      h('div', { class: 'row' },
        h('button', { class: 'ghost', type: 'button', onclick: () => exportAll().catch((err) => toast(err.message, 'bad')) }, 'Download everything'),
        h('button', { class: 'ghost', type: 'button', onclick: () => window.dispatchEvent(new Event('xo:sign-out')) }, 'Sign out of this device')),
      h('p', { class: 'hint' }, 'A JSON file with every entry you have saved.')),
  );
}
