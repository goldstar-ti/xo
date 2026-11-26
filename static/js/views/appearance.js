// Appearance: the quick "Look" panel and the full Appearance screen.
// All of it is stored on this device only (see boot.js).
import { t } from '../text.js';
import { fmtTime, h, kvSet, openDialog, put, toast, uid } from '../util.js';

export const live = false;
const L = window.XOLook;

const look = () => L.active().look;
const setLook = (patch, opts) => L.change((s, lk) => Object.assign(lk, patch), opts);
const setPrefs = (patch) => L.change((s) => Object.assign(s.prefs, patch));
const redraw = () => window.dispatchEvent(new CustomEvent('xo:look', { detail: { quiet: false } }));
const title = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const SECTION_NAMES = { today: 'Today', diary: 'Diary', tasks: 'Tasks', obligations: 'Obligations', routine: 'Routine', bills: 'Bills', checkin: 'Check-ins', plan: 'My plan', settings: 'Settings', appearance: 'Appearance' };
const BLOCK_NAMES = { line: 'Daily line', next: 'Next up', three: 'Today’s three', day: 'The day', coming: 'Coming up', plan: 'Plan progress' };
const HUES = [25, 50, 80, 110, 140, 165, 195, 225, 255, 285, 315, 345];

// One-of-several buttons for a look setting.
function seg(label, key, labels = {}) {
  const current = look()[key];
  return h('div', { class: 'opt' }, h('span', {}, label),
    h('div', { class: 'chips', role: 'group', 'aria-label': label }, L.CHOICES[key].map((opt) =>
      h('button', { type: 'button', class: `chip${current === opt ? ' on' : ''}`, 'aria-pressed': String(current === opt), 'data-fk': `${key}:${opt}`, onclick: () => setLook({ [key]: opt }) }, labels[opt] || title(opt)))));
}

// A slider. Dragging applies quietly (no screen rebuild); letting go counts as one undo step.
function dial(label, { id, min, max, step, value, fmt = (v) => v, apply }) {
  let dragging = false;
  const out = h('output', { for: id }, fmt(value));
  const input = h('input', {
    id, type: 'range', min, max, step, value, 'data-fk': id,
    oninput: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); apply(v, { quiet: true, sameStep: dragging }); dragging = true; },
    onchange: () => { dragging = false; redraw(); },
  });
  return h('div', { class: 'dial' }, h('label', { for: id }, label), input, out);
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
  const named = Object.entries(L.THEMES).map(([id, t]) => themeSwatch(id, t.name, L.colourOf(id)));
  const mine = L.state.myThemes.map((t) => themeSwatch(`my:${t.id}`, t.name, t.c));
  return h('div', { class: 'swatches' }, named, mine);
}
function accentRow() {
  const lk = look();
  const themeHue = L.THEMES[lk.theme]?.ah;
  const usingTheme = themeHue !== undefined && lk.c.ah === themeHue;
  return h('div', { class: 'hues', role: 'group', 'aria-label': 'Accent colour' },
    themeHue !== undefined && h('button', { type: 'button', class: `hue auto${usingTheme ? ' on' : ''}`, 'data-fk': 'hue:theme', onclick: () => L.change((s, l2) => { l2.c.ah = themeHue; l2.c.ac = L.THEMES[l2.theme].ac; }) }, 'Theme'),
    HUES.map((hue) => {
      const el = h('button', { type: 'button', class: `hue${!usingTheme && Math.abs(lk.c.ah - hue) < 8 ? ' on' : ''}`, 'aria-label': `Accent hue ${hue}`, 'data-fk': `hue:${hue}`,
        onclick: () => L.change((s, l2) => { l2.c.ah = hue; l2.c.ac = Math.max(l2.c.ac, 0.12); }) });
      el.style.background = `oklch(0.56 0.15 ${hue})`;
      return el;
    }));
}
const sizeDial = () => dial('Text size', { id: 'd-size', min: 85, max: 135, step: 1, value: look().size, fmt: (v) => `${v}%`, apply: (v, o) => setLook({ size: v }, o) });
const modeSeg = () => seg('Mode', 'mode');

