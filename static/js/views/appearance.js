// Appearance: the quick "Look" panel and the full Appearance screen.
// All of it is stored on this device only (see boot.js).
import { t, text } from '../text.js';
import { button, checkbox, chip, field, focusControl, input, select, textarea } from '../ui.js';
import { fmtTime, h, kvSet, openDialog, put, toast, uid } from '../util.js';

export const live = false;
const L = window.XOLook;

const look = () => L.active().look;
const setLook = (patch, opts) => L.change((s, lk) => Object.assign(lk, patch), opts);
const setPrefs = (patch) => L.change((s) => Object.assign(s.prefs, patch));
const redraw = () => window.dispatchEvent(new CustomEvent('xo:look', { detail: { quiet: false } }));
const HUES = [25, 50, 80, 110, 140, 165, 195, 225, 255, 285, 315, 345];

// One-of-several buttons for a look setting.
function seg(label, key, labels = text(`appearance.choices.${key}`)) {
  const current = look()[key];
  return h('div', { class: 'opt' }, h('span', {}, label),
    h('div', { class: 'chips', role: 'group', 'aria-label': label }, L.CHOICES[key].map((opt) =>
      chip(labels[opt], { pressed: current === opt, 'data-fk': `${key}:${opt}`, onclick: () => setLook({ [key]: opt }) }))));
}

// A slider. Dragging applies quietly (no screen rebuild); letting go counts as one undo step.
function dial(label, { id, min, max, step, value, fmt = (v) => v, apply }) {
  let dragging = false;
  const out = h('output', { for: id }, fmt(value));
  const range = h('input', {
    id, type: 'range', min, max, step, value, 'data-fk': id,
    oninput: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); apply(v, { quiet: true, sameStep: dragging }); dragging = true; },
    onchange: () => { dragging = false; redraw(); },
  });
  return h('div', { class: 'dial' }, h('label', { for: id }, label), range, out);
}
const colourDial = (label, key, fmt) => {
  const [min, max] = L.COLOUR_RANGE[key];
  return dial(label, { id: `c-${key}`, min, max, step: max > 1 ? 1 : 0.001, value: look().c[key], fmt,
    apply: (v, opts) => L.change((s, lk) => { lk.c[key] = v; lk.theme = 'custom'; }, opts) });
};

function themeSwatch(id, name, c) {
  const on = look().theme === id;
  const el = h('button', { type: 'button', class: `swatch themed${on ? ' on' : ''}`, 'aria-pressed': String(on), 'data-fk': `theme:${id}`, onclick: () => setLook({ theme: id, c: { ...c } }) }, name);
  for (const [k, v] of Object.entries(c)) el.style.setProperty(`--${k}`, v);
  return el;
}
function themeSwatches() {
  const named = Object.entries(L.THEMES).map(([id, theme]) => themeSwatch(id, theme.name, L.colourOf(id)));
  const mine = L.state.myThemes.map((m) => themeSwatch(`my:${m.id}`, m.name, m.c));
  return h('div', { class: 'swatches' }, named, mine);
}
function accentRow() {
  const lk = look();
  const themeHue = L.THEMES[lk.theme]?.ah;
  const usingTheme = themeHue !== undefined && lk.c.ah === themeHue;
  return h('div', { class: 'hues', role: 'group', 'aria-label': t('appearance.accent.group') },
    themeHue !== undefined && h('button', { type: 'button', class: `hue auto${usingTheme ? ' on' : ''}`, 'data-fk': 'hue:theme', onclick: () => L.change((s, l2) => { l2.c.ah = themeHue; l2.c.ac = L.THEMES[l2.theme].ac; }) }, t('appearance.accent.theme')),
    HUES.map((hue) => {
      const el = h('button', { type: 'button', class: `hue${!usingTheme && Math.abs(lk.c.ah - hue) < 8 ? ' on' : ''}`, 'aria-label': t('appearance.accent.hue', { hue }), 'data-fk': `hue:${hue}`,
        onclick: () => L.change((s, l2) => { l2.c.ah = hue; l2.c.ac = Math.max(l2.c.ac, 0.12); }) });
      el.style.background = `oklch(0.56 0.15 ${hue})`;
      return el;
    }));
}
const sizeDial = () => dial(t('appearance.type.size'), { id: 'd-size', min: 85, max: 135, step: 1, value: look().size, fmt: (v) => `${v}%`, apply: (v, o) => setLook({ size: v }, o) });
const modeSeg = () => seg(t('appearance.mode'), 'mode');

