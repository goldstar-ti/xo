import * as store from '../store.js';
import { GUARD_TEXT, WEEKLY_QUESTIONS } from '../content.js';
import * as lookups from '../lookups.js';
import { addDays, fmtDay, fmtDuration, fmtLong, h, toast, today, withPhoneLinks, ymd, put } from '../util.js';
import { allTasks, pickTask, saveTask } from '../taskdata.js';
import { button, callout, checkbox, chip, field, segmented, tag } from '../ui.js';
import { mdEditor } from '../mdeditor.js';
import { plainText } from '../markdown.js';
import { isOn } from '../modules.js';
import { t, text } from '../text.js';
import { customEditor } from '../customfields.js';
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

// Tick boxes for a list of choices that can all be true at once.
function checks(options, state, name) {
  const wrap = h('div', { class: 'checks', role: 'group' });
  options.forEach((opt) => {
    const box = checkbox({
      checked: (state[name] || []).includes(opt),
      onchange: (e) => {
        const set = new Set(state[name] || []);
        e.target.checked ? set.add(opt) : set.delete(opt);
        state[name] = [...set];
      },
    });
    wrap.append(field(opt, box));
  });
  return wrap;
}

// Chips for an editable lookup list, under its group names when the list has groups and the
// setting is on. A saved answer that is no longer in the list still shows, so it can be seen and cleared.
function lookupChips(key, state, name, opts = {}) {
  const { as = chips } = opts;
  const rows = lookups.rows(key);
  const known = new Set(rows.map((r) => r.text));
  const extra = [].concat(state[name] || []).filter((v) => v && !known.has(v));
  if (!lookups.grouped(key)) return as([...known, ...extra], state, name, opts);
  const names = lookups.groupNames();
  const sets = Object.entries(names).map(([g, label]) => [label, rows.filter((r) => r.group === g).map((r) => r.text)]);
  const loose = rows.filter((r) => !(r.group in names)).map((r) => r.text);
  if (loose.length) sets[sets.length - 1]?.[1].push(...loose);
  if (extra.length) sets.push([t('checkin.earlier'), extra]);
  if (!store.settings().groupHeadings) return as(sets.flatMap(([, list]) => list), state, name, opts);
  return h('div', { class: 'chip-groups' }, sets.filter(([, list]) => list.length).map(([label, list]) =>
    h('div', { class: 'chip-group' }, h('h3', {}, label), as(list, state, name, opts))));
}

function textBox(state, name, label, { rows = 3 } = {}) {
  return mdEditor({ rows, value: state[name] || '', label, onInput: (v) => { state[name] = v; } }).node;
}

// The custom fields for check-ins, as a section above the save bar. Nothing when none are defined.
function customSection(state) {
  const editor = customEditor('checkin', state.custom || {}, (c) => { state.custom = c; });
  return editor && h('section', { class: 'question' }, h('h2', {}, t('fields.kinds.checkin')), editor);
}

const q = (label, control, hint) => h('div', { class: 'question' }, h('h2', {}, label), hint && h('p', { class: 'hint' }, hint), control);

function saveBar(type, day, state) {
  const btn = button(t('checkin.save'), { variant: 'primary', class: 'big' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await store.save('checkin', checkinId(type, day), { ...state, type, at: new Date().toISOString() }, { day });
      toast(t('checkin.saved_toast'));
      // On its own screen the check-in hands over to Today; as a canvas widget it stays put.
      if (location.hash.startsWith('#/checkin')) location.hash = '#/today';
    } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  });
  return h('div', { class: 'savebar pinned' }, btn);
}

