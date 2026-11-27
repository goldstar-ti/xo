// Service worker: keeps the app shell available and shows reminders.
// Classic script (no imports) so it works in every browser that supports push.
const CACHE = 'xo-v26';
const SHELL = [
  '/', '/app.css', '/tw.css', '/manifest.webmanifest', '/fonts/ahn-latin.woff2', '/icons/icon-192.png',
  '/js/boot.js', '/js/app.js', '/js/store.js', '/js/util.js', '/js/content.js', '/js/lookups.js', '/js/text.js', '/js/ui.js', '/js/kit.js', '/kit-wa.css', '/js/forms.js', '/js/tasks.js', '/js/taskdata.js', '/js/taskfields.js', '/js/palette.js', '/js/keymap.js', '/js/customfields.js', '/js/cleanup.js', '/js/family-themes.js',
  '/js/views/today.js', '/js/views/lists.js', '/js/views/tasks.js', '/js/views/checkin.js', '/js/views/plan.js', '/js/views/settings.js', '/js/views/appearance.js',
  '/js/views/canvas.js', '/js/canvas.js', '/js/grid.js', '/js/tabs.js', '/js/widgets.js', '/canvas.css',
  '/vendor/gridstack/gridstack-all.js', '/vendor/gridstack/gridstack.min.css',
  '/js/views/tracker.js', '/js/tracker/model.js', '/js/tracker/list.js', '/js/tracker/detail.js', '/js/tracker/board.js',
  '/js/tracker/reports.js', '/js/tracker/projects.js', '/js/tracker/keys.js', '/js/tracker/widgets.js',
  '/js/markdown.js', '/js/mdeditor.js', '/js/views/notes.js', '/vendor/marked/marked.esm.js', '/js/voice.js',
  '/js/icons.js', '/js/icon-core.js', '/js/iconpicker.js', '/js/popover.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// App files: network first, so updates arrive straight away; the cache covers being offline.
// API calls are never cached, except /api/text (the editable wording): network first, so an
// edit shows at once, with the last copy as the offline fallback.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || (url.pathname.startsWith('/api/') && url.pathname !== '/api/text')) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  );
});

// ---- reading one item, to word a reminder ----
function kvGet(name) {
  return new Promise((resolve) => {
    const req = indexedDB.open('xo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const get = req.result.transaction('kv', 'readonly').objectStore('kv').get(name);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => resolve(undefined);
    };
  });
}
async function readItem(id) {
  if (!id) return null;
  const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  if (!res.ok) return null;
  return (await res.json()).payload || null;
}
let clock24 = false;
function clock(time) {
  if (!time) return '';
  const [hh, mm] = time.split(':').map(Number);
  if (clock24) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}

// Neutral wording, used when titles are switched off or the item cannot be read.
const NEUTRAL = {
  appt_week: ['Appointment in one week', 'Open XO for the details.', '#/diary'],
  appt_eve: ['Appointment tomorrow', 'Check the time and what to bring.', '#/diary'],
  appt_ready: ['Start getting ready', 'You have an appointment coming up.', '#/today'],
  appt_leave: ['Time to leave', 'Leave now for your appointment.', '#/today'],
  appt_soon: ['Appointment in 15 minutes', '', '#/today'],
  task_soon: ['A task is due tomorrow', '', '#/tasks'],
  task_due: ['A task is due today', '', '#/tasks'],
  task_block: ['Time for a task you planned', '', '#/today'],
  pm_soon: ['A tracker item is due tomorrow', '', '#/tracker'],
  pm_due: ['A tracker item is due today', '', '#/tracker'],
  bill_soon: ['A bill is due in 3 days', '', '#/bills'],
  bill_due: ['A bill is due today', '', '#/bills'],
  bill_auto: ['An automatic payment comes out tomorrow', 'Check the money is there.', '#/bills'],
  routine: ['Routine reminder', '', '#/today'],
  obligation: ['Reminder', 'Open XO for the details.', '#/today'],
  checkin_morning: ['Morning check-in', 'Two minutes. Tap to start.', '#/checkin/morning'],
  checkin_evening: ['Evening check-in', 'Two minutes. Tap to start.', '#/checkin/evening'],
  checkin_weekly: ['Weekly review', 'Five questions.', '#/checkin/weekly'],
  test: ['XO', 'Notifications are working on this device.', '#/settings'],
};

