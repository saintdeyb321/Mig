import { collection, query, where, getDocs, doc, writeBatch } from 'firebase/firestore';

// 1. Función interna para borrar por lotes seguros (Límite 500)
export const deleteQueryBatch = async (db, queryRef) => {
  const snapshot = await getDocs(queryRef);
  if (snapshot.size === 0) return 0;

  const batches = [];
  let currentBatch = writeBatch(db);
  let count = 0;

  snapshot.docs.forEach((document) => {
    currentBatch.delete(document.ref);
    count++;
    
    // Cortamos en 490 para dejar margen de seguridad
    if (count === 490) { 
      batches.push(currentBatch.commit());
      currentBatch = writeBatch(db);
      count = 0;
    }
  });

  if (count > 0) {
    batches.push(currentBatch.commit());
  }

  await Promise.all(batches);
  return snapshot.size;
};

// 2. Función maestra que destruye todo el Tenant
// Recibe "toast" y "toastId" para ir actualizando la UI mientras borra
export const wipeTenantData = async (db, businessId, toast, toastId) => {
  const collectionsToClean = [
    'users', 
    'products', 
    'categories', 
    'sales', 
    'daily_stats', 
    'branches', 
    'invites',
    'cash_sessions', // 🚀 NUEVO: Borra el historial de cajas
    'alerts'         // 🚀 NUEVO: Borra el historial de alertas y descuadres
  ];

  // Borrar todas las subcolecciones del negocio
  for (const colName of collectionsToClean) {
    if (toast && toastId) toast.loading(`Vaciando tabla: ${colName}...`, { id: toastId });
    const q = query(collection(db, colName), where('businessId', '==', businessId));
    await deleteQueryBatch(db, q);
  }

  // Borrar documentos maestros
  const finalBatch = writeBatch(db);
  finalBatch.delete(doc(db, 'settings', businessId));
  finalBatch.delete(doc(db, 'licenses', businessId)); // También elimina la licencia
  await finalBatch.commit();
};