import { isServerSnapshot } from '../session/accessState.js';
import { readTenantCache, syncTenantCache } from './tenantCache.js';
import { createSubscriptionScope } from '../../shared/utils/subscriptionScope.js';

export function subscribeTenantCache(database, tableName, businessId, subscribe, onData, onError, project = value => value) {
  const scope = createSubscriptionScope();
  let receivedSnapshot = false;
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
      await syncTenantCache(database, tableName, businessId, data)
        .catch(error => console.warn('Error guardando cache:', error));
    } catch (error) {
      if (scope.isCurrent(token)) {
        console.warn('Error procesando cache:', error);
        onError(error);
      }
    }
  }, fail);
  return () => { scope.close(); unsubscribe(); };
}
