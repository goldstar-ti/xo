// Appearance: the quick "Look" panel and the full Appearance screen.
// All of it is stored on this device only (see boot.js).
import { t, text } from '../text.js';
import { button, checkbox, chip, colour, field, focusControl, input, select, textarea } from '../ui.js';
import { tabStrip } from '../tabs.js';
import * as store from '../store.js';
import { WIDGETS } from '../widgets.js';
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

// A slider with a reset button, - and + buttons and a number box, like NOBBIE's Appearance sliders.
// `scale` and `unit` turn the stored value into what the number box shows (for example 0.05 -> 100%).
// Dragging applies quietly (no screen rebuild); letting go, a button or the box counts as one undo step.
function dial(label, { id, min, max, step, value, def, scale = 1, unit = '', maxLabel = '', apply }) {
  let dragging = false;
  const dec = scale === 1 && step < 1 ? 2 : 0;
  const show = (v) => String(Number((v * scale).toFixed(dec)));
  const snap = (v) => Number(Math.min(max, Math.max(min, v)).toFixed(6));
  const box = h('input', { type: 'number', class: 'dial-num', min: Number((min * scale).toFixed(dec)), max: Number((max * scale).toFixed(dec)), step: scale >= 100 ? 1 : Number((step * scale).toFixed(4)), inputmode: 'decimal', 'aria-label': `${label} value`, 'data-fk': `${id}-num`, value: show(value) });
  const range = h('input', { id, type: 'range', min, max, step, value, 'data-fk': id });
  const reset = h('button', { type: 'button', class: 'dial-btn', title: t('appearance.slider.reset'), 'aria-label': t('appearance.slider.reset_label', { label }), 'data-fk': `${id}-reset` }, '\u21BA');
  const less = h('button', { type: 'button', class: 'dial-btn', title: t('appearance.slider.less'), 'aria-label': t('appearance.slider.less_label', { label }), 'data-fk': `${id}-less` }, '-');
  const more = h('button', { type: 'button', class: 'dial-btn', title: t('appearance.slider.more'), 'aria-label': t('appearance.slider.more_label', { label }), 'data-fk': `${id}-more` }, '+');
  const unitEl = h('span', { class: 'dial-unit' }, unit);
  const sync = (v) => {
    range.value = String(v);
    box.value = show(v);
    reset.hidden = Math.abs(v - def) < 1e-9;
    less.disabled = v <= min;
    more.disabled = v >= max;
    if (maxLabel) unitEl.textContent = v >= max ? maxLabel : unit;
  };
  const commit = (v) => { v = snap(v); sync(v); dragging = false; apply(v, {}); redraw(); };
  range.oninput = (e) => { const v = Number(e.target.value); sync(v); apply(v, { quiet: true, sameStep: dragging }); dragging = true; };
  range.onchange = () => { dragging = false; redraw(); };
  box.onchange = () => { const n = Number(box.value); if (box.value === '' || Number.isNaN(n)) sync(Number(range.value)); else commit(n / scale); };
  reset.onclick = () => commit(def);
  less.onclick = () => commit(Number(range.value) - step);
  more.onclick = () => commit(Number(range.value) + step);
  sync(value);
  return h('div', { class: 'dial' }, h('label', { for: id }, label), range,
    h('span', { class: 'dial-ctl' }, reset, less, more, h('span', { class: 'dial-numwrap' }, box, (unit || maxLabel) && unitEl)));
}
const colourDial = (label, key, scale, unit) => {
  const [min, max] = L.COLOUR_RANGE[key];
  const def = (L.THEMES[look().theme] || L.THEMES.foliage)[key];
  return dial(label, { id: `c-${key}`, min, max, step: max > 1 ? 1 : 0.001, value: look().c[key], def, scale, unit,
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
const sizeDial = () => dial(t('appearance.type.size'), { id: 'd-size', min: 85, max: 135, step: 1, value: look().size, def: L.DEFAULT_LOOK.size, unit: '%', apply: (v, o) => setLook({ size: v }, o) });
const modeSeg = () => seg(t('appearance.mode'), 'mode');

// Standard and Advanced: an Advanced item is hidden in Standard unless it was changed from its default
// (the stylesheet does this from data-level and data-changed). `count` is false for whole sections.
let advChanged = 0;
function adv(el, changed, count = true) {
  if (!el) return el;
  el.dataset.level = 'advanced';
  if (changed) {
    el.dataset.changed = '';
    if (count) { advChanged += 1; el.title = t('appearance.view.changed_tip'); }
  }
  return el;
}
function advSection(heading, ...items) {
  const sec = h('section', { class: 'look-sec' }, h('h2', {}, heading), items.flat(Infinity).filter(Boolean));
  return adv(sec, sec.querySelector('[data-changed]') !== null, false);
}
const group = (...kids) => h('div', { class: 'look-group' }, kids);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Size presets: one tap sets text size, spacing and bar size together. Custom is shown when the three do not match one.
function sizePresets() {
  const cur = L.presetOf(look());
  const names = text('appearance.display');
  return h('div', { class: 'opt' }, h('span', {}, t('appearance.display.size')),
    h('div', { class: 'chips', role: 'group', 'aria-label': t('appearance.display.size') },
      Object.keys(L.SIZE_PRESETS).map((k) => chip(names[k], { pressed: cur === k, 'data-fk': `size:${k}`, onclick: () => setLook(L.SIZE_PRESETS[k]) })),
      chip(names.custom, { pressed: cur === 'custom', disabled: true, 'data-fk': 'size:custom' })));
}

// ---- quick panel ----
export function openLookPanel() {
  const body = h('div', { class: 'panel' });
  const draw = () => {
    body.replaceChildren();
    put(body,
      modeSeg(),
      h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.theme')), themeSwatches()),
      h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.accent')), accentRow()),
      sizePresets(),
      h('div', { class: 'row' },
        button(t('appearance.quick.surprise'), { onclick: () => L.surprise() }),
        button(t('appearance.quick.undo'), { disabled: !L.canUndo, onclick: () => L.undo() }),
        h('a', { class: 'primary', href: '#/appearance', onclick: () => dlg.close() }, t('appearance.quick.all_options'))));
  };
  const onLook = (e) => { if (!e.detail.quiet) draw(); };
  window.addEventListener('xo:look', onLook);
  const dlg = openDialog(t('app.look'), body, { wide: true });
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

// The font catalogue is fetched once, the first time Advanced is open, and kept here.
let catalogue = null;
let loadingCatalogue = false;
function loadCatalogue() {
  if (catalogue || loadingCatalogue) return;
  loadingCatalogue = true;
  fetch('/vendor/fonts/catalogue.json').then((r) => (r.ok ? r.json() : [])).then((list) => { catalogue = Array.isArray(list) ? list : []; redraw(); }).catch(() => { catalogue = []; });
}
const FONT_OK = (f) => /^[a-z0-9-]{1,60}$/.test(f.slug) && /^[A-Za-z0-9 ]{1,60}$/.test(f.family);
// Built-in fonts first, then the catalogue by group. Code takes only monospaced fonts; the others only the rest.
function fontOptions(key, allowSame, current) {
  const opts = [];
  if (allowSame) opts.push(['same', t('appearance.type.same')]);
  opts.push([t('appearance.type.built_in'), Object.entries(L.FONTS).map(([k, f]) => [k, f.name])]);
  const groups = new Map();
  (catalogue || []).filter((f) => f.mono === (key === 'mono') && FONT_OK(f)).forEach((f) => {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push([`g:${f.slug}|${f.family}`, f.family]);
  });
  [...groups.keys()].sort().forEach((g) => opts.push([g, groups.get(g)]));
  const has = opts.some((o) => (Array.isArray(o[1]) ? o[1].some(([v]) => v === current) : o[0] === current));
  if (!has && typeof current === 'string' && current.startsWith('g:')) opts.push([current, current.split('|')[1]]); // catalogue still loading
  return opts;
}
function fontSelect(label, key, allowSame) {
  const id = `f-${key}`;
  const current = look()[key];
  const sel = select(fontOptions(key, allowSame, current), { id, 'data-fk': id, value: current, onchange: (e) => setLook({ [key]: e.target.value }) });
  return adv(field(label, sel, null, { half: true }), current !== L.defaultLook()[key]);
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
  const defTabs = ['today', 'diary', 'tasks', 'obligations'];
  return h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.behaviour.heading')),
    h('div', { class: 'opt' }, h('span', {}, t('appearance.behaviour.clock')),
      h('div', { class: 'chips' }, [[false, t('appearance.behaviour.clock_12')], [true, t('appearance.behaviour.clock_24')]].map(([v, label]) =>
        chip(label, { pressed: p.clock24 === v, 'data-fk': `clock:${v}`, onclick: () => { setPrefs({ clock24: v }); kvSet('clock24', v).catch(() => {}); } })))),
    adv(group(
      h('h3', {}, t('appearance.behaviour.tabs_heading')),
      h('p', { class: 'hint' }, t('appearance.behaviour.tabs_hint')),
      h('div', { class: 'fields' }, p.tabs.map((tab, i) => field(t('appearance.behaviour.position', { n: i + 1 }),
        select(L.SECTIONS.map((sec) => [sec, sections[sec]]), { id: `tab-${i}`, 'data-fk': `tab-${i}`, value: tab, onchange: (e) => swapTab(i, e.target.value) }), null, { half: true })))), !same(p.tabs, defTabs)),
    adv(group(
      h('h3', {}, t('appearance.behaviour.blocks_heading')),
      h('p', { class: 'hint' }, t('appearance.behaviour.blocks_hint')),
      h('ul', { class: 'blocks' }, p.blocks.map((k, i) => h('li', {},
        k === 'line' ? checkbox({ checked: look().line !== 'hidden', disabled: true, 'aria-label': t('appearance.behaviour.line_aria') })
          : checkbox({ checked: !p.hidden.includes(k), 'aria-label': t('appearance.behaviour.show_aria', { block: blockNames[k] }), 'data-fk': `blk:${k}`, onchange: (e) => toggleBlock(k, e.target.checked) }),
        h('span', {}, blockNames[k]),
        button(t('appearance.behaviour.up'), { class: 'small', disabled: i === 0, 'aria-label': t('appearance.behaviour.up_aria', { block: blockNames[k] }), 'data-fk': `up:${k}`, onclick: () => move(k, -1) }),
        button(t('appearance.behaviour.down'), { class: 'small', disabled: i === p.blocks.length - 1, 'aria-label': t('appearance.behaviour.down_aria', { block: blockNames[k] }), 'data-fk': `down:${k}`, onclick: () => move(k, 1) }))))),
    !same(p.blocks, L.BLOCKS) || p.hidden.length > 0),
    h('h3', {}, t('appearance.behaviour.title_heading')),
    h('div', { class: 'fields' },
      field(t('appearance.behaviour.header_title'), input({ id: 'p-title', type: 'text', maxlength: 24, value: p.title, 'data-fk': 'p-title', onchange: (e) => setPrefs({ title: e.target.value }) }), null, { half: true }),
      field(t('appearance.behaviour.call_me'), input({ id: 'p-call', type: 'text', maxlength: 30, value: p.callMe, placeholder: t('appearance.behaviour.call_me_placeholder'), 'data-fk': 'p-call', onchange: (e) => setPrefs({ callMe: e.target.value }) }), t('appearance.behaviour.call_me_hint'), { half: true })),
    adv(field(t('appearance.behaviour.pop'), checkbox({ id: 'p-pop', checked: p.pop, 'data-fk': 'p-pop', onchange: (e) => setPrefs({ pop: e.target.checked }) })), !p.pop));
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
    adv(group(
      h('h3', {}, t('appearance.presets.code_heading')),
      h('p', { class: 'hint' }, t('appearance.presets.code_hint')),
      textarea({ class: 'code', readonly: true, rows: 2, 'aria-label': t('appearance.presets.code_aria'), value: code }),
      h('div', { class: 'row' }, button(t('appearance.presets.copy'), { onclick: () => navigator.clipboard.writeText(code).then(() => toast(t('appearance.presets.copied')), () => toast(t('appearance.presets.copy_failed'), 'bad')) })),
      h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); applyCode(); } }, paste, button(t('appearance.presets.apply'), { type: 'submit' }))), false));
}

