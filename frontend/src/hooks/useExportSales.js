// src/hooks/useExportSales.js
import { useState, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { useGlobalData } from "../context/GlobalDataContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

import { createSheet, applyCurrencyToCols, styleTotalRows, styleSummarySheet, sanitizeSheetName } from "../utils/excelHelpers";
import { getLocalDateStr, formatDate, formatTime } from "../utils/dateUtils";
import { processDailyStats, processSales } from "../utils/salesDataProcessor";
import { processContractPaymentsForExport } from "../utils/contractDataProcessor";

const CACHE_TIME = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 10;
const MAX_ROWS = 10000;
const EXPORT_COOLDOWN = 5000;

export const useExportSales = (user) => {
  const { businessBranches } = useGlobalData();
  const [isExporting, setIsExporting] = useState(false);
  const exportCache = useRef(new Map());
  const lastExportTime = useRef(0);

  const exportData = useCallback(async (type, timeFilter = 'mes') => {
    if (!user?.businessId) {
      toast.error("Negocio no encontrado");
      return;
    }

    const now = Date.now();
    if (now - lastExportTime.current < EXPORT_COOLDOWN) {
      toast.error("Espera unos segundos antes de exportar");
      return;
    }
    lastExportTime.current = now;
    setIsExporting(true);

    const reportNameMap = { 'hoy': 'Diario_Detallado', 'semana': 'Semanal_Detallado', 'mes': 'Mensual_Resumen', 'todo': 'Anual_Resumen' };
    const reportTypeStr = reportNameMap[timeFilter] || 'Reporte';
    const toastId = toast.loading(`Generando Excel Sincronizado...`);

    try {
      const XLSX = await import("xlsx-js-style");

      const today = new Date();
      let startDate = new Date(today); startDate.setHours(0, 0, 0, 0);
      let endDate = new Date(today); endDate.setHours(23, 59, 59, 999);

      if (timeFilter === 'todo') {
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
      } else if (timeFilter === 'mes') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      } else if (timeFilter === 'semana') {
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startDate.setDate(today.getDate() + diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      }

      const startStr = getLocalDateStr(startDate);
      const endStr = getLocalDateStr(endDate);

      const branchesMap = (businessBranches || []).reduce((acc, branch) => { acc[branch.id] = branch.name; return acc; }, {});
      let wb = XLSX.utils.book_new();

      let processedData = {};
      const isDetailed = timeFilter === 'hoy' || timeFilter === 'semana';
      
      let totalEfectivo = 0;
      let totalYape = 0;

      // 1. PROCESAR VENTAS REGULARES
      if (!isDetailed) {
        const statsQuery = query(collection(db, 'daily_stats'), where('businessId', '==', user.businessId), where('date', '>=', startStr), where('date', '<=', endStr));
        const statsSnap = await getDocs(statsQuery);
        
        if (!statsSnap.empty) {
          const cleanDocs = statsSnap.docs.map(doc => {
            const cleanData = { ...doc.data() }; 
            const tOrders = Number(cleanData.totalOrders || 0);
            const vOrders = Number(cleanData.voidedOrders || 0);
            const ingreso = Number(cleanData.totalRevenue || 0);
            cleanData.totalOrders = Math.max(0, tOrders - vOrders);
            if (ingreso === 0 || (tOrders > 0 && tOrders === vOrders)) {
               cleanData.totalRevenue = 0;
               if (!cleanData.paymentMethods) cleanData.paymentMethods = {};
               cleanData.paymentMethods = { ...cleanData.paymentMethods, efectivo: 0, yape: 0 };
            }
            return cleanData;
          });
          processedData = processDailyStats(cleanDocs);
          cleanDocs.forEach(data => {
            totalEfectivo += Number(data.paymentMethods?.efectivo || data['paymentMethods.efectivo'] || 0);
            totalYape += Number(data.paymentMethods?.yape || data['paymentMethods.yape'] || 0);
          });
        }
      } else {
        const salesQuery = query(collection(db, 'sales'), where('businessId', '==', user.businessId), where('createdAt', '>=', startDate), where('createdAt', '<=', endDate));
        const salesSnap = await getDocs(salesQuery);
        if (salesSnap.size > MAX_ROWS) throw new Error(`Demasiados registros. Excede límite.`);
        
        if (!salesSnap.empty) {
          processedData = processSales(salesSnap.docs.map(d => ({ id: d.id, ...d.data() })), branchesMap);
          salesSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!data.voided) {
              const pay = String(data.payment || '').trim().toLowerCase();
              const amt = Number(data.total || 0);
              
              // 🚀 FIX: Sumatoria precisa para Pagos Mixtos en el Reporte Detallado
              if (pay === 'mixto' && data.splitPayments) {
                totalEfectivo += Number(data.splitPayments.efectivo) || 0;
                totalYape += Number(data.splitPayments.yape) || 0;
              } else if (pay === 'efectivo') {
                totalEfectivo += amt;
              } else if (pay === 'yape' || pay === 'plin') {
                totalYape += amt;
              }
            }
          });
        }
      }

      // 2. PROCESAR CONTRATOS (Magia Cross-Branch)
      const contractData = await processContractPaymentsForExport(db, user.businessId, startDate, endDate, branchesMap);

      const { 
        dailyRowsByBranch = {}, 
        ticketsRowsByBranch = {}, 
        productMap = new Map(), 
        globalProductMap = new Map(), 
        branchStats = new Map(), 
        totals = { totalIngresos: 0, totalTickets: 0, totalAnulados: 0 } 
      } = processedData;

      // 3. INYECCIÓN DE FRAGMENTACIÓN (Conectar los contratos a las sedes)
      Object.keys(contractData.paymentsByBranch).forEach(bId => {
        const branchPayments = contractData.paymentsByBranch[bId];

        // A. Actualizar Estadísticas de la Sede (Para 'Comparativa_Sedes')
        if (!branchStats.has(bId)) {
          branchStats.set(bId, { tickets: 0, ingresos: 0 });
        }
        const currentStats = branchStats.get(bId);
        const sumIngresos = branchPayments.reduce((acc, curr) => acc + curr.amount, 0);
        const countTickets = branchPayments.filter(p => p.amount > 0).length;
        branchStats.set(bId, {
          tickets: currentStats.tickets + countTickets,
          ingresos: currentStats.ingresos + sumIngresos
        });

        // B. Inyectar a las hojas de detalle (Si el Excel es por Hoy/Semana)
        if (isDetailed) {
          if (!ticketsRowsByBranch[bId]) ticketsRowsByBranch[bId] = [];
          
          branchPayments.forEach(pay => {
            // 🚀 UX FIX: Hacemos que el método mixto se lea espectacular en el Excel
            const metodoTexto = pay.method === 'mixto' && pay.splitPayments 
              ? `MIXTO (Ef: ${pay.splitPayments.efectivo} / Yp: ${pay.splitPayments.yape})` 
              : String(pay.method || 'NO REGISTRADO').toUpperCase();

            ticketsRowsByBranch[bId].push({
              "Fecha": formatDate(pay.date),
              "Hora": formatTime(pay.date),
              "Ticket ID": `PEDIDO: ${pay.contractId}`,
              "Estado": pay.amount < 0 ? 'ANULADA ❌' : 'COMPLETADA',
              "Método": metodoTexto,
              "Productos": `[${pay.type}] Cliente: ${pay.clientName}`,
              "Cajero": pay.cashierName,
              "Subtotal (S/)": pay.amount,
              "Total (S/)": pay.amount,
              "Observación": "Ingreso por contrato cruzado",
            });
          });

          // Reordenamos para que los abonos se mezclen cronológicamente con las ventas POS
          ticketsRowsByBranch[bId].sort((a, b) => (a._sortDate || 0) - (b._sortDate || 0));
        } 
        // C. Inyectar a las hojas resumen (Si el Excel es por Mes/Año)
        else {
          if (!dailyRowsByBranch[bId]) dailyRowsByBranch[bId] = [];

          const paymentsByDate = {};
          branchPayments.forEach(pay => {
            const dStr = formatDate(pay.date);
            if (!paymentsByDate[dStr]) paymentsByDate[dStr] = { ingresos: 0, orders: 0 };
            paymentsByDate[dStr].ingresos += pay.amount;
            if(pay.amount > 0) paymentsByDate[dStr].orders += 1;
          });

          Object.keys(paymentsByDate).forEach(dStr => {
            const existingRow = dailyRowsByBranch[bId].find(r => r["Fecha"] === dStr);
            if (existingRow) {
              existingRow["Ventas (S/)"] += paymentsByDate[dStr].ingresos;
              existingRow["Total Bruto (S/)"] += paymentsByDate[dStr].ingresos;
              existingRow["Tickets"] += paymentsByDate[dStr].orders;
            } else {
              dailyRowsByBranch[bId].push({
                "Fecha": dStr,
                "Tickets": paymentsByDate[dStr].orders,
                "Anulados": 0,
                "Ventas (S/)": paymentsByDate[dStr].ingresos,
                "Delivery (S/)": 0,
                "Total Bruto (S/)": paymentsByDate[dStr].ingresos,
                _sortDate: new Date(dStr.split('/').reverse().join('-')).getTime() 
              });
            }
          });
          dailyRowsByBranch[bId].sort((a, b) => (a._sortDate || 0) - (b._sortDate || 0));
        }
      });

      const { totalIngresos, totalTickets, totalAnulados } = totals;
      const auditRowsRaw = [];
      const branchDiscrepancies = {};
      let totalFaltante = 0;
      let totalSobrante = 0;

      // 4. AUDITORÍA CAJAS
      if (isDetailed) {
        const sessionsQuery = query(collection(db, 'cash_sessions'), where('businessId', '==', user.businessId), where('openedAt', '>=', startDate.toISOString()), where('openedAt', '<=', endDate.toISOString()));
        const sessionsSnap = await getDocs(sessionsQuery);

        sessionsSnap.docs.forEach(doc => {
          const session = doc.data();
          const bId = session.branchId;
          const branchNameLabel = branchesMap[bId] || 'Sede Eliminada';
          const openDiff = session.openingDiscrepancy !== undefined ? Number(session.openingDiscrepancy) : 0;
          const closeDiff = session.difference !== undefined ? Number(session.difference) : Number(session.discrepancy || 0);

          if (!branchDiscrepancies[bId]) branchDiscrepancies[bId] = 0;
          branchDiscrepancies[bId] += openDiff;

          if (openDiff < 0) totalFaltante += Math.abs(openDiff);
          if (openDiff > 0) totalSobrante += openDiff;

          const openDate = session.openedAt ? new Date(session.openedAt) : new Date();
          const esperadoApertura = Number(session.openingAmount || 0) - openDiff;

          auditRowsRaw.push({
            "Fecha Cierre": formatDate(openDate),
            "Turno": `APERTURA: ${formatTime(openDate)}${session.status === 'open' ? ' (EN CURSO)' : ''}`,
            "Sede": branchNameLabel,
            "Cajero": session.cashierName || 'No registrado',
            "Fondo+Ventas (S/)": esperadoApertura,
            "Contado Real (S/)": Number(session.openingAmount || 0),
            "Diferencia (S/)": openDiff,
            "Estado": openDiff === 0 ? '✅ Cuadrado' : (openDiff > 0 ? '⚠️ Sobrante' : '❌ Faltante'),
            "Justificación": session.openingNote || (openDiff !== 0 ? 'Descuadre' : 'Apertura'),
            _sortDate: openDate.getTime() + (session.status === 'open' ? 1000 : 0),
            _branchName: branchNameLabel 
          });

          if (session.status !== 'open') {
            if (!branchDiscrepancies[bId]) branchDiscrepancies[bId] = 0;
            branchDiscrepancies[bId] += closeDiff;
            if (closeDiff < 0) totalFaltante += Math.abs(closeDiff);
            if (closeDiff > 0) totalSobrante += closeDiff;

            const closeDate = session.closedAt ? new Date(session.closedAt) : new Date();
            auditRowsRaw.push({
              "Fecha Cierre": formatDate(closeDate),
              "Turno": `CIERRE: ${formatTime(openDate)} - ${formatTime(closeDate)}`,
              "Sede": branchNameLabel,
              "Cajero": session.cashierName || 'No registrado',
              "Fondo+Ventas (S/)": Number(session.expectedAmount || session.expectedCash || 0),
              "Contado Real (S/)": Number(session.declaredAmount || 0),
              "Diferencia (S/)": closeDiff,
              "Estado": closeDiff === 0 ? '✅ Cuadrado' : (closeDiff > 0 ? '⚠️ Sobrante' : '❌ Faltante'),
              "Justificación": session.closingNote || session.notes || 'Sin justificación',
              _sortDate: closeDate.getTime(),
              _branchName: branchNameLabel 
            });
          }
        });
      }

      // 5. RESUMEN GLOBAL
      const granTotalIngresos = totalIngresos + contractData.totals.totalContratosNeto;

      const summaryData = [
        { Concepto: "Filtro Seleccionado", Valor: reportTypeStr.replace('_', ' ') },
        { Concepto: "Rango de Fechas", Valor: `${startStr} al ${endStr}` },
        { Concepto: "Generado el", Valor: `${formatDate(new Date())} a las ${formatTime(new Date())}` },
        {}, 
        { Concepto: "💰 GRAN TOTAL INGRESOS (Todas las Sedes)", Valor: granTotalIngresos },
        {},
        { Concepto: "🛒 VENTAS MOSTRADOR RÁPIDAS", Valor: totalIngresos },
        { Concepto: " ↳ Efectivo Total", Valor: totalEfectivo },
        { Concepto: " ↳ Yape/Plin Total", Valor: totalYape },
        {},
        { Concepto: "🎂 INGRESOS POR PEDIDOS ESPECIALES", Valor: contractData.totals.totalContratosNeto },
        { Concepto: " ↳ Adelantos y Pagos en Efectivo", Valor: contractData.totals.efectivo },
        { Concepto: " ↳ Adelantos y Pagos en Yape/Plin", Valor: contractData.totals.yape },
      ];

      if (isDetailed) {
        summaryData.push({});
        summaryData.push({ Concepto: "Dinero Sobrante en Cajas", Valor: totalSobrante });
        summaryData.push({ Concepto: "Dinero Faltante o Perdido", Valor: -totalFaltante }); 
      }

      summaryData.push({});
      summaryData.push({ Concepto: "Tickets Rápidos Completados", Valor: totalTickets });
      summaryData.push({ Concepto: "Pagos de Pedidos Procesados", Valor: contractData.totals.totalPagosProcesados });
      summaryData.push({ Concepto: "Tickets Rápidos Anulados", Valor: totalAnulados });
      
      const wsSummary = createSheet(XLSX, summaryData, [{ wch: 55 }, { wch: 25 }]);
      
      Object.keys(wsSummary).forEach(key => {
        if (key.startsWith('!')) return;
        if (key.startsWith('B') && typeof wsSummary[key].v === 'number') {
          const rowNum = key.replace('B', '');
          const labelCell = wsSummary['A' + rowNum];
          wsSummary[key].s = wsSummary[key].s || {}; 
          if (labelCell && (String(labelCell.v).includes('Tickets') || String(labelCell.v).includes('Pagos'))) {
            wsSummary[key].z = '0'; 
          } else {
            wsSummary[key].z = '"S/" #,##0.00'; 
          }
        }
      });
      
      styleSummarySheet(wsSummary, 'default');
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen_Financiero");

      // 6. HOJA: AUDITORÍA DE CONTRATOS
      if (contractData.contractPaymentRows.length > 0) {
        const wsContracts = createSheet(XLSX, contractData.contractPaymentRows, [
          { wch: 18 }, // A: ID Pedido
          { wch: 18 }, // B: Fecha Pedido
          { wch: 25 }, // C: Cliente
          { wch: 20 }, // D: Sede Origen
          { wch: 20 }, // E: Sede Recojo
          { wch: 12 }, // F: Total (S/)
          { wch: 12 }, // G: Adelanto (S/)
          { wch: 15 }, // H: Mét. Adelanto
          { wch: 12 }, // I: Abonado (S/)
          { wch: 15 }, // J: Mét. Abono
          { wch: 15 }, // K: Reembolsos (S/)
          { wch: 18 }, // L: Estado
        ]);
        applyCurrencyToCols(wsContracts, ['F', 'G', 'I', 'K']);
        styleSummarySheet(wsContracts, 'default');
        XLSX.utils.book_append_sheet(wb, wsContracts, "Auditoría_Pedidos");
      }

      // 7. HOJAS RESTANTES (Cajas, Sucursales, Productos)
      if (isDetailed && auditRowsRaw.length > 0) {
        auditRowsRaw.sort((a, b) => {
          const branchCompare = a._branchName.localeCompare(b._branchName);
          if (branchCompare !== 0) return branchCompare;
          return b._sortDate - a._sortDate;
        });
        
        const groupedAuditRows = [];
        let currentBranch = null;

        auditRowsRaw.forEach(row => {
          if (currentBranch !== null && currentBranch !== row._branchName) {
            groupedAuditRows.push({}); 
          }
          currentBranch = row._branchName;
          const { _sortDate, _branchName, ...cleanRow } = row;
          groupedAuditRows.push(cleanRow);
        });

        const wsAudit = createSheet(XLSX, groupedAuditRows, [
          { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, 
          { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 45 }
        ]);
        applyCurrencyToCols(wsAudit, ['E', 'F', 'G']);
        styleSummarySheet(wsAudit, 'auditoria');
        XLSX.utils.book_append_sheet(wb, wsAudit, "Auditoría_Cajas");
      }

      if (branchStats.size > 0 && businessBranches?.length > 1) {
        const branchRows = [];
        branchStats.forEach((stats, branchId) => {
          const diff = branchDiscrepancies[branchId] || 0;
          const row = { 
            Sucursal: branchesMap[branchId] || 'Sede Eliminada', 
            Tickets: stats.tickets, 
            "Ventas Sistema (S/)": stats.ingresos,
          };
          if (isDetailed) {
            row["Faltante/Sobrante (S/)"] = diff;
            row["Ingreso Real Sede (S/)"] = stats.ingresos + diff;
          }
          branchRows.push(row);
        });
        
        if (isDetailed) branchRows.sort((a, b) => b["Ingreso Real Sede (S/)"] - a["Ingreso Real Sede (S/)"]);
        else branchRows.sort((a, b) => b["Ventas Sistema (S/)"] - a["Ventas Sistema (S/)"]);

        const wsBranches = createSheet(XLSX, branchRows, [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 25 }]);
        applyCurrencyToCols(wsBranches, ['C', 'D', 'E']);
        styleSummarySheet(wsBranches, 'default');
        XLSX.utils.book_append_sheet(wb, wsBranches, "Comparativa_Sedes");
      }

      if (isDetailed && globalProductMap.size > 0) {
        const globalProductRows = [];
        globalProductMap.forEach(v => globalProductRows.push({ Producto: v.nombre, Cantidad: v.qty, Ingreso: v.total }));
        globalProductRows.sort((a, b) => b.Cantidad - a.Cantidad);
        const wsGlobalProducts = createSheet(XLSX, globalProductRows, [{ wch: 35 }, { wch: 10 }, { wch: 18 }]);
        applyCurrencyToCols(wsGlobalProducts, ['C']);
        styleSummarySheet(wsGlobalProducts, 'productos_global');
        XLSX.utils.book_append_sheet(wb, wsGlobalProducts, "Productos_Global");

        const productRows = [];
        productMap.forEach(v => productRows.push({ Producto: v.nombre, Sucursal: v.sucursal, Cantidad: v.qty, Ingreso: v.total }));
        productRows.sort((a, b) => a.Sucursal.localeCompare(b.Sucursal) || b.Cantidad - a.Cantidad);
        
        const spacedProductRows = []; let currentBranchProduct = null;
        productRows.forEach((row) => { 
          if (currentBranchProduct !== null && currentBranchProduct !== row.Sucursal) spacedProductRows.push({}); 
          spacedProductRows.push(row); 
          currentBranchProduct = row.Sucursal; 
        });
        const wsProducts = createSheet(XLSX, spacedProductRows, [{ wch: 35 }, { wch: 20 }, { wch: 10 }, { wch: 18 }]);
        applyCurrencyToCols(wsProducts, ['D']);
        styleSummarySheet(wsProducts, 'productos_detalle');
        XLSX.utils.book_append_sheet(wb, wsProducts, "Productos_Sedes");
      }

      // 8. CREAR LAS HOJAS INDIVIDUALES POR SEDE (¡AQUÍ SUCEDE LA MAGIA!)
      const branchIdsToProcess = isDetailed ? Object.keys(ticketsRowsByBranch) : Object.keys(dailyRowsByBranch);
      
      branchIdsToProcess.sort((a, b) => (branchesMap[a] || '').localeCompare(branchesMap[b] || '')).forEach(bId => {
        const branchName = branchesMap[bId] || 'Otros';

        if (!isDetailed) {
          const rows = dailyRowsByBranch[bId] || [];
          if (rows.length > 0) {
            const ws = createSheet(XLSX, rows, [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]);
            applyCurrencyToCols(ws, ['D', 'E', 'F']); 
            styleSummarySheet(ws, 'default');
            XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`Resum_${branchName}`));
          }
        } else {
          const rows = ticketsRowsByBranch[bId] || [];
          if (rows.length > 0) {
            const ws = createSheet(XLSX, rows, [
              { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 15 }, 
              { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 35 }
            ]);
            // En Detalle las columnas H e I son subtotal y total
            applyCurrencyToCols(ws, ['H', 'I']);
            styleTotalRows(ws);
            XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`Detalle_${branchName}`)); 
          }
        }
      });

      const fileName = `Reporte_${reportTypeStr}_${startStr.replace(/\//g, '-')}.xlsx`;
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
      
      const downloadUrl = window.URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      if (exportCache.current.size >= MAX_CACHE_ENTRIES) exportCache.current.delete(exportCache.current.keys().next().value);
      exportCache.current.set( { workbook: wb, fileName, timestamp: Date.now() });
      toast.success("Excel Financiero Integral descargado", { id: toastId });

    } catch (err) {
      console.error("Error capturado en exportData:", err);
      toast.error(err.message || "Error al generar el Excel", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  }, [user?.businessId, businessBranches]);

  return { isExporting, exportData };
};