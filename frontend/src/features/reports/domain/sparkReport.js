import { saleDay, statsDelta, money } from '../../sales/domain/saleModel.js';

// Same domain projection as the historical engine, derived on demand from confirmed documents.
export function salesToDailyStats(sales) {
  const days = new Map();
  for (const sale of sales) {
    const date = saleDay(sale), key = JSON.stringify([sale.businessId, sale.branchId, date]);
    const row = days.get(key) ?? { businessId: sale.businessId, branchId: sale.branchId, date };
    const delta = sale.voided ? { voidedOrders: 1 } : statsDelta({ ...sale, items: (sale.items ?? []).map(item => ({ ...item, id: item.id ?? item.name })) });
    for (const [field, value] of Object.entries(delta)) {
      // Old tickets may lack cost/profit. Do not invent either amount in historical summaries.
      if (typeof value === 'number' && !Number.isFinite(value) && ['totalCost', 'grossProfit'].includes(field)) continue;
      row[field] = typeof value === 'number' ? money((row[field] ?? 0) + value) : value;
    }
    days.set(key, row);
  }
  return [...days.values()];
}

export function contractCounts(contracts = []) {
  return contracts.reduce((counts, contract) => {
    if (contract.status === 'cancelado') counts.cancelled++;
    else if (['entregado', 'entregado_con_deuda'].includes(contract.status)) counts.delivered++;
    else counts.pending++;
    if (contract.status !== 'cancelado' && contract.balance > 0) counts.withDebt++;
    return counts;
  }, { pending: 0, delivered: 0, cancelled: 0, withDebt: 0 });
}
