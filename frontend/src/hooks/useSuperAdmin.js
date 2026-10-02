// src/hooks/useSuperAdmin.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, setDoc, getDocs, updateDoc, Timestamp, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';

// 🚀 IMPORTAMOS LA UTILIDAD COMPARTIDA
import { wipeTenantData } from '../utils/deleteHelpers'; 

// Cache global — evita lecturas repetidas a Firestore (ahorra cuota en Spark)
let globalLicensesCache = null;
let isFirstLoadDone = false;

export const useSuperAdmin = (user) => {
  const [licenses, setLicenses] = useState(globalLicensesCache || []);
  const [isLoading, setIsLoading] = useState(!isFirstLoadDone);
  const [isProcessing, setIsProcessing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  const fetchLicenses = useCallback(async (forceRefresh = false) => {
    if (user?.role !== 'superadmin') {
      setIsLoading(false);
      return;
    }

    if (isFirstLoadDone && !forceRefresh) return;

    setIsLoading(true);
    try {
      const qUsers = query(collection(db, 'users'), where('role', '==', 'dueño'));

      const [snapLicenses, snapUsers, snapInvites] = await Promise.all([
        getDocs(collection(db, 'licenses')),
        getDocs(qUsers),
        getDocs(collection(db, 'invites'))
      ]);

      const ownersMap = {};

      snapUsers.docs.forEach(d => {
        const u = d.data();
        if (u.businessId) ownersMap[u.businessId] = u;
      });

      snapInvites.docs.forEach(d => {
        const inv = d.data();
        if (inv.businessId && !ownersMap[inv.businessId]) {
          ownersMap[inv.businessId] = inv;
        }
      });

      let data = snapLicenses.docs.map(d => {
        const lic = d.data();
        const owner = ownersMap[d.id] || {};

        return {
          id: d.id,
          ...lic,
          businessName: d.id,
          ownerFirstName: owner.firstName || 'Dueño',
          ownerLastName: owner.lastName || '',
          ownerEmail: owner.email || 'Sin correo registrado',
        };
      });

      data.sort((a, b) => b.expiry?.toMillis() - a.expiry?.toMillis());

      globalLicensesCache = data;
      isFirstLoadDone = true;
      setLicenses(data);

    } catch (error) {
      console.error('Error al cargar licencias:', error);
      toast.error('Error al cargar la lista de clientes.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  const filteredLicenses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return licenses;

    return licenses.filter(l =>
      (l.businessName && l.businessName.toLowerCase().includes(q)) ||
      (l.ownerEmail && l.ownerEmail.toLowerCase().includes(q)) ||
      (l.ownerFirstName && l.ownerFirstName.toLowerCase().includes(q)) ||
      (l.ownerLastName && l.ownerLastName.toLowerCase().includes(q)) ||
      (l.id && l.id.toLowerCase().includes(q))
    );
  }, [licenses, searchTerm]);

  const handleCreateClient = useCallback(async (businessName, ownerEmail, firstName, lastName, months) => {
    setIsProcessing(true);
    const toastId = toast.loading('Provisionando nuevo Tenant...');

    try {
      const cleanName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      const newBusinessId = `${cleanName}_${randomCode}`;

      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + parseInt(months));

      const emailLower = ownerEmail.toLowerCase().trim();

      const newLicenseData = {
        businessId: newBusinessId,
        status: 'activa',
        expiry: Timestamp.fromDate(expiryDate)
      };

      await Promise.all([
        setDoc(doc(db, 'licenses', newBusinessId), newLicenseData),
        setDoc(doc(db, 'invites', emailLower), {
          businessId: newBusinessId,
          email: emailLower,
          firstName: firstName,
          lastName: lastName,
          role: 'dueño',
          status: 'activo'
        }),
        addDoc(collection(db, 'branches'), {
          businessId: newBusinessId,
          name: 'Sede Principal',
          address: 'Dirección por definir',
          phone: '',
          status: 'activo',
          createdAt: new Date().toISOString()
        }),
        setDoc(doc(db, 'settings', newBusinessId), {
          businessId: newBusinessId,
          companyData: {
            razonSocial: businessName,
            ruc: '',
            direccion: 'Dirección por definir',
            telefono: ''
          }
        })
      ]);

      await fetchLicenses(true);
      toast.success(`¡Cliente creado y provisionado con éxito!`, { id: toastId });
      return true;
    } catch (error) {
      console.error('Error creando cliente:', error);
      toast.error('Hubo un error al crear el cliente.', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [fetchLicenses]);

  const handleExtendLicense = useCallback(async (licenseId, monthsToAdd) => {
    setIsProcessing(true);
    const toastId = toast.loading('Extendiendo licencia...');

    try {
      const licenseToUpdate = globalLicensesCache.find(l => l.id === licenseId);
      if (!licenseToUpdate) throw new Error('Licencia no encontrada');

      const now = new Date();
      let currentExpiry = licenseToUpdate.expiry ? licenseToUpdate.expiry.toDate() : now;
      if (currentExpiry < now) currentExpiry = now;

      currentExpiry.setMonth(currentExpiry.getMonth() + parseInt(monthsToAdd));

      await updateDoc(doc(db, 'licenses', licenseId), {
        expiry: Timestamp.fromDate(currentExpiry),
        status: 'activa'
      });

      setLicenses(prev => {
        const updated = prev.map(l =>
          l.id === licenseId ? { ...l, expiry: Timestamp.fromDate(currentExpiry), status: 'activa' } : l
        );
        globalLicensesCache = updated;
        return updated;
      });

      toast.success('Licencia extendida correctamente', { id: toastId });
      return true;
    } catch (error) {
      console.error('Error al extender:', error);
      toast.error('No se pudo extender la licencia', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleToggleStatus = useCallback(async (licenseId, currentStatus) => {
    setIsProcessing(true);
    const toastId = toast.loading('Cambiando estado...');
    const newStatus = currentStatus === 'activa' ? 'inactiva' : 'activa';

    try {
      await updateDoc(doc(db, 'licenses', licenseId), { status: newStatus });

      setLicenses(prev => {
        const updated = prev.map(l =>
          l.id === licenseId ? { ...l, status: newStatus } : l
        );
        globalLicensesCache = updated;
        return updated;
      });

      toast.success(`Licencia ${newStatus}`, { id: toastId });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar estado', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDeleteClient = useCallback(async (licenseId) => {
    // Protección doble para SuperAdmins
    const confirm = window.prompt(`Escribe "BORRAR" para destruir permanentemente la empresa ${licenseId} y toda su información.`);
    if (confirm !== 'BORRAR') {
      toast.error('Eliminación cancelada.');
      return false;
    }

    setIsProcessing(true);
    const toastId = toast.loading('🔥 Destruyendo base de datos del cliente... NO CIERRES LA PÁGINA.');

    try {
      // 🚀 Usamos el helper centralizado (limpia todas las colecciones y settings/licenses)
      await wipeTenantData(db, licenseId, toast, toastId);

      // Actualizamos la UI localmente
      setLicenses(prev => {
        const updated = prev.filter(l => l.id !== licenseId);
        globalLicensesCache = updated;
        return updated;
      });

      toast.success('Cliente y todos sus registros eliminados permanentemente', { id: toastId, duration: 5000 });
      return true;
    } catch (error) {
      console.error('Error al hacer wipe del cliente:', error);
      toast.error('Error crítico al intentar eliminar los datos', { id: toastId });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    licenses, isLoading, isProcessing,
    searchTerm, setSearchTerm, filteredLicenses,
    handleCreateClient, handleExtendLicense, handleToggleStatus, handleDeleteClient
  };
};