import { AssistedAccessContext } from '../core/session/AssistedAccessContext';
import { FullscreenState } from '../shared/ui';
import { LicenseContext } from '../features/licenses/context/LicenseContext';
import { useLicenseAccess } from '../features/licenses/hooks/useLicenseAccess';
import RestrictedAccess from './RestrictedAccess';
export default function LicenseGuard({
  user, handleLogout, recheckProfile,
  children
}) {
  const {
    licenseState,
    expirationDateStr, retry, licenseData
  } = useLicenseAccess(user, recheckProfile);
  if (licenseState === 'loading') {
    return <FullscreenState loading title="Verificando acceso…" />;
  }
  if (['active', 'offline-assisted'].includes(licenseState)) return <AssistedAccessContext.Provider value={licenseState === 'offline-assisted' || user.accessVerified === false}><LicenseContext.Provider value={licenseData}>{children}</LicenseContext.Provider></AssistedAccessContext.Provider>;
  return <RestrictedAccess licenseState={licenseState} expirationDateStr={expirationDateStr} user={user} onRetry={retry} onLogout={handleLogout} />;
}
