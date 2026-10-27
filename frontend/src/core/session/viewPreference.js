// Presentation only: preferences never grant access or restore financial operations.
export function readViewPreference(key, allowed, fallback, storage) {
  try { const value = (storage ?? globalThis.sessionStorage).getItem(key); return allowed.includes(value) ? value : fallback; }
  catch { return fallback; }
}
export function writeViewPreference(key, value, allowed, storage) {
  if (!allowed.includes(value)) return;
  try { (storage ?? globalThis.sessionStorage).setItem(key, value); } catch { /* The current view remains usable without storage. */ }
}