// ---- quick panel ----
export function openLookPanel() {
  const body = h('div', { class: 'panel' });
  const draw = () => {
    body.replaceChildren();
    put(body,
      modeSeg(),
      h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.theme')), themeSwatches()),
      h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.accent')), accentRow()),
      sizeDial(),
      h('div', { class: 'row' },
        button(t('appearance.quick.surprise'), { onclick: () => L.surprise() }),
        button(t('appearance.quick.undo'), { disabled: !L.canUndo, onclick: () => L.undo() }),
        h('a', { class: 'primary', href: '#/appearance', onclick: () => dlg.close() }, t('appearance.quick.all_options'))));
  };
  const onLook = (e) => { if (!e.detail.quiet) draw(); };
  window.addEventListener('xo:look', onLook);
  const dlg = openDialog(t('app.look'), body, { wide: true, key: 'look' });
  dlg.addEventListener('close', () => window.removeEventListener('xo:look', onLook));
  draw();
}

// ---- full screen ----
function preview() {
  return h('div', { class: 'preview', 'aria-label': t('appearance.preview.aria') },
    h('section', { class: 'next' }, h('p', { class: 'next-head' }, t('appearance.preview.next_head')), h('p', { class: 'next-title' }, t('appearance.preview.next_title')), h('p', { class: 'next-sub' }, t('appearance.preview.next_sub', { time: fmtTime('14:30') }))),
    h('ol', { class: 'dayline' },
      h('li', { class: 'entry k-tick done past' }, h('span', { class: 't' }, fmtTime('08:30')), h('span', { class: 'what' }, t('appearance.preview.breakfast')), h('span', { class: 'tick on' }, t('appearance.preview.done'))),
      h('li', { class: 'now' }, h('span', { class: 't' }, fmtTime('11:05')), h('span', { class: 'now-rule' }, t('appearance.preview.now'))),
      h('li', { class: 'entry k-tick' }, h('span', { class: 't' }, fmtTime('12:30')), h('span', { class: 'what' }, t('appearance.preview.lunch')), h('span', { class: 'tick' }, t('appearance.preview.tick')))),
    h('div', { class: 'row' }, h('span', { class: 'chip on' }, t('appearance.preview.chosen')), h('span', { class: 'chip' }, t('appearance.preview.not_chosen')), h('span', { class: 'primary' }, t('appearance.preview.button')), h('span', { class: 'ghost' }, t('appearance.preview.button'))),
    h('p', { class: 'note' }, t('appearance.preview.body'), ' ', h('a', { href: '#/appearance' }, t('appearance.preview.link')), '. ', h('span', { class: 'num' }, t('appearance.preview.money'))));
}

function fontSelect(label, key, allowSame) {
  const id = `f-${key}`;
  const options = [...(allowSame ? [['same', t('appearance.type.same')]] : []), ...Object.entries(L.FONTS).map(([k, f]) => [k, f.name])];
  return field(label, select(options, { id, 'data-fk': id, value: look()[key], onchange: (e) => setLook({ [key]: e.target.value }) }), null, { half: true });
}

