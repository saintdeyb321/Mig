// src/utils/offlineRetry.js
import { doc, writeBatch, increment, setDoc } from 'firebase/firestore'; // 🚀 Añadimos setDoc
import offlineDB from '../offlineDB';
import { decrypt } from '../crypto';
import { db } from '../firebase';

export async function retryOfflineSales(userId) {
  if (!navigator.onLine) return;

  try {
    // ==========================================
    // 🚀 1. SINCRONIZAR CAJAS PRIMERO (cash_sessions)
    // ==========================================
    const pendingSessions = await offlineDB.cash_sessions
      .filter(record => record.sync === false)
      .toArray();

    if (pendingSessions.length > 0) {
      for (const record of pendingSessions) {
        try {
          const sessionObj = JSON.parse(await decrypt(record.data, userId));
          const sessionRef = doc(db, 'cash_sessions', record.localId);

          // setDoc con merge crea la caja si no existe, o la actualiza si ya estaba abierta
          await setDoc(sessionRef, {
            ...sessionObj,
            syncedAt: new Date().toISOString()
          }, { merge: true });

          await offlineDB.cash_sessions.update(record.localId, { sync: true });
        } catch (err) {
          console.error(`❌ Fallo al sincronizar caja ${record.localId}:`, err);
        }
      }
    }

    // ==========================================
    // 🚀 2. SINCRONIZAR VENTAS DESPUÉS (Parchado)
    // ==========================================
    const pendingSales = await offlineDB.sales
      .filter(record => record.sync === false)
      .toArray();

    if (pendingSales.length === 0) return;

    for (const record of pendingSales) {
      const batch = writeBatch(db);

      try {
        const saleObj = JSON.parse(await decrypt(record.data, userId));
        const saleDate = saleObj.createdAt?.toDate ? saleObj.createdAt.toDate() : new Date(saleObj.createdAt || saleObj.date);
        const branchId = saleObj.branchId;

        // 1. Registrar venta
        const saleRef = doc(db, 'sales', record.localId);
        batch.set(saleRef, {
          ...saleObj,
          createdAt: saleDate,
          sync: true,
          syncedAt: new Date()
        });

        // 2. Restar stock 
        if (saleObj.items && Array.isArray(saleObj.items)) {
          saleObj.items.forEach(item => {
            const productRef = doc(db, 'products', item.id);
            batch.update(productRef, {
              [`stock.${branchId}`]: increment(-item.qty)
            });
          });
        }

        // 3. Actualizar estadísticas (Mismo código brillante que ya tenías)
        const dateStr = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
        const statsRef = doc(db, 'daily_stats', `${saleObj.businessId}_${dateStr}_${branchId}`);

        const statsUpdates = {
          businessId: saleObj.businessId,
          branchId: branchId,
          date: dateStr,
          totalRevenue: increment(saleObj.total),
          totalOrders: increment(1),
          paymentMethods: {
            [saleObj.payment]: increment(saleObj.total)
          },
          categorySales: {},
          productSales: {}
        };

        if (saleObj.items && Array.isArray(saleObj.items)) {
          saleObj.items.forEach(item => {
            const subtotal = item.price * item.qty;
            if (item.category) {
              statsUpdates.categorySales[item.category] = increment(subtotal);
            }
            statsUpdates.productSales[item.id] = {
              name: item.name,
              qty: increment(item.qty),
              revenue: increment(subtotal)
            };
          });
        }

        if (Object.keys(statsUpdates.categorySales).length === 0) delete statsUpdates.categorySales;
        if (Object.keys(statsUpdates.productSales).length === 0) delete statsUpdates.productSales;

        batch.set(statsRef, statsUpdates, { merge: true });

        // EJECUTAR BATCH
        await batch.commit();
        
        // Si todo va bien, se marca como sincronizada
        await offlineDB.sales.update(record.localId, { sync: true, error: null });

      } catch (error) {
        console.error(`❌ Fallo al sincronizar venta ${record.localId}:`, error);
        
        // 🛡️ PARCHE: Control de pastilla envenenada
        const currentRetries = record.retries || 0;
        if (currentRetries >= 3) {
          // Si falla más de 3 veces, la marcamos como "error_permanente" para que no bloquee la cola
          await offlineDB.sales.update(record.localId, { 
            sync: 'failed', 
            error: error.message 
          });
          console.warn(`⚠️ Venta ${record.localId} marcada como fallida definitivamente.`);
        } else {
          // Solo incrementamos el contador y lo intentará de nuevo en la siguiente vuelta
          await offlineDB.sales.update(record.localId, { 
            retries: currentRetries + 1 
          });
        }
      }
    }
  } catch (err) {
    console.error('❌ Error general al sincronizar ventas offline:', err);
  }
}
