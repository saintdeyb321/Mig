import { saleQueue } from '../features/sales/infrastructure/saleTransactions';

export const retryOfflineSales = identity => saleQueue.flush(identity);
