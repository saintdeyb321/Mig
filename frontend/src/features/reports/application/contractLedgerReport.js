import { toDateSafe } from '../../../core/dates/dateValues.js';
import { money } from '../../sales/domain/saleModel.js';
import { sumPaymentTotals } from '../../payments/domain/paymentTotals.js';
import { formatDate, formatTime } from '../../../utils/dateUtils.js';

export function buildContractLedgerReport(payments, contracts = [], branchesMap = {}) {
  const totals = sumPaymentTotals(payments);
  const paymentsByBranch = {};
  const groups = new Map();
  const contractsById = new Map(contracts.map(contract => [contract.id, contract]));
  for (const payment of payments) {
    const date = toDateSafe(payment.occurredAt);
    if (!date || !payment.branchId || !payment.sourceId) throw new Error('Movimiento del ledger incompleto.');
    (paymentsByBranch[payment.branchId] ??= []).push({
      id: payment.id, sourceId: payment.sourceId, date, amount: payment.amount,
      method: payment.method === 'efectivo' ? 'EFECTIVO' : payment.method === 'mixto' ? 'MIXTO' : 'YAPE/PLIN',
      splitPayments: payment.splitPayments, type: payment.type.toUpperCase(),
      contractId: payment.contractNumber, clientName: payment.clientName ?? '',
      cashierName: payment.cashierName, operationId: payment.operationId,
    });
    if (!groups.has(payment.sourceId)) groups.set(payment.sourceId, []);
    groups.get(payment.sourceId).push(payment);
  }
  for (const rows of Object.values(paymentsByBranch)) {
    rows.sort((a, b) => a.date - b.date || String(a.id).localeCompare(String(b.id)));
  }
  const contractPaymentRows = [...groups].map(([sourceId, movements]) => {
    const contract = contractsById.get(sourceId);
    const first = movements[0];
    const createdAt = toDateSafe(contract?.createdAt) ?? toDateSafe(first.occurredAt);
    const byType = type => money(movements.filter(payment => payment.type === type).reduce((sum, payment) => sum + payment.amount, 0));
    const methods = type => [...new Set(movements.filter(payment => payment.type === type).map(payment => payment.method.toUpperCase()))].join(' + ') || '-';
    return {
      _branchName: branchesMap[contract?.branchId ?? first.branchId] ?? 'Sede Eliminada',
      _timestamp: createdAt.getTime(),
      'ID Pedido': contract?.contractNumber ?? contract?.contractId ?? first.contractNumber,
      'Fecha Pedido': formatDate(createdAt) + ' ' + formatTime(createdAt),
      'Cliente': contract?.clientName ?? first.clientName ?? '',
      'Sede Origen': branchesMap[contract?.branchId ?? first.branchId] ?? 'Sede Eliminada',
      'Sede Recojo': contract?.deliveryType === 'domicilio' ? 'Delivery' : branchesMap[contract?.deliveryType] ?? '-',
      'Total (S/)': contract?.total ?? null,
      'Adelanto del período (S/)': byType('advance'),
      'Mét. Adelanto': methods('advance'),
      'Abonado del período (S/)': byType('payment'),
      'Mét. Abono': methods('payment'),
      'Reembolsos del período (S/)': Math.abs(byType('refund')),
      'Estado': String(contract?.status ?? '-').toUpperCase().replace(/_/g, ' '),
    };
  }).sort((a, b) => a._branchName.localeCompare(b._branchName) || b._timestamp - a._timestamp)
    .map(({ _branchName, _timestamp, ...row }) => row);
  return { contractPaymentRows, paymentsByBranch, totals: {
    efectivo: totals.efectivo, yape: totals.yape, totalContratosNeto: money(totals.efectivo + totals.yape),
    totalPagosProcesados: totals.payments,
  } };
}
