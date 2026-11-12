import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { adminCall, administrationContact, administrationLicense, administrationPage } from '../features/licenses/infrastructure/administrationRepository';
import { runtimeCapabilities } from '../config/runtimeCapabilities.js';
import { toMillisSafe } from '../core/dates/dateValues.js';
import { useNetworkStatus } from './useNetworkStatus.js';

const initialPage = { rows: [], cursor: null, updatedAt: null, verified: false };
const contactTtl = 60_000;
const licenseExpectation = license => ({ status: license.status, expiry: toMillisSafe(license.expiry) });

// SuperAdmin remounts this hook when the identity changes. All cached data is memory-only.
export const useSuperAdmin = user => {
  const actorId = user.uid;
  const online = useNetworkStatus();
  const [page, setPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(runtimeCapabilities.tenantAdministration);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const lifetime = useRef(0), reading = useRef(null), busy = useRef(false);
  const operations = useRef(new Map()), contacts = useRef(new Map());

  const fetchLicenses = useCallback((nextCursor = null) => {
    if (reading.current) return reading.current;
    const generation = lifetime.current;
    setIsLoading(true);
    if (!nextCursor) contacts.current.clear();
    const request = administrationPage({ actorId, ...(nextCursor ? { cursor: nextCursor } : {}) }).then(next => {
      if (generation !== lifetime.current || reading.current !== request) return;
      setPage(previous => ({ ...next, updatedAt: Date.now(), verified: navigator.onLine,
        rows: nextCursor ? [...new Map([...previous.rows, ...next.rows].map(row => [row.id, row])).values()] : next.rows }));
      setError(null);
    }).catch(failure => {
      if (generation !== lifetime.current || reading.current !== request) return;
      const unauthorized = ['permission-denied', 'unauthenticated'].includes(failure.code);
      setPage(previous => unauthorized ? initialPage : { ...previous, verified: false });
      if (unauthorized) contacts.current.clear();
      setError(failure);
    }).finally(() => {
      if (reading.current !== request) return;
      reading.current = null;
      if (generation === lifetime.current) setIsLoading(false);
    });
    reading.current = request;
    return request;
  }, [actorId]);

  useEffect(() => {
    const generation = lifetime.current;
    const cache = contacts.current;
    const invalidate = () => {
      reading.current = null;
      cache.clear();
      setIsLoading(false);
      setPage(previous => ({ ...previous, verified: false }));
    };
    window.addEventListener('offline', invalidate);
    if (runtimeCapabilities.tenantAdministration) void fetchLicenses();
    return () => {
      lifetime.current = generation + 1;
      reading.current = null;
      cache.clear();
      window.removeEventListener('offline', invalidate);
    };
  }, [fetchLicenses]);

  const canOperate = page.verified && online && !isLoading && !isProcessing;
  const readContact = async businessId => {
    if (!canOperate || !navigator.onLine || !page.rows.some(row => row.id === businessId)) throw new Error('Actualiza la lista antes de consultar el contacto.');
    const cache = contacts.current;
    const saved = cache.get(businessId);
    if (saved && saved.expiresAt > Date.now()) return saved.request;
    if (cache.size >= 50) cache.delete(cache.keys().next().value);
    const entry = { expiresAt: Infinity, request: null };
    entry.request = administrationContact({ actorId, businessId }).then(contact => {
      if (cache.get(businessId) !== entry) throw new Error('La consulta cambió; abre nuevamente el contacto.');
      entry.expiresAt = Date.now() + contactTtl;
      return contact;
    }).catch(failure => {
      if (cache.get(businessId) === entry) cache.delete(businessId);
      throw failure;
    });
    cache.set(businessId, entry);
    return entry.request;
  };

  const operate = async (name, data, message) => {
    if (!canOperate || !navigator.onLine || reading.current || busy.current) return false;
    busy.current = true;
    setIsProcessing(true);
    const generation = lifetime.current, key = JSON.stringify([name, data]);
    if (!operations.current.has(key)) operations.current.set(key, crypto.randomUUID());
    const toastId = toast.loading(message);
    try {
      await adminCall(name, { ...data, actorId, operationId: operations.current.get(key) });
      if (generation !== lifetime.current) { toast.dismiss(toastId); return false; }
      operations.current.delete(key);
      if (data.businessId) {
        contacts.current.delete(data.businessId);
        try {
          const row = await administrationLicense({ actorId, businessId: data.businessId });
          if (generation === lifetime.current) {
            setPage(previous => ({ ...previous, rows: previous.rows.map(saved => saved.id === row.id ? row : saved) }));
          }
        } catch (failure) {
          if (generation === lifetime.current) {
            setPage(previous => ({ ...previous, verified: false }));
            setError(failure);
          }
        }
      } else await fetchLicenses();
      if (generation !== lifetime.current) { toast.dismiss(toastId); return false; }
      toast.success('Operación confirmada por Firestore.', { id: toastId });
      return true;
    } catch (failure) {
      if (generation !== lifetime.current) { toast.dismiss(toastId); return false; }
      const unauthorized = ['permission-denied', 'unauthenticated'].includes(failure.code);
      if (unauthorized || ['license-changed', 'quota-changed'].includes(failure.code)) {
        if (unauthorized) contacts.current.clear();
        setPage(previous => unauthorized ? initialPage : { ...previous, verified: false });
        setError(failure);
      }
      toast.error(failure.message || 'Operación pendiente; reintenta con los mismos datos.', { id: toastId });
      return false;
    } finally {
      if (generation === lifetime.current) { busy.current = false; setIsProcessing(false); }
    }
  };

  const filteredLicenses = useMemo(() => {
    const value = searchTerm.trim().toLowerCase();
    return page.rows.filter(license => license.businessName.toLowerCase().includes(value));
  }, [page.rows, searchTerm]);
  return {
    licenses: page.rows, updatedAt: page.updatedAt, isLoading, isProcessing, canOperate, online, searchTerm, setSearchTerm,
    filteredLicenses, error, hasMore: Boolean(page.cursor), readContact,
    refresh: () => online && !busy.current && fetchLicenses(),
    loadMore: () => canOperate && page.cursor && fetchLicenses(page.cursor),
    handleCreateClient: (businessName, ownerEmail, firstName, lastName, months, maxActiveBranches, maxRegisteredBranches) =>
      operate('createTenant', { businessName, ownerEmail, firstName, lastName, months: Number(months), maxActiveBranches: Number(maxActiveBranches), maxRegisteredBranches: Number(maxRegisteredBranches) }, 'Creando negocio…'),
    handleSetBranchQuota: data => operate('setTenantBranchQuota', data, 'Actualizando cupo…'),
    handleExtendLicense: (license, months) =>
      operate('extendTenantLicense', { businessId: license.id, months: Number(months), expected: licenseExpectation(license) }, 'Renovando licencia…'),
    handleToggleStatus: license =>
      operate('setTenantLicenseStatus', { businessId: license.id, status: license.status === 'activa' ? 'inactiva' : 'activa', expected: licenseExpectation(license) }, 'Actualizando licencia…'),
  };
};