function myThemes() {
  const name = input({ type: 'text', placeholder: t('appearance.my_themes.placeholder'), 'aria-label': t('appearance.my_themes.placeholder'), maxlength: 30, 'data-fk': 'mytheme-name' });
  const saveIt = () => {
    const n = name.value.trim();
    if (!n) { toast(t('appearance.my_themes.need_name'), 'bad'); focusControl(name); return; }
    const id = uid().slice(0, 8);
    L.change((s, lk) => { s.myThemes.push({ id, name: n, c: { ...lk.c } }); lk.theme = `my:${id}`; });
    toast(t('appearance.my_themes.saved', { name: n }));
  };
  return h('div', { class: 'opt' }, h('span', {}, t('appearance.my_themes.heading')),
    h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); saveIt(); } }, name, button(t('appearance.my_themes.save'), { type: 'submit' })),
    L.state.myThemes.length > 0 && h('ul', { class: 'blocks' }, L.state.myThemes.map((m) => h('li', {}, h('span', {}, m.name),
      button(t('appearance.my_themes.remove'), { class: 'small', onclick: () => L.change((s) => { s.myThemes = s.myThemes.filter((x) => x.id !== m.id); }) })))));
}

function scheduled() {
  const a = L.active();
  const name = input({ id: 'sch-name', type: 'text', placeholder: t('appearance.scheduled.placeholder'), maxlength: 30 });
  const from = input({ id: 'sch-from', type: 'time', value: '21:00' });
  const to = input({ id: 'sch-to', type: 'time', value: '06:00' });
  const add = () => {
    if (!from.value || !to.value || from.value === to.value) { toast(t('appearance.scheduled.need_times'), 'bad'); return; }
    const id = uid().slice(0, 8);
    L.change((s, lk) => { s.scheduled.push({ id, name: name.value.trim() || t('appearance.scheduled.default_name'), from: from.value, to: to.value, look: JSON.parse(JSON.stringify(lk)) }); });
    L.setEditing(id);
    toast(t('appearance.scheduled.added'));
  };
  return h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.scheduled.heading')),
    h('p', { class: 'note' }, t('appearance.scheduled.note')),
    L.state.scheduled.length > 0 && h('ul', { class: 'blocks' }, L.state.scheduled.map((s) => h('li', {},
      h('span', {}, t('appearance.scheduled.line', { name: s.name, from: fmtTime(s.from), to: fmtTime(s.to) }), a.item?.id === s.id && h('small', {}, ' ', t('appearance.scheduled.showing'))),
      a.item?.id !== s.id && button(t('appearance.scheduled.edit'), { class: 'small', onclick: () => L.setEditing(s.id) }),
      button(t('appearance.scheduled.remove'), { class: 'small', onclick: () => { if (L.editing === s.id) L.setEditing(null); L.change((st) => { st.scheduled = st.scheduled.filter((x) => x.id !== s.id); }); } })))),
    h('div', { class: 'fields' },
      field(t('appearance.scheduled.name'), name),
      field(t('appearance.scheduled.from'), from, null, { half: true }),
      field(t('appearance.scheduled.until'), to, null, { half: true })),
    button(t('appearance.scheduled.add'), { onclick: add }));
}

