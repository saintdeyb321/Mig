import { processDailyStats, processSales, groupedTicketRows, DETAIL_HEADERS,
  ITEM_SUBTOTAL, MOVEMENT_AMOUNT, NET_REPORT_COLUMNS as labels } from '../../../utils/salesDataProcessor.js';
import { createOverviewSheet, createSheet, uniqueSheetName, paymentTone, cashStateTone } from '../../../utils/excelHelpers.js';
import { buildContractLedgerReport } from './contractLedgerReport.js';
import { cashAuditRows, verifiedCashDifference } from './cashAuditRows.js';
import { reportViewModel } from './reportViewModel.js';
import { cashReviewPresentation } from './managementReportHtml.js';
import { reportRows, amount, CHANNEL_BREAKDOWN_ROWS, CHANNEL_EVIDENCE_NOTE, CHANNEL_NEGATIVE_NOTE } from '../domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { branchReportName, orderReportNumber, reportLabel } from './reportNames.js';

export const MAX_EXPORT_ROWS = 10000;

const netNote = 'Total neto registrado = neto de ventas en mostrador + neto de pagos de pedidos. Incluye ajustes contables. Revisa el arqueo y los comprobantes para verificar caja y billeteras.';
const moneyColumns = new Set(['Precio unitario', ITEM_SUBTOTAL, MOVEMENT_AMOUNT, labels.total, labels.cash, labels.digital,
  labels.pos, labels.orders, labels.products, 'Total del pedido', 'Pagado', 'Saldo', 'Total Pedido (referencia)',
  'Neto Movimiento (S/)', 'Fondo inicial (S/)', 'Efectivo esperado (S/)', 'Yape/Plin registrado (S/)', 'Efectivo contado (S/)',
  'Diferencia (S/)', 'Diferencia de caja confirmada (S/)']);
const countColumns = new Set(['Cantidad', 'Unidades netas', labels.tickets, labels.voids]);
const movementTones = { 'VENTA POS': 'success', 'VENTA POS ANULADA': 'muted',
  'COMPENSACIÓN POS': 'muted', 'REEMBOLSO CONTABLE PEDIDO': 'danger',
  'ADELANTO PEDIDO': 'info', 'ABONO PEDIDO': 'info' };
const columnOptions = {
  Fecha: { width: 12, format: 'date', tone: 'info' }, Hora: { width: 9, format: 'time', tone: 'info' },
  Movimiento: { width: 23, tone: (value, row) => row.Estado === 'Anulada' ? 'muted' : movementTones[value] },
  Referencia: { width: 21, tone: 'info' },
  Producto: { width: 33, tone: 'product' }, Cantidad: { width: 10 }, 'Unidades netas': { width: 16 },
  'Precio unitario': { width: 16 }, [ITEM_SUBTOTAL]: { width: 16, tone: 'info' },
  'Medio de pago': { width: 25, tone: paymentTone },
  Observaciones: { width: 40 }, Observación: { width: 40 },
  Responsable: { width: 21 }, Cajero: { width: 21 }, 'Registrado por': { width: 21 },
  'Fecha Pago': { width: 23, format: 'datetime', tone: 'info' },
  Sucursal: { width: 20, tone: 'info' }, Sede: { width: 20, tone: 'info' },
  'Sede Origen': { width: 19 }, 'Sede Recojo': { width: 19 }, 'Sede Movimiento': { width: 19 },
  'N.º de pedido': { width: 25, tone: 'info' }, Pedido: { width: 25, tone: 'info' }, Cliente: { width: 30 },
  [labels.total]: { width: 19, tone: 'success' }, [labels.cash]: { width: 18, tone: 'cash' }, [labels.digital]: { width: 18, tone: 'digital' },
  [labels.pos]: { width: 23, tone: 'mixed' }, [labels.orders]: { width: 22, tone: 'product' },
  [labels.products]: { width: 20, tone: 'cash' },
  [labels.tickets]: { width: 11 },
  [MOVEMENT_AMOUNT]: { width: 18, tone: (_, row) => row.Estado === 'Anulada' ? 'muted' : movementTones[row.Movimiento] },
  'Neto Movimiento (S/)': { width: 17, tone: 'success' }, Pagado: { width: 16, tone: 'success' },
  Saldo: { width: 16, tone: value => value > 0 ? 'warning' : undefined },
  'Fondo inicial (S/)': { width: 14, tone: 'info' }, 'Efectivo esperado (S/)': { width: 17 },
  'Yape/Plin registrado (S/)': { width: 17, tone: 'digital' }, 'Efectivo contado (S/)': { width: 16, tone: value => typeof value === 'number' ? 'cash' : undefined },
  'Diferencia (S/)': { width: 16, colorNegative: false, format: row => row._verifiedDifference ? 'money' : 'provisionalMoney',
    tone: (value, row) => row._verifiedDifference ? cashStateTone(row.Estado)
    : typeof value === 'number' ? 'warning' : undefined },
  'Diferencia de caja confirmada (S/)': { width: 22, tone: value => value > 0 ? 'warning' : value === 0 ? 'success' : undefined },
  Estado: { width: 22, tone: value => cashStateTone(value) ?? ({ COMPLETADA: 'success', ANULADA: 'muted', 'ANULACIÓN REGISTRADA': 'muted',
    'ANULADA · POR REVISAR': 'muted', REGISTRADO: 'success', ENTREGADO: 'success', CANCELADO: 'danger', PENDIENTE: 'warning', 'ENTREGADO CON SALDO': 'warning' })[String(value).toUpperCase()] },
  Turno: { width: 18, tone: (_, row) => cashStateTone(row.Estado) },
  [labels.voids]: { tone: value => value > 0 ? 'danger' : undefined },
};
const schemaFor = (columns, omit) => Object.fromEntries(columns.filter(name => !name.startsWith('_') && !omit.includes(name)).map(name => [name, {
  width: countColumns.has(name) ? 16 : 24,
  format: moneyColumns.has(name) ? 'money' : countColumns.has(name) ? 'count' : undefined,
  ...columnOptions[name],
}]));

