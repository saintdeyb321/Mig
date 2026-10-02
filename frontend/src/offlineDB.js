// src/offlineDB.js
import Dexie from 'dexie';
import { migrateSaleRecord, migrateCachedProduct } from './features/sales/domain/queueState.js';

export function createOfflineDatabase(name = 'migapos_offline_v2') {
  const offlineDB = new Dexie(name);

  offlineDB.version(2).stores({
    sales: 'localId, sync, createdAt',
    products: 'id, businessId, category',
    categories: 'id, businessId',
    users: 'id, businessId',
    settings: 'id',
    cash_sessions: 'localId, sync'
  });

  offlineDB.version(3).stores({
    sales: 'localId, idempotencyKey, businessId, branchId, userId, status, createdAt, [businessId+userId+status]',
  }).upgrade(async transaction => {
    await transaction.table('sales').toCollection().modify(record => Object.assign(record, migrateSaleRecord(record)));
    await transaction.table('products').toCollection().modify(product => {
      const raw = migrateCachedProduct(product);
      delete product.rawStock;
      delete product.remoteStock;
      Object.assign(product, raw);
    });
  });

  return offlineDB;
}

export default createOfflineDatabase();
