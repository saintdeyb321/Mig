import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { reportPeriod, reportDay } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { createReportCache, reportCacheKey, createReportResource, invalidateReportScope } from '../frontend/src/features/reports/application/reportResource.js';
import { processDailyStats, processSales, DETAIL_HEADERS } from '../frontend/src/utils/salesDataProcessor.js';
import { buildContractLedgerReport } from '../frontend/src/features/reports/application/contractLedgerReport.js';
import { buildSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { createCashPeriodReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createSalesPeriodReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { compatiblePayments } from '../frontend/src/features/payments/application/compatiblePayments.js';
import { createSheet } from '../frontend/src/utils/excelHelpers.js';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const XLSX = require('xlsx-js-style');
const day = '2026-10-22', date = hour => `${day}T${hour}:00:00-05:00`, period = reportPeriod('hoy', date('12'));
const scope = { businessId: 'tenant-a', branchId: 'global', period };
const base = { businessId: 'tenant-a', branchId: 'b1', createdAt: date('10'), cashierName: 'Cajero' };
const item = { id: 'p1', name: 'Pan', qty: 1, price: 20 };
const sales = [{ ...base, id: 's1', total: 40, payment: 'mixto', splitPayments: { efectivo: 15, yape: 25 }, items: [{ ...item, qty: 2 }] },
  { ...base, id: 's2', createdAt: date('11'), total: 20, payment: 'efectivo', items: [item] },
  { ...base, id: 's3', createdAt: date('14'), total: 30, payment: 'efectivo', voided: true, items: [{ ...item, price: 30 }] }];
const stats = [{ businessId: 'tenant-a', branchId: 'b1', date: day, totalRevenue: 60, totalOrders: 2, voidedOrders: 1,
  'paymentMethods.efectivo': 35, 'paymentMethods.yape': 25, 'productSales.p1.name': 'Pan', 'productSales.p1.qty': 3, 'productSales.p1.revenue': 60 }];
const payments = [{ ...base, id: 'a', sourceId: 'doc-id', contractNumber: 'PED-100', type: 'advance', amount: 20, method: 'efectivo', occurredAt: date('09') },
  { ...base, id: 'b', branchId: 'b2', sourceId: 'doc-id', contractNumber: 'PED-100', type: 'payment', amount: 15, method: 'plin', occurredAt: date('12') },
  { ...base, id: 'c', sourceId: 'doc-id', contractNumber: 'PED-100', type: 'refund', amount: -5, method: 'efectivo', occurredAt: date('13') }];
const branchesMap = { b1: 'Centro', b2: 'Taller' };
const build = options => buildSalesWorkbook(XLSX, { ...scope, stats, sales, payments, branchesMap, ...options });
const rows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
const tick = () => new Promise(resolve => setImmediate(resolve));

describe('Phase 7 canonical financial reports', () => {
  it('normal POS sale records one net ticket', () => {
    const result = aggregateReport({ sales: [sales[1]], ...scope }).summary;
    assert.equal(result.posRevenue, 20); assert.equal(result.posTicketCount, 1);
  });
  it('a void is excluded from money and tracked separately', () => {
    const result = aggregateReport({ sales: [sales[2]], ...scope }).summary;
    assert.equal(result.posRevenue, 0); assert.equal(result.posTicketCount, 0); assert.equal(result.voidedTicketCount, 1);
  });
  it('net totalOrders and totalRevenue are never reduced a second time', () => {
    const result = aggregateReport({ stats, ...scope }).summary;
    assert.equal(result.posRevenue, 60); assert.equal(result.posTicketCount, 2); assert.equal(result.voidedTicketCount, 1);
    const equalCounts = { ...stats[0], totalOrders: 1, voidedOrders: 1 };
    assert.equal(aggregateReport({ stats: [equalCounts] }).summary.posRevenue, 60);
  });
  it('mixed POS reconciles cash and digital', () => {
    const result = aggregateReport({ sales: [sales[0]], ...scope }).summary;
    assert.equal(result.cashRevenue, 15); assert.equal(result.digitalRevenue, 25);
  });
  it('several contract payments sum their movements, not the commercial total', () => {
    const result = aggregateReport({ payments, ...scope }).summary;
    assert.equal(result.contractRevenue, 30); assert.equal(result.contractPaymentCount, 2); assert.equal(result.posTicketCount, 0);
  });
  it('refunds remain negative and never count as new tickets', () => {
    const result = aggregateReport({ payments: [payments[2]], ...scope }).summary;
    assert.equal(result.netRevenue, -5); assert.equal(result.refunds, -5); assert.equal(result.contractPaymentCount, 0);
    assert.equal(aggregateReport({ payments: [payments[2]], ...scope }).chartData[0].ventas, -5);
  });
  it('payment IDs are counted once even during overlapping reads', () => {
    assert.equal(aggregateReport({ payments: [...payments, payments[0]], ...scope }).summary.contractRevenue, 30);
  });
  it('payments use their real branch rather than contract origin', () => {
    const result = aggregateReport({ payments, ...scope });
    assert.equal(result.branches.get('b1').contractRevenue, 15); assert.equal(result.branches.get('b2').contractRevenue, 15);
  });
  it('POS average excludes contract cash', () => {
    const result = aggregateReport({ stats, payments, ...scope }).summary;
    assert.equal(result.netRevenue, 90); assert.equal(result.posAverageTicket, 30);
  });
  it('global equals the sum of branches and rejects other tenants', () => {
    const result = aggregateReport({ stats, payments: [...payments, { ...payments[0], id: 'foreign', businessId: 'tenant-b' }], ...scope });
    assert.equal([...result.branches.values()].reduce((sum, row) => sum + row.netRevenue, 0), result.summary.netRevenue);
    assert.equal(result.summary.netRevenue, 90);
    assert.equal(aggregateReport({ stats, payments, ...scope, branchId: 'b2' }).summary.netRevenue, 15);
  });
  it('POS and contract income on the same Lima day merge into one canonical daily row', () => {
    const result = processDailyStats(stats, payments, scope).dailyRowsByBranch.b1;
    assert.equal(result.length, 1); assert.equal(result[0].Fecha, '22/10/2026'); assert.equal(result[0].Ingreso, 75);
    assert.equal(result[0]['Tickets POS'], 2); assert.equal(result[0]['Pagos Pedidos'], 1);
  });
  it('details are ordered by real timestamps within a day', () => {
    const result = processSales(sales, branchesMap, [...payments].reverse(), scope).ticketsRowsByBranch.b1;
    const firstRows = result.filter(row => row.Hora);
    assert.deepEqual(firstRows.map(row => row.Hora), ['09:00', '10:00', '11:00', '13:00', '14:00']);
  });
  it('every POS/payment/total detail row uses the same columns', () => {
    const result = processSales(sales, branchesMap, payments, scope).ticketsRowsByBranch;
    for (const row of Object.values(result).flat()) assert.deepEqual(Object.keys(row), DETAIL_HEADERS);
  });
  it('invalid money or unreconciled splits never become NaN, Infinity or plausible partial totals', () => {
    assert.throws(() => aggregateReport({ stats: [{ ...stats[0], totalRevenue: Infinity }] }));
    assert.throws(() => aggregateReport({ stats: [{ ...stats[0], totalRevenue: NaN }] }));
    assert.throws(() => aggregateReport({ payments: [{ ...payments[0], method: 'mixto', splitPayments: { efectivo: 1 } }] }));
    assert.throws(() => createSheet(XLSX, [{ Ingreso: NaN }], []));
    assert.throws(() => processSales([{ ...sales[1], total: 100 }], branchesMap), /no concilia/);
  });
  it('nested and dotted legacy aggregate increments combine without shadowing zero fields', () => {
    const stat = { ...stats[0], totalRevenue: 70, paymentMethods: { efectivo: 10, yape: 0 }, productSales: { p1: { name: 'Pan', qty: 1, revenue: 10 } } };
    const result = aggregateReport({ stats: [stat] });
    assert.equal(result.summary.cashRevenue, 45); assert.equal(result.products[0].qty, 4); assert.equal(result.products[0].revenue, 70);
  });
  it('empty data yields explicit zeros and a complete date skeleton', () => {
    const result = aggregateReport(scope); assert.equal(result.summary.netRevenue, 0); assert.equal(result.summary.posAverageTicket, 0);
    assert.equal(result.chartData.length, 1); assert.equal(result.topProducts.length, 0);
    assert.deepEqual(build({ stats: [], sales: [], payments: [] }).workbook.SheetNames, ['Resumen_Financiero']);
  });
  it('Lima day/week/month/year boundaries ignore the browser timezone', () => {
    assert.equal(reportDay('2026-01-01T04:59:59Z'), '2025-12-31');
    assert.equal(reportPeriod('todo', '2026-01-01T04:59:59Z').start, '2025-01-01');
    const week = reportPeriod('semana', '2026-10-26T04:59:59Z');
    assert.equal(week.start, '2026-10-19'); assert.equal(week.end, '2026-10-25');
    assert.equal(reportPeriod('mes', '2024-02-29T12:00:00Z').end, '2024-02-29');
    assert.equal(period.startDate.toISOString(), '2026-10-22T05:00:00.000Z');
    assert.equal(period.endDate.toISOString(), '2026-10-23T04:59:59.999Z');
  });
  it('a partial legacy migration is never presented as a definitive report', async () => {
    await assert.rejects(compatiblePayments({}, async () => payments, async () => ({ payments: [], partialMigrations: 1 }), { requireMigrated: true }), /incompleta/);
  });
});

describe('Phase 7 workbooks in memory', () => {
  it('detailed and monthly summaries reconcile with both detail money columns and branches', () => {
    const detailed = build({ detailed: true });
    const detail = detailed.workbook.SheetNames.filter(name => name.startsWith('Detalle_')).flatMap(name => rows(detailed.workbook, name));
    assert.equal(detail.reduce((sum, row) => sum + Number(row.Subtotal || 0), 0), 90);
    assert.equal(detail.reduce((sum, row) => sum + Number(row['Total movimiento (S/)'] || 0), 0), 90);
    assert.equal(rows(detailed.workbook, 'Comparativa_Sedes').reduce((sum, row) => sum + row['Ventas Sistema (S/)'], 0), 90);
    const monthly = build({ period: reportPeriod('mes', date('12')), detailed: false });
    const daily = monthly.workbook.SheetNames.filter(name => name.startsWith('Resum_')).flatMap(name => rows(monthly.workbook, name));
    assert.equal(daily.reduce((sum, row) => sum + row.Ingreso, 0), 90);
    assert.deepEqual(monthly.model.summary, detailed.model.summary);
  });
  it('contract audit uses document ID separately from commercial number, payment date and negative refunds', () => {
    const result = buildContractLedgerReport(payments, [{ id: 'doc-id', contractNumber: 'COM-100', total: 1000, updatedAt: '2030-01-01' }], branchesMap);
    assert.equal(result.contractPaymentRows.length, 3);
    assert.equal(result.contractPaymentRows[0]['ID Pedido'], 'COM-100'); assert.equal(result.contractPaymentRows[0]['Documento Pedido'], 'doc-id');
    assert.equal(result.contractPaymentRows[0]['Fecha Pago'], '22/10/2026 09:00');
    assert.equal(result.contractPaymentRows[2]['Reembolso (S/)'], -5);
    assert.equal(result.paymentsByBranch.b1[0].method, 'efectivo');
  });
  it('XLSX serializes and reads back with no helper columns or nonfinite cells', () => {
    const { workbook } = build({ sessions: [{ ...base, openedAt: date('08'), closedAt: date('15'), status: 'closed_with_discrepancy', declaredAmount: null, expectedCash: 75,
      requiresFinancialReview: true, openingAmount: 10, openingDiscrepancy: 0 }] });
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const restored = XLSX.read(buffer, { type: 'buffer' });
    assert.ok(restored.SheetNames.includes('Auditoría_Cajas')); assert.ok(restored.SheetNames.includes('Productos_Global'));
    for (const sheet of Object.values(restored.Sheets)) for (const [key, cell] of Object.entries(sheet)) {
      if (key.startsWith('!')) continue;
      if (cell.t === 'n') assert.ok(Number.isFinite(cell.v));
      assert.ok(!String(cell.v).startsWith('_sortDate'));
    }
    assert.equal(rows(workbook, 'Auditoría_Cajas')[1]['Contado Real (S/)'], 'Pendiente');
  });
  it('cash audit includes an overnight session closing in the selected Lima day', () => {
    const { workbook } = build({ sessions: [{ ...base, openedAt: '2026-10-21T23:00:00-05:00', closedAt: date('08'), status: 'closed',
      openingAmount: 10, openingDiscrepancy: 0, declaredAmount: 75, expectedCash: 75, difference: 0 }] });
    const audit = rows(workbook, 'Auditoría_Cajas');
    assert.equal(audit.length, 1); assert.equal(audit[0]['Fecha Cierre'], '22/10/2026'); assert.match(audit[0].Turno, /CIERRE/);
    assert.equal(build({}).model.summary.netRevenue, 90);
  });
  it('sanitized or truncated branch names cannot duplicate workbook sheet names', () => {
    const { workbook } = build({ branchesMap: { b1: 'A/'.padEnd(50, 'x'), b2: 'A:'.padEnd(50, 'x') } });
    assert.equal(new Set(workbook.SheetNames.map(name => name.toLowerCase())).size, workbook.SheetNames.length);
    assert.ok(workbook.SheetNames.every(name => name.length <= 31));
  });
  it('a huge line-item dataset is refused before allocating worksheet rows', () => {
    assert.throws(() => build({ sales: [{ ...sales[0], items: Array(10001).fill(item) }] }), /Demasiadas filas/);
  });
});

describe('Phase 7 bounded data and lifecycle', () => {
  it('sales pagination requests at most maxRows+1 records and stops immediately', async () => {
    let requests = 0, downloaded = 0;
    const options = (...args) => args;
    const sdk = { collection: options, where: options, orderBy: options, documentId: () => 'id', startAfter: options,
      Timestamp: { fromDate: value => value }, query: (...constraints) => constraints, limit: value => ({ limit: value }), getDocsFromServer: async constraints => {
        requests++; const n = constraints.find(value => value?.limit).limit; downloaded += n;
        const docs = Array.from({ length: n }, (_, index) => ({ id: String(index), data: () => ({ businessId: 'tenant-a' }) }));
        return { docs, size: docs.length };
      } };
    const read = createSalesPeriodReader({}, { sdk });
    await assert.rejects(read('tenant-a', period.startDate, period.endDate, { maxRows: 201 }), /Demasiados tickets/);
    assert.equal(requests, 2); assert.equal(downloaded, 202);
  });
  it('cache is tenant/branch/period isolated, bounded and expires', () => {
    let now = 0;
    const cache = createReportCache({ now: () => now, max: 2 });
    const key = reportCacheKey({ ...scope, identityKey: 'u1' });
    cache.set(key, { loadedAt: now });
    assert.equal(cache.get(reportCacheKey({ ...scope, businessId: 'tenant-b', identityKey: 'u1' })), null);
    assert.equal(cache.get(reportCacheKey({ ...scope, branchId: 'b2', identityKey: 'u1' })), null);
    now = 30001; assert.equal(cache.get(key), null);
    for (const value of ['a', 'b', 'c']) cache.set(value, { loadedAt: now });
    assert.equal(cache.size, 2); assert.equal(cache.get('a'), null);
  });
  it('repeated POS snapshots reuse payments, but TTL refresh fetches them again', async () => {
    let reads = 0, snapshot, now = 0, state;
    const resource = createReportResource({ ...scope, key: 'one', now: () => now, cache: createReportCache({ now: () => now }),
      readStats: async () => stats, readPayments: async () => { reads++; return payments; },
      subscribeStats: onData => { snapshot = onData; return () => {}; }, onState: next => { state = next; } });
    await resource.ready; snapshot(stats); snapshot(stats); snapshot(stats);
    assert.equal(reads, 1); assert.equal(state.model.summary.netRevenue, 90);
    now = 120001; await resource.refresh(); assert.equal(reads, 2);
    resource.close();
  });
  for (const filter of ['mes', 'todo']) it(`${filter} does not reload its historical ledger every 30s; focus/manual refresh deduplicates pending reads`, async () => {
    let now = 0, reads = 0, release;
    const history = reportPeriod(filter, date('12')), cache = createReportCache({ now: () => now });
    const resource = createReportResource({ ...scope, period: history, key: filter, cache, now: () => now,
      readStats: async () => stats, readPayments: async () => { reads++; if (reads > 1) await new Promise(resolve => { release = resolve; }); return payments; }, onState: () => {} });
    await resource.ready;
    for (let tick = 1; tick <= 20; tick++) { now = tick * 30000; await resource.refresh(); }
    assert.equal(reads, 1); assert.ok(cache.get(filter));
    const focus = resource.refresh(true), manual = resource.refresh(true);
    assert.equal(reads, 2); release(); await Promise.all([focus, manual]);
    now += 15 * 60000 + 1;
    const expired = resource.refresh(); assert.equal(reads, 3); release(); await expired;
    resource.close(); await resource.refresh(true); assert.equal(reads, 3);
  });
  it('late callbacks after scope changes cannot publish or cache old tenant results', async () => {
    let finish, states = 0;
    const cache = createReportCache();
    const resource = createReportResource({ ...scope, key: 'old', cache, readStats: async () => stats,
      readPayments: () => new Promise(resolve => { finish = resolve; }), onState: () => { states++; } });
    resource.close(); finish(payments); await tick();
    assert.equal(states, 1); assert.equal(cache.get('old'), null);
  });
  it('ledger errors clear definitive figures and a successful retry recovers', async () => {
    let fail = true, state;
    const resource = createReportResource({ ...scope, key: 'failure', cache: createReportCache(), readStats: async () => stats,
      readPayments: async () => { if (fail) throw Error('Migración incompleta'); return payments; }, onState: next => { state = next; } });
    await resource.ready; assert.equal(state.model, null); assert.equal(state.isLoading, false); assert.match(state.error, /incompleta/);
    fail = false; await resource.refresh(true); assert.equal(state.model.summary.netRevenue, 90); assert.equal(state.error, null);
    resource.close();
  });
  it('retrying a failed live stats subscription reads fresh stats instead of reviving stale figures', async () => {
    let onError, reads = 0, state;
    const resource = createReportResource({ ...scope, key: 'live-error', cache: createReportCache(),
      readStats: async () => { reads++; return stats; }, readPayments: async () => payments,
      subscribeStats: (_onData, fail) => { onError = fail; return () => {}; }, onState: next => { state = next; } });
    await resource.ready; onError(Error('Stats unavailable')); assert.equal(state.model, null);
    await resource.refresh(true); assert.equal(reads, 2); assert.equal(state.model.summary.netRevenue, 90);
    resource.close();
  });
});

describe('Plan04 cash export cursor limits', () => {
  for (const count of [0, 1, 5]) it('reads ' + count + ' ISO/Timestamp sessions in small pages, once by ID', async () => {
    let reads = 0;
    const options = (...args) => args;
    const sdk = { collection: options, where: options, orderBy: options, documentId: () => 'id', startAfter: row => ({ cursor: row }),
      Timestamp: { fromDate: value => value }, query: (...constraints) => constraints, limit: n => ({ limit: n }),
      getDocsFromServer: async constraints => {
        reads++; const size = constraints.find(c => c?.limit).limit;
        assert.ok(size > 0 && size <= 2);
        const offset = constraints.find(c => c?.cursor)?.cursor.offset ?? 0;
        const docs = Array.from({ length: Math.min(size, Math.max(0, count - offset)) }, (_, i) => ({ id: 's' + (offset + i), offset: offset + i + 1, data: () => ({ businessId: 'tenant-a' }) }));
        return { docs, size: docs.length };
      } };
    const reader = createCashPeriodReader({}, { sdk });
    const result = await reader('openedAt', 'tenant-a', period.startDate, period.endDate, 'b1', { pageSize: 2 });
    assert.equal(result.length, count); assert.ok(reads <= 2 * (Math.floor(count / 2) + 1));
    if (count > 2) await assert.rejects(reader('openedAt', 'tenant-a', period.startDate, period.endDate, 'b1', { pageSize: 2, maxRows: 2 }), /no se exportó.*parcial/);
  });
});

it('Plan04 retains an expired report only as presentation while a single refresh is pending', async () => {
  let now = 0, calls = 0, release, state;
  const cache = createReportCache({ now: () => now });
  const first = createReportResource({ ...scope, key: 'display', cache, now: () => now, readStats: async () => stats,
    readPayments: async () => [], onState: next => { state = next; } });
  await first.ready; first.close(); now = 120001;
  const second = createReportResource({ ...scope, key: 'display', cache, now: () => now, readStats: async () => stats,
    readPayments: () => { calls++; return new Promise(resolve => { release = resolve; }); }, onState: next => { state = next; } });
  assert.ok(state.model); assert.equal(state.isLoading, false); assert.equal(state.isRefreshing, true);
  const pending = second.refresh(); assert.equal(calls, 1);
  release([]); await pending; assert.equal(state.isRefreshing, false); second.close();
});
it('Plan04 invalidates only the affected branch and its global summaries', async () => {
  const { createSessionResources } = await import('../frontend/src/core/session/sessionResources.js');
  const resources = createSessionResources();
  const cache = resources.value('report:cache', createReportCache);
  const key = branchId => reportCacheKey({ ...scope, identityKey: 'u1', branchId });
  for (const branch of ['b1', 'b2', 'global']) {
    cache.set(key(branch), { loadedAt: Date.now() });
    await resources.read('report:sales:' + JSON.stringify([scope.businessId, branch, period.start, period.end]), async () => branch);
  }
  invalidateReportScope(resources, scope.businessId, 'b1');
  assert.equal(cache.peek(key('b1')), null); assert.equal(cache.peek(key('global')), null); assert.ok(cache.peek(key('b2')));
  let loads = 0;
  const read = branch => resources.read('report:sales:' + JSON.stringify([scope.businessId, branch, period.start, period.end]), async () => { loads++; return branch; });
  await read('b2'); assert.equal(loads, 0); await read('b1'); assert.equal(loads, 1); resources.close();
});
