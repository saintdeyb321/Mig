import { processDailyStats, processSales, groupedTicketRows, DETAIL_HEADERS, netReportRow,
  ITEM_SUBTOTAL, MOVEMENT_AMOUNT, NET_REPORT_COLUMNS as labels } from '../../../utils/salesDataProcessor.js';
import { createOverviewSheet, createSheet, uniqueSheetName, paymentTone, cashStateTone } from '../../../utils/excelHelpers.js';
import { buildContractLedgerReport } from './contractLedgerReport.js';
import { cashAuditRows, verifiedCashDifference } from './cashAuditRows.js';
import { reportViewModel } from './reportViewModel.js';
import { cashReviewPresentation } from './managementReportHtml.js';
import { reportRows, amount, CHANNEL_BREAKDOWN_ROWS, CHANNEL_EVIDENCE_NOTE, CHANNEL_NEGATIVE_NOTE } from '../domain/reportTotals.js';
import { visibleDay } from '../domain/reportPeriod.js';
import { branchReportName, orderReportNumber, reportLabel } from './reportNames.js';

export const MAX_EXPORT_ROWS = 10000;

const productQuantity = 'Cantidad vendida';
const productSales = 'Ventas (S/)';
const moneyColumns = new Set(['Precio unitario', ITEM_SUBTOTAL, MOVEMENT_AMOUNT, labels.total, labels.cash, labels.digital,
  labels.pos, labels.orders, productSales, 'Total del pedido', 'Pagado', 'Saldo', 'Total Pedido (referencia)',
  'Neto Movimiento (S/)', 'Fondo inicial (S/)', 'Efectivo esperado (S/)', 'Yape/Plin registrado (S/)', 'Efectivo contado (S/)',
  'Diferencia (S/)', 'Diferencia de caja confirmada (S/)']);
const countColumns = new Set(['Cantidad', productQuantity, labels.tickets, labels.voids]);
const movementTones = { 'VENTA POS': 'success', 'VENTA POS ANULADA': 'muted',
  'COMPENSACIÓN POS': 'muted', 'REEMBOLSO CONTABLE PEDIDO': 'danger',
  'ADELANTO PEDIDO': 'info', 'ABONO PEDIDO': 'info' };