// ---- quick panel ----
export function openLookPanel() {
  const body = h('div', { class: 'panel' });
  const draw = () => {
    body.replaceChildren();
    put(body,
      modeSeg(),
      h('div', { class: 'opt' }, h('span', {}, 'Theme'), themeSwatches()),
      h('div', { class: 'opt' }, h('span', {}, 'Accent'), accentRow()),
      sizeDial(),
      h('div', { class: 'row' },
        h('button', { class: 'ghost', type: 'button', onclick: () => L.surprise() }, 'Surprise me'),
        h('button', { class: 'ghost', type: 'button', disabled: !L.canUndo, onclick: () => L.undo() }, 'Undo'),
        h('a', { class: 'primary', href: '#/appearance', onclick: () => dlg.close() }, 'All appearance options')));
  };
  const onLook = (e) => { if (!e.detail.quiet) draw(); };
  window.addEventListener('xo:look', onLook);
  const dlg = openDialog('Look', body, { wide: true });
  dlg.addEventListener('close', () => window.removeEventListener('xo:look', onLook));
  draw();
}

// ---- full screen ----
function preview() {
  return h('div', { class: 'preview', 'aria-label': 'Preview' },
    h('section', { class: 'next' }, h('p', { class: 'next-head' }, 'Get ready in 40 min'), h('p', { class: 'next-title' }, 'Sample appointment'), h('p', { class: 'next-sub' }, `${fmtTime('14:30')}, somewhere nearby`)),
    h('ol', { class: 'dayline' },
      h('li', { class: 'entry k-tick done past' }, h('span', { class: 't' }, fmtTime('08:30')), h('span', { class: 'what' }, 'Breakfast'), h('span', { class: 'tick on' }, 'Done')),
      h('li', { class: 'now' }, h('span', { class: 't' }, fmtTime('11:05')), h('span', { class: 'now-rule' }, 'Now')),
      h('li', { class: 'entry k-tick' }, h('span', { class: 't' }, fmtTime('12:30')), h('span', { class: 'what' }, 'Lunch'), h('span', { class: 'tick' }, 'Tick'))),
    h('div', { class: 'row' }, h('span', { class: 'chip on' }, 'chosen'), h('span', { class: 'chip' }, 'not chosen'), h('span', { class: 'primary' }, 'Button'), h('span', { class: 'ghost' }, 'Button')),
    h('p', { class: 'note' }, 'Body text looks like this. ', h('a', { href: '#/appearance' }, 'A link looks like this'), '. ', h('span', { class: 'num' }, '0123456789 $612.50')));
}

function fontSelect(label, key, allowSame) {
  const id = `f-${key}`;
  return h('div', { class: 'field half' }, h('label', { for: id }, label),
    h('select', { id, 'data-fk': id, value: look()[key], onchange: (e) => setLook({ [key]: e.target.value }) },
      allowSame && h('option', { value: 'same' }, 'Same as body'),
      Object.entries(L.FONTS).map(([k, f]) => h('option', { value: k }, f.name))));
}

function myThemes() {
  const name = h('input', { type: 'text', placeholder: 'Name for these colours', 'aria-label': 'Name for these colours', maxlength: 30, 'data-fk': 'mytheme-name' });
  const saveIt = () => {
    const n = name.value.trim();
    if (!n) { toast('Give the theme a name first.', 'bad'); name.focus(); return; }
    const id = uid().slice(0, 8);
    L.change((s, lk) => { s.myThemes.push({ id, name: n, c: { ...lk.c } }); lk.theme = `my:${id}`; });
    toast(`Saved “${n}”`);
  };
  return h('div', { class: 'opt' }, h('span', {}, 'My themes'),
    h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); saveIt(); } }, name, h('button', { class: 'ghost', type: 'submit' }, 'Save current colours')),
    L.state.myThemes.length > 0 && h('ul', { class: 'blocks' }, L.state.myThemes.map((t) => h('li', {}, h('span', {}, t.name),
      h('button', { class: 'ghost small', type: 'button', onclick: () => L.change((s) => { s.myThemes = s.myThemes.filter((x) => x.id !== t.id); }) }, 'Remove')))));
}

