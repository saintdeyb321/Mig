// Diagnostic candidate for known Spark-shaped documents. Never imported by the application.
// This returns selected index totals, without evidence that a tenant has complete coverage.
export async function readAggregateCandidates(database, sdk, { businessId, branchId, period }) {
  const { collection, query, where, Timestamp, count, sum, getAggregateFromServer } = sdk;
  const scope = [where('businessId', '==', businessId), ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)])];
  const read = async (name, date, filters, fields) => {
    const from = where(date, '>=', Timestamp.fromDate(period.startDate)), to = where(date, '<=', Timestamp.fromDate(period.endDate));
    const projection = Object.fromEntries(Object.entries(fields).map(([label, field]) => [label, sum(field)]));
    const result = (await getAggregateFromServer(query(collection(database, name), ...scope, from, to, ...filters),
      { count: count(), ...projection })).data();
    return Object.fromEntries(Object.entries(result).map(([key, value]) => {
      const integer = key === 'count' ? value : Math.round(value * 100);
      if (!Number.isSafeInteger(integer) || key === 'count' && integer < 0) throw new Error('Agregación inválida.');
      return [key, integer];
    }));
  };
  const sales = (payment, fields) => read('sales', 'confirmedAt', [where('status', '==', 'confirmed'), payment], fields);
  const ledger = (types, methods) => read('payments', 'occurredAt',
    [where('type', 'in', types), where('method', 'in', methods)], { amount: 'amount' });
  const [cash, digital, mixed, voids, cashPayments, digitalPayments, cashRefunds, digitalRefunds] = await Promise.all([
    sales(where('payment', '==', 'efectivo'), { total: 'total' }),
    sales(where('payment', 'in', ['yape', 'plin']), { total: 'total' }),
    sales(where('payment', '==', 'mixto'), { total: 'total', cash: 'splitPayments.efectivo', digital: 'splitPayments.yape' }),
    read('pos_voids', 'occurredAt', [], { amount: 'amount', cash: 'cashAmount', digital: 'digitalAmount' }),
    ledger(['advance', 'payment'], ['efectivo']),
    ledger(['advance', 'payment'], ['yape', 'plin']),
    ledger(['refund'], ['efectivo']),
    ledger(['refund'], ['yape', 'plin']),
  ]);
  return {
    pos: { count: cash.count + digital.count + mixed.count, gross: cash.total + digital.total + mixed.total,
      cash: cash.total + mixed.cash, digital: digital.total + mixed.digital },
    voids, cashPayments, digitalPayments, cashRefunds, digitalRefunds,
  };
}
