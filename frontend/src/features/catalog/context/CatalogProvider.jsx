import { useCallback, useMemo } from 'react';
import { CatalogContext } from './CatalogContext';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeProducts, subscribeCategories } from '../infrastructure/catalogRepository';
import { projectQueuedStock } from '../application/projectQueuedStock.js';
import { subscribeStockQueue, retireStockProjections, readPendingSales } from '../../sales/infrastructure/pendingSalesCache';
import { subscribeTenantCache } from '../../../core/cache/subscribeTenantCache';
import { EMPTY_LIST, useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import offlineDB from '../../../offlineDB';

export function CatalogProvider({ children }) {
  const { user, identityKey } = useTenantData();
  const businessId = user.businessId;
  const uid = user.uid;
  const queueIdentity = useMemo(() => ({ uid, businessId }), [uid, businessId]);
  const watchProducts = useCallback((onData, onError) => {
    let raw = [], metadata = { fromCache: true, hasPendingWrites: false };
    let pendingReady = false;
    let active = true;
    let generation = 0;
    const publish = async () => {
      if (!pendingReady || !active) return;
      const current = ++generation;
      try {
        // A product snapshot may arrive before Dexie's asynchronous liveQuery callback.
        // Read current local ack state so that callback ordering cannot double the debit.
        const pending = await readPendingSales(queueIdentity, 'global', true);
        if (!active || current !== generation) return;
        const projected = projectQueuedStock(raw, pending, businessId);
        onData(projected.products, metadata);
        if (projected.settled.length) await retireStockProjections(projected.settled);
      } catch (error) { if (active && current === generation) onError(error); }
    };
    const stopCache = subscribeTenantCache(offlineDB, 'products', businessId,
      (next, error) => subscribeProducts(businessId, next, error),
      (products, source) => { raw = products; metadata = source; publish(); }, onError);
    const stopPending = subscribeStockQueue(queueIdentity, () => {
      pendingReady = true;
      publish();
    }, onError);
    return () => { active = false; generation++; stopCache(); stopPending(); };
  }, [businessId, queueIdentity]);
  const watchCategories = useCallback((onData, onError) => subscribeTenantCache(
    offlineDB, 'categories', businessId,
    (next, error) => subscribeCategories(businessId, next, error),
    (data, metadata) => onData(data.sort((a, b) => a.name.localeCompare(b.name)), metadata), onError,
    categories => categories.sort((a, b) => a.name.localeCompare(b.name)),
  ), [businessId]);
  const products = useScopedSubscription(identityKey, watchProducts, EMPTY_LIST, { preserveOnError: true, allowCachedData: true });
  const categories = useScopedSubscription(identityKey, watchCategories, EMPTY_LIST, { preserveOnError: true, allowCachedData: true });
  const retry = () => { products.retry(); categories.retry(); };
  return <CatalogContext.Provider value={{
    products: products.data, categories: categories.data,
    isLoading: products.isLoading || categories.isLoading, error: products.error || categories.error,
    isStale: products.isStale || categories.isStale, retry,
  }}>{children}</CatalogContext.Provider>;
}
