// Appearance: the quick "Look" panel and the full Appearance screen.
// All of it is stored on this device only (see boot.js).
import { t, text } from '../text.js';
import { badge, button, checkbox, colourField, disclosure, field, focusControl, fontPicker, input, kit, optionCards, searchBox, segmented, select, sortList, stat, textarea, toggle } from '../ui.js';
import { tabStrip } from '../tabs.js';
import * as store from '../store.js';
import { WIDGETS } from '../widgets.js';
import { DEFAULT_ICONS, icon, paintIcon } from '../icons.js';
import { pickScreenIcon } from '../iconpicker.js';
import { previewPattern } from '../pattern.js';
import { fmtTime, h, kvSet, openDialog, put, toast, uid } from '../util.js';

export const live = false;
const L = window.XOLook;

const look = () => L.active().look;
const setLook = (patch, opts) => L.change((s, lk) => Object.assign(lk, patch), opts);
const setPrefs = (patch) => L.change((s) => Object.assign(s.prefs, patch));
const redraw = () => window.dispatchEvent(new CustomEvent('xo:look', { detail: { quiet: false } }));
const HUES = [25, 50, 80, 110, 140, 165, 195, 225, 255, 285, 315, 345];

// The segmented and option-card components carry no data-fk of their own; this puts one on each choice.
function fkAll(el, prefix) {
  el.querySelectorAll('[data-value], wa-radio').forEach((b) => { b.dataset.fk = `${prefix}:${b.dataset.value ?? b.value ?? b.getAttribute('value')}`; });
  return el;
}
// One-of-several buttons for a look setting.
function seg(label, key, labels = text(`appearance.choices.${key}`)) {
  return fkAll(segmented(label, L.CHOICES[key].map((o) => [o, labels[o]]), { value: look()[key], onchange: (v) => setLook({ [key]: v }) }), key);
}
// Big choices with a one-line description (and a drawn sample when `sample(option)` is given).
function cards(label, key, sample = null, labels = text(`appearance.choices.${key}`)) {
  const hints = text(`appearance.hints.${key}`);
  return fkAll(optionCards(label, L.CHOICES[key].map((o) => ({ value: o, title: labels[o], hint: hints[o], sample: sample ? sample(o) : null })),
    { value: look()[key], onchange: (v) => setLook({ [key]: v }) }), key);
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

function themeSwatch(id, name, c, extra = {}) {
  const on = look().theme === id;
  const el = h('button', { type: 'button', class: `swatch themed${on ? ' on' : ''}`, 'aria-pressed': String(on), 'data-fk': `theme:${id}`, onclick: () => setLook({ theme: id, c: { ...c }, ...extra }) }, h('span', { class: 'swatch-dot', 'aria-hidden': 'true' }), name);
  for (const [k, v] of Object.entries(c)) el.style.setProperty(`--${k}`, v);
  return el;
}
function themeSwatches() {
  const named = Object.entries(L.THEMES).map(([id, theme]) => themeSwatch(id, theme.name, L.colourOf(id)));
  const mine = L.state.myThemes.map((m) => themeSwatch(`my:${m.id}`, m.name, m.c, { strength: m.strength, colours: JSON.parse(JSON.stringify(m.colours)) }));
  return h('div', { class: 'swatches' }, named, mine);
}
// ---- Theme families: every NOBBIE palette as a colour theme (static/js/family-themes.js, loaded when first needed) ----
let familiesMod = null;
function loadFamilies() {
  if (!familiesMod) {
    familiesMod = import('../family-themes.js');
    familiesMod.catch(() => { familiesMod = null; });
  }
  return familiesMod;
}
function surprise() {
  loadFamilies().then((m) => L.surprise(m.FAMILIES.flatMap((f) => f.themes.map(({ id, c }) => ({ id, c }))))).catch(() => L.surprise());
}
const famName = new Map(); // theme id to palette name, filled once the module has loaded
const themeLabel = (lk) => (lk.theme === 'custom' ? t('appearance.colour.theme_custom') : t('appearance.colour.theme') + (lk.theme.startsWith('fam:') ? `: ${famName.get(lk.theme) || lk.theme.slice(4).replace(/-/g, ' ')}` : ''));

// Hue tabs, then each family as a heading with its palettes as swatches drawn in their own colours.
// The one palette picker: the colour theme and the widget and tab colours both use it.
// onPick(theme) gets { id, name, swatch, dark, c }; fk(theme) names the data-fk hook; current is the pressed theme id.
function familyPicker({ onPick, current = null, fk = (th) => `theme:${th.id}`, label = t('appearance.families.heading') } = {}) {
  const wrap = h('div', { class: 'family-picker' });
  loadFamilies().then(({ FAMILIES, FAMILY_HUES }) => {
    FAMILIES.forEach((f) => f.themes.forEach((th) => famName.set(th.id, th.name)));
    const hues = text('appearance.families.hues');
    const own = FAMILIES.find((f) => f.themes.some((th) => th.id === current));
    let hue = own ? own.hue : FAMILY_HUES[0];
    const strip = tabStrip({ label, onSelect: (k) => { hue = k; draw(); } });
    const grid = h('div', { class: 'ident-families' });
    function draw() {
      strip.set(FAMILY_HUES.map((k) => ({ key: k, label: hues[k] || k })), hue);
      grid.replaceChildren(...FAMILIES.filter((f) => f.hue === hue).map((f) => h('div', { class: 'ident-family' },
        h('h3', {}, f.name),
        h('div', { class: 'swatches' }, f.themes.map((th) => {
          const on = th.id === current;
          const el = h('button', { type: 'button', class: `swatch themed${on ? ' on' : ''}`, 'aria-pressed': String(on), 'aria-label': th.name, 'data-fk': fk(th), onclick: () => onPick(th) }, h('span', { class: 'swatch-dot', 'aria-hidden': 'true' }), th.name);
          for (const [k, v] of Object.entries(th.c)) el.style.setProperty(`--${k}`, v);
          return el;
        })))));
    }
    draw();
    wrap.replaceChildren(strip.el, grid);
  }).catch(() => wrap.replaceChildren(h('p', { class: 'note' }, t('appearance.ident.load_failed'))));
  return wrap;
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
  const opts = Object.keys(L.SIZE_PRESETS).map((k) => [k, names[k]]);
  if (cur === 'custom') opts.push(['custom', names.custom]);
  return fkAll(segmented(t('appearance.display.size'), opts, { value: cur, onchange: (v) => { if (v !== 'custom') setLook(L.SIZE_PRESETS[v]); } }), 'size');
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
        button(t('appearance.quick.surprise'), { onclick: surprise }),
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
let axisInfo = {}; // slug -> { tag: [min, default, max] } for the fonts that have axes besides weight
function loadCatalogue() {
  if (catalogue || loadingCatalogue) return;
  loadingCatalogue = true;
  // The axis ranges load first, so the one redraw after the catalogue arrives already has them.
  const axes = fetch('/vendor/fonts/axes.json').then((r) => (r.ok ? r.json() : {})).then((a) => { axisInfo = a && typeof a === 'object' ? a : {}; }).catch(() => {});
  axes.then(() => fetch('/vendor/fonts/catalogue.json')).then((r) => (r.ok ? r.json() : [])).then((list) => { catalogue = Array.isArray(list) ? list : []; redraw(); }).catch(() => { catalogue = []; });
}
const FONT_OK = (f) => /^[a-z0-9-]{1,60}$/.test(f.slug) && /^[A-Za-z0-9 ]{1,60}$/.test(f.family);
// NOBBIE's weight hint: the variable range, or the static weights the font has (the slider uses the nearest).
function weightHint(current) {
  const slug = typeof current === 'string' && current.startsWith('g:') ? current.slice(2).split('|')[0] : '';
  const e = (catalogue || []).find((f) => f.slug === slug);
  if (!e) return null;
  if (e.variable && e.wght) return t('appearance.type.hint_variable', { min: e.wght[0], max: e.wght[1] });
  return t('appearance.type.hint_static', { weights: e.weights && e.weights.length ? e.weights.join(', ') : '400' });
}

// One slider per variation axis (width, optical size, slant and the font's own) of the font chosen for a role.
function axisDials(key, current, lk) {
  const slug = typeof current === 'string' && current.startsWith('g:') ? current.slice(2).split('|')[0] : '';
  const info = axisInfo[slug];
  if (!info) return null;
  const names = text('appearance.type.axes');
  const set = (tag, v, def, op) => L.change((s, l) => {
    const cur = { ...(l.axes[slug] || {}) };
    if (Math.abs(v - def) < 1e-9) delete cur[tag]; else cur[tag] = v;
    l.axes = { ...l.axes };
    if (Object.keys(cur).length) l.axes[slug] = cur; else delete l.axes[slug];
  }, op);
  return h('div', { class: 'axes', 'data-axes': slug }, Object.keys(info).sort().map((tag) => {
    const [min, def, max] = info[tag];
    const label = names[tag] || tag;
    const value = (lk.axes[slug] || {})[tag] ?? def;
    const step = max - min > 20 ? 1 : 0.1;
    return h('div', { class: 'opt' }, h('span', {}, label),
      dial(label, { id: `ax-${key}-${tag}`, min, max, step, value, def, apply: (v, op) => set(tag, v, def, op) }));
  }));
}
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

// ---- the screen: six groups, each a few always-visible settings and some accordions ----
// build() makes every setting once per draw and files it under a group (and an accordion); the frame then shows one
// group, or the settings that match the search, by moving those nodes around.
const GROUPS = ['theme', 'text', 'layout', 'effects', 'screens', 'share'];
let query = '';
const accOpen = new Map(); // accordion key -> open, kept across redraws
let items = [];
let ACCS = {};

const download = (name, obj) => {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const fileName = (name) => `${name.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'theme'}.xo-theme.json`;

// ---- Colour group ----
function saveRow() {
  const name = input({ type: 'text', placeholder: t('appearance.my_themes.placeholder'), 'aria-label': t('appearance.my_themes.placeholder'), maxlength: 30, 'data-fk': 'mytheme-name' });
  const saveIt = () => {
    const n = name.value.trim();
    if (!n) { toast(t('appearance.my_themes.need_name'), 'bad'); focusControl(name); return; }
    const id = uid().slice(0, 8);
    L.change((s, lk) => { s.myThemes.push({ id, name: n, c: { ...lk.c }, strength: lk.strength, colours: JSON.parse(JSON.stringify(lk.colours)) }); lk.theme = `my:${id}`; });
    toast(t('appearance.my_themes.saved', { name: n }));
  };
  return h('div', { class: 'opt' }, h('span', {}, t('appearance.my_themes.save')),
    h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); saveIt(); } }, name, button(t('appearance.my_themes.save'), { type: 'submit' })),
    h('p', { class: 'hint' }, t('appearance.my_themes.hint')));
}