export function writeSalesWorkbook(XLSX, workbook) {
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  // xlsx-js-style does not serialize !freeze. Update only the generated sheet view.
  const archive = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  for (const [index, name] of workbook.SheetNames.entries()) {
    const pane = workbook.Sheets[name]['!freeze'];
    const file = XLSX.CFB.find(archive, `/xl/worksheets/sheet${index + 1}.xml`);
    if (!file?.content) throw new Error('No se pudo inmovilizar el encabezado del informe.');
    const xml = decoder.decode(new Uint8Array(file.content));
    const selection = pane ? `<pane ySplit="${pane.ySplit}" topLeftCell="${pane.topLeftCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${pane.topLeftCell}" sqref="${pane.topLeftCell}"/>` : '';
    const view = `<sheetView showGridLines="0" workbookViewId="0">${selection}</sheetView>`;
    const frozen = xml.replace(/<sheetView\b[^>]*\/>|<sheetView\b[^>]*>[\s\S]*?<\/sheetView>/, view);
    if (frozen === xml) throw new Error('No se pudo inmovilizar el encabezado del informe.');
    file.content = encoder.encode(frozen);
    file.size = file.content.length;
  }
  return XLSX.CFB.write(archive, { fileType: 'zip', type: 'array', compression: true });
}

const periodNames = { hoy: 'Hoy', semana: 'Semana', mes: 'Mes', todo: 'Año' };

