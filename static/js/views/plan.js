import * as store from '../store.js';
import { GUARD_TEXT, PLAN, PLAN_FIRST, PLAN_VARIANTS, SERVICES } from '../content.js';
import { button, callout, disclosure, field, plainLink, progress, select } from '../ui.js';
import { mdEditor, mdField } from '../mdeditor.js';
import { plainText } from '../markdown.js';
import { t } from '../text.js';
import { fmtTime, h, openDialog, toast, withPhoneLinks, put } from '../util.js';

export const live = false;

let saveTimer;
let saving = Promise.resolve();
function queueSave(plan, status) {
  clearTimeout(saveTimer);
  status.textContent = t('plan.status_unsaved');
  saveTimer = setTimeout(() => {
    saving = saving.then(async () => {
      try {
        await store.save('plan', 'plan', plan, { silent: true });
        status.textContent = t('plan.status_saved', { time: fmtTime(new Date()) });
      } catch (err) {
        status.textContent = t('plan.status_failed');
        toast(err.message, 'bad');
      }
    });
  }, 900);
}

function chooser(root, plan) {
  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, t('plan.title'))),
    h('p', { class: 'note' }, t('plan.choose_intro')),
    h('div', { class: 'stack' }, Object.entries(PLAN_VARIANTS).map(([k, label]) =>
      button(label, {
        class: 'big',
        onclick: async () => {
          try { await store.save('plan', 'plan', { ...plan, variant: k }, { silent: true }); render(root); }
          catch (err) { toast(err.message, 'bad'); }
        },
      }))),
  );
}

export function render(root) {
  root.replaceChildren();
  const plan = store.plan();
  if (!plan.variant) return chooser(root, plan);
  const sections = PLAN[plan.variant];
  const boxes = sections.flatMap((s) => s.boxes);
  const status = h('span', { class: 'meta', role: 'status' }, t('plan.status_idle'));
  const count = h('span', { class: 'meta' });
  const bar = h('div', { class: 'plan-progress' });
  const recount = () => {
    const done = boxes.filter((b) => (plan.answers[b.k] || '').trim()).length;
    count.textContent = t('plan.progress_of', { done, total: boxes.length });
    bar.replaceChildren(progress(done / boxes.length, t('plan.progress_label')), count);
  };
  recount();
  const jump = select(sections.map((s) => [String(s.n), t('plan.section_heading', { n: s.n, title: s.title })]), {
    id: 'plan-jump', 'aria-label': t('plan.jump'),
    onchange: (e) => document.getElementById(`sec-${e.target.value}`)?.scrollIntoView({ block: 'start' }),
  });
  const editors = {};
  const next = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes].find((b) => !(plan.answers[b.k] || '').trim());

  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, t('plan.title')), h('div', { class: 'actions' }, status, button(t('plan.card_button'), { variant: 'primary', onclick: openPlanCard }))),
    bar,
    field(t('plan.jump'), jump, null, { half: true }),
    h('p', { class: 'note' }, t('plan.fill_intro')),
    next && h('p', { class: 'nudge' }, t('plan.next_box'), plainLink(next.q, { href: `#box-${next.k}`, onclick: (e) => { e.preventDefault(); const ed = editors[next.k]; ed.node.scrollIntoView({ block: 'center' }); ed.focus(); } })),
    sections.map((s) => h('section', { class: 'plan-sec', id: `sec-${s.n}` },
      h('h2', {}, t('plan.section_heading', { n: s.n, title: s.title })),
      s.note && h('p', { class: 'hint' }, s.note),
      s.guard && store.settings().showGuard && callout(GUARD_TEXT, { kind: 'neutral', icon: 'tabler/lock' }),
      s.boxes.map((b) => {
        const ed = mdEditor({
          id: `box-${b.k}`, rows: 4, value: plan.answers[b.k] || '', label: b.q,
          onInput: (v) => { plan.answers[b.k] = v; recount(); queueSave(plan, status); },
        });
        editors[b.k] = ed;
        return mdField(b.q, ed, b.eg && t('plan.example', { eg: b.eg }));
      }))),
    h('p', { class: 'note' }, t('plan.review')),
    h('p', {}, plainLink(t('plan.switch'), {
      onclick: async () => { await store.save('plan', 'plan', { ...plan, variant: '' }, { silent: true }); render(root); },
    })),
  );
}

// The body of the plan card: the part you carry. Returns one node.
export function planCardBody() {
  const a = store.plan().answers;
  const block = (title, text, { phones = false } = {}) => h('section', {},
    h('h3', {}, title),
    plainText(text).trim()
      ? h('p', { class: 'own' }, phones ? withPhoneLinks(plainText(text).trim()) : plainText(text).trim())
      : h('p', { class: 'empty' }, t('plan.card.empty')));
  return h('div', { class: 'card-body' },
    block(t('plan.card.signs'), a.signs),
    block(t('plan.card.instead'), a.instead),
    block(t('plan.card.team'), a.team, { phones: true }),
    block(t('plan.card.slip'), a.slip),
    block(t('plan.card.matters'), a.good_matters),
    disclosure(t('plan.card.services_title', { n: SERVICES.length }),
      h('ul', { class: 'services' }, SERVICES.map((s) => h('li', {},
        h('a', { href: `tel:${s.number.replace(/\s+/g, '')}` }, `${s.name} ${s.number}`), s.note && h('small', {}, s.note))))),
    h('p', {}, plainLink(t('plan.card.edit'), { href: '#/plan', onclick: () => document.querySelector('dialog[open]')?.close() })),
  );
}

// The part you carry: one tap from anywhere.
export function openPlanCard() {
  openDialog(t('plan.card.title'), planCardBody(), { wide: true, pane: true, key: 'plan-card' });
}
