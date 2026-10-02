// src/context/GlobalDataContext.jsx
/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useContext, useMemo, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDocs } from 'firebase/firestore';
import offlineDB from '../offlineDB';
import { decrypt } from '../crypto';

// =========================================================
// 🛠️ HELPERS GLOBALES (Fuera del ciclo de render para ahorrar RAM)
// =========================================================
const getTimestamp = (s) => {
  if (s.createdAt?.toDate) return s.createdAt.toDate().getTime();
  if (s.createdAt instanceof Date) return s.createdAt.getTime();
  if (s.date?.toDate) return s.date.toDate().getTime();
  if (s.date instanceof Date) return s.date.getTime();
  if (typeof s.createdAt === 'string' || typeof s.createdAt === 'number') return new Date(s.createdAt).getTime();
  if (typeof s.date === 'string' || typeof s.date === 'number') return new Date(s.date).getTime();
  return 0; 
};

const syncToOfflineDB = async (tableName, remoteData) => {
  try {
    await offlineDB.transaction('rw', offlineDB[tableName], async () => {
      const table = offlineDB[tableName];
      const remoteIds = new Set(remoteData.map(item => item.id));
      const localIds = await table.toCollection().primaryKeys();
      
      const idsToDelete = localIds.filter(id => !remoteIds.has(id));
      
      if (idsToDelete.length > 0) await table.bulkDelete(idsToDelete);
      await table.bulkPut(remoteData); 
    });
  } catch (error) {
    console.warn(`⚠️ Error sincronizando tabla ${tableName}:`, error);
  }
};

export const GlobalDataContext = createContext();
export const useGlobalData = () => useContext(GlobalDataContext);

