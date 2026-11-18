import { blank, financial, get, groupDays, total } from '../../../../../functions/src/reports/summaryModel.js';
import { chartSkeleton } from '../domain/reportPeriod.js';

const soles = cents => cents / 100;
export function summaryMetrics(values) {
  const finance = financial(values);
  const channel = value => Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, soles(amount)]));
  const tickets = get(values, 'tickets');
  return { netRevenue: soles(finance.net), posRevenue: soles(finance.pos), contractRevenue: soles(finance.orders),
    cashRevenue: soles(finance.cash.net), digitalRevenue: soles(finance.digital.net), posTicketCount: tickets,
    voidedTicketCount: get(values, 'voids'), contractPaymentCount: get(values, 'advances') + get(values, 'payments'),
    refundCount: get(values, 'refunds') + get(values, 'voids'), posAverageTicket: tickets ? Math.round(finance.pos / tickets) / 100 : 0,
    channels: { cash: channel(finance.cash), digital: channel(finance.digital) } };
}
export function buildSummaryView(data, period) {
  const values = total(data.rows);
  const bucket = row => period.filter === 'todo' ? row.day.slice(0, 7) : row.day;
  const recorded = groupDays(data.rows, bucket);
  const byDate = new Map(recorded.map(row => [row.key, row.values]));
  // Only elapsed months require verified coverage. Future calendar slots never
  // request or certify future snapshots.
  const calendar = chartSkeleton(period);
  const evolution = period.filter === 'todo'
    ? calendar.map(day => ({ key: day.rawDate, values: byDate.get(day.rawDate) ?? blank() })) : recorded;
  const chartData = calendar.map(day => {
      const values = byDate.get(day.rawDate);
      return values ? { ...day, ventas: soles(financial(values).net), ordenes: get(values, 'tickets'),
        pagos: get(values, 'advances') + get(values, 'payments') } : day;
  });
  const groups = groupDays(data.rows, row => JSON.stringify([row.branchId, bucket(row)]))
    .map(row => { const [branchId, date] = JSON.parse(row.key); return { branchId, date, values: row.values }; });
  const byBranch = new Map(groupDays(data.rows, row => row.branchId).map(row => [row.key, row.values]));
  const branches = [...new Set([...data.branchIds, ...byBranch.keys()])].sort().map(key => ({ key, values: byBranch.get(key) ?? blank() }));
  return { ...data, values, summary: summaryMetrics(values), chartData, groups, evolution,
    branches, topProducts: data.top,
    contractCounts: { pending: get(values, 'pending'), delivered: get(values, 'delivered'),
      cancelled: get(values, 'createdCancelled'), withDebt: get(values, 'debt') }, view: { warning: null } };
}
