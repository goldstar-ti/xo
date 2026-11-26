import * as store from '../store.js';
import { BODY_CHIPS, DAY_CHIPS, GUARD_TEXT, SLEEP_CHIPS, WEEKLY_QUESTIONS } from '../content.js';
import { addDays, fmtDay, fmtLong, h, toast, today, withPhoneLinks, put } from '../util.js';
import { button, chip, textarea } from '../ui.js';
import { t, text } from '../text.js';
import { checkinId, dayEntries } from './today.js';
import { openPlanCard } from './plan.js';

const SIGNS = text('checkin.signs_chips');
const FUEL = text('checkin.fuel_chips');

export const live = false;

function chips(options, state, name, { multi = true, onchange } = {}) {
  const wrap = h('div', { class: 'chips', role: 'group' });
  const draw = () => {
    wrap.replaceChildren(...options.map((opt) => {
      const on = multi ? (state[name] || []).includes(opt) : state[name] === opt;
      return chip(opt, {
        pressed: on,
        onclick: () => {
          if (multi) {
            const set = new Set(state[name] || []);
            set.has(opt) ? set.delete(opt) : set.add(opt);
            state[name] = [...set];
          } else state[name] = on ? '' : opt;
          draw();
          onchange?.();
        },
      });
    }));
  };
  draw();
  return wrap;
}

function textBox(state, name, label, { rows = 3, placeholder = '' } = {}) {
  return textarea({ rows, placeholder, value: state[name] || '', 'aria-label': label, oninput: (e) => { state[name] = e.target.value; } });
}

const q = (label, control, hint) => h('div', { class: 'question' }, h('h2', {}, label), hint && h('p', { class: 'hint' }, hint), control);

function saveBar(type, day, state) {
  const btn = button(t('checkin.save'), { variant: 'primary', class: 'big' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await store.save('checkin', checkinId(type, day), { ...state, type, at: new Date().toISOString() }, { day });
      toast(t('checkin.saved_toast'));
      location.hash = '#/today';
    } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  });
  return h('div', { class: 'savebar' }, btn);
}

function morning(root, day, state) {
  const plan = store.plan();
  const picked = store.byKind('task').filter((task) => task.data.today === day).length;
  put(root, 
    q(t('checkin.morning.sleep'), chips(SLEEP_CHIPS, state, 'sleep', { multi: false })),
    q(t('checkin.morning.body'), chips(BODY_CHIPS, state, 'body'), t('checkin.morning.body_hint')),
    q(t('checkin.morning.fuel'), chips(FUEL, state, 'fuel', { multi: false }), t('checkin.morning.fuel_hint')),
    q(t('checkin.morning.goodlife'), textBox(state, 'goodlife', t('checkin.morning.goodlife'), { rows: 2 }),
      plan.answers.good_ways ? t('checkin.morning.from_plan', { text: plan.answers.good_ways }) : ''),
    h('p', { class: 'note' }, picked ? t('checkin.morning.picked', { n: picked }) : t('checkin.morning.none_picked'), h('a', { href: '#/tasks' }, t('checkin.morning.choose_tasks'))),
    saveBar('morning', day, state),
  );
}

function signsBlock(state) {
  const plan = store.plan();
  const signs = (plan.answers.signs || '').trim();
  if (!signs)
    return q(t('checkin.signs.heading'), h('p', { class: 'note' }, t('checkin.signs.not_written'), h('a', { href: '#/plan' }, t('checkin.signs.open_plan'))));
  const extra = h('div', { class: 'reveal' });
  const draw = () => {
    extra.replaceChildren();
    if (state.signs !== SIGNS[1] && state.signs !== SIGNS[2]) return;
    const team = (plan.answers.team || '').trim();
    put(extra, 
      h('h3', {}, t('checkin.signs.instead')),
      h('p', { class: 'own' }, (plan.answers.instead || '').trim() || t('checkin.signs.instead_missing')),
      h('h3', {}, t('checkin.signs.people')),
      h('p', { class: 'own' }, team ? withPhoneLinks(team) : t('checkin.signs.people_missing')),
      button(t('checkin.signs.open_card'), { onclick: openPlanCard }),
      h('h3', {}, t('checkin.signs.action')),
      textBox(state, 'signsAction', t('checkin.signs.action'), { rows: 3 }),
      store.settings().showGuard && h('p', { class: 'hint' }, GUARD_TEXT),
    );
  };
  draw();
  return q(t('checkin.signs.question'),
    h('div', {}, h('p', { class: 'own' }, signs), chips(SIGNS, state, 'signs', { multi: false, onchange: draw }), extra),
    t('checkin.signs.hint'));
}

