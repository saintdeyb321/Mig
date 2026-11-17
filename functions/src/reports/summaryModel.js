const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });
export const collections = {
  days: 'report_day_buckets_v1', contributions: 'report_source_contributions_v1', months: 'report_month_snapshots_v1',
  products: 'report_product_totals_v1', state: 'report_projection_state_v1',
};
export const schemaVersion = 2;
export const productPageSize = 250;
export const maxProductPages = 24;
export const maxSummaryBytes = 480 * 1024;
export const fields = ['saleCash', 'saleDigital', 'voidCash', 'voidDigital', 'advanceCash', 'advanceDigital',
  'paymentCash', 'paymentDigital', 'refundCash', 'refundDigital', 'tickets', 'voids', 'advances', 'payments', 'refunds',
  'created', 'pending', 'delivered', 'createdCancelled', 'debt', 'cancelled', 'openings', 'closings', 'balanced', 'extra', 'short',
  'expired', 'review', 'unverified', 'confirmedExtra', 'confirmedShort', 'verifiedClosings'];
const index = Object.fromEntries(fields.map((name, i) => [name, i]));
const signedNegatives = new Set(['voidCash', 'voidDigital', 'refundCash', 'refundDigital', 'confirmedShort']);
export const validScopePart = part => typeof part === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(part);
export const keyOf = (...parts) => parts.map(part => encodeURIComponent(String(part))).join(':');
export const positiveState = ['pendiente', 'en_produccion', 'listo_para_entrega', 'entregado', 'entregado_con_deuda', 'cancelado'];
export const validMonth = period => typeof period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
export const failReport = (code, message) => Object.assign(new Error(message), { code });
export function millis(value) {
  const raw = value?.toDate ? value.toDate() : value;
  const date = raw == null || raw === '' ? NaN : +new Date(raw);
  if (!Number.isFinite(date)) throw failReport('report-evidence', 'Falta una fecha verificable.');
  return date;
}
export const dayInLima = value => lima.format(new Date(millis(value)));
export const monthInLima = value => dayInLima(value).slice(0, 7);
export const blank = () => Array(fields.length).fill(0);
export const get = (vector, key) => vector[index[key]];
export function integer(value) {
  if (!Number.isSafeInteger(value)) throw failReport('report-evidence', 'Importe o cantidad fuera de rango.');
  return value || 0;
}
export function toCents(value) {
  const cent = integer(Math.round(value * 100));
  if (typeof value !== 'number' || cent / 100 !== value) throw failReport('report-evidence', 'Importe fuera de céntimos.');
  return cent;
}
export function vector(values) {
  const data = blank();
  for (const [name, value] of Object.entries(values)) data[index[name]] = integer(value);
  return data;
}
export function plus(left, right, sign = 1) {
  return left.map((value, i) => integer(value + sign * right[i]));
}
export function total(rows) {
  return rows.reduce((sum, row) => plus(sum, row.values), blank());
}
export function checkVector(values) {
  if (!Array.isArray(values) || values.length !== fields.length) throw failReport('report-evidence', 'Resumen sin métricas completas.');
  for (const [i, name] of fields.entries()) {
    const value = integer(values[i]);
    if (signedNegatives.has(name) ? value > 0 : value < 0) throw failReport('report-evidence', 'Signo de resumen inválido.');
  }
  const v = key => get(values, key);
  if (v('created') !== v('pending') + v('delivered') + v('createdCancelled')
    || v('debt') > v('created') - v('createdCancelled')
    || v('balanced') > v('verifiedClosings') || v('verifiedClosings') + v('unverified') !== v('closings')
    || v('extra') + v('short') + v('balanced') > v('closings') || v('review') < v('expired')
    || v('review') > v('closings') + v('expired')) throw failReport('report-evidence', 'Los estados del resumen no concilian.');
  return values;
}
export function financial(values) {
  const sum = (...keys) => keys.reduce((amount, key) => integer(amount + get(values, key)), 0);
  const channel = (suffix, sale, voids) => {
    const collections = sum(sale, 'advance' + suffix, 'payment' + suffix);
    const posCompensations = sum(voids), contractRefunds = sum('refund' + suffix);
    return { collections, posCompensations, contractRefunds, net: integer(collections + posCompensations + contractRefunds) };
  };
  const cash = channel('Cash', 'saleCash', 'voidCash'), digital = channel('Digital', 'saleDigital', 'voidDigital');
  const pos = sum('saleCash', 'saleDigital', 'voidCash', 'voidDigital');
  const orders = sum('advanceCash', 'advanceDigital', 'paymentCash', 'paymentDigital', 'refundCash', 'refundDigital');
  return { pos, orders, net: integer(pos + orders), cash, digital };
}
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
// Numeric facts are additive. Name/order evidence carries the same source precedence as the document reader.
export function mergeProducts(items) {
  const bySku = new Map();
  for (const item of items) {
    const id = keyOf(item.branchId, item.id);
    const prior = bySku.get(id);
    bySku.set(id, prior ? { ...prior, qty: integer(prior.qty + item.qty), cents: integer(prior.cents + item.cents),
      first: prior.first < item.first ? prior.first : item.first,
      last: prior.last > item.last ? prior.last : item.last, name: prior.last > item.last ? prior.name : item.name } : { ...item });
  }
  return [...bySku.values()].sort((a, b) => cmp(a.branchId, b.branchId) || cmp(a.id, b.id));
}
export function rankProducts(products) {
  const names = new Map();
  for (const product of [...products].sort((a, b) => cmp(a.first, b.first))) {
    const prior = names.get(product.name) ?? { name: product.name, qty: 0, cents: 0 };
    prior.qty = integer(prior.qty + product.qty);
    prior.cents = integer(prior.cents + product.cents);
    names.set(product.name, prior);
  }
  return [...names.values()].filter(item => item.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 5);
}
export function groupDays(rows, select) {
  const buckets = new Map();
  for (const row of rows) {
    const key = select(row);
    buckets.set(key, plus(buckets.get(key) ?? blank(), row.values));
  }
  return [...buckets].sort(([a], [b]) => cmp(a, b)).map(([key, values]) => ({ key, values }));
}
export const sourceTypes = ['sales', 'pos_voids', 'payments', 'contracts', 'cash_sessions'];
export function expectedMonths(period, asOf) {
  if (period.filter === 'mes') return [period.start.slice(0, 7)];
  if (period.filter !== 'todo') throw failReport('report-evidence', 'Período consolidado inválido.');
  const year = period.start.slice(0, 4), current = monthInLima(asOf);
  const length = current.slice(0, 4) === year ? Number(current.slice(-2)) : current.slice(0, 4) > year ? 12 : 0;
  if (!length) throw failReport('report-summary-pending', 'Período futuro.');
  return Array.from({ length }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
}
