import { money, MONEY_TOLERANCE } from '../../sales/domain/saleModel.js';
import { paymentAmounts } from '../../payments/domain/paymentTotals.js';
import { reportDay, chartSkeleton } from './reportPeriod.js';
import { toMillisSafe } from '../../../core/dates/dateValues.js';

export const amount = value => money(value ?? 0);
const inScope = (row, { businessId, branchId = 'global' }) =>
  (!businessId || row.businessId === businessId) && (branchId === 'global' || row.branchId === branchId);
const inPeriod = (day, period) => !period || (day >= period.start && day <= period.end);
export const reportRows = (rows, scope = {}, dateOf = row => row.occurredAt) => rows.filter(row => {
  if (!inScope(row, scope)) return false;
  const day = dateOf(row);
  const key = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : reportDay(day);
  return inPeriod(key, scope.period);
});
const count = value => {
  if (!Number.isSafeInteger(value ?? 0) || value < 0) throw new Error('Cantidad de operaciones inválida.');
  return value ?? 0;
};
export const REPORT_CHANNELS = { cash: 'Efectivo', digital: 'Yape / Plin' };
export const CHANNEL_BREAKDOWN_ROWS = [
  { key: 'collections', label: 'Cobros registrados' },
  { key: 'posCompensations', label: 'Compensaciones POS' },
  { key: 'contractRefunds', label: 'Reembolsos contables de pedidos' },
  { key: 'net', label: 'Neto contable' },
];
export const CHANNEL_NEGATIVE_NOTE = 'El neto de un canal puede ser negativo si las compensaciones y los reembolsos contables superan los cobros del período. El cobro original puede pertenecer a un período anterior.';
export const CHANNEL_EVIDENCE_NOTE = 'Las compensaciones POS y los reembolsos contables de pedidos son registros sin evidencia de desembolso físico ni de devolución digital.';

const emptyChannel = () => ({ collections: 0, posCompensations: 0, contractRefunds: 0, net: 0 });
export const emptyMetrics = () => ({ posRevenue: 0, posCash: 0, posDigital: 0, contractRevenue: 0, contractCash: 0, contractDigital: 0,
  refunds: 0, posTicketCount: 0, voidedTicketCount: 0, contractPaymentCount: 0, refundCount: 0, netRevenue: 0, cashRevenue: 0, digitalRevenue: 0, posAverageTicket: 0,
  channels: { cash: emptyChannel(), digital: emptyChannel() } });

function addChannelMovement({ cash, digital }, kind, cashAmount, digitalAmount) {
  cash[kind] = money(cash[kind] + cashAmount);
  digital[kind] = money(digital[kind] + digitalAmount);
}
const channelNet = channel => money(channel.collections + channel.posCompensations + channel.contractRefunds) || 0;

