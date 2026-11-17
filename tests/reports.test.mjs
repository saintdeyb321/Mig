import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { salesToDailyStats } from '../frontend/src/features/reports/domain/sparkReport.js';
import { reportPeriod, reportDay } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { createReportCache, reportCacheKey, createReportResource, invalidateReportScope } from '../frontend/src/features/reports/application/reportResource.js';
import { processDailyStats, processSales, DETAIL_HEADERS } from '../frontend/src/utils/salesDataProcessor.js';
import { buildContractLedgerReport } from '../frontend/src/features/reports/application/contractLedgerReport.js';
import { buildSalesWorkbook, MAX_EXPORT_ROWS, writeSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { cashReviewPresentation, managementReportHtml } from '../frontend/src/features/reports/application/managementReportHtml.js';
import { createCashPeriodReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createSalesPeriodReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { compatiblePayments } from '../frontend/src/features/payments/application/compatiblePayments.js';
import { createSheet } from '../frontend/src/utils/excelHelpers.js';
import { createSessionReportReads } from '../frontend/src/features/reports/application/sessionReportReads.js';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { assertWorkbookBorders, readOverview, readPosFooter, reportHeader, tableRows } from './helpers/reportWorkbook.mjs';

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
const rows = (wb, name) => tableRows(XLSX, wb, name);
const tick = () => new Promise(resolve => setImmediate(resolve));

it('reimports S/163.30 in registered collections without counting products or order payments twice', () => {
  const sales = [
    { ...base, id: 'yape', payment: 'yape', total: 20, items: [{ ...item, name: '10', qty: 2, price: 10 }] },
    { ...base, id: 'mixed', payment: 'mixto', total: 37.30, splitPayments: { efectivo: 10, yape: 27.30 },
      items: [{ ...item, name: '=1+1', price: 33.30 }, { ...item, id: 'p2', name: 'Pan dulce', price: 4 }] },
    { ...base, id: 'cash', payment: 'efectivo', total: 6, items: [{ ...item, qty: 2, price: 3 }] },
  ];
  const orders = [{ ...payments[0], type: 'advance', method: 'yape', clientName: 'Edith', contractNumber: 'PED-2A010C09', amount: 20 },
    { ...payments[1], branchId: 'b1', method: 'efectivo', clientName: 'Edith', contractNumber: 'PED-2A010C09', amount: 80 }];
  const contracts = [{ ...base, id: 'doc-id', branchId: 'b2', deliveryType: 'b2', contractNumber: 'PED-2A010C09', clientName: 'Edith', total: 100 },
    { ...base, id: 'another-order', total: 24, balance: 24, status: 'pendiente' }];
  const sessions = [{ ...base, openedAt: date('08'), expiredAt: date('18'), status: 'expired_unreconciled', openingAmount: 100 }];
  const { workbook, model } = build({ sales, payments: orders, branchId: 'b1', contracts, sessions });
  const copy = XLSX.read(writeSalesWorkbook(XLSX, workbook), { type: 'array', cellNF: true, cellStyles: true });
  const sheet = copy.Sheets.Detalle_Centro;
  assert.doesNotMatch(sheet.A1.v, /\(Lima\)/);
  const headerRow = reportHeader(XLSX, sheet);
  const detail = rows(copy, 'Detalle_Centro');
  assert.ok(detail.every(row => !('Sucursal' in row)));
  const amounts = detail.map(row => row['Importe neto movimiento (S/)']).filter(value => typeof value === 'number');
  assert.deepEqual(amounts.sort((a, b) => a - b), [6, 20, 37.30]);
  assert.equal(amounts.reduce((sum, value) => sum + Math.round(value * 100), 0), 6330);
  assert.deepEqual(readPosFooter(XLSX, sheet), [16, 47.30, 63.30]);
  assert.equal(model.summary.netRevenue, 163.30);
  const summary = new Map(Object.entries(readOverview(XLSX, copy)));
  assert.equal(summary.get('Cobros registrados'), 163.30);
  assert.equal(detail.filter(row => typeof row['Importe neto movimiento (S/)'] === 'number').length, 3);
  assert.equal(detail.filter(row => row['Precio unitario'] === 'TOTAL TICKET').length, 3);
  assert.ok(detail.every(row => !/PEDIDO/.test(row.Movimiento)));
  const products = detail.filter(row => row.Producto);
  assert.equal(products.length, 4);
  assert.ok(products.some(row => row.Producto === '10'));
  assert.ok(products.every(row => !/PEDIDO$/.test(row.Movimiento)));
  assert.ok(Object.values(sheet).some(cell => cell.t === 's' && cell.v === '=1+1' && !cell.f));
  const header = XLSX.utils.sheet_to_json(sheet, { header: 1, range: headerRow })[0];
  const cell = (name, offset = 1) => sheet[XLSX.utils.encode_cell({ r: headerRow + offset, c: header.indexOf(name) })];
  assert.equal(cell('Fecha').w, '22/10/2026');
  assert.equal(cell('Hora').w, '10:00');
  assert.equal(cell('Importe neto movimiento (S/)').t, 'n');
  assert.match(cell('Importe neto movimiento (S/)').z, /S\//);
  assert.equal(cell('Cantidad').z, '0');
  assert.match(cell('Precio unitario').z, /S\//);
  assert.equal(copy.SheetNames.includes('Comparativa_Sedes'), false);
  assert.equal(copy.SheetNames.includes('Productos_Sedes'), false);
  const orderRows = rows(copy, 'Auditoría_Pedidos');
  assert.deepEqual(orderRows.map(row => [row.Movimiento, row['N.º de pedido'], row.Cliente, row['Neto Movimiento (S/)']]), [
    ['ADELANTO PEDIDO', 'PED-2A010C09', 'Edith', 20], ['ABONO PEDIDO', 'PED-2A010C09', 'Edith', 80],
  ]);
  const [order] = orderRows;
  assert.deepEqual([order['Sede Origen'], order['Sede Recojo'], order['Sede Movimiento']], ['Taller', 'Taller', undefined]);
  const [otherOrder] = rows(copy, 'Estado_Pedidos');
  assert.deepEqual([otherOrder.Pedido, otherOrder.Cliente, otherOrder.Sede], ['Sin número comercial', 'Cliente sin nombre', undefined]);
  const [opening, expiry] = rows(copy, 'Auditoría_Cajas');
  assert.equal(opening.Sede, 'Centro');
  assert.deepEqual([opening['Fondo inicial (S/)'], opening['Efectivo contado (S/)'], expiry['Efectivo contado (S/)'], expiry['Diferencia (S/)']],
    [100, 'No declarado', 'No declarado', 'No calculable']);
});

it('Plan05 keeps stale presentation for prefixed network errors and withdraws figures after permission denial', async () => {
  let state, failure;
  const resource = createReportResource({ ...scope, key: 'plan05-prefixed-errors', cache: createReportCache(), readStats: async () => stats,
    readPayments: async () => { if (failure) throw Object.assign(Error('Read failed'), { code: failure }); return []; }, onState: value => { state = value; } });
  await resource.ready; assert.ok(state.model);
  failure = 'firestore/unavailable'; await resource.refresh(true); assert.ok(state.model); assert.ok(state.queryError);
  failure = 'firestore/permission-denied'; await resource.refresh(true); assert.equal(state.model, null); resource.close();
});

it('Plan05 accounts an immutable POS refund once with negative detailed items and reconciled net totals', () => {
  const original = sales[0], refund = { ...base, id: original.id, saleId: original.id, userId: 'owner', reason: 'Devolución comprobada',
    authority: 'pos-compensation', amount: -40, cashAmount: -15, digitalAmount: -25, items: original.items, occurredAt: date('12') };
  const { workbook, model } = build({ sales: [original], stats: [], payments: [], voids: [refund, refund] });
  assert.equal(model.summary.netRevenue, 0); assert.equal(model.summary.contractRevenue, 0); assert.equal(model.summary.refundCount, 1);
  assert.deepEqual(model.summary.channels, {
    cash: { collections: 15, posCompensations: -15, contractRefunds: 0, net: 0 },
    digital: { collections: 25, posCompensations: -25, contractRefunds: 0, net: 0 },
  });
  assert.ok(model.products.every(row => row.qty === 0 && row.revenue === 0));
  const copy = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const details = rows(copy, copy.SheetNames.find(name => name.startsWith('Detalle_')));
  const summary = new Map(Object.entries(readOverview(XLSX, copy)));
  assert.equal(summary.get('Compensaciones POS · Yape / Plin'), -25);
  assert.equal(summary.get('Neto por Yape/Plin (S/)'), 0);
  assert.equal(details.filter(row => row.Producto && row.Cantidad === -2).length, 1);
  assert.equal(details.reduce((sum, row) => sum + (Number(row['Importe neto movimiento (S/)']) || 0), 0), 0);
  const priorSale = { ...original, createdAt: '2026-10-21T10:00:00-05:00' };
  const dashboard = aggregateReport({ ...scope, stats: salesToDailyStats([priorSale]), voids: [refund] }).summary;
  const priorDayExport = build({ sales: [priorSale], payments: [], voids: [refund] });
  const priorDayRows = new Map(Object.entries(readOverview(XLSX, priorDayExport.workbook)));
  assert.deepEqual(priorDayExport.model.summary.channels, dashboard.channels);
  assert.equal(priorDayRows.get('Neto por Yape/Plin (S/)'), -25);
  assert.throws(() => build({ voids: [{ ...refund, items: [{ ...item, qty: 1 }] }] }), /no verificable/);
});

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
    const historical = { ...sales[0], splitPayments: { efectivo: 15, plin: 25 } };
    assert.deepEqual(aggregateReport({ stats: salesToDailyStats([historical]), ...scope }).summary.channels, result.channels);
  });
  it('several contract payments sum their movements, not the commercial total', () => {
    const result = aggregateReport({ payments, ...scope }).summary;
    assert.equal(result.contractRevenue, 30); assert.equal(result.contractPaymentCount, 2); assert.equal(result.posTicketCount, 0);
  });
  it('refunds remain negative and never count as new tickets', () => {
    const result = aggregateReport({ payments: [payments[2]], ...scope }).summary;
    assert.equal(result.netRevenue, -5); assert.equal(result.refunds, -5); assert.equal(result.contractPaymentCount, 0);
    assert.deepEqual(result.channels.cash, { collections: 0, posCompensations: 0, contractRefunds: -5, net: -5 });
    assert.equal(aggregateReport({ payments: [payments[2]], ...scope }).chartData[0].ventas, -5);
  });
  it('payment IDs are counted once even during overlapping reads', () => {
    const overlapping = [...payments, { ...payments[0], amount: 999 }];
    const { workbook, model } = build({ sales: [], payments: overlapping });
    assert.equal(model.summary.contractRevenue, 30);
    const detail = workbook.SheetNames.filter(name => name.startsWith('Detalle_')).flatMap(name => rows(workbook, name));
    assert.equal(detail.reduce((sum, row) => sum + (row['Importe neto movimiento (S/)'] || 0), 0), 0);
    assert.equal(rows(workbook, 'Auditoría_Pedidos').reduce((sum, row) => sum + row['Neto Movimiento (S/)'], 0), 30);
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
    assert.equal(result.length, 1); assert.equal(result[0].Fecha, '22/10/2026'); assert.equal(result[0]['Ingreso neto (S/)'], 75);
    assert.equal(result[0].Tickets, 2); assert.equal(result[0]['Pagos de pedidos (S/)'], 15);
  });
  it('details are ordered by real timestamps within a day', () => {
    const result = processSales(sales, [...payments].reverse(), scope).groupsByBranch.b1;
    const firstRows = result.map(group => group.movement);
    assert.deepEqual(firstRows.map(row => row.Hora), ['10:00', '11:00', '14:00']);
  });
  it('every POS detail row uses the same columns', () => {
    const result = processSales(sales, payments, scope).groupsByBranch;
    for (const { movement } of Object.values(result).flat()) assert.deepEqual(Object.keys(movement), DETAIL_HEADERS);
  });
  it('invalid money or unreconciled splits never become NaN, Infinity or plausible partial totals', () => {
    assert.throws(() => aggregateReport({ stats: [{ ...stats[0], totalRevenue: Infinity }] }));
    assert.throws(() => aggregateReport({ stats: [{ ...stats[0], totalRevenue: NaN }] }));
    assert.throws(() => aggregateReport({ payments: [{ ...payments[0], method: 'mixto', splitPayments: { efectivo: 1 } }] }));
    assert.throws(() => createSheet(XLSX, [{ Ingreso: NaN }], []));
    assert.throws(() => processSales([{ ...sales[1], total: 100 }]), /no concilia/);
  });
  it('nested and dotted legacy aggregate increments combine without shadowing zero fields', () => {
    const stat = { ...stats[0], totalRevenue: 70, paymentMethods: { efectivo: 10, yape: 0 }, productSales: { p1: { name: 'Pan', qty: 1, revenue: 10 } } };
    const result = aggregateReport({ stats: [stat] });
    assert.equal(result.summary.cashRevenue, 45); assert.equal(result.products[0].qty, 4); assert.equal(result.products[0].revenue, 70);
  });
  it('empty data yields explicit zeros and a complete date skeleton', () => {
    const result = aggregateReport(scope); assert.equal(result.summary.netRevenue, 0); assert.equal(result.summary.posAverageTicket, 0);
    assert.equal(result.chartData.length, 1); assert.equal(result.topProducts.length, 0);
    assert.deepEqual(build({ stats: [], sales: [], payments: [], branchId: 'b1' }).workbook.SheetNames, ['Resumen_Financiero']);
    const { workbook } = build({ stats: [], sales: [], payments: [] });
    assert.deepEqual(rows(workbook, 'Comparativa_Sedes').map(row => [row.Sede, row.Tickets, row['Ingreso neto (S/)']]),
      [['Centro', 0, 0], ['Taller', 0, 0]]);
    assert.equal(workbook.Sheets.Detalle_Taller['!ref'], 'A1:M1');
    assert.deepEqual(rows(workbook, 'Detalle_Taller'), []);
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
  it('detailed and monthly summaries reconcile with independent product and financial columns', () => {
    const detailed = build({ detailed: true });
    const detail = detailed.workbook.SheetNames.filter(name => name.startsWith('Detalle_')).flatMap(name => rows(detailed.workbook, name));
    assert.equal(detail.filter(row => row.Producto).reduce((sum, row) => sum + row['Subtotal (S/)'], 0), 60);
    assert.equal(detail.reduce((sum, row) => sum + Number(row['Importe neto movimiento (S/)'] || 0), 0), 60);
    assert.equal(rows(detailed.workbook, 'Auditoría_Pedidos').reduce((sum, row) => sum + row['Neto Movimiento (S/)'], 0), 30);
    assert.equal(rows(detailed.workbook, 'Comparativa_Sedes').reduce((sum, row) => sum + row['Ingreso neto (S/)'], 0), 90);
    const monthly = build({ period: reportPeriod('mes', date('12')), detailed: false });
    const daily = monthly.workbook.SheetNames.filter(name => name.startsWith('Resum_')).flatMap(name => rows(monthly.workbook, name));
    assert.equal(daily.reduce((sum, row) => sum + row['Ingreso neto (S/)'], 0), 90);
    assert.deepEqual(monthly.model.summary, detailed.model.summary);
  });
  it('contract audit uses document ID separately from commercial number, payment date and negative refunds', () => {
    const result = buildContractLedgerReport(payments, [{ id: 'doc-id', contractNumber: 'COM-100', total: 1000, updatedAt: '2030-01-01' }], branchesMap);
    assert.equal(result.contractPaymentRows.length, 3);
    assert.equal(result.contractPaymentRows[0]['N.º de pedido'], 'COM-100');
    assert.ok(!Object.values(result.contractPaymentRows[0]).includes('doc-id'));
    assert.ok(!('ID Movimiento' in result.contractPaymentRows[0]) && !('Documento Pedido' in result.contractPaymentRows[0]));
    assert.equal(result.contractPaymentRows[0]['Fecha Pago'], '22/10/2026 09:00');
    assert.equal(result.contractPaymentRows[2]['Reembolso contable (S/)'], -5);
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
    const audit = rows(restored, 'Auditoría_Cajas');
    assert.equal(audit[0]['Fondo inicial (S/)'], 10);
    assert.equal(audit[0]['Efectivo contado (S/)'], 'No declarado');
    assert.equal(audit[1]['Efectivo contado (S/)'], 'No declarado');
    assert.equal(audit[1]['Diferencia (S/)'], 'No calculable');
  });
  it('cash audit includes an overnight session closing in the selected Lima day', () => {
    const { workbook } = build({ sessions: [{ ...base, openedAt: '2026-10-21T23:00:00-05:00', closedAt: date('08'), status: 'closed',
      openingAmount: 10, openingDiscrepancy: 0, declaredAmount: 75, expectedCash: 75, difference: 0 }] });
    const audit = rows(workbook, 'Auditoría_Cajas');
    assert.equal(audit.length, 1);
    assert.equal(XLSX.SSF.format('dd/mm/yyyy hh:mm', audit[0].Fecha + audit[0].Hora), '22/10/2026 08:00');
    assert.equal(audit[0].Turno, 'CIERRE MANUAL');
    assert.equal(build({}).model.summary.netRevenue, 90);
  });
  it('sanitized or truncated branch names cannot duplicate workbook sheet names', () => {
    const { workbook } = build({ branchesMap: { b1: 'A/'.padEnd(50, 'x'), b2: 'A:'.padEnd(50, 'x') } });
    assert.equal(new Set(workbook.SheetNames.map(name => name.toLowerCase())).size, workbook.SheetNames.length);
    assert.ok(workbook.SheetNames.every(name => name.length <= 31));
  });
  it('P27 keeps branch product rows compact with sparse separators and unchanged quantities and amounts', () => {
    const biscuit = { id: 'p2', name: 'Bizcocho de vainilla con almendras', qty: 1, price: 5 };
    const { workbook } = build({ payments: [], sales: [
      { ...sales[1], total: 45, items: [{ ...item, qty: 2 }, biscuit] },
      { ...sales[1], id: 'taller', branchId: 'b2', total: 65, items: [{ ...item, qty: 3 }, biscuit] },
    ] });
    const sheet = workbook.Sheets.Productos_Sedes;
    assert.deepEqual([sheet.A1.v, sheet.B1.v], ['Sucursal', 'Producto']);
    assert.deepEqual(sheet['!cols'].slice(0, 2).map(column => column.wch), [20, 33]);
    assert.deepEqual(sheet['!rows'].map(row => row.hpt), [25, 21, 21, 13, 21, 21]);
    for (const start of [2, 5]) {
      for (const col of 'ABCD') {
        const group = sheet[col + start].s;
        assert.equal(group.border.top.style, 'thin');
        assert.equal(group.border.top.color.rgb.slice(-6), '000000');
        assert.equal(Boolean(group.font.bold), col === 'A');
      }
      assert.deepEqual(['A', 'B', 'D'].map(col => sheet[col + start].s.fill.fgColor.rgb.slice(-6)), ['9DE0F6', 'FFFFA6', 'B4C6E7']);
    }
    for (const col of 'ABCD') assert.equal(sheet[col + '4'], undefined);
    assert.equal(sheet.A3, undefined);
    assert.equal(sheet.A6, undefined);
    const bytes = writeSalesWorkbook(XLSX, workbook), copy = XLSX.read(bytes, { type: 'array', cellStyles: true });
    assertWorkbookBorders(XLSX, copy, bytes);
    assert.deepEqual(rows(copy, 'Productos_Sedes'), [
      { Producto: item.name, Sucursal: 'Centro', 'Cantidad vendida': 2, 'Ventas (S/)': 40 },
      { Producto: biscuit.name, Sucursal: '', 'Cantidad vendida': 1, 'Ventas (S/)': 5 },
      { Producto: item.name, Sucursal: 'Taller', 'Cantidad vendida': 3, 'Ventas (S/)': 60 },
      { Producto: biscuit.name, Sucursal: '', 'Cantidad vendida': 1, 'Ventas (S/)': 5 },
    ]);
  });
  it('P26 ranks branches by net revenue, then name and ID, independently of cash differences', () => {
    const sessions = [
      { ...base, openedAt: date('08'), closedAt: date('15'), status: 'closed', openingAmount: 10,
        declaredAmount: 130, expectedCash: 30, difference: 100 },
      { ...base, branchId: 'b3', openedAt: date('08'), closedAt: date('15'), status: 'closed', openingAmount: 10,
        declaredAmount: 33, expectedCash: 30, difference: 3 },
    ];
    const { workbook } = build({ payments: [], sessions, branchesMap: { b4: 'Álamo', b3: 'Centro', b2: 'Taller', b1: 'Centro' },
      sales: Object.entries({ b1: 20, b2: 40, b3: 20, b4: 20 }).map(([branchId, total]) => ({ ...sales[1],
        branchId, id: `sale-${branchId}`, total, items: [{ ...item, price: total }] })) });
    assert.deepEqual(rows(workbook, 'Comparativa_Sedes').map(row => [row.Sede, row['Ingreso neto (S/)'], row['Diferencia de caja confirmada (S/)']]),
      [['Taller', 40, 'Sin arqueo'], ['Álamo', 20, 'Sin arqueo'], ['Centro', 20, 100], ['Centro', 20, 3]]);
    assert.equal(workbook.Sheets.Comparativa_Sedes.A7.v, 'TOTAL NEGOCIO');
    assert.equal(workbook.Sheets.Comparativa_Sedes.E7.v, 100);
  });
  it('a huge line-item dataset is refused before allocating worksheet rows', () => {
    assert.throws(() => build({ sales: [{ ...sales[0], items: Array(10001).fill(item) }] }), /Demasiadas filas/);
  });
  it('P26 rejects over-limit detail and reimports exactly 10,000 rows with ticket totals and separators intact', context => {
    const items = Array.from({ length: 8 }, (_, index) => ({ ...item, id: `product-${index}`, price: 1 }));
    const sales = Array.from({ length: 999 }, (_, index) => ({ ...base,
      id: `ticket-${index}`, total: 8, payment: 'efectivo', items }));
    const last = { ...sales[0], id: 'ticket-end' };
    assert.throws(() => build({ payments: [], sales: [...sales, { ...last, items: items.slice(0, 7), total: 7 }] }),
      /Demasiadas filas de detalle al incluir totales y separadores\. Selecciona un período menor\./);
    sales.push({ ...last, items: items.slice(0, 6), total: 6 });
    const productLines = sales.reduce((sum, sale) => sum + sale.items.length, 0);
    const start = performance.now();
    const { workbook } = build({ sales, payments: [] });
    const built = performance.now(), bytes = writeSalesWorkbook(XLSX, workbook);
    const serialized = performance.now(), copy = XLSX.read(bytes, { type: 'array', cellStyles: true });
    context.diagnostic(JSON.stringify({ tickets: sales.length, productLines, bytes: bytes.byteLength,
      buildMs: Math.round(built - start), serializeMs: Math.round(serialized - built), reimportMs: Math.round(performance.now() - serialized) }));
    assertWorkbookBorders(XLSX, copy, bytes);
    const detail = rows(copy, 'Detalle_Centro');
    const sheet = copy.Sheets.Detalle_Centro;
    assert.equal(XLSX.utils.decode_range(sheet['!ref']).e.r - reportHeader(XLSX, sheet), MAX_EXPORT_ROWS);
    assert.equal(sheet['!rows'].filter(row => row?.hpt === 9).length, sales.length);
    assert.equal(detail.filter(row => row.Producto).length, productLines);
    assert.equal(detail.length, productLines + sales.length);
    assert.equal(detail.filter(row => row['Precio unitario'] === 'TOTAL TICKET').length, sales.length);
    assert.equal(detail.filter(row => row.Movimiento === 'VENTA POS').length, sales.length);
    assert.equal(detail.reduce((sum, row) => sum + (row['Importe neto movimiento (S/)'] || 0), 0), productLines);
  });
});

it('P28 reconciles S/258.90 and shares five incidents between the Excel KPI and PDF', () => {
  const fixtures = { b1: [6, 20, 15.10, 20.25, 15.25, 25], b2: [22, 29, 17.50, 18.20, 40.60, 20] };
  const sales = Object.entries(fixtures).flatMap(([branchId, amounts]) => amounts.map((total, index) => ({ ...base, branchId,
    id: `${branchId}-${index}`, total, payment: 'efectivo', items: index ? [{ ...item, price: total }]
      : [{ ...item, id: 'first', price: 1 }, { ...item, price: total - 1 }] })));
  const closeTimes = ['19:00:05', '19:00:05', '19:00:37', '19:01:00', '19:02:00', '19:03:00', '19:04:00'];
  const sessions = [3, 32, -43.30, -25.30, 0, 0, 0, null].map((difference, index) => ({ ...base, branchId: index < 3 ? 'b2' : 'b1',
    id: `box-session-${index}`, openedAt: date('08'), openingAmount: 100 + index, ...(difference == null
      ? { status: 'expired_unreconciled', expiredAt: date('18'), recoveredAt: `${day}T18:45:00-05:00` }
      : { status: 'closed', closedAt: `${day}T${closeTimes[index]}-05:00`, expectedCash: 100,
        declaredAmount: 100 + difference, difference, reconciliationPending: [1, 3, 5].includes(index),
        closingNote: index === 3 ? '<b>Revisar monedas</b>' : undefined }) }));
  const { workbook, view } = build({ sales, sessions, payments: [{ ...payments[1], amount: 10 }] });
  const bytes = writeSalesWorkbook(XLSX, workbook), copy = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true });
  assertWorkbookBorders(XLSX, copy, bytes);
  const summary = readOverview(XLSX, copy);
  assert.deepEqual([summary['Total neto registrado (S/)'], summary['Tickets de venta válidos'], summary['Neto de pagos de pedidos (S/)']], [258.90, 12, 10]);
  assert.deepEqual(rows(copy, 'Comparativa_Sedes').map(row => [row.Sede, row.Tickets, row['Ingreso neto (S/)']]),
    [['Taller', 6, 157.30], ['Centro', 6, 101.60]]);
  const detail = ['Centro', 'Taller'].flatMap(name => rows(copy, `Detalle_${name}`));
  assert.equal(detail.filter(row => row['Precio unitario'] === 'TOTAL TICKET').length, 12);
  assert.ok(detail.every(row => !/PEDIDO/.test(row.Movimiento)));
  assert.equal(detail.reduce((sum, row) => sum + Math.round((row['Importe neto movimiento (S/)'] || 0) * 100), 0), 24890);
  assert.deepEqual(rows(copy, 'Auditoría_Pedidos').map(row => row['Neto Movimiento (S/)']), [10]);
  const audit = rows(copy, 'Auditoría_Cajas'), cashSheet = copy.Sheets.Auditoría_Cajas;
  assert.equal(cashSheet['!autofilter'], undefined);
  assert.deepEqual(cashSheet['!rows'].map(row => row.hpt), [25, ...Array.from({ length: 8 }, (_, i) => i ? [13, 21, 21] : [21, 21]).flat()]);
  for (let i = 0; i < audit.length; i += 2) {
    assert.deepEqual(audit.slice(i, i + 2).map(row => row.Turno), ['APERTURA', audit[i + 1].Estado === 'Vencido sin conteo' ? 'VENCIMIENTO' : 'CIERRE MANUAL']);
    assert.equal(audit[i]['Fondo inicial (S/)'], audit[i + 1]['Fondo inicial (S/)']);
  }
  const closes = audit.filter(row => row.Turno === 'CIERRE MANUAL');
  assert.deepEqual(closes.filter(row => row['Diferencia (S/)'] === 0).map(row => row.Estado),
    ['Cuadrado', 'Sin diferencia registrada · por verificar', 'Cuadrado']);
  const provisional = closes.find(row => row.Estado === 'Faltante por revisar');
  assert.equal(provisional['Diferencia (S/)'], -25.30);
  assert.equal(provisional.Observación, 'Mensaje adjunto: <b>Revisar monedas</b>');
  assert.equal(audit.filter(row => row.Observación).length, 1);
  assert.equal(audit.find(row => row.Turno === 'VENCIMIENTO')['Diferencia (S/)'], 'No calculable');
  for (const time of closeTimes.slice(0, 3)) assert.ok(Object.values(cashSheet).some(cell => cell?.z === 'hh:mm:ss' && cell?.w === time));
  const kpi = XLSX.utils.sheet_to_json(copy.Sheets.Resumen_Financiero, { header: 1 }).find(row => row[0] === 'CAJAS QUE REQUIEREN REVISIÓN');
  assert.deepEqual(kpi, ['CAJAS QUE REQUIEREN REVISIÓN', 5]);
  const review = cashReviewPresentation(view.cashEvents);
  assert.equal(review.totalCount, 5);
  assert.deepEqual(review.visible.map(row => row.difference).filter(Number.isFinite).sort((a, b) => a - b), [-43.30, -25.30, 3, 32]);
  const html = managementReportHtml(view, { period, business: 'Pastelería', branch: 'Todas las sucursales', generatedAt: date('20') });
  assert.match(html, /Faltaron S\/ 25\.30 · importe por verificar/);
  assert.match(html, /Sobraron S\/ 32\.00 · importe por verificar/);
  assert.match(html, /Mensaje adjunto: &lt;b&gt;Revisar monedas&lt;\/b&gt;/);
  assert.match(html, /19:00:05 \(Lima\).*Ref\. ession-[01]/);
  assert.match(html, /Venció 22\/10\/2026 18:00 \(Lima\).*Confirmado 22\/10\/2026 18:45/);
  assert.equal(cashReviewPresentation([{ kind: 'closing', date: new Date(date('19')), counted: 100, reference: 100, difference: null }]).totalCount, 1);
  assert.equal(cashReviewPresentation([{ kind: 'closing', date: new Date(date('19')), counted: 100, reference: null, difference: 0 }]).totalCount, 1);
});

