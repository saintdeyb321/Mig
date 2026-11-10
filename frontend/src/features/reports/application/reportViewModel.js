import { contractCounts } from '../domain/sparkReport.js';
import { amount, reportRows } from '../domain/reportTotals.js';
import { cashAuditEvents } from './cashAuditRows.js';

export const HISTORICAL_REPORT_WARNING = 'Hay tickets históricos anulados sin comprobante vinculado en este período. El neto mostrado es provisional y requiere conciliación histórica.';

export function reportViewModel(model, contracts, scope, sessions = []) {
  const orders = reportRows(contracts.filter(row => row.createdAt != null), scope, row => row.createdAt);
  const cashEvents = cashAuditEvents(sessions, scope);
  const historyUnresolved = model.pos.sales.filter(({ row }) => row.voided).length;
  const productRevenue = new Map();
  for (const product of model.products) productRevenue.set(product.name, amount((productRevenue.get(product.name) ?? 0) + product.revenue));
  return {
    summary: model.summary,
    branches: [...model.branches.values()],
    topProducts: model.topProducts.map(product => ({ ...product, revenue: productRevenue.get(product.name) })),
    contractCounts: contractCounts(orders),
    orders,
    cashEvents,
    historyUnresolved,
    warning: historyUnresolved ? HISTORICAL_REPORT_WARNING : null,
  };
}
