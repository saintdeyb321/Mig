// Verified bound of the current atomic Rules protocol, NOT a Firebase Spark plan quota.
// Raise this only with an integrated financial proof. Fifteen products plus the six
// actor/license/tenant/branch/session/lock reads already exceed 20, before group proofs.
import { SALE_LIMITS } from './saleModel.js';
export const VERIFIED_ATOMIC_LINE_LIMIT = SALE_LIMITS.maxDistinctProducts;
export const checkoutBlockReason = items => items.length > VERIFIED_ATOMIC_LINE_LIMIT
  ? 'Carrito conservado sin cobrar: máximo 8 productos distintos por ticket. No se divide el ticket ni se registra una venta parcial.'
  : null;
