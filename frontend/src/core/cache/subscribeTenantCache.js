import { readTenantCache, syncTenantCache } from './tenantCache.js';
import { createSubscriptionScope } from '../../shared/utils/subscriptionScope.js';

export function subscribeTenantCache(database, tableName, businessId, subscribe, onData, onError, project = value => value) {
  const scope = createSubscriptionScope();
  let receivedSnapshot = false;
  readTenantCache(database, tableName, businessId).then(records => {
    if (!receivedSnapshot && records.length) scope.guard(onData)(records, { fromCache: true, hasPendingWrites: false });
  }).catch(error => console.warn('Error leyendo cache:', error));

  const fail = error => { receivedSnapshot = true; scope.next(); scope.guard(onError)(error); };
  const unsubscribe = subscribe(async (records, metadata) => {
    receivedSnapshot = true;
    const token = scope.next();
    if (!scope.isCurrent(token)) return;
    try {
      const data = await project(records);
      if (!scope.isCurrent(token)) return;
      onData(data, metadata);
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
