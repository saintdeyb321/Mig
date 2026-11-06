import { createRequire } from 'node:module';
import { createSessionResources } from '../../frontend/src/core/session/sessionResources.js';
import { createReportCache, createReportResource, reportCacheKey } from '../../frontend/src/features/reports/application/reportResource.js';
import { createSessionReportReads } from '../../frontend/src/features/reports/application/sessionReportReads.js';
import { buildSalesWorkbook } from '../../frontend/src/features/reports/application/salesWorkbook.js';
import { reportPeriod } from '../../frontend/src/features/reports/domain/reportPeriod.js';
import { createSalesPeriodReader } from '../../frontend/src/features/sales/infrastructure/salesQueryRepository.js';
import { createPosVoidReader } from '../../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js';

const XLSX = createRequire(new URL('../../frontend/package.json', import.meta.url))('xlsx-js-style');
export const saleDay = '2026-11-05T23:59:59.999-05:00';
export const voidDay = '2026-11-06T00:00:00.000-05:00';
const context = { businessId: 'qa13-a', branchId: 'centro' };
const branchesMap = { centro: 'Centro', taller: 'Taller' };
class Timestamp {
  constructor(value) { this.ms = new Date(value).getTime(); }
  toDate() { return new Date(this.ms); }
  static fromDate(value) { return new Timestamp(value); }
}
const valueOf = value => value instanceof Timestamp ? value.ms : value;

export function pairedTicket({ legacy = false, timestamp = false, id = 'qa13-split', soldAt = saleDay, voidedAt = voidDay,
  method = 'yape', total = 30, cash = 0, businessId = context.businessId, branchId = context.branchId } = {}) {
  const identity = { id, saleId: id, businessId, branchId };
  const items = [{ id: 'product-' + id, name: 'Pan de ensayo', qty: 1, price: total }];
  const sale = { ...identity, items, total, payment: method, sessionId: 'qa13-shift-previous',
    ...(method === 'mixto' ? { splitPayments: { efectivo: cash, yape: total - cash } } : {}),
    ...(legacy ? { voided: true, createdAt: timestamp ? new Timestamp(soldAt) : new Date(soldAt).toISOString() }
      : { atomicProtocol: 2, status: 'confirmed', createdAt: '2025-01-01T05:00:00.000Z', confirmedAt: new Timestamp(soldAt) }) };
  const receipt = { ...identity, authority: 'pos-compensation', protocol: 1, amount: -total, cashAmount: -cash,
    digitalAmount: -(total - cash), sessionId: 'qa13-shift-next', userId: 'qa13-owner', reason: 'Anulación de ensayo', items,
    occurredAt: new Timestamp(voidedAt) };
  return { sale, receipt };
}

export function spanningPeriod(from = saleDay, to = voidDay, filter = 'semana') {
  const first = reportPeriod('hoy', from), last = reportPeriod('hoy', to);
  return { ...first, filter, end: last.end, endDate: last.endDate, key: `${filter}:${first.start}:${last.end}` };
}

function stubSdk(records, calls, beforeQuery) {
  return { Timestamp, collection: (_db, name) => name, documentId: () => 'id',
    where: (field, op, value) => ({ field, op, value }), orderBy: field => ({ order: field }),
    limit: limit => ({ limit }), startAfter: cursor => ({ cursor }), query: (collection, ...clauses) => ({ collection, clauses }),
    async getDocsFromServer({ collection, clauses }) {
      const filters = clauses.filter(row => row.op);
      const event = { collection, filters, docs: 0 };
      calls.push(event);
      await beforeQuery?.(event);
      const order = clauses.find(row => row.order).order;
      const after = clauses.find(row => row.cursor)?.cursor;
      const compare = (a, b) => valueOf(a[order]) < valueOf(b[order]) ? -1
        : valueOf(a[order]) > valueOf(b[order]) ? 1 : a.id.localeCompare(b.id);
      const page = records[collection].filter(row => filters.every(({ field, op, value }) => {
        const fieldValue = row[field];
        if (op === '==') return fieldValue === value;
        // Firestore matches a Timestamp range separately from the legacy string range.
        if (value instanceof Timestamp ? !(fieldValue instanceof Timestamp) : typeof fieldValue !== typeof value) return false;
        return op === '>=' ? valueOf(fieldValue) >= valueOf(value) : valueOf(fieldValue) <= valueOf(value);
      })).sort(compare).filter(row => !after || compare(row, after.data()) > 0).slice(0, clauses.find(row => row.limit).limit);
      event.docs = page.length;
      return { size: page.length, docs: page.map(row => ({ id: row.id, data: () => row })) };
    },
  };
}

export function reportPeriodHarness({ sales = [], voids = [], beforeQuery } = {}) {
  const calls = [];
  const sdk = stubSdk({ sales, pos_voids: voids }, calls, beforeQuery);
  const read = createSessionReportReads({
    getSalesInPeriod: createSalesPeriodReader({}, { sdk }),
    getContractsInPeriod: async () => [], getPaymentsInPeriod: async () => [], getContractAuditDocuments: async () => [],
    readVoidsInPeriod: createPosVoidReader({}, { sdk }).inPeriod,
  });
  const cache = createReportCache();
  const open = (period, { businessId = context.businessId, branchId = 'global', identityKey = 'qa13-owner' } = {}) => {
    const scope = { businessId, branchId, period };
    const resources = createSessionResources();
    const reads = read(resources, businessId, branchId, period);
    const key = reportCacheKey({ ...scope, identityKey });
    let state;
    const dashboard = createReportResource({ ...scope, cache, key, readSales: reads.sales, readVoids: reads.voids,
      readPayments: reads.payments, readContracts: reads.contracts, onState: value => { state = value; } });
    return { key, scope, resources, reads, dashboard, get state() { return state; },
      async excel(options) {
        const [sales, voids, { payments, contracts }] = await Promise.all([reads.sales(), reads.voids(), reads.exportContracts()]);
        const { workbook, model } = buildSalesWorkbook(XLSX, { ...scope, sales, voids, payments, contracts, branchesMap,
          now: period.endDate, ...options });
        const wb = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
        const summary = Object.fromEntries(XLSX.utils.sheet_to_json(wb.Sheets.Resumen_Financiero).map(row => [row.Concepto, row.Valor]));
        return { model, wb, summary };
      },
      close() { dashboard.close(); resources.close(); },
    };
  };
  return { calls, cache, open };
}
