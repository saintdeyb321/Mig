import { getIdentityKey } from '../../core/session/identity';
import { TenantProvider } from '../../features/branches/context/TenantProvider';
import { CatalogProvider } from '../../features/catalog/context/CatalogProvider';
import { isBusinessSession } from '../../core/session/context.js';

export function SessionProviders({ user, children }) {
  if (!isBusinessSession(user)) return children;
  return <TenantProvider key={getIdentityKey(user)} user={user}>
    <CatalogProvider>{children}</CatalogProvider>
  </TenantProvider>;
}