function themeRow(m) {
  const dot = h('span', { class: 'swatch themed theme-dot', role: 'img', 'aria-label': t('appearance.my_themes.swatch', { name: m.name }) });
  for (const [k, v] of Object.entries(m.c)) dot.style.setProperty(`--${k}`, v);
  const li = h('li', {}, dot, h('span', { class: 'theme-name' }, m.name));
  const rename = () => {
    const box = input({ type: 'text', maxlength: 30, value: m.name, 'aria-label': t('appearance.my_themes.name_aria', { name: m.name }), 'data-fk': `rename-${m.id}` });
    const done = () => {
      const n = box.value.trim();
      if (n && n !== m.name) L.change((s) => { const x = s.myThemes.find((y) => y.id === m.id); if (x) x.name = n.slice(0, 30); });
      else redraw();
    };
    box.addEventListener('change', done);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') redraw(); });
    li.querySelector('.theme-name').replaceWith(box);
    box.focus();
  };
  li.append(
    button(t('appearance.my_themes.apply'), { class: 'small', 'data-fk': `apply-${m.id}`, onclick: () => L.change((s, lk) => { lk.theme = `my:${m.id}`; lk.c = { ...m.c }; lk.strength = m.strength; lk.colours = JSON.parse(JSON.stringify(m.colours)); }) }),
    button(t('appearance.my_themes.rename'), { class: 'small', onclick: rename }),
    button(t('appearance.my_themes.export'), { class: 'small', 'data-fk': `export-${m.id}`, onclick: () => download(fileName(m.name), L.exportThemes([m.id])) }),
    button(t('appearance.my_themes.delete'), { class: 'small', 'data-fk': `delete-${m.id}`, onclick: () => L.change((s) => { s.myThemes = s.myThemes.filter((x) => x.id !== m.id); }) }));
  return li;
}