// ---- Standard / Advanced sections ----
function colourSection(lk, d) {
  const theme = L.THEMES[lk.theme] || L.THEMES.foliage;
  const fineChanged = lk.theme === 'custom' || ['nh', 'nc', 'wh'].some((k) => lk.c[k] !== theme[k]);
  return h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.colour.heading')),
    modeSeg(),
    h('div', { class: 'opt' }, h('span', {}, lk.theme === 'custom' ? t('appearance.colour.theme_custom') : t('appearance.colour.theme')), themeSwatches()),
    h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.accent')), accentRow()),
    adv(dial(t('appearance.colour.strength'), { id: 'd-strength', min: 0.3, max: 1.7, step: 0.05, value: lk.strength, def: d.strength, scale: 100, unit: '%', apply: (v, o) => setLook({ strength: v }, o) }), lk.strength !== d.strength),
    adv(group(
      h('h3', {}, t('appearance.colour.fine_tune')),
      colourDial(t('appearance.colour.paper_hue'), 'nh', 1, '°'),
      colourDial(t('appearance.colour.paper_amount'), 'nc', 1 / 0.05 * 100, '%'),
      colourDial(t('appearance.colour.accent_hue'), 'ah', 1, '°'),
      colourDial(t('appearance.colour.accent_vivid'), 'ac', 100 / 0.22, '%'),
      colourDial(t('appearance.colour.attention_hue'), 'wh', 1, '°'),
      h('p', { class: 'hint' }, t('appearance.colour.attention_hint'))), fineChanged),
    adv(myThemes(), L.state.myThemes.length > 0));
}

