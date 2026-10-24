import React, { useEffect } from 'react';
import { reportDiagnostic } from '../core/errors/diagnostics.js';
import { useLicenseAccess } from '../features/licenses/hooks/useLicenseAccess';
import RestrictedAccess from './RestrictedAccess';

export default function LicenseGuard({ user, handleLogout, children }) {
  const { licenseState, expirationDateStr, retry } = useLicenseAccess(user);
  useEffect(() => {
    if (!['active', 'loading'].includes(licenseState)) reportDiagnostic('license', { code: 'tenant-restricted' }, 'restricted');
  }, [licenseState]);

  if (licenseState === 'loading') {
    return (
      <div style={{ height: '100dvh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-app)' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (licenseState === 'active') return children;

  return (
    <RestrictedAccess
      licenseState={licenseState}
      expirationDateStr={expirationDateStr}
      user={user}
      onRetry={retry}
      onLogout={handleLogout}
    />
  );
}
