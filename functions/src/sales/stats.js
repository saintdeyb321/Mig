import { FieldValue } from 'firebase-admin/firestore';
import { saleDay, statsDelta, SaleError } from './domain/saleModel.js';

export function assertStatsScope(metadata, previous) {
  if (previous && (previous.businessId !== metadata.businessId || previous.branchId !== metadata.branchId
    || (previous.date !== undefined && previous.date !== metadata.date))) {
    throw new SaleError('invalid-stats', 'Agregado existente fuera del negocio, sede o período de la venta.');
  }
}

export function statsReference(database, sale) {
  const date = saleDay(sale);
  return { reference: database.doc(`daily_stats/${sale.businessId}_${date}_${sale.branchId}`),
    metadata: { businessId: sale.businessId, branchId: sale.branchId, date } };
}

export function writeStats(transaction, reference, metadata, sale, direction, previous = {}) {
  const changes = statsDelta(sale, direction);
  const removed = {};
  // Keep the existing literal dotted schema and fold legacy nested maps exactly once.
  for (const prefix of ['paymentMethods', 'categorySales', 'productSales']) {
    if (!previous[prefix] || typeof previous[prefix] !== 'object') continue;
    removed[prefix] = FieldValue.delete();
    for (const [key, value] of Object.entries(previous[prefix])) {
      const fields = prefix === 'productSales' ? Object.entries(value).map(([field, amount]) => [`${key}.${field}`, amount]) : [[key, value]];
      for (const [field, amount] of fields) {
        const path = `${prefix}.${field}`;
        if (typeof amount === 'number') changes[path] = (changes[path] ?? 0) + amount;
        else if (!(path in changes)) changes[path] = amount;
      }
    }
  }
  transaction.set(reference, { ...metadata, ...removed,
    ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, typeof value === 'number' ? FieldValue.increment(value) : value])),
  }, { merge: true });
}
