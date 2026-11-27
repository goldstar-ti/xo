// Markdown to HTML for notes. marked is a local copy (static/vendor/marked, built from the npm package in the Dockerfile).
// GFM and line breaks are on. Raw HTML is shown as text, images are shown as links (XO stores text only, and works
// offline), and links open in a new tab.
import { Marked, Renderer } from '/vendor/marked/marked.esm.js';
import { h } from './util.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SAFE = /^(https?:|mailto:|tel:|\/|#)/i;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => esc(text),
    image({ href, title, text }) {
      const label = esc(text || href);
      if (!SAFE.test(href || '')) return label;
      return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener">${label}</a>`;
    },
    link(token) {
      return Renderer.prototype.link.call(this, token).replace(/^<a /, '<a target="_blank" rel="noopener" ');
    },
  },
});

/** The Markdown text as a div.md. */
export function renderMarkdown(text) {
  const el = h('div', { class: 'md' });
  el.innerHTML = marked.parse(String(text ?? ''), { async: false });
  return el;
}
