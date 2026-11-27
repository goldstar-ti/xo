// The icon picker: a popover beside the control that opened it, as in NOBBIE.
// Set (Phosphor or Tabler), style (Regular or Fill), search, category and a grid.
// openIconPicker(anchor, { value, def, title, onpick }) calls onpick(value) for each pick,
// and onpick(null) for "Use the default". The popover stays open so the owner can compare.
import { DEFAULT_ICONS, icon, iconValue, loadCatalogue, loadSet, paintIcon, parseIcon } from './icons.js';
import { t, text } from './text.js';
import { button, input, segmented, select } from './ui.js';
import { h } from './util.js';

const MAX_SHOWN = 300;
let current = null; // the open popover

const label = (name) => name.replace(/-/g, ' ');

export function closeIconPicker() { current?.hidePopover(); }

export function openIconPicker(anchor, { value, def, title, onpick, onclose }) {
  closeIconPicker();
  let p = parseIcon(value || def);
  let q = '';
  let cat = '';
  const preview = icon(value || def, 'ip-preview');
  const name = h('span', { class: 'ip-name' }, label(p.name));
  const grid = h('div', { class: 'ip-grid', role: 'listbox', 'aria-label': t('icons.grid_aria') });
  const status = h('p', { class: 'hint ip-status', 'aria-live': 'polite' });
  const catSel = h('span', { class: 'ip-cat' });
  const pop = h('div', { class: 'icon-pop', popover: 'auto', role: 'dialog', 'aria-label': t('icons.picker_label', { name: title }) });

  const pick = (v, isDefault = false) => {
    p = parseIcon(v);
    paintIcon(preview, v);
    name.textContent = label(p.name);
    grid.querySelectorAll('[aria-selected="true"]').forEach((b) => b.setAttribute('aria-selected', 'false'));
    grid.querySelector(`[data-name="${p.name}"]`)?.setAttribute('aria-selected', 'true');
    onpick(isDefault ? null : v);
  };

  async function drawCats() {
    const c = (await loadCatalogue())[p.tabler ? 'tabler' : 'phosphor'];
    if (cat && !c.cats.some(([k]) => k === cat)) cat = '';
    const sel = select([['', t('icons.all')], ...c.cats.map(([k, list]) => [k, `${k} (${list.length})`])], { id: 'ip-cat', value: cat, 'aria-label': t('icons.category') });
    sel.addEventListener('change', () => { cat = sel.value; drawGrid(); });
    catSel.replaceChildren(sel);
  }

  async function drawGrid() {
    status.textContent = t('icons.loading');
    const [c, map] = await Promise.all([loadCatalogue(), loadSet(p.set)]);
    const set = c[p.tabler ? 'tabler' : 'phosphor'];
    if (!Object.keys(map).length) { grid.replaceChildren(); status.textContent = t('icons.offline'); return; }
    let names = cat ? (set.cats.find(([k]) => k === cat)?.[1] || []) : Object.keys(map);
    names = names.filter((n) => map[n]);
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) names = names.filter((n) => words.every((w) => n.includes(w) || (set.tags[n] || []).some((tag) => tag.includes(w))));
    const shown = names.slice(0, MAX_SHOWN);
    grid.replaceChildren(...shown.map((n, i) => {
      const v = iconValue(p.tabler, n, p.fill);
      const on = n === p.name;
      return h('button', { type: 'button', class: 'ip-cell', role: 'option', 'data-name': n, 'aria-selected': String(on), 'aria-label': label(n), title: label(n), tabindex: on || (i === 0 && !shown.includes(p.name)) ? '0' : '-1', onclick: () => pick(v) }, icon(v));
    }));
    grid.dataset.set = p.set; // which set the grid shows, once drawn
    status.textContent = !names.length ? t('icons.none')
      : names.length > MAX_SHOWN ? t('icons.showing', { n: MAX_SHOWN.toLocaleString('en-AU'), total: names.length.toLocaleString('en-AU') })
        : t('icons.count', { n: names.length.toLocaleString('en-AU') });
  }

  // Arrow keys move through the grid; Enter or Space picks (the button's own click).
  grid.addEventListener('keydown', (e) => {
    const cells = [...grid.children];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: cells.length - 1 - i }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = cells[Math.max(0, Math.min(cells.length - 1, i + step))];
    cells.forEach((c) => c.setAttribute('tabindex', c === next ? '0' : '-1'));
    next.focus();
  });

  const setSeg = segmented(t('icons.set'), [['phosphor', t('icons.phosphor')], ['tabler', t('icons.tabler')]], {
    value: p.tabler ? 'tabler' : 'phosphor',
    onchange: (v) => { p = { ...p, tabler: v === 'tabler', set: parseIcon(iconValue(v === 'tabler', p.name, p.fill)).set }; cat = ''; drawCats(); drawGrid(); },
  });
  const weightSeg = segmented(t('icons.weight'), [['regular', t('icons.regular')], ['fill', t('icons.fill')]], {
    value: p.fill ? 'fill' : 'regular',
    onchange: (v) => { p = { ...p, fill: v === 'fill', set: parseIcon(iconValue(p.tabler, p.name, v === 'fill')).set }; drawGrid(); },
  });
  const search = input({ type: 'text', enterkeyhint: 'search', id: 'ip-search', placeholder: t('icons.search'), 'aria-label': t('icons.search'), autocomplete: 'off' });
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value; drawGrid(); }, 150); });

  pop.append(
    h('div', { class: 'ip-head' }, preview, h('div', { class: 'ip-title' }, h('strong', {}, title), name),
      button(t('icons.default'), { class: 'small', onclick: () => pick(def, true) })),
    h('div', { class: 'ip-controls' }, setSeg, weightSeg),
    h('div', { class: 'ip-controls' }, search, catSel),
    grid, status);
  pop.addEventListener('toggle', (e) => {
    if (e.newState !== 'closed') return;
    pop.remove();
    if (current === pop) current = null;
    onclose?.();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  });
  document.body.append(pop);
  current = pop;
  pop.showPopover();
  place(pop, anchor);
  drawCats();
  drawGrid().then(() => (grid.querySelector('[tabindex="0"]') || search).focus({ preventScroll: true }));
  return pop;
}

// Beside the anchor when there is room on the right, else below it; always inside the window.
function place(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const hgt = pop.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let left = a.right + 8;
  let top = a.top;
  if (left + w > vw - 8) { left = a.left; top = a.bottom + 6; }
  left = Math.max(8, Math.min(left, vw - w - 8));
  top = Math.max(8, Math.min(top, vh - hgt - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

// Opens the picker for one screen's icon (a key of DEFAULT_ICONS). Each pick shows at once
// (a quiet look change); the screen redraws when the picker closes. after(value) runs per pick.
export function pickScreenIcon(anchor, k, after) {
  const L = window.XOLook;
  const title = k === 'more' ? t('app.more') : text('app.nav')[k];
  let changed = false;
  openIconPicker(anchor, {
    value: L.prefs.icons[k], def: DEFAULT_ICONS[k], title,
    onpick: (v) => {
      changed = true;
      L.change((s) => { const next = { ...s.prefs.icons }; if (v) next[k] = v; else delete next[k]; s.prefs.icons = next; }, { quiet: true });
      after?.(L.prefs.icons[k] || DEFAULT_ICONS[k]);
    },
    onclose: () => { if (changed) window.dispatchEvent(new CustomEvent('xo:look', { detail: { quiet: false } })); },
  });
}
