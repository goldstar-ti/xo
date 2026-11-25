// Encryption in the browser. The passphrase and the encryption key never leave the device.
//
// passphrase --PBKDF2(600k, SHA-256, per-user salt)--> 64 bytes
//   first 32 bytes  -> AES-256-GCM key (kept on this device only, not extractable)
//   second 32 bytes -> authentication key (sent to the server at sign-in; the server stores a hash of it)

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 600000;

export const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
export const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKeys(passphrase, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: ITERATIONS }, base, 512),
  );
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { key, authKey: hex(bits.slice(32)) };
}

export async function encryptJSON(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv);
  all.set(ct, iv.length);
  let text = '';
  for (let i = 0; i < all.length; i += 0x8000) text += String.fromCharCode(...all.subarray(i, i + 0x8000));
  return 'v1.' + btoa(text);
}

export async function decryptJSON(key, payload) {
  if (!payload) return null;
  const all = unb64(payload.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
  return JSON.parse(dec.decode(pt));
}

// ---- a tiny key-value store in IndexedDB (the service worker reads the same one) ----
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('xo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const store = d.transaction('kv', mode).objectStore('kv');
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export const kvGet = (k) => tx('readonly', (s) => s.get(k));
export const kvSet = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const kvClear = () => tx('readwrite', (s) => s.clear());
