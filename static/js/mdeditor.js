// The Markdown editor: EasyMDE (CodeMirror) with a toolbar and a preview. Used by the Notes screen and the task form.
//
//   const ed = mdEditor({ value, label, rows, onInput, id });
//   ed.node        the editor; node.value gets and sets the text
//   ed.read()      the text
//   ed.focus()     focuses the writing area
//   ed.textarea    the real <textarea> (hidden once the editor loads; it always holds the text)
//
// EasyMDE comes from /vendor/easymde and loads once. Until it does, the plain text area works, so a slow or missing
// script never loses a note. The toolbar edits the text and fires `input` on the text area, so onInput and any
// listener see the change. The keys (bold, italic, preview) come from keymap.js.
import { renderMarkdown } from './markdown.js';
import { paintIcon } from './icons.js';
import { comboOf, keyFor } from './keymap.js';
import { t } from './text.js';
import { h } from './util.js';
import { cmInsert, micButton } from './voice.js';

let seq = 0;
let loading = null;

// Loads the stylesheet and script once. Resolves to window.EasyMDE, or rejects when the script cannot load.
function loadEasyMDE() {
  if (window.EasyMDE) return Promise.resolve(window.EasyMDE);
  loading ||= new Promise((resolve, reject) => {
    document.head.append(h('link', { rel: 'stylesheet', href: '/vendor/easymde/easymde.min.css' }));
    const script = h('script', { src: '/vendor/easymde/easymde.min.js' });
    script.addEventListener('load', () => resolve(window.EasyMDE));
    script.addEventListener('error', () => { loading = null; script.remove(); reject(new Error('easymde')); });
    document.head.append(script);
  });
  return loading;
}

// A keymap combo (Ctrl+b) in CodeMirror form (Ctrl-B). EasyMDE swaps Cmd and Ctrl on a Mac itself.
const cmKey = (combo) => (combo ? combo.split('+').map((p) => (p.length === 1 ? p.toUpperCase() : p)).join('-') : null);

// Starts each selected line with a prefix (the checklist has no EasyMDE button that takes a custom marker).
function checklist(ed) {
  const cm = ed.codemirror;
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  cm.operation(() => {
    for (let n = from.line; n <= to.line; n++) cm.replaceRange('- [ ] ', { line: n, ch: 0 });
  });
  cm.focus();
}

// [name, tabler icon, label key, action(EasyMDE) -> function(editor)]
const TOOLS = [
  ['bold', 'bold', 'bold', (E) => E.toggleBold],
  ['italic', 'italic', 'italic', (E) => E.toggleItalic],
  ['heading', 'heading', 'heading', (E) => E.toggleHeadingSmaller],
  ['quote', 'quote', 'quote', (E) => E.toggleBlockquote],
  ['unordered-list', 'list', 'bullets', (E) => E.toggleUnorderedList],
  ['ordered-list', 'list-numbers', 'numbers', (E) => E.toggleOrderedList],
  ['check-list', 'checkbox', 'checklist', () => checklist],
  ['link', 'link', 'link', (E) => E.drawLink],
  ['table', 'table', 'table', (E) => E.drawTable],
  ['code', 'code', 'code', (E) => E.toggleCodeBlock],
  ['preview', 'eye', 'preview', (E) => E.togglePreview],
  ['undo', 'arrow-back-up', 'undo', (E) => E.undo],
  ['redo', 'arrow-forward-up', 'redo', (E) => E.redo],
];

export function mdEditor({ value = '', label = '', rows = 8, onInput, id } = {}) {
  const n = ++seq;
  const ta = h('textarea', { id: id || `md-${n}`, rows, class: 'md-text', 'aria-label': label || t('notes.editor.write') });
  ta.value = value;
  let ed = null;

  // Dictation writes at the caret through this object once the editor is up, and into the text area before that.
  const target = {
    insertText(text) {
      if (ed) { cmInsert(ed.codemirror, text); return; }
      ta.value += text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
  const mic = micButton(target);
  const plainBar = h('div', { class: 'md-tools tw:flex tw:gap-1', role: 'toolbar', 'aria-label': t('notes.editor.tools_aria') }, mic);
  const note = h('p', { class: 'md-note', 'aria-live': 'polite', hidden: true });
  const node = h('div', { class: 'md-editor tw:flex tw:flex-col tw:gap-2' }, mic ? plainBar : null, ta, note);
  ta.addEventListener('input', () => onInput?.(ta.value));

  Object.defineProperty(node, 'value', {
    get: () => (ed ? ed.value() : ta.value),
    set: (v) => { if (ed) ed.value(v); else ta.value = v; },
  });

  function build(E) {
    const toolbar = TOOLS.map(([name, glyph, key, pick]) => ({
      name,
      noDisable: name === 'preview',
      action: pick(E),
      title: t(`notes.editor.${key}`),
      icon: `<span class="ico" aria-hidden="true" data-glyph="${glyph}"></span>`,
    }));
    const shortcuts = { toggleBold: cmKey(keyFor('notes.bold')), toggleItalic: cmKey(keyFor('notes.italic')), togglePreview: null };
    ed = new E({
      element: ta,
      initialValue: ta.value,
      spellChecker: false,
      status: false,
      autoDownloadFontAwesome: false,
      forceSync: true,
      minHeight: `${rows * 1.6}em`,
      toolbar,
      shortcuts,
      previewRender: (text) => (text.trim() ? renderMarkdown(text).outerHTML : `<p class="empty">${t('notes.editor.empty_preview')}</p>`),
    });
    const cm = ed.codemirror;
    cm.getInputField().setAttribute('aria-label', label || t('notes.editor.write'));
    cm.on('change', () => {
      ta.value = cm.getValue();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const bar = ed.gui.toolbar;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('notes.editor.tools_aria'));
    for (const el of bar.querySelectorAll('.ico')) paintIcon(el, `tabler/${el.dataset.glyph}`);
    if (mic) bar.append(mic);
    plainBar.remove();
    // CodeMirror measures its box, so it needs a refresh once the editor is on screen.
    new ResizeObserver(() => cm.refresh()).observe(node);
    requestAnimationFrame(() => cm.refresh());
  }

  loadEasyMDE().then(build).catch(() => {
    note.textContent = t('notes.editor.offline');
    note.hidden = false;
  });

  // The preview key toggles the preview, here as well as in the toolbar. Bold and italic come from EasyMDE's shortcuts.
  node.addEventListener('keydown', (e) => {
    const combo = comboOf(e);
    if (ed && combo && combo === keyFor('notes.preview')) { e.preventDefault(); window.EasyMDE.togglePreview(ed); }
  });

  return {
    node,
    read: () => node.value,
    textarea: ta,
    focus() {
      if (ed) {
        const preview = ed.gui.toolbar.querySelector('button.preview.active');
        if (preview) window.EasyMDE.togglePreview(ed);
        ed.codemirror.focus();
      } else ta.focus();
    },
  };
}
