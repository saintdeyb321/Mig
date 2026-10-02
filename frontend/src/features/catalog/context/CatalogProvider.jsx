import { useCallback } from 'react';
import { CatalogContext } from './CatalogContext';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeProducts, subscribeCategories } from '../infrastructure/catalogRepository';
import { projectProducts } from '../application/projectProducts';
import { subscribePendingSales, readUnappliedSales } from '../../sales/infrastructure/pendingSalesCache';
import { pendingStockDeltas } from '../../sales/domain/queueState';
import { subscribeTenantCache } from '../../../core/cache/subscribeTenantCache';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import offlineDB from '../../../offlineDB';
import { createSubscriptionScope } from '../../../shared/utils/subscriptionScope';

export function CatalogProvider({ children }) {
  const { user, identityKey } = useTenantData();
  const businessId = user.businessId;
  const watchProducts = useCallback((onData, onError) => {
    let raw = [];
    let pending = [];
    let pendingReady = false;
    const scope = createSubscriptionScope();
    const publish = async () => {
      if (!pendingReady) return;
      const token = scope.next();
      try {
        const unapplied = await readUnappliedSales(pending);
        if (scope.isCurrent(token)) onData(projectProducts(raw, pendingStockDeltas(unapplied, businessId)));
      } catch (error) { if (scope.isCurrent(token)) onError(error); }
    };
    const stopCache = subscribeTenantCache(offlineDB, 'products', businessId,
      (next, error) => subscribeProducts(businessId, next, error),
      products => { raw = products; publish(); }, onError);
    const stopPending = subscribePendingSales(user, 'global', sales => {
      pending = sales.filter(sale => sale.queueStatus !== 'failed');
      pendingReady = true;
      publish();
    }, onError);
    return () => { scope.close(); stopCache(); stopPending(); };
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