it('P28 groups order movements by real identity and timestamp with a single sparse separator', () => {
  const comercial = 'PED-IGUAL';
  const orders = [
    { ...payments[0], id: 'other-order', sourceId: 'order-b', amount: 8, contractNumber: comercial, occurredAt: date('09') },
    { ...payments[2], id: 'refund', sourceId: 'order-a', contractNumber: comercial, occurredAt: date('10') },
    { ...payments[1], id: 'later-id', sourceId: 'order-a', amount: 12, contractNumber: comercial, occurredAt: '2026-10-22T04:55:00Z' },
    { ...payments[0], id: 'earlier-id', sourceId: 'order-a', contractNumber: comercial, occurredAt: '2026-10-22T04:55:00Z' },
  ];
  const opts = { payments: orders, sales: [sales[1]], period: reportPeriod('mes', date('12')) };
  const { workbook } = build(opts);
  const bytes = writeSalesWorkbook(XLSX, workbook), copy = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true });
  assertWorkbookBorders(XLSX, copy, bytes);
  const sheet = copy.Sheets.Auditoría_Pedidos, ledger = rows(copy, 'Auditoría_Pedidos');
  assert.equal(sheet['!autofilter'], undefined);
  assert.deepEqual(sheet['!rows'].map(row => row.hpt), [25, 21, 21, 21, 13, 21]);
  assert.equal(sheet.A5, undefined);
  assert.deepEqual(ledger.map(row => row['Neto Movimiento (S/)']), [20, 12, -5, 8]);
  assert.ok(ledger.every(row => row['N.º de pedido'] === comercial && !Object.keys(row).some(key => key.startsWith('_'))));
  assert.deepEqual([sheet.A2.w, sheet.A4.w, sheet.A6.w], ['21/10/2026 23:55', '22/10/2026 10:00', '22/10/2026 09:00']);
  assert.equal(readOverview(XLSX, copy)['Total neto registrado (S/)'], 55);
  assert.equal(copy.Sheets.Resum_Centro['!autofilter'].ref[0], 'A');
  assert.throws(() => build({ payments: Array.from({ length: 5001 }, (_, i) => ({ ...payments[0], id: `payment-${i}`, sourceId: `order-${i}` })), sales: [] }),
    /Demasiadas filas de auditoría de pedidos al incluir separadores/);
});

