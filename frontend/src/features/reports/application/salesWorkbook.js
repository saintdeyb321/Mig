import { processDailyStats, processSales, netReportRow, NET_REPORT_COLUMNS as labels } from '../../../utils/salesDataProcessor.js';
import { createSheet, uniqueSheetName, paymentTone, cashStateTone } from '../../../utils/excelHelpers.js';
import { buildContractLedgerReport } from './contractLedgerReport.js';
import { cashAuditRows } from './cashAuditRows.js';
import { reportViewModel } from './reportViewModel.js';
import { reportRows, amount, CHANNEL_BREAKDOWN_ROWS, CHANNEL_EVIDENCE_NOTE, CHANNEL_NEGATIVE_NOTE, REPORT_CHANNELS } from '../domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { branchReportName, orderReportNumber, reportLabel } from './reportNames.js';

export const MAX_EXPORT_ROWS = 10000;

const netNote = 'Total neto registrado = neto de ventas en mostrador + neto de pagos de pedidos. Los netos incluyen ajustes contables. Consulta el arqueo y tus comprobantes para verificar caja y billeteras.';
const moneyColumns = new Set(['Precio unitario', 'Subtotal producto', 'Importe movimiento (S/)', labels.total, labels.cash, labels.digital,
  labels.pos, labels.orders, labels.products, 'Total comercial (referencia)', 'Neto abonado', 'Saldo', 'Total Pedido (referencia)',
  'Adelanto (S/)', 'Abono (S/)', 'Reembolso contable (S/)', 'Neto Movimiento (S/)', 'Fondo inicial (S/)',
  'Referencia calculada (S/)', 'Efectivo declarado (S/)', 'Diferencia (S/)']);
const countColumns = new Set(['Cantidad', labels.tickets, labels.voids, labels.payments]);
const movementTones = { 'VENTA POS': 'success', 'DETALLE TICKET': 'info', 'VENTA POS ANULADA': 'muted', 'DETALLE TICKET ANULADO': 'muted',
  'COMPENSACIÓN POS': 'danger', 'DETALLE COMPENSACIÓN': 'danger', 'REEMBOLSO CONTABLE PEDIDO': 'danger',
  'ADELANTO PEDIDO': 'info', 'ABONO PEDIDO': 'info' };
const columnOptions = {
  Concepto: { width: 56, tone: (_, row) => row._tone },
  Valor: { width: 64, format: row => row._count ? 'count' : 'money', tone: (_, row) => row._tone },
  Fecha: { width: 14, format: 'date', tone: 'info' }, Hora: { width: 10, format: 'time' },
  Movimiento: { width: 29, tone: value => movementTones[value] },
  Referencia: { width: 25, tone: 'info' }, 'Producto / concepto': { width: 38, tone: 'product' },
  Producto: { width: 38, tone: 'product' }, Cantidad: { width: 12 },
  'Medio de pago': { width: 35, tone: paymentTone },
  'Mét. Adelanto': { width: 38, tone: paymentTone }, 'Mét. Abono': { width: 38, tone: paymentTone },
  'Mét. del reembolso contable': { width: 44, tone: paymentTone },
  Observaciones: { width: 56 }, Observación: { width: 64 },
  Responsable: { width: 28 }, 'Registrado por': { width: 28 },
  'Fecha Pago': { width: 23, format: 'datetime', tone: 'info' },
  'Fecha y hora del movimiento': { width: 25, format: 'datetime', tone: 'info' },
  Sucursal: { width: 26, tone: 'info' }, Sede: { width: 26, tone: 'info' },
  'Sede Origen': { width: 26, tone: 'info' }, 'Sede Recojo': { width: 26, tone: 'info' }, 'Sede Movimiento': { width: 26, tone: 'info' },
  'N.º de pedido': { width: 25, tone: 'info' }, Pedido: { width: 25, tone: 'info' }, Cliente: { width: 30 },
  [labels.total]: { width: 25, tone: 'success' }, [labels.cash]: { tone: 'cash' }, [labels.digital]: { tone: 'digital' },
  [labels.pos]: { width: 28 }, [labels.orders]: { width: 28 }, [labels.products]: { width: 28 },
  [labels.tickets]: { width: 19 }, [labels.payments]: { width: 22 },
  'Importe movimiento (S/)': { width: 26, tone: (_, row) => movementTones[row.Movimiento] },
  Estado: { width: 28, tone: value => cashStateTone(value) ?? ({ ENTREGADO: 'success', CANCELADO: 'danger', PENDIENTE: 'warning', ENTREGADO_CON_DEUDA: 'warning' })[String(value).toUpperCase()] },
  Turno: { width: 30, tone: (_, row) => cashStateTone(row.Estado) },
  [labels.voids]: { tone: value => value > 0 ? 'danger' : undefined },
};
const schemaFor = (rows, omit) => Object.fromEntries(Object.keys(rows[0] ?? {}).filter(name => !name.startsWith('_') && !omit.includes(name)).map(name => [name, {
  width: countColumns.has(name) ? 16 : 24,
  format: moneyColumns.has(name) ? 'money' : countColumns.has(name) ? 'count' : undefined,
  ...columnOptions[name],
}]));