function themeTools() {
  const ids = () => L.state.myThemes.map((m) => m.id);
  const result = (obj) => {
    const r = L.importThemes(obj);
    if (r.error) toast(t('appearance.my_themes.import_bad'), 'bad');
    else toast(t('appearance.my_themes.imported', { added: r.added, skipped: r.skipped }));
  };
  const parse = (txt) => { try { return JSON.parse(txt); } catch { return null; } };
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'data-fk': 'theme-file', 'aria-label': t('appearance.my_themes.import_file'),
    onchange: () => { const f = file.files[0]; file.value = ''; if (f) f.text().then((txt) => result(parse(txt)), () => result(null)); } });
  const paste = textarea({ rows: 4, class: 'code', 'aria-label': t('appearance.my_themes.paste_label'), 'data-fk': 'theme-paste' });
  return h('div', { class: 'look-tools' },
    L.state.myThemes.length > 0
      ? h('ul', { class: 'blocks theme-list' }, L.state.myThemes.map(themeRow))
      : h('p', { class: 'note' }, t('appearance.my_themes.none')),
    h('div', { class: 'row' },
      button(t('appearance.my_themes.export_all'), { 'data-fk': 'export-all', onclick: () => download('xo-themes.json', L.exportThemes(ids())) }),
      button(t('appearance.my_themes.copy_text'), { 'data-fk': 'copy-themes', onclick: () => navigator.clipboard.writeText(JSON.stringify(L.exportThemes(ids()))).then(() => toast(t('appearance.my_themes.copied')), () => toast(t('appearance.my_themes.copy_failed'), 'bad')) }),
      button(t('appearance.my_themes.import_file'), { 'data-fk': 'import-file', onclick: () => file.click() }), file),
    disclosure(t('appearance.my_themes.paste_heading'), [paste, h('div', { class: 'row' }, button(t('appearance.my_themes.import'), { 'data-fk': 'theme-import', onclick: () => result(parse(paste.value)) }))], { id: 'acc-paste-theme', open: accOpen.get('paste-theme') === true, onToggle: (o) => accOpen.set('paste-theme', o) }));
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

