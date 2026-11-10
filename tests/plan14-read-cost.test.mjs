import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { createSessionResources } from '../frontend/src/core/session/sessionResources.js';
import { createSessionReportReads } from '../frontend/src/features/reports/application/sessionReportReads.js';
import { createSalesPeriodReader } from '../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { createPosVoidReader } from '../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';
import { createContractPeriodReader } from '../frontend/src/features/contracts/infrastructure/contractPeriodRepository.js';
import { createPaymentRepository } from '../frontend/src/features/payments/infrastructure/paymentQueryRepository.js';
import { createSparkLegacyPaymentReader } from '../frontend/src/features/payments/infrastructure/sparkLegacyPayments.js';
import { compatiblePayments } from '../frontend/src/features/payments/application/compatiblePayments.js';
import { createCashAuditPeriodReader } from '../frontend/src/features/cash-register/infrastructure/cashQueryRepository.js';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';

const DAY = 86400000, YEAR_START = Date.parse('2026-01-01T05:00:00Z');
const branches = ['centro', 'taller'];
const counts = () => ({ queries: 0, documents: 0, emptyQueries: 0, payloadBytes: 0, salesDocuments: 0 });

function fixtureSdk(metrics) {
  const items = [{ id: 'pan', name: 'Pan de prueba', category: 'Panadería', price: 10.05, cost: 3, qty: 1 }];
  return {
    Timestamp, collection: (_db, name) => name, documentId: () => 'id', where: (field, op, value) => ({ field, op, value }),
    orderBy: field => ({ order: field }), limit: limit => ({ limit }), startAfter: after => ({ after }),
    query: (name, ...filters) => ({ name, filters }),
    async getDocsFromServer({ name, filters }) {
      const field = filters.find(filter => filter.order)?.order;
      const from = filters.find(filter => filter.op === '>=')?.value;
      const to = filters.find(filter => filter.op === '<=')?.value;
      const businessId = filters.find(filter => filter.field === 'businessId')?.value;
      const branch = filters.find(filter => filter.field === 'branchId')?.value;
      const scope = branch ? [branch] : branches;
      const cursor = filters.find(filter => filter.after)?.after;
      const pageSize = filters.find(filter => filter.limit).limit;
      const docs = [];
      const sales = name === 'sales' && (field === 'confirmedAt' || field === 'createdAt' && typeof from === 'string');
      const cash = name === 'cash_sessions' && from instanceof Timestamp;
      if (sales || cash) {
        const first = Math.max(0, Math.floor(((from.toMillis?.() ?? Date.parse(from)) - YEAR_START) / DAY));
        const last = Math.min(364, Math.floor(((to.toMillis?.() ?? Date.parse(to)) - YEAR_START) / DAY));
        const each = sales ? 100 : 1;
        let index = cursor ? cursor.index + 1 : 0;
        const rows = (last - first + 1) * each * scope.length;
        for (; index < rows && docs.length < pageSize; index++) {
          const day = first + Math.floor(index / (each * scope.length));
          const branchId = scope[index % scope.length];
          const id = `${businessId}-${branchId}-${day}-${Math.floor(index / scope.length) % each}`;
          const dayStart = YEAR_START + day * DAY;
          const ms = dayStart + (cash ? (field === 'openedAt' ? 8 : 18) * 3600000 : 8 * 3600000 + index % each * 1000);
          if (ms < (from.toMillis?.() ?? Date.parse(from)) || ms > (to.toMillis?.() ?? Date.parse(to))) continue;
          const row = sales ? { businessId, branchId, total: 10.05, payment: 'efectivo', status: 'confirmed', items, userId: 'cajera',
            createdAt: new Date(ms).toISOString(), confirmedAt: Timestamp.fromMillis(ms), sessionId: `${businessId}-${branchId}-${day}` }
            : { businessId, branchId, userId: 'cajera', openingAmount: 100, declaredAmount: 100, status: 'closed',
              openedAt: Timestamp.fromMillis(dayStart + 8 * 3600000), closedAt: Timestamp.fromMillis(dayStart + 18 * 3600000) };
          docs.push({ id, index, data: () => row });
          metrics.payloadBytes += Buffer.byteLength(JSON.stringify({ id, ...row }));
        }
      }
      metrics.queries++;
      metrics.documents += docs.length;
      if (!docs.length) metrics.emptyQueries++;
      if (sales) metrics.salesDocuments += docs.length;
      return { size: docs.length, docs };
    },
  };
}

