import { contractCounts } from '../domain/sparkReport.js';
import { amount, reportRows } from '../domain/reportTotals.js';
import { cashAuditEvents } from './cashAuditRows.js';
import { branchReportName, reportLabel } from './reportNames.js';

export const HISTORICAL_REPORT_WARNING = 'Hay tickets históricos anulados sin comprobante vinculado en este período. El neto mostrado es provisional y requiere conciliación histórica.';

export function reportViewModel(model, contracts, scope, sessions = [], { branchesMap = {}, people, branchIds } = {}) {
  const orders = reportRows(contracts.filter(row => row.createdAt != null), scope, row => row.createdAt);
  const cashEvents = cashAuditEvents(sessions, scope, { branchesMap, people });
  const historyUnresolved = model.pos.sales.filter(({ row }) => row.voided).length;
  const productRevenue = new Map();
  for (const product of model.products) productRevenue.set(product.name, amount((productRevenue.get(product.name) ?? 0) + product.revenue));
  const comparisons = branchIds ? [...new Set([...branchIds, ...model.branches.keys()])].map(id => {
    const metrics = model.branches.get(id);
    return { name: branchReportName(branchesMap, id), pos: metrics?.posRevenue ?? 0,
      orders: metrics?.contractRevenue ?? 0, net: metrics?.netRevenue ?? 0 };
  }) : [];
  return {
    summary: model.summary,
    branches: [...model.branches.values()].map(({ branchId, ...metrics }) => ({ ...metrics, name: branchReportName(branchesMap, branchId) })),
    comparisons,
    collections: amount(model.summary.channels.cash.collections + model.summary.channels.digital.collections),
    topProducts: model.topProducts.map(product => ({ ...product, name: reportLabel(product.name, 'Producto sin nombre'),
      revenue: productRevenue.get(product.name) })),
    contractCounts: contractCounts(orders),
    orderCount: orders.length,
    cashEvents,
    historyUnresolved,
    warning: historyUnresolved ? HISTORICAL_REPORT_WARNING : null,
  };
}
