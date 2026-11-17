import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { reportViewModel } from '../frontend/src/features/reports/application/reportViewModel.js';
import { cashReviewPresentation } from '../frontend/src/features/reports/application/managementReportHtml.js';
import { dayDate, reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { buildMonthlySnapshotV1, validateMonthlySnapshotV1, combineYearSnapshotsV1, snapshotFingerprint,
  planMonthRebuild } from '../frontend/src/features/reports/domain/monthlySnapshot.js';

const businessId = 'shadow-bakery';
const coverage = { sparkSales: true, legacySales: true, migratedLedger: true, legacyLedger: true, posVoids: true,
  createdContracts: true, contractCancellations: true, cashSessions: true };
const monthEnd = key => reportPeriod('mes', dayDate(key + '-01')).endDate;
const input = (periodKey = '2026-11', extra = {}) => ({
  businessId, periodKey, coverage, coveredThrough: monthEnd(periodKey), sourceRevision: 'checkpoint-1',
  sales: [], payments: [], voids: [], contracts: [], sessions: [], ...extra,
});
const scope = (branchId = 'centro') => ({ businessId, branchId });
const stamp = text => Timestamp.fromDate(new Date(text));
const oct = stamp('2026-10-31T23:59:59.999-05:00');
const nov = stamp('2026-11-01T00:00:00.000-05:00');
const cashClose = stamp('2026-11-01T08:00:00-05:00');
const cents = value => Math.round(value * 100) || 0;
const ticket = (id, total, payment, confirmedAt, branch = 'centro') => ({
  ...scope(branch), id, saleId: id, status: 'confirmed', confirmedAt, createdAt: confirmedAt, total, payment,
  items: [{ id: 'pan', name: 'Nombre privado de prueba', price: total, qty: 1 }],
});
const payment = (id, amount, method, occurredAt, type = 'payment', branch = 'centro') => ({
  ...scope(branch), id, amount, method, occurredAt, type, sourceId: 'order-private-id', sourceType: 'contract',
});
const receipt = (sale, cashAmount, digitalAmount, occurredAt) => ({
  ...scope(sale.branchId), id: sale.id, saleId: sale.id, authority: 'pos-compensation', amount: -sale.total,
  cashAmount, digitalAmount, occurredAt, items: sale.items, reason: 'Motivo privado de prueba',
});

function example() {
  const old = { ...ticket('mixed-old', 30.05, 'mixto', oct), splitPayments: { efectivo: 12.05, yape: 18 } };
  const mixed = { ...ticket('mixed-new', 10.25, 'mixto', nov), splitPayments: { efectivo: 1.06, yape: 9.19 } };
  const digital = ticket('plin-new', 20.05, 'plin', nov, 'taller');
  const order = { ...scope(), id: 'order-private-id', status: 'cancelado', createdAt: oct, voidedAt: nov, paidTotal: 0,
    clientName: 'Cliente privado de prueba', clientPhone: '987654321' };
  const shift = { ...scope(), openedAt: nov, closedAt: cashClose, openingAmount: 100, expectedCash: 100, userId: 'secret-cashier-id' };
  return {
    sales: [old, mixed, digital],
    voids: [receipt(old, -12.05, -18, nov), receipt(digital, 0, -20.05, cashClose)],
    payments: [payment('prior-cash', 8.01, 'efectivo', oct), payment('prior-digital', 2.90, 'yape', oct),
      payment('refund-cash', -8.01, 'efectivo', nov, 'refund'), payment('refund-digital', -2.90, 'yape', nov, 'refund'),
      payment('new-payment', 3.11, 'plin', nov, 'advance', 'taller')],
    contracts: [order, { ...order, id: 'cancelled-without-payment', branchId: 'taller' },
      { ...scope(), id: 'pending', status: 'pendiente', balance: 25, createdAt: nov },
      { ...scope('taller'), id: 'delivered', status: 'entregado', balance: 0, createdAt: nov }],
    sessions: [
      { ...shift, id: 'balanced', status: 'closed', declaredAmount: 100, difference: 0 },
      { ...shift, id: 'provisional', status: 'closed_with_discrepancy', declaredAmount: 98, reconciliationPending: true,
        closeEstimate: { authority: 'client-estimate', expectedCash: 100, difference: -2 } },
      { ...shift, id: 'confirmed-extra', status: 'closed_with_discrepancy', branchId: 'taller', declaredAmount: 102.01, difference: 2.01 },
      { ...scope('taller'), id: 'expired', status: 'expired_unreconciled', runtime: 'spark',
        durationHours: 14, openedAt: nov, expiredAt: stamp('2026-11-01T14:00:00-05:00'),
        recoveredAt: stamp('2026-11-02T12:00:00-05:00'), recoveredBy: 'secret-owner-id', openingAmount: 150,
        declaredAmount: null, difference: null },
    ],
  };
}

function assertFinancialParity(projected, actual) {
  assert.deepEqual(Object.values(projected.finance), [actual.netRevenue, actual.posRevenue,
    actual.contractRevenue, actual.cashRevenue, actual.digitalRevenue].map(cents));
  for (const method of ['cash', 'digital']) {
    assert.deepEqual(Object.values(projected.channels[method]), Object.values(actual.channels[method]).map(cents));
  }
  assert.deepEqual([projected.counts.tickets, projected.counts.voidedTickets, projected.counts.contractPayments, projected.counts.adjustments],
    [actual.posTicketCount, actual.voidedTicketCount, actual.contractPaymentCount, actual.refundCount]);
}

it('P31-B produces an immutable, covered zero month and rejects invented evidence or noninteger amounts', async () => {
  const month = buildMonthlySnapshotV1(input());
  assert.equal(month.status, 'shadow');
  assert.equal(month.closed, true);
  assert.deepEqual(month.branches, []);
  assert.deepEqual(month.byDay, []);
  assert.equal(month.finance.netCents, 0);
  assert.equal(month.cashReview.reviewRequiredCount, 0);
  assert.equal(month.coverage.products, 'unavailable');
  assert.equal(Object.isFrozen(month.finance), true);
  assert.deepEqual(validateMonthlySnapshotV1(JSON.parse(JSON.stringify(month))), month);
  assert.match(await snapshotFingerprint(month), /^[a-f0-9]{64}$/);
  assert.throws(() => validateMonthlySnapshotV1(undefined), /Estructura/);
  assert.throws(() => validateMonthlySnapshotV1({ ...month, sourceRevision: undefined }), /revisión/);
  assert.throws(() => validateMonthlySnapshotV1({ ...month, periodKey: '2026-12' }), /temporal/);
  assert.throws(() => validateMonthlySnapshotV1({ ...month, businessId: 'other/business' }), /negocio/);
  for (const value of [undefined, NaN, 1.01]) {
    assert.throws(() => validateMonthlySnapshotV1({ ...month, finance: { ...month.finance, netCents: value } }), /enteros seguros/);
  }
  for (const mutation of [{ coverage: { ...coverage } }, { photo: 'forbidden' },
    { issues: ['unverified'] }, { finance: { ...month.finance, netCents: -1 } }]) {
    assert.throws(() => validateMonthlySnapshotV1({ ...month, ...mutation }));
  }
  assert.throws(() => buildMonthlySnapshotV1(input('2026-12', { coveredThrough: nov })), /temporal/);
});

it('P31-B reconciles two branches, cutoff in Lima, mixed money, refunds, two voids and order and cash coverage', () => {
  const fixtures = example();
  const snapshot = buildMonthlySnapshotV1(input('2026-11', fixtures));
  const period = reportPeriod('mes', nov.toDate());
  const model = aggregateReport({ ...fixtures, businessId, period, branchId: 'global' });
  const view = reportViewModel(model, fixtures.contracts, { ...scope('global'), period, ...fixtures, loadedAt: +period.endDate }, fixtures.sessions);
  assertFinancialParity(snapshot, model.summary);
  assert.deepEqual(snapshot.finance, { netCents: -2760, posNetCents: -1980, contractNetCents: -780, cashNetCents: -1900, digitalNetCents: -860 });
  assert.deepEqual(snapshot.channels, {
    cash: { collectionsCents: 106, posCompensationsCents: -1205, contractRefundsCents: -801, netCents: -1900 },
    digital: { collectionsCents: 3235, posCompensationsCents: -3805, contractRefundsCents: -290, netCents: -860 },
  });
  assert.equal(snapshot.counts.contractsCancelledInPeriod, 2);
  assert.deepEqual([snapshot.counts.contractsPending, snapshot.counts.contractsDelivered, snapshot.counts.createdContractsCancelled,
    snapshot.counts.contractsWithDebt], Object.values(view.contractCounts));
  assert.equal(snapshot.counts.createdContractsCancelled, 0);
  assert.equal(snapshot.cashReview.reviewRequiredCount, cashReviewPresentation(view.cashEvents).totalCount);
  assert.deepEqual(snapshot.cashReview, { openings: 4, closings: 3, expiries: 1, confirmedBalanced: 1, estimatedClosings: 1,
    unverifiedClosings: 1, reviewRequiredCount: 3, confirmedShortCents: 0, confirmedExtraCents: 201 });
  for (const row of snapshot.branches) assertFinancialParity(row, model.branches.get(row.branchId));
  assert.deepEqual(snapshot.byDay.map(day => day.day), ['2026-11-01']);
  assertFinancialParity(snapshot.byDay[0], model.summary);
  const mismatched = structuredClone(snapshot);
  mismatched.branches[0].counts.tickets++;
  assert.throws(() => validateMonthlySnapshotV1(mismatched), /desglose no concilia/);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /privad[oa]|987654321|secret-|mixed-old|order-private-id|referenceImages/);
  const previous = buildMonthlySnapshotV1(input('2026-10', { ...fixtures, coveredThrough: monthEnd('2026-11') }));
  assert.equal(previous.counts.tickets, 1);
  assert.equal(previous.counts.voidedTickets, 0);
  assert.equal(previous.counts.createdContractsCancelled, 2);
  assert.equal(previous.counts.contractsCancelledInPeriod, 0);
  assert.equal(previous.finance.netCents, 4096);
  assert.deepEqual(previous.byDay.map(day => day.day), ['2026-10-31']);
});

