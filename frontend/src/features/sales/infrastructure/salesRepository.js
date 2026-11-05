import { withQueryContext } from '../../../core/firebase/queryErrors.js';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { createSalesPeriodReader, createSalesSessionReader } from './salesQueryRepository.js';
import { recentSaleRows } from '../application/recentSales.js';

export function subscribeRecentSales(businessId, branchId, onData, onError) {
  const rows = new Map(), metadata = new Map(), failures = new Map();
  const stops = ['confirmedAt', 'createdAt'].map(field => onSnapshot(query(collection(db, 'sales'), where('businessId', '==', businessId),
    ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]), orderBy(field, 'desc'), limit(50)),
  { includeMetadataChanges: true }, snapshot => {
    // One live source must never hide the terminal failure of the other source.
    if (failures.size) { onError(failures.values().next().value); return; }
    metadata.set(field, snapshot.metadata);
    rows.set(field, recentSaleRows(snapshot, field));
    onData([...new Map([...rows.values()].flat().map(row => [row.id, { ...row, createdAt: row.confirmedAt ?? row.createdAt }])).values()], { observedDocumentCount: snapshot.size, fromCache: metadata.size < 2 || [...metadata.values()].some(source => source.fromCache || source.hasPendingWrites) });
  }, error => {
    const failure = withQueryContext(error, `sales-recent-${field}`);
    failures.set(field, failure); onError(failure);
  }));
  return () => stops.forEach(stop => stop());
}
export const getSessionSales = createSalesSessionReader(db);
export const getSalesInPeriod = createSalesPeriodReader(db);
