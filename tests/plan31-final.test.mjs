import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createRequire } from 'node:module';
import { normalizeContribution, legacyPayments } from '../functions/src/reports/contributions.js';
import { monthWindow, projectionFromRecords } from '../functions/src/reports/consolidation.js';
import { collections, blank, expectedMonths, financial, get, keyOf, mergeProducts, total, rankProducts } from '../functions/src/reports/summaryModel.js';
import { reportingFunctions } from '../functions/src/reports/entry.js';
import { buildMonthlySnapshotV1 } from '../frontend/src/features/reports/domain/monthlySnapshot.js';
import { chartSkeleton, reportDay, reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { reportSourceForPeriod } from '../frontend/src/features/reports/application/reportSources.js';
import { createSummaryReportResource } from '../frontend/src/features/reports/application/reportResource.js';
import { createVerifiedSummaryReader } from '../frontend/src/features/reports/infrastructure/summaryReader.js';
import { buildSummaryView } from '../frontend/src/features/reports/application/summaryView.js';
import { buildSummaryWorkbook, managementSummaryReportHtml } from '../frontend/src/features/reports/application/summaryDocuments.js';
import { writeSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { assertWorkbookBorders, tableRows } from './helpers/reportWorkbook.mjs';

const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
const businessId = 'p31-fixture', branchId = 'centro', branch = { businessId, branchId };
const epoch = +new Date('2026-11-06T15:00:00-05:00');
const oct = new Date('2026-10-31T23:59:59.999-05:00'), nov = new Date('2026-11-01T00:00:00.000-05:00');
const coverage = { sparkSales: true, legacySales: true, migratedLedger: true, legacyLedger: true, posVoids: true,
  createdContracts: true, contractCancellations: true, cashSessions: true };
const sale = (id, date, total, extra = {}) => ({ ...branch, id, confirmedAt: date, createdAt: date, status: 'confirmed',
  payment: 'efectivo', total, items: [{ id: 'pan', name: 'Pan', price: total, qty: 1 }], ...extra });

it('P31 periods retain full Lima calendar boundaries and only require elapsed annual snapshots', () => {
  for (const [instant, start, end, days] of [
    ['2026-11-17T12:00:00-05:00', '2026-11-01', '2026-11-30', 30],
    ['2026-01-15T12:00:00-05:00', '2026-01-01', '2026-01-31', 31],
    ['2026-07-31T23:59:59-05:00', '2026-07-01', '2026-07-31', 31],
    ['2024-02-29T12:00:00-05:00', '2024-02-01', '2024-02-29', 29],
    ['2025-02-15T12:00:00-05:00', '2025-02-01', '2025-02-28', 28],
    ['2026-12-31T23:59:59-05:00', '2026-12-01', '2026-12-31', 31],
    ['2027-01-01T04:59:59.999Z', '2026-12-01', '2026-12-31', 31],
    ['2027-01-01T05:00:00.000Z', '2027-01-01', '2027-01-31', 31],
  ]) {
    const period = reportPeriod('mes', instant);
    assert.deepEqual([period.start, period.end], [start, end]);
    assert.equal(+period.endDate - +period.startDate + 1, days * 86400000);
    assert.equal(reportDay(period.startDate), start);
    assert.equal(reportDay(period.endDate), end);
    assert.equal(chartSkeleton(period).length, days);
    const year = reportPeriod('todo', instant), parts = start.split('-');
    assert.deepEqual([year.start, year.end], [parts[0] + '-01-01', parts[0] + '-12-31']);
    const months = expectedMonths(year, +new Date(instant));
    assert.equal(months.length, Number(parts[1]));
    assert.equal(months.at(-1), start.slice(0, 7));
    assert.equal(chartSkeleton(year).length, 12);
  }
  assert.equal(expectedMonths(reportPeriod('todo', '2024-11-01T12:00:00-05:00'), epoch).length, 12);
});

function sample() {
  const paid = sale('first', oct, 30.05, { payment: 'mixto', splitPayments: { efectivo: 10.05, plin: 20 } });
  const voided = { ...branch, id: paid.id, saleId: paid.id, occurredAt: nov, authority: 'pos-compensation',
    amount: -30.05, cashAmount: -10.05, digitalAmount: -20, items: paid.items };
  const orders = [
    { ...branch, id: 'cancelled-order', status: 'cancelado', createdAt: oct, voidedAt: nov, balance: 0 },
    { ...branch, id: 'cancelled-no-money', status: 'cancelado', createdAt: oct, voidedAt: nov, balance: 0 },
    { ...branch, id: 'order-created', status: 'pendiente', createdAt: nov, balance: 20 },
  ];
  const payments = [['ad', 'advance', 7.03, 'efectivo'], ['ab', 'payment', 10.04, 'plin'], ['rf', 'refund', -5.02, 'efectivo'],
    ['rf2', 'refund', -6.07, 'yape']].map(([id, type, amount, method]) =>
    ({ ...branch, id, type, amount, method, sourceId: 'cancelled-order', occurredAt: nov }));
  const sessions = [
    { ...branch, id: 'zero', openedAt: oct, closedAt: nov, status: 'closed', declaredAmount: 0, expectedCash: 0, difference: 0 },
    { ...branch, id: 'pending', openedAt: nov, closedAt: nov, status: 'closed_with_discrepancy', declaredAmount: 1, expectedCash: 2, difference: -1, reconciliationPending: true },
    { ...branch, id: 'expiry', openedAt: oct, runtime: 'spark', durationHours: 14, status: 'open' },
    { ...branch, id: 'verified-extra', openedAt: nov, closedAt: nov, status: 'closed_with_discrepancy', declaredAmount: 3, expectedCash: 1, difference: 2 },
  ];
  return { sales: [paid, sale('second', nov, 11.05, { branchId: 'taller' })], payments, voids: [voided], contracts: orders, sessions };
}
function presentation(month, fixture = sample()) {
  const records = [['sales', fixture.sales], ['payments', fixture.payments], ['pos_voids', fixture.voids],
    ['contracts', fixture.contracts], ['cash_sessions', fixture.sessions]].flatMap(([source, rows]) =>
    rows.map(row => ({ atoms: normalizeContribution(source, row.id, row, epoch, {
      sale: fixture.sales.find(sale => sale.id === row.saleId), void: fixture.voids.find(receipt => receipt.id === row.id),
    }) })));
  const { buckets, products } = projectionFromRecords(businessId, month, records);
  const rows = buckets.map(({ day, branchId, values }) => ({ day, branchId, values }));
  return { rows, products, top: rankProducts(products), branchIds: ['centro', 'taller'], verified: true,
    calculatedThrough: Math.min(+monthWindow(month).end, epoch), closed: +monthWindow(month).end < epoch, mode: 'manual' };
}

it('P31 final reconciles V1, consolidated XLSX and PDF with mixed POS, signed ledger, cash and Lima boundaries', () => {
  const fixture = sample(), period = reportPeriod('mes', nov);
  const oracle = month => buildMonthlySnapshotV1({ ...fixture, businessId, periodKey: month, coveredThrough: epoch,
    sourceRevision: 'fixture', coverage });
  const view = buildSummaryView(presentation('2026-11', fixture), period), actual = financial(view.values), expected = oracle('2026-11');
  assert.deepEqual([actual.net, actual.pos, actual.orders, actual.cash.net, actual.digital.net], Object.values(expected.finance));
  for (const channel of ['cash', 'digital']) assert.deepEqual(Object.values(actual[channel]), Object.values(expected.channels[channel]));
  assert.equal(financial(total(presentation('2026-10', fixture).rows)).net, oracle('2026-10').finance.netCents);
  assert.deepEqual(['tickets', 'voids', 'cancelled', 'advances', 'payments', 'refunds', 'balanced', 'expired',
    'unverified', 'review', 'confirmedShort', 'confirmedExtra'].map(key => get(view.values, key)), [1, 1, 2, 1, 1, 2, 1, 1, 1, 3, 0, 200]);
  const options = { period, business: 'Panadería <local>', branchesMap: { centro: 'Centro', taller: 'Taller' } };
  const bytes = writeSalesWorkbook(XLSX, buildSummaryWorkbook(XLSX, view, options));
  const decoded = XLSX.read(bytes, { type: 'array', cellNF: true, cellStyles: true });
  assert.deepEqual(decoded.SheetNames, ['Resumen_Financiero', 'Comparativa_Sedes', 'Evolucion_Diaria', 'Resumen_Cajas',
    'Resumen_Pedidos', 'Productos_Global', 'Productos_Sedes']);
  assertWorkbookBorders(XLSX, decoded, bytes);
  const kpis = Object.fromEntries(XLSX.utils.sheet_to_json(decoded.Sheets.Resumen_Financiero, { header: 1 }));
  assert.equal(kpis['INGRESO NETO REGISTRADO'], actual.net / 100);
  assert.equal(kpis['PEDIDOS ANULADOS'], 2);
  assert.ok(tableRows(XLSX, decoded, 'Resumen_Cajas').some(row => row['Cierres sin verificación'] === 1));
  assert.equal(tableRows(XLSX, decoded, 'Resumen_Pedidos').find(row => row.Sucursal === 'Centro')['Reembolsos contables (S/)'], -11.09);
  const pdf = managementSummaryReportHtml(view, options);
  assert.match(pdf, /Cajas — resumen/);
  assert.match(pdf, /Pedidos — resumen/);
  assert.match(pdf, /Panadería &lt;local&gt;/);
  assert.ok(pdf.includes('S/ ' + (actual.net / 100).toFixed(2)));
  assert.doesNotMatch(pdf, /cancelled-order|Cajero|<local>/);
});

it('P31 final normalizes embedded payments and blocks unlinked or corrupt evidence', () => {
  const contract = { ...sample().contracts[2], payments: [{ amount: '1.25', method: 'yape/plin', date: nov.toISOString(), branchId }] };
  const synthetic = legacyPayments(contract.id, contract);
  assert.equal(synthetic.length, 1);
  assert.match(synthetic[0].id, /^legacy_[a-f0-9]{64}$/);
  const migrated = normalizeContribution('payments', synthetic[0].id, synthetic[0], epoch);
  const noDuplicate = normalizeContribution('contracts', contract.id, contract, epoch, { legacy: [] });
  const embedded = normalizeContribution('contracts', contract.id, contract, epoch, { legacy: synthetic });
  assert.deepEqual(total([...noDuplicate, ...migrated]), total(embedded));
  assert.throws(() => normalizeContribution('sales', 'old', { ...sample().sales[0], voided: true }, epoch), /sin comprobante/);
  assert.throws(() => normalizeContribution('pos_voids', 'first', { ...sample().voids[0], cashAmount: 7 }, epoch), /sin evidencia/);
  assert.throws(() => normalizeContribution('sales', 'pending', { ...sample().sales[0], status: 'pending' }, epoch), /pendiente/);
  assert.throws(() => normalizeContribution('sales', 'pending', { ...sample().sales[0], confirmedAt: null, createdAt: nov, status: 'pending' }, epoch), /pendiente/);
});

it('P31 final computes the annual Top 5 from 12 complete catalogs and bounds daily loads up to 10,000 tickets', () => {
  const annual = [];
  for (let i = 1; i <= 12; i++) {
    const month = '2025-' + String(i).padStart(2, '0'), date = monthWindow(month).start;
    const receipts = [...Array.from({ length: 5 }, (_, n) => ['sku-' + i + '-' + n, 6]), ['recurring', 5]]
      .map(([id, qty]) => sale(id, date, qty, { items: [{ id, qty, price: 1, name: id }] }));
    const built = projectionFromRecords(businessId, month, receipts.map(row => ({ atoms: normalizeContribution('sales', row.id, row, epoch) })));
    assert.ok(rankProducts(built.products).every(row => row.name !== 'recurring'));
    annual.push(...built.products);
  }
  assert.deepEqual(rankProducts(mergeProducts(annual))[0], { name: 'recurring', qty: 60, cents: 6000 });
  for (const count of [1, 100, 1000, 5000, 10000]) {
    const items = Array.from({ length: count }, (_, i) => sale('volume-' + i, nov, 3.10));
    const built = projectionFromRecords(businessId, '2026-11', items.map(row => ({ atoms: normalizeContribution('sales', row.id, row, epoch) })));
    assert.equal(built.buckets.length, 1);
    assert.equal(financial(total(built.buckets)).net, 310 * count);
    assert.equal(built.products[0].qty, count);
    assert.ok(Buffer.byteLength(JSON.stringify(built.buckets)) < 1000);
  }
});

function root(month, data = { rows: [], products: [], top: [] }) {
  const revision = (month.replace('-', '') + 'a'.repeat(64)).slice(0, 64);
  const through = Math.min(+monthWindow(month).end, epoch - 1);
  return { businessId, branchId: 'global', periodKey: month, schemaVersion: 2, status: 'verified', revision,
    calculatedThrough: through, evidenceThrough: epoch - 1, validUntil: epoch + 60000, closed: +monthWindow(month).end < epoch,
    coverage: { sales: true, legacy: true, ledger: true, voids: true, orders: true, cash: true, products: true },
    sourceProof: { epoch: 1, checkedDocuments: 0, checkedAt: epoch - 1, contentHash: 'c'.repeat(64) },
    rows: data.rows, values: data.rows.length ? total(data.rows) : blank(), top: data.top,
    productCount: data.products.length, productPages: 1 };
}
function productPage(periodKey, revisions, data = { products: [], top: [] }) {
  return { businessId, branchId: 'global', periodKey, schemaVersion: 2, page: 0, pageCount: 1, productCount: data.products.length,
    expiresAt: epoch + 60000, revisions, revision: revisions[0], products: data.products, top: data.top };
}
it('P31 final uses only point reads, reuses PDF/XLSX and blocks stale, partial, missing or foreign data', async () => {
  assert.deepEqual(reportingFunctions(null, {}), {});
  const documents = new Map(), calls = [];
  let active = 'owner', mode = '';
  const sdk = { doc: (_, name, id) => name + '/' + id, async getDocFromServer(ref) {
    calls.push(ref);
    if (mode === '403') throw Object.assign(new Error('Rejected'), { code: 'permission-denied' });
    if (mode === 'race') active = 'other';
    const data = documents.get(ref);
    return { metadata: { fromCache: mode === 'cache' }, exists: () => Boolean(data), data: () => data };
  } };
  const read = createVerifiedSummaryReader({}, { sdk, currentUid: () => active, now: () => epoch });
  const args = { uid: 'owner', identityKey: 'owner-p31', businessId, branchId: 'global', period: reportPeriod('mes', epoch) };
  const resources = createSessionResources();
  const data = presentation('2026-11'), november = root('2026-11', data), id = keyOf(businessId, 'global', '2026-11');
  documents.set(collections.months + '/' + id, november);
  documents.set(collections.products + '/' + id + ':0', productPage('2026-11', [november.revision], data));
  const source = reportSourceForPeriod(args.period, () => assert.fail('No se deben crear lectores de detalle.'),
    { readSummary: () => read({ ...args, resources }) });
  assert.equal(source.representation, 'snapshots');
  assert.equal((await source.readSummary()).verified, true);
  assert.equal(calls.length, 1);
  await read({ ...args, resources, includeProducts: true });
  await read({ ...args, resources, includeProducts: true });
  assert.equal(calls.length, 2);
  resources.close();
  const run = async (overrides = {}) => {
    const resources = createSessionResources();
    try { return await read({ ...args, ...overrides, resources }); }
    finally { resources.close(); }
  };
  for (const mutation of [{ status: 'dirty' }, { validUntil: epoch }, { coverage: {} }, { branchId: 'taller' }, { values: blank() },
    { rows: [{ ...november.rows[0], day: '2026-11-31' }] }, { rows: [{ ...november.rows[0], day: '2026-11-30' }] },
    { rows: [{ ...november.rows[0], values: [Infinity] }] }]) {
    documents.set(collections.months + '/' + id, { ...november, ...mutation });
    await assert.rejects(run(), { code: 'report-summary-pending' });
  }
  documents.set(collections.months + '/' + id, november);
  for (const change of ['403', 'cache', 'race']) {
    mode = change;
    await assert.rejects(run(), change === 'race' ? { name: 'AbortError' } : { code: 'report-summary-pending' });
    active = 'owner';
  }
  mode = '';
  const revisions = [];
  for (let i = 1; i <= 11; i++) {
    const month = '2026-' + String(i).padStart(2, '0'), record = root(month);
    documents.set(collections.months + '/' + keyOf(businessId, 'global', month), record);
    revisions.push(record.revision);
  }
  documents.set(collections.products + '/' + keyOf(businessId, 'global', 'year-2026', 0), productPage('year-2026', revisions));
  const before = calls.length;
  const year = await run({ period: reportPeriod('todo', epoch), includeProducts: true });
  assert.equal(calls.length - before, 12, 'Once meses y una página consolidada de productos');
  assert.equal(year.closed, false);
  const annualView = buildSummaryView(year, reportPeriod('todo', epoch));
  assert.equal(annualView.chartData.length, 12);
  assert.equal(annualView.evolution.length, 12);
  assert.deepEqual(annualView.chartData.at(-1), chartSkeleton(reportPeriod('todo', epoch)).at(-1));
  assert.deepEqual(annualView.evolution.at(-1), { key: '2026-12', values: blank() });
  assert.equal(calls.some(path => path.endsWith(':2026-12')), false, 'Future chart slots must not read future snapshots');
  assert.ok(calls.every(path => path.startsWith(collections.months + '/') || path.startsWith(collections.products + '/')));
  documents.delete(collections.months + '/' + keyOf(businessId, 'global', '2026-03'));
  await assert.rejects(run({ period: reportPeriod('todo', epoch) }), { code: 'report-summary-pending' });
});

it('P31 dashboard and export routing use verified snapshots without a frontend activation gate', async () => {
  let constructed = 0, historicalReads = 0, snapshotReads = 0;
  const reads = () => {
    constructed++;
    return { exportSnapshot: async () => { historicalReads++; return 'history'; } };
  };
  const readSummary = async () => { snapshotReads++; return 'verified'; };
  for (const filter of ['mes', 'todo']) {
    const period = reportPeriod(filter, epoch);
    await assert.rejects(reportSourceForPeriod(period, reads).readSummary(),
      { code: 'report-summary-pending' });
    const source = reportSourceForPeriod(period, reads, { readSummary });
    assert.equal(source.representation, 'snapshots');
    assert.equal(await source.readSummary(), 'verified');
    const missing = reportSourceForPeriod(period, reads, {
      readSummary: async () => { throw Object.assign(new Error('Missing'), { code: 'report-summary-pending' }); } });
    await assert.rejects(missing.readSummary(), { code: 'report-summary-pending' });
    await assert.rejects(reportSourceForPeriod(period, reads, {
      readSummary: async () => { throw Object.assign(new Error('Offline'), { code: 'unavailable' }); } }).readSummary(),
    error => error.code === 'report-summary-pending' && error.cause.code === 'unavailable');
    assert.equal(constructed, 0);
  }
  assert.equal(snapshotReads, 2);
  assert.equal(historicalReads, 0);
  for (const filter of ['hoy', 'semana']) {
    const source = reportSourceForPeriod(reportPeriod(filter, epoch), reads);
    assert.equal(await source.exportReads.exportSnapshot(), 'history');
  }
  assert.equal(historicalReads, 2);
});

it('P31 dashboard summary resource deduplicates, expires, aborts and hides unavailable or superseded data', async () => {
  const period = reportPeriod('mes', epoch), states = [];
  const data = { ...presentation('2026-11'), expiresAt: epoch + 20000 };
  let resolveRead, reads = 0, clock = epoch;
  const resource = createSummaryReportResource({ key: 'scope:revision', period, now: () => clock,
    readSummary: () => { reads++; return new Promise(resolve => { resolveRead = resolve; }); }, onState: state => states.push(state) });
  const duplicate = resource.refresh();
  await Promise.resolve();
  assert.equal(reads, 1);
  resolveRead(data);
  await Promise.all([resource.ready, duplicate]);
  assert.equal(states.at(-1).model.verified, true);
  clock = data.expiresAt;
  const stale = resource.refresh();
  await Promise.resolve();
  resolveRead(data);
  await stale;
  assert.equal(states.at(-1).model, null);
  assert.equal(states.at(-1).queryError.code, 'report-summary-pending');
  resource.close();
  let observedSignal;
  const closed = createSummaryReportResource({ key: 'new-identity', period, now: () => epoch,
    readSummary: ({ signal }) => { observedSignal = signal; return new Promise(resolve => { resolveRead = resolve; }); },
    onState: state => states.push(state) });
  await Promise.resolve();
  closed.close();
  assert.equal(observedSignal.aborted, true);
  const count = states.length;
  resolveRead(data);
  await closed.ready;
  assert.equal(states.length, count);
  let abandonedReads = 0;
  const abandoned = createSummaryReportResource({ key: 'unmounted', period,
    readSummary: async () => { abandonedReads++; return data; }, onState: () => {} });
  abandoned.close();
  await abandoned.ready;
  assert.equal(abandonedReads, 0);
});

it('P31 annual consolidated XLSX and PDF reconcile intermonth voids, cash, orders and every product to the monthly oracle', () => {
  const data = sample(), months = ['2026-10', '2026-11'].map(month => presentation(month, data));
  const products = mergeProducts(months.flatMap(month => month.products));
  const view = buildSummaryView({ ...months[1], products, rows: months.flatMap(month => month.rows), top: rankProducts(products) }, reportPeriod('todo', epoch));
  const expected = ['2026-10', '2026-11'].map(periodKey => buildMonthlySnapshotV1({ ...data, businessId, periodKey,
    coveredThrough: epoch, sourceRevision: 'fixture', coverage }));
  const net = expected.reduce((sum, value) => sum + value.finance.netCents, 0);
  assert.equal(financial(view.values).net, net);
  const options = { period: reportPeriod('todo', epoch), business: 'Panadería de ensayo', branchesMap: { centro: 'Centro', taller: 'Taller' } };
  const bytes = writeSalesWorkbook(XLSX, buildSummaryWorkbook(XLSX, view, options));
  const book = XLSX.read(bytes, { type: 'array', cellNF: true, cellStyles: true });
  assert.deepEqual(book.SheetNames, ['Resumen_Financiero', 'Comparativa_Sedes', 'Evolucion_Mensual', 'Resumen_Cajas', 'Resumen_Pedidos',
    'Productos_Global', 'Productos_Sedes']);
  assertWorkbookBorders(XLSX, book, bytes);
  assert.equal(Object.fromEntries(XLSX.utils.sheet_to_json(book.Sheets.Resumen_Financiero, { header: 1 }))['INGRESO NETO REGISTRADO'], net / 100);
  assert.equal(get(view.values, 'expired'), 1);
  assert.equal(get(view.values, 'voids'), 1);
  assert.equal(get(view.values, 'refunds'), 2);
  assert.ok(managementSummaryReportHtml(view, options).includes('S/ ' + (net / 100).toFixed(2)));
});
