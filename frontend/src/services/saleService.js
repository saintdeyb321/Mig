// src/services/saleService.js
import { db } from '../firebase';
import { doc, writeBatch, increment, collection } from 'firebase/firestore'; // 🚀 Añade 'collection'
import offlineDB from '../offlineDB';
import { encrypt } from '../crypto';


/* ========================================================
   1. GUARDAR NUEVA VENTA
======================================================== */
export const saveSaleTransaction = async (sale, cartItems, products, user) => {
  try {
    if (!navigator.onLine) throw new Error('offline');

    const batch = writeBatch(db);

    // A. Calcular costo total para métricas de ganancia neta
    let totalCost = 0;

    // B. Restar stock por sucursal y sumar costos
    cartItems.forEach(item => {
      // Usamos Dot Notation para restar solo el stock de esta sucursal específica
      batch.update(doc(db, 'products', item.id), {
        [`stock.${sale.branchId}`]: increment(-item.qty)
      });
      
      // Buscamos el costo original del producto (si lo tienes configurado)
      const productDb = products.find(p => p.id === item.id);
      const itemCost = productDb?.cost || item.cost || 0; 
      totalCost += (itemCost * item.qty);
    });

    // C. Guardar la venta en la colección principal
    const saleRef = doc(db, 'sales', sale.localId);
    const grossProfit = sale.total - totalCost; // Ganancia limpia
    batch.set(saleRef, { 
      ...sale, 
      totalCost, 
      grossProfit, 
      sync: true,
      voided: false // Inicializamos como NO anulada
    });

    // D. Determinar fecha correcta (Previene errores si viene como Timestamp, Date o String)
    let localDate = new Date();
    if (sale.createdAt && typeof sale.createdAt.toDate === 'function') {
      localDate = sale.createdAt.toDate();
    } else if (sale.createdAt instanceof Date) {
      localDate = sale.createdAt;
    } else if (sale.date instanceof Date) {
      localDate = sale.date;
    } else if (sale.createdAt || sale.date) {
      localDate = new Date(sale.createdAt || sale.date);
    }

    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // E. Referencia al reporte diario de ESTA sucursal específica
    const statsRef = doc(db, 'daily_stats', `${sale.businessId}_${dateStr}_${sale.branchId}`);

    // F. Preparar actualizaciones (Modo Seguro "Dot Notation")
    const updates = {
      businessId: sale.businessId,
      branchId: sale.branchId,  
      date: dateStr,
      totalRevenue: increment(sale.total),
      totalCost: increment(totalCost), 
      grossProfit: increment(grossProfit), 
      totalOrders: increment(1), // Sumamos 1 ticket exitoso
      voidedOrders: increment(0)
    };

    // 🚀 LÓGICA DE PAGOS MIXTOS (Guardado)
    if (sale.payment === 'mixto' && sale.splitPayments) {
      if (sale.splitPayments.efectivo > 0) updates['paymentMethods.efectivo'] = increment(sale.splitPayments.efectivo);
      if (sale.splitPayments.yape > 0) updates['paymentMethods.yape'] = increment(sale.splitPayments.yape);
    } else {
      const metodo = sale.payment || 'efectivo';
      updates[`paymentMethods.${metodo}`] = increment(sale.total);
    }

    // Agregar Categorías y Productos a las estadísticas
    cartItems.forEach(item => {
      const subtotal = item.price * item.qty;
      
      if (item.category) {
        updates[`categorySales.${item.category}`] = increment(subtotal);
      }
      
      updates[`productSales.${item.id}.name`] = item.name;
      updates[`productSales.${item.id}.qty`] = increment(item.qty);
      updates[`productSales.${item.id}.revenue`] = increment(subtotal);
    });

    // G. Enviar todo a Firebase de un solo golpe
    batch.set(statsRef, updates, { merge: true });
    await batch.commit();

    return { success: true, isOffline: false };

  } catch (err) {
    // Manejo de Ventas Offline (Sin internet)
    if (err.message === 'offline' || err.message === 'timeout' || err.code === 'unavailable') {
      
      // Validación de seguridad. Si por alguna razón no hay user, no podemos encriptar con su UID.
      if (!user || !user.uid) {
        throw new Error('Sesión inválida para guardar venta offline.');
      }

      // Al guardar venta offline
      await offlineDB.sales.add({
        localId: sale.localId,
        data: await encrypt(JSON.stringify(sale), user.uid), 
        sync: false,
        createdAt: new Date()
      });

      // Descuento de stock local temporal para que la interfaz siga funcionando
      for (const item of cartItems) {
        const product = products.find(p => p.id === item.id);
        if (product) {
          await offlineDB.products.update(item.id, { stock: product.stock - item.qty }).catch(() => {});
        }
      }
      return { success: true, isOffline: true };
    }
    throw err;
  }
};


