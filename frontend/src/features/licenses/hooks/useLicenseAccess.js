import { useState, useEffect, useRef } from 'react';
import { subscribeLicense } from '../infrastructure/licenseRepository';
import { toDateSafe } from '../../../core/dates/dateValues';

export function useLicenseAccess(user) {
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


    const checkExpirationOnly = () => {
      if (!licenseDataRef.current?.expiry) return;
      const now = new Date();
      const expiryDate = toDateSafe(licenseDataRef.current.expiry);
      if (expiryDate && now > expiryDate) {
        setLicenseState(prev => prev !== 'expired' ? 'expired' : prev);
      }
    };

    const unsubscribe = subscribeLicense(user.businessId, data => {
      if (data) {
        licenseDataRef.current = data;

        let isExpired = false;
        if (data.expiry) {
          const expiryDate = toDateSafe(data.expiry);
          if (!expiryDate) { setLicenseState('error'); return; }
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
  }, [user?.uid, user?.businessId, user?.role]);

  return { licenseState, expirationDateStr };
}