it('P31-B active cutoff ignores movements and closings after the verified instant on the same Lima day', () => {
  const beforeClose = '2026-11-01T01:00:00-05:00';
  const fixtures = example();
  const snapshot = buildMonthlySnapshotV1(input('2026-11', { ...fixtures, coveredThrough: beforeClose }));
  assert.equal(snapshot.calculatedThrough, new Date(beforeClose).toISOString());
  assert.equal(snapshot.closed, false);
  assert.equal(snapshot.counts.voidedTickets, 1);
  assert.equal(snapshot.cashReview.closings, 0);
  assert.equal(snapshot.cashReview.expiries, 0);
  assert.equal(snapshot.cashReview.openings, 4);
  assert.equal(snapshot.finance.netCents, -755);
});

it('P31-B keeps unknown sources, undated cancellations and unlinked legacy voids incomplete', () => {
  const legacy = { ...ticket('legacy-voided', 30.05, 'mixto', oct), confirmedAt: undefined, createdAt: oct, voided: true,
    splitPayments: { efectivo: 12.05, plin: 18 } };
  const { voids: [originalProof] } = example();
  const proof = { ...originalProof, id: legacy.id, saleId: legacy.id, items: legacy.items };
  const blocked = [
    [input('2026-10', { coverage: { ...coverage, legacyLedger: false } }), 'source-coverage-missing'],
    [input('2026-10', { sales: undefined }), 'source-coverage-missing'],
    [input('2026-10', { sales: [legacy] }), 'legacy-void-unlinked'],
    [input('2026-10', { contracts: [{ ...scope(), id: 'legacy', createdAt: oct, status: 'cancelado' }] }), 'cancellation-date-unverified'],
    [input('2026-10', { contracts: [{ ...scope(), id: 'unknown', createdAt: oct, status: 'pendiente' }] }), 'contract-status-unverified'],
  ];
  for (const [candidate, reason] of blocked) {
    const month = buildMonthlySnapshotV1(candidate);
    assert.equal(month.status, 'incomplete');
    assert.deepEqual(month.issues, [reason]);
    assert.equal(month.finance, null);
    assert.equal(month.counts, null);
    assert.equal(month.branches, null);
    assert.throws(() => validateMonthlySnapshotV1({ ...month, finance: { netCents: 0 } }), /cobertura incompleta/);
  }
  assert.throws(() => buildMonthlySnapshotV1(input('2026-11', { coverage: undefined })), /Estructura/);
  const October = buildMonthlySnapshotV1(input('2026-10', { sales: [legacy], voids: [proof], coveredThrough: monthEnd('2026-11') }));
  const November = buildMonthlySnapshotV1(input('2026-11', { sales: [legacy], voids: [proof] }));
  assert.equal(October.finance.netCents + November.finance.netCents, 0);
  assert.equal(October.counts.tickets, 1);
  assert.equal(November.counts.voidedTickets, 1);
});

