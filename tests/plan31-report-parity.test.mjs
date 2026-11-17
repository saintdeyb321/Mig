import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { createContractCancellationCountReader } from '../frontend/src/features/contracts/infrastructure/contractPeriodRepository.js';
import { compatiblePayments } from '../frontend/src/features/payments/application/compatiblePayments.js';
import { legacyPaymentView } from '../frontend/src/features/payments/infrastructure/sparkLegacyPayments.js';
import { buildSalesWorkbook, writeSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { managementReportHtml, cashReviewPresentation } from '../frontend/src/features/reports/application/managementReportHtml.js';
import { reportViewModel } from '../frontend/src/features/reports/application/reportViewModel.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { readOverview } from './helpers/reportWorkbook.mjs';
import { reportQueryFixture } from './helpers/reportQueryFixture.mjs';
import { readAggregateCandidates } from './helpers/reportAggregationPrototype.mjs';

const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
const businessId = 'p31-tenant';
const business = { businessId, branchId: 'global' };
const center = { businessId, branchId: 'centro' }, workshop = { businessId, branchId: 'taller' };
const stamp = value => Timestamp.fromDate(new Date(value));
const october = stamp('2026-10-31T23:59:59.999-05:00');
const november = stamp('2026-11-01T00:00:00.000-05:00');
const periods = {
  oct: reportPeriod('mes', october.toDate()),
  nov: reportPeriod('mes', november.toDate()),
  year: reportPeriod('todo', november.toDate()),
};
const cents = value => Math.round(value * 100) || 0;
const salesTicket = (id, total, payment, createdAt, scope = center) => ({ ...scope, id, saleId: id, total, payment,
  status: 'confirmed', createdAt, confirmedAt: createdAt, items: [{ id: 'pan', name: 'Pan', qty: 1, price: total }] });
const ledgerEntry = (id, amount, method, occurredAt, type = 'payment', scope = center) => ({
  ...scope, id, amount, method, occurredAt, type, sourceId: 'older-order', sourceType: 'contract',
});
const compensation = (sale, cash, digital, occurredAt) => ({
  id: sale.id, saleId: sale.id, businessId: sale.businessId, branchId: sale.branchId, authority: 'pos-compensation',
  amount: -sale.total, cashAmount: cash, digitalAmount: digital, items: sale.items, occurredAt,
});

it('P31-A prototypes eight count/sum queries with cent-for-cent parity for canonical Spark across month boundaries, sites and channels', async () => {
  const mix = { ...salesTicket('mixed', 30.05, 'mixto', october), splitPayments: { efectivo: 12.10, yape: 17.95 } };
  const sales = [mix, salesTicket('cash', 20.10, 'efectivo', november), salesTicket('plin', 3.20, 'plin', november, workshop),
    { ...salesTicket('foreign', 99, 'efectivo', november), businessId: 'foreign' }];
  const voids = [compensation(mix, -12.10, -17.95, november)];
  const payments = [ledgerEntry('advance', 11.05, 'efectivo', october, 'advance'), ledgerEntry('payment', 13.95, 'yape', october),
    ledgerEntry('refund-cash', -11.05, 'efectivo', november, 'refund'), ledgerEntry('refund-digital', -13.95, 'yape', november, 'refund'),
    ledgerEntry('new-payment', 1.25, 'plin', november, 'payment', workshop)];
  const contracts = [{ ...center, id: 'older-order', status: 'cancelado', createdAt: october, voidedAt: november, balance: 0 },
    { ...workshop, id: 'never-paid', status: 'cancelado', createdAt: october, voidedAt: november, paidTotal: 0, balance: 0 },
    { ...center, id: 'historical-undated', status: 'cancelado', createdAt: october }];
  const { calls, sdk } = reportQueryFixture({ sales, pos_voids: voids, payments, contracts });
  const read = scope => readAggregateCandidates({}, sdk('prototype'), scope);
  const countCancelled = createContractCancellationCountReader({}, { sdk: sdk('cancelledCount') });
  for (const [period, branchId] of [[periods.oct, 'global'], [periods.nov, 'global'], [periods.year, 'global'], [periods.year, 'taller']]) {
    const input = { ...business, branchId, period, sales, payments, voids };
    const before = calls.length;
    const candidate = await read(input);
    const { summary } = aggregateReport(input), { pos, voids: adjustment, cashPayments, digitalPayments, cashRefunds, digitalRefunds } = candidate;
    const { cash, digital } = summary.channels;
    assert.deepEqual(calls.slice(before).map(({ kind, documents }) => [kind, documents]), Array.from({ length: 8 }, () => ['aggregate', 0]));
    assert.equal(pos.count, summary.posTicketCount);
    assert.equal(adjustment.count, summary.voidedTicketCount);
    assert.equal(cashPayments.count + digitalPayments.count, summary.contractPaymentCount);
    assert.equal(cashRefunds.count + digitalRefunds.count + adjustment.count, summary.refundCount);
    assert.equal(pos.gross + adjustment.amount, cents(summary.posRevenue));
    assert.equal(cashPayments.amount + digitalPayments.amount + cashRefunds.amount + digitalRefunds.amount, cents(summary.contractRevenue));
    assert.deepEqual([pos.cash + cashPayments.amount, adjustment.cash, cashRefunds.amount],
      [cash.collections, cash.posCompensations, cash.contractRefunds].map(cents));
    assert.deepEqual([pos.digital + digitalPayments.amount, adjustment.digital, digitalRefunds.amount],
      [digital.collections, digital.posCompensations, digital.contractRefunds].map(cents));
    const netCash = pos.cash + cashPayments.amount + adjustment.cash + cashRefunds.amount;
    const netDigital = pos.digital + digitalPayments.amount + adjustment.digital + digitalRefunds.amount;
    assert.equal(netCash + netDigital, cents(summary.netRevenue));
    assert.deepEqual([netCash, netDigital], [cents(cash.net), cents(digital.net)]);
  }
  assert.equal(await countCancelled(businessId, periods.oct), 0);
  const novemberCancellations = await countCancelled(businessId, periods.nov);
  assert.equal(novemberCancellations, 2, 'Dos pedidos anulados aunque solo uno tenga reembolsos');
  const inputs = { ...business, period: periods.nov, sales, payments, voids, contracts, cancelledContractCount: novemberCancellations };
  const model = aggregateReport(inputs);
  assert.equal(model.summary.netRevenue, -30.50);
  const view = reportViewModel(model, contracts, inputs);
  assert.equal(view.contractCounts.cancelled, 0, 'El estado actual se limita a pedidos creados en noviembre');
  const { workbook } = buildSalesWorkbook(XLSX, { ...inputs, model });
  const copy = XLSX.read(writeSalesWorkbook(XLSX, workbook), { type: 'array' });
  assert.equal(readOverview(XLSX, copy)['Total neto registrado (S/)'], model.summary.netRevenue);
  const cover = XLSX.utils.sheet_to_json(copy.Sheets.Resumen_Financiero, { header: 1 });
  assert.equal(cover.find(([label]) => label === 'PEDIDOS ANULADOS')[1], 2);
  const html = managementReportHtml(view, { period: periods.nov, business: 'Panadería', branch: 'Todas', operator: 'Operador',
    generatedAt: periods.nov.endDate });
  assert.match(html, /Total neto registrado<strong>S\/ -30\.50<\/strong>/);
  assert.equal(cents(aggregateReport({ ...inputs, period: periods.oct }).summary.netRevenue) + cents(model.summary.netRevenue),
    cents(aggregateReport({ ...inputs, period: periods.year }).summary.netRevenue));
});

it('P31-A finds the legacy coverage gaps and retains parity for verified ledger/P30 counts', async () => {
  const legacy = { ...salesTicket('legacy', 10.05, 'mixto', november), status: undefined, confirmedAt: undefined,
    createdAt: november.toDate().toISOString(), splitPayments: { efectivo: 1.05, plin: 9 } };
  const historicalVoid = { ...legacy, id: 'void-without-proof', saleId: 'void-without-proof', voided: true };
  const prior = { ...center, id: 'old-embed', createdAt: october, voidedAt: november, status: 'cancelado',
    payments: [{ amount: '5.55', method: 'yape/plin', date: november.toDate().toISOString(), branchId: 'centro' }] };
  const [converted] = await legacyPaymentView(prior.id, prior, { Timestamp });
  const canonical = ledgerEntry('spark-only', 2.25, 'efectivo', november);
  const records = { sales: [legacy, historicalVoid], contracts: [prior], payments: [canonical] };
  const fixture = reportQueryFixture(records);
  const scope = { ...business, period: periods.nov };
  const route = fixture.sdk('prototype');
  const first = await readAggregateCandidates({}, route, scope);
  const readCount = createContractCancellationCountReader({}, { sdk: fixture.sdk('count') });
  assert.equal(await readCount(businessId, periods.nov), 1);
  const readWithLegacy = () => compatiblePayments({}, async () => records.payments, async () => ({ payments: [converted] }), { requireMigrated: true });
  const detailed = aggregateReport({ ...scope, sales: records.sales, payments: await readWithLegacy() });
  const rawTotal = (await route.getAggregateFromServer(route.query('sales', route.where('businessId', '==', businessId)),
    { total: route.sum('total') })).data();
  assert.equal(first.cashPayments.amount, cents(detailed.summary.contractCash));
  assert.notEqual(first.digitalPayments.amount, cents(detailed.summary.contractDigital), 'El movimiento embebido aún no tiene fila en payments');
  assert.equal(first.pos.count, 0);
  assert.equal(detailed.summary.posTicketCount, 1);
  assert.equal(detailed.summary.voidedTicketCount, 1);
  assert.equal(cents(rawTotal.total), 2010);
  assert.equal(detailed.summary.posRevenue, 10.05, 'El bruto incluye un histórico no conciliado');
  assert.equal(reportViewModel(detailed, records.contracts, scope).historyUnresolved, 1);
  records.payments.push(converted);
  const migrated = await readAggregateCandidates({}, route, scope);
  const deduplicated = await readWithLegacy();
  assert.equal(deduplicated.length, 2);
  assert.equal(migrated.digitalPayments.amount, cents(detailed.summary.contractDigital));
  assert.equal(aggregateReport({ ...scope, sales: records.sales, payments: deduplicated }).summary.netRevenue, detailed.summary.netRevenue);
  records.sales[0] = { ...legacy, status: 'confirmed', confirmedAt: november };
  assert.equal((await readAggregateCandidates({}, route, scope)).pos.count, 0, 'La suma combinada excluye el mixto Plin sin campo Yape');
});

it('P31-A leaves cash evidence and Top 5 outside the prototype where field sums or monthly rankings lose information', () => {
  const hour = 3600000, baseTime = november.toMillis();
  const opening = { ...center, openingAmount: 100, openedAt: stamp(baseTime), userId: 'cashier' };
  const sessions = [
    { ...opening, id: 'matching', status: 'closed', closedAt: stamp(baseTime + hour), declaredAmount: 100, expectedCash: 100, difference: 0 },
    { ...opening, id: 'provisional', status: 'closed_with_discrepancy', closedAt: stamp(baseTime + hour), declaredAmount: 98,
      closeEstimate: { authority: 'client-estimate', expectedCash: 100, difference: -2 }, reconciliationPending: true },
    { ...opening, id: 'expired', status: 'expired_unreconciled', durationHours: 14, expiredAt: stamp(baseTime + 14 * hour),
      recoveredAt: stamp(baseTime + 15 * hour) },
  ];
  const scope = { ...business, period: periods.nov };
  const finance = aggregateReport(scope);
  const view = reportViewModel(finance, [], { ...scope, loadedAt: baseTime + 20 * hour }, sessions);
  assert.equal(cashReviewPresentation(view.cashEvents).totalCount, 2);
  assert.equal(view.cashEvents.find(event => event.kind === 'expiry').counted, null);
  assert.equal(view.cashEvents.find(event => event._sessionId === 'provisional' && event.kind === 'closing').estimated, true);
  assert.equal(finance.summary.netRevenue, 0);

  const monthSales = (date, month) => [...Array.from({ length: 5 }, (_, i) => [`Especial ${month}-${i}`, 6]), ['Recurrente', 5]]
    .map(([name, qty], index) => ({ ...salesTicket(`top-${month}-${index}`, qty, 'efectivo', date),
      items: [{ id: name, name, qty, price: 1 }] }));
  const sales = [...monthSales(october, 'oct'), ...monthSales(november, 'nov')];
  for (const period of [periods.oct, periods.nov]) {
    assert.equal(aggregateReport({ ...business, period, sales }).topProducts.some(row => row.name === 'Recurrente'), false);
  }
  assert.equal(aggregateReport({ ...business, period: periods.year, sales }).topProducts[0].name, 'Recurrente');
});
