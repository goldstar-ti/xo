// Phosphor and Tabler icons, as in NOBBIE.
//
// An icon value is `name` (Phosphor Regular), `name:fill` (Phosphor Fill), `tabler/name`
// (Tabler outline, stroke 1.75) or `tabler/name:fill` (Tabler filled). The side bar's defaults
// are in icon-core.js and draw at once; any other icon loads its set's file from
// static/vendor/icons/ the first time it is needed (the service worker keeps a copy).
// scripts/build_icons.py (make icons) writes those files.
// Exports for buttons: iconButton(value, label, attrs), setIcon(button, value), setLabel(button, label).
import { CORE, TABLER_CORE } from './icon-core.js';
import { h } from './util.js';

// The default icon for each screen and for the phone's More tab.
export const DEFAULT_ICONS = {
  today: 'tabler/sun', diary: 'tabler/calendar-event', tasks: 'tabler/list-check', notes: 'note-pencil', obligations: 'tabler/scale',
  routine: 'arrows-clockwise', bills: 'receipt', checkin: 'heartbeat', plan: 'map-trifold', appearance: 'palette',
  settings: 'gear-six', canvas: 'squares-four', tracker: 'kanban', more: 'tabler/dots',
};

// Icons on the side bar's own buttons.
export const CHROME = { collapse: 'caret-double-left', expand: 'caret-double-right', look: 'tabler/palette', plan_card: 'tabler/lifebuoy' };

export const VALUE_RE = /^(tabler\/)?[a-z0-9-]{1,60}(:fill)?$/;

const SETS = ['phosphor-regular', 'phosphor-fill', 'tabler-outline', 'tabler-filled'];
const maps = {}; // set key -> { name: inner markup }
const loading = {};

// Splits a value into its set file key and icon name.
export function parseIcon(value) {
  const v = VALUE_RE.test(value || '') ? value : DEFAULT_ICONS.today;
  const tabler = v.startsWith('tabler/');
  const [name, weight] = (tabler ? v.slice(7) : v).split(':');
  const fill = weight === 'fill';
  return { tabler, name, fill, set: tabler ? (fill ? 'tabler-filled' : 'tabler-outline') : (fill ? 'phosphor-fill' : 'phosphor-regular') };
}

export function iconValue(tabler, name, fill) {
  return `${tabler ? 'tabler/' : ''}${name}${fill ? ':fill' : ''}`;
}

// Loads one set's file once. Resolves to its map, or an empty one when offline with no copy.
export function loadSet(set) {
  if (!SETS.includes(set)) return Promise.resolve({});
  if (maps[set]) return Promise.resolve(maps[set]);
  loading[set] ||= fetch(`/vendor/icons/${set}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m) => {
    maps[set] = m;
    if (!Object.keys(m).length) delete loading[set]; // try again next time
    return m;
  });
  return loading[set];
}

let catalogue = null;
export function loadCatalogue() {
  catalogue ||= fetch('/vendor/icons/catalogue.json').then((r) => r.json()).catch(() => { catalogue = null; return { phosphor: { cats: [], tags: {} }, tabler: { cats: [], tags: {} } }; });
  return catalogue;
}

function svg(p, body) {
  if (!body) return '';
  const attrs = p.tabler && !p.fill
    ? 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'
    : `viewBox="${p.tabler ? '0 0 24 24' : '0 0 256 256'}" fill="currentColor"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs} aria-hidden="true" focusable="false">${body}</svg>`;
}

// The markup for a value, or '' when its set has not loaded yet.
function markup(value) {
  const p = parseIcon(value);
  const core = p.set === 'phosphor-regular' ? CORE[p.name] : p.set === 'tabler-outline' ? TABLER_CORE[p.name] : '';
  const body = core || maps[p.set]?.[p.name];
  return svg(p, body);
}

// Draws an icon into el (a span.ico), now if its set is loaded, otherwise once it arrives.
export function paintIcon(el, value) {
  el.dataset.icon = value;
  const now = markup(value);
  if (now || maps[parseIcon(value).set]) { el.innerHTML = now; return el; }
  el.replaceChildren();
  loadSet(parseIcon(value).set).then(() => { if (el.dataset.icon === value) el.innerHTML = markup(value); });
  return el;
}

// A decorative icon: a span.ico the screen reader skips. Label it with nearby text.
export function icon(value, cls = '') {
  return paintIcon(h('span', { class: cls ? `ico ${cls}` : 'ico', 'aria-hidden': 'true' }), value);
}

// A labelled icon-only button. Raw button on purpose: canvas chrome, not a kit form control.
// attrs.class adds to xo-icon-btn (pass 'xo-w-btn' for a title-bar button); other attrs go on the button.
export function iconButton(value, label, attrs = {}) {
  const { class: cls, ...rest } = attrs;
  return h('button', {
    type: 'button', class: cls ? `xo-icon-btn ${cls}` : 'xo-icon-btn', 'aria-label': label, title: label, ...rest,
  }, icon(value));
}

// Repaints the icon inside an iconButton (Roll up, Pin).
export function setIcon(button, value) {
  const ico = button.querySelector('.ico');
  if (ico) paintIcon(ico, value); else button.append(icon(value));
  return button;
}

// Sets both the accessible name and the tooltip.
export function setLabel(button, label) {
  button.setAttribute('aria-label', label);
  button.title = label;
  return button;
}
