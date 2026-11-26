// Project dialogs: New project, New item and Project settings (name, key, archive and the
// project's own pick lists, after NOBBIE's lists editor).
import * as M from './model.js';
import { t } from '../text.js';
import { button, checkbox, field, input } from '../ui.js';
import { h, openDialog, openForm, toast } from '../util.js';

const fail = (err) => toast(err.message, 'bad');
const KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,7}$/;

function keyProblem(key, exceptId = null) {
  if (!KEY_RE.test(key)) return t('tracker.project.key_bad');
  if (M.projects({ archived: true }).some((p) => p.id !== exceptId && p.key.toLowerCase() === key.toLowerCase())) return t('tracker.project.key_taken');
  return null;
}

export function newProject(done) {
  openForm({
    title: t('tracker.project.new_title'),
    fields: [
      { name: 'name', label: t('tracker.project.name'), required: true },
      { name: 'key', label: t('tracker.project.key'), hint: t('tracker.project.key_hint'), required: true },
    ],
    saveLabel: t('tracker.project.create'),
    onSave: async ({ name, key }) => {
      if (!name) return t('tracker.project.name_needed');
      const problem = keyProblem(key);
      if (problem) return problem;
      const id = await M.createProject({ name, key });
      done?.(id);
    },
  });
}

export function newItem(projectId, done) {
  const l = M.lists(projectId);
  const opts = (key) => l[key].map((x) => [x.v, x.v]);
  openForm({
    title: t('tracker.item.new_title', { project: M.project(projectId)?.name || '' }),
    fields: [
      { name: 'title', label: t('tracker.fields.title'), required: true },
      { name: 'kind', label: t('tracker.fields.kind'), type: 'select', options: opts('kind'), half: true },
      { name: 'priority', label: t('tracker.fields.priority'), type: 'select', options: opts('priority'), half: true },
      { name: 'area', label: t('tracker.fields.area'), type: 'select', options: opts('area'), half: true },
      { name: 'due', label: t('tracker.fields.due'), type: 'date', half: true },
      { name: 'body', label: t('tracker.fields.body'), type: 'textarea' },
    ],
    values: { priority: l.priority[Math.min(1, l.priority.length - 1)]?.v },
    saveLabel: t('tracker.item.create'),
    onSave: async (v) => {
      if (!v.title) return t('tracker.item.title_needed');
      const id = await M.createItem(projectId, v);
      done?.(id);
    },
  });
}

// One pick list: a row per value (name, and Closes or Inverse where the list has one), with move
// up, move down and remove, then an Add row. Changes stay in `draft` until Save.
function listEditor(key, draft, renames) {
  const box = h('div', { class: 'tw:flex tw:flex-col tw:gap-1' });
  const draw = () => {
    box.replaceChildren(...draft[key].map((entry, i) => {
      const name = input({ value: entry.v, 'aria-label': t('tracker.lists.value', { list: t(`tracker.lists.names.${key}`), n: String(i + 1) }), class: 'tw:flex-1' });
      const original = entry._was ?? entry.v;
      name.addEventListener('change', () => {
        entry.v = name.value.trim();
        if (original && entry.v && original !== entry.v) renames.set(`${key}\u0000${original}`, entry.v);
      });
      if (entry._was === undefined) entry._was = entry.v;
      let extra = null;
      if (key === 'status') {
        const closes = checkbox({ checked: !!entry.closed, id: `tr-l-${key}-${i}` });
        closes.addEventListener('change', () => { entry.closed = closes.checked; });
        extra = h('label', { class: 'tw:inline-flex tw:items-center tw:gap-1 tw:text-sm', for: `tr-l-${key}-${i}` }, closes, t('tracker.lists.closes'));
      }
      if (key === 'link') {
        const inv = input({ value: entry.inverse || '', placeholder: t('tracker.lists.inverse'), 'aria-label': t('tracker.lists.inverse'), class: 'tw:max-w-[10rem]' });
        inv.addEventListener('change', () => { entry.inverse = inv.value.trim(); });
        extra = inv;
      }
      const move = (d) => { const j = i + d; if (j < 0 || j >= draft[key].length) return; [draft[key][i], draft[key][j]] = [draft[key][j], draft[key][i]]; draw(); };
      return h('div', { class: 'tw:flex tw:flex-wrap tw:items-center tw:gap-1' }, name, extra,
        button('↑', { class: 'small', 'aria-label': t('tracker.lists.up', { name: entry.v }), onclick: () => move(-1) }),
        button('↓', { class: 'small', 'aria-label': t('tracker.lists.down', { name: entry.v }), onclick: () => move(1) }),
        button('×', { class: 'small', 'aria-label': t('tracker.lists.remove', { name: entry.v }), onclick: () => { draft[key].splice(i, 1); draw(); } }));
    }), h('div', {}, button(t('tracker.lists.add'), { class: 'small', onclick: () => { draft[key].push({ v: '', _was: '' }); draw(); box.querySelector('div:nth-last-child(2) input')?.focus(); } })));
  };
  draw();
  return h('details', { class: 'tw:border-t tw:border-line tw:pt-2' }, h('summary', {}, t(`tracker.lists.names.${key}`)), box);
}

export function editProject(projectId) {
  const p = M.project(projectId);
  if (!p) return;
  const draft = JSON.parse(JSON.stringify(M.lists(projectId)));
  const renames = new Map();
  const name = input({ id: 'tr-p-name', value: p.name });
  const key = input({ id: 'tr-p-key', value: p.key });
  const archived = checkbox({ id: 'tr-p-archived', checked: !!p.archived });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const save = button(t('common.save'), { variant: 'primary' });
  const body = h('div', { class: 'form' },
    h('div', { class: 'fields' },
      field(t('tracker.project.name'), name, null, { half: true }),
      field(t('tracker.project.key'), key, t('tracker.project.key_change_hint'), { half: true }),
      field(t('tracker.project.archived'), archived, t('tracker.project.archived_hint'))),
    h('h3', {}, t('tracker.lists.heading')),
    h('p', { class: 'note' }, t('tracker.lists.intro')),
    ...M.LIST_KEYS.map((k) => listEditor(k, draft, renames)),
    error,
    h('div', { class: 'form-actions' }, save));
  const dlg = openDialog(t('tracker.project.settings_title', { name: p.name }), body, { wide: true });
  save.addEventListener('click', async () => {
    const newKey = key.value.trim();
    const problem = !name.value.trim() ? t('tracker.project.name_needed') : keyProblem(newKey, projectId);
    if (problem) { error.textContent = problem; return; }
    const lists = {};
    for (const k of M.LIST_KEYS) {
      lists[k] = draft[k].filter((x) => x.v).map((x) => { const c = { ...x }; delete c._was; return c; });
      if (!lists[k].length) { error.textContent = t('tracker.lists.empty_list', { list: t(`tracker.lists.names.${k}`) }); return; }
    }
    if (!lists.status.some((s) => s.closed) || lists.status.every((s) => s.closed)) { error.textContent = t('tracker.lists.status_rule'); return; }
    save.disabled = true;
    try {
      await M.saveProject(projectId, { ...strip(M.project(projectId)), name: name.value.trim(), key: newKey.toUpperCase(), archived: archived.checked, lists });
      for (const [k, to] of renames) {
        const [list, from] = k.split('\u0000');
        await M.renameValue(projectId, list, from, to);
      }
      dlg.close();
    } catch (err) {
      fail(err);
      save.disabled = false;
    }
  });
}

const strip = ({ id, ...data }) => data; // The id lives in the row, not the payload.
