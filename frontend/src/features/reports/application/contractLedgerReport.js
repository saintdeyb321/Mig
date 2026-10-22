import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { aggregateReport, amount } from '../domain/reportTotals.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';

export function paymentLabel(method, split) {
  if (method === 'mixto') return `MIXTO (Ef: ${amount(split?.efectivo).toFixed(2)} / Yp: ${amount(split?.yape ?? split?.plin).toFixed(2)})`;
  return ({ efectivo: 'EFECTIVO', yape: 'YAPE', plin: 'PLIN' })[method] ?? 'NO REGISTRADO';
}
export function buildContractLedgerReport(payments, contracts = [], branchesMap = {}) {
  const unique = [...new Map(payments.map(payment => [payment.id, payment])).values()];
  const model = aggregateReport({ payments: unique });
  const contractsById = new Map(contracts.map(contract => [contract.id, contract]));
  const paymentsByBranch = {};
  const contractPaymentRows = unique.sort((a, b) => toMillisSafe(a.occurredAt) - toMillisSafe(b.occurredAt) || a.id.localeCompare(b.id)).map(payment => {
    (paymentsByBranch[payment.branchId] ??= []).push({ ...payment, date: payment.occurredAt, contractId: payment.contractNumber });
    const contract = contractsById.get(payment.sourceId);
    return { 'ID Pedido': contract?.contractNumber ?? contract?.contractId ?? payment.contractNumber ?? payment.sourceId,
      'Fecha Pago': `${visibleDay(reportDay(payment.occurredAt))} ${reportTime(payment.occurredAt)}`, Cliente: contract?.clientName ?? payment.clientName ?? '',
      'Sede Origen': branchesMap[contract?.branchId] ?? '-', 'Sede Recojo': contract?.deliveryType === 'domicilio' ? 'Delivery' : branchesMap[contract?.deliveryType] ?? '-',
      'Total Pedido (referencia)': contract?.total == null ? '' : amount(contract.total),
      'Adelanto (S/)': payment.type === 'advance' ? amount(payment.amount) : 0, 'Mét. Adelanto': payment.type === 'advance' ? paymentLabel(payment.method, payment.splitPayments) : '-',
      'Abono (S/)': payment.type === 'payment' ? amount(payment.amount) : 0, 'Mét. Abono': payment.type === 'payment' ? paymentLabel(payment.method, payment.splitPayments) : '-',
      'Reembolso (S/)': payment.type === 'refund' ? amount(payment.amount) : 0, Estado: String(contract?.status ?? '-').toUpperCase(),
      'Documento Pedido': payment.sourceId, 'ID Movimiento': payment.id, 'Sede Movimiento': branchesMap[payment.branchId] ?? payment.branchId, 'Neto Movimiento (S/)': amount(payment.amount) };
  });
  return { contractPaymentRows, paymentsByBranch, totals: model.summary };
}
