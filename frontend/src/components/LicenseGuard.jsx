import { LicenseContext } from '../features/licenses/context/LicenseContext';
import React, { useEffect } from 'react';
import { reportDiagnostic } from '../core/errors/diagnostics.js';
import { useLicenseAccess } from '../features/licenses/hooks/useLicenseAccess';
import RestrictedAccess from './RestrictedAccess';
export default function LicenseGuard({
  user, handleLogout,
  children
}) {
  const {
    licenseState,
    expirationDateStr, retry, licenseData
  } = useLicenseAccess(user);
  useEffect(() => {
    if (!['active', 'loading'].includes(licenseState)) reportDiagnostic('license', {
      code: 'tenant-restricted'
    }, 'restricted');
  }, [licenseState]);
  if (licenseState === 'loading') {
    return <div className="h-dvh w-screen flex justify-center items-center bg-subtle">
        <div className="size-8 animate-spin rounded-full border-3 border-line border-t-primary motion-reduce:animate-none"></div>
      </div>;
  }
  if (licenseState === 'active') return <LicenseContext.Provider value={licenseData}>{children}</LicenseContext.Provider>;
  return <RestrictedAccess licenseState={licenseState} expirationDateStr={expirationDateStr} user={user} onRetry={retry} onLogout={handleLogout} />;
}
