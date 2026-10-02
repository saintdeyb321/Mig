import React from 'react';
import { useLicenseAccess } from '../features/licenses/hooks/useLicenseAccess';
import RestrictedAccess from './RestrictedAccess';

export default function LicenseGuard({ user, children }) {
  const { licenseState, expirationDateStr } = useLicenseAccess(user);

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
    />
  );
}
