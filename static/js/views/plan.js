import * as store from '../store.js';
import { GUARD_TEXT, PLAN, PLAN_FIRST, PLAN_VARIANTS, SERVICES } from '../content.js';
import { button, field, textarea } from '../ui.js';
import { t } from '../text.js';
import { closeTabOf } from '../pane.js';
import { h, openDialog, toast, withPhoneLinks, put } from '../util.js';

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
        status.textContent = t('plan.status_saved');
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
  const status = h('span', { class: 'meta', role: 'status' }, '');
  const count = h('span', { class: 'meta' });
  const recount = () => { count.textContent = t('plan.count', { done: boxes.filter((b) => (plan.answers[b.k] || '').trim()).length, total: boxes.length }); };
  recount();
  const next = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes].find((b) => !(plan.answers[b.k] || '').trim());

  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, t('plan.title')), h('div', { class: 'actions' }, status, button(t('plan.card_button'), { variant: 'primary', onclick: openPlanCard }))),
    h('p', { class: 'note' }, t('plan.fill_intro'), count, '.'),
    next && h('p', { class: 'nudge' }, t('plan.next_box'), h('a', { href: `#box-${next.k}`, onclick: (e) => { e.preventDefault(); const el = document.getElementById(`box-${next.k}`); el.scrollIntoView({ block: 'center' }); el.focus(); } }, next.q)),
    sections.map((s) => h('section', { class: 'plan-sec' },
      h('h2', {}, t('plan.section_heading', { n: s.n, title: s.title })),
      s.note && h('p', { class: 'hint' }, s.note),
      s.guard && store.settings().showGuard && h('p', { class: 'guard' }, GUARD_TEXT),
      s.boxes.map((b) => field(b.q, textarea({
        id: `box-${b.k}`, rows: 4, value: plan.answers[b.k] || '',
        oninput: (e) => { plan.answers[b.k] = e.target.value; recount(); queueSave(plan, status); },
      }), b.eg && t('plan.example', { eg: b.eg }))))),
    h('p', { class: 'note' }, t('plan.review')),
    h('p', {}, button(t('plan.switch'), {
      onclick: async () => { await store.save('plan', 'plan', { ...plan, variant: '' }, { silent: true }); render(root); },
    })),
  );
}

// The plan card's content: what you wrote, plus the services list. The Bridge shows it in a widget.
export function planCardBody() {
  const a = store.plan().answers;
  const block = (title, text, { phones = false } = {}) => h('section', {},
    h('h3', {}, title),
    (text || '').trim()
      ? h('p', { class: 'own' }, phones ? withPhoneLinks(text.trim()) : text.trim())
      : h('p', { class: 'empty' }, t('plan.card.empty')));
  const body = h('div', { class: 'card-body' },
    block(t('plan.card.signs'), a.signs),
    block(t('plan.card.instead'), a.instead),
    block(t('plan.card.team'), a.team, { phones: true }),
    block(t('plan.card.slip'), a.slip),
    block(t('plan.card.matters'), a.good_matters),
    h('section', {}, h('h3', {}, t('plan.card.services')),
      h('ul', { class: 'services' }, SERVICES.map((s) => h('li', {},
        h('a', { href: `tel:${s.number.replace(/\s+/g, '')}` }, `${s.name} ${s.number}`), s.note && h('small', {}, s.note))))),
    h('p', {}, h('a', { href: '#/plan', onclick: (e) => { if (!closeTabOf(e.currentTarget)) document.querySelector('dialog[open]')?.close(); } }, t('plan.card.edit'))),
  );
  return body;
}

// The part you carry: one tap from anywhere.
export function openPlanCard() {
  openDialog(t('plan.card.title'), planCardBody(), { wide: true, key: 'plan-card' });
}