const voidedTicket = row => row.Movimiento === 'VENTA POS' && row.Estado === 'ANULADO';
const columnOptions = {
  Fecha: { width: 12, format: 'date', tone: 'info' }, Hora: { width: 10, format: row => row?._timeWithSeconds ? 'timeSeconds' : 'time', tone: 'info' },
  Movimiento: { width: 21, tone: (value, row) => voidedTicket(row) ? 'muted' : movementTones[value] },
  Referencia: { width: 18, tone: 'info' },
  Producto: { width: 33, tone: 'product' }, Cantidad: { width: 10, tone: 'value' }, [productQuantity]: { width: 16, tone: 'value' },
  'Precio unitario': { width: 14, tone: 'value' }, [ITEM_SUBTOTAL]: { width: 15, tone: 'value' },
  'Medio de pago': { width: 24, tone: paymentTone },
  Observaciones: { width: 34 }, Observación: { width: 34 },
  Responsable: { width: 19 }, Cajero: { width: 19 }, 'Registrado por': { width: 19 },
  'Fecha Pago': { width: 23, format: 'datetime', tone: 'info' },
  Sucursal: { width: 20, tone: 'info' }, Sede: { width: 20, tone: 'info' },
  'Sede Origen': { width: 19 }, 'Sede Recojo': { width: 19 }, 'Sede Movimiento': { width: 19 },
  'N.º de pedido': { width: 25, tone: 'info' }, Pedido: { width: 25, tone: 'info' }, Cliente: { width: 30 },
  [labels.total]: { width: 19, tone: 'success' }, [labels.cash]: { width: 18, tone: 'cash' }, [labels.digital]: { width: 18, tone: 'digital' },
  [labels.pos]: { width: 23, tone: 'mixed' }, [labels.orders]: { width: 22, tone: 'product' },
  [productSales]: { width: 18, tone: 'value' },
  [labels.tickets]: { width: 11 },
  [MOVEMENT_AMOUNT]: { width: 18, tone: (_, row) => voidedTicket(row) ? 'muted' : 'value' },
  'Neto Movimiento (S/)': { width: 17, tone: 'success' }, Pagado: { width: 16, tone: 'success' },
  Saldo: { width: 16, tone: value => value > 0 ? 'warning' : undefined },
  'Fondo inicial (S/)': { width: 14, tone: 'info' }, 'Efectivo esperado (S/)': { width: 17 },
  'Yape/Plin registrado (S/)': { width: 17, tone: 'digital' }, 'Efectivo contado (S/)': { width: 16, tone: value => typeof value === 'number' ? 'cash' : undefined },
  'Diferencia (S/)': { width: 16, colorNegative: false, format: row => row._verifiedDifference ? 'money' : 'provisionalMoney',
    tone: (value, row) => row._verifiedDifference ? cashStateTone(row.Estado)
    : typeof value === 'number' ? value < 0 ? 'danger' : 'warning' : undefined },
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
    const view = `<sheetView showGridLines="1" workbookViewId="0">${selection}</sheetView>`;
    const frozen = xml.replace(/<sheetView\b[^>]*\/>|<sheetView\b[^>]*>[\s\S]*?<\/sheetView>/, view);
    if (frozen === xml) throw new Error('No se pudo inmovilizar el encabezado del informe.');
    file.content = encoder.encode(frozen);
    file.size = file.content.length;
  }
  return XLSX.CFB.write(archive, { fileType: 'zip', type: 'array', compression: true });
}

const periodNames = { hoy: 'Hoy', semana: 'Semana', mes: 'Mes', todo: 'Año' };

function summarySheet(XLSX, view, { business, scopeName, dateRange, periodName, showChannelEvidence, hasNegativeChannel }) {
  const metrics = view.summary;
  const { cash, digital } = metrics.channels;
  const review = cashReviewPresentation(view.cashEvents);
  const verified = view.cashEvents.filter(verifiedCashDifference);
  const differenceBySign = sign => verified.length ? amount(verified.reduce((sum, event) =>
    sum + (Math.sign(event.difference) === sign ? event.difference : 0), 0)) : 'Sin datos verificados';
  const row = (label, value, tone, format, extra) => ({ label, value, tone, format, ...extra });
  const space = { height: 9 };
  const note = (label, tone, height = 30) => ({ label, tone, height, note: true });
  return createOverviewSheet(XLSX, [
    row('RESUMEN DEL NEGOCIO', undefined, 'header', undefined, { height: 25, size: 11, note: true }),
    ...(business ? [note(`Negocio: ${business}`, 'info', 22)] : []),
    row('Sedes:', scopeName, 'info'),
    row('Período:', `${periodName} · ${dateRange}`, 'info', undefined, { height: 22 }),
    space, row('INGRESO NETO REGISTRADO', metrics.netRevenue, 'success', 'money', { height: 23, size: 11, bold: true }),
    ...(view.warning ? [note(view.warning, 'warning', 36)] : []),
    space, row('VENTAS DE MOSTRADOR', metrics.posRevenue, 'mixed', 'money', { bold: true }),
    row('Efectivo', metrics.posCash, 'cash', 'money'),
    row('Yape / Plin', metrics.posDigital, 'digital', 'money'),
    space, row('PAGOS DE PEDIDOS', metrics.contractRevenue, 'product', 'money', { bold: true }),
    row('Efectivo', metrics.contractCash, 'cash', 'money'),
    row('Yape / Plin', metrics.contractDigital, 'digital', 'money'),
    space, row('TICKETS COMPLETADOS', metrics.posTicketCount, 'mixed', 'count', { bold: true }),
    row('PAGOS DE PEDIDOS · CANTIDAD', metrics.contractPaymentCount, 'product', 'count'),
    row('TICKETS ANULADOS', metrics.voidedTicketCount, metrics.voidedTicketCount ? 'danger' : 'ivory', 'count'),
    ...(view.cashEvents.length ? [
      space, row('CAJAS QUE REQUIEREN REVISIÓN', review.totalCount, review.totalCount ? 'warning' : 'info', 'count', { bold: true }),
      row('Sobrante confirmado', differenceBySign(1), differenceBySign(1) > 0 ? 'warning' : undefined, 'money'),
      row('Faltante confirmado', differenceBySign(-1), differenceBySign(-1) < 0 ? 'danger' : undefined, 'money'),
      note('Fondo inicial y diferencias de caja van aparte.', undefined, 20),
    ] : []),
    ...(metrics.refundCount ? [
      space, row('AJUSTES CONTABLES', metrics.refunds, 'warning', 'money', { bold: true, softNegative: true }),
      row('Anulaciones de mostrador', amount(cash.posCompensations + digital.posCompensations), 'ivory', 'money', { softNegative: true }),
      row('Reembolsos de pedidos', amount(cash.contractRefunds + digital.contractRefunds), 'ivory', 'money', { softNegative: true }),
    ] : []),
    ...(showChannelEvidence ? [space, note(CHANNEL_EVIDENCE_NOTE)] : []),
    ...(hasNegativeChannel ? [note(CHANNEL_NEGATIVE_NOTE, 'warning', 36)] : []),
  ]);
}

