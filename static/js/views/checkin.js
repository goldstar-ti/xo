import * as store from '../store.js';
import { BODY_CHIPS, DAY_CHIPS, GUARD_TEXT, SLEEP_CHIPS, WEEKLY_QUESTIONS } from '../content.js';
import { addDays, fmtDay, fmtLong, h, toast, today, withPhoneLinks, put } from '../util.js';
import { checkinId, dayEntries } from './today.js';
import { openPlanCard } from './plan.js';

export const live = false;

function chips(options, state, name, { multi = true, onchange } = {}) {
  const wrap = h('div', { class: 'chips', role: 'group' });
  const draw = () => {
    wrap.replaceChildren(...options.map((opt) => {
      const on = multi ? (state[name] || []).includes(opt) : state[name] === opt;
      return h('button', {
        type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on),
        onclick: () => {
          if (multi) {
            const set = new Set(state[name] || []);
            set.has(opt) ? set.delete(opt) : set.add(opt);
            state[name] = [...set];
          } else state[name] = on ? '' : opt;
          draw();
          onchange?.();
        },
      }, opt);
    }));
  };
  draw();
  return wrap;
}

function textBox(state, name, { rows = 3, placeholder = '' } = {}) {
  return h('textarea', { rows, placeholder, value: state[name] || '', oninput: (e) => { state[name] = e.target.value; } });
}

const q = (label, control, hint) => h('div', { class: 'question' }, h('h2', {}, label), hint && h('p', { class: 'hint' }, hint), control);

function saveBar(type, day, state) {
  const btn = h('button', { class: 'primary big', type: 'button' }, 'Save check-in');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await store.save('checkin', checkinId(type, day), { ...state, type, at: new Date().toISOString() }, { day });
      toast('Check-in saved');
      location.hash = '#/today';
    } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  });
  return h('div', { class: 'savebar' }, btn);
}

function morning(root, day, state) {
  const plan = store.plan();
  const picked = store.byKind('task').filter((t) => t.data.today === day).length;
  put(root, 
    q('About how much sleep did you get?', chips(SLEEP_CHIPS, state, 'sleep', { multi: false })),
    q('What is your body doing right now?', chips(BODY_CHIPS, state, 'body'), 'Pick any that fit. No need to name a feeling.'),
    q('Have you eaten or had water yet?', chips(['both', 'one of them', 'neither yet'], state, 'fuel', { multi: false }), 'If not, do that before the next thing.'),
    q('One thing I am doing today that belongs to the life I want', textBox(state, 'goodlife', { rows: 2 }),
      plan.answers.good_ways ? `From your plan: ${plan.answers.good_ways}` : ''),
    h('p', { class: 'note' }, picked ? `Today’s three: ${picked} chosen. ` : 'No tasks chosen for today yet. ', h('a', { href: '#/tasks' }, 'Choose tasks')),
    saveBar('morning', day, state),
  );
}

function signsBlock(state) {
  const plan = store.plan();
  const signs = (plan.answers.signs || '').trim();
  if (!signs)
    return q('Early warning signs', h('p', { class: 'note' }, 'Your early warning signs are not written yet. That is box 6 of your plan. ', h('a', { href: '#/plan' }, 'Open my plan')));
  const extra = h('div', { class: 'reveal' });
  const draw = () => {
    extra.replaceChildren();
    if (state.signs !== 'yes' && state.signs !== 'not sure') return;
    const team = (plan.answers.team || '').trim();
    put(extra, 
      h('h3', {}, 'What I do instead'),
      h('p', { class: 'own' }, (plan.answers.instead || '').trim() || 'Not written yet. That is box 7 of your plan.'),
      h('h3', {}, 'People I can call'),
      h('p', { class: 'own' }, team ? withPhoneLinks(team) : 'Not written yet. That is box 9 of your plan.'),
      h('button', { class: 'ghost', type: 'button', onclick: openPlanCard }, 'Open my plan card'),
      h('h3', {}, 'What I did, or will do, about it'),
      textBox(state, 'signsAction', { rows: 3 }),
      store.settings().showGuard && h('p', { class: 'hint' }, GUARD_TEXT),
    );
  };
  draw();
  return q('Did any of your early warning signs turn up today?',
    h('div', {}, h('p', { class: 'own' }, signs), chips(['no', 'yes', 'not sure'], state, 'signs', { multi: false, onchange: draw }), extra),
    'Noticing early is the point. A yes here is the plan working.');
}