function morning(root, day, state) {
  const plan = store.plan();
  const picked = store.byKind('task').filter((task) => task.data.today === day).length;
  put(root, 
    q(t('checkin.morning.sleep'), lookupChips('sleep', state, 'sleep', { multi: false })),
    q(t('checkin.morning.body'), lookupChips('body', state, 'body'), t('checkin.morning.body_hint')),
    q(t('checkin.morning.fuel'), chips(FUEL, state, 'fuel', { multi: false }), t('checkin.morning.fuel_hint')),
    q(t('checkin.morning.goodlife'), textBox(state, 'goodlife', t('checkin.morning.goodlife'), { rows: 2 }),
      plan.answers.good_ways ? t('checkin.morning.from_plan', { text: plainText(plan.answers.good_ways) }) : ''),
    h('p', { class: 'note' }, picked ? t('checkin.morning.picked', { n: picked }) : t('checkin.morning.none_picked'), h('a', { href: '#/tasks' }, t('checkin.morning.choose_tasks'))),
    customSection(state),
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
    const team = plainText(plan.answers.team).trim();
    put(extra, 
      callout([h('strong', {}, t('checkin.signs.instead')), h('p', { class: 'own' }, plainText(plan.answers.instead).trim() || t('checkin.signs.instead_missing'))], { kind: 'brand', icon: 'tabler/lifebuoy' }),
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
    h('div', {}, h('p', { class: 'own' }, signs), segmented(t('checkin.signs.heading'), SIGNS.map((v) => [v, v]), { value: state.signs, onchange: (v) => { state.signs = v; draw(); } }), extra),
    t('checkin.signs.hint'));
}

// The close-the-day step of the evening check-in. Every tap saves at once and redraws this section only.
function shutdown(day) {
  const tomorrow = addDays(day, 1);
  const wrap = h('section', { class: 'shutdown' });
  const fail = (err) => toast(err.message, 'bad');
  const redraw = () => draw();
  const act = (promise) => promise.then(redraw).catch(fail);
  const draw = () => {
    const all = allTasks().filter((i) => !i.data.archived);
    const open = all.filter((i) => i.data.today === day && !i.data.done);
    const plannedTomorrow = all.filter((i) => i.data.today === tomorrow && !i.data.done);
    const carry = (i) => {
      if (plannedTomorrow.length >= 3) { toast(t('forms.task.limit_tomorrow'), 'bad'); return; }
      act(saveTask(i.id, { ...i.data, today: tomorrow, at: '' }));
    };
    const needActual = all.filter((i) => i.data.done && i.data.doneAt && ymd(new Date(i.data.doneAt)) === day && i.data.est > 0 && !i.data.actual);
    const options = (est) => [...new Set([0.5, 1, 1.5, 2, 3].map((f) => Math.max(5, Math.round((est * f) / 5) * 5)))];
    const candidates = all.filter((i) => i.data.status === 'todo' && !i.data.today);
    wrap.replaceChildren();
    put(wrap,
      q(t('checkin.shutdown.heading'),
        open.length
          ? h('ul', { class: 'list' }, open.map((i) => h('li', {},
              h('span', { class: 'row-main' }, i.data.title),
              chip(t('checkin.shutdown.carry'), { class: 'small', onclick: () => carry(i) }),
              chip(t('checkin.shutdown.drop'), { class: 'small', onclick: () => act(saveTask(i.id, { ...i.data, today: '', at: '' })) }))))
          : h('p', { class: 'note' }, t('checkin.shutdown.none_open')),
        t('checkin.shutdown.carry_note')),
      needActual.length > 0 && q(t('checkin.shutdown.actual_heading'),
        h('ul', { class: 'list' }, needActual.map((i) => h('li', {},
          h('span', { class: 'row-main' }, i.data.title),
          options(i.data.est).map((mins) => chip(fmtDuration(mins), { class: 'small', onclick: () => act(saveTask(i.id, { ...i.data, actual: mins })) }))))),
        t('checkin.shutdown.actual_hint')),
      isOn('tasks.three') && q(t('checkin.shutdown.tomorrow_heading'),
        h('ul', { class: 'list' }, [...plannedTomorrow, ...candidates].map((i) => h('li', {},
          h('span', { class: 'row-main' }, i.data.title),
          chip(t(i.data.today === tomorrow ? 'checkin.shutdown.picked' : 'checkin.shutdown.pick'), { class: 'small', pressed: i.data.today === tomorrow, onclick: () => act(pickTask(i, tomorrow)) })))),
        t('checkin.shutdown.tomorrow_note', { n: plannedTomorrow.length })));
  };
  draw();
  return wrap;
}

function evening(root, day, state) {
  const entries = dayEntries(day).filter((e) => e.kind === 'tick');
  const ticked = entries.filter((e) => e.done).length;
  const three = isOn('tasks.three') ? store.byKind('task').filter((task) => task.data.today === day) : [];
  const summary = [
    entries.length && t('checkin.evening.routine', { done: ticked, total: entries.length }),
    three.length && t('checkin.evening.three', { done: three.filter((task) => task.data.done).length, total: three.length }),
  ].filter(Boolean).join('. ');
  put(root, 
    summary && h('p', { class: 'note' }, summary + '.'),
    store.settings().shutdown && isOn('tasks.closeday') && shutdown(day),
    q(t('checkin.evening.did'), lookupChips('did', state, 'did', { as: checks }), t('checkin.evening.did_hint')),
    q(t('checkin.evening.body'), lookupChips('body', state, 'body')),
    store.settings().logSigns && signsBlock(state),
    q(t('checkin.evening.ok'), textBox(state, 'ok', t('checkin.evening.ok'), { rows: 2 }), t('checkin.evening.ok_hint')),
    q(t('checkin.evening.first'), textBox(state, 'first', t('checkin.evening.first'), { rows: 2 })),
    customSection(state),
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
    store.settings().showGuard && callout(GUARD_TEXT, { kind: 'neutral', icon: 'tabler/lock' }),
    customSection(state),
    saveBar('weekly', day, state),
  );
}

function landing(root) {
  const day = today();
  const days = [...Array(10)].map((_, i) => addDays(day, -i));
  // A saved check-in shows "done", an earlier day with none shows "missed", and every cell links to that check-in.
  const mark = (type, d) => {
    const saved = !!store.get(checkinId(type, d));
    const badge = saved ? tag(t('checkin.landing.done'), 'accent') : d < day ? tag(t('checkin.landing.missed'), 'warning') : null;
    return h('span', { class: 'mark' }, badge, h('a', { href: `#/checkin/${type}/${d}`, class: saved ? 'yes' : 'no' }, t('checkin.landing.open')));
  };
  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, t('checkin.landing.heading'))),
    h('div', { class: 'stack' },
      h('a', { class: 'primary big', href: '#/checkin/morning' }, t('checkin.landing.morning')),
      h('a', { class: 'primary big', href: '#/checkin/evening' }, t('checkin.landing.evening')),
      h('a', { class: 'ghost big', href: '#/checkin/weekly' }, t('checkin.landing.weekly'))),
    h('section', {}, h('h2', {}, t('checkin.landing.last_10')),
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
