import { getIdentityKey } from '../../core/session/identity';
import { TenantProvider } from '../../features/branches/context/TenantProvider';
import { CatalogProvider } from '../../features/catalog/context/CatalogProvider';
import { isBusinessSession } from '../../core/session/context.js';
import { SessionResourcesProvider } from '../../core/session/SessionResources.jsx';

export function SessionProviders({ user, children }) {
  if (!isBusinessSession(user)) return children;
  return <SessionResourcesProvider key={getIdentityKey(user)}><TenantProvider user={user}>
    <CatalogProvider>{children}</CatalogProvider>
  </TenantProvider></SessionResourcesProvider>;
}
