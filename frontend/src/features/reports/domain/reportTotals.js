import { money, MONEY_TOLERANCE } from '../../sales/domain/saleModel.js';
import { paymentAmounts } from '../../payments/domain/paymentTotals.js';
import { reportDay, chartSkeleton } from './reportPeriod.js';

export const amount = value => money(value ?? 0);
export const reportRows = (rows, scope = {}, dateOf = row => row.occurredAt) => rows.filter(row => {
  if (scope.businessId && row.businessId !== scope.businessId) return false;
  if (scope.branchId && scope.branchId !== 'global' && row.branchId !== scope.branchId) return false;
  const day = dateOf(row);
  const key = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : reportDay(day);
  return !scope.period || (key >= scope.period.start && key <= scope.period.end);
});
const count = value => {
  if (!Number.isSafeInteger(value ?? 0) || value < 0) throw new Error('Cantidad de operaciones inválida.');
  return value ?? 0;
};
export const emptyMetrics = () => ({ posRevenue: 0, posCash: 0, posDigital: 0, contractRevenue: 0, contractCash: 0, contractDigital: 0,
  refunds: 0, posTicketCount: 0, voidedTicketCount: 0, contractPaymentCount: 0, refundCount: 0, netRevenue: 0, cashRevenue: 0, digitalRevenue: 0, posAverageTicket: 0 });