function colourRow(token, lk, now, names) {
  const cell = (m) => {
    const set = lk.colours[m][token];
    const label = `${names[token]}, ${t(`appearance.colours.${m}`)}`;
    const pick = colourField({ value: set || now[m][token], label, onchange: (v) => L.change((s, l) => { l.colours[m][token] = v; }) });
    pick.dataset.fk = `col-${token}-${m}`;
    const reset = h('button', { type: 'button', class: 'dial-btn', title: t('appearance.colours.reset_one'), 'aria-label': `${t('appearance.colours.reset_one')}: ${label}`, 'data-fk': `col-${token}-${m}-reset`,
      onclick: () => L.change((s, l) => { delete l.colours[m][token]; }) }, '↺');
    reset.hidden = !set;
    return h('span', { class: 'colour-cell' }, h('small', { class: 'colour-mode' }, t(`appearance.colours.${m}`)), pick, reset);
  };
  return h('div', { class: 'colour-row' }, h('span', { class: 'colour-name' }, names[token]), cell('light'), cell('dark'));
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
  return h('div', { class: 'look-tools' },
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

// ---- Widget and tab colours ----
// A palette is chosen with familyPicker. The look keeps the palette's step 500 (light mode) and step 300 (dark mode), so it paints before the list loads.
function openPalettePicker(name, current, onPick, noneLabel = t('appearance.ident.none')) {
  let dlg = null;
  const pick = (value) => { onPick(value); dlg.close(); };
  const body = h('div', { class: 'ident-pick' },
    familyPicker({ current: current ? `fam:${current}` : null, label: t('appearance.ident.pick', { name }), fk: (th) => `ident-pick-${th.id.slice(4)}`,
      onPick: (th) => pick({ swatch: th.id.slice(4), light: th.swatch, dark: th.dark }) }),
    button(noneLabel, { 'data-fk': 'ident-pick-none', onclick: () => pick(null) }));
  dlg = openDialog(t('appearance.ident.pick_title', { name }), body, { wide: true });
}

function identRow(kind, id, name, lk) {
  const key = kind === 'widgets' ? 'w' : 't';
  const e = lk.ident[kind][id];
  const set = (fn, opts) => L.change((s, l) => { fn(l.ident[kind]); }, opts);
  const swatch = h('button', { type: 'button', class: 'ident-swatch', 'data-fk': `ident-${key}-${id}-${e ? e.swatch : 'none'}`, 'aria-label': t('appearance.ident.pick', { name }),
    title: e ? e.swatch.replace(/-/g, ' ') : t('appearance.ident.none'),
    onclick: () => openPalettePicker(name, e && e.swatch, (v) => set((m) => {
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
  return h('tr', {}, h('th', { scope: 'row' }, name), h('td', {}, swatch), h('td', {}, op), kind === 'widgets' && h('td', {}, title, title && ` ${t('appearance.ident.title')}`));
}

function identBody(lk) {
  const table = (rows, head) => h('table', { class: 'ident-table' }, h('caption', {}, head), h('tbody', {}, rows));
  const widgets = Object.keys(WIDGETS).map((id) => identRow('widgets', id, t(WIDGETS[id].title), lk));
  const canvases = store.byKind('canvas').slice().sort((a, b) => (a.data?.order ?? 0) - (b.data?.order ?? 0));
  const tabs = canvases.map((c) => identRow('tabs', c.id, c.data?.title || t('canvas.untitled'), lk));
  return h('div', { class: 'look-tools' },
    h('p', { class: 'hint' }, t('appearance.ident.hint')),
    table(widgets, t('appearance.ident.widgets')),
    tabs.length ? table(tabs, t('appearance.ident.tabs')) : h('p', { class: 'note' }, t('appearance.ident.no_tabs')));
}

// Corner radii the Corners choice gives: card, button and chip (40 reads as Round), dialog. Keep in step with CORNERS in boot.js.
const CORNER_PX = { square: [0, 0, 0], soft: [6, 8, 10], round: [10, 40, 14], pill: [20, 40, 20] };
const drawn = (cls, o, text2 = '') => h('span', { class: `${cls} ${cls}-${o}` }, text2);
const cornerSample = (o) => { const el = drawn('corner-sample', o); el.style.borderRadius = `${CORNER_PX[o][0] * 1.5}px`; return el; };

function build(lk, d) {
  items = [];
  ACCS = {};
  advChanged = 0;
  const groupNames = text('appearance.groups');
  const names = text('appearance.colours.tokens');
  const colourGroups = text('appearance.colour_groups');
  const p = L.prefs;
  const defAcc = (key, group, title, o = {}) => { ACCS[key] = { group, title, ...o }; };
  const reg = (group, acc, label, node, o = {}) => {
    if (o.adv) adv(node, o.changed);
    node.dataset.search = `${label} ${groupNames[group]} ${acc ? ACCS[acc].title : ''}`.toLowerCase();
    items.push({ group, acc, label, node, adv: !!o.adv, changed: !!o.changed, sub: o.sub || null });
  };
  const A = (key) => text('appearance.acc')[key];
  const dl = (label, id, key, o) => dial(label, { id, value: lk[key], def: d[key], apply: (v, op) => setLook({ [key]: v }, op), ...o });
  const pct = (label, id, key, min, max, step) => dl(label, id, key, { min, max, step, scale: key === 'zoom' ? 1 : 100, unit: '%' });
  const chg = (key) => lk[key] !== d[key];
  const fontItem = (label, key, allowSame) => {
    const current = lk[key];
    const picker = fontPicker({ value: current, fonts: fontOptions(key, allowSame, current), mono: key === 'mono', label, id: `f-${key}`, onchange: (v) => setLook({ [key]: v }) });
    return h('div', { class: 'opt' }, kit() === 'wa' ? null : h('span', {}, label), picker, weightHint(current) && h('p', { class: 'hint' }, weightHint(current)), axisDials(key, current, lk));
  };

  // 1. Colour
  const theme = L.THEMES[lk.theme] || L.THEMES.foliage;
  const fineChanged = lk.theme === 'custom' || ['nh', 'nc', 'wh'].some((k) => lk.c[k] !== theme[k]);
  reg('theme', null, t('appearance.mode'), seg(t('appearance.mode'), 'mode'), { changed: chg('mode') });
  reg('theme', null, t('appearance.colour.theme'), h('div', { class: 'opt' }, h('span', {}, themeLabel(lk)), themeSwatches()), { changed: lk.theme !== d.theme });
  reg('theme', null, t('appearance.colour.accent'), h('div', { class: 'opt' }, h('span', {}, t('appearance.colour.accent')), accentRow()), { changed: lk.c.ah !== d.c.ah });
  defAcc('families', 'theme', A('families'), { open: lk.theme.startsWith('fam:') });
  reg('theme', 'families', A('families'), h('div', { class: 'opt' }, h('p', { class: 'hint' }, t('appearance.families.hint')),
    familyPicker({ current: lk.theme, onPick: (th) => L.change((s, l) => { l.theme = th.id; l.c = { ...th.c }; }) })), { changed: lk.theme.startsWith('fam:') });
  defAcc('fine_tune', 'theme', A('fine_tune'), { reset: () => L.change((s, l) => { l.strength = d.strength; l.c = { ...l.c, nh: theme.nh, nc: theme.nc, ah: theme.ah, ac: theme.ac, wh: theme.wh }; }) });
  reg('theme', 'fine_tune', t('appearance.colour.strength'), dial(t('appearance.colour.strength'), { id: 'd-strength', min: 0.3, max: 1.7, step: 0.05, value: lk.strength, def: d.strength, scale: 100, unit: '%', apply: (v, o) => setLook({ strength: v }, o) }), { adv: true, changed: chg('strength') });
  [['paper_hue', 'nh', 1, '°'], ['paper_amount', 'nc', 1 / 0.05 * 100, '%'], ['accent_hue', 'ah', 1, '°'], ['accent_vivid', 'ac', 100 / 0.22, '%'], ['attention_hue', 'wh', 1, '°']].forEach(([k, key, scale, unit]) => {
    reg('theme', 'fine_tune', t(`appearance.colour.${k}`), colourDial(t(`appearance.colour.${k}`), key, scale, unit), { adv: true, changed: lk.theme === 'custom' || lk.c[key] !== theme[key] });
  });
  defAcc('my_themes', 'theme', A('my_themes'));
  reg('theme', 'my_themes', t('appearance.my_themes.save'), saveRow());
  reg('theme', 'my_themes', t('appearance.my_themes.heading'), themeTools());
  const now = themeColours();
  L.COLOUR_GROUPS.forEach(([g, tokens]) => {
    const key = `colours:${g}`;
    const title = text('appearance.acc').colours_prefix.replace('{group}', colourGroups[g]);
    defAcc(key, 'theme', title, { reset: () => L.change((s, l) => { tokens.forEach((k) => { delete l.colours.light[k]; delete l.colours.dark[k]; }); }), resetName: title });
    tokens.forEach((k) => reg('theme', key, names[k], colourRow(k, lk, now, names), { adv: true, changed: !!(lk.colours.light[k] || lk.colours.dark[k]) }));
  });
  defAcc('scheduled', 'theme', A('scheduled'));
  reg('theme', 'scheduled', A('scheduled'), scheduled(), { adv: true, changed: L.state.scheduled.length > 0 });

  // 2. Text
  reg('text', null, t('appearance.display.size'), sizePresets(), { changed: L.presetOf(lk) !== 'regular' });
  reg('text', null, t('appearance.type.body'), fontItem(t('appearance.type.body'), 'body', false), { changed: chg('body') });
  defAcc('fonts', 'text', A('fonts'), { reset: () => L.change((s, l) => { ['head', 'num', 'mono'].forEach((k) => { l[k] = d[k]; }); }) });
  [['headings', 'head', true], ['numerals', 'num', true], ['code', 'mono', false]].forEach(([k, key, allow]) => {
    reg('text', 'fonts', t(`appearance.type.${k}`), fontItem(t(`appearance.type.${k}`), key, allow), { adv: true, changed: chg(key) });
  });
  defAcc('weight_spacing', 'text', A('weight_spacing'), { reset: () => L.change((s, l) => { ['weight', 'lh', 'ls', 'monoSize', 'monoLs'].forEach((k) => { l[k] = d[k]; }); }) });
  [['weight', 'd-weight', 'weight', { min: 100, max: 900, step: 10 }], ['line_spacing', 'd-lh', 'lh', { min: 1.25, max: 1.9, step: 0.05 }],
    ['letter_spacing', 'd-ls', 'ls', { min: -0.05, max: 0.15, step: 0.005, scale: 1000 }], ['code_size', 'd-monosize', 'monoSize', { min: 70, max: 150, step: 1, unit: '%' }],
    ['code_spacing', 'd-monols', 'monoLs', { min: -0.05, max: 0.15, step: 0.005, scale: 1000 }]].forEach(([k, id, key, o]) => {
    reg('text', 'weight_spacing', t(`appearance.type.${k}`), dl(t(`appearance.type.${k}`), id, key, o), { adv: true, changed: chg(key) });
  });
  defAcc('text_sizes', 'text', A('text_sizes'), { reset: () => L.change((s, l) => { l.fs = {}; }) });
  const roles = text('appearance.text_sizes.roles');
  const steps = L.FS_STEPS.map((v) => [String(v), t('appearance.text_sizes.step', { px: Math.round(v * 17) })]); // 17 px is XO's root size
  [['ts_headlines', ['display', 'page', 'quote', 'figure', 'dialog']], ['ts_headings', ['section', 'lead', 'brand', 'sub']],
    ['ts_body', ['body', 'large', 'label', 'control']], ['ts_small', ['small', 'small_btn', 'nav', 'tag', 'tiny']]].forEach(([sub, ks]) => {
    ks.forEach((k) => reg('text', 'text_sizes', roles[k], field(roles[k],
      select([['', t('appearance.text_sizes.default')], ...steps], { id: `fs-${k}`, 'data-fk': `fs-${k}`, value: lk.fs[k] ? String(lk.fs[k]) : '',
        onchange: (e) => L.change((s, l) => { if (e.target.value === '') delete l.fs[k]; else l.fs[k] = Number(e.target.value); }) }), null, { half: true }),
    { adv: true, changed: !!lk.fs[k], sub: A(sub) }));
  });

  // 3. Layout
  reg('layout', null, t('appearance.shape.corners'), cards(t('appearance.shape.corners'), 'corners', cornerSample), { changed: chg('corners') });
  defAcc('spacing_size', 'layout', A('spacing_size'), { reset: () => L.change((s, l) => { ['space', 'chrome', 'zoom', 'size'].forEach((k) => { l[k] = d[k]; }); }) });
  reg('layout', 'spacing_size', t('appearance.display.spacing'), pct(t('appearance.display.spacing'), 'd-space', 'space', 0.5, 1.6, 0.05), { adv: true, changed: chg('space') });
  reg('layout', 'spacing_size', t('appearance.display.chrome'), pct(t('appearance.display.chrome'), 'd-chrome', 'chrome', 0.5, 1.5, 0.05), { adv: true, changed: chg('chrome') });
  reg('layout', 'spacing_size', t('appearance.display.zoom'), pct(t('appearance.display.zoom'), 'd-zoom', 'zoom', 25, 175, 5), { adv: true, changed: chg('zoom') });
  reg('layout', 'spacing_size', t('appearance.type.size'), sizeDial(), { adv: true, changed: chg('size') });
  defAcc('radius', 'layout', A('radius'), { reset: () => L.change((s, l) => { Object.assign(l, { rCard: null, rPill: null, rDialog: null }); }) });
  const radius = (label, id, key, max, i, maxLabel) => {
    const def = CORNER_PX[lk.corners][i];
    reg('layout', 'radius', label, dial(label, { id, min: 0, max, step: 1, value: lk[key] ?? def, def, unit: 'px', maxLabel, apply: (v, o) => setLook({ [key]: v === def ? null : v }, o) }), { adv: true, changed: lk[key] !== null });
  };
  radius(t('appearance.shape.card_radius'), 'd-rcard', 'rCard', 32, 0, '');
  radius(t('appearance.shape.pill_radius'), 'd-rpill', 'rPill', 40, 1, t('appearance.shape.round'));
  radius(t('appearance.shape.dialog_radius'), 'd-rdialog', 'rDialog', 32, 2, '');
  defAcc('lines_texture', 'layout', A('lines_texture'), { reset: () => L.change((s, l) => { l.rule = d.rule; l.texture = d.texture; }) });
  reg('layout', 'lines_texture', t('appearance.shape.rule'), seg(t('appearance.shape.rule'), 'rule'), { adv: true, changed: chg('rule') });
  reg('layout', 'lines_texture', t('appearance.shape.texture'), cards(t('appearance.shape.texture'), 'texture', (o) => drawn('tex-sample', o)), { adv: true, changed: chg('texture') });
  // Background pattern: per device, in the look. The seed is made when a kind is first chosen, so the drawing stays the same.
  const pat = lk.pattern;
  const setPattern = (patch, opts) => L.change((s, l) => { l.pattern = { ...l.pattern, ...patch }; }, opts);
  const newSeed = () => uid().replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(8, '0').slice(0, 12);
  const kindLabels = text('appearance.pattern.kinds');
  const patSample = (o) => { const el = drawn('pat-sample', o === 'none' ? 'none' : 'on'); previewPattern(el, o); return el; };
  defAcc('pattern', 'layout', A('pattern'), { reset: () => L.change((s, l) => { l.pattern = { ...d.pattern }; }) });
  reg('layout', 'pattern', t('appearance.pattern.kind'), h('div', { class: 'opt' },
    fkAll(optionCards(t('appearance.pattern.kind'), L.PATTERN_KINDS.map((o) => ({ value: o, title: kindLabels[o], sample: patSample(o) })),
      { value: pat.kind, onchange: (v) => setPattern({ kind: v, seed: pat.seed || newSeed() }) }), 'pattern'),
    h('p', { class: 'hint' }, t('appearance.pattern.hint'))), { changed: pat.kind !== 'none' });
  if (pat.kind !== 'none') {
    const sw = h('button', { type: 'button', class: 'ident-swatch', 'data-fk': `pattern-swatch-${pat.swatch || 'accent'}`, 'aria-label': t('appearance.pattern.pick'),
      title: pat.swatch ? pat.swatch.replace(/-/g, ' ') : t('appearance.pattern.accent'),
      onclick: () => openPalettePicker(t('appearance.pattern.swatch'), pat.swatch, (v) => setPattern(v ? { swatch: v.swatch, light: v.light, dark: v.dark } : { swatch: '', light: '', dark: '' }), t('appearance.pattern.accent')) }, pat.swatch ? '' : 'A');
    if (pat.swatch) sw.style.setProperty('--swatch', pat.light);
    reg('layout', 'pattern', t('appearance.pattern.swatch'), h('div', { class: 'opt' }, h('span', {}, t('appearance.pattern.swatch')), sw), { adv: true, changed: !!pat.swatch });
    reg('layout', 'pattern', t('appearance.pattern.strength'), dial(t('appearance.pattern.strength'), { id: 'd-patpct', min: 0, max: 40, step: 1, value: pat.pct, def: d.pattern.pct, unit: '%', apply: (v, o) => setPattern({ pct: v }, o) }), { adv: true, changed: pat.pct !== d.pattern.pct });
    reg('layout', 'pattern', t('appearance.pattern.shuffle'), h('div', { class: 'row' }, button(t('appearance.pattern.shuffle'), { 'data-fk': 'pattern-shuffle', onclick: () => setPattern({ seed: newSeed() }) })), { adv: true, changed: false });
  }
  defAcc('today_layout', 'layout', A('today_layout'), { reset: () => L.change((s, l) => { ['hero', 'dayline', 'loud', 'line'].forEach((k) => { l[k] = d[k]; }); }) });
  ['hero', 'dayline', 'loud', 'line'].forEach((k) => reg('layout', 'today_layout', t(`appearance.layout.${k}`), cards(t(`appearance.layout.${k}`), k), { adv: true, changed: chg(k) }));

  // 4. Effects
  reg('effects', null, t('appearance.behaviour.pop'), toggle(t('appearance.behaviour.pop'), { checked: p.pop, 'data-fk': 'p-pop', onchange: (on) => setPrefs({ pop: on }) }), { changed: !p.pop });
  reg('effects', null, t('appearance.motion.label'), h('div', { class: 'opt' }, seg(t('appearance.motion.label'), 'motion'), h('p', { class: 'hint' }, t('appearance.motion.hint'))), { changed: chg('motion') });
  defAcc('glass', 'effects', A('glass'), { reset: () => L.change((s, l) => { l.glassAlpha = d.glassAlpha; l.glassBlur = d.glassBlur; }) });
  const glassOn = lk.glassAlpha > 0;
  reg('effects', 'glass', t('appearance.glass_toggle'), h('div', { class: 'opt' }, toggle(t('appearance.glass_toggle'), { checked: glassOn, 'data-fk': 'glass-on', onchange: (on) => setLook({ glassAlpha: on ? 18 : 0 }) }), h('p', { class: 'hint' }, t('appearance.glass.hint'))), { adv: true, changed: glassOn || lk.glassBlur !== d.glassBlur });
  if (glassOn) {
    reg('effects', 'glass', t('appearance.glass.alpha'), dial(t('appearance.glass.alpha'), { id: 'd-glassalpha', min: 0, max: 60, step: 5, value: lk.glassAlpha, def: d.glassAlpha, unit: '%', apply: (v, o) => setLook({ glassAlpha: v }, o) }), { adv: true, changed: false });
    reg('effects', 'glass', t('appearance.glass.blur'), dial(t('appearance.glass.blur'), { id: 'd-glassblur', min: 0, max: 30, step: 1, value: lk.glassBlur, def: d.glassBlur, unit: 'px', apply: (v, o) => setLook({ glassBlur: v }, o) }), { adv: true, changed: false });
  }
  defAcc('figures', 'effects', A('figures'), { reset: () => setLook({ figure: d.figure }) });
  reg('effects', 'figures', t('appearance.figure.label'), cards(t('appearance.figure.label'), 'figure', (o) => drawn('fig-sample', o, '12')), { adv: true, changed: chg('figure') });

  // 5. Screens
  const kitLabels = { xo: t('appearance.kit.xo'), daisy: t('appearance.kit.daisy'), wa: t('appearance.kit.wa') };
  reg('screens', null, t('appearance.kit.label'), h('div', { class: 'opt' }, cards(t('appearance.kit.label'), 'kit', null, kitLabels), h('p', { class: 'hint' }, t('appearance.kit.hint'))), { changed: chg('kit') });
  reg('screens', null, t('appearance.behaviour.clock'), fkAll(segmented(t('appearance.behaviour.clock'), [['12', t('appearance.behaviour.clock_12')], ['24', t('appearance.behaviour.clock_24')]],
    { value: p.clock24 ? '24' : '12', onchange: (v) => { setPrefs({ clock24: v === '24' }); kvSet('clock24', v === '24').catch(() => {}); } }), 'clock'), { changed: p.clock24 });
  reg('screens', null, t('appearance.behaviour.header_title'), field(t('appearance.behaviour.header_title'), input({ id: 'p-title', type: 'text', maxlength: 24, value: p.title, 'data-fk': 'p-title', onchange: (e) => setPrefs({ title: e.target.value }) }), null, { half: true }), { changed: p.title !== 'XO' });
  reg('screens', null, t('appearance.behaviour.call_me'), field(t('appearance.behaviour.call_me'), input({ id: 'p-call', type: 'text', maxlength: 30, value: p.callMe, placeholder: t('appearance.behaviour.call_me_placeholder'), 'data-fk': 'p-call', onchange: (e) => setPrefs({ callMe: e.target.value }) }), t('appearance.behaviour.call_me_hint'), { half: true }), { changed: p.callMe !== '' });
  const sections = text('app.nav');
  const defTabs = ['today', 'diary', 'tasks', 'obligations'];
  const swapTab = (i, value) => L.change((s) => {
    const tabs = s.prefs.tabs.slice();
    const j = tabs.indexOf(value);
    if (j >= 0) tabs[j] = tabs[i]; // already on the bar: swap places
    tabs[i] = value;
    s.prefs.tabs = tabs;
  });
  defAcc('bottom_tabs', 'screens', A('bottom_tabs'), { reset: () => L.change((s) => { s.prefs.tabs = defTabs.slice(); }) });
  p.tabs.forEach((tab, i) => reg('screens', 'bottom_tabs', t('appearance.behaviour.position', { n: i + 1 }), field(t('appearance.behaviour.position', { n: i + 1 }),
    select(L.SECTIONS.map((sec) => [sec, sections[sec]]), { id: `tab-${i}`, 'data-fk': `tab-${i}`, value: tab, onchange: (e) => swapTab(i, e.target.value) }), null, { half: true }), { adv: true, changed: tab !== defTabs[i] }));
  defAcc('icons', 'screens', A('icons'), { reset: () => L.change((s) => { s.prefs.icons = {}; s.prefs.navIcons = true; }) });
  reg('screens', 'icons', t('appearance.icons.show'), h('div', { class: 'opt' }, toggle(t('appearance.icons.show'), { checked: p.navIcons, 'data-fk': 'p-navicons', onchange: (on) => setPrefs({ navIcons: on }) }),
    h('p', { class: 'hint' }, t('appearance.icons.hint'))), { changed: !p.navIcons });
  reg('screens', 'icons', A('icons'), h('ul', { class: 'icon-list' }, [...L.SECTIONS, 'more'].map((k) => {
    const ico = icon(p.icons[k] || DEFAULT_ICONS[k]);
    const name = k === 'more' ? t('app.more') : sections[k];
    const btn = button([ico, h('span', {}, name)], { class: 'icon-pick', 'data-fk': `icon-${k}`, 'aria-label': t('appearance.icons.change', { name }),
      onclick: (e) => pickScreenIcon(e.currentTarget, k, (v) => paintIcon(ico, v)) });
    return h('li', {}, btn);
  })), { changed: Object.keys(p.icons).length > 0 });
  const blockNames = text('appearance.blocks');
  defAcc('blocks', 'screens', A('blocks'), { reset: () => L.change((s) => { s.prefs.blocks = L.BLOCKS.slice(); s.prefs.hidden = []; }) });
  reg('screens', 'blocks', A('blocks'), h('div', { class: 'look-tools' }, h('p', { class: 'hint' }, t('appearance.behaviour.blocks_hint')),
    sortList(p.blocks, { label: A('blocks'),
      render: (k) => (k === 'line'
        ? toggle(blockNames[k], { checked: look().line !== 'hidden', disabled: true, 'aria-label': t('appearance.behaviour.line_aria') })
        : toggle(blockNames[k], { checked: !p.hidden.includes(k), 'data-fk': `blk:${k}`, onchange: (on) => L.change((s) => { s.prefs.hidden = on ? s.prefs.hidden.filter((x) => x !== k) : [...s.prefs.hidden, k]; }) })),
      onmove: (from, to, list) => L.change((s) => { s.prefs.blocks = list; }) })),
  { adv: true, changed: !same(p.blocks, L.BLOCKS) || p.hidden.length > 0 });
  defAcc('ident', 'screens', A('ident'), { reset: () => L.change((s, l) => { l.ident = { widgets: {}, tabs: {} }; }) });
  reg('screens', 'ident', A('ident'), identBody(lk), { adv: true, changed: Object.keys(lk.ident.widgets).length + Object.keys(lk.ident.tabs).length > 0 });

  // 6. Share and reset
  const code = L.encode(lk);
  const paste = input({ type: 'text', placeholder: t('appearance.presets.paste'), 'aria-label': t('appearance.presets.paste'), 'data-fk': 'paste' });
  const applyCode = () => {
    const parsed = L.decode(paste.value);
    if (!parsed) { toast(t('appearance.presets.bad_code'), 'bad'); return; }
    L.change((s, l) => { Object.assign(l, parsed); });
    toast(t('appearance.presets.applied'));
  };
  reg('share', null, t('appearance.quick.surprise'), h('div', { class: 'opt' }, h('div', { class: 'row' },
    button(t('appearance.quick.surprise'), { variant: 'primary', 'data-fk': 'surprise', onclick: surprise }),
    button(t('appearance.quick.undo'), { disabled: !L.canUndo, 'data-fk': 'undo-share', onclick: () => L.undo() })),
  h('p', { class: 'hint' }, t('appearance.presets.hint'))));
  reg('share', null, t('appearance.presets.code_heading'), h('div', { class: 'opt' }, h('span', {}, t('appearance.presets.code_heading')),
    h('p', { class: 'hint' }, t('appearance.presets.code_hint')),
    textarea({ class: 'code', readonly: true, rows: 2, 'aria-label': t('appearance.presets.code_aria'), value: code }),
    h('div', { class: 'row' }, button(t('appearance.presets.copy'), { onclick: () => navigator.clipboard.writeText(code).then(() => toast(t('appearance.presets.copied')), () => toast(t('appearance.presets.copy_failed'), 'bad')) }))), { adv: true });
  reg('share', null, t('appearance.presets.paste'), h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); applyCode(); } }, paste, button(t('appearance.presets.apply'), { type: 'submit' })), { adv: true });
  reg('share', null, t('appearance.presets.reset'), h('div', { class: 'row' }, button(t('appearance.presets.reset'), { variant: 'danger', 'data-fk': 'reset-all', onclick: confirmReset })));
}

function confirmReset() {
  let dlg = null;
  const go = () => { L.reset(); kvSet('clock24', false).catch(() => {}); toast(t('appearance.presets.reset_done')); dlg.close(); };
  dlg = openDialog(t('appearance.presets.reset'), h('div', { class: 'panel' }, h('p', {}, t('appearance.reset_all_confirm')),
    h('div', { class: 'row' }, button(t('appearance.presets.reset'), { variant: 'danger', 'data-fk': 'reset-confirm', onclick: go }), button(t('common.cancel'), { onclick: () => dlg.close() }))));
}

// A group's settings: the always-visible ones, then one accordion for each cluster. Advanced ones show only in Advanced.
function groupBody(g, view) {
  const shown = (i) => view === 'advanced' || !i.adv || i.changed;
  const mine = items.filter((i) => i.group === g && shown(i));
  const keys = [...new Set(mine.filter((i) => i.acc).map((i) => i.acc))];
  const accs = keys.map((k) => {
    const def = ACCS[k];
    const n = items.filter((i) => i.acc === k && i.changed).length;
    const body = [];
    let sub = null;
    mine.filter((i) => i.acc === k).forEach((i) => {
      if (i.sub && i.sub !== sub) { sub = i.sub; body.push(h('h3', { class: 'look-sub' }, i.sub)); }
      body.push(i.node);
    });
    if (def.reset) body.push(h('div', { class: 'look-reset' }, button(t('appearance.acc.reset_one', { name: def.title }), { class: 'small', 'data-fk': `reset-${k}`, onclick: def.reset })));
    return disclosure(def.title, h('div', { class: 'look-acc' }, body), { id: `acc-${k.replace(':', '-')}`, open: accOpen.has(k) ? accOpen.get(k) : !!def.open,
      badge: n ? badge(t('appearance.acc.changed', { n }), 'accent') : null, onToggle: (o) => accOpen.set(k, o) });
  });
  return [h('div', { class: 'look-acc' }, mine.filter((i) => !i.acc).map((i) => i.node)), accs];
}

function resultsBody(q) {
  const names = text('appearance.groups');
  const hits = items.filter((i) => i.node.dataset.search.includes(q));
  if (!hits.length) return h('p', { class: 'note' }, t('appearance.search.none'));
  return [h('h2', { class: 'look-results' }, t('appearance.search.results')),
    GROUPS.filter((g) => hits.some((i) => i.group === g)).map((g) => h('section', {}, h('h3', { class: 'look-sub' }, names[g]),
      h('div', { class: 'look-acc' }, hits.filter((i) => i.group === g).map((i) => i.node))))];
}

function previewBody() {
  return h('div', { class: 'look-preview-body' }, preview(), stat(t('appearance.preview_figure'), '12'),
    h('div', { class: 'xo-w look-w' }, h('div', { class: 'xo-w-head' }, h('h2', { class: 'xo-w-title' }, t('appearance.preview_widget'))), h('div', { class: 'xo-w-body' }, t('appearance.preview_widget_body'))));
}

const wideQuery = window.matchMedia('(min-width: 72rem)');
wideQuery.addEventListener('change', () => { if (document.querySelector('.look-screen')) redraw(); });

export function render(root) {
  const a = L.active();
  const lk = a.look;
  const d = L.defaultLook();
  const view = L.prefs.view;
  const wide = wideQuery.matches;
  loadCatalogue();
  build(lk, d);
  root.dataset.view = view;
  const names = text('appearance.groups');
  const changedIn = (g) => items.filter((i) => i.group === g && i.changed).length;
  let panel = null;
  const tabItems = () => GROUPS.map((g) => ({ key: g, label: names[g], badge: changedIn(g) || '' }));
  const tabs = tabStrip({ label: t('appearance.heading'), vertical: wide, panelId: 'look-panel',
    onSelect: (k) => {
      L.change((s) => { s.prefs.lookTab = k; }, { quiet: true, sameStep: true });
      query = '';
      search.value = '';
      paint();
    } });
  const search = searchBox({ placeholder: t('appearance.search.placeholder'), label: t('appearance.search.label'), value: query, id: 'look-search',
    oninput: (v) => { query = v; paint(); } });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && query) { e.preventDefault(); query = ''; search.value = ''; paint(); } });
  function paint() {
    const q = query.trim().toLowerCase();
    tabs.set(tabItems(), q ? null : L.prefs.lookTab);
    panel.replaceChildren(...[q ? resultsBody(q) : groupBody(L.prefs.lookTab, view)].flat(Infinity));
  }
  panel = h('div', { class: 'look-panel', id: 'look-panel', role: 'tabpanel' });
  const views = [['standard', t('appearance.view.standard')], ['advanced', advChanged > 0 ? t('appearance.view.advanced_changed', { n: advChanged }) : t('appearance.view.advanced')]];
  const viewSeg = fkAll(segmented(t('appearance.view.label'), views, { value: view, onchange: (v) => setPrefs({ view: v }) }), 'view');
  const undo = button(t('appearance.quick.undo'), { disabled: !L.canUndo, 'data-fk': 'undo', onclick: () => L.undo() });
  paint();
  const previewKey = 'preview';
  const previewDisc = wide ? null : disclosure(t('appearance.preview_label'), previewBody(), { id: 'acc-preview', open: accOpen.get(previewKey) === true, onToggle: (o) => accOpen.set(previewKey, o) });
  put(root, h('div', { class: 'look-screen', 'data-fonts': catalogue ? 'ready' : 'loading' },
    h('header', { class: 'page-head' }, h('h1', {}, t('appearance.heading'))),
    a.item && h('div', { class: 'banner' },
      h('span', {}, t('appearance.banner', { name: a.item.name, from: fmtTime(a.item.from), to: fmtTime(a.item.to) })),
      L.editing && button(t('appearance.stop_editing'), { class: 'small', onclick: () => L.setEditing(null) })),
    h('p', { class: 'note' }, t('appearance.device_only')),
    h('div', { class: 'look-bar' }, viewSeg, search, undo),
    h('p', { class: 'hint' }, t('appearance.view.hint')),
    previewDisc,
    h('div', { class: 'look-cols' }, tabs.el, panel, wide && h('aside', { class: 'look-preview', 'aria-label': t('appearance.preview_label') }, h('h2', {}, t('appearance.preview_label')), previewBody()))));
}