/* ========================================================
   2. ANULAR UNA VENTA EXISTENTE
======================================================== */
export const voidSaleTransaction = async (sale) => {
  try {
    if (!navigator.onLine) throw new Error('Debes tener conexión a internet para anular una venta.');

    const batch = writeBatch(db);

    const saleRef = doc(db, 'sales', sale.id);
    
    // 🚀 INYECCIÓN DE AUDITORÍA: Guardamos la justificación y quién anuló
    batch.update(saleRef, { 
      voided: true, 
      voidedAt: new Date(),
      voidReason: sale.voidReason || 'Sin justificación registrada',
      voidedByName: sale.voidedByName || 'Cajero Desconocido',
      voidedByRole: sale.voidedByRole || 'Rol Desconocido'
    });

    (sale.items || []).forEach(item => {
      batch.update(doc(db, 'products', item.id), {
        [`stock.${sale.branchId}`]: increment(item.qty)
      });
    });

    let localDate = new Date();
    if (sale.createdAt && typeof sale.createdAt.toDate === 'function') {
      localDate = sale.createdAt.toDate();
    } else if (sale.createdAt instanceof Date) {
      localDate = sale.createdAt;
    } else if (sale.date instanceof Date) {
      localDate = sale.date;
    } else if (sale.createdAt || sale.date) {
      localDate = new Date(sale.createdAt || sale.date);
    }

    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const statsRef = doc(db, 'daily_stats', `${sale.businessId}_${dateStr}_${sale.branchId}`);

    const totalCost = sale.totalCost || 0;
    const grossProfit = sale.grossProfit || (sale.total - totalCost);

    const updates = {
      totalRevenue: increment(-sale.total), 
      totalCost: increment(-totalCost),
      grossProfit: increment(-grossProfit),
      totalOrders: increment(-1), 
      voidedOrders: increment(1)
    };

    // 🚀 LÓGICA DE PAGOS MIXTOS (Anulación)
    if (sale.payment === 'mixto' && sale.splitPayments) {
      if (sale.splitPayments.efectivo > 0) updates['paymentMethods.efectivo'] = increment(-sale.splitPayments.efectivo);
      if (sale.splitPayments.yape > 0) updates['paymentMethods.yape'] = increment(-sale.splitPayments.yape);
    } else {
      const metodo = sale.payment || 'efectivo';
      updates[`paymentMethods.${metodo}`] = increment(-sale.total);
    }

    (sale.items || []).forEach(item => {
      const subtotal = item.price * item.qty;
      
      if (item.category) {
        updates[`categorySales.${item.category}`] = increment(-subtotal);
      }
      
      updates[`productSales.${item.id}.qty`] = increment(-item.qty);
      updates[`productSales.${item.id}.revenue`] = increment(-subtotal);
    });

    batch.set(statsRef, updates, { merge: true });

    // ==========================================================
    // 🚀 NUEVO: CREAR LA ALERTA PARA LA CAMPANA DEL DUEÑO
    // ==========================================================
    const alertRef = doc(collection(db, 'alerts'));
    batch.set(alertRef, {
      type: 'VOIDED_SALE',
      title: `❌ Ticket Anulado (S/ ${Number(sale.total).toFixed(2)})`,
      branchId: sale.branchId,
      cashierName: sale.voidedByName || 'Cajero Desconocido',
      notes: `Motivo: ${sale.voidReason || 'Sin justificación'}`,
      createdAt: new Date().toISOString(),
      read: false,
      businessId: sale.businessId,
      saleId: sale.id // Guardamos el ID por si el dueño quiere buscar el ticket
    });

    await batch.commit();
    return { success: true };

  } catch (err) {
    console.error("Error al anular venta:", err);
    throw err;
  }
};