function scheduled() {
  const a = L.active();
  const name = h('input', { id: 'sch-name', type: 'text', placeholder: 'Night', maxlength: 30 });
  const from = h('input', { id: 'sch-from', type: 'time', value: '21:00' });
  const to = h('input', { id: 'sch-to', type: 'time', value: '06:00' });
  const add = () => {
    if (!from.value || !to.value || from.value === to.value) { toast('Set a start and an end time that differ.', 'bad'); return; }
    const id = uid().slice(0, 8);
    L.change((s, lk) => { s.scheduled.push({ id, name: name.value.trim() || 'Scheduled', from: from.value, to: to.value, look: JSON.parse(JSON.stringify(lk)) }); });
    L.setEditing(id);
    toast('Added. You are now editing it.');
  };
  return h('section', { class: 'look-sec' }, h('h2', {}, 'Scheduled looks'),
    h('p', { class: 'note' }, 'A scheduled look takes over between two times each day, for example a dimmer one late at night. It starts as a copy of what is on screen now; then you change it.'),
    L.state.scheduled.length > 0 && h('ul', { class: 'blocks' }, L.state.scheduled.map((s) => h('li', {},
      h('span', {}, `${s.name}, ${fmtTime(s.from)} to ${fmtTime(s.to)}`, a.item?.id === s.id && h('small', {}, ' showing now')),
      a.item?.id !== s.id && h('button', { class: 'ghost small', type: 'button', onclick: () => L.setEditing(s.id) }, 'Edit'),
      h('button', { class: 'ghost small', type: 'button', onclick: () => { if (L.editing === s.id) L.setEditing(null); L.change((st) => { st.scheduled = st.scheduled.filter((x) => x.id !== s.id); }); } }, 'Remove')))),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', { for: 'sch-name' }, 'Name'), name),
      h('div', { class: 'field half' }, h('label', { for: 'sch-from' }, 'From'), from),
      h('div', { class: 'field half' }, h('label', { for: 'sch-to' }, 'Until'), to)),
    h('button', { class: 'ghost', type: 'button', onclick: add }, 'Add scheduled look'));
}

