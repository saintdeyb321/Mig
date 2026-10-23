import { processDailyStats, processSales, DETAIL_HEADERS } from '../../../utils/salesDataProcessor.js';
import { createSheet, applyCurrencyToCols, styleSummarySheet, styleTotalRows, uniqueSheetName } from '../../../utils/excelHelpers.js';
import { buildContractLedgerReport } from './contractLedgerReport.js';
import { cashAuditRows } from './cashAuditRows.js';
import { reportRows, amount } from '../domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';

export const MAX_EXPORT_ROWS = 10000;
export function buildSalesWorkbook(XLSX, { stats = [], sales = [], payments = [], contracts = [], sessions = [], branchesMap = {}, period,
  businessId, branchId = 'global', detailed = ['hoy', 'semana'].includes(period.filter), now = new Date() }) {
  const scope = { businessId, branchId, period };
  const scopedSales = reportRows(sales, scope, row => row.createdAt);
  const scopedPayments = reportRows(payments, scope);
  const scopedContracts = reportRows(contracts.filter(contract => contract.createdAt != null), scope, row => row.createdAt);
  if (scopedSales.reduce((count, sale) => count + (sale.items?.length ?? 0) + 1, scopedPayments.length + scopedContracts.length) > MAX_EXPORT_ROWS) throw new Error('Demasiadas filas de detalle. Selecciona un período menor.');
  const processed = detailed ? processSales(scopedSales, branchesMap, scopedPayments, scope) : processDailyStats(stats, scopedPayments, scope);
  const { model } = processed, metrics = model.summary;
  const wb = XLSX.utils.book_new();
  const append = (name, rows, { currency = [], widths = [], style = 'default', detail = false } = {}) => {
    const sheet = createSheet(XLSX, rows, widths);
    applyCurrencyToCols(sheet, currency);
    if (detail) styleTotalRows(sheet); else styleSummarySheet(sheet, style);
    XLSX.utils.book_append_sheet(wb, sheet, uniqueSheetName(name, wb.SheetNames));
    return sheet;
  };
  const summaryRows = [
    { Concepto: 'Filtro Seleccionado', Valor: ({ hoy: 'Diario Detallado', semana: 'Semanal Detallado', mes: 'Mensual Resumen', todo: 'Anual Resumen' })[period.filter] },
    { Concepto: 'Rango de Fechas', Valor: `${visibleDay(period.start)} al ${visibleDay(period.end)}` },
    { Concepto: 'Generado el', Valor: `${visibleDay(reportDay(now))} ${reportTime(now)}` },
    { Concepto: '💰 GRAN TOTAL INGRESOS NETOS', Valor: metrics.netRevenue },
    { Concepto: '🛒 VENTAS MOSTRADOR NETAS', Valor: metrics.posRevenue },
    { Concepto: ' ↳ Efectivo POS', Valor: metrics.posCash },
    { Concepto: ' ↳ Yape/Plin POS', Valor: metrics.posDigital },
    { Concepto: '🎂 INGRESOS NETOS PEDIDOS ESPECIALES', Valor: metrics.contractRevenue },
    { Concepto: ' ↳ Efectivo Pedidos', Valor: metrics.contractCash },
    { Concepto: ' ↳ Yape/Plin Pedidos', Valor: metrics.contractDigital },
    { Concepto: ' ↳ Reembolsos de Pedidos (ya incluidos)', Valor: metrics.refunds },
    { Concepto: 'Efectivo Neto Total', Valor: metrics.cashRevenue },
    { Concepto: 'Yape/Plin Neto Total', Valor: metrics.digitalRevenue },
    { Concepto: 'Ticket promedio POS', Valor: metrics.posAverageTicket },
    { Concepto: 'Tickets POS Completados', Valor: metrics.posTicketCount },
    { Concepto: 'Pagos de Pedidos Procesados', Valor: metrics.contractPaymentCount },
    { Concepto: 'Tickets POS Anulados', Valor: metrics.voidedTicketCount },
    { Concepto: 'Reembolsos Procesados', Valor: metrics.refundCount },
  ];
  const summary = append('Resumen_Financiero', summaryRows, { currency: ['B'], widths: [{ wch: 52 }, { wch: 32 }] });
  summaryRows.forEach((row, index) => { if (index >= 14 && summary[`B${index + 2}`]) summary[`B${index + 2}`].z = '0'; });
  if (scopedContracts.length) append('Estado_Pedidos', scopedContracts.map(contract => ({
    Pedido: contract.contractNumber ?? contract.contractId ?? contract.id, Cliente: contract.clientName,
    Sede: branchesMap[contract.branchId] ?? contract.branchId, Estado: contract.status,
    'Total comercial (referencia)': contract.total, 'Neto abonado': contract.paidTotal ?? '', Saldo: contract.balance,
  })), { currency: ['E', 'F', 'G'], widths: [24, 30, 24, 24, 24, 20, 20].map(wch => ({ wch })) });
  const audit = buildContractLedgerReport(scopedPayments, contracts, branchesMap);
  if (audit.contractPaymentRows.length) append('Auditoría_Pedidos', audit.contractPaymentRows, {
    currency: ['F', 'G', 'I', 'K', 'P'], widths: [22, 22, 25, 22, 22, 20, 18, 18, 18, 18, 18, 22, 38, 55, 22, 22].map(wch => ({ wch })) });
  if (detailed) {
    const rows = cashAuditRows(sessions, branchesMap, scope);
    if (rows.length) append('Auditoría_Cajas', rows, { currency: ['E', 'F', 'G'], style: 'auditoria', widths: [15, 25, 22, 22, 22, 22, 22, 26, 40].map(wch => ({ wch })) });
  }
  if (model.branches.size) append('Comparativa_Sedes', [...model.branches.values()].map(branch => ({
    Sucursal: branchesMap[branch.branchId] ?? branch.branchId, 'Tickets POS': branch.posTicketCount, 'Pagos Pedidos': branch.contractPaymentCount,
    Anulados: branch.voidedTicketCount, 'Ingreso POS': branch.posRevenue, 'Ingreso Pedidos': branch.contractRevenue,
    'Ventas Sistema (S/)': branch.netRevenue, Efectivo: branch.cashRevenue, 'Yape/Plin': branch.digitalRevenue,
  })), { currency: ['E', 'F', 'G', 'H', 'I'], widths: [25, 14, 16, 14, 20, 20, 24, 20, 20].map(wch => ({ wch })) });
  if (model.products.length) {
    const globals = new Map();
    for (const product of model.products) {
      const previous = globals.get(product.id) ?? { Producto: product.name, Cantidad: 0, Ingreso: 0 };
      globals.set(product.id, { ...previous, Cantidad: previous.Cantidad + product.qty, Ingreso: amount(previous.Ingreso + product.revenue) });
    }
    append('Productos_Global', [...globals.values()].sort((a, b) => b.Cantidad - a.Cantidad), { currency: ['C'], style: 'productos_global', widths: [38, 15, 20].map(wch => ({ wch })) });
    append('Productos_Sedes', model.products.map(product => ({ Producto: product.name, Sucursal: branchesMap[product.branchId] ?? product.branchId, Cantidad: product.qty, Ingreso: product.revenue })),
      { currency: ['D'], style: 'productos_detalle', widths: [38, 25, 15, 20].map(wch => ({ wch })) });
  }
  const byBranch = detailed ? processed.ticketsRowsByBranch : processed.dailyRowsByBranch;
  for (const [id, rows] of Object.entries(byBranch).sort(([a], [b]) => a.localeCompare(b))) append(`${detailed ? 'Detalle' : 'Resum'}_${branchesMap[id] ?? id}`, rows,
    { currency: detailed ? ['H', 'I', 'K'] : ['D', 'E', 'F', 'G', 'H'], detail: detailed,
      widths: (detailed ? DETAIL_HEADERS.map(header => ['Producto', 'Observaciones'].includes(header) ? 42 : 24) : [16, 16, 16, 20, 20, 20, 20, 20, 18]).map(wch => ({ wch })) });
  return { workbook: wb, model };
}