it('P31-B recomputes identical retries by content, rejects conflicting IDs, foreign records and offline evidence', async () => {
  const fixtures = example();
  const first = buildMonthlySnapshotV1(input('2026-11', fixtures));
  const replayInput = Object.fromEntries(Object.entries(fixtures).map(([name, records]) =>
    [name, [...records, structuredCopy(records[0])].reverse()]));
  const replay = buildMonthlySnapshotV1(input('2026-11', replayInput));
  assert.deepEqual(replay, first);
  const requests = new Map();
  for (const snapshot of [first, replay, { ...replay, sourceRevision: 'checkpoint-retry' }]) {
    const key = await snapshotFingerprint(snapshot);
    requests.set(key, snapshot);
  }
  assert.equal(requests.size, 1);
  for (const [source, edit] of [['sales', { total: 4 }], ['voids', { digitalAmount: -19 }], ['payments', { amount: 9 }],
    ['contracts', { status: 'pendiente' }], ['sessions', { difference: 300 }]]) {
    const records = fixtures[source];
    assert.throws(() => buildMonthlySnapshotV1(input('2026-11', { ...fixtures, [source]: [...records, { ...records[0], ...edit }] })),
      /conflicto/);
  }
  assert.throws(() => buildMonthlySnapshotV1(input('2026-11', { sales: [{ ...fixtures.sales[1], businessId: 'foreign' }] })), /negocio/);
  assert.throws(() => buildMonthlySnapshotV1(input('2026-11', { sales: [{ ...fixtures.sales[1], isOffline: true }] })), /confirmados/);
  assert.throws(() => buildMonthlySnapshotV1(input('2026-11', { sales: [{ ...fixtures.sales[1], total: 1.001 }] })), /céntimos/);
});

