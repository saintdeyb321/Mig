// Verified bound of the current atomic Rules protocol, NOT a Firebase Spark plan quota.
// Cart composition is unrestricted. Raise this only with an integrated financial proof.
export const VERIFIED_ATOMIC_LINE_LIMIT = 2;
export const checkoutBlockReason = items => items.length > VERIFIED_ATOMIC_LINE_LIMIT
  ? 'Carrito conservado sin cobrar: el protocolo financiero verificado admite hasta 2 líneas. La confirmación de tickets mayores sigue pendiente; no se divide el ticket ni se registra una venta parcial.'
  : null;
