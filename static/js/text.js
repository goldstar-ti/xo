// Editable wording. The text lives in content/text/*.yaml and comes from /api/text, so a
// saved edit shows on the next page load. Keys are dotted: 'common.save', 'plan.guard'.

let data = {};
let loading = null;
const reported = new Set();

// Fetches the text once; later calls return the same promise. Never rejects: offline with
// no saved copy, every key shows as itself (and is logged once) rather than breaking the app.
export function loadText() {
  if (!loading) {
    loading = fetch('/api/text', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => { data = json && typeof json === 'object' ? json : {}; })
      .catch(() => { data = {}; });
  }
  return loading;
}

function find(key) {
  let value = data;
  for (const part of key.split('.')) {
    if (value == null || typeof value !== 'object' || !(part in value)) return undefined;
    value = value[part];
  }
  return value;
}

function missing(key) {
  if (!reported.has(key)) {
    reported.add(key);
    console.error('missing text: ' + key);
  }
  return key;
}

// A string, with {name} replaced from vars. A placeholder with no value is left as written.
export function t(key, vars = {}) {
  const value = find(key);
  if (typeof value !== 'string') return missing(key);
  return value.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

// A structured value (a list or a map), exactly as written in the YAML.
export function text(key) {
  const value = find(key);
  return value === undefined ? missing(key) : value;
}