function behaviour() {
  const p = L.prefs;
  const sections = text('app.nav');
  const blockNames = text('appearance.blocks');
  const swapTab = (i, value) => L.change((s) => {
    const tabs = s.prefs.tabs.slice();
    const j = tabs.indexOf(value);
    if (j >= 0) tabs[j] = tabs[i]; // already on the bar: swap places
    tabs[i] = value;
    s.prefs.tabs = tabs;
  });
  const move = (k, by) => L.change((s) => {
    const list = s.prefs.blocks.slice();
    const i = list.indexOf(k), j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    s.prefs.blocks = list;
  });
  const toggleBlock = (k, on) => L.change((s) => { s.prefs.hidden = on ? s.prefs.hidden.filter((x) => x !== k) : [...s.prefs.hidden, k]; });
  return h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.behaviour.heading')),
    h('div', { class: 'opt' }, h('span', {}, t('appearance.behaviour.clock')),
      h('div', { class: 'chips' }, [[false, t('appearance.behaviour.clock_12')], [true, t('appearance.behaviour.clock_24')]].map(([v, label]) =>
        chip(label, { pressed: p.clock24 === v, 'data-fk': `clock:${v}`, onclick: () => { setPrefs({ clock24: v }); kvSet('clock24', v).catch(() => {}); } })))),
    h('h3', {}, t('appearance.behaviour.tabs_heading')),
    h('p', { class: 'hint' }, t('appearance.behaviour.tabs_hint')),
    h('div', { class: 'fields' }, p.tabs.map((tab, i) => field(t('appearance.behaviour.position', { n: i + 1 }),
      select(L.SECTIONS.map((sec) => [sec, sections[sec]]), { id: `tab-${i}`, 'data-fk': `tab-${i}`, value: tab, onchange: (e) => swapTab(i, e.target.value) }), null, { half: true }))),
    h('h3', {}, t('appearance.behaviour.blocks_heading')),
    h('p', { class: 'hint' }, t('appearance.behaviour.blocks_hint')),
    h('ul', { class: 'blocks' }, p.blocks.map((k, i) => h('li', {},
      k === 'line' ? checkbox({ checked: look().line !== 'hidden', disabled: true, 'aria-label': t('appearance.behaviour.line_aria') })
        : checkbox({ checked: !p.hidden.includes(k), 'aria-label': t('appearance.behaviour.show_aria', { block: blockNames[k] }), 'data-fk': `blk:${k}`, onchange: (e) => toggleBlock(k, e.target.checked) }),
      h('span', {}, blockNames[k]),
      button(t('appearance.behaviour.up'), { class: 'small', disabled: i === 0, 'aria-label': t('appearance.behaviour.up_aria', { block: blockNames[k] }), 'data-fk': `up:${k}`, onclick: () => move(k, -1) }),
      button(t('appearance.behaviour.down'), { class: 'small', disabled: i === p.blocks.length - 1, 'aria-label': t('appearance.behaviour.down_aria', { block: blockNames[k] }), 'data-fk': `down:${k}`, onclick: () => move(k, 1) })))),
    h('h3', {}, t('appearance.behaviour.title_heading')),
    h('div', { class: 'fields' },
      field(t('appearance.behaviour.header_title'), input({ id: 'p-title', type: 'text', maxlength: 24, value: p.title, 'data-fk': 'p-title', onchange: (e) => setPrefs({ title: e.target.value }) }), null, { half: true }),
      field(t('appearance.behaviour.call_me'), input({ id: 'p-call', type: 'text', maxlength: 30, value: p.callMe, placeholder: t('appearance.behaviour.call_me_placeholder'), 'data-fk': 'p-call', onchange: (e) => setPrefs({ callMe: e.target.value }) }), t('appearance.behaviour.call_me_hint'), { half: true })),
    field(t('appearance.behaviour.pop'), checkbox({ id: 'p-pop', checked: p.pop, 'data-fk': 'p-pop', onchange: (e) => setPrefs({ pop: e.target.checked }) })));
}

function presets() {
  const code = L.encode(look());
  const paste = input({ type: 'text', placeholder: t('appearance.presets.paste'), 'aria-label': t('appearance.presets.paste'), 'data-fk': 'paste' });
  const applyCode = () => {
    const parsed = L.decode(paste.value);
    if (!parsed) { toast(t('appearance.presets.bad_code'), 'bad'); return; }
    L.change((s, lk) => { Object.assign(lk, parsed); });
    toast(t('appearance.presets.applied'));
  };
  let armed = false;
  const reset = button(t('appearance.presets.reset'), { variant: 'danger' });
  reset.addEventListener('click', () => {
    if (!armed) { armed = true; reset.textContent = t('appearance.presets.reset_armed'); return; }
    L.reset(); kvSet('clock24', false).catch(() => {}); toast(t('appearance.presets.reset_done'));
  });
  return h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.presets.heading')),
    h('div', { class: 'row' },
      button(t('appearance.quick.surprise'), { variant: 'primary', 'data-fk': 'surprise', onclick: () => L.surprise() }),
      button(t('appearance.quick.undo'), { disabled: !L.canUndo, 'data-fk': 'undo', onclick: () => L.undo() }),
      reset),
    h('p', { class: 'hint' }, t('appearance.presets.hint')),
    h('h3', {}, t('appearance.presets.code_heading')),
    h('p', { class: 'hint' }, t('appearance.presets.code_hint')),
    textarea({ class: 'code', readonly: true, rows: 2, 'aria-label': t('appearance.presets.code_aria'), value: code }),
    h('div', { class: 'row' }, button(t('appearance.presets.copy'), { onclick: () => navigator.clipboard.writeText(code).then(() => toast(t('appearance.presets.copied')), () => toast(t('appearance.presets.copy_failed'), 'bad')) })),
    h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); applyCode(); } }, paste, button(t('appearance.presets.apply'), { type: 'submit' })));
}

