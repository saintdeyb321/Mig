import * as firestoreSDK from 'firebase/firestore';
import { mapDocuments } from '../../../core/firebase/documents.js';

export const SALES_PAGE_SIZE = 200;
export function createSalesPeriodReader(database, { sdk = firestoreSDK } = {}) {
  const { collection, query, where, orderBy, documentId, startAfter, limit, getDocs } = sdk;
  return async (businessId, startDate, endDate, { branchId = 'global', maxRows = 10000 } = {}) => {
    if (!businessId || !Number.isSafeInteger(maxRows) || maxRows < 1 || !Number.isFinite(+startDate) || !Number.isFinite(+endDate) || endDate < startDate) throw new Error('Consulta de ventas inválida.');
    const rows = [];
    let cursor;
    do {
      const page = await getDocs(query(collection(database, 'sales'), where('businessId', '==', businessId),
        ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]),
        where('createdAt', '>=', startDate), where('createdAt', '<=', endDate), orderBy('createdAt'), orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []), limit(Math.min(SALES_PAGE_SIZE, maxRows - rows.length + 1))));
      rows.push(...mapDocuments(page));
      if (rows.length > maxRows) throw new Error(`Demasiados tickets (máximo ${maxRows}). Selecciona un período menor.`);
      if (page.size < SALES_PAGE_SIZE) return rows;
      cursor = page.docs.at(-1);
    } while (cursor);
    return rows;
  };
}
