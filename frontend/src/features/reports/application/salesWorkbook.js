import { processDailyStats, processSales, DETAIL_HEADERS } from '../../../utils/salesDataProcessor.js';
import { createSheet, applyCurrencyToCols, styleSummarySheet, styleTotalRows, uniqueSheetName } from '../../../utils/excelHelpers.js';
import { buildContractLedgerReport } from './contractLedgerReport.js';
import { cashAuditRows } from './cashAuditRows.js';
import { reportViewModel } from './reportViewModel.js';
import { reportRows, amount, CHANNEL_BREAKDOWN_ROWS, CHANNEL_EVIDENCE_NOTE, CHANNEL_NEGATIVE_NOTE, REPORT_CHANNELS } from '../domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { branchReportName, orderReportNumber, reportLabel } from './reportNames.js';

export const MAX_EXPORT_ROWS = 10000;

export function writeSalesWorkbook(XLSX, workbook) {
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  const details = workbook.SheetNames.flatMap((name, index) => name.startsWith('Detalle_') ? [index + 1] : []);
  if (!details.length) return bytes;
  // xlsx-js-style does not serialize !freeze. Update only the generated sheet view.
  const archive = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  for (const index of details) {
    const file = XLSX.CFB.find(archive, `/xl/worksheets/sheet${index}.xml`);
    if (!file?.content) continue;
    const xml = decoder.decode(new Uint8Array(file.content));
    const view = '<sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView>';
    file.content = encoder.encode(xml.replace('<sheetView workbookViewId="0"/>', view));
    file.size = file.content.length;
  }
  return XLSX.CFB.write(archive, { fileType: 'zip', type: 'array', compression: true });
}