it('P14 R10/R11: measures 20 independent tenants using the actual paginated readers and warm snapshot cache', async () => {
  for (const [filter, days] of [['hoy', 1], ['semana', 7], ['mes', 30], ['todo', 365]]) {
    for (const branchId of ['centro', 'global']) {
      const cold = counts(), sdk = fixtureSdk(cold), database = {};
      const payments = createPaymentRepository(database, { sdk });
      const legacy = createSparkLegacyPaymentReader(database, { sdk });
      const read = createSessionReportReads({
        getSalesInPeriod: createSalesPeriodReader(database, { sdk }),
        getContractsInPeriod: createContractPeriodReader(database, { sdk }),
        readVoidsInPeriod: createPosVoidReader(database, { sdk }).inPeriod,
        getSessionsInPeriod: createCashAuditPeriodReader(database, { sdk }),
        getContractAuditDocuments: payments.getContractAuditDocuments,
        getPaymentsInPeriod: (businessId, start, end, scope, options) => {
          const input = { startDate: start.toISOString(), endDate: end.toISOString(), branchId: scope };
          return compatiblePayments(input, () => payments.getPaymentsInPeriod(businessId, start, end, scope, options),
            async () => ({ payments: await legacy(businessId, input, options) }), options);
        },
      });
      const period = reportPeriod(filter, '2026-11-09T12:00:00-05:00');
      const scopeCount = branchId === 'global' ? 2 : 1;
      const expectedSales = 100 * days * scopeCount, expectedSessions = days * scopeCount;
      let coldMs = 0, warmMs = 0, cacheHits = 0, postDashboardQueries = 0, postDashboardDocs = 0;
      for (let tenant = 1; tenant <= 20; tenant++) {
        const resources = createSessionResources();
        const reader = read(resources, `panaderia-${tenant}`, branchId, period);
        const start = performance.now();
        if (filter === 'todo') {
          await assert.rejects(reader.exportSnapshot(), { code: 'report-limit' });
          const after = { ...cold }, warmStart = performance.now();
          coldMs += warmStart - start;
          await assert.rejects(reader.exportSnapshot(), { code: 'report-limit' });
          warmMs += performance.now() - warmStart;
          assert.deepEqual(cold, after);
        } else {
          const [sales] = await Promise.all([reader.sales(), reader.payments(), reader.contracts(), reader.voids()]);
          assert.equal(sales.length, expectedSales);
          const afterDashboard = { ...cold };
          const pdf = await reader.exportSnapshot();
          assert.equal(pdf.sessions.length, expectedSessions);
          postDashboardQueries += cold.queries - afterDashboard.queries;
          postDashboardDocs += cold.documents - afterDashboard.documents;
          const after = { ...cold }, warmStart = performance.now();
          coldMs += warmStart - start;
          const excel = await reader.exportSnapshot();
          warmMs += performance.now() - warmStart;
          assert.deepEqual(cold, after, 'A second format makes no SDK call inside TTL');
          assert.equal(pdf.sales, excel.sales);
          assert.equal(pdf.sessions, excel.sessions);
        }
        cacheHits += resources.diagnostics().reused;
        resources.close();
      }
      assert.equal(cold.salesDocuments, 20 * (filter === 'todo' ? 10001 : expectedSales * 2));
      assert.equal(cold.documents, cold.salesDocuments + 20 * (filter === 'todo' ? 0 : expectedSessions * 2));
      console.log(JSON.stringify({ filter, branchId, tenants: 20, salesPerTenant: expectedSales, ...cold,
        postDashboardQueries, postDashboardDocs, coldMs: Math.round(coldMs), warmMs: Math.round(warmMs * 100) / 100, cacheHits, warmQueries: 0 }));
    }
  }
});
