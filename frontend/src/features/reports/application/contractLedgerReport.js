import { reportDay, visibleDay, reportTime } from '../domain/reportPeriod.js';
import { aggregateReport, amount } from '../domain/reportTotals.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';
import { paymentAmounts } from '../../payments/domain/paymentTotals.js';
import { branchReportName, employeeReportName, orderReportNumber, reportLabel } from './reportNames.js';

export function paymentLabel(method, split) {
  if (method === 'mixto') return `MIXTO (Ef: ${amount(split?.efectivo).toFixed(2)} / Yp: ${amount(split?.yape ?? split?.plin).toFixed(2)})`;
  return ({ efectivo: 'EFECTIVO', yape: 'YAPE', plin: 'PLIN' })[method] ?? 'NO REGISTRADO';
}
export function ledgerPaymentLabel(payment) {
  const split = payment.method === 'mixto' ? paymentAmounts(payment) : payment.splitPayments;
  return paymentLabel(payment.method, split);
}
export function buildContractLedgerReport(payments, contracts = [], branchesMap = {}, people) {
  const unique = [...new Map(payments.map(payment => [payment.id, payment])).values()];
  const model = aggregateReport({ payments: unique });
  const contractsById = new Map(contracts.map(contract => [contract.id, contract]));
  const paymentsByBranch = {};
  const contractPaymentRows = unique.sort((a, b) => toMillisSafe(a.occurredAt) - toMillisSafe(b.occurredAt) || a.id.localeCompare(b.id)).map(payment => {
    (paymentsByBranch[payment.branchId] ??= []).push({ ...payment, date: payment.occurredAt, contractId: payment.contractNumber });
    const contract = contractsById.get(payment.sourceId);
    return { 'N.º de pedido': orderReportNumber(contract, payment),
      'Fecha Pago': `${visibleDay(reportDay(payment.occurredAt))} ${reportTime(payment.occurredAt)}`,
      Cliente: reportLabel(contract?.clientName ?? payment.clientName, 'Cliente sin nombre', payment.sourceId),
      'Sede Origen': branchReportName(branchesMap, contract?.branchId), 'Sede Recojo': contract?.deliveryType === 'domicilio' ? 'Delivery' : branchReportName(branchesMap, contract?.deliveryType),
      'Total Pedido (referencia)': contract?.total == null ? '' : amount(contract.total),
      'Adelanto (S/)': payment.type === 'advance' ? amount(payment.amount) : 0, 'Mét. Adelanto': payment.type === 'advance' ? paymentLabel(payment.method, payment.splitPayments) : '-',
      'Abono (S/)': payment.type === 'payment' ? amount(payment.amount) : 0, 'Mét. Abono': payment.type === 'payment' ? paymentLabel(payment.method, payment.splitPayments) : '-',
      'Reembolso contable (S/)': payment.type === 'refund' ? amount(payment.amount) : 0, Estado: String(contract?.status ?? '-').toUpperCase(),
      'Sede Movimiento': branchReportName(branchesMap, payment.branchId),
      'Registrado por': employeeReportName(people, payment.userId, payment.cashierName, payment.actorName),
      'Neto Movimiento (S/)': amount(payment.amount),
      'Mét. del reembolso contable': payment.type === 'refund' ? ledgerPaymentLabel(payment) : '-' };
  });
  return { contractPaymentRows, paymentsByBranch, totals: model.summary };
}
