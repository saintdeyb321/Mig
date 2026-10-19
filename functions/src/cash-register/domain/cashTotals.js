import { money, MONEY_TOLERANCE, SaleError } from '../../sales/domain/saleModel.js';

function split(method, amount, parts) {
  if (method === 'efectivo') return { cash: money(amount), digital: 0 };
  if (['yape', 'plin'].includes(method)) return { cash: 0, digital: money(amount) };
  if (method === 'mixto' && parts) {
    const sign = amount < 0 ? -1 : 1;
    const cash = money(sign * Math.abs(parts.efectivo ?? 0));
    const digital = money(sign * Math.abs(parts.yape ?? parts.plin ?? 0));
    if (Math.abs(money(cash + digital) - money(amount)) < MONEY_TOLERANCE) return { cash, digital };
  }
  throw new SaleError('invalid-ledger', 'Movimiento sin método/desglose verificable.');
}
export function calculateCashTotals(session, sales, payments) {
  let posCash = 0, contractCash = 0, digitalTotal = 0, validTransactionCount = 0;
  for (const sale of sales) {
    if (sale.voided) continue;
    const amounts = split(sale.payment, sale.total, sale.splitPayments);
    posCash = money(posCash + amounts.cash); digitalTotal = money(digitalTotal + amounts.digital);
    validTransactionCount++;
  }
  for (const payment of payments) {
    if (!['advance', 'payment', 'refund'].includes(payment.type)
      || (payment.type === 'refund' ? payment.amount >= 0 : payment.amount <= 0)) {
      throw new SaleError('invalid-ledger', 'Movimiento con tipo/signo inválido.');
    }
    const amounts = split(payment.method, payment.amount, payment.splitPayments);
    contractCash = money(contractCash + amounts.cash); digitalTotal = money(digitalTotal + amounts.digital);
    if (payment.amount > 0) validTransactionCount++;
  }
  const openingAmount = money(session.openingAmount ?? 0);
  const totalCash = money(posCash + contractCash);
  return { openingAmount, posCash, contractCash, totalCash, digitalTotal, totalYape: digitalTotal,
    expectedCash: money(openingAmount + totalCash), totalSales: validTransactionCount, validTransactionCount };
}
