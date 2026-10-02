// src/components/LicenseGuard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import RestrictedAccess from './RestrictedAccess';

export default function LicenseGuard({ user, children }) {
  const [licenseState, setLicenseState] = useState(() => {
    const role = String(user?.role || '').toLowerCase();
    if (role === 'superadmin') return 'active';
    if (!user?.businessId) return 'missing';
    return 'loading';
  });

  const [expirationDateStr, setExpirationDateStr] = useState('');
  const licenseDataRef = useRef(null);

  useEffect(() => {
    const role = String(user?.role || '').toLowerCase();
    if (role === 'superadmin') return;
    if (!user?.businessId) return;

    const licenseRef = doc(db, 'licenses', user.businessId);

    const checkExpirationOnly = () => {
      if (!licenseDataRef.current?.expiry) return;
      const now = new Date();
      const expiryDate = licenseDataRef.current.expiry.toDate();
      if (now > expiryDate) {
        setLicenseState(prev => prev !== 'expired' ? 'expired' : prev);
      }
    };

    const unsubscribe = onSnapshot(licenseRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        licenseDataRef.current = data;

        let isExpired = false;
        if (data.expiry) {
          const expiryDate = data.expiry.toDate();
          isExpired = new Date() > expiryDate;
          setExpirationDateStr(
            expiryDate.toLocaleDateString('es-PE', {
              day: '2-digit', month: 'long', year: 'numeric'
            })
          );
        }

        if (isExpired || data.status === 'inactiva' || data.status === 'suspendida') {
          setLicenseState(isExpired ? 'expired' : 'inactive');
        } else {
          setLicenseState('active');
        }
      } else {
        setLicenseState('missing');
      }
    }, (error) => {
      console.error('Error leyendo licencia:', error);
      setLicenseState('error');
    });

    const intervalId = setInterval(checkExpirationOnly, 10000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [user?.businessId, user?.role]);

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
