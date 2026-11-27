// The Markdown editor: a toolbar, a text area and a preview. Used by the Notes screen and the task form.
//
//   const ed = mdEditor({ value, label, rows, onInput });
//   ed.node        the editor
//   ed.read()      the text
//   ed.focus()     shows the Write tab and focuses the text area
//   ed.textarea    the text area control (use nativeField(ed.textarea) for the real field)
//
// A toolbar button changes the text area and then fires `input` on it, so onInput and any listener see the change.
// The keys (bold, italic, switch tab) come from keymap.js. They are read here, not through matchKey, so they also work
// inside a dialog.
import { comboOf, keyFor } from './keymap.js';
import { renderMarkdown } from './markdown.js';
import { tabStrip } from './tabs.js';
import { t } from './text.js';
import { button, focusControl, nativeField, textarea } from './ui.js';
import { h } from './util.js';
import { micButton } from './voice.js';

let seq = 0;

// Each tool wraps the selection ({ wrap }) or starts each selected line with a prefix ({ line }).
const TOOLS = [
  ['bold', { wrap: ['**', '**'] }],
  ['italic', { wrap: ['_', '_'] }],
  ['heading', { line: () => '## ' }],
  ['bullets', { line: () => '- ' }],
  ['numbers', { line: (n) => `${n + 1}. ` }],
  ['checklist', { line: () => '- [ ] ' }],
  ['link', { link: true }],
  ['code', { wrap: ['`', '`'] }],
  ['quote', { line: () => '> ' }],
];

// Pure text edits: each takes the text and the selection and returns { value, start, end }.
function wrapSelection(value, s, e, [before, after]) {
  return { value: value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e), start: s + before.length, end: e + before.length };
}

function prefixLines(value, s, e, prefix) {
  const from = value.lastIndexOf('\n', s - 1) + 1;
  const nl = value.indexOf('\n', e);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split('\n').map((line, n) => prefix(n) + line);
  const block = lines.join('\n');
  return { value: value.slice(0, from) + block + value.slice(to), start: from + block.length, end: from + block.length };
}

function makeLink(value, s, e) {
  const text = value.slice(s, e) || t('notes.editor.link_text');
  const url = 'https://';
  const out = `[${text}](${url})`;
  const start = s + text.length + 3;
  return { value: value.slice(0, s) + out + value.slice(e), start, end: start + url.length };
}

export function mdEditor({ value = '', label = '', rows = 8, onInput } = {}) {
  const id = ++seq;
  const ta = textarea({ id: `md-${id}`, rows, value, 'aria-label': label || t('notes.editor.write') });
  ta.classList.add('md-text');

  const apply = (tool) => {
    const nf = nativeField(ta);
    const text = nf.value;
    const s = nf.selectionStart ?? text.length;
    const e = nf.selectionEnd ?? text.length;
    let next;
    if (tool.wrap) next = wrapSelection(text, s, e, tool.wrap);
    else if (tool.line) next = prefixLines(text, s, e, tool.line);
    else next = makeLink(text, s, e);
    ta.value = next.value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const place = () => { nf.focus(); nf.setSelectionRange(next.start, next.end); };
    // A Web Awesome control redraws its inner field first.
    if (ta.updateComplete) ta.updateComplete.then(place); else place();
  };

  const toolbar = h('div', { class: 'md-tools tw:flex tw:flex-wrap tw:gap-1', role: 'toolbar', 'aria-label': t('notes.editor.tools_aria') },
    TOOLS.map(([name, tool]) => button(t(`notes.editor.${name}`), { class: 'small', 'aria-label': t(`notes.editor.${name}`), onclick: () => apply(tool) })), micButton(ta));
  const writePanel = h('div', { id: `md-write-${id}`, class: 'tw:flex tw:flex-col tw:gap-2' }, toolbar, ta);
  const previewPanel = h('div', { id: `md-preview-${id}`, class: 'md-preview', hidden: true });

  let mode = 'write';
  const strip = tabStrip({ label: t('notes.editor.tabs_aria'), onSelect: (m) => setMode(m) });
  const drawTabs = () => strip.set([
    { key: 'write', label: t('notes.editor.write'), controls: writePanel.id },
    { key: 'preview', label: t('notes.editor.preview'), controls: previewPanel.id },
  ], mode);
  function setMode(next) {
    mode = next;
    writePanel.hidden = mode !== 'write';
    previewPanel.hidden = mode !== 'preview';
    if (mode === 'preview') {
      const text = ta.value.trim();
      previewPanel.replaceChildren(text ? renderMarkdown(ta.value) : h('p', { class: 'empty' }, t('notes.editor.empty_preview')));
    }
    drawTabs();
  }
  drawTabs();

  ta.addEventListener('input', () => onInput?.(ta.value));

  const node = h('div', { class: 'md-editor tw:flex tw:flex-col tw:gap-2' }, strip.el, writePanel, previewPanel);
  node.addEventListener('keydown', (e) => {
    const combo = comboOf(e);
    if (!combo) return;
    if (combo === keyFor('notes.preview')) { e.preventDefault(); setMode(mode === 'write' ? 'preview' : 'write'); return; }
    if (mode !== 'write') return;
    const tool = combo === keyFor('notes.bold') ? TOOLS[0][1] : combo === keyFor('notes.italic') ? TOOLS[1][1] : null;
    if (tool) { e.preventDefault(); apply(tool); }
  });

  return {
    node,
    read: () => ta.value,
    textarea: ta,
    focus() {
      if (mode !== 'write') setMode('write');
      focusControl(ta);
    },
  };
}