export function finishMetrics(metrics) {
  const { cash, digital } = metrics.channels;
  cash.net = channelNet(cash);
  digital.net = channelNet(digital);
  metrics.cashRevenue = cash.net;
  metrics.digitalRevenue = digital.net;
  metrics.netRevenue = money(metrics.posRevenue + metrics.contractRevenue);
  if (cash.net !== money(metrics.posCash + metrics.contractCash) || digital.net !== money(metrics.posDigital + metrics.contractDigital)
    || Math.abs(money(cash.net + digital.net) - metrics.netRevenue) >= MONEY_TOLERANCE) {
    throw new Error('Los métodos de pago no concilian con el ingreso neto.');
  }
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

const invalidCompensation = () => new Error('Compensación POS no verificable.');
const exactMoney = value => typeof value === 'number' && Number.isSafeInteger(Math.round(value * 100)) && value === Math.round(value * 100) / 100;
function compensationLines(items) {
  if (!Array.isArray(items) || !items.length) throw invalidCompensation();
  const ids = new Set();
  return items.map(item => {
    if (typeof item?.id !== 'string' || !item.id || ids.has(item.id) || !Number.isSafeInteger(item.qty) || item.qty <= 0
      || !exactMoney(item.price) || item.price < 0) throw invalidCompensation();
    ids.add(item.id);
    return JSON.stringify([item.id, item.qty, item.price]);
  }).sort().join('\n');
}

function reconcilePosRows(sales, voids, scope) {
  const originals = new Map(), receipts = new Map(), restored = new Set();
  const salesInPeriod = [], voidsInPeriod = [];
  for (const row of sales ?? []) {
    if (!inScope(row, scope)) continue;
    const entry = { row, day: reportDay(row.createdAt) };
    if (inPeriod(entry.day, scope.period)) salesInPeriod.push(entry);
    const id = row.id ?? row.saleId;
    if (!id) continue;
    if (originals.has(id)) throw new Error('ID de ticket POS duplicado en el reporte.');
    originals.set(id, entry);
  }
  for (const row of voids) {
    if (!inScope(row, scope)) continue;
    const day = reportDay(row.occurredAt), occursInPeriod = inPeriod(day, scope.period);
    const original = originals.get(row.saleId), sale = original?.row;
    if (!occursInPeriod && !(sale?.voided && inPeriod(original.day, scope.period))) continue;
    if (typeof row.id !== 'string' || !row.id || row.saleId !== row.id || row.authority !== 'pos-compensation'
      || !row.businessId || !row.branchId || row.branchId === 'global'
      || ![row.amount, row.cashAmount, row.digitalAmount].every(exactMoney)
      || row.amount >= 0 || row.cashAmount > 0 || row.digitalAmount > 0 || money(row.cashAmount + row.digitalAmount) !== row.amount) throw invalidCompensation();
    const lines = compensationLines(row.items);
    if (money(row.items.reduce((sum, item) => sum + money(item.price * item.qty), 0)) !== -row.amount) throw invalidCompensation();
    const occurredAt = toMillisSafe(row.occurredAt);
    const signature = JSON.stringify([row.businessId, row.branchId, row.amount, row.cashAmount, row.digitalAmount, occurredAt, lines,
      row.items.map(item => [item.id, item.name]).sort(), row.userId, row.sessionId, row.reason, row.protocol]);
    if (receipts.has(row.id)) {
      if (receipts.get(row.id) !== signature) throw invalidCompensation();
      continue;
    }
    if (sale) {
      if (sale.businessId !== row.businessId || sale.branchId !== row.branchId || (sale.saleId != null && sale.saleId !== row.id)
        || sale.total !== -row.amount || toMillisSafe(sale.createdAt) > occurredAt || compensationLines(sale.items) !== lines) throw invalidCompensation();
      const { cash, digital } = posAmounts(sale);
      if (cash !== -row.cashAmount || digital !== -row.digitalAmount) throw invalidCompensation();
      if (sale.voided) restored.add(sale);
    }
    receipts.set(row.id, signature);
    if (occursInPeriod) voidsInPeriod.push({ row, day });
  }
  return { sales: salesInPeriod.map(entry => restored.has(entry.row) ? { ...entry, row: { ...entry.row, voided: false } } : entry), voids: voidsInPeriod };
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
export function aggregateReport({ stats = [], sales = null, payments = [], voids = [], businessId, branchId = 'global', period } = {}) {
  const summary = emptyMetrics(), branches = new Map(), days = new Map(), products = new Map();
  const scope = { businessId, branchId, period };
  const pos = reconcilePosRows(sales, voids, scope);
  const accepted = (row, day) => inScope(row, scope) && inPeriod(day, period);
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
  const location = row => JSON.stringify([row.businessId, row.branchId]);
  const locationsWithCompensations = new Set(sales === null ? pos.voids.map(({ row }) => location(row)) : []);
  for (const { row, day } of sales === null ? stats.map(row => ({ row, day: row.date })) : pos.sales) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Agregado sin fecha válida.');
    if (!accepted(row, day)) continue;
    if (sales === null && row.voidedOrders > 0 && locationsWithCompensations.has(location(row))) {
      throw new Error('El agregado histórico no identifica los tickets anulados para conciliar las compensaciones.');
    }
    const revenue = sales !== null ? (row.voided ? 0 : amount(row.total)) : amount(row.totalRevenue);
    const methods = name => amount(amount(row.paymentMethods?.[name]) + amount(row[`paymentMethods.${name}`]));
    const split = sales !== null ? (row.voided ? { cash: 0, digital: 0 } : posAmounts(row))
      : { cash: methods('efectivo'), digital: money(methods('yape') + methods('plin')) };
    for (const target of targets(row, day)) {
      target.posRevenue = money(target.posRevenue + revenue); target.posCash = money(target.posCash + split.cash); target.posDigital = money(target.posDigital + split.digital);
      addChannelMovement(target.channels, 'collections', split.cash, split.digital);
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
    const isRefund = payment.type === 'refund';
    if (!payment.id || !payment.sourceId || !['advance', 'payment', 'refund'].includes(payment.type)
      || (isRefund ? payment.amount >= 0 : payment.amount <= 0)) throw new Error('Movimiento financiero incompleto.');
    if (seen.has(payment.id)) continue;
    seen.add(payment.id);
    const split = paymentAmounts(payment), net = amount(payment.amount);
    if (money(split.efectivo + split.yape) !== net) throw new Error('Desglose del ledger incompleto.');
    for (const target of targets(payment, day)) {
      target.contractRevenue = money(target.contractRevenue + net); target.contractCash = money(target.contractCash + split.efectivo); target.contractDigital = money(target.contractDigital + split.yape);
      addChannelMovement(target.channels, isRefund ? 'contractRefunds' : 'collections', split.efectivo, split.yape);
      if (isRefund) { target.refunds = money(target.refunds + net); target.refundCount++; } else target.contractPaymentCount++;
    }
  }
  for (const { row, day } of pos.voids) {
    for (const target of targets(row, day)) {
      target.posRevenue = money(target.posRevenue + row.amount); target.posCash = money(target.posCash + row.cashAmount);
      target.posDigital = money(target.posDigital + row.digitalAmount); target.refunds = money(target.refunds + row.amount);
      addChannelMovement(target.channels, 'posCompensations', row.cashAmount, row.digitalAmount);
      target.refundCount++; target.voidedTicketCount++;
    }
    for (const item of row.items) addProduct(row, { id: item.id, name: item.name, qty: -item.qty, revenue: -money(item.price * item.qty) });
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
  return { summary, branches, days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day) || a.branchId.localeCompare(b.branchId)), products: [...products.values()], chartData, pos,
    topProducts: [...byName].map(([name, qty]) => ({ name, qty })).filter(row => row.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5) };
}