export function buildSalesWorkbook(XLSX, { stats = [], sales = null, payments = [], voids = [], contracts = [], sessions = [], branchesMap = {}, people, model: prepared, period,
  businessId, branchId = 'global', detailed = ['hoy', 'semana'].includes(period.filter), now = new Date() }) {
  const scope = { businessId, branchId, period };
  const scopedSales = reportRows(sales ?? [], scope, row => row.createdAt);
  const scopedPayments = reportRows(payments, scope);
  const scopedVoids = [...new Map(reportRows(voids, scope).map(row => [row.id, row])).values()];
  const scopedContracts = reportRows(contracts.filter(contract => contract.createdAt != null), scope, row => row.createdAt);
  const countRows = rows => detailed ? rows.reduce((count, row) => count + (row.items?.length ?? 0) + 1, 0) : rows.length;
  if (countRows(scopedSales) + countRows(scopedVoids) + scopedPayments.length + scopedContracts.length > MAX_EXPORT_ROWS) {
    throw new Error(`${detailed ? 'Demasiadas filas de detalle' : 'Demasiados movimientos'}. Selecciona un período menor.`);
  }
  const processed = detailed ? processSales(sales ?? [], branchesMap, scopedPayments, { ...scope, voids }, prepared, people)
    : processDailyStats(stats, scopedPayments, { ...scope, voids, sales }, prepared);
  const { model } = processed, view = reportViewModel(model, scopedContracts, scope, sessions, { branchesMap, people }), metrics = view.summary;
  const wb = XLSX.utils.book_new();
  const append = (name, rows, { currency = [], widths = [], style = 'default', title } = {}) => {
    const sheet = createSheet(XLSX, rows, widths, title);
    applyCurrencyToCols(sheet, currency);
    if (title) styleTotalRows(sheet, 2); else styleSummarySheet(sheet, style);
    XLSX.utils.book_append_sheet(wb, sheet, uniqueSheetName(name, wb.SheetNames));
    return sheet;
  };
  const summaryRows = [
    { Concepto: 'Filtro Seleccionado', Valor: ({ hoy: 'Diario Detallado', semana: 'Semanal Detallado', mes: 'Mensual Resumen', todo: 'Anual Resumen' })[period.filter] },
    { Concepto: 'Rango de Fechas', Valor: `${visibleDay(period.start)} al ${visibleDay(period.end)}` },
    { Concepto: 'Generado el', Valor: `${visibleDay(reportDay(now))} ${reportTime(now)}` },
    { Concepto: '💰 GRAN TOTAL INGRESOS NETOS', Valor: metrics.netRevenue },
    { Concepto: 'Cobros registrados', Valor: view.collections },
    { Concepto: 'Compensaciones y reembolsos contables', Valor: metrics.refunds },
    ...(view.warning ? [{ Concepto: 'Conciliación histórica pendiente', Valor: view.warning, _noteHeight: 60 }] : []),
    { Concepto: '🛒 VENTAS MOSTRADOR NETAS', Valor: metrics.posRevenue },
    { Concepto: ' ↳ Efectivo POS', Valor: metrics.posCash },
    { Concepto: ' ↳ Yape/Plin POS', Valor: metrics.posDigital },
    { Concepto: '🎂 INGRESOS NETOS PEDIDOS ESPECIALES', Valor: metrics.contractRevenue },
    { Concepto: ' ↳ Efectivo Pedidos', Valor: metrics.contractCash },
    { Concepto: ' ↳ Yape/Plin Pedidos', Valor: metrics.contractDigital },
    ...Object.entries(REPORT_CHANNELS).flatMap(([channel, channelLabel]) => CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) => ({
      Concepto: `${label} · ${channelLabel}`, Valor: metrics.channels[channel][key],
    }))),
    { Concepto: 'Ticket promedio POS', Valor: metrics.posAverageTicket },
    { Concepto: 'Tickets POS Registrados', Valor: metrics.posTicketCount, _count: true },
    { Concepto: 'Pagos de Pedidos Procesados', Valor: metrics.contractPaymentCount, _count: true },
    { Concepto: 'Tickets POS Anulados', Valor: metrics.voidedTicketCount, _count: true },
    { Concepto: 'Compensaciones POS y reembolsos contables (cantidad)', Valor: metrics.refundCount, _count: true },
    { Concepto: 'Cómo se calcula el neto por canal', Valor: 'Suma de cobros y contramovimientos con su signo, por fecha de registro.', _noteHeight: 32 },
    { Concepto: 'Neto negativo', Valor: CHANNEL_NEGATIVE_NOTE, _noteHeight: 60 },
    { Concepto: 'Alcance de las compensaciones POS', Valor: `${CHANNEL_EVIDENCE_NOTE} Los cierres operativos conservan conciliación pendiente.`, _noteHeight: 60 },
    { Concepto: 'Referencias y responsables', Valor: 'Cuando falta un número comercial, usa la fecha, sede y tipo de movimiento. Un nombre ausente se muestra como Empleado no identificado.', _noteHeight: 45 },
  ];
  const summary = append('Resumen_Financiero', summaryRows, { currency: ['B'], widths: [{ wch: 56 }, { wch: 60 }] });
  summaryRows.forEach(({ _count, _noteHeight }, index) => {
    const cell = summary[`B${index + 2}`];
    if (_count) cell.z = '0';
    if (_noteHeight) {
      cell.s = { ...cell.s, alignment: { ...cell.s?.alignment, wrapText: true, vertical: 'top' } };
      (summary['!rows'] ??= [])[index + 1] = { hpt: _noteHeight };
    }
  });
  if (scopedContracts.length) append('Estado_Pedidos', scopedContracts.map(contract => ({
    Pedido: orderReportNumber(contract), Cliente: reportLabel(contract.clientName, 'Cliente sin nombre', contract.id),
    Sede: branchReportName(branchesMap, contract.branchId), Estado: contract.status,
    'Total comercial (referencia)': contract.total, 'Neto abonado': contract.paidTotal ?? '', Saldo: contract.balance,
  })), { currency: ['E', 'F', 'G'], widths: [24, 30, 24, 24, 24, 20, 20].map(wch => ({ wch })) });
  const audit = buildContractLedgerReport(scopedPayments, contracts.filter(row => !businessId || row.businessId === businessId), branchesMap, people);
  if (audit.contractPaymentRows.length) append('Auditoría_Pedidos', audit.contractPaymentRows, {
    currency: ['F', 'G', 'I', 'K', 'O'], widths: [23, 22, 25, 22, 22, 20, 18, 18, 18, 18, 26, 22, 22, 28, 22, 24].map(wch => ({ wch })) });
  const cashRows = cashAuditRows(view.cashEvents);
  if (detailed && cashRows.length) append('Auditoría_Cajas', cashRows, { currency: ['F', 'G', 'H', 'I'], style: 'auditoria',
    widths: [30, 30, 22, 25, 32, 22, 25, 22, 20, 26, 64].map(wch => ({ wch })) });
  if (view.branches.length) append('Comparativa_Sedes', view.branches.map(branch => ({
    Sucursal: branch.name, 'Tickets POS': branch.posTicketCount, 'Pagos Pedidos': branch.contractPaymentCount,
    Anulados: branch.voidedTicketCount, 'Ingreso POS': branch.posRevenue, 'Ingreso Pedidos': branch.contractRevenue,
    'Ventas Sistema (S/)': branch.netRevenue, Efectivo: branch.cashRevenue, 'Yape/Plin': branch.digitalRevenue,
  })), { currency: ['E', 'F', 'G', 'H', 'I'], widths: [25, 14, 16, 14, 20, 20, 24, 20, 20].map(wch => ({ wch })) });
  if (model.products.length) {
    const globals = new Map();
    for (const product of model.products) {
      const previous = globals.get(product.id) ?? { Producto: reportLabel(product.name, 'Producto sin nombre', product.id), Cantidad: 0, Ingreso: 0 };
      globals.set(product.id, { ...previous, Cantidad: previous.Cantidad + product.qty, Ingreso: amount(previous.Ingreso + product.revenue) });
    }
    append('Productos_Global', [...globals.values()].sort((a, b) => b.Cantidad - a.Cantidad), { currency: ['C'], style: 'productos_global', widths: [38, 15, 20].map(wch => ({ wch })) });
    append('Productos_Sedes', model.products.map(product => ({ Producto: reportLabel(product.name, 'Producto sin nombre', product.id),
      Sucursal: branchReportName(branchesMap, product.branchId), Cantidad: product.qty, Ingreso: product.revenue })),
      { currency: ['D'], style: 'productos_detalle', widths: [38, 25, 15, 20].map(wch => ({ wch })) });
  }
  const byBranch = detailed ? processed.ticketsRowsByBranch : processed.dailyRowsByBranch;
  for (const [id, rows] of Object.entries(byBranch).sort(([a], [b]) => a.localeCompare(b))) {
    const name = branchReportName(branchesMap, id);
    append(`${detailed ? 'Detalle' : 'Resum'}_${name}`, rows, {
      currency: detailed ? ['H', 'I', 'K'] : ['D', 'E', 'F', 'G', 'H'],
      title: detailed ? `Detalle · ${name} · ${visibleDay(period.start)} a ${visibleDay(period.end)} (Lima)` : undefined,
      widths: (detailed ? DETAIL_HEADERS.map(header => ({ Fecha: 13, Hora: 9, Producto: 30, Observaciones: 40, Cantidad: 11 }[header] ?? 22))
        : [16, 16, 16, 20, 20, 20, 20, 20, 18]).map(wch => ({ wch })),
    });
  }
  return { workbook: wb, model, view };
}
