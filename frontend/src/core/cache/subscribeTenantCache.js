import { isServerSnapshot } from '../session/accessState.js';
import { readTenantCache, sameCacheRecord, syncTenantCache } from './tenantCache.js';
import { createSubscriptionScope } from '../../shared/utils/subscriptionScope.js';

export function subscribeTenantCache(database, tableName, businessId, subscribe, onData, onError, project = value => value) {
  const scope = createSubscriptionScope();
  let receivedSnapshot = false, closed = false;
  let saved = null, writes = Promise.resolve();
  const local = readTenantCache(database, tableName, businessId).then(records => {
    if (!receivedSnapshot && records.length) scope.guard(onData)(records, { fromCache: true, hasPendingWrites: false });
    return records;
  }).catch(error => { console.warn('Error leyendo cache:', error); return []; });

  const fail = error => { receivedSnapshot = true; scope.next(); scope.guard(onError)(error); };
  const unsubscribe = subscribe(async (records, metadata) => {
    const confirmed = isServerSnapshot(metadata);
    if (confirmed || records.length) receivedSnapshot = true;
    const token = scope.next();
    if (!scope.isCurrent(token)) return;
    try {
      const cached = !confirmed && !records.length ? await local : [];
      const data = await project(cached.length ? cached : records);
      if (!scope.isCurrent(token)) return;
      onData(data, metadata);
      if (!confirmed) return;
      // Keep durable snapshots in broadcast order even when a previous Dexie transaction is busy.
      writes = writes.then(async () => {
        if (closed || (saved?.size === data.length && data.every(row => sameCacheRecord(saved.get(row.id), row)))) return;
        await syncTenantCache(database, tableName, businessId, data);
        saved = new Map(data.map(row => [row.id, row]));
      }).catch(() => console.warn('No se pudo guardar la caché local.'));
      await writes;
    } catch (error) {
      if (scope.isCurrent(token)) {
        console.warn('Error procesando cache:', error);
        onError(error);
      }
    }
  }, fail);
  return () => { closed = true; scope.close(); unsubscribe(); };
}