export function finishMetrics(metrics) {
  metrics.netRevenue = money(metrics.posRevenue + metrics.contractRevenue);
  metrics.cashRevenue = money(metrics.posCash + metrics.contractCash);
  metrics.digitalRevenue = money(metrics.posDigital + metrics.contractDigital);
  if (Math.abs(money(metrics.cashRevenue + metrics.digitalRevenue) - metrics.netRevenue) >= MONEY_TOLERANCE) throw new Error('Los métodos de pago no concilian con el ingreso neto.');
  metrics.posAverageTicket = metrics.posTicketCount ? money(metrics.posRevenue / metrics.posTicketCount) : 0;
  return metrics;
}
export function posAmounts(sale) {
  const total = amount(sale.total);
  if (sale.payment === 'efectivo') return { cash: total, digital: 0 };
  if (['yape', 'plin'].includes(sale.payment)) return { cash: 0, digital: total };
  if (sale.payment === 'mixto') {
    const cash = amount(sale.splitPayments?.efectivo), digital = amount(sale.splitPayments?.yape ?? sale.splitPayments?.plin);
    if (cash >= 0 && digital >= 0 && money(cash + digital) === total) return { cash, digital };
  }
  throw new Error('Desglose POS incompleto.');
}
export function statProducts(stat) {
  const products = new Map(Object.entries(stat.productSales ?? {}).map(([id, product]) => [id, { ...product }]));
  for (const [key, value] of Object.entries(stat)) if (key.startsWith('productSales.')) {
    const path = key.slice(13), dot = path.lastIndexOf('.'), id = path.slice(0, dot), field = path.slice(dot + 1);
    if (dot < 1) continue;
    const product = products.get(id) ?? {};
    product[field] = ['qty', 'revenue'].includes(field) ? amount(product[field]) + amount(value) : value;
    products.set(id, product);
  }
  return [...products].map(([id, product]) => ({ id, name: product.name ?? id, qty: amount(product.qty), revenue: amount(product.revenue) }));
}
export function aggregateReport({ stats = [], sales = null, payments = [], businessId, branchId = 'global', period } = {}) {
  const summary = emptyMetrics(), branches = new Map(), days = new Map(), products = new Map();
  const accepted = (row, day) => (!businessId || row.businessId === businessId) && (branchId === 'global' || row.branchId === branchId)
    && (!period || (day >= period.start && day <= period.end));
  const targets = (row, day) => {
    if (!row.branchId || row.branchId === 'global') throw new Error('Movimiento sin sede física.');
    if (!branches.has(row.branchId)) branches.set(row.branchId, { branchId: row.branchId, ...emptyMetrics() });
    const key = JSON.stringify([row.branchId, day]);
    if (!days.has(key)) days.set(key, { branchId: row.branchId, day, ...emptyMetrics() });
    return [summary, branches.get(row.branchId), days.get(key)];
  };
  const addProduct = (row, product) => {
    const key = JSON.stringify([row.branchId, product.id]);
    const previous = products.get(key) ?? { ...product, branchId: row.branchId, qty: 0, revenue: 0 };
    products.set(key, { ...previous, name: product.name, qty: amount(previous.qty + product.qty), revenue: amount(previous.revenue + product.revenue) });
  };
  for (const row of sales ?? stats) {
    const day = sales !== null ? reportDay(row.createdAt) : row.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Agregado sin fecha válida.');
    if (!accepted(row, day)) continue;
    const revenue = sales !== null ? (row.voided ? 0 : amount(row.total)) : amount(row.totalRevenue);
    const methods = name => amount(amount(row.paymentMethods?.[name]) + amount(row[`paymentMethods.${name}`]));
    const split = sales !== null ? (row.voided ? { cash: 0, digital: 0 } : posAmounts(row))
      : { cash: methods('efectivo'), digital: money(methods('yape') + methods('plin')) };
    for (const target of targets(row, day)) {
      target.posRevenue = money(target.posRevenue + revenue); target.posCash = money(target.posCash + split.cash); target.posDigital = money(target.posDigital + split.digital);
      target.posTicketCount += sales !== null ? (row.voided ? 0 : 1) : count(row.totalOrders);
      target.voidedTicketCount += sales !== null ? (row.voided ? 1 : 0) : count(row.voidedOrders);
    }
    for (const product of sales !== null ? (row.voided ? [] : (row.items ?? []).map(item => ({ id: item.id ?? item.name, name: item.name,
      qty: amount(item.qty), revenue: money(amount(item.qty) * amount(item.price)) }))) : statProducts(row)) addProduct(row, product);
  }
  const seen = new Set();
  for (const payment of payments) {
    const day = reportDay(payment.occurredAt);
    if (!accepted(payment, day)) continue;
    if (!payment.id || !payment.sourceId || !['advance', 'payment', 'refund'].includes(payment.type)
      || (payment.type === 'refund' ? payment.amount >= 0 : payment.amount <= 0)) throw new Error('Movimiento financiero incompleto.');
    if (seen.has(payment.id)) continue;
    seen.add(payment.id);
    const split = paymentAmounts(payment), net = amount(payment.amount);
    if (money(split.efectivo + split.yape) !== net) throw new Error('Desglose del ledger incompleto.');
    for (const target of targets(payment, day)) {
      target.contractRevenue = money(target.contractRevenue + net); target.contractCash = money(target.contractCash + split.efectivo); target.contractDigital = money(target.contractDigital + split.yape);
      if (payment.type === 'refund') { target.refunds = money(target.refunds + net); target.refundCount++; } else target.contractPaymentCount++;
    }
  }
  [summary, ...branches.values(), ...days.values()].forEach(finishMetrics);
  const chartData = period ? chartSkeleton(period) : [];
  for (const day of days.values()) {
    const key = period?.filter === 'todo' ? day.day.slice(0, 7) : day.day;
    const bucket = chartData.find(row => row.rawDate === key);
    if (bucket) { bucket.ventas = money(bucket.ventas + day.netRevenue); bucket.ordenes += day.posTicketCount; bucket.pagos += day.contractPaymentCount; }
  }
  const byName = new Map();
  for (const product of products.values()) byName.set(product.name, (byName.get(product.name) ?? 0) + product.qty);
  return { summary, branches, days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day) || a.branchId.localeCompare(b.branchId)), products: [...products.values()], chartData,
    topProducts: [...byName].map(([name, qty]) => ({ name, qty })).filter(row => row.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5) };
}
