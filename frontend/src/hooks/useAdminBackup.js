// src/hooks/useAdminBackup.js
import { useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

import { createSheet, applyCurrencyToCols } from '../utils/excelHelpers';
import { applyAdminPremiumStyle, styleAdminDetailedTickets } from '../utils/backupAdmin/adminExcelStyles'; 
import { processAdminSales } from '../utils/backupAdmin/adminDataProcessor'; // 🚀 Importamos tu procesador de tickets detallado

export const useAdminBackup = (user) => {
  const [isBackingUp, setIsBackingUp] = useState(false);

  const getMs = (val) => {
    if (!val) return 0;
    return val.toDate ? val.toDate().getTime() : new Date(val).getTime();
  };

  const downloadTenantBackup = async (targetBusinessId) => {
    if (user?.role !== 'superadmin') {
      toast.error('Acceso denegado: Herramienta exclusiva de SuperAdmin.');
      return;
    }
    if (!targetBusinessId) {
      toast.error('ID de empresa no proporcionado.');
      return;
    }

    setIsBackingUp(true);
    const toastId = toast.loading(`Iniciando extracción masiva sin restricciones para ${targetBusinessId}...`);

    try {
      const XLSX = await import('xlsx-js-style');
      const wb = XLSX.utils.book_new();

      const formatDateObj = (val) => {
        if (!val) return { fecha: '', hora: '' };
        const d = val.toDate ? val.toDate() : new Date(val);
        return { 
          fecha: d.toLocaleDateString('es-PE'), 
          hora: d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) 
        };
      };

      // FASE 1: Colecciones Estáticas
      toast.loading('Cargando configuraciones y catálogos...', { id: toastId });
      
      const [settingsSnap, branchesSnap, usersSnap, catsSnap] = await Promise.all([
        getDoc(doc(db, 'settings', targetBusinessId)),
        getDocs(query(collection(db, 'branches'), where('businessId', '==', targetBusinessId))),
        getDocs(query(collection(db, 'users'), where('businessId', '==', targetBusinessId))),
        getDocs(query(collection(db, 'categories'), where('businessId', '==', targetBusinessId)))
      ]);

      const branchesMap = {};
      const branchesData = branchesSnap.docs.map(d => {
        const b = d.data();
        branchesMap[d.id] = b.name || 'Sede Local';
        return { 'ID Sucursal': d.id, 'Nombre': b.name, 'Dirección': b.address || '', 'Teléfono': b.phone || '', 'Estado': String(b.status || '').toUpperCase() };
      });

      const settingsData = settingsSnap.exists() ? [{
        'ID Negocio': targetBusinessId,
        'Razón Social': settingsSnap.data().companyData?.razonSocial || '',
        'RUC': settingsSnap.data().companyData?.ruc || '',
        'Dirección': settingsSnap.data().companyData?.direccion || '',
        'Teléfono': settingsSnap.data().companyData?.telefono || ''
      }] : [];
      
      const wsSettings = createSheet(XLSX, settingsData, [{wch: 25}, {wch: 30}, {wch: 15}, {wch: 40}, {wch: 15}]);
      applyAdminPremiumStyle(wsSettings);
      XLSX.utils.book_append_sheet(wb, wsSettings, 'Configuracion');
      
      const wsBranches = createSheet(XLSX, branchesData, [{wch: 25}, {wch: 25}, {wch: 40}, {wch: 15}, {wch: 15}]);
      applyAdminPremiumStyle(wsBranches);
      XLSX.utils.book_append_sheet(wb, wsBranches, 'Sucursales');

      const usersData = usersSnap.docs.map(d => {
        const u = d.data();
        return { 'ID Usuario': d.id, 'Nombre': `${u.firstName || ''} ${u.lastName || ''}`.trim(), 'Rol': String(u.role || '').toUpperCase(), 'Correo': u.email, 'Sede Asignada': branchesMap[u.branchId] || 'Acceso Global', 'Estado': String(u.status || '').toUpperCase() };
      });
      const wsUsers = createSheet(XLSX, usersData, [{wch: 30}, {wch: 30}, {wch: 15}, {wch: 30}, {wch: 20}, {wch: 15}]);
      applyAdminPremiumStyle(wsUsers);
      XLSX.utils.book_append_sheet(wb, wsUsers, 'Personal');

      const catsData = catsSnap.docs.map(d => ({ 'ID Categoría': d.id, 'Nombre': d.data().name, 'Estado': String(d.data().status || '').toUpperCase() }));
      const wsCats = createSheet(XLSX, catsData, [{wch: 25}, {wch: 25}, {wch: 15}]);
      applyAdminPremiumStyle(wsCats);
      XLSX.utils.book_append_sheet(wb, wsCats, 'Categorias');

      // FASE 2: Inventario
      toast.loading('Descargando inventario...', { id: toastId });
      const prodsSnap = await getDocs(query(collection(db, 'products'), where('businessId', '==', targetBusinessId)));
      const prodsRaw = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      const prodsData = prodsRaw.map(p => {
        let stockInfo = typeof p.stock === 'object' && p.stock !== null 
          ? Object.entries(p.stock).map(([brId, qty]) => `${branchesMap[brId] || brId}: ${qty}`).join(' | ') 
          : String(p.stock || 0);
        return { 'ID Producto': p.id, 'Nombre': p.name, 'Categoría': p.category || '', 'Precio Venta': Number(p.price || 0), 'Costo Compra': Number(p.cost || 0), 'Inventario': stockInfo, 'Estado': String(p.status || '').toUpperCase() };
      });
      
      const wsProds = createSheet(XLSX, prodsData, [{wch: 25}, {wch: 35}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 35}, {wch: 15}]);
      applyCurrencyToCols(wsProds, ['D', 'E']);
      applyAdminPremiumStyle(wsProds);
      XLSX.utils.book_append_sheet(wb, wsProds, 'Productos');

      // FASE 3: Historial de Cajas
      toast.loading('Descargando y formateando sesiones de caja...', { id: toastId });
      const sessionsSnap = await getDocs(query(collection(db, 'cash_sessions'), where('businessId', '==', targetBusinessId)));
      const sessionsRaw = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => getMs(b.openedAt) - getMs(a.openedAt));
      
      const sessionsData = sessionsRaw.map(s => {
        const opened = formatDateObj(s.openedAt);
        const closed = formatDateObj(s.closedAt);
        return {
          'ID Sesión': s.id.substring(0, 8), 'Sucursal': branchesMap[s.branchId] || 'No definida', 'Cajero': s.cashierName || 'No registrado',
          'Apertura': `${opened.fecha} ${opened.hora}`, 'Cierre': s.closedAt ? `${closed.fecha} ${closed.hora}` : 'EN CURSO',
          'Estado': String(s.status || '').toUpperCase(), 'Monto Apertura': Number(s.openingAmount || 0), 'Monto Declarado': Number(s.declaredAmount || 0),
          'Diferencia': Number(s.discrepancy || 0), 'Notas': s.closingNote || s.openingNote || ''
        };
      });
      
      const wsSessions = createSheet(XLSX, sessionsData, [{wch: 15}, {wch: 20}, {wch: 25}, {wch: 20}, {wch: 20}, {wch: 15}, {wch: 18}, {wch: 18}, {wch: 15}, {wch: 40}]);
      applyCurrencyToCols(wsSessions, ['G', 'H', 'I']);
      applyAdminPremiumStyle(wsSessions);
      XLSX.utils.book_append_sheet(wb, wsSessions, 'Auditoria_Cajas');

      // FASE 4: Alertas de Seguridad
      toast.loading('Descargando historial de alertas...', { id: toastId });
      const alertsSnap = await getDocs(query(collection(db, 'alerts'), where('businessId', '==', targetBusinessId)));
      const alertsRaw = alertsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
      
      const alertsData = alertsRaw.map(a => {
        const created = formatDateObj(a.createdAt);
        return {
          'Fecha': created.fecha, 'Hora': created.hora, 'Tipo': String(a.type || '').toUpperCase(), 'Título': a.title || '',
          'Sucursal': branchesMap[a.branchId] || 'No definida', 'Cajero': a.cashierName || '-', 'Descuadre': Number(a.difference || 0), 'Detalle': a.notes || ''
        };
      });
      
      const wsAlerts = createSheet(XLSX, alertsData, [{wch: 12}, {wch: 12}, {wch: 25}, {wch: 35}, {wch: 20}, {wch: 25}, {wch: 15}, {wch: 50}]);
      applyCurrencyToCols(wsAlerts, ['G']);
      applyAdminPremiumStyle(wsAlerts);
      XLSX.utils.book_append_sheet(wb, wsAlerts, 'Alertas_Seguridad');

      // FASE 5: Resumen Diario y Tickets 
      toast.loading('Descargando historial de ventas...', { id: toastId });
      
      const dailySnap = await getDocs(query(collection(db, 'daily_stats'), where('businessId', '==', targetBusinessId)));
      const dailyRaw = dailySnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      
      const dailyData = dailyRaw.map(s => {
        const efectivo = s.paymentMethods?.efectivo || s['paymentMethods.efectivo'] || 0;
        const yape = s.paymentMethods?.yape || s['paymentMethods.yape'] || 0;
        let categoriasStr = s.categorySales ? Object.entries(s.categorySales).map(([cat, total]) => `${cat} (S/${Number(total).toFixed(2)})`).join(' | ') : '-';
        let productosStr = s.productSales ? Object.values(s.productSales).map(p => `${p.qty}x ${p.name} (S/${Number(p.revenue || 0).toFixed(2)})`).join(' | ') : '-';

        return { 
          'Fecha': s.date, 'Sucursal': branchesMap[s.branchId] || 'Global', 
          'Ingresos Netos': Number(s.totalRevenue || 0), 'Tickets Exitosos': Number(s.totalOrders || 0), 'Tickets Anulados': Number(s.voidedOrders || 0), 
          'Pagos Efectivo': Number(efectivo), 'Pagos Yape/Plin': Number(yape), 
          'Ventas por Categoría': categoriasStr, 'Ventas por Producto': productosStr 
        };
      });
      const wsDaily = createSheet(XLSX, dailyData, [{wch: 15}, {wch: 20}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 50}, {wch: 60}]);
      applyCurrencyToCols(wsDaily, ['C', 'F', 'G']);
      applyAdminPremiumStyle(wsDaily);
      XLSX.utils.book_append_sheet(wb, wsDaily, 'Resumen_Diario');

      // 🚀 NUEVA LÓGICA DE TICKETS DETALLADOS PARA EL ADMIN
      toast.loading('Empaquetando tickets detallados...', { id: toastId });
      const salesSnap = await getDocs(query(collection(db, 'sales'), where('businessId', '==', targetBusinessId)));
      const salesDocs = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Llamamos a tu nuevo procesador
      const salesData = processAdminSales(salesDocs, branchesMap);

      // Usamos las 11 columnas que escupe tu procesador
      const wsSales = createSheet(XLSX, salesData, [{wch: 12}, {wch: 12}, {wch: 25}, {wch: 25}, {wch: 12}, {wch: 15}, {wch: 12}, {wch: 35}, {wch: 10}, {wch: 15}, {wch: 15}]);
      applyCurrencyToCols(wsSales, ['J', 'K']); 
      
      // Llamamos al estilo premium para tickets detallados
      styleAdminDetailedTickets(wsSales);
      XLSX.utils.book_append_sheet(wb, wsSales, 'Tickets_Detallados');

      // DESCARGA FINAL
      toast.loading('Generando archivo de Excel con formato Premium...', { id: toastId });
      const todayDate = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Respaldo_Total_${targetBusinessId}_${todayDate}.xlsx`);
      
      toast.success('¡Respaldo Maestro completado! Exportación exitosa.', { id: toastId });

    } catch (error) {
      console.error('Error en respaldo:', error);
      toast.error('Error crítico al generar el respaldo. Revisa la consola.', { id: toastId });
    } finally {
      setIsBackingUp(false);
    }
  };

  return { isBackingUp, downloadTenantBackup };
};