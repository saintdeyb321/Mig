import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { createCashAuditPeriodReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { createContractPeriodReader, createContractCancellationCountReader } from '../frontend/src/features/contracts/infrastructure/contractPeriodRepository.js';
import { compatiblePayments } from '../frontend/src/features/payments/application/compatiblePayments.js';
import { createPaymentRepository } from '../frontend/src/features/payments/infrastructure/paymentQueryRepository.js';
import { createSparkLegacyPaymentReader } from '../frontend/src/features/payments/infrastructure/sparkLegacyPayments.js';
import { createReportCache, createReportResource } from '../frontend/src/features/reports/application/reportResource.js';
import { reportSourceForPeriod } from '../frontend/src/features/reports/application/reportSources.js';
import { createSessionReportReads } from '../frontend/src/features/reports/application/sessionReportReads.js';
import { buildSalesWorkbook } from '../frontend/src/features/reports/application/salesWorkbook.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { createPosVoidReader } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { createSalesPeriodReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { reportQueryFixture } from './helpers/reportQueryFixture.mjs';

const businessId = 'panaderia-p31', branchId = 'global';
const dayMs = 86400000, branches = ['centro', 'taller'];
const dayCount = period => Math.round((+period.endDate + 1 - +period.startDate) / dayMs);
const id = (name, index) => name + '-' + String(index).padStart(5, '0');
const timestamp = value => Timestamp.fromMillis(value);

function volumeRecords(period, movements, { salesOnly = false } = {}) {
  const paymentsCount = salesOnly ? 0 : Math.floor(movements / 5);
  const voidsCount = salesOnly ? 0 : Math.floor(movements / 20);
  const salesCount = movements - paymentsCount - voidsCount;
  const midday = +period.startDate + 12 * 3600000;
  const instant = (index, total) => midday + Math.floor(index * dayCount(period) / total) * dayMs;
  const location = index => ({ businessId, branchId: branches[index % branches.length] });
  const sales = Array.from({ length: salesCount }, (_, index) => {
    const created = instant(index, salesCount);
    const confirmed = salesOnly || index % 10 < 8;
    const saleId = id('sale', index);
    return { ...location(index), id: saleId, saleId, total: 10.05, payment: 'efectivo',
      items: [{ id: 'pan', name: 'Pan', qty: 1, price: 10.05, cost: 4 }],
      createdAt: index % 10 === 9 && !salesOnly ? new Date(created).toISOString() : timestamp(created),
      ...(confirmed ? { status: 'confirmed', confirmedAt: timestamp(created) } : {}) };
  });
  const voids = Array.from({ length: voidsCount }, (_, index) => {
    const sale = sales[index];
    return { ...location(index), id: sale.id, saleId: sale.id, items: sale.items, authority: 'pos-compensation', protocol: 1,
      userId: 'owner', sessionId: 'shift', reason: 'Ajuste de prueba', amount: -10.05, cashAmount: -10.05, digitalAmount: 0,
      occurredAt: timestamp(+period.endDate - 60000) };
  });
  const ordersCount = salesOnly ? 0 : Math.min(350, Math.floor(movements / 10));
  const olderCount = Math.min(25, paymentsCount);
  const contracts = Array.from({ length: ordersCount }, (_, index) => ({
    ...location(index), id: id('order', index), paymentsMigrated: true, balance: 0, total: 35,
    createdAt: timestamp(instant(index, ordersCount)), status: index % 5 ? 'entregado' : 'cancelado',
    ...(index % 5 ? {} : { voidedAt: timestamp(+period.endDate - 3600000) }),
  })).concat(Array.from({ length: olderCount }, (_, index) => ({
    ...location(index), id: id('older', index), paymentsMigrated: true, balance: 0, total: 35,
    createdAt: timestamp(+period.startDate - dayMs), status: 'entregado',
  })));
  const payments = Array.from({ length: paymentsCount }, (_, index) => ({
    ...location(index), id: id('payment', index), amount: 2.30, type: 'payment',
    method: index % 2 ? 'yape' : 'efectivo', sourceType: 'contract',
    sourceId: index < olderCount ? id('older', index) : id('order', index % ordersCount),
    occurredAt: timestamp(instant(index, paymentsCount)),
  }));
  const cash = Array.from({ length: salesOnly ? 0 : dayCount(period) * branches.length }, (_, index) => ({
    ...location(index), id: id('cash', index), status: 'closed', openingAmount: 15, declaredAmount: 45, expectedCash: 45,
    difference: 0, openedAt: timestamp(instant(index, dayCount(period) * branches.length)),
    closedAt: timestamp(instant(index, dayCount(period) * branches.length) + 5 * 3600000),
  }));
  return { sales, payments, contracts, pos_voids: voids, cash_sessions: cash };
}

function scenario(period, records, scope = branchId) {
  const fixture = reportQueryFixture(records), { calls, sdk } = fixture;
  const resources = createSessionResources(), database = {};
  const ledger = createPaymentRepository(database, { sdk: sdk('payments') });
  const legacy = createSparkLegacyPaymentReader(database, { sdk: sdk('legacyContracts') });
  const read = createSessionReportReads({
    getSalesInPeriod: createSalesPeriodReader(database, { sdk: sdk('sales') }),
    getPaymentsInPeriod: (business, start, end, branch, options) => {
      const input = { startDate: start.toISOString(), endDate: end.toISOString(), branchId: branch };
      return compatiblePayments(input, () => ledger.getPaymentsInPeriod(business, start, end, branch, options),
        async () => ({ payments: await legacy(business, input, options) }), options);
    },
    getContractsInPeriod: createContractPeriodReader(database, { sdk: sdk('contracts') }),
    getCancelledContractCount: createContractCancellationCountReader(database, { sdk: sdk('cancelledCount') }),
    readVoidsInPeriod: createPosVoidReader(database, { sdk: sdk('voids') }).inPeriod,
    getSessionsInPeriod: createCashAuditPeriodReader(database, { sdk: sdk('cash') }),
    getContractAuditDocuments: createPaymentRepository(database, { sdk: sdk('contractAudit') }).getContractAuditDocuments,
  });
  const source = reportSourceForPeriod(period, read(resources, businessId, scope, period));
  return { source, calls, resources,
    async dashboard() {
      let state;
      const dashboard = createReportResource({ businessId, branchId: scope, period, key: 'p31',
        cache: createReportCache(), ...source.dashboardReads, onState: next => { state = next; } });
      try { await dashboard.ready; return state; } finally { dashboard.close(); }
    },
    async exportData(format) {
      const snapshot = await source.exportReads.exportSnapshot();
      if (format === 'xlsx') return { snapshot, ...await source.exportReads.withContractAudit(snapshot) };
      return { snapshot };
    },
  };
}

function budget(calls) {
  const modules = ['sales', 'payments', 'legacyContracts', 'contracts', 'voids', 'cash', 'cancelledCount', 'contractAudit'];
  return Object.fromEntries(modules.map(module => {
    const reads = calls.filter(call => call.module === module);
    return [module, [reads.length, reads.reduce((sum, call) => sum + call.documents, 0),
      reads.filter(call => call.kind === 'query' && call.documents === 0).length]];
  }));
}

async function observe(period, records, run) {
  const reader = scenario(period, records);
  try { return await run(reader); } finally { reader.resources.close(); }
}

it('P31-A counts queries and returned documents per module and per dashboard/export flow across period and volume', async t => {
  for (const filter of ['hoy', 'semana', 'mes', 'todo']) {
    const period = reportPeriod(filter, '2026-11-04T12:00:00-05:00');
    for (const movements of [1, 100, 1000, 5000, 10000]) {
      const records = volumeRecords(period, movements);
      const { dashboard, warmPdf, warmXlsx } = await observe(period, records, async reader => {
        const detailed = ['hoy', 'semana'].includes(filter);
        assert.equal(reader.source.kind, detailed ? 'detailed' : 'summary');
        assert.equal(reader.source.representation, detailed ? 'documents' : 'document-fallback');
        const state = await reader.dashboard();
        assert.equal(state.error, null);
        assert.equal(state.model.summary.posTicketCount, records.sales.length);
        const dashboard = budget(reader.calls);
        const dashboardEnd = reader.calls.length;
        const pdf = await reader.exportData('pdf');
        assert.deepEqual([pdf.snapshot.sales.length, pdf.snapshot.payments.length, pdf.snapshot.voids.length],
          [records.sales.length, records.payments.length, records.pos_voids.length]);
        assert.equal(pdf.snapshot.cancelledContractCount, records.contracts.filter(row => row.status === 'cancelado').length);
        const warmPdf = budget(reader.calls.slice(dashboardEnd)), firstExportEnd = reader.calls.length;
        const xlsx = await reader.exportData('xlsx');
        assert.equal(xlsx.contracts.length, records.contracts.length);
        assert.equal(xlsx.snapshot.sales, pdf.snapshot.sales);
        assert.equal(xlsx.snapshot.cancelledContractCount, pdf.snapshot.cancelledContractCount);
        const warmXlsx = budget(reader.calls.slice(firstExportEnd)), secondExportEnd = reader.calls.length;
        await reader.exportData('xlsx');
        assert.equal(reader.calls.length, secondExportEnd);
        assert.ok(reader.calls.slice(dashboardEnd, firstExportEnd).every(call => ['cash', 'cancelledCount'].includes(call.module)));
        assert.ok(reader.calls.slice(firstExportEnd).every(call => call.module === 'contractAudit'));
        return { dashboard, warmPdf, warmXlsx };
      });
      const coldExport = async format => observe(period, records, async reader => {
        await reader.exportData(format);
        return budget(reader.calls);
      });
      const pdf = await coldExport('pdf'), xlsx = await coldExport('xlsx');
      assert.deepEqual(pdf.cancelledCount, [1, 0, 0]);
      assert.deepEqual(dashboard.cancelledCount, [0, 0, 0]);
      assert.equal(pdf.sales[1], dashboard.sales[1]);
      assert.deepEqual(xlsx.contractAudit, warmXlsx.contractAudit);
      assert.equal(pdf.cash[1], records.cash_sessions.length * 2, 'Una misma caja puede recuperarse por apertura y cierre');
      assert.equal(pdf.legacyContracts[1], records.contracts.length, 'El barrido legacy vuelve a traer contratos migrados');
      t.diagnostic('P31_VOLUME ' + JSON.stringify({ filter, days: dayCount(period), movements, dashboard, pdf, xlsx, warmPdf, warmXlsx }));
    }
  }
});

it('P31-A measures the monthly/yearly caps separately from a successful report', async t => {
  for (const filter of ['mes', 'todo']) {
    const period = reportPeriod(filter, '2026-11-04T12:00:00-05:00');
    await observe(period, volumeRecords(period, 10000), async reader => {
      const { snapshot, contracts } = await reader.exportData('xlsx');
      // The workbook must reject at its row gate, before accessing even one XLSX API.
      const notCalled = new Proxy({}, { get: () => assert.fail('El XLSX no debe empezar a construirse') });
      assert.throws(() => buildSalesWorkbook(notCalled, { ...snapshot, contracts, period, businessId }), /Demasiados movimientos/);
    });
    const salesHeavy = volumeRecords(period, 10001, { salesOnly: true });
    const xlsx = await observe(period, salesHeavy, async reader => {
      await assert.rejects(reader.exportData('xlsx'), { code: 'report-limit' });
      assert.ok(reader.calls.every(call => call.module === 'sales'));
      return budget(reader.calls);
    });
    const dashboard = await observe(period, salesHeavy, async reader => {
      const state = await reader.dashboard();
      assert.equal(state.queryError.code, 'report-limit');
      return budget(reader.calls);
    });
    assert.equal(xlsx.sales[1], 10001);
    if (filter === 'todo') assert.deepEqual(xlsx, dashboard);
    else assert.ok(dashboard.legacyContracts[0] > 0);
    t.diagnostic('P31_SALES_LIMIT ' + JSON.stringify({ filter, dashboard, xlsx }));
  }

  const period = reportPeriod('mes', '2026-11-04T12:00:00-05:00');
  const records = volumeRecords(period, 100);
  records.contracts.push(...Array.from({ length: 600 }, (_, index) => ({ ...records.contracts[0],
    id: id('older-outside-period', index), createdAt: timestamp(+period.startDate - dayMs) })));
  await observe(period, records, async reader => {
    await assert.rejects(reader.exportData('pdf'), /supera 500 contratos/);
    const first = budget(reader.calls);
    assert.deepEqual(first.legacyContracts, [6, 600, 0], 'La página de detección supera 500 sin llegar al ledger');
    await Promise.allSettled([reader.dashboard(), reader.exportData('xlsx')]);
    const counts = budget(reader.calls);
    assert.deepEqual(counts.legacyContracts, [12, 1200, 0], 'Un reintento entre formatos comparte otro único barrido');
    assert.deepEqual(counts.payments, [0, 0, 0]);
    t.diagnostic('P31_LEGACY_LIMIT ' + JSON.stringify({ first, withRetry: counts }));
  });
});

it('P31-A measures the extra point reads from an embedded legacy payment per verified branch', async t => {
  const period = reportPeriod('mes', '2026-11-04T12:00:00-05:00');
  const records = volumeRecords(period, 1);
  records.branches = branches.map(id => ({ id, businessId }));
  records.contracts = branches.map((branchId, index) => ({
    id: id('embedded', index), businessId, branchId, status: 'pendiente', createdAt: timestamp(+period.startDate - dayMs),
    payments: Array.from({ length: 2 }, () => ({ amount: '1.25', method: 'yape/plin', branchId, occurredAt: period.startDate.toISOString() })),
  }));
  await observe(period, records, async reader => {
    const state = await reader.dashboard();
    assert.equal(state.model.summary.contractRevenue, 5);
    assert.equal(reader.calls.filter(call => call.kind === 'point' && call.module === 'legacyContracts').length, 2);
    const before = budget(reader.calls);
    assert.deepEqual(before.legacyContracts, [3, 4, 0]);
    await reader.exportData('xlsx');
    const after = budget(reader.calls);
    assert.deepEqual(after.legacyContracts, before.legacyContracts);
    assert.deepEqual(after.contractAudit, [1, 2, 0]);
    t.diagnostic('P31_LEGACY_POINTS ' + JSON.stringify(after));
  });
});