function detailed(kind, d) {
  const when = clock(d.time);
  switch (kind) {
    case 'appt_week': return [`In one week: ${d.title}`, `${when}${d.where ? `, ${d.where}` : ''}`];
    case 'appt_eve': return [`Tomorrow ${when}: ${d.title}`, d.where || ''];
    case 'appt_ready': return [`Start getting ready: ${d.title}`, `Starts ${when}`];
    case 'appt_leave': return [`Leave now: ${d.title}`, `Starts ${when}${d.where ? `, ${d.where}` : ''}`];
    case 'appt_soon': return [`In 15 minutes: ${d.title}`, d.where || ''];
    case 'task_soon': return [`Due tomorrow: ${d.title}`, d.step ? `Start with: ${d.step}` : ''];
    case 'task_due': return [`Due today: ${d.title}`, d.step ? `Start with: ${d.step}` : ''];
    case 'task_block': return [`Now: ${d.title}`, d.step ? `Start with: ${d.step}` : ''];
    case 'pm_soon': return [`Due tomorrow: ${d.title}`, ''];
    case 'pm_due': return [`Due today: ${d.title}`, ''];
    case 'bill_soon': return [`Bill due in 3 days: ${d.name}`, ''];
    case 'bill_due': return [`Bill due today: ${d.name}`, ''];
    case 'bill_auto': return [`Automatic payment tomorrow: ${d.name}`, 'Check the money is there.'];
    case 'obligation': return [d.title, d.contact || ''];
    default: return null;
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let msg = {};
    try { msg = event.data.json(); } catch { /* fall through to a neutral reminder */ }
    const kind = NEUTRAL[msg.kind] ? msg.kind : 'routine';
    let [title, body, url] = NEUTRAL[kind];
    try {
      clock24 = (await kvGet('clock24')) === true;
      if (kind === 'routine') {
        const d = await readItem(msg.item); // routine labels are always shown
        if (d?.label) title = d.label;
      } else if (!kind.startsWith('checkin') && kind !== 'test' && (await kvGet('details'))) {
        const d = await readItem(msg.item);
        const text = d && detailed(kind, d);
        if (text) [title, body] = text;
      }
    } catch { /* keep the neutral wording */ }
    const canTick = kind === 'routine' || kind === 'obligation';
    await self.registration.showNotification(title, {
      body,
      tag: `${kind}:${msg.item || ''}`,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      data: { url, rid: msg.rid, item: msg.item, kind },
      actions: msg.rid ? [...(canTick ? [{ action: 'done', title: 'Done' }] : []), { action: 'snooze', title: 'In 15 min' }] : [],
    });
  })());
});

const post = (path, method, body) =>
  fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-XO': '1' }, body: JSON.stringify(body) });

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

self.addEventListener('notificationclick', (event) => {
  const { url, rid, item } = event.notification.data || {};
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (event.action === 'snooze' && rid) {
      await post(`/api/reminders/${rid}/snooze`, 'POST', { minutes: 15 }).catch(() => {});
      return;
    }
    if (event.action === 'done' && item) {
      const day = localDay();
      await post(`/api/items/tick:${item}:${day}`, 'PUT', { kind: 'tick', day, payload: null }).catch(() => {});
      windows.forEach((w) => w.postMessage({ type: 'changed' }));
      return;
    }
    const hash = url || '#/today';
    if (windows.length) {
      await windows[0].focus().catch(() => {});
      windows[0].postMessage({ type: 'go', hash });
    } else {
      await self.clients.openWindow(`/${hash}`);
    }
  })());
});
