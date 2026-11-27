// Dictation: the browser's own speech recognition types into a text control. XO keeps only the recognised text.
// The browser may send the audio to its maker's speech service (D-28). No audio is stored by XO.
//
//   micButton(target)   a Dictate button and a live line for one text control, or null when dictation is off or unsupported
//   dictateInto(el)     starts (or stops) dictation into a control; used by the global.voice key.
//                       el may also be { insertText(text) }, which writes the spoken text at its own caret (the Markdown editor).
import * as store from './store.js';
import { t } from './text.js';
import { button, nativeField } from './ui.js';
import { h, toast } from './util.js';

const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

/** True when this browser can recognise speech. */
export const voiceSupported = () => !!Recognition();

/** True when dictation is supported and the owner has not turned it off. */
export const voiceEnabled = () => voiceSupported() && store.settings().voice !== false;

// The one recognition running now: { rec, hooks }.
let session = null;

const ERRORS = { 'not-allowed': 'denied', 'service-not-allowed': 'denied', network: 'offline', 'no-speech': 'nothing' };

// A CodeMirror editor's own input field stands in as an object with insertText, one per editor so a second press stops.
const cmTargets = new WeakMap();

/** Types spoken text into a CodeMirror editor at the caret, with a space before it when the text before it needs one. */
export function cmInsert(cm, spoken) {
  const from = cm.getCursor('from');
  const before = cm.getRange({ line: from.line, ch: 0 }, from);
  cm.replaceSelection((before && !/\s$/.test(before) ? ' ' : '') + spoken);
}
function asTarget(el) {
  const cm = el?.closest?.('.CodeMirror')?.CodeMirror;
  if (!cm) return el;
  if (!cmTargets.has(cm)) cmTargets.set(cm, { insertText: (s) => cmInsert(cm, s) });
  return cmTargets.get(cm);
}

function insert(target, spoken) {
  if (typeof target.insertText === 'function') {
    target.insertText(spoken);
    return;
  }
  const nf = nativeField(target);
  const value = target.value ?? nf.value ?? '';
  const focused = document.activeElement === target || document.activeElement === nf || target.shadowRoot?.activeElement === nf;
  const start = focused && nf.selectionStart != null ? nf.selectionStart : value.length;
  const end = focused && nf.selectionEnd != null ? nf.selectionEnd : value.length;
  const before = value.slice(0, start);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const next = before + lead + spoken + value.slice(end);
  const caret = before.length + lead.length + spoken.length;
  target.value = next;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  const place = () => { try { nf.focus({ preventScroll: true }); nf.setSelectionRange(caret, caret); } catch { /* not a text field */ } };
  if (target.updateComplete) target.updateComplete.then(place); else place();
}

/** Stops the dictation running now, if any. */
export function stopDictation() {
  session?.rec.stop();
}

/**
 * Starts dictation into target, or stops it when it is already running. hooks: { state(on), live(text) }.
 * Returns false when nothing started because dictation is off or unsupported.
 */
export function dictateInto(target, hooks = {}) {
  target = asTarget(target);
  if (!voiceEnabled() || !target) return false;
  if (session) {
    const same = session.target === target;
    session.rec.stop();
    if (same) return true;
  }
  const rec = new (Recognition())();
  rec.lang = store.settings().voiceLang || 'en-AU';
  rec.interimResults = true;
  rec.continuous = false;
  const mine = { rec, target, hooks };
  let failed = false;
  const finish = () => {
    if (session === mine) session = null;
    hooks.state?.(false);
    hooks.live?.('');
  };
  rec.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex || 0; i < e.results.length; i++) {
      const r = e.results[i];
      const said = r[0]?.transcript || '';
      if (r.isFinal) final += said; else interim += said;
    }
    if (final.trim()) insert(target, final.trim());
    hooks.live?.(interim.trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    failed = true;
    toast(t(`voice.${ERRORS[e.error] || 'failed'}`), 'bad');
  };
  rec.onend = () => { if (!failed) hooks.live?.(''); finish(); };
  try {
    rec.start();
  } catch {
    toast(t('voice.failed'), 'bad');
    return true;
  }
  session = mine;
  hooks.state?.(true);
  hooks.live?.(t('voice.listening'));
  return true;
}

/** A Dictate button with a live line, or null when dictation is off or unsupported. */
export function micButton(target) {
  if (!voiceEnabled()) return null;
  const live = h('small', { class: 'voice-live', 'aria-live': 'polite' });
  const btn = button(t('voice.start'), { class: 'small voice-btn', 'aria-label': t('voice.start'), 'aria-pressed': 'false' });
  const hooks = {
    state(on) {
      btn.textContent = on ? t('voice.stop') : t('voice.start');
      btn.setAttribute('aria-label', on ? t('voice.stop') : t('voice.start'));
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('listening', on);
    },
    live(text) { live.textContent = text; },
  };
  btn.addEventListener('click', () => dictateInto(target, hooks));
  return h('span', { class: 'voice tw:inline-flex tw:items-center tw:gap-2' }, btn, live);
}