function channelFooter(metrics, [title, cashColumn, digitalColumn]) {
  return [{ _kind: 'spacer' }, { [title]: 'Detalle por canal', [cashColumn]: 'Efectivo', [digitalColumn]: 'Yape / Plin', _kind: 'channel-heading' },
    ...CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) => ({ [title]: label, [cashColumn]: metrics.channels.cash[key], [digitalColumn]: metrics.channels.digital[key] }))];
}

function posFooter(metrics) {
  return [{ _kind: 'spacer' },
    { Producto: 'Resumen POS de la sede', 'Precio unitario': 'Efectivo', [ITEM_SUBTOTAL]: 'Yape / Plin', [MOVEMENT_AMOUNT]: 'Total POS', _kind: 'channel-heading' },
    { Producto: 'Neto POS', 'Precio unitario': metrics.posCash, [ITEM_SUBTOTAL]: metrics.posDigital, [MOVEMENT_AMOUNT]: metrics.posRevenue, _kind: 'business-total' }];
}

function orderAuditRows(payments) {
  const groups = new Map();
  // The ledger is already ordered by the original payment timestamp and ID.
  for (const row of payments) {
    const key = row._orderKey[1] ? JSON.stringify(row._orderKey) : Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  if (payments.length + groups.size - 1 > MAX_EXPORT_ROWS) {
    throw new Error('Demasiadas filas de auditoría de pedidos al incluir separadores. Selecciona un período menor.');
  }
  return [...groups.values()].flatMap((group, index) => [
    ...(index ? [{ _kind: 'group-spacer' }] : []),
    ...group.map(row => {
      const advance = row['Adelanto (S/)'] > 0, refund = row['Reembolso contable (S/)'] < 0;
      return { 'Fecha Pago': row['Fecha Pago'], 'N.º de pedido': row['N.º de pedido'], Cliente: row.Cliente,
        Movimiento: refund ? 'REEMBOLSO CONTABLE PEDIDO' : advance ? 'ADELANTO PEDIDO' : 'ABONO PEDIDO',
        'Medio de pago': refund ? row['Mét. del reembolso contable'] : advance ? row['Mét. Adelanto'] : row['Mét. Abono'],
        'Neto Movimiento (S/)': row['Neto Movimiento (S/)'], 'Registrado por': row['Registrado por'], Estado: row.Estado,
        'Total Pedido (referencia)': row['Total Pedido (referencia)'], 'Sede Movimiento': row['Sede Movimiento'],
        'Sede Origen': row['Sede Origen'], 'Sede Recojo': row['Sede Recojo'] };
    }),
  ]);
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
  const processed = detailed ? processSales(sales ?? [], scopedPayments, { ...scope, voids }, prepared, people)
    : processDailyStats(stats, scopedPayments, { ...scope, voids, sales }, prepared);
  const { model } = processed, view = reportViewModel(model, scopedContracts, { ...scope, sales, payments, voids, loadedAt, cashReferenceAsOf }, sessions, { branchesMap, people });
  const wb = XLSX.utils.book_new();
  const firstDay = visibleDay(period.start), lastDay = visibleDay(period.end);
  const range = firstDay === lastDay ? firstDay : `${firstDay} – ${lastDay}`;
  const scopeName = branchId === 'global' ? 'Todas las sedes' : branchReportName(branchesMap, branchId);
  const periodName = periodNames[period.filter];
  wb.Props = { Title: 'Informe de ventas', Subject: `${periodName} · ${range}`, CreatedDate: now };
  const append = (name, rows, { omit = [], columns = Object.keys(rows[0]), ...options } = {}) => {
    const schema = schemaFor(columns, omit);
    if (name.startsWith('Detalle_')) schema.Estado = { ...schema.Estado, width: 14,
      tone: value => ['ANULADO', 'ANULADO · POR REVISAR'].includes(value) ? 'danger' : columnOptions.Estado.tone(value) };
    const sheet = createSheet(XLSX, rows, schema, options);
    XLSX.utils.book_append_sheet(wb, sheet, uniqueSheetName(name, wb.SheetNames));
  };
  XLSX.utils.book_append_sheet(wb, summarySheet(XLSX, view, { business, scopeName, dateRange: range, periodName,
    showChannelEvidence: model.branches.size > 0,
    hasNegativeChannel: [...model.branches.values()].some(({ channels }) => channels.cash.net < 0 || channels.digital.net < 0),
  }), 'Resumen_Financiero');
  const cashRows = cashAuditRows(view.cashEvents);
  if (cashRows.length) append('Auditoría_Cajas', cashRows, { filter: false });
  const branchName = id => branchReportName(branchesMap, id);
  const compareBranchNames = (a, b) => branchName(a).localeCompare(branchName(b), 'es') || a.localeCompare(b);
  const ids = [...new Set([...Object.keys(branchesMap), ...model.branches.keys()])].sort(compareBranchNames);
  const compareBranches = branchId === 'global' && ids.length > 1;
  if (branchId === 'global' && ids.length) {
    const differences = new Map();
    for (const event of view.cashEvents.filter(verifiedCashDifference)) {
      differences.set(event.branchId, amount((differences.get(event.branchId) ?? 0) + event.difference));
    }
    const comparison = (name, metrics) => ({ Sede: name, [labels.tickets]: metrics?.posTicketCount ?? 0,
      [labels.pos]: metrics?.posRevenue ?? 0, [labels.orders]: metrics?.contractRevenue ?? 0, [labels.total]: metrics?.netRevenue ?? 0 });
    const netRevenue = id => model.branches.get(id)?.netRevenue ?? 0;
    const rankedIds = [...ids].sort((a, b) => netRevenue(b) - netRevenue(a) || compareBranchNames(a, b));
    append('Comparativa_Sedes', rankedIds.map(id => ({ ...comparison(branchName(id), model.branches.get(id)),
      ...(differences.size ? { 'Diferencia de caja confirmada (S/)': differences.get(id) ?? 'Sin arqueo' } : {}) })), {
      footer: [{ _kind: 'spacer' }, { ...comparison('TOTAL NEGOCIO', model.summary), _kind: 'business-total' }],
    });
  }
  if (model.products.length) {
    const byProduct = new Map(), byBranch = new Map();
    const productRow = product => ({ Producto: reportLabel(product.name, 'Producto sin nombre', product.id),
      [productQuantity]: product.qty, [productSales]: product.revenue });
    const rank = (a, b) => b[productQuantity] - a[productQuantity] || b[productSales] - a[productSales] || a.Producto.localeCompare(b.Producto, 'es');
    for (const product of model.products) {
      const row = productRow(product), previous = byProduct.get(product.id);
      if (previous) {
        previous[productQuantity] += row[productQuantity];
        previous[productSales] = amount(previous[productSales] + row[productSales]);
      } else byProduct.set(product.id, { ...row });
      if (!byBranch.has(product.branchId)) byBranch.set(product.branchId, []);
      byBranch.get(product.branchId).push(row);
    }
    append('Productos_Global', [...byProduct.values()].sort(rank));
    if (compareBranches) {
      const rows = [];
      for (const id of ids) {
        const products = byBranch.get(id);
        if (!products?.length) continue;
        if (rows.length) rows.push({ _kind: 'group-spacer' });
        products.sort(rank).forEach((row, index) => rows.push({ Producto: row.Producto, Sucursal: index ? '' : branchName(id),
          [productQuantity]: row[productQuantity], [productSales]: row[productSales], ...(index === 0 && { _groupStart: true }) }));
      }
      append('Productos_Sedes', rows, { columns: ['Sucursal', 'Producto', productQuantity, productSales], filter: false });
    }
  }
  const byBranch = detailed ? processed.groupsByBranch : processed.dailyRowsByBranch;
  const branchColumns = detailed ? DETAIL_HEADERS : ['Fecha', ...Object.keys(netReportRow(model.summary))];
  for (const id of ids.filter(id => branchId === 'global' || Object.hasOwn(byBranch, id) || (id === branchId && model.branches.has(id)))) {
    const name = branchName(id);
    // Include every separator when measuring the rendered detail instead of omitting rows to fit.
    const records = byBranch[id] ?? [];
    const rows = detailed ? groupedTicketRows(records, Infinity) : records;
    const metrics = model.branches.get(id);
    const footer = metrics ? (detailed ? posFooter(metrics) : channelFooter(metrics, [labels.pos, labels.cash, labels.digital])) : [];
    if (detailed && rows.length + footer.length > MAX_EXPORT_ROWS) {
      throw new Error('Demasiadas filas de detalle al incluir totales y separadores. Selecciona un período menor.');
    }
    append(`${detailed ? 'Detalle' : 'Resum'}_${name}`, rows, {
      columns: branchColumns,
      filter: !detailed,
      footer,
    });
  }
  if (scopedContracts.length) append('Estado_Pedidos', scopedContracts.map(contract => ({
    Pedido: orderReportNumber(contract), Cliente: reportLabel(contract.clientName, 'Cliente sin nombre', contract.id),
    Sede: branchName(contract.branchId), Estado: ({ pendiente: 'Pendiente', entregado: 'Entregado', cancelado: 'Cancelado',
      entregado_con_deuda: 'Entregado con saldo' })[contract.status] ?? contract.status,
    'Total del pedido': contract.total, Pagado: contract.paidTotal ?? '', Saldo: contract.balance,
  })), { omit: branchId === 'global' ? [] : ['Sede'] });
  const audit = buildContractLedgerReport(scopedPayments, contracts.filter(row => !businessId || row.businessId === businessId), branchesMap, people);
  if (audit.contractPaymentRows.length) append('Auditoría_Pedidos', orderAuditRows(audit.contractPaymentRows),
    { omit: branchId === 'global' ? [] : ['Sede Movimiento'], filter: false });
  return { workbook: wb, model, view };
}
