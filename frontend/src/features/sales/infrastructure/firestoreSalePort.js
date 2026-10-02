import { doc, runTransaction, increment, Timestamp, deleteField } from 'firebase/firestore';

export function firestoreSalePort(database, sdk = { doc, runTransaction, increment, Timestamp, deleteField }) {
  const { doc, runTransaction, increment, Timestamp, deleteField } = sdk;
  return {
    timestamp: value => Timestamp.fromDate(new Date(value)),
    transaction: callback => runTransaction(database, transaction => callback({
      get: async (collection, id) => {
        const snapshot = await transaction.get(doc(database, collection, id));
        return snapshot.exists() ? snapshot.data() : undefined;
      },
      set: (collection, id, data) => transaction.set(doc(database, collection, id), data),
      update: (collection, id, data) => transaction.update(doc(database, collection, id), data),
      // Preserve the existing online aggregate's literal dotted keys; reports support this schema.
      stats: ({ id, ...metadata }, delta, previous = {}) => {
        const changes = { ...delta };
        const removed = {};
        // Old retries wrote nested maps. Fold them into the existing dotted schema once,
        // so legacy mixed aggregates cannot mask the new values in current reports.
        for (const prefix of ['paymentMethods', 'categorySales', 'productSales']) {
          if (!previous[prefix] || typeof previous[prefix] !== 'object') continue;
          removed[prefix] = deleteField();
          for (const [key, value] of Object.entries(previous[prefix])) {
            const fields = prefix === 'productSales' ? Object.entries(value).map(([field, amount]) => [`${key}.${field}`, amount]) : [[key, value]];
            for (const [field, amount] of fields) {
              const path = `${prefix}.${field}`;
              if (typeof amount === 'number') changes[path] = (changes[path] ?? 0) + amount;
              else if (!(path in changes)) changes[path] = amount;
            }
          }
        }
        transaction.set(doc(database, 'daily_stats', id), {
          ...metadata, ...removed, ...Object.fromEntries(Object.entries(changes).map(([key, value]) =>
            [key, typeof value === 'number' ? increment(value) : value])),
        }, { merge: true });
      },
    })),
  };
}
