export function readTenantCache(database, tableName, businessId) {
  return database[tableName].where('businessId').equals(businessId).toArray();
}

export function sameCacheRecord(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameCacheRecord(value, right[index]));
  }
  const supported = value => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
    || typeof value.toMillis === 'function' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds);
  if (!supported(left) || !supported(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameCacheRecord(left[key], right[key]));
}

export async function syncTenantCache(database, tableName, businessId, remoteData) {
  if (!businessId || remoteData.some(record => record.businessId !== businessId)) {
    throw new Error('El cache requiere registros del mismo tenant.');
  }
  const table = database[tableName];
  await database.transaction('rw', table, async () => {
    const remoteIds = new Set(remoteData.map(record => record.id));
    const existing = await table.bulkGet([...remoteIds]);
    if (existing.some(record => record && record.businessId !== businessId)) {
      throw new Error('Un ID del cache pertenece a otro tenant.');
    }
    const localIds = await table.where('businessId').equals(businessId).primaryKeys();
    const previous = new Map(existing.filter(Boolean).map(row => [row.id, row]));
    const removed = localIds.filter(id => !remoteIds.has(id));
    const changed = remoteData.filter(row => !sameCacheRecord(previous.get(row.id), row));
    if (removed.length) await table.bulkDelete(removed);
    if (changed.length) await table.bulkPut(changed);
  });
}
