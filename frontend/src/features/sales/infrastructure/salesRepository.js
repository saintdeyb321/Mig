import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../core/firebase/client';
import { createSalesPeriodReader, createSalesSessionReader } from './salesQueryRepository.js';

export function subscribeRecentSales(businessId, branchId, onData, onError) {
  const rows = new Map(), metadata = new Map();
  const stops = ['confirmedAt', 'createdAt'].map(field => onSnapshot(query(collection(db, 'sales'), where('businessId', '==', businessId),
    ...(branchId === 'global' ? [] : [where('branchId', '==', branchId)]), orderBy(field, 'desc'), limit(50)),
  { includeMetadataChanges: true }, snapshot => {
    metadata.set(field, snapshot.metadata);
    if (!snapshot.metadata.fromCache) rows.set(field, snapshot.docs.filter(document => !document.metadata.hasPendingWrites && !snapshot.metadata.fromCache)
      .map(document => ({ ...document.data(), id: document.id, isOffline: false }))
      .filter(row => field === 'confirmedAt' ? row.status === 'confirmed' : row.confirmedAt == null));
    onData([...new Map([...rows.values()].flat().map(row => [row.id, { ...row, createdAt: row.confirmedAt ?? row.createdAt }])).values()], { fromCache: metadata.size < 2 || [...metadata.values()].some(source => source.fromCache || source.hasPendingWrites) });
  }, onError));
  return () => stops.forEach(stop => stop());
}
export const getSessionSales = createSalesSessionReader(db);
export const getSalesInPeriod = createSalesPeriodReader(db);
