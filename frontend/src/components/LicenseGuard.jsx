import React, { useEffect } from 'react';
import { reportDiagnostic } from '../core/errors/diagnostics.js';
import { useLicenseAccess } from '../features/licenses/hooks/useLicenseAccess';
import RestrictedAccess from './RestrictedAccess';
export default function LicenseGuard({
  user,
  children
}) {
  const {
    licenseState,
    expirationDateStr
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
  if (licenseState === 'active') return children;
  return <RestrictedAccess licenseState={licenseState} expirationDateStr={expirationDateStr} user={user} />;
}