function displaySection(lk, d) {
  const pct = (label, id, key, min, max, step) => adv(dial(label, { id, min, max, step, value: lk[key], def: d[key], scale: key === 'zoom' ? 1 : 100, unit: '%', apply: (v, o) => setLook({ [key]: v }, o) }), lk[key] !== d[key]);
  return h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.display.heading')),
    sizePresets(),
    seg(t('appearance.shape.corners'), 'corners'),
    pct(t('appearance.display.spacing'), 'd-space', 'space', 0.5, 1.6, 0.05),
    pct(t('appearance.display.chrome'), 'd-chrome', 'chrome', 0.5, 1.5, 0.05),
    pct(t('appearance.display.zoom'), 'd-zoom', 'zoom', 25, 175, 5),
    adv(sizeDial(), lk.size !== d.size));
}

function typeSection(lk, d) {
  const dl = (label, id, key, o) => adv(dial(label, { id, value: lk[key], def: d[key], apply: (v, op) => setLook({ [key]: v }, op), ...o }), lk[key] !== d[key]);
  const keys = ['body', 'head', 'num', 'mono', 'weight', 'lh', 'ls', 'monoSize', 'monoLs'];
  return advSection(t('appearance.type.heading'),
    h('div', { class: 'fields' },
      fontSelect(t('appearance.type.body'), 'body', false), fontSelect(t('appearance.type.headings'), 'head', true),
      fontSelect(t('appearance.type.numerals'), 'num', true), fontSelect(t('appearance.type.code'), 'mono', false)),
    h('p', { class: 'hint' }, t('appearance.type.numerals_hint')),
    dl(t('appearance.type.weight'), 'd-weight', 'weight', { min: 100, max: 900, step: 10 }),
    dl(t('appearance.type.line_spacing'), 'd-lh', 'lh', { min: 1.25, max: 1.9, step: 0.05 }),
    dl(t('appearance.type.letter_spacing'), 'd-ls', 'ls', { min: -0.05, max: 0.15, step: 0.005, scale: 1000 }),
    dl(t('appearance.type.code_size'), 'd-monosize', 'monoSize', { min: 70, max: 150, step: 1, unit: '%' }),
    dl(t('appearance.type.code_spacing'), 'd-monols', 'monoLs', { min: -0.05, max: 0.15, step: 0.005, scale: 1000 }),
    button(t('appearance.type.reset'), { 'data-fk': 'reset-type', onclick: () => L.change((s, l) => { keys.forEach((k) => { l[k] = d[k]; }); }) }));
}