function behaviour() {
  const p = L.prefs;
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
  return h('section', { class: 'look-sec' }, h('h2', {}, 'Behaviour'),
    h('div', { class: 'opt' }, h('span', {}, 'Clock'),
      h('div', { class: 'chips' }, [[false, '12-hour (2:30 pm)'], [true, '24-hour (14:30)']].map(([v, label]) =>
        h('button', { type: 'button', class: `chip${p.clock24 === v ? ' on' : ''}`, 'aria-pressed': String(p.clock24 === v), 'data-fk': `clock:${v}`,
          onclick: () => { setPrefs({ clock24: v }); kvSet('clock24', v).catch(() => {}); } }, label)))),
    h('h3', {}, 'Phone bottom bar'),
    h('p', { class: 'hint' }, 'Four sections, left to right. Everything else sits under More.'),
    h('div', { class: 'fields' }, p.tabs.map((t, i) => h('div', { class: 'field half' }, h('label', { for: `tab-${i}` }, `Position ${i + 1}`),
      h('select', { id: `tab-${i}`, 'data-fk': `tab-${i}`, value: t, onchange: (e) => swapTab(i, e.target.value) }, L.SECTIONS.map((sec) => h('option', { value: sec }, SECTION_NAMES[sec])))))),
    h('h3', {}, 'Today blocks'),
    h('p', { class: 'hint' }, 'Reorder with the arrows. Untick to hide. The daily line is shown or hidden under Layout.'),
    h('ul', { class: 'blocks' }, p.blocks.map((k, i) => h('li', {},
      k === 'line' ? h('input', { type: 'checkbox', checked: look().line !== 'hidden', disabled: true, 'aria-label': 'Daily line: set under Layout' })
        : h('input', { type: 'checkbox', checked: !p.hidden.includes(k), 'aria-label': `Show ${BLOCK_NAMES[k]}`, 'data-fk': `blk:${k}`, onchange: (e) => toggleBlock(k, e.target.checked) }),
      h('span', {}, BLOCK_NAMES[k]),
      h('button', { class: 'ghost small', type: 'button', disabled: i === 0, 'aria-label': `Move ${BLOCK_NAMES[k]} up`, 'data-fk': `up:${k}`, onclick: () => move(k, -1) }, 'Up'),
      h('button', { class: 'ghost small', type: 'button', disabled: i === p.blocks.length - 1, 'aria-label': `Move ${BLOCK_NAMES[k]} down`, 'data-fk': `down:${k}`, onclick: () => move(k, 1) }, 'Down')))),
    h('h3', {}, 'Title and greeting'),
    h('div', { class: 'fields' },
      h('div', { class: 'field half' }, h('label', { for: 'p-title' }, 'Header title'),
        h('input', { id: 'p-title', type: 'text', maxlength: 24, value: p.title, 'data-fk': 'p-title', onchange: (e) => setPrefs({ title: e.target.value }) })),
      h('div', { class: 'field half' }, h('label', { for: 'p-call' }, 'What XO calls you'),
        h('input', { id: 'p-call', type: 'text', maxlength: 30, value: p.callMe, placeholder: 'Captain', 'data-fk': 'p-call', onchange: (e) => setPrefs({ callMe: e.target.value }) }),
        h('small', {}, 'Blank for no greeting.'))),
    h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: p.pop, 'data-fk': 'p-pop', onchange: (e) => setPrefs({ pop: e.target.checked }) }), h('span', {}, 'A small pop when I tick something')));
}

function presets() {
  const code = L.encode(look());
  const paste = h('input', { type: 'text', placeholder: 'Paste a look code', 'aria-label': 'Paste a look code', 'data-fk': 'paste' });
  const applyCode = () => {
    const parsed = L.decode(paste.value);
    if (!parsed) { toast('That is not a complete look code. They start with XO1- and carry the whole look.', 'bad'); return; }
    L.change((s, lk) => { Object.assign(lk, parsed); });
    toast('Look applied');
  };
  let armed = false;
  const reset = h('button', { class: 'ghost danger', type: 'button' }, 'Reset everything');
  reset.addEventListener('click', () => {
    if (!armed) { armed = true; reset.textContent = 'Tap again to reset'; return; }
    L.reset(); kvSet('clock24', false).catch(() => {}); toast('Back to the original look');
  });
  return h('section', { class: 'look-sec' }, h('h2', {}, 'Presets'),
    h('div', { class: 'row' },
      h('button', { class: 'primary', type: 'button', 'data-fk': 'surprise', onclick: () => L.surprise() }, 'Surprise me'),
      h('button', { class: 'ghost', type: 'button', disabled: !L.canUndo, 'data-fk': 'undo', onclick: () => L.undo() }, 'Undo'),
      reset),
    h('p', { class: 'hint' }, 'Surprise me changes theme, typefaces, shape and layout. It leaves text size, weight, spacing, density and mode alone. Your saved themes survive a reset.'),
    h('h3', {}, 'Look code'),
    h('p', { class: 'hint' }, 'This code is the look on screen now. Copy it to keep it, or to type it into another device.'),
    h('textarea', { class: 'code', readonly: true, rows: 2, 'aria-label': 'Look code', value: code }),
    h('div', { class: 'row' }, h('button', { class: 'ghost', type: 'button', onclick: () => navigator.clipboard.writeText(code).then(() => toast('Copied'), () => toast('Select the code and copy it by hand.', 'bad')) }, 'Copy code')),
    h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); applyCode(); } }, paste, h('button', { class: 'ghost', type: 'submit' }, 'Apply code')));
}