function summarySheet(XLSX, view, { business, scopeName, dateRange, generatedAt, periodName }) {
  const metrics = view.summary;
  const { cash, digital } = metrics.channels;
  const review = cashReviewPresentation(view.cashEvents);
  const verified = view.cashEvents.filter(verifiedCashDifference);
  const differenceBySign = sign => verified.length ? amount(verified.reduce((sum, event) =>
    sum + (Math.sign(event.difference) === sign ? event.difference : 0), 0)) : 'Sin datos verificados';
  const row = (label, value, tone, format, extra) => ({ label, value, tone, format, ...extra });
  const space = { height: 9 };
  const note = (label, tone = 'ivory', height = 32) => ({ label, tone, height, note: true });
  return createOverviewSheet(XLSX, [
    row('RESUMEN DEL NEGOCIO', periodName, 'header', undefined, { height: 32, size: 14 }),
    ...(business ? [note(business, 'info', 26)] : []),
    row('Alcance', scopeName, 'info', undefined, { height: scopeName.length > 25 ? Math.min(92, 16 * Math.ceil(scopeName.length / 23)) : 24 }),
    row('Fechas', dateRange, 'info', undefined, { height: 28 }),
    row('Generado · hora de Lima', generatedAt, 'info', 'datetime'),
    space, row('INGRESO NETO REGISTRADO', metrics.netRevenue, 'success', 'money', { height: 32, size: 14, bold: true }),
    ...(view.warning ? [note(view.warning, 'warning', 46)] : []),
    space, row('VENTAS DE MOSTRADOR', metrics.posRevenue, 'mixed', 'money', { bold: true }),
    row('Efectivo', metrics.posCash, 'cash', 'money'),
    row('Yape / Plin', metrics.posDigital, 'digital', 'money'),
    space, row('PAGOS DE PEDIDOS', metrics.contractRevenue, 'product', 'money', { bold: true }),
    row('Efectivo', metrics.contractCash, 'cash', 'money'),
    row('Yape / Plin', metrics.contractDigital, 'digital', 'money'),
    space, row('TICKETS COMPLETADOS', metrics.posTicketCount, 'mixed', 'count', { bold: true }),
    row('PAGOS DE PEDIDOS · CANTIDAD', metrics.contractPaymentCount, 'product', 'count'),
    row('TICKETS ANULADOS', metrics.voidedTicketCount, metrics.voidedTicketCount ? 'danger' : 'ivory', 'count'),
    space, row('CAJAS QUE REQUIEREN REVISIÓN', review.totalCount, review.totalCount ? 'warning' : 'info', 'count', { bold: true }),
    row('Sobrante confirmado', differenceBySign(1), 'warning', 'money'),
    row('Faltante confirmado', differenceBySign(-1), differenceBySign(-1) < 0 ? 'danger' : 'ivory', 'money'),
    ...(metrics.refundCount ? [
      space, row('AJUSTES CONTABLES', metrics.refunds, 'warning', 'money', { bold: true, softNegative: true }),
      row('Anulaciones de mostrador', amount(cash.posCompensations + digital.posCompensations), 'ivory', 'money', { softNegative: true }),
      row('Reembolsos de pedidos', amount(cash.contractRefunds + digital.contractRefunds), 'ivory', 'money', { softNegative: true }),
    ] : []),
    space, note('El ingreso neto corresponde a movimientos registrados. Los fondos y las diferencias de caja se revisan por separado.'),
  ]);
}

function channelFooter(metrics, [title, cashColumn, digitalColumn]) {
  return [{ _kind: 'spacer' }, { [title]: 'Detalle por canal', [cashColumn]: 'Efectivo', [digitalColumn]: 'Yape / Plin', _kind: 'channel-heading' },
    ...CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) => ({ [title]: label, [cashColumn]: metrics.channels.cash[key], [digitalColumn]: metrics.channels.digital[key] })),
    { [title]: CHANNEL_EVIDENCE_NOTE, _kind: 'channel-note' }, { [title]: CHANNEL_NEGATIVE_NOTE, _kind: 'channel-note' }];
}

