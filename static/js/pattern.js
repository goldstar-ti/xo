// Generated background patterns (GeoPattern, vendored in static/vendor/geopattern).
// The look keeps { kind, swatch, light, dark, pct, seed } (boot.js); this module draws it as an SVG data URI and
// publishes it as --xo-pattern on <html>. The CSS in app.css paints it behind the page. Per device, never synced.
const L = window.XOLook;
const cache = new Map();
let geo = null;
let generation = 0;
let canvas = null;
let probe = null;

const loadGeo = () => {
  if (!geo) {
    geo = import('../vendor/geopattern/geopattern.js').then((m) => m.default);
    geo.catch(() => { geo = null; });
  }
  return geo;
};

// Any CSS colour (including oklch from the theme) to #rrggbb, by painting one pixel.
function toHex(css) {
  if (!canvas) canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#8a8f98';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** The pattern colour for the current light or dark scheme: the chosen swatch's step, or the accent. */
export function patternHex(p = L.active().look.pattern) {
  const dark = document.documentElement.dataset.scheme === 'dark';
  if (p.swatch) return dark ? p.dark : p.light;
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.append(probe);
  }
  probe.style.color = 'var(--leaf)';
  return toHex(getComputedStyle(probe).color);
}

/**
 * A CSS url(...) value for a generated pattern.
 * kind: 'auto' or a GeoPattern generator name. alpha: 0 to 1, applied as group opacity so the paper shows through.
 */
export async function patternUri(seed, kind, hex, alpha) {
  const key = `${seed}|${kind}|${hex}|${alpha}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const GeoPattern = await loadGeo();
  const raw = GeoPattern.generate(seed, { color: hex, ...(kind !== 'auto' ? { generator: kind } : {}) }).toSvg();
  const svg = raw.replace(/^<svg([^>]*)>/, `<svg$1><g opacity="${alpha}">`).replace(/<\/svg>\s*$/, '</g></svg>');
  const uri = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  if (cache.size > 80) cache.clear();
  cache.set(key, uri);
  return uri;
}

/** Draw a small preview of one kind into `el` (the Appearance chooser). */
export async function previewPattern(el, kind) {
  const p = L.active().look.pattern;
  if (kind === 'none') { el.style.backgroundImage = 'none'; return; }
  try {
    el.style.backgroundImage = await patternUri(p.seed || 'xo', kind, patternHex(p), 0.6);
  } catch { /* the preview stays blank when the module cannot load */ }
}

/** Draw the page pattern from the active look (or clear it). Safe to call often; the latest call wins. */
export async function renderPattern() {
  const mine = ++generation;
  const root = document.documentElement;
  const p = L.active().look.pattern;
  if (p.kind === 'none' || p.pct <= 0) { root.style.removeProperty('--xo-pattern'); return; }
  const key = L.patternKey();
  try {
    const uri = await patternUri(p.seed || 'xo', p.kind, patternHex(p), p.pct / 100);
    if (mine !== generation) return; // a newer change has started
    root.style.setProperty('--xo-pattern', uri);
    try { localStorage.setItem('xo-pattern', JSON.stringify({ key, uri })); } catch { /* storage is optional */ }
  } catch { /* offline with no cached module: the page keeps its plain background */ }
}

/** Start following the look and the light or dark scheme. Called once from app.js. */
export function startPattern() {
  window.addEventListener('xo:look', () => { renderPattern(); });
  new MutationObserver(() => { renderPattern(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });
  renderPattern();
}
