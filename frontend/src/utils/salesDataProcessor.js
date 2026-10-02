// src/utils/salesDataProcessor.js
import { getValidDate, formatDate, formatTime } from './dateUtils';

export const processDailyStats = (statsDocs) => {
  const dailyRowsByBranch = {};
  const branchStats = new Map();
  let totalIngresos = 0, totalTickets = 0, totalAnulados = 0;

  const sortedStats = [...statsDocs].sort((a, b) => b.date.localeCompare(a.date));

  sortedStats.forEach(day => {
    const bId = day.branchId || 'eliminada';
    if (!dailyRowsByBranch[bId]) dailyRowsByBranch[bId] = [];

    dailyRowsByBranch[bId].push({
      Fecha: day.date,
      Tickets: Number(day.totalOrders || 0),
      Anulados: Number(day.voidedOrders || 0),
      Ingreso: Number(day.totalRevenue || 0),
      Efectivo: Number(day.paymentMethods?.efectivo || day['paymentMethods.efectivo'] || 0),
      Yape: Number(day.paymentMethods?.yape || day['paymentMethods.yape'] || 0)
    });

    totalIngresos += Number(day.totalRevenue || 0);
    totalTickets += Number(day.totalOrders || 0);
    totalAnulados += Number(day.voidedOrders || 0);

    if (bId !== 'eliminada') {
      const stat = branchStats.get(bId) || { tickets: 0, ingresos: 0 };
      stat.tickets += Number(day.totalOrders || 0);
      stat.ingresos += Number(day.totalRevenue || 0);
      branchStats.set(bId, stat);
    }
  });

  return { dailyRowsByBranch, branchStats, totals: { totalIngresos, totalTickets, totalAnulados } };
};

export const processSales = (salesDocs, branchesMap) => {
  const ticketsRowsByBranch = {};
  const productMap = new Map();
  const globalProductMap = new Map();
  const branchStats = new Map();
  let totalIngresos = 0, totalTickets = 0, totalAnulados = 0;

  const sortedSales = [...salesDocs].sort((a, b) => getValidDate(b.createdAt) - getValidDate(a.createdAt));

  sortedSales.forEach(s => {
    const d = getValidDate(s.createdAt);
    const isAnulada = s.voided === true;
    const ticketId = (s.id || '').slice(0, 8).toUpperCase();
    const bId = s.branchId || 'eliminada';
    const branchName = branchesMap[bId] || 'Sede Desconocida';
    
    // Extraemos la justificación y quién anuló
    const voidReason = isAnulada ? (s.voidReason || 'Sin justificación') : '';
    const voidedBy = isAnulada ? ` (Por: ${s.voidedByName || 'Cajero'})` : '';
    const justificacionCompleta = isAnulada ? `${voidReason}${voidedBy}` : '';

    // 🚀 FIX: FORMATEO INTELIGENTE DEL MÉTODO DE PAGO
    let metodoPago = (s.payment || '').toUpperCase();
    if (s.payment === 'mixto' && s.splitPayments) {
      const ef = Number(s.splitPayments.efectivo || 0).toFixed(2);
      const yp = Number(s.splitPayments.yape || 0).toFixed(2);
      metodoPago = `MIXTO (Ef: ${ef} / Yp: ${yp})`;
    }

    if (!ticketsRowsByBranch[bId]) ticketsRowsByBranch[bId] = [];
    const targetArray = ticketsRowsByBranch[bId];

    if (!isAnulada) {
      totalIngresos += Number(s.total || 0);
      totalTickets += 1;
      if (bId !== 'eliminada') {
        const stat = branchStats.get(bId) || { tickets: 0, ingresos: 0 };
        stat.tickets += 1;
        stat.ingresos += Number(s.total || 0);
        branchStats.set(bId, stat);
      }
    } else {
      totalAnulados += 1;
    }

    if (isAnulada) {
      (s.items || []).forEach((item, index) => {
        targetArray.push({
          Fecha: index === 0 ? formatDate(d) : '',
          Hora: index === 0 ? formatTime(d) : '',
          Ticket: index === 0 ? ticketId : '',
          Estado: index === 0 ? 'ANULADA ❌' : '', 
          Pago: index === 0 ? metodoPago : '', // 🚀 APLICAMOS EL TEXTO MIXTO AQUÍ
          Producto: item.name,
          Cantidad: Number(item.qty || 0),
          'Precio Unit.': Number(item.price || 0),
          Subtotal: 0,
          Observaciones: index === 0 ? justificacionCompleta : ''
        });
      });
      targetArray.push({ Fecha: '', Hora: '', Ticket: '', Estado: '', Pago: '', Producto: '', Cantidad: '', 'Precio Unit.': 'TICKET ANULADO ➔', Subtotal: 0, Observaciones: '' });
      targetArray.push({});
    } else {
      (s.items || []).forEach((item, index) => {
        targetArray.push({
          Fecha: index === 0 ? formatDate(d) : '',
          Hora: index === 0 ? formatTime(d) : '',
          Ticket: index === 0 ? ticketId : '',
          Estado: index === 0 ? 'COMPLETADA' : '',
          Pago: index === 0 ? metodoPago : '', // 🚀 APLICAMOS EL TEXTO MIXTO AQUÍ
          Producto: item.name,
          Cantidad: Number(item.qty || 0),
          'Precio Unit.': Number(item.price || 0),
          Subtotal: Number(item.qty || 0) * Number(item.price || 0),
          Observaciones: '' 
        });
        
        const prodKey = `${item.name}_${bId}`;
        const currentProd = productMap.get(prodKey) || { nombre: item.name, sucursal: branchName, qty: 0, total: 0 };
        currentProd.qty += Number(item.qty || 0);
        currentProd.total += Number(item.qty || 0) * Number(item.price || 0);
        productMap.set(prodKey, currentProd);

        const gCurrent = globalProductMap.get(item.name) || { nombre: item.name, qty: 0, total: 0 };
        gCurrent.qty += Number(item.qty || 0);
        gCurrent.total += Number(item.qty || 0) * Number(item.price || 0);
        globalProductMap.set(item.name, gCurrent);
      });
      targetArray.push({ Fecha: '', Hora: '', Ticket: '', Estado: '', Pago: '', Producto: '', Cantidad: '', 'Precio Unit.': 'TOTAL TICKET ➔', Subtotal: Number(s.total || 0), Observaciones: '' });
      targetArray.push({});
    }
  });

  return { ticketsRowsByBranch, productMap, globalProductMap, branchStats, totals: { totalIngresos, totalTickets, totalAnulados } };
};