export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 24 * 1024 * 1024;
const encoder = new TextEncoder();
const forbidden = /password|passphrase|secret|apikey|privatekey|encryptionkey|cryptokey|credential|serviceaccount|token|authorization|firebaseconfig|keymaterial|signingkey/i;
export const canonicalJSON = value => JSON.stringify(value, (_key, item) => item && Object.getPrototypeOf(item) === Object.prototype
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const sha256 = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
export function base64(bytes) {
  let text = '';
  for (let index = 0; index < bytes.length; index += 16384) text += String.fromCharCode(...bytes.subarray(index, index + 16384));
  return btoa(text);
}
const unbase64 = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Base64 inválido.');
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
};
export function sanitizeBackup(value, redacted = [], path = '') {
  if (typeof value === 'string' && (/-----BEGIN .*PRIVATE KEY-----/.test(value) || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))) { redacted.push(path); return '[sensitive value omitted]'; }
  if (value == null || ['boolean', 'string', 'number'].includes(typeof value)) return value;
  if (value instanceof Date) return { $type: 'date', iso: value.toISOString() };
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number') return { $type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (typeof value.path === 'string' && value.firestore) return { $type: 'reference', path: value.path };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return { $type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (Array.isArray(value)) return value.map((item, index) => sanitizeBackup(item, redacted, `${path}[${index}]`));
  if (typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) { redacted.push(path); return { $type: 'omitted', reason: 'unsupported-binary-or-instance' }; }
  const entries = [];
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key.replace(/[^a-z]/gi, '')) || ['__proto__', 'constructor', 'prototype'].includes(key)) { redacted.push(`${path}.${key}`); continue; }
    entries.push([key, sanitizeBackup(item, redacted, `${path}.${key}`)]);
  }
  return Object.fromEntries(entries);
}
export async function makeBackup({ businessId, actorId, sections, startedAt, warnings = [], purpose = 'data-export' }) {
  const manifests = [];
  for (const section of sections) manifests.push({ name: section.name, count: section.records.length, status: section.status,
    warning: section.warning ?? null, sha256: await sha256(canonicalJSON(section.records)) });
  const manifest = { format: 'migapos-local-backup', schemaVersion: BACKUP_VERSION, purpose, businessId, actorId, startedAt,
    finishedAt: new Date().toISOString(), sections: manifests, warnings: [...warnings,
      'Exportación del alcance autorizado; no es una copia integral de Firebase ni un snapshot atómico.',
      'SHA-256 detecta corrupción; no certifica importes, procedencia ni conciliación financiera.',
      'No enumera subcolecciones desconocidas ni colecciones no declaradas; solo incluye rutas conocidas explícitamente leídas. Pendientes y fotos se descargan por separado desde este dispositivo.',
      'No incluye Authentication, secretos, objetos Storage ni fotografías de otros dispositivos/cuentas.'],
    partial: manifests.some(section => section.status !== 'complete') };
  const payload = { manifest, sections: sections.map(section => ({ name: section.name, records: section.records })) };
  return { ...payload, integrity: await sha256(canonicalJSON(payload)) };
}
async function derive(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encodeBackup(backup, password = '') {
  const json = canonicalJSON(backup), bytes = encoder.encode(json);
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('La exportación supera 24 MiB. Reduce el límite o separa las fotos.');
  if (!password) return json;
  if (password.length < 12 || password.length > 1024) throw new Error('Usa una contraseña de 12 a 1024 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iterations = 310000;
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derive(password, salt, iterations), bytes));
  return JSON.stringify({ format: 'migapos-encrypted-backup', version: BACKUP_VERSION, algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256', iterations, salt: base64(salt), iv: base64(iv), ciphertext: base64(encrypted) });
}
export async function verifyBackupFile(text, password = '', businessId) {
  if (typeof text !== 'string' || encoder.encode(text).length > MAX_BACKUP_BYTES * 1.5) throw new Error('Archivo demasiado grande o inválido.');
  let backup = JSON.parse(text);
  if (backup?.format === 'migapos-encrypted-backup') {
    if (backup.version !== BACKUP_VERSION || backup.algorithm !== 'AES-256-GCM' || backup.kdf !== 'PBKDF2-SHA256' || backup.iterations !== 310000) throw new Error('Formato de cifrado no admitido.');
    const salt = unbase64(backup.salt), iv = unbase64(backup.iv);
    if (salt.length !== 16 || iv.length !== 12 || password.length > 1024) throw new Error('Parámetros de cifrado inválidos.');
    try { backup = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await derive(password, salt, backup.iterations), unbase64(backup.ciphertext)))); }
    catch { throw new Error('Contraseña incorrecta o archivo cifrado alterado.'); }
  }
  if (backup?.manifest?.format !== 'migapos-local-backup' || backup.manifest.schemaVersion !== BACKUP_VERSION
    || !Array.isArray(backup.sections) || !Array.isArray(backup.manifest.sections) || backup.sections.length > 30) throw new Error('Manifiesto de backup no admitido.');
  if (backup.manifest.purpose != null && !['data-export', 'inventory', 'local-device'].includes(backup.manifest.purpose)) throw new Error('Propósito de archivo no admitido.');
  if (backup.manifest.sections.some(section => !section || !['complete', 'limited', 'not-read', 'incomplete', 'inaccessible'].includes(section.status))
    || backup.manifest.partial !== backup.manifest.sections.some(section => section.status !== 'complete')) throw new Error('Manifiesto inconsistente: una exportación limitada o inaccesible debe indicarse como parcial.');
  if (businessId && backup.manifest.businessId !== businessId) throw new Error('El archivo pertenece a otro negocio.');
  const { integrity, ...payload } = backup;
  if (integrity !== await sha256(canonicalJSON(payload))) throw new Error('Checksum global incorrecto.');
  const names = new Set();
  for (const section of backup.sections) {
    const entry = backup.manifest.sections.find(item => item.name === section.name);
    if (names.has(section.name) || !Array.isArray(section.records) || !entry || entry.count !== section.records.length
      || entry.sha256 !== await sha256(canonicalJSON(section.records))) throw new Error('Integridad de colección incorrecta.');
    names.add(section.name);
  }
  if (names.size !== backup.manifest.sections.length) throw new Error('Faltan colecciones declaradas.');
  return { manifest: backup.manifest, records: backup.sections.reduce((sum, section) => sum + section.records.length, 0), writes: 0 };
}
