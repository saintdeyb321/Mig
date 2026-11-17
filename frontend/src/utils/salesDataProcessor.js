import { aggregateReport, amount, assertPosReportDetail } from '../features/reports/domain/reportTotals.js';
import { visibleDay, reportTime } from '../features/reports/domain/reportPeriod.js';
import { paymentLabel } from '../features/reports/application/contractLedgerReport.js';
import { toMillisSafe } from '../core/dates/dateValues.js';
import { employeeReportName, reportLabel, reportNote } from '../features/reports/application/reportNames.js';
import { excelDay } from './excelHelpers.js';

export const MOVEMENT_AMOUNT = 'Importe neto movimiento (S/)';
export const ITEM_SUBTOTAL = 'Subtotal (S/)';
export const DETAIL_HEADERS = ['Fecha', 'Hora', 'Referencia', 'Estado', 'Medio de pago', 'Producto', 'Cantidad', 'Precio unitario',
  ITEM_SUBTOTAL, MOVEMENT_AMOUNT, 'Responsable', 'Movimiento', 'Observaciones'];
const detail = values => Object.fromEntries(DETAIL_HEADERS.map(key => [key, values[key] ?? '']));
export const NET_REPORT_COLUMNS = {
  tickets: 'Tickets', voids: 'Anulados', payments: 'Pagos de pedidos (cantidad)',
  total: 'Ingreso neto (S/)', cash: 'Efectivo (S/)', digital: 'Yape / Plin (S/)',
  pos: 'Ventas mostrador (S/)', orders: 'Pagos de pedidos (S/)', products: 'Importe neto (S/)',
};
const labels = NET_REPORT_COLUMNS;
export const netReportRow = metrics => ({
  [labels.pos]: metrics.posRevenue, [labels.orders]: metrics.contractRevenue,
  [labels.cash]: metrics.cashRevenue, [labels.digital]: metrics.digitalRevenue, [labels.total]: metrics.netRevenue,
  [labels.tickets]: metrics.posTicketCount, [labels.voids]: metrics.voidedTicketCount,
});
export const dailyReportRows = model => {
  const result = {};
  for (const day of model.days) (result[day.branchId] ??= []).push({ Fecha: visibleDay(day.day), ...netReportRow(day) });
  return result;
};
export function processDailyStats(stats, payments = [], scope = {}, prepared) {
  const model = prepared ?? aggregateReport({ stats, payments, ...scope });
  return { model, dailyRowsByBranch: dailyReportRows(model) };
}
export function processSales(sales, payments = [], scope = {}, prepared, people) {
  const model = prepared ?? aggregateReport({ sales, payments, ...scope });
  const groups = [];
  const adjusted = new Set(model.pos.voids.map(({ row }) => row.saleId));
  for (const { row: sale, day } of model.pos.sales) {
    assertPosReportDetail(sale);
    const paired = adjusted.has(sale.id ?? sale.saleId);
    const movement = detail({ Fecha: excelDay(day), Hora: reportTime(sale.createdAt),
      Referencia: reportLabel(sale.ticketNumber ?? sale.receiptNumber, 'Venta de mostrador', sale.id, sale.saleId, sale.localId),
      Movimiento: sale.voided ? 'VENTA POS ANULADA' : 'VENTA POS',
      'Medio de pago': paymentLabel(sale.payment, sale.splitPayments),
      [MOVEMENT_AMOUNT]: sale.voided ? 0 : amount(sale.total),
      Estado: sale.voided ? 'Anulada · por revisar' : paired ? 'Anulada' : 'Completada',
      Observaciones: sale.voided ? ['Anulación histórica sin comprobante vinculado. Conciliación pendiente.', reportNote(sale.voidReason, sale.id, sale.saleId, sale.voidedBy),
        employeeReportName(people, sale.voidedBy, sale.voidedByName)].filter(Boolean).join(' · ')
        : paired ? 'Cobro original. El ajuste se registra por separado en su fecha.' : '',
      Responsable: employeeReportName(people, sale.userId, sale.cashierName, sale.actorName) });
    groups.push({ branchId: sale.branchId, timestamp: toMillisSafe(sale.createdAt), id: sale.id ?? sale.saleId,
      movement, items: sale.items, sign: sale.voided ? 0 : 1, ticketTotal: paired ? 0 : movement[MOVEMENT_AMOUNT] });
  }
  for (const { row, day } of model.pos.voids) {
    const movement = detail({ Fecha: excelDay(day), Hora: reportTime(row.occurredAt),
      Referencia: reportLabel(row.ticketNumber ?? row.receiptNumber, 'Venta de mostrador', row.saleId, row.id),
      Movimiento: 'COMPENSACIÓN POS',
      'Medio de pago': `Efectivo ${row.cashAmount.toFixed(2)} · Yape/Plin ${row.digitalAmount.toFixed(2)}`,
      [MOVEMENT_AMOUNT]: row.amount, Estado: 'Anulación registrada',
      Observaciones: [reportNote(row.reason, row.userId, row.saleId, row.id), 'Compensación contable sin evidencia de desembolso.'].filter(Boolean).join(' · '),
      Responsable: employeeReportName(people, row.userId, row.actorName, row.cashierName) });
    groups.push({ branchId: row.branchId, timestamp: toMillisSafe(row.occurredAt), id: `void:${row.id}`, movement, items: row.items, sign: -1 });
  }
  groups.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  const groupsByBranch = Object.create(null);
  for (const group of groups) (groupsByBranch[group.branchId] ??= []).push(group);
  return { model, groupsByBranch };
}

export function groupedTicketRows(groups, rowLimit) {
  const roomForSeparators = groups.reduce((size, group) => size + (group.items ? group.items.length + 1 : 1), groups.length - 1) <= rowLimit;
  const rows = [];
  for (const [index, { movement, items, sign, ticketTotal }] of groups.entries()) {
    if (index && roomForSeparators) rows.push({ _kind: 'spacer' });
    if (!items) { rows.push(movement); continue; }
    items.forEach((item, line) => rows.push({
      ...(line === 0 ? movement : {}),
      Producto: reportLabel(item.name, 'Producto sin nombre', item.id),
      Cantidad: sign ? sign * amount(item.qty) : 0,
      'Precio unitario': amount(item.price),
      [ITEM_SUBTOTAL]: sign ? sign * amount(item.qty * item.price) : 0,
    }));
    rows.push({ 'Precio unitario': sign === -1 ? 'TOTAL AJUSTE' : 'TOTAL TICKET',
      [ITEM_SUBTOTAL]: ticketTotal ?? movement[MOVEMENT_AMOUNT],
      _kind: sign === -1 ? 'adjustment-total' : movement.Estado.startsWith('Anulada') ? 'void-total' : 'ticket-total' });
  }
  return rows;
}
