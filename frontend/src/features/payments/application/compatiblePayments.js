export const mergePayments = (ledger, legacy) => [...new Map([...legacy, ...ledger].map(payment => [payment.id, payment])).values()];

export async function compatiblePayments(input, readLedger, readLegacy, { requireMigrated = false, maxRows = Infinity } = {}) {
  const fallback = [];
  let cursor = null;
  do {
    const page = await readLegacy({ ...input, cursor });
    if (page.manualReview) throw new Error('Hay pagos históricos pendientes de revisión administrativa; revisa la migración antes de cerrar caja o emitir el reporte.');
    if (requireMigrated && page.partialMigrations) throw new Error('La migración de pagos está incompleta; el reporte no es definitivo.');
    fallback.push(...page.payments); cursor = page.nextCursor;
    if (fallback.length > maxRows) throw new Error('Demasiados movimientos. Selecciona un período menor.');
  } while (cursor);
  // A batch can commit between these reads. Deduplicate movement IDs, never whole contracts.
  const merged = mergePayments(await readLedger(), fallback);
  if (merged.length > maxRows) throw new Error('Demasiados movimientos. Selecciona un período menor.');
  return merged;
}
