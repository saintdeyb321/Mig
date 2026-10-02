import { getIdentityKey } from '../../core/session/identity';
import { TenantProvider } from '../../features/branches/context/TenantProvider';
import { CatalogProvider } from '../../features/catalog/context/CatalogProvider';

export function SessionProviders({ user, children }) {
  return <TenantProvider key={getIdentityKey(user)} user={user}>
    <CatalogProvider>{children}</CatalogProvider>
  </TenantProvider>;
}
