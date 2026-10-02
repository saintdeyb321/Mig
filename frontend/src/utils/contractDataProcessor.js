// src/utils/contractDataProcessor.js
import { collection, query, where, getDocs } from "firebase/firestore";
import { formatDate, formatTime } from "./dateUtils";

export const processContractPaymentsForExport = async (db, businessId, startDate, endDate, branchesMap) => {
  const contractsQuery = query(
    collection(db, 'contracts'),
    where('businessId', '==', businessId),
    where('updatedAt', '>=', startDate),
    where('updatedAt', '<=', endDate)
  );

  const snap = await getDocs(contractsQuery);

  let totalEfectivo = 0;
  let totalYape = 0;
  let totalPagosProcesados = 0;

  const rawContractRows = [];
  const paymentsByBranch = {}; 

  snap.docs.forEach(doc => {
    const contract = doc.data();
    const payments = contract.payments || [];

    let hasPaymentInPeriod = false;

    // Acumuladores del contrato
    let adelantoTotal = 0;
    let abonoTotal = 0;
    let reembolsoTotal = 0;
    const metodosAdelanto = new Set();
    const metodosAbono = new Set();

    payments.forEach(p => {
      const pDate = p.date?.toDate ? p.date.toDate() : new Date(p.date);
      const amount = Number(p.amount) || 0;
      const rawMethod = String(p.method || 'efectivo').toUpperCase().replace('_TALLER', '');
      
      const isCash = rawMethod.includes('EFECTIVO');
      const isYape = rawMethod.includes('YAPE') || rawMethod.includes('PLIN');
      const displayMethod = isCash ? 'EFECTIVO' : (isYape ? 'YAPE/PLIN' : rawMethod);

      // 1. Resumimos la vida del contrato
      if (p.type === 'adelanto') {
         adelantoTotal += amount;
         metodosAdelanto.add(displayMethod);
      } else if (p.type === 'abono') {
         abonoTotal += amount;
         metodosAbono.add(displayMethod);
      } else if (p.type === 'reembolso') {
         reembolsoTotal += Math.abs(amount);
      }

      // 2. Extraemos la plata para los totales globales y las cajas si cayó en la fecha filtrada
      if (pDate >= startDate && pDate <= endDate) {
        hasPaymentInPeriod = true;

        if (isCash) totalEfectivo += amount;
        else if (isYape) totalYape += amount;
        if (amount > 0) totalPagosProcesados++;

        const sedeDelPagoFisico = p.type === 'adelanto' ? contract.branchId : contract.deliveryType;

        if (!paymentsByBranch[sedeDelPagoFisico]) paymentsByBranch[sedeDelPagoFisico] = [];
        paymentsByBranch[sedeDelPagoFisico].push({
          date: pDate,
          amount: amount,
          method: displayMethod,
          type: String(p.type).toUpperCase(),
          contractId: contract.contractId,
          clientName: contract.clientName,
          cashierName: p.cashierName || 'Sistema'
        });
      }
    });

    // 🚀 LÓGICA DE FILA ÚNICA POR CONTRATO
    // Si hubo algún movimiento en la fecha, O si el contrato se actualizó en la fecha, lo mostramos
    if (hasPaymentInPeriod || (contract.updatedAt.toDate() >= startDate && contract.updatedAt.toDate() <= endDate)) {
      const sedeOrigen = branchesMap[contract.branchId] || 'Sede Eliminada';
      const sedeRecojo = contract.deliveryType === 'domicilio' ? '🛵 Delivery' : (branchesMap[contract.deliveryType] || 'Sede Eliminada');
      const orderDate = contract.createdAt?.toDate ? contract.createdAt.toDate() : new Date();

      rawContractRows.push({
        _branchName: sedeOrigen, 
        _timestamp: orderDate.getTime(),
        "ID Pedido": contract.contractId,
        "Fecha Pedido": formatDate(orderDate) + " " + formatTime(orderDate),
        "Cliente": contract.clientName,
        "Sede Origen": sedeOrigen,
        "Sede Recojo": sedeRecojo,
        "Total (S/)": Number(contract.total) || 0,
        "Adelanto (S/)": adelantoTotal,
        "Mét. Adelanto": Array.from(metodosAdelanto).join(' + ') || '-',
        "Abonado (S/)": abonoTotal,
        "Mét. Abono": Array.from(metodosAbono).join(' + ') || '-',
        "Reembolsos (S/)": reembolsoTotal > 0 ? reembolsoTotal : 0,
        "Estado": String(contract.status).toUpperCase().replace(/_/g, ' ')
      });
    }
  });

  // 🚀 AGRUPACIÓN Y ORDENAMIENTO (Con la Fila Vacía intercalada)
  rawContractRows.sort((a, b) => {
    const cmp = a._branchName.localeCompare(b._branchName);
    if (cmp !== 0) return cmp;
    return b._timestamp - a._timestamp; // Más recientes primero
  });

  const contractPaymentRows = [];
  let currentGroupBranch = null;

  rawContractRows.forEach(row => {
    if (currentGroupBranch !== null && currentGroupBranch !== row._branchName) {
       // Insertar fila vacía para separar sedes visualmente
       contractPaymentRows.push({});
    }
    currentGroupBranch = row._branchName;
    
    // Limpiamos los campos internos antes de enviarlo a Excel
    const { _branchName, _timestamp, ...cleanRow } = row;
    contractPaymentRows.push(cleanRow);
  });

  return {
    contractPaymentRows,
    paymentsByBranch,
    totals: {
      efectivo: totalEfectivo,
      yape: totalYape,
      totalContratosNeto: totalEfectivo + totalYape,
      totalPagosProcesados
    }
  };
};