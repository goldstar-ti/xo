// Appearance engine. A plain (non-module) script loaded in <head> so the saved look is
// applied before the first paint. Everything about appearance stays in this browser's
// localStorage: it is per device and never sent to the server.
(function () {
  'use strict';

  // Colour is described by a few numbers, and the stylesheet derives every colour from them
  // at fixed lightness, so any combination stays readable.
  //   nh/nc  paper hue and tint amount     ah/ac  accent hue and vividness
  //   wh     attention hue (Now, overdue)  al/ad  accent lightness in light/dark mode
  //   pl     paper lightness in light mode
  const THEMES = {
    foliage: { name: 'Foliage', nh: 150, nc: 0.006, ah: 165, ac: 0.075, wh: 75, al: 0.42, ad: 0.8, pl: 0.965 },
    wasabi: { name: 'Wasabi', nh: 125, nc: 0.014, ah: 132, ac: 0.15, wh: 55, al: 0.44, ad: 0.84, pl: 0.965 },
    jacaranda: { name: 'Jacaranda', nh: 300, nc: 0.012, ah: 298, ac: 0.14, wh: 70, al: 0.42, ad: 0.8, pl: 0.965 },
    swan: { name: 'Swan River', nh: 225, nc: 0.012, ah: 215, ac: 0.1, wh: 65, al: 0.42, ad: 0.8, pl: 0.965 },
    space: { name: 'Deep Space', nh: 268, nc: 0.022, ah: 272, ac: 0.15, wh: 85, al: 0.38, ad: 0.8, pl: 0.955 },
    alert: { name: 'Red Alert', nh: 20, nc: 0.008, ah: 27, ac: 0.19, wh: 285, al: 0.45, ad: 0.76, pl: 0.965 },
    chocolate: { name: 'White Chocolate', nh: 85, nc: 0.022, ah: 55, ac: 0.06, wh: 30, al: 0.36, ad: 0.82, pl: 0.96 },
    cardboard: { name: 'Cardboard', nh: 75, nc: 0.04, ah: 50, ac: 0.09, wh: 20, al: 0.36, ad: 0.8, pl: 0.9 },
    ink: { name: 'Ink', nh: 0, nc: 0, ah: 0, ac: 0, wh: 75, al: 0.16, ad: 0.94, pl: 0.98 },
    sundowner: { name: 'Sundowner', nh: 55, nc: 0.018, ah: 40, ac: 0.16, wh: 330, al: 0.47, ad: 0.8, pl: 0.965 },
  };
  const COLOUR_KEYS = ['nh', 'nc', 'ah', 'ac', 'wh', 'al', 'ad', 'pl'];
  const COLOUR_RANGE = { nh: [0, 360], nc: [0, 0.05], ah: [0, 360], ac: [0, 0.22], wh: [0, 360], al: [0.14, 0.5], ad: [0.72, 0.96], pl: [0.88, 0.985] };

  const FONTS = {
    atkinson: { name: 'Atkinson Hyperlegible', stack: '"Atkinson Hyperlegible Next", system-ui, sans-serif' },
    lexend: { name: 'Lexend', stack: '"Lexend", system-ui, sans-serif' },
    grotesk: { name: 'Space Grotesk', stack: '"Space Grotesk", system-ui, sans-serif' },
    fraunces: { name: 'Fraunces', stack: '"Fraunces", Georgia, serif' },
    mono: { name: 'JetBrains Mono', stack: '"JetBrains Mono", ui-monospace, monospace' },
    system: { name: 'System sans', stack: 'system-ui, sans-serif' },
    serif: { name: 'System serif', stack: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif' },
  };

  const CHOICES = {
    mode: ['auto', 'light', 'dark'],
    corners: ['square', 'soft', 'round', 'pill'],
    density: ['compact', 'regular', 'roomy'],
    rule: ['fine', 'medium', 'heavy'],
    texture: ['none', 'grid', 'dots', 'ruled', 'diagonal'],
    hero: ['plain', 'banner', 'boxed'],
    dayline: ['line', 'cards', 'rows'],
    loud: ['quiet', 'regular', 'loud'],
    line: ['plain', 'quote', 'hidden'],
    kit: ['xo', 'daisy', 'wa'],
    figure: ['plain', 'tint', 'accent', 'inset'],
  };
  const CORNERS = { square: ['0px', '0px'], soft: ['6px', '8px'], round: ['10px', '999px'], pill: ['20px', '999px'] };
  const DIALOG_RADIUS = { square: '0px', soft: '10px', round: '14px', pill: '20px' };
  const DENSITY = { compact: 0.7, regular: 1, roomy: 1.4 };
  const RULE = { fine: '1px', medium: '2px', heavy: '3px' };
  const LOUD = { quiet: 0.82, regular: 1, loud: 1.32 };

  // Text-size roles: [key, default rem]. Labels live in content/text/appearance.yaml.
  const FS_ROLES = [['display', 2.25], ['page', 1.75], ['quote', 1.5], ['figure', 1.5], ['dialog', 1.375], ['section', 1.125], ['lead', 1.125],
    ['brand', 1.125], ['sub', 1], ['body', 1], ['large', 1.0625], ['label', 0.9375], ['control', 0.9375], ['small', 0.875], ['small_btn', 0.875],
    ['nav', 0.8125], ['tag', 0.75], ['tiny', 0.6875]];
  const FS_STEPS = [0.6875, 0.75, 0.8125, 0.875, 0.9375, 1, 1.0625, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25, 2.75, 3.25];
  const COLOUR_TOKENS = ['paper', 'surface', 'ink', 'muted', 'line', 'leaf', 'leaf-ink', 'leaf-soft', 'ochre', 'ochre-soft', 'danger'];
  const SIZE_PRESETS = {
    compact: { size: 92, space: 0.75, chrome: 0.9 }, regular: { size: 100, space: 1, chrome: 1 },
    comfortable: { size: 106, space: 1, chrome: 1 }, large: { size: 114, space: 1, chrome: 1.1 },
  };
  const presetOf = (look) => Object.keys(SIZE_PRESETS).find((k) => {
    const p = SIZE_PRESETS[k];
    return look.size === p.size && look.space === p.space && look.chrome === p.chrome;
  }) || 'custom';
  const CATALOGUE_FONT = /^g:[a-z0-9-]{1,60}\|[A-Za-z0-9 ]{1,60}$/;
  const isFont = (v) => typeof v === 'string' && (!!FONTS[v] || CATALOGUE_FONT.test(v));
  // A font value is a built-in key, or g:<slug>|<Family> for a font from the on-demand catalogue.
  function stackOf(id, mono) {
    if (FONTS[id]) return FONTS[id].stack;
    if (typeof id === 'string' && CATALOGUE_FONT.test(id)) return "'" + id.split('|')[1] + "', " + (mono ? 'ui-monospace, monospace' : 'system-ui, sans-serif');
    return FONTS[mono ? 'mono' : 'atkinson'].stack;
  }
  function ensureFont(id) {
    if (typeof id !== 'string' || !CATALOGUE_FONT.test(id)) return;
    const slug = id.slice(2).split('|')[0];
    if (document.head.querySelector('link[data-xo-font="' + slug + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.dataset.xoFont = slug; link.href = '/vendor/fonts/css/' + slug + '.css';
    document.head.appendChild(link);
  }

  const colourOf = (id) => { const t = THEMES[id] || THEMES.foliage; const c = {}; COLOUR_KEYS.forEach((k) => { c[k] = t[k]; }); return c; };

  const DEFAULT_LOOK = {
    mode: 'auto', theme: 'foliage', c: colourOf('foliage'), strength: 1,
    body: 'atkinson', head: 'same', num: 'same', size: 100, weight: 400, lh: 1.5, ls: 0,
    space: 1, chrome: 1, zoom: 100, mono: 'mono', monoSize: 100, monoLs: 0,
    fs: {}, colours: { light: {}, dark: {} }, rCard: null, rPill: null, rDialog: null,
    glassAlpha: 0, glassBlur: 14, figure: 'plain', ident: { widgets: {}, tabs: {} },
    corners: 'round', density: 'regular', rule: 'fine', texture: 'none',
    hero: 'plain', dayline: 'line', loud: 'regular', line: 'plain', kit: 'xo',
  };
  const SECTIONS = ['today', 'diary', 'tasks', 'obligations', 'routine', 'bills', 'checkin', 'plan', 'settings', 'appearance', 'canvas', 'tracker'];
  const BLOCKS = ['line', 'next', 'three', 'day', 'coming', 'plan'];
  const DEFAULT_PREFS = { clock24: false, tabs: ['today', 'diary', 'tasks', 'obligations'], blocks: BLOCKS.slice(), hidden: [], title: 'XO', callMe: '', pop: true, view: 'standard' };

  const clamp = (n, lo, hi, fallback) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
  const text = (v, max, fallback) => (typeof v === 'string' ? v.slice(0, max) : fallback);

  // Identity colours: a map of widget or tab key to { swatch, light, dark, op, title }, rebuilt entry by entry.
  // `light` and `dark` are the palette's step 500 and step 300, copied in when it is chosen, so no palette list is
  // needed before the first paint. An entry with a bad slug or hex is dropped.
  function cleanIdent(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    Object.keys(raw).slice(0, 200).forEach((k) => {
      const v = raw[k];
      if (!/^[a-z0-9:_-]{1,60}$/i.test(k) || !v || typeof v !== 'object') return;
      if (typeof v.swatch !== 'string' || !/^[a-z0-9-]{1,60}$/.test(v.swatch) || !hex(v.light) || !hex(v.dark)) return;
      out[k] = { swatch: v.swatch, light: v.light.toLowerCase(), dark: v.dark.toLowerCase(), op: Math.round(clamp(v.op, 20, 100, 100) / 5) * 5, title: v.title === true };
    });
    return out;
  }

  // Never trust what comes out of storage or a pasted look code: rebuild it field by field.
  function cleanLook(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const d = DEFAULT_LOOK;
    const out = {};
    Object.keys(CHOICES).forEach((k) => { out[k] = CHOICES[k].includes(raw[k]) ? raw[k] : d[k]; });
    out.theme = text(raw.theme, 60, d.theme);
    out.c = {};
    const rc = raw.c && typeof raw.c === 'object' ? raw.c : {};
    COLOUR_KEYS.forEach((k) => { out.c[k] = clamp(rc[k], COLOUR_RANGE[k][0], COLOUR_RANGE[k][1], d.c[k]); });
    out.strength = clamp(raw.strength, 0.3, 1.7, 1);
    out.body = isFont(raw.body) ? raw.body : d.body;
    out.head = raw.head === 'same' || isFont(raw.head) ? raw.head : d.head;
    out.num = raw.num === 'same' || isFont(raw.num) ? raw.num : d.num;
    out.mono = isFont(raw.mono) ? raw.mono : d.mono;
    out.size = clamp(raw.size, 85, 135, 100);
    out.weight = clamp(raw.weight, 100, 900, 400);
    out.lh = clamp(raw.lh, 1.25, 1.9, 1.5);
    out.ls = clamp(raw.ls, -0.05, 0.15, 0);
    // Spacing replaces the three density steps: an older look or XO1 code keeps its spacing.
    out.space = clamp(raw.space !== undefined ? raw.space : DENSITY[raw.density], 0.5, 1.6, 1);
    out.chrome = clamp(raw.chrome, 0.5, 1.5, 1);
    out.zoom = clamp(raw.zoom, 25, 175, 100);
    out.monoSize = clamp(raw.monoSize, 70, 150, 100);
    out.monoLs = clamp(raw.monoLs, -0.05, 0.15, 0);
    out.glassAlpha = clamp(raw.glassAlpha, 0, 60, 0);
    out.glassBlur = clamp(raw.glassBlur, 0, 30, 14);
    out.rCard = raw.rCard === null || raw.rCard === undefined ? null : clamp(raw.rCard, 0, 32, null);
    out.rPill = raw.rPill === null || raw.rPill === undefined ? null : clamp(raw.rPill, 0, 40, null);
    out.rDialog = raw.rDialog === null || raw.rDialog === undefined ? null : clamp(raw.rDialog, 0, 32, null);
    out.fs = {};
    const rf = raw.fs && typeof raw.fs === 'object' ? raw.fs : {};
    FS_ROLES.forEach(([k, def]) => { if (FS_STEPS.includes(rf[k]) && rf[k] !== def) out.fs[k] = rf[k]; });
    out.colours = { light: {}, dark: {} };
    const rcol = raw.colours && typeof raw.colours === 'object' ? raw.colours : {};
    ['light', 'dark'].forEach((m) => {
      const mm = rcol[m] && typeof rcol[m] === 'object' ? rcol[m] : {};
      COLOUR_TOKENS.forEach((k) => { if (typeof mm[k] === 'string' && /^#[0-9a-f]{6}$/i.test(mm[k])) out.colours[m][k] = mm[k].toLowerCase(); });
    });
    out.ident = { widgets: cleanIdent(raw.ident && raw.ident.widgets), tabs: cleanIdent(raw.ident && raw.ident.tabs) };
    return out;
  }
  function cleanPrefs(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const tabs = Array.isArray(raw.tabs) ? raw.tabs.filter((t, i, a) => SECTIONS.includes(t) && a.indexOf(t) === i).slice(0, 4) : [];
    DEFAULT_PREFS.tabs.concat(SECTIONS).forEach((t) => { if (tabs.length < 4 && !tabs.includes(t)) tabs.push(t); });
    const blocks = Array.isArray(raw.blocks) ? raw.blocks.filter((b, i, a) => BLOCKS.includes(b) && a.indexOf(b) === i) : [];
    BLOCKS.forEach((b) => { if (!blocks.includes(b)) blocks.push(b); });
    return {
      clock24: raw.clock24 === true,
      tabs,
      blocks,
      hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((b) => BLOCKS.includes(b) && b !== 'line') : [],
      title: text(raw.title, 24, 'XO').trim() || 'XO',
      callMe: text(raw.callMe, 30, '').trim(),
      pop: raw.pop !== false,
      view: raw.view === 'advanced' ? 'advanced' : 'standard',
    };
  }
  const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function cleanState(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      v: 1,
      base: cleanLook(raw.base),
      scheduled: (Array.isArray(raw.scheduled) ? raw.scheduled : []).filter((s) => s && isTime(s.from) && isTime(s.to)).slice(0, 8)
        .map((s) => ({ id: text(s.id, 40, String(Math.random()).slice(2)), name: text(s.name, 30, 'Scheduled').trim() || 'Scheduled', from: s.from, to: s.to, look: cleanLook(s.look) })),
      myThemes: (Array.isArray(raw.myThemes) ? raw.myThemes : []).slice(0, 24)
        .map((t) => ({ id: text(t && t.id, 40, String(Math.random()).slice(2)), name: text(t && t.name, 30, 'Mine').trim() || 'Mine', c: cleanLook({ c: t && t.c }).c })),
      prefs: cleanPrefs(raw.prefs),
    };
  }

  let state;
  try { state = cleanState(JSON.parse(localStorage.getItem('xo-look') || '{}')); } catch (e) { state = cleanState({}); }
  let editing = null; // id of a scheduled look being edited outside its hours
  const undoStack = [];
  let lastKey = '';

  const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  function scheduledNow() {
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    return state.scheduled.find((s) => {
      const a = minutes(s.from), b = minutes(s.to);
      return a === b ? false : a < b ? now >= a && now < b : now >= a || now < b; // ranges may cross midnight
    }) || null;
  }
  // Which look is on screen: one being edited, else one scheduled for this hour, else the everyday look.
  function active() {
    const item = (editing && state.scheduled.find((s) => s.id === editing)) || scheduledNow();
    return item ? { look: item.look, item } : { look: state.base, item: null };
  }

  // Colours the reader picked replace the derived ones, per mode, in one style element.
  function colourOverrides(colours) {
    let el = document.getElementById('xo-colour-overrides');
    if (!el) { el = document.createElement('style'); el.id = 'xo-colour-overrides'; document.head.appendChild(el); }
    el.textContent = ['light', 'dark'].map((m) => {
      const rules = COLOUR_TOKENS.filter((k) => colours[m][k]).map((k) => '--' + k + ':' + colours[m][k] + ';').join('');
      return rules ? ':root[data-scheme="' + m + '"]{' + rules + '}' : '';
    }).join('');
  }

  // Widget frames and canvas tabs the reader coloured: one style element, rebuilt on every apply.
  function identStyle(ident) {
    let el = document.getElementById('xo-ident');
    if (!el) { el = document.createElement('style'); el.id = 'xo-ident'; document.head.appendChild(el); }
    const q = (id) => '"' + CSS.escape(id) + '"';
    const mix = (e) => 'color-mix(in oklch,var(--ident) ' + e.op + '%,transparent)';
    const rules = [];
    Object.keys(ident.widgets).forEach((id) => {
      const e = ident.widgets[id], frame = '[data-widget=' + q(id) + ']';
      ['light', 'dark'].forEach((m) => rules.push(':root[data-scheme="' + m + '"] ' + frame + '{--ident:' + e[m] + ';}'));
      rules.push(frame + ' > .xo-w{border-top:3px solid ' + mix(e) + ';}');
      if (e.title) rules.push(frame + ' .xo-w-title{color:var(--ident);}');
    });
    Object.keys(ident.tabs).forEach((id) => {
      const e = ident.tabs[id], tab = '.xo-tab:has(> [data-tid=' + q(id) + '])';
      ['light', 'dark'].forEach((m) => rules.push(':root[data-scheme="' + m + '"] ' + tab + '{--ident:' + e[m] + ';}'));
      rules.push(':root ' + tab + '{border-bottom-color:' + mix(e) + ';}');
    });
    el.textContent = rules.join('');
  }

  function apply() {
    const { look, item } = active();
    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, String(v));
    const c = look.c;
    set('--nh', c.nh); set('--nc', (c.nc * look.strength).toFixed(4));
    set('--ah', c.ah); set('--ac', (c.ac * look.strength).toFixed(4));
    set('--wh', c.wh); set('--wc', (0.12 * Math.min(1.25, Math.max(0.6, look.strength))).toFixed(4));
    set('--al', c.al); set('--ad', c.ad); set('--pl', c.pl);
    [look.body, look.head, look.num, look.mono].forEach(ensureFont);
    const body = stackOf(look.body);
    set('--font-body', body);
    set('--font-head', look.head === 'same' ? body : stackOf(look.head));
    set('--font-num', look.num === 'same' ? body : stackOf(look.num));
    set('--font-mono', stackOf(look.mono, true));
    set('--mono-size', look.monoSize / 100); set('--mono-ls', look.monoLs + 'em');
    root.style.fontSize = (106.25 * look.size / 100).toFixed(2) + '%';
    set('--weight', look.weight); set('--lh', look.lh); set('--ls', look.ls + 'em');
    set('--radius', CORNERS[look.corners][0]); set('--pill', CORNERS[look.corners][1]);
    if (look.rCard !== null) set('--radius', look.rCard + 'px');
    if (look.rPill !== null) set('--pill', look.rPill >= 40 ? '999px' : look.rPill + 'px');
    set('--radius-dialog', look.rDialog !== null ? look.rDialog + 'px' : DIALOG_RADIUS[look.corners]);
    set('--d', look.space); set('--chrome', look.chrome); set('--zoom', look.zoom / 100);
    set('--glass-alpha', look.glassAlpha / 100); set('--glass-blur', look.glassBlur + 'px');
    root.dataset.glass = look.glassAlpha > 0 ? 'on' : 'off';
    FS_ROLES.forEach(([k]) => {
      const prop = '--fs-' + k.replace(/_/g, '-');
      if (look.fs[k]) set(prop, look.fs[k] + 'rem'); else root.style.removeProperty(prop);
    });
    set('--rule', RULE[look.rule]); set('--loud', LOUD[look.loud]);
    const dark = look.mode === 'dark' || (look.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.scheme = dark ? 'dark' : 'light';
    root.dataset.texture = look.texture;
    root.dataset.hero = look.hero;
    root.dataset.dayline = look.dayline;
    root.dataset.line = look.line;
    root.dataset.kit = look.kit;
    root.dataset.figure = look.figure;
    colourOverrides(look.colours);
    identStyle(look.ident);
    root.dataset.pop = state.prefs.pop ? 'on' : 'off';
    lastKey = (item ? item.id : 'base') + '|' + root.dataset.scheme;
  }

  function save() { try { localStorage.setItem('xo-look', JSON.stringify(state)); } catch (e) { /* storage full or blocked: the look still applies for this visit */ } }
  function announce(quiet) { window.dispatchEvent(new CustomEvent('xo:look', { detail: { quiet: !!quiet } })); }

  // Every change goes through here. `quiet` is for slider drags: apply, but do not rebuild screens.
  function change(mutate, opts) {
    opts = opts || {};
    const before = JSON.stringify(state);
    mutate(state, active().look);
    state = cleanState(state);
    const after = JSON.stringify(state);
    if (after === before) return;
    if (!opts.sameStep) { undoStack.push(before); if (undoStack.length > 40) undoStack.shift(); }
    save(); apply(); announce(opts.quiet);
  }
  function undo() {
    const prev = undoStack.pop();
    if (!prev) return false;
    state = cleanState(JSON.parse(prev));
    if (editing && !state.scheduled.some((s) => s.id === editing)) editing = null;
    save(); apply(); announce(false);
    return true;
  }

  // A look as a short code you can copy, keep, or type into another device.
  // XO2- is the settings as JSON (leaving out anything at its default), made URL-safe.
  // XO1- (older codes, one number per setting) still decodes.
  const FONT_IDS = Object.keys(FONTS).concat('same');
  // New options go on the end, so codes made before them still decode (the missing ones take their default).
  const ENUMS = ['mode', 'corners', 'density', 'rule', 'texture', 'hero', 'dayline', 'loud', 'line', 'kit', 'figure'];
  function encode(look) {
    const l = cleanLook(look), d = cleanLook({});
    const out = {};
    Object.keys(l).forEach((k) => { if (JSON.stringify(l[k]) !== JSON.stringify(d[k])) out[k] = l[k]; });
    out.space = l.space; delete out.density; // spacing always travels; density is only read from XO1 codes
    const bytes = new TextEncoder().encode(JSON.stringify(out));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return 'XO2-' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    const text2 = String(code || '').trim();
    try {
      if (/^XO2-[A-Za-z0-9_-]+$/.test(text2)) {
        const b64 = text2.slice(4).replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
        const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        return cleanLook(raw);
      }
      return decodeV1(text2);
    } catch (e) { return null; }
  }
  function decodeV1(code) {
    const m = /^\s*XO1-([a-z]+)((?:\.\d{1,4}){25,26})\s*$/i.exec(code || '');
    if (!m) return null;
    const n = m[2].slice(1).split('.').map(Number);
    const raw = {
      theme: m[1].toLowerCase(),
      c: { nh: n[0], nc: n[1] / 1000, ah: n[2], ac: n[3] / 1000, wh: n[4], al: n[5] / 100, ad: n[6] / 100, pl: n[7] / 1000 },
      strength: n[8] / 100, body: FONT_IDS[n[9]], head: FONT_IDS[n[10]], num: FONT_IDS[n[11]],
      size: n[12], weight: n[13], lh: n[14] / 100, ls: (n[15] - 20) / 1000,
    };
    ENUMS.forEach((k, i) => { raw[k] = CHOICES[k][n[16 + i]]; });
    if (!THEMES[raw.theme]) raw.theme = 'custom';
    return cleanLook(raw);
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const PAIRS = [['atkinson', 'same', 'same'], ['atkinson', 'fraunces', 'same'], ['lexend', 'same', 'mono'], ['lexend', 'fraunces', 'same'],
    ['grotesk', 'same', 'mono'], ['atkinson', 'grotesk', 'mono'], ['serif', 'fraunces', 'same'], ['system', 'grotesk', 'same'], ['mono', 'same', 'same']];
  function surprise() {
    change((s, look) => {
      const id = pick(Object.keys(THEMES).filter((k) => k !== look.theme));
      const fonts = pick(PAIRS);
      Object.assign(look, {
        theme: id, c: colourOf(id), strength: pick([0.8, 1, 1, 1.2, 1.4]),
        body: fonts[0], head: fonts[1], num: fonts[2],
        corners: pick(CHOICES.corners), rule: pick(CHOICES.rule), texture: pick(CHOICES.texture),
        hero: pick(CHOICES.hero), dayline: pick(CHOICES.dayline), loud: pick(CHOICES.loud), line: pick(['plain', 'quote']),
      }); // size, weight, spacing, chrome, zoom, text sizes, colours, identity colours and mode are left as you set them
    });
  }

  window.XOLook = {
    THEMES, FONTS, CHOICES, SECTIONS, BLOCKS, COLOUR_RANGE, DEFAULT_LOOK,
    FS_ROLES, FS_STEPS, COLOUR_TOKENS, SIZE_PRESETS, presetOf, stackOf, ensureFont,
    get state() { return state; },
    get prefs() { return state.prefs; },
    get canUndo() { return undoStack.length > 0; },
    get editing() { return editing; },
    active, scheduledNow, apply, change, undo, encode, decode, surprise, colourOf,
    defaultLook: () => cleanLook({}),
    setEditing(id) { editing = id; apply(); announce(false); },
    reset() { change((s) => { s.base = cleanLook({}); s.scheduled = []; s.prefs = cleanPrefs({}); }); editing = null; apply(); announce(false); },
  };

  apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  // Scheduled looks switch over on their own.
  const recheck = () => {
    const a = active();
    const key = (a.item ? a.item.id : 'base') + '|' + document.documentElement.dataset.scheme;
    if (key !== lastKey) { apply(); announce(false); }
  };
  setInterval(recheck, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); });
})();
