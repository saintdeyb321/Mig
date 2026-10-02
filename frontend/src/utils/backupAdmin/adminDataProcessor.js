// src/utils/adminDataProcessor.js

const getValidDate = (val) => val ? (val.toDate ? val.toDate().getTime() : new Date(val).getTime()) : 0;
const formatDate = (val) => new Date(val).toLocaleDateString('es-PE');
const formatTime = (val) => new Date(val).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export const processAdminSales = (salesDocs, branchesMap) => {
  const targetArray = [];

  // Orden DESCENDENTE (Más recientes primero)
  const sortedSales = [...salesDocs].sort((a, b) => getValidDate(b.createdAt) - getValidDate(a.createdAt));

  sortedSales.forEach(s => {
    const d = getValidDate(s.createdAt);
    const isAnulada = s.voided === true;
    const ticketId = (s.id || '').slice(0, 8).toUpperCase();
    const bId = s.branchId || 'eliminada';
    const branchName = branchesMap[bId] || 'Sede Desconocida';
    const cashierName = s.cashierName || 'No registrado';

    if (isAnulada) {
      (s.items || []).forEach((item, index) => {
        targetArray.push({
          Fecha: index === 0 ? formatDate(d) : '',
          Hora: index === 0 ? formatTime(d) : '',
          Sucursal: index === 0 ? branchName : '',
          Cajero: index === 0 ? cashierName : '',
          Ticket: index === 0 ? ticketId : '',
          Estado: index === 0 ? 'ANULADA ❌' : '', 
          Pago: index === 0 ? (s.payment || '').toUpperCase() : '',
          Producto: item.name,
          Cantidad: Number(item.qty || 0),
          'Precio Unit.': Number(item.price || 0),
          Subtotal: 0
        });
      });
      targetArray.push({ Fecha: '', Hora: '', Sucursal: '', Cajero: '', Ticket: '', Estado: '', Pago: '', Producto: '', Cantidad: '', 'Precio Unit.': 'TICKET ANULADO ➔', Subtotal: 0 });
      targetArray.push({}); // Fila vacía de separación
    } else {
      (s.items || []).forEach((item, index) => {
        targetArray.push({
          Fecha: index === 0 ? formatDate(d) : '',
          Hora: index === 0 ? formatTime(d) : '',
          Sucursal: index === 0 ? branchName : '',
          Cajero: index === 0 ? cashierName : '',
          Ticket: index === 0 ? ticketId : '',
          Estado: index === 0 ? 'COMPLETADA' : '',
          Pago: index === 0 ? (s.payment || '').toUpperCase() : '',
          Producto: item.name,
          Cantidad: Number(item.qty || 0),
          'Precio Unit.': Number(item.price || 0),
          Subtotal: Number(item.qty || 0) * Number(item.price || 0)
        });
      });
      targetArray.push({ Fecha: '', Hora: '', Sucursal: '', Cajero: '', Ticket: '', Estado: '', Pago: '', Producto: '', Cantidad: '', 'Precio Unit.': 'TOTAL TICKET ➔', Subtotal: Number(s.total || 0) });
      targetArray.push({}); // Fila vacía de separación
    }
  });

  return targetArray;
};