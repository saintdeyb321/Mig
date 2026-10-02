import { collection, query, where, orderBy, documentId, limit, startAfter, getDocs, Timestamp } from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';
import { toDateSafe } from '../../../core/dates/dateValues.js';

export const PAYMENT_PAGE_SIZE = 200;

function requiredId(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value === 'global') {
    throw new Error('Selecciona un negocio, documento o sede válido.');
  }
  return value;
}

export function createPaymentRepository(database) {
  async function readPayments(businessId, filters, branchId = 'global') {
    requiredId(businessId);
    const constraints = [where('businessId', '==', businessId), ...filters,
      ...(branchId === 'global' ? [] : [where('branchId', '==', requiredId(branchId))]),
      orderBy('occurredAt', 'asc'), orderBy(documentId(), 'asc')];
    const rows = [];
    let cursor;
    while (true) {
      const page = await getDocs(query(collection(database, 'payments'), ...constraints,
        ...(cursor ? [startAfter(cursor)] : []), limit(PAYMENT_PAGE_SIZE)));
      rows.push(...mapDocuments(page));
      if (page.size < PAYMENT_PAGE_SIZE) return rows;
      cursor = page.docs.at(-1);
    }
  }

  return {
    getPaymentsByContract: (businessId, contractId, branchId = 'global') =>
      readPayments(businessId, [where('sourceType', '==', 'contract'), where('sourceId', '==', requiredId(contractId))], branchId),
    getPaymentsBySession: (businessId, sessionId, branchId) => {
      requiredId(branchId);
      return readPayments(businessId, [where('sessionId', '==', requiredId(sessionId))], branchId);
    },
    getPaymentsInPeriod: (businessId, startDate, endDate, branchId = 'global') => {
      const start = toDateSafe(startDate), end = toDateSafe(endDate);
      if (!start || !end || end < start) throw new Error('Período de pagos inválido.');
      return readPayments(businessId, [where('occurredAt', '>=', Timestamp.fromDate(start)),
        where('occurredAt', '<=', Timestamp.fromDate(end))], branchId);
    },
    getContractAuditDocuments: async (businessId, ids) => {
      requiredId(businessId);
      const unique = [...new Set(ids.map(requiredId))];
      const rows = [];
      for (let offset = 0; offset < unique.length; offset += 10) {
        const page = await getDocs(query(collection(database, 'contracts'), where('businessId', '==', businessId),
          where(documentId(), 'in', unique.slice(offset, offset + 10)), limit(10)));
        rows.push(...mapDocuments(page));
      }
      return rows;
    },
  };
}
