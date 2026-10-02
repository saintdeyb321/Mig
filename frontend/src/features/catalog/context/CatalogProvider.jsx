import { useCallback } from 'react';
import { CatalogContext } from './CatalogContext';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeProducts, subscribeCategories } from '../infrastructure/catalogRepository';
import { projectQueuedStock } from '../application/projectQueuedStock.js';
import { subscribeStockQueue, retireStockProjections, readPendingSales } from '../../sales/infrastructure/pendingSalesCache';
import { subscribeTenantCache } from '../../../core/cache/subscribeTenantCache';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import offlineDB from '../../../offlineDB';

export function CatalogProvider({ children }) {
  const { user, identityKey } = useTenantData();
  const businessId = user.businessId;
  const watchProducts = useCallback((onData, onError) => {
    let raw = [];
    let pendingReady = false;
    let active = true;
    let generation = 0;
    const publish = async () => {
      if (!pendingReady || !active) return;
      const current = ++generation;
      try {
        // A product snapshot may arrive before Dexie's asynchronous liveQuery callback.
        // Read current local ack state so that callback ordering cannot double the debit.
        const pending = await readPendingSales(user, 'global', true);
        if (!active || current !== generation) return;
        const projected = projectQueuedStock(raw, pending, businessId);
        onData(projected.products);
        if (projected.settled.length) await retireStockProjections(projected.settled);
      } catch (error) { if (active && current === generation) onError(error); }
    };
    const stopCache = subscribeTenantCache(offlineDB, 'products', businessId,
      (next, error) => subscribeProducts(businessId, next, error),
      products => { raw = products; publish(); }, onError);
    const stopPending = subscribeStockQueue(user, () => {
      pendingReady = true;
      publish();
    }, onError);
    return () => { active = false; generation++; stopCache(); stopPending(); };
  }, [businessId, user]);
  const watchCategories = useCallback((onData, onError) => subscribeTenantCache(
    offlineDB, 'categories', businessId,
    (next, error) => subscribeCategories(businessId, next, error),
    data => onData(data.sort((a, b) => a.name.localeCompare(b.name))), onError,
    categories => categories.sort((a, b) => a.name.localeCompare(b.name)),
  ), [businessId]);
  const products = useScopedSubscription(identityKey, watchProducts);
  const categories = useScopedSubscription(identityKey, watchCategories);
  return <CatalogContext.Provider value={{
    products: products.data, categories: categories.data,
    isLoading: products.isLoading || categories.isLoading, error: products.error || categories.error,
  }}>{children}</CatalogContext.Provider>;
}
