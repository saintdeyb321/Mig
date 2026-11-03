import { projectProducts } from './projectProducts.js';
import { saleFinancialState } from '../../sales/domain/queueState.js';

// Stock versions connect a backend acknowledgement to a product snapshot without
// reading receipts. While an attempt is ambiguous, retain its pre-attempt stock.
export function projectQueuedStock(products, queued, businessId, { serverConfirmed = false } = {}) {
  const sales = queued.filter(sale => sale.businessId === businessId && sale.queueStatus !== 'failed'
    && saleFinancialState({ ...sale, status: sale.queueStatus }, sale) !== 'draft_offline');
  // These markers only choose the authoritative product stock for presentation.
  // They NEVER acknowledge a sale, change a receipt, or synthesize stock quantities.
  const reflected = (product, sale, branchId) => {
    const version = product.posStockVersion?.[branchId];
    const base = sale.projectionBase?.[product.id]?.version;
    return serverConfirmed && Number.isSafeInteger(version) && Number.isSafeInteger(base) && version > base
      && (product.posLastSaleId === sale.saleId || (product.posLastVoidSaleId === sale.saleId && version >= base + 2));
  };
  const settled = [];
  const prepared = products.map(product => {
    const stock = { ...product.stock };
    for (const [branchId, value] of Object.entries(stock)) {
      const affecting = sales.filter(sale => sale.branchId === branchId && sale.items.some(item => item.id === product.id) && !reflected(product, sale, branchId));
      let version = product.posStockVersion?.[branchId] ?? 0;
      let baseStock = value;
      for (const sale of affecting) {
        const base = sale.projectionBase?.[product.id];
        if (!sale.financialAck && sale.attempted && base && Number.isSafeInteger(base.stock) && base.version < version) {
          baseStock = base.stock; version = base.version;
        }
      }
      for (const sale of affecting) {
        const acknowledgedVersion = sale.stockVersions?.[product.id];
        if (sale.financialAck && (acknowledgedVersion === undefined || version >= acknowledgedVersion)) continue;
        baseStock -= sale.items.find(item => item.id === product.id).qty;
      }
      stock[branchId] = Math.max(0, baseStock);
    }
    return { ...product, stock };
  });
  for (const sale of sales) {
    if (sale.queueStatus === 'synced' && sale.financialAck && sale.items.every(item => {
      const product = products.find(row => row.id === item.id);
      const ackVersion = sale.stockVersions?.[item.id];
      // An ambiguous later attempt may still need this acknowledged debit when
      // projecting from an older baseline. Retire it only once that ambiguity ends.
      const needed = ackVersion !== undefined && sales.some(other => !other.financialAck && other.attempted
        && other.branchId === sale.branchId && other.items.some(line => line.id === item.id)
        && other.projectionBase?.[item.id]?.version < ackVersion);
      return product && !needed && (ackVersion === undefined || (product.posStockVersion?.[sale.branchId] ?? 0) >= ackVersion);
    })) settled.push(sale.saleId);
  }
  const projected = projectProducts(prepared);
  // Inventory adjustments must always use the unprojected snapshot.
  projected.forEach(product => { product.remoteStock = products.find(raw => raw.id === product.id).stock; });
  return { products: projected, settled };
}