it('P27 starts all weekly sources together and retains them across a canceled wait and retry', async () => {
  const resources = createSessionResources(), calls = [], pending = [];
  const read = kind => (businessId, _start, _end, scope) => {
    calls.push([kind, businessId, typeof scope === 'string' ? scope : scope.branchId]);
    return new Promise(resolve => pending.push(() => resolve(kind === 'sales' ? Array(6000).fill({}) : [])));
  };
  const factory = createSessionReportReads({ getSalesInPeriod: read('sales'), getContractsInPeriod: read('contracts'),
    getPaymentsInPeriod: read('payments'), readVoidsInPeriod: read('voids'), getSessionsInPeriod: read('cash') });
  const scope = ['tenant-a', 'global', reportPeriod('semana', date('12')), { identityKey: 'operator', revision: 1 }];
  try {
    const reader = factory(resources, ...scope);
    let authorized = true;
    const first = assert.rejects(reader.exportSnapshot(() => authorized), { name: 'AbortError' });
    await tick();
    assert.deepEqual(calls.map(([kind]) => kind).sort(), ['cash', 'contracts', 'payments', 'sales', 'voids']);
    assert.ok(calls.every(([, businessId, branchId]) => businessId === 'tenant-a' && branchId === 'global'));
    reader.discardSnapshot(); // A retry cannot evict readings that the session still owns.
    const retry = factory(resources, ...scope).exportSnapshot();
    authorized = false;
    await tick();
    assert.equal(calls.length, 5);
    pending.forEach(release => release());
    const [, repeated] = await Promise.all([first, retry]);
    assert.equal(repeated.sales.length, 6000);
  } finally { resources.close(); }
});

it('P27 retains the annual sales gate without complementary reads', async () => {
  const resources = createSessionResources();
  let salesCalls = 0;
  const unexpected = () => assert.fail('An oversized year cannot trigger supplementary reads');
  const factory = createSessionReportReads({ getSalesInPeriod: async () => {
    salesCalls++;
    throw Object.assign(Error('Demasiados tickets'), { code: 'report-limit' });
  }, getContractsInPeriod: unexpected, getPaymentsInPeriod: unexpected, readVoidsInPeriod: unexpected, getSessionsInPeriod: unexpected });
  try {
    const reader = factory(resources, 'tenant-a', 'global', reportPeriod('todo', date('12')));
    await assert.rejects(reader.exportSnapshot(), { code: 'report-limit' });
    await assert.rejects(reader.exportSnapshot(), { code: 'report-limit' });
    assert.equal(salesCalls, 1);
  } finally { resources.close(); }
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