function textSizesSection(lk) {
  const roles = text('appearance.text_sizes.roles');
  const steps = L.FS_STEPS.map((v) => [String(v), t('appearance.text_sizes.step', { px: Math.round(v * 17) })]); // 17 px is XO's root size
  const rows = L.FS_ROLES.map(([k]) => adv(field(roles[k],
    select([['', t('appearance.text_sizes.default')], ...steps], { id: `fs-${k}`, 'data-fk': `fs-${k}`, value: lk.fs[k] ? String(lk.fs[k]) : '',
      onchange: (e) => L.change((s, l) => { if (e.target.value === '') delete l.fs[k]; else l.fs[k] = Number(e.target.value); }) }), null, { half: true }), !!lk.fs[k]));
  return advSection(t('appearance.text_sizes.heading'),
    h('p', { class: 'hint' }, t('appearance.text_sizes.hint')), h('div', { class: 'fields' }, rows),
    button(t('appearance.text_sizes.reset'), { 'data-fk': 'reset-sizes', onclick: () => L.change((s, l) => { l.fs = {}; }) }));
}

// The colour a token has now in each mode, as #rrggbb, read by painting one pixel. The scheme is flipped
// for the instant it takes to read, and nothing is drawn in between.
function themeColours() {
  const root = document.documentElement;
  const keep = root.dataset.scheme;
  const probe = h('div', { style: 'position:absolute;width:0;height:0;pointer-events:none' });
  const ctx = h('canvas', { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const out = { light: {}, dark: {} };
  root.append(probe);
  ['light', 'dark'].forEach((m) => {
    root.dataset.scheme = m;
    L.COLOUR_TOKENS.forEach((k) => {
      probe.style.background = `var(--${k})`;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(probe).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const px = ctx.getImageData(0, 0, 1, 1).data;
      out[m][k] = `#${[px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    });
  });
  root.dataset.scheme = keep;
  probe.remove();
  return out;
}

function coloursSection(lk) {
  const names = text('appearance.colours.tokens');
  const now = themeColours();
  const cell = (token, m) => {
    const set = lk.colours[m][token];
    let dragging = false;
    const pick = colour({ value: set || now[m][token], 'aria-label': `${names[token]}, ${t(`appearance.colours.${m}`)}`, 'data-fk': `col-${token}-${m}` });
    const reset = h('button', { type: 'button', class: 'dial-btn', title: t('appearance.colours.reset_one'), 'aria-label': `${t('appearance.colours.reset_one')}: ${names[token]}, ${t(`appearance.colours.${m}`)}`, 'data-fk': `col-${token}-${m}-reset`,
      onclick: () => L.change((s, l) => { delete l.colours[m][token]; }) }, '↺');
    reset.hidden = !set;
    pick.addEventListener('input', () => { L.change((s, l) => { l.colours[m][token] = pick.value; }, { quiet: true, sameStep: dragging }); dragging = true; reset.hidden = false; });
    pick.addEventListener('change', () => { dragging = false; redraw(); });
    return h('td', {}, h('span', { class: 'colour-cell' }, pick, reset));
  };
  const rows = L.COLOUR_TOKENS.map((k) => adv(h('tr', {}, h('th', { scope: 'row' }, names[k]), cell(k, 'light'), cell(k, 'dark')), !!(lk.colours.light[k] || lk.colours.dark[k])));
  const clear = (m) => button(t(`appearance.colours.reset_${m}`), { 'data-fk': `reset-colours-${m}`, onclick: () => L.change((s, l) => { l.colours[m] = {}; }) });
  return advSection(t('appearance.colours.heading'),
    h('p', { class: 'hint' }, t('appearance.colours.hint')),
    h('table', { class: 'colour-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('appearance.colours.token')), h('th', { scope: 'col' }, t('appearance.colours.light')), h('th', { scope: 'col' }, t('appearance.colours.dark')))),
      h('tbody', {}, rows)),
    h('div', { class: 'row' }, clear('light'), clear('dark')));
}

// ---- Widget and tab colours ----
// A palette is chosen from NOBBIE's list (static/vendor/swatches/swatch_palettes.json, loaded when first needed).
// The look keeps the palette's step 500 (light mode) and step 300 (dark mode), so it paints before the list loads.
let palettes = null;
async function loadPalettes() {
  if (!palettes) {
    palettes = fetch('/vendor/swatches/swatch_palettes.json').then((r) => { if (!r.ok) throw new Error('palettes'); return r.json(); });
    palettes.catch(() => { palettes = null; });
  }
  return palettes;
}

// A dialog with a strip of hues, each family as a heading with its palettes as swatches, and None.
function openPalettePicker(name, onPick) {
  const body = h('div', { class: 'ident-pick' });
  const dlg = openDialog(t('appearance.ident.pick_title', { name }), body, { wide: true });
  const hues = text('appearance.ident.hues');
  loadPalettes().then((families) => {
    const order = [...new Set(families.map((f) => f.hue))];
    let hue = order[0];
    const strip = tabStrip({ label: t('appearance.ident.pick', { name }), onSelect: (k) => { hue = k; draw(); } });
    const grid = h('div', { class: 'ident-families' });
    const pick = (value) => { onPick(value); dlg.close(); };
    function draw() {
      strip.set(order.map((k) => ({ key: k, label: hues[k] || k })), hue);
      grid.replaceChildren(...families.filter((f) => f.hue === hue).map((f) => h('div', { class: 'ident-family' },
        h('h3', {}, f.name),
        h('div', { class: 'swatches ident-swatches' }, f.palettes.map((p) => {
          const el = h('button', { type: 'button', class: 'ident-swatch', title: p.name, 'aria-label': p.name, 'data-fk': `ident-pick-${p.slug}`, onclick: () => pick({ swatch: p.slug, light: p.steps['500'], dark: p.steps['300'] }) });
          el.style.setProperty('--swatch', p.steps['500']);
          return el;
        })))));
    }
    draw();
    body.replaceChildren(strip.el, grid, button(t('appearance.ident.none'), { 'data-fk': 'ident-pick-none', onclick: () => pick(null) }));
  }).catch(() => body.replaceChildren(h('p', { class: 'note' }, t('appearance.ident.load_failed'))));
}

function identRow(kind, id, name, lk) {
  const key = kind === 'widgets' ? 'w' : 't';
  const e = lk.ident[kind][id];
  const set = (fn, opts) => L.change((s, l) => { fn(l.ident[kind]); }, opts);
  const swatch = h('button', { type: 'button', class: 'ident-swatch', 'data-fk': `ident-${key}-${id}-${e ? e.swatch : 'none'}`, 'aria-label': t('appearance.ident.pick', { name }),
    title: e ? e.swatch.replace(/-/g, ' ') : t('appearance.ident.none'),
    onclick: () => openPalettePicker(name, (v) => set((m) => {
      if (!v) delete m[id];
      else m[id] = { ...(m[id] || { op: 100, title: false }), ...v };
    })) }, e ? '' : '-');
  if (e) swatch.style.setProperty('--swatch', e.light);
  const op = e
    ? dial(t('appearance.ident.opacity'), { id: `d-ident-${key}-${id}`, min: 20, max: 100, step: 5, value: e.op, def: 100, unit: '%', apply: (v, o) => set((m) => { m[id].op = v; }, o) })
    : null;
  const title = kind === 'widgets' && e
    ? checkbox({ checked: e.title, 'aria-label': `${t('appearance.ident.title')}: ${name}`, 'data-fk': `ident-title-${id}`, onchange: (ev) => set((m) => { m[id].title = ev.target.checked; }) })
    : null;
  return adv(h('tr', {}, h('th', { scope: 'row' }, name), h('td', {}, swatch), h('td', {}, op), kind === 'widgets' && h('td', {}, title, title && ` ${t('appearance.ident.title')}`)), !!e);
}

function identSection(lk) {
  const table = (kind, rows, head) => h('table', { class: 'ident-table' },
    h('caption', {}, head),
    h('tbody', {}, rows));
  const widgets = Object.keys(WIDGETS).map((id) => identRow('widgets', id, t(WIDGETS[id].title), lk));
  const canvases = store.byKind('canvas').slice().sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));
  const tabs = canvases.map((c) => identRow('tabs', c.id, c.data?.title || t('canvas.untitled'), lk));
  const any = Object.keys(lk.ident.widgets).length + Object.keys(lk.ident.tabs).length > 0;
  return advSection(t('appearance.ident.heading'),
    h('p', { class: 'hint' }, t('appearance.ident.hint')),
    table('widgets', widgets, t('appearance.ident.widgets')),
    tabs.length ? table('tabs', tabs, t('appearance.ident.tabs')) : h('p', { class: 'note' }, t('appearance.ident.no_tabs')),
    button(t('appearance.ident.reset'), { 'data-fk': 'reset-ident', onclick: () => L.change((s, l) => { l.ident = { widgets: {}, tabs: {} }; }) }));
}

// Corner radii the Corners choice gives: card, button and chip (40 reads as Round), dialog. Keep in step with CORNERS in boot.js.
const CORNER_PX = { square: [0, 0, 0], soft: [6, 8, 10], round: [10, 40, 14], pill: [20, 40, 20] };
function shapeSection(lk, d) {
  const radius = (label, id, key, max, i, maxLabel) => {
    const def = CORNER_PX[lk.corners][i];
    return adv(dial(label, { id, min: 0, max, step: 1, value: lk[key] ?? def, def, unit: 'px', maxLabel, apply: (v, o) => setLook({ [key]: v === def ? null : v }, o) }), lk[key] !== null);
  };
  return advSection(t('appearance.shape.heading'),
    adv(seg(t('appearance.shape.rule'), 'rule'), lk.rule !== d.rule),
    adv(seg(t('appearance.shape.texture'), 'texture'), lk.texture !== d.texture),
    radius(t('appearance.shape.card_radius'), 'd-rcard', 'rCard', 32, 0, ''),
    radius(t('appearance.shape.pill_radius'), 'd-rpill', 'rPill', 40, 1, t('appearance.shape.round')),
    radius(t('appearance.shape.dialog_radius'), 'd-rdialog', 'rDialog', 32, 2, ''),
    button(t('appearance.shape.reset'), { 'data-fk': 'reset-shape', onclick: () => L.change((s, l) => { Object.assign(l, { rCard: null, rPill: null, rDialog: null, rule: d.rule, texture: d.texture }); }) }));
}

function glassSection(lk, d) {
  return advSection(t('appearance.glass.heading'),
    h('p', { class: 'hint' }, t('appearance.glass.hint')),
    adv(dial(t('appearance.glass.alpha'), { id: 'd-glassalpha', min: 0, max: 60, step: 5, value: lk.glassAlpha, def: d.glassAlpha, unit: '%', apply: (v, o) => setLook({ glassAlpha: v }, o) }), lk.glassAlpha !== d.glassAlpha),
    adv(dial(t('appearance.glass.blur'), { id: 'd-glassblur', min: 0, max: 30, step: 1, value: lk.glassBlur, def: d.glassBlur, unit: 'px', apply: (v, o) => setLook({ glassBlur: v }, o) }), lk.glassBlur !== d.glassBlur));
}

export function render(root) {
  advChanged = 0;
  const a = L.active();
  const lk = a.look;
  const d = L.defaultLook();
  const view = L.prefs.view;
  if (view === 'advanced') loadCatalogue();
  root.dataset.view = view;
  const kitLabels = { xo: t('appearance.kit.xo'), daisy: t('appearance.kit.daisy'), wa: t('appearance.kit.wa') };
  const sections = [
    presets(),
    colourSection(lk, d),
    displaySection(lk, d),
    typeSection(lk, d),
    textSizesSection(lk),
    coloursSection(lk),
    shapeSection(lk, d),
    glassSection(lk, d),
    identSection(lk),
    advSection(t('appearance.figure.heading'), adv(seg(t('appearance.figure.label'), 'figure'), lk.figure !== d.figure)),
    advSection(t('appearance.layout.heading'),
      ...[['hero', 'hero'], ['dayline', 'dayline'], ['loud', 'loud'], ['line', 'line']].map(([k, key]) => adv(seg(t(`appearance.layout.${k}`), key), lk[key] !== d[key]))),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.kit.title')),
      seg(t('appearance.kit.label'), 'kit', kitLabels),
      h('p', { class: 'hint' }, t('appearance.kit.hint'))),
    behaviour(),
    adv(scheduled(), L.state.scheduled.length > 0),
  ];
  const views = [['standard', t('appearance.view.standard')], ['advanced', advChanged > 0 ? t('appearance.view.advanced_changed', { n: advChanged }) : t('appearance.view.advanced')]];
  put(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('appearance.heading'))),
    a.item && h('div', { class: 'banner' },
      h('span', {}, t('appearance.banner', { name: a.item.name, from: fmtTime(a.item.from), to: fmtTime(a.item.to) })),
      L.editing && button(t('appearance.stop_editing'), { class: 'small', onclick: () => L.setEditing(null) })),
    h('p', { class: 'note' }, t('appearance.device_only')),
    h('div', { class: 'opt view-switch' }, h('span', {}, t('appearance.view.label')),
      h('div', { class: 'chips', role: 'group', 'aria-label': t('appearance.view.label') }, views.map(([v, label]) =>
        chip(label, { pressed: view === v, 'data-fk': `view:${v}`, onclick: () => setPrefs({ view: v }) }))),
      h('p', { class: 'hint' }, t('appearance.view.hint'))),
    preview(),
    sections);
}
