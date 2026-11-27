// A non-modal popover that opens beside its button, drags by its title bar and can be pinned.
// After NOBBIE's popover and surface chrome. On a phone it is a modal sheet instead.
import { iconButton, setIcon, setLabel } from './icons.js';
import { t } from './text.js';
import { h } from './util.js';

const GAP = 6;
const EDGE = 8;
const KEEP = 48;
const PHONE = '(max-width: 39.99rem)';

const readPin = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const writePin = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage is optional */ } };

/**
 * Opens a popover under `anchor` and returns its dialog.
 * form: a form popover closes only on its X, Cancel, Save or Escape; a non-form one also closes on an outside press.
 * pinKey: when set, a Pin button keeps the popover open through Escape and outside presses, remembered under that key.
 */
export function openPopover({ title, body, anchor, form = true, pinKey = null, wide = false, onClose } = {}) {
  const phone = window.matchMedia(PHONE).matches;
  let pinned = pinKey ? readPin(pinKey) : false;
  let dragged = false;
  const dlg = h('dialog', { class: ['xo-pop', wide && 'wide', phone && 'sheet'].filter(Boolean).join(' ') });
  if (form) dlg.dataset.form = '';
  const close = () => dlg.close();
  const head = h('div', { class: 'xo-pop-head' }, h('h2', {}, title));
  let pin = null;
  if (pinKey) {
    pin = iconButton(pinned ? 'push-pin-slash' : 'push-pin', pinned ? t('common.unpin') : t('common.pin'),
      { 'aria-pressed': String(pinned) });
    pin.addEventListener('click', () => {
      pinned = !pinned;
      writePin(pinKey, pinned);
      setIcon(pin, pinned ? 'push-pin-slash' : 'push-pin');
      setLabel(pin, pinned ? t('common.unpin') : t('common.pin'));
      pin.setAttribute('aria-pressed', String(pinned));
    });
  }
  const reset = iconButton('arrow-counter-clockwise', t('common.reset_position'));
  reset.addEventListener('click', () => { dragged = false; place(); });
  const x = iconButton('x', t('common.close'));
  x.addEventListener('click', close);
  head.append(...[pin, phone ? null : reset, x].filter(Boolean));
  dlg.append(head, body);

  function place() {
    if (phone || !anchor || !anchor.isConnected) return;
    const a = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    dlg.style.maxHeight = '';
    const w = dlg.offsetWidth;
    const below = vh - a.bottom - GAP - EDGE;
    const above = a.top - GAP - EDGE;
    const flip = dlg.offsetHeight > below && above > below;
    const room = Math.max(flip ? above : below, 120);
    dlg.style.maxHeight = `${room}px`;
    const hgt = Math.min(dlg.offsetHeight, room);
    const left = Math.min(Math.max(a.left, EDGE), Math.max(vw - w - EDGE, EDGE));
    const top = flip ? Math.max(a.top - GAP - hgt, EDGE) : a.bottom + GAP;
    dlg.style.left = `${left}px`;
    dlg.style.top = `${top}px`;
  }
  const onResize = () => { if (!dragged) place(); };

  // Drag by the title bar, never from its buttons.
  let grab = null;
  head.addEventListener('pointerdown', (e) => {
    if (phone || e.button !== 0 || e.target.closest('button')) return;
    const r = dlg.getBoundingClientRect();
    grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove', (e) => {
    if (!grab) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = dlg.getBoundingClientRect();
    const left = Math.min(Math.max(e.clientX - grab.dx, KEEP - r.width), vw - KEEP);
    const top = Math.min(Math.max(e.clientY - grab.dy, 0), vh - KEEP);
    dlg.style.left = `${left}px`;
    dlg.style.top = `${top}px`;
    dragged = true;
  });
  const drop = () => { grab = null; };
  head.addEventListener('pointerup', drop);
  head.addEventListener('pointercancel', drop);

  // Escape closes unless pinned.
  dlg.addEventListener('cancel', (e) => { if (pinned) e.preventDefault(); });
  // A non-modal dialog gets no cancel event from Escape, so close it here when the focus is inside.
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || pinned || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  });
  // A non-form popover also closes on a press outside it (and outside its own button).
  const onOutside = (e) => {
    if (form || pinned || phone) return;
    if (dlg.contains(e.target) || (anchor && anchor.contains(e.target))) return;
    if (e.target.closest && e.target.closest('dialog[open]:modal, .icon-pop')) return;
    close();
  };
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('resize', onResize);

  dlg.addEventListener('close', () => {
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', onResize);
    if (onClose) onClose();
    dlg.remove();
    if (anchor && anchor.isConnected) anchor.focus();
  });

  document.body.append(dlg);
  if (phone) dlg.showModal(); else { dlg.show(); place(); }
  return dlg;
}