function evening(root, day, state) {
  const entries = dayEntries(day).filter((e) => e.kind === 'tick');
  const ticked = entries.filter((e) => e.done).length;
  const three = store.byKind('task').filter((t) => t.data.today === day);
  const summary = [
    entries.length && `Routine: ${ticked} of ${entries.length} ticked`,
    three.length && `Today’s three: ${three.filter((t) => t.data.done).length} of ${three.length} done`,
  ].filter(Boolean).join('. ');
  put(root, 
    summary && h('p', { class: 'note' }, summary + '.'),
    q('Today I…', chips(DAY_CHIPS, state, 'did'), 'Pick everything that happened. Plain facts, no scoring.'),
    q('What is your body doing right now?', chips(BODY_CHIPS, state, 'body')),
    store.settings().logSigns && signsBlock(state),
    q('One thing that went all right today', textBox(state, 'ok', { rows: 2 }), 'Small counts.'),
    q('The first thing I will do tomorrow', textBox(state, 'first', { rows: 2 })),
    saveBar('evening', day, state),
  );
}

function weekly(root, day, state) {
  const week = [...Array(7)].map((_, i) => addDays(day, -i));
  const evenings = week.map((d) => store.get(checkinId('evening', d))).filter(Boolean);
  const flagged = evenings.filter((c) => c.data.signs === 'yes' || c.data.signs === 'not sure').length;
  put(root, 
    h('p', { class: 'note' }, `This week: ${evenings.length} of 7 evening check-ins done. Warning signs noted on ${flagged} ${flagged === 1 ? 'day' : 'days'}.`),
    WEEKLY_QUESTIONS.map((item, i) => q(`${i + 1}. ${item.q}`, textBox(state, item.k, { rows: 3 }))),
    store.settings().showGuard && h('p', { class: 'hint' }, GUARD_TEXT),
    saveBar('weekly', day, state),
  );
}

function landing(root) {
  const day = today();
  const days = [...Array(14)].map((_, i) => addDays(day, -i));
  const mark = (type, d) => (store.get(checkinId(type, d)) ? h('a', { href: `#/checkin/${type}/${d}`, class: 'yes' }, 'done') : h('a', { href: `#/checkin/${type}/${d}`, class: 'no' }, 'open'));
  put(root, 
    h('header', { class: 'page-head' }, h('h1', {}, 'Check-ins')),
    h('div', { class: 'stack' },
      h('a', { class: 'primary big', href: '#/checkin/morning' }, 'Morning check-in'),
      h('a', { class: 'primary big', href: '#/checkin/evening' }, 'Evening check-in'),
      h('a', { class: 'ghost big', href: '#/checkin/weekly' }, 'Weekly review')),
    h('section', {}, h('h2', {}, 'Last 14 days'),
      h('table', { class: 'history' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', {}, 'Morning'), h('th', {}, 'Evening'))),
        h('tbody', {}, days.map((d) => h('tr', {}, h('td', {}, fmtDay(d)), h('td', {}, mark('morning', d)), h('td', {}, mark('evening', d))))))),
  );
}

export function render(root, type, dayParam) {
  if (!['morning', 'evening', 'weekly'].includes(type)) return landing(root);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam || '') ? dayParam : today();
  const existing = store.get(checkinId(type, day));
  const state = existing ? structuredClone(existing.data) : {};
  const title = { morning: 'Morning check-in', evening: 'Evening check-in', weekly: 'Weekly review' }[type];
  put(root, h('header', { class: 'page-head' }, h('h1', {}, title), h('p', { class: 'meta' }, fmtLong(day) + (existing ? ', already saved. You can change it.' : ''))));
  const body = h('div', { class: 'checkin' });
  put(root, body);
  ({ morning, evening, weekly })[type](body, day, state);
}