export function writeSalesWorkbook(XLSX, workbook) {
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  // xlsx-js-style does not serialize !freeze. Update only the generated sheet view.
  const archive = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  for (const [index, name] of workbook.SheetNames.entries()) {
    const pane = workbook.Sheets[name]['!freeze'];
    if (!pane) continue;
    const file = XLSX.CFB.find(archive, `/xl/worksheets/sheet${index + 1}.xml`);
    if (!file?.content) throw new Error('No se pudo inmovilizar el encabezado del informe.');
    const xml = decoder.decode(new Uint8Array(file.content));
    const view = `<sheetView workbookViewId="0"><pane ySplit="${pane.ySplit}" topLeftCell="${pane.topLeftCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${pane.topLeftCell}" sqref="${pane.topLeftCell}"/></sheetView>`;
    const frozen = xml.replace(/<sheetView\b[^>]*\/>|<sheetView\b[^>]*>[\s\S]*?<\/sheetView>/, view);
    if (frozen === xml) throw new Error('No se pudo inmovilizar el encabezado del informe.');
    file.content = encoder.encode(frozen);
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
  const countRows = rows => detailed ? rows.reduce((count, row) => count + Math.max(1, row.items?.length ?? 0), 0) : rows.length;
  if (countRows(scopedSales) + countRows(scopedVoids) + scopedPayments.length + scopedContracts.length > MAX_EXPORT_ROWS) {
    throw new Error(`${detailed ? 'Demasiadas filas de detalle' : 'Demasiados movimientos'}. Selecciona un período menor.`);
  }
  const processed = detailed ? processSales(sales ?? [], branchesMap, scopedPayments, { ...scope, voids }, prepared, people, contracts)
    : processDailyStats(stats, scopedPayments, { ...scope, voids, sales }, prepared);
  const { model } = processed, view = reportViewModel(model, scopedContracts, scope, sessions, { branchesMap, people }), metrics = view.summary;
  const wb = XLSX.utils.book_new();
  const append = (name, rows, { omit = [], ...options } = {}) => {
    const sheet = createSheet(XLSX, rows, schemaFor(rows, omit), options);
    XLSX.utils.book_append_sheet(wb, sheet, uniqueSheetName(name, wb.SheetNames));
  };
  const summaryRows = [
    { Concepto: 'Filtro Seleccionado', Valor: ({ hoy: 'Diario Detallado', semana: 'Semanal Detallado', mes: 'Mensual Resumen', todo: 'Anual Resumen' })[period.filter] },
    { Concepto: 'Alcance', Valor: branchId === 'global' ? 'Todas las sucursales' : branchReportName(branchesMap, branchId) },
    { Concepto: 'Rango de Fechas', Valor: `${visibleDay(period.start)} al ${visibleDay(period.end)}` },
    { Concepto: 'Generado el', Valor: `${visibleDay(reportDay(now))} ${reportTime(now)}` },
    { Concepto: labels.total, Valor: metrics.netRevenue, _tone: 'success' },
    { Concepto: 'Cobros registrados', Valor: view.collections },
    { Concepto: 'Compensaciones y reembolsos contables', Valor: metrics.refunds },
    ...(view.warning ? [{ Concepto: 'Conciliación histórica pendiente', Valor: view.warning, _noteHeight: 60, _tone: 'warning' }] : []),
    { Concepto: labels.pos, Valor: metrics.posRevenue },
    { Concepto: 'Neto de mostrador en efectivo', Valor: metrics.posCash },
    { Concepto: 'Neto de mostrador por Yape/Plin', Valor: metrics.posDigital },
    { Concepto: labels.orders, Valor: metrics.contractRevenue },
    { Concepto: 'Neto de pedidos en efectivo', Valor: metrics.contractCash },
    { Concepto: 'Neto de pedidos por Yape/Plin', Valor: metrics.contractDigital },
    ...Object.entries(REPORT_CHANNELS).flatMap(([channel, channelLabel]) => CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) => ({
      Concepto: key === 'net' ? labels[channel] : `${label} · ${channelLabel}`, Valor: metrics.channels[channel][key],
    }))),
    { Concepto: 'Ticket promedio POS', Valor: metrics.posAverageTicket },
    { Concepto: labels.tickets, Valor: metrics.posTicketCount, _count: true },
    { Concepto: labels.payments, Valor: metrics.contractPaymentCount, _count: true },
    { Concepto: labels.voids, Valor: metrics.voidedTicketCount, _count: true },
    { Concepto: 'Compensaciones POS y reembolsos contables (cantidad)', Valor: metrics.refundCount, _count: true },
    { Concepto: 'Cómo leer el total neto', Valor: `${netNote} El informe registra movimientos. La utilidad requiere considerar los costos.`, _noteHeight: 65 },
    { Concepto: 'Neto negativo', Valor: CHANNEL_NEGATIVE_NOTE, _noteHeight: 60 },
    { Concepto: 'Alcance de las compensaciones POS', Valor: `${CHANNEL_EVIDENCE_NOTE} Los cierres operativos conservan conciliación pendiente.`, _noteHeight: 60 },
    { Concepto: 'Referencias y responsables', Valor: 'Cuando falta un número comercial, usa la fecha, sede y tipo de movimiento. Un nombre ausente se muestra como Empleado no identificado.', _noteHeight: 45 },
    { Concepto: 'Cómo leer el detalle', Valor: 'Importe movimiento registra el cobro o contramovimiento una sola vez. Subtotal producto describe los artículos y se excluye de la suma financiera.', _noteHeight: 45 },
    { Concepto: 'Cómo leer la auditoría de pedidos', Valor: 'Total Pedido es una referencia comercial. Neto Movimiento ya incluye el adelanto, abono o reembolso de la fila.', _noteHeight: 45 },
  ];
  append('Resumen_Financiero', summaryRows);
  if (scopedContracts.length) append('Estado_Pedidos', scopedContracts.map(contract => ({
    Pedido: orderReportNumber(contract), Cliente: reportLabel(contract.clientName, 'Cliente sin nombre', contract.id),
    Sede: branchReportName(branchesMap, contract.branchId), Estado: contract.status,
    'Total comercial (referencia)': contract.total, 'Neto abonado': contract.paidTotal ?? '', Saldo: contract.balance,
  })), { omit: branchId === 'global' ? [] : ['Sede'] });
  const audit = buildContractLedgerReport(scopedPayments, contracts.filter(row => !businessId || row.businessId === businessId), branchesMap, people);
  if (audit.contractPaymentRows.length) append('Auditoría_Pedidos', audit.contractPaymentRows,
    { omit: branchId === 'global' ? [] : ['Sede Movimiento'] });
  const cashRows = cashAuditRows(view.cashEvents);
  if (detailed && cashRows.length) append('Auditoría_Cajas', cashRows, { omit: branchId === 'global' ? [] : ['Sede'] });
  const compareBranches = branchId === 'global' && view.branches.length > 1;
  if (compareBranches) append('Comparativa_Sedes', view.branches.map(branch => ({ Sucursal: branch.name, ...netReportRow(branch) })));
  if (model.products.length) {
    const globals = new Map();
    for (const product of model.products) {
      const previous = globals.get(product.id) ?? { Producto: reportLabel(product.name, 'Producto sin nombre', product.id), Cantidad: 0, [labels.products]: 0 };
      globals.set(product.id, { ...previous, Cantidad: previous.Cantidad + product.qty, [labels.products]: amount(previous[labels.products] + product.revenue) });
    }
    append('Productos_Global', [...globals.values()].sort((a, b) => b.Cantidad - a.Cantidad));
    if (compareBranches) append('Productos_Sedes', model.products.map(product => ({ Producto: reportLabel(product.name, 'Producto sin nombre', product.id),
      Sucursal: branchReportName(branchesMap, product.branchId), Cantidad: product.qty, [labels.products]: product.revenue })));
  }
  const byBranch = detailed ? processed.ticketsRowsByBranch : processed.dailyRowsByBranch;
  for (const [id, rows] of Object.entries(byBranch).sort(([a], [b]) => a.localeCompare(b))) {
    const name = branchReportName(branchesMap, id);
    append(`${detailed ? 'Detalle' : 'Resum'}_${name}`, rows, {
      title: `${detailed ? 'Detalle' : 'Resumen'} · ${name} · ${visibleDay(period.start)}${period.start === period.end ? '' : ` a ${visibleDay(period.end)}`}`,
      note: detailed ? 'Importe movimiento se suma una vez por operación. Subtotal producto es informativo.' : netNote,
    });
  }
  return { workbook: wb, model, view };
}
