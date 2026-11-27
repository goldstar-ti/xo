// Delete entries: list every saved entry, narrow by kind or search, tick the unneeded ones and delete them
// together. Opened from Settings, My data. Reads the server directly, so old ticks and check-ins show too.
import * as store from './store.js';
import { h, openDialog, put, toast } from './util.js';
import { button, checkbox, field, input, notice, select } from './ui.js';
import { t, text } from './text.js';

const SHOWN = 300;
const TITLE_FIELDS = ['title', 'name', 'what', 'text', 'label', 'note', 'body'];

// The words that best name an entry: its first non-empty title-like field, else its id.
export function entryTitle(row) {
  const p = row.payload;
  if (typeof p === 'string' && p.trim()) return p;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    for (const k of TITLE_FIELDS) if (typeof p[k] === 'string' && p[k].trim()) return p[k];
  }
  return row.id;
}

const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function openCleanup({ download }) {
  const status = h('p', { class: 'note' }, t('settings.cleanup.loading'));
  const body = h('div', { class: 'cleanup' }, status);
  openDialog(t('settings.cleanup.heading'), body, { wide: true });

  let rows;
  try {
    rows = (await store.api('GET', '/api/items')).map((r) => ({ ...r, title: entryTitle(r) }));
  } catch (err) {
    status.replaceChildren(notice(err.message, 'bad'));
    return;
  }

  const names = text('settings.cleanup.kinds') || {};
  const kindName = (k) => names[k] || k;
  const picked = new Set();
  let kind = '';
  let query = '';

  const kindOptions = () => {
    const counts = new Map();
    rows.forEach((r) => counts.set(r.kind, (counts.get(r.kind) || 0) + 1));
    const kinds = [...counts.keys()].sort((a, b) => kindName(a).localeCompare(kindName(b)));
    return [['', t('settings.cleanup.all_kinds', { n: rows.length })],
      ...kinds.map((k) => [k, t('settings.cleanup.kind_count', { name: kindName(k), n: counts.get(k) })])];
  };
  const matches = () => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (!kind || r.kind === kind) && (!q || `${r.title} ${r.id}`.toLowerCase().includes(q)));
  };

  let kindField = null;
  const drawKinds = () => {
    if (kind && !rows.some((r) => r.kind === kind)) kind = '';
    const next = field(t('settings.cleanup.kind'),
      select(kindOptions(), { id: 'cleanup-kind', value: kind, onchange: (e) => { kind = e.target.value; draw(); } }), null, { half: true });
    kindField?.replaceWith(next);
    kindField = next;
  };
  const search = input({
    id: 'cleanup-search', type: 'search', autocomplete: 'off', value: '',
    oninput: (e) => { query = e.target.value; draw(); },
  });

  const allBox = h('div');
  const table = h('tbody');
  const more = h('p', { class: 'hint' });
  const del = button('', { variant: 'danger', id: 'cleanup-delete' });
  let armed = false;
  const drawDelete = () => {
    armed = false;
    del.textContent = t('settings.cleanup.delete', { n: picked.size });
    del.disabled = picked.size === 0;
  };

  function draw() {
    const list = matches();
    const shown = list.slice(0, SHOWN);
    const allOn = shown.length > 0 && shown.every((r) => picked.has(r.id));
    allBox.replaceChildren(field(t('settings.cleanup.select_all'), checkbox({
      id: 'cleanup-all', checked: allOn,
      onchange: (e) => { shown.forEach((r) => (e.target.checked ? picked.add(r.id) : picked.delete(r.id))); draw(); },
    })));
    table.replaceChildren(...shown.map((r) => h('tr', { 'data-id': r.id },
      h('td', { class: 'tools' }, checkbox({
        checked: picked.has(r.id), 'aria-label': r.title,
        onchange: (e) => { e.target.checked ? picked.add(r.id) : picked.delete(r.id); draw(); },
      })),
      h('td', { class: 'text' }, h('strong', {}, clip(r.title)), h('br'), h('small', { class: 'hint' }, kindName(r.kind))),
      h('td', { class: 'tw:whitespace-nowrap' }, r.day || ''),
      h('td', { class: 'tw:whitespace-nowrap' }, r.updated_at ? r.updated_at.slice(0, 10) : ''),
    )));
    if (!list.length) table.replaceChildren(h('tr', {}, h('td', { colspan: 4 }, t('settings.cleanup.empty'))));
    more.textContent = list.length > SHOWN ? t('settings.cleanup.showing', { shown: SHOWN, n: list.length }) : '';
    drawDelete();
  }

  del.addEventListener('click', async () => {
    if (!picked.size) return;
    if (!armed) { armed = true; del.textContent = t('settings.cleanup.delete_confirm', { n: picked.size }); return; }
    del.disabled = true;
    const ids = [...picked];
    try {
      const n = await store.removeMany(ids);
      const gone = new Set(ids);
      rows = rows.filter((r) => !gone.has(r.id));
      picked.clear();
      toast(n === 1 ? t('settings.cleanup.deleted_one') : t('settings.cleanup.deleted_many', { n }));
    } catch (err) {
      toast(err.message, 'bad');
    }
    drawKinds();
    draw();
  });

  drawKinds();
  draw();
  body.replaceChildren();
  put(body,
    h('p', { class: 'note' }, t('settings.cleanup.note')),
    h('p', { class: 'hint' }, t('settings.cleanup.singletons')),
    h('div', { class: 'row' }, button(t('settings.data.download'), { onclick: () => download().catch((err) => toast(err.message, 'bad')) })),
    h('div', { class: 'fields' }, kindField, field(t('settings.cleanup.search'), search, t('settings.cleanup.search_hint'), { half: true })),
    allBox,
    h('table', { class: 'lookup-table cleanup-table' },
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, t('settings.cleanup.entry')), h('th', {}, t('settings.cleanup.day')), h('th', {}, t('settings.cleanup.changed')))),
      table),
    more,
    h('div', { class: 'row' }, del),
  );
}
