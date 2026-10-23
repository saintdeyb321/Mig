import { createHash } from 'node:crypto';

export const BACKUP_SCHEMA = 1;
export const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
export const SCOPED_COLLECTIONS = ['products', 'categories', 'branches', 'customers', 'contracts', 'payments', 'sales',
  'daily_stats', 'cash_sessions', 'invites', 'notifications', 'alerts', 'audit_events', 'active_cash_sessions',
  'contract_operations', 'contract_migrations', 'settings', 'licenses', 'users', 'tenants'];
export const MASTER_COLLECTIONS = ['settings', 'licenses', 'contract_migrations', 'tenants'];
export const ASSET_PREFIXES = businessId => [`contracts/${businessId}/`];

// Keep the Firestore wire types (including int64, double 1.0, nanoseconds and references).
// firebase-admin is lockfile-pinned. Fail closed if its raw snapshot interface changes.
export function documentRecord(snapshot) {
  if (typeof snapshot.toDocumentProto !== 'function') throw new Error('unsupported-snapshot-format');
  const proto = snapshot.toDocumentProto();
  const normalize = value => {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString('base64') };
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return { $double: Object.is(value, -0) ? '-0' : String(value) };
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      if (value.constructor?.name === 'Long') return value.toString();
      return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, normalize(value[key])]));
    }
    return value;
  };
  const record = { path: snapshot.ref.path, document: normalize(proto) };
  validateRecord(record);
  return record;
}

export function validateRecord(record) {
  if (!record || typeof record.path !== 'string' || record.path.split('/').length % 2 !== 0
    || record.path.split('/').some(part => !part || part === '..') || !record.document?.name?.endsWith('/documents/' + record.path)) throw new Error('invalid-document-path');
  function value(node) {
    if (!node || typeof node !== 'object') throw new Error('invalid-firestore-value');
    const keys = Object.keys(node).filter(key => key !== 'valueType');
    if (keys.length !== 1) throw new Error('invalid-firestore-type');
    const type = keys[0], v = node[type];
    if (type === 'mapValue') { fields(v.fields ?? {}); return; }
    if (type === 'arrayValue') { for (const entry of v.values ?? []) value(entry); return; }
    const valid = type === 'nullValue' ? [null, 'NULL_VALUE', 0].includes(v)
      : type === 'booleanValue' ? typeof v === 'boolean'
      : ['stringValue', 'referenceValue'].includes(type) ? typeof v === 'string'
      : type === 'integerValue' ? /^-?\d+$/.test(String(v)) && BigInt(v) >= -(2n ** 63n) && BigInt(v) < 2n ** 63n
      : type === 'doubleValue' ? typeof v === 'number' || ['NaN', 'Infinity', '-Infinity', '-0'].includes(v?.$double)
      : type === 'timestampValue' ? /^-?\d+$/.test(String(v?.seconds ?? 0)) && Number.isInteger(v.nanos ?? 0) && (v.nanos ?? 0) >= 0 && (v.nanos ?? 0) < 1e9
      : type === 'bytesValue' ? typeof v?.$bytes === 'string' && Buffer.from(v.$bytes, 'base64').toString('base64') === v.$bytes
      : type === 'geoPointValue' ? typeof (v?.latitude ?? 0) === 'number' && Math.abs(v?.latitude ?? 0) <= 90 && typeof (v?.longitude ?? 0) === 'number' && Math.abs(v?.longitude ?? 0) <= 180
      : false;
    if (!valid) throw new Error('invalid-firestore-type');
  }
  function fields(map) { for (const entry of Object.values(map)) value(entry); }
  fields(record.document.fields ?? {});
  return record;
}

export function restoreDocumentWrite(record) {
  validateRecord(record);
  const decode = value => {
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') {
      if (Object.hasOwn(value, '$bytes')) return Buffer.from(value.$bytes, 'base64');
      if (Object.hasOwn(value, '$double')) return value.$double === '-0' ? -0 : Number(value.$double);
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
    }
    return value;
  };
  // A real Firestore Write proto, reconstructed entirely in memory. No commit API is called.
  return { update: { name: record.document.name, fields: decode(record.document.fields ?? {}) } };
}

export function validateManifest(manifest, businessId) {
  if (manifest?.schemaVersion !== BACKUP_SCHEMA || manifest.businessId !== businessId
    || !Number.isInteger(manifest.partCount) || manifest.partCount < 0 || !manifest.createdAt
    || !manifest.consistency?.includes('write-fence') || !manifest.counts) throw new Error('invalid-backup-manifest');
  return manifest;
}

// A restore plan is validated only. No database/Storage handle or mutation is accepted here.
export function dryRunPart(bytes, descriptor, { businessId, projectId }) {
  if (checksum(bytes) !== descriptor.sha256 || bytes.length !== descriptor.bytes) throw new Error('backup-checksum-mismatch');
  if (descriptor.kind === 'asset') {
    if (!ASSET_PREFIXES(businessId).some(prefix => descriptor.source.startsWith(prefix))) throw new Error('foreign-storage-path');
    return { documents: 0, assets: 1 };
  }
  const records = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(records) || records.length !== descriptor.count) throw new Error('backup-count-mismatch');
  for (const record of records) {
    restoreDocumentWrite(record);
    const [collection, id] = record.path.split('/');
    if (!SCOPED_COLLECTIONS.includes(collection) || !record.document.name.startsWith(`projects/${projectId}/databases/(default)/documents/`)) throw new Error('foreign-document-path');
    const root = record.path.split('/').length === 2;
    const fields = record.document.fields ?? {};
    if (root && fields.businessId?.stringValue !== businessId && !(MASTER_COLLECTIONS.includes(collection) && id === businessId)) throw new Error('foreign-tenant-document');
    if (fields.businessId && fields.businessId.stringValue !== businessId) throw new Error('foreign-tenant-document');
    if (collection === 'users' && fields.role?.stringValue === 'superadmin') throw new Error('platform-profile-in-backup');
  }
  return { documents: records.length, assets: 0 };
}