it('P31-B rebuilds the original order cohort when a later month cancels it', async () => {
  const cancelled = example().contracts[0];
  const original = { ...cancelled, status: 'pendiente', balance: 40, voidedAt: null };
  const before = buildMonthlySnapshotV1(input('2026-10', { contracts: [original] }));
  const after = buildMonthlySnapshotV1(input('2026-10', { contracts: [cancelled], coveredThrough: nov, sourceRevision: 'checkpoint-2' }));
  assert.deepEqual([before.counts.contractsPending, before.counts.contractsWithDebt, after.counts.createdContractsCancelled], [1, 1, 1]);
  assert.equal(after.counts.contractsCancelledInPeriod, 0);
  assert.equal(after.finance.netCents, before.finance.netCents);
  assert.notEqual(await snapshotFingerprint(after), await snapshotFingerprint(before));
  const sameContent = buildMonthlySnapshotV1(input('2026-10', { contracts: [cancelled], coveredThrough: cashClose }));
  assert.equal(await snapshotFingerprint(sameContent), await snapshotFingerprint(after));
});

function structuredCopy(record) {
  // Reorder top-level fields while preserving the original Timestamp instances.
  return Object.fromEntries(Object.entries(record).reverse());
}

it('P31-B combines 12 closed months and only the elapsed months of a running Lima year', () => {
  const fixtures = example();
  const yearEnd = monthEnd('2026-12');
  const closed = Array.from({ length: 12 }, (_, index) => {
    const month = '2026-' + String(index + 1).padStart(2, '0');
    return buildMonthlySnapshotV1(input(month, ['2026-10', '2026-11'].includes(month) ?
      { ...fixtures, coveredThrough: yearEnd } : {}));
  });
  const model = aggregateReport({ ...fixtures, ...scope('global'), period: reportPeriod('todo', nov.toDate()) });
  const year = combineYearSnapshotsV1([...closed].reverse(), yearEnd);
  assertFinancialParity(year, model.summary);
  assert.equal(year.closed, true);
  assert.equal(year.byMonth.length, 12);
  assert.equal(year.products, 'unavailable');
  assert.equal(year.finance.netCents, 1336);
  assert.equal(year.calculatedThrough, yearEnd.toISOString());
  const currentAsOf = '2026-11-02T14:00:00-05:00';
  const active = buildMonthlySnapshotV1(input('2026-11', { ...fixtures, coveredThrough: '2026-11-02T13:00:00-05:00' }));
  const revisedOctober = buildMonthlySnapshotV1(input('2026-10', { ...fixtures, coveredThrough: currentAsOf }));
  const elapsed = [...closed.slice(0, 9), revisedOctober, active];
  const open = combineYearSnapshotsV1(elapsed, currentAsOf);
  assert.equal(open.byMonth.length, 11);
  assert.equal(open.closed, false);
  assert.equal(open.calculatedThrough, active.calculatedThrough);
  assert.throws(() => combineYearSnapshotsV1(closed, currentAsOf), /fuera del alcance/);
  assert.throws(() => combineYearSnapshotsV1(elapsed.slice(1), currentAsOf), /Falta un mes/);
  assert.throws(() => combineYearSnapshotsV1([...elapsed, active], currentAsOf), /duplicado/);
  assert.throws(() => combineYearSnapshotsV1([...elapsed.slice(0, -1), { ...active, businessId: 'another' }], currentAsOf), /negocio/);
  assert.throws(() => combineYearSnapshotsV1([...elapsed.slice(0, -1), closed[10]], currentAsOf), /Mes incompleto/);
  assert.throws(() => combineYearSnapshotsV1([...elapsed.slice(0, 9), closed[9], active], currentAsOf), /Mes incompleto/);
  const partial = buildMonthlySnapshotV1(input('2026-11', { coverage: { ...coverage, posVoids: false }, coveredThrough: currentAsOf }));
  assert.throws(() => combineYearSnapshotsV1([...elapsed.slice(0, -1), partial], currentAsOf), /Mes incompleto/);
  assert.equal(combineYearSnapshotsV1([buildMonthlySnapshotV1(input('2027-01', { coveredThrough: '2027-01-01T00:00:00-05:00' }))],
    '2027-01-01T00:00:01-05:00').byMonth.length, 1);
});

