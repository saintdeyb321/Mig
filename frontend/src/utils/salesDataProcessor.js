import { aggregateReport, amount, assertPosReportDetail, reportRows } from '../features/reports/domain/reportTotals.js';
import { reportDay, visibleDay, reportTime } from '../features/reports/domain/reportPeriod.js';
import { ledgerPaymentLabel, paymentLabel, uniqueReportPayments } from '../features/reports/application/contractLedgerReport.js';
import { toMillisSafe } from '../core/dates/dateValues.js';
import { employeeReportName, orderReportNumber, reportLabel, reportNote } from '../features/reports/application/reportNames.js';
import { excelDay } from './excelHelpers.js';

export const DETAIL_HEADERS = ['Fecha', 'Hora', 'Movimiento', 'Referencia', 'Producto / concepto', 'Cantidad', 'Precio unitario', 'Subtotal producto', 'Medio de pago', 'Importe movimiento (S/)', 'Responsable', 'Observaciones'];
const detail = values => Object.fromEntries(DETAIL_HEADERS.map(key => [key, values[key] ?? '']));
const orderMovements = { advance: 'ADELANTO PEDIDO', payment: 'ABONO PEDIDO', refund: 'REEMBOLSO CONTABLE PEDIDO' };
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
export function processSales(sales, branchesMap = {}, payments = [], scope = {}, prepared, people, contracts = []) {
  const model = prepared ?? aggregateReport({ sales, payments, ...scope });
  const orders = new Map(contracts.filter(order => !scope.businessId || order.businessId === scope.businessId).map(order => [order.id, order]));
  const groups = [];
  for (const { row: sale, day } of model.pos.sales) {
    assertPosReportDetail(sale);
    const [saleLabel, lineLabel] = sale.voided ? ['VENTA POS ANULADA', 'DETALLE TICKET ANULADO'] : ['VENTA POS', 'DETALLE TICKET'];
    const rows = sale.items.map((item, index) => detail({ Fecha: index ? '' : excelDay(day),
      Hora: index ? '' : reportTime(sale.createdAt), Referencia: index ? '' : reportLabel(sale.ticketNumber ?? sale.receiptNumber, 'Venta de mostrador', sale.id, sale.saleId, sale.localId),
      Movimiento: index ? lineLabel : saleLabel,
      'Medio de pago': index ? '' : paymentLabel(sale.payment, sale.splitPayments),
      'Producto / concepto': reportLabel(item.name, 'Producto sin nombre', item.id), Cantidad: sale.voided ? 0 : amount(item.qty),
      'Precio unitario': amount(item.price), 'Subtotal producto': sale.voided ? 0 : amount(item.qty * item.price),
      'Importe movimiento (S/)': index ? '' : sale.voided ? 0 : amount(sale.total),
      Observaciones: index || !sale.voided ? '' : ['Anulación histórica sin comprobante vinculado. Conciliación pendiente.', reportNote(sale.voidReason, sale.id, sale.saleId, sale.voidedBy),
        employeeReportName(people, sale.voidedBy, sale.voidedByName)].filter(Boolean).join(' · '),
      Responsable: index ? '' : employeeReportName(people, sale.userId, sale.cashierName, sale.actorName) }));
    groups.push({ branchId: sale.branchId, timestamp: toMillisSafe(sale.createdAt), id: sale.id ?? sale.saleId, rows });
  }
  for (const { row, day } of model.pos.voids) {
    const lines = row.items.map((item, index) => detail({ Fecha: index ? '' : excelDay(day), Hora: index ? '' : reportTime(row.occurredAt),
      Referencia: index ? '' : reportLabel(row.ticketNumber ?? row.receiptNumber, 'Venta de mostrador', row.saleId, row.id),
      Movimiento: index ? 'DETALLE COMPENSACIÓN' : 'COMPENSACIÓN POS',
      'Medio de pago': index ? '' : `Efectivo ${row.cashAmount.toFixed(2)} · Yape/Plin ${row.digitalAmount.toFixed(2)}`,
      'Producto / concepto': reportLabel(item.name, 'Producto sin nombre', item.id), Cantidad: -item.qty,
      'Precio unitario': item.price, 'Subtotal producto': -amount(item.qty * item.price),
      'Importe movimiento (S/)': index ? '' : row.amount,
      Observaciones: index ? '' : [reportNote(row.reason, row.userId, row.saleId, row.id), 'Compensación contable sin evidencia de desembolso.'].filter(Boolean).join(' · '),
      Responsable: index ? '' : employeeReportName(people, row.userId, row.actorName, row.cashierName) }));
    groups.push({ branchId: row.branchId, timestamp: toMillisSafe(row.occurredAt), id: `void:${row.id}`, rows: lines });
  }
  for (const payment of uniqueReportPayments(reportRows(payments, scope))) {
    const order = orders.get(payment.sourceId);
    const refund = payment.type === 'refund';
    const client = reportLabel(order?.clientName ?? payment.clientName, 'Cliente sin nombre', payment.sourceId);
    const row = detail({ Fecha: excelDay(reportDay(payment.occurredAt)), Hora: reportTime(payment.occurredAt),
      Referencia: orderReportNumber(order, payment), Movimiento: orderMovements[payment.type],
      'Medio de pago': ledgerPaymentLabel(payment),
      'Producto / concepto': `${refund ? 'Reembolso contable de pedido' : 'Pago de pedido'} · ${client}`,
      'Importe movimiento (S/)': amount(payment.amount),
      Observaciones: refund ? 'Registro contable sin evidencia de desembolso.' : '',
      Responsable: employeeReportName(people, payment.userId, payment.cashierName, payment.actorName) });
    groups.push({ branchId: payment.branchId, timestamp: toMillisSafe(payment.occurredAt), id: payment.id, rows: [row] });
  }
  groups.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
  const ticketsRowsByBranch = {};
  for (const group of groups) (ticketsRowsByBranch[group.branchId] ??= []).push(...group.rows);
  return { model, ticketsRowsByBranch, branchesMap };
}
