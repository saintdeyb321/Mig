import { aggregateReport, amount, assertPosReportDetail, reportRows } from '../features/reports/domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../features/reports/domain/reportPeriod.js';
import { ledgerPaymentLabel, paymentLabel } from '../features/reports/application/contractLedgerReport.js';
import { toMillisSafe } from '../core/dates/dateValues.js';
import { branchReportName, employeeReportName, orderReportNumber, reportLabel, reportNote } from '../features/reports/application/reportNames.js';

export const DETAIL_HEADERS = ['Fecha', 'Hora', 'Referencia comercial', 'Estado', 'Medio de pago', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal', 'Observaciones', 'Total movimiento (S/)', 'Sucursal', 'Responsable'];
const detail = values => Object.fromEntries(DETAIL_HEADERS.map(key => [key, values[key] ?? '']));
// Excel stores a calendar day as an integer. Avoid a browser-local conversion of a JS Date.
const excelDate = day => (Date.parse(`${day}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
export const dailyReportRows = model => {
  const result = {};
  for (const day of model.days) (result[day.branchId] ??= []).push({ Fecha: visibleDay(day.day), 'Tickets POS': day.posTicketCount,
    Anulados: day.voidedTicketCount, Ingreso: day.netRevenue, Efectivo: day.cashRevenue, 'Yape/Plin': day.digitalRevenue,
    'Ingreso POS': day.posRevenue, 'Ingreso Pedidos': day.contractRevenue, 'Pagos Pedidos': day.contractPaymentCount });
  return result;
};
export function processDailyStats(stats, payments = [], scope = {}, prepared) {
  const model = prepared ?? aggregateReport({ stats, payments, ...scope });
  return { model, dailyRowsByBranch: dailyReportRows(model) };
}
export function processSales(sales, branchesMap = {}, payments = [], scope = {}, prepared, people) {
  const model = prepared ?? aggregateReport({ sales, payments, ...scope });
  const groups = [];
  for (const { row: sale, day } of model.pos.sales) {
    assertPosReportDetail(sale);
    const rows = (sale.items ?? []).map((item, index) => detail({ Fecha: index ? '' : excelDate(day),
      Hora: index ? '' : reportTime(sale.createdAt), 'Referencia comercial': index ? '' : reportLabel(sale.ticketNumber ?? sale.receiptNumber, 'Sin referencia comercial', sale.id, sale.saleId, sale.localId),
      Estado: index ? '' : sale.voided ? 'ANULADA ❌' : 'COMPLETADA', 'Medio de pago': index ? '' : paymentLabel(sale.payment, sale.splitPayments),
      Producto: reportLabel(item.name, 'Producto sin nombre', item.id), Cantidad: sale.voided ? 0 : amount(item.qty),
      'Precio unitario': amount(item.price), Subtotal: sale.voided ? 0 : amount(item.qty * item.price),
      Observaciones: index || !sale.voided ? '' : [reportNote(sale.voidReason, sale.id, sale.saleId, sale.voidedBy),
        employeeReportName(people, sale.voidedBy, sale.voidedByName)].filter(Boolean).join(' · '),
      Sucursal: index ? '' : branchReportName(branchesMap, sale.branchId), Responsable: index ? '' : employeeReportName(people, sale.userId, sale.cashierName, sale.actorName) }));
    rows.push(detail({ 'Precio unitario': sale.voided ? 'TICKET ANULADO ➔' : 'TOTAL TICKET ➔', 'Total movimiento (S/)': sale.voided ? 0 : amount(sale.total) }));
    groups.push({ branchId: sale.branchId, timestamp: toMillisSafe(sale.createdAt), id: sale.id ?? sale.saleId, rows });
  }
  const uniquePayments = new Map(reportRows(payments, scope).map(payment => [payment.id, payment]));
  for (const { row, day } of model.pos.voids) {
    const lines = row.items.map((item, index) => detail({ Fecha: index ? '' : excelDate(day), Hora: index ? '' : reportTime(row.occurredAt),
      'Referencia comercial': index ? '' : reportLabel(row.ticketNumber ?? row.receiptNumber, 'Sin referencia comercial', row.saleId, row.id),
      Estado: index ? '' : 'COMPENSACIÓN POS',
      'Medio de pago': index ? '' : `Efectivo ${row.cashAmount.toFixed(2)} · Yape/Plin ${row.digitalAmount.toFixed(2)}`,
      Producto: reportLabel(item.name, 'Producto sin nombre', item.id), Cantidad: -item.qty,
      'Precio unitario': item.price, Subtotal: -amount(item.qty * item.price), Observaciones: index ? '' : reportNote(row.reason, row.userId, row.saleId, row.id),
      Sucursal: index ? '' : branchReportName(branchesMap, row.branchId), Responsable: index ? '' : employeeReportName(people, row.userId, row.actorName, row.cashierName) }));
    lines.push(detail({ 'Precio unitario': 'TOTAL COMPENSACIÓN ➔', 'Total movimiento (S/)': row.amount }));
    groups.push({ branchId: row.branchId, timestamp: toMillisSafe(row.occurredAt), id: `void:${row.id}`, rows: lines });
  }
  for (const payment of uniquePayments.values()) groups.push({ branchId: payment.branchId, timestamp: toMillisSafe(payment.occurredAt), id: payment.id,
    rows: [detail({ Fecha: excelDate(reportDay(payment.occurredAt)), Hora: reportTime(payment.occurredAt),
      'Referencia comercial': orderReportNumber(null, payment), Estado: payment.type === 'refund' ? 'REEMBOLSO CONTABLE' : 'PAGO PEDIDO',
      'Medio de pago': ledgerPaymentLabel(payment), Producto: reportLabel(payment.clientName, 'Cliente sin nombre', payment.sourceId),
      Cantidad: 1, 'Precio unitario': amount(payment.amount), Subtotal: amount(payment.amount), 'Total movimiento (S/)': amount(payment.amount),
      Sucursal: branchReportName(branchesMap, payment.branchId),
      Responsable: employeeReportName(people, payment.userId, payment.cashierName, payment.actorName) })] });
  groups.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  const ticketsRowsByBranch = {};
  for (const group of groups) (ticketsRowsByBranch[group.branchId] ??= []).push(...group.rows);
  return { model, ticketsRowsByBranch, branchesMap };
}