export function render(root) {
  const a = L.active();
  const lk = a.look;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const kitLabels = { xo: t('appearance.kit.xo'), daisy: t('appearance.kit.daisy'), wa: t('appearance.kit.wa') };
  put(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('appearance.heading'))),
    a.item && h('div', { class: 'banner' },
      h('span', {}, t('appearance.banner', { name: a.item.name, from: fmtTime(a.item.from), to: fmtTime(a.item.to) })),
      L.editing && button(t('appearance.stop_editing'), { class: 'small', onclick: () => L.setEditing(null) })),
    h('p', { class: 'note' }, t('appearance.device_only')),
    preview(),
    presets(),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.colour.heading')),
      modeSeg(),
      h('div', { class: 'opt' }, h('span', {}, lk.theme === 'custom' ? t('appearance.colour.theme_custom') : t('appearance.colour.theme')), themeSwatches()),
      h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.accent')), accentRow()),
      dial(t('appearance.colour.strength'), { id: 'd-strength', min: 0.3, max: 1.7, step: 0.05, value: lk.strength, fmt: pct, apply: (v, o) => setLook({ strength: v }, o) }),
      h('h3', {}, t('appearance.colour.fine_tune')),
      colourDial(t('appearance.colour.paper_hue'), 'nh', (v) => `${v}°`),
      colourDial(t('appearance.colour.paper_amount'), 'nc', (v) => pct(v / 0.05)),
      colourDial(t('appearance.colour.accent_hue'), 'ah', (v) => `${v}°`),
      colourDial(t('appearance.colour.accent_vivid'), 'ac', (v) => pct(v / 0.22)),
      colourDial(t('appearance.colour.attention_hue'), 'wh', (v) => `${v}°`),
      h('p', { class: 'hint' }, t('appearance.colour.attention_hint')),
      myThemes()),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.type.heading')),
      h('div', { class: 'fields' }, fontSelect(t('appearance.type.body'), 'body', false), fontSelect(t('appearance.type.headings'), 'head', true), fontSelect(t('appearance.type.numerals'), 'num', true)),
      h('p', { class: 'hint' }, t('appearance.type.numerals_hint')),
      sizeDial(),
      dial(t('appearance.type.weight'), { id: 'd-weight', min: 300, max: 550, step: 10, value: lk.weight, apply: (v, o) => setLook({ weight: v }, o) }),
      dial(t('appearance.type.line_spacing'), { id: 'd-lh', min: 1.25, max: 1.9, step: 0.05, value: lk.lh, fmt: (v) => v.toFixed(2), apply: (v, o) => setLook({ lh: v }, o) }),
      dial(t('appearance.type.letter_spacing'), { id: 'd-ls', min: -0.02, max: 0.08, step: 0.005, value: lk.ls, fmt: (v) => `${Math.round(v * 1000)}`, apply: (v, o) => setLook({ ls: v }, o) })),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.shape.heading')),
      seg(t('appearance.shape.corners'), 'corners'), seg(t('appearance.shape.density'), 'density'), seg(t('appearance.shape.rule'), 'rule'),
      seg(t('appearance.shape.texture'), 'texture')),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.layout.heading')),
      seg(t('appearance.layout.hero'), 'hero'), seg(t('appearance.layout.dayline'), 'dayline'), seg(t('appearance.layout.loud'), 'loud'),
      seg(t('appearance.layout.line'), 'line')),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.kit.title')),
      seg(t('appearance.kit.label'), 'kit', kitLabels),
      h('p', { class: 'hint' }, t('appearance.kit.hint'))),
    behaviour(),
    scheduled(),
  );
}
