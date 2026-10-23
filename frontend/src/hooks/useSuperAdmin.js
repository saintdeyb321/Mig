import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { adminCall, administrationPage } from '../features/licenses/infrastructure/administrationRepository';

export const useSuperAdmin = user => {
  const [licenses, setLicenses] = useState([]), [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false), [searchTerm, setSearchTerm] = useState('');
  const [cursor, setCursor] = useState(null), [error, setError] = useState(null);
  const busy = useRef(false), revision = useRef({ value: 0 }), operations = useRef(new Map());
  const identity = `${user?.uid}:${user?.role}`;
  const fetchLicenses = useCallback(async (nextCursor = null) => {
    if (user?.role !== 'superadmin') { setIsLoading(false); return; }
    const version = revision.current.value;
    setIsLoading(true);
    try {
      const page = await administrationPage({ limit: 25, ...(nextCursor ? { cursor: nextCursor } : {}) });
      if (version !== revision.current.value) return;
      setLicenses(previous => nextCursor ? [...new Map([...previous, ...page.rows].map(row => [row.id, row])).values()] : page.rows);
      setCursor(page.cursor); setError(null);
    } catch (failure) { if (version === revision.current.value) setError(failure.message || 'No se pudo cargar la administración.'); }
    finally { if (version === revision.current.value) setIsLoading(false); }
  }, [user?.role]);
  useEffect(() => {
    const lifetime = revision.current;
    lifetime.value++; operations.current.clear(); busy.current = false;
    setLicenses([]); setCursor(null); setIsProcessing(false);
    void fetchLicenses();
    return () => { lifetime.value++; };
  }, [identity, fetchLicenses]);
  const operate = useCallback(async (name, data, message) => {
    if (busy.current) return false;
    busy.current = true; setIsProcessing(true);
    const version = revision.current.value, key = JSON.stringify([name, data]);
    if (!operations.current.has(key)) operations.current.set(key, crypto.randomUUID());
    const toastId = toast.loading(message);
    try {
      await adminCall(name, { ...data, operationId: operations.current.get(key) });
      if (version !== revision.current.value) return false;
      operations.current.delete(key);
      await fetchLicenses();
      toast.success('Operación confirmada por el servidor.', { id: toastId });
      return true;
    } catch (failure) { toast.error(failure.message || 'Operación pendiente; reintenta con los mismos datos.', { id: toastId }); return false; }
    finally { if (version === revision.current.value) { busy.current = false; setIsProcessing(false); } }
  }, [fetchLicenses]);
  const confirmTarget = businessId => window.prompt(`Confirma el ID exacto del tenant: ${businessId}`) === businessId;
  const filteredLicenses = useMemo(() => {
    const value = searchTerm.trim().toLowerCase();
    return licenses.filter(license => ['businessName', 'ownerEmail', 'ownerFirstName', 'ownerLastName', 'id'].some(field => (license[field] ?? '').toLowerCase().includes(value)));
  }, [licenses, searchTerm]);
  return { licenses, isLoading, isProcessing, searchTerm, setSearchTerm, filteredLicenses, error, hasMore: !!cursor,
    refresh: () => fetchLicenses(), loadMore: () => !isLoading && fetchLicenses(cursor),
    handleCreateClient: (businessName, ownerEmail, firstName, lastName, months) => operate('createTenant', { businessName, ownerEmail, firstName, lastName, months: Number(months) }, 'Provisionando tenant…'),
    handleExtendLicense: (businessId, months) => operate('extendTenantLicense', { businessId, months: Number(months) }, 'Renovando licencia…'),
    handleToggleStatus: (businessId, status) => operate('setTenantLicenseStatus', { businessId, status: status === 'activa' ? 'inactiva' : 'activa' }, 'Actualizando licencia…'),
    handleDeleteClient: businessId => confirmTarget(businessId) && operate('requestTenantDeletion', { businessId, confirmation: businessId }, 'Solicitando eliminación recuperable y backup…'),
    handleCancelDeletion: businessId => operate('cancelTenantDeletion', { businessId }, 'Cancelando solicitud…'),
    handlePurgeClient: businessId => confirmTarget(businessId) && operate('startTenantPurge', { businessId, confirmation: businessId }, 'Iniciando purga verificada…'),
  };
};
