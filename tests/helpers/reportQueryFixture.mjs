import { Timestamp } from 'firebase/firestore';

const fieldValue = (row, field) => field.split('.').reduce((value, key) => value?.[key], row);
const scalar = value => value instanceof Timestamp ? value.toMillis() : value;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const docSnapshot = (row, id = row?.id) => ({ id, data: () => row, exists: () => row !== undefined });

// Simulates query shape and page contents only. The counters do not estimate index scans, rules or billing.
export function reportQueryFixture(records) {
  const calls = [];
  const select = ({ collection, constraints }) => {
    const where = constraints.filter(clause => clause.op);
    const orders = constraints.filter(clause => clause.order);
    const compareRows = (a, b) => {
      for (const { order, direction } of orders) {
        const delta = compare(scalar(fieldValue(a, order)), scalar(fieldValue(b, order)));
        if (delta) return direction === 'desc' ? -delta : delta;
      }
      return compare(a.id, b.id);
    };
    return (records[collection] ?? []).filter(row => orders.every(({ order }) => fieldValue(row, order) !== undefined)
      && where.every(({ field, op, value }) => {
        const actual = fieldValue(row, field);
        if (op === '==') return actual === value;
        if (op === 'in') return value.includes(actual);
        if (value instanceof Timestamp ? !(actual instanceof Timestamp) : typeof actual !== typeof value) return false;
        return op === '>=' ? scalar(actual) >= scalar(value) : scalar(actual) <= scalar(value);
      })).sort(compareRows);
  };
  const sdk = module => ({
    Timestamp,
    collection: (_db, name) => name,
    doc: (_db, collection, id) => ({ collection, id }),
    documentId: () => 'id',
    query: (collection, ...constraints) => ({ collection, constraints }),
    where: (field, op, value) => ({ field, op, value }),
    orderBy: (order, direction = 'asc') => ({ order, direction }),
    limit: limit => ({ limit }),
    startAfter: after => ({ after }),
    count: () => ({ op: 'count' }),
    sum: field => ({ op: 'sum', field }),
    async getDocsFromServer(query) {
      const rows = select(query);
      const after = query.constraints.find(clause => clause.after)?.after;
      const start = after ? rows.findIndex(row => row.id === after.id) + 1 : 0;
      if (after && !start) throw new Error('El cursor quedó fuera de la consulta de prueba.');
      const limit = query.constraints.find(clause => clause.limit)?.limit ?? rows.length;
      const docs = rows.slice(start, start + limit).map(row => docSnapshot(row));
      calls.push({ module, kind: 'query', documents: docs.length });
      return { size: docs.length, docs };
    },
    async getDocFromServer({ collection, id }) {
      const row = (records[collection] ?? []).find(row => row.id === id);
      calls.push({ module, kind: 'point', documents: Number(Boolean(row)) });
      return docSnapshot(row, id);
    },
    async getCountFromServer(query) {
      calls.push({ module, kind: 'aggregate', documents: 0 });
      return { data: () => ({ count: select(query).length }) };
    },
    async getAggregateFromServer(query, spec) {
      calls.push({ module, kind: 'aggregate', documents: 0 });
      const aggregations = Object.entries(spec);
      const fields = aggregations.filter(([, value]) => value.op === 'sum').map(([, value]) => value.field);
      const rows = select(query).filter(row => fields.every(field => fieldValue(row, field) !== undefined));
      return { data: () => Object.fromEntries(aggregations.map(([alias, { op, field }]) => [alias, op === 'count' ? rows.length
        : rows.reduce((total, row) => {
          const value = fieldValue(row, field);
          return Number.isFinite(value) ? total + value : total;
        }, 0)])) };
    },
  });
  return { calls, sdk };
}