export function render(root) {
  const a = L.active();
  const lk = a.look;
  const pct = (v) => `${Math.round(v * 100)}%`;
  put(root,
    h('header', { class: 'page-head' }, h('h1', {}, 'Appearance')),
    a.item && h('div', { class: 'banner' },
      h('span', {}, `Showing and editing: ${a.item.name} (${fmtTime(a.item.from)} to ${fmtTime(a.item.to)}). Changes below apply to this scheduled look only.`),
      L.editing && h('button', { class: 'ghost small', type: 'button', onclick: () => L.setEditing(null) }, 'Stop editing')),
    h('p', { class: 'note' }, 'Your look is kept on this device only. Each device has its own.'),
    preview(),
    presets(),
    h('section', { class: 'look-sec' }, h('h2', {}, 'Colour'),
      modeSeg(),
      h('div', { class: 'opt' }, h('span', {}, lk.theme === 'custom' ? 'Theme (custom colours showing)' : 'Theme'), themeSwatches()),
      h('div', { class: 'opt' }, h('span', {}, 'Accent'), accentRow()),
      dial('Colour strength', { id: 'd-strength', min: 0.3, max: 1.7, step: 0.05, value: lk.strength, fmt: pct, apply: (v, o) => setLook({ strength: v }, o) }),
      h('h3', {}, 'Fine-tune'),
      colourDial('Paper tint hue', 'nh', (v) => `${v}°`),
      colourDial('Paper tint amount', 'nc', (v) => pct(v / 0.05)),
      colourDial('Accent hue', 'ah', (v) => `${v}°`),
      colourDial('Accent vividness', 'ac', (v) => pct(v / 0.22)),
      colourDial('Attention hue', 'wh', (v) => `${v}°`),
      h('p', { class: 'hint' }, 'Attention is the colour used for Now, overdue and leave-now. Lightness is fixed for every colour, so text stays readable wherever the sliders sit.'),
      myThemes()),
    h('section', { class: 'look-sec' }, h('h2', {}, 'Type'),
      h('div', { class: 'fields' }, fontSelect('Body', 'body', false), fontSelect('Headings', 'head', true), fontSelect('Numerals', 'num', true)),
      h('p', { class: 'hint' }, 'Numerals covers the time column, the clock and amounts.'),
      sizeDial(),
      dial('Weight', { id: 'd-weight', min: 300, max: 550, step: 10, value: lk.weight, apply: (v, o) => setLook({ weight: v }, o) }),
      dial('Line spacing', { id: 'd-lh', min: 1.25, max: 1.9, step: 0.05, value: lk.lh, fmt: (v) => v.toFixed(2), apply: (v, o) => setLook({ lh: v }, o) }),
      dial('Letter spacing', { id: 'd-ls', min: -0.02, max: 0.08, step: 0.005, value: lk.ls, fmt: (v) => `${Math.round(v * 1000)}`, apply: (v, o) => setLook({ ls: v }, o) })),
    h('section', { class: 'look-sec' }, h('h2', {}, 'Shape and space'),
      seg('Corners', 'corners'), seg('Density', 'density'), seg('Line weight', 'rule'),
      seg('Background texture', 'texture', { grid: 'Grid paper' })),
    h('section', { class: 'look-sec' }, h('h2', {}, 'Layout'),
      seg('Next-up block', 'hero'), seg('Day line', 'dayline'), seg('Heading loudness', 'loud'),
      seg('Daily line', 'line', { quote: 'Pull-quote' })),
    h('section', { class: 'look-sec' }, h('h2', {}, t('appearance.kit.title')),
      seg(t('appearance.kit.label'), 'kit', { xo: t('appearance.kit.xo'), daisy: t('appearance.kit.daisy'), wa: t('appearance.kit.wa') }),
      h('p', { class: 'hint' }, t('appearance.kit.hint'))),
    behaviour(),
    scheduled(),
  );
}
