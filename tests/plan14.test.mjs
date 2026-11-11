import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { createSparkCashRepository, cashLockId } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { createCashAuditPeriodReader, createCashStateReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { buildSalesWorkbook, writeSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { reportViewModel } from '../frontend/src/features/reports/application/reportViewModel.js';
import { cashReviewPresentation, managementReportHtml } from '../frontend/src/features/reports/application/managementReportHtml.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { createReportExportCache } from '../frontend/src/features/reports/application/reportExportCache.js';
import { plan08FinancialHarness, unavailable } from './helpers/plan08FinancialHarness.mjs';
import { pairedTicket, saleDay, voidDay } from './helpers/plan13PeriodHarness.mjs';

const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
const sheets = (workbook, name) => XLSX.utils.sheet_to_json(workbook.Sheets[name]);

it('P14-RC reimports the October net totals per day and branch with semantic number formats', () => {
  const businessId = 'octubre', branchesMap = { centro: 'Centro', taller: 'Taller' };
  const first = '2026-10-24T10:00:00-05:00', second = '2026-10-27T10:00:00-05:00';
  const sales = [
    { id: 'uno', businessId, branchId: 'centro', createdAt: first, total: 6, payment: 'mixto', splitPayments: { efectivo: 5.5, yape: 0.5 } },
    { id: 'dos', businessId, branchId: 'taller', createdAt: second, total: 17, payment: 'mixto', splitPayments: { efectivo: 5, yape: 12 } },
  ].map(sale => ({ ...sale, items: [{ id: 'pan', name: 'Pan', qty: 1, price: sale.total }] }));
  const payments = [[95, 'efectivo'], [60, 'yape'], [50, 'plin']].map(([amount, method], index) => ({
    id: 'p' + index, sourceId: 'pedido', businessId, branchId: 'taller', occurredAt: second, amount, method, type: index ? 'payment' : 'advance',
  }));
  const period = reportPeriod('mes', second);
  const { workbook, model } = buildSalesWorkbook(XLSX, { period, businessId, branchesMap, sales, payments });
  const bytes = writeSalesWorkbook(XLSX, workbook);
  const book = XLSX.read(bytes, { type: 'array', cellNF: true });
  const archive = XLSX.CFB.read(bytes, { type: 'array' });
  const headers = ['Fecha', 'Tickets de venta válidos', 'Ventas anuladas', 'Total neto registrado (S/)', 'Neto en efectivo (S/)',
    'Neto por Yape/Plin (S/)', 'Neto de ventas en mostrador (S/)', 'Neto de pagos de pedidos (S/)', 'Pagos de pedidos (cantidad)'];
  for (const [branchId, date, expected] of [['centro', first, [1, 0, 6, 5.5, 0.5, 6, 0, 0]], ['taller', second, [1, 0, 222, 100, 122, 17, 205, 3]]]) {
    const name = `Resum_${branchesMap[branchId]}`;
    const sheet = book.Sheets[name];
    assert.match(sheet.A2.v, /Total neto registrado = neto de ventas en mostrador \+ neto de pagos de pedidos/);
    const filter = XLSX.utils.decode_range(sheet['!autofilter'].ref);
    assert.equal(filter.s.r, 2);
    assert.equal(filter.e.c, headers.length - 1);
    const [labels, row] = XLSX.utils.sheet_to_json(sheet, { range: filter.s.r, header: 1 });
    assert.deepEqual(labels, headers);
    assert.deepEqual(row.slice(1), expected);
    assert.equal(row[3], row[4] + row[5]);
    assert.equal(row[3], row[6] + row[7]);
    assert.equal(sheet.A4.t, 'n');
    assert.equal(sheet.A4.w, branchId === 'centro' ? '24/10/2026' : '27/10/2026');
    assert.equal(sheet.B4.z, '0');
    assert.match(sheet.D4.z, /S\//);
    assert.equal(sheet.I4.z, '0');
    const xml = XLSX.CFB.find(archive, `/xl/worksheets/sheet${book.SheetNames.indexOf(name) + 1}.xml`);
    assert.match(Buffer.from(xml.content).toString(), /<pane ySplit="3" topLeftCell="A4"[^>]+state="frozen"/);
    const scope = { period: reportPeriod('hoy', date), branchId, businessId };
    const dashboard = aggregateReport({ ...scope, sales, payments });
    const view = reportViewModel(dashboard, [], scope);
    const html = managementReportHtml(view, { ...scope, business: 'Panadería', branch: branchesMap[branchId], operator: 'Cajera', generatedAt: new Date(date) });
    assert.equal(view.summary.netRevenue, expected[2]);
    for (const value of expected.slice(2, 7)) assert.ok(html.includes(`S/ ${value.toFixed(2)}`));
  }
  assert.deepEqual(sheets(book, 'Comparativa_Sedes').map(row => [row.Sucursal, row['Total neto registrado (S/)']]), [['Centro', 6], ['Taller', 222]]);
  assert.equal(model.summary.netRevenue, 228);
});

it('P14-RC cash review keeps recorded, provisional and missing amounts distinct and caps presentation at six', () => {
  const event = (hour, fields) => ({ kind: 'closing', date: new Date(`2026-10-27T${hour}:00:00-05:00`), branch: 'Centro <img>',
    cashier: 'Ana & Rosa', actor: 'Luis <script>', counted: null, difference: null, ...fields });
  const all = [event('10', { estimated: true, counted: 196, difference: 23 }), event('11', { estimated: true, counted: 100, difference: -50 }),
    event('12', { estimated: true }), event('13', { kind: 'expiry', opening: 100 }),
    event('14', { counted: 12, difference: 2 }), event('15', { counted: 8, difference: -2 }), event('16', { counted: 8 }),
    event('17', { counted: 0, estimated: true }), event('18', { counted: 0, difference: 0 }), event('19', { kind: 'opening', opening: 100 })];
  const projected = cashReviewPresentation(all);
  assert.equal(projected.totalCount, 8);
  assert.deepEqual(projected.visible.map(row => row.title), ['Cierre pendiente de conciliación', 'Cierre sin diferencia calculable', 'Faltante registrado',
    'Sobrante registrado', 'Turno vencido sin arqueo', 'Cierre pendiente de conciliación']);
  assert.deepEqual(projected.visible.map(row => [row.moneyValueText, row.difference]), [
    ['S/ 0.00', null], ['S/ 8.00', null], ['S/ 8.00', -2], ['S/ 12.00', 2], ['No declarado', null], ['No declarado', null],
  ]);
  assert.deepEqual(cashReviewPresentation(all.slice(0, 2)).visible.map(row => [row.moneyValueText, row.difference]), [['S/ 100.00', null], ['S/ 196.00', null]]);
  assert.deepEqual(cashReviewPresentation(all.slice(-2)), { totalCount: 0, visible: [] });
  const date = all[0].date, period = reportPeriod('hoy', date);
  const view = reportViewModel(aggregateReport(), [], { branchId: 'global', period });
  const render = cashEvents => managementReportHtml({ ...view, cashEvents }, { period, business: 'Panadería', branch: 'Centro', operator: 'Cajera', generatedAt: date });
  for (const [events, expected] of [[[], 0], [all.slice(0, 1), 1], [all.slice(0, 6), 6], [all, 6]]) {
    const html = render(events);
    assert.equal([...html.matchAll(/<article class="review-row /g)].length, expected);
    assert.equal(html.includes('Cajas que requieren revisión'), expected > 0);
    assert.doesNotMatch(html, /Alertas operativas|Notificaciones|<img>|<script>/);
    if (expected) assert.match(html, /Centro &lt;img&gt;.*Ana &amp; Rosa.*Luis &lt;script&gt;/);
  }
  assert.match(render(all), /6 incidencias más recientes de 8/);
});

it('P14 UX: report artifacts retain the original snapshot deadline and only live in their owning scope', () => {
  let now = 100, timer;
  const options = { now: () => now, schedule: fn => { timer = fn; return fn; }, cancel: () => {} };
  const first = createReportExportCache(options), anotherIdentity = createReportExportCache(options);
  const entry = first.put('hoy', { evidence: 'original' }, 220);
  entry.artifacts.set('pdf', '<p>Prepared</p>');
  entry.artifacts.set('excel', new Blob(['prepared']));
  now = 200;
  assert.equal(first.get('hoy'), entry);
  assert.equal(anotherIdentity.get('hoy'), null);
  assert.equal(first.get('semana'), null);
  now = 220;
  timer();
  assert.equal(first.get('hoy'), null);
  first.put('hoy', { evidence: 'next revision' }, 300);
  first.clear();
  assert.equal(first.get('hoy'), null);
});

it('P14 UX: Dashboard, XLSX and PDF preserve exact cents and the XLSX keeps the Lima day and pane', () => {
  const createdAt = '2026-11-09T00:01:00-05:00', period = reportPeriod('hoy', createdAt);
  const businessId = 'negocio', branchId = 'centro', internalId = '21f49f7a-af64-4ad9-b16c-19a245de9e42';
  const scope = { businessId, branchId, period, branchesMap: { centro: 'Centro' } };
  const sale = { businessId, branchId, id: internalId, userId: 'ByQjK1Ab0nrIeZ0f6xY9ac1kH7eT', createdAt, payment: 'mixto', total: 10.05,
    splitPayments: { efectivo: 0.01, yape: 10.04 }, items: [{ id: 'producto', name: '=1+1', qty: 1, price: 10.05 }] };
  const input = { ...scope, sales: [sale] };
  const dashboard = aggregateReport(input);
  const { workbook, view } = buildSalesWorkbook(XLSX, { ...input, model: dashboard });
  const bytes = writeSalesWorkbook(XLSX, workbook);
  const restored = XLSX.read(bytes, { type: 'array', cellNF: true });
  const rows = Object.fromEntries(sheets(restored, 'Resumen_Financiero').map(row => [row.Concepto, row.Valor]));
  assert.deepEqual([rows['Total neto registrado (S/)'], rows['Neto en efectivo (S/)'], rows['Neto por Yape/Plin (S/)']],
    [dashboard.summary.netRevenue, dashboard.summary.cashRevenue, dashboard.summary.digitalRevenue]);
  assert.deepEqual([dashboard.summary.netRevenue, dashboard.summary.cashRevenue, dashboard.summary.digitalRevenue].map(value => Math.round(value * 100)),
    [1005, 1, 1004]);
  const html = managementReportHtml(view, { period, business: 'Panadería', branch: 'Centro', operator: 'Ana Quispe', generatedAt: new Date(createdAt) });
  for (const value of ['10.05', '0.01', '10.04']) assert.ok(html.includes(`S/ ${value}`));
  const detail = restored.Sheets.Detalle_Centro;
  const header = XLSX.utils.decode_range(detail['!autofilter'].ref).s.r;
  const labels = XLSX.utils.sheet_to_json(detail, { header: 1, range: header })[0];
  const cell = name => detail[XLSX.utils.encode_cell({ r: header + 1, c: labels.indexOf(name) })];
  assert.equal(cell('Fecha').w, '09/11/2026');
  assert.equal(cell('Fecha').z, 'dd/mm/yyyy');
  assert.equal(cell('Referencia').v, 'Venta de mostrador');
  assert.equal(cell('Producto / concepto').t, 's');
  assert.equal(cell('Producto / concepto').f, undefined);
  assert.equal(cell('Responsable').v, 'Empleado no identificado');
  assert.ok(Object.values(detail).every(cell => cell?.v !== internalId));
  const xml = XLSX.CFB.find(XLSX.CFB.read(bytes, { type: 'array' }), `/xl/worksheets/sheet${restored.SheetNames.length}.xml`);
  assert.match(new TextDecoder().decode(new Uint8Array(xml.content)), new RegExp(`<pane ySplit="${header + 1}" topLeftCell="A${header + 2}"[^>]+state="frozen"`));
});

it('P14 C03/C04/C08: recovery replaces exactly one lock and verifies the original command after lost responses', async () => {
  const h = await plan08FinancialHarness();
  const { businessId, branchId, uid } = h.actor;
  const lock = 'active_cash_sessions/' + await cashLockId(businessId, branchId);
  const old = 'cash_sessions/p08-cash-session';
  const openedAt = Timestamp.fromDate(new Date('2026-10-28T03:22:00.000Z'));
  Object.assign(h.documents.get(old), { openedAt, openingAmount: 100, userId: 'previous-cashier' });
  h.documents.get(lock).userId = 'previous-cashier';
  const sdk = { ...h.sdk, Timestamp, getDocFromServer: ref => {
    if (h.state.noConnection) throw unavailable();
    return h.sdk.getDocFromServer(ref);
  } };
  const repository = createSparkCashRepository({}, { sdk, currentUser: h.currentUser });
  const command = { sessionId: 'p14-replacement-session', businessId, branchId, recoverSessionId: 'p08-cash-session', openingAmount: 50 };
  h.state.afterCommitFailure = true;
  h.state.noConnection = true;
  await assert.rejects(repository.open(command), { code: 'unavailable' });
  assert.deepEqual(h.writes, [old, 'cash_sessions/' + command.sessionId, lock]);
  h.state.afterCommitFailure = false;
  h.state.noConnection = false;
  const race = await Promise.allSettled([repository.open(command), repository.open({ ...command, sessionId: 'p14-competing-session' })]);
  assert.deepEqual(race.map(row => row.status), ['fulfilled', 'rejected']);
  const { recoveredSession, ...current } = race[0].value;
  assert.deepEqual([current.openingAmount, current.userId, current.durationHours], [50, uid, 10]);
  assert.deepEqual([recoveredSession.status, recoveredSession.openingAmount, recoveredSession.userId, recoveredSession.recoveredBy,
    recoveredSession.declaredAmount, recoveredSession.difference, recoveredSession.closedAt, recoveredSession.recoverySessionId],
  ['expired_unreconciled', 100, 'previous-cashier', uid, null, null, undefined, command.sessionId]);
  assert.equal(recoveredSession.expiredAt.toMillis(), openedAt.toMillis() + 36000000);
  assert.equal(h.writes.length, 3, 'replay and competing recovery never write');
  assert.deepEqual(await createCashStateReader({}, { sdk })(businessId, branchId), current, 'the reader follows the canonical replacement lock');
  const close = createSparkCashClosingRepository({}, { sdk, currentUser: h.currentUser,
    readSales: async session => {
      assert.equal(session.id, current.id);
      return [{ status: 'confirmed', total: 20, payment: 'efectivo', confirmedAt: new Date('2026-11-02T18:05:00Z') }];
    },
    readPayments: async session => { assert.equal(session.id, current.id); return []; },
  });
  const estimate = await close.preview(current.id, 70);
  assert.deepEqual([estimate.openingAmount, estimate.expectedCash, estimate.declaredAmount, estimate.difference], [50, 70, 70, 0]);
  await assert.rejects(repository.open({ ...command, openingAmount: 50.005 }), /dos decimales/);
  assert.equal(h.writes.length, 3);
});

it('P14 C07: a historical shift without a valid expiry protocol stays untouched', async () => {
  const h = await plan08FinancialHarness();
  const { businessId, branchId } = h.actor;
  const repository = createSparkCashRepository({}, { sdk: { ...h.sdk, Timestamp }, currentUser: h.currentUser });
  await assert.rejects(repository.open({ sessionId: 'p14-new-historical-session', recoverSessionId: 'p08-cash-session', businessId, branchId,
    openingAmount: 0 }), /revisión administrativa/);
  assert.deepEqual(h.writes, []);
});

it('P14 C09/C10/R01/R02: reimports a Lima opening, overnight expiry and independently counted replacement', () => {
  const businessId = 'empresa', branchId = 'centro', base = { businessId, branchId, userId: 'ana' };
  const now = new Date('2026-11-09T18:00:00-05:00');
  const old = { ...base, openingAmount: 100, openedAt: '2026-11-04T20:00:00-05:00', expiredAt: '2026-11-05T06:00:00-05:00',
    status: 'expired_unreconciled', recoveredAt: '2026-11-09T08:00:00-05:00', recoveredBy: 'luis', declaredAmount: null, difference: null };
  const replacement = { ...base, userId: 'luis', openingAmount: 50, openedAt: old.recoveredAt, status: 'closed',
    closedAt: '2026-11-09T11:00:00-05:00', closedBy: 'luis', declaredAmount: 70, reconciliationPending: true,
    closeEstimate: { authority: 'client-estimate', expectedCash: 70, difference: 0 } };
  const day = reportPeriod('hoy', old.expiredAt);
  const period = { ...day, start: '2026-11-04', filter: 'semana', end: '2026-11-09' };
  const options = { businessId, branchId, period, now, people: new Map([['luis', 'Luis Quispe']]), sessions: [replacement, old, { ...old, businessId: 'ajeno' }], sales: [
    { ...base, id: 's20', createdAt: '2026-11-09T10:00:00-05:00', total: 20, payment: 'efectivo', items: [{ id: 'pan', name: 'Pan', price: 20, qty: 1 }] },
  ] };
  const { workbook, view } = buildSalesWorkbook(XLSX, options);
  const restored = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const events = sheets(restored, 'Auditoría_Cajas');
  assert.deepEqual(events.map(row => [row.Turno, row['Fondo inicial (S/)'], row['Referencia calculada (S/)'], row['Efectivo declarado (S/)'], row['Diferencia (S/)']]), [
    ['APERTURA', 100, 'No aplica', 'No aplica', 'No aplica'],
    ['VENCIMIENTO SIN ARQUEO', 100, 'Sin referencia', 'No declarado', 'No calculable'],
    ['APERTURA', 50, 'No aplica', 'No aplica', 'No aplica'],
    ['CIERRE MANUAL', 50, 70, 70, 0],
  ]);
  assert.equal(XLSX.SSF.format('dd/mm/yyyy hh:mm', events[1]['Fecha y hora del movimiento']), '05/11/2026 06:00');
  assert.equal(events[1]['Registrado por'], 'Luis Quispe');
  assert.equal(events[0].Responsable, 'Empleado no identificado');
  assert.match(events[1].Observación, /09\/11\/2026 08:00/);
  assert.match(events[3].Observación, /provisionales/);
  assert.equal(view.summary.netRevenue, 20);
  const onlyExpiry = buildSalesWorkbook(XLSX, { ...options, period: day }).workbook;
  assert.deepEqual(sheets(onlyExpiry, 'Auditoría_Cajas').map(row => row.Turno), ['VENCIMIENTO SIN ARQUEO']);
});

it('P14 R03–R06: Excel and PDF share signed channels, per-branch totals and an explicit unresolved-history warning', () => {
  const period = reportPeriod('hoy', voidDay), scope = { businessId: 'qa13-a', branchId: 'global', period };
  const historical = pairedTicket({ legacy: true, id: 'missing-receipt', soldAt: voidDay });
  const prior = pairedTicket({ soldAt: saleDay });
  const other = pairedTicket({ id: 'foreign', soldAt: voidDay, businessId: 'ajeno' });
  const input = { ...scope, sales: [historical.sale, other.sale], voids: [prior.receipt, other.receipt], contracts: [] };
  const dashboard = reportViewModel(aggregateReport(input), [], scope);
  const { workbook, view } = buildSalesWorkbook(XLSX, input);
  assert.deepEqual(view.summary, dashboard.summary);
  assert.equal(view.summary.channels.digital.net, -30);
  assert.equal(view.branches.reduce((net, branch) => net + branch.netRevenue, 0), view.summary.netRevenue);
  assert.equal(view.historyUnresolved, 1);
  const rows = Object.fromEntries(sheets(workbook, 'Resumen_Financiero').map(row => [row.Concepto, row.Valor]));
  assert.equal(rows['Conciliación histórica pendiente'], view.warning);
  assert.equal(rows['Neto por Yape/Plin (S/)'], -30);
  const html = managementReportHtml(view, { period, business: '<img src="https://invalid.invalid">', branch: 'Global', operator: 'Cajera',
    generatedAt: new Date(voidDay), branchesMap: { centro: 'Centro' } });
  assert.match(html, /provisional y requiere conciliación histórica/);
  assert.match(html, /S\/ -30\.00/);
  assert.match(html, /ajustes contables no acreditan una devolución de dinero/);
  assert.doesNotMatch(html, /<img|ajeno/);
});

it('P14 C09: reads an expiry after Lima midnight through the bounded opening lookback and deduplicates manual closes', async () => {
  const businessId = 'empresa', branchId = 'centro';
  const stamp = value => Timestamp.fromDate(new Date(value));
  const old = { businessId, branchId, id: 'overnight', status: 'expired_unreconciled',
    openedAt: stamp('2026-11-04T20:00:00-05:00'), expiredAt: stamp('2026-11-05T06:00:00-05:00') };
  const closing = { ...old, id: 'manual', status: 'closed', openedAt: stamp('2026-11-05T08:00:00-05:00'),
    closedAt: stamp('2026-11-05T10:00:00-05:00') };
  const fixtures = [old, closing, { ...old, id: 'still-open', status: 'open' }, { ...old, id: 'other-branch', branchId: 'taller' }];
  let queries = 0;
  const sdk = { Timestamp, collection: (_db, name) => name, documentId: () => 'id', where: (...filter) => filter,
    orderBy: () => null, limit: () => null, query: (_collection, ...constraints) => constraints.filter(Boolean),
    async getDocsFromServer(filters) {
      queries++;
      const matching = fixtures.filter(row => filters.every(([field, op, value]) => {
        if (op === '==') return row[field] === value;
        if (!(row[field] instanceof Timestamp && value instanceof Timestamp)) return false;
        return op === '>=' ? row[field].toMillis() >= value.toMillis() : row[field].toMillis() <= value.toMillis();
      }));
      return { size: matching.length, docs: matching.map(row => ({ id: row.id, data: () => row })) };
    },
  };
  const period = reportPeriod('hoy', old.expiredAt);
  const sessions = await createCashAuditPeriodReader({}, { sdk })(businessId, period.startDate, period.endDate, branchId);
  assert.deepEqual(sessions.map(session => session.id).sort(), ['manual', 'overnight']);
  assert.equal(queries, 4);
});
