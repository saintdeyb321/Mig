import { migrateSaleRecord } from '../sales/domain/queueState.js';

function hasMatch(source, range, predicate) {
  return new Promise((resolve, reject) => {
    const request = source.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      try {
        if (!cursor || predicate(cursor.value)) resolve(Boolean(cursor));
        else cursor.continue();
      } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function hasPendingLocalWork() {
  const { default: offlineDB } = await import('../../offlineDB.js');
  return new Promise((resolve, reject) => {
    // Read the existing version without starting Dexie migrations or creating a database at login.
    const request = indexedDB.open(offlineDB.name);
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction.abort();
    };
    request.onerror = () => { if (absent) resolve(false); else reject(request.error); };
    request.onblocked = () => reject(new Error('La base local está ocupada.'));
    request.onsuccess = async () => {
      const database = request.result;
      try {
        const transaction = database.transaction(['sales', 'cash_sessions', 'settings'], 'readonly');
        const settings = transaction.objectStore('settings');
        const prefixed = (prefix, predicate) => hasMatch(settings, IDBKeyRange.bound(prefix, prefix + '\uffff'), predicate);
        const finished = new Promise((complete, fail) => {
          transaction.oncomplete = complete;
          transaction.onabort = () => fail(transaction.error);
        });
        const checks = [
          hasMatch(transaction.objectStore('sales'), null, sale => {
            const { status } = migrateSaleRecord(sale);
            return !['synced', 'failed'].includes(status) || sale.requiresFinancialReview === true || sale.requiresReceiptReview === true;
          }),
          hasMatch(transaction.objectStore('cash_sessions'), null, entry => entry.sync !== true),
          prefixed('pos-void:', entry => !['confirmed', 'rejected'].includes(entry.status)),
          prefixed('cash-reconcile:', () => true),
          prefixed('contract-media:', () => true),
          prefixed('contract-media-order:', () => true),
        ];
        const [results] = await Promise.all([Promise.all(checks), finished]);
        resolve(results.some(Boolean));
      } catch (error) { reject(error); }
      finally { database.close(); }
    };
  });
}
