import * as store from '../store.js';
import { GUARD_TEXT, PLAN, PLAN_FIRST, PLAN_VARIANTS, SERVICES } from '../content.js';
import { button, callout, chip, disclosure, field, linkRow, playRing, plainLink, progress, select } from '../ui.js';
import { mdEditor, mdField } from '../mdeditor.js';
import { plainText } from '../markdown.js';
import { t } from '../text.js';
import { fmtTime, h, openDialog, toast, withPhoneLinks, put } from '../util.js';
import { dropFab, fabSheet } from '../sheet.js';
import { PHONE, jump, watchPhone } from './lists.js';

export const live = false;
export const leave = dropFab;

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

// A section's note, guard line and boxes, as nodes. The same on every width.
function sectionBody(s, plan, status, editors, recount) {
  return [
    s.note && h('p', { class: 'hint' }, s.note),
    s.guard && store.settings().showGuard && callout(GUARD_TEXT, { kind: 'neutral', icon: 'tabler/lock' }),
    s.boxes.map((b) => {
      const ed = mdEditor({
        id: `box-${b.k}`, rows: 4, value: plan.answers[b.k] || '', label: b.q,
        onInput: (v) => { plan.answers[b.k] = v; recount(); queueSave(plan, status); },
      });
      editors[b.k] = ed;
      return mdField(b.q, ed, b.eg && t('plan.example', { eg: b.eg }));
    }),
  ];
}

// Below 40rem My plan follows pattern C: chips for each section (they open it and scroll to it), the next
// box to write as the lead card, the sections folded up (the one with the next box open), and a sheet with
// the plan card and a list of sections. State of the fold-ups is kept while the screen redraws.
const folds = {};

function renderPhone(root, plan, sections, boxes, next, status, bar, editors, recount) {
  const sectionOf = (k) => sections.find((s) => s.boxes.some((b) => b.k === k));
  const nextSec = next ? sectionOf(next.k) : sections[0];
  const goBox = (k) => {
    const sec = sectionOf(k);
    jump(`sec-${sec.n}`);
    const ed = editors[k];
    requestAnimationFrame(() => { ed.node.scrollIntoView({ block: 'center' }); ed.focus(); });
  };
  put(root,
    h('header', { class: 'page-head', 'data-plan': '' }, h('h1', {}, t('plan.title')), h('div', { class: 'actions' }, status)),
    bar,
    h('nav', { class: 'ribbon', 'aria-label': t('plan.phone.ribbon') },
      sections.map((s) => {
        const c = chip(s.title, { onclick: () => jump(`sec-${s.n}`) });
        c.removeAttribute('aria-pressed');
        return c;
      })),
    h('section', { class: 'plan-lead', 'aria-label': t('plan.phone.lead') },
      h('p', { class: 'tasks-lead-label' }, t('plan.phone.lead_label')),
      next
        ? h('div', { class: 'plan-lead-row' }, h('p', { class: 'plan-lead-q' }, next.q), playRing({ label: t('plan.phone.write'), onclick: () => goBox(next.k) }))
        : h('p', { class: 'note' }, t('plan.phone.all_written'))),
    sections.map((s) => {
      const open = s.n === nextSec.n;
      const done = s.boxes.filter((b) => (plan.answers[b.k] || '').trim()).length;
      const fold = disclosure(t('plan.section_heading', { n: s.n, title: s.title }), sectionBody(s, plan, status, editors, recount), {
        id: `sec-${s.n}`, badge: h('span', { class: 'meta' }, t('plan.phone.section_count', { done, total: s.boxes.length })),
        open: s.n in folds ? folds[s.n] : open, onToggle: (o) => { if (o === open) delete folds[s.n]; else folds[s.n] = o; },
      });
      fold.classList.add('plan-fold');
      return fold;
    }),
    h('p', { class: 'note' }, t('plan.review')),
    h('p', {}, plainLink(t('plan.switch'), {
      onclick: async () => { await store.save('plan', 'plan', { ...plan, variant: '' }, { silent: true }); render(root); },
    })));
  fabSheet({
    label: t('plan.phone.fab'),
    icon: 'tabler/lifebuoy',
    tabs: [
      { key: 'card', label: t('plan.phone.card_tab'), body: () => planCardBody() },
      { key: 'sections', label: t('plan.phone.sections_tab'), body: ({ close }) => h('div', { class: 'plan-sections' },
        h('p', { class: 'hint' }, t('plan.phone.sections_hint')),
        h('ul', { class: 'list links' }, sections.map((s) => h('li', {}, (() => {
          const row = linkRow({ title: t('plan.section_heading', { n: s.n, title: s.title }), href: `#/plan` });
          row.addEventListener('click', (ev) => { ev.preventDefault(); close(); jump(`sec-${s.n}`); });
          return row;
        })())))) },
    ],
  });
}

export function render(root) {
  dropFab();
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
  const jumpSel = select(sections.map((s) => [String(s.n), t('plan.section_heading', { n: s.n, title: s.title })]), {
    id: 'plan-jump', 'aria-label': t('plan.jump'),
    onchange: (e) => document.getElementById(`sec-${e.target.value}`)?.scrollIntoView({ block: 'start' }),
  });
  const editors = {};
  const next = [...PLAN_FIRST.map((k) => boxes.find((b) => b.k === k)).filter(Boolean), ...boxes].find((b) => !(plan.answers[b.k] || '').trim());

  if (document.body.dataset.view === 'plan') {
    const mq = window.matchMedia(PHONE);
    watchPhone(root, mq, { render }, '[data-plan]');
    if (mq.matches) return renderPhone(root, plan, sections, boxes, next, status, bar, editors, recount);
  }
  put(root, 
    h('header', { class: 'page-head', 'data-plan': '' }, h('h1', {}, t('plan.title')), h('div', { class: 'actions' }, status, button(t('plan.card_button'), { variant: 'primary', onclick: openPlanCard }))),
    bar,
    field(t('plan.jump'), jumpSel, null, { half: true }),
    h('p', { class: 'note' }, t('plan.fill_intro')),
    next && h('p', { class: 'nudge' }, t('plan.next_box'), plainLink(next.q, { href: `#box-${next.k}`, onclick: (e) => { e.preventDefault(); const ed = editors[next.k]; ed.node.scrollIntoView({ block: 'center' }); ed.focus(); } })),
    sections.map((s) => h('section', { class: 'plan-sec', id: `sec-${s.n}` },
      h('h2', {}, t('plan.section_heading', { n: s.n, title: s.title })),
      sectionBody(s, plan, status, editors, recount))),
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
