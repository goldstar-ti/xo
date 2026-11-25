import * as store from '../store.js';
import { GUARD_TEXT, PLAN, PLAN_FIRST, PLAN_VARIANTS, SERVICES } from '../content.js';
import { h, openDialog, toast, withPhoneLinks, put } from '../util.js';

export const live = false;

let saveTimer;
let saving = Promise.resolve();
function queueSave(plan, status) {
  clearTimeout(saveTimer);
  status.textContent = 'Not saved yet';
  saveTimer = setTimeout(() => {
    saving = saving.then(async () => {
      try {
        await store.save('plan', 'plan', plan, { silent: true });
        status.textContent = 'Saved';
      } catch (err) {
        status.textContent = 'Not saved';
        toast(err.message, 'bad');
      }
    });
  }, 900);
}

function chooser(root, plan) {
  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, 'My plan')),
    h('p', { class: 'note' }, 'The Relapse Prevention Plan comes in two versions. Choose the one you are working from. You can switch later and nothing you have written is lost.'),
    h('div', { class: 'stack' }, Object.entries(PLAN_VARIANTS).map(([k, label]) =>
      h('button', {
        class: 'ghost big', type: 'button',
        onclick: async () => {
          try { await store.save('plan', 'plan', { ...plan, variant: k }, { silent: true }); render(root); }
          catch (err) { toast(err.message, 'bad'); }
        },
      }, label))),
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
  const recount = () => { count.textContent = `${boxes.filter((b) => (plan.answers[b.k] || '').trim()).length} of ${boxes.length} boxes written`; };
  recount();
  const next = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes].find((b) => !(plan.answers[b.k] || '').trim());

  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, 'My plan'), h('div', { class: 'actions' }, status, h('button', { class: 'primary', type: 'button', onclick: openPlanCard }, 'Plan card'))),
    h('p', { class: 'note' }, 'Fill in the good life and support sections before the risk sections. One box in a sitting is enough. ', count, '.'),
    next && h('p', { class: 'nudge' }, 'Next box: ', h('a', { href: `#box-${next.k}`, onclick: (e) => { e.preventDefault(); const el = document.getElementById(`box-${next.k}`); el.scrollIntoView({ block: 'center' }); el.focus(); } }, next.q)),
    sections.map((s) => h('section', { class: 'plan-sec' },
      h('h2', {}, `${s.n}. ${s.title}`),
      s.note && h('p', { class: 'hint' }, s.note),
      s.guard && store.settings().showGuard && h('p', { class: 'guard' }, GUARD_TEXT),
      s.boxes.map((b) => h('div', { class: 'field' },
        h('label', { for: `box-${b.k}` }, b.q),
        h('textarea', {
          id: `box-${b.k}`, rows: 4, value: plan.answers[b.k] || '',
          oninput: (e) => { plan.answers[b.k] = e.target.value; recount(); queueSave(plan, status); },
        }),
        b.eg && h('small', {}, `Example: ${b.eg}`))))),
    h('p', { class: 'note' }, 'Review and update it regularly, with your psychologist.'),
    h('p', {}, h('button', {
      class: 'ghost', type: 'button',
      onclick: async () => { await store.save('plan', 'plan', { ...plan, variant: '' }, { silent: true }); render(root); },
    }, 'Switch plan version')),
  );
}

// The part you carry: one tap from anywhere.
export function openPlanCard() {
  const a = store.plan().answers;
  const block = (title, text, { phones = false } = {}) => h('section', {},
    h('h3', {}, title),
    (text || '').trim()
      ? h('p', { class: 'own' }, phones ? withPhoneLinks(text.trim()) : text.trim())
      : h('p', { class: 'empty' }, 'Not written yet.'));
  const body = h('div', { class: 'card-body' },
    block('My early warning signs', a.signs),
    block('What I do instead', a.instead),
    block('People I can call', a.team, { phones: true }),
    block('If I have a slip: my first three steps', a.slip),
    block('What matters most to me', a.good_matters),
    h('section', {}, h('h3', {}, 'Services'),
      h('ul', { class: 'services' }, SERVICES.map((s) => h('li', {},
        h('a', { href: `tel:${s.number.replace(/\s+/g, '')}` }, `${s.name} ${s.number}`), s.note && h('small', {}, s.note))))),
    h('p', {}, h('a', { href: '#/plan', onclick: () => document.querySelector('dialog[open]')?.close() }, 'Edit my plan')),
  );
  openDialog('My plan card', body, { wide: true });
}
