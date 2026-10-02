// src/offlineDB.js
import Dexie from 'dexie';

const offlineDB = new Dexie('migapos_offline_v2');

// 🚀 Aumentamos la versión a 2 para agregar la nueva tabla cash_sessions
offlineDB.version(2).stores({
  sales: 'localId, sync, createdAt',
  products: 'id, businessId, category',
  categories: 'id, businessId',
  users: 'id, businessId',
  settings: 'id',
  cash_sessions: 'localId, sync' // 🚀 NUEVA TABLA PARA LA CAJA
});

export default offlineDB;