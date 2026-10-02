import { useCallback, useState } from 'react';
import { CatalogContext } from './CatalogContext';
import { useTenantData } from '../../branches/context/TenantContext';
import { subscribeProducts, subscribeCategories } from '../infrastructure/catalogRepository';
import { projectProducts } from '../application/projectProducts';
import { getPendingStockDeltas } from '../../sales/infrastructure/pendingSalesCache';
import { subscribeTenantCache } from '../../../core/cache/subscribeTenantCache';
import { useScopedSubscription } from '../../../shared/hooks/useScopedSubscription';
import offlineDB from '../../../offlineDB';

export function CatalogProvider({ children }) {
  const { user, identityKey } = useTenantData();
  const businessId = user.businessId;
  const [offlineProducts, setOfflineProducts] = useState(null);
  const watchProducts = useCallback((onData, onError) => subscribeTenantCache(
    offlineDB, 'products', businessId,
    (next, error) => subscribeProducts(businessId, next, error),
    data => { setOfflineProducts(null); onData(data.sort((a, b) => a.name.localeCompare(b.name))); }, onError,
    async products => projectProducts(products, await getPendingStockDeltas(businessId)),
  ), [businessId]);
  const watchCategories = useCallback((onData, onError) => subscribeTenantCache(
    offlineDB, 'categories', businessId,
    (next, error) => subscribeCategories(businessId, next, error),
    data => onData(data.sort((a, b) => a.name.localeCompare(b.name))), onError,
    categories => categories.sort((a, b) => a.name.localeCompare(b.name)),
  ), [businessId]);
  const products = useScopedSubscription(identityKey, watchProducts);
  const categories = useScopedSubscription(identityKey, watchCategories);

  const updateProducts = updater => setOfflineProducts(previous => updater(previous || products.data));
  return <CatalogContext.Provider value={{
    products: offlineProducts || products.data, categories: categories.data,
    updateProducts, isLoading: products.isLoading || categories.isLoading,
    error: products.error || categories.error,
  }}>{children}</CatalogContext.Provider>;
}
