import { money } from '../../sales/domain/saleModel.js';

export function paymentAmounts(payment) {
  const amount = money(payment.amount);
  if (payment.method === 'mixto') {
    const sign = amount < 0 ? -1 : 1;
    const efectivo = money(sign * Math.abs(payment.splitPayments?.efectivo ?? 0));
    const yape = money(sign * Math.abs(payment.splitPayments?.yape ?? payment.splitPayments?.plin ?? 0));
    return { efectivo, yape };
  }
  if (payment.method === 'efectivo') return { efectivo: amount, yape: 0 };
  if (['yape', 'plin'].includes(payment.method)) return { efectivo: 0, yape: amount };
  throw new Error('Método de pago del ledger inválido.');
}

export function sumPaymentTotals(payments) {
  return payments.reduce((totals, payment) => {
    const amounts = paymentAmounts(payment);
    totals.efectivo = money(totals.efectivo + amounts.efectivo);
    totals.yape = money(totals.yape + amounts.yape);
    if (payment.amount > 0) totals.payments++;
    if (amounts.efectivo > 0) totals.cashPayments++;
    return totals;
  }, { efectivo: 0, yape: 0, payments: 0, cashPayments: 0 });
}
