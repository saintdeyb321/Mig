import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { validatePOSPayment } from '../functions/src/sales/domain/saleModel.js';
import { calculateCashTotals } from '../functions/src/cash-register/domain/cashTotals.js';
import { commercialFields, financialProjection } from '../functions/src/contracts/domain/contractModel.js';
import { createReportCache, createReportResource, reportCacheKey } from '../frontend/src/features/reports/application/reportResource.js';
import { buildSalesWorkbook, MAX_EXPORT_ROWS } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { salesToDailyStats } from '../frontend/src/features/reports/domain/sparkReport.js';
import { voidCashPayments } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { fitsContractImageLimit, MAX_CONTRACT_IMAGES } from '../frontend/src/features/contracts/application/contractImagePolicy.js';
import { cashLockId, createSparkCashRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js';
import { createSparkCashClosingRepository } from '../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js';
import { createSparkSalesRepository } from '../frontend/src/features/sales/infrastructure/sparkSalesRepository.js';
import { createPosVoidRepository } from '../frontend/src/features/sales/infrastructure/posVoidRepository.js';
import { plan08FinancialHarness, plan08Sale, plan08Timestamp } from './helpers/plan08FinancialHarness.mjs';

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
const rows = (wb, sheet) => XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
const roundTrip = wb => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
const sumMoney = values => values.reduce((cents, value) => cents + Math.round((value || 0) * 100), 0) / 100;

async function simulate({ sales = [], payments = [], voids = [], ...options } = {}) {
  const query = { ...scope, ...options };
  const stats = salesToDailyStats(sales);
  let state;
  const resource = createReportResource({ ...query, key: reportCacheKey({ ...query, identityKey: 'qa13-dueno' }),
    cache: createReportCache(), readStats: async () => stats, readPayments: async () => payments,
    readVoids: async () => voids, onState: value => { state = value; } });
  try { await resource.ready; } finally { resource.close(); }
  assert.ok(state.model, state.error);
  const { workbook, model } = buildSalesWorkbook(XLSX, { ...query, stats, sales, payments, voids, branchesMap, now });
  const wb = roundTrip(workbook);
  const summary = Object.fromEntries(rows(wb, 'Resumen_Financiero').map(row => [row.Concepto, row.Valor]));
  return { dashboard: state.model, model, wb, summary };
}

function assertReconciled({ dashboard, model, wb, summary }) {
  const metrics = dashboard.summary;
  assert.deepEqual(model.summary, metrics);
  assert.equal(summary['💰 GRAN TOTAL INGRESOS NETOS'], metrics.netRevenue);
  assert.equal(summary['🛒 VENTAS MOSTRADOR NETAS'], metrics.posRevenue);
  assert.equal(summary['🎂 INGRESOS NETOS PEDIDOS ESPECIALES'], metrics.contractRevenue);
  for (const [key, label] of [['cash', 'Efectivo'], ['digital', 'Yape / Plin']]) {
    const channel = metrics.channels[key];
    assert.equal(summary[`Cobros registrados · ${label}`], channel.collections);
    assert.equal(summary[`Compensaciones POS · ${label}`], channel.posCompensations);
    assert.equal(summary[`Reembolsos contables de pedidos · ${label}`], channel.contractRefunds);
    assert.equal(summary[`Neto contable · ${label}`], channel.net);
    assert.equal(sumMoney([channel.collections, channel.posCompensations, channel.contractRefunds]), channel.net);
  }
  assert.equal(sumMoney([metrics.cashRevenue, metrics.digitalRevenue]), metrics.netRevenue);
  assert.equal(sumMoney(rows(wb, 'Comparativa_Sedes').map(row => row['Ventas Sistema (S/)'])), metrics.netRevenue);
  const detailSheets = wb.SheetNames.filter(name => name.startsWith('Detalle_'));
  const periodRows = detailSheets.length ? detailSheets.flatMap(name => rows(wb, name))
    : wb.SheetNames.filter(name => name.startsWith('Resum_')).flatMap(name => rows(wb, name));
  const totalColumn = detailSheets.length ? 'Total movimiento (S/)' : 'Ingreso';
  assert.equal(sumMoney(periodRows.map(row => row[totalColumn])), metrics.netRevenue);
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
  assert.equal(lines.filter(row => row.Ticket === yapeSale.id && row.Estado === 'COMPLETADA').length, 1);
  assert.equal(lines.filter(row => row.Ticket === `COMPENSACIÓN POS: ${yapeSale.id}` && row.Cantidad === -1).length, 1);
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
  assert.deepEqual(rows(result.wb, 'Auditoría_Pedidos').map(row => [row['Fecha Pago'], row['Adelanto (S/)'], row['Abono (S/)'],
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
    assert.ok(cells.some(cell => String(cell.v).trimStart() === name));
    assert.ok(cells.some(cell => String(cell.v).trimStart().startsWith(`${name} · UID:`)));
  }
  assert.ok(Object.values(result.wb.Sheets.Detalle_Centro).every(cell => cell?.f == null && cell?.l == null));
  const tooMany = { ...yapeSale, items: Array(MAX_EXPORT_ROWS).fill(yapeSale.items[0]) };
  assert.throws(() => buildSalesWorkbook(XLSX, { ...scope, sales: [tooMany], now }), /Demasiadas filas de detalle/);
});

it('P13 preserves the four new contract photo limit and keeps unchanged historical references', () => {
  const refs = Array.from({ length: 5 }, (_, index) => `local-image-${index}`);
  assert.equal(MAX_CONTRACT_IMAGES, 4);
  assert.equal(fitsContractImageLimit(refs.slice(0, 4)), true);
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
    assert.deepEqual([audit['Contado Real (S/)'], audit['Diferencia (S/)'], audit.Estado],
      [declared, 'Pendiente', 'Pendiente de revisión']);
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
  const result = await simulate({ sales: [{ ...yapeSale, voided: true }], voids: [yapeVoid, yapeVoid] });
  assertReconciled(result);
  const { summary, products } = result.dashboard;
  assert.deepEqual({
    voids: summary.voidedTicketCount, net: summary.netRevenue,
    qty: sumMoney(products.map(row => row.qty)), productRevenue: sumMoney(products.map(row => row.revenue)),
    excelVoids: result.summary['Tickets POS Anulados'], excelNet: result.summary['💰 GRAN TOTAL INGRESOS NETOS'],
  }, { voids: 1, net: 0, qty: 0, productRevenue: 0, excelVoids: 1, excelNet: 0 });
});