export function buildSalesWorkbook(XLSX, { stats = [], sales = null, payments = [], voids = [], contracts = [], sessions = [], branchesMap = {}, people, model: prepared, period,
  businessId, business, branchId = 'global', loadedAt, cashReferenceAsOf, detailed = ['hoy', 'semana'].includes(period.filter), now = new Date() }) {
  const scope = { businessId, branchId, period };
  const scopedSales = reportRows(sales ?? [], scope, row => row.createdAt);
  const scopedPayments = reportRows(payments, scope);
  const scopedVoids = [...new Map(reportRows(voids, scope).map(row => [row.id, row])).values()];
  const scopedContracts = reportRows(contracts.filter(contract => contract.createdAt != null), scope, row => row.createdAt);
  const countRows = rows => detailed ? rows.reduce((count, row) => count + Math.max(1, row.items?.length ?? 0), 0) : rows.length;
  if (countRows(scopedSales) + countRows(scopedVoids) + scopedPayments.length + scopedContracts.length > MAX_EXPORT_ROWS) {
    throw new Error(`${detailed ? 'Demasiadas filas de detalle' : 'Demasiados movimientos'}. Selecciona un período menor.`);
  }
  const processed = detailed ? processSales(sales ?? [], scopedPayments, { ...scope, voids }, prepared, people, contracts)
    : processDailyStats(stats, scopedPayments, { ...scope, voids, sales }, prepared);
  const { model } = processed, view = reportViewModel(model, scopedContracts, { ...scope, sales, payments, voids, loadedAt, cashReferenceAsOf }, sessions, { branchesMap, people });
  const wb = XLSX.utils.book_new();
  const range = visibleDay(period.start) + (period.start === period.end ? '' : ` a ${visibleDay(period.end)}`);
  const scopeName = branchId === 'global' ? 'Todas las sedes' : branchReportName(branchesMap, branchId);
  const generatedAt = `${visibleDay(reportDay(now))} ${reportTime(now)}`;
  const append = (name, rows, { omit = [], columns = Object.keys(rows[0]), location = scopeName, ...options }) => {
    const context = `${location} · ${range} · Generado ${generatedAt} (hora de Lima)`;
    const note = view.warning ? `${options.note} · Conciliación histórica pendiente.` : options.note;
    const sheet = createSheet(XLSX, rows, schemaFor(columns, omit), { ...options, context, note });
    XLSX.utils.book_append_sheet(wb, sheet, uniqueSheetName(name, wb.SheetNames));
  };
  XLSX.utils.book_append_sheet(wb, summarySheet(XLSX, view, { business, scopeName,
    dateRange: range, generatedAt, periodName: periodNames[period.filter] }), 'Resumen_Financiero');
  const cashRows = cashAuditRows(view.cashEvents);
  if (cashRows.length) append('Auditoría_Cajas', cashRows, { title: 'Auditoría de cajas',
    note: 'El fondo inicial no es ingreso. Las referencias y diferencias provisionales requieren revisión.' });
  const branchName = id => branchReportName(branchesMap, id);
  const ids = [...new Set([...Object.keys(branchesMap), ...model.branches.keys()])].sort((a, b) => branchName(a).localeCompare(branchName(b), 'es') || a.localeCompare(b));
  const compareBranches = branchId === 'global' && ids.length > 1;
  if (compareBranches) {
    const differences = new Map();
    for (const event of view.cashEvents.filter(verifiedCashDifference)) {
      differences.set(event.branchId, amount((differences.get(event.branchId) ?? 0) + event.difference));
    }
    const comparison = (name, metrics) => ({ Sede: name, [labels.tickets]: metrics?.posTicketCount ?? 0,
      [labels.pos]: metrics?.posRevenue ?? 0, [labels.orders]: metrics?.contractRevenue ?? 0, [labels.total]: metrics?.netRevenue ?? 0 });
    append('Comparativa_Sedes', ids.map(id => ({ ...comparison(branchName(id), model.branches.get(id)),
      ...(differences.size ? { 'Diferencia de caja confirmada (S/)': differences.get(id) ?? 'Sin arqueo' } : {}) })), {
      title: 'Comparativa de sedes', note: 'Ingreso neto por sede. Las diferencias de caja confirmadas se muestran por separado.',
      footer: [{ _kind: 'spacer' }, { ...comparison('TOTAL NEGOCIO', model.summary), _kind: 'business-total' }],
    });
  }
  if (model.products.length) {
    const byProduct = new Map(), byBranch = new Map();
    const productRow = product => ({ Producto: reportLabel(product.name, 'Producto sin nombre', product.id),
      'Unidades netas': product.qty, [labels.products]: product.revenue });
    const rank = (a, b) => b['Unidades netas'] - a['Unidades netas'] || b[labels.products] - a[labels.products] || a.Producto.localeCompare(b.Producto, 'es');
    for (const product of model.products) {
      const row = productRow(product), previous = byProduct.get(product.id);
      if (previous) {
        previous['Unidades netas'] += row['Unidades netas'];
        previous[labels.products] = amount(previous[labels.products] + row[labels.products]);
      } else byProduct.set(product.id, { ...row });
      if (!byBranch.has(product.branchId)) byBranch.set(product.branchId, []);
      byBranch.get(product.branchId).push(row);
    }
    append('Productos_Global', [...byProduct.values()].sort(rank),
      { title: 'Productos de mostrador', note: 'Unidades e importes netos después de las anulaciones.', filter: false });
    if (compareBranches) {
      const rows = [];
      for (const id of ids) {
        const products = byBranch.get(id);
        if (!products?.length) continue;
        if (rows.length && model.products.length + byBranch.size - 1 <= MAX_EXPORT_ROWS) rows.push({ _kind: 'spacer' });
        products.sort(rank).forEach((row, index) => rows.push({ Producto: row.Producto, Sucursal: index ? '' : branchName(id),
          'Unidades netas': row['Unidades netas'], [labels.products]: row[labels.products] }));
      }
      append('Productos_Sedes', rows, { title: 'Productos por sede', note: 'Cada bloque muestra las unidades y los importes netos de una sede.', filter: false });
    }
  }
  const byBranch = detailed ? processed.groupsByBranch : processed.dailyRowsByBranch;
  for (const id of ids.filter(id => Object.hasOwn(byBranch, id))) {
    const name = branchName(id), rows = detailed ? groupedTicketRows(byBranch[id], MAX_EXPORT_ROWS) : byBranch[id];
    append(`${detailed ? 'Detalle' : 'Resum'}_${name}`, rows, {
      ...(detailed && { columns: DETAIL_HEADERS, filter: false }),
      location: name, title: `${detailed ? 'Detalle' : 'Resumen'} · ${name} · ${range}`,
      note: detailed ? 'Suma solo Importe neto movimiento. Los subtotales y totales de ticket son de lectura.' : netNote,
      footer: channelFooter(model.branches.get(id), detailed ? ['Producto', 'Precio unitario', ITEM_SUBTOTAL] : [labels.pos, labels.cash, labels.digital]),
    });
  }
  if (scopedContracts.length) append('Estado_Pedidos', scopedContracts.map(contract => ({
    Pedido: orderReportNumber(contract), Cliente: reportLabel(contract.clientName, 'Cliente sin nombre', contract.id),
    Sede: branchName(contract.branchId), Estado: ({ pendiente: 'Pendiente', entregado: 'Entregado', cancelado: 'Cancelado',
      entregado_con_deuda: 'Entregado con saldo' })[contract.status] ?? contract.status,
    'Total del pedido': contract.total, Pagado: contract.paidTotal ?? '', Saldo: contract.balance,
  })), { omit: branchId === 'global' ? [] : ['Sede'], title: 'Estado de pedidos', note: 'Total de referencia, cobros netos y saldos de los pedidos del período.' });
  const audit = buildContractLedgerReport(scopedPayments, contracts.filter(row => !businessId || row.businessId === businessId), branchesMap, people);
  if (audit.contractPaymentRows.length) append('Auditoría_Pedidos', audit.contractPaymentRows.map(row => {
    const advance = row['Adelanto (S/)'] > 0, refund = row['Reembolso contable (S/)'] < 0;
    return { 'Fecha Pago': row['Fecha Pago'], 'N.º de pedido': row['N.º de pedido'], Cliente: row.Cliente,
      Movimiento: refund ? 'REEMBOLSO CONTABLE PEDIDO' : advance ? 'ADELANTO PEDIDO' : 'ABONO PEDIDO',
      'Medio de pago': refund ? row['Mét. del reembolso contable'] : advance ? row['Mét. Adelanto'] : row['Mét. Abono'],
      'Neto Movimiento (S/)': row['Neto Movimiento (S/)'], 'Registrado por': row['Registrado por'], Estado: row.Estado,
      'Total Pedido (referencia)': row['Total Pedido (referencia)'], 'Sede Movimiento': row['Sede Movimiento'],
      'Sede Origen': row['Sede Origen'], 'Sede Recojo': row['Sede Recojo'] };
  }), { omit: branchId === 'global' ? [] : ['Sede Movimiento'], title: 'Movimientos de pedidos',
    note: 'Suma solo Neto Movimiento. El total comercial es una referencia y el reembolso contable requiere verificar el desembolso.' });
  return { workbook: wb, model, view };
}
