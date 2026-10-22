import { aggregateReport, amount, reportRows } from '../features/reports/domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../features/reports/domain/reportPeriod.js';
import { paymentLabel } from '../features/reports/application/contractLedgerReport.js';
import { toMillisSafe } from '../core/dates/dateValues.js';

export const DETAIL_HEADERS = ['Fecha', 'Hora', 'Ticket', 'Estado', 'Pago', 'Producto', 'Cantidad', 'Precio Unit.', 'Subtotal', 'Observaciones', 'Total movimiento (S/)'];
const detail = values => Object.fromEntries(DETAIL_HEADERS.map(key => [key, values[key] ?? '']));
export const dailyReportRows = model => {
  const result = {};
  for (const day of model.days) (result[day.branchId] ??= []).push({ Fecha: visibleDay(day.day), 'Tickets POS': day.posTicketCount,
    Anulados: day.voidedTicketCount, Ingreso: day.netRevenue, Efectivo: day.cashRevenue, 'Yape/Plin': day.digitalRevenue,
    'Ingreso POS': day.posRevenue, 'Ingreso Pedidos': day.contractRevenue, 'Pagos Pedidos': day.contractPaymentCount });
  return result;
};
export function processDailyStats(stats, payments = [], scope = {}) {
  const model = aggregateReport({ stats, payments, ...scope });
  return { model, dailyRowsByBranch: dailyReportRows(model) };
}
export function processSales(sales, branchesMap = {}, payments = [], scope = {}) {
  const model = aggregateReport({ sales, payments, ...scope });
  const groups = [];
  for (const sale of reportRows(sales, scope, row => row.createdAt)) {
    if (!Array.isArray(sale.items) || !sale.items.length || (!sale.voided
      && amount(sale.items.reduce((sum, item) => sum + amount(item.qty * item.price), 0)) !== amount(sale.total))) {
      throw new Error('El detalle POS no concilia con el ticket.');
    }
    const rows = (sale.items ?? []).map((item, index) => detail({ Fecha: index ? '' : visibleDay(reportDay(sale.createdAt)),
      Hora: index ? '' : reportTime(sale.createdAt), Ticket: index ? '' : sale.id ?? sale.saleId,
      Estado: index ? '' : sale.voided ? 'ANULADA ❌' : 'COMPLETADA', Pago: index ? '' : paymentLabel(sale.payment, sale.splitPayments),
      Producto: item.name, Cantidad: amount(item.qty), 'Precio Unit.': amount(item.price), Subtotal: sale.voided ? 0 : amount(item.qty * item.price),
      Observaciones: index || !sale.voided ? '' : `${sale.voidReason ?? ''} (${sale.voidedByName ?? ''})` }));
    rows.push(detail({ 'Precio Unit.': sale.voided ? 'TICKET ANULADO ➔' : 'TOTAL TICKET ➔', 'Total movimiento (S/)': sale.voided ? 0 : amount(sale.total) }));
    groups.push({ branchId: sale.branchId, timestamp: toMillisSafe(sale.createdAt), id: sale.id ?? sale.saleId, rows });
  }
  const uniquePayments = new Map(reportRows(payments, scope).map(payment => [payment.id, payment]));
  for (const payment of uniquePayments.values()) groups.push({ branchId: payment.branchId, timestamp: toMillisSafe(payment.occurredAt), id: payment.id,
    rows: [detail({ Fecha: visibleDay(reportDay(payment.occurredAt)), Hora: reportTime(payment.occurredAt),
      Ticket: `PEDIDO: ${payment.contractNumber ?? payment.sourceId}`, Estado: payment.type === 'refund' ? 'REEMBOLSO' : 'PAGO PEDIDO',
      Pago: paymentLabel(payment.method, payment.splitPayments), Producto: `[${payment.type}] ${payment.clientName ?? ''}`,
      Cantidad: 1, 'Precio Unit.': amount(payment.amount), Subtotal: amount(payment.amount), 'Total movimiento (S/)': amount(payment.amount),
      Observaciones: `Movimiento ${payment.id} · Cajero: ${payment.cashierName ?? ''}` })] });
  groups.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  const ticketsRowsByBranch = {};
  for (const group of groups) (ticketsRowsByBranch[group.branchId] ??= []).push(...group.rows);
  return { model, ticketsRowsByBranch, branchesMap };
}