it('P31-B does not manufacture an annual Top 5 from the winners of each month', () => {
  const create = (instant, month) => [...Array.from({ length: 5 }, (_, index) => [`Especial ${month} ${index}`, 6]), ['Recurrente', 5]]
    .map(([id, qty], index) => ({ ...ticket(`product-${month}-${index}`, qty, 'efectivo', instant), items: [{ id, name: id, price: 1, qty }] }));
  const sales = [...create(oct, 10), ...create(nov, 11)];
  for (const instant of [oct, nov]) {
    assert.ok(aggregateReport({ sales, businessId, period: reportPeriod('mes', instant.toDate()) }).topProducts.every(row => row.name !== 'Recurrente'));
  }
  assert.equal(aggregateReport({ sales, businessId, period: reportPeriod('todo', nov.toDate()) }).topProducts[0].name, 'Recurrente');
  const start = Array.from({ length: 11 }, (_, index) => buildMonthlySnapshotV1(input('2026-' + String(index + 1).padStart(2, '0'), { sales })));
  assert.equal(combineYearSnapshotsV1(start, monthEnd('2026-11')).products, 'unavailable');
});

it('P31-B plans only the effective month and the affected cohorts for late edits or reconciliation', () => {
  const rule = (source, before, after, extra = {}) => planMonthRebuild({ source, before: before && { businessId, ...before },
    after: after && { businessId, ...after }, ...extra });
  assert.deepEqual(rule('sales', null, { createdAt: oct, confirmedAt: nov }).periodKeys, ['2026-11']);
  assert.deepEqual(rule('payments', { occurredAt: oct }, { type: 'refund', occurredAt: nov }).periodKeys, ['2026-10', '2026-11']);
  assert.deepEqual(rule('pos_voids', null, { occurredAt: nov }).periodKeys, ['2026-11']);
  assert.deepEqual(rule('pos_voids', null, { occurredAt: nov }, { legacyOriginalAt: oct }).periodKeys, ['2026-10', '2026-11']);
  assert.deepEqual(rule('contracts', { createdAt: oct, balance: 20 }, { createdAt: oct, balance: 0, voidedAt: nov }).periodKeys, ['2026-10', '2026-11']);
  assert.deepEqual(rule('contracts', { createdAt: oct, balance: 20 }, { createdAt: oct, balance: 4 }).periodKeys, ['2026-10']);
  assert.deepEqual(rule('cash_sessions', { openedAt: oct, status: 'open', runtime: 'spark', durationHours: 14 },
    { openedAt: oct, closedAt: nov, reconciliationPending: false }).periodKeys, ['2026-10', '2026-11']);
  assert.throws(() => rule('sales', { createdAt: oct }, { businessId: 'other', createdAt: nov }), /negocio/);
});
