import { requireCapability } from '../config/runtimeCapabilities.js';
import { saleQueue } from '../features/sales/infrastructure/saleTransactions';

export const retryOfflineSales = identity => { requireCapability('offlineSync', 'Sincronizar pendientes'); return saleQueue.flush(identity); };
