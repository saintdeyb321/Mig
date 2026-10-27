// Verified bound of the current atomic Rules protocol, NOT a Firebase Spark plan quota.
// Cart composition is unrestricted. Raise this only with an integrated financial proof.
export const VERIFIED_ATOMIC_LINE_LIMIT = 8;
export const checkoutBlockReason = items => items.length > VERIFIED_ATOMIC_LINE_LIMIT
  ? 'Carrito conservado sin cobrar: máximo 8 productos distintos por ticket. No se divide el ticket ni se registra una venta parcial.'
  : null;
