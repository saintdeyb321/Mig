import offlineDB from '../../../offlineDB';
import { decrypt } from '../../../crypto';

export async function readPendingSales(businessId, branchId = 'global') {
  const records = await offlineDB.sales.filter(record => record.sync === false).toArray();
  // Preserve the legacy decoding path until the offline engine migration in Phase 4.
  return records.map(record => {
    try {
      const decoded = decrypt(record.data);
      if (!decoded) return null;
      const sale = JSON.parse(decoded);
      return { ...sale, id: record.localId, isOffline: true, createdAt: sale.createdAt || sale.date || new Date() };
    } catch { return null; }
  }).filter(sale => sale && sale.businessId === businessId
    && (branchId === 'global' || sale.branchId === branchId));
}

export async function getPendingStockDeltas(businessId) {
  const deltas = {};
  try {
    for (const sale of await readPendingSales(businessId)) {
      sale.items.forEach(item => { deltas[item.id] = (deltas[item.id] || 0) + item.qty; });
    }
  } catch (error) { console.warn('Error leyendo ventas offline:', error); }
  return deltas;
}
