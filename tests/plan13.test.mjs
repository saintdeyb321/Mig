import { completeContractPhotos } from '../frontend/src/features/contracts/application/contractPhotoCompletion.js';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { validatePOSPayment } from '../functions/src/sales/domain/saleModel.js';
import { calculateCashTotals } from '../functions/src/cash-register/domain/cashTotals.js';
import { commercialFields, financialProjection } from '../functions/src/contracts/domain/contractModel.js';
import { createReportCache, createReportResource, reportCacheKey } from '../frontend/src/features/reports/application/reportResource.js';
import { buildSalesWorkbook, MAX_EXPORT_ROWS } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { reportPeriod, visibleDay } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { aggregateReport } from '../frontend/src/features/reports/domain/reportTotals.js';
import { salesToDailyStats } from '../frontend/src/features/reports/domain/sparkReport.js';
import { voidCashPayments } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { fitsContractImageLimit, MAX_CONTRACT_IMAGES } from '../frontend/src/features/contracts/application/contractImagePolicy.js';
import { cashLockId, createSparkCashRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { plan08FinancialHarness, plan08Sale, plan08Timestamp } from './helpers/plan08FinancialHarness.mjs';
import { pairedTicket, reportPeriodHarness, saleDay as qaSaleDay, spanningPeriod, voidDay as qaVoidDay } from './helpers/plan13PeriodHarness.mjs';

const XLSX = createRequire(new URL('../frontend/package.json', import.meta.url))('xlsx-js-style');
const time = (hour, day = '2026-10-22') => `${day}T${hour}:00:00-05:00`;
const base = { businessId: 'qa13-a', branchId: 'centro', cashierName: 'Cajera de ensayo' };
const now = time('15');
const branchesMap = { centro: 'Centro', taller: 'Taller' };
const scope = { businessId: base.businessId, branchId: 'global', period: reportPeriod('hoy', now) };
const sale = (id, payment, total, extra = {}) => ({ ...base, id, payment, total, createdAt: time('10'),
  items: [{ id: `producto-${id}`, name: 'Pan de ensayo', qty: 1, price: total }], ...extra });
const cashSale = sale('s1', 'efectivo', 20, { amountPaid: 50, change: 30 });
const yapeSale = sale('s2', 'yape', 30);
const mixedSale = sale('s3', 'mixto', 20, { splitPayments: { efectivo: 8, yape: 12 } });
const salesA = [cashSale, yapeSale, mixedSale];
const movement = (id, type, amount, hour, sourceId = 'qa13-pedido') => ({ ...base, id, sourceId, type, amount,
  method: 'yape', occurredAt: time(hour) });
const advance = movement('a1', 'advance', 15, '11');
const compensation = (original, cashAmount, digitalAmount, reason = 'Motivo de ensayo') => ({ ...base,
  id: original.id, saleId: original.id, userId: 'qa13-cajera', authority: 'pos-compensation',
  amount: -original.total, cashAmount, digitalAmount, items: original.items, reason, occurredAt: time('12') });
const yapeVoid = compensation(yapeSale, 0, -30);
const rows = (wb, name) => {
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', range: XLSX.utils.decode_range(sheet['!autofilter'].ref).s.r });
};
const roundTrip = wb => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
const sumMoney = values => values.reduce((cents, value) => cents + Math.round((value || 0) * 100), 0) / 100;

async function simulate({ sales = [], payments = [], voids = [], ...options } = {}) {
  const query = { ...scope, ...options };
  let state;
  const resource = createReportResource({ ...query, key: reportCacheKey({ ...query, identityKey: 'qa13-dueno' }),
    cache: createReportCache(), readSales: async () => sales, readPayments: async () => payments,
    readVoids: async () => voids, onState: value => { state = value; } });
  try { await resource.ready; } finally { resource.close(); }
  assert.ok(state.model, state.error);
  const { workbook, model } = buildSalesWorkbook(XLSX, { ...query, sales, payments, voids, branchesMap, now });
  const wb = roundTrip(workbook);
  const summary = Object.fromEntries(rows(wb, 'Resumen_Financiero').map(row => [row.Concepto, row.Valor]));
  return { dashboard: state.model, model, wb, summary };
}

function assertReconciled({ dashboard, model, wb, summary }) {
  const metrics = dashboard.summary;
  assert.deepEqual(model.summary, metrics);
  assert.deepEqual(model.days, dashboard.days);
  assert.deepEqual(model.products, dashboard.products);
  assert.equal(summary['Total neto registrado (S/)'], metrics.netRevenue);
  assert.equal(summary['Neto de ventas en mostrador (S/)'], metrics.posRevenue);
  assert.equal(summary['Neto de pagos de pedidos (S/)'], metrics.contractRevenue);
  for (const [key, label] of [['cash', 'Efectivo'], ['digital', 'Yape / Plin']]) {
    const channel = metrics.channels[key];
    assert.equal(summary[`Cobros registrados · ${label}`], channel.collections);
    assert.equal(summary[`Compensaciones POS · ${label}`], channel.posCompensations);
    assert.equal(summary[`Reembolsos contables de pedidos · ${label}`], channel.contractRefunds);
    assert.equal(summary[key === 'cash' ? 'Neto en efectivo (S/)' : 'Neto por Yape/Plin (S/)'], channel.net);
    assert.equal(sumMoney([channel.collections, channel.posCompensations, channel.contractRefunds]), channel.net);
  }
  assert.equal(sumMoney([metrics.cashRevenue, metrics.digitalRevenue]), metrics.netRevenue);
  const compareBranches = dashboard.branches.size > 1;
  assert.equal(wb.SheetNames.includes('Comparativa_Sedes'), compareBranches);
  const branchRows = compareBranches ? rows(wb, 'Comparativa_Sedes') : [];
  if (compareBranches) assert.equal(sumMoney(branchRows.map(row => row['Total neto registrado (S/)'])), metrics.netRevenue);
  for (const branch of dashboard.branches.values()) {
    const name = branchesMap[branch.branchId] ?? branch.branchId;
    if (compareBranches) {
      const row = branchRows.find(row => row.Sucursal === name);
      assert.deepEqual([row['Total neto registrado (S/)'], row['Neto en efectivo (S/)'], row['Neto por Yape/Plin (S/)'], row['Ventas anuladas']],
        [branch.netRevenue, branch.cashRevenue, branch.digitalRevenue, branch.voidedTicketCount]);
    }
    if (wb.Sheets['Detalle_' + name]) {
      assert.equal(sumMoney(rows(wb, 'Detalle_' + name).map(row => row['Importe movimiento (S/)'])), branch.netRevenue);
    }
    if (wb.Sheets['Resum_' + name]) {
      assert.deepEqual(rows(wb, 'Resum_' + name).map(row => [XLSX.SSF.format('dd/mm/yyyy', row.Fecha), row['Total neto registrado (S/)'], row['Neto en efectivo (S/)'], row['Neto por Yape/Plin (S/)'], row['Ventas anuladas']]),
        dashboard.days.filter(day => day.branchId === branch.branchId)
          .map(day => [visibleDay(day.day), day.netRevenue, day.cashRevenue, day.digitalRevenue, day.voidedTicketCount]));
    }
  }
  if (dashboard.products.length) {
    assert.equal(wb.SheetNames.includes('Productos_Sedes'), compareBranches);
    if (compareBranches) assert.deepEqual(rows(wb, 'Productos_Sedes').map(row => [row.Producto, row.Sucursal, row.Cantidad, row['Importe neto de productos POS (S/)']]),
      dashboard.products.map(row => [row.name, branchesMap[row.branchId] ?? row.branchId, row.qty, row.revenue]));
    else assert.deepEqual(rows(wb, 'Productos_Global').map(row => [row.Producto, row.Cantidad, row['Importe neto de productos POS (S/)']]),
      [...dashboard.products].sort((a, b) => b.qty - a.qty).map(row => [row.name, row.qty, row.revenue]));
  }
  const detailSheets = wb.SheetNames.filter(name => name.startsWith('Detalle_'));
  const periodRows = detailSheets.length ? detailSheets.flatMap(name => rows(wb, name))
    : wb.SheetNames.filter(name => name.startsWith('Resum_')).flatMap(name => rows(wb, name));
  const totalColumn = detailSheets.length ? 'Importe movimiento (S/)' : 'Total neto registrado (S/)';
  assert.equal(sumMoney(periodRows.map(row => row[totalColumn])), metrics.netRevenue);
  if (detailSheets.length) assert.equal(sumMoney(periodRows.map(row => row['Subtotal producto'])), metrics.posRevenue);
  assert.match(summary['Alcance de las compensaciones POS'], /sin evidencia de desembolso físico ni de devolución digital/);
}

it('P13 validates cash change, Yape, Plin and exact mixed cents without rounding invalid entries', () => {
  const cash = validatePOSPayment({ ...cashSale, amountPaid: '50.00' });
  assert.equal(cash.valid, true);
  assert.equal(cash.change, 30);
  const digital = validatePOSPayment({ payment: 'yape', total: 30 }); // Shared Yape/Plin option in POS.
  assert.equal(digital.valid, true);
  assert.equal(digital.change, 0);
  for (const payment of ['yape', 'plin']) {
    const totals = calculateCashTotals({ openingAmount: 100 }, [sale(payment, payment, 30)], []);
    assert.deepEqual([totals.expectedCash, totals.digitalTotal], [100, 30]);
  }
  const split = { payment: 'mixto', total: 20.05, splitEfectivo: '8.01', splitYape: '12.04' };
  assert.deepEqual(validatePOSPayment(split).splitPayments, { efectivo: 8.01, yape: 12.04 });
  assert.equal(validatePOSPayment(split).valid, true);
  for (const invalid of ['8.011', '8.02', '-8.01', 'Infinity']) {
    assert.equal(validatePOSPayment({ ...split, splitEfectivo: invalid }).valid, false, invalid);
  }
});

it('P13 reconciles scenario A before and after one Yape compensation across Dashboard, Excel and cash', async () => {
  const before = await simulate({ sales: salesA, payments: [advance, advance] });
  assertReconciled(before);
  const initial = before.dashboard.summary;
  assert.deepEqual([initial.posRevenue, initial.contractRevenue, initial.netRevenue, initial.cashRevenue, initial.digitalRevenue], [70, 15, 85, 28, 57]);
  assert.deepEqual([initial.posTicketCount, initial.contractPaymentCount, initial.voidedTicketCount], [3, 1, 0]);
  const after = await simulate({ sales: salesA, payments: [advance], voids: [yapeVoid, yapeVoid] });
  assertReconciled(after);
  const result = after.dashboard.summary;
  assert.deepEqual(result.channels, {
    cash: { collections: 28, posCompensations: 0, contractRefunds: 0, net: 28 },
    digital: { collections: 57, posCompensations: -30, contractRefunds: 0, net: 27 },
  });
  assert.deepEqual([result.netRevenue, result.voidedTicketCount, result.refundCount], [55, 1, 1]);
  const lines = rows(after.wb, 'Detalle_Centro');
  assert.equal(lines.filter(row => row['Medio de pago'] === 'YAPE' && row['Subtotal producto'] === 30 && row.Movimiento === 'VENTA POS').length, 1);
  assert.equal(lines.filter(row => row.Movimiento === 'COMPENSACIÓN POS' && row['Subtotal producto'] === -30 && row.Cantidad === -1).length, 1);
  assert.ok(lines.every(row => !Object.values(row).includes(yapeSale.id)));
  const opening = { openingAmount: 100 };
  const beforeCash = calculateCashTotals(opening, salesA, [advance]);
  const afterCash = calculateCashTotals(opening, salesA, [advance, ...voidCashPayments([yapeVoid, yapeVoid])]);
  assert.deepEqual([beforeCash.expectedCash, beforeCash.digitalTotal, beforeCash.hasUnverifiedDisbursements], [128, 57, false]);
  assert.deepEqual([afterCash.expectedCash, afterCash.digitalTotal, afterCash.posCompensationCount, afterCash.hasUnverifiedDisbursements], [128, 27, 1, true]);
});

it('P13 keeps prior-day compensation negative and signs each mixed channel in the selected period', async () => {
  const previous = { ...yapeSale, createdAt: time('10', '2026-10-21') };
  const today = await simulate({ sales: [previous], voids: [yapeVoid] });
  assertReconciled(today);
  assert.equal(today.dashboard.summary.digitalRevenue, -30);
  assert.match(today.summary['Neto negativo'], /período anterior/);
  const mixed = await simulate({ sales: [mixedSale], voids: [compensation(mixedSale, -8, -12)] });
  assertReconciled(mixed);
  assert.deepEqual(mixed.dashboard.summary.channels, {
    cash: { collections: 8, posCompensations: -8, contractRefunds: 0, net: 0 },
    digital: { collections: 12, posCompensations: -12, contractRefunds: 0, net: 0 },
  });
});

it('P13 reconciles day, week, month and year by Lima dates and by branch without leaking another tenant', async () => {
  const make = (id, day, amount, branchId = 'centro') => sale(id, 'efectivo', amount, { branchId, createdAt: day });
  const sales = [
    make('day', '2026-10-22T05:00:00Z', 20.01),
    make('week', '2026-10-22T04:59:59Z', 10.02, 'taller'),
    make('month', time('10', '2026-10-08'), 5.03),
    make('year', time('10', '2026-09-30'), 2.04, 'taller'),
    make('previous-year', '2026-01-01T04:59:59Z', 99),
    { ...make('foreign', now, 400), businessId: 'qa13-b' },
  ];
  for (const [filter, global, local] of [['hoy', 20.01, 20.01], ['semana', 30.03, 20.01], ['mes', 35.06, 25.04], ['todo', 37.10, 25.04]]) {
    const period = reportPeriod(filter, now);
    for (const [branchId, expected] of [['global', global], ['centro', local]]) {
      const result = await simulate({ sales, period, branchId });
      assertReconciled(result);
      assert.equal(result.dashboard.summary.netRevenue, expected, `${filter} / ${branchId}`);
    }
  }
});

it('P13 verifies order total, balance, payments and signed accounting refund in the reimported workbook', async () => {
  const { total } = commercialFields({ subtotal: 100, deliveryCost: 5, total: 105 }, { businessId: base.businessId, contractId: 'qa13-pedido' });
  const paid = [movement('advance', 'advance', 20, '09'), movement('balance', 'payment', 85, '10')];
  assert.deepEqual(financialProjection(total, paid.slice(0, 1)), { paidTotal: 20, balance: 85, status: 'pendiente' });
  assert.deepEqual(financialProjection(total, paid, 'entregado_con_deuda'), { paidTotal: 105, balance: 0, status: 'entregado' });
  const canceled = [movement('second-advance', 'advance', 15, '11', 'qa13-canceled'),
    movement('second-refund', 'refund', -15, '12', 'qa13-canceled')];
  assert.deepEqual(financialProjection(total, canceled, 'cancelado'), { paidTotal: 0, balance: 0, status: 'cancelado' });
  const result = await simulate({ payments: [...paid, ...canceled] });
  assertReconciled(result);
  assert.deepEqual(result.dashboard.summary.channels.digital, { collections: 120, posCompensations: 0, contractRefunds: -15, net: 105 });
  assert.deepEqual(rows(result.wb, 'Auditoría_Pedidos').map(row => [XLSX.SSF.format('dd/mm/yyyy hh:mm', row['Fecha Pago']), row['Adelanto (S/)'], row['Abono (S/)'],
    row['Reembolso contable (S/)'], row['Neto Movimiento (S/)']]), [
    ['22/10/2026 09:00', 20, 0, 0, 20], ['22/10/2026 10:00', 0, 85, 0, 85],
    ['22/10/2026 11:00', 15, 0, 0, 15], ['22/10/2026 12:00', 0, 0, -15, -15],
  ]);
});

it('P13 keeps names and void reasons as XLSX text and refuses an over-limit export', async () => {
  const names = ['=1+1', '+1+1', '-1+1', '@SUM(1)'];
  const sales = names.map((name, index) => sale(`formula-${index}`, 'efectivo', 1, { items: [{ id: `p-${index}`, name, qty: 1, price: 1 }] }));
  const voids = sales.map((row, index) => compensation(row, -1, 0, names[index]));
  const result = await simulate({ sales, voids });
  assertReconciled(result);
  const cells = Object.values(result.wb.Sheets.Detalle_Centro).filter(cell => cell?.t === 's');
  for (const name of names) {
    assert.ok(cells.some(cell => String(cell.v).trimStart().startsWith(name + ' · Compensación')));
    assert.ok(cells.some(cell => cell.v === name));
    assert.ok(cells.every(cell => !String(cell.v).includes('UID:')));
  }
  assert.ok(Object.values(result.wb.Sheets.Detalle_Centro).every(cell => cell?.f == null && cell?.l == null));
  const tooMany = { ...yapeSale, items: Array(MAX_EXPORT_ROWS + 1).fill(yapeSale.items[0]) };
  assert.throws(() => buildSalesWorkbook(XLSX, { ...scope, sales: [tooMany], now }), /Demasiadas filas de detalle/);
});

it('P18 keeps the confirmed order result when the photo stage throws after the advance', async () => {
  const order = { contractId:'original', contractNumber:'PED-00000001', paidTotal:20 };
  const result = await completeContractPhotos(order, 4, async () => {
    throw new DOMException('IndexedDB unavailable','InvalidStateError');
  });
  assert.deepEqual(result, { ...order, remaining:4, photosNeedReview:true });
  assert.deepEqual(await completeContractPhotos(order, 4, async () => ({ remaining:3 })),
    { ...order, remaining:3, photosNeedReview:false });
});

it('P18 supports twenty contract photos and keeps unchanged historical references', () => {
  const refs = Array.from({ length: 21 }, (_, index) => `local-image-${index}`);
  assert.equal(MAX_CONTRACT_IMAGES, 20);
  assert.equal(fitsContractImageLimit(refs.slice(0, 20)), true);
  assert.equal(fitsContractImageLimit(refs), false);
  assert.equal(fitsContractImageLimit(refs, [...refs]), true);
  assert.equal(fitsContractImageLimit(refs, [...refs].reverse()), false);
});

it('P13 preserves one cash lock and immutable declarations across double open, close and next shift', async () => {
  for (const [declared, difference] of [[128, 0], [126, -2], [133, 5]]) {
    const h = await plan08FinancialHarness();
    const { businessId, branchId } = h.actor;
    const lockPath = 'active_cash_sessions/' + await cashLockId(businessId, branchId);
    h.documents.delete('cash_sessions/p08-cash-session');
    h.documents.delete(lockPath);
    const openings = [1, 2].map(index => ({ sessionId: `qa13-cash-session-${index}`, businessId, branchId, openingAmount: 100 }));
    const options = { currentUser: h.currentUser, sdk: h.sdk };
    const register = createSparkCashRepository({}, options);
    const race = await Promise.allSettled(openings.map(input => register.open(input)));
    assert.deepEqual(race.map(result => result.status).sort(), ['fulfilled', 'rejected']);
    const [first, other] = [race.findIndex(row => row.status === 'fulfilled'), race.findIndex(row => row.status === 'rejected')];
    const opening = openings[first];
    const competing = openings[other];
    assert.deepEqual(await register.open(opening), race[first].value);
    assert.equal(h.writes.length, 2);
    assert.equal(h.documents.get(lockPath).sessionId, opening.sessionId);
    const close = createSparkCashClosingRepository({}, { ...options,
      readSales: async () => salesA.map(row => ({ ...row, status: 'confirmed', confirmedAt: plan08Timestamp() })),
      readPayments: async () => [{ ...advance, runtime: 'spark', occurredAt: plan08Timestamp() }] });
    const preview = await close.preview(opening.sessionId, declared);
    assert.deepEqual([preview.expectedAmount, preview.digitalTotal, preview.difference, preview.reconciliationPending], [128, 57, difference, true]);
    if (difference) await assert.rejects(close.close(opening.sessionId, declared), /Explica la diferencia/);
    assert.equal(h.writes.length, 2);
    const notes = difference ? 'Diferencia declarada en el ensayo' : '';
    const [saved, replay] = await Promise.all([close.close(opening.sessionId, declared, notes), close.close(opening.sessionId, declared, notes)]);
    assert.deepEqual(replay, saved);
    assert.deepEqual([saved.status, saved.declaredAmount, saved.closeEstimate.difference, saved.reconciliationPending],
      [difference ? 'closed_with_discrepancy' : 'closed', declared, difference, true]);
    const period = reportPeriod('hoy', plan08Timestamp().toDate());
    const { workbook } = buildSalesWorkbook(XLSX, { businessId, branchId, period, sessions: [saved], now: plan08Timestamp().toDate() });
    const audit = rows(roundTrip(workbook), 'Auditoría_Cajas').find(row => row.Turno.startsWith('CIERRE'));
    assert.deepEqual([audit['Efectivo declarado (S/)'], audit['Referencia calculada (S/)'], audit['Diferencia (S/)'], audit.Estado],
      [declared, 128, difference, 'Conciliación pendiente']);
    assert.match(audit.Observación, /provisionales/);
    assert.equal(h.writes.length, 4);
    assert.equal(h.documents.has(lockPath), false);
    await assert.rejects(close.close(opening.sessionId, declared + 1, notes), /cerrada con otra declaración/);
    await assert.rejects(register.open(opening), /apertura distinta/);
    assert.equal((await register.open({ ...competing, openingAmount: 50 })).openingAmount, 50);
    assert.deepEqual(h.documents.get('cash_sessions/' + opening.sessionId), Object.fromEntries(Object.entries(saved).filter(([key]) => key !== 'id')));
  }
});

it('P13 keeps branch stock independent and credits a prior-shift void exactly once without rewriting the close', async () => {
  const h = await plan08FinancialHarness();
  const options = { sdk: h.sdk, currentUser: h.currentUser };
  const productPath = 'products/p08-product';
  const { branchId } = h.actor;
  const item = { id: 'p08-product', name: 'Producto de prueba', category: '', qty: 2, price: 10, cost: 3 };
  h.documents.set(productPath, { ...h.documents.get(productPath), price: 10, stock: { [branchId]: 5, taller: 2 } });
  const checkout = createSparkSalesRepository({}, options);
  const tooMany = plan08Sale('qa13-insufficient', { items: [{ ...item, qty: 6 }], total: 60, amountPaid: 60 });
  await assert.rejects(checkout.submit(tooMany), { code: 'insufficient-stock' });
  assert.equal(h.writes.length, 0);
  const input = plan08Sale('qa13-stock-test', { items: [item], total: 20, amountPaid: 20 });
  await Promise.all([checkout.submit(input), checkout.submit(input)]);
  assert.deepEqual(h.documents.get(productPath).stock, { [branchId]: 3, taller: 2 });
  assert.equal(h.documents.get(productPath).posStockVersion[branchId], 1);
  const { saleId, businessId } = input;
  const command = { saleId, businessId, branchId, reason: 'Anulación de la simulación' };
  const voids = createPosVoidRepository({}, options);
  const close = createSparkCashClosingRepository({}, { ...options,
    readSales: async session => session.id === input.sessionId ? [h.documents.get('sales/' + saleId)] : [],
    readPayments: async session => {
      const receipt = h.documents.get('pos_voids/' + saleId);
      return receipt?.sessionId === session.id ? voidCashPayments([{ ...receipt, id: saleId }]) : [];
    } });
  const prior = await close.close(input.sessionId, 20);
  const writesBefore = h.writes.length;
  await assert.rejects(voids.void(command), { code: 'invalid-session' });
  assert.equal(h.writes.length, writesBefore);
  const next = await createSparkCashRepository({}, options).open({ sessionId: 'qa13-next-cash-shift', businessId, branchId, openingAmount: 100 });
  const results = await Promise.all([voids.void(command), voids.void(command)]);
  assert.deepEqual(results.map(row => row.status).sort(), ['ALREADY_APPLIED', 'APPLIED']);
  assert.deepEqual(h.documents.get(productPath).stock, { [branchId]: 5, taller: 2 });
  assert.equal(h.documents.get(productPath).posStockVersion[branchId], 2);
  assert.equal(h.writes.filter(path => path === `pos_voids/${saleId}`).length, 1);
  assert.equal(h.documents.get('pos_voids/' + saleId).sessionId, next.id);
  assert.deepEqual(await close.close(input.sessionId, 20), prior);
  const current = await close.preview(next.id, 100);
  assert.deepEqual([current.expectedAmount, current.difference, current.hasUnverifiedDisbursements, current.reconciliationPending],
    [80, 20, true, true]);
});

it('P13 counts a historical void and its matching immutable compensation as one economic reversal', async () => {
  const historical = { ...yapeSale, voided: true };
  const result = await simulate({ sales: [historical], voids: [yapeVoid, yapeVoid] });
  assertReconciled(result);
  const { summary, products } = result.dashboard;
  assert.deepEqual({
    voids: summary.voidedTicketCount, net: summary.netRevenue,
    qty: sumMoney(products.map(row => row.qty)), productRevenue: sumMoney(products.map(row => row.revenue)),
    excelVoids: result.summary['Ventas anuladas'], excelNet: result.summary['Total neto registrado (S/)'],
  }, { voids: 1, net: 0, qty: 0, productRevenue: 0, excelVoids: 1, excelNet: 0 });
  assert.equal(historical.voided, true);
  const detail = rows(result.wb, 'Detalle_Centro');
  assert.equal(detail.filter(row => row.Movimiento === 'COMPENSACIÓN POS' && row['Subtotal producto'] === -30).length, 1);
  assert.equal(sumMoney(detail.map(row => row.Cantidad)), 0);
  assert.deepEqual(result.dashboard.summary.channels.digital, { collections: 30, posCompensations: -30, contractRefunds: 0, net: 0 });
});

it('P13-03 retains unpaired legacy voids without generating money, stock or an Excel compensation', async () => {
  const historical = { ...yapeSale, voided: true, voidReason: 'Anulación anterior' };
  const result = await simulate({ sales: [historical, cashSale] });
  assertReconciled(result);
  const { summary, products } = result.dashboard;
  assert.deepEqual([summary.netRevenue, summary.posTicketCount, summary.voidedTicketCount, summary.refundCount], [20, 1, 1, 0]);
  assert.deepEqual(products.map(row => [row.id, row.qty, row.revenue]), [[cashSale.items[0].id, 1, 20]]);
  const detail = rows(result.wb, 'Detalle_Centro');
  const legacy = detail.find(row => row['Medio de pago'] === 'YAPE' && row.Observaciones.includes('Anulación anterior'));
  assert.deepEqual([legacy.Movimiento, legacy.Cantidad, legacy['Subtotal producto'], legacy['Importe movimiento (S/)']], ['VENTA POS ANULADA', 0, 0, 0]);
  assert.equal(detail.some(row => row.Movimiento === 'COMPENSACIÓN POS'), false);
  const stats = salesToDailyStats([historical]);
  assert.throws(() => aggregateReport({ ...scope, stats, voids: [yapeVoid] }), /agregado histórico no identifica/);
  assert.throws(() => buildSalesWorkbook(XLSX, { ...scope, stats, voids: [yapeVoid], detailed: false }), /agregado histórico no identifica/);
});

it('P13-03 separates original and compensation dates across bounded queries and reconciles all four Excel filters', async () => {
  const originalDate = time('10', '2026-10-21');
  const original = { ...yapeSale, createdAt: originalDate, status: 'confirmed' };
  const historical = { ...original, voided: true };
  const priorPeriod = reportPeriod('hoy', originalDate);
  const originalOnly = await simulate({ sales: [original], period: priorPeriod });
  const compensationOnly = await simulate({ voids: [yapeVoid] });
  for (const result of [originalOnly, compensationOnly]) assertReconciled(result);
  assert.equal(originalOnly.dashboard.summary.netRevenue, 30);
  assert.equal(compensationOnly.dashboard.summary.netRevenue, -30);
  assert.equal(rows(compensationOnly.wb, 'Detalle_Centro').some(row => row.Movimiento === 'VENTA POS'), false);
  const unknownPrior = await simulate({ sales: [historical], period: priorPeriod });
  assert.equal(unknownPrior.dashboard.summary.netRevenue, 0);
  const evidencedPrior = await simulate({ sales: [historical], voids: [yapeVoid], period: priorPeriod });
  assertReconciled(evidencedPrior);
  assert.deepEqual([evidencedPrior.dashboard.summary.netRevenue, evidencedPrior.dashboard.summary.voidedTicketCount], [30, 0]);
  for (const filter of ['hoy', 'semana', 'mes', 'todo']) {
    const period = reportPeriod(filter, now);
    for (const branchId of ['global', 'centro']) {
      const result = await simulate({ sales: filter === 'hoy' ? [] : [historical], voids: [yapeVoid, yapeVoid], period, branchId });
      assertReconciled(result);
      assert.deepEqual(result.dashboard.days.map(row => [row.day, row.netRevenue, row.voidedTicketCount]),
        filter === 'hoy' ? [['2026-10-22', -30, 1]] : [['2026-10-21', 30, 0], ['2026-10-22', -30, 1]]);
      assert.equal(result.dashboard.summary.netRevenue, filter === 'hoy' ? -30 : 0);
    }
  }
});

it('P13-03 scopes matches to exact IDs and rejects inconsistent receipts in Dashboard and both workbook modes', async () => {
  const historical = { ...yapeSale, voided: true };
  const unrelated = { ...yapeVoid, id: 'another-ticket', saleId: 'another-ticket' };
  const separated = await simulate({ sales: [historical], voids: [unrelated, { ...yapeVoid, businessId: 'qa13-b' }] });
  assertReconciled(separated);
  assert.deepEqual([separated.dashboard.summary.netRevenue, separated.dashboard.summary.voidedTicketCount], [-30, 2]);
  const otherBranch = { ...yapeVoid, branchId: 'taller' };
  const local = await simulate({ sales: [historical], voids: [otherBranch], branchId: 'centro' });
  assert.equal(local.dashboard.summary.netRevenue, 0);
  assert.equal(local.dashboard.summary.refundCount, 0);
  for (const voids of [
    [otherBranch],
    [{ ...yapeVoid, saleId: 'different' }],
    [{ ...yapeVoid, authority: 'unverified' }],
    [{ ...yapeVoid, amount: -31, digitalAmount: -31, items: [{ ...yapeVoid.items[0], price: 31 }] }],
    [{ ...yapeVoid, cashAmount: -30, digitalAmount: 0 }],
    [{ ...yapeVoid, items: [{ ...yapeVoid.items[0], id: 'otro-producto' }] }],
    [yapeVoid, { ...yapeVoid, occurredAt: time('13') }],
  ]) {
    assert.throws(() => aggregateReport({ ...scope, sales: [historical], voids }), /Compensación POS no verificable/);
    for (const detailed of [true, false]) {
      assert.throws(() => buildSalesWorkbook(XLSX, { ...scope, sales: [historical], voids, detailed, now }), /Compensación POS no verificable/);
    }
  }
  assert.throws(() => aggregateReport({ sales: [historical], voids: [{ ...yapeVoid, businessId: 'qa13-b' }] }), /Compensación POS no verificable/);
});

async function boundedReport(harness, period, options) {
  const view = harness.open(period, options);
  try {
    await view.dashboard.ready;
    assert.ok(view.state.model, view.state.error);
    const result = { ...await view.excel(), dashboard: view.state.model };
    assertReconciled(result);
    return result;
  } finally { view.close(); }
}

const periodTotals = ({ dashboard: { summary, products } }) => [
  summary.netRevenue, summary.cashRevenue, summary.digitalRevenue, summary.voidedTicketCount,
  sumMoney(products.map(row => row.qty)), sumMoney(products.map(row => row.revenue)),
];
const sumPeriods = (first, next) => periodTotals(first).map((value, index) => sumMoney([value, periodTotals(next)[index]]));

it('P13-04 A1/A10 reads the November 5 and 6 modern ticket separately and reconciles their union', async () => {
  const { sale, receipt } = pairedTicket();
  const h = reportPeriodHarness({ sales: [sale], voids: [receipt] });
  const first = await boundedReport(h, reportPeriod('hoy', qaSaleDay));
  const next = await boundedReport(h, reportPeriod('hoy', qaVoidDay));
  const union = await boundedReport(h, spanningPeriod());
  assert.deepEqual(periodTotals(first), [30, 0, 30, 0, 1, 30]);
  assert.deepEqual(periodTotals(next), [-30, 0, -30, 1, -1, -30]);
  assert.deepEqual(sumPeriods(first, next), periodTotals(union));
  assert.deepEqual(periodTotals(union), [0, 0, 0, 1, 0, 0]);
  assert.equal(sale.sessionId === receipt.sessionId, false);
  assert.deepEqual(union.dashboard.days.map(row => row.day), ['2026-11-05', '2026-11-06']);
  assert.equal(h.calls.filter(call => call.collection === 'sales').length, 9);
  assert.equal(h.calls.filter(call => call.collection === 'pos_voids').length, 3);
  assert.ok(h.calls.every(call => call.filters.some(filter => filter.field === 'businessId' && filter.value === sale.businessId)));
});

it('P13-04 A2/A10 demonstrates the historical split gap through real bounded readers and matches only the union', async () => {
  const { sale, receipt } = pairedTicket({ legacy: true });
  const h = reportPeriodHarness({ sales: [sale], voids: [receipt] });
  const first = await boundedReport(h, reportPeriod('hoy', qaSaleDay));
  const next = await boundedReport(h, reportPeriod('hoy', qaVoidDay));
  const union = await boundedReport(h, spanningPeriod());
  assert.deepEqual(periodTotals(first), [0, 0, 0, 1, 0, 0]);
  assert.deepEqual(periodTotals(next), [-30, 0, -30, 1, -1, -30]);
  assert.deepEqual(sumPeriods(first, next), [-30, 0, -30, 2, -1, -30]);
  assert.deepEqual(periodTotals(union), [0, 0, 0, 1, 0, 0]);
  assert.deepEqual(h.calls.filter(call => call.collection === 'pos_voids').map(call => call.docs), [0, 1, 1]);
});

it('P13-04 A3/A4 handles historical records with a duplicate same-day receipt or with no receipt', async () => {
  const soldAt = '2026-11-05T11:00:00-05:00', voidedAt = '2026-11-05T13:00:00-05:00';
  const { sale, receipt } = pairedTicket({ legacy: true, timestamp: true, soldAt, voidedAt, method: 'plin' });
  const period = reportPeriod('hoy', soldAt);
  const pair = await boundedReport(reportPeriodHarness({ sales: [sale], voids: [receipt, receipt] }), period);
  const unpaired = await boundedReport(reportPeriodHarness({ sales: [sale] }), period);
  assert.deepEqual(periodTotals(pair), [0, 0, 0, 1, 0, 0]);
  assert.equal(pair.dashboard.summary.refundCount, 1);
  assert.equal(unpaired.dashboard.summary.refundCount, 0);
  assert.deepEqual(periodTotals(unpaired), [0, 0, 0, 1, 0, 0]);
  assert.equal(rows(unpaired.wb, 'Detalle_Centro').find(row => row['Medio de pago'] === 'PLIN').Movimiento, 'VENTA POS ANULADA');
});

for (const [filter, before, after] of [
  ['semana', '2026-11-08', '2026-11-09'], ['mes', '2026-11-30', '2026-12-01'], ['todo', '2026-12-31', '2027-01-01'],
]) {
  it(`P13-04 A5/A6 preserves both Lima dates and payment channels across ${filter}`, async () => {
    const soldAt = before + 'T23:59:59.999-05:00', voidedAt = after + 'T00:00:00.000-05:00';
    for (const [method, total, cash] of [['efectivo', 30, 30], ['mixto', 20, 8]]) {
      const { sale, receipt } = pairedTicket({ method, total, cash, soldAt, voidedAt });
      const h = reportPeriodHarness({ sales: [sale], voids: [receipt] });
      const first = await boundedReport(h, reportPeriod(filter, soldAt));
      const next = await boundedReport(h, reportPeriod(filter, voidedAt));
      const union = await boundedReport(h, spanningPeriod(soldAt, voidedAt, filter));
      assert.deepEqual(periodTotals(first), [total, cash, total - cash, 0, 1, total]);
      assert.deepEqual(periodTotals(next), [-total, -cash || 0, -(total - cash) || 0, 1, -1, -total]);
      assert.deepEqual(sumPeriods(first, next), periodTotals(union));
      assert.deepEqual(union.dashboard.days.map(day => day.day), [before, after]);
      assert.deepEqual(union.dashboard.summary.channels.cash, { collections: cash, posCompensations: -cash, contractRefunds: 0, net: 0 });
    }
    const legacy = pairedTicket({ legacy: true, timestamp: true, soldAt, voidedAt });
    const h = reportPeriodHarness({ sales: [legacy.sale], voids: [legacy.receipt] });
    const first = await boundedReport(h, reportPeriod(filter, soldAt));
    const next = await boundedReport(h, reportPeriod(filter, voidedAt));
    const union = await boundedReport(h, spanningPeriod(soldAt, voidedAt, filter));
    assert.deepEqual(sumPeriods(first, next), [-30, 0, -30, 2, -1, -30]);
    assert.deepEqual(periodTotals(union), [0, 0, 0, 1, 0, 0]);
    assert.deepEqual(union.dashboard.days.map(day => [day.day, day.netRevenue]), [[before, 30], [after, -30]]);
  });
}

it('P13-04 A7/A9 scopes both readers by tenant and branch and rejects a conflicting receipt inside the scope', async () => {
  const a = pairedTicket(), b = pairedTicket({ id: 'taller-ticket', branchId: 'taller', method: 'efectivo', cash: 30 });
  const foreign = pairedTicket({ id: 'other-company', businessId: 'qa13-b' });
  const h = reportPeriodHarness({ sales: [a.sale, b.sale, foreign.sale], voids: [a.receipt, b.receipt, foreign.receipt] });
  const period = reportPeriod('hoy', qaVoidDay);
  const global = await boundedReport(h, period);
  const centro = await boundedReport(h, period, { branchId: 'centro' });
  const taller = await boundedReport(h, period, { branchId: 'taller' });
  const other = await boundedReport(h, period, { businessId: 'qa13-b', identityKey: 'other-owner' });
  assert.deepEqual(periodTotals(global), [-60, -30, -30, 2, -2, -60]);
  assert.deepEqual(sumPeriods(centro, taller), periodTotals(global));
  assert.deepEqual(periodTotals(other), [-30, 0, -30, 1, -1, -30]);
  assert.notEqual(other.dashboard.products[0].id, centro.dashboard.products[0].id);
  const wrongTenant = { ...a.receipt, businessId: 'qa13-b' };
  const isolated = await boundedReport(reportPeriodHarness({ sales: [a.sale], voids: [wrongTenant] }), spanningPeriod());
  assert.deepEqual(periodTotals(isolated), [30, 0, 30, 0, 1, 30]);
  assert.throws(() => aggregateReport({ sales: [a.sale], voids: [wrongTenant], period: spanningPeriod() }), /Compensación POS no verificable/);
  for (const forged of [
    { branchId: 'taller' }, { saleId: 'different' }, { amount: -29, digitalAmount: -29 },
    { items: [{ ...a.receipt.items[0], id: 'otro-producto' }] },
  ]) {
    const broken = reportPeriodHarness({ sales: [a.sale], voids: [{ ...a.receipt, ...forged }] }).open(spanningPeriod());
    try {
      await broken.dashboard.ready;
      assert.equal(broken.state.model, null);
      assert.match(broken.state.error, /Compensación POS no verificable/);
      await assert.rejects(broken.excel(), /Compensación POS no verificable/);
    } finally { broken.close(); }
  }
});

it('P13-04 A8 withholds unverified figures on permission and network errors without sharing cached identities', async () => {
  const { sale, receipt } = pairedTicket();
  let errorCode;
  const h = reportPeriodHarness({ sales: [sale], voids: [receipt], beforeQuery({ collection }) {
    if (errorCode && collection === 'pos_voids') throw Object.assign(Error('Lectura simulada de compensación'), { code: errorCode });
  } });
  const period = spanningPeriod();
  const first = h.open(period, { identityKey: 'previous-owner' });
  try {
    await first.dashboard.ready;
    assert.equal(first.state.model.summary.voidedTicketCount, 1);
    for (const code of ['permission-denied', 'unavailable']) {
      errorCode = code;
      const fresh = h.open(period, { identityKey: 'different-' + code });
      try {
        assert.equal(fresh.state.model, null);
        await fresh.dashboard.ready;
        assert.equal(fresh.state.model, null);
        assert.equal(fresh.state.queryError.code, code);
        assert.equal(h.cache.peek(fresh.key), null);
        await assert.rejects(fresh.excel(), error => error.code === code);
      } finally { fresh.close(); }
    }
    first.resources.invalidateWhere(key => key.startsWith('report:voids:'));
    const lastVerified = first.state.model;
    await first.dashboard.refresh(true);
    assert.equal(first.state.queryError.code, 'unavailable');
    assert.equal(first.state.model, lastVerified);
    assert.equal(h.cache.peek(first.key), null);
    errorCode = 'permission-denied';
    await first.dashboard.refresh(true);
    assert.equal(first.state.model, null);
    assert.equal(first.state.queryError.code, 'permission-denied');
  } finally { first.close(); }
});