function evening(root, day, state) {
  const entries = dayEntries(day).filter((e) => e.kind === 'tick');
  const ticked = entries.filter((e) => e.done).length;
  const three = store.byKind('task').filter((task) => task.data.today === day);
  const summary = [
    entries.length && t('checkin.evening.routine', { done: ticked, total: entries.length }),
    three.length && t('checkin.evening.three', { done: three.filter((task) => task.data.done).length, total: three.length }),
  ].filter(Boolean).join('. ');
  put(root, 
    summary && h('p', { class: 'note' }, summary + '.'),
    q(t('checkin.evening.did'), chips(DAY_CHIPS, state, 'did'), t('checkin.evening.did_hint')),
    q(t('checkin.evening.body'), chips(BODY_CHIPS, state, 'body')),
    store.settings().logSigns && signsBlock(state),
    q(t('checkin.evening.ok'), textBox(state, 'ok', t('checkin.evening.ok'), { rows: 2 }), t('checkin.evening.ok_hint')),
    q(t('checkin.evening.first'), textBox(state, 'first', t('checkin.evening.first'), { rows: 2 })),
    saveBar('evening', day, state),
  );
}

function weekly(root, day, state) {
  const week = [...Array(7)].map((_, i) => addDays(day, -i));
  const evenings = week.map((d) => store.get(checkinId('evening', d))).filter(Boolean);
  const flagged = evenings.filter((c) => c.data.signs === SIGNS[1] || c.data.signs === SIGNS[2]).length;
  put(root, 
    h('p', { class: 'note' }, t('checkin.weekly.summary', { done: evenings.length, flagged, days: t(flagged === 1 ? 'checkin.weekly.day_one' : 'checkin.weekly.day_other') })),
    WEEKLY_QUESTIONS.map((item, i) => q(t('checkin.numbered', { n: i + 1, text: item.q }), textBox(state, item.k, item.q, { rows: 3 }))),
    store.settings().showGuard && h('p', { class: 'hint' }, GUARD_TEXT),
    saveBar('weekly', day, state),
  );
}

function landing(root) {
  const day = today();
  const days = [...Array(14)].map((_, i) => addDays(day, -i));
  const mark = (type, d) => (store.get(checkinId(type, d)) ? h('a', { href: `#/checkin/${type}/${d}`, class: 'yes' }, t('checkin.landing.done')) : h('a', { href: `#/checkin/${type}/${d}`, class: 'no' }, t('checkin.landing.open')));
  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, t('checkin.landing.heading'))),
    h('div', { class: 'stack' },
      h('a', { class: 'primary big', href: '#/checkin/morning' }, t('checkin.landing.morning')),
      h('a', { class: 'primary big', href: '#/checkin/evening' }, t('checkin.landing.evening')),
      h('a', { class: 'ghost big', href: '#/checkin/weekly' }, t('checkin.landing.weekly'))),
    h('section', {}, h('h2', {}, t('checkin.landing.last_14')),
      h('table', { class: 'history' },
        h('thead', {}, h('tr', {}, h('th', {}, t('checkin.landing.day')), h('th', {}, t('checkin.landing.col_morning')), h('th', {}, t('checkin.landing.col_evening')))),
        h('tbody', {}, days.map((d) => h('tr', {}, h('td', {}, fmtDay(d)), h('td', {}, mark('morning', d)), h('td', {}, mark('evening', d))))))),
  );
}

export function render(root, type, dayParam) {
  if (!['morning', 'evening', 'weekly'].includes(type)) return landing(root);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam || '') ? dayParam : today();
  const existing = store.get(checkinId(type, day));
  const state = existing ? structuredClone(existing.data) : {};
  const title = t(`checkin.title.${type}`);
  put(root, h('header', { class: 'page-head' }, h('h1', {}, title), h('p', { class: 'meta' }, fmtLong(day) + (existing ? t('checkin.saved_suffix') : ''))));
  const body = h('div', { class: 'checkin' });
  put(root, body);
  ({ morning, evening, weekly })[type](body, day, state);
}