export const GlobalDataProvider = ({ user, children }) => {
  // 🟢 ZONA CLAVE: ESTADOS GLOBALES (Todo lo que se guarda en memoria)
  const [globalProducts, setGlobalProducts] = useState([]);
  const [globalCategories, setGlobalCategories] = useState([]);
  const [globalSales, setGlobalSales] = useState([]);
  const [globalUsers, setGlobalUsers] = useState([]);
  const [globalInvites, setGlobalInvites] = useState([]); 
  const [isGlobalLoading, setIsGlobalLoading] = useState(true);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [businessBranches, setBusinessBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(null); 
  const [firestoreError, setFirestoreError] = useState(null); 
  
  // 🚀 NUEVO: ESTADO GLOBAL PARA LA AGENDA DE CLIENTES VIP
  const [globalAgenda, setGlobalAgenda] = useState([]);

  const isMounted = useRef(true);
  const loadedSubs = useRef(new Set()); 

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // 🚀 FIX: Aumentamos el número de suscripciones requeridas a 6 porque agregamos la agenda
  const markLoaded = useCallback((subName) => {
    if (!isMounted.current) return;
    loadedSubs.current.add(subName);
    if (loadedSubs.current.size >= 6) { 
      setIsGlobalLoading(false);
    }
  }, []);

  // 🟢 ZONA CLAVE: FASE 0 - CARGAR SUCURSALES (Se ejecuta al iniciar sesión)
  useEffect(() => {
    if (!user?.businessId) return;

    if (user.role === 'cajero' && user.branchId) {
      setActiveBranchId(user.branchId);
    }

    let unsubscribeBranches = null;

    const loadBranches = async () => {
      try {
        const branchesQuery = query(collection(db, 'branches'), where('businessId', '==', user.businessId));
        const initialSnap = await getDocs(branchesQuery);
        const activeBranches = initialSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        unsubscribeBranches = onSnapshot(branchesQuery, (snap) => {
          if (isMounted.current) setBusinessBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        if (!(user.role === 'cajero' && user.branchId)) {
          setActiveBranchId(activeBranches.length === 1 ? activeBranches[0].id : 'global');
        }
      } catch (error) {
        console.error('Error cargando sucursales:', error);
        if (isMounted.current && !(user.role === 'cajero' && user.branchId)) setActiveBranchId('global');
      }
    };

    loadBranches();
    return () => { if (unsubscribeBranches) unsubscribeBranches(); };
  }, [user?.businessId, user?.role, user?.branchId]);

  // 🟢 ZONA CLAVE: FASE 1 - MODO OFFLINE (Carga de IndexedDB para arrancar rápido)
  useEffect(() => {
    if (!user?.businessId) return;

    const loadLocalData = async () => {
      try {
        const [localProducts, localCategories, localUsers, localSettings] = await Promise.all([
          offlineDB.products.toArray(),
          offlineDB.categories.toArray(),
          offlineDB.users.toArray(),
          offlineDB.settings.get(user.businessId),
        ]);

        if (isMounted.current) {
          if (localProducts.length) setGlobalProducts(localProducts.sort((a, b) => a.name.localeCompare(b.name)));
          if (localCategories.length) setGlobalCategories(localCategories.sort((a, b) => a.name.localeCompare(b.name)));
          if (localUsers.length) setGlobalUsers(localUsers.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '')));
          if (localSettings) setGlobalSettings(localSettings);
        }
      } catch (error) {
        console.warn('⚠️ Error cargando datos locales:', error.message);
      }
    };

    const deferLoad = window.requestIdleCallback || ((cb) => setTimeout(cb, 10));
    deferLoad(() => loadLocalData());

  }, [user?.businessId]);

  // 🟢 ZONA CLAVE: CÁLCULO DE MERMAS OFFLINE
  const getPendingStockDeltas = useCallback(async () => {
    const deltas = {};
    try {
      const pendingRecords = await offlineDB.sales.filter(r => r.sync === false).toArray();
      if (pendingRecords.length === 0) return deltas;

      pendingRecords.forEach(record => {
        try {
          const decrypted = decrypt(record.data);
          if (!decrypted) return;
          const sale = JSON.parse(decrypted);
          sale.items.forEach(item => {
            deltas[item.id] = (deltas[item.id] || 0) + item.qty;
          });
        } catch (e) {
          console.warn('Error procesando registro offline:', e.message);
        }
      });
    } catch (e) {
      console.warn('⚠️ Error al leer ventas offline:', e);
    }
    return deltas;
  }, []); 

  // =========================================================
  // 🟢 ZONA CLAVE: FASE 2.A - CONEXIONES PERMANENTES A FIREBASE (Ahorran Dinero)
  // ESTE BLOQUE SOLO SE EJECUTA UNA VEZ POR SESIÓN. NO REACCIONA AL CAMBIO DE SEDE.
  // =========================================================
  useEffect(() => {
    if (!user?.businessId) return;

    loadedSubs.current = new Set();
    setIsGlobalLoading(true);

    const unsubscribes = [];

    // 1️⃣ PRODUCTOS (Globales)
    const productsQuery = query(collection(db, 'products'), where('businessId', '==', user.businessId));
    const unsubProducts = onSnapshot(productsQuery, async (snapshot) => {
      try {
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pendingDeltas = await getPendingStockDeltas();

        const adjustedProducts = products.map(p => {
          let currentStock = 0;
          if (p.stock !== null && typeof p.stock === 'object') {
            currentStock = Object.values(p.stock).reduce((total, qty) => total + (Math.max(0, Number(qty) || 0)), 0);
          } else {
            currentStock = Number(p.stock || 0);
          }
          return { ...p, stock: Math.max(0, currentStock - (pendingDeltas[p.id] || 0)), rawStock: p.stock };
        }).sort((a, b) => a.name.localeCompare(b.name));

        if (isMounted.current) {
          setGlobalProducts(adjustedProducts);
          await syncToOfflineDB('products', adjustedProducts);
          markLoaded('products');
        }
      } catch (e) {
        console.warn('⚠️ Error procesando productos:', e);
        if (isMounted.current) markLoaded('products');
      }
    });
    unsubscribes.push(unsubProducts);

    // 2️⃣ CATEGORÍAS (Globales)
    const categoriesQuery = query(collection(db, 'categories'), where('businessId', '==', user.businessId));
    const unsubCategories = onSnapshot(categoriesQuery, async (snapshot) => {
      try {
        const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
        if (isMounted.current) {
          setGlobalCategories(categories);
          await syncToOfflineDB('categories', categories);
          markLoaded('categories');
        }
      } catch (e) {
        console.warn('⚠️ Error procesando categorías:', e);
        if (isMounted.current) markLoaded('categories');
      }
    });
    unsubscribes.push(unsubCategories);

    // 3️⃣ USUARIOS (Globales)
    if (user?.role === 'superadmin' || user?.role === 'dueño') {
      const usersQuery = user.role === 'superadmin' 
        ? query(collection(db, 'users'), where('businessId', '==', user.businessId))
        : query(collection(db, 'users'), where('businessId', '==', user.businessId), where('role', '!=', 'superadmin'));
        
      const unsubUsers = onSnapshot(usersQuery, async (snapshot) => {
        try {
          const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
          if (isMounted.current) {
            setGlobalUsers(users);
            await syncToOfflineDB('users', users);
            markLoaded('users');
          }
        } catch (e) {
          console.warn('⚠️ Error procesando usuarios:', e);
          if (isMounted.current) markLoaded('users');
        }
      });
      unsubscribes.push(unsubUsers);
    } else {
      if (isMounted.current) { setGlobalUsers([]); markLoaded('users'); }
    }

    // 4️⃣ CONFIGURACIÓN (Global)
    const unsubSettings = onSnapshot(doc(db, 'settings', user.businessId), async (docSnap) => {
      try {
        if (docSnap.exists() && isMounted.current) {
          const data = docSnap.data();
          setGlobalSettings(data);
          await offlineDB.settings.put({ id: user.businessId, ...data });
        }
      } finally {
        if (isMounted.current) markLoaded('settings');
      }
    });
    unsubscribes.push(unsubSettings);

    // 5️⃣ INVITACIONES (Globales)
    if (user?.role === 'dueño' || user?.role === 'superadmin') {
      const unsubInvites = onSnapshot(query(collection(db, 'invites'), where('businessId', '==', user.businessId)), (snapshot) => {
        if (isMounted.current) setGlobalInvites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isInvite: true })));
      });
      unsubscribes.push(unsubInvites);
    }

    // 🚀 6️⃣ AGENDA / CLIENTES VIP (Global)
    const qAgenda = query(collection(db, 'customers'), where('businessId', '==', user.businessId));
    const unsubAgenda = onSnapshot(qAgenda, (snapshot) => {
      try {
        if (isMounted.current) {
          const agendaData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setGlobalAgenda(agendaData);
          markLoaded('agenda'); // Avisamos que ya cargó
        }
      } catch (e) {
        console.warn('⚠️ Error procesando agenda:', e);
        if (isMounted.current) markLoaded('agenda');
      }
    });
    unsubscribes.push(unsubAgenda);

    return () => { unsubscribes.forEach(unsub => unsub()); };
  }, [user?.businessId, user?.role, markLoaded, getPendingStockDeltas]); 


  // =========================================================
  // 🟢 ZONA CLAVE: FASE 2.B - CONEXIÓN VARIABLE (Sí cambia por sede)
  // ESTE BLOQUE SE RECARGA AL CAMBIAR DE SEDE (Coste mínimo: ~50 lecturas)
  // =========================================================
  useEffect(() => {
    if (!user?.businessId || activeBranchId === null) return;
    
    setFirestoreError(null);

    const salesConstraints = [where('businessId', '==', user.businessId)];
    if (activeBranchId !== 'global') {
      salesConstraints.push(where('branchId', '==', activeBranchId));
    }
    salesConstraints.push(orderBy('createdAt', 'desc'), limit(50));

    const unsubSales = onSnapshot(query(collection(db, 'sales'), ...salesConstraints), { includeMetadataChanges: true }, async (snapshot) => {
      try {
        const firestoreSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isOffline: doc.metadata.hasPendingWrites }));
        const pendingRecords = await offlineDB.sales.filter(r => r.sync === false).toArray();
        
        const offlineSales = pendingRecords
          .map(record => {
            try {
              const decrypted = decrypt(record.data);
              if (!decrypted) return null;
              const saleObj = JSON.parse(decrypted);
              return { ...saleObj, id: record.localId, isOffline: true, createdAt: saleObj.createdAt || saleObj.date || new Date() };
            } catch { return null; }
          })
          .filter(Boolean)
          .filter(sale => activeBranchId === 'global' || sale.branchId === activeBranchId);

        const mergedSales = [...offlineSales, ...firestoreSales]
          .sort((a, b) => getTimestamp(b) - getTimestamp(a))
          .slice(0, 50);

        if (isMounted.current) {
          setGlobalSales(mergedSales);
          markLoaded('sales'); 
        }
      } catch (e) {
        console.warn('⚠️ Error procesando ventas:', e);
        if (isMounted.current) markLoaded('sales');
      }
    }, (error) => {
      if (error.message.includes('index') || error.message.includes('FAILED_PRECONDITION')) {
        setFirestoreError('⚠️ Se requiere Índice Compuesto en Firebase. Revisa la consola.');
      }
      if (isMounted.current) markLoaded('sales');
    });

    return () => unsubSales();
  }, [user?.businessId, activeBranchId, markLoaded]); 

  // =========================================================
  // 🟢 ZONA CLAVE: MEMOIZACIÓN PARA EVITAR RE-RENDERS EN REACT
  // =========================================================
  const contextValue = useMemo(() => ({
    globalProducts, setGlobalProducts,
    globalCategories, setGlobalCategories,
    globalSales, setGlobalSales,
    isGlobalLoading,
    globalUsers, setGlobalUsers,
    globalInvites, setGlobalInvites,
    globalSettings, setGlobalSettings,
    businessBranches,
    activeBranchId, setActiveBranchId,
    firestoreError,
    globalAgenda, setGlobalAgenda, // 🚀 NUEVO: Exportamos la agenda memoizada
  }), [
    globalProducts, globalCategories, globalSales, isGlobalLoading,
    globalUsers, globalInvites, globalSettings, businessBranches, activeBranchId, firestoreError, globalAgenda
  ]);

  return (
    <GlobalDataContext.Provider value={contextValue}>
      {children}
    </GlobalDataContext.Provider>
  );
